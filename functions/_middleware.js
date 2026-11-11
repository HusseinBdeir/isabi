// functions/_middleware.js - Direct 200 OK emergency Service Worker reset endpoints (bypasses Cloudflare Pages 308 .html strip)
function buildResetHtml(isApp) {
  const title = isApp ? 'Resetting ISABI Command Center Cache...' : 'Resetting ISABI Systems Cache...';
  const sub = isApp ? 'Preserving local database records and redirecting...' : 'Preserving local settings and redirecting...';
  const iconPrefix = isApp ? '/app/' : '/';
  const redirectTarget = isApp ? '/app/' : '/';
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

function isBlockedInternalPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (
    p === '/wrangler.toml' ||
    p === '/app/server.py' ||
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

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.pathname;
  if (isBlockedInternalPath(p)) {
    return new Response(request.method === 'HEAD' ? null : 'Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-ISABI-Edge': '1'
      }
    });
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && (p === '/reset' || p === '/reset.html' || p === '/app/reset' || p === '/app/reset.html')) {
    const isApp = p.startsWith('/app/');
    const html = buildResetHtml(isApp);
    return new Response(request.method === 'HEAD' ? null : html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Permissions-Policy': 'microphone=(self), camera=(self), geolocation=(self)',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-ISABI-Edge': '1'
      }
    });
  }
  return context.next();
}
