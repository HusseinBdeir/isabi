/**
 * ISABI Systems — Edge Gemini AI Proxy (Cloudflare Pages Functions)
 * Keeps GEMINI_API_KEY strictly in encrypted Cloudflare Edge Secrets.
 * Supports Ask ISABI, Read Aloud TTS, Smart Scan Vision, and Phase 16 AI Edge.
 */

import { checkSlidingRateLimit, hashClientIp, jsonResponse } from './security.js';

function resolveGeminiKey(env) {
  return String((env && (env.GEMINI_API_KEY || env.ISABI_GEMINI_KEY)) || '').trim();
}

function extractFirstJsonObject(rawStr) {
  const s = String(rawStr || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {}
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch (_) {
          break;
        }
      }
    }
  }
  return null;
}

async function logShowcaseAskAsync(env, ipHash, body) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO ask_logs (surface, lang, industry, query, reply_title, ip_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(
      String(body.surface || 'showcase').slice(0, 32),
      String(body.lang || 'en').slice(0, 8),
      String(body.industry || '').slice(0, 48),
      String(body.q || body.userPrompt || '').slice(0, 600),
      String(body.replyTitle || '').slice(0, 200),
      String(ipHash || '').slice(0, 32),
      new Date().toISOString()
    ).run();
  } catch (_) {}
}

export async function handleEdgeAsk(request, env, body, ctx) {
  const ipHash = await hashClientIp(request);
  const rl = checkSlidingRateLimit(`ask:${ipHash}`, 40, 60000);
  if (!rl.allowed) {
    return jsonResponse({ ok: false, mode: 'rate_limited', error: 'Rate limit exceeded' }, 429);
  }

  const gemKey = resolveGeminiKey(env);
  if (!gemKey) {
    return jsonResponse({ ok: false, mode: 'ask_cloud_fallback', note: 'missing_edge_key' });
  }

  if (body && body.surface === 'showcase' && ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(logShowcaseAskAsync(env, ipHash, body));
  }

  try {
    const targetModel = String(body.model || (env && env.ISABI_GEMINI_MODEL) || 'gemini-3.8-flash').trim();
    const sysPrompt = String(body.systemPrompt || '').trim();
    let gemContents = Array.isArray(body.geminiContents) ? body.geminiContents : [];
    if (!gemContents.length) {
      const userP = String(body.userPrompt || body.q || '').trim();
      if (!userP) return jsonResponse({ ok: false, error: 'Empty prompt' }, 400);
      gemContents = [{ role: 'user', parts: [{ text: userP }] }];
    }

    const genCfg = {
      temperature: 0.2,
      maxOutputTokens: 1500,
      responseMimeType: 'application/json'
    };
    if (targetModel.includes('3.8-flash') || targetModel.includes('3.6-flash')) {
      const tb = Number(body.thinkingBudget);
      genCfg.thinkingConfig = { thinkingBudget: Number.isFinite(tb) && tb >= 0 ? Math.min(tb, 2048) : 0 };
    }

    const reqObj = { contents: gemContents, generationConfig: genCfg };
    if (sysPrompt) {
      reqObj.systemInstruction = { parts: [{ text: sysPrompt }] };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 16500);
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(gemKey)}`;
    const resp = await fetch(gUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqObj),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return jsonResponse({ ok: false, mode: 'ask_fallback', note: `gemini_${resp.status}` });
    }
    const gRes = await resp.json();
    const parts = (((gRes && gRes.candidates && gRes.candidates[0]) || {}).content || {}).parts || [];
    const textPart = parts.find(p => p && typeof p.text === 'string' && p.text.trim()) || parts[0] || {};
    const rawReply = String(textPart.text || '').trim();
    if (!rawReply) {
      return jsonResponse({ ok: false, mode: 'ask_empty' });
    }
    return jsonResponse({
      ok: true,
      mode: 'gemini_cloud',
      edge: true,
      model: targetModel,
      rawReply
    });
  } catch (ex) {
    return jsonResponse({
      ok: false,
      mode: 'ask_fallback',
      note: String((ex && ex.message) || ex || '').slice(0, 120)
    });
  }
}

export async function handleEdgeTts(request, env, body) {
  const ipHash = await hashClientIp(request);
  const rl = checkSlidingRateLimit(`tts:${ipHash}`, 35, 60000);
  if (!rl.allowed) {
    return jsonResponse({ ok: false, mode: 'rate_limited', error: 'Rate limit exceeded' }, 429);
  }

  const gemKey = resolveGeminiKey(env);
  if (!gemKey) {
    return jsonResponse({ ok: false, mode: 'tts_local_only' });
  }

  try {
    const ttsText = String((body && body.text) || '').trim().slice(0, 2400);
    if (!ttsText) return jsonResponse({ ok: false, error: 'Empty text' }, 400);
    const ttsModel = String((body && body.model) || (env && env.ISABI_GEMINI_TTS_MODEL) || 'gemini-3.8-flash-lite-tts').trim();
    const voiceName = String((body && body.voiceName) || 'Kore').trim();
    const ttsCandidates = Array.from(new Set([
      ttsModel,
      'gemini-3.8-flash-tts',
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-flash-preview-tts'
    ].filter(Boolean)));
    const payloadStr = JSON.stringify({
      contents: [{ parts: [{ text: ttsText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      }
    });

    let lastNote = 'tts_empty';
    for (const candModel of ttsCandidates) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 22000);
      try {
        const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candModel)}:generateContent?key=${encodeURIComponent(gemKey)}`;
        const resp = await fetch(gUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadStr,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!resp.ok) {
          lastNote = `${candModel}:gemini_${resp.status}`;
          if (![429, 500, 502, 503, 504].includes(resp.status)) break;
          continue;
        }
        const gRes = await resp.json();
        const inline = (((((gRes && gRes.candidates && gRes.candidates[0]) || {}).content || {}).parts || [])[0] || {}).inlineData || {};
        const audioB64 = String(inline.data || '');
        if (audioB64) {
          return jsonResponse({
            ok: true,
            mode: 'gemini_tts',
            edge: true,
            model: candModel,
            mimeType: inline.mimeType || 'audio/wav',
            audioBase64: audioB64
          });
        }
        lastNote = `${candModel}:tts_empty`;
      } catch (subEx) {
        clearTimeout(timer);
        lastNote = `${candModel}:${String((subEx && subEx.message) || subEx || '').slice(0, 80)}`;
      }
    }
    return jsonResponse({ ok: false, mode: 'tts_fallback', note: lastNote.slice(0, 120) });
  } catch (ex) {
    return jsonResponse({
      ok: false,
      mode: 'tts_fallback',
      note: String((ex && ex.message) || ex || '').slice(0, 120)
    });
  }
}

