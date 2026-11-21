// Offline release gate verifying:
// 1. Zero hardcoded canViewHub('books') / canHub('books') calls across isabi-app/js and isabi/functions
// 2. 1:1 parity across 14+ seats (+ null/locked) between Edge security.js getSessionSeatLens and Python server.py get_session_seat_lens
// 3. Deterministic server-side AI payload masking in both Edge gemini.js and Python server.py across EN/AR/FR + handleEdgeAsk/handleEdgeAiEdge
// Run: node build/verify_seat_ai_mask_edge.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionSeatLens, verifyActiveEdgeSession } from '../functions/_lib/security.js';
import { handleEdgeAiEdge, handleEdgeAsk, handleEdgeTts, redactAiPayloadForSeat, redactTextForSeat } from '../functions/_lib/gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ISABI_ROOT = resolve(__dirname, '..');
const ENV_APP_DIR = process.env.ISABI_APP_DIR ? resolve(process.env.ISABI_APP_DIR) : '';
const APP_ROOT = (ENV_APP_DIR && existsSync(resolve(ENV_APP_DIR, 'server.py')))
  ? ENV_APP_DIR
  : (existsSync(resolve(ISABI_ROOT, '../isabi-app/server.py'))
      ? resolve(ISABI_ROOT, '../isabi-app')
      : (existsSync(resolve(ISABI_ROOT, 'app/js')) ? resolve(ISABI_ROOT, 'app') : ''));

let passed = 0;
async function check(label, fn) {
  await Promise.resolve().then(fn);
  passed++;
  console.log(`  PASS  ${label}`);
}

