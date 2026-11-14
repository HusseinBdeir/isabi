/**
 * ISABI Systems — Authenticated & SSRF-Hardened Short Map Link Resolver
 * Expands shortened WhatsApp / Google Maps / Waze links (max 3 hops, zero body read)
 * so pasted short links auto-extract GPS coordinates across + New Site, Map Studio,
 * Delivery Tickets, and 360° Record / Domain Inspectors.
 */

import {
  checkD1RateLimit,
  hashClientIp,
  isSameOriginBrowserRequest,
  jsonResponse
} from './security.js';

export const ENTRY_SHORT_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'waze.com',
  'www.waze.com',
  'ul.waze.com'
]);

export const REDIRECT_TARGET_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'maps.google.com',
  'google.com',
  'consent.google.com',
  'waze.com',
  'www.waze.com',
  'ul.waze.com'
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_URL_LEN = 2048;

function hasControlOrUnsafeAuthorityChars(str) {
  return /[\u0000-\u001F\u007F]/.test(str);
}

function isIpOrInternalHostname(host) {
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  // Reject IPv6 brackets/colons
  if (host.includes(':') || host.startsWith('[') || host.endsWith(']')) {
    return true;
  }
  // Reject dotted-quad IPv4 literals or integer/hex single-label IP forms
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /^(?:0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true;
  }
  return false;
}

export function extractFirstHttpsUrl(rawInput) {
  const txt = String(rawInput || '').trim();
  if (!txt) return '';
  if (txt.length > MAX_URL_LEN * 2) return '';
  const m = txt.match(/https:\/\/[^\s<>"'`]+/i);
  if (!m) return '';
  let cand = m[0];
  while (cand && /[).,;\]}>'"]$/.test(cand)) {
    cand = cand.slice(0, -1);
  }
  return cand;
}