export async function handleEdgeSmartScan(request, env, body) {
  const ipHash = await hashClientIp(request);
  const rl = checkSlidingRateLimit(`scan:${ipHash}`, 30, 60000);
  if (!rl.allowed) {
    return jsonResponse({ ok: true, mode: 'rate_limited', parsed: null }, 429);
  }

  const gemKey = resolveGeminiKey(env);
  if (!gemKey) {
    return jsonResponse({ ok: true, mode: 'local_only', parsed: null });
  }

  try {
    const dataUrl = String((body && body.dataUrl) || '');
    const mimeType = String((body && body.mimeType) || 'image/jpeg').toLowerCase().trim();
    const extTxt = String((body && body.extractedText) || '').slice(0, 5500);
    const companies = Array.isArray(body && body.companies) ? body.companies.slice(0, 16).join(', ') : '';
    const customPrompt = String((body && body.customPrompt) || '').trim();
    const promptText = customPrompt || (
      'Extract structured accounting fields from this document as strict JSON ONLY with keys: ' +
      '{"formType":"expense|sales|raw|receipt|settlement|fuel|repair|salary|external|treasury|conversion|document",' +
      '"company":"","date":"YYYY-MM-DD","reference":"","supplier":"","customer":"","counterparty":"",' +
      '"category":"","subcategory":"","product":"","site":"","equipment":"","driver":"","staff":"",' +
      '"paymentMethod":"Credit|Cash|Bank Transfer|Check","subtotalExVat":0,"vatAmount":0,"totalAmount":0,' +
      '"lbpAmount":0,"hasVat":false,"pricePending":false,"qty":1,"uom":"","unitPrice":0,"notes":"",' +
      '"lineItems":[{"description":"","qty":1,"uom":"Piece","unitCost":0,"lineTotal":0}]}. ' +
      `Active companies: ${companies}. OCR hint: ${extTxt}`
    );

    const parts = [{ text: promptText }];
    let hasVisionBin = false;
    if (dataUrl.includes(';base64,') && /^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/i.test(mimeType)) {
      const b64Part = dataUrl.split(';base64,')[1] || '';
      if (b64Part && b64Part.length < 6000000) {
        parts.push({ inlineData: { mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data: b64Part } });
        hasVisionBin = true;
      }
    }

    const targetModel = String((body && body.model) || '').trim() || (
      hasVisionBin
        ? ((env && env.ISABI_GEMINI_VISION_MODEL) || 'gemini-3.8-flash')
        : ((env && env.ISABI_GEMINI_MODEL) || 'gemini-3.5-flash-lite')
    );
    const genCfg = { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' };
    if (targetModel.includes('3.8-flash') || targetModel.includes('3.6-flash')) {
      genCfg.thinkingConfig = { thinkingBudget: Number((body && body.thinkingBudget) || 0) };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(gemKey)}`;
    const resp = await fetch(gUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: genCfg }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return jsonResponse({ ok: true, mode: 'fallback', parsed: null, note: `gemini_${resp.status}` });
    }
    const gRes = await resp.json();
    const candTxt = (((((gRes && gRes.candidates && gRes.candidates[0]) || {}).content || {}).parts || [])[0] || {}).text || '{}';
    const parsedObj = extractFirstJsonObject(candTxt);
    return jsonResponse({ ok: true, mode: 'gemini_vision', edge: true, model: targetModel, parsed: parsedObj });
  } catch (ex) {
    return jsonResponse({
      ok: true,
      mode: 'fallback',
      parsed: null,
      note: String((ex && ex.message) || ex || '').slice(0, 120)
    });
  }
}

export async function handleEdgeAiEdge(request, env, body) {
  const ipHash = await hashClientIp(request);
  const rl = checkSlidingRateLimit(`aiedge:${ipHash}`, 40, 60000);
  if (!rl.allowed) {
    return jsonResponse({ ok: true, mode: 'rate_limited', result: null }, 429);
  }

  const gemKey = resolveGeminiKey(env);
  if (!gemKey) {
    return jsonResponse({ ok: true, mode: 'local_hybrid', result: null });
  }

  try {
    const taskKind = String((body && body.task) || 'generic').trim();
    const promptText = String((body && body.prompt) || '').trim().slice(0, 12000);
    if (!promptText) return jsonResponse({ ok: true, mode: 'local_hybrid', result: null });

    const dataUrl = String((body && body.dataUrl) || '');
    const mimeType = String((body && body.mimeType) || 'image/jpeg').toLowerCase().trim();
    const parts = [{ text: promptText }];
    let hasVisionBin = false;
    if (dataUrl.includes(';base64,') && /^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/i.test(mimeType)) {
      const b64Part = dataUrl.split(';base64,')[1] || '';
      if (b64Part && b64Part.length < 6000000) {
        parts.push({ inlineData: { mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data: b64Part } });
        hasVisionBin = true;
      }
    }

    const targetModel = String((body && body.model) || '').trim() || (
      hasVisionBin
        ? ((env && env.ISABI_GEMINI_VISION_MODEL) || 'gemini-3.8-flash')
        : ((env && env.ISABI_GEMINI_LITE_MODEL) || 'gemini-3.5-flash-lite')
    );
    const genCfg = { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' };
    if (targetModel.includes('3.8-flash') || targetModel.includes('3.6-flash')) {
      genCfg.thinkingConfig = { thinkingBudget: Number((body && body.thinkingBudget) || 0) };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(gemKey)}`;
    const resp = await fetch(gUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: genCfg }),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return jsonResponse({ ok: true, mode: 'local_hybrid', result: null, note: `gemini_${resp.status}` });
    }
    const gRes = await resp.json();
    const candTxt = (((((gRes && gRes.candidates && gRes.candidates[0]) || {}).content || {}).parts || [])[0] || {}).text || '{}';
    const parsedObj = extractFirstJsonObject(candTxt);
    return jsonResponse({
      ok: true,
      mode: 'gemini_ai_edge',
      edge: true,
      task: taskKind,
      model: targetModel,
      result: parsedObj
    });
  } catch (ex) {
    return jsonResponse({
      ok: true,
      mode: 'local_hybrid',
      result: null,
      note: String((ex && ex.message) || ex || '').slice(0, 120)
    });
  }
}
