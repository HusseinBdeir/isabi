// Offline verification of ISABI semantic AI tier routing, Gemini 4 thinkingConfig hygiene,
// Edge JS / local Python parity, and client zero-hardcoded-model hygiene. Zero network calls.
// Run: node build/verify_gemini_tier_routing.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGeminiThinkingConfig,
  extractCandidateText,
  handleEdgeAiEdge,
  handleEdgeAsk,
  handleEdgeSmartScan,
  handleEdgeTts,
  resolveGeminiTierModel
} from '../functions/_lib/gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ISABI_ROOT = resolve(__dirname, '..');
const APP_ROOT = existsSync(resolve(ISABI_ROOT, '../isabi-app/server.py'))
  ? resolve(ISABI_ROOT, '../isabi-app')
  : (existsSync(resolve(ISABI_ROOT, 'app/js')) ? resolve(ISABI_ROOT, 'app') : '');

let passed = 0;
function check(label, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed++;
    console.log(`  PASS  ${label}`);
  });
}

async function run() {
  console.log('verify_gemini_tier_routing.mjs');

  await check('resolveGeminiTierModel maps default authed tiers correctly', () => {
    assert.deepEqual(
      resolveGeminiTierModel({}, { tier: 'fast', isAuthed: true }),
      { model: 'gemini-3.5-flash-lite', intentTier: 'fast' }
    );
    assert.deepEqual(
      resolveGeminiTierModel({}, { tier: 'deep', isAuthed: true }),
      { model: 'gemini-4-hydrogen', intentTier: 'deep' }
    );
    assert.deepEqual(
      resolveGeminiTierModel({}, { tier: 'vision', isAuthed: true }),
      { model: 'gemini-4-hydrogen', intentTier: 'vision' }
    );
    assert.deepEqual(
      resolveGeminiTierModel({}, { tier: 'tts', defaultTier: 'tts', isAuthed: true }),
      { model: 'gemini-3.8-flash-lite-tts', intentTier: 'tts' }
    );
  });

  await check('resolveGeminiTierModel respects env overrides & allowlists', () => {
    const env = {
      ISABI_GEMINI_LITE_MODEL: 'gemini-2.5-flash-lite',
      ISABI_GEMINI_MODEL: 'gemini-4-argon',
      ISABI_GEMINI_VISION_MODEL: 'gemini-4-hydrogen',
      ISABI_GEMINI_TTS_MODEL: 'gemini-3.8-flash-tts'
    };
    assert.equal(resolveGeminiTierModel(env, { tier: 'fast', isAuthed: true }).model, 'gemini-2.5-flash-lite');
    assert.equal(resolveGeminiTierModel(env, { tier: 'deep', isAuthed: true }).model, 'gemini-4-argon');
    assert.equal(resolveGeminiTierModel(env, { tier: 'vision', isAuthed: true }).model, 'gemini-4-hydrogen');
    assert.equal(resolveGeminiTierModel(env, { tier: 'tts', defaultTier: 'tts', isAuthed: true }).model, 'gemini-3.8-flash-tts');
    // Unlisted override safely falls back to default
    const badEnv = { ISABI_GEMINI_MODEL: 'gemini-unapproved-99' };
    assert.equal(resolveGeminiTierModel(badEnv, { tier: 'deep', isAuthed: true }).model, 'gemini-4-hydrogen');
  });

  await check('resolveGeminiTierModel supports legacy explicit model callers & locks unauthed', () => {
    assert.deepEqual(
      resolveGeminiTierModel({}, { reqModel: 'gemini-3.8-flash', isAuthed: true }),
      { model: 'gemini-3.8-flash', intentTier: 'fast' }
    );
    assert.deepEqual(
      resolveGeminiTierModel({}, { tier: 'deep', reqModel: 'gemini-4-argon', isAuthed: false, defaultTier: 'fast' }),
      { model: 'gemini-3.5-flash-lite', intentTier: 'fast' }
    );
    // Non-TTS endpoints ignore tier='tts' so they never send responseMimeType=application/json to TTS models
    assert.deepEqual(
      resolveGeminiTierModel({}, { tier: 'tts', defaultTier: 'deep', isAuthed: true }),
      { model: 'gemini-4-hydrogen', intentTier: 'deep' }
    );
  });

  await check('applyGeminiThinkingConfig emits only LOW|MEDIUM & headroom for gemini-4-*', () => {
    const deepCfg = applyGeminiThinkingConfig({ maxOutputTokens: 900 }, 'gemini-4-hydrogen', 'deep', {}, true);
    assert.deepEqual(deepCfg.thinkingConfig, { thinkingLevel: 'MEDIUM' });
    assert.ok(deepCfg.maxOutputTokens >= 2500);
    assert.equal('thinkingBudget' in deepCfg.thinkingConfig, false);

    const visCfg = applyGeminiThinkingConfig({ maxOutputTokens: 1024 }, 'gemini-4-hydrogen', 'vision', {}, true);
    assert.deepEqual(visCfg.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.ok(visCfg.maxOutputTokens >= 2500);

    // Unauthed Gemini 4 stays LOW + >=1400 headroom even if caller tries MEDIUM or thinkingBudget
    const unauthCfg = applyGeminiThinkingConfig(
      { maxOutputTokens: 850 },
      'gemini-4-hydrogen',
      'vision',
      { thinkingLevel: 'MEDIUM', thinkingBudget: 2048 },
      false
    );
    assert.deepEqual(unauthCfg.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.ok(unauthCfg.maxOutputTokens >= 1400);

    // Legacy 3.8 uses clamped thinkingBudget
    const legCfg = applyGeminiThinkingConfig({ maxOutputTokens: 900 }, 'gemini-3.8-flash', 'deep', { thinkingBudget: 9999 }, true, 1024);
    assert.deepEqual(legCfg.thinkingConfig, { thinkingBudget: 1024 });
  });

  await check('extractCandidateText skips thought=true parts and returns final answer text', () => {
    const txt = extractCandidateText({
      candidates: [{
        content: {
          parts: [
            { text: 'internal chain of thought', thought: true },
            { text: '   ' },
            { text: '{"answer":"Total is $13,400"}' }
          ]
        }
      }]
    });
    assert.equal(txt, '{"answer":"Total is $13,400"}');
  });

  await check('Edge handlers route Ask / SmartScan / AiEdge / TTS & lock Showcase vs Audio', async () => {
    const calls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body || '{}');
      calls.push({ url: String(url), payload });
      if (String(url).includes('tts')) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAAA' } }] } }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [
          { text: 'reasoning', thought: true },
          { text: '{"title":"OK","answer":"Done","total":13400}' }
        ] } }]
      }), { status: 200 });
    };

    try {
      const env = { GEMINI_API_KEY: 'test-key-offline' };
      const ctx = { waitUntil() {} };
      const req = (path, ip) => new Request(`https://isabisystems.com${path}`, {
        method: 'POST',
        headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }
      });

      // 1. Authed deep Ask -> gemini-4-hydrogen + thinkingLevel MEDIUM
      let r = await handleEdgeAsk(req('/api/ask', '198.51.100.1'), env, { tier: 'deep', q: 'Margin risk?' }, ctx, { sub: 'ceo' });
      let j = await r.json();
      assert.equal(j.ok, true);
      assert.ok(calls.at(-1).url.includes('/models/gemini-4-hydrogen:generateContent'));
      assert.deepEqual(calls.at(-1).payload.generationConfig.thinkingConfig, { thinkingLevel: 'MEDIUM' });

      // 2. Authed fast Ask -> gemini-3.5-flash-lite without thinkingConfig
      r = await handleEdgeAsk(req('/api/ask', '198.51.100.2'), env, { tier: 'fast', q: 'Quick KPI brief' }, ctx, { sub: 'ceo' });
      j = await r.json();
      assert.equal(j.ok, true);
      assert.ok(calls.at(-1).url.includes('/models/gemini-3.5-flash-lite:generateContent'));
      assert.equal(calls.at(-1).payload.generationConfig.thinkingConfig, undefined);

      // 3. Unauthed Showcase text tries to spoof tier=deep -> locked to gemini-3.5-flash-lite
      r = await handleEdgeAsk(req('/api/ask', '198.51.100.3'), env, { surface: 'showcase', tier: 'deep', q: 'Pricing?' }, ctx, null);
      j = await r.json();
      assert.equal(j.ok, true);
      assert.ok(calls.at(-1).url.includes('/models/gemini-3.5-flash-lite:generateContent'));

      // 4. Unauthed Showcase audio input -> routed to gemini-4-hydrogen with LOW thinkingLevel
      r = await handleEdgeAsk(req('/api/ask', '198.51.100.4'), env, {
        surface: 'showcase',
        geminiContents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/webm', data: 'UklGRg==' } }] }]
      }, ctx, null);
      j = await r.json();
      assert.equal(j.ok, true);
      assert.ok(calls.at(-1).url.includes('/models/gemini-4-hydrogen:generateContent'));
      assert.deepEqual(calls.at(-1).payload.generationConfig.thinkingConfig, { thinkingLevel: 'LOW' });

      // 5. Authed SmartScan with image defaults to vision (gemini-4-hydrogen LOW); text-only defaults to fast
      r = await handleEdgeSmartScan(req('/api/smart-scan', '198.51.100.5'), env, {
        tier: 'vision',
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
        mimeType: 'image/jpeg',
        extractedText: 'Invoice 101'
      }, { sub: 'ceo' });
      j = await r.json();
      assert.equal(j.model, 'gemini-4-hydrogen');
      assert.deepEqual(calls.at(-1).payload.generationConfig.thinkingConfig, { thinkingLevel: 'LOW' });

      // 6. Authed AiEdge brief -> fast (3.5-flash-lite) & skips thought part in result
      r = await handleEdgeAiEdge(req('/api/ai-edge', '198.51.100.6'), env, {
        task: 'mfg_close_sweep',
        tier: 'fast',
        prompt: 'Summarize close'
      }, { sub: 'ceo' });
      j = await r.json();
      assert.equal(j.model, 'gemini-3.5-flash-lite');
      assert.equal(j.result.total, 13400);

      // 7. TTS tier -> gemini-3.8-flash-lite-tts
      r = await handleEdgeTts(req('/api/tts', '198.51.100.7'), env, { tier: 'tts', text: 'Hello ISABI', lang: 'en' }, { sub: 'ceo' });
      j = await r.json();
      assert.equal(j.ok, true);
      assert.equal(j.model, 'gemini-3.8-flash-lite-tts');
      assert.ok(calls.at(-1).url.includes('/models/gemini-3.8-flash-lite-tts:generateContent'));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  await check('Zero hardcoded gemini-[0-9] model strings in client JS & Showcase builder', () => {
    const offenders = [];
    const partScript = readFileSync(join(ISABI_ROOT, 'build/part_script.py'), 'utf8');
    if (/gemini-[0-9]/i.test(partScript)) offenders.push('isabi/build/part_script.py');
    if (APP_ROOT && existsSync(join(APP_ROOT, 'js'))) {
      for (const f of readdirSync(join(APP_ROOT, 'js'))) {
        if (!f.endsWith('.js')) continue;
        const txt = readFileSync(join(APP_ROOT, 'js', f), 'utf8');
        if (/gemini-[0-9]/i.test(txt)) offenders.push(`isabi-app/js/${f}`);
      }
    }
    assert.deepEqual(offenders, [], `Found hardcoded gemini models: ${offenders.join(', ')}`);
  });

  if (APP_ROOT && existsSync(join(APP_ROOT, 'server.py'))) {
    await check('Local Python server.py tier helpers match Edge gemini.js 1:1', () => {
      const pyCode = [
        'import json, sys',
        `sys.path.insert(0, ${JSON.stringify(APP_ROOT)})`,
        'import server',
        'out = {',
        '  "fast": list(server.resolve_gemini_tier_model({"tier": "fast"})),',
        '  "deep": list(server.resolve_gemini_tier_model({"tier": "deep"})),',
        '  "vision": list(server.resolve_gemini_tier_model({"tier": "vision"})),',
        '  "tts": list(server.resolve_gemini_tier_model({"tier": "tts"}, default_tier="tts")),',
        '  "ttsIgnored": list(server.resolve_gemini_tier_model({"tier": "tts"}, default_tier="deep")),',
        '  "legacy": list(server.resolve_gemini_tier_model({"model": "gemini-3.8-flash"})),',
        '  "deepCfg": server.apply_gemini_thinking_config({"maxOutputTokens": 900}, "gemini-4-hydrogen", "deep", {}),',
        '  "visCfg": server.apply_gemini_thinking_config({"maxOutputTokens": 900}, "gemini-4-hydrogen", "vision", {}),',
        '  "ans": server._extract_candidate_text({"candidates": [{"content": {"parts": [{"text": "t", "thought": True}, {"text": "final"}]}}]})',
        '}',
        'print(json.dumps(out))'
      ].join('\n');
      const pyExe = process.platform === 'win32' ? 'python' : 'python3';
      const p = spawnSync(pyExe, ['-'], { input: pyCode, encoding: 'utf8' });
      assert.equal(p.status, 0, p.stderr || 'python failed');
      const res = JSON.parse(p.stdout.trim().split('\n').pop());
      assert.deepEqual(res.fast, ['gemini-3.5-flash-lite', 'fast']);
      assert.deepEqual(res.deep, ['gemini-4-hydrogen', 'deep']);
      assert.deepEqual(res.vision, ['gemini-4-hydrogen', 'vision']);
      assert.deepEqual(res.tts, ['gemini-3.8-flash-lite-tts', 'tts']);
      assert.deepEqual(res.ttsIgnored, ['gemini-4-hydrogen', 'deep']);
      assert.deepEqual(res.legacy, ['gemini-3.8-flash', 'fast']);
      assert.deepEqual(res.deepCfg.thinkingConfig, { thinkingLevel: 'MEDIUM' });
      assert.ok(res.deepCfg.maxOutputTokens >= 2500);
      assert.deepEqual(res.visCfg.thinkingConfig, { thinkingLevel: 'LOW' });
      assert.equal(res.ans, 'final');
    });
  }

  console.log(`\nALL ${passed} GEMINI TIER ROUTING CHECKS PASSED`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
