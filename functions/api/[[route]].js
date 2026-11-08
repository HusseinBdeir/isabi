/**
 * ISABI Systems — Public Showcase Edge API Router (/api/*)
 * Routes: /api/health, /api/ask, /api/tts, /api/leads, /api/log
 */

import { handleEdgeAsk, handleEdgeTts } from '../_lib/gemini.js';
import { handleShowcaseLead, handleShowcaseLog, handleStatus } from '../_lib/d1_store.js';
import { applyEdgeCors, jsonResponse } from '../_lib/security.js';

async function parseRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  try {
    const txt = await request.text();
    return txt ? JSON.parse(txt) : {};
  } catch (_) {
    return {};
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

  const body = await parseRequestBody(request);

  if (subPath === '/ask' && request.method === 'POST') {
    return handleEdgeAsk(request, env, body, context);
  }
  if (subPath === '/tts' && request.method === 'POST') {
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
