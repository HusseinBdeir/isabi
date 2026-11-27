/**
 * ISABI Systems — Command Center Edge API Router (/app/api/*)
 * Serves D1 Relational SQL, R2 Attachment & Private Seed Vault, HMAC Session/RLS Auth,
 * Multi-Device CAS Sync, Cross-Network Phone QR Scan, and Edge Gemini AI.
 */

import {
  effectiveMinSyncShellVer,
  handleAlertRules,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
  handleBlobs,
  handleCashflowBehind,
  handleDeviceUnsent,
  handleGeoAuditGet,
  handleGeoGateSuggestions,
  handleIndustryDomainStore,
  handleKioskOpticalDiag,
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
  handleVerifyOverride,
  verifyAndIncrementPhoneIdScan
} from '../../_lib/d1_store.js';
import {
  handleEdgeAiEdge,
  handleEdgeAsk,
  handleEdgeSmartScan,
  handleEdgeTts,
  validateBase64MediaDataUrl
} from '../../_lib/gemini.js';
import {
  evictCachedMapSession,
  handleGoogleMapPlaces,
  handleGoogleMapRoute,
  handleGoogleMapTile,
  handleGoogleMapUsage
} from '../../_lib/google_maps.js';
import { handleTelematics } from '../../_lib/telematics.js';
import { handleKioskOptions, handleKioskPosVoidFeed, handleKioskPunchFeed, handleKioskVerify } from '../../_lib/kiosk_verify.js';
import { handleResolveMapLink } from '../../_lib/map_link.js';
import { handleDayClosePush } from '../../_lib/web_push.js';
import { handlePushApi } from '../../_lib/approval_push.js';
import { handlePasskeysApi } from '../../_lib/webauthn.js';
import {
  applyEdgeCors,
  canAccessCompany,
  checkD1RateLimit,
  extractRequestSession,
  hashClientIp,
  isOwnerOrFullGroupSession,
  isSameOriginBrowserRequest,
  jsonResponse,
  redeemBuildTicket,
  verifyActiveEdgeSession
} from '../../_lib/security.js';

const DEMO_EMPTY_GET_ROUTES = new Set([
  '/sentinel_reviews',
  '/alert_rules',
  '/staff_biometrics',
  '/work_schedules',
  '/geo_config',
  '/geo/audit',
  '/geo/gate-suggestions',
  '/cashflow_behind',
  '/source_behind',
  '/changed_entries',
  '/device_unsent',
  '/kiosk_optical_diag',
  '/industry_domain_store',
  '/day-close-push',
  '/push/config'
]);

const DEMO_AI_MAX_BYTES = 1572864; // 1.5 MB ceiling on unauthenticated Demo AI payloads
const AUTHED_MAX_BODY_BYTES = 16777216; // 16 MB hard ceiling on authenticated sync/blob bodies
const SYNC_MAX_BODY_BYTES = 67108864; // 64 MB ceiling on authenticated /sync so bloated legacy clients self-heal via retiredDropped

const _UTF8_ENC = new TextEncoder();

async function parseBodyWithSize(request, maxBytes = AUTHED_MAX_BODY_BYTES) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return { body: {}, rawBytes: 0, tooLarge: false, parseError: false, emptyBody: false };
  }
  const clen = Number(request.headers.get('Content-Length') || 0);
  if (clen > maxBytes) {
    return { body: {}, rawBytes: clen, tooLarge: true, parseError: false, emptyBody: false };
  }
  try {
    const txt = await request.text();
    const rawBytes = txt ? _UTF8_ENC.encode(txt).length : 0;
    if (rawBytes > maxBytes) {
      return { body: {}, rawBytes, tooLarge: true, parseError: false, emptyBody: false };
    }
    if (!txt || !txt.trim()) {
      return { body: {}, rawBytes: 0, tooLarge: false, parseError: false, emptyBody: true };
    }
    return { body: JSON.parse(txt), rawBytes, tooLarge: false, parseError: false, emptyBody: false };
  } catch (_) {
    return { body: {}, rawBytes: 0, tooLarge: false, parseError: true, emptyBody: false };
  }
}

