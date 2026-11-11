/**
 * ISABI Systems — Public Showcase Edge API Router (/api/*)
 * Routes: /api/health, /api/ask, /api/tts, /api/leads, /api/log
 */

import { handleEdgeAsk, handleEdgeTts } from '../_lib/gemini.js';
import { handleShowcaseLead, handleShowcaseLog, handleStatus } from '../_lib/d1_store.js';
import {
  applyEdgeCors,
  checkD1RateLimit,
  extractRequestSession,
  hashClientIp,
  isSameOriginBrowserRequest,
  jsonResponse,
  verifyActiveEdgeSession
} from '../_lib/security.js';

const SHOWCASE_MAX_BODY_BYTES = 786432; // 768 KB ceiling on public Showcase API payloads

async function parseRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return { body: {}, rawBytes: 0 };
  const clen = Number(request.headers.get('Content-Length') || 0);
  if (clen > SHOWCASE_MAX_BODY_BYTES) {
    return { body: {}, rawBytes: clen, tooLarge: true };
  }
  try {
    const txt = await request.text();
    const rawBytes = txt ? txt.length : 0;
    if (rawBytes > SHOWCASE_MAX_BODY_BYTES) {
      return { body: {}, rawBytes, tooLarge: true };
    }
    return { body: txt ? JSON.parse(txt) : {}, rawBytes, tooLarge: false };
  } catch (_) {
    return { body: {}, rawBytes: 0, tooLarge: false };
  }
}

async function routeShowcaseApi(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true }, 204);
  }

  const url = new URL(request.url);
  const parts = Array.isArray(params.route)
    ? params.route
    : (params.route ? [String(params.route)] : []);
  const subPath = '/' + parts.join('/');

  if (subPath === '/health' || subPath === '/status') {
    if (subPath === '/status') {
      const rawSession = await extractRequestSession(request, env);
      const session = rawSession ? await verifyActiveEdgeSession(rawSession, env) : null;
      return handleStatus(env, session);
    }
    return jsonResponse({
      ok: true,
      edge: true,
      platform: 'isabi-edge-v1',
      d1: Boolean(env && env.DB),
      r2: Boolean(env && env.BUCKET),
      ai: Boolean(env && (env.GEMINI_API_KEY || env.ISABI_GEMINI_KEY))
    });
  }

  const { body, tooLarge } = await parseRequestBody(request);
  if (tooLarge) {
    return jsonResponse({ ok: false, error: 'Payload exceeds 768 KB limit.' }, 413);
  }

  if ((subPath === '/ask' || subPath === '/tts') && request.method === 'POST') {
    if (!isSameOriginBrowserRequest(request, url, env)) {
      return jsonResponse({ ok: false, error: 'Same-origin browser session required.' }, 403);
    }
    const ipHash = await hashClientIp(request);
    const rl = await checkD1RateLimit(env, `showcase-ai:${ipHash}`, 15, 60, { failClosed: true });
    if (!rl.allowed) {
      return jsonResponse({ ok: false, error: 'Rate limit reached. Try again in a minute.' }, 429);
    }
    if (subPath === '/ask') return handleEdgeAsk(request, env, body, context, null);
    return handleEdgeTts(request, env, body, null);
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
  try {
    const resp = await routeShowcaseApi(context);
    return applyEdgeCors(resp, context.request, context.env);
  } catch (_) {
    return applyEdgeCors(
      jsonResponse({ ok: false, error: 'Internal server error.' }, 500),
      context.request,
      context.env
    );
  }
}
