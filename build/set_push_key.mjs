#!/usr/bin/env node
// ISABI Command Center: owner step that switches on phone and desktop notifications for approval requests.
//
// What it does (once):
//   1. Makes a new P-256 key pair with WebCrypto on this PC (the VAPID key that identifies the ISABI server to
//      the Apple, Google, Microsoft and Mozilla push services).
//   2. Stores three settings on the Cloudflare Pages project `isabi-systems` (production) as encrypted Pages
//      secrets, through wrangler with the value on stdin (never on the command line, never on screen):
//        VAPID_PRIVATE_KEY  the private half (secret)
//        VAPID_PUBLIC_KEY   the public half (not secret; stored the same way so all three live in one place)
//        VAPID_SUBJECT      mailto:husseinbdeir@isabisystems.com (the contact push services may write to)
//   3. Prints only the names it set and a short fingerprint of the public key. Nothing secret is printed or
//      written to disk.
//
// After it runs: a Pages secret is read by deployments made AFTER it was set ("it needs to be done before a
// deployment that uses those secrets", Cloudflare Pages Functions bindings docs). The live site keeps running
// without notifications until the next deployment of the app (the next release or `python build/deploy_cloudflare.py`).
// Until then and whenever any of the three settings is missing, the app hides the "Notify me on this device"
// control (an Owner sees "Phone notifications are not set up yet.") and nothing errors.
//
// Safety: it refuses to run when VAPID_PRIVATE_KEY already exists on the project, unless --rotate is given.
// Rotating the key invalidates EVERY device subscription made with the old key: those devices stop receiving
// notifications until the app is opened on them again (the app then re-subscribes silently if notifications
// were allowed) or the person taps "Notify me on this device" again. The server drops old-key rows on its own.
//
// Usage (double-click build\Set-Push-Key.cmd, or):
//   node build/set_push_key.mjs            set the key (refuses if one exists)
//   node build/set_push_key.mjs --check    show which of the three settings exist (no change)
//   node build/set_push_key.mjs --dry-run  show what would happen (no key made, no change)
//   node build/set_push_key.mjs --rotate   replace an existing key (see the warning above)
//   node build/set_push_key.mjs --help
// Needs: Node 18+, wrangler signed in to the Cloudflare account (the same sign-in deploy_cloudflare.py uses).

import { spawnSync } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECT = 'mailto:husseinbdeir@isabisystems.com';
const NAMES = ['VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT'];
const args = new Set(process.argv.slice(2));

function projectName() {
  // wrangler.toml `name` is the Pages project (deploy_cloudflare.py passes --project-name=isabi-systems).
  try {
    const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8'));
    if (m) return m[1];
  } catch (_) {}
  return 'isabi-systems';
}

function wranglerCmd() {
  // Same lookup order as deploy_cloudflare.py: wrangler on PATH, then the per-user install, then npx.
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, 'wrangler' + ext);
      if (dir && fs.existsSync(p)) return { cmd: p, pre: [] };
    }
  }
  const local = path.join(os.homedir(), '.local', 'node', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  if (fs.existsSync(local)) return { cmd: local, pre: [] };
  return { cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx', pre: ['--yes', 'wrangler@4'] };
}

function runWrangler(wargs, input) {
  const w = wranglerCmd();
  const quote = s => (/[\s"]/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s);
  const line = [w.cmd, ...w.pre, ...wargs].map(quote).join(' ');
  const r = spawnSync(line, {
    cwd: ROOT,
    shell: true,
    input: input === undefined ? undefined : input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024
  });
  return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') };
}

function existingNames(project) {
  const r = runWrangler(['pages', 'secret', 'list', `--project-name=${project}`]);
  if (r.code !== 0) {
    console.error('Could not read the project settings from Cloudflare. Is wrangler signed in? (run: wrangler login)');
    console.error((r.err || r.out).split('\n').filter(Boolean).slice(-4).join('\n'));
    process.exit(2);
  }
  const text = r.out + '\n' + r.err;
  return NAMES.filter(n => new RegExp(`(^|[^A-Z0-9_])${n}([^A-Z0-9_]|$)`, 'm').test(text));
}

const b64u = buf => Buffer.from(buf).toString('base64url');

async function mintKeyPair() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
  const pubRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  // Prove the pair before storing it: sign and verify once.
  const probe = new TextEncoder().encode('isabi-vapid-setup');
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, probe);
  if (!(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, sig, probe))) throw new Error('key self-check failed');
  if (pubRaw.length !== 65 || pubRaw[0] !== 4 || Buffer.from(jwk.d, 'base64url').length !== 32) throw new Error('unexpected key format');
  return { privateKey: jwk.d, publicKey: b64u(pubRaw) };
}

