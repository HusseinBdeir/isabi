/**
 * ISABI Systems — Public Showcase Edge API Router (/api/*)
 * Routes: /api/health, /api/ask, /api/tts, /api/leads, /api/log
 */

import { handleEdgeAsk, handleEdgeTts } from '../_lib/gemini.js';
import { handleShowcaseLead, handleShowcaseLog, handleStatus } from '../_lib/d1_store.js';
import { applyEdgeCors, checkD1RateLimit, hashClientIp, jsonResponse } from '../_lib/security.js';

async function parseRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return { body: {}, rawBytes: 0 };
  try {
    const txt = await request.text();
    return { body: txt ? JSON.parse(txt) : {}, rawBytes: txt ? txt.length : 0 };
  } catch (_) {
    return { body: {}, rawBytes: 0 };
  }
}

async function routeShowcaseApi(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true }, 204);
  }

  const parts = Array.isArray(params.route)
    ? params.route
    : (params.route ? [String(params.route)] : []);
  const subPath = '/' + parts.join('/');

  if (subPath === '/health' || subPath === '/status') {
    if (subPath === '/status') return handleStatus(env);
    return jsonResponse({
      ok: true,
      edge: true,
      platform: 'isabi-edge-v1',
      d1: Boolean(env && env.DB),
      r2: Boolean(env && env.BUCKET),
      ai: Boolean(env && (env.GEMINI_API_KEY || env.ISABI_GEMINI_KEY))
    });
  }

  const { body, rawBytes } = await parseRequestBody(request);
  if (rawBytes > 1572864) {
    return jsonResponse({ ok: false, error: 'Payload exceeds 1.5 MB limit.' }, 413);
  }

  if ((subPath === '/ask' || subPath === '/tts') && request.method === 'POST') {
    const ipHash = await hashClientIp(request);
    const rl = await checkD1RateLimit(env, `showcase-ai:${ipHash}`, 20, 60);
    if (!rl.allowed) {
      return jsonResponse({ ok: false, error: 'Rate limit reached. Try again in a minute.' }, 429);
    }
    if (subPath === '/ask') return handleEdgeAsk(request, env, body, context);
    return handleEdgeTts(request, env, body);
  }
  if (subPath === '/leads' && request.method === 'POST') {
    return handleShowcaseLead(request, env, body);
  }
  if (subPath === '/log' && request.method === 'POST') {
    return handleShowcaseLog(request, env, body);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}

export async function onRequest(context) {
  const resp = await routeShowcaseApi(context);
  return applyEdgeCors(resp, context.request);
}
