// Gate for the Edge telematics bridge cache (functions/_lib/telematics.js), v19.6.393.
// Runs offline: the GPS provider and D1 are stubbed, the clock is simulated.
// Checks: 8 s shared position cache, fresh=1 (Refresh GPS) floor of 3 s, a D1 copy
// is aged from its upstream read (not re-aged per isolate), 5 min geofence cache,
// last-known positions flagged stale on outage (memory or D1), 5 s retry back-off,
// and server_now on every snapshot reply.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LIB = pathToFileURL(path.resolve(import.meta.dirname, '..', 'functions', '_lib', 'telematics.js')).href;
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? ' :: ' + detail : ''}`); };

let T = Date.parse('2026-11-18T12:00:00Z');
const realNow = Date.now;
Date.now = () => T;

let mode = 'ok';
let gfMode = 'ok';
let releaseHang = null;
const calls = { devices: 0, geofences: 0, login: 0 };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/get_devices')) {
    calls.devices++;
    if (mode === 'fail') return new Response('upstream down', { status: 503 });
    if (mode === 'throw') { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
    if (mode === 'hang') await new Promise(r => { releaseHang = r; });
    const item = {
      id: 19130, name: 'TB1', lat: 33.84, lng: 35.49, speed: 42, course: 10, online: 'online',
      time: '18-11-2026 02:00:00 PM', timestamp: Math.floor(T / 1000) - 4, stop_duration: '0s',
      other: '<info><io87>40619000</io87><di1>1</di1><power>28.3</power></info>', sensors: []
    };
    return new Response(JSON.stringify([{ items: [item] }]), { status: 200 });
  }
  if (u.includes('/get_geofences')) {
    calls.geofences++;
    if (gfMode === 'fail') return new Response('gf down', { status: 503 });
    return new Response(JSON.stringify({ items: { geofences: [{ id: 1, name: 'Yard', coordinates: '[]' }] } }), { status: 200 });
  }
  if (u.includes('/login')) { calls.login++; return new Response('{}', { status: 401 }); }
  return new Response('{}', { status: 404 });
};

const db = {
  row: null,
  prepare(sql) {
    return {
      bind(...a) {
        return {
          first: async () => (/^SELECT/i.test(sql) ? db.row : null),
          run: async () => { if (/^INSERT/i.test(sql)) db.row = { payload_json: a[1], updated_at: a[2] }; }
        };
      }
    };
  }
};
const env = { VT_GPS_API_HASH: 'test-hash', DB: db };
const session = { sub: 'u1', role: 'Owner', companies: '*' };

let isoSeq = 0;
const newIsolate = async () => (await import(`${LIB}?iso=${++isoSeq}`)).handleTelematics;
async function snap(handle, fresh = false) {
  const href = `https://isabisystems.com/app/api/telematics?action=snapshot${fresh ? '&fresh=1' : ''}`;
  const res = await handle(new Request(href), env, session, new URL(href));
  return { status: res.status, j: await res.json() };
}
const at = s => { T = Date.parse('2026-11-18T12:00:00Z') + s * 1000; };