function collectJsFiles(dir, out = []) {
  if (!dir || !existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) collectJsFiles(full, out);
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const PY_BIN = [
  'C:\\Users\\hbdei\\.local\\python312\\python.exe',
  'C:\\Python314\\python.exe',
  'python'
].find(p => p === 'python' || existsSync(p));

async function run() {
  console.log('verify_seat_ai_mask_edge.mjs');

  await check("Static ban: zero canViewHub('books') or canHub('books') calls in client & Edge JS", () => {
    const scanDirs = [
      join(ISABI_ROOT, 'functions'),
      ...(APP_ROOT ? [join(APP_ROOT, 'js')] : [])
    ];
    const files = [];
    for (const d of scanDirs) collectJsFiles(d, files);
    assert.ok(files.length > 0, 'Expected JS files to scan');
    const badCallRe = /\b(?:canViewHub|canHub|canViewHubBaseline|isHubEnabledInPolicy)\s*\(\s*['"`]books['"`]/g;
    const hits = [];
    for (const f of files) {
      const txt = readFileSync(f, 'utf8');
      const m = txt.match(badCallRe);
      if (m && m.length) hits.push({ file: f, count: m.length });
    }
    assert.deepEqual(hits, [], `Found forbidden 'books' hub checks: ${JSON.stringify(hits)}`);
  });

  const TEST_SEATS = [
    { name: 'u1_owner', seat: { id: 'u1', role: 'Full Access (Owner)', pbi_access: 'full', statements_access: 'full', status: 'Active' } },
    { name: 'u2_sup_entry_full', seat: { id: 'u2', role: 'Supervisor + Entry', pbi_access: 'full', statements_access: 'full', status: 'Active' } },
    { name: 'u3_entry_partial', seat: { id: 'u3', role: 'Entry', pbi_access: 'partial', statements_access: 'partial', status: 'Active' } },
    { name: 'u4_entry_none', seat: { id: 'u4', role: 'Entry', pbi_access: 'none', statements_access: 'partial', status: 'Active' } },
    { name: 'u7_supervisor_full', seat: { id: 'u7', role: 'Supervisor', pbi_access: 'full', statements_access: 'full', status: 'Active' } },
    { name: 'u8_sup_entry_partial', seat: { id: 'u8', role: 'Supervisor + Entry', pbi_access: 'partial', statements_access: 'partial', status: 'Active' } },
    { name: 'u10_sales_partial', seat: { id: 'u10', role: 'Sales', pbi_access: 'partial', statements_access: 'full', status: 'Active' } },
    { name: 'viewer_partial', seat: { id: 'v1', role: 'Viewer', pbi_access: 'partial', statements_access: 'partial', status: 'Active' } },
    { name: 'suspended_owner', seat: { id: 's1', role: 'Full Access (Owner)', pbi_access: 'full', statements_access: 'full', status: 'Suspended' } },
    { name: 'demo_visitor_owner', seat: { id: 'd1', role: 'Full Access (Owner)', pbi_access: 'full', statements_access: 'full', status: 'Active', demoVisitor: true } },
    {
      name: 'custom_ops_only',
      seat: {
        id: 'c1', role: 'Custom', pbi_access: 'custom', statements_access: 'custom', status: 'Active',
        custom_perms: JSON.stringify({
          rights: { read_ops: true, read_fin: false, enter_dispatch: true },
          dashboards: { dash_overview: true, dash_financial_gl: false, dash_payroll_hr: false }
        })
      }
    },
    {
      name: 'custom_with_gl',
      seat: {
        id: 'c2', role: 'Custom', pbi_access: 'custom', statements_access: 'custom', status: 'Active',
        custom_perms: JSON.stringify({
          rights: { read_ops: true, read_fin: false },
          dashboards: { dash_overview: true, dash_expenses_vat: true, dash_financial_gl: true }
        })
      }
    },
    {
      name: 'custom_policy_overrides',
      seat: {
        id: 'c3', role: 'Custom', pbi_access: 'full', statements_access: 'full', status: 'Active',
        custom_perms: JSON.stringify({
          rights: { read_ops: true, read_fin: true, enter_accounting: true },
          dashboards: { dash_overview: true, dash_expenses_vat: true, dash_financial_gl: true },
          tables: { jv_distributions: false, salaries: false },
          hubPagesCustomized: true,
          hubPagesSelectAll: false,
          hubs: { cashflow: true, ledger: false, expenses: true, payroll: true, sentinels: false }
        })
      }
    },
    {
      name: 'entry_full_pbi',
      seat: { id: 'u3f', role: 'Entry', pbi_access: 'full', statements_access: 'full', status: 'Active' }
    },
    {
      name: 'locked_owner',
      seat: { id: 'l1', role: 'Full Access (Owner)', pbi_access: 'full', statements_access: 'full', status: 'Active', locked: true }
    },
    {
      name: 'null_seat',
      seat: null
    }
  ];

  await check('15-case security.js getSessionSeatLens matrix assertions & Edge/Python parity', () => {
    const byName = {};
    for (const tc of TEST_SEATS) {
      byName[tc.name] = getSessionSeatLens(tc.seat);
    }
    // Core business invariants per seat
    assert.equal(byName.u1_owner.books, true);
    assert.equal(byName.u1_owner.profit, true);
    assert.equal(byName.u1_owner.tax, true);
    assert.equal(byName.u1_owner.sentinels, true);
    assert.equal(byName.u1_owner.canSignOffSentinels, true);

    assert.equal(byName.u3_entry_partial.cashflow, true);
    assert.equal(byName.u3_entry_partial.books, false);
    assert.equal(byName.u3_entry_partial.profit, false);
    assert.equal(byName.u3_entry_partial.tax, false);
    assert.equal(byName.u3_entry_partial.partnerSplits, false);
    assert.equal(byName.u3_entry_partial.sentinels, false);
    assert.equal(byName.u3_entry_partial.canSignOffSentinels, false);

    assert.equal(byName.entry_full_pbi.sentinels, true);
    assert.equal(byName.entry_full_pbi.canSignOffSentinels, false);

    assert.equal(byName.u8_sup_entry_partial.books, false);
    assert.equal(byName.u8_sup_entry_partial.profit, false);
    assert.equal(byName.u8_sup_entry_partial.tax, true);
    assert.equal(byName.u8_sup_entry_partial.sentinels, false);

    assert.equal(byName.u10_sales_partial.cashflow, false);
    assert.equal(byName.u10_sales_partial.books, false);
    assert.equal(byName.u10_sales_partial.expenses, false);
    assert.equal(byName.u10_sales_partial.profit, false);
    assert.equal(byName.u10_sales_partial.tax, false);
    assert.equal(byName.u10_sales_partial.payrollDollars, false);
    assert.equal(byName.u10_sales_partial.sentinels, false);

    assert.equal(byName.suspended_owner.owner, false);
    assert.equal(byName.suspended_owner.books, false);
    assert.equal(byName.locked_owner.owner, false);
    assert.equal(byName.locked_owner.books, false);
    assert.equal(byName.null_seat.owner, false);
    assert.equal(byName.null_seat.books, false);
    assert.equal(byName.demo_visitor_owner.books, true);
    assert.equal(byName.demo_visitor_owner.tax, false);

    assert.equal(byName.custom_ops_only.books, false);
    assert.equal(byName.custom_ops_only.payrollDollars, false);
    assert.equal(byName.custom_with_gl.tax, true);
    assert.equal(byName.custom_with_gl.books, true);
    assert.equal(byName.custom_with_gl.sentinels, true);
    assert.equal(byName.custom_policy_overrides.books, false);
    assert.equal(byName.custom_policy_overrides.partnerSplits, false);
    assert.equal(byName.custom_policy_overrides.payrollDollars, false);
    assert.equal(byName.custom_policy_overrides.sentinels, false);

    if (APP_ROOT && existsSync(join(APP_ROOT, 'server.py'))) {
      const pyScript = [
        'import json, sys',
        `sys.path.insert(0, ${JSON.stringify(APP_ROOT)})`,
        'import server',
        'seats = json.loads(sys.stdin.read())',
        'out = {t["name"]: server.get_session_seat_lens(t["seat"]) for t in seats}',
        'print(json.dumps(out))'
      ].join('\n');
      const res = spawnSync(PY_BIN, ['-c', pyScript], { input: JSON.stringify(TEST_SEATS), encoding: 'utf8' });
      assert.equal(res.status, 0, `Python parity check failed: ${res.stderr}`);
      const pyOut = JSON.parse(res.stdout);
      assert.deepEqual(pyOut, byName, 'Edge security.js and Python server.py seatLens must match 1:1');
    }
  });

  await check('Deterministic EN/AR/FR + adversarial AI payload redaction across Edge gemini.js & Python server.py', () => {
    const samplePayload = {
      systemPrompt: [
        'Scope: WTC (All Periods)',
        'Operating Profit: $184,250 | Gross Margin: $250,000 (41.2%) | Cash Till: -$4,990.00 | Open AP: $18,400',
        '11% VAT: $9,200 | Partner Pool: $40,000 | Salaries Paid: $22,500',
        'Unreviewed Sentinel Alerts: 4 (S1: Diesel Anomaly; S4: Overdue Credit Lock)',
        'Trial Balance variance for WTC is $0.00 (100% TIED)',
        'All 11 Audit Sentinels Passing',
        'الربح التشغيلي: 184250 دولار | مجمل الربح 250000 دولار | رصيد الصندوق: 4990 دولار | الذمم الدائنة: 18400 دولار | الضوابط الرقابية: 3 تنبيهات',
        "Résultat d'exploitation : 184 250 $ | Marge brute de $250k (41.2%) | Trésorerie : $5,000 | Dettes fournisseurs : 18400 $ | Contrôles Sentinel : 2 alertes",
        '**Operating Profit**: $184,250 | <b>Operating Profit</b>: $184,250 | | Operating Profit | $184,250 |',
        'Résultat d\u2019exploitation : $184,250 | الربح التشغيلي: \u0661\u0668\u0664\u066C\u0662\u0665\u0660 دولار',
        'Fiduciary Cash Held $12,345 | Cash & Bank: $94,321 | Due-From: $51,234 | Net Intercompany: $31,456 | Net Open Payables: $18,400 | Foreign Supplier & Customs AP: $18,400',
        '4 unreviewed Sentinel alerts | S12: Custom Watchdog',
        'Truncated JSON: {"trialbalancevariance": 12.5, "assetnoi": 225750, "vat11": 1925, "sentinelitems": ["S1"]',
        'T1: Shacman active truck schedule'
      ].join('\n'),
      userPrompt: JSON.stringify({
        entity: 'WTC',
        revenueUsd: 605000,
        grossMarginUsd: 250000,
        operatingProfitUsd: 184250,
        cashTillUsd: -4990,
        openReceivablesUsd: 95000,
        activeSentinelFlags: 4,
        leadSentinel: 'S1: Diesel Anomaly',
        apBalance: 18400,
        vatUsd: 9200,
        totalPartnerPool: 40000,
        salariesPaidUsd: 22500
      }),
      prompt: 'Refine bullets: ["WTC Revenue $605,000", "Operating Profit: $184,250 and Cash Till -$4,990.00"]',
      messages: [{ role: 'user', content: 'Open AP: $18,400 | Net Open Payables: $18,400 | Open Receivables: $95,000 | الذمم المدينة: $95,000 | Créances clients : 95 000 $ | Operating Profit: $184,250' }],
      geminiContents: [{ role: 'user', parts: [{ text: 'What was our revenue and dispatched tons yesterday?' }] }]
    };

    const secretLeakRe = /184,?250|184 250|\u0661\u0668\u0664\u066C\u0662\u0665\u0660|250,?000|250k|4,?990|18,?400|95,?000|95 000|40,?000|12,?345|94,?321|51,?234|31,?456|225750|"trialbalancevariance":\s*12\.5|Diesel Anomaly|Overdue Credit Lock|Custom Watchdog|unreviewed Sentinel alerts|All 11 Audit Sentinels Passing|100% TIED/i;

    const ownerLens = getSessionSeatLens(TEST_SEATS[0].seat);
    const ownerRes = redactAiPayloadForSeat(samplePayload, ownerLens);
    assert.equal(ownerRes.guardrail, '');
    assert.equal(ownerRes.systemPrompt, samplePayload.systemPrompt);
    assert.equal(ownerRes.userPrompt, samplePayload.userPrompt);

    for (const key of ['u3_entry_partial', 'u8_sup_entry_partial', 'u10_sales_partial', 'custom_ops_only']) {
      const seatObj = TEST_SEATS.find(x => x.name === key).seat;
      const lens = getSessionSeatLens(seatObj);
      const masked = redactAiPayloadForSeat(samplePayload, lens);
      assert.ok(masked.guardrail.includes('MANDATORY SEAT PERMISSION GUARDRAIL'), `guardrail missing for ${key}`);
      const msgTxt = (masked.messages || []).map(m => m.content || '').join('\n');
      const joined = `${masked.systemPrompt}\n${masked.userPrompt}\n${masked.prompt}\n${msgTxt}`;
      assert.ok(!secretLeakRe.test(joined), `Secret figure leaked for ${key}: ${joined}`);
      assert.ok(msgTxt.includes('Restricted'), `Expected messages redaction for ${key}`);
      if (!lens.tax) {
        assert.ok(!/1925|9,?200/.test(joined), `VAT figure leaked for ${key}: ${joined}`);
      }
      assert.ok(joined.includes('T1: Shacman active truck schedule'), `Benign operational line damaged for ${key}`);
      assert.ok(masked.geminiContents[0].parts[0].text === 'What was our revenue and dispatched tons yesterday?', `Plain user question mangled for ${key}`);
      assert.ok(joined.includes('605000') || joined.includes('605,000'), `Permitted revenue should remain for ${key}`);

      const parsedUserJson = JSON.parse(masked.userPrompt);
      assert.equal(parsedUserJson.revenueUsd, 605000);
      assert.equal(parsedUserJson.operatingProfitUsd, 'Restricted');
      assert.equal(parsedUserJson.cashTillUsd, 'Restricted');
      assert.equal(parsedUserJson.openReceivablesUsd, 'Restricted');
      assert.equal(parsedUserJson.apBalance, 'Restricted');
      assert.equal(parsedUserJson.activeSentinelFlags, 'Restricted');
      assert.equal(parsedUserJson.leadSentinel, 'Restricted');
      if (!lens.tax) assert.equal(parsedUserJson.vatUsd, 'Restricted');
      assert.equal(parsedUserJson.totalPartnerPool, 'Restricted');
    }

    if (APP_ROOT && existsSync(join(APP_ROOT, 'server.py'))) {
      const pyScript = [
        'import json, sys',
        `sys.path.insert(0, ${JSON.stringify(APP_ROOT)})`,
        'import server',
        'inp = json.loads(sys.stdin.read())',
        'out = {}',
        'for tc in inp["seats"]:',
        '    lens = server.get_session_seat_lens(tc["seat"])',
        '    out[tc["name"]] = server.redact_ai_payload_for_seat(inp["payload"], lens)',
        'print(json.dumps(out))'
      ].join('\n');
      const res = spawnSync(PY_BIN, ['-c', pyScript], {
        input: JSON.stringify({ seats: TEST_SEATS.filter(x => ['u1_owner', 'u3_entry_partial', 'u8_sup_entry_partial', 'u10_sales_partial'].includes(x.name)), payload: samplePayload }),
        encoding: 'utf8'
      });
      assert.equal(res.status, 0, `Python redaction test failed: ${res.stderr}`);
      const pyMasked = JSON.parse(res.stdout);
      for (const k of ['u3_entry_partial', 'u8_sup_entry_partial', 'u10_sales_partial']) {
        const msgPy = (pyMasked[k].messages || []).map(m => m.content || '').join('\n');
        const j = `${pyMasked[k].systemPrompt}\n${pyMasked[k].userPrompt}\n${pyMasked[k].prompt}\n${msgPy}`;
        assert.ok(!secretLeakRe.test(j), `Python secret figure leaked for ${k}: ${j}`);
        assert.ok(msgPy.includes('Restricted'), `Python must redact messages for ${k}`);
        assert.ok(j.includes('T1: Shacman active truck schedule'), `Python damaged benign T1 line for ${k}`);
        if (k !== 'u8_sup_entry_partial') assert.ok(!/1925|9,?200/.test(j), `Python VAT leaked for ${k}`);
        const pj = JSON.parse(pyMasked[k].userPrompt);
        assert.equal(pj.operatingProfitUsd, 'Restricted');
        assert.equal(pj.cashTillUsd, 'Restricted');
        assert.equal(pj.apBalance, 'Restricted');
        assert.equal(pj.activeSentinelFlags, 'Restricted');
      }
      assert.equal(pyMasked.u1_owner.systemPrompt, samplePayload.systemPrompt);
    }
  });

  await check('handleEdgeAsk & handleEdgeAiEdge outbound Gemini gating (unauth vs X-ISABI-Demo vs Entry)', async () => {
    const captured = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      captured.push({ url, body: JSON.parse(init && init.body ? init.body : '{}') });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"conversational":true,"title":"OK","answer":"Done","voiceSummary":"Done","headers":[],"rows":[],"total":[],"followUps":[]}' }] } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const env = { GEMINI_API_KEY: 'test-key' };
    try {
      const sampleSys = 'Scope: WTC | Total Sales: $605,000 | Operating Profit: $184,250 | Open AP: $18,400 | Net Open Payables: $18,400 | 11% VAT: $9,200 | S12: Custom Watchdog | {"vat11": 1925}';
      const sampleEdgePrompt = 'Revenue $605,000 | Operating Profit: $184,250 | Foreign Supplier & Customs AP: $18,400 | 11% VAT: $9,200 | T1: Shacman truck';

      // 1) Unauthenticated Command Center /app/api/ask WITHOUT X-ISABI-Demo -> fail-closed all-false lens
      captured.length = 0;
      const askNoDemo = await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.1' } }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: sampleSys, geminiContents: [{ role: 'user', parts: [{ text: 'Sales summary?' }] }] },
        null,
        null
      );
      assert.equal(askNoDemo.status, 200);
      assert.equal(captured.length, 1);
      const outNoDemo = JSON.stringify(captured[0].body);
      assert.ok(outNoDemo.includes('MANDATORY SEAT PERMISSION GUARDRAIL'), 'Unauth non-demo /ask must include full guardrail');
      assert.ok(!/184,?250|9,?200|1925|Custom Watchdog/.test(outNoDemo), `Unauth non-demo /ask leaked: ${outNoDemo}`);

      // 2) Unauthenticated /app/api/ask WITH X-ISABI-Demo: 1 -> Demo non-tax allowed, VAT masked
      captured.length = 0;
      const askDemo = await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.2', 'X-ISABI-Demo': '1' } }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: sampleSys, geminiContents: [{ role: 'user', parts: [{ text: 'Demo summary?' }] }] },
        null,
        null
      );
      assert.equal(askDemo.status, 200);
      assert.equal(captured.length, 1);
      const outDemo = JSON.stringify(captured[0].body);
      assert.ok(outDemo.includes('184,250'), 'Demo visitor /ask should retain non-tax Demo figures');
      assert.ok(!/9,?200|1925/.test(outDemo), `Demo visitor /ask leaked VAT: ${outDemo}`);

      // 3) /app/api/ai-edge unauth without vs with X-ISABI-Demo: 1
      captured.length = 0;
      await handleEdgeAiEdge(
        new Request('https://isabisystems.com/app/api/ai-edge', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.3' } }),
        env,
        { task: 'root_cause_brief', prompt: sampleEdgePrompt },
        null
      );
      const edgeNoDemo = JSON.stringify(captured[0].body);
      assert.ok(!/184,?250|9,?200/.test(edgeNoDemo), `Unauth non-demo /ai-edge leaked: ${edgeNoDemo}`);
      assert.ok(edgeNoDemo.includes('T1: Shacman truck'));

      captured.length = 0;
      await handleEdgeAiEdge(
        new Request('https://isabisystems.com/app/api/ai-edge', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.4', 'X-ISABI-Demo': '1' } }),
        env,
        { task: 'root_cause_brief', prompt: sampleEdgePrompt },
        null
      );
      const edgeDemo = JSON.stringify(captured[0].body);
      assert.ok(edgeDemo.includes('184,250'), 'Demo /ai-edge should retain non-tax Demo figures');
      assert.ok(!/9,?200/.test(edgeDemo), `Demo /ai-edge leaked VAT: ${edgeDemo}`);

      // 4) Authenticated Entry (u3) on both /app/api/ask and /app/api/ai-edge
      const u3Session = Object.assign({ sub: 'u3' }, TEST_SEATS.find(x => x.name === 'u3_entry_partial').seat);
      captured.length = 0;
      await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.5' } }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: sampleSys, geminiContents: [{ role: 'user', parts: [{ text: 'Yesterday loads?' }] }] },
        null,
        u3Session
      );
      const u3MsgAsk = await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.5' } }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: sampleSys, messages: [{ role: 'user', content: 'Net Open Payables: $18,400 | Cash Till: -$4,990.00' }] },
        null,
        u3Session
      );
      assert.equal(u3MsgAsk.status, 200, 'Authed /api/ask with messages[] array must succeed cleanly');
      await handleEdgeAiEdge(
        new Request('https://isabisystems.com/app/api/ai-edge', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.6' } }),
        env,
        { task: 'root_cause_brief', prompt: sampleEdgePrompt },
        u3Session
      );
      assert.equal(captured.length, 3);
      for (const req of captured) {
        const sOut = JSON.stringify(req.body);
        assert.ok(!/184,?250|18,?400|4,?990|9,?200|1925|Custom Watchdog/.test(sOut), `Authed Entry edge leaked: ${sOut}`);
      }

      // 5) Presented dead/suspended cookie + X-ISABI-Demo: 1 -> 401 without calling Gemini
      captured.length = 0;
      const suspAskDemo = await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.7', 'Cookie': 'isabi_edge_sess=deadbeef', 'X-ISABI-Demo': '1' }
        }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: sampleSys, geminiContents: [{ role: 'user', parts: [{ text: 'Bypass test' }] }] },
        null,
        null
      );
      const suspEdgeDemo = await handleEdgeAiEdge(
        new Request('https://isabisystems.com/app/api/ai-edge', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.8', 'Cookie': 'isabi_edge_sess=deadbeef', 'X-ISABI-Demo': '1' }
        }),
        env,
        { task: 'root_cause_brief', prompt: sampleEdgePrompt },
        null
      );
      assert.equal(suspAskDemo.status, 401);
      assert.equal(suspEdgeDemo.status, 401);
      assert.equal(captured.length, 0);

      // 6) Cross-origin X-ISABI-Demo: 1 -> 403 without calling Gemini
      captured.length = 0;
      const xOrigAsk = await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.9', 'Origin': 'https://evil.example', 'X-ISABI-Demo': '1' }
        }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: sampleSys, geminiContents: [{ role: 'user', parts: [{ text: 'Evil origin' }] }] },
        null,
        null
      );
      const xOrigEdge = await handleEdgeAiEdge(
        new Request('https://isabisystems.com/app/api/ai-edge', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.10', 'Origin': 'https://evil.example', 'X-ISABI-Demo': '1' }
        }),
        env,
        { task: 'root_cause_brief', prompt: sampleEdgePrompt },
        null
      );
      assert.equal(xOrigAsk.status, 403);
      assert.equal(xOrigEdge.status, 403);
      assert.equal(captured.length, 0);

      // 7) getSessionSeatLens roleTabPolicies parity + empty-dict policy & >=26000 char guardrail slicing checks
      const rtpLensEdge = getSessionSeatLens(
        { role: 'Entry', pbi_access: 'partial', statements_access: 'partial' },
        { Entry: { customized: true, hubs: { cashflow: false, expenses: false }, pages: {} } }
      );
      assert.equal(rtpLensEdge.cashflow, false);
      assert.equal(rtpLensEdge.expenses, false);
      assert.equal(rtpLensEdge.books, false);

      const emptyPolEntry = {
        role: 'Entry', pbi_access: 'partial', statements_access: 'partial', status: 'Active',
        roleTabPolicies: { Entry: { customized: true, selectAll: true, hubs: {}, pages: {} } }
      };
      const emptyPolCustom = {
        role: 'Custom', pbi_access: 'custom', statements_access: 'custom', status: 'Active',
        custom_perms: JSON.stringify({ rights: { read_ops: true, read_fin: false }, dashboards: {}, hubPagesCustomized: true, hubPagesSelectAll: true, hubs: {}, pages: {} })
      };
      const edgeEmptyEntry = getSessionSeatLens(emptyPolEntry);
      const edgeEmptyCustom = getSessionSeatLens(emptyPolCustom);
      assert.equal(edgeEmptyEntry.books, true, 'Empty hubs/pages with customized selectAll:true must still activate in Edge');
      assert.equal(edgeEmptyCustom.books, true, 'Empty hubs/pages with hubPagesCustomized & hubPagesSelectAll:true must still activate in Edge');
      if (APP_ROOT && existsSync(join(APP_ROOT, 'server.py'))) {
        const pyEmptyRes = spawnSync(PY_BIN, [
          '-c',
          `import json, sys; sys.path.insert(0, ${JSON.stringify(APP_ROOT)}); import server; inp=json.loads(sys.stdin.read()); print(json.dumps({"e": server.get_session_seat_lens(inp["e"]), "c": server.get_session_seat_lens(inp["c"])}))`
        ], { input: JSON.stringify({ e: emptyPolEntry, c: emptyPolCustom }), encoding: 'utf8' });
        assert.equal(pyEmptyRes.status, 0, `Python empty-dict policy parity check failed: ${pyEmptyRes.stderr}`);
        const pyEmpty = JSON.parse(pyEmptyRes.stdout);
        assert.deepEqual(pyEmpty.e, edgeEmptyEntry, 'Empty roleTabPolicies Entry must match 1:1 between Edge and Python');
        assert.deepEqual(pyEmpty.c, edgeEmptyCustom, 'Empty custom_perms Custom must match 1:1 between Edge and Python');
      }

      // Long systemPrompt (>= 27000 chars) must keep MANDATORY SEAT PERMISSION GUARDRAIL at head after 26000 slicing
      captured.length = 0;
      const longSysPrompt = sampleSys + '\n' + 'Operational note line. '.repeat(1300);
      assert.ok(longSysPrompt.length > 27000);
      const longResp = await handleEdgeAsk(
        new Request('https://isabisystems.com/app/api/ask', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.11' } }),
        env,
        { surface: 'command', tier: 'fast', systemPrompt: longSysPrompt, geminiContents: [{ role: 'user', parts: [{ text: 'Long prompt check' }] }] },
        null,
        u3Session
      );
      assert.equal(longResp.status, 200);
      assert.equal(captured.length, 1);
      const longOutSys = String((captured[0].body.systemInstruction && captured[0].body.systemInstruction.parts && captured[0].body.systemInstruction.parts[0] && captured[0].body.systemInstruction.parts[0].text) || '');
      assert.ok(longOutSys.startsWith('MANDATORY SEAT PERMISSION GUARDRAIL'), 'Guardrail must be prepended so 26k slicing never drops it');
      assert.ok(longOutSys.length <= 26000, `Expected <=26000 chars after slicing, got ${longOutSys.length}`);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  await check('handleEdgeTts redaction & verifyActiveEdgeSession DB/KV boundary guards', async () => {
    const ttsCaptured = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      ttsCaptured.push({ url, body: JSON.parse(init && init.body ? init.body : '{}') });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAA' } }] } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const env = { GEMINI_API_KEY: 'test-key' };
    const ttsSample = 'Revenue $605,000 | Operating Profit: $184,250 | Cash Till: -$4,990.00 | 11% VAT: $9,200 | S1: Diesel Anomaly';
    try {
      // Stale/dead Authorization header + X-ISABI-Demo: 1 on /api/tts with null session -> 401 fail-closed
      ttsCaptured.length = 0;
      const deadCredTts = await handleEdgeTts(
        new Request('https://isabisystems.com/app/api/tts', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.30', 'Authorization': 'Bearer expired-token', 'X-ISABI-Demo': '1' }
        }),
        env,
        { text: ttsSample },
        null
      );
      assert.equal(deadCredTts.status, 401);
      assert.equal(ttsCaptured.length, 0);

      // Cross-origin X-ISABI-Demo: 1 on /api/tts -> 403
      ttsCaptured.length = 0;
      const xOrigTts = await handleEdgeTts(
        new Request('https://isabisystems.com/app/api/tts', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '198.51.100.31', 'Origin': 'https://evil.example', 'X-ISABI-Demo': '1' }
        }),
        env,
        { text: ttsSample },
        null
      );
      assert.equal(xOrigTts.status, 403);
      assert.equal(ttsCaptured.length, 0);

      // Unauth non-demo /app/api/tts -> fail-closed mask
      ttsCaptured.length = 0;
      const unauthTts = await handleEdgeTts(
        new Request('https://isabisystems.com/app/api/tts', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.32' } }),
        env,
        { text: ttsSample },
        null
      );
      assert.equal(unauthTts.status, 200);
      assert.equal(ttsCaptured.length, 1);
      const unauthTxt = JSON.stringify(ttsCaptured[0].body);
      assert.ok(!/184,?250|4,?990|9,?200|Diesel Anomaly/.test(unauthTxt), `Unauth TTS leaked: ${unauthTxt}`);
      assert.ok(unauthTxt.includes('605,000'));

      // Same-origin X-ISABI-Demo: 1 /app/api/tts -> retains Demo non-tax, masks VAT
      ttsCaptured.length = 0;
      const demoTts = await handleEdgeTts(
        new Request('https://isabisystems.com/app/api/tts', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.33', 'X-ISABI-Demo': '1' } }),
        env,
        { text: ttsSample },
        null
      );
      assert.equal(demoTts.status, 200);
      const demoTxt = JSON.stringify(ttsCaptured[0].body);
      assert.ok(demoTxt.includes('184,250'), 'Demo TTS should retain non-tax Demo figures');
      assert.ok(!/9,?200/.test(demoTxt), `Demo TTS leaked VAT: ${demoTxt}`);

      // Authed Entry (u3) /app/api/tts -> masks profit, cash till, VAT, Sentinels
      ttsCaptured.length = 0;
      const u3Sess = Object.assign({ sub: 'u3' }, TEST_SEATS.find(x => x.name === 'u3_entry_partial').seat);
      const u3Tts = await handleEdgeTts(
        new Request('https://isabisystems.com/app/api/tts', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.34' } }),
        env,
        { text: ttsSample },
        u3Sess
      );
      assert.equal(u3Tts.status, 200);
      const u3Txt = JSON.stringify(ttsCaptured[0].body);
      assert.ok(!/184,?250|4,?990|9,?200|Diesel Anomaly/.test(u3Txt), `Authed Entry TTS leaked: ${u3Txt}`);
      assert.ok(u3Txt.includes('605,000'));
    } finally {
      globalThis.fetch = origFetch;
    }

    const makeMockDb = (opts = {}) => ({
      prepare(sql) {
        const exec = {
          async first() {
            if (/FROM auth_sessions/i.test(sql)) return opts.hasSession ? { id: 'sid-1' } : null;
            if (/SELECT \* FROM users/i.test(sql)) return opts.userRow ?? null;
            if (/SELECT 1 AS ok FROM users/i.test(sql)) return opts.anyUser ? { ok: 1 } : null;
            if (/role_tab_policies/i.test(sql)) return opts.rtpJson != null ? { payload_json: opts.rtpJson } : null;
            if (/mfg_web_store/i.test(sql)) return opts.storeJson != null ? { payload_json: opts.storeJson } : null;
            return null;
          },
          bind() { return this; }
        };
        return exec;
      }
    });
    const baseSess = { sub: 'u3', email: 'entry-seat@example.com', sid: 'sid-1', role: 'Entry', companies: 'WTC' };

    // Empty '{}' role_tab_policies must fall through to mfg_web_store.roleTabPolicies
    const fallbackSess = await verifyActiveEdgeSession(baseSess, {
      DB: makeMockDb({
        hasSession: true,
        userRow: { id: 'u3', status: 'Active', role: 'Entry', companies: 'WTC', pbi_access: 'partial', statements_access: 'partial', custom_perms: '' },
        rtpJson: '{}',
        storeJson: JSON.stringify({ roleTabPolicies: { Entry: { customized: true, hubs: { cashflow: false }, pages: {} } } })
      })
    });
    assert.ok(fallbackSess && fallbackSess.roleTabPolicies && fallbackSess.roleTabPolicies.Entry && fallbackSess.roleTabPolicies.Entry.hubs.cashflow === false);
    assert.equal(getSessionSeatLens(fallbackSess).cashflow, false);

    // Lowercase suspended, locked, kioskLocked, and deleted user with non-empty users table must fail closed
    assert.equal(await verifyActiveEdgeSession(baseSess, { DB: makeMockDb({ hasSession: true, userRow: { id: 'u3', status: 'suspended', role: 'Entry' } }) }), null);
    assert.equal(await verifyActiveEdgeSession(baseSess, { DB: makeMockDb({ hasSession: true, userRow: { id: 'u3', status: 'Active', role: 'Entry', locked: 1 } }) }), null);
    assert.equal(await verifyActiveEdgeSession(baseSess, { DB: makeMockDb({ hasSession: true, userRow: { id: 'u3', status: 'Active', role: 'Entry', kioskLocked: true } }) }), null);
    assert.equal(await verifyActiveEdgeSession(baseSess, { DB: makeMockDb({ hasSession: true, userRow: null, anyUser: true }) }), null);
    assert.ok(await verifyActiveEdgeSession(baseSess, { DB: makeMockDb({ hasSession: true, userRow: null, anyUser: false }) }));
  });

  console.log(`\n[verify_seat_ai_mask_edge] ALL PASSED (${passed} checks)`);
}

run().catch(err => {
  console.error('verify_seat_ai_mask_edge FAILED:', err);
  process.exit(1);
});