async function handlePhoneSmartScanRoute(request, env, body, rawBytes, parseError) {
  if (parseError) return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
  const rawUrl = String((body && body.dataUrl) || '').trim();
  const rawAlt = String((body && body.imageDataUrl) || '').trim();
  if (rawBytes > 2400000 || rawUrl.length > 2400000 || rawAlt.length > 2400000) {
    return jsonResponse({ ok: false, error: 'Mobile ID photo exceeds 2.2 MB upload limit.' }, 413);
  }
  const declMime = String((body && body.mimeType) || '').toLowerCase().trim();
  if (declMime && /svg|xml|html/i.test(declMime)) {
    return jsonResponse({ ok: false, error: 'Unsupported image format.' }, 400);
  }
  if (rawUrl) {
    const chk1 = validateBase64MediaDataUrl(rawUrl, { allowPdfAndHeic: true, declaredMime: declMime });
    if (!chk1.ok) return jsonResponse({ ok: false, error: chk1.error }, chk1.status || 400);
  }
  if (rawAlt) {
    const chk2 = validateBase64MediaDataUrl(rawAlt, { allowPdfAndHeic: true, declaredMime: declMime });
    if (!chk2.ok) return jsonResponse({ ok: false, error: chk2.error }, chk2.status || 400);
  }
  const ipHash = await hashClientIp(request);
  const rl = await checkD1RateLimit(env, `phone-id-scan:${ipHash}`, 15, 60, { failClosed: true });
  if (!rl.allowed) {
    return jsonResponse({ ok: false, error: 'Phone scan rate limit reached. Try again in a minute.' }, 429);
  }
  const grant = await verifyAndIncrementPhoneIdScan(env, body.phoneScanSid, body.phoneScanTok);
  if (!grant.ok) {
    return jsonResponse({ ok: false, code: grant.code || 'phone_scan_denied', error: grant.error || 'Phone scan link expired or already used.' }, grant.status || 403);
  }
  return handleEdgeSmartScan(request, env, {
    dataUrl: rawUrl,
    imageDataUrl: rawAlt,
    mimeType: body.mimeType,
    extractedText: body.extractedText,
    scanMode: 'id_card',
    tier: body.tier
  }, null, { phoneScanGrant: grant });
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
  if (parts[0] === 'map-tiles') {
    return handleGoogleMapTile(request, env, rawSession, parts, { url, context });
  }
  let session = rawSession ? await verifyActiveEdgeSession(rawSession, env) : null;
  if (!session && !rawSession) {
    // Build scripts only (security.js, Build tickets): null for every other request, route or header.
    session = await redeemBuildTicket(request, env, subPath);
  }

  if (subPath === '/status' || subPath === '/health') {
    return handleStatus(env, session);
  }

  if (parts[0] === 'seed' && parts.length === 2 && request.method === 'GET') {
    return handleSeedGet(request, env, session, parts[1]);
  }

  const bodyLimit = (subPath === '/map-places' || subPath === '/map-route' || subPath === '/map-usage' || subPath === '/resolve-map-link')
    ? 4096
    : (subPath === '/geo/gate-suggestions'
      ? 16384
      : (subPath === '/auth/passkeys'
        ? 65536
        : (session ? (subPath === '/sync' ? SYNC_MAX_BODY_BYTES : AUTHED_MAX_BODY_BYTES) : 6291456))); // 6 MB pre-auth ceiling (covers 4 MB phone-scan page)
  const { body, rawBytes, tooLarge, parseError, emptyBody } = await parseBodyWithSize(request, bodyLimit);
  if (tooLarge) {
    return jsonResponse({ ok: false, error: 'Request payload exceeds size limit.' }, 413);
  }

  if (subPath === '/auth/login' && request.method === 'POST') {
    const loginRes = await handleAuthLogin(request, env, body, session);
    if (
      loginRes.status === 200 &&
      session &&
      !(body && (body.verify_only === true || body.step_up === true || body.method === 'Owner Impersonation'))
    ) {
      evictCachedMapSession(session);
    }
    return loginRes;
  }
  if (subPath === '/auth/passkeys' && request.method === 'POST') {
    if (parseError) {
      return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
    }
    const act = String((body && body.action) || '').trim().toLowerCase();
    const purp = String((body && body.purpose) || '').trim().toLowerCase();
    const preAuthOk = (act === 'auth_options' || act === 'auth_verify') && purp === 'login';
    if (!preAuthOk && !session) {
      return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    }
    return handlePasskeysApi(request, env, session, body, url);
  }
  if (subPath === '/auth/logout' && request.method === 'POST') {
    evictCachedMapSession(session || rawSession);
    return handleAuthLogout(request, env, session || rawSession);
  }
  if (subPath === '/auth/me' && request.method === 'GET') {
    return handleAuthMe(env, session, url);
  }
  if (subPath === '/phone-scan') {
    return handlePhoneScan(request, env, url, body, session);
  }
  if (subPath === '/kiosk/verify' && request.method === 'POST') {
    return handleKioskVerify(request, env, session, body, { isOwnerOrFullGroupSession, canAccessCompany });
  }

  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1';
  const hasPresentedAuth = Boolean(
    request.headers.get('X-ISABI-Session') ||
    request.headers.get('Authorization') ||
    /(?:^|;\s*)isabi_edge_sess=/.test(String(request.headers.get('Cookie') || ''))
  );
  if (isDemoReq && subPath === '/telematics' && request.method === 'GET') {
    return handleTelematics(request, env, null, url, body);
  }
  if (subPath === '/resolve-map-link') {
    if (parseError) return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
    return handleResolveMapLink(request, env, body, session, { url });
  }
  if (subPath === '/map-places') {
    return handleGoogleMapPlaces(request, env, body, session, { url, parseError });
  }
  if (subPath === '/map-route') {
    return handleGoogleMapRoute(request, env, body, session, { url, parseError, context });
  }
  if (subPath === '/map-usage') {
    return handleGoogleMapUsage(request, env, body, session, { url, parseError, context });
  }
  if (subPath === '/geo/gate-suggestions' && (request.method === 'GET' || request.method === 'POST')) {
    const qTok = url && url.searchParams ? url.searchParams.get('gate_token') : '';
    const bTok = (body && typeof body === 'object') ? body.gate_token : '';
    if (qTok || bTok) {
      if (request.method === 'POST' && parseError) {
        return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
      }
      return handleGeoGateSuggestions(request, env, null, body, url);
    }
  }
  if (!session) {
    if (isDemoReq && subPath === '/kiosk/pos-voids' && (request.method === 'GET' || request.method === 'POST')) {
      return jsonResponse({ ok: true, demo: true, voids: [] });
    }
    if (isDemoReq && request.method === 'GET' && DEMO_EMPTY_GET_ROUTES.has(subPath)) {
      if (subPath === '/sentinel_reviews') return jsonResponse({ ok: true, demo: true, reviews: {} });
      if (subPath === '/alert_rules') return jsonResponse({ ok: true, demo: true, overrides: {}, custom: [] });
      if (subPath === '/staff_biometrics') return jsonResponse({ ok: true, demo: true, staff_biometrics: {} });
      if (subPath === '/work_schedules') return jsonResponse({ ok: true, demo: true, work_schedules: null });
      if (subPath === '/geo_config') return jsonResponse({ ok: true, demo: true, config: null });
      if (subPath === '/geo/audit') return jsonResponse({ ok: true, demo: true, audits: [], total: 0 });
      if (subPath === '/geo/gate-suggestions') return jsonResponse({ ok: true, demo: true, suggestions: [], canApprove: false });
      if (subPath === '/cashflow_behind') return jsonResponse({ ok: true, demo: true, cashflow_behind: null });
      if (subPath === '/source_behind') return jsonResponse({ ok: true, demo: true, source_behind: null });
      if (subPath === '/changed_entries') return jsonResponse({ ok: true, demo: true, changed_entries: null });
      if (subPath === '/device_unsent') return jsonResponse({ ok: true, demo: true, devices: [], minSyncShellVer: effectiveMinSyncShellVer() });
      if (subPath === '/kiosk_optical_diag') return jsonResponse({ ok: true, demo: true, stations: [] });
      if (subPath === '/industry_domain_store') return jsonResponse({ ok: true, demo: true, industryCustomRows: {}, industryRowEdits: {} });
      if (subPath === '/day-close-push') return jsonResponse({ ok: true, demo: true, subscribed: false, endpointCount: 0, vapidPublicKey: '', closeHourBeirut: 18, whatsappPhone: '', lang: 'en', scopeKey: '', lastSentDate: '' });
      if (subPath === '/push/config') return jsonResponse({ ok: true, demo: true, enabled: false, publicKey: '', reason: 'demo' });
    }
    if (subPath === '/smart-scan' && request.method === 'POST' && body && body.phoneScanSid) {
      return handlePhoneSmartScanRoute(request, env, body, rawBytes, parseError);
    }
    if (isDemoReq && request.method === 'POST' && (subPath === '/ask' || subPath === '/tts' || subPath === '/smart-scan' || subPath === '/ai-edge')) {
      if (rawSession || hasPresentedAuth) {
        return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
      }
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
    if (request.method === 'POST' && ['/records', '/industry_domain_store', '/geo_config', '/sync'].includes(subPath)) {
      if (!env || !env.DB) {
        return jsonResponse({ ok: false, error: 'Database unavailable' }, 503);
      }
      const isSyncRead = subPath === '/sync' && body && (body.op === 'get_mfg' || body.op === 'get_control');
      if (isDemoReq && !isSyncRead) {
        return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
      }
    }
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }

  if (subPath === '/auth/verify-override' && (request.method === 'POST' || request.method === 'GET')) {
    return handleVerifyOverride(request, env, session, body, url);
  }
  if (subPath === '/auth/override-requests' && (request.method === 'POST' || request.method === 'GET')) {
    return handleOverrideRequests(request, env, session, body, url, context);
  }
  // Web Push for approval requests (config, subscribe, unsubscribe); shares D1 VAPID keypair or env VAPID_* vars.
  if (parts[0] === 'push') {
    return handlePushApi(request, env, session, body, subPath);
  }
  if (subPath === '/saved-views' && (request.method === 'POST' || request.method === 'GET')) {
    return handleSavedViews(request, env, session, body);
  }
  if (subPath === '/geo/audit' && request.method === 'GET') {
    return handleGeoAuditGet(request, env, session, url);
  }
  if (subPath === '/geo/gate-suggestions' && (request.method === 'GET' || request.method === 'POST')) {
    if (request.method === 'POST' && parseError) {
      return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
    }
    return handleGeoGateSuggestions(request, env, session, body, url);
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

  if (subPath === '/cashflow_behind' || subPath === '/source_behind' || subPath === '/changed_entries') {
    return handleCashflowBehind(request, env, session, body, rawBytes, { parseError, emptyBody }, subPath.slice(1));
  }

  // Entries a device has not sent yet: any signed-in seat reports its own device, the Owner reads the list.
  if (subPath === '/device_unsent') {
    const maxUnsentBytes = (body && typeof body === 'object' && !Array.isArray(body) && body.action === 'dismiss_late') ? 4096 : 2048;
    if (rawBytes > maxUnsentBytes) {
      return jsonResponse({ ok: false, error: maxUnsentBytes > 2048 ? 'Device report exceeds 4 KB limit.' : 'Device report exceeds 2 KB limit.' }, 413);
    }
    return handleDeviceUnsent(request, env, session, body, { parseError, emptyBody });
  }

  if (subPath === '/kiosk_optical_diag') {
    if (rawBytes > 4096) {
      return jsonResponse({ ok: false, error: 'Diagnostics report exceeds 4 KB limit.' }, 413);
    }
    return handleKioskOpticalDiag(request, env, session, body, { parseError, emptyBody });
  }

  if (subPath === '/industry_domain_store') {
    return handleIndustryDomainStore(request, env, session, body, context);
  }

  // Door tablet punches for Payroll & Attendance (signed-in seats only, scoped to their companies).
  if (subPath === '/kiosk/punches' && request.method === 'POST') {
    return handleKioskPunchFeed(request, env, session, body, { isOwnerOrFullGroupSession, canAccessCompany });
  }
  if (subPath === '/kiosk/pos-voids' && (request.method === 'POST' || request.method === 'GET')) {
    return handleKioskPosVoidFeed(request, env, session, body, { isOwnerOrFullGroupSession, canAccessCompany });
  }

  if (subPath === '/blobs') {
    return handleBlobs(request, env, session, url, body);
  }

  if (subPath === '/telematics' && (request.method === 'GET' || request.method === 'POST')) {
    return handleTelematics(request, env, session, url, body);
  }

  if (subPath === '/day-close-push' && (request.method === 'GET' || request.method === 'POST')) {
    return handleDayClosePush(request, env, session, body);
  }

  // Edge AI Endpoints (Authenticated)
  if (subPath === '/ask' && request.method === 'POST') {
    return handleEdgeAsk(request, env, body, context, session);
  }
  if (subPath === '/tts' && request.method === 'POST') {
    return handleEdgeTts(request, env, body, session);
  }
  if (subPath === '/smart-scan' && request.method === 'POST') {
    if (body && body.phoneScanSid) {
      return handlePhoneSmartScanRoute(request, env, body, rawBytes, parseError);
    }
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