try {
  let h = await newIsolate();

  at(0);
  let r = await snap(h);
  check('cold read goes upstream once (positions + geofences)', calls.devices === 1 && calls.geofences === 1 && r.status === 200 && r.j.units.length === 1, JSON.stringify(calls));
  check('reply carries server_now and stale=false', Boolean(Date.parse(r.j.server_now)) && r.j.stale === false);
  check('snapshot written to the shared D1 cache with geofences_at', Boolean(db.row && JSON.parse(db.row.payload_json).geofences_at));

  at(5); await snap(h);
  check('5 s later: served from cache (8 s TTL)', calls.devices === 1);
  at(9); await snap(h);
  check('9 s later: positions re-read, geofences kept (5 min cache)', calls.devices === 2 && calls.geofences === 1, JSON.stringify(calls));

  at(10); await snap(h, true);
  check('Refresh GPS 1 s after a read: cache kept (3 s floor)', calls.devices === 2);
  at(13); await snap(h, true);
  check('Refresh GPS 4 s after a read: positions re-read', calls.devices === 3);

  // Another isolate shares D1: a 2 s old copy is used and aged from its upstream read.
  h = await newIsolate();
  at(15); await snap(h);
  check('new isolate: 2 s old D1 copy used, no upstream call', calls.devices === 3);
  at(22); await snap(h);
  check('new isolate: copy aged from upstream read (9 s), re-read; geofences seeded from D1', calls.devices === 4 && calls.geofences === 1, JSON.stringify(calls));

  // Outage: last-known positions, flagged stale, with a 5 s back-off.
  mode = 'fail';
  at(40); r = await snap(h);
  check('outage: last positions served, stale=true, HTTP 200', r.status === 200 && r.j.stale === true && r.j.units.length === 1 && calls.devices === 5, JSON.stringify({ s: r.status, stale: r.j.stale, calls }));
  at(42); r = await snap(h);
  check('outage: no new provider call within 5 s back-off', calls.devices === 5 && r.j.stale === true);
  at(46); await snap(h);
  check('outage: provider retried after back-off', calls.devices === 6);

  // Cold isolate during an outage falls back to the old D1 copy instead of 502.
  h = await newIsolate();
  at(120); r = await snap(h);
  check('cold isolate + outage: old D1 copy served stale (not 502)', r.status === 200 && r.j.stale === true && r.j.units.length === 1, JSON.stringify({ s: r.status, stale: r.j.stale }));

  // Recovery, then geofence cache expiry.
  mode = 'ok';
  at(130); r = await snap(h);
  check('recovery: fresh read, stale=false', r.j.stale === false);
  const gfBefore = calls.geofences;
  at(400); await snap(h);
  check('geofences re-read after 5 min', calls.geofences === gfBefore + 1, JSON.stringify(calls));

  // Provider call that throws (timeout / AbortError): last-known, stale, HTTP 200.
  h = await newIsolate();
  mode = 'throw';
  at(500); r = await snap(h);
  check('thrown provider call (AbortError): last-known served stale, HTTP 200', r.status === 200 && r.j.stale === true && r.j.units.length === 1, JSON.stringify({ s: r.status, stale: r.j.stale }));

  // Five polls while one provider call hangs: exactly one provider call.
  mode = 'hang';
  h = await newIsolate();
  at(600);
  const devBefore = calls.devices;
  const burst = [snap(h), snap(h), snap(h), snap(h), snap(h)];
  for (let i = 0; i < 50 && !releaseHang; i++) await new Promise(res => setTimeout(res, 5));
  await new Promise(res => setTimeout(res, 20));
  const devDuring = calls.devices - devBefore;
  mode = 'ok';
  if (releaseHang) releaseHang();
  const burstRes = await Promise.all(burst);
  check('5 polls during a hanging provider call: 1 provider call, all HTTP 200', devDuring === 1 && burstRes.every(x => x.status === 200 && x.j.units.length === 1), JSON.stringify({ devDuring, statuses: burstRes.map(x => x.status) }));

  // A failed geofence read must not blank zones in other isolates.
  db.row = null;
  gfMode = 'fail';
  h = await newIsolate();
  at(700); await snap(h);
  const savedGfAt = db.row ? JSON.parse(db.row.payload_json).geofences_at : 'none';
  gfMode = 'ok';
  h = await newIsolate();
  at(710);
  const gfBefore2 = calls.geofences;
  await snap(h);
  check('row from a failed geofence read has no geofences_at and is not used as a geofence cache', savedGfAt === '' && calls.geofences === gfBefore2 + 1, JSON.stringify({ savedGfAt, gf: calls.geofences - gfBefore2 }));
} catch (err) {
  check('harness', false, err && err.stack ? err.stack : String(err));
} finally {
  Date.now = realNow;
}

const failed = results.filter(x => !x).length;
console.log(`\nVERIFY_TELEMATICS_EDGE_CACHE ${failed ? 'FAILED' : 'ALL GREEN'} · ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
