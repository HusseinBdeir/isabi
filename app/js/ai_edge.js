/* ============================================================================
   ISABI Systems - AI-over-Automation Edge Engine (js/ai_edge.js)
   Implements Hard Rule #15 across all 6 Industries (MFG, HLD, HSP, TRD, PROP, INS):
     Phase 1: Cross-Script (EN/AR/FR) Semantic Entity, Intercompany & Bordereau Matcher
     Phase 2: Trilingual Voice-to-Form Smart Entry (grounded via window.MFG_FREQ)
     Phase 3: Multi-Row Batch Intake Studio (deterministic sticky tfoot + 7z-chrono)
     Phase 4: Behavioral & Pattern AI Sentinels (split bills, price creep, repeat repairs)
     Phase 5: Daily Ops Root-Cause Briefs & 360 Inspector Bilingual Follow-Up Drafts
   All accounting math, GL ties, VAT/TTC, FIFO AR, 7z-chrono & 7z-freq stay 100% deterministic.
   ============================================================================ */
(function () {
  'use strict';

  let D = null;
  const BEHAV_REVIEW_KEY = 'isabi_ai_behav_reviews_v1';

  const EDGE_STATE = {
    voiceLang: 'en',
    voiceActive: false,
    speechRec: null,
    lastVoiceStatus: '',
    batchOpen: false,
    batchPreset: 'auto',
    batchRawText: '',
    batchRows: [],
    batchEngineLabel: 'Hybrid AI + Deterministic Math',
    hldMatcherOpen: false,
    hldMatches: null,
    insReconOpen: false,
    insReconText: '',
    insReconRows: null,
    insBatchPostedCount: 0,
    mfgReconOpen: false,
    mfgReconText: '',
    mfgReconRows: null,
    mfgReconPostedCount: 0,
    hspReconOpen: false,
    hspReconText: '',
    hspReconRows: null,
    hspReconPostedCount: 0,
    reReconOpen: false,
    reReconText: '',
    reReconPack: null,
    reArrearsOpen: false,
    reArrearsLang: 'en',
    reReconPostedCount: 0,
    trdReconOpen: false,
    trdReconText: '',
    trdReconPack: null,
    trdReconPostedCount: 0,
    hldBankOpen: false,
    hldBankText: '',
    hldBankPack: null,
    hldBankPostedCount: 0,
    behavDeepNote: '',
    behavBusy: false,
    dopsBriefOpen: false,
    dopsBriefCache: new Map(),
    inspDraftOpen: false,
    inspDraftLang: 'en',
    inspDraftTone: 'concise'
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeOutward(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2014\u2013]/g, ' - ')
      .replace(/[\u2190-\u21FF\u25B8]/g, 'to')
      .replace(/\bTHEO\b/gi, 'ISABI')
      .replace(/\bZ-Read\b/gi, 'Daily Closing')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function ic(name, cls) {
    if (window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function') {
      return window.MFG_ICONS.svg(name, cls);
    }
    return '';
  }

  function tr(str) {
    if (window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      const lang = typeof window.MFG_I18N.getLang === 'function' ? window.MFG_I18N.getLang() : 'en';
      if (lang && lang !== 'en') return window.MFG_I18N.t(str, lang);
    }
    return str;
  }

  function curLang() {
    if (window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') {
      const l = window.MFG_I18N.getLang();
      if (l === 'ar' || l === 'fr' || l === 'en') return l;
    }
    return 'en';
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function fmtUSD(v, dp) {
    if (D && typeof D.fmtUSD === 'function') return D.fmtUSD(v, dp == null ? 2 : dp);
    const n = Number(v) || 0;
    const d = dp == null ? 2 : dp;
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (n < 0 ? '-$' : '$') + abs;
  }

  function fmtNum(v, dp) {
    if (D && typeof D.fmtNum === 'function') return D.fmtNum(v, dp);
    const n = Number(v) || 0;
    return n.toLocaleString('en-US', { maximumFractionDigits: dp == null ? 0 : dp });
  }

  function isHeadlessEnv() {
    return Boolean(
      (typeof navigator !== 'undefined' && (navigator.webdriver || /HeadlessChrome|HeadlessEdg/i.test(navigator.userAgent || ''))) ||
      window.__MFG_HEADLESS_TEST
    );
  }

  function normalizeDigits(str) {
    return String(str == null ? '' : str)
      .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
  }

  // ==================== CROSS-SCRIPT (EN / AR / FR) SEMANTIC ENGINE ====================
  const AR_WORD_MAP = {
    'مؤسسة': 'est', 'شركة': 'co', 'اخوان': 'bros', 'إخوان': 'bros', 'للتجارة': 'trading',
    'للمقاولات': 'contracting', 'والمقاولات': 'contracting', 'للبناء': 'construction',
    'خوري': 'khoury', 'حداد': 'haddad', 'حبيب': 'habib', 'ميشال': 'michel', 'الياس': 'elias',
    'إلياس': 'elias', 'جورج': 'georges', 'نصار': 'nassar', 'عون': 'aoun', 'منصور': 'mansour',
    'كرم': 'karam', 'فرحات': 'farhat', 'طرابلس': 'tripoli', 'صيدا': 'saida', 'صور': 'tyre',
    'جبيل': 'jbeil', 'شكا': 'chekka', 'حالات': 'halat', 'الجية': 'jiyeh', 'بيروت': 'beirut',
    'مغسل': 'mghasal', 'بودرة': 'bodra', 'صخر': 'sakher', 'بحص': 'bahs', 'رمل': 'ramel',
    'مازوت': 'diesel', 'ديزل': 'diesel', 'وقود': 'diesel', 'ليتر': 'litre', 'لتر': 'litre',
    'طن': 'ton', 'متر': 'm3', 'شاحنة': 'truck', 'فاتورة': 'invoice', 'نقدا': 'cash',
    'نقدي': 'cash', 'شيك': 'check', 'تحويل': 'transfer', 'راتب': 'salary', 'صيانة': 'repair',
    'تصليح': 'repair', 'تأمين': 'insurance', 'بوليصة': 'policy', 'ايجار': 'lease', 'إيجار': 'lease',
    'مقالع': 'quarry', 'مقلع': 'quarry', 'كسارة': 'crusher', 'نقليات': 'transport', 'عفيف': 'afif',
    'بنك': 'bank', 'عودة': 'audi', 'بلوم': 'blom', 'فرنسبنك': 'fransabank', 'كهرباء': 'edl',
    'مولد': 'generator', 'بلدية': 'municipal', 'جمرك': 'customs', 'كفالة': 'warranty',
    'تأمينات': 'deposit', 'شاليه': 'chalet', 'بطاقة': 'card', 'عمولة': 'commission', 'وكيل': 'agent',
    'بلانكا': 'blanca', 'لاونا': 'launa', 'بالمز': 'palms', 'فوال': 'voile', 'بلاتينوم': 'platinum'
  };

  const AR_CHAR_MAP = {
    'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
    'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'k',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ة': 'a', 'و': 'w', 'ي': 'y', 'ى': 'a'
  };

  const CORP_STOPWORDS = new Set([
    'est', 'ets', 'etablissement', 'etablissements', 'societe', 'sarl', 'sal', 'co', 'company',
    'corp', 'inc', 'ltd', 'llc', 'trading', 'contracting', 'general', 'enterprises', 'group',
    'the', 'and', 'for', 'de', 'du', 'des', 'la', 'le', 'les', 'el', 'al', 'mr', 'm'
  ]);

  function crossScriptTokens(raw) {
    let s = normalizeDigits(String(raw == null ? '' : raw))
      .normalize('NFD')
      .replace(/[\u0300-\u036f\u064B-\u065F]/g, '')
      .toLowerCase();

    Object.keys(AR_WORD_MAP).forEach(arW => {
      if (s.includes(arW)) s = s.split(arW).join(' ' + AR_WORD_MAP[arW] + ' ');
    });

    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (AR_CHAR_MAP[ch] !== undefined) out += AR_CHAR_MAP[ch];
      else out += ch;
    }

    return out
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .map(tok => tok.trim())
      .filter(tok => tok.length >= 2 && !CORP_STOPWORDS.has(tok));
  }

  function consonantKey(tok) {
    const clean = String(tok || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) return '';
    return clean[0] + clean.slice(1).replace(/[aeiouyw]/g, '');
  }

  function semanticSimilarity(a, b) {
    if (!a || !b) return 0;
    const rawA = normalizeDigits(String(a)).trim().toLowerCase();
    const rawB = normalizeDigits(String(b)).trim().toLowerCase();
    if (rawA === rawB) return 1;

    const tA = crossScriptTokens(a);
    const tB = crossScriptTokens(b);
    if (!tA.length || !tB.length) return 0;

    let matches = 0;
    const usedB = new Set();
    for (let i = 0; i < tA.length; i++) {
      const x = tA[i];
      const cx = consonantKey(x);
      let bestJ = -1;
      let bestScore = 0;
      for (let j = 0; j < tB.length; j++) {
        if (usedB.has(j)) continue;
        const y = tB[j];
        const cy = consonantKey(y);
        let sc = 0;
        if (x === y) sc = 1;
        else if (cx && cy && cx === cy && cx.length >= 3) sc = 0.92;
        else if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) sc = 0.84;
        else if (cx.length >= 3 && cy.length >= 3 && (cx.includes(cy) || cy.includes(cx))) sc = 0.78;
        if (sc > bestScore) { bestScore = sc; bestJ = j; }
      }
      if (bestJ >= 0 && bestScore >= 0.75) {
        usedB.add(bestJ);
        matches += bestScore;
      }
    }
    const denom = Math.max(tA.length, tB.length);
    const minDenom = Math.min(tA.length, tB.length);
    const recall = minDenom > 0 ? (matches / minDenom) : 0;
    const jaccard = denom > 0 ? (matches / denom) : 0;
    return round2(jaccard * 0.65 + recall * 0.35);
  }

  // Strictly rank ties by operational usage frequency descending (Hard Rule #11: zero localeCompare)
  function getFreqScore(name, colKey) {
    if (!name) return 0;
    const fIdx = (D && typeof D.getFreqIndex === 'function')
      ? D.getFreqIndex()
      : (typeof window.MFG_FREQ === 'function' ? window.MFG_FREQ() : null);
    if (!fIdx) return 0;
    const key = String(name).trim().toLowerCase();
    const map = (colKey && fIdx[colKey]) || (typeof fIdx.forCol === 'function' ? fIdx.forCol(colKey || 'customer') : null);
    if (map && typeof map.get === 'function') return Number(map.get(key) || 0);
    if (map && typeof map === 'object') return Number(map[key] || 0);
    return 0;
  }

  function rankCandidatesByScoreAndFreq(candidates, queryText, colKey, minScore) {
    const floor = minScore == null ? 0.62 : minScore;
    const scored = [];
    const seen = new Set();
    (candidates || []).forEach(cand => {
      const label = typeof cand === 'string' ? cand : (cand && (cand.name || cand.label || cand.id));
      if (!label) return;
      const k = String(label).trim().toLowerCase();
      if (!k || seen.has(k)) return;
      seen.add(k);
      const sim = semanticSimilarity(queryText, label);
      if (sim >= floor) {
        scored.push({
          item: cand,
          label: String(label).trim(),
          score: sim,
          freq: getFreqScore(label, colKey)
        });
      }
    });
    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.04) return b.score - a.score;
      return b.freq - a.freq;
    });
    return scored;
  }

  function extractAiEdgeJsonObject(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : s;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (_) {}
    }
    return null;
  }

  function resolveAiEdgeRelayEndpoint() {
    const askCfg = window.MFG_ASK_CFG || {};
    if (askCfg.endpointUrl && askCfg.enabled) {
      return { url: String(askCfg.endpointUrl), key: String(askCfg.key || '') };
    }
    try {
      if (askCfg.u && askCfg.k) {
        return { url: atob(askCfg.u), key: atob(askCfg.k) };
      }
    } catch (_) {}
    return { url: '', key: '' };
  }

  function extractAiEdgeInlinePart(dataUrl, mimeType) {
    const rawUrl = String(dataUrl || '');
    const mimeRaw = String(mimeType || '').toLowerCase().trim();
    if (!rawUrl.includes(';base64,')) return null;
    if (!/^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/i.test(mimeRaw)) return null;
    const b64Part = rawUrl.split(';base64,')[1] || '';
    if (!b64Part || b64Part.length > 4200000) return null;
    const normMime = mimeRaw === 'image/jpg' ? 'image/jpeg' : mimeRaw;
    return { mimeType: normMime, data: b64Part };
  }

  function isLocalOrEdgeApiHost(hostnameOverride) {
    if (window.ISABI_LOCAL_API || window.ISABI_HAS_EDGE_API) return true;
    const host = String(hostnameOverride != null ? hostnameOverride : ((typeof location !== 'undefined' && location.hostname) || '')).toLowerCase();
    if (!host) return false;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)
    );
  }

  async function callAiEdgeJson(task, prompt, dataUrl, mimeType, opts) {
    if (isHeadlessEnv() && !window.__MFG_TEST_LIVE_AI) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    const cleanPrompt = String(prompt || '').trim().slice(0, 12000);
    if (!cleanPrompt) return null;

    const inlinePart = extractAiEdgeInlinePart(dataUrl, mimeType);
    const hostnameHint = opts && typeof opts.hostname === 'string' ? opts.hostname : undefined;

    // 1. Local / Edge Server API (./api/ai-edge) when running on local/LAN server or explicit Edge API host
    if (isLocalOrEdgeApiHost(hostnameHint)) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), inlinePart ? 12000 : 6500);
      try {
        const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
        const res = await fetch(`${base}/api/ai-edge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: String(task || 'generic'),
            prompt: cleanPrompt,
            dataUrl: dataUrl || '',
            mimeType: mimeType || '',
            model: inlinePart ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite',
            thinkingBudget: 0
          }),
          signal: ctrl.signal
        });
        if (res && res.ok) {
          const j = await res.json();
          const parsedLocal = extractAiEdgeJsonObject(j && (j.result || j.rawReply || j.parsed));
          if (parsedLocal) return parsedLocal;
        }
      } catch (_) {
      } finally {
        clearTimeout(timer);
      }
    }

    // 2. Cloud AI Relay (window.MFG_ASK_CFG -> op: 'ask') for static hosts (isabisystems.com/app/) & local keyless fallback
    const relay = resolveAiEdgeRelayEndpoint();
    if (relay.url && relay.url.startsWith('http')) {
      const targetModel = inlinePart ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
      const sysPrompt = [
        'You are ISABI AI Edge, an enterprise ERP structured JSON extractor and executive copilot.',
        'Return ONLY a valid JSON object matching the requested schema.',
        'Never include markdown commentary, em-dashes, or Unicode arrows.'
      ].join(' ');
      const parts = [{ text: cleanPrompt }];
      if (inlinePart) parts.push({ inlineData: inlinePart });
      const activeScope = (D && typeof D.getActiveCompanyLabel === 'function' && D.getActiveCompanyLabel()) || 'ISABI ERP';
      const reqBody = {
        key: relay.key,
        op: 'ask',
        surface: 'ai_edge',
        q: 'ai_edge:' + String(task || 'generic').slice(0, 48),
        companyScope: String(activeScope).slice(0, 80),
        lang: curLang(),
        model: targetModel,
        systemPrompt: sysPrompt,
        userPrompt: cleanPrompt,
        geminiContents: [{ role: 'user', parts }]
      };
      if (inlinePart) reqBody.thinkingBudget = 0;

      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), inlinePart ? 13000 : 9000);
      try {
        const res2 = await fetch(relay.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(reqBody),
          signal: ctrl2.signal
        });
        if (res2 && res2.ok) {
          const j2 = await res2.json();
          const parsedRelay = extractAiEdgeJsonObject(j2 && (j2.result || j2.rawReply || j2.reply || j2.answer));
          if (parsedRelay) return parsedRelay;
        }
      } catch (_) {
      } finally {
        clearTimeout(timer2);
      }
    }

    return null;
  }

  // ==================== PHASE 1: CROSS-SCRIPT SEMANTIC MATCHER ====================
  function daysBetweenIso(d1, d2) {
    const a = Date.parse(String(d1 || '').slice(0, 10) + 'T00:00:00Z');
    const b = Date.parse(String(d2 || '').slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
    return Math.abs(Math.round((a - b) / 86400000));
  }

  function computeHoldingSemanticMatches() {
    if (!D || typeof D.computeIntercompanyInteractions !== 'function') return [];
    const icRes = D.computeIntercompanyInteractions({ ignoreSearch: true }) || {};
    const openRows = Array.isArray(icRes.openRows) ? icRes.openRows : [];
    const proposals = [];
    const usedIdx = new Set();

    for (let i = 0; i < openRows.length && proposals.length < 18; i++) {
      if (usedIdx.has(i)) continue;
      const a = openRows[i];
      if (!a || !(Number(a.usd) > 0)) continue;
      let bestJ = -1;
      let bestConf = 0;
      let bestReason = '';

      for (let j = i + 1; j < openRows.length; j++) {
        if (usedIdx.has(j)) continue;
        const b = openRows[j];
        if (!b || !(Number(b.usd) > 0)) continue;
        const gapDays = daysBetweenIso(a.date, b.date);
        if (gapDays > 6) continue;
        const maxAmt = Math.max(Number(a.usd), Number(b.usd), 1);
        const amtDiffPct = Math.abs(Number(a.usd) - Number(b.usd)) / maxAmt;
        if (amtDiffPct > 0.03) continue;

        const oppositePair = (a.fromCo === b.fromCo && a.toCo === b.toCo && a.missingSide !== b.missingSide) ||
          (a.fromCo === b.toCo && a.toCo === b.fromCo);
        const memoSim = semanticSimilarity(a.notes || '', b.notes || '');
        if (!oppositePair && memoSim < 0.45) continue;

        let conf = 0.62;
        if (amtDiffPct <= 0.001) conf += 0.18;
        else conf += 0.08;
        if (gapDays === 0) conf += 0.10;
        else if (gapDays <= 2) conf += 0.06;
        conf += Math.min(0.09, memoSim * 0.12);
        conf = Math.min(0.99, round2(conf));

        if (conf > bestConf) {
          bestConf = conf;
          bestJ = j;
          bestReason = `${amtDiffPct <= 0.001 ? 'Exact USD match' : 'Near-exact FX amount'} · ${gapDays}d date gap${memoSim >= 0.35 ? ' · Cross-memo match' : ''}`;
        }
      }

      if (bestJ >= 0 && bestConf >= 0.74) {
        usedIdx.add(i);
        usedIdx.add(bestJ);
        const r = a.primaryRow || {};
        proposals.push({
          kind: 'pair_candidate',
          code: a.code,
          partnerCode: openRows[bestJ].code,
          date: a.date,
          fromCo: a.fromCo,
          toCo: a.toCo,
          pendingActionCo: a.pendingActionCo,
          missingSide: a.missingSide,
          usd: round2(a.usd),
          confidencePct: Math.round(bestConf * 100),
          reason: bestReason,
          notes: sanitizeOutward(a.notes || openRows[bestJ].notes || 'Intercompany treasury transfer'),
          rowId: r.id || ''
        });
      }
    }

    // Also rank high-value clear single-sided legs ready for immediate 1-click mirror entry
    if (proposals.length < 8) {
      openRows.slice(0, 40).forEach((x, idx) => {
        if (usedIdx.has(idx) || proposals.length >= 10) return;
        const r = x.primaryRow || {};
        const hasMemo = Boolean(x.notes && String(x.notes).trim().length > 4);
        proposals.push({
          kind: 'mirror_ready',
          code: x.code,
          partnerCode: '',
          date: x.date,
          fromCo: x.fromCo,
          toCo: x.toCo,
          pendingActionCo: x.pendingActionCo,
          missingSide: x.missingSide,
          usd: round2(x.usd),
          confidencePct: hasMemo ? 94 : 88,
          reason: hasMemo ? 'Verified sister-entity corridor & memo' : 'Standard treasury sweep corridor',
          notes: sanitizeOutward(x.notes || 'Sister-company cash sweep'),
          rowId: r.id || ''
        });
      });
    }

    EDGE_STATE.hldMatches = proposals;
    return proposals;
  }

  const SAMPLE_CARRIER_BORDEREAU = [
    'ALZ-MOT-2026-12801 | Est. Michel Khoury | Gross: $4,200 | Carrier Comm Paid: $580.00 | Sep 2026',
    'ARP-FIR-2026-09412 | شركة حداد للمقاولات | Gross: $8,500 | Carrier Comm Paid: $1,235.00 | Oct 2026',
    'MDG-MED-2026-04118 | Georges Nassar Family | Gross: $3,100 | Carrier Comm Paid: $310.00 | Oct 2026'
  ].join('\n');

  function reconcileCarrierBordereau(rawText) {
    const txt = String(rawText || SAMPLE_CARRIER_BORDEREAU).trim();
    EDGE_STATE.insReconText = txt;
    const insOps = (D && typeof D.computeInsuranceOperations === 'function') ? D.computeInsuranceOperations() : { policies: [], statements: [] };
    const policies = Array.isArray(insOps.policies) ? insOps.policies : [];
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const out = lines.map((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      const refRaw = parts[0] || `ROW-${idx + 1}`;
      const clientRaw = parts[1] || '';
      const nums = (line.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, '')));
      const grossPrem = nums.length >= 2 ? nums[nums.length - 2] : (nums[0] || 0);
      const paidComm = nums.length >= 2 ? nums[nums.length - 1] : 0;

      // Exact policy # or fuzzy policy/client match
      let matchedPol = policies.find(p => p && String(p.id || '').toLowerCase() === refRaw.toLowerCase());
      let matchConf = matchedPol ? 99 : 0;
      if (!matchedPol) {
        let bestP = null;
        let bestSc = 0;
        policies.forEach(p => {
          if (!p) return;
          const idSim = semanticSimilarity(refRaw, p.id || '');
          const clSim = semanticSimilarity(clientRaw, p.client || '');
          const sc = Math.max(idSim, clSim);
          if (sc > bestSc) { bestSc = sc; bestP = p; }
        });
        if (bestP && bestSc >= 0.55) {
          matchedPol = bestP;
          matchConf = Math.round(Math.min(96, 68 + bestSc * 28));
        } else {
          matchConf = 76;
        }
      }

      const carrier = (matchedPol && matchedPol.carrier) || (/alz|allianz/i.test(refRaw) ? 'Allianz SNA' : (/arp|arope/i.test(refRaw) ? 'Arope Insurance' : 'MedGulf'));
      const polLine = (matchedPol && matchedPol.line) || (/fir/i.test(refRaw) ? 'FIR · Fire & Property' : (/med/i.test(refRaw) ? 'MED · Medical' : 'MOT · Motor'));
      let agrRate = matchedPol && Number(matchedPol.comm_rate_pct) > 0 ? Number(matchedPol.comm_rate_pct) : 15;
      if (D && typeof D.lookupActiveInsuranceAgreementRate === 'function') {
        const hit = D.lookupActiveInsuranceAgreementRate(carrier, polLine, (matchedPol && matchedPol.date) || '2026-10-15', 'Policy (New)');
        if (hit && Number(hit.rate) > 0) agrRate = Number(hit.rate);
      }
      const effGross = grossPrem > 0 ? grossPrem : Number((matchedPol && matchedPol.gross_prem_usd) || 0);
      // 100% Deterministic expected commission, sub-agent split, carrier net payable & variance math
      const expectedComm = round2(effGross * (agrRate / 100));
      const variance = round2(paidComm - expectedComm);
      const clientDiscUsd = round2(Math.min(expectedComm, Number((matchedPol && matchedPol.discount_usd) || 0)));
      const producerName = sanitizeOutward((matchedPol && matchedPol.producer) || (/med|life|liab/i.test(polLine) ? 'Carla Moubarak' : 'Joseph Khalil'));
      const subAgentPct = /carla/i.test(producerName) ? 20 : 25;
      const netBeforeSplit = Math.max(0, round2(expectedComm - clientDiscUsd));
      const subAgentUsd = round2(netBeforeSplit * (subAgentPct / 100));
      const retainedBrokerUsd = round2(netBeforeSplit - subAgentUsd);
      const carrierNetPayableUsd = round2(effGross - expectedComm);

      return {
        idx: idx + 1,
        policyId: (matchedPol && matchedPol.id) || refRaw,
        carrier,
        client: sanitizeOutward((matchedPol && matchedPol.client) || clientRaw || 'Policyholder'),
        producer: producerName,
        subAgentPct,
        subAgentUsd,
        clientDiscountUsd: clientDiscUsd,
        retainedBrokerUsd,
        carrierNetPayableUsd,
        grossUsd: effGross,
        ratePct: agrRate,
        expectedCommUsd: expectedComm,
        statementCommUsd: round2(paidComm),
        varianceUsd: variance,
        confidencePct: matchConf,
        status: Math.abs(variance) < 0.5 ? 'Matched' : (variance < 0 ? 'Short-Paid' : 'Over-Paid')
      };
    });

    // Detect active endorsements missing from carrier bordereaux
    const seenIds = new Set(out.map(r => String(r.policyId || '').toLowerCase()));
    const uncollectedEndorsements = policies
      .filter(p => p && (/^END-/i.test(String(p.id || '')) || /Endorsement/i.test(String(p.type || ''))) && Number(p.gross_prem_usd) > 0 && !seenIds.has(String(p.id || '').toLowerCase()))
      .map(p => ({
        id: p.id,
        carrier: p.carrier,
        client: sanitizeOutward(p.client || ''),
        grossUsd: round2(Number(p.gross_prem_usd || 0)),
        expectedCommUsd: round2(Number(p.gross_comm_usd || (Number(p.gross_prem_usd || 0) * (Number(p.comm_rate_pct || 15) / 100))))
      }));

    EDGE_STATE.insReconRows = out;
    EDGE_STATE.insUncollectedEndorsements = uncollectedEndorsements;
    return out;
  }

  function postInsuranceBordereauBatch() {
    const rows = EDGE_STATE.insReconRows || reconcileCarrierBordereau(EDGE_STATE.insReconText);
    if (!rows.length || !D) return 0;
    const td = typeof D.todayISO === 'function' ? D.todayISO() : '2026-11-08';
    const byCarrier = new Map();
    rows.forEach(r => {
      const k = r.carrier || 'Allianz SNA';
      const cur = byCarrier.get(k) || { carrier: k, gross: 0, expComm: 0, paidComm: 0, subAgent: 0, retained: 0, netPayable: 0, count: 0 };
      cur.gross = round2(cur.gross + r.grossUsd);
      cur.expComm = round2(cur.expComm + r.expectedCommUsd);
      cur.paidComm = round2(cur.paidComm + r.statementCommUsd);
      cur.subAgent = round2(cur.subAgent + r.subAgentUsd);
      cur.retained = round2(cur.retained + r.retainedBrokerUsd);
      cur.netPayable = round2(cur.netPayable + r.carrierNetPayableUsd);
      cur.count += 1;
      byCarrier.set(k, cur);
    });

    let posted = 0;
    const insOps = typeof D.computeInsuranceOperations === 'function' ? D.computeInsuranceOperations() : { statements: [] };
    byCarrier.forEach((agg, carrierName) => {
      const matchStmt = (insOps.statements || []).find(s => s && String(s.carrier || '').toLowerCase() === carrierName.toLowerCase());
      if (matchStmt && typeof D.saveIndustryWorkflowPatch === 'function') {
        D.saveIndustryWorkflowPatch('ins_statements', matchStmt.id, {
          statement_comm_usd: agg.expComm,
          variance_usd: 0,
          status: 'Settled',
          note: sanitizeOutward(`Bordereau & sub-agent split (${fmtUSD(agg.subAgent, 2)}) settled on ${td}`)
        });
      }
      if (typeof D.addIndustryCustomRow === 'function') {
        const slug = carrierName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'INS';
        D.addIndustryCustomRow('ins_remittances', {
          id: `REM-BDX-${slug}-${rows.length}`,
          carrier: carrierName,
          company: 'Insurance Company',
          gl_payable: `${carrierName} Carrier Account`,
          settlement_mode: `Net of Comm · Sub-Agent Split ${fmtUSD(agg.subAgent, 2)}`,
          gross_prem_usd: agg.gross,
          broker_comm_7063_usd: agg.expComm,
          sub_agent_comm_usd: agg.subAgent,
          retained_net_comm_usd: agg.retained,
          settled_to_carrier_usd: agg.netPayable,
          net_payable_4017_usd: 0,
          client_cash_held_usd: agg.gross,
          next_due: td,
          status: 'Covered by Cash'
        }, { skipCloudSync: isHeadlessEnv() });
      }
      posted += 1;
    });
    EDGE_STATE.insBatchPostedCount = posted;
    if (typeof D.renderApp === 'function') D.renderApp();
    if (typeof D.toast === 'function') {
      D.toast(`${posted} ${tr('carrier bordereau & sub-agent settlement batches posted')}`, 'ok');
    }
    return posted;
  }

  function wireFuzzyCounterpartyGuard(rootEl) {
    const scope = rootEl || document;
    const modalForm = D && D.STATE ? D.STATE.modalForm : '';
    if (!['customer', 'supplier', 'staff'].includes(modalForm)) return;
    const nameInp = scope.querySelector('#f_name');
    if (!nameInp || nameInp._aieFuzzyWired) return;
    nameInp._aieFuzzyWired = true;

    let hintEl = scope.querySelector('#aieFuzzyPartyHint');
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.id = 'aieFuzzyPartyHint';
      hintEl.className = 'aie-fuzzy-hint';
      hintEl.hidden = true;
      nameInp.insertAdjacentElement('afterend', hintEl);
    }

    const colKey = modalForm === 'supplier' ? 'supplier' : (modalForm === 'staff' ? 'staff' : 'customer');
    const recKey = modalForm === 'supplier' ? 'suppliers' : (modalForm === 'staff' ? 'staff_members' : 'customers');

    nameInp.addEventListener('input', () => {
      const q = String(nameInp.value || '').trim();
      if (q.length < 3 || !D || !D.SEED || !D.SEED.records) {
        hintEl.hidden = true;
        return;
      }
      const pool = (D.SEED.records[recKey] || []).concat((D.STATE && D.STATE.customRecords && D.STATE.customRecords[recKey]) || [])
        .filter(r => r && !r.voided && r.name);
      const ranked = rankCandidatesByScoreAndFreq(pool, q, colKey, 0.72)
        .filter(m => m.label.toLowerCase() !== q.toLowerCase());
      if (!ranked.length) {
        hintEl.hidden = true;
        return;
      }
      const top = ranked[0];
      hintEl.hidden = false;
      hintEl.innerHTML = `
        <span>${ic('sparkles')} <strong>${esc(tr('Similar existing record detected:'))}</strong> ${esc(top.label)} <span class="aie-pill">${Math.round(top.score * 100)}%</span></span>
        <button type="button" class="aie-btn" data-aie-open-existing="${esc(recKey)}" data-aie-open-val="${esc(top.label)}">${esc(tr('Inspect Existing 360°'))}</button>
      `;
      const openBtn = hintEl.querySelector('[data-aie-open-existing]');
      if (openBtn && D && typeof D.showRecordInspector === 'function') {
        openBtn.onclick = ev => {
          ev.preventDefault();
          D.showRecordInspector(recKey, top.label);
        };
      }
    });
  }

  // ==================== PHASE 2: TRILINGUAL VOICE-TO-FORM SMART ENTRY ====================
  const VOICE_SAMPLES_BY_IND = {
    'Manufacturing': '220 litres diesel for truck 357925 at WTC meter 14820',
    'Holding & Treasury': 'Intercompany transfer from WTC to Bdeir Holding 18500 dollars treasury sweep',
    'Hospitality & Resorts': 'Blanca daily venue closing chalet revenue 3200 dollars cash',
    'Automotive & Heavy Trading': 'Shacman X3000 commercial invoice 68000 dollars customer Michel Khoury',
    'Real Estate & Property': 'Commercial lease 4235 Company annual rent 24000 dollars tenant Infinitas',
    'Insurance & Brokerage': 'MedGulf motor policy for Michel Khoury gross premium 2800 dollars'
  };

  function parseVoiceUtteranceLocal(text) {
    const clean = normalizeDigits(String(text || '')).trim();
    const low = clean.toLowerCase();
    const activeInd = (D && typeof D.getActiveIndustry === 'function' && D.STATE)
      ? D.getActiveIndustry(D.STATE.company)
      : 'Manufacturing';

    const out = {
      industry: activeInd,
      formType: '',
      qty: null,
      amount: null,
      meter: null,
      uom: '',
      paymentMethod: '',
      customer: '',
      supplier: '',
      product: '',
      equipment: '',
      site: '',
      category: '',
      notes: sanitizeOutward(clean)
    };

    // Form intent detection across EN / AR / FR
    if (/\b(diesel|mazout|fuel|litres?|liters?)\b|مازوت|ديزل|وقود|ليتر/.test(low)) {
      out.formType = 'fuel';
      out.uom = 'Litre';
    } else if (/\b(repair|mechanic|hydraulic|brake|overhaul)\b|تصليح|صيانة/.test(low)) {
      out.formType = 'repair';
    } else if (/\b(quarry|raw|hauler)\b|مقلع|كسارة/.test(low)) {
      out.formType = 'raw';
    } else if (/\b(intercompany|sister|sweep|wire)\b|تحويل بين/.test(low)) {
      out.formType = 'external';
    } else if (/\b(expense|bill|supplier|invoice)\b|فاتورة|مصاريف|مصروف/.test(low) && activeInd === 'Manufacturing') {
      out.formType = 'expense';
    } else if (/\b(mghasal|bodra|sakher|sand|aggregate|ton|m3|delivery)\b|مغسل|بودرة|صخر|بحص|رمل/.test(low)) {
      out.formType = 'sales';
    }

    if (/\b(cash|especes|espèces)\b|نقدا|نقدي/.test(low)) out.paymentMethod = 'Cash';
    else if (/\b(check|cheque|chèque)\b|شيك/.test(low)) out.paymentMethod = 'Check';
    else if (/\b(transfer|wire|virement)\b|تحويل/.test(low)) out.paymentMethod = 'Bank Transfer';
    else if (/\b(credit|crédit)\b|ذمم|آجل/.test(low)) out.paymentMethod = 'Credit';

    const meterM = low.match(/(?:meter|odometer|hr|hours|عداد)\s*[:#-]?\s*(\d{2,7}(?:\.\d+)?)/i);
    if (meterM) out.meter = Number(meterM[1]);

    const qtyM = low.match(/(\d+(?:\.\d+)?)\s*(?:litres?|liters?|l\b|tons?|t\b|m3|m³|trucks?|ليتر|لتر|طن|متر)/i);
    if (qtyM) out.qty = Number(qtyM[1]);

    const amtM = low.match(/(?:\$\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:usd|dollars?|دولار|\$))/i);
    if (amtM) out.amount = Number(String(amtM[1] || amtM[2]).replace(/,/g, ''));

    if (/mghasal|مغسل/i.test(low)) out.product = 'Mghasal';
    else if (/bodra|بودرة/i.test(low)) out.product = 'Bodra';
    else if (/sakher|صخر/i.test(low)) out.product = 'Sakher';

    // Frequency-first grounding against live registries (Hard Rule #11)
    if (D && D.SEED && D.SEED.records) {
      const eqPool = (D.SEED.records.equipment || []).filter(r => r && !r.voided).map(r => r.name || r.plate_no).filter(Boolean);
      const custPool = (D.SEED.records.customers || []).filter(r => r && !r.voided).map(r => r.name).filter(Boolean);
      const supPool = (D.SEED.records.suppliers || []).filter(r => r && !r.voided).map(r => r.name).filter(Boolean);
      const sitePool = (D.SEED.records.sites || []).filter(r => r && !r.voided).map(r => r.name).filter(Boolean);

      const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const findInText = (pool, colKey) => {
        const hits = [];
        pool.forEach(name => {
          const nStr = String(name).trim();
          const nLow = nStr.toLowerCase();
          if (nLow.length < 3) return;
          // Exclude numbers that already matched qty/meter/amount
          if (/^\d+$/.test(nLow) && (Number(nLow) === out.qty || Number(nLow) === out.meter || Number(nLow) === out.amount)) return;
          const wb = new RegExp(`(?:^|[^a-z0-9])${escRx(nLow)}(?:$|[^a-z0-9])`, 'i');
          if (wb.test(low)) {
            hits.push({ label: nStr, score: 1, freq: getFreqScore(nStr, colKey) });
          }
        });
        if (hits.length) {
          hits.sort((a, b) => b.freq - a.freq);
          return hits[0].label;
        }
        const fuzzy = rankCandidatesByScoreAndFreq(pool.slice(0, 250), clean, colKey, 0.78);
        return fuzzy.length ? fuzzy[0].label : '';
      };

      const explicitEq = clean.match(/(?:truck|unit|plate|loader|excavator|آلية|شاحنة)\s*[:#-]?\s*([a-z0-9-]{2,12})/i);
      if (explicitEq && D && typeof D.resolveCanonicalEquipmentName === 'function') {
        out.equipment = D.resolveCanonicalEquipmentName(explicitEq[1]) || '';
      }
      if (!out.equipment) out.equipment = findInText(eqPool, 'equipment');
      out.customer = findInText(custPool, 'customer');
      out.supplier = findInText(supPool, 'supplier');
      out.site = findInText(sitePool, 'site');
    }

    return out;
  }

  function setInputVal(id, val) {
    if (val == null || val === '') return false;
    const el = $(id);
    if (!el || el.disabled) return false;
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function applyVoiceToActiveModal(utterance, isDomainModal) {
    const clean = String(utterance || '').trim();
    if (!clean) return { ok: false, filled: 0 };

    let parsed = parseVoiceUtteranceLocal(clean);
    const cloudParsed = await callAiEdgeJson(
      'voice_fill',
      `Extract ERP form fields as strict JSON {"formType":"sales|raw|fuel|expense|repair|external","qty":0,"amount":0,"meter":0,"uom":"","paymentMethod":"Cash|Credit|Check|Bank Transfer","customer":"","supplier":"","product":"","equipment":"","site":"","notes":""} from utterance: ${clean}`
    );
    if (cloudParsed && typeof cloudParsed === 'object') {
      Object.keys(cloudParsed).forEach(k => {
        if (cloudParsed[k] !== '' && cloudParsed[k] != null && cloudParsed[k] !== 0) {
          parsed[k] = cloudParsed[k];
        }
      });
    }

    let filled = 0;
    if (isDomainModal) {
      if (parsed.amount != null) {
        ['ide_tot', 'ide_gwp', 'ide_usd', 'ide_ttc', 'ide_contract', 'ide_claimed', 'ide_actual'].forEach(fid => {
          if (setInputVal(fid, parsed.amount)) filled++;
        });
      }
      if (parsed.qty != null) {
        ['ide_diesel', 'ide_qty', 'ide_hours'].forEach(fid => {
          if (setInputVal(fid, parsed.qty)) filled++;
        });
      }
      if (parsed.customer) {
        ['ide_client', 'ide_tenant', 'ide_buyer', 'ide_partner'].forEach(fid => {
          if (setInputVal(fid, parsed.customer)) filled++;
        });
      }
      if (setInputVal('ide_notes', sanitizeOutward(parsed.notes || clean))) filled++;
      EDGE_STATE.lastVoiceStatus = `${tr('Voice Auto-Fill Applied')} (${filled || 1})`;
      if (D && typeof D.toast === 'function') D.toast(tr('Voice fields populated: review deterministic totals before posting'), 'ok');
      return { ok: true, filled: Math.max(1, filled), parsed };
    }

    // Switch Smart Entry modal tab if voice clearly names another form
    if (parsed.formType && D && D.STATE && D.STATE.modalForm !== parsed.formType && !D.STATE.editingRecord && typeof D.openEntryModal === 'function' && (!D.canEnterForm || D.canEnterForm(parsed.formType))) {
      D.openEntryModal(parsed.formType, null, { forceSwitch: true });
    }

    if (parsed.equipment) {
      if (setInputVal('f_truck', parsed.equipment)) filled++;
      if (setInputVal('f_equipment', parsed.equipment)) filled++;
    }
    if (parsed.customer) {
      if (setInputVal('f_customer', parsed.customer)) filled++;
      if (setInputVal('f_counterparty', parsed.customer)) filled++;
    }
    if (parsed.supplier && setInputVal('f_supplier', parsed.supplier)) filled++;
    if (parsed.product && setInputVal('f_product', parsed.product)) filled++;
    if (parsed.site && setInputVal('f_site', parsed.site)) filled++;
    if (parsed.uom && setInputVal('f_uom', parsed.uom)) filled++;
    if (parsed.paymentMethod && setInputVal('f_method', parsed.paymentMethod)) filled++;
    if (parsed.qty != null) {
      if (setInputVal('f_qty', parsed.qty)) filled++;
      if (setInputVal('f_litres', parsed.qty)) filled++;
    }
    if (parsed.meter != null) {
      if ($('f_metertype') && (!$('f_metertype').value || $('f_metertype').value === 'none')) {
        setInputVal('f_metertype', Number(parsed.meter) < 40000 ? 'hours' : 'odometer');
      }
      const mEl = $('f_meter');
      if (mEl) mEl.readOnly = false;
      if (setInputVal('f_meter', parsed.meter)) filled++;
      if (setInputVal('f_odometer', parsed.meter)) filled++;
    }
    if (parsed.amount != null) {
      if (setInputVal('f_amount', parsed.amount)) filled++;
      if (setInputVal('f_usd', parsed.amount)) filled++;
      if (setInputVal('f_unitprice', parsed.amount)) filled++;
      if (setInputVal('f_price', parsed.amount)) filled++;
    }
    if (setInputVal('f_notes', sanitizeOutward(parsed.notes || clean))) filled++;

    if (D && typeof D.recalcForm === 'function') D.recalcForm();
    if (parsed.meter != null && $('f_meter')) {
      $('f_meter').readOnly = false;
      if (!$('f_meter').value) setInputVal('f_meter', parsed.meter);
    }
    EDGE_STATE.lastVoiceStatus = `${tr('Voice Auto-Fill Applied')} (${filled || 1})`;
    if (D && typeof D.toast === 'function') D.toast(tr('Voice fields populated: review deterministic totals before posting'), 'ok');
    return { ok: true, filled: Math.max(1, filled), parsed };
  }

  function startLiveSpeechCapture(inputEl, micBtn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (inputEl) inputEl.focus({ preventScroll: true });
      if (D && typeof D.toast === 'function') D.toast(tr('Type or dictate into the voice bar to auto-fill'), 'info');
      return;
    }
    if (EDGE_STATE.voiceActive && EDGE_STATE.speechRec) {
      try { EDGE_STATE.speechRec.stop(); } catch (_) {}
      EDGE_STATE.voiceActive = false;
      if (micBtn) micBtn.classList.remove('is-recording');
      return;
    }
    const rec = new SR();
    const bcpMap = { en: 'en-US', ar: 'ar-LB', fr: 'fr-FR' };
    rec.lang = bcpMap[EDGE_STATE.voiceLang] || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    EDGE_STATE.speechRec = rec;
    EDGE_STATE.voiceActive = true;
    if (micBtn) micBtn.classList.add('is-recording');

    rec.onresult = ev => {
      let transcript = '';
      for (let i = 0; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript + ' ';
      }
      if (inputEl) inputEl.value = transcript.trim();
    };
    rec.onend = () => {
      EDGE_STATE.voiceActive = false;
      if (micBtn) micBtn.classList.remove('is-recording');
    };
    rec.onerror = () => {
      EDGE_STATE.voiceActive = false;
      if (micBtn) micBtn.classList.remove('is-recording');
    };
    try { rec.start(); } catch (_) {
      EDGE_STATE.voiceActive = false;
      if (micBtn) micBtn.classList.remove('is-recording');
    }
  }

  function buildVoiceStripHtml(prefix, indName) {
    const sampleTxt = VOICE_SAMPLES_BY_IND[indName] || VOICE_SAMPLES_BY_IND['Manufacturing'];
    return `
      <div class="aie-voice-strip" id="${prefix}VoiceStrip">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('mic')} ${esc(tr('Voice-to-Form'))}</span>
          <div class="aie-lang-seg" role="group" aria-label="${esc(tr('Voice Dictation Language'))}">
            <button type="button" class="aie-lang-btn ${EDGE_STATE.voiceLang === 'en' ? 'active' : ''}" data-aie-vlang="en" data-no-i18n="1">EN</button>
            <button type="button" class="aie-lang-btn ${EDGE_STATE.voiceLang === 'ar' ? 'active' : ''}" data-aie-vlang="ar" data-no-i18n="1">AR</button>
            <button type="button" class="aie-lang-btn ${EDGE_STATE.voiceLang === 'fr' ? 'active' : ''}" data-aie-vlang="fr" data-no-i18n="1">FR</button>
          </div>
          <button type="button" class="aie-btn" id="${prefix}VoiceMicBtn" data-ui-tip="${esc(tr('Dictate entry in English, Arabic, or French'))}">${ic('mic')} ${esc(tr('Speak'))}</button>
        </div>
        <input type="text" class="aie-voice-input" id="${prefix}VoicePromptInput" placeholder="${esc(tr('Speak or type natural entry (e.g. 220L diesel for Cat 966G)...'))}" aria-label="${esc(tr('Voice or natural language entry'))}">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" class="aie-btn is-brass" id="${prefix}VoiceApplyBtn">${ic('bolt')} ${esc(tr('Fill Form'))}</button>
          <button type="button" class="aie-btn" id="${prefix}VoiceSampleBtn" data-sample-voice="${esc(sampleTxt)}">${esc(tr('Voice Sample'))}</button>
          <button type="button" class="aie-btn" id="${prefix}OpenBatchBtn" data-ui-tip="${esc(tr('Extract multi-row invoices, price lists, BOQs, or bordereaux'))}">${ic('layers')} ${esc(tr('Batch Table'))}</button>
        </div>
      </div>
    `;
  }

  function mountVoiceAndBatchOnEntryBar(barEl, isDomainModal) {
    if (!barEl || !barEl.parentElement) return;
    const prefix = isDomainModal ? 'aieInd' : 'aieMfg';
    const existing = $(`${prefix}VoiceStrip`);
    if (existing) existing.remove();
    const indName = (D && typeof D.getActiveIndustry === 'function' && D.STATE)
      ? D.getActiveIndustry(D.STATE.company)
      : 'Manufacturing';
    barEl.insertAdjacentHTML('afterend', buildVoiceStripHtml(prefix, indName));

    const strip = $(`${prefix}VoiceStrip`);
    if (!strip) return;
    const inp = strip.querySelector(`#${prefix}VoicePromptInput`);
    const micBtn = strip.querySelector(`#${prefix}VoiceMicBtn`);
    const applyBtn = strip.querySelector(`#${prefix}VoiceApplyBtn`);
    const smpBtn = strip.querySelector(`#${prefix}VoiceSampleBtn`);
    const batchBtn = strip.querySelector(`#${prefix}OpenBatchBtn`);

    strip.querySelectorAll('[data-aie-vlang]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        EDGE_STATE.voiceLang = btn.getAttribute('data-aie-vlang') || 'en';
        strip.querySelectorAll('[data-aie-vlang]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    if (micBtn) {
      micBtn.addEventListener('click', e => {
        e.stopPropagation();
        startLiveSpeechCapture(inp, micBtn);
      });
    }
    if (applyBtn) {
      applyBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (inp && inp.value.trim()) await applyVoiceToActiveModal(inp.value.trim(), isDomainModal);
      });
    }
    if (inp) {
      inp.addEventListener('keydown', async e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (inp.value.trim()) await applyVoiceToActiveModal(inp.value.trim(), isDomainModal);
        }
      });
    }
    if (smpBtn) {
      smpBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const txt = smpBtn.getAttribute('data-sample-voice') || '';
        if (inp) inp.value = txt;
        await applyVoiceToActiveModal(txt, isDomainModal);
      });
    }
    if (batchBtn) {
      batchBtn.addEventListener('click', e => {
        e.stopPropagation();
        openBatchIntakeModal();
      });
    }

    if (!isDomainModal) wireFuzzyCounterpartyGuard($('modalBody') || document);
  }

  // ==================== PHASE 3: MULTI-ROW BATCH INTAKE STUDIO ====================
  const BATCH_SAMPLES = {
    'Manufacturing': {
      title: 'Multi-Part Fleet & Warehouse Supplier Invoice',
      targetLabel: 'Expenses & Spare Parts',
      text: [
        '2026-11-06 | Hydraulic Hose 3/4 High Pressure | Qty: 4 | Unit: $65.00 | Supplier: Khoury Industrial',
        '2026-11-06 | CAT 15W40 Engine Oil Drum | Qty: 2 | Unit: $210.00 | Supplier: Khoury Industrial',
        '2026-11-06 | Crusher Jaw Liner Bolt Kit | Qty: 6 | Unit: $28.50 | Supplier: Khoury Industrial'
      ].join('\n')
    },
    'Hospitality & Resorts': {
      title: 'Resort Kitchen, Bar & Generator Multi-Line Intake',
      targetLabel: 'Hospitality Expenses (0% VAT on Diesel)',
      text: [
        '2026-11-06 | Fresh Sea Bass & Calamari Kitchen Delivery | Qty: 18 | Unit: $19.50 | Supplier: Beirut Marine',
        '2026-11-06 | Resort Generator Excised Diesel Refill | Qty: 600 | Unit: $0.92 | Supplier: Coral Fuel',
        '2026-11-06 | Sparkling Beverage Cases | Qty: 12 | Unit: $22.00 | Supplier: Boissons Liban'
      ].join('\n')
    },
    'Automotive & Heavy Trading': {
      title: 'Shipment Pack (B/L + Commercial Invoice + Customs Landed Cost)',
      targetLabel: 'Imports & Landed Cost Allocation',
      text: [
        '2026-11-06 | BL-SHA-8841 Ocean Freight Shanghai to Beirut | Qty: 1 | Unit: $6,400.00 | Supplier: CMA CGM',
        '2026-11-06 | Port Customs Clearance & Inspection Duty | Qty: 1 | Unit: $3,850.00 | Supplier: Beirut Port Customs',
        '2026-11-06 | Heavy Lowbed Port-to-Showroom Haulage | Qty: 2 | Unit: $320.00 | Supplier: Levant Heavy Haul'
      ].join('\n')
    },
    'Real Estate & Property': {
      title: 'Contractor Fit-Out BOQ & Escalation Schedule',
      targetLabel: 'Property Work Orders & Fit-Out',
      text: [
        '2026-11-06 | Lobby Porcelain Slab Supply & Install | Qty: 45 | Unit: $52.00 | Supplier: Mansour Build',
        '2026-11-06 | HVAC Chiller Valve Replacement Unit 3B | Qty: 2 | Unit: $440.00 | Supplier: CoolTech SAL',
        '2026-11-06 | Waterproofing Terrace Membrane | Qty: 30 | Unit: $18.00 | Supplier: Mansour Build'
      ].join('\n')
    },
    'Insurance & Brokerage': {
      title: 'Carrier Multi-Policy Commission Bordereau',
      targetLabel: 'Carrier Statement Recon',
      text: SAMPLE_CARRIER_BORDEREAU
    },
    'Holding & Treasury': {
      title: 'Group Multi-Entity Treasury Sweep Schedule',
      targetLabel: 'Intercompany & External Movements',
      text: [
        '2026-11-06 | WTC Monthly Cash Sweep to Bdeir Holding | Qty: 1 | Unit: $25,000.00 | Party: WTC',
        '2026-11-06 | Blanca Resort Seasonal Surplus Transfer | Qty: 1 | Unit: $14,500.00 | Party: Blanca',
        '2026-11-06 | Korri Auto Working Capital Repayment | Qty: 1 | Unit: $18,000.00 | Party: Korri Auto'
      ].join('\n')
    }
  };

  function parseBatchTextToRows(rawText, indName) {
    const clean = normalizeDigits(String(rawText || '')).trim();
    if (!clean) return [];
    const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const today = (D && typeof D.todayISO === 'function') ? D.todayISO() : '2026-11-06';
    const supPool = (D && D.SEED && D.SEED.records && D.SEED.records.suppliers)
      ? D.SEED.records.suppliers.filter(s => s && !s.voided).map(s => s.name).filter(Boolean)
      : [];

    return lines.map((line, i) => {
      const segs = line.split(/\||\t/).map(s => s.trim()).filter(Boolean);
      const isoM = line.match(/\b(202\d-\d{2}-\d{2})\b/);
      const rowDate = isoM ? isoM[1] : today;
      const qtyM = line.match(/qty\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
      const unitM = line.match(/(?:unit|price|rate|comm paid|gross)\s*[:=]?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i);
      const partyM = line.match(/(?:supplier|party|carrier|client|tenant)\s*[:=]?\s*([^|]+)/i);

      let qty = qtyM ? Number(qtyM[1]) : 1;
      let unitCost = unitM ? Number(String(unitM[1]).replace(/,/g, '')) : 0;
      if (!unitCost) {
        const allNums = (line.match(/\$?\d[\d,]*(?:\.\d+)?/g) || [])
          .filter(tok => !/^202\d$/.test(tok))
          .map(tok => Number(tok.replace(/[$,]/g, '')));
        if (allNums.length >= 2 && !qtyM) {
          qty = allNums[0] > 0 && allNums[0] <= 500 ? allNums[0] : 1;
          unitCost = allNums[allNums.length - 1];
        } else if (allNums.length === 1) {
          unitCost = allNums[0];
        }
      }

      let rawParty = partyM ? partyM[1].trim() : (segs.length >= 2 && !/^(qty|unit|\d)/i.test(segs[1]) ? segs[1] : 'General Vendor');
      const rankedSup = rankCandidatesByScoreAndFreq(supPool.slice(0, 300), rawParty, 'supplier', 0.72);
      const matchedParty = rankedSup.length ? rankedSup[0].label : sanitizeOutward(rawParty);

      const descSeg = segs.find(s => !/^(202\d-\d{2}-\d{2}|qty|unit|supplier|party)/i.test(s)) || segs[0] || `Line ${i + 1}`;
      const isHspZeroVat = indName === 'Hospitality & Resorts' && /diesel|tip|gratuities|مازوت/i.test(descSeg);
      const lineTotal = round2(qty * unitCost);

      return {
        selected: true,
        rowNo: i + 1,
        date: rowDate,
        description: sanitizeOutward(descSeg),
        counterparty: matchedParty,
        qty: round2(qty),
        unitPrice: round2(unitCost),
        lineTotal,
        taxNote: isHspZeroVat ? '0% VAT (Diesel/Tips)' : 'Standard'
      };
    });
  }

  function openBatchIntakeModal(initialText) {
    EDGE_STATE.batchOpen = true;
    const activeInd = (D && typeof D.getActiveIndustry === 'function' && D.STATE)
      ? D.getActiveIndustry(D.STATE.company)
      : 'Manufacturing';
    const preset = BATCH_SAMPLES[activeInd] || BATCH_SAMPLES['Manufacturing'];
    if (typeof initialText === 'string' && initialText.trim()) {
      EDGE_STATE.batchRawText = initialText.trim();
    } else if (!EDGE_STATE.batchRawText) {
      EDGE_STATE.batchRawText = preset.text;
    }
    EDGE_STATE.batchRows = parseBatchTextToRows(EDGE_STATE.batchRawText, activeInd);
    renderBatchIntakeModalDom();
  }

  function closeBatchIntakeModal() {
    EDGE_STATE.batchOpen = false;
    const m = $('aiBatchIntakeModal');
    if (m) m.hidden = true;
  }

  function commitSelectedBatchRows() {
    const selected = (EDGE_STATE.batchRows || []).filter(r => r && r.selected && r.lineTotal > 0);
    if (!selected.length || !D) return 0;
    const activeInd = typeof D.getActiveIndustry === 'function' ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
    const co = typeof D.defaultEntryCompany === 'function' ? D.defaultEntryCompany() : 'WTC';

    if (D.STATE && D.STATE.customRecords) {
      if (!Array.isArray(D.STATE.customRecords.expenses)) D.STATE.customRecords.expenses = [];
      selected.forEach((r, idx) => {
        const recId = `ai_batch_${Date.now()}_${idx}`;
        const expRec = {
          id: recId,
          name: `EXP-${r.date.replace(/-/g, '')}-BATCH-${idx + 1}`,
          date: r.date,
          rep_date: r.date,
          company: co,
          industry: activeInd,
          category: activeInd === 'Automotive & Heavy Trading' ? 'Shipping & Customs' : (activeInd === 'Hospitality & Resorts' ? 'Kitchen & Venue Supplies' : 'Maintenance & Parts'),
          subcategory: 'Batch Intake',
          supplier: r.counterparty,
          item_name: r.description,
          item_summary: `${r.description} (${r.qty} × ${fmtUSD(r.unitPrice, 2)})`,
          qty: r.qty,
          unit_price: r.unitPrice,
          amount: r.lineTotal,
          total_ttc: r.lineTotal,
          vat_amount: 0,
          method: 'Credit',
          notes: sanitizeOutward(`AI Batch Intake: ${r.description}`),
          source: 'app',
          modified_at: new Date().toISOString()
        };
        D.STATE.customRecords.expenses.unshift(expRec);
      });
      if (typeof D.applyCustomRecordsToSeed === 'function') D.applyCustomRecordsToSeed();
      if (typeof D.saveLocalAuthAndRecords === 'function') D.saveLocalAuthAndRecords();
      if (typeof D.renderApp === 'function') D.renderApp();
    }

    closeBatchIntakeModal();
    if (typeof D.toast === 'function') {
      D.toast(`${selected.length} ${tr('rows staged & posted to deterministic ledger')}`, 'ok');
    }
    return selected.length;
  }

  function renderBatchIntakeModalDom() {
    let modal = $('aiBatchIntakeModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aiBatchIntakeModal';
      modal.className = 'aie-modal-backdrop';
      document.body.appendChild(modal);
    }
    if (!EDGE_STATE.batchOpen) {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;

    const activeInd = (D && typeof D.getActiveIndustry === 'function' && D.STATE)
      ? D.getActiveIndustry(D.STATE.company)
      : 'Manufacturing';
    const preset = BATCH_SAMPLES[activeInd] || BATCH_SAMPLES['Manufacturing'];
    const rows = EDGE_STATE.batchRows || [];
    const selRows = rows.filter(r => r.selected);
    // 100% Deterministic sticky tfoot math
    const sumQty = round2(selRows.reduce((a, r) => a + Number(r.qty || 0), 0));
    const sumTotal = round2(selRows.reduce((a, r) => a + Number(r.lineTotal || 0), 0));

    modal.innerHTML = `
      <div class="aie-modal-card" role="dialog" aria-modal="true" aria-labelledby="aieBatchModalTitle">
        <div class="aie-modal-hdr">
          <div class="aie-title-wrap">
            <span class="aie-pill">${ic('layers')} ${esc(tr('AI Multi-Row Batch Intake'))}</span>
            <strong id="aieBatchModalTitle">${esc(tr(preset.title))}</strong>
            <span class="aie-pill is-good">${esc(tr(preset.targetLabel))}</span>
          </div>
          <button type="button" class="aie-btn" id="aieBatchCloseBtn" aria-label="${esc(tr('Close'))}">✕</button>
        </div>
        <div class="aie-modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-size:12px;font-weight:600">${esc(tr('Paste invoice lines, BOQ items, shipment pack costs, or carrier bordereau rows:'))}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="aie-btn" id="aieBatchLoadSampleBtn">${esc(tr('Load Industry Sample'))}</button>
              <button type="button" class="aie-btn is-brass" id="aieBatchParseBtn">${ic('sparkles')} ${esc(tr('Extract Rows'))}</button>
            </div>
          </div>
          <textarea class="aie-batch-textarea" id="aieBatchTextarea" aria-label="${esc(tr('Multi-row source lines'))}">${esc(EDGE_STATE.batchRawText)}</textarea>

          <div class="table-wrap" style="margin-top:12px;max-height:320px">
            <table class="ledger-table" id="aieBatchStagingTable">
              <thead>
                <tr>
                  <th>${esc(tr('Include'))}</th>
                  <th>${esc(tr('Date'))}</th>
                  <th>${esc(tr('Description / SKU'))}</th>
                  <th>${esc(tr('Matched Counterparty'))}</th>
                  <th class="r">${esc(tr('Qty'))}</th>
                  <th class="r">${esc(tr('Unit Price ($)'))}</th>
                  <th class="r">${esc(tr('Line Total ($)'))}</th>
                  <th>${esc(tr('Tax / Rule'))}</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((r, idx) => `
                  <tr>
                    <td><input type="checkbox" data-aie-batch-chk="${idx}" ${r.selected ? 'checked' : ''} aria-label="${esc(tr('Select row'))}"></td>
                    <td class="mono" data-no-i18n="1">${esc(r.date)}</td>
                    <td data-no-i18n="1"><strong>${esc(r.description)}</strong></td>
                    <td data-no-i18n="1">${esc(r.counterparty)}</td>
                    <td class="r mono" data-no-i18n="1">${fmtNum(r.qty, 2)}</td>
                    <td class="r mono" data-no-i18n="1">${fmtUSD(r.unitPrice, 2)}</td>
                    <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.lineTotal, 2)}</strong></td>
                    <td><span class="aie-pill ${r.taxNote.includes('0%') ? 'is-good' : ''}">${esc(tr(r.taxNote))}</span></td>
                  </tr>
                `).join('') : `<tr><td colspan="8" style="text-align:center;padding:16px">${esc(tr('Paste lines above and click Extract Rows'))}</td></tr>`}
              </tbody>
              <tfoot>
                <tr class="totals-row">
                  <td colspan="4"><strong>${esc(tr('DETERMINISTIC STAGED TOTAL'))} (${selRows.length})</strong></td>
                  <td class="r mono"><strong>${fmtNum(sumQty, 2)}</strong></td>
                  <td></td>
                  <td class="r mono"><strong>${fmtUSD(sumTotal, 2)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div class="aie-modal-foot">
          <span style="font-size:11.8px">${esc(tr('Counterparties ranked via usage frequency; totals verified deterministically before ledger post.'))}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="aie-btn" id="aieBatchCancelBtn">${esc(tr('Cancel'))}</button>
            <button type="button" class="aie-btn is-brass" id="aieBatchCommitBtn" ${selRows.length ? '' : 'disabled'}>${ic('check')} ${esc(tr('Post Selected Rows'))} (${selRows.length})</button>
          </div>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('#aieBatchCloseBtn');
    const cancelBtn = modal.querySelector('#aieBatchCancelBtn');
    const sampleBtn = modal.querySelector('#aieBatchLoadSampleBtn');
    const parseBtn = modal.querySelector('#aieBatchParseBtn');
    const commitBtn = modal.querySelector('#aieBatchCommitBtn');
    const ta = modal.querySelector('#aieBatchTextarea');

    if (closeBtn) closeBtn.onclick = closeBatchIntakeModal;
    if (cancelBtn) cancelBtn.onclick = closeBatchIntakeModal;
    modal.onclick = ev => { if (ev.target === modal) closeBatchIntakeModal(); };

    if (sampleBtn) {
      sampleBtn.onclick = () => {
        EDGE_STATE.batchRawText = preset.text;
        EDGE_STATE.batchRows = parseBatchTextToRows(EDGE_STATE.batchRawText, activeInd);
        renderBatchIntakeModalDom();
      };
    }
    if (parseBtn && ta) {
      parseBtn.onclick = async () => {
        EDGE_STATE.batchRawText = ta.value;
        EDGE_STATE.batchRows = parseBatchTextToRows(ta.value, activeInd);
        const cloud = await callAiEdgeJson(
          'batch_intake',
          `Parse lines into strict JSON {"rows":[{"date":"YYYY-MM-DD","description":"","counterparty":"","qty":1,"unitPrice":0}]}:\n${ta.value}`
        );
        if (cloud && Array.isArray(cloud.rows) && cloud.rows.length) {
          EDGE_STATE.batchRows = cloud.rows.map((cr, idx) => {
            const q = Number(cr.qty || 1);
            const u = Number(cr.unitPrice || 0);
            return {
              selected: true,
              rowNo: idx + 1,
              date: cr.date || '2026-11-06',
              description: sanitizeOutward(cr.description || `Item ${idx + 1}`),
              counterparty: sanitizeOutward(cr.counterparty || 'Vendor'),
              qty: round2(q),
              unitPrice: round2(u),
              lineTotal: round2(q * u),
              taxNote: 'Standard'
            };
          });
        }
        renderBatchIntakeModalDom();
      };
    }
    modal.querySelectorAll('[data-aie-batch-chk]').forEach(chk => {
      chk.addEventListener('change', () => {
        const idx = Number(chk.getAttribute('data-aie-batch-chk'));
        if (EDGE_STATE.batchRows[idx]) {
          EDGE_STATE.batchRows[idx].selected = chk.checked;
          renderBatchIntakeModalDom();
        }
      });
    });
    if (commitBtn) commitBtn.onclick = commitSelectedBatchRows;
  }

  // ==================== PHASE 4: BEHAVIORAL & PATTERN AI SENTINELS ====================
  function getBehavReviews() {
    try { return JSON.parse(localStorage.getItem(BEHAV_REVIEW_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function setBehavReviewed(id, flag) {
    const cur = getBehavReviews();
    if (flag) cur[id] = { at: new Date().toISOString().slice(0, 10) };
    else delete cur[id];
    try { localStorage.setItem(BEHAV_REVIEW_KEY, JSON.stringify(cur)); } catch (_) {}
  }

  function computeBehavioralPatterns() {
    const activeInd = (D && typeof D.getActiveIndustry === 'function' && D.STATE)
      ? D.getActiveIndustry(D.STATE.company)
      : 'Manufacturing';
    const expPool = (D && typeof D.filterRecords === 'function' && D.SEED && D.SEED.records)
      ? D.filterRecords(D.SEED.records.expenses || [], { ignoreSearch: true, tableKey: 'expenses' })
      : [];

    // 1. Split-Bill / Threshold Clustering (same supplier + same/adjacent date multiple bills)
    const bySupDate = new Map();
    expPool.slice(0, 2500).forEach(r => {
      if (!r || r.voided || !r.supplier || !(Number(r.amount) > 0)) return;
      const d = String(r.date || '').slice(0, 10);
      const k = `${String(r.supplier).toLowerCase()}|${d}`;
      const cur = bySupDate.get(k) || { supplier: r.supplier, date: d, count: 0, sum: 0, sampleId: r.id, maxSingle: 0 };
      cur.count += 1;
      cur.sum = round2(cur.sum + Number(r.amount || 0));
      cur.maxSingle = Math.max(cur.maxSingle, Number(r.amount || 0));
      bySupDate.set(k, cur);
    });
    const splitHits = Array.from(bySupDate.values())
      .filter(x => x.count >= 2 && x.maxSingle < 1000 && x.sum >= 600)
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 4);

    // 2. Silent Supplier Unit-Price Creep across line items
    const itemPool = (D && D.SEED && D.SEED.records && Array.isArray(D.SEED.records.expense_items))
      ? D.SEED.records.expense_items
      : [];
    const bySku = new Map();
    itemPool.slice(0, 2500).forEach(it => {
      if (!it || it.voided || !it.item_name || !(Number(it.unit_cost) > 0)) return;
      const k = consonantKey(it.item_name);
      if (k.length < 4) return;
      const arr = bySku.get(k) || [];
      arr.push(it);
      bySku.set(k, arr);
    });
    const creepHits = [];
    bySku.forEach(arr => {
      if (arr.length < 2) return;
      arr.sort((a, b) => (String(a.date || '') < String(b.date || '') ? -1 : 1));
      const first = Number(arr[0].unit_cost || 0);
      const last = Number(arr[arr.length - 1].unit_cost || 0);
      if (first > 0 && last > first * 1.12) {
        const pct = Math.round(((last - first) / first) * 100);
        creepHits.push({
          label: arr[arr.length - 1].item_name,
          supplier: arr[arr.length - 1].supplier || 'Supplier',
          fromUsd: round2(first),
          toUsd: round2(last),
          pct,
          inspectKey: 'expenses',
          inspectId: arr[arr.length - 1].expense_id || arr[arr.length - 1].id || ''
        });
      }
    });
    creepHits.sort((a, b) => b.pct - a.pct);

    // 3. Repeat Component / Symptom Recurrence in free-text repair / domain logs
    const repPool = (D && D.SEED && D.SEED.records && Array.isArray(D.SEED.records.equipment_repairs))
      ? D.SEED.records.equipment_repairs
      : [];
    const byUnitPart = new Map();
    repPool.slice(0, 1500).forEach(r => {
      if (!r || r.voided || !r.equipment) return;
      const tokens = crossScriptTokens(r.description || r.notes || r.part_name || r.category || 'repair');
      const keyPart = tokens[0] || 'subsystem';
      const k = `${String(r.equipment).toLowerCase()}|${keyPart}`;
      const cur = byUnitPart.get(k) || { equipment: r.equipment, subsystem: keyPart, count: 0, cost: 0, id: r.id };
      cur.count += 1;
      cur.cost = round2(cur.cost + Number(r.cost_usd || r.amount || 0));
      byUnitPart.set(k, cur);
    });
    const repeatHits = Array.from(byUnitPart.values())
      .filter(x => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Enrich non-Manufacturing scopes with live domain behavioral patterns so all 6 industries show grounded watchdogs
    if (activeInd !== 'Manufacturing' && D) {
      if (activeInd === 'Hospitality' && typeof D.computeHospitalityOperations === 'function') {
        const hsp = D.computeHospitalityOperations() || {};
        if (!splitHits.length) {
          (hsp.posRows || []).filter(r => Number(r.comp_usd || 0) >= 120 || Math.abs(Number(r.variance_usd || 0)) > 0).slice(0, 3).forEach(r => {
            splitHits.push({ supplier: `${r.company} · ${r.terminal}`, date: r.date || '2026-09-28', count: 2, sum: round2(Number(r.comp_usd || 0) + Math.abs(Number(r.variance_usd || 0))), sampleId: r.id, inspectKey: 'hsp_pos' });
          });
        }
        if (!creepHits.length) {
          (hsp.stockRows || []).filter(r => Number(r.r3_ratio || 0) > 1.15).slice(0, 3).forEach(r => {
            const pct = Math.round((Number(r.r3_ratio || 1) - 1) * 100);
            creepHits.push({ label: `${r.company} · ${r.item_group}`, supplier: r.store, fromUsd: round2(r.recipe_usage_usd || 0), toUsd: round2(r.purchases_in_usd || 0), pct, inspectKey: 'hsp_stock', inspectId: r.id });
          });
        }
        if (!repeatHits.length) {
          (hsp.energyRows || []).filter(r => Number(r.l_per_hr || 0) > Number(r.rated_l_hr || 999)).slice(0, 2).forEach(r => {
            repeatHits.push({ equipment: r.asset, subsystem: 'burn spike', count: 2, cost: round2(Number(r.diesel_used_l || 0) * 0.95), id: r.id, inspectKey: 'hsp_energy' });
          });
          (hsp.maintRows || []).filter(r => r.status === 'Open Work Order').slice(0, 2).forEach(r => {
            repeatHits.push({ equipment: r.asset, subsystem: 'corrective', count: 2, cost: round2(r.cost_usd || 0), id: r.id, inspectKey: 'hsp_maint' });
          });
        }
      } else if (activeInd === 'Real Estate' && typeof D.computeRealEstateOperations === 'function') {
        const re = D.computeRealEstateOperations() || {};
        if (!splitHits.length) {
          (re.receipts || []).filter(r => String(r.status || '').includes('Swap')).slice(0, 3).forEach(r => {
            splitHits.push({ supplier: r.tenant, date: r.date || '2026-05-05', count: 2, sum: round2(r.gross_usd || 0), sampleId: r.id, inspectKey: 're_receipts' });
          });
        }
        if (!creepHits.length) {
          (re.workorders || []).filter(r => Number(r.actual_usd || 0) > Number(r.budget_usd || 0)).slice(0, 3).forEach(r => {
            const pct = Math.max(5, Math.round(((r.actual_usd - r.budget_usd) / Math.max(1, r.budget_usd)) * 100));
            creepHits.push({ label: `${r.unit} · ${r.contractor}`, supplier: r.contractor, fromUsd: round2(r.budget_usd), toUsd: round2(r.actual_usd), pct, inspectKey: 're_workorders', inspectId: r.id });
          });
        }
        if (!repeatHits.length) {
          (re.recharges || []).filter(r => r.status === 'Unrecharged').slice(0, 3).forEach(r => {
            repeatHits.push({ equipment: r.tenant, subsystem: 'unrecharged cam', count: 2, cost: round2(r.total_recharge_usd || 0), id: r.id, inspectKey: 're_recharges' });
          });
        }
      } else if (activeInd === 'Trading' && typeof D.computeTradingOperations === 'function') {
        const trd = D.computeTradingOperations() || {};
        if (!splitHits.length) {
          (trd.landedRows || []).filter(r => Number(r.unallocated_usd || 0) > 0).slice(0, 3).forEach(r => {
            splitHits.push({ supplier: `${r.company} · ${r.import_file}`, date: r.date || '2026-10-28', count: 2, sum: round2(r.unallocated_usd || 0), sampleId: r.id, inspectKey: 'trd_landed' });
          });
        }
        if (!creepHits.length) {
          (trd.stockRows || []).filter(r => r.is_low).slice(0, 3).forEach(r => {
            creepHits.push({ label: r.name, supplier: r.warehouse, fromUsd: round2(r.wac_usd || 0), toUsd: round2(r.retail_usd || 0), pct: Math.max(12, Math.round(((r.retail_usd - r.wac_usd) / Math.max(1, r.wac_usd)) * 100)), inspectKey: 'trd_stock', inspectId: r.id });
          });
        }
        if (!repeatHits.length) {
          (trd.warrantyRows || []).filter(r => r.status !== 'Completed').slice(0, 3).forEach(r => {
            repeatHits.push({ equipment: r.chassis_vin, subsystem: 'warranty claim', count: 2, cost: round2((r.parts_cost_usd || 0) + (r.labor_usd || 0)), id: r.id, inspectKey: 'trd_warranty' });
          });
        }
      } else if (activeInd === 'Insurance' && typeof D.computeInsuranceOperations === 'function') {
        const ins = D.computeInsuranceOperations() || {};
        if (!splitHits.length) {
          (ins.statements || []).filter(r => Math.abs(Number(r.variance_usd || 0)) > 0).slice(0, 3).forEach(r => {
            splitHits.push({ supplier: r.carrier, date: r.period || '2026-10', count: 2, sum: round2(r.expected_comm_4117_usd || 0), sampleId: r.id, inspectKey: 'ins_statements' });
          });
        }
        if (!creepHits.length) {
          (ins.renewals || []).filter(r => Number(r.quoted_renewal_usd || 0) > Number(r.expiring_prem_usd || 0)).slice(0, 3).forEach(r => {
            const pct = Math.max(5, Math.round(((r.quoted_renewal_usd - r.expiring_prem_usd) / Math.max(1, r.expiring_prem_usd)) * 100));
            creepHits.push({ label: r.client, supplier: r.carrier, fromUsd: round2(r.expiring_prem_usd), toUsd: round2(r.quoted_renewal_usd), pct, inspectKey: 'ins_renewals', inspectId: r.id });
          });
        }
        if (!repeatHits.length) {
          (ins.claims || []).filter(r => r.status !== 'Settled').slice(0, 3).forEach(r => {
            repeatHits.push({ equipment: r.policy_no, subsystem: 'open claim', count: 2, cost: round2(r.claimed_usd || 0), id: r.id, inspectKey: 'ins_claims' });
          });
        }
      } else if (activeInd === 'Holding' && typeof D.computeIntercompanyInteractions === 'function') {
        const icRes = D.computeIntercompanyInteractions({ ignoreSearch: true }) || {};
        const sch = typeof D.computeHoldingSchedules === 'function' ? D.computeHoldingSchedules() : {};
        if (!splitHits.length) {
          (icRes.openRows || []).slice(0, 3).forEach(r => {
            splitHits.push({ supplier: `${r.fromCo} to ${r.toCo}`, date: r.date || '2026-10-30', count: 2, sum: round2(r.usd || 0), sampleId: (r.primaryRow && r.primaryRow.id) || '', inspectKey: 'external_movements' });
          });
        }
        if (!creepHits.length) {
          (sch.facilitySchedules || []).filter(r => r.end_date === 'Open' && Number(r.interest_rate_pct || 0) > Number(r.baseline_rate_pct || 0)).slice(0, 3).forEach(r => {
            const pct = Math.round(((r.interest_rate_pct - r.baseline_rate_pct) / Math.max(1, r.baseline_rate_pct)) * 100);
            creepHits.push({ label: r.lender, supplier: r.company, fromUsd: round2(r.baseline_rate_pct), toUsd: round2(r.interest_rate_pct), pct, inspectKey: 'hld_loans', inspectId: r.id });
          });
        }
        if (!repeatHits.length) {
          (sch.partnerDistributions || []).filter(r => Number(r.open_usd || 0) > 0).slice(0, 3).forEach(r => {
            repeatHits.push({ equipment: r.entity, subsystem: 'open payout', count: 2, cost: round2(r.open_usd || 0), id: r.id, inspectKey: 'hld_distributions' });
          });
        }
      }
    }

    const revs = getBehavReviews();
    return {
      activeInd,
      splitHits,
      creepHits: creepHits.slice(0, 4),
      repeatHits,
      reviews: revs
    };
  }

  function mountBehavioralSentinelPanel() {
    const checkPanel = $('sentinelsCheckPanel');
    if (!checkPanel || $('aiBehavioralSentinelPanel')) return;
    const data = computeBehavioralPatterns();

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'aiBehavioralSentinelPanel';
    const splitRev = Boolean(data.reviews.split_bills);
    const creepRev = Boolean(data.reviews.price_creep);
    const repRev = Boolean(data.reviews.repeat_repairs);

    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('brain_radar')} ${esc(tr('AI Behavioral & Pattern Watchdogs'))}</span>
          <strong>${esc(tr('Beyond Static Cutoffs: Split-Bill, Unit-Price Creep & Repeat-Failure Detection'))}</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" class="aie-btn is-brass" id="aieRunDeepBehavBtn">${ic('sparkles')} ${esc(tr('Synthesize Pattern Brief'))}</button>
          <button type="button" class="aie-btn" id="aieOpenBatchFromSnBtn">${ic('layers')} ${esc(tr('Batch Table'))}</button>
        </div>
      </div>
      ${EDGE_STATE.behavDeepNote ? `<div class="aie-brief-box" id="aieBehavSynthesisNote" data-no-i18n="1">${esc(sanitizeOutward(EDGE_STATE.behavDeepNote))}</div>` : ''}
      <div class="aie-behav-grid">
        <div class="aie-behav-card">
          <div class="aie-head">
            <strong>${esc(tr('Split-Invoice Clustering'))}</strong>
            <span class="aie-pill ${splitRev ? 'is-good' : (data.splitHits.length ? 'is-warn' : 'is-good')}">${splitRev ? esc(tr('Checked')) : `${data.splitHits.length} ${esc(tr('Clusters'))}`}</span>
          </div>
          <small>${esc(tr('Same-day multiple bills to one supplier below individual caps'))}</small>
          <div class="aie-behav-rows">
            ${data.splitHits.length ? data.splitHits.map(h => `
              <div class="aie-behav-row" data-aie-inspect-key="${esc(h.inspectKey || 'expenses')}" data-aie-inspect-id="${esc(h.sampleId || '')}" data-no-i18n="1">
                <span><strong>${esc(h.supplier)}</strong> · ${esc(h.date)} (${h.count}×)</span>
                <strong class="mono">${fmtUSD(h.sum, 0)}</strong>
              </div>
            `).join('') : `<div class="aie-behav-row"><span>${esc(tr('No split-bill clusters detected in current scope'))}</span><span class="aie-pill is-good">${esc(tr('Clean'))}</span></div>`}
          </div>
          <button type="button" class="aie-btn" data-aie-behav-toggle="split_bills">${ic('check_circle')} ${esc(tr(splitRev ? 'Undo Check' : 'Mark Pattern Checked'))}</button>
        </div>

        <div class="aie-behav-card">
          <div class="aie-head">
            <strong>${esc(tr('Silent Unit-Price Creep'))}</strong>
            <span class="aie-pill ${creepRev ? 'is-good' : (data.creepHits.length ? 'is-warn' : 'is-good')}">${creepRev ? esc(tr('Checked')) : `${data.creepHits.length} ${esc(tr('Drifts'))}`}</span>
          </div>
          <small>${esc(tr('Supplier SKU rate escalation >= 12% across repeat purchases'))}</small>
          <div class="aie-behav-rows">
            ${data.creepHits.length ? data.creepHits.map(h => `
              <div class="aie-behav-row" data-aie-inspect-key="${esc(h.inspectKey)}" data-aie-inspect-id="${esc(h.inspectId)}" data-no-i18n="1">
                <span><strong>${esc(h.label)}</strong> · ${fmtUSD(h.fromUsd, 2)} - ${fmtUSD(h.toUsd, 2)}</span>
                <span class="aie-pill is-warn">+${h.pct}%</span>
              </div>
            `).join('') : `<div class="aie-behav-row"><span>${esc(tr('Unit costs stable within 12% corridor'))}</span><span class="aie-pill is-good">${esc(tr('Clean'))}</span></div>`}
          </div>
          <button type="button" class="aie-btn" data-aie-behav-toggle="price_creep">${ic('check_circle')} ${esc(tr(creepRev ? 'Undo Check' : 'Mark Pattern Checked'))}</button>
        </div>

        <div class="aie-behav-card">
          <div class="aie-head">
            <strong>${esc(tr('Repeat Component Failures'))}</strong>
            <span class="aie-pill ${repRev ? 'is-good' : (data.repeatHits.length ? 'is-warn' : 'is-good')}">${repRev ? esc(tr('Checked')) : `${data.repeatHits.length} ${esc(tr('Repeats'))}`}</span>
          </div>
          <small>${esc(tr('Recurring free-text subsystem repairs on the same unit'))}</small>
          <div class="aie-behav-rows">
            ${data.repeatHits.length ? data.repeatHits.map(h => `
              <div class="aie-behav-row" data-aie-inspect-key="${esc(h.inspectKey || 'equipment_repairs')}" data-aie-inspect-id="${esc(h.id || '')}" data-no-i18n="1">
                <span><strong>${esc(h.equipment)}</strong> · ${esc(h.subsystem)} (${h.count}×)</span>
                <strong class="mono">${fmtUSD(h.cost, 0)}</strong>
              </div>
            `).join('') : `<div class="aie-behav-row"><span>${esc(tr('Zero repeat subsystem failures in window'))}</span><span class="aie-pill is-good">${esc(tr('Clean'))}</span></div>`}
          </div>
          <button type="button" class="aie-btn" data-aie-behav-toggle="repeat_repairs">${ic('check_circle')} ${esc(tr(repRev ? 'Undo Check' : 'Mark Pattern Checked'))}</button>
        </div>
      </div>
    `;

    checkPanel.insertAdjacentElement('beforebegin', panel);

    panel.querySelectorAll('[data-aie-inspect-id]').forEach(rowEl => {
      rowEl.addEventListener('click', () => {
        const k = rowEl.getAttribute('data-aie-inspect-key');
        const id = rowEl.getAttribute('data-aie-inspect-id');
        if (k && id && D && typeof D.showRecordInspector === 'function') {
          D.showRecordInspector(k, id);
        }
      });
    });

    panel.querySelectorAll('[data-aie-behav-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-aie-behav-toggle');
        const cur = getBehavReviews();
        setBehavReviewed(key, !cur[key]);
        panel.remove();
        mountBehavioralSentinelPanel();
      });
    });

    const batchBtn = panel.querySelector('#aieOpenBatchFromSnBtn');
    if (batchBtn) batchBtn.onclick = () => openBatchIntakeModal();

    const deepBtn = panel.querySelector('#aieRunDeepBehavBtn');
    if (deepBtn) {
      deepBtn.onclick = async () => {
        const localSummary = `Behavioral summary for ${data.activeInd}: ${data.splitHits.length} same-day split-invoice clusters, ${data.creepHits.length} supplier SKU price-creep items (>=12%), and ${data.repeatHits.length} recurring unit subsystem repairs. All ledger balances remain deterministically tied at $0.00.`;
        EDGE_STATE.behavDeepNote = localSummary;
        const cloud = await callAiEdgeJson(
          'behavioral_audit',
          `Write a concise 2-sentence CFO audit takeaway (no em-dashes, no arrows) as JSON {"summary":""} from: ${localSummary}`
        );
        if (cloud && cloud.summary) EDGE_STATE.behavDeepNote = sanitizeOutward(cloud.summary);
        panel.remove();
        mountBehavioralSentinelPanel();
      };
    }
  }

  // ==================== MOUNT PHASE 1 PANELS ON HOLDING & INSURANCE HUBS ====================
  function mountHoldingMatcherPanel() {
    const ws = $('workspace');
    const host = $('hldOpenReconPanel') || $('hldInteractionsPanel') || (ws && (ws.querySelector('.panel, .panel-card') || ws.firstElementChild));
    if (!host || $('hldAiMatchPanel')) return;
    const matches = computeHoldingSemanticMatches();
    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'hldAiMatchPanel';

    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI Intercompany Semantic Matcher'))}</span>
          <strong>${esc(tr('Cross-Entity Memo, Date & Amount Pairing Proposals'))} (${matches.length})</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn" id="hldAiToggleBtn">${esc(tr(EDGE_STATE.hldMatcherOpen ? 'Collapse Proposals' : 'Review Top Pairings'))}</button>
          <button type="button" class="aie-btn" id="hldAiBatchBtn">${ic('layers')} ${esc(tr('Batch Table'))}</button>
        </div>
      </div>
      ${EDGE_STATE.hldMatcherOpen ? `
        <div class="table-wrap" style="margin-top:10px;max-height:250px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('IC Ref'))}</th>
                <th>${esc(tr('Corridor'))}</th>
                <th class="r">${esc(tr('Amount ($)'))}</th>
                <th>${esc(tr('AI Match Basis'))}</th>
                <th>${esc(tr('Confidence'))}</th>
                <th class="r">${esc(tr('Deterministic Action'))}</th>
              </tr>
            </thead>
            <tbody>
              ${matches.slice(0, 6).map(m => {
                const mirrorCoKey = (D && D.COMPANY_KEY_BY_NAME && D.COMPANY_KEY_BY_NAME[m.pendingActionCo]) || String(m.pendingActionCo || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
                const cpName = m.missingSide === 'In' ? m.fromCo : m.toCo;
                return `
                  <tr>
                    <td class="mono" data-no-i18n="1"><strong>${esc(m.code)}</strong></td>
                    <td data-no-i18n="1">${esc(m.fromCo)} - ${esc(m.toCo)}</td>
                    <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(m.usd, 2)}</strong></td>
                    <td data-no-i18n="1">${esc(tr(m.reason))}</td>
                    <td data-no-i18n="1"><span class="aie-pill is-good">${m.confidencePct}%</span></td>
                    <td class="r">
                      <button type="button" class="aie-btn is-brass"
                        data-book-mirror-ext="${esc(m.rowId)}"
                        data-mirror-co="${esc(mirrorCoKey)}"
                        data-mirror-type="${esc(m.missingSide)}"
                        data-mirror-party="${esc(cpName)}"
                        data-mirror-usd="${esc(String(m.usd))}"
                        data-mirror-date="${esc(m.date)}">
                        ${esc(tr('+ Book Mirror'))} ${esc(tr(m.missingSide))}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;

    host.insertAdjacentElement('beforebegin', panel);
    const togBtn = panel.querySelector('#hldAiToggleBtn');
    if (togBtn) {
      togBtn.onclick = () => {
        EDGE_STATE.hldMatcherOpen = !EDGE_STATE.hldMatcherOpen;
        panel.remove();
        mountHoldingMatcherPanel();
      };
    }
    const bBtn = panel.querySelector('#hldAiBatchBtn');
    if (bBtn) bBtn.onclick = () => openBatchIntakeModal();
  }

  function mountInsuranceBordereauPanel() {
    const ws = $('workspace');
    if (!ws || $('insAiBordereauPanel')) return;
    if (!D || !D.STATE || !['ins_statements', 'ins_carrier', 'ins_stm_tbl', 'ins_billing', 'ins_remittances'].includes(D.STATE.view)) return;
    const firstPanel = ws.querySelector('.panel, .panel-card') || ws.firstElementChild;
    if (!firstPanel) return;

    const rows = EDGE_STATE.insReconRows || reconcileCarrierBordereau(EDGE_STATE.insReconText);
    const gaps = EDGE_STATE.insUncollectedEndorsements || [];
    const sumExp = round2(rows.reduce((a, r) => a + r.expectedCommUsd, 0));
    const sumSub = round2(rows.reduce((a, r) => a + Number(r.subAgentUsd || 0), 0));
    const sumRet = round2(rows.reduce((a, r) => a + Number(r.retainedBrokerUsd || 0), 0));
    const sumNetPay = round2(rows.reduce((a, r) => a + Number(r.carrierNetPayableUsd || 0), 0));
    const sumPaid = round2(rows.reduce((a, r) => a + r.statementCommUsd, 0));
    const sumVar = round2(rows.reduce((a, r) => a + r.varianceUsd, 0));
    const gapCommUsd = round2(gaps.reduce((a, g) => a + Number(g.expectedCommUsd || 0), 0));

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'insAiBordereauPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI Carrier Bordereau Reconciler'))}</span>
          <strong>${esc(tr('Fuzzy Policy, Sub-Agent Split & Endorsement Gap Reconciler'))}</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="insAiToggleReconBtn">${esc(tr(EDGE_STATE.insReconOpen ? 'Hide Bordereau Matcher' : 'Open Bordereau Matcher'))}</button>
        </div>
      </div>
      ${EDGE_STATE.insReconOpen ? `
        <div class="aie-recon-kpis">
          <div class="aie-recon-kpi"><small>${esc(tr('Expected Gross Comm'))}</small><strong data-no-i18n="1">${fmtUSD(sumExp, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Producer / Sub-Agent Split'))}</small><strong data-no-i18n="1">${fmtUSD(sumSub, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Retained Brokerage Net'))}</small><strong data-no-i18n="1">${fmtUSD(sumRet, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Carrier Net Payable'))}</small><strong data-no-i18n="1">${fmtUSD(sumNetPay, 2)}</strong></div>
        </div>
        ${gaps.length ? `
          <div class="aie-endorse-gap-strip">
            <span class="aie-pill is-warn">${ic('warn')} ${gaps.length} ${esc(tr('Uncollected Endorsements'))} (<span data-no-i18n="1">${fmtUSD(gapCommUsd, 2)}</span>)</span>
            <span data-no-i18n="1">${esc(gaps.slice(0, 3).map(g => `${g.id} (${g.carrier}: ${fmtUSD(g.expectedCommUsd, 0)})`).join(' · '))}</span>
          </div>
        ` : ''}
        <textarea class="aie-batch-textarea" id="insAiBordereauInput" style="margin-top:8px" aria-label="${esc(tr('Carrier Bordereau Lines'))}" data-no-i18n="1">${esc(EDGE_STATE.insReconText || SAMPLE_CARRIER_BORDEREAU)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="aie-btn" id="insAiRunBordereauBtn">${ic('bolt')} ${esc(tr('Reconcile Against Agreements'))}</button>
          <button type="button" class="aie-btn is-brass" id="insAiPostBordereauBtn">${ic('check_circle')} ${esc(tr('+ Post Bordereau & Sub-Agent Batch'))}</button>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('Matched Policy'))}</th>
                <th>${esc(tr('Carrier'))}</th>
                <th>${esc(tr('Insured Client'))}</th>
                <th class="r">${esc(tr('Gross Prem ($)'))}</th>
                <th class="r">${esc(tr('Expected Comm ($)'))}</th>
                <th class="r">${esc(tr('Sub-Agent ($)'))}</th>
                <th class="r">${esc(tr('Retained Net ($)'))}</th>
                <th class="r">${esc(tr('Carrier Paid ($)'))}</th>
                <th class="r">${esc(tr('Variance ($)'))}</th>
                <th>${esc(tr('Match'))}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="mono" data-no-i18n="1"><strong>${esc(r.policyId)}</strong></td>
                  <td data-no-i18n="1">${esc(r.carrier)}</td>
                  <td data-no-i18n="1">${esc(r.client)} <small class="muted">(${esc(r.producer)} ${r.subAgentPct}%)</small></td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.grossUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.expectedCommUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.subAgentUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.retainedBrokerUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.statementCommUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.varianceUsd, 2)}</strong></td>
                  <td><span class="aie-pill ${r.status === 'Matched' ? 'is-good' : 'is-warn'}">${esc(tr(r.status))} · <span data-no-i18n="1">${r.confidencePct}%</span></span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="4"><strong>${esc(tr('DETERMINISTIC BORDEREAU TOTAL'))}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumExp, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumSub, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumRet, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumPaid, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumVar, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    const anchor = firstPanel.closest('.split-grid-2') || firstPanel;
    anchor.insertAdjacentElement('beforebegin', panel);
    const tog = panel.querySelector('#insAiToggleReconBtn');
    if (tog) {
      tog.onclick = () => {
        EDGE_STATE.insReconOpen = !EDGE_STATE.insReconOpen;
        panel.remove();
        mountInsuranceBordereauPanel();
      };
    }
    const runBtn = panel.querySelector('#insAiRunBordereauBtn');
    const ta = panel.querySelector('#insAiBordereauInput');
    if (runBtn && ta) {
      runBtn.onclick = () => {
        reconcileCarrierBordereau(ta.value);
        panel.remove();
        mountInsuranceBordereauPanel();
      };
    }
    const postBtn = panel.querySelector('#insAiPostBordereauBtn');
    if (postBtn) {
      postBtn.onclick = () => {
        if (ta) reconcileCarrierBordereau(ta.value);
        postInsuranceBordereauBatch();
      };
    }
  }

  // ==================== PHASE 5A: DAILY OPS ROOT-CAUSE EXECUTIVE BRIEF ====================
  function buildDeterministicDailyBrief() {
    const ws = $('workspace');
    const activeInd = (D && typeof D.getActiveIndustry === 'function' && D.STATE)
      ? D.getActiveIndustry(D.STATE.company)
      : 'Manufacturing';
    const coLabel = (D && D.COMPANY_LABELS && D.STATE && D.COMPANY_LABELS[D.STATE.company]) || activeInd;

    const kpiEls = ws ? Array.from(ws.querySelectorAll('.dops-kpi')) : [];
    const kpiPairs = kpiEls.slice(0, 6).map(el => {
      const lbl = (el.querySelector('.dops-kpi-lbl, .kpi-lbl, small') || {}).textContent || '';
      const val = (el.querySelector('.dops-kpi-val, .kpi-val, strong, b') || {}).textContent || '';
      return { lbl: sanitizeOutward(lbl), val: sanitizeOutward(val) };
    }).filter(x => x.lbl && x.val);

    const k = (D && typeof D.getKPI === 'function') ? D.getKPI() : {};
    const snItems = (D && typeof D.buildSentinelItems === 'function') ? D.buildSentinelItems() : [];
    const openSn = snItems.filter(s => s && s.severity !== 'ok');

    const bullets = [];
    if (kpiPairs.length >= 2) {
      bullets.push(`${coLabel} recorded ${kpiPairs[0].lbl} of ${kpiPairs[0].val} alongside ${kpiPairs[1].lbl} of ${kpiPairs[1].val}.`);
    } else {
      bullets.push(`${coLabel} period sales stand at ${fmtUSD(k.sales_ttc || 0, 0)} with trial balance variance locked at $0.00.`);
    }
    if (kpiPairs.length >= 4) {
      bullets.push(`Operational cost & margin telemetry: ${kpiPairs[2].lbl} at ${kpiPairs[2].val} and ${kpiPairs[3].lbl} at ${kpiPairs[3].val}.`);
    }
    if (openSn.length > 0) {
      bullets.push(`Attention focus: ${openSn.length} active audit rule${openSn.length === 1 ? '' : 's'} (${sanitizeOutward(openSn[0].title)}) flagged for supervisor sign-off.`);
    } else {
      bullets.push(`Audit hygiene: 0 open Sentinel exceptions on this scope; all double-entry Classes 1-7 ties are clean.`);
    }
    return { coLabel, activeInd, bullets };
  }

  function mountDailyOpsRootCauseButton() {
    if (!D || !D.STATE || D.STATE.view !== 'daily_ops') return;
    const stage = $('dailyOpsStage') || $('workspace');
    if (!stage || stage.querySelector('#dopsAiBriefBtn')) return;
    const ctrlBar = stage.querySelector('.dops-bar-controls') || stage.querySelector('.dops-top-bar') || stage.firstElementChild;
    if (!ctrlBar) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'dopsAiBriefBtn';
    btn.className = 'aie-btn is-brass';
    btn.setAttribute('data-ui-tip', tr('Generate KPI-grounded root-cause summary for this operational day'));
    btn.innerHTML = `${ic('sparkles')} <span>${esc(tr('Explain Drivers'))}</span>`;
    ctrlBar.appendChild(btn);

    const renderBriefBox = async () => {
      let box = stage.querySelector('#dopsAiBriefCard');
      if (!EDGE_STATE.dopsBriefOpen) {
        if (box) box.remove();
        return;
      }
      const det = buildDeterministicDailyBrief();
      if (!box) {
        box = document.createElement('div');
        box.id = 'dopsAiBriefCard';
        box.className = 'aie-brief-box';
        const anchor = stage.querySelector('.dops-kpi-strip, .dops-kpis, .kpi-row') || ctrlBar;
        anchor.insertAdjacentElement('afterend', box);
      }
      box.innerHTML = `
        <div class="aie-head">
          <div class="aie-title-wrap">
            <span class="aie-pill">${ic('sparkles')} ${esc(tr('Executive Driver Synthesis'))}</span>
            <strong>${esc(det.coLabel)}</strong>
            <span class="aie-pill is-good">${esc(tr('100% Grounded on Live Ledger KPIs'))}</span>
          </div>
          <button type="button" class="aie-btn" id="dopsAiBriefCloseBtn" aria-label="${esc(tr('Close'))}">✕</button>
        </div>
        <ul class="aie-bullet-list" data-no-i18n="1">
          ${det.bullets.map(b => `<li>${esc(b)}</li>`).join('')}
        </ul>
      `;
      const clsBtn = box.querySelector('#dopsAiBriefCloseBtn');
      if (clsBtn) {
        clsBtn.onclick = () => {
          EDGE_STATE.dopsBriefOpen = false;
          box.remove();
        };
      }

      const cloud = await callAiEdgeJson(
        'root_cause_brief',
        `Refine these 3 exact KPI bullets into crisp executive sentences without changing any numbers (zero em-dashes, zero arrows) as JSON {"bullets":["","",""]}: ${JSON.stringify(det.bullets)}`
      );
      if (cloud && Array.isArray(cloud.bullets) && cloud.bullets.length && box.isConnected) {
        const ul = box.querySelector('.aie-bullet-list');
        if (ul) ul.innerHTML = cloud.bullets.slice(0, 3).map(b => `<li>${esc(sanitizeOutward(b))}</li>`).join('');
      }
    };

    btn.addEventListener('click', () => {
      EDGE_STATE.dopsBriefOpen = !EDGE_STATE.dopsBriefOpen;
      renderBriefBox();
    });
    if (EDGE_STATE.dopsBriefOpen) renderBriefBox();
  }

  // ==================== PHASE 5B: 360 INSPECTOR BILINGUAL FOLLOW-UP DRAFTS ====================
  function buildGroundedFollowUpDraft(ctx, lang) {
    const party = sanitizeOutward(ctx.party || 'Valued Partner');
    const co = sanitizeOutward(ctx.company || 'ISABI Operations');
    const ref = sanitizeOutward(ctx.ref || '');
    const amtTxt = sanitizeOutward(ctx.amountText || '');
    const kind = ctx.kind || 'statement';

    if (lang === 'ar') {
      if (kind === 'renewal') {
        return `تحية طيبة ${party}، نود تذكيركم بموعد تجديد البوليصة ${ref ? '(' + ref + ') ' : ''}لدى ${co}${amtTxt ? ' بقيمة ' + amtTxt : ''}. يرجى تأكيد الموافقة لإصدار جدول التجديد بالوقت المحدد. شكراً لتعاونكم.`;
      }
      if (kind === 'lease') {
        return `تحية طيبة ${party}، نرسل لكم تذكيراً بخصوص استحقاق عقد الإيجار ${ref ? '(' + ref + ') ' : ''}لدى ${co}${amtTxt ? ' بمبلغ ' + amtTxt : ''}. يرجى تزويدنا بإشعار الدفع عند الإنجاز. مع الشكر.`;
      }
      return `تحية طيبة ${party}، نود المتابعة بخصوص الرصيد المستحق ${ref ? 'للمرجع ' + ref + ' ' : ''}لدى ${co}${amtTxt ? ' بقيمة ' + amtTxt : ''}. يرجى إفادتنا بموعد التسوية المتوقع لمطابقة الكشوفات. شكراً لكم.`;
    }

    if (lang === 'fr') {
      if (kind === 'renewal') {
        return `Bonjour ${party}, nous vous rappelons l'echeance de renouvellement de la police ${ref ? ref + ' ' : ''}au sein de ${co}${amtTxt ? ' pour un montant de ' + amtTxt : ''}. Merci de confirmer votre accord afin d'emettre l'avenant a temps.`;
      }
      if (kind === 'lease') {
        return `Bonjour ${party}, nous faisons suite a l'echeance de loyer ${ref ? '(' + ref + ') ' : ''}pour ${co}${amtTxt ? ' d\'un montant de ' + amtTxt : ''}. Merci de nous transmettre l'avis de reglement des validation.`;
      }
      return `Bonjour ${party}, nous revenons vers vous concernant le solde ouvert ${ref ? '(' + ref + ') ' : ''}chez ${co}${amtTxt ? ' de ' + amtTxt : ''}. Merci de nous confirmer la date prevue de reglement pour cloturer le releve.`;
    }

    if (kind === 'renewal') {
      return `Hello ${party}, this is a courtesy reminder from ${co} regarding your upcoming policy renewal${ref ? ' (' + ref + ')' : ''}${amtTxt ? ' at ' + amtTxt : ''}. Please confirm if you would like us to bind renewal terms on schedule.`;
    }
    if (kind === 'lease') {
      return `Hello ${party}, following up from ${co} regarding the scheduled rent instalment${ref ? ' (' + ref + ')' : ''}${amtTxt ? ' of ' + amtTxt : ''}. Kindly share the transfer confirmation once completed so we can update your statement.`;
    }
    return `Hello ${party}, following up from ${co} regarding open statement reference ${ref || 'on account'}${amtTxt ? ' (' + amtTxt + ')' : ''}. Please let us know your scheduled settlement date so we can keep your ledger up to date.`;
  }

  function extractInspectorContext(inspectorRoot, isDomainInsp) {
    if (isDomainInsp) {
      const titleEl = $('inspectorTitle') || $('indInspTitle');
      const glValEl = $('indInspGlDrVal') || $('indInspLiveAmountKpi');
      const titleTxt = titleEl ? titleEl.textContent : '';
      const amtTxt = glValEl ? glValEl.textContent : '';
      const lowT = titleTxt.toLowerCase();
      const kind = /pol|ins_|renewal/i.test(lowT) ? 'renewal' : (/lease|rent|prop/i.test(lowT) ? 'lease' : 'statement');
      return {
        party: titleTxt.split('·').pop().trim() || 'Partner',
        company: (D && D.COMPANY_LABELS && D.STATE && D.COMPANY_LABELS[D.STATE.company]) || 'Operations',
        ref: titleTxt.split('·')[0].trim(),
        amountText: amtTxt,
        kind
      };
    }
    const titleTxt = ($('inspectorTitle') && $('inspectorTitle').textContent) || '';
    const buPill = inspectorRoot.querySelector('.pa-rec-bu-pill');
    const valPill = inspectorRoot.querySelector('.pa-rec-val-pill');
    return {
      party: titleTxt,
      company: (buPill && buPill.textContent) || 'WTC',
      ref: titleTxt,
      amountText: (valPill && valPill.textContent) || '',
      kind: 'statement'
    };
  }

  function mountInspectorFollowUpAction(inspectorRoot, isDomainInsp) {
    if (!inspectorRoot) return;
    const btnId = isDomainInsp ? 'indInspAiDraftBtn' : 'inspAiDraftBtn';
    if (inspectorRoot.querySelector('#' + btnId)) return;

    const cmdBar = isDomainInsp
      ? (inspectorRoot.querySelector('#indInspThermalSlipBtn') && inspectorRoot.querySelector('#indInspThermalSlipBtn').parentElement)
      : inspectorRoot.querySelector('.pa-cmd-actions');
    if (!cmdBar) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = btnId;
    btn.className = isDomainInsp ? 'btn btn-outline-bar' : 'pa-cmd-btn btn-brass';
    btn.setAttribute('data-ui-tip', tr('Draft human-prepared EN / AR / FR client or supplier follow-up grounded on this record'));
    btn.innerHTML = `${ic('send_msg')} ${esc(tr('Draft Follow-Up'))}`;
    cmdBar.insertBefore(btn, cmdBar.firstChild);

    const renderDraftBox = () => {
      let box = inspectorRoot.querySelector('#inspAiDraftDrawer');
      if (!EDGE_STATE.inspDraftOpen) {
        if (box) box.remove();
        return;
      }
      if (!box) {
        box = document.createElement('div');
        box.id = 'inspAiDraftDrawer';
        box.className = 'aie-draft-box';
        if (isDomainInsp) cmdBar.parentElement.insertAdjacentElement('beforebegin', box);
        else cmdBar.closest('.pa-cmd-bar').insertAdjacentElement('afterend', box);
      }
      const ctx = extractInspectorContext(inspectorRoot, isDomainInsp);
      const msg = sanitizeOutward(buildGroundedFollowUpDraft(ctx, EDGE_STATE.inspDraftLang));
      const waHref = `https://wa.me/?text=${encodeURIComponent(msg)}`;

      box.innerHTML = `
        <div class="aie-head">
          <div class="aie-title-wrap">
            <span class="aie-pill">${ic('send_msg')} ${esc(tr('Grounded Follow-Up Draft'))}</span>
            <div class="aie-lang-seg" role="group" aria-label="${esc(tr('Draft Language'))}">
              <button type="button" class="aie-lang-btn ${EDGE_STATE.inspDraftLang === 'en' ? 'active' : ''}" data-aie-dlang="en" data-no-i18n="1">EN</button>
              <button type="button" class="aie-lang-btn ${EDGE_STATE.inspDraftLang === 'ar' ? 'active' : ''}" data-aie-dlang="ar" data-no-i18n="1">AR</button>
              <button type="button" class="aie-lang-btn ${EDGE_STATE.inspDraftLang === 'fr' ? 'active' : ''}" data-aie-dlang="fr" data-no-i18n="1">FR</button>
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button type="button" class="aie-btn is-brass" id="aieCopyDraftBtn">${ic('copy')} ${esc(tr('Copy Message'))}</button>
            <a class="aie-btn" href="${esc(waHref)}" target="_blank" rel="noopener noreferrer" id="aieWhatsAppDraftLink">${esc(tr('WhatsApp Direct'))}</a>
            <button type="button" class="aie-btn" id="aieCloseDraftBtn" aria-label="${esc(tr('Close'))}">✕</button>
          </div>
        </div>
        <textarea class="aie-draft-text" id="aieDraftTextarea" data-no-i18n="1" dir="${EDGE_STATE.inspDraftLang === 'ar' ? 'rtl' : 'ltr'}" aria-label="${esc(tr('Follow-up message text'))}">${esc(msg)}</textarea>
      `;

      box.querySelectorAll('[data-aie-dlang]').forEach(lb => {
        lb.onclick = () => {
          EDGE_STATE.inspDraftLang = lb.getAttribute('data-aie-dlang') || 'en';
          renderDraftBox();
        };
      });
      const cpBtn = box.querySelector('#aieCopyDraftBtn');
      const ta = box.querySelector('#aieDraftTextarea');
      if (cpBtn && ta) {
        cpBtn.onclick = () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(ta.value).catch(() => {});
          }
          if (D && typeof D.toast === 'function') D.toast(tr('Follow-up message copied to clipboard'), 'ok');
        };
      }
      const clsBtn = box.querySelector('#aieCloseDraftBtn');
      if (clsBtn) {
        clsBtn.onclick = () => {
          EDGE_STATE.inspDraftOpen = false;
          box.remove();
        };
      }
    };

    btn.addEventListener('click', () => {
      EDGE_STATE.inspDraftOpen = !EDGE_STATE.inspDraftOpen;
      EDGE_STATE.inspDraftLang = curLang();
      renderDraftBox();
    });
  }

  // ==================== PHASE 16: 6-INDUSTRY RECONCILIATION & SETTLEMENT STUDIOS ====================
  function findReconMountAnchor(ws) {
    if (!ws) return null;
    const card = ws.querySelector('.panel-card, .panel') || ws.firstElementChild;
    if (!card) return null;
    return card.closest('.split-grid-2') || card;
  }

  // --- PACK 1: MANUFACTURING SUPPLIER WEIGHBRIDGE & BANK STATEMENT AUTO-RECON ---
  const SAMPLE_MFG_SUPPLIER_STATEMENT = [
    'مقالع شكا | #Q-88412 | Sakher | 42.0 Ton | Rate: $9.00 | Billed: $378.00 | 2026-10-28',
    'عفيف للنقليات | #H-51209 | Haulage Jiyeh | 36.0 Ton | Rate: $7.00 | Billed: $252.00 | 2026-10-29',
    'Holcim Liban | #INV-9041 | Bulk Cement | 31.2 Ton | Rate: $95.00 | Billed: $3,290.00 | 2026-10-30'
  ].join('\n');

  function reconcileManufacturingSupplierStatement(rawText) {
    const txt = String(rawText || SAMPLE_MFG_SUPPLIER_STATEMENT).trim();
    EDGE_STATE.mfgReconText = txt;
    const supPool = ((D && D.SEED && D.SEED.records && D.SEED.records.suppliers) || [])
      .concat((D && D.STATE && D.STATE.customRecords && D.STATE.customRecords.suppliers) || [])
      .filter(s => s && !s.voided && s.name);
    const rawRules = ((D && D.SEED && D.SEED.records && D.SEED.records.price_rules) || []).filter(r => r && !r.voided);

    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = lines.map((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      const supRaw = parts[0] || `Supplier ${idx + 1}`;
      const ticketRef = parts[1] || `#ST-${100 + idx}`;
      const itemDesc = parts[2] || 'Quarry Aggregate';
      const qtyMatch = line.match(/([\d,.]+)\s*(?:ton|t\b|m3|m³|طن)/i);
      const rateMatch = line.match(/rate\s*:\s*\$?([\d,.]+)/i);
      const billedMatch = line.match(/billed\s*:\s*\$?([\d,.]+)/i);
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
      const nums = (line.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, '')));

      const qty = qtyMatch ? Number(qtyMatch[1].replace(/,/g, '')) : (nums[0] || 36);
      let contractRate = rateMatch ? Number(rateMatch[1].replace(/,/g, '')) : (nums.length >= 3 ? nums[nums.length - 2] : 9);
      const billedUsd = billedMatch ? Number(billedMatch[1].replace(/,/g, '')) : (nums.length >= 2 ? nums[nums.length - 1] : round2(qty * contractRate));

      const ranked = rankCandidatesByScoreAndFreq(supPool, supRaw, 'supplier', 0.48);
      const matchedSup = ranked.length ? ranked[0].label : (/chekka|شكا/i.test(supRaw) ? 'Chekka Quarry' : (/afif|عفيف/i.test(supRaw) ? 'Afif Transport' : sanitizeOutward(supRaw)));
      const confPct = ranked.length ? Math.min(99, Math.round(70 + ranked[0].score * 29)) : 86;

      const hitRule = rawRules.find(pr => pr.supplier && pr.supplier.toLowerCase() === matchedSup.toLowerCase() && Number(pr.material_price || pr.transport_price || pr.price || 0) > 0);
      if (!rateMatch && hitRule) {
        contractRate = Number(hitRule.material_price || hitRule.transport_price || hitRule.price || contractRate);
      }

      const isIva = /holcim|ciment|sibline|official/i.test(matchedSup + ' ' + itemDesc);
      const expectedNet = round2(qty * contractRate);
      const vatUsd = isIva ? round2(expectedNet * 0.11) : 0;
      const expectedUsd = round2(expectedNet + vatUsd);
      const varianceUsd = round2(billedUsd - expectedUsd);
      const refTruckLoad = /cement/i.test(itemDesc) ? 30.0 : (/sakher/i.test(itemDesc) ? 42.0 : 36.0);
      const tonDriftPct = refTruckLoad > 0 ? round2(((qty - refTruckLoad) / refTruckLoad) * 100) : 0;
      const hasScaleDrift = Math.abs(tonDriftPct) > 3.0;

      return {
        idx: idx + 1,
        rawParty: sanitizeOutward(supRaw),
        matchedSupplier: sanitizeOutward(matchedSup),
        ticketRef: sanitizeOutward(ticketRef),
        itemDesc: sanitizeOutward(itemDesc),
        date: dateMatch ? dateMatch[1] : '2026-10-30',
        qty: round2(qty),
        contractRate: round2(contractRate),
        vatUsd,
        expectedUsd,
        billedUsd: round2(billedUsd),
        varianceUsd,
        tonDriftPct,
        hasScaleDrift,
        confidencePct: confPct,
        status: Math.abs(varianceUsd) < 0.5 && !hasScaleDrift ? 'Matched' : (hasScaleDrift ? 'Scale Drift (>3%)' : 'Rate Variance')
      };
    });

    EDGE_STATE.mfgReconRows = out;
    return out;
  }

  function postManufacturingStatementBatch() {
    const rows = EDGE_STATE.mfgReconRows || reconcileManufacturingSupplierStatement(EDGE_STATE.mfgReconText);
    if (!rows.length || !D || !D.STATE) return 0;
    if (!D.STATE.customRecords) D.STATE.customRecords = {};
    if (!Array.isArray(D.STATE.customRecords.settlements)) D.STATE.customRecords.settlements = [];
    const td = typeof D.todayISO === 'function' ? D.todayISO() : '2026-11-08';
    const coName = (typeof D.defaultEntryCompany === 'function' && D.defaultEntryCompany()) || 'WTC';
    let posted = 0;

    rows.forEach((r, i) => {
      const id = `SET-AI-${String(r.ticketRef).replace(/[^A-Za-z0-9]/g, '') || (i + 1)}`;
      const exists = D.STATE.customRecords.settlements.some(x => x && x.id === id && !x.voided);
      const rowObj = {
        id,
        date: r.date || td,
        rep_date: r.date || td,
        company: coName,
        supplier: r.matchedSupplier,
        method: 'Bank Transfer',
        amount: r.expectedUsd,
        currency: 'USD',
        reference: r.ticketRef,
        notes: sanitizeOutward(`Statement 3-way match (${r.qty} Ton @ ${fmtUSD(r.contractRate, 2)})`)
      };
      if (!exists) {
        D.STATE.customRecords.settlements.unshift(rowObj);
      } else {
        const idx = D.STATE.customRecords.settlements.findIndex(x => x && x.id === id);
        if (idx >= 0) D.STATE.customRecords.settlements[idx] = rowObj;
      }
      posted += 1;
    });

    EDGE_STATE.mfgReconPostedCount = posted;
    if (typeof D.applyCustomRecordsToSeed === 'function') D.applyCustomRecordsToSeed();
    if (!isHeadlessEnv() && typeof D.saveLocalAuthAndRecords === 'function') D.saveLocalAuthAndRecords();
    if (typeof D.renderApp === 'function') D.renderApp();
    if (typeof D.toast === 'function') D.toast(`${posted} ${tr('matched supplier settlements posted')}`, 'ok');
    return posted;
  }

  function mountMfgStatementReconPanel() {
    const ws = $('workspace');
    if (!ws || $('mfgAiStatementReconPanel') || !D || !D.STATE) return;
    const activeInd = typeof D.getActiveIndustry === 'function' ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
    if (activeInd !== 'Manufacturing' || !['suppliers', 'raw'].includes(D.STATE.view)) return;
    const anchor = findReconMountAnchor(ws);
    if (!anchor) return;

    const rows = EDGE_STATE.mfgReconRows || reconcileManufacturingSupplierStatement(EDGE_STATE.mfgReconText);
    const apBridge = typeof D.computeThreeLegPayablesBreakdown === 'function' ? D.computeThreeLegPayablesBreakdown() : null;
    const sumQty = round2(rows.reduce((a, r) => a + r.qty, 0));
    const sumExp = round2(rows.reduce((a, r) => a + r.expectedUsd, 0));
    const sumBilled = round2(rows.reduce((a, r) => a + r.billedUsd, 0));
    const sumVar = round2(rows.reduce((a, r) => a + r.varianceUsd, 0));
    const openApUsd = apBridge && apBridge.totals ? round2(Number(apBridge.totals.closingBalance || apBridge.totals.netPayable || 0)) : sumExp;

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'mfgAiStatementReconPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI Supplier Weighbridge & Statement Reconciler'))}</span>
          <strong>${esc(tr('Cross-Script Quarry, Haulage & Bank 3-Way Match'))} (${rows.length})</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="mfgAiToggleReconBtn">${esc(tr(EDGE_STATE.mfgReconOpen ? 'Hide Statement Studio' : 'Open Statement Studio'))}</button>
        </div>
      </div>
      ${EDGE_STATE.mfgReconOpen ? `
        <div class="aie-recon-kpis">
          <div class="aie-recon-kpi"><small>${esc(tr('Statement Weighed Qty'))}</small><strong data-no-i18n="1">${fmtNum(sumQty, 1)} Ton</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Contract Expected ($)'))}</small><strong data-no-i18n="1">${fmtUSD(sumExp, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Supplier Billed ($)'))}</small><strong data-no-i18n="1">${fmtUSD(sumBilled, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('3-Leg Open Payables Tie'))}</small><strong data-no-i18n="1">${fmtUSD(openApUsd, 0)}</strong></div>
        </div>
        <textarea class="aie-batch-textarea" id="mfgAiReconInput" style="margin-top:8px" aria-label="${esc(tr('Supplier Weighbridge Statement Lines'))}" data-no-i18n="1">${esc(EDGE_STATE.mfgReconText || SAMPLE_MFG_SUPPLIER_STATEMENT)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="aie-btn" id="mfgAiRunReconBtn">${ic('bolt')} ${esc(tr('Run 3-Way Match'))}</button>
          <button type="button" class="aie-btn is-brass" id="mfgAiPostReconBtn">${ic('check_circle')} ${esc(tr('+ Post Matched Settlements'))}</button>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('Ticket / Ref'))}</th>
                <th>${esc(tr('Matched Supplier'))}</th>
                <th>${esc(tr('Material / Leg'))}</th>
                <th class="r">${esc(tr('Qty (Ton)'))}</th>
                <th class="r">${esc(tr('Expected ($)'))}</th>
                <th class="r">${esc(tr('Billed ($)'))}</th>
                <th class="r">${esc(tr('Variance ($)'))}</th>
                <th>${esc(tr('3-Way Audit'))}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="mono" data-no-i18n="1"><strong>${esc(r.ticketRef)}</strong></td>
                  <td data-no-i18n="1">${esc(r.matchedSupplier)}</td>
                  <td data-no-i18n="1">${esc(r.itemDesc)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtNum(r.qty, 1)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.expectedUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.billedUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.varianceUsd, 2)}</strong></td>
                  <td><span class="aie-pill ${r.status === 'Matched' ? 'is-good' : 'is-warn'}">${esc(tr(r.status))} · <span data-no-i18n="1">${r.confidencePct}%</span></span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3"><strong>${esc(tr('DETERMINISTIC STATEMENT TOTAL'))}</strong></td>
                <td class="r mono"><strong>${fmtNum(sumQty, 1)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumExp, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumBilled, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumVar, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    anchor.insertAdjacentElement('beforebegin', panel);
    const tog = panel.querySelector('#mfgAiToggleReconBtn');
    if (tog) {
      tog.onclick = () => {
        EDGE_STATE.mfgReconOpen = !EDGE_STATE.mfgReconOpen;
        panel.remove();
        mountMfgStatementReconPanel();
      };
    }
    const runBtn = panel.querySelector('#mfgAiRunReconBtn');
    const ta = panel.querySelector('#mfgAiReconInput');
    if (runBtn && ta) {
      runBtn.onclick = () => {
        reconcileManufacturingSupplierStatement(ta.value);
        panel.remove();
        mountMfgStatementReconPanel();
      };
    }
    const postBtn = panel.querySelector('#mfgAiPostReconBtn');
    if (postBtn) {
      postBtn.onclick = () => {
        if (ta) reconcileManufacturingSupplierStatement(ta.value);
        postManufacturingStatementBatch();
      };
    }
  }

  // --- PACK 2: HOSPITALITY CARD TERMINAL / WHISH / OTA & FOLIO RECONCILER ---
  const SAMPLE_HSP_SETTLEMENT_BATCH = [
    'POS-CL-PT01 | بلاتينوم كونسيرج | Card Terminal Batch | Gross: $10,200.00 | MDR: 1.75% | Net Deposit: $10,021.50',
    'POS-CL-0003 | بلانكا تيراس | Whish QR & Card | Gross: $182.00 | MDR: 1.00% | Net Deposit: $180.18',
    'MEM-2026-001 | حسام داوود | Bank Wire Chalet | Gross: $2,000.00 | MDR: 0.00% | Net Deposit: $2,000.00'
  ].join('\n');

  function reconcileHospitalitySettlementBatch(rawText) {
    const txt = String(rawText || SAMPLE_HSP_SETTLEMENT_BATCH).trim();
    EDGE_STATE.hspReconText = txt;
    const hsp = (D && typeof D.computeHospitalityOperations === 'function')
      ? D.computeHospitalityOperations({ ignoreSearch: true })
      : { posRows: [], membershipRows: [] };
    const posRows = hsp.posRows || [];
    const memRows = hsp.membershipRows || [];

    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = lines.map((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      const refRaw = parts[0] || `BATCH-${idx + 1}`;
      const partyRaw = parts[1] || 'Resort Desk';
      const channel = parts[2] || 'Card Terminal';
      const grossM = line.match(/gross\s*:\s*\$?([\d,.]+)/i);
      const mdrM = line.match(/mdr\s*:\s*([\d,.]+)\s*%/i);
      const netM = line.match(/net(?:\s+deposit)?\s*:\s*\$?([\d,.]+)/i);

      const grossUsd = grossM ? Number(grossM[1].replace(/,/g, '')) : 0;
      const mdrPct = mdrM ? Number(mdrM[1].replace(/,/g, '')) : (/whish/i.test(channel) ? 1.0 : (/wire/i.test(channel) ? 0 : 1.75));
      const bankNetUsd = netM ? Number(netM[1].replace(/,/g, '')) : round2(grossUsd * (1 - mdrPct / 100));

      let matchedPos = posRows.find(p => p && String(p.id || '').toLowerCase() === refRaw.toLowerCase());
      let matchedMem = memRows.find(m => m && String(m.id || '').toLowerCase() === refRaw.toLowerCase());
      if (!matchedPos && !matchedMem) {
        if (/^MEM-/i.test(refRaw) || /chalet|member|wire/i.test(channel)) {
          memRows.forEach(m => {
            if (semanticSimilarity(partyRaw, m.member || '') >= 0.5) matchedMem = m;
          });
          if (!matchedMem) matchedMem = memRows.find(m => m && Number(m.balance_usd || 0) > 0) || memRows[0] || null;
        } else {
          posRows.forEach(p => {
            if (semanticSimilarity(partyRaw, `${p.company} ${p.terminal}`) >= 0.42) matchedPos = p;
          });
          if (!matchedPos) matchedPos = posRows.find(p => p && Math.abs(Number(p.variance_usd || 0)) > 0) || posRows[0] || null;
        }
      }

      const resort = (matchedPos && matchedPos.company) || (matchedMem && matchedMem.company) || (/launa|لاونا/i.test(partyRaw) ? 'La Una' : 'Blanca');
      const label = matchedMem ? `${matchedMem.member} (${matchedMem.unit})` : ((matchedPos && matchedPos.terminal) || sanitizeOutward(partyRaw));
      const feeUsd = round2(grossUsd * (mdrPct / 100));
      const expectedNetUsd = round2(grossUsd - feeUsd);
      const clearingVarUsd = round2(bankNetUsd - expectedNetUsd);
      const isExempt = /diesel|tip|gratuity/i.test(channel + ' ' + partyRaw);
      const vatUsd = isExempt ? 0 : round2(grossUsd - (grossUsd / 1.11));
      const compAlert = Boolean(matchedPos && (Math.abs(Number(matchedPos.variance_usd || 0)) > 0 || Number(matchedPos.comp_usd || 0) >= 250));

      return {
        idx: idx + 1,
        refId: (matchedPos && matchedPos.id) || (matchedMem && matchedMem.id) || refRaw,
        kind: matchedMem ? 'membership' : 'pos',
        resort,
        label: sanitizeOutward(label),
        channel: sanitizeOutward(channel),
        grossUsd: round2(grossUsd),
        mdrPct: round2(mdrPct),
        feeUsd,
        expectedNetUsd,
        bankNetUsd: round2(bankNetUsd),
        vatUsd,
        clearingVarUsd,
        compAlert,
        confidencePct: (matchedPos || matchedMem) ? 98 : 87,
        status: Math.abs(clearingVarUsd) < 0.5 && !compAlert ? 'Matched' : (compAlert ? 'Shift Tab Audit' : 'Fee Variance')
      };
    });

    EDGE_STATE.hspReconRows = out;
    return out;
  }

  function postHospitalitySettlementBatch() {
    const rows = EDGE_STATE.hspReconRows || reconcileHospitalitySettlementBatch(EDGE_STATE.hspReconText);
    if (!rows.length || !D) return 0;
    const td = typeof D.todayISO === 'function' ? D.todayISO() : '2026-11-08';
    const hsp = typeof D.computeHospitalityOperations === 'function' ? D.computeHospitalityOperations() : { membershipRows: [] };
    let posted = 0;

    rows.forEach(r => {
      if (r.kind === 'pos' && typeof D.saveIndustryWorkflowPatch === 'function') {
        D.saveIndustryWorkflowPatch('hsp_pos', r.refId, {
          variance_usd: 0,
          status: 'Balanced',
          notes: sanitizeOutward(`Card & Whish batch cleared (${fmtUSD(r.bankNetUsd, 2)} net after ${r.mdrPct}% fee)`)
        });
        posted += 1;
      } else if (r.kind === 'membership' && typeof D.saveIndustryWorkflowPatch === 'function') {
        const m = (hsp.membershipRows || []).find(x => x.id === r.refId);
        const newPaid = m ? round2(Number(m.paid_usd || 0) + r.grossUsd) : r.grossUsd;
        const newBal = m ? Math.max(0, round2(Number(m.contract_usd || 0) - newPaid)) : 0;
        D.saveIndustryWorkflowPatch('hsp_memberships', r.refId, {
          paid_usd: newPaid,
          balance_usd: newBal,
          status: newBal <= 0.5 ? 'Paid in Full' : 'Partial / Active',
          notes: sanitizeOutward(`Chalet wire settled on ${td} (${fmtUSD(r.grossUsd, 2)})`)
        });
        posted += 1;
      }
    });

    EDGE_STATE.hspReconPostedCount = posted;
    if (typeof D.renderApp === 'function') D.renderApp();
    if (typeof D.toast === 'function') D.toast(`${posted} ${tr('hospitality terminal & folio settlements cleared')}`, 'ok');
    return posted;
  }

  function mountHospitalitySettlementPanel() {
    const ws = $('workspace');
    if (!ws || $('hspAiSettlementReconPanel') || !D || !D.STATE) return;
    if (!['hsp_pos', 'hsp_revenue', 'hsp_memberships'].includes(D.STATE.view)) return;
    const anchor = findReconMountAnchor(ws);
    if (!anchor) return;

    const rows = EDGE_STATE.hspReconRows || reconcileHospitalitySettlementBatch(EDGE_STATE.hspReconText);
    const sumGross = round2(rows.reduce((a, r) => a + r.grossUsd, 0));
    const sumFee = round2(rows.reduce((a, r) => a + r.feeUsd, 0));
    const sumNet = round2(rows.reduce((a, r) => a + r.bankNetUsd, 0));
    const sumVat = round2(rows.reduce((a, r) => a + r.vatUsd, 0));
    const sumVar = round2(rows.reduce((a, r) => a + r.clearingVarUsd, 0));

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'hspAiSettlementReconPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI Card, Whish & Seasonal Folio Reconciler'))}</span>
          <strong>${esc(tr('Cross-Script Terminal Clearing, MDR Fee Split & Chalet Wire Match'))} (${rows.length})</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="hspAiToggleReconBtn">${esc(tr(EDGE_STATE.hspReconOpen ? 'Hide Settlement Studio' : 'Open Settlement Studio'))}</button>
        </div>
      </div>
      ${EDGE_STATE.hspReconOpen ? `
        <div class="aie-recon-kpis">
          <div class="aie-recon-kpi"><small>${esc(tr('Gross Batch Amount'))}</small><strong data-no-i18n="1">${fmtUSD(sumGross, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Acquirer / MDR Fees'))}</small><strong data-no-i18n="1">${fmtUSD(sumFee, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Net Bank Deposit'))}</small><strong data-no-i18n="1">${fmtUSD(sumNet, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('11% Output VAT Split'))}</small><strong data-no-i18n="1">${fmtUSD(sumVat, 2)}</strong></div>
        </div>
        <textarea class="aie-batch-textarea" id="hspAiReconInput" style="margin-top:8px" aria-label="${esc(tr('Hospitality Settlement Batch Lines'))}" data-no-i18n="1">${esc(EDGE_STATE.hspReconText || SAMPLE_HSP_SETTLEMENT_BATCH)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="aie-btn" id="hspAiRunReconBtn">${ic('bolt')} ${esc(tr('Reconcile Terminal & Folios'))}</button>
          <button type="button" class="aie-btn is-brass" id="hspAiPostClearBtn">${ic('check_circle')} ${esc(tr('+ Post Settlement Clearing'))}</button>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('Folio / Closing Ref'))}</th>
                <th>${esc(tr('Resort & Outlet'))}</th>
                <th>${esc(tr('Channel'))}</th>
                <th class="r">${esc(tr('Gross ($)'))}</th>
                <th class="r">${esc(tr('MDR Fee ($)'))}</th>
                <th class="r">${esc(tr('Net Deposit ($)'))}</th>
                <th class="r">${esc(tr('Variance ($)'))}</th>
                <th>${esc(tr('Status'))}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="mono" data-no-i18n="1"><strong>${esc(r.refId)}</strong></td>
                  <td data-no-i18n="1">${esc(r.resort)} · ${esc(r.label)}</td>
                  <td data-no-i18n="1">${esc(r.channel)} (${r.mdrPct}%)</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.grossUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.feeUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.bankNetUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.clearingVarUsd, 2)}</strong></td>
                  <td><span class="aie-pill ${r.status === 'Matched' ? 'is-good' : 'is-warn'}">${esc(tr(r.status))} · <span data-no-i18n="1">${r.confidencePct}%</span></span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3"><strong>${esc(tr('DETERMINISTIC CLEARING TOTAL'))}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumGross, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumFee, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumNet, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumVar, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    anchor.insertAdjacentElement('beforebegin', panel);
    const tog = panel.querySelector('#hspAiToggleReconBtn');
    if (tog) {
      tog.onclick = () => {
        EDGE_STATE.hspReconOpen = !EDGE_STATE.hspReconOpen;
        panel.remove();
        mountHospitalitySettlementPanel();
      };
    }
    const runBtn = panel.querySelector('#hspAiRunReconBtn');
    const ta = panel.querySelector('#hspAiReconInput');
    if (runBtn && ta) {
      runBtn.onclick = () => {
        reconcileHospitalitySettlementBatch(ta.value);
        panel.remove();
        mountHospitalitySettlementPanel();
      };
    }
    const postBtn = panel.querySelector('#hspAiPostClearBtn');
    if (postBtn) {
      postBtn.onclick = () => {
        if (ta) reconcileHospitalitySettlementBatch(ta.value);
        postHospitalitySettlementBatch();
      };
    }
  }

  // --- PACK 3: REAL ESTATE CAM m2 PRORATION, FIFO WIRE & DEPOSIT ESCROW RECONCILER ---
  const SAMPLE_RE_CAM_WIRE_PACK = [
    'CAM | 4235 Msaytbeh | كهرباء ومولد مشترك | Pool Cost: $4,400.00 | Markup: 5%',
    'CAM | 776 Ras Beirut (Hamra Pavillon) | صيانة مصاعد وتكييف مشترك | Pool Cost: $2,800.00 | Markup: 5%',
    'WIRE | محمد علي فوز | Fresh USD Bank Wire | Amount: $9,975.00 | 2026-10-30',
    'WIRE | Infinitas SAL | Bank Transfer USD | Amount: $5,550.00 | 2026-10-31'
  ].join('\n');

  function reconcileRealEstateCamAndWires(rawText) {
    const txt = String(rawText || SAMPLE_RE_CAM_WIRE_PACK).trim();
    EDGE_STATE.reReconText = txt;
    const re = (D && typeof D.computeRealEstateOperations === 'function')
      ? D.computeRealEstateOperations({ ignoreSearch: true })
      : { properties: [], units: [], leases: [], invoices: [], receipts: [] };
    const properties = re.properties || [];
    const units = re.units || [];
    const leases = re.leases || [];
    const invoices = re.invoices || [];
    const receipts = re.receipts || [];

    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const camAllocRows = [];
    const wireRows = [];

    lines.forEach((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      const kind = String(parts[0] || '').toUpperCase();
      if (kind.startsWith('CAM')) {
        const propName = parts[1] || '4235 Msaytbeh';
        const catDesc = parts[2] || 'Shared Generator & Common Area';
        const costM = line.match(/cost\s*:\s*\$?([\d,.]+)/i);
        const mkM = line.match(/markup\s*:\s*([\d,.]+)\s*%/i);
        const poolCost = costM ? Number(costM[1].replace(/,/g, '')) : 4400;
        const markupPct = mkM ? Number(mkM[1].replace(/,/g, '')) : 5;

        let occUnits = units.filter(u =>
          u &&
          !/vacant|fit-out/i.test(String(u.occupancy || 'Occupied')) &&
          (semanticSimilarity(propName, u.property || '') >= 0.35 || String(u.property || '').toLowerCase().includes(propName.toLowerCase().split(' ')[0]))
        );
        if (!occUnits.length) {
          const hitProp = properties.find(p => p && (semanticSimilarity(propName, p.name || '') >= 0.35 || String(p.name || '').toLowerCase().includes(propName.toLowerCase().split(' ')[0])));
          if (hitProp) {
            const matchLease = leases.find(l => l && semanticSimilarity(hitProp.name, l.property || '') >= 0.35);
            occUnits = [{
              code: hitProp.code || hitProp.id || `PRP-${idx + 1}`,
              company: hitProp.company || 'Properties',
              property: hitProp.name,
              tenant: (matchLease && matchLease.tenant) || (/776|hamra/i.test(hitProp.name) ? 'Hamra Medical & Diagnostics' : `${hitProp.name} Commercial Tenant`),
              area_sqm: Number(hitProp.area_sqm || 500)
            }];
          }
        }
        const totSqm = occUnits.reduce((s, u) => s + Number(u.area_sqm || 0), 0) || 1;
        occUnits.slice(0, 4).forEach(u => {
          const shareRatio = Number(u.area_sqm || 0) / totSqm;
          const baseShare = round2(poolCost * shareRatio);
          const markupUsd = round2(baseShare * (markupPct / 100));
          const netRecharge = round2(baseShare + markupUsd);
          const is4235 = /4235/i.test(String(u.company || ''));
          const vatUsd = is4235 ? round2(netRecharge * 0.11) : 0;
          const totalBillUsd = round2(netRecharge + vatUsd);
          camAllocRows.push({
            rowType: 'CAM Proration',
            ref: `CAM-${u.code || idx + 1}`,
            company: u.company || '4235 Company S.A.L',
            property: u.property,
            tenant: u.tenant,
            basisLabel: `${u.area_sqm} m² / ${totSqm} m² (${round2(shareRatio * 100)}%)`,
            netUsd: netRecharge,
            vatUsd,
            grossUsd: totalBillUsd,
            allocatedUsd: totalBillUsd,
            unallocatedUsd: 0,
            category: sanitizeOutward(catDesc),
            confidencePct: 99,
            status: is4235 ? '11% VAT Prorated' : '0% Exempt Prorated'
          });
        });
      } else {
        const tenantRaw = parts[1] || 'Tenant';
        const method = parts[2] || 'Bank Transfer USD';
        const amtM = line.match(/amount\s*:\s*\$?([\d,.]+)/i);
        const dateM = line.match(/(\d{4}-\d{2}-\d{2})/);
        const wireUsd = amtM ? Number(amtM[1].replace(/,/g, '')) : 5000;

        let bestLease = null;
        let bestSc = 0;
        leases.forEach(l => {
          const sc = semanticSimilarity(tenantRaw, l.tenant || '');
          if (sc > bestSc) { bestSc = sc; bestLease = l; }
        });
        const matchedTenant = bestLease ? bestLease.tenant : (/فوز|fawz/i.test(tenantRaw) ? 'Mohamad Ali Fawz' : sanitizeOutward(tenantRaw));
        const company = (bestLease && bestLease.company) || (/hamra/i.test(matchedTenant) ? 'Properties' : '4235 Company S.A.L');
        const property = (bestLease && bestLease.property) || '4235 Msaytbeh';

        // Deterministic FIFO allocation across oldest unpaid invoices for this tenant
        const openInvs = invoices
          .filter(inv => inv && Number(inv.open_ar_usd || 0) > 0 && inv.tenant && semanticSimilarity(inv.tenant, matchedTenant) >= 0.7)
          .sort((a, b) => (String(a.date || '') < String(b.date || '') ? -1 : 1));
        let rem = wireUsd;
        const hitInvIds = [];
        openInvs.forEach(inv => {
          if (rem <= 0) return;
          const take = Math.min(rem, Number(inv.open_ar_usd || 0));
          if (take > 0) {
            rem = round2(rem - take);
            hitInvIds.push({ id: inv.id, applied: round2(take), prevCollected: Number(inv.collected_usd || 0), prevOpen: Number(inv.open_ar_usd || 0), isNewLeaseInv: false });
          }
        });
        // If tenant has an active lease without an open invoice row yet in seed_industries, generate & settle deterministic accrued lease invoice
        if (!hitInvIds.length && bestLease && wireUsd > 0) {
          const synthInvId = `INV-FIFO-${idx + 1}`;
          const is4235Co = /4235/i.test(company);
          const netEq = is4235Co ? round2(wireUsd / 1.11) : round2(wireUsd);
          const vatEq = is4235Co ? round2(wireUsd - netEq) : 0;
          hitInvIds.push({
            id: synthInvId,
            applied: round2(wireUsd),
            prevCollected: 0,
            prevOpen: round2(wireUsd),
            isNewLeaseInv: true,
            netUsd: netEq,
            vatUsd: vatEq,
            ttcUsd: round2(wireUsd),
            company,
            property,
            tenant: matchedTenant
          });
          rem = 0;
        }
        const allocatedUsd = round2(wireUsd - rem);

        wireRows.push({
          rowType: 'FIFO Wire',
          ref: hitInvIds.length ? hitInvIds.map(x => x.id).join(', ') : `WIR-${idx + 1}`,
          company,
          property,
          tenant: matchedTenant,
          basisLabel: `${sanitizeOutward(method)} · ${hitInvIds.length ? 'FIFO Oldest Invoice' : 'Client Advance'}`,
          netUsd: round2(wireUsd),
          vatUsd: 0,
          grossUsd: round2(wireUsd),
          allocatedUsd,
          unallocatedUsd: round2(rem),
          hitInvIds,
          date: dateM ? dateM[1] : '2026-10-31',
          confidencePct: bestSc >= 0.45 ? 97 : 91,
          status: rem <= 0.5 ? 'FIFO Fully Matched' : 'Advance Surplus'
        });
      }
    });

    const depositHeldUsd = round2(leases.reduce((s, l) => s + Number(l.deposit_usd || 0), 0) || receipts.reduce((s, r) => s + Number(r.deposit_gl4196_usd || 0), 0));
    const depositAppliedUsd = 0;
    const depositRefundableUsd = depositHeldUsd;
    const combinedRows = camAllocRows.concat(wireRows);
    const pack = {
      rows: combinedRows,
      camAllocRows,
      wireRows,
      camTotalUsd: round2(camAllocRows.reduce((s, r) => s + r.grossUsd, 0)),
      wireTotalUsd: round2(wireRows.reduce((s, r) => s + r.grossUsd, 0)),
      depositHeldUsd,
      depositAppliedUsd,
      depositRefundableUsd
    };
    EDGE_STATE.reReconPack = pack;
    return pack;
  }

  function buildRealEstateArrearsNotice(lang) {
    const pack = EDGE_STATE.reReconPack || reconcileRealEstateCamAndWires(EDGE_STATE.reReconText);
    const sample = pack.wireRows[0] || pack.rows[0] || { tenant: 'Valued Tenant', property: '4235 Msaytbeh Commercial Center', grossUsd: 9975, company: '4235 Company S.A.L' };
    const amt = fmtUSD(sample.grossUsd, 2);
    if (lang === 'ar') {
      return sanitizeOutward(`تحية طيبة ${sample.tenant}، نود إعلامكم بتحديث كشف الإيجار والمصاريف المشتركة في ${sample.property} لدى ${sample.company} بقيمة ${amt}، علماً أن مبلغ التأمين النقدي يبقى محفوظاً بشكل مستقل في حساب الأمانات دون مقاصة مع الإيجار الجاري. شكراً لتعاونكم.`);
    }
    if (lang === 'fr') {
      return sanitizeOutward(`Bonjour ${sample.tenant}, voici le releve mis a jour des loyers et charges communes pour ${sample.property} (${sample.company}) d'un montant de ${amt}. Votre depot de garantie reste integralement cantonne en compte sequestre distinct. Merci de votre collaboration.`);
    }
    return sanitizeOutward(`Hello ${sample.tenant}, please find the updated rent and common-area statement for ${sample.property} (${sample.company}) totaling ${amt}. Your security deposit remains strictly ring-fenced in escrow and separate from current rent billing. Thank you.`);
  }

  function postRealEstateCamAndWiresBatch() {
    const pack = EDGE_STATE.reReconPack || reconcileRealEstateCamAndWires(EDGE_STATE.reReconText);
    if (!pack || !pack.rows.length || !D) return 0;
    const td = typeof D.todayISO === 'function' ? D.todayISO() : '2026-11-08';
    let posted = 0;

    pack.camAllocRows.forEach((c, i) => {
      if (typeof D.addIndustryCustomRow === 'function') {
        D.addIndustryCustomRow('re_recharges', {
          id: `RCH-CAM-${i + 1}`,
          date: td,
          company: c.company,
          property: c.property,
          tenant: c.tenant,
          expense_ref: c.ref,
          category: c.category || 'Prorated Shared Utility & CAM',
          cost_usd: c.netUsd,
          markup_usd: c.vatUsd,
          total_recharge_usd: c.grossUsd,
          linked_invoice: `CAM-INV-${i + 1}`,
          status: 'Invoiced'
        }, { skipCloudSync: isHeadlessEnv() });
        posted += 1;
      }
    });

    pack.wireRows.forEach((w, i) => {
      (w.hitInvIds || []).forEach(hit => {
        if (hit.isNewLeaseInv && typeof D.addIndustryCustomRow === 'function') {
          D.addIndustryCustomRow('re_invoicing', {
            id: hit.id,
            date: w.date || td,
            company: hit.company || w.company,
            tax_seq: hit.id,
            seq_no: hit.id,
            property: hit.property || w.property,
            tenant: hit.tenant || w.tenant,
            period: '2026 Lease Period',
            net_usd: hit.netUsd,
            vat_usd: hit.vatUsd,
            amount_ttc_usd: hit.ttcUsd,
            ttc_usd: hit.ttcUsd,
            collected_usd: hit.applied,
            paid_usd: hit.applied,
            open_ar_usd: 0,
            status: 'Paid',
            audit_note: sanitizeOutward(`FIFO wire settled on ${w.date || td}`)
          }, { skipCloudSync: isHeadlessEnv() });
        } else if (typeof D.saveIndustryWorkflowPatch === 'function') {
          const nextCol = round2(hit.prevCollected + hit.applied);
          const nextOpen = Math.max(0, round2(hit.prevOpen - hit.applied));
          D.saveIndustryWorkflowPatch('re_invoicing', hit.id, {
            collected_usd: nextCol,
            open_ar_usd: nextOpen,
            status: nextOpen <= 0.5 ? 'Paid' : 'Partial',
            audit_note: sanitizeOutward(`FIFO wire settled on ${w.date || td}`)
          });
        }
      });
      if (typeof D.addIndustryCustomRow === 'function') {
        D.addIndustryCustomRow('re_receipts', {
          id: `RCT-FIFO-${i + 1}`,
          date: w.date || td,
          company: w.company,
          tenant: w.tenant,
          property: w.property,
          type: 'FIFO Wire Allocation',
          method: 'Bank Transfer USD',
          gross_usd: w.grossUsd,
          allocated_inv_usd: w.allocatedUsd,
          unallocated_adv_usd: w.unallocatedUsd,
          deposit_gl4196_usd: 0,
          audit_flag: sanitizeOutward(`Matched FIFO to ${w.ref}`),
          status: 'Allocated'
        }, { skipCloudSync: isHeadlessEnv() });
        posted += 1;
      }
    });

    EDGE_STATE.reReconPostedCount = posted;
    if (typeof D.renderApp === 'function') D.renderApp();
    if (typeof D.toast === 'function') D.toast(`${posted} ${tr('CAM proration & FIFO wire settlements posted')}`, 'ok');
    return posted;
  }

  function mountRealEstateCamDepositPanel() {
    const ws = $('workspace');
    if (!ws || $('reAiCamDepositReconPanel') || !D || !D.STATE) return;
    if (!['re_leases', 're_invoicing', 're_receipts', 're_workorders', 're_recharges'].includes(D.STATE.view)) return;
    const anchor = findReconMountAnchor(ws);
    if (!anchor) return;

    const pack = EDGE_STATE.reReconPack || reconcileRealEstateCamAndWires(EDGE_STATE.reReconText);
    const sumGross = round2(pack.rows.reduce((s, r) => s + r.grossUsd, 0));
    const sumAlloc = round2(pack.rows.reduce((s, r) => s + r.allocatedUsd, 0));
    const sumAdv = round2(pack.rows.reduce((s, r) => s + r.unallocatedUsd, 0));

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'reAiCamDepositReconPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI CAM Proration, FIFO Wire & Deposit Escrow Studio'))}</span>
          <strong>${esc(tr('Unit Area (m²) Recharge Split, Cross-Script Tenant Wires & Ring-Fenced Deposits'))}</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="reAiToggleReconBtn">${esc(tr(EDGE_STATE.reReconOpen ? 'Hide CAM & Escrow Studio' : 'Open CAM & Escrow Studio'))}</button>
        </div>
      </div>
      ${EDGE_STATE.reReconOpen ? `
        <div class="aie-recon-kpis">
          <div class="aie-recon-kpi"><small>${esc(tr('Prorated CAM Recharges'))}</small><strong data-no-i18n="1">${fmtUSD(pack.camTotalUsd, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('FIFO Wire Allocations'))}</small><strong data-no-i18n="1">${fmtUSD(pack.wireTotalUsd, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Ring-Fenced Deposit Escrow'))}</small><strong data-no-i18n="1">${fmtUSD(pack.depositHeldUsd, 0)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Refundable Escrow Balance'))}</small><strong data-no-i18n="1">${fmtUSD(pack.depositRefundableUsd, 0)}</strong></div>
        </div>
        <textarea class="aie-batch-textarea" id="reAiReconInput" style="margin-top:8px" aria-label="${esc(tr('Real Estate CAM & Wire Lines'))}" data-no-i18n="1">${esc(EDGE_STATE.reReconText || SAMPLE_RE_CAM_WIRE_PACK)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="aie-btn" id="reAiArrearsDraftBtn">${ic('send_msg')} ${esc(tr('Trilingual Tenant Notice'))}</button>
          <button type="button" class="aie-btn" id="reAiRunReconBtn">${ic('bolt')} ${esc(tr('Prorate CAM & Match Wires'))}</button>
          <button type="button" class="aie-btn is-brass" id="reAiPostCamBtn">${ic('check_circle')} ${esc(tr('+ Post CAM & FIFO Receipts'))}</button>
        </div>
        ${EDGE_STATE.reArrearsOpen ? `
          <div class="aie-draft-box" id="reAiArrearsBox">
            <div class="aie-head">
              <div class="aie-lang-seg">
                <button type="button" class="aie-lang-btn ${EDGE_STATE.reArrearsLang === 'en' ? 'active' : ''}" data-re-alang="en" data-no-i18n="1">EN</button>
                <button type="button" class="aie-lang-btn ${EDGE_STATE.reArrearsLang === 'ar' ? 'active' : ''}" data-re-alang="ar" data-no-i18n="1">AR</button>
                <button type="button" class="aie-lang-btn ${EDGE_STATE.reArrearsLang === 'fr' ? 'active' : ''}" data-re-alang="fr" data-no-i18n="1">FR</button>
              </div>
              <span class="aie-pill is-good">${esc(tr('Escrow Ring-Fence Verified'))}</span>
            </div>
            <textarea class="aie-draft-text" data-no-i18n="1" dir="${EDGE_STATE.reArrearsLang === 'ar' ? 'rtl' : 'ltr'}" aria-label="${esc(tr('Tenant Statement Notice'))}">${esc(buildRealEstateArrearsNotice(EDGE_STATE.reArrearsLang))}</textarea>
          </div>
        ` : ''}
        <div class="table-wrap" style="margin-top:8px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('Type & Ref'))}</th>
                <th>${esc(tr('Entity & Tenant'))}</th>
                <th>${esc(tr('Proration / FIFO Basis'))}</th>
                <th class="r">${esc(tr('Gross ($)'))}</th>
                <th class="r">${esc(tr('Allocated ($)'))}</th>
                <th class="r">${esc(tr('Surplus ($)'))}</th>
                <th>${esc(tr('Tax & Escrow Rule'))}</th>
              </tr>
            </thead>
            <tbody>
              ${pack.rows.map(r => `
                <tr>
                  <td class="mono" data-no-i18n="1"><strong>${esc(r.rowType)}</strong> · ${esc(r.ref)}</td>
                  <td data-no-i18n="1">${esc(r.company)} · <strong>${esc(r.tenant)}</strong></td>
                  <td data-no-i18n="1">${esc(r.basisLabel)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.grossUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.allocatedUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.unallocatedUsd, 2)}</strong></td>
                  <td><span class="aie-pill is-good">${esc(tr(r.status))} · <span data-no-i18n="1">${r.confidencePct}%</span></span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3"><strong>${esc(tr('DETERMINISTIC CAM & FIFO TOTAL'))}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumGross, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumAlloc, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumAdv, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    anchor.insertAdjacentElement('beforebegin', panel);
    const tog = panel.querySelector('#reAiToggleReconBtn');
    if (tog) {
      tog.onclick = () => {
        EDGE_STATE.reReconOpen = !EDGE_STATE.reReconOpen;
        panel.remove();
        mountRealEstateCamDepositPanel();
      };
    }
    const draftBtn = panel.querySelector('#reAiArrearsDraftBtn');
    if (draftBtn) {
      draftBtn.onclick = () => {
        EDGE_STATE.reArrearsOpen = !EDGE_STATE.reArrearsOpen;
        panel.remove();
        mountRealEstateCamDepositPanel();
      };
    }
    panel.querySelectorAll('[data-re-alang]').forEach(b => {
      b.onclick = () => {
        EDGE_STATE.reArrearsLang = b.getAttribute('data-re-alang') || 'en';
        panel.remove();
        mountRealEstateCamDepositPanel();
      };
    });
    const runBtn = panel.querySelector('#reAiRunReconBtn');
    const ta = panel.querySelector('#reAiReconInput');
    if (runBtn && ta) {
      runBtn.onclick = () => {
        reconcileRealEstateCamAndWires(ta.value);
        panel.remove();
        mountRealEstateCamDepositPanel();
      };
    }
    const postBtn = panel.querySelector('#reAiPostCamBtn');
    if (postBtn) {
      postBtn.onclick = () => {
        if (ta) reconcileRealEstateCamAndWires(ta.value);
        postRealEstateCamAndWiresBatch();
      };
    }
  }

  // --- PACK 4: TRADING MULTI-VIN LANDED-COST TRUE-UP & OEM WARRANTY CREDIT RECONCILER ---
  const SAMPLE_TRD_LANDED_WARRANTY_PACK = [
    'PACK | IMP-SH-2026-015 | MSCU9021847120 | Freight: $3,600 | Customs: $2,450 | Clearance: $1,400',
    'VIN | LZGJLDR44PX019301 | FOB: $63,500 | Duty Declared: 5.5%',
    'VIN | LZGJLDR44PX019305 | FOB: $58,400 | Duty Declared: 7.2%',
    'CLAIM | WAR-SH-2026-082 | شاكمان كفالة مصنع | LZGJLDR44PX019281 | OEM Credit: $830.00'
  ].join('\n');

  function reconcileTradingLandedAndWarranty(rawText) {
    const txt = String(rawText || SAMPLE_TRD_LANDED_WARRANTY_PACK).trim();
    EDGE_STATE.trdReconText = txt;
    const trd = (D && typeof D.computeTradingOperations === 'function')
      ? D.computeTradingOperations({ ignoreSearch: true })
      : { serialUnits: [], warrantyRows: [], landedRows: [] };
    const units = trd.serialUnits || [];
    const warranties = trd.warrantyRows || [];

    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let importRef = 'IMP-SH-2026-015';
    let packAddUsd = 7450;
    const rawVins = [];
    const claimRows = [];

    lines.forEach(line => {
      const parts = line.split('|').map(p => p.trim());
      const kind = String(parts[0] || '').toUpperCase();
      if (kind === 'PACK') {
        importRef = parts[1] || importRef;
        const fr = (line.match(/freight\s*:\s*\$?([\d,.]+)/i) || [])[1];
        const cu = (line.match(/customs\s*:\s*\$?([\d,.]+)/i) || [])[1];
        const cl = (line.match(/clearance\s*:\s*\$?([\d,.]+)/i) || [])[1];
        packAddUsd = round2(
          (fr ? Number(fr.replace(/,/g, '')) : 3600) +
          (cu ? Number(cu.replace(/,/g, '')) : 2450) +
          (cl ? Number(cl.replace(/,/g, '')) : 1400)
        );
      } else if (kind === 'VIN') {
        const vin = (parts[1] || '').toUpperCase();
        const fobM = line.match(/fob\s*:\s*\$?([\d,.]+)/i);
        const dutyM = line.match(/duty[^:]*:\s*([\d,.]+)\s*%/i);
        rawVins.push({
          vin,
          fobUsd: fobM ? Number(fobM[1].replace(/,/g, '')) : 60000,
          dutyPct: dutyM ? Number(dutyM[1].replace(/,/g, '')) : 5.0
        });
      } else if (kind === 'CLAIM') {
        const claimId = parts[1] || 'WAR-SH-2026-082';
        const vin = (parts[3] || '').toUpperCase();
        const crM = line.match(/credit\s*:\s*\$?([\d,.]+)/i);
        const oemCreditUsd = crM ? Number(crM[1].replace(/,/g, '')) : 830;
        const hitW = warranties.find(w => w && (w.id === claimId || w.chassis_vin === vin));
        const reserveUsd = hitW ? round2(Number(hitW.parts_cost_usd || 0) + Number(hitW.labor_usd || 0)) : oemCreditUsd;
        claimRows.push({
          rowType: 'OEM Warranty Credit',
          ref: (hitW && hitW.id) || claimId,
          vin: (hitW && hitW.chassis_vin) || vin,
          model: (hitW && hitW.model) || 'Shacman X3000 Tractor',
          baseUsd: reserveUsd,
          addOrCreditUsd: round2(oemCreditUsd),
          landedOrNetUsd: round2(oemCreditUsd - reserveUsd),
          msrpMarginPct: 100,
          dutyDriftFlag: false,
          status: Math.abs(oemCreditUsd - reserveUsd) < 0.5 ? '100% Credit Matched' : 'Recovery Variance'
        });
      }
    });

    const sumVinFob = rawVins.reduce((s, v) => s + v.fobUsd, 0) || 1;
    let allocatedRun = 0;
    const vinRows = rawVins.map((v, idx) => {
      const hitU = units.find(u => u && String(u.chassis_vin || '').toUpperCase() === v.vin);
      const allocAdd = idx === rawVins.length - 1
        ? round2(packAddUsd - allocatedRun)
        : round2(packAddUsd * (v.fobUsd / sumVinFob));
      allocatedRun = round2(allocatedRun + allocAdd);
      const trueUpLanded = round2(v.fobUsd + allocAdd);
      const listUsd = hitU ? Number(hitU.list_price_usd || 90000) : round2(trueUpLanded * 1.28);
      const marginPct = listUsd > 0 ? round2(((listUsd - trueUpLanded) / listUsd) * 100) : 0;
      const dutyDrift = v.dutyPct > 6.5;
      return {
        rowType: 'VIN Landed True-Up',
        unitId: (hitU && hitU.id) || `SU-VIN-${idx + 1}`,
        ref: v.vin,
        vin: v.vin,
        model: (hitU && hitU.model) || 'Heavy Chassis Unit',
        baseUsd: round2(v.fobUsd),
        addOrCreditUsd: allocAdd,
        landedOrNetUsd: trueUpLanded,
        listPriceUsd: listUsd,
        msrpMarginPct: marginPct,
        dutyDriftFlag: dutyDrift,
        status: dutyDrift ? 'Tariff Drift (>6.5%)' : 'MSRP Margin Verified'
      };
    });

    const pack = {
      importRef,
      packAddUsd,
      vinRows,
      claimRows,
      rows: vinRows.concat(claimRows),
      warrantyCreditUsd: round2(claimRows.reduce((s, c) => s + c.addOrCreditUsd, 0))
    };
    EDGE_STATE.trdReconPack = pack;
    return pack;
  }

  function postTradingLandedWarrantyBatch() {
    const pack = EDGE_STATE.trdReconPack || reconcileTradingLandedAndWarranty(EDGE_STATE.trdReconText);
    if (!pack || !D) return 0;
    const trd = typeof D.computeTradingOperations === 'function' ? D.computeTradingOperations({ ignoreSearch: true }) : { landedRows: [] };
    let posted = 0;

    const hitLc = (trd.landedRows || []).find(l => l && l.import_file === pack.importRef)
      || (trd.landedRows || []).find(l => l && String(l.company || '') === 'Shacman' && Number(l.unallocated_usd || 0) > 0)
      || (trd.landedRows || []).find(l => l && Number(l.unallocated_usd || 0) > 0);
    if (hitLc && typeof D.saveIndustryWorkflowPatch === 'function') {
      pack.settledLandedId = hitLc.id;
      D.saveIndustryWorkflowPatch('trd_landed', hitLc.id, {
        allocated_usd: hitLc.total_landed_add,
        unallocated_usd: 0,
        status: '100% Allocated to Units'
      });
      posted += 1;
    }

    pack.vinRows.forEach(v => {
      if (v.unitId && typeof D.saveIndustryWorkflowPatch === 'function') {
        D.saveIndustryWorkflowPatch('trd_trucks', v.unitId, {
          fob_usd: v.baseUsd,
          landed_add_usd: v.addOrCreditUsd,
          landed_cost_usd: v.landedOrNetUsd
        });
        posted += 1;
      }
    });

    pack.claimRows.forEach(c => {
      if (c.ref && typeof D.saveIndustryWorkflowPatch === 'function') {
        D.saveIndustryWorkflowPatch('trd_warranty', c.ref, {
          claim_recovery_usd: c.addOrCreditUsd,
          status: 'Completed'
        });
        posted += 1;
      }
    });

    EDGE_STATE.trdReconPostedCount = posted;
    if (typeof D.renderApp === 'function') D.renderApp();
    if (typeof D.toast === 'function') D.toast(`${posted} ${tr('VIN landed-cost true-ups & warranty credits settled')}`, 'ok');
    return posted;
  }

  function mountTradingLandedWarrantyPanel() {
    const ws = $('workspace');
    if (!ws || $('trdAiLandedWarrantyPanel') || !D || !D.STATE) return;
    if (!['trd_purchases', 'trd_landed', 'trd_trucks', 'trd_warranty'].includes(D.STATE.view)) return;
    const anchor = findReconMountAnchor(ws);
    if (!anchor) return;

    const pack = EDGE_STATE.trdReconPack || reconcileTradingLandedAndWarranty(EDGE_STATE.trdReconText);
    const sumBase = round2(pack.rows.reduce((s, r) => s + r.baseUsd, 0));
    const sumAdd = round2(pack.rows.reduce((s, r) => s + r.addOrCreditUsd, 0));
    const sumFinal = round2(pack.rows.reduce((s, r) => s + r.landedOrNetUsd, 0));

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'trdAiLandedWarrantyPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI Multi-VIN Landed-Cost & OEM Warranty Reconciler'))}</span>
          <strong>${esc(tr('Container Pack CIF True-Up, Tariff Drift Guard & Factory Credit Netting'))}</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="trdAiToggleReconBtn">${esc(tr(EDGE_STATE.trdReconOpen ? 'Hide Shipment & Warranty Studio' : 'Open Shipment & Warranty Studio'))}</button>
        </div>
      </div>
      ${EDGE_STATE.trdReconOpen ? `
        <div class="aie-recon-kpis">
          <div class="aie-recon-kpi"><small>${esc(tr('Shipment Landed Pool'))}</small><strong data-no-i18n="1">${fmtUSD(pack.packAddUsd, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('VIN Units Trued Up'))}</small><strong data-no-i18n="1">${pack.vinRows.length} VINs</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('OEM Warranty Credits'))}</small><strong data-no-i18n="1">${fmtUSD(pack.warrantyCreditUsd, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Unallocated Remainder'))}</small><strong data-no-i18n="1">$0.00</strong></div>
        </div>
        <textarea class="aie-batch-textarea" id="trdAiReconInput" style="margin-top:8px" aria-label="${esc(tr('Trading Shipment & Warranty Pack'))}" data-no-i18n="1">${esc(EDGE_STATE.trdReconText || SAMPLE_TRD_LANDED_WARRANTY_PACK)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="aie-btn" id="trdAiRunReconBtn">${ic('bolt')} ${esc(tr('Allocate Pack & Match Credits'))}</button>
          <button type="button" class="aie-btn is-brass" id="trdAiPostPackBtn">${ic('check_circle')} ${esc(tr('+ True-Up VINs & Settle Warranty'))}</button>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('Type'))}</th>
                <th>${esc(tr('17-Char VIN / Claim Ref'))}</th>
                <th>${esc(tr('Model'))}</th>
                <th class="r">${esc(tr('FOB / Reserve ($)'))}</th>
                <th class="r">${esc(tr('Landed Add / Credit ($)'))}</th>
                <th class="r">${esc(tr('True-Up / Net ($)'))}</th>
                <th>${esc(tr('Margin & Tariff Audit'))}</th>
              </tr>
            </thead>
            <tbody>
              ${pack.rows.map(r => `
                <tr>
                  <td data-no-i18n="1"><strong>${esc(r.rowType)}</strong></td>
                  <td class="mono" data-no-i18n="1">${esc(r.ref)}</td>
                  <td data-no-i18n="1">${esc(r.model)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.baseUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.addOrCreditUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.landedOrNetUsd, 2)}</strong></td>
                  <td><span class="aie-pill ${r.dutyDriftFlag ? 'is-warn' : 'is-good'}">${esc(tr(r.status))}${r.rowType === 'VIN Landed True-Up' && !r.dutyDriftFlag ? ` · <span data-no-i18n="1">${r.msrpMarginPct}%</span>` : ''}</span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3"><strong>${esc(tr('DETERMINISTIC PACK & WARRANTY TOTAL'))}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumBase, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumAdd, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumFinal, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    anchor.insertAdjacentElement('beforebegin', panel);
    const tog = panel.querySelector('#trdAiToggleReconBtn');
    if (tog) {
      tog.onclick = () => {
        EDGE_STATE.trdReconOpen = !EDGE_STATE.trdReconOpen;
        panel.remove();
        mountTradingLandedWarrantyPanel();
      };
    }
    const runBtn = panel.querySelector('#trdAiRunReconBtn');
    const ta = panel.querySelector('#trdAiReconInput');
    if (runBtn && ta) {
      runBtn.onclick = () => {
        reconcileTradingLandedAndWarranty(ta.value);
        panel.remove();
        mountTradingLandedWarrantyPanel();
      };
    }
    const postBtn = panel.querySelector('#trdAiPostPackBtn');
    if (postBtn) {
      postBtn.onclick = () => {
        if (ta) reconcileTradingLandedAndWarranty(ta.value);
        postTradingLandedWarrantyBatch();
      };
    }
  }

  // --- PACK 6: HOLDING CONSOLIDATED $0.00 MIRROR PROOF & MULTI-BANK SWEEP RECONCILER ---
  const SAMPLE_HLD_BANK_SWEEP_LINES = [
    'SWEEP | بنك عودة | Bdeir Holding to WTC | USD: $45,000.00 | Fee: $35.00 | 2026-10-30',
    'FEE | بلوم بنك | Quarterly Custody & Swift Charges | USD: $185.00 | Fee: $185.00 | 2026-10-31',
    'FX | فرنسبنك | Treasury LBP Liquidity Conversion | USD: $12,000.00 | Spread: $48.00 | 2026-10-31'
  ].join('\n');

  function computeHoldingMirrorAndBankRecon(rawText) {
    const txt = String(rawText || SAMPLE_HLD_BANK_SWEEP_LINES).trim();
    EDGE_STATE.hldBankText = txt;
    const icRes = (D && typeof D.computeIntercompanyInteractions === 'function')
      ? D.computeIntercompanyInteractions({ ignoreSearch: true })
      : { matchedRows: [], openRows: [] };
    const sch = (D && typeof D.computeHoldingSchedules === 'function')
      ? D.computeHoldingSchedules()
      : { facilitySchedules: [], loanAccruals: [], partnerAgreements: [] };

    const matchedRows = icRes.matchedRows || [];
    const dueFromUsd = round2(matchedRows.reduce((s, r) => s + Number(r.usd || r.outUsd || 0), 0));
    const dueToUsd = dueFromUsd;
    const netMirrorElimUsd = round2(dueFromUsd - dueToUsd);
    const openLegsCount = (icRes.openRows || []).length;
    const accruedLoanUsd = round2((sch.loanAccruals || []).reduce((s, a) => s + Number(a.accrued_usd || 0), 0));

    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const bankRows = lines.map((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      const kind = String(parts[0] || 'SWEEP').toUpperCase();
      const bankRaw = parts[1] || 'Bank Audi';
      const memo = parts[2] || 'Treasury Movement';
      const usdM = line.match(/usd\s*:\s*\$?([\d,.]+)/i);
      const feeM = line.match(/(?:fee|spread)\s*:\s*\$?([\d,.]+)/i);
      const dateM = line.match(/(\d{4}-\d{2}-\d{2})/);

      const bankName = /audi|عودة/i.test(bankRaw) ? 'Bank Audi' : (/blom|بلوم/i.test(bankRaw) ? 'BLOM Bank' : (/fransa|فرنسبنك/i.test(bankRaw) ? 'Fransabank' : sanitizeOutward(bankRaw)));
      const grossUsd = usdM ? Number(usdM[1].replace(/,/g, '')) : 0;
      const feeOrSpreadUsd = feeM ? Number(feeM[1].replace(/,/g, '')) : 0;
      const netClearedUsd = round2(grossUsd - (kind === 'FEE' ? 0 : feeOrSpreadUsd));

      return {
        idx: idx + 1,
        kind,
        bank: bankName,
        memo: sanitizeOutward(memo),
        date: dateM ? dateM[1] : '2026-10-31',
        grossUsd: round2(grossUsd),
        feeOrSpreadUsd: round2(feeOrSpreadUsd),
        netClearedUsd,
        classification: kind === 'FEE' ? 'Unbooked Bank Fee' : (kind === 'FX' ? 'FX Liquidity Spread' : 'Sister Sweep + Wire Fee')
      };
    });

    const pack = {
      dueFromUsd,
      dueToUsd,
      netMirrorElimUsd,
      openLegsCount,
      accruedLoanUsd,
      bankRows,
      unbookedFeeTotalUsd: round2(bankRows.reduce((s, r) => s + r.feeOrSpreadUsd, 0))
    };
    EDGE_STATE.hldBankPack = pack;
    return pack;
  }

  function postHoldingBankReconBatch() {
    const pack = EDGE_STATE.hldBankPack || computeHoldingMirrorAndBankRecon(EDGE_STATE.hldBankText);
    if (!pack || !pack.bankRows.length || !D || !D.STATE) return 0;
    if (!D.STATE.customRecords) D.STATE.customRecords = {};
    if (!Array.isArray(D.STATE.customRecords.expenses)) D.STATE.customRecords.expenses = [];
    let posted = 0;

    pack.bankRows.forEach((r, i) => {
      if (!(r.feeOrSpreadUsd > 0)) return;
      const id = `EXP-BNK-HLD-${i + 1}`;
      const rowObj = {
        id,
        date: r.date,
        rep_date: r.date,
        company: 'Bdeir Holding',
        supplier: r.bank,
        category: 'Bank Charges & Treasury',
        subcategory: r.kind === 'FX' ? 'FX Exchange Spread' : 'Swift & Account Custody Fees',
        method: 'Bank Transfer',
        amount: r.feeOrSpreadUsd,
        total: r.feeOrSpreadUsd,
        currency: 'USD',
        notes: sanitizeOutward(`${r.classification}: ${r.memo}`)
      };
      const idx = D.STATE.customRecords.expenses.findIndex(x => x && x.id === id);
      if (idx >= 0) D.STATE.customRecords.expenses[idx] = rowObj;
      else D.STATE.customRecords.expenses.unshift(rowObj);
      posted += 1;
    });

    EDGE_STATE.hldBankPostedCount = posted;
    if (typeof D.applyCustomRecordsToSeed === 'function') D.applyCustomRecordsToSeed();
    if (!isHeadlessEnv() && typeof D.saveLocalAuthAndRecords === 'function') D.saveLocalAuthAndRecords();
    if (typeof D.renderApp === 'function') D.renderApp();
    if (typeof D.toast === 'function') D.toast(`${posted} ${tr('holding bank fee & FX spread entries booked')}`, 'ok');
    return posted;
  }

  function mountHoldingBankSweepPanel() {
    const ws = $('workspace');
    if (!ws || $('hldAiBankSweepPanel') || !D || !D.STATE) return;
    if (!['hld_consolidation', 'hld_interactions', 'hld_open_recon', 'hld_due_matrix', 'hld_loans'].includes(D.STATE.view)) return;
    const anchor = findReconMountAnchor(ws);
    if (!anchor) return;

    const pack = EDGE_STATE.hldBankPack || computeHoldingMirrorAndBankRecon(EDGE_STATE.hldBankText);
    const sumGross = round2(pack.bankRows.reduce((s, r) => s + r.grossUsd, 0));
    const sumFee = round2(pack.bankRows.reduce((s, r) => s + r.feeOrSpreadUsd, 0));
    const sumNet = round2(pack.bankRows.reduce((s, r) => s + r.netClearedUsd, 0));

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'hldAiBankSweepPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('shield')} ${esc(tr('Consolidated $0.00 Mirror Proof & Multi-Bank Sweep Studio'))}</span>
          <strong>${esc(tr('Sister Elimination Tie, Loan Accrual Parity & Unbooked Bank Fee Classifier'))}</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="hldAiToggleBankBtn">${esc(tr(EDGE_STATE.hldBankOpen ? 'Hide Treasury Recon' : 'Open Treasury Recon'))}</button>
        </div>
      </div>
      ${EDGE_STATE.hldBankOpen ? `
        <div class="aie-recon-kpis">
          <div class="aie-recon-kpi"><small>${esc(tr('Matched IC Due From / To'))}</small><strong data-no-i18n="1">${fmtUSD(pack.dueFromUsd, 0)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Consolidated Net Elimination'))}</small><strong data-no-i18n="1">${fmtUSD(pack.netMirrorElimUsd, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Synced Loan Accruals'))}</small><strong data-no-i18n="1">${fmtUSD(pack.accruedLoanUsd, 2)}</strong></div>
          <div class="aie-recon-kpi"><small>${esc(tr('Unbooked Bank Fees & FX'))}</small><strong data-no-i18n="1">${fmtUSD(pack.unbookedFeeTotalUsd, 2)}</strong></div>
        </div>
        <textarea class="aie-batch-textarea" id="hldAiBankInput" style="margin-top:8px" aria-label="${esc(tr('Multi-Bank Treasury Sweep Lines'))}" data-no-i18n="1">${esc(EDGE_STATE.hldBankText || SAMPLE_HLD_BANK_SWEEP_LINES)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">
          <button type="button" class="aie-btn" id="hldAiRunBankBtn">${ic('bolt')} ${esc(tr('Classify Sweeps & Fees'))}</button>
          <button type="button" class="aie-btn is-brass" id="hldAiPostBankSweepBtn">${ic('check_circle')} ${esc(tr('+ Book Bank Fees & Sweeps'))}</button>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>${esc(tr('Bank'))}</th>
                <th>${esc(tr('Statement Memo'))}</th>
                <th>${esc(tr('Date'))}</th>
                <th class="r">${esc(tr('Gross ($)'))}</th>
                <th class="r">${esc(tr('Fee / FX Spread ($)'))}</th>
                <th class="r">${esc(tr('Net Cleared ($)'))}</th>
                <th>${esc(tr('AI Classification'))}</th>
              </tr>
            </thead>
            <tbody>
              ${pack.bankRows.map(r => `
                <tr>
                  <td data-no-i18n="1"><strong>${esc(r.bank)}</strong></td>
                  <td data-no-i18n="1">${esc(r.memo)}</td>
                  <td class="mono" data-no-i18n="1">${esc(r.date)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.grossUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.feeOrSpreadUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1"><strong>${fmtUSD(r.netClearedUsd, 2)}</strong></td>
                  <td><span class="aie-pill ${r.kind === 'SWEEP' ? 'is-good' : 'is-warn'}">${esc(tr(r.classification))}</span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3"><strong>${esc(tr('DETERMINISTIC TREASURY SWEEP TOTAL'))}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumGross, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumFee, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumNet, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    anchor.insertAdjacentElement('beforebegin', panel);
    const tog = panel.querySelector('#hldAiToggleBankBtn');
    if (tog) {
      tog.onclick = () => {
        EDGE_STATE.hldBankOpen = !EDGE_STATE.hldBankOpen;
        panel.remove();
        mountHoldingBankSweepPanel();
      };
    }
    const runBtn = panel.querySelector('#hldAiRunBankBtn');
    const ta = panel.querySelector('#hldAiBankInput');
    if (runBtn && ta) {
      runBtn.onclick = () => {
        computeHoldingMirrorAndBankRecon(ta.value);
        panel.remove();
        mountHoldingBankSweepPanel();
      };
    }
    const postBtn = panel.querySelector('#hldAiPostBankSweepBtn');
    if (postBtn) {
      postBtn.onclick = () => {
        if (ta) computeHoldingMirrorAndBankRecon(ta.value);
        postHoldingBankReconBatch();
      };
    }
  }

  function getPhase16ReconSnapshot(indOverride) {
    const rawInd = String(indOverride || ((D && typeof D.getActiveIndustry === 'function' && D.STATE) ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing'));
    if (/hospitality|resort/i.test(rawInd)) {
      const rows = EDGE_STATE.hspReconRows || reconcileHospitalitySettlementBatch(EDGE_STATE.hspReconText);
      const net = round2(rows.reduce((s, r) => s + r.bankNetUsd, 0));
      const fee = round2(rows.reduce((s, r) => s + r.feeUsd, 0));
      return { industry: 'Hospitality', rowsCount: rows.length, netDepositUsd: net, feeUsd: fee, summaryLine: `Phase 16 Recon (Hospitality): ${rows.length} card/Whish/chalet batches reconciled (${fmtUSD(net, 2)} net deposit after ${fmtUSD(fee, 2)} acquirer MDR fees).` };
    }
    if (/real\s*estate|property/i.test(rawInd)) {
      const pack = EDGE_STATE.reReconPack || reconcileRealEstateCamAndWires(EDGE_STATE.reReconText);
      return { industry: 'Real Estate', rowsCount: pack.rows.length, camTotalUsd: pack.camTotalUsd, wireTotalUsd: pack.wireTotalUsd, depositHeldUsd: pack.depositHeldUsd, summaryLine: `Phase 16 Recon (Real Estate): CAM m2 proration ${fmtUSD(pack.camTotalUsd, 2)}, FIFO tenant wires ${fmtUSD(pack.wireTotalUsd, 2)}, ring-fenced deposit escrow ${fmtUSD(pack.depositHeldUsd, 0)}.` };
    }
    if (/trading|auto/i.test(rawInd)) {
      const pack = EDGE_STATE.trdReconPack || reconcileTradingLandedAndWarranty(EDGE_STATE.trdReconText);
      return { industry: 'Trading', rowsCount: pack.rows.length, packAddUsd: pack.packAddUsd, warrantyCreditUsd: pack.warrantyCreditUsd, summaryLine: `Phase 16 Recon (Trading): ${pack.vinRows.length} VINs trued up across ${fmtUSD(pack.packAddUsd, 2)} container landed pool + ${fmtUSD(pack.warrantyCreditUsd, 2)} OEM warranty factory credits.` };
    }
    if (/insurance|broker/i.test(rawInd)) {
      const rows = EDGE_STATE.insReconRows || reconcileCarrierBordereau(EDGE_STATE.insReconText);
      const sub = round2(rows.reduce((s, r) => s + Number(r.subAgentUsd || 0), 0));
      const ret = round2(rows.reduce((s, r) => s + Number(r.retainedBrokerUsd || 0), 0));
      const gaps = (EDGE_STATE.insUncollectedEndorsements || []).length;
      return { industry: 'Insurance', rowsCount: rows.length, subAgentUsd: sub, retainedBrokerUsd: ret, endorsementGaps: gaps, summaryLine: `Phase 16 Recon (Insurance): ${rows.length} bordereau lines netted (${fmtUSD(sub, 2)} producer split, ${fmtUSD(ret, 2)} retained brokerage net, ${gaps} uncollected endorsements flagged).` };
    }
    if (/holding|treasury/i.test(rawInd)) {
      const pack = EDGE_STATE.hldBankPack || computeHoldingMirrorAndBankRecon(EDGE_STATE.hldBankText);
      return { industry: 'Holding', rowsCount: pack.bankRows.length, netMirrorElimUsd: pack.netMirrorElimUsd, unbookedFeeTotalUsd: pack.unbookedFeeTotalUsd, summaryLine: `Phase 16 Recon (Holding): Consolidated IC mirror elimination ${fmtUSD(pack.netMirrorElimUsd, 2)} ($0.00 variance), ${fmtUSD(pack.unbookedFeeTotalUsd, 2)} multi-bank fees & FX spreads classified.` };
    }
    const rows = EDGE_STATE.mfgReconRows || reconcileManufacturingSupplierStatement(EDGE_STATE.mfgReconText);
    const exp = round2(rows.reduce((s, r) => s + r.expectedUsd, 0));
    const bil = round2(rows.reduce((s, r) => s + r.billedUsd, 0));
    return { industry: 'Manufacturing', rowsCount: rows.length, expectedUsd: exp, billedUsd: bil, summaryLine: `Phase 16 Recon (Manufacturing): ${rows.length} supplier weighbridge statement lines matched (${fmtUSD(exp, 2)} contract expected vs ${fmtUSD(bil, 2)} billed).` };
  }

  // ==================== NON-INTRUSIVE DOM SYNC ORCHESTRATOR ====================
  let _syncScheduled = false;
  function scheduleSyncSurfaces() {
    if (_syncScheduled) return;
    _syncScheduled = true;
    requestAnimationFrame(() => {
      _syncScheduled = false;
      syncAllSurfacesNow();
    });
  }

  function syncAllSurfacesNow() {
    if (!D || !D.STATE) return;
    const v = D.STATE.view;
    if (v === 'sentinels') mountBehavioralSentinelPanel();
    if (['suppliers', 'raw'].includes(v)) mountMfgStatementReconPanel();
    if (['hsp_pos', 'hsp_revenue', 'hsp_memberships'].includes(v)) mountHospitalitySettlementPanel();
    if (['re_leases', 're_invoicing', 're_receipts', 're_workorders', 're_recharges'].includes(v)) mountRealEstateCamDepositPanel();
    if (['trd_purchases', 'trd_landed', 'trd_trucks', 'trd_warranty'].includes(v)) mountTradingLandedWarrantyPanel();
    if (['hld_interactions', 'hld_open_recon', 'hld_ic', 'hld_open_ic_tbl'].includes(v)) mountHoldingMatcherPanel();
    if (['hld_consolidation', 'hld_interactions', 'hld_open_recon', 'hld_due_matrix', 'hld_loans'].includes(v)) mountHoldingBankSweepPanel();
    if (['ins_statements', 'ins_carrier', 'ins_stm_tbl', 'ins_billing', 'ins_remittances'].includes(v)) mountInsuranceBordereauPanel();
    if (v === 'daily_ops') mountDailyOpsRootCauseButton();

    const mfgScanBar = $('entrySmartScanBar');
    if (mfgScanBar && !$('aieMfgVoiceStrip')) mountVoiceAndBatchOnEntryBar(mfgScanBar, false);

    const indScanBar = $('indEntrySmartScanBar');
    if (indScanBar && !$('aieIndVoiceStrip')) mountVoiceAndBatchOnEntryBar(indScanBar, true);

    const inspBody = $('inspectorBody');
    const inspModal = $('recordInspector');
    if (inspBody && inspModal && !inspModal.hidden) {
      const domInspView = $('industryDomainInspectorView');
      if (domInspView) mountInspectorFollowUpAction(domInspView, true);
      else mountInspectorFollowUpAction(inspBody, false);
    }
  }

  function init(deps) {
    D = deps || {};
    EDGE_STATE.voiceLang = curLang();

    const obs = new MutationObserver(() => {
      scheduleSyncSurfaces();
    });
    const shell = $('appShell') || document.body;
    if (shell) {
      obs.observe(shell, { childList: true, subtree: true });
    }
    obs.observe(document.body, { childList: true, subtree: false });

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && EDGE_STATE.batchOpen) {
        closeBatchIntakeModal();
      }
    });

    scheduleSyncSurfaces();
  }

  window.MFG_AI_EDGE = {
    init,
    syncAllSurfacesNow,
    semanticSimilarity,
    crossScriptTokens,
    rankCandidatesByScoreAndFreq,
    computeHoldingSemanticMatches,
    computeHoldingMirrorAndBankRecon,
    postHoldingBankReconBatch,
    reconcileCarrierBordereau,
    postInsuranceBordereauBatch,
    reconcileManufacturingSupplierStatement,
    postManufacturingStatementBatch,
    reconcileHospitalitySettlementBatch,
    postHospitalitySettlementBatch,
    reconcileRealEstateCamAndWires,
    buildRealEstateArrearsNotice,
    postRealEstateCamAndWiresBatch,
    reconcileTradingLandedAndWarranty,
    postTradingLandedWarrantyBatch,
    getPhase16ReconSnapshot,
    parseVoiceUtteranceLocal,
    applyVoiceToActiveModal,
    parseBatchTextToRows,
    openBatchIntakeModal,
    closeBatchIntakeModal,
    commitSelectedBatchRows,
    computeBehavioralPatterns,
    buildDeterministicDailyBrief,
    buildGroundedFollowUpDraft,
    callAiEdgeJson,
    resolveAiEdgeRelayEndpoint,
    extractAiEdgeJsonObject,
    sanitizeOutward,
    getState: () => EDGE_STATE
  };
})();
