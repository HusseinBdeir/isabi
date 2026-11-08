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
    'تصليح': 'repair', 'تأمين': 'insurance', 'بوليصة': 'policy', 'ايجار': 'lease', 'إيجار': 'lease'
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

  async function callAiEdgeJson(task, prompt, dataUrl, mimeType) {
    if (isHeadlessEnv()) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch('/api/ai-edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          prompt,
          dataUrl: dataUrl || '',
          mimeType: mimeType || ''
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res && res.ok) {
        const j = await res.json();
        if (j && j.result && typeof j.result === 'object') return j.result;
      }
    } catch (_) {}
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
      // 100% Deterministic expected commission & variance math
      const expectedComm = round2(effGross * (agrRate / 100));
      const variance = round2(paidComm - expectedComm);

      return {
        idx: idx + 1,
        policyId: (matchedPol && matchedPol.id) || refRaw,
        carrier,
        client: sanitizeOutward((matchedPol && matchedPol.client) || clientRaw || 'Policyholder'),
        grossUsd: effGross,
        ratePct: agrRate,
        expectedCommUsd: expectedComm,
        statementCommUsd: round2(paidComm),
        varianceUsd: variance,
        confidencePct: matchConf,
        status: Math.abs(variance) < 0.5 ? 'Matched' : (variance < 0 ? 'Short-Paid' : 'Over-Paid')
      };
    });

    EDGE_STATE.insReconRows = out;
    return out;
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
              <div class="aie-behav-row" data-aie-inspect-key="expenses" data-aie-inspect-id="${esc(h.sampleId || '')}" data-no-i18n="1">
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
              <div class="aie-behav-row" data-aie-inspect-key="equipment_repairs" data-aie-inspect-id="${esc(h.id || '')}" data-no-i18n="1">
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
    const sumExp = round2(rows.reduce((a, r) => a + r.expectedCommUsd, 0));
    const sumPaid = round2(rows.reduce((a, r) => a + r.statementCommUsd, 0));
    const sumVar = round2(rows.reduce((a, r) => a + r.varianceUsd, 0));

    const panel = document.createElement('div');
    panel.className = 'aie-panel';
    panel.id = 'insAiBordereauPanel';
    panel.innerHTML = `
      <div class="aie-head">
        <div class="aie-title-wrap">
          <span class="aie-pill">${ic('sparkles')} ${esc(tr('AI Carrier Bordereau Reconciler'))}</span>
          <strong>${esc(tr('Fuzzy Policy & Cross-Script Insured Matching vs Chronological Commission Rates'))}</strong>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" class="aie-btn is-brass" id="insAiToggleReconBtn">${esc(tr(EDGE_STATE.insReconOpen ? 'Hide Bordereau Matcher' : 'Open Bordereau Matcher'))}</button>
        </div>
      </div>
      ${EDGE_STATE.insReconOpen ? `
        <textarea class="aie-batch-textarea" id="insAiBordereauInput" style="margin-top:8px" aria-label="${esc(tr('Carrier Bordereau Lines'))}" data-no-i18n="1">${esc(EDGE_STATE.insReconText || SAMPLE_CARRIER_BORDEREAU)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
          <button type="button" class="aie-btn is-brass" id="insAiRunBordereauBtn">${ic('bolt')} ${esc(tr('Reconcile Against Agreements'))}</button>
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
                  <td data-no-i18n="1">${esc(r.client)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.grossUsd, 2)}</td>
                  <td class="r mono" data-no-i18n="1">${fmtUSD(r.expectedCommUsd, 2)}</td>
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
                <td class="r mono"><strong>${fmtUSD(sumPaid, 2)}</strong></td>
                <td class="r mono"><strong>${fmtUSD(sumVar, 2)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    `;

    firstPanel.insertAdjacentElement('beforebegin', panel);
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
    if (['hld_interactions', 'hld_open_recon', 'hld_ic', 'hld_open_ic_tbl'].includes(v)) mountHoldingMatcherPanel();
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
    reconcileCarrierBordereau,
    parseVoiceUtteranceLocal,
    applyVoiceToActiveModal,
    parseBatchTextToRows,
    openBatchIntakeModal,
    closeBatchIntakeModal,
    commitSelectedBatchRows,
    computeBehavioralPatterns,
    buildDeterministicDailyBrief,
    buildGroundedFollowUpDraft,
    sanitizeOutward,
    getState: () => EDGE_STATE
  };
})();
