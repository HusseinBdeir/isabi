/**
 * ISABI Systems — Command Center Edge API Router (/app/api/*)
 * Serves D1 Relational SQL, R2 Attachment Vault, HMAC Session/RLS Auth,
 * Multi-Device CAS Sync, Cross-Network Phone QR Scan, and Edge Gemini AI.
 */

import {
  handleAlertRules,
  handleAuthLogin,
  handleAuthLogout,
  handleBlobs,
  handleIndustryDomainStore,
  handleKvDoc,
  handlePhoneScan,
  handleRecordsGet,
  handleRecordsPost,
  handleSentinelReviews,
  handleStaffBiometrics,
  handleStatus,
  handleSync,
  handleUsersGet,
  handleUsersPost
} from '../../_lib/d1_store.js';
import {
  handleEdgeAiEdge,
  handleEdgeAsk,
  handleEdgeSmartScan,
  handleEdgeTts
} from '../../_lib/gemini.js';
import { handleTelematics } from '../../_lib/telematics.js';
import { handleKioskOptions, handleKioskVerify } from '../../_lib/kiosk_verify.js';
import {
  applyEdgeCors,
  canAccessCompany,
  checkD1RateLimit,
  extractRequestSession,
  hashClientIp,
  isOwnerOrFullGroupSession,
  isSameOriginBrowserRequest,
  jsonResponse,
  verifyActiveEdgeSession
} from '../../_lib/security.js';

const DEMO_EMPTY_GET_ROUTES = new Set([
  '/sentinel_reviews',
  '/alert_rules',
  '/staff_biometrics',
  '/work_schedules',
  '/geo_config',
  '/industry_domain_store'
]);

const DEMO_AI_MAX_BYTES = 1572864; // 1.5 MB ceiling on unauthenticated Demo AI payloads

async function parseBodyWithSize(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return { body: {}, rawBytes: 0 };
  try {
    const txt = await request.text();
    const rawBytes = txt ? txt.length : 0;
    return { body: txt ? JSON.parse(txt) : {}, rawBytes };
  } catch (_) {
    return { body: {}, rawBytes: 0 };
  }
}

