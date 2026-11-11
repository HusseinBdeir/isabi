// functions/_middleware.js - Direct 200 OK emergency Service Worker reset endpoints (bypasses Cloudflare Pages 308 .html strip)
function buildResetHtml(isApp, isLegacyHost) {
  const title = isApp ? 'Resetting ISABI Command Center Cache...' : 'Resetting ISABI Systems Cache...';
  const sub = isApp ? 'Preserving local database records and redirecting...' : 'Preserving local settings and redirecting...';
  const iconPrefix = isApp ? '/app/' : '/';
  const redirectTarget = (isLegacyHost ? 'https://isabisystems.com' : '') + (isApp ? '/app/' : '/');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <link rel="icon" href="${iconPrefix}icon.svg" type="image/svg+xml" sizes="any">
  <link rel="icon" href="${iconPrefix}icon-dark.svg" type="image/svg+xml" sizes="any" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="${iconPrefix}icon.svg" type="image/svg+xml" sizes="any" media="(prefers-color-scheme: light)">
  <link rel="shortcut icon" href="${iconPrefix}favicon.ico">
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #FAF9F6; color: #281D15; display: grid; place-items: center; height: 100vh; }
    .card { padding: 24px 32px; background: #FCF9F2; border: 1px solid #C4913A; border-radius: 12px; text-align: center; box-shadow: 0 10px 28px rgba(40, 29, 21, 0.08); }
    p { color: #4A3628; margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h3>Clearing Service Worker &amp; Cache...</h3>
    <p id="status">${sub}</p>
  </div>
  <script>
    (async function() {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        }
      } catch (e) {}
      location.replace('${redirectTarget}?reset=' + Date.now());
    })();
  </script>
</body>
</html>
`;
}

const SHOWCASE_404_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function buildLegacyHostSwMigrationScript() {
  return `// Legacy host Service Worker clean migration to https://isabisystems.com
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try { await self.clients.claim(); } catch (_) {}
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { await client.navigate(client.url); } catch (_) {}
      }
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
  })());
});
`;
}

function isBlockedInternalPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (
    p === '/wrangler.toml' ||
    p === '/app/server.py' ||
    p === '/app/js/seed_data.js' ||
    p === '/app/js/seed_core.json' ||
    p === '/app/js/seed_records.json' ||
    p === '/app/js/seed_industries.json' ||
    p.startsWith('/build/') ||
    p === '/build' ||
    p.startsWith('/functions/') ||
    p === '/functions' ||
    p.startsWith('/migrations/') ||
    p === '/migrations' ||
    p.startsWith('/exports/') ||
    p === '/exports'
  ) {
    return true;
  }
  return false;
}

function resolveLegacyIsabiPath(pathname) {
  const p = String(pathname || '');
  const pl = p.toLowerCase();
  if (pl === '/isabi/app' || pl === '/isabi/app/') return '/app/';
  if (pl.startsWith('/isabi/app/')) {
    const rest = p.slice('/isabi/app/'.length).replace(/^[\/\\]+/, '');
    return '/app/' + rest;
  }
  if (pl === '/isabi' || pl.startsWith('/isabi/')) return '/';
  return null;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.pathname;
  // Use only the routed HTTP Host / URL hostname (never trust client-supplied X-Forwarded-Host)
  const rawHostHdr = String(request.headers.get('host') || url.hostname || '').trim().toLowerCase();
  const rawHost = (rawHostHdr.startsWith('[') && rawHostHdr.includes(']')
    ? rawHostHdr.slice(0, rawHostHdr.indexOf(']') + 1)
    : rawHostHdr.split(':')[0]).replace(/\.+$/, '');

  if (isBlockedInternalPath(p)) {
    return new Response(request.method === 'HEAD' ? null : 'Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-ISABI-Edge': '1'
      }
    });
  }

  const pLower = p.toLowerCase();
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (rawHost === 'isabi-systems.pages.dev' || rawHost === 'www.isabisystems.com') &&
    (pLower === '/sw.js' || pLower === '/app/sw.js')
  ) {
    const swJs = buildLegacyHostSwMigrationScript();
    return new Response(request.method === 'HEAD' ? null : swJs, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': pLower === '/app/sw.js' ? '/app/' : '/',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-ISABI-Edge': '1'
      }
    });
  }

  const isLegacyHost = rawHost === 'isabi-systems.pages.dev' || rawHost === 'www.isabisystems.com';
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (pLower === '/reset' || pLower === '/reset.html' || pLower === '/app/reset' || pLower === '/app/reset.html')
  ) {
    const isApp = pLower.startsWith('/app/');
    const html = buildResetHtml(isApp, isLegacyHost);
    return new Response(request.method === 'HEAD' ? null : html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Permissions-Policy': 'microphone=(self), camera=(self), geolocation=(self)',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-ISABI-Edge': '1'
      }
    });
  }

  const isApiRoute = pLower === '/api' || pLower.startsWith('/api/') || pLower === '/app/api' || pLower.startsWith('/app/api/');
  const legacyTarget = resolveLegacyIsabiPath(p);
  const needsHostRedirect = !isApiRoute && isLegacyHost;

  if (needsHostRedirect || legacyTarget !== null) {
    const isLocalHost = rawHost === '127.0.0.1' || rawHost === 'localhost' || rawHost === '[::1]';
    const targetOrigin = isLocalHost ? url.origin : 'https://isabisystems.com';
    const rawTargetPath = legacyTarget !== null ? legacyTarget : p;
    const safePath = '/' + String(rawTargetPath || '/').replace(/^[\/\\]+/, '');
    const locationUrl = targetOrigin + safePath + (url.search || '');
    const parsedTarget = new URL(locationUrl);
    if (parsedTarget.origin === targetOrigin) {
      const code = (request.method === 'GET' || request.method === 'HEAD') ? 301 : 308;
      const redirHdrs = {
        'Location': parsedTarget.toString(),
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-ISABI-Edge': '1'
      };
      if (rawHost.endsWith('.pages.dev')) {
        redirHdrs['X-Robots-Tag'] = 'noindex, nofollow';
      }
      return new Response(null, {
        status: code,
        headers: redirHdrs
      });
    }
  }

  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (pLower === '/404' ||
      pLower === '/404/' ||
      pLower === '/404.html' ||
      pLower === '/__isabi_404_template__' ||
      pLower === '/__isabi_404_template__.html')
  ) {
    const fetchAsset = req => (context.env && context.env.ASSETS ? context.env.ASSETS.fetch(req) : context.next(req));
    let assetRes = await fetchAsset(new Request(new URL('/404', url.origin), { method: 'GET' }));
    if (!assetRes || (assetRes.status >= 300 && assetRes.status < 400)) {
      assetRes = await fetchAsset(new Request(new URL('/__isabi_404_template__', url.origin), { method: 'GET' }));
    }
    return new Response(request.method === 'HEAD' ? null : (assetRes ? assetRes.body : 'Not Found'), {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': SHOWCASE_404_CSP,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'microphone=(self), camera=(self), geolocation=(self), bluetooth=(self), usb=(), payment=()',
        'X-ISABI-Edge': '1'
      }
    });
  }

  const res = await context.next();
  if (!res || res.status === 101) return res;

  const isPreviewPagesDev = rawHost.endsWith('.pages.dev');
  if (res.status === 404 || isPreviewPagesDev) {
    const hdrs = new Headers(res.headers);
    hdrs.set('X-Robots-Tag', 'noindex, nofollow');
    if (res.status === 404) {
      hdrs.set('Cache-Control', 'no-store');
      if (!hdrs.has('Strict-Transport-Security')) hdrs.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      if (!hdrs.has('X-Content-Type-Options')) hdrs.set('X-Content-Type-Options', 'nosniff');
      if (!hdrs.has('X-Frame-Options')) hdrs.set('X-Frame-Options', 'DENY');
      if (!hdrs.has('Referrer-Policy')) hdrs.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      if (!hdrs.has('X-ISABI-Edge')) hdrs.set('X-ISABI-Edge', '1');
      if ((hdrs.get('Content-Type') || '').toLowerCase().includes('text/html') && !hdrs.has('Content-Security-Policy')) {
        hdrs.set('Content-Security-Policy', SHOWCASE_404_CSP);
      }
    }
    const nullBody = res.status === 204 || res.status === 205 || res.status === 304;
    return new Response(nullBody ? null : res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: hdrs
    });
  }

  return res;
}
