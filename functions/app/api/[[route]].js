/**
 * ISABI Systems — Command Center Edge API Router (/app/api/*)
 * Serves D1 Relational SQL, R2 Attachment & Private Seed Vault, HMAC Session/RLS Auth,
 * Multi-Device CAS Sync, Cross-Network Phone QR Scan, and Edge Gemini AI.
 */

import {
  handleAlertRules,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
  handleBlobs,
  handleIndustryDomainStore,
  handleKvDoc,
  handleOverrideRequests,
  handlePhoneScan,
  handleRecordsGet,
  handleRecordsPost,
  handleSavedViews,
  handleSeedGet,
  handleSentinelReviews,
  handleStaffBiometrics,
  handleStatus,
  handleSync,
  handleUsersGet,
  handleUsersPost,
  handleVerifyOverride
} from '../../_lib/d1_store.js';
import {
  handleEdgeAiEdge,
  handleEdgeAsk,
  handleEdgeSmartScan,
  handleEdgeTts
} from '../../_lib/gemini.js';
import { handleTelematics } from '../../_lib/telematics.js';
import { handleKioskOptions, handleKioskPunchFeed, handleKioskVerify } from '../../_lib/kiosk_verify.js';
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
const AUTHED_MAX_BODY_BYTES = 16777216; // 16 MB hard ceiling on authenticated sync/blob bodies

async function parseBodyWithSize(request, maxBytes = AUTHED_MAX_BODY_BYTES) {
  if (request.method === 'GET' || request.method === 'HEAD') return { body: {}, rawBytes: 0, tooLarge: false };
  const clen = Number(request.headers.get('Content-Length') || 0);
  if (clen > maxBytes) {
    return { body: {}, rawBytes: clen, tooLarge: true };
  }
  try {
    const txt = await request.text();
    const rawBytes = txt ? txt.length : 0;
    if (rawBytes > maxBytes) {
      return { body: {}, rawBytes, tooLarge: true };
    }
    return { body: txt ? JSON.parse(txt) : {}, rawBytes, tooLarge: false };
  } catch (_) {
    return { body: {}, rawBytes: 0, tooLarge: false };
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
  const rawSession = await extractRequestSession(request, env);
  const session = rawSession ? await verifyActiveEdgeSession(rawSession, env) : null;

  if (subPath === '/status' || subPath === '/health') {
    return handleStatus(env, session);
  }

  if (parts[0] === 'seed' && parts.length === 2 && request.method === 'GET') {
    return handleSeedGet(request, env, session, parts[1]);
  }

  const bodyLimit = session ? AUTHED_MAX_BODY_BYTES : 6291456; // 6 MB pre-auth ceiling (covers 4 MB phone-scan page)
  const { body, rawBytes, tooLarge } = await parseBodyWithSize(request, bodyLimit);
  if (tooLarge) {
    return jsonResponse({ ok: false, error: 'Request payload exceeds size limit.' }, 413);
  }

  if (subPath === '/auth/login' && request.method === 'POST') {
    return handleAuthLogin(request, env, body, session);
  }
  if (subPath === '/auth/logout' && request.method === 'POST') {
    return handleAuthLogout(request, env, session || rawSession);
  }
  if (subPath === '/auth/me' && request.method === 'GET') {
    return handleAuthMe(env, session);
  }
  if (subPath === '/phone-scan') {
    return handlePhoneScan(request, env, url, body, session);
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
      if (!isSameOriginBrowserRequest(request, url, env)) {
        return jsonResponse({ ok: false, error: 'Same-origin browser session required for Demo AI.' }, 403);
      }
      const clen = Number(request.headers.get('Content-Length') || 0);
      if (clen > DEMO_AI_MAX_BYTES || rawBytes > DEMO_AI_MAX_BYTES) {
        return jsonResponse({ ok: false, error: 'Demo AI payload exceeds 1.5 MB limit.' }, 413);
      }
      const ipHash = await hashClientIp(request);
      const rl = await checkD1RateLimit(env, `demo-ai:${ipHash}`, 15, 60, { failClosed: true });
      if (!rl.allowed) {
        return jsonResponse({ ok: false, error: 'Demo AI rate limit reached. Try again in a minute.' }, 429);
      }
      if (subPath === '/ask') return handleEdgeAsk(request, env, body, context, null);
      if (subPath === '/tts') return handleEdgeTts(request, env, body, null);
      if (subPath === '/smart-scan') return handleEdgeSmartScan(request, env, body, null);
      return handleEdgeAiEdge(request, env, body, null);
    }
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }

  if (subPath === '/auth/verify-override' && (request.method === 'POST' || request.method === 'GET')) {
    return handleVerifyOverride(request, env, session, body, url);
  }
  if (subPath === '/auth/override-requests' && (request.method === 'POST' || request.method === 'GET')) {
    return handleOverrideRequests(request, env, session, body, url);
  }
  if (subPath === '/saved-views' && (request.method === 'POST' || request.method === 'GET')) {
    return handleSavedViews(request, env, session, body);
  }

  if (subPath === '/users' && request.method === 'GET') {
    return handleUsersGet(request, env, session);
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
    return handleIndustryDomainStore(request, env, session, body, context);
  }

  // Door tablet punches for Payroll & Attendance (signed-in seats only, scoped to their companies).
  if (subPath === '/kiosk/punches' && request.method === 'POST') {
    return handleKioskPunchFeed(request, env, session, body, { isOwnerOrFullGroupSession, canAccessCompany });
  }

  if (subPath === '/blobs') {
    return handleBlobs(request, env, session, url, body);
  }

  if (subPath === '/telematics' && (request.method === 'GET' || request.method === 'POST')) {
    return handleTelematics(request, env, session, url, body);
  }

  // Edge AI Endpoints (Authenticated)
  if (subPath === '/ask' && request.method === 'POST') {
    return handleEdgeAsk(request, env, body, context, session);
  }
  if (subPath === '/tts' && request.method === 'POST') {
    return handleEdgeTts(request, env, body, session);
  }
  if (subPath === '/smart-scan' && request.method === 'POST') {
    return handleEdgeSmartScan(request, env, body, session);
  }
  if (subPath === '/ai-edge' && request.method === 'POST') {
    return handleEdgeAiEdge(request, env, body, session);
  }

  return jsonResponse({ ok: false, error: 'Not found', path: subPath }, 404);
}

export async function onRequest(context) {
  try {
    const resp = await routeAppApi(context);
    return applyEdgeCors(resp, context.request, context.env);
  } catch (_) {
    return applyEdgeCors(
      jsonResponse({ ok: false, error: 'Internal server error.' }, 500),
      context.request,
      context.env
    );
  }
}