async function routeAppApi(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.route)
    ? params.route
    : (params.route ? [String(params.route)] : []);
  const subPath = '/' + parts.join('/');

  if (request.method === 'OPTIONS') {
    if (subPath === '/kiosk/verify') return handleKioskOptions();
    return jsonResponse({ ok: true }, 204);
  }

  const url = new URL(request.url);

  if (subPath === '/status' || subPath === '/health') {
    return handleStatus(env);
  }

  const rawSession = await extractRequestSession(request, env);
  const session = rawSession ? await verifyActiveEdgeSession(rawSession, env) : null;
  const { body, rawBytes } = await parseBodyWithSize(request);

  if (subPath === '/auth/login' && request.method === 'POST') {
    return handleAuthLogin(request, env, body, session);
  }
  if (subPath === '/auth/logout' && request.method === 'POST') {
    return handleAuthLogout(request, env, session || rawSession);
  }
  if (subPath === '/auth/me' && request.method === 'GET') {
    return jsonResponse({ ok: true, edge: true, authenticated: Boolean(session), session });
  }
  if (subPath === '/phone-scan') {
    return handlePhoneScan(request, env, url, body, session);
  }
  if (subPath === '/users' && request.method === 'GET') {
    return handleUsersGet(request, env, session);
  }
  if (subPath === '/kiosk/verify' && request.method === 'POST') {
    return handleKioskVerify(request, env, session, body, { isOwnerOrFullGroupSession, canAccessCompany });
  }

  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1';
  if (isDemoReq && subPath === '/telematics' && request.method === 'GET') {
    return handleTelematics(request, env, null, url, body);
  }
  if (!session) {
    if (isDemoReq && request.method === 'GET' && DEMO_EMPTY_GET_ROUTES.has(subPath)) {
      if (subPath === '/sentinel_reviews') return jsonResponse({ ok: true, demo: true, reviews: {} });
      if (subPath === '/alert_rules') return jsonResponse({ ok: true, demo: true, overrides: {}, custom: [] });
      if (subPath === '/staff_biometrics') return jsonResponse({ ok: true, demo: true, staff_biometrics: {} });
      if (subPath === '/work_schedules') return jsonResponse({ ok: true, demo: true, work_schedules: null });
      if (subPath === '/geo_config') return jsonResponse({ ok: true, demo: true, config: null });
      if (subPath === '/industry_domain_store') return jsonResponse({ ok: true, demo: true, industryCustomRows: {}, industryRowEdits: {} });
    }
    if (isDemoReq && request.method === 'POST' && (subPath === '/ask' || subPath === '/tts' || subPath === '/smart-scan' || subPath === '/ai-edge')) {
      if (!isSameOriginBrowserRequest(request, url)) {
        return jsonResponse({ ok: false, error: 'Same-origin browser session required for Demo AI.' }, 403);
      }
      const clen = Number(request.headers.get('Content-Length') || 0);
      if (clen > DEMO_AI_MAX_BYTES || rawBytes > DEMO_AI_MAX_BYTES) {
        return jsonResponse({ ok: false, error: 'Demo AI payload exceeds 1.5 MB limit.' }, 413);
      }
      const ipHash = await hashClientIp(request);
      const rl = await checkD1RateLimit(env, `demo-ai:${ipHash}`, 15, 60);
      if (!rl.allowed) {
        return jsonResponse({ ok: false, error: 'Demo AI rate limit reached. Try again in a minute.' }, 429);
      }
      if (subPath === '/ask') return handleEdgeAsk(request, env, body, context);
      if (subPath === '/tts') return handleEdgeTts(request, env, body);
      if (subPath === '/smart-scan') return handleEdgeSmartScan(request, env, body);
      return handleEdgeAiEdge(request, env, body);
    }
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }

  if (subPath === '/users' && request.method === 'POST') {
    return handleUsersPost(request, env, session, body);
  }

  if (subPath === '/records') {
    if (request.method === 'GET') return handleRecordsGet(request, env, session, url);
    if (request.method === 'POST') return handleRecordsPost(request, env, session, body);
  }

  if (subPath === '/sync') {
    return handleSync(request, env, session, body, context);
  }

  if (subPath === '/sentinel_reviews') {
    return handleSentinelReviews(request, env, session, body);
  }

  if (subPath === '/alert_rules') {
    return handleAlertRules(request, env, session, body);
  }

  if (subPath === '/staff_biometrics') {
    return handleStaffBiometrics(request, env, session, body);
  }

  if (subPath === '/work_schedules') {
    return handleKvDoc(request, env, session, 'work_schedules', 'work_schedules', body);
  }

  if (subPath === '/geo_config') {
    return handleKvDoc(request, env, session, 'geo_config', 'config', body);
  }

  if (subPath === '/industry_domain_store') {
    return handleIndustryDomainStore(request, env, session, body);
  }

  if (subPath === '/blobs') {
    return handleBlobs(request, env, session, url, body);
  }

  if (subPath === '/telematics' && (request.method === 'GET' || request.method === 'POST')) {
    return handleTelematics(request, env, session, url, body);
  }

  // Edge AI Endpoints
  if (subPath === '/ask' && request.method === 'POST') {
    return handleEdgeAsk(request, env, body, context);
  }
  if (subPath === '/tts' && request.method === 'POST') {
    return handleEdgeTts(request, env, body);
  }
  if (subPath === '/smart-scan' && request.method === 'POST') {
    return handleEdgeSmartScan(request, env, body);
  }
  if (subPath === '/ai-edge' && request.method === 'POST') {
    return handleEdgeAiEdge(request, env, body);
  }

  return jsonResponse({ ok: false, error: 'Not found', path: subPath }, 404);
}

export async function onRequest(context) {
  const resp = await routeAppApi(context);
  return applyEdgeCors(resp, context.request);
}