function help() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  const end = src.findIndex(l => l.startsWith('import '));
  console.log(src.slice(1, end).map(l => l.replace(/^\/\/ ?/, '')).join('\n').trim());
}

async function main() {
  if (args.has('--help') || args.has('-h') || args.has('/?')) { help(); return; }
  const project = projectName();
  console.log(`ISABI notifications key: Cloudflare Pages project "${project}"`);

  if (args.has('--dry-run')) {
    console.log('Dry run: would read the project settings, make a new P-256 key pair on this PC and store');
    console.log(`  ${NAMES.join(', ')} (subject ${SUBJECT})`);
    console.log('as Pages secrets through wrangler (values on stdin). Nothing was made or changed.');
    console.log('A redeploy of the app is needed afterwards for the settings to take effect.');
    return;
  }

  const have = existingNames(project);
  if (args.has('--check')) {
    for (const n of NAMES) console.log(`  ${n}: ${have.includes(n) ? 'set' : 'missing'}`);
    console.log(have.length === NAMES.length
      ? 'All three are set. If notifications still show "not set up yet", the app has not been redeployed since.'
      : 'Not set up: run this script without --check.');
    return;
  }

  if (have.includes('VAPID_PRIVATE_KEY') && !args.has('--rotate')) {
    console.log('A notifications key already exists on this project. Nothing was changed.');
    console.log('To replace it run with --rotate. Rotating stops notifications on every device until the app is');
    console.log('opened there again (or "Notify me on this device" is tapped again).');
    process.exitCode = 3;
    return;
  }
  if (args.has('--rotate') && have.includes('VAPID_PRIVATE_KEY')) {
    console.log('Rotating: every existing device subscription will stop working until the app is opened on it again.');
  }

  const keys = await mintKeyPair();
  const values = { VAPID_PRIVATE_KEY: keys.privateKey, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_SUBJECT: SUBJECT };
  // Public key and subject first, private key last. A first run that stops half way leaves the private key
  // unset, so the server stays off (it needs all three) and the next run is not refused. A --rotate run that
  // stops half way leaves the new public key with the old private key: the server's pair check then keeps
  // notifications off until --rotate is run again to the end.
  for (const n of ['VAPID_PUBLIC_KEY', 'VAPID_SUBJECT', 'VAPID_PRIVATE_KEY']) {
    const r = runWrangler(['pages', 'secret', 'put', n, `--project-name=${project}`], values[n]);
    if (r.code !== 0) {
      console.error(`Could not store ${n}. Nothing secret was printed. wrangler said:`);
      console.error((r.err || r.out).split('\n').filter(l => l && !l.includes(values[n])).slice(-4).join('\n'));
      process.exit(4);
    }
    console.log(`  stored ${n}`);
  }
  values.VAPID_PRIVATE_KEY = '';
  keys.privateKey = '';
  const fp = createHash('sha256').update(keys.publicKey).digest('hex').slice(0, 12);
  console.log(`Done. Public key fingerprint ${fp}.`);
  console.log('Next: redeploy the app (the next release, or python build/deploy_cloudflare.py). Pages secrets are read');
  console.log('by deployments made after they are set; until then notifications stay off and nothing errors.');
}

main().catch(e => { console.error('Stopped: ' + (e && e.message ? e.message : String(e))); process.exit(1); });
