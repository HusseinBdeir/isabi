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
import { extractRequestSession, jsonResponse } from '../../_lib/security.js';

async function parseBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  try {
    const txt = await request.text();
    return txt ? JSON.parse(txt) : {};
  } catch (_) {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') {
    return jsonResponse({ ok: true }, 204);
  }

  const url = new URL(request.url);
  const parts = Array.isArray(params.route)
    ? params.route
    : (params.route ? [String(params.route)] : []);
  const subPath = '/' + parts.join('/');

  if (subPath === '/status' || subPath === '/health') {
    return handleStatus(env);
  }

  const session = await extractRequestSession(request, env);
  const body = await parseBody(request);

  if (subPath === '/auth/login' && request.method === 'POST') {
    return handleAuthLogin(request, env, body);
  }
  if (subPath === '/auth/logout' && request.method === 'POST') {
    return handleAuthLogout(request);
  }
  if (subPath === '/auth/me' && request.method === 'GET') {
    return jsonResponse({ ok: true, edge: true, authenticated: Boolean(session), session });
  }

  if (subPath === '/users') {
    if (request.method === 'GET') return handleUsersGet(request, env, session);
    if (request.method === 'POST') return handleUsersPost(request, env, session, body);
  }

  if (subPath === '/records') {
    if (request.method === 'GET') return handleRecordsGet(request, env, session, url);
    if (request.method === 'POST') return handleRecordsPost(request, env, session, body);
  }

  if (subPath === '/sync') {
    return handleSync(request, env, session, body, context);
  }

  if (subPath === '/sentinel_reviews') {
    return handleSentinelReviews(request, env, body);
  }

  if (subPath === '/alert_rules') {
    return handleAlertRules(request, env, body);
  }

  if (subPath === '/staff_biometrics') {
    return handleStaffBiometrics(request, env, body);
  }

  if (subPath === '/work_schedules') {
    return handleKvDoc(request, env, 'work_schedules', 'work_schedules', body);
  }

  if (subPath === '/geo_config') {
    return handleKvDoc(request, env, 'geo_config', 'config', body);
  }

  if (subPath === '/industry_domain_store') {
    return handleIndustryDomainStore(request, env, session, body);
  }

  if (subPath === '/phone-scan') {
    return handlePhoneScan(request, env, url, body);
  }

  if (subPath === '/blobs') {
    return handleBlobs(request, env, session, url, body);
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