export function validateMapRedirectUrl(rawUrl, opts = {}) {
  const isEntry = Boolean(opts && opts.isEntry);
  const str = String(rawUrl || '').trim();
  if (!str || str.length > MAX_URL_LEN || hasControlOrUnsafeAuthorityChars(str)) {
    return { ok: false, code: 'invalid_url', error: 'Invalid map link URL.' };
  }
  // Reject backslashes before query/fragment which can confuse non-WHATWG authority parsers
  const authorityPrefix = str.split(/[?#]/, 1)[0];
  if (authorityPrefix.includes('\\')) {
    return { ok: false, code: 'invalid_url', error: 'Malformed URL authority.' };
  }
  let u;
  try {
    u = new URL(str);
  } catch (_) {
    return { ok: false, code: 'invalid_url', error: 'Unparseable map link URL.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, code: 'disallowed_scheme', error: 'Only HTTPS map links are permitted.' };
  }
  if (u.port && u.port !== '443') {
    return { ok: false, code: 'disallowed_port', error: 'Non-standard ports are not permitted.' };
  }
  if (u.username || u.password) {
    return { ok: false, code: 'disallowed_credentials', error: 'Embedded URL credentials are not permitted.' };
  }
  const host = String(u.hostname || '').toLowerCase().replace(/\.+$/, '');
  if (isIpOrInternalHostname(host)) {
    return { ok: false, code: 'disallowed_host', error: 'IP literals and internal hosts are not permitted.' };
  }
  if (isEntry) {
    if (!ENTRY_SHORT_HOSTS.has(host)) {
      return {
        ok: false,
        code: 'disallowed_host',
        error: 'Only shortened Google Maps (maps.app.goo.gl, goo.gl) or Waze links can be expanded.'
      };
    }
    if (host === 'goo.gl' && !/^\/maps(?:\/|$)/i.test(u.pathname || '') && !/^\/[A-Za-z0-9_-]{4,64}\/?$/.test(u.pathname || '')) {
      return { ok: false, code: 'disallowed_path', error: 'Only goo.gl map short links are permitted.' };
    }
  } else if (!REDIRECT_TARGET_HOSTS.has(host)) {
    return {
      ok: false,
      code: 'disallowed_redirect_target',
      error: 'Redirect target is outside the Google Maps / Waze allowlist.'
    };
  }
  return { ok: true, url: u.toString(), urlObj: u, host };
}

export function urlAlreadyHasCoordinates(urlStr) {
  const s = String(urlStr || '');
  if (!s) return false;
  if (/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.test(s)) return true;
  if (/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.test(s)) return true;
  if (/[?&](?:q|query|ll|latlng|center|destination|daddr|saddr|viewpoint|sll)=(?:loc:)?(-?\d{1,3}\.\d+)(?:%2[cC]|,|\+|%20)(-?\d{1,3}\.\d+)/i.test(s)) {
    return true;
  }
  if (/[?&]lat=(-?\d{1,3}\.\d+)&(?:lon|lng)=(-?\d{1,3}\.\d+)/i.test(s)) return true;
  return false;
}

export function unwrapGoogleConsentOrUrlRedirect(urlObj) {
  if (!urlObj) return '';
  const host = String(urlObj.hostname || '').toLowerCase().replace(/\.+$/, '');
  if (host === 'consent.google.com') {
    const cont = urlObj.searchParams.get('continue');
    if (cont) {
      const check = validateMapRedirectUrl(cont, { isEntry: false });
      if (check.ok) return check.url;
    }
  }
  if ((host === 'www.google.com' || host === 'google.com') && urlObj.pathname === '/url') {
    const target = urlObj.searchParams.get('q') || urlObj.searchParams.get('url');
    if (target) {
      const check = validateMapRedirectUrl(target, { isEntry: false });
      if (check.ok) return check.url;
    }
  }
  return '';
}

export async function walkShortMapRedirects(rawEntryUrl, opts = {}) {
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : fetch;
  const maxHops = Math.max(1, Math.min(3, Number(opts.maxHops || 3)));
  const timeoutMs = Math.max(500, Math.min(8000, Number(opts.timeoutMs || 5000)));

  const candidate = extractFirstHttpsUrl(rawEntryUrl) || String(rawEntryUrl || '').trim();
  const entryCheck = validateMapRedirectUrl(candidate, { isEntry: true });
  if (!entryCheck.ok) {
    return { ok: false, status: 400, code: entryCheck.code, error: entryCheck.error };
  }

  let currentUrl = entryCheck.url;
  const seen = new Set([currentUrl]);
  let hopsTaken = 0;

  for (let hop = 0; hop <= maxHops; hop++) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => { try { ac.abort(); } catch (_) {} }, timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: ac ? ac.signal : undefined,
        headers: {
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'User-Agent': 'Mozilla/5.0 (compatible; ISABI-MapLinkResolver/1.0)'
        }
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      const isAbort = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
      return {
        ok: false,
        status: isAbort ? 504 : 502,
        code: isAbort ? 'resolve_timeout' : 'upstream_fetch_failed',
        error: isAbort ? 'Timed out expanding short map link.' : 'Could not reach short map link provider.'
      };
    }
    if (timer) clearTimeout(timer);

    // Header-only: never read HTML/script response body bytes
    try {
      if (res && res.body && typeof res.body.cancel === 'function') {
        await res.body.cancel();
      }
    } catch (_) {}

    const status = Number((res && res.status) || 0);
    const loc = res && res.headers && typeof res.headers.get === 'function' ? String(res.headers.get('location') || '').trim() : '';

    if (REDIRECT_STATUSES.has(status) && loc) {
      if (hopsTaken >= maxHops) {
        return {
          ok: false,
          status: 422,
          code: 'too_many_redirects',
          error: 'Too many redirects while expanding short map link.'
        };
      }
      if (hasControlOrUnsafeAuthorityChars(loc) || loc.length > MAX_URL_LEN) {
        return {
          ok: false,
          status: 422,
          code: 'disallowed_redirect_target',
          error: 'Invalid redirect Location returned by provider.'
        };
      }
      let nextAbs;
      try {
        nextAbs = new URL(loc, currentUrl).toString();
      } catch (_) {
        return {
          ok: false,
          status: 422,
          code: 'disallowed_redirect_target',
          error: 'Unparseable redirect Location returned by provider.'
        };
      }
      const nextCheck = validateMapRedirectUrl(nextAbs, { isEntry: false });
      if (!nextCheck.ok) {
        return {
          ok: false,
          status: 422,
          code: nextCheck.code === 'disallowed_host' ? 'disallowed_redirect_target' : nextCheck.code,
          error: nextCheck.error
        };
      }
      const unwrapped = unwrapGoogleConsentOrUrlRedirect(nextCheck.urlObj);
      const resolvedNext = unwrapped || nextCheck.url;
      hopsTaken += 1;
      currentUrl = resolvedNext;

      if (urlAlreadyHasCoordinates(currentUrl)) {
        return { ok: true, url: entryCheck.url, resolvedUrl: currentUrl, hops: hopsTaken };
      }
      if (seen.has(currentUrl)) {
        return {
          ok: false,
          status: 422,
          code: 'redirect_loop',
          error: 'Redirect loop detected while expanding short map link.'
        };
      }
      seen.add(currentUrl);
      continue;
    }

    if (hopsTaken > 0) {
      let curHost = '';
      try { curHost = new URL(currentUrl).hostname.toLowerCase().replace(/\.+$/, ''); } catch (_) {}
      if (!urlAlreadyHasCoordinates(currentUrl) && ENTRY_SHORT_HOSTS.has(curHost)) {
        return {
          ok: false,
          status: 422,
          code: 'no_redirect_location',
          error: 'Short map link did not expand to a destination URL.'
        };
      }
      return { ok: true, url: entryCheck.url, resolvedUrl: currentUrl, hops: hopsTaken };
    }
    return {
      ok: false,
      status: 422,
      code: 'no_redirect_location',
      error: 'Short map link did not return a redirect header.'
    };
  }

  let finalHost = '';
  try { finalHost = new URL(currentUrl).hostname.toLowerCase().replace(/\.+$/, ''); } catch (_) {}
  if (hopsTaken > 0 && currentUrl !== entryCheck.url && (urlAlreadyHasCoordinates(currentUrl) || !ENTRY_SHORT_HOSTS.has(finalHost))) {
    return { ok: true, url: entryCheck.url, resolvedUrl: currentUrl, hops: hopsTaken };
  }
  return {
    ok: false,
    status: 422,
    code: hopsTaken >= maxHops ? 'too_many_redirects' : 'no_redirect_location',
    error: 'Short map link could not be expanded.'
  };
}

export async function handleResolveMapLink(request, env, body, session, opts = {}) {
  if (String(request.method || '').toUpperCase() !== 'POST') {
    return jsonResponse({ ok: false, code: 'method_not_allowed', error: 'POST required.' }, 405);
  }

  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1';
  if (!session) {
    if (!isDemoReq) {
      return jsonResponse({ ok: false, code: 'auth_required', error: 'Authentication required.' }, 401);
    }
    if (!isSameOriginBrowserRequest(request, opts.url || null, env)) {
      return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Same-origin browser session required.' }, 403);
    }
  }

  const ipHash = await hashClientIp(request);
  const rlKey = session
    ? `maplink:u:${String(session.sub || session.email || ipHash).slice(0, 48)}`
    : `maplink:demo:${ipHash}`;
  const rl = await checkD1RateLimit(env, rlKey, 30, 60, { failClosed: Boolean(env && env.DB) });
  if (!rl.allowed) {
    return jsonResponse({ ok: false, code: 'rate_limited', error: 'Too many map link resolution requests. Please wait a minute.' }, 429);
  }

  const rawInput = body && typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawInput) {
    return jsonResponse({ ok: false, code: 'missing_url', error: 'Provide a map link URL in body.url.' }, 400);
  }

  let effectiveFetchImpl = opts.fetchImpl;
  if (!effectiveFetchImpl && env && String(env.VT_TEST_FIXTURE || '') === '1' && env.ISABI_TEST_MAP_LINK_MOCKS) {
    try {
      const mockMap = JSON.parse(String(env.ISABI_TEST_MAP_LINK_MOCKS));
      if (mockMap && typeof mockMap === 'object') {
        effectiveFetchImpl = async (url) => {
          const hit = mockMap[String(url)];
          if (!hit) return new Response(null, { status: 404 });
          const hdrs = hit.location ? { Location: String(hit.location) } : {};
          return new Response(null, { status: Number(hit.status || 302), headers: hdrs });
        };
      }
    } catch (_) {}
  }

  const result = await walkShortMapRedirects(rawInput, {
    fetchImpl: effectiveFetchImpl,
    maxHops: 3,
    timeoutMs: 5000
  });
  if (!result.ok) {
    return jsonResponse(
      { ok: false, code: result.code || 'resolve_failed', error: result.error || 'Could not resolve short map link.' },
      result.status || 422
    );
  }
  return jsonResponse({
    ok: true,
    url: result.url,
    resolvedUrl: result.resolvedUrl,
    hops: result.hops
  }, 200);
}
