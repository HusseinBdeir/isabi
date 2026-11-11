// build/verify_404_page.mjs - the branded "page not found" response for isabisystems.com and /app/.
// Cloudflare Pages answers every unknown path with the root index.html and HTTP 200 unless a 404.html
// exists at the site root; with it, unknown paths (and missing scripts or styles) return a real 404.
//   node build/verify_404_page.mjs            static checks on 404.html and the Pages bundle allowlist
//   node build/verify_404_page.mjs --live     the above, plus status probes against https://isabisystems.com
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');
const ORIGIN = 'https://isabisystems.com';
let failed = 0;
const check = (ok, name, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${!ok && detail ? ' - ' + detail : ''}`); };

const file = path.join(ROOT, '404.html');
const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
check(Boolean(html), '404.html exists at the site root');
check(Buffer.byteLength(html) > 600 && Buffer.byteLength(html) < 12000, '404.html is a small self-contained page', `${Buffer.byteLength(html)} bytes`);

const stage = fs.readFileSync(path.join(ROOT, 'build', 'stage_pages_bundle.py'), 'utf8');
const allow = (stage.match(/ROOT_ALLOWLIST = \(([\s\S]*?)\n\)/) || [])[1] || '';
check(/"404\.html"/.test(allow), '404.html is in the Pages bundle allowlist (stage_pages_bundle.py)');

check(/<meta name="robots" content="noindex, nofollow">/.test(html), 'page is marked noindex');
check(!/[—→]/.test(html), 'copy carries no em-dash or arrow characters');
check(!/THEO|Microsoft|Dataverse|Power BI|Power Apps|SharePoint/i.test(html), 'copy names no internal or third-party platform');
const external = (html.match(/(?:src|href)="(https?:)?\/\/[^"]+"/g) || []);
check(external.length === 0, 'page loads nothing from another origin', external.join(', '));
check(/This page does not exist/.test(html) && /هذه الصفحة غير موجودة/.test(html) && /Cette page n'existe pas/.test(html), 'copy ships in English, Arabic and French');
check(/href="\/"/.test(html) && /href="\/app\/"/.test(html), 'page links back to the site and to the Command Center without JavaScript');

// Run the inline script against a minimal document for each language and location.
const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
function render(pathname, stored, navLang) {
  const els = { t: { textContent: '' }, s: { textContent: '' }, a1: { textContent: '', href: '' }, a2: { textContent: '', href: '' } };
  const ctx = {
    document: { documentElement: { lang: 'en', dir: 'ltr' }, title: '', getElementById: id => els[id] },
    localStorage: { getItem: k => (k === 'isabi.lang.v1' ? stored : null) },
    navigator: { language: navLang },
    location: { pathname }
  };
  vm.runInNewContext(script, ctx);
  return { lang: ctx.document.documentElement.lang, dir: ctx.document.documentElement.dir, title: ctx.document.title, t: els.t.textContent, a1: els.a1.href, a2: els.a2.href, a1Text: els.a1.textContent };
}
let r;
try {
  r = render('/zzz', null, 'en-US');
  check(r.lang === 'en' && r.dir === 'ltr' && r.a1 === '/' && r.a2 === '/app/', 'unknown site path: English, primary link is the site', JSON.stringify(r));
  r = render('/app/zzz', 'ar', 'en-US');
  check(r.lang === 'ar' && r.dir === 'rtl' && r.a1 === '/app/' && r.a2 === '/' && /مركز القيادة/.test(r.a1Text), 'unknown /app/ path with Arabic saved: right-to-left, primary link is the Command Center', JSON.stringify(r));
  r = render('/app', null, 'fr-FR');
  check(r.lang === 'fr' && r.a1 === '/app/' && /introuvable/.test(r.title), 'browser language French is honoured when nothing is saved', JSON.stringify(r));
  r = render('/x', 'de', 'de-DE');
  check(r.lang === 'en', 'an unsupported language falls back to English', JSON.stringify(r));
} catch (e) {
  check(false, 'inline script runs', String(e && e.message || e));
}

if (LIVE) {
  const rand = Math.random().toString(36).slice(2, 10);
  const probe = async (p, expectStatus, expectBody) => {
    try {
      const res = await fetch(ORIGIN + p, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (verify_404_page)' } });
      const body = await res.text();
      const ok = res.status === expectStatus && (!expectBody || expectBody.test(body));
      check(ok, `live ${p} -> ${expectStatus}`, `got ${res.status}, ${body.length} bytes, ${res.headers.get('content-type')}`);
    } catch (e) { check(false, `live ${p}`, String(e && e.message || e)); }
  };
  await probe(`/zzz-${rand}`, 404, /This page does not exist/);
  await probe(`/app/zzz-${rand}`, 404, /This page does not exist/);
  await probe(`/app/js/zzz-${rand}.js`, 404, /This page does not exist/);
  await probe(`/app/css/zzz-${rand}.css`, 404, null);
  await probe('/', 200, /ISABI Systems/);
  await probe('/app/', 200, /__MFG_SHELL_VER/);
  await probe('/reset', 200, /Clearing Service Worker/);
  await probe('/robots.txt', 200, /Disallow: \/app\//);
}

console.log(`\nverify_404_page: ${failed ? failed + ' failed' : 'all checks passed'}${LIVE ? ' (live)' : ''}`);
process.exit(failed ? 1 : 0);
