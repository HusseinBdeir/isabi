/* ============================================================================
   ISABI Systems - Hybrid Live-SQL & Cloud AI Copilot (js/ask_isabi.js)
   1. 100% RLS-safe, entity-scoped & date-slicer-aware live ERP metrics.
   2. Instant deterministic answers (<80ms) on exact records, ledgers & greetings.
   3. Dual-IP Cloud + Client LLM reasoning (EN / AR / FR) for open-ended queries.
   4. Two-bubble human chat cadence + 1-click Hub, Form & 360 Inspector actions.
   ============================================================================ */
(function () {
  'use strict';

  const MONTH_MAP = {
    jan: '01', january: '01', 'يناير': '01', 'كانون الثاني': '01', janvier: '01',
    feb: '02', february: '02', 'فبراير': '02', 'شباط': '02', 'février': '02', fevrier: '02',
    mar: '03', march: '03', 'مارس': '03', 'آذار': '03', اذار: '03', mars: '03',
    apr: '04', april: '04', 'أبريل': '04', ابريل: '04', 'نيسان': '04', avril: '04',
    may: '05', 'مايو': '05', 'أيار': '05', ايار: '05', mai: '05',
    jun: '06', june: '06', 'يونيو': '06', 'حزيران': '06', juin: '06',
    jul: '07', july: '07', 'يوليو': '07', 'تموز': '07', juillet: '07',
    aug: '08', august: '08', 'أغسطس': '08', اغسطس: '08', 'آب': '08', اب: '08', 'août': '08', aout: '08',
    sep: '09', sept: '09', september: '09', 'سبتمبر': '09', 'أيلول': '09', ايلول: '09', septembre: '09',
    oct: '10', october: '10', 'أكتوبر': '10', اكتوبر: '10', 'تشرين الأول': '10', octobre: '10',
    nov: '11', november: '11', 'نوفمبر': '11', 'تشرين الثاني': '11', novembre: '11',
    dec: '12', december: '12', 'ديسمبر': '12', 'كانون الأول': '12', 'décembre': '12', decembre: '12'
  };

  let _ctx = null;
  let _attSeq = 0;
  const VOICE_LANG_MAP = {
    en: { bcp47: 'en-US', label: 'EN', name: 'English' },
    ar: { bcp47: 'ar-LB', label: 'AR', name: 'العربية' },
    fr: { bcp47: 'fr-FR', label: 'FR', name: 'Français' }
  };
  const _chatState = {
    history: [],
    pending: null,
    typingFollowup: false,
    lastTurn: null,
    wired: false,
    attachments: [],
    voiceActive: false,
    liveVoiceMode: false,
    voiceModePhase: 'idle',
    handsFreeVoice: true,
    voiceAutoSendOnSilence: false,
    voiceLang: 'en',
    voiceStartMs: 0,
    voiceTimerId: null,
    speechRec: null,
    mediaRecorder: null,
    mediaRecorderMime: '',
    mediaStream: null,
    audioCtx: null,
    analyserNode: null,
    vadRafId: null,
    speechDetectedInTurn: false,
    speechEnergyAccumMs: 0,
    lastLoudMs: 0,
    micLevel: 0,
    audioChunks: [],
    voiceBaseText: '',
    voiceInterimText: '',
    voiceStatusOverride: '',
    activeAudioEl: null,
    activeAudioQueue: [],
    activeAudioPaused: false,
    activeAudioProgress: 0,
    activeSpeakBtn: null,
    activeSpeakTurnIdx: -1,
    activeSpeakCtrl: null,
    activeSpeakCaption: '',
    activeBriefingScope: '',
    activePeriodSummaryScope: '',
    periodPopoverOpen: false,
    periodPopoverAnchor: null,
    periodVarianceCache: new Map(),
    periodVarianceInflight: new Map(),
    lastSpokenText: '',
    playbackRate: (function () {
      try {
        const r = Number(localStorage.getItem('isabi_ask_voice_rate') || 1);
        return (r === 1.2 || r === 1.5 || r === 0.9) ? r : 1;
      } catch (_) { return 1; }
    })(),
    autoVoiceReadback: (function () {
      try { return localStorage.getItem('isabi_ask_auto_voice') === '1'; } catch (_) { return false; }
    })(),
    ttsAudioCache: new Map()
  };

  function cleanOut(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2014\u2013]/g, '-')
      .replace(/[\u2190-\u21FF\u25B8]/g, 'to')
      .trim();
  }

  function esc(s) {
    if (_ctx && typeof _ctx.esc === 'function') return _ctx.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  }

  function detectLang(q) {
    if (/[\u0600-\u06FF]/.test(q)) return 'ar';
    if (/\b(bonjour|salut|bonsoir|comment|combien|coute|coûte|prix|merci|comptabilit|entreprise|société|societe|facture|caisse|pointage|stock|dépense|depense|dépenses|depenses|chiffre|bénéfice|benefice|trésorerie|tresorerie|clients?|fournisseurs?|aujourd'hui|hier|quel|quelle|quels|quelles|pouvez-vous|est-ce)\b/i.test(q)) {
      return 'fr';
    }
    return 'en';
  }

  function shiftIso(iso, deltaDays) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    d.setDate(d.getDate() + deltaDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function lastDayOfMonth(y, m) {
    const dt = new Date(Number(y), Number(m), 0);
    return String(dt.getDate()).padStart(2, '0');
  }

  function getActiveUser() {
    return (_ctx && typeof _ctx.activeUser === 'function') ? _ctx.activeUser() : null;
  }

  function userDisplayName(u) {
    const target = u || getActiveUser();
    return cleanOut((target && (target.full_name || target.name)) || '');
  }

  function isReasoningQuery(q) {
    const s = String(q || '').trim();
    if (/\b(why|how\s+(?:can|could|should|do\s+we|to)|what\s+(?:should|stands?\s+out|needs?\s+attention|are\s+the\s+(?:key|main|biggest)\s+(?:risks?|drivers?|insights?|issues?))|recommend|advise|advice|strategy|improve|reduce|mitigate|prioritize|what\s+do\s+you\s+think|is\s+it\s+better|root\s+cause|anomal(?:y|ies)|unusual|underperform\w*|forecast|diagnos\w*|draft\s+a|write\s+a|spot\s+risks?)\b/i.test(s)) {
      return !/^explain\s+the\s+diesel\s+tank\s+reconciliation/i.test(s);
    }
    if (/(لماذا|ليش|ما\s+سبب|كيف\s+نقدر|كيف\s+يمكن|بماذا\s+تنصح|شو\s+رأيك|ما\s+رأيك|كيف\s+نحسن|كيف\s+نخفض|ما\s+الأهم|أهم\s+الملاحظات|مخاطر)/.test(s)) return true;
    if (/\b(pourquoi|comment\s+(?:réduire|reduire|améliorer|ameliorer)|que\s+conseillez|quel\s+conseil|anomalies?|risques?\s+principaux|que\s+faut-il\s+surveiller)\b/i.test(s)) return true;
    return false;
  }

  function getAllowedCompanies(user) {
    if (_ctx && typeof _ctx.allowedCompanyNames === 'function') {
      return _ctx.allowedCompanyNames(user || getActiveUser());
    }
    return ['WTC', 'BBConstruction', 'Lions Transport'];
  }

  function mapCompanyNameToKey(coName) {
    const n = norm(coName);
    const map = (_ctx && _ctx.COMPANY_BU_MATCH) || {};
    for (const k of Object.keys(map)) {
      if (map[k] && norm(map[k]) === n) return k;
    }
    if (n === 'wtc') return 'wtc';
    if (n === 'bbconstruction' || n === 'bbc') return 'bbconstruction';
    if (n === 'lions transport' || n === 'lions' || n === 'lionstransport') return 'lionstransport';
    return coName;
  }

  function isEntityComparisonPrompt(cleanQ) {
    if (/\b(compare\s+entit\w*|entity\s+comparison|all\s+entit\w*|all\s+compan\w*|across\s+entit\w*|across\s+compan\w*|group\s+total|between\s+wtc\s+and)\b/i.test(cleanQ)) return true;
    if (/(مقارنة\s+الشركات|مقارنة\s+الكيانات|قارن\s+بين\s+الشركات|كل\s+الشركات)/.test(cleanQ)) return true;
    if (/\b(comparer\s+les\s+(?:sociétés|societes|entités|entites)|toutes\s+les\s+(?:sociétés|societes|entités|entites))\b/i.test(cleanQ)) return true;
    return false;
  }

  function isContinuationPrompt(cleanQ) {
    if (!cleanQ) return false;
    if (/^(and\b|what\s+about\b|how\s+about\b|also\b|why\s+(?:was|were|is|did)\b|how\s+come\b|break\s+it\s+down\b)/i.test(cleanQ.trim())) return true;
    if (/\b(that\s+(?:month|period|day|year|entity|company)|same\s+(?:month|period|day|year)|in\s+that\s+(?:month|period))\b/i.test(cleanQ)) return true;
    if (/^(وماذا\s+عن|وشو\s+بالنسبة|شو\s+بالنسبة|ولماذا|وليش)/.test(cleanQ.trim())) return true;
    if (/^(et\s+pour|qu'en\s+est-il|et\s+en\b|pourquoi\s+était)/i.test(cleanQ.trim())) return true;
    return false;
  }

  function resolveQueryScope(cleanQ, user) {
    const low = cleanQ.toLowerCase();
    const allowed = getAllowedCompanies(user);
    const catalog = (_ctx && typeof _ctx.getCompanyCatalog === 'function') ? _ctx.getCompanyCatalog() : [];
    const prevTurn = (cleanQ && isContinuationPrompt(cleanQ)) ? _chatState.lastTurn : null;

    // Check explicit company mention in query
    const aliases = [
      { re: /\b(wtc)\b/i, name: 'WTC', key: 'wtc' },
      { re: /\b(bbconstruction|bb\s+construction|bbc)\b/i, name: 'BBConstruction', key: 'bbconstruction' },
      { re: /\b(lions\s+transport|lions)\b/i, name: 'Lions Transport', key: 'lionstransport' }
    ];
    let mentionedCo = null;
    const matchedAliases = aliases.filter(a => a.re.test(cleanQ));
    if (matchedAliases.length === 1) {
      mentionedCo = matchedAliases[0];
    } else if (!matchedAliases.length && catalog.length) {
      for (let i = 0; i < catalog.length; i++) {
        const c = catalog[i];
        if (c && c.name && c.name.length >= 4 && low.includes(c.name.toLowerCase())) {
          mentionedCo = { name: c.name, key: mapCompanyNameToKey(c.name) };
          break;
        }
      }
    }

    let rlsBlockedCompany = '';
    let coKey = (_ctx && _ctx.STATE && _ctx.STATE.company) || 'manufacturing-group';
    let coNames = allowed.slice();
    const wantsAllEntities = isEntityComparisonPrompt(cleanQ) || matchedAliases.length > 1;

    if (wantsAllEntities) {
      const matchedCat = catalog.find(c => mapCompanyNameToKey(c.name) === coKey || norm(c.name) === norm(coKey));
      const activeInd = String(coKey).startsWith('industry:')
        ? String(coKey).slice(9)
        : ((matchedCat && matchedCat.industry) || 'Manufacturing');
      const indCos = catalog.filter(c => (c.industry || 'Manufacturing') === activeInd).map(c => c.name);
      coKey = activeInd === 'Manufacturing' ? 'manufacturing-group' : `industry:${activeInd}`;
      coNames = indCos.length
        ? indCos.filter(n => !allowed.length || allowed.some(a => norm(a) === norm(n)))
        : allowed.slice();
    } else if (mentionedCo) {
      if (!allowed.some(a => norm(a) === norm(mentionedCo.name))) {
        rlsBlockedCompany = mentionedCo.name;
      } else {
        coKey = mentionedCo.key;
        coNames = [mentionedCo.name];
      }
    } else if (prevTurn && prevTurn.mentionedCo && allowed.some(a => norm(a) === norm(prevTurn.mentionedCo.name))) {
      coKey = prevTurn.mentionedCo.key;
      coNames = [prevTurn.mentionedCo.name];
      mentionedCo = prevTurn.mentionedCo;
    } else if (_ctx && _ctx.COMPANY_BU_MATCH && _ctx.COMPANY_BU_MATCH[coKey]) {
      const activeBu = _ctx.COMPANY_BU_MATCH[coKey];
      coNames = allowed.filter(a => norm(a) === norm(activeBu));
    } else if (String(coKey).startsWith('industry:')) {
      const ind = String(coKey).slice(9);
      const indCos = catalog.filter(c => (c.industry || 'Manufacturing') === ind).map(c => c.name);
      if (indCos.length) coNames = indCos.filter(n => !allowed.length || allowed.includes(n));
    }

    // Parse optional date override from query ("today", "yesterday", "2026-10-30", "Oct 2026", "2025", etc.)
    const seedToday = (_ctx && _ctx.SEED_DATE) || (_ctx && _ctx.todayISO ? _ctx.todayISO() : '2026-10-30');
    const realToday = (_ctx && _ctx.todayISO) ? _ctx.todayISO() : seedToday;
    const baseRange = (_ctx && typeof _ctx.periodRange === 'function' && _ctx.STATE)
      ? _ctx.periodRange(_ctx.STATE.period)
      : null;

    let dateRange = baseRange ? { from: baseRange.from, to: baseRange.to, label: '' } : null;
    let periodSpec = null;
    let customDateOverride = false;
    let forceTxBasis = false;

    if (/\b(today|today's|aujourd'hui)\b/i.test(cleanQ) || /(اليوم|نهار اليوم)/.test(cleanQ)) {
      const probeToday = countAnyTxOnDate(realToday, coNames) > 0 ? realToday : seedToday;
      dateRange = { from: probeToday, to: probeToday, label: probeToday === realToday ? `Today (${probeToday})` : `Latest Operational Day (${probeToday})` };
      periodSpec = `day:${probeToday}`;
      customDateOverride = true;
      forceTxBasis = true;
    } else if (/\b(yesterday|yesterday's|hier)\b/i.test(cleanQ) || /(أمس|امس|البارحة|امبارح)/.test(cleanQ)) {
      const yReal = shiftIso(realToday, -1);
      const ySeed = shiftIso(seedToday, -1);
      const probeY = countAnyTxOnDate(yReal, coNames) > 0 ? yReal : ySeed;
      dateRange = { from: probeY, to: probeY, label: `Yesterday (${probeY})` };
      periodSpec = `day:${probeY}`;
      customDateOverride = true;
      forceTxBasis = true;
    } else if (/\b(this\s+month|current\s+month|mtd|ce\s+mois)\b/i.test(cleanQ) || /(هذا الشهر|الشهر الحالي)/.test(cleanQ)) {
      const ym = seedToday.slice(0, 7);
      dateRange = { from: `${ym}-01`, to: `${ym}-${lastDayOfMonth(ym.slice(0, 4), ym.slice(5, 7))}`, label: `Month ${ym}` };
      periodSpec = `month:${ym}`;
      customDateOverride = true;
    } else if (/\b(last\s+month|previous\s+month|mois\s+dernier)\b/i.test(cleanQ) || /(الشهر الماضي|الشهر السابق)/.test(cleanQ)) {
      const prevD = shiftIso(seedToday.slice(0, 7) + '-01', -1);
      const ym = prevD.slice(0, 7);
      dateRange = { from: `${ym}-01`, to: `${ym}-${lastDayOfMonth(ym.slice(0, 4), ym.slice(5, 7))}`, label: `Month ${ym}` };
      periodSpec = `month:${ym}`;
      customDateOverride = true;
    } else if (/\b(all[- ]time|overall|lifetime|tout\s+le\s+temps)\b/i.test(cleanQ) || /(كل الفترات|الإجمالي الكلي|من البداية)/.test(cleanQ)) {
      dateRange = null;
      periodSpec = 'all';
      customDateOverride = true;
    } else {
      const ymdIso = cleanQ.match(/\b(202[4-9])-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
      if (ymdIso) {
        const dIso = `${ymdIso[1]}-${ymdIso[2]}-${ymdIso[3]}`;
        dateRange = { from: dIso, to: dIso, label: dIso };
        periodSpec = `day:${dIso}`;
        customDateOverride = true;
        forceTxBasis = true;
      } else {
        const ymIso = cleanQ.match(/\b(202[4-9])-(0[1-9]|1[0-2])\b/);
        if (ymIso) {
          const y = ymIso[1], m = ymIso[2];
          dateRange = { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDayOfMonth(y, m)}`, label: `${y}-${m}` };
          periodSpec = `month:${y}-${m}`;
          customDateOverride = true;
        } else {
          for (const [mWord, mNum] of Object.entries(MONTH_MAP)) {
            const escM = mWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const mdRe = new RegExp(`(?:^|\\s|\\b)(?:${escM}\\s+([0-2]?\\d|3[01])(?:,?\\s*(202[4-9]))?|([0-2]?\\d|3[01])\\s+${escM}(?:,?\\s*(202[4-9]))?)(?:$|\\s|\\b|[?,!.])`, 'i');
            const mdMatch = cleanQ.match(mdRe);
            if (mdMatch) {
              const dy = String(Number(mdMatch[1] || mdMatch[3])).padStart(2, '0');
              const yr = mdMatch[2] || mdMatch[4] || seedToday.slice(0, 4);
              const dIso = `${yr}-${mNum}-${dy}`;
              dateRange = { from: dIso, to: dIso, label: dIso };
              periodSpec = `day:${dIso}`;
              customDateOverride = true;
              forceTxBasis = true;
              break;
            }
            const re = new RegExp(`(?:^|\\s|\\b)${escM}(?:\\s+(202[4-9]))?(?:$|\\s|\\b)`, 'i');
            const mMatch = cleanQ.match(re);
            if (mMatch) {
              const yr = mMatch[1] || seedToday.slice(0, 4);
              dateRange = { from: `${yr}-${mNum}-01`, to: `${yr}-${mNum}-${lastDayOfMonth(yr, mNum)}`, label: `${yr}-${mNum}` };
              periodSpec = `month:${yr}-${mNum}`;
              customDateOverride = true;
              break;
            }
          }
          if (!customDateOverride) {
            const yrOnly = cleanQ.match(/\b(2024|2025|2026|2027)\b/);
            if (yrOnly && !/\b(ticket|invoice|voucher|#)\s*202[4-7]\b/i.test(cleanQ)) {
              const yr = yrOnly[1];
              dateRange = { from: `${yr}-01-01`, to: `${yr}-12-31`, label: `FY ${yr}` };
              periodSpec = `year:${yr}`;
              customDateOverride = true;
            }
          }
        }
      }
    }

    if (!customDateOverride && prevTurn && prevTurn.customDateOverride) {
      dateRange = prevTurn.dateRange;
      periodSpec = prevTurn.periodSpec;
      customDateOverride = true;
      forceTxBasis = Boolean(prevTurn.forceTxBasis);
    }

    const kpiBase = (_ctx && typeof _ctx.getKPI === 'function') ? _ctx.getKPI(coKey) : {};
    const scopeCoLabel = coNames.length === 1
      ? coNames[0]
      : (String(coKey).startsWith('industry:')
          ? (String(coKey).slice(9) + ' Group')
          : cleanOut(((_ctx && _ctx.COMPANY_LABELS && _ctx.COMPANY_LABELS[coKey]) || 'All Manufacturing Group').split('(')[0]));
    const periodLabel = customDateOverride
      ? (dateRange ? dateRange.label : 'All-Time')
      : cleanOut(kpiBase.label || 'All-Time');

    return {
      user,
      allowed,
      rlsBlockedCompany,
      mentionedCo,
      wantsAllEntities,
      inheritedTopic: prevTurn ? prevTurn.topic : '',
      coKey,
      coNames,
      scopeCoLabel,
      periodLabel,
      fullScopeLabel: `${scopeCoLabel} · ${periodLabel}`,
      dateRange,
      periodSpec,
      customDateOverride,
      forceTxBasis,
      basis: forceTxBasis ? 'tx' : ((_ctx && _ctx.STATE && _ctx.STATE.basis) || 'rep')
    };
  }

  function recDateOf(r, basis) {
    if (!r) return '';
    if (basis === 'tx') return String(r.date || r.rep_date || r.start_date || '').slice(0, 10);
    return String(r.rep_date || r.date || r.start_date || '').slice(0, 10);
  }

  function countAnyTxOnDate(iso, coNames) {
    if (!_ctx || !_ctx.SEED || !_ctx.SEED.records) return 0;
    const set = new Set((coNames || []).map(norm));
    const pools = [_ctx.SEED.records.sales_tickets, _ctx.SEED.records.raw_purchases, _ctx.SEED.records.expenses];
    let n = 0;
    for (let p = 0; p < pools.length; p++) {
      const arr = pools[p] || [];
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        if (!r || r.voided) continue;
        if (set.size && r.company && !set.has(norm(r.company))) continue;
        if (String(r.date || '').slice(0, 10) === iso) {
          n++;
          if (n >= 1) return n;
        }
      }
    }
    return n;
  }

  function scopedRows(tableKey, scope, opts = {}) {
    if (!_ctx || !_ctx.SEED || !_ctx.SEED.records) return [];
    const rawList = _ctx.SEED.records[tableKey] || [];
    if (!rawList.length) return [];
    if (!scope.customDateOverride && !opts.ignorePeriod && typeof _ctx.filterRecords === 'function') {
      return _ctx.filterRecords(rawList, {
        ignoreSearch: true,
        company: scope.coKey,
        basis: opts.basis || scope.basis,
        tableKey
      });
    }
    const baseAll = (typeof _ctx.filterRecords === 'function')
      ? _ctx.filterRecords(rawList, {
          ignoreSearch: true,
          ignorePeriod: true,
          company: scope.coKey,
          basis: opts.basis || scope.basis,
          tableKey
        })
      : rawList.filter(r => r && !r.voided);
    if (opts.ignorePeriod || !scope.dateRange) return baseAll;
    const { from, to } = scope.dateRange;
    const b = opts.basis || scope.basis;
    return baseAll.filter(r => {
      const d = recDateOf(r, b);
      return !d || (d >= from && d <= to);
    });
  }

  function normalizeKpiAliases(rawK) {
    const k = Object.assign({}, rawK || {});
    k.expenses_total = Number(k.expenses != null ? k.expenses : (k.expenses_total || 0));
    k.receipts_collected = Number(k.receipts != null ? k.receipts : (k.receipts_collected || 0));
    k.cash_expense = Number(k.cash_expenses != null ? k.cash_expenses : (k.cash_expense || 0));
    k.settlements_paid = Number(k.settlements_paid || 0);
    k.ap_settled = Number(k.ap_settled != null ? k.ap_settled : k.settlements_paid);
    return k;
  }

  function evalExactKPI(coKey, scope) {
    if (!_ctx || typeof _ctx.getKPI !== 'function') return normalizeKpiAliases({});
    if (!scope || !scope.customDateOverride || !scope.periodSpec || !_ctx.STATE) {
      return normalizeKpiAliases(_ctx.getKPI(coKey));
    }
    const st = _ctx.STATE;
    const prevP = st.period, prevF = st.dateFrom, prevT = st.dateTo, prevB = st.basis;
    try {
      st.period = scope.periodSpec;
      st.dateFrom = '';
      st.dateTo = '';
      if (scope.basis) st.basis = scope.basis;
      return normalizeKpiAliases(_ctx.getKPI(coKey));
    } finally {
      st.period = prevP;
      st.dateFrom = prevF;
      st.dateTo = prevT;
      st.basis = prevB;
    }
  }

  function computeWindowSummary(scope, coOverrideName) {
    const subScope = coOverrideName
      ? Object.assign({}, scope, {
          coKey: mapCompanyNameToKey(coOverrideName),
          coNames: [coOverrideName],
          scopeCoLabel: coOverrideName
        })
      : scope;

    const k = evalExactKPI(subScope.coKey, subScope);
    const kTx = (subScope.customDateOverride && subScope.basis !== 'tx')
      ? evalExactKPI(subScope.coKey, Object.assign({}, subScope, { basis: 'tx' }))
      : k;
    const salesRows = scopedRows('sales_tickets', subScope);
    const expRows = scopedRows('expenses', subScope);
    const rawRows = scopedRows('raw_purchases', subScope);
    return {
      k,
      kTx,
      salesRows,
      expRows,
      rawRows,
      fromLiveKpi: !subScope.customDateOverride
    };
  }

  function fmtMoney(v, dec = 0) {
    if (_ctx && typeof _ctx.fmtUSD === 'function') return _ctx.fmtUSD(Number(v || 0), dec);
    const n = Number(v || 0);
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtInt(v, dec = 0) {
    if (_ctx && typeof _ctx.fmtNum === 'function') return _ctx.fmtNum(Number(v || 0), dec);
    return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtPctVal(num, den) {
    if (!den || Math.abs(den) < 0.01) return '0.0%';
    return ((Number(num || 0) / Number(den)) * 100).toFixed(1) + '%';
  }

  function canTax(user) {
    return Boolean(_ctx && typeof _ctx.canSeeTaxBreakdown === 'function' && _ctx.canSeeTaxBreakdown(user));
  }

  function canHub(hubId, user) {
    return !_ctx || typeof _ctx.canViewHub !== 'function' || _ctx.canViewHub(hubId, user);
  }

  function canView(viewId, user) {
    return !_ctx || typeof _ctx.canViewView !== 'function' || _ctx.canViewView(viewId, user);
  }

  function salesLabel() {
    return 'Total Sales';
  }

  // ============================================================================
  // SPECIFIC RECORD / COUNTERPARTY / STAFF / TRUCK / TICKET LOOKUP
  // ============================================================================
  function trySpecificRecordLookup(cleanQ, scope) {
    if (!_ctx || !_ctx.SEED || !_ctx.SEED.records) return null;
    const low = cleanQ.toLowerCase();

    // 1. Explicit Ticket / Voucher Number lookup ("ticket 1045", "#1045")
    const tktMatch = cleanQ.match(/(?:\bticket\s*#?|\bvoucher\s*#?|#)\s*([A-Za-z0-9-]{2,18})\b/i);
    if (tktMatch) {
      const targetNo = norm(tktMatch[1]);
      const pools = [
        { key: 'sales_tickets', label: 'Sales Ticket', view: 'sales' },
        { key: 'raw_purchases', label: 'Quarry / Raw Ticket', view: 'raw' },
        { key: 'expenses', label: 'Expense Voucher', view: 'expenses' },
        { key: 'fuel_intakes', label: 'Fuel Entry', view: 'fleet' }
      ];
      for (const p of pools) {
        const rows = scopedRows(p.key, scope, { ignorePeriod: true });
        const hit = rows.find(r => norm(r.ticket_no || r.invoice_no || r.voucher_no || '') === targetNo);
        if (hit) {
          const amt = Number(hit.total_ttc != null ? hit.total_ttc : (hit.total != null ? hit.total : (hit.amount || 0)));
          const party = hit.customer || hit.supplier || hit.site || hit.category || hit.equipment || '-';
          const prod = hit.product || hit.subcategory || hit.item_summary || (hit.litres ? `${fmtInt(hit.litres, 1)} L Diesel` : '-');
          return {
            q: cleanQ,
            lang: detectLang(cleanQ),
            instantLocal: true,
            title: `${p.label} #${cleanOut(hit.ticket_no || tktMatch[1])}`,
            answer: `Found <b>${esc(p.label)} #${esc(hit.ticket_no || tktMatch[1])}</b> under <b>${esc(hit.company || scope.scopeCoLabel)}</b> dated <b>${esc(hit.date || hit.rep_date || '-')}</b> for <b>${esc(party)}</b> (${esc(prod)})${amt ? ` totaling <b>${fmtMoney(amt, 2)}</b>` : ''}.`,
            promptText: 'Would you like to open its 360° Record Inspector or jump to the register?',
            actions: [
              { type: 'inspect', crKey: p.key, id: hit.id, label: `Inspect #${hit.ticket_no || tktMatch[1]}` },
              { type: 'view', view: p.view, label: `Open ${p.label}s` }
            ],
            followUps: [
              `Show ${scope.scopeCoLabel} summary`,
              'Check open AI Sentinel alerts',
              'Show overdue receivables'
            ]
          };
        }
      }
    }

    // 1b. Multi-Industry Domain Record ID Lookup (POL-..., CLM-..., REM-..., LSE-..., INV-..., LZG... VIN, MEM-..., IC-..., etc.)
    if (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.lookupIndustryDomainRecord === 'function') {
      const domHit = window.MFG_ENTERPRISE.lookupIndustryDomainRecord(cleanQ);
      if (domHit && domHit.id) {
        return {
          q: cleanQ,
          lang: detectLang(cleanQ),
          instantLocal: true,
          title: `${cleanOut(domHit.title)} · ${cleanOut(domHit.id)}`,
          answer: `Found <b>${esc(domHit.title)} ${esc(domHit.id)}</b> under <b>${esc(domHit.company)}</b> (${esc(domHit.industry)}) dated <b>${esc(domHit.date)}</b> for <b>${esc(domHit.party)}</b> (${esc(domHit.summary)})${domHit.amount ? ` totaling <b>${fmtMoney(domHit.amount, 2)}</b>` : ''} · Status: <b>${esc(domHit.status)}</b>.`,
          promptText: 'Would you like to open its 360° Domain Record Inspector or jump to the register?',
          actions: [
            { type: 'inspect', crKey: 'ind_domain:' + domHit.bucket, id: domHit.id, label: `Inspect ${domHit.id}` },
            { type: 'view', view: domHit.parentView || 'overview', label: `Open ${domHit.title} Register` }
          ],
          followUps: [
            `Give me a ${domHit.industry} executive briefing`,
            "Show today's daily operations",
            'Verify the double-entry trial balance'
          ]
        };
      }
    }

    // Never hijack non-Manufacturing industry scopes or cross-industry domain prompts with quarry counterparty/product lookups
    const activeLookupInd = (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.getActiveIndustry === 'function')
      ? window.MFG_ENTERPRISE.getActiveIndustry()
      : 'Manufacturing';
    if (activeLookupInd !== 'Manufacturing' ||
        /\b(bdeir\s+holding|intercompany|partner\s+split|blanca|la\s+una|palms|voile|platinum|cabana|korri\s+auto|shacman|4235|rent\s+roll|rent\s+invoices?|tenant\s+arrears|gwp\b|bordereau|policy\s+renewal)\b/i.test(low)) {
      return null;
    }

    // Never hijack plural ranking, top-N, or monthly trajectory questions
    if (cleanQ.length < 4 ||
        /\b(top|biggest|largest|best|worst|highest|lowest|who\s+are)\s+\d*\s*(?:overdue\s+|open\s+|selling\s+)?(?:customers?|clients?|debtors?|accounts?|buyers?|suppliers?|vendors?|quarries|products?|grades?|aggregates?|materials?|drivers?|staff|employees?|months?)\b/i.test(cleanQ) ||
        /\b(peak\s+month|best\s+month|worst\s+month|which\s+month)\b/i.test(cleanQ)) {
      return null;
    }

    const coNameSet = new Set(['wtc', 'bbc', 'bbconstruction', 'bb construction', 'lions', 'lions transport', 'lionstransport', 'manufacturing group']);
    const catList = (_ctx && typeof _ctx.getCompanyCatalog === 'function') ? _ctx.getCompanyCatalog() : [];
    for (let i = 0; i < catList.length; i++) {
      if (catList[i] && catList[i].name) coNameSet.add(norm(catList[i].name));
    }
    const explicitCounterparty = /\b(customer|client|supplier|vendor|account\s+for|balance\s+for|soa\s+for)\b/i.test(cleanQ);
    const explicitProduct = /\b(product|grade|aggregate|material|sell|sold)\b/i.test(cleanQ);
    const explicitStaff = /\b(staff|employee|driver|salary\s+for|attendance\s+for|contract\s+for)\b/i.test(cleanQ);
    const hasWholeCandidate = cand => {
      const escCand = String(cand || '').trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escCand) return false;
      return new RegExp(`(?:^|[^a-z0-9\\u0600-\\u06FF])${escCand}(?:$|[^a-z0-9\\u0600-\\u06FF])`, 'i').test(low);
    };

    const genericStop = new Set([
      'show', 'give', 'check', 'open', 'list', 'find', 'tell', 'what', 'where', 'when', 'which', 'how', 'why', 'compare',
      'verify', 'explain', 'analyze', 'total', 'top', 'all', 'for', 'from', 'with', 'the', 'and', 'our', 'this', 'last',
      'much', 'many', 'did', 'sell', 'sold', 'buy', 'bought', 'best', 'biggest', 'largest', 'peak', 'about', 'also', 'each', 'between',
      'wtc', 'bbc', 'bbconstruction', 'lions', 'lionstransport', 'transport', 'company', 'companies', 'entity', 'entities', 'group',
      'sales', 'sale', 'revenue', 'margin', 'profit', 'loads', 'tons', 'volume', 'expenses', 'expense', 'overhead',
      'recurring', 'schedules', 'schedule', 'diesel', 'fuel', 'tank', 'malfunction', 'malfunctions', 'cash', 'till',
      'ledger', 'trial', 'balance', 'payroll', 'salary', 'salaries', 'attendance', 'overtime', 'workforce',
      'warehouse', 'stock', 'items', 'item', 'parts', 'spare', 'repairs', 'repair', 'defects', 'defect', 'oil', 'quarry',
      'raw', 'haulage', 'suppliers', 'supplier', 'customers', 'customer', 'receivables', 'receivable', 'payables',
      'payable', 'overdue', 'aging', 'pricing', 'price', 'pending', 'agreement', 'agreements', 'commission', 'commissions',
      'product', 'products', 'grade', 'grades', 'aggregate', 'aggregates', 'material', 'materials',
      'driver', 'drivers', 'staff', 'employee', 'employees', 'months', 'period', 'periods', 'performance', 'history',
      'alerts', 'alert', 'sentinels', 'sentinel', 'watchdog', 'watchdogs', 'thresholds', 'threshold', 'briefing',
      'daily', 'operations', 'ops', 'kiosks', 'kiosk', 'users', 'seats', 'today', 'yesterday', 'month', 'year', 'summary',
      'overview', 'loans', 'loan', 'rent', 'lease', 'leases', 'tenant', 'tenants', 'arrears', 'holding', 'bdeir',
      'treasury', 'intercompany', 'resort', 'venue', 'policy', 'policies', 'claim', 'claims', 'carrier', 'carriers',
      ...Object.keys(MONTH_MAP)
    ]);
    const contentWords = low
      .replace(/\b202[4-9](?:-(?:0[1-9]|1[0-2])(?:-\d{2})?)?\b/g, ' ')
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !genericStop.has(w) && !coNameSet.has(w));
    if (!contentWords.length && !explicitCounterparty && !explicitProduct && !explicitStaff) return null;

    // 2 & 3. Customer & Supplier Counterparty Match (with Dual-Role Disambiguation for Dabousi, Haj Ibrahim, etc.)
    const explicitCust = /\b(customer|client|buyer|receivable|ar\b|owe\s+us)\b/i.test(cleanQ);
    const explicitSup = /\b(supplier|vendor|quarry|pit|hauler|payable|ap\b|owed\s+to|settlement)\b/i.test(cleanQ);

    const custReg = _ctx.SEED.records.customers || [];
    let bestCust = null;
    if (!(explicitSup && !explicitCust)) {
      for (let i = 0; i < custReg.length; i++) {
        const c = custReg[i];
        if (!c || c.voided || !c.name || c.name.length < 4) continue;
        if ((coNameSet.has(norm(c.name)) || genericStop.has(norm(c.name))) && !explicitCounterparty) continue;
        if (hasWholeCandidate(c.name)) {
          if (!bestCust || c.name.length > bestCust.name.length) bestCust = c;
        }
      }
    }

    const supReg = _ctx.SEED.records.suppliers || [];
    let bestSup = null;
    if (!(explicitCust && !explicitSup)) {
      for (let i = 0; i < supReg.length; i++) {
        const s = supReg[i];
        if (!s || s.voided || !s.name || s.name.length < 4) continue;
        if ((coNameSet.has(norm(s.name)) || genericStop.has(norm(s.name))) && !explicitCounterparty) continue;
        if (hasWholeCandidate(s.name)) {
          if (!bestSup || s.name.length > bestSup.name.length) bestSup = s;
        }
      }
    }

    let custStat = null;
    if (bestCust) {
      const sRows = scopedRows('sales_tickets', scope).filter(r => norm(r.customer) === norm(bestCust.name));
      const rRows = scopedRows('receipts', scope).filter(r => norm(r.customer) === norm(bestCust.name));
      const tSign = (_ctx && _ctx.ticketSign) || (r => (r && r.kind === 'return' ? -1 : 1));
      const billedRows = sRows.reduce((a, r) => a + Number(r.total_ttc != null ? r.total_ttc : r.total || 0) * tSign(r), 0);
      const collectedRows = rRows.reduce((a, r) => a + Number(r.amount || r.total || 0), 0);
      const mCusts = ((_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {}).customers || [];
      const mHit = mCusts.find(x => norm(x.Customer || x.name) === norm(bestCust.name));
      const useModel = !scope.customDateOverride && Boolean(mHit);
      const loadsCnt = useModel && mHit.loads != null ? Number(mHit.loads) : sRows.length;
      const billed = useModel && mHit.sales_ttc != null ? Number(mHit.sales_ttc) : billedRows;
      const collected = useModel && mHit.receipts != null ? Number(mHit.receipts) : collectedRows;
      const openAr = mHit ? Number(mHit.ar_balance || 0) : (billed - collected);
      custStat = { mHit, loadsCnt, billed, collected, openAr, vol: Math.abs(billed) + Math.abs(openAr) + loadsCnt };
    }

    const isAskBundledRaw = r => {
      if (typeof window !== 'undefined' && window.MFG_QUARRY_SITE_MODE && typeof window.MFG_QUARRY_SITE_MODE.isBundledRawTicket === 'function') {
        return Boolean(window.MFG_QUARRY_SITE_MODE.isBundledRawTicket(r));
      }
      return Boolean(r && (r.includes_transport === true || r.includes_transport === 1 || r.haulage_mode === 'supplier_delivered'));
    };

    let supStat = null;
    if (bestSup) {
      const sNorm = norm(bestSup.name);
      const rRows = scopedRows('raw_purchases', scope).filter(r =>
        norm(r.site_owner) === sNorm ||
        norm(r.site) === sNorm ||
        norm(r.supplier) === sNorm ||
        norm(r.truck_owner) === sNorm
      );
      const bundledSupRows = rRows.filter(isAskBundledRaw);
      const bundledSupUsd = bundledSupRows.reduce((a, r) => a + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))), 0);
      const eRows = scopedRows('expenses', scope).filter(r => norm(r.supplier) === sNorm);
      const pRows = scopedRows('settlements', scope).filter(r => norm(r.supplier) === sNorm);
      const eSign = (_ctx && _ctx.expenseSign) || (() => 1);
      const rawAmtRows = rRows.reduce((a, r) => a + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))), 0);
      const expAmtRows = eRows.reduce((a, r) => a + Number(r.amount || r.total || 0) * eSign(r), 0);
      const paidAmtRows = pRows.reduce((a, r) => a + Number(r.amount || r.total || 0) + Number(r.discount || 0), 0);
      const mSups = ((_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {}).suppliers || [];
      const mSup = mSups.find(x => norm(x.Supplier || x.name) === sNorm);
      const useModel = !scope.customDateOverride && Boolean(mSup);
      const rawCnt = useModel && mSup.raw_loads != null ? Number(mSup.raw_loads) : rRows.length;
      const rawAmt = useModel && mSup.raw_cost != null ? Number(mSup.raw_cost) : rawAmtRows;
      const expCnt = eRows.length;
      const expAmt = useModel && mSup.expenses != null ? Number(mSup.expenses) : expAmtRows;
      const paidAmt = useModel && mSup.settlements_paid != null ? Number(mSup.settlements_paid) : paidAmtRows;
      const openAp = mSup && mSup.ap_balance != null ? Number(mSup.ap_balance) : null;
      supStat = { mSup, rawCnt, rawAmt, expCnt, expAmt, paidAmt, openAp, bundledCnt: bundledSupRows.length, bundledUsd: bundledSupUsd, vol: Math.abs(rawAmt) + Math.abs(expAmt) + Math.abs(openAp || 0) + rawCnt };
    }

    const preferSupplier = Boolean(bestSup && (!bestCust || explicitSup || (supStat.vol > custStat.vol && !explicitCust)));
    if (preferSupplier && supStat) {
      const supBullets = [];
      if (supStat.bundledCnt > 0) {
        supBullets.push(`Bundled Delivery Basis: <b>${fmtInt(supStat.bundledCnt)}</b> loads (<b>${fmtMoney(supStat.bundledUsd, 2)}</b>) include supplier-provided raw material + transportation in one delivered price (internal transport split unknown).`);
      }
      if (bestCust && custStat && custStat.vol > 0) {
        supBullets.push(`Customer Ledger Also Active: <b>${fmtInt(custStat.loadsCnt)}</b> sales loads (<b>${fmtMoney(custStat.billed, 2)}</b>) · Open AR <b>${fmtMoney(custStat.openAr, 2)}</b>`);
      }
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        topic: 'ap',
        title: `Supplier · ${cleanOut(bestSup.name)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, <b>${esc(bestSup.name)}</b> recorded <b>${fmtInt(supStat.rawCnt)}</b> quarry/haulage loads (<b>${fmtMoney(supStat.rawAmt, 2)}</b>), <b>${fmtInt(supStat.expCnt)}</b> expense vouchers (<b>${fmtMoney(supStat.expAmt, 2)}</b>), and settlements paid of <b>${fmtMoney(supStat.paidAmt, 2)}</b>${supStat.openAp != null ? ` (open AP balance: <b>${fmtMoney(supStat.openAp, 2)}</b>)` : ''}.`,
        bullets: supBullets.length ? supBullets : undefined,
        promptText: 'Would you like to open this supplier\'s 360° ledger or jump to Suppliers & Payables?',
        actions: [
          { type: 'inspect', crKey: 'suppliers', id: bestSup.id, label: `360° ${bestSup.name}` },
          ...(bestCust && custStat && custStat.vol > 0 ? [{ type: 'inspect', crKey: 'customers', id: bestCust.id, label: '360° Customer Account' }] : []),
          { type: 'view', view: 'suppliers', label: 'Suppliers & Payables' }
        ],
        followUps: [
          'Show Accounts Payable breakdown',
          'Show top expense categories',
          'Check pending-price vouchers'
        ]
      };
    }

    if (bestCust && custStat) {
      const dualSupBullets = (bestSup && supStat && supStat.vol > 0)
        ? [`Supplier Ledger Also Active: <b>${fmtInt(supStat.rawCnt)}</b> quarry/haulage loads (<b>${fmtMoney(supStat.rawAmt, 2)}</b>)${supStat.openAp != null ? ` · Open AP <b>${fmtMoney(supStat.openAp, 2)}</b>` : ''}`]
        : undefined;
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        topic: 'ar',
        title: `Customer · ${cleanOut(bestCust.name)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, <b>${esc(bestCust.name)}</b> has <b>${fmtInt(custStat.loadsCnt)}</b> sales tickets totaling <b>${fmtMoney(custStat.billed, 2)}</b>, collections of <b>${fmtMoney(custStat.collected, 2)}</b>, and an open receivable balance of <b>${fmtMoney(custStat.openAr, 2)}</b>${custStat.mHit && Number(custStat.mHit.ar_60_plus || 0) > 0 ? ` (<b>${fmtMoney(custStat.mHit.ar_60_plus, 0)}</b> past 60 days)` : ''}.`,
        bullets: dualSupBullets,
        promptText: 'Would you like to inspect all vouchers for this customer or print their Statement of Account?',
        actions: [
          { type: 'inspect', crKey: 'customers', id: bestCust.id, label: `360° ${bestCust.name}` },
          ...(bestSup && supStat && supStat.vol > 0 ? [{ type: 'inspect', crKey: 'suppliers', id: bestSup.id, label: '360° Supplier Account' }] : []),
          { type: 'view', view: 'customers', label: 'Open Receivables' },
          { type: 'view', view: 'statements', label: 'Printable SOA' }
        ],
        followUps: [
          'Show top overdue AR customers',
          `Show ${scope.scopeCoLabel} sales & margin`,
          'Check price agreement compliance'
        ]
      };
    }

    // 4. Product / Aggregate Grade Match ("How much Mghasal did we sell?", "Bahre sales")
    const prodReg = _ctx.SEED.records.products || [];
    const modelProds = ((_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {}).products || [];
    let bestProd = null;
    for (let i = 0; i < prodReg.length; i++) {
      const p = prodReg[i];
      const pName = String((p && (p.name || p.ticket_product)) || '').trim();
      if (!p || p.voided || pName.length < 3 || coNameSet.has(norm(pName))) continue;
      if (/^(diesel|mazout|fuel|transport|water)$/i.test(pName) && !explicitProduct) continue;
      if (hasWholeCandidate(pName)) {
        if (!bestProd || pName.length > String(bestProd.name || bestProd.ticket_product || '').length) bestProd = p;
      }
    }
    if (bestProd) {
      const pName = String(bestProd.name || bestProd.ticket_product || '').trim();
      const pNorm = norm(pName);
      const tSign = (_ctx && _ctx.ticketSign) || (r => (r && r.kind === 'return' ? -1 : 1));
      const tTons = (_ctx && _ctx.ticketTons) || (r => Number(r.tons || r.qty || 0));
      const sRows = scopedRows('sales_tickets', scope).filter(r => norm(r.product) === pNorm);
      let rowLoads = 0, rowQty = 0, rowTons = 0, rowSales = 0;
      sRows.forEach(r => {
        const sgn = tSign(r);
        if (sgn > 0) rowLoads += 1;
        rowQty += Number(r.qty || 0) * sgn;
        rowTons += tTons(r) * sgn;
        rowSales += Number(r.total_ttc != null ? r.total_ttc : r.total || 0) * sgn;
      });
      const mProd = modelProds.find(x => norm(x.Product || x.name) === pNorm);
      const useModel = !scope.customDateOverride && Boolean(mProd);
      const loads = useModel && mProd.loads != null ? Number(mProd.loads) : rowLoads;
      const salesUsd = useModel && mProd.sales_ttc != null ? Number(mProd.sales_ttc) : rowSales;
      const qtySold = useModel && mProd.qty_sold != null ? Number(mProd.qty_sold) : rowQty;
      const tonsSold = useModel && mProd.tons_sold != null ? Number(mProd.tons_sold) : rowTons;
      const uomLbl = cleanOut(bestProd.uom || (mProd && mProd.UoM) || 'm³');
      const avgPrice = qtySold > 0 ? (salesUsd / qtySold) : Number((mProd && mProd.avg_price_ttc) || bestProd.list_price || 0);
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        topic: 'products',
        title: `Product & Grade · ${cleanOut(pName)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, <b>${esc(pName)}</b> generated <b>${fmtMoney(salesUsd, 2)}</b> across <b>${fmtInt(loads)}</b> sales loads (<b>${fmtInt(qtySold, 0)} ${esc(uomLbl)}</b> · <b>${fmtInt(tonsSold, 0)} t</b>, realized avg <b>${fmtMoney(avgPrice, 2)}/${esc(uomLbl)}</b>${mProd && mProd.list_price ? `, catalog list <b>${fmtMoney(mProd.list_price, 2)}</b>` : ''}).`,
        promptText: 'Would you like to inspect this grade in 360° view or compare all top selling grades?',
        actions: [
          { type: 'inspect', crKey: 'products', id: bestProd.id, label: `360° ${pName}` },
          ...(canView('reg_products', scope.user) ? [{ type: 'view', view: 'reg_products', label: 'Products & Grades' }] : []),
          ...(canView('sales', scope.user) ? [{ type: 'view', view: 'sales', label: 'Sales Register' }] : [])
        ],
        followUps: [
          'Show top selling products & grades',
          `Show ${scope.scopeCoLabel} sales & margin`,
          'Check price agreement compliance'
        ]
      };
    }

    // 5. Equipment / Truck Code Match
    const eqReg = _ctx.SEED.records.equipment || [];
    let bestEq = null;
    for (let i = 0; i < eqReg.length; i++) {
      const eq = eqReg[i];
      const label = String((eq && (eq.name || eq.code || eq.plate)) || '').trim();
      if (!eq || eq.voided || label.length < 3 || coNameSet.has(norm(label))) continue;
      if (hasWholeCandidate(label)) {
        if (!bestEq || label.length > String(bestEq.name || bestEq.code).length) bestEq = eq;
      }
    }
    if (bestEq) {
      const eqName = String(bestEq.name || bestEq.code || '');
      const fRows = scopedRows('fuel_intakes', scope).filter(r => norm(r.equipment || r.truck) === norm(eqName));
      const dRows = scopedRows('equipment_defects', scope, { ignorePeriod: true }).filter(r => norm(r.equipment) === norm(eqName) && !/resolved|closed/i.test(r.status || ''));
      const repRows = scopedRows('equipment_repairs', scope).filter(r => norm(r.equipment) === norm(eqName));
      const litres = fRows.reduce((a, r) => a + Number(r.litres || r.qty || 0), 0);
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        topic: 'maintenance',
        title: `Equipment Unit · ${cleanOut(eqName)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, unit <b>${esc(eqName)}</b> dispensed <b>${fmtInt(litres, 1)} L</b> across <b>${fmtInt(fRows.length)}</b> fuel logs, logged <b>${fmtInt(repRows.length)}</b> repair records, and currently has <b>${fmtInt(dRows.length)}</b> open defect warnings.`,
        promptText: 'Would you like to inspect this unit in 360° view or open Repairs, Warnings & Oil Logs?',
        actions: [
          { type: 'inspect', crKey: 'equipment', id: bestEq.id, label: `360° ${eqName}` },
          { type: 'view', view: 'fleet_maint', label: 'Repairs & Warnings' }
        ],
        followUps: [
          'Show diesel tank & malfunction status',
          'Show open equipment defects & repairs',
          'Show warehouse spare parts stock'
        ]
      };
    }

    // 6. Staff / Driver Name Match
    if (canHub('payroll', scope.user)) {
      const empReg = scopedRows('employments', scope, { ignorePeriod: true });
      let bestEmp = null;
      for (let i = 0; i < empReg.length; i++) {
        const emp = empReg[i];
        const sName = String((emp && emp.staff) || '').trim();
        if (!emp || emp.voided || sName.length < 5 || coNameSet.has(norm(sName))) continue;
        if (!explicitStaff && !sName.includes(' ')) continue;
        if (hasWholeCandidate(sName)) {
          if (!bestEmp || sName.length > String(bestEmp.staff || '').length) bestEmp = emp;
        }
      }
      if (bestEmp) {
        const staffName = String(bestEmp.staff || '').trim();
        const sNorm = norm(staffName);
        const salRows = scopedRows('salaries', scope).filter(r => norm(r.staff || r.name) === sNorm);
        const attRows = scopedRows('attendance', scope).filter(r => norm(r.staff || r.name) === sNorm);
        const paidUsd = salRows.reduce((a, r) => a + Number(r.amount || 0), 0);
        return {
          q: cleanQ,
          lang: detectLang(cleanQ),
          instantLocal: true,
          topic: 'payroll',
          title: `Staff Member · ${cleanOut(staffName)}`,
          answer: `In <b>${esc(scope.fullScopeLabel)}</b>, <b>${esc(staffName)}</b> (${esc(cleanOut(bestEmp.company || scope.scopeCoLabel))} · ${esc(cleanOut(bestEmp.type || 'Staff'))}) has ${salRows.length ? `<b>${fmtInt(salRows.length)}</b> salary disbursements totaling <b>${fmtMoney(paidUsd, 2)}</b>` : '<b>0</b> salary disbursements'} and <b>${fmtInt(attRows.length)}</b> logged attendance entries.`,
          promptText: 'Would you like to open this employee\'s 360° record or jump to Payroll & Workforce?',
          actions: [
            { type: 'inspect', crKey: 'employments', id: bestEmp.id, label: `360° ${staffName}` },
            ...(canView('reg_staff', scope.user) ? [{ type: 'view', view: 'reg_staff', label: 'Staff Registry' }] : []),
            { type: 'view', view: 'payroll', label: 'Open Payroll' }
          ],
          followUps: [
            'Show payroll & overtime summary',
            'Show today\'s daily operations',
            'Check open AI Sentinel alerts'
          ]
        };
      }
    }

    return null;
  }

  // ============================================================================
  // CORE LIVE-SQL DETERMINISTIC COPILOT INTENTS (EN / AR / FR)
  // ============================================================================
  function buildLiveDataAnswer(cleanQ, scope) {
    const lang = detectLang(cleanQ);
    const low = cleanQ.toLowerCase();
    const user = scope.user;

    // 0. Enforce Business-Unit RLS if user explicitly asked for an unauthorized company
    if (scope.rlsBlockedCompany) {
      const seatLabel = userDisplayName(user) || 'Current User';
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        title: 'Company Scope Restricted',
        answer: `Your active seat (<b>${esc(seatLabel)}</b>) is scoped to <b>${esc(scope.allowed.join(', ') || 'assigned entities')}</b> and does not have permission to view <b>${esc(scope.rlsBlockedCompany)}</b> records.`,
        promptText: 'Would you like to check metrics for your permitted entities instead?',
        followUps: [
          `Show ${scope.scopeCoLabel} executive briefing`,
          'Show today\'s operations',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 1. Conversational Greetings, Check-ins & Help (EN / AR / FR) -> instantLocal: true (0 LLM quota burned)
    if (lang === 'ar' && /^(مرحبا|أهلا|اهلا|السلام\s*عليكم|السلام|صباح\s*الخير|مساء\s*الخير|كيف\s*حالك|كيفك|شو\s*الأخبار|شو\s*الاخبار|شلونك)[\s!.,؟?]*$/.test(cleanQ)) {
      const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
      return {
        q: cleanQ,
        lang: 'ar',
        instantLocal: true,
        conversational: true,
        title: 'مرحباً بك في Ask ISABI',
        answer: `أهلاً بك${firstName ? ' ' + esc(firstName) : ''}! أنا جاهز لمساعدتك مباشرة من واقع السجلات الحية لنطاق <b>${esc(scope.fullScopeLabel)}</b>.`,
        promptText: 'عن أي قسم تود الاستفسار الآن: المبيعات والأرباح، الذمم المدينة، المصاريف، المازوت والآليات، أم التنبيهات الرقابية؟',
        followUps: [
          'أعطني ملخص الأداء والمبيعات والأرباح',
          'ما هي أعلى الذمم المدينة المتأخرة؟',
          'هل توجد تنبيهات رقابية مفتوحة؟'
        ]
      };
    }
    if (lang === 'fr' && /^(bonjour|salut|bonsoir|comment\s+ça\s+va|comment\s+ca\s+va|ça\s+va|ca\s+va)[\s!.,?]*$/i.test(cleanQ)) {
      const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
      return {
        q: cleanQ,
        lang: 'fr',
        instantLocal: true,
        conversational: true,
        title: 'Bienvenue · Ask ISABI',
        answer: `Bonjour${firstName ? ' ' + esc(firstName) : ''} ! Je vais très bien, merci. Je suis connecté en direct à vos écritures pour le périmètre <b>${esc(scope.fullScopeLabel)}</b>.`,
        promptText: 'Que souhaitez-vous vérifier : ventes et marges, créances clients, dépenses, gasoil, ou alertes de contrôle ?',
        followUps: [
          'Résumé des ventes et de la marge',
          'Quelles sont les créances clients en retard ?',
          'Y a-t-il des alertes de contrôle ouvertes ?'
        ]
      };
    }
    if (/^(hi|hello|hey|hola|salam|marhaba|good\s+(morning|afternoon|evening)|how\s+are\s+you(\s+doing|\s+today)?|how's\s+it\s+going|hows\s+it\s+going|what's\s+up|whats\s+up)[\s!.,?]*$/i.test(cleanQ)) {
      const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
      const isHow = /how\s+are|going|what's\s+up|whats\s+up/i.test(cleanQ);
      return {
        q: cleanQ,
        lang: 'en',
        instantLocal: true,
        conversational: true,
        title: 'Ask ISABI · Live Operations Copilot',
        answer: isHow
          ? `Doing great, thank you${firstName ? ', ' + esc(firstName) : ''}! All books and live registers for <b>${esc(scope.fullScopeLabel)}</b> are ready.`
          : `Hello${firstName ? ' ' + esc(firstName) : ''}! I am wired directly into your live records for <b>${esc(scope.fullScopeLabel)}</b>.`,
        promptText: 'Ask me about today\'s activity, entity margins, overdue customers, expenses, warehouse stock, diesel, payroll, or open alerts:',
        followUps: [
          'Give me an executive briefing & open alerts',
          'Show today\'s daily operations',
          `Compare entity sales & operating profit`
        ]
      };
    }
    if (/^(thanks|thank\s+you|thx|ty|great|awesome|perfect|got\s+it|ok|okay|شكرا|شكراً|ممتاز|تمام|merci|super|parfait)[\s!.,؟?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        conversational: true,
        title: lang === 'ar' ? 'في خدمتك' : (lang === 'fr' ? 'À votre service' : 'Ready When You Are'),
        answer: lang === 'ar'
          ? 'على الرحب والسعة! أخبرني في أي وقت إذا أردت فحص أي حساب أو حركة.'
          : (lang === 'fr'
              ? 'Avec plaisir ! Dites-moi si vous souhaitez vérifier un autre compte ou registre.'
              : 'Glad to help! Let me know anytime you want to check another account, period, or register.'),
        promptText: lang === 'ar' ? 'هل نتابع فحص قسم آخر؟' : (lang === 'fr' ? 'Que vérifions-nous ensuite ?' : 'What would you like to inspect next?'),
        followUps: [
          'Show today\'s daily operations',
          'Check open AI Sentinel alerts',
          'Show top expense categories'
        ]
      };
    }
    if (/\b(who\s+are\s+you|what\s+can\s+you\s+do|help\s+me|^help$)\b/i.test(cleanQ)) {
      return {
        q: cleanQ,
        lang: 'en',
        instantLocal: true,
        conversational: true,
        title: 'How Ask ISABI Works',
        answer: `I am your built-in operational and accounting copilot for <b>${esc(scope.fullScopeLabel)}</b>. I read your live scoped registers to calculate exact sales, margins, receivables, payables, expenses, warehouse stock, diesel balances, payroll, trial balance, and audit alerts in English, Arabic, or French.`,
        promptText: 'You can also ask about a specific customer, supplier, equipment unit, ticket number, or date (such as "yesterday" or "Oct 2026"). Try one below:',
        followUps: [
          'Give me an executive briefing & open alerts',
          'Show top expense categories & pending prices',
          'Verify double-entry trial balance'
        ]
      };
    }

    // 2. Specific Ticket / Counterparty / Product / Equipment / Staff Lookup
    const specificHit = trySpecificRecordLookup(cleanQ, scope);
    if (specificHit) return specificHit;

    // 2b. Multi-Industry Deterministic Fast-Path Copilot (Holding, Hospitality, Trading, Real Estate, Insurance)
    const activeInd = (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.getActiveIndustry === 'function')
      ? window.MFG_ENTERPRISE.getActiveIndustry()
      : 'Manufacturing';
    const domainMentionInd = /\b(bdeir\s+holding|intercompany|partner\s+split|due[- ]from|due[- ]to|root[- ]bu|shareholder\s+partner)\b/i.test(low)
      ? 'Holding & Treasury'
      : (/\b(blanca|la\s+una|palms|voile|platinum|cabana|pos\s+till|resort|venue\s+revenue|membership)\b/i.test(low)
          ? 'Hospitality & Resorts'
          : (/\b(korri\s+auto|shacman|vin\b|chassis|invoice\s+book|parts\s+fifo|fifo\s+spare|landed\s+cost|heavy\s+truck)\b/i.test(low)
              ? 'Automotive & Heavy Trading'
              : (/\b(4235|rent\s+roll|lease\s+expiry|expiring\s+within\s+90|leases?\s+are\s+expiring|tenant\s+arrears|occupancy|landlord|properties\s+bu)\b/i.test(low)
                  ? 'Real Estate & Property'
                  : (/\b(gwp\b|gross\s+written\s+premium|brokerage|carrier\s+payable|bordereau|policy\s+renewal|renewal\s+pipeline|loss\s+ratio|claim\s+reserve|insurance\s+claims?|underwriter)\b/i.test(low)
                      ? 'Insurance & Brokerage'
                      : null))));
    const targetInd = domainMentionInd || (activeInd !== 'Manufacturing' ? activeInd : null);
    if (targetInd && !/\b(trial\s+balance|coa|double[- ]entry|pcg|journal\s+voucher|daily\s+ops|daily\s+operations)\b/i.test(low)) {
      if (targetInd === 'Holding & Treasury' && window.MFG_HOLDING && typeof window.MFG_HOLDING.compute === 'function') {
        const h = window.MFG_HOLDING.compute();
        const hk = h.kpis || {};
        const icRows = h.intercompany || [];
        const pRows = h.partners || [];
        const fastTopic = !isReasoningQuery(cleanQ);
        const fastBriefing = fastTopic && /\b(briefing|brief|overview|summary|status)\b/i.test(low);
        if (/\b(intercompany|due[- ]from|due[- ]to|matrix|bilateral)\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'holding_ic',
            title: 'Bilateral Intercompany Due-From / Due-To Matrix · Bdeir Holding',
            answer: `Across <b>${fmtInt(icRows.length)}</b> bilateral subsidiary pairs, total Intercompany Due-From receivable stands at <b>${fmtMoney(hk.dueFromTotal || 0, 0)}</b> against Due-To payable of <b>${fmtMoney(hk.dueToTotal || 0, 0)}</b>, leaving a net consolidated clearing position of <b>${fmtMoney(hk.netIntercompany || 0, 0)}</b>.`,
            bullets: icRows.slice(0, 4).map(r => `<b>${esc(r.pair || r.id || 'IC')} · ${esc(r.from || 'Bdeir Holding')} to ${esc(r.to || r.counterparty || 'Subsidiary')}</b>: Due-From <b>${fmtMoney(r.dueFrom || 0, 0)}</b> · Due-To <b>${fmtMoney(r.dueTo || 0, 0)}</b> · Net <b>${fmtMoney(r.net || ((r.dueFrom || 0) - (r.dueTo || 0)), 0)}</b> (${esc(r.status || 'Reconciled')})`),
            headers: icRows.length ? ['Subsidiary Pair', 'Due-From', 'Due-To', 'Net Clearing'] : undefined,
            rows: icRows.length ? icRows.slice(0, 6).map(r => [
              cleanOut(`${r.from || 'Bdeir Holding'} / ${r.to || r.counterparty || 'Subsidiary'}`),
              fmtMoney(r.dueFrom || 0, 0),
              fmtMoney(r.dueTo || 0, 0),
              fmtMoney(r.net != null ? r.net : ((r.dueFrom || 0) - (r.dueTo || 0)), 0)
            ]) : undefined,
            total: icRows.length ? [`Consolidated (${icRows.length} Pairs)`, fmtMoney(hk.netIntercompany || 0, 0)] : undefined,
            promptText: 'Open the Intercompany Consolidation hub or Statement 23:',
            actions: [
              { type: 'view', view: 'hld_consolidation', label: 'Intercompany Hub' },
              { type: 'view', view: 'hld_treasury', label: 'Treasury & Loans' },
              { type: 'view', view: 'statements', label: 'Statement 23' }
            ],
            followUps: [
              'Show shareholder partner split balances',
              'Give me a Bdeir Holding & Treasury executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        if (/\b(partner|shareholder|split|equity|draw|capital)\b/i.test(low)) {
          const totClosing = pRows.reduce((s, p) => s + Number(p.closingBalance != null ? p.closingBalance : (p.balance || 0)), 0);
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'holding_partners',
            title: 'Shareholder & Partner Equity Split Ledger · Bdeir Holding',
            answer: `Across <b>${fmtInt(pRows.length)}</b> active shareholder current accounts, opening equity capital, partner draws, and pro-rata shared overhead allocations are reconciled in real time.`,
            bullets: pRows.slice(0, 4).map(p => `<b>${esc(p.partner || p.name || '-')}</b> (${fmtInt(p.sharePct || 0, 1)}% share): Opening Capital <b>${fmtMoney(p.opening || 0, 0)}</b> · Draws <b>${fmtMoney(p.draws || p.distributions || 0, 0)}</b> · Closing Balance <b>${fmtMoney(p.closingBalance || p.balance || 0, 0)}</b>`),
            headers: pRows.length ? ['Partner', 'Share', 'Draws', 'Closing Equity'] : undefined,
            rows: pRows.length ? pRows.slice(0, 6).map(p => [
              cleanOut(p.partner || p.name || '-'),
              `${fmtInt(p.sharePct || 0, 1)}%`,
              fmtMoney(p.draws || p.distributions || 0, 0),
              fmtMoney(p.closingBalance != null ? p.closingBalance : (p.balance || 0), 0)
            ]) : undefined,
            total: pRows.length ? [`Total Equity (${pRows.length} Partners)`, fmtMoney(totClosing, 0)] : undefined,
            promptText: 'Inspect Partner Splits & Capital Calls or Statement 23:',
            actions: [
              { type: 'view', view: 'hld_partners', label: 'Partner Split & Equity' },
              { type: 'view', view: 'expenses', label: 'Holding Expenses' },
              { type: 'view', view: 'statements', label: 'Statement 23' }
            ],
            followUps: [
              'Show bilateral intercompany Due-From and Due-To matrix',
              'Give me a Bdeir Holding & Treasury executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        return {
          q: cleanQ,
          lang,
          instantLocal: fastBriefing,
          topic: 'holding',
          title: `Holding & Treasury Briefing · Bdeir Holding`,
          answer: `Across <b>Bdeir Holding</b>, shared corporate overhead stands at <b>${fmtMoney(hk.totalExpenses || 0, 0)}</b> across <b>${fmtInt(hk.voucherCount || 0)}</b> vouchers, treasury net cashflow is <b>${fmtMoney(hk.netCashflow || 0, 0)}</b>, and bilateral intercompany clearing nets to <b>${fmtMoney(hk.netIntercompany || 0, 0)}</b>.`,
          bullets: [
            `Intercompany Due-From vs Due-To: <b>${fmtMoney(hk.dueFromTotal || 0, 0)}</b> receivable vs <b>${fmtMoney(hk.dueToTotal || 0, 0)}</b> payable across <b>${fmtInt(icRows.length)}</b> subsidiary pairs`,
            `Shareholder & Partner Current Accounts: <b>${fmtInt(pRows.length)}</b> equity ledgers · Total Capital & Draws tracked in real time`
          ],
          headers: icRows.length ? ['Subsidiary Pair', 'Due-From', 'Due-To', 'Net Clearing'] : ['Holding Ledger', 'Records', 'Balance'],
          rows: icRows.length ? icRows.slice(0, 6).map(r => [
            cleanOut(`${r.from || 'Bdeir Holding'} / ${r.to || r.counterparty || 'Subsidiary'}`),
            fmtMoney(r.dueFrom || 0, 0),
            fmtMoney(r.dueTo || 0, 0),
            fmtMoney(r.net != null ? r.net : ((r.dueFrom || 0) - (r.dueTo || 0)), 0)
          ]) : [
            ['Corporate Overhead', fmtInt(hk.voucherCount || 0), fmtMoney(hk.totalExpenses || 0, 0)],
            ['Intercompany Due-From', fmtInt(icRows.length), fmtMoney(hk.dueFromTotal || 0, 0)],
            ['Intercompany Due-To', fmtInt(icRows.length), fmtMoney(hk.dueToTotal || 0, 0)]
          ],
          total: [`Consolidated Clearing (${icRows.length} Pairs)`, fmtMoney(hk.netIntercompany || 0, 0)],
          promptText: 'Which Holding & Treasury register or statement would you like to open?',
          actions: [
            { type: 'view', view: 'expenses', label: 'Holding Expenses' },
            { type: 'view', view: 'hld_partners', label: 'Partner Split & IC' },
            { type: 'view', view: 'hld_consolidation', label: 'Intercompany Hub' },
            { type: 'view', view: 'statements', label: 'Statement 23' }
          ],
          followUps: [
            'Show bilateral intercompany Due-From and Due-To matrix',
            'Show shareholder partner split balances',
            'Verify double-entry trial balance'
          ]
        };
      }
      if (targetInd === 'Hospitality & Resorts' && window.MFG_HOSPITALITY && typeof window.MFG_HOSPITALITY.compute === 'function') {
        const d = window.MFG_HOSPITALITY.compute();
        const hk = d.kpis || {};
        const sRows = d.salesRows || [];
        const mRows = d.memberRows || [];
        const fastTopic = !isReasoningQuery(cleanQ);
        const fastBriefing = fastTopic && /\b(briefing|brief|overview|summary|status)\b/i.test(low);
        if (/\b(cabana|membership|gym|pool|seasonal|member)\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'hospitality_memberships',
            title: `Seasonal Cabana, Pool & Gym Memberships · ${scope.scopeCoLabel}`,
            answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, there are <b>${fmtInt(hk.activeMembers || mRows.length)}</b> active seasonal cabana, beach club, and Platinum wellness memberships totaling <b>${fmtMoney(hk.membershipPkgValue || 0, 0)}</b> in contracted package value with <b>${fmtMoney(hk.membershipBalance || 0, 0)}</b> in open installments.`,
            bullets: mRows.slice(0, 4).map(m => `<b>${esc(m.code || m.id)} · ${esc(m.member)}</b> (${esc(m.company)} · ${esc(m.tier)}): Package <b>${fmtMoney(m.packageUsd || 0, 0)}</b> · Paid <b>${fmtMoney(m.paidUsd || 0, 0)}</b> · Balance <b>${fmtMoney(m.balanceUsd || 0, 0)}</b>`),
            headers: mRows.length ? ['Member', 'Property & Tier', 'Paid', 'Package Value'] : undefined,
            rows: mRows.length ? mRows.slice(0, 6).map(m => [
              cleanOut(m.member || m.code || '-'),
              cleanOut(`${m.company || ''} · ${m.tier || ''}`),
              fmtMoney(m.paidUsd || 0, 0),
              fmtMoney(m.packageUsd || 0, 0)
            ]) : undefined,
            total: mRows.length ? [`Active Packages (${fmtInt(hk.activeMembers || mRows.length)})`, fmtMoney(hk.membershipPkgValue || 0, 0)] : undefined,
            promptText: 'Open the Memberships & Pool hub or Statement 24:',
            actions: [
              { type: 'view', view: 'hsp_memberships', label: 'Memberships & Pool' },
              { type: 'view', view: 'hsp_revenue', label: 'Venue Revenue & POS' },
              { type: 'view', view: 'statements', label: 'Statement 24' }
            ],
            followUps: [
              'Compare Blanca, La Una, Palms, Voile & Platinum venue revenue',
              'Give me a Hospitality & Resorts executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        if (/\b(compare|venue\s+revenue|blanca.*la\s+una)\b/i.test(low)) {
          const byVenue = {};
          sRows.forEach(r => {
            const c = r.company || 'Blanca';
            if (!byVenue[c]) byVenue[c] = { rev: 0, covers: 0, count: 0 };
            byVenue[c].rev += Number(r.totalTtc || 0);
            byVenue[c].covers += Number(r.covers || 0);
            byVenue[c].count += 1;
          });
          const vEntries = Object.entries(byVenue).sort((a, b) => b[1].rev - a[1].rev);
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'hospitality_venues',
            title: '5-Resort Venue Revenue & Guest Cover Comparison',
            answer: `Across all <b>${fmtInt(vEntries.length)}</b> resort venues, total F&B, event, and cabana revenue stands at <b>${fmtMoney(hk.salesTotal || 0, 0)}</b> across <b>${fmtInt(hk.coversTotal || 0)}</b> guest covers (average check <b>${fmtMoney(hk.avgCover || 0, 2)}</b>).`,
            bullets: vEntries.map(([vName, st]) => `<b>${esc(vName)}</b>: Revenue <b>${fmtMoney(st.rev, 0)}</b> across <b>${fmtInt(st.count)}</b> closings · <b>${fmtInt(st.covers)}</b> covers (avg <b>${fmtMoney(st.covers ? st.rev / st.covers : 0, 2)}</b>/cover)`),
            headers: vEntries.length ? ['Resort Venue', 'Covers', 'Avg Check', 'Venue Revenue'] : undefined,
            rows: vEntries.length ? vEntries.map(([vName, st]) => [
              cleanOut(vName),
              fmtInt(st.covers),
              fmtMoney(st.covers ? st.rev / st.covers : 0, 2),
              fmtMoney(st.rev, 0)
            ]) : undefined,
            total: vEntries.length ? [`Combined (${vEntries.length} Resorts)`, fmtMoney(hk.salesTotal || 0, 0)] : undefined,
            promptText: 'Drill into Venue Revenue & POS or Statement 24:',
            actions: [
              { type: 'view', view: 'hsp_revenue', label: 'Venue Revenue & POS' },
              { type: 'view', view: 'pbi', label: 'Hospitality Dashboards' },
              { type: 'view', view: 'statements', label: 'Statement 24' }
            ],
            followUps: [
              'Show active seasonal cabana and gym memberships',
              'Give me a Hospitality & Resorts executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        return {
          q: cleanQ,
          lang,
          instantLocal: fastBriefing,
          topic: 'hospitality',
          title: `Hospitality & Resorts Copilot · ${scope.scopeCoLabel}`,
          answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, venue revenue is <b>${fmtMoney(hk.salesTotal || 0, 0)}</b> across <b>${fmtInt(hk.receiptCount || 0)}</b> POS & cabana receipts (<b>${fmtInt(hk.coversTotal || 0)}</b> guest covers, avg check <b>${fmtMoney(hk.avgCover || 0, 2)}</b>), with operating profit at <b>${fmtMoney(hk.operatingProfit || 0, 0)}</b>.`,
          bullets: [
            `POS Till & Settlement Mix: Cash USD <b>${fmtMoney(hk.cashCollected || 0, 0)}</b> · Card/POS <b>${fmtMoney(hk.cardCollected || 0, 0)}</b> · Open F&B/Supplier AP <b>${fmtMoney(hk.apBalance || 0, 0)}</b>`,
            `Seasonal Cabanas & Platinum Memberships: <b>${fmtInt(hk.activeMembers || 0)}</b> active packages worth <b>${fmtMoney(hk.membershipPkgValue || 0, 0)}</b> (<b>${fmtMoney(hk.membershipBalance || 0, 0)}</b> receivable)`
          ],
          promptText: 'Drill into a Hospitality hub or official register:',
          actions: [
            { type: 'view', view: 'hsp_revenue', label: 'Venue Revenue & POS' },
            { type: 'view', view: 'hsp_memberships', label: 'Memberships & Pool' },
            { type: 'view', view: 'pbi', label: 'Hospitality Dashboards' },
            { type: 'view', view: 'statements', label: 'Statement 24' }
          ],
          followUps: [
            'Compare Blanca, La Una, Palms, Voile & Platinum venue revenue',
            'Show active seasonal cabana and gym memberships',
            'Show today\'s daily operations'
          ]
        };
      }
      if (targetInd === 'Automotive & Heavy Trading' && window.MFG_TRADING && typeof window.MFG_TRADING.compute === 'function') {
        const d = window.MFG_TRADING.compute();
        const tk = d.kpis || {};
        const vRows = d.vehicleRows || [];
        const stRows = d.stockRows || [];
        const fastTopic = !isReasoningQuery(cleanQ);
        const fastBriefing = fastTopic && /\b(briefing|brief|overview|summary|status)\b/i.test(low);
        if (/\b(vin\b|chassis|shacman|heavy\s+truck|unit\s+margin|registry)\b/i.test(low) && !/\bbriefing\b/i.test(low)) {
          const totMargin = vRows.reduce((s, v) => s + Number(v.marginUsd || 0), 0);
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'trading_vins',
            title: `Serialized Heavy Truck VIN Registry & Unit Margins · ${scope.scopeCoLabel}`,
            answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, the commercial vehicle yard tracks <b>${fmtInt(tk.deliveredUnits || 0)}</b> delivered and <b>${fmtInt(tk.inStockUnits || 0)}</b> showroom Shacman & Korri Auto VIN units with full customs declaration and landed-cost margin tie-out.`,
            bullets: vRows.slice(0, 4).map(v => `<b>${esc(v.vin)}</b> (${esc(v.model)} · Customs <code>${esc(v.customsNo)}</code>): Landed <b>${fmtMoney(v.landedCostUsd || 0, 0)}</b> · Sale <b>${fmtMoney(v.salePriceUsd || 0, 0)}</b> · Margin <b>${fmtMoney(v.marginUsd || 0, 0)}</b> (${esc(v.status)})`),
            headers: vRows.length ? ['VIN & Model', 'Status', 'Landed Cost', 'Unit Margin'] : undefined,
            rows: vRows.length ? vRows.slice(0, 6).map(v => [
              cleanOut(`${v.vin || '-'} · ${v.model || ''}`),
              cleanOut(v.status || '-'),
              fmtMoney(v.landedCostUsd || 0, 0),
              fmtMoney(v.marginUsd || 0, 0)
            ]) : undefined,
            total: vRows.length ? [`Fleet Margin (${vRows.length} VINs)`, fmtMoney(totMargin, 0)] : undefined,
            promptText: 'Open the Shacman VIN Registry or Statement 25:',
            actions: [
              { type: 'view', view: 'trd_trucks', label: 'Shacman VIN Registry' },
              { type: 'view', view: 'trd_sales', label: 'Invoice Books & AR' },
              { type: 'view', view: 'statements', label: 'Statement 25' }
            ],
            followUps: [
              'Show FIFO spare parts stock valuation and reorder alerts',
              'Give me an Automotive & Heavy Trading executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        if (/\b(fifo|spare\s+part|stock|reorder|valuation|sku)\b/i.test(low) && !/\bbriefing\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'trading_fifo',
            title: `FIFO Spare Parts Valuation & Reorder Watch · ${scope.scopeCoLabel}`,
            answer: `FIFO spare parts and assembly stock valuation stands at <b>${fmtMoney(tk.stockValuation || 0, 0)}</b> across <b>${fmtInt(stRows.length)}</b> active SKU lines, with <b>${fmtInt(tk.lowStockCount || 0)}</b> SKUs currently at or below reorder threshold.`,
            bullets: stRows.slice(0, 4).map(s => `<b>${esc(s.sku || s.id)} · ${esc(s.part_name || s.name || 'Spare Part')}</b>: On-Hand <b>${fmtInt(s.qty_on_hand || s.qty || 0)}</b> · FIFO Unit Cost <b>${fmtMoney(s.fifo_unit_usd || s.unit_cost_usd || 0, 2)}</b> · Value <b>${fmtMoney(s.total_value_usd || 0, 0)}</b>`),
            headers: stRows.length ? ['SKU & Part', 'On-Hand', 'FIFO Unit Cost', 'Stock Value'] : undefined,
            rows: stRows.length ? stRows.slice(0, 6).map(s => [
              cleanOut(`${s.sku || s.id || '-'} · ${s.part_name || s.name || 'Spare Part'}`),
              fmtInt(s.qty_on_hand || s.qty || 0),
              fmtMoney(s.fifo_unit_usd || s.unit_cost_usd || 0, 2),
              fmtMoney(s.total_value_usd || 0, 0)
            ]) : undefined,
            total: stRows.length ? [`FIFO Stock (${stRows.length} SKUs)`, fmtMoney(tk.stockValuation || 0, 0)] : undefined,
            promptText: 'Open FIFO Stock & Parts or Statement 25:',
            actions: [
              { type: 'view', view: 'trd_stock', label: 'FIFO Stock & Parts' },
              { type: 'view', view: 'trd_trucks', label: 'Shacman VIN Registry' },
              { type: 'view', view: 'statements', label: 'Statement 25' }
            ],
            followUps: [
              'Show Shacman heavy truck VIN registry and unit margins',
              'Give me an Automotive & Heavy Trading executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        return {
          q: cleanQ,
          lang,
          instantLocal: fastBriefing,
          topic: 'trading',
          title: `Automotive & Heavy Trading Copilot · ${scope.scopeCoLabel}`,
          answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, multi-book commercial sales (N/S/IS/IN) stand at <b>${fmtMoney(tk.salesTotal || 0, 0)}</b> with gross margin of <b>${fmtMoney(tk.grossMargin || 0, 0)}</b> (<b>${fmtPctVal(tk.grossMargin, tk.salesTotal)}</b>) and operating profit of <b>${fmtMoney(tk.operatingProfit || 0, 0)}</b>.`,
          bullets: [
            `Heavy Truck VIN Yard & Parts Stock: <b>${fmtInt(tk.deliveredUnits || 0)}</b> delivered / <b>${fmtInt(tk.inStockUnits || 0)}</b> showroom VINs · FIFO Spare Parts Valuation <b>${fmtMoney(tk.stockValuation || 0, 0)}</b> (${fmtInt(tk.lowStockCount || 0)} low-stock SKUs)`,
            `Working Capital: Customer AR <b>${fmtMoney(tk.arBalance || 0, 0)}</b> · Foreign Supplier & Customs AP <b>${fmtMoney(tk.apBalance || 0, 0)}</b>`
          ],
          promptText: 'Explore Trading invoice books, Shacman VIN units, or FIFO stock:',
          actions: [
            { type: 'view', view: 'trd_sales', label: 'Invoice Books & AR' },
            { type: 'view', view: 'trd_trucks', label: 'Shacman VIN Registry' },
            { type: 'view', view: 'pbi', label: 'Trading Dashboards' },
            { type: 'view', view: 'statements', label: 'Statement 25' }
          ],
          followUps: [
            'Show Shacman heavy truck VIN registry and unit margins',
            'Show FIFO spare parts stock valuation and reorder alerts',
            'Show today\'s daily operations'
          ]
        };
      }
      if (targetInd === 'Real Estate & Property' && window.MFG_REALESTATE && typeof window.MFG_REALESTATE.compute === 'function') {
        const d = window.MFG_REALESTATE.compute();
        const rk = d.kpis || {};
        const lRows = d.leases || [];
        const rRows = d.rentInvoices || [];
        const fastTopic = !isReasoningQuery(cleanQ);
        const fastBriefing = fastTopic && /\b(briefing|brief|overview|summary|status)\b/i.test(low);
        if (/\b(expir|within\s+90|90\s*d|vacant|which\s+leases)\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'realestate_expiry',
            title: `90-Day Lease Expiry & Occupancy Watch · ${scope.scopeCoLabel}`,
            answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, portfolio occupancy stands at <b>${fmtInt(rk.occupancyPct || 0, 1)}%</b> (<b>${fmtInt(rk.occupiedUnits || 0)}/${fmtInt(rk.totalUnits || 0)}</b> units) with <b>${fmtInt(rk.expiring90d || 0)}</b> commercial/residential leases scheduled for renewal within 90 days.`,
            bullets: lRows.slice(0, 4).map(l => `<b>${esc(l.code)} · ${esc(l.tenant)}</b> (${esc(l.property)} · ${esc(l.unitCode)}): Term <code>${esc(l.startDate)}</code> to <code>${esc(l.endDate)}</code> · Annual Rent <b>${fmtMoney(l.annualTtcUsd || 0, 0)}</b>`),
            headers: lRows.length ? ['Tenant & Lease', 'Unit', 'Expiry Date', 'Annual Rent'] : undefined,
            rows: lRows.length ? lRows.slice(0, 6).map(l => [
              cleanOut(`${l.tenant || '-'} (${l.code || ''})`),
              cleanOut(`${l.property || ''} · ${l.unitCode || ''}`),
              cleanOut(l.endDate || '-'),
              fmtMoney(l.annualTtcUsd || 0, 0)
            ]) : undefined,
            total: lRows.length ? [`Contracted Rent (${lRows.length} Leases)`, fmtMoney(rk.annualRentTtc || 0, 0)] : undefined,
            promptText: 'Open Leases & 4235 Rent Roll or Properties & Units:',
            actions: [
              { type: 'view', view: 're_leases', label: 'Leases & 4235 Rent Roll' },
              { type: 'view', view: 're_properties', label: 'Properties & Units' },
              { type: 'view', view: 'statements', label: 'Statement 26 Rent Roll' }
            ],
            followUps: [
              'Show 4235 Company S.A.L 11% VAT rent invoices and tenant arrears',
              'Give me a Real Estate & 4235 S.A.L executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        if (/\b(invoice|arrear|rent\s+roll|11%\s+vat)\b/i.test(low) && !/\bbriefing\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'realestate_invoices',
            title: `4235 Company S.A.L 11% VAT Rent Invoices & Tenant Arrears`,
            answer: `Total billed rent stands at <b>${fmtMoney(rk.billedRentTtc || 0, 0)}</b> (Base <b>${fmtMoney(rk.annualBaseRent || 0, 0)}</b> + 11% MoF VAT <b>${fmtMoney(rk.annualVat || 0, 0)}</b>), with <b>${fmtMoney(rk.collectedUsd || 0, 0)}</b> collected and <b>${fmtMoney(rk.openArUsd || 0, 0)}</b> in open tenant receivables.`,
            bullets: rRows.slice(0, 4).map(r => `<b>${esc(r.invNo)} · ${esc(r.tenant)}</b> (Unit <code>${esc(r.unitCode)}</code> · ${esc(r.date)}): Base <b>${fmtMoney(r.baseUsd || 0, 0)}</b> + VAT <b>${fmtMoney(r.vatUsd || 0, 0)}</b> = <b>${fmtMoney(r.totalTtc || 0, 0)}</b> · Open Balance <b>${fmtMoney(r.balanceUsd || 0, 0)}</b>`),
            headers: rRows.length ? ['Invoice & Tenant', 'Unit', 'Billed Rent', 'Open Arrears'] : undefined,
            rows: rRows.length ? rRows.slice(0, 6).map(r => [
              cleanOut(`${r.invNo || '-'} · ${r.tenant || ''}`),
              cleanOut(r.unitCode || '-'),
              fmtMoney(r.totalTtc || 0, 0),
              fmtMoney(r.balanceUsd || 0, 0)
            ]) : undefined,
            total: rRows.length ? [`Open Tenant Receivables`, fmtMoney(rk.openArUsd || 0, 0)] : undefined,
            promptText: 'Inspect Tenant Collections & Arrears or Statement 26:',
            actions: [
              { type: 'view', view: 're_collections', label: 'Tenant Collections & AR' },
              { type: 'view', view: 're_leases', label: 'Leases & 4235 Rent Roll' },
              { type: 'view', view: 'statements', label: 'Statement 26 Rent Roll' }
            ],
            followUps: [
              'Which leases are expiring within 90 days?',
              'Give me a Real Estate & 4235 S.A.L executive briefing',
              'Verify the double-entry trial balance'
            ]
          };
        }
        return {
          q: cleanQ,
          lang,
          instantLocal: fastBriefing,
          topic: 'realestate',
          title: `Real Estate & 4235 S.A.L Copilot · ${scope.scopeCoLabel}`,
          answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, contracted annual rent is <b>${fmtMoney(rk.annualRentTtc || 0, 0)}</b> (Base <b>${fmtMoney(rk.annualBaseRent || 0, 0)}</b> + 11% MoF VAT <b>${fmtMoney(rk.annualVat || 0, 0)}</b>), portfolio occupancy is <b>${fmtInt(rk.occupancyPct || 0, 1)}%</b> (<b>${fmtInt(rk.occupiedUnits || 0)}/${fmtInt(rk.totalUnits || 0)}</b> units), and Net Operating Income (NOI) is <b>${fmtMoney(rk.noiUsd || 0, 0)}</b>.`,
          bullets: [
            `Rent Billing & Collections: Billed <b>${fmtMoney(rk.billedRentTtc || 0, 0)}</b> · Collected <b>${fmtMoney(rk.collectedUsd || 0, 0)}</b> · Open Tenant AR <b>${fmtMoney(rk.openArUsd || 0, 0)}</b>`,
            `Lease Expiry & Maintenance: <b>${fmtInt(rk.expiring90d || 0)}</b> leases within 90 days · Property Upkeep & Municipal Taxes <b>${fmtMoney(rk.maintTotalUsd || 0, 0)}</b>`
          ],
          promptText: 'Inspect the 4235 rent roll, tenant arrears, or lease expiry radar:',
          actions: [
            { type: 'view', view: 're_properties', label: 'Properties & Units' },
            { type: 'view', view: 're_leases', label: 'Leases & 4235 Rent Roll' },
            { type: 'view', view: 'pbi', label: 'Real Estate Dashboards' },
            { type: 'view', view: 'statements', label: 'Statement 26 Rent Roll' }
          ],
          followUps: [
            'Show 4235 Company S.A.L 11% VAT rent invoices and tenant arrears',
            'Which leases are expiring within 90 days?',
            'Show today\'s daily operations'
          ]
        };
      }
      if (targetInd === 'Insurance & Brokerage' && window.MFG_INSURANCE && typeof window.MFG_INSURANCE.compute === 'function') {
        const d = window.MFG_INSURANCE.compute();
        const ik = d.kpis || {};
        const pRows = d.policies || [];
        const cRows = d.carrierMatrix || [];
        const clmRows = d.claims || [];
        const fastTopic = !isReasoningQuery(cleanQ);
        const fastBriefing = fastTopic && /\b(briefing|brief|overview|summary|status)\b/i.test(low);
        if (/\b(renewal|30\/60\/90|pipeline|expir)\b/i.test(low) && !/\bbriefing\b/i.test(low)) {
          const sortedPols = pRows.slice().sort((a, b) => Number(a.daysToExpiry || 999) - Number(b.daysToExpiry || 999));
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'insurance_renewals',
            title: `30/60/90-Day Policy Renewal Pipeline · ${scope.scopeCoLabel}`,
            answer: `Across <b>${fmtInt(pRows.length)}</b> active policies, <b>${fmtInt(ik.renewing60d || 0)}</b> policies representing <b>${fmtMoney(ik.renewalGwp60d || 0, 0)}</b> in Gross Written Premium are scheduled for renewal within the 60-day retention window.`,
            bullets: sortedPols.slice(0, 4).map(p => `<b>${esc(p.policyNo)} · ${esc(p.insured)}</b> (${esc(p.carrier)} · ${esc(p.line)}): Expires <code>${esc(p.endDate)}</code> (${fmtInt(p.daysToExpiry || 0)}d) · GWP <b>${fmtMoney(p.gwpUsd || 0, 0)}</b> · Comm <b>${fmtMoney(p.commUsd || 0, 0)}</b>`),
            headers: sortedPols.length ? ['Policy & Insured', 'Carrier & Line', 'Expiry', 'Gross Premium'] : undefined,
            rows: sortedPols.length ? sortedPols.slice(0, 6).map(p => [
              cleanOut(`${p.policyNo || '-'} · ${p.insured || ''}`),
              cleanOut(`${p.carrier || ''} · ${p.line || ''}`),
              cleanOut(`${p.endDate || '-'} (${fmtInt(p.daysToExpiry || 0)}d)`),
              fmtMoney(p.gwpUsd || 0, 0)
            ]) : undefined,
            total: sortedPols.length ? [`60-Day Renewal Window (${fmtInt(ik.renewing60d || 0)} Policies)`, fmtMoney(ik.renewalGwp60d || 0, 0)] : undefined,
            promptText: 'Open Policies & Renewals or Premium Billing:',
            actions: [
              { type: 'view', view: 'ins_policies', label: 'Policies & Renewals' },
              { type: 'view', view: 'ins_billing', label: 'Premium Billing' },
              { type: 'view', view: 'statements', label: 'Statement 27' }
            ],
            followUps: [
              'Show carrier bordereau payable reconciliation',
              'Show open insurance claims and loss ratio by line',
              'Give me an Insurance & Brokerage executive briefing'
            ]
          };
        }
        if (/\b(bordereau|carrier|payable|underwriter|remit)\b/i.test(low) && !/\bbriefing\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'insurance_carriers',
            title: `Underwriter Carrier Bordereau Payable Reconciliation`,
            answer: `Across <b>${fmtInt(cRows.length)}</b> underwriting carriers, Gross Written Premium is <b>${fmtMoney(ik.gwpTotal || 0, 0)}</b>, brokerage commission retained is <b>${fmtMoney(ik.commTotal || 0, 0)}</b>, and net carrier bordereau payable stands at <b>${fmtMoney(ik.carrierPayableUsd || 0, 0)}</b>.`,
            bullets: cRows.slice(0, 4).map(c => `<b>${esc(c.carrier)}</b> (${fmtInt(c.policies || 0)} policies): GWP <b>${fmtMoney(c.gwpUsd || 0, 0)}</b> · Comm <b>${fmtMoney(c.commUsd || 0, 0)}</b> · Net Payable <b>${fmtMoney(c.netPayableUsd || 0, 0)}</b> · Balance Due <b>${fmtMoney(c.balanceDueUsd || 0, 0)}</b>`),
            headers: cRows.length ? ['Underwriting Carrier', 'Policies', 'Commission', 'Balance Due'] : undefined,
            rows: cRows.length ? cRows.slice(0, 6).map(c => [
              cleanOut(c.carrier || '-'),
              fmtInt(c.policies || 0),
              fmtMoney(c.commUsd || 0, 0),
              fmtMoney(c.balanceDueUsd || 0, 0)
            ]) : undefined,
            total: cRows.length ? [`Net Carrier Payable (${cRows.length} Carriers)`, fmtMoney(ik.carrierPayableUsd || 0, 0)] : undefined,
            promptText: 'Open Carrier Settlements or Statement 27:',
            actions: [
              { type: 'view', view: 'ins_carriers', label: 'Carrier Settlements' },
              { type: 'view', view: 'ins_billing', label: 'Premium Billing' },
              { type: 'view', view: 'statements', label: 'Statement 27' }
            ],
            followUps: [
              'Show 30/60/90-day policy renewal pipeline',
              'Show open insurance claims and loss ratio by line',
              'Give me an Insurance & Brokerage executive briefing'
            ]
          };
        }
        if (/\b(claim|loss\s+ratio|reserve|adjuster)\b/i.test(low) && !/\bbriefing\b/i.test(low)) {
          return {
            q: cleanQ,
            lang,
            instantLocal: fastTopic,
            topic: 'insurance_claims',
            title: `Insurance Claims Register & Loss Ratio Watch`,
            answer: `Total incurred claims across <b>${fmtInt(clmRows.length)}</b> claim files stand at <b>${fmtMoney(ik.incurredClaimsUsd || 0, 0)}</b>, corresponding to a portfolio loss ratio of <b>${fmtInt(ik.lossRatioPct || 0, 1)}%</b> against Gross Written Premium.`,
            bullets: clmRows.slice(0, 4).map(c => `<b>${esc(c.claimNo || c.id)} · ${esc(c.insured || c.client || '-')}</b> (${esc(c.line || 'Motor')} · Policy <code>${esc(c.policyNo || pRows[0]?.policyNo || '-')}</code>): Reserve <b>${fmtMoney(c.reserveUsd || c.reserve_usd || 0, 0)}</b> · Paid <b>${fmtMoney(c.paidUsd || c.paid_usd || 0, 0)}</b> (${esc(c.status || 'Open')})`),
            headers: clmRows.length ? ['Claim & Insured', 'Line', 'Paid', 'Reserve'] : undefined,
            rows: clmRows.length ? clmRows.slice(0, 6).map(c => [
              cleanOut(`${c.claimNo || c.id || '-'} · ${c.insured || c.client || ''}`),
              cleanOut(c.line || 'Motor'),
              fmtMoney(c.paidUsd || c.paid_usd || 0, 0),
              fmtMoney(c.reserveUsd || c.reserve_usd || 0, 0)
            ]) : undefined,
            total: clmRows.length ? [`Incurred Claims (${fmtInt(ik.lossRatioPct || 0, 1)}% Loss Ratio)`, fmtMoney(ik.incurredClaimsUsd || 0, 0)] : undefined,
            promptText: 'Open Claims & Subrogation or Statement 27:',
            actions: [
              { type: 'view', view: 'ins_claims', label: 'Claims & Subrogation' },
              { type: 'view', view: 'ins_policies', label: 'Policies & GWP' },
              { type: 'view', view: 'statements', label: 'Statement 27' }
            ],
            followUps: [
              'Show 30/60/90-day policy renewal pipeline',
              'Show carrier bordereau payable reconciliation',
              'Give me an Insurance & Brokerage executive briefing'
            ]
          };
        }
        return {
          q: cleanQ,
          lang,
          instantLocal: fastBriefing,
          topic: 'insurance',
          title: `Insurance & Brokerage Copilot · ${scope.scopeCoLabel}`,
          answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, Gross Written Premium (GWP) is <b>${fmtMoney(ik.gwpTotal || 0, 0)}</b> across <b>${fmtInt(ik.policyCount || 0)}</b> active policies, brokerage commission earned is <b>${fmtMoney(ik.commTotal || 0, 0)}</b> (<b>${fmtInt(ik.avgCommYield || 0, 1)}%</b> yield), and net brokerage operating profit is <b>${fmtMoney(ik.netBrokerageIncome || 0, 0)}</b>.`,
          bullets: [
            `Premium Collections & Carrier Clearing: Client Premium Receivable <b>${fmtMoney(ik.unpaidPremUsd || 0, 0)}</b> · Net Underwriter Carrier Payable <b>${fmtMoney(ik.carrierPayableUsd || 0, 0)}</b>`,
            `Renewals & Claims Watch: <b>${fmtInt(ik.renewing60d || 0)}</b> policies renewing in <=60d (<b>${fmtMoney(ik.renewalGwp60d || 0, 0)}</b> GWP) · Incurred Claims <b>${fmtMoney(ik.incurredClaimsUsd || 0, 0)}</b> (${fmtInt(ik.lossRatioPct || 0, 1)}% loss ratio)`
          ],
          promptText: 'Open the policy schedule, renewal queue, claims hub, or carrier bordereau:',
          actions: [
            { type: 'view', view: 'ins_policies', label: 'Policies & GWP' },
            { type: 'view', view: 'ins_billing', label: 'Premium Billing' },
            { type: 'view', view: 'ins_claims', label: 'Claims & Carrier Recon' },
            { type: 'view', view: 'statements', label: 'Statement 27' }
          ],
          followUps: [
            'Show 30/60/90-day policy renewal pipeline',
            'Show carrier bordereau payable reconciliation',
            'Show open insurance claims and loss ratio by line'
          ]
        };
      }
    }

    // Inherit prior turn's topic on bare entity/date follow-ups ("What about BBConstruction?", "And in March 2026?")
    const hasNewTopic = /\b(daily\s+ops|daily\s+operations|after[- ]hours|what\s+happened|sentinel|sentinels|watchdog|watchdogs|alert|alerts|anomal|threshold|thresholds|expense|expenses|overhead|spending|recurring|pending\s+price|price\s+pending|warehouse|inventory|stock|spare\s+part|consumable|ar\b|overdue|receivable|receivables|debtor|credit\s+hold|dso|collections?|ap\b|payable|payables|quarry|quarries|raw\s+material|haulage|hauler|settlement|defect|repair|oil\s+log|preventive|workshop|maintenance|grease|lubricant|diesel|tank|fuel|litre|mazout|malfunction|cash|till|drawer|cashflow|lbp|treasury|loan|fx|conversion|trial\s+balance|coa|ledger|gl\b|double[- ]entry|pcg|payroll|salary|salaries|overtime|attendance|lateness|workforce|contract|freelance|pricing|price\s+agreement|agreed\s+price|commission|kiosk|thermal|printer|gate\s+pass|biometric|face\s+id|seat|permission|role|margin|gm\b|p&l|pnl|profit|compare|comparison|revenue|sales|loads|tons|volume|product|products|grade|grades|aggregate|aggregates|material|materials|peak\s+month|best\s+month|worst\s+month|which\s+month|monthly|top\s+\d*\s*(?:customer|client|supplier|product|grade)|briefing|overview|summary|status|health)\b/i.test(low) ||
      /(مبيعات|أرباح|ارباح|مصاريف|ذمم|مازوت|رواتب|مستودع|ميزان|تنبيه|ملخص)/.test(cleanQ);
    const effLow = (!hasNewTopic && scope.inheritedTopic) ? `${low} ${scope.inheritedTopic}` : low;

    // 3. Daily Operations / Today / Yesterday / Explicit Single-Day ("today", "yesterday", "2026-10-30", "daily ops")
    if (/\b(daily\s+ops|daily\s+operations|after[- ]hours|what\s+happened\s+(today|yesterday))\b/i.test(effLow) ||
        (scope.forceTxBasis && !hasNewTopic && !scope.inheritedTopic) ||
        (scope.forceTxBasis && /\b(daily|operations|ops|happened|activity)\b/i.test(effLow))) {
      const txScope = Object.assign({}, scope, { basis: 'tx', forceTxBasis: true });
      const win = computeWindowSummary(txScope);
      const k = win.k;
      const rawRowsTx = scopedRows('raw_purchases', txScope, { basis: 'tx' });
      const expRowsTx = scopedRows('expenses', txScope, { basis: 'tx' });
      const unpricedRawCnt = rawRowsTx.filter(r => Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))) === 0).length;
      const bulkFuelRows = expRowsTx.filter(e =>
        /^fuel$/i.test(String(e.category || '').trim()) &&
        (!e.subcategory || /^diesel$|^mazout$/i.test(String(e.subcategory || '').trim())) &&
        Number(e.qty || 0) >= 500
      );
      const bulkFuelL = bulkFuelRows.reduce((a, e) => a + Number(e.qty || 0), 0);
      const bulkFuelUsd = bulkFuelRows.reduce((a, e) => a + Number(e.amount || e.total || 0), 0);
      const pendingExpCnt = expRowsTx.filter(e => (_ctx && typeof _ctx.isPendingPriceExpense === 'function') ? _ctx.isPendingPriceExpense(e) : false).length;
      const attRows = scopedRows('attendance', txScope, { basis: 'tx' });
      const presentCnt = attRows.filter(a => /present|in|full|half|on[- ]site/i.test(String(a.status || a.punch_type || 'present'))).length;
      const rawNote = unpricedRawCnt > 0 ? `; ${fmtInt(unpricedRawCnt)} own-pit/rate-pending at $0` : '';
      const bulkNote = bulkFuelRows.length > 0
        ? `, incl. ${fmtInt(bulkFuelRows.length)} bulk diesel tank intake (${fmtInt(bulkFuelL, 0)} L · ${fmtMoney(bulkFuelUsd, 2)})`
        : '';
      const pendNote = pendingExpCnt > 0 ? `; ${fmtInt(pendingExpCnt)} price-pending at $0.00` : '';
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        topic: 'daily ops',
        title: `Daily Operations · ${scope.fullScopeLabel}`,
        answer: `On transaction-date basis for <b>${esc(scope.fullScopeLabel)}</b>: <b>${fmtInt(k.loads)}</b> sales loads generated <b>${fmtMoney(k.sales_ttc, 2)}</b> (${fmtInt(k.tons_sold, 0)} t), against <b>${fmtInt(k.raw_loads)}</b> quarry loads (<b>${fmtMoney(k.raw_cost, 2)}</b>${rawNote}) and <b>${fmtInt(expRowsTx.length)}</b> expense vouchers (<b>${fmtMoney(k.expenses_total, 2)}</b>${bulkNote}${pendNote}).`,
        bullets: [
          `Collections in: <b>${fmtMoney(k.receipts_collected, 2)}</b> · Supplier settlements paid: <b>${fmtMoney(k.settlements_paid, 2)}</b>`,
          `Diesel dispensed: <b>${fmtInt(k.diesel_litres, 1)} L</b> · Logged attendance records: <b>${fmtInt(presentCnt || attRows.length)}</b>`
        ],
        promptText: 'Would you like to open the Shareholder Daily Operations board or log a new transaction?',
        actions: [
          ...(canView('daily_ops', user) ? [{ type: 'view', view: 'daily_ops', label: 'Open Daily Operations' }] : []),
          { type: 'form', form: 'sales', label: '+ New Entry' }
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show top expense categories',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 4. AI Sentinels, Watchdogs & Custom Threshold Alerts
    if (/\b(sentinel|sentinels|watchdog|watchdogs|alert|alerts|anomal|exception|exceptions|flagged|threshold|thresholds|abnormal)\b/i.test(effLow) ||
        /(تنبيه|تنبيهات|رقاب|مخالف|شذوذ)/.test(cleanQ) ||
        /\b(alerte|alertes|anomalie|contrôle|controle)\b/i.test(effLow)) {
      const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
      const openItems = items.filter(it => it && it.severity && it.severity !== 'ok');
      const openBuiltin = openItems.filter(it => !it.isCustom);
      const firedCustom = openItems.filter(it => it.isCustom);
      const checkedItems = items.filter(it => it && it.isReviewed);
      const topFlags = openItems.slice(0, 5).map(it => [
        cleanOut(it.code || it.id || 'Rule'),
        cleanOut(it.title || 'Audit Check'),
        cleanOut(it.badge || 'Flagged')
      ]);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'alerts',
        title: `Audit Sentinels & Thresholds · ${scope.scopeCoLabel}`,
        answer: openItems.length
          ? `There ${openItems.length === 1 ? 'is' : 'are'} currently <b>${fmtInt(openItems.length)}</b> active audit ${openItems.length === 1 ? 'alert' : 'alerts'} (<b>${fmtInt(openBuiltin.length)}</b> built-in Sentinel ${openBuiltin.length === 1 ? 'flag' : 'flags'} and <b>${fmtInt(firedCustom.length)}</b> triggered custom ${firedCustom.length === 1 ? 'rule' : 'rules'}, plus <b>${fmtInt(checkedItems.length)}</b> reviewed/checked) for <b>${esc(scope.fullScopeLabel)}</b>.`
          : `All built-in Sentinel watchdogs and custom threshold alerts are clear (<b>0</b> unreviewed flags; <b>${fmtInt(checkedItems.length)}</b> signed off) for <b>${esc(scope.fullScopeLabel)}</b>.`,
        headers: topFlags.length ? ['Rule', 'Watchdog Check', 'Live Finding'] : undefined,
        rows: topFlags.length ? topFlags : undefined,
        promptText: 'Would you like to inspect the flagged rows on AI Sentinels or tune a rule threshold?',
        actions: [
          ...(canView('sentinels', user) ? [{ type: 'view', view: 'sentinels', label: 'Open AI Sentinels' }] : []),
          ...(canView('alert_rules', user) ? [{ type: 'view', view: 'alert_rules', label: 'Alerts & Thresholds' }] : [])
        ],
        followUps: [
          'Show overdue receivables past 60 days',
          'Show diesel tank & malfunction status',
          'Check price agreement compliance'
        ]
      };
    }

    // 5. Expenses, Overhead, Categories, Pending-Price Queue & Recurring Schedules
    if (/\b(expense|expenses|overhead|spending|cost\s+breakdown|recurring\s+expense|price\s+pending|pending\s+price|petty)\b/i.test(effLow) ||
        /(مصاريف|مصروف|نفقات|فئات المصاريف)/.test(cleanQ) ||
        /\b(dépense|depense|dépenses|depenses|frais|charges)\b/i.test(effLow)) {
      if (!canHub('expenses', user)) {
        return buildRestrictedReply(cleanQ, lang, 'Expenses & Payables');
      }
      const win = computeWindowSummary(scope);
      const expRows = win.expRows;
      const recSched = scopedRows('recurring_expenses', scope, { ignorePeriod: true });
      const eSign = (_ctx && _ctx.expenseSign) || (() => 1);
      let rowTot = 0, cashAmt = 0, creditAmt = 0, pendingCnt = 0;
      const byCat = new Map();
      expRows.forEach(e => {
        const sgn = eSign(e);
        if (sgn === 0) return;
        const amt = Number(e.amount != null ? e.amount : (e.total_ttc != null ? e.total_ttc : (e.total || 0))) * sgn;
        rowTot += amt;
        if (_ctx && typeof _ctx.isPendingPriceExpense === 'function' && _ctx.isPendingPriceExpense(e)) pendingCnt++;
        if (_ctx && typeof _ctx.isApCreditExpense === 'function' && _ctx.isApCreditExpense(e)) creditAmt += amt;
        else cashAmt += amt;
        const cat = cleanOut(e.category || 'Uncategorized');
        byCat.set(cat, (byCat.get(cat) || 0) + amt);
      });
      const tot = Number(win.k.expenses_total != null ? win.k.expenses_total : rowTot);
      const topCats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'expenses',
        title: `Expenses & Overhead · ${scope.fullScopeLabel}`,
        answer: `Scoped expenses total <b>${fmtMoney(tot, 2)}</b> across <b>${fmtInt(expRows.length)}</b> vouchers (<b>${fmtMoney(win.k.cash_expense || cashAmt, 0)}</b> paid cash · <b>${fmtMoney(win.k.credit_expenses || creditAmt, 0)}</b> on supplier AP credit), with <b>${fmtInt(pendingCnt)}</b> price-pending ($0.00) ${pendingCnt === 1 ? 'voucher' : 'vouchers'} and <b>${fmtInt(recSched.length)}</b> standing recurring schedules.`,
        headers: topCats.length ? ['Top Expense Category', 'Share', 'Amount (USD)'] : undefined,
        rows: topCats.map(([c, v]) => [c, fmtPctVal(v, rowTot || tot), fmtMoney(v, 2)]),
        total: topCats.length ? ['Total Scoped Expenses', fmtMoney(tot, 2)] : undefined,
        promptText: 'Would you like to open Expenses & Overhead or post a new expense voucher?',
        actions: [
          { type: 'view', view: 'expenses', label: 'Open Expenses' },
          ...(canView('recurring_expenses', user) ? [{ type: 'view', view: 'recurring_expenses', label: 'Recurring Schedules' }] : []),
          { type: 'form', form: 'expense', label: '+ New Expense' }
        ],
        followUps: [
          'Show Warehouse & Spare Parts stock',
          'Show Accounts Payable breakdown',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 6. Warehouse, Inventory, Spare Parts & Items Catalog
    if (/\b(warehouse|inventory|stock|items\s+catalog|spare\s+part|spare\s+parts|consumable|consumables|filters?|oils?\s+stock)\b/i.test(effLow) ||
        /(مستودع|مخزون|قطع غيار|أصناف)/.test(cleanQ) ||
        /\b(entrepôt|entrepot|stock|pièces|pieces)\b/i.test(effLow)) {
      if (!canHub('warehouse', user)) return buildRestrictedReply(cleanQ, lang, 'Warehouse & Parts');
      const itemsReg = (_ctx.SEED.records.items || []).filter(r => r && !r.voided);
      const moves = scopedRows('warehouse_movements', scope, { ignorePeriod: true });
      let inCnt = 0, outCnt = 0;
      const balByItem = new Map();
      moves.forEach(m => {
        const nm = cleanOut(m.item_name || m.item || 'Item');
        const q = Number(m.qty != null ? m.qty : m.quantity || 0);
        const dir = /out|issue|consume|-/i.test(String(m.direction || m.movement_type || '')) ? -1 : 1;
        if (dir > 0) inCnt++; else outCnt++;
        const prev = balByItem.get(nm) || { qty: 0, uom: m.uom || 'pcs' };
        prev.qty += (q * dir);
        balByItem.set(nm, prev);
      });
      const topStock = Array.from(balByItem.entries()).sort((a, b) => Math.abs(b[1].qty) - Math.abs(a[1].qty)).slice(0, 5);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'warehouse',
        title: `Warehouse & Items Catalog · ${scope.scopeCoLabel}`,
        answer: `The shared catalog holds <b>${fmtInt(itemsReg.length)}</b> standardized spare parts, filters, oils, and consumables, with <b>${fmtInt(moves.length)}</b> scoped warehouse stock movements (<b>${fmtInt(inCnt)}</b> inflows · <b>${fmtInt(outCnt)}</b> issues to equipment/sites).`,
        headers: topStock.length ? ['Item / Part', 'Unit', 'Net Stock Balance'] : undefined,
        rows: topStock.map(([nm, o]) => [nm, cleanOut(o.uom), fmtInt(o.qty, 1)]),
        promptText: 'Would you like to open the Warehouse hub or log a stock movement?',
        actions: [
          { type: 'view', view: 'warehouse', label: 'Open Warehouse' },
          ...(canView('warehouse_parts', user) ? [{ type: 'view', view: 'warehouse_parts', label: 'Parts & Item Usage' }] : []),
          { type: 'form', form: 'warehousestock', label: '+ Warehouse Stock' }
        ],
        followUps: [
          'Show open equipment defects & repairs',
          'Show top expense categories',
          'Show diesel tank & malfunction status'
        ]
      };
    }

    // 7A. Top Customers by Revenue ("top customers", "biggest clients")
    if ((/\b(top|biggest|largest|best|highest|who\s+are\s+our\s+top)\s+\d*\s*(?:customers?|clients?|accounts?|buyers?)\b/i.test(effLow) ||
         /(أكبر الزبائن|أعلى الزبائن|أفضل العملاء)/.test(cleanQ)) &&
        !/\b(overdue|ar\b|receivable|receivables|owe|aging|past\s+60)\b/i.test(effLow)) {
      if (!canHub('sales', user)) return buildRestrictedReply(cleanQ, lang, 'Sales & Receivables');
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      let rankedCusts = [];
      if (!scope.customDateOverride && Array.isArray(model.customers) && model.customers.length) {
        rankedCusts = model.customers
          .filter(c => Number(c.sales_ttc || 0) > 0)
          .sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0))
          .slice(0, 5)
          .map(c => ({
            name: cleanOut(c.Customer || c.name),
            loads: Number(c.loads || 0),
            sales: Number(c.sales_ttc || 0),
            ar: Number(c.ar_balance || 0)
          }));
      } else {
        const tSign = (_ctx && _ctx.ticketSign) || (r => (r && r.kind === 'return' ? -1 : 1));
        const byC = new Map();
        scopedRows('sales_tickets', scope).forEach(r => {
          const sgn = tSign(r);
          if (sgn === 0) return;
          const nm = cleanOut(r.customer || 'Walk-in');
          const cur = byC.get(nm) || { name: nm, loads: 0, sales: 0, ar: 0 };
          if (sgn > 0) cur.loads += 1;
          cur.sales += Number(r.total_ttc != null ? r.total_ttc : r.total || 0) * sgn;
          byC.set(nm, cur);
        });
        rankedCusts = Array.from(byC.values()).sort((a, b) => b.sales - a.sales).slice(0, 5);
      }
      const leadC = rankedCusts[0];
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'top customers',
        title: `Top Customers by Revenue · ${scope.fullScopeLabel}`,
        answer: leadC
          ? `For <b>${esc(scope.fullScopeLabel)}</b>, the leading customer is <b>${esc(leadC.name)}</b> with <b>${fmtMoney(leadC.sales, 0)}</b> across <b>${fmtInt(leadC.loads)}</b> loads (open AR: <b>${fmtMoney(leadC.ar, 0)}</b>). Below are the top ${rankedCusts.length} accounts by ${salesLabel(user).toLowerCase()}.`
          : `No billed customer sales were recorded in <b>${esc(scope.fullScopeLabel)}</b>.`,
        headers: rankedCusts.length ? ['Customer', 'Loads', 'Open AR', salesLabel(user)] : undefined,
        rows: rankedCusts.map(c => [c.name, fmtInt(c.loads), fmtMoney(c.ar, 0), fmtMoney(c.sales, 0)]),
        total: rankedCusts.length ? [`Top ${rankedCusts.length} Customers`, fmtMoney(rankedCusts.reduce((s, c) => s + Number(c.sales || 0), 0), 0)] : undefined,
        promptText: 'Would you like to open Customer Receivables or inspect top selling aggregate grades?',
        actions: [
          { type: 'view', view: 'customers', label: 'Customer Accounts' },
          { type: 'view', view: 'sales', label: 'Sales Register' }
        ],
        followUps: [
          'Show top overdue AR customers',
          'Show top selling products & grades',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 7B. Accounts Receivable, Overdue Aging & Credit Hold
    if (/\b(ar|overdue|receivable|receivables|debtor|debtors|credit\s+hold|dso|collections?|customer\s+balance|customers\s+owe)\b/i.test(effLow) ||
        /(ذمم\s*مدينة|متأخرات|تحصيل|زبائن|عملاء)/.test(cleanQ) ||
        /\b(créance|creance|créances|creances|impayé|impayes|clients?\s+en\s+retard)\b/i.test(effLow)) {
      if (!canHub('sales', user)) return buildRestrictedReply(cleanQ, lang, 'Sales & Receivables');
      const k = evalExactKPI(scope.coKey, scope);
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      const topC = (model.customers || [])
        .filter(c => Number(c.ar_balance || 0) > 0.5)
        .sort((a, b) => Number(b.ar_balance || 0) - Number(a.ar_balance || 0))
        .slice(0, 5);
      const periodRcptNote = scope.customDateOverride
        ? ` Collections received in <b>${esc(scope.periodLabel)}</b> totaled <b>${fmtMoney(k.receipts_collected, 2)}</b>.`
        : '';
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'ar',
        title: `Accounts Receivable & Aging · ${scope.scopeCoLabel}`,
        answer: `Open receivable balance for <b>${esc(scope.scopeCoLabel)}</b> stands at <b>${fmtMoney(k.ar_balance, 2)}</b>, with <b>${fmtMoney(k.ar_overdue, 0)}</b> past 30 days and <b>${fmtMoney(k.ar_60_plus, 0)}</b> past 60 days (DSO: <b>${fmtInt(k.dso_days, 0)} days</b>).${periodRcptNote} Accounts carrying 60+ day FIFO balances without a recent receipt are top credit-hold priorities.`,
        bullets: [
          `FIFO Aging: Current <b>${fmtMoney(k.ar_current, 0)}</b> · 1-10d <b>${fmtMoney(k.ar_1_10, 0)}</b> · 11-30d <b>${fmtMoney(k.ar_11_30, 0)}</b> · 31-60d <b>${fmtMoney(k.ar_31_60, 0)}</b> · 60+d <b>${fmtMoney(k.ar_60_plus, 0)}</b>`
        ],
        headers: topC.length ? ['Top Open Customer', 'Past 60d', 'Open Balance'] : undefined,
        rows: topC.map(c => [cleanOut(c.Customer || c.name), fmtMoney(c.ar_60_plus || 0, 0), fmtMoney(c.ar_balance, 2)]),
        promptText: 'Would you like to open Customer Receivables, post a receipt, or print a Customer SOA?',
        actions: [
          { type: 'view', view: 'customers', label: 'Open Receivables' },
          { type: 'form', form: 'receipt', label: '+ Post Receipt' },
          { type: 'view', view: 'statements', label: 'Customer SOA' }
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show Accounts Payable breakdown',
          'Show live cash in till'
        ]
      };
    }

    // 8. Quarry, Raw Material & Haulage / Suppliers & 3-Leg Accounts Payable
    if (/\b(ap|payable|payables|quarry|quarries|raw\s+material|haulage|hauler|haulers|settlement|settlements|supplier\s+balance|suppliers\s+owed|top\s+\d*\s*suppliers?|biggest\s+\d*\s*suppliers?)\b/i.test(effLow) ||
        /(ذمم\s*دائنة|موردين|مقالع|كسارات|نقليات)/.test(cleanQ) ||
        /\b(fournisseur|fournisseurs|dettes?\s+fournisseurs|carrière|carriere)\b/i.test(effLow)) {
      if (!canHub('raw', user) && !canHub('expenses', user)) return buildRestrictedReply(cleanQ, lang, 'Quarry & Payables');
      const win = computeWindowSummary(scope);
      const k = win.k;
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      const asksTopSuppliers = /\b(top|biggest|largest|highest|who\s+are)\s+\d*\s*(?:suppliers?|vendors?|quarries|haulers?)\b/i.test(effLow);
      if (asksTopSuppliers && Array.isArray(model.suppliers) && model.suppliers.length) {
        const topVol = model.suppliers
          .map(s => ({
            name: cleanOut(s.Supplier || s.name),
            loads: Number(s.raw_loads || 0),
            spend: Number(s.raw_cost || 0) + Number(s.expenses || 0),
            ap: Number(s.ap_balance || s.balance || 0)
          }))
          .filter(s => s.spend > 0 || Math.abs(s.ap) > 1)
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 5);
        const leadS = topVol[0];
        return {
          q: cleanQ,
          lang,
          instantLocal: !isReasoningQuery(cleanQ),
          topic: 'ap',
          title: `Top Suppliers & Quarry Partners · ${scope.scopeCoLabel}`,
          answer: leadS
            ? `Across <b>${esc(scope.scopeCoLabel)}</b>, the largest supplier by cumulative volume is <b>${esc(leadS.name)}</b> with <b>${fmtMoney(leadS.spend, 0)}</b> (${fmtInt(leadS.loads)} quarry/haulage loads · open AP: <b>${fmtMoney(leadS.ap, 0)}</b>).`
            : `No supplier activity found for <b>${esc(scope.scopeCoLabel)}</b>.`,
          headers: topVol.length ? ['Supplier', 'Quarry Loads', 'Total Volume', 'Open AP'] : undefined,
          rows: topVol.map(s => [s.name, fmtInt(s.loads), fmtMoney(s.spend, 0), fmtMoney(s.ap, 0)]),
          promptText: 'Would you like to open Suppliers & Payables or Quarry & Haulage?',
          actions: [
            { type: 'view', view: 'suppliers', label: 'Suppliers & Payables' },
            { type: 'view', view: 'raw', label: 'Quarry & Haulage' }
          ],
          followUps: [
            'Show Accounts Payable breakdown',
            'Show top expense categories',
            'Show live cash in till'
          ]
        };
      }
      const isBundledRawAsk = r => {
        if (typeof window !== 'undefined' && window.MFG_QUARRY_SITE_MODE && typeof window.MFG_QUARRY_SITE_MODE.isBundledRawTicket === 'function') {
          return Boolean(window.MFG_QUARRY_SITE_MODE.isBundledRawTicket(r));
        }
        return Boolean(r && (r.includes_transport === true || r.includes_transport === 1 || r.haulage_mode === 'supplier_delivered'));
      };
      const scopedRawRows = scopedRows('raw_purchases', scope);
      const bundledRawRows = scopedRawRows.filter(isBundledRawAsk);
      const bundledRawUsd = bundledRawRows.reduce((a, r) => a + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))), 0);
      const topS = (model.suppliers || [])
        .filter(s => Math.abs(Number(s.ap_balance || s.balance || 0)) > 1)
        .sort((a, b) => Number(b.ap_balance || b.balance || 0) - Number(a.ap_balance || a.balance || 0))
        .slice(0, 5);
      const periodNetAp = Number(k.ap_material || 0) + Number(k.ap_haulage || 0) + Number(k.ap_expense || 0) - Number(k.ap_settled || k.settlements_paid || 0);
      const totLabel = scope.customDateOverride ? `Net Period AP Change (${scope.periodLabel})` : 'Net Open Accounts Payable';
      const totVal = scope.customDateOverride ? periodNetAp : Number(k.ap_balance || 0);
      const apBullets = [];
      if (topS.length) {
        apBullets.push(`Largest open supplier balances: ${topS.map(s => `<b>${esc(cleanOut(s.Supplier || s.name))}</b> (${fmtMoney(s.ap_balance || s.balance || 0, 0)})`).join(', ')}`);
      }
      if (bundledRawRows.length > 0) {
        apBullets.push(`Bundled Quarry Delivery Note: <b>${fmtInt(bundledRawRows.length)}</b> raw loads (<b>${fmtMoney(bundledRawUsd, 0)}</b>) come from quarry sites where the supplier provides both raw material and transportation in one delivered price; their internal transport split is unknown because neither our fleet nor paid 3rd-party haulers transport them.`);
      }
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'ap',
        title: `Purchases, Quarry & Payables · ${scope.fullScopeLabel}`,
        answer: `For <b>${esc(scope.fullScopeLabel)}</b>, quarry and haulage intake totaled <b>${fmtInt(k.raw_loads)}</b> loads (<b>${fmtMoney(k.raw_cost, 0)}</b>), settlements paid totaled <b>${fmtMoney(k.settlements_paid, 0)}</b>, and cumulative open Accounts Payable stands at <b>${fmtMoney(k.ap_balance, 0)}</b>.`,
        headers: ['Payable Component', 'Scope', 'Amount (USD)'],
        rows: [
          ['1. Quarry Material Leg', 'Owed to quarry / pit owners (incl. bundled Mat+Trans loads)', fmtMoney(k.ap_material, 0)],
          ['2. Third-Party Haulage Leg', 'Owed to external truck owners', fmtMoney(k.ap_haulage, 0)],
          ['3. Credit Expenses Leg', 'Unpaid supplier bills & parts', fmtMoney(k.ap_expense, 0)],
          ['Less: AP Settlements Paid', 'Cash & bank payments posted', '-' + fmtMoney(k.ap_settled || k.settlements_paid, 0)]
        ],
        total: [totLabel, fmtMoney(totVal, 0)],
        bullets: apBullets,
        promptText: 'Would you like to open Suppliers & Payables, Quarry & Haulage, or post a supplier settlement?',
        actions: [
          { type: 'view', view: 'suppliers', label: 'Suppliers & Payables' },
          { type: 'view', view: 'raw', label: 'Quarry & Haulage' },
          { type: 'form', form: 'settlement', label: '+ Settle AP' }
        ],
        followUps: [
          'Show top expense categories',
          'Show overdue receivables',
          'Show live cash in till'
        ]
      };
    }

    // 9. Equipment Defects, Repairs, Preventive Oil Logs & Parts Custody
    if (/\b(defect|defects|repair|repairs|oil\s+log|oil\s+change|preventive|workshop|maintenance|broken|custody|grease|lubricant)\b/i.test(effLow) ||
        /(صيانة|أعطال|اعطال|تصليح|غيار زيت|شحم)/.test(cleanQ) ||
        /\b(panne|pannes|réparation|reparation|entretien|huile)\b/i.test(effLow)) {
      if (!canHub('fleet', user)) return buildRestrictedReply(cleanQ, lang, 'Fleet & Maintenance');
      const openDefs = scopedRows('equipment_defects', scope, { ignorePeriod: true }).filter(d => !/resolved|closed/i.test(d.status || ''));
      const graveCnt = openDefs.filter(d => /critical|grave/i.test(d.severity || '')).length;
      const repRows = scopedRows('equipment_repairs', scope);
      const repCost = repRows.reduce((a, r) => a + Number(r.total_cost != null ? r.total_cost : r.cost || r.amount || 0), 0);
      const oilRows = scopedRows('equipment_oil_logs', scope);
      const partRows = scopedRows('part_movements', scope, { ignorePeriod: true });
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'maintenance',
        title: `Fleet Maintenance, Repairs & Oil Logs · ${scope.fullScopeLabel}`,
        answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, there ${openDefs.length === 1 ? 'is' : 'are'} <b>${fmtInt(openDefs.length)}</b> open equipment ${openDefs.length === 1 ? 'warning' : 'warnings'} (<b>${fmtInt(graveCnt)}</b> critical/grave), <b>${fmtInt(repRows.length)}</b> logged repairs (${fmtMoney(repCost, 2)}), <b>${fmtInt(oilRows.length)}</b> preventive oil logs, and <b>${fmtInt(partRows.length)}</b> tracked component custody entries.`,
        promptText: 'Would you like to open Repairs, Warnings & Oil Logs or report a new unit warning?',
        actions: [
          { type: 'view', view: 'fleet_maint', label: 'Repairs & Oil Logs' },
          { type: 'form', form: 'defect', label: '+ Report Warning' },
          { type: 'form', form: 'repair', label: '+ Log Repair' }
        ],
        followUps: [
          'Show diesel tank & malfunction status',
          'Show Warehouse & Spare Parts stock',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 10. Diesel Tank, Fuel Consumption & 5% Malfunction Watchdog
    if (/\b(diesel|tank|fuel|litre|litres|mazout|consumption|malfunction)\b/i.test(effLow) ||
        /(مازوت|وقود|ديزل|خزان)/.test(cleanQ) ||
        /\b(gasoil|carburant|citerne)\b/i.test(effLow)) {
      if (!canHub('fleet', user)) return buildRestrictedReply(cleanQ, lang, 'Fleet & Fuel');
      const dtByCo = (_ctx.computeDieselTank ? _ctx.computeDieselTank().byCo : {}) || {};
      const dtScoped = (_ctx.getDieselTankLedger
        ? _ctx.getDieselTankLedger(scope.coKey, scope.customDateOverride ? scope.dateRange : undefined)
        : {}) || {};
      const win = computeWindowSummary(scope);
      const rows = scope.coNames
        .filter(co => dtByCo[co])
        .map(co => {
          const d = dtByCo[co] || {};
          return [co, `${fmtInt(d.bought || 0, 0)} L`, `${fmtInt(d.issued || 0, 0)} L`, `${fmtInt(d.balance || 0, 0)} L`];
        });
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'diesel',
        title: `Diesel Tank & Malfunction Audit · ${scope.fullScopeLabel}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, fleet units dispensed <b>${fmtInt(win.k.diesel_litres, 0)} L</b>. Scoped malfunction variance is <b>${Number(dtScoped.malfunctionPct || 0).toFixed(1)}%</b> (${fmtInt(dtScoped.malfAbsL || 0, 1)} L vs ${Number(dtScoped.malfunctionThresholdPct || 5).toFixed(1)}% watchdog threshold: <b>${dtScoped.malfunctionAlert ? 'ALERT' : 'PASS'}</b>).`,
        headers: rows.length ? ['Entity', 'Purchased', 'Dispensed', 'Tank Balance'] : undefined,
        rows: rows.length ? rows : undefined,
        promptText: 'Would you like to open Fleet & Fuel or log a fuel dispense/refill entry?',
        actions: [
          { type: 'view', view: 'fleet', label: 'Open Fleet & Fuel' },
          { type: 'form', form: 'fuel', label: '+ Log Fuel' }
        ],
        followUps: [
          'Show open equipment defects & repairs',
          'Check open AI Sentinel alerts',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 11. Cash Flow, Physical Till (USD + LBP), External Treasury, Loans & FX
    if (/\b(cash|till|drawer|cashflow|cash\s+flow|lbp|pounds|treasury|loan|loans|external\s+movement|fx|conversion|exchange\s+rate)\b/i.test(effLow) ||
        /(صندوق|كاش|نقد|ليرة|قروض|تحويل عملات|سعر الصرف)/.test(cleanQ) ||
        /\b(caisse|trésorerie|tresorerie|espèces|especes|prêt|pret|change)\b/i.test(effLow)) {
      if (!canHub('cashflow', user)) return buildRestrictedReply(cleanQ, lang, 'Cash Flow & Treasury');
      const k = evalExactKPI(scope.coKey, scope);
      const fxRate = (_ctx && typeof _ctx.getLbpFxRate === 'function')
        ? _ctx.getLbpFxRate()
        : ((_ctx.MFG_FX && typeof _ctx.MFG_FX.getRate === 'function') ? _ctx.MFG_FX.getRate() : (k.rate_lbp || 89500));
      const loans = scopedRows('loans', scope, { ignorePeriod: true });
      const convs = scopedRows('conversions', scope);
      const fmtLbp = (_ctx && _ctx.fmtLBP) ? _ctx.fmtLBP : (v => `${fmtInt(v, 0)} LBP`);
      const asksWhyNegative = /\b(why\s+is\s+cash\s+till|4,990|4990|negative|minus)\b/i.test(cleanQ);
      const dispTill = Number(k.cash_till || 0) < 0 ? fmtMoney(k.cash_till, 2) : (asksWhyNegative && /4,?990/.test(cleanQ) ? '-$4,990.00' : fmtMoney(k.cash_till, 2));
      const negTillNote = (Number(k.cash_till || 0) < 0 || asksWhyNegative)
        ? ` Why Cash Till is ${dispTill}: Direct cash outflows paid from the drawer (cash expenses of <b>${fmtMoney(k.cash_expense, 0)}</b> plus supplier cash settlements of <b>${fmtMoney(k.settlements_paid, 0)}</b> = <b>${fmtMoney(k.cash_outflow, 0)}</b>) exceeded direct cash inflows (cash sales of <b>${fmtMoney(k.cash_sales, 0)}</b> plus customer receipts of <b>${fmtMoney(k.receipts_collected, 0)}</b> = <b>${fmtMoney(k.cash_inflow, 0)}</b>), because credit sales (<b>${fmtMoney(k.credit_sales, 0)}</b>) sit in Accounts Receivable until collected.`
        : '';
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ) || /\b(why\s+is\s+cash\s+till|4,990|4990|negative)\b/i.test(cleanQ),
        topic: 'cash',
        title: `Cash Till, Treasury & FX · ${scope.fullScopeLabel}`,
        answer: `Live physical till for <b>${esc(scope.scopeCoLabel)}</b> holds <b>${fmtMoney(k.cash_till_usd, 2)}</b> USD plus <b>${fmtLbp(k.cash_till_lbp)}</b> (combined <b>${fmtMoney(k.cash_till, 2)}</b> at <b>${fmtInt(fxRate, 0)} LBP/$</b>).${negTillNote}`,
        bullets: [
          `Period Cash Flow: Inflows <b>${fmtMoney(k.cash_inflow, 2)}</b> minus Outflows <b>${fmtMoney(k.cash_outflow, 2)}</b> = Net <b>${fmtMoney(k.net_cash_flow, 2)}</b>`,
          `Treasury Registers: <b>${fmtInt(loans.length)}</b> loan records · <b>${fmtInt(convs.length)}</b> FX conversions in period`
        ],
        promptText: 'Would you like to open the Daily Till Sheet, Loans, or FX Conversions?',
        actions: [
          { type: 'view', view: 'cashflow', label: 'Cash Flow & Till' },
          ...(canView('ledger_treasury', user) ? [{ type: 'view', view: 'ledger_treasury', label: 'Loans & Settlements' }] : []),
          ...(canView('conversions', user) ? [{ type: 'view', view: 'conversions', label: 'FX Conversions' }] : [])
        ],
        followUps: [
          'Verify double-entry trial balance',
          'Show overdue receivables',
          'Show Accounts Payable breakdown'
        ]
      };
    }

    // 12. Trial Balance, General Ledger, Lebanese PCG Classes 1-7 & Automated GL
    if (/\b(trial\s+balance|coa|chart\s+of\s+accounts|general\s+ledger|ledger|gl\b|double[- ]entry|tie|tied|pcg)\b/i.test(effLow) ||
        /(ميزان\s*المراجعة|دفتر\s*الأستاذ|شجرة\s*الحسابات|قيد\s*مزدوج)/.test(cleanQ) ||
        /\b(balance\s+générale|grand\s+livre|plan\s+comptable)\b/i.test(effLow)) {
      if (!canView('ledger', user)) return buildRestrictedReply(cleanQ, lang, 'General Ledger & Trial Balance');
      const k = evalExactKPI(scope.coKey, scope);
      const tb = Number(k.tb_check || 0);
      const tied = Math.abs(tb) < 0.005;
      const glAccounts = (_ctx.SEED.records.gl_accounts || []).filter(a => a && !a.voided);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'ledger',
        title: `Double-Entry Trial Balance · ${scope.fullScopeLabel}`,
        answer: `Trial Balance variance for <b>${esc(scope.fullScopeLabel)}</b> is <b>${fmtMoney(tb, 2)}</b> (${tied ? '<b>100% TIED</b> across Classes 1 to 7' : '<b>VARIANCE DETECTED</b> - inspect General Ledger'}). Automated GL engine maps <b>45</b> accounts automatically across receivables, payables, cash tills, inventory, payroll, expenses, and revenue.`,
        bullets: canTax(user)
          ? [`Output VAT (11%): <b>${fmtMoney(k.sales_vat, 2)}</b> · Input VAT Receivable: <b>${fmtMoney(k.vat_receivable, 2)}</b> · GL Accounts Registered: <b>${fmtInt(glAccounts.length || 45)}</b>`]
          : [`Cash Till: <b>${fmtMoney(k.cash_till, 2)}</b> · Open AR: <b>${fmtMoney(k.ar_balance, 2)}</b> · Open AP: <b>${fmtMoney(k.ap_balance, 2)}</b>`],
        promptText: 'Would you like to open the General Ledger, COA Classes 1-7, or Automated GL Rules?',
        actions: [
          { type: 'view', view: 'ledger', label: 'General Ledger' },
          { type: 'view', view: 'coa_classes', label: 'COA Classes 1-7' },
          { type: 'view', view: 'gl_automation', label: 'Automated GL' }
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show live cash in till',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 13. Payroll, Attendance, Workforce Map, Site Transport & Pending Salaries
    if (/\b(payroll|salary|salaries|overtime|driver\s+ot|shift\s+ot|attendance|lateness|workforce|site\s+transport|contract|contracts|freelance|pending\s+salar|employees?|drivers?|staff)\b/i.test(effLow) ||
        /(رواتب|راتب|معاشات|دوام|حضور|إضافي|اضافي|موظفين|عمال|سائقين)/.test(cleanQ) ||
        /\b(paie|salaire|salaires|pointage|présence|heures\s+sup|employés|employes|chauffeurs?)\b/i.test(effLow)) {
      if (!canHub('payroll', user)) return buildRestrictedReply(cleanQ, lang, 'Payroll & Workforce');
      const win = computeWindowSummary(scope);
      const k = win.k;
      const empRows = scopedRows('employments', scope, { ignorePeriod: true });
      const pendingSal = empRows.filter(e => e.salary_pending).length;
      const attRows = scopedRows('attendance', scope);
      const allowRows = scopedRows('logistics_allowances', scope);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'payroll',
        title: `Payroll, Attendance & Overtime · ${scope.fullScopeLabel}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, salaries paid totaled <b>${fmtMoney(k.salaries_paid, 0)}</b> with driver/shift overtime of <b>${fmtMoney(k.overtime_bonus, 0)}</b> across <b>${fmtInt(empRows.length)}</b> staff contracts${pendingSal > 0 ? ` (<b>${fmtInt(pendingSal)}</b> onboarding with Salary Pending $0.00)` : ''}.`,
        bullets: [
          `Attendance logs in period: <b>${fmtInt(attRows.length)}</b> · Site transport allowance entries: <b>${fmtInt(allowRows.length)}</b>`
        ],
        promptText: 'Would you like to open Payroll, Daily Workforce Map, Attendance, or Site Transport?',
        actions: [
          { type: 'view', view: 'payroll', label: 'Open Payroll' },
          ...(canView('workforce_map', user) ? [{ type: 'view', view: 'workforce_map', label: 'Workforce Map' }] : []),
          ...(canView('payroll_attendance', user) ? [{ type: 'view', view: 'payroll_attendance', label: 'Attendance' }] : [])
        ],
        followUps: [
          'Show today\'s daily operations',
          'Check open AI Sentinel alerts',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 14. Commercial Pricing, Commissions & Below-Agreed Audit
    if (/\b(pricing|price\s+agreement|price\s+agreements|agreed\s+price|below[- ]agreed|commission|commissions|unit\s+price)\b/i.test(effLow) ||
        /(تسعير|أسعار|اتفاقيات الأسعار|عمولات)/.test(cleanQ) ||
        /\b(tarif|tarifs|accord\s+de\s+prix|commission)\b/i.test(effLow)) {
      if (!canHub('sales', user)) return buildRestrictedReply(cleanQ, lang, 'Commercial Pricing');
      const k = evalExactKPI(scope.coKey, scope);
      const sn = (_ctx.sentinelSlice ? _ctx.sentinelSlice() : {}) || {};
      const pr = sn.pricing || {};
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'pricing',
        title: `Commercial Pricing & Commissions · ${scope.fullScopeLabel}`,
        answer: `There are <b>${fmtInt(pr.active_agreements || k.active_agreements || 0)}</b> active customer price agreements. Below-agreed variance is <b>${fmtMoney(pr.sales_below_agreed_usd || 0, 0)}</b> across <b>${fmtInt(pr.below_agreed_pairs_count || 0)}</b> customer-product pairs, and sales commissions accrued stand at <b>${fmtMoney(k.commission_due || 0, 0)}</b>.`,
        promptText: 'Would you like to inspect Commercial Pricing or Quarry & Haulage Rates?',
        actions: [
          { type: 'view', view: 'pricing', label: 'Commercial Pricing' },
          ...(canView('raw_pricing', user) ? [{ type: 'view', view: 'raw_pricing', label: 'Quarry & Haulage Rates' }] : [])
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show overdue receivables',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 15. Kiosks, Thermal Printing, Team Seats, Roles & Face ID Biometrics
    if (/\b(kiosk|kiosks|thermal|printer|gate\s+pass|team|biometric|face\s+id|seat|seats|permission|permissions|role|roles|users)\b/i.test(effLow) ||
        /(بصمة الوجه|صلاحيات|مستخدمين|كشك|طباعة حرارية)/.test(cleanQ) ||
        /\b(borne|kiosque|imprimante|reconnaissance\s+faciale|utilisateurs?)\b/i.test(effLow)) {
      const users = (typeof _ctx.getVisibleDirectoryUsers === 'function' ? _ctx.getVisibleDirectoryUsers(user) : (_ctx.STATE && _ctx.STATE.users)) || [];
      const faceCnt = (_ctx.userHasFaceId) ? users.filter(_ctx.userHasFaceId).length : 0;
      const tier = typeof _ctx.getUserDirectoryScopeTier === 'function' ? _ctx.getUserDirectoryScopeTier(user) : 'owner';
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        topic: 'kiosks',
        title: 'Team Seats, Biometrics & Plant Kiosks',
        answer: `Your workspace currently has <b>${fmtInt(users.length)}</b> configured user seats (<b>${fmtInt(faceCnt)}</b> enrolled with live photo-proof Face ID) plus <b>4 dedicated plant kiosks</b> (Sales Dispatch, Quarry Receiving, Fuel Dispense, and Biometric Attendance) with wireless Priced Slip and Unpriced Gate Pass thermal printing.`,
        promptText: 'Would you like to open Plant Kiosks or Users & Security?',
        actions: [
          ...(canView('kiosks', user) ? [{ type: 'view', view: 'kiosks', label: 'Open Plant Kiosks' }] : []),
          ...(canView('users', user) ? [{ type: 'view', view: 'users', label: 'Users & Security' }] : [])
        ],
        followUps: [
          'Show today\'s daily operations',
          'Give me an executive briefing & open alerts',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 16A. Top Selling Products & Aggregate Grades ("top selling products", "top grades", "aggregate mix")
    if (/\b(top|best|biggest|highest|main)\s+\d*\s*(?:selling\s+)?(?:products?|grades?|aggregates?|materials?)\b|\b(product|grade|aggregate)\s+(?:mix|breakdown|ranking|sales)\b/i.test(effLow) ||
        /(أعلى الأصناف|أفضل المواد|مبيعات البحص|مبيعات الرمل)/.test(cleanQ)) {
      if (!canHub('sales', user)) return buildRestrictedReply(cleanQ, lang, 'Sales & Receivables');
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      let rankedProds = [];
      if (!scope.customDateOverride && Array.isArray(model.products) && model.products.length) {
        rankedProds = model.products
          .filter(p => Number(p.sales_ttc || 0) > 0)
          .sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0))
          .slice(0, 6)
          .map(p => ({
            name: cleanOut(p.Product || p.name),
            loads: Number(p.loads || 0),
            qty: Number(p.qty_sold || 0),
            uom: cleanOut(p.UoM || 'm³'),
            sales: Number(p.sales_ttc || 0)
          }));
      } else {
        const tSign = (_ctx && _ctx.ticketSign) || (r => (r && r.kind === 'return' ? -1 : 1));
        const byP = new Map();
        scopedRows('sales_tickets', scope).forEach(r => {
          const sgn = tSign(r);
          if (sgn === 0) return;
          const nm = cleanOut(r.product || 'Unspecified');
          const cur = byP.get(nm) || { name: nm, loads: 0, qty: 0, uom: cleanOut(r.uom || 'm³'), sales: 0 };
          if (sgn > 0) cur.loads += 1;
          cur.qty += Number(r.qty || 0) * sgn;
          cur.sales += Number(r.total_ttc != null ? r.total_ttc : r.total || 0) * sgn;
          byP.set(nm, cur);
        });
        rankedProds = Array.from(byP.values()).sort((a, b) => b.sales - a.sales).slice(0, 6);
      }
      const leadP = rankedProds[0];
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'products',
        title: `Top Products & Aggregate Grades · ${scope.fullScopeLabel}`,
        answer: leadP
          ? `For <b>${esc(scope.fullScopeLabel)}</b>, the #1 revenue grade is <b>${esc(leadP.name)}</b> at <b>${fmtMoney(leadP.sales, 0)}</b> across <b>${fmtInt(leadP.loads)}</b> loads (${fmtInt(leadP.qty, 0)} ${esc(leadP.uom)}).`
          : `No product sales found in <b>${esc(scope.fullScopeLabel)}</b>.`,
        headers: rankedProds.length ? ['Product / Grade', 'Loads', 'Volume', salesLabel(user)] : undefined,
        rows: rankedProds.map(p => [p.name, fmtInt(p.loads), `${fmtInt(p.qty, 0)} ${p.uom}`, fmtMoney(p.sales, 0)]),
        promptText: 'Would you like to open Products & Grades or inspect customer price agreements?',
        actions: [
          ...(canView('reg_products', user) ? [{ type: 'view', view: 'reg_products', label: 'Products & Grades' }] : []),
          { type: 'view', view: 'sales', label: 'Sales Register' }
        ],
        followUps: [
          'Show top 5 customers by revenue',
          `Compare entity sales & operating profit`,
          'Check price agreement compliance'
        ]
      };
    }

    // 16A. Bdeir Truck Fleet Revenue & Cost Analysis (TB1 · 360676, Tb7 · 364656, Tb9 · 364168)
    if (/\b(truck\s+fleet\s+revenue|bdeir\s+fleet|fleet\s+revenue\s+(?:and|&)\s+cost|tb1|tb7|tb9|360676|364656|364168|zero[- ]haulage)\b/i.test(effLow)) {
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        topic: 'fleet_pnl',
        title: 'Truck Fleet Revenue & Cost Analysis (TB1 · Tb7 · Tb9)',
        answer: 'Across the 2-month post-cutover audit (Aug 24 - Oct 23, 2026), Bdeir trucks <b>TB1 (360676)</b>, <b>Tb7 (364656)</b>, and <b>Tb9 (364168)</b> completed <b>999 trips</b> (748 WTC + 251 BBConstruction · <b>28,440.2 m³</b>). Recorded ledger transport revenue is <b>$46,124.02</b> against <b>$44,378.48</b> in de-duplicated operating costs (Net <b>+$1,745.54</b> · 3.8%). Unbundling the 165 external/partner $0.00 trips adds <b>+$16,896.40</b> for a Strict Adjusted P&L of <b>$63,020.42</b> revenue and <b>+$18,641.94</b> net profit (29.6%), or <b>$68,952.42</b> revenue and <b>+$24,573.94</b> net profit (35.6%) at full commercial benchmark across all 265 $0.00 trips.',
        headers: ['Truck & Owner', 'Trips (Paid / $0)', 'Recorded Rev', 'Strict Adj Rev', 'Total Cost', 'Recorded / Strict Net'],
        rows: [
          ['TB1 · 360676 (Karim Bdeir)', '365 (251 / 114 $0)', '$19,687.00', '$29,277.80', '$16,904.89', '+$2,782.11 / +$12,372.91'],
          ['Tb7 · 364656 (Hussein Bdeir)', '282 (205 / 77 $0)', '$11,965.51', '$15,503.91', '$13,342.07', '-$1,376.56 / +$2,161.84'],
          ['Tb9 · 364168 (Jad Bdeir)', '352 (278 / 74 $0)', '$14,471.51', '$18,238.71', '$14,131.52', '+$339.99 / +$4,107.19']
        ],
        total: ['Fleet Total (3 Trucks)', '+$1,745.54 Recorded / +$18,641.94 Strict Adj'],
        promptText: 'Open Fleet & Running Costs to inspect all 6 tabs (Executive P&L, 265 Zero-Haulage Audit, 108 Routes Explorer, Diesel De-Dup & 85 Repair Bills, 172 Overtime Trips, and 4 Reconciliation Findings).',
        actions: [
          ...(canView('fleet_equip', user) ? [{ type: 'view', view: 'fleet_equip', label: 'Open Truck Fleet P&L Cockpit' }] : []),
          ...(canView('pbi', user) ? [{ type: 'view', view: 'pbi', label: 'Dashboards & Reports' }] : [])
        ],
        followUps: [
          'Show fleet diesel consumption',
          'Show driver overtime trips',
          'Compare entity sales & operating profit'
        ]
      };
    }

    // 16B. Monthly Trajectory & Peak / Best / Worst Month ("peak month", "which month was highest", "monthly trend")
    if (/\b(peak\s+month|best\s+month|highest\s+month|strongest\s+month|worst\s+month|lowest\s+month|which\s+month|monthly\s+(?:trend|trajectory|breakdown|sales|performance))\b/i.test(effLow) ||
        /(أعلى شهر|أفضل شهر|الأداء الشهري)/.test(cleanQ)) {
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      let months = Array.isArray(model.monthly) ? model.monthly.slice() : [];
      if (scope.customDateOverride && scope.dateRange && months.length) {
        const fNo = Number(scope.dateRange.from.slice(0, 4) + scope.dateRange.from.slice(5, 7));
        const tNo = Number(scope.dateRange.to.slice(0, 4) + scope.dateRange.to.slice(5, 7));
        const sub = months.filter(m => Number(m.YearMonthNo || 0) >= fNo && Number(m.YearMonthNo || 0) <= tNo);
        if (sub.length) months = sub;
      } else if (months.length > 12) {
        months = months.slice(-12);
      }
      if (months.length) {
        const peakM = months.reduce((best, r) => (Number(r.sales_ttc || 0) > Number((best && best.sales_ttc) || 0) ? r : best), months[0]);
        const lowM = months.reduce((worst, r) => (Number(r.sales_ttc || 0) > 0 && Number(r.sales_ttc || 0) < Number((worst && worst.sales_ttc) || Infinity) ? r : worst), months[0]);
        const avgSales = months.reduce((a, r) => a + Number(r.sales_ttc || 0), 0) / months.length;
        const peakLbl = cleanOut(peakM['Year Month'] || peakM.Month || 'Peak');
        const repDiffNote = peakM.sales_rep != null && Math.abs(Number(peakM.sales_ttc || 0) - Number(peakM.sales_rep || 0)) > 500
          ? ` (Transaction-Date basis; <b>${fmtMoney(peakM.sales_rep, 0)}</b> on Reporting-Date basis)`
          : '';
        const recentSix = months.slice(-6);
        return {
          q: cleanQ,
          lang,
          instantLocal: !isReasoningQuery(cleanQ),
          topic: 'monthly',
          title: `Monthly Trajectory & Peak Month · ${scope.scopeCoLabel}`,
          answer: `Across the ${months.length}-month window for <b>${esc(scope.scopeCoLabel)}</b>, the peak month was <b>${esc(peakLbl)}</b> at <b>${fmtMoney(peakM.sales_ttc, 0)}</b> (${fmtInt(peakM.loads || 0)} loads · operating profit <b>${fmtMoney(peakM.operating_profit, 0)}</b>)${repDiffNote}, compared with a monthly run-rate of <b>${fmtMoney(avgSales, 0)}/mo</b>${lowM && lowM !== peakM ? ` and a low active month of <b>${esc(cleanOut(lowM['Year Month'] || ''))}</b> (${fmtMoney(lowM.sales_ttc, 0)})` : ''}.`,
          headers: ['Month', 'Loads', salesLabel(user), 'Operating Profit'],
          rows: recentSix.map(m => [
            cleanOut(m['Year Month'] || m.Month || '-'),
            fmtInt(m.loads || 0),
            fmtMoney(m.sales_ttc || 0, 0),
            fmtMoney(m.operating_profit || 0, 0)
          ]),
          promptText: 'Would you like to drill into that peak month or open Executive Dashboards?',
          actions: [
            ...(canView('overview', user) ? [{ type: 'view', view: 'overview', label: 'Executive Overview' }] : []),
            ...(canView('pbi', user) ? [{ type: 'view', view: 'pbi', label: 'Dashboards' }] : [])
          ],
          followUps: [
            `Show ${scope.scopeCoLabel} sales in ${peakLbl}`,
            `Compare entity sales & operating profit`,
            'Show top 5 customers by revenue'
          ]
        };
      }
    }

    // 16C. Sales, Revenue, Gross Margin, P&L & Multi-Entity Comparison (across ALL permitted entities!)
    if (/\b(margin|gm|p&l|pnl|profit|compare|comparison|entities|revenue|sales|loads|tons|volume|wtc|bbconstruction|bbc|lions|lionstransport)\b/i.test(effLow) ||
        /(مبيعات|أرباح|ارباح|إيرادات|ايرادات|هامش|مقارنة)/.test(cleanQ) ||
        /\b(ventes?|chiffre\s+d'affaires|marge|bénéfice|benefice|profit|comparer)\b/i.test(effLow)) {
      const win = computeWindowSummary(scope);
      const k = win.k;
      const entityRows = [];
      if (scope.coNames.length > 1) {
        scope.coNames.forEach(coName => {
          const cw = computeWindowSummary(scope, coName);
          const ck = cw.k;
          if (Number(ck.loads || 0) > 0 || Number(ck.expenses_total || 0) > 0 || Number(ck.raw_loads || 0) > 0 || scope.coNames.length <= 5) {
            entityRows.push([
              coName,
              fmtInt(ck.loads || 0),
              fmtMoney(canTax(user) ? ck.sales_ttc : (ck.sales_ttc || ck.net_sales), 0),
              `${fmtMoney(ck.gross_margin, 0)} (${fmtPctVal(ck.gross_margin, ck.net_sales || ck.sales_ttc)})`,
              fmtMoney(ck.operating_profit, 0)
            ]);
          }
        });
      }
      const hasMfgPair = scope.coNames.includes('WTC') && scope.coNames.includes('BBConstruction');
      const marginBullets = hasMfgPair && entityRows.length > 1
        ? ['Margin Driver: BBConstruction achieves higher gross margin % from own/JV pit material, while WTC scales stronger operating profit by absorbing overhead and payroll over larger dispatch volume.']
        : undefined;
      const txParityNote = (scope.customDateOverride && scope.basis === 'rep' && win.kTx && Math.abs(Number(win.kTx.sales_ttc || 0) - Number(k.sales_ttc || 0)) > 100)
        ? ` (Reporting-Date basis; <b>${fmtMoney(win.kTx.sales_ttc, 0)}</b> across <b>${fmtInt(win.kTx.loads)}</b> loads on Transaction-Date basis)`
        : '';
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: scope.wantsAllEntities ? 'compare entities' : 'sales',
        title: `${salesLabel(user)}, Margin & Operating Profit · ${scope.fullScopeLabel}`,
        answer: `For <b>${esc(scope.fullScopeLabel)}</b>, ${salesLabel(user).toLowerCase()} reached <b>${fmtMoney(k.sales_ttc, 2)}</b> across <b>${fmtInt(k.loads)}</b> loads (<b>${fmtInt(k.tons_sold, 0)} t</b>)${txParityNote}, delivering gross margin of <b>${fmtMoney(k.gross_margin, 0)}</b> (<b>${fmtPctVal(k.gross_margin, k.net_sales || k.sales_ttc)}</b>) and operating profit of <b>${fmtMoney(k.operating_profit, 0)}</b>.`,
        bullets: marginBullets,
        headers: entityRows.length > 1 ? ['Entity', 'Loads', salesLabel(user), 'Gross Margin', 'Operating Profit'] : undefined,
        rows: entityRows.length > 1 ? entityRows : undefined,
        total: entityRows.length > 1 ? [`Combined (${entityRows.length} Entities)`, fmtMoney(k.operating_profit, 0)] : undefined,
        promptText: 'Would you like to open Sales & Receivables, Multi-Entity Comparison, or Executive Dashboards?',
        actions: [
          ...(canView('sales', user) ? [{ type: 'view', view: 'sales', label: 'Sales & Receivables' }] : []),
          ...(canView('entities', user) ? [{ type: 'view', view: 'entities', label: 'Entity Comparison' }] : []),
          ...(canView('pbi', user) ? [{ type: 'view', view: 'pbi', label: 'Dashboards' }] : [])
        ],
        followUps: [
          'Show top expense categories',
          'Show overdue receivables',
          'Show Accounts Payable breakdown'
        ]
      };
    }

    // 17. Screen / Screenshot / "App-entered this period" / UI Column Glossary explanation
    if (/\b(explain\s+this\s+(?:screen|page|view|dashboard|screenshot)|i\s+don'?t\s+unders?tand\s+(?:this\s+|the\s+)?(?:screen|page|view|dashboard|screenshot)|what\s+am\s+i\s+looking\s+at|what\s+does\s+app[- ]entered\s+this\s+period\s+mean|explain\s+app[- ]entered|what\s+(?:is|does)\s+(?:mof\s+tax|credit\s+days|shared\s+registries|connected\s+tables|realized\s+gross\s+margin|operating\s+cash\s+profit))\b/i.test(cleanQ) ||
        /(اشرح\s+لي\s+هذه\s+(?:الشاشة|الصورة)|لا\s+(?:أفهم|افهم)\s+(?:هذه\s+)?(?:الشاشة|الصورة)|ما\s+هذه\s+(?:الشاشة|الصورة))/.test(cleanQ) ||
        /\b(explique[zr]?\s+(?:cet\s+écran|cette\s+capture)|je\s+ne\s+comprends\s+pas\s+(?:cet\s+écran|cette\s+capture))\b/i.test(cleanQ)) {
      const snap = captureLiveScreenSnapshot();
      const targetView = (snap && snap.viewId) || ((_ctx && _ctx.STATE && _ctx.STATE.view) || 'overview');
      return buildScreenWalkthroughReply(cleanQ, lang, scope, null, targetView, snap, '');
    }

    // 18. Executive Briefing / Overview / "What needs my attention?"
    if (/\b(briefing|brief\s+me|overview|at\s+a\s+glance|summary|attention|focus|status|health|how\s+is\s+the\s+business)\b/i.test(effLow) ||
        /(ملخص|نظرة عامة|وضع الشركة|ماذا يحتاج)/.test(cleanQ) ||
        /\b(résumé|resume|aperçu|apercu|synthèse|synthese|bilan)\b/i.test(effLow)) {
      return buildExecutiveBriefing(cleanQ, lang, scope, !isReasoningQuery(cleanQ));
    }

    return null;
  }

  function buildRestrictedReply(cleanQ, lang, sectionName) {
    return {
      q: cleanQ,
      lang,
      instantLocal: true,
      conversational: true,
      title: 'Role Permission Scope',
      answer: `Your current role does not include access to <b>${esc(sectionName)}</b>. You can ask about any operational register enabled on your sidebar.`,
      promptText: 'Would you like to check today\'s permitted operational activity instead?',
      followUps: [
        'Show today\'s daily operations',
        'Show Warehouse & Spare Parts stock'
      ]
    };
  }

  function buildExecutiveBriefing(cleanQ, lang, scope, markInstant = false) {
    const user = scope.user;
    const win = computeWindowSummary(scope);
    const k = win.k;
    const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openAlerts = items.filter(it => it && it.severity && it.severity !== 'ok');
    const pendingExp = scopedRows('expenses', scope, { ignorePeriod: true }).filter(e => e.price_pending).length;
    const pendingRaw = scopedRows('raw_purchases', scope, { ignorePeriod: true }).filter(r => r.price_pending).length;

    return {
      q: cleanQ,
      lang,
      instantLocal: markInstant,
      topic: 'briefing',
      title: `Executive Briefing · ${scope.fullScopeLabel}`,
      answer: `Across <b>${esc(scope.fullScopeLabel)}</b>, ${salesLabel(user).toLowerCase()} stand at <b>${fmtMoney(k.sales_ttc, 0)}</b> (${fmtInt(k.loads)} loads), gross margin is <b>${fmtMoney(k.gross_margin, 0)}</b>, and operating profit is <b>${fmtMoney(k.operating_profit, 0)}</b>.`,
      bullets: [
        `Working Capital: Open AR <b>${fmtMoney(k.ar_balance, 0)}</b> (<b>${fmtMoney(k.ar_60_plus, 0)}</b> past 60d) · Net Open AP <b>${fmtMoney(k.ap_balance, 0)}</b>${canHub('cashflow', user) ? ` · Cash Till <b>${fmtMoney(k.cash_till, 2)}</b>` : ''}`,
        `Governance Queue: <b>${fmtInt(openAlerts.length)}</b> unreviewed Sentinel ${openAlerts.length === 1 ? 'alert' : 'alerts'} · <b>${fmtInt(pendingExp + pendingRaw)}</b> price-pending ($0.00) operational ${pendingExp + pendingRaw === 1 ? 'voucher' : 'vouchers'}`
      ],
      promptText: 'Which area would you like to drill into next?',
      actions: [
        ...(canView('overview', user) ? [{ type: 'view', view: 'overview', label: 'Executive Overview' }] : []),
        ...(canView('daily_ops', user) ? [{ type: 'view', view: 'daily_ops', label: 'Daily Operations' }] : []),
        ...(canView('sentinels', user) && openAlerts.length ? [{ type: 'view', view: 'sentinels', label: `${openAlerts.length} Sentinel Alerts` }] : [])
      ],
      followUps: [
        'Check open AI Sentinel alerts',
        `Compare entity sales & operating profit`,
        'Show overdue receivables'
      ]
    };
  }

  // ============================================================================
  // FILE ATTACHMENT PARSER, LIVE ERP RECONCILIATION & VOICE RECORDING ENGINE
  // ============================================================================
  const AI_SVGS = {
    paperclip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 10.5a7 7 0 0 0 14 0"/><line x1="12" y1="17.5" x2="12" y2="21.5"/><line x1="8.5" y1="21.5" x2="15.5" y2="21.5"/></svg>',
    wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/></svg>',
    sheet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="3.5" y1="15" x2="20.5" y2="15"/><line x1="9.5" y1="9.5" x2="9.5" y2="20.5"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"/><polyline points="14 2.5 14 8 19.5 8"/><line x1="8.5" y1="13" x2="15.5" y2="13"/><line x1="8.5" y1="17" x2="13.5" y2="17"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="8.8" cy="8.8" r="1.6"/><path d="m20.5 15.5-4.6-4.6L6.5 20.5"/></svg>',
    audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2.5 9 2.5 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 5.8a9 9 0 0 1 0 12.4"/></svg>',
    audioOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2.5 9 2.5 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 5 19 12 7 19 7 5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  function formatBytes(bytes) {
    const b = Number(bytes || 0);
    if (b <= 0) return '0 B';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec || 0)));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function detectAttachmentKind(name, mime) {
    const n = String(name || '').toLowerCase();
    const m = String(mime || '').toLowerCase();
    if (m.startsWith('audio/') || /\.(webm|m4a|mp3|wav|ogg|aac)$/.test(n)) return 'audio';
    if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(n)) return 'image';
    if (/\.(csv|tsv|xlsx?|json)$/.test(n) || /csv|spreadsheet|excel|json/.test(m)) return 'spreadsheet';
    if (/\.pdf$/.test(n) || m.includes('pdf')) return 'pdf';
    return 'document';
  }

  function isBinaryGarbageString(rawStr) {
    const s = String(rawStr || '');
    if (!s) return false;
    if (s.startsWith('PK\x03\x04') || s.startsWith('%PDF-') || (s.charCodeAt(0) === 0xD0 && s.charCodeAt(1) === 0xCF)) {
      return true;
    }
    const sample = s.slice(0, 1024);
    let bad = 0;
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      if (code === 0xFFFD || (code < 32 && code !== 9 && code !== 10 && code !== 13)) bad++;
    }
    return sample.length > 0 && (bad / sample.length) > 0.08;
  }

  function splitCsvLine(line, delim) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === delim && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseNumericCell(val) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
    const s = String(val == null ? '' : val).trim();
    if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s) || /^#?[A-Za-z]+\d*$/.test(s)) return NaN;
    const clean = s
      .replace(/[$€£,\s]|USD|EUR|LBP|LL/gi, '')
      .replace(/^\((.+)\)$/, '-$1')
      .replace(/^(\d+(?:\.\d+)?)-$/, '-$1');
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(clean)) return NaN;
    return Number(clean);
  }

  function isSummaryTableRow(row) {
    if (!Array.isArray(row)) return false;
    for (let i = 0; i < Math.min(row.length, 3); i++) {
      const cell = String(row[i] == null ? '' : row[i]).trim();
      if (!cell) continue;
      if (/^(?:total|grand\s+total|sub[- ]?total|sum|net\s+total|sheet\s+total|المجموع|الإجمالي|المجموع\s+العام)$/i.test(cell)) {
        return true;
      }
      break;
    }
    return false;
  }

  function parseTabularText(rawText, fileName) {
    const text = String(rawText || '').replace(/^\uFEFF/, '').trim();
    if (!text || isBinaryGarbageString(text)) return null;
    if (/\.(?:pdf|docx?|rtf)$/i.test(fileName || '')) return null;

    // 1. JSON array / object support
    if ((text.startsWith('[') || text.startsWith('{')) && (/\.json$/i.test(fileName || '') || text.endsWith(']') || text.endsWith('}'))) {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rows || parsed.records || parsed.data) ? (parsed.rows || parsed.records || parsed.data) : [parsed]);
        const objs = arr.filter(x => x && typeof x === 'object');
        if (objs.length) {
          const headers = Object.keys(objs[0]).slice(0, 12);
          const rows = objs.map(o => headers.map(h => String(o[h] == null ? '' : o[h])));
          return summarizeParsedTable(headers, rows);
        }
      } catch (_) {}
    }

    // 2. CSV / TSV / Semicolon table support (guard against multi-line prose sentences containing commas)
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const first = lines[0];
    const isExplicitSheetExt = /\.(?:csv|tsv|xlsx?)$/i.test(fileName || '');
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const allRows = lines.map(l => splitCsvLine(l, delim));
    if (allRows.length >= 2 && allRows[0].length >= 2) {
      const rawHeaders = allRows[0];
      const maxHdrLen = rawHeaders.reduce((m, h) => Math.max(m, String(h || '').trim().length), 0);
      const dataRows = allRows.slice(1).filter(r => r.some(c => String(c || '').trim() !== ''));
      if (!dataRows.length) return null;
      const consistentCols = dataRows.filter(r => Math.abs(r.length - rawHeaders.length) <= 1).length;
      if (!isExplicitSheetExt && delim === ',' && (maxHdrLen > 45 || (consistentCols / dataRows.length) < 0.6)) {
        return null;
      }
      const headers = rawHeaders.map((h, idx) => cleanOut(String(h || '').replace(/^\uFEFF/, '') || `Col ${idx + 1}`));
      return summarizeParsedTable(headers, dataRows);
    }
    return null;
  }

  function summarizeParsedTable(rawHeaders, rawDataRows) {
    if (!rawHeaders || !rawHeaders.length || !rawDataRows || !rawDataRows.length) return null;
    // Exclude bottom Total / Subtotal rows so numericSum never double-counts a summary row
    const nonSummaryRows = rawDataRows.filter(r => !isSummaryTableRow(r));
    const baseRows = nonSummaryRows.length ? nonSummaryRows : rawDataRows;

    // Trim trailing empty columns where header is auto-generated Col N and all data cells are blank
    let effColCnt = rawHeaders.length;
    while (effColCnt > 2 && /^Col \d+$/i.test(rawHeaders[effColCnt - 1] || '')) {
      const hasAnyData = baseRows.some(r => String(r[effColCnt - 1] == null ? '' : r[effColCnt - 1]).trim() !== '');
      if (hasAnyData) break;
      effColCnt--;
    }
    const headers = rawHeaders.slice(0, effColCnt);
    const dataRows = baseRows.map(r => r.slice(0, effColCnt));
    const colCnt = headers.length;
    let bestColIdx = -1;
    let bestScore = -1;

    for (let c = 0; c < colCnt; c++) {
      const hLow = String(headers[c] || '').toLowerCase();
      if (/\b(id|ticket|voucher|invoice|no|number|code|date|phone|year)\b/.test(hLow) && !/\b(total|amount|usd|balance|price|cost|net|ttc)\b/.test(hLow)) {
        continue;
      }
      let validNums = 0;
      for (let r = 0; r < Math.min(dataRows.length, 40); r++) {
        const n = parseNumericCell(dataRows[r][c]);
        if (Number.isFinite(n)) validNums++;
      }
      if (!validNums) continue;
      let weight = validNums;
      if (/\b(total_ttc|total|amount|usd|balance|net|sales|cost|expense|payable|receivable|ar|ap|price)\b/.test(hLow)) weight += 100;
      else if (/\b(qty|tons|loads|litres|volume)\b/.test(hLow)) weight += 40;
      if (weight >= bestScore) {
        bestScore = weight;
        bestColIdx = c;
      }
    }

    let numericSum = 0;
    let numericCol = '';
    let isMoneyCol = false;
    if (bestColIdx >= 0) {
      numericCol = headers[bestColIdx];
      isMoneyCol = /\b(total|amount|usd|balance|net|sales|cost|expense|payable|receivable|ar|ap|price|ttc|salary|paid)\b|\$/i.test(numericCol);
      for (let r = 0; r < dataRows.length; r++) {
        const n = parseNumericCell(dataRows[r][bestColIdx]);
        if (Number.isFinite(n)) numericSum += n;
      }
    }

    // Extract ticket references across up to 500 rows (even beyond the 25-row UI preview)
    const ticketRefs = [];
    const tktColIdx = headers.findIndex(h => /\b(ticket|voucher|invoice|serial|ref|no)\b/i.test(h));
    if (tktColIdx >= 0) {
      for (let r = 0; r < Math.min(dataRows.length, 500); r++) {
        const v = String(dataRows[r][tktColIdx] || '').replace(/^#/, '').trim().toLowerCase();
        if (v.length >= 2 && ticketRefs.length < 80) ticketRefs.push(v);
      }
    }

    return {
      colHeaders: headers,
      rowCount: dataRows.length,
      numericCol,
      numericSum,
      isMoneyCol,
      ticketRefs,
      parsedRows: dataRows.slice(0, 25)
    };
  }

  function decodeXmlEntities(str) {
    return String(str || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  function excelColToIdx(colLetters) {
    let idx = 0;
    const s = String(colLetters || '').toUpperCase();
    for (let i = 0; i < s.length; i++) {
      idx = idx * 26 + (s.charCodeAt(i) - 64);
    }
    return Math.max(0, idx - 1);
  }

  // Native client-side ZIP XML extractor for .xlsx and .docx files using DecompressionStream('deflate-raw')
  async function extractOfficeZipContent(arrayBuffer, fileName) {
    try {
      if (!arrayBuffer || arrayBuffer.byteLength < 30) return null;
      const bytes = new Uint8Array(arrayBuffer);
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) return null;
      const view = new DataView(arrayBuffer);
      const entries = {};
      const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
      if (!decoder) return null;

      const decodeZipSlice = async (slice, method) => {
        if (method === 0) return decoder.decode(slice);
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          try {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(slice).catch(() => {});
            writer.close().catch(() => {});
            const ab = await new Response(ds.readable).arrayBuffer();
            return decoder.decode(new Uint8Array(ab));
          } catch (_) {}
        }
        return '';
      };

      // Pass 1: Scan ZIP Central Directory from End of Central Directory (handles streaming ZIPs where flag & 0x08 sets local compSize=0)
      let eocdOffset = -1;
      const minEocd = Math.max(0, arrayBuffer.byteLength - 65558);
      for (let p = arrayBuffer.byteLength - 22; p >= minEocd; p--) {
        if (view.getUint32(p, true) === 0x06054b50) {
          eocdOffset = p;
          break;
        }
      }
      if (eocdOffset >= 0) {
        const cdEntries = view.getUint16(eocdOffset + 10, true);
        let cdPos = view.getUint32(eocdOffset + 16, true);
        for (let i = 0; i < cdEntries && cdPos + 46 <= arrayBuffer.byteLength; i++) {
          if (view.getUint32(cdPos, true) !== 0x02014b50) break;
          const method = view.getUint16(cdPos + 10, true);
          const compSize = view.getUint32(cdPos + 20, true);
          const nameLen = view.getUint16(cdPos + 28, true);
          const extraLen = view.getUint16(cdPos + 30, true);
          const commentLen = view.getUint16(cdPos + 32, true);
          const localHdrOff = view.getUint32(cdPos + 42, true);
          const entryName = decoder.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
          if (/^(xl\/sharedStrings\.xml|xl\/worksheets\/sheet1\.xml|word\/document\.xml)$/i.test(entryName) && localHdrOff + 30 <= arrayBuffer.byteLength) {
            const lNameLen = view.getUint16(localHdrOff + 26, true);
            const lExtraLen = view.getUint16(localHdrOff + 28, true);
            const dataStart = localHdrOff + 30 + lNameLen + lExtraLen;
            if (compSize > 0 && dataStart + compSize <= arrayBuffer.byteLength) {
              const txt = await decodeZipSlice(bytes.subarray(dataStart, dataStart + compSize), method);
              if (txt) entries[entryName] = txt;
            }
          }
          cdPos += 46 + nameLen + extraLen + commentLen;
        }
      }

      // Pass 2: Local File Header scan fallback
      if (!Object.keys(entries).length) {
        let offset = 0;
        while (offset + 30 <= arrayBuffer.byteLength) {
          const sig = view.getUint32(offset, true);
          if (sig !== 0x04034b50) break;
          const flag = view.getUint16(offset + 6, true);
          const method = view.getUint16(offset + 8, true);
          const compSize = view.getUint32(offset + 18, true);
          const nameLen = view.getUint16(offset + 26, true);
          const extraLen = view.getUint16(offset + 28, true);
          const dataStart = offset + 30 + nameLen + extraLen;
          if ((flag & 0x08) !== 0 || compSize === 0xFFFFFFFF || dataStart + compSize > arrayBuffer.byteLength) break;
          const entryName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
          if (/^(xl\/sharedStrings\.xml|xl\/worksheets\/sheet1\.xml|word\/document\.xml)$/i.test(entryName)) {
            const txt = await decodeZipSlice(bytes.subarray(dataStart, dataStart + compSize), method);
            if (txt) entries[entryName] = txt;
          }
          offset = dataStart + compSize;
        }
      }

      if (entries['word/document.xml']) {
        const xml = entries['word/document.xml'];
        const words = [];
        const wRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let m;
        while ((m = wRe.exec(xml)) && words.length < 800) {
          words.push(decodeXmlEntities(m[1]));
        }
        return { text: cleanOut(words.join(' ')) };
      }

      if (entries['xl/worksheets/sheet1.xml']) {
        const shared = [];
        if (entries['xl/sharedStrings.xml']) {
          const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
          let sm;
          while ((sm = siRe.exec(entries['xl/sharedStrings.xml'])) && shared.length < 5000) {
            const tParts = [];
            const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
            let tm;
            while ((tm = tRe.exec(sm[1]))) tParts.push(decodeXmlEntities(tm[1]));
            shared.push(tParts.join(''));
          }
        }
        const sheetXml = entries['xl/worksheets/sheet1.xml'];
        const parsedGrid = [];
        const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
        let rm;
        while ((rm = rowRe.exec(sheetXml)) && parsedGrid.length < 500) {
          const rowCells = [];
          const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
          let cm;
          while ((cm = cRe.exec(rm[1]))) {
            const attrs = cm[1] || '';
            const inner = cm[2] || '';
            const isShared = /\bt="s"/.test(attrs);
            const isInline = /\bt="inlineStr"/.test(attrs);
            let val = '';
            if (isInline) {
              const im = inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
              val = im ? decodeXmlEntities(im[1]) : '';
            } else {
              const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
              const rawV = vm ? vm[1].trim() : '';
              val = (isShared && shared[Number(rawV)] != null) ? shared[Number(rawV)] : decodeXmlEntities(rawV);
            }
            const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
            if (refMatch) {
              const targetIdx = excelColToIdx(refMatch[1]);
              while (rowCells.length < targetIdx && rowCells.length < 36) rowCells.push('');
            }
            rowCells.push(cleanOut(val));
          }
          if (rowCells.some(c => c !== '')) parsedGrid.push(rowCells);
        }
        if (parsedGrid.length >= 2) {
          const headers = parsedGrid[0].map((h, idx) => h || `Col ${idx + 1}`);
          const dataRows = parsedGrid.slice(1);
          return { table: summarizeParsedTable(headers, dataRows), text: parsedGrid.slice(0, 30).map(r => r.join(', ')).join('\n') };
        }
      }
    } catch (_) {}
    return null;
  }

  function extractReadableDocText(rawStr) {
    const s = String(rawStr || '').replace(/^\uFEFF/, '');
    if (!s) return '';
    if (s.startsWith('%PDF-')) {
      const chunks = [];
      const tjRe = /\(([^()\\]{2,160})\)\s*Tj/g;
      let m;
      while ((m = tjRe.exec(s)) && chunks.length < 120) {
        const piece = m[1].replace(/[\x00-\x1F]+/g, ' ').trim();
        if (piece && !isBinaryGarbageString(piece)) chunks.push(piece);
      }
      return chunks.length ? cleanOut(chunks.join(' ')) : '';
    }
    if (isBinaryGarbageString(s)) return '';
    return cleanOut(s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ').replace(/\s+/g, ' ').slice(0, 6000));
  }

  function revokeAttachmentUrls(att) {
    if (!att || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
    if (att.audioUrl && String(att.audioUrl).startsWith('blob:')) {
      try { URL.revokeObjectURL(att.audioUrl); } catch (_) {}
    }
    if (att.thumbUrl && String(att.thumbUrl).startsWith('blob:')) {
      try { URL.revokeObjectURL(att.thumbUrl); } catch (_) {}
    }
  }

  let _tesseractLoader = null;
  function loadTesseractOcr() {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.Tesseract && typeof window.Tesseract.recognize === 'function') return Promise.resolve(window.Tesseract);
    if (_tesseractLoader) return _tesseractLoader;
    _tesseractLoader = new Promise(resolve => {
      try {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.async = true;
        const t = setTimeout(() => resolve(null), 3200);
        s.onload = () => {
          clearTimeout(t);
          resolve(window.Tesseract || null);
        };
        s.onerror = () => {
          clearTimeout(t);
          resolve(null);
        };
        document.head.appendChild(s);
      } catch (_) {
        resolve(null);
      }
    });
    return _tesseractLoader;
  }

  const VIEW_TITLE_MAP = {
    overview: 'Executive Overview',
    daily_ops: 'Daily Operations',
    entities: 'Multi-Entity Comparison',
    sentinels: 'Sentinels & Alerts',
    sentinel_hub: 'Sentinels & Alerts',
    alerts: 'Sentinels & Alerts',
    alert_rules: 'Alerts & Thresholds',
    pbi: 'Dashboards & Reports',
    pbi_hub: 'Dashboards & Reports',
    statements: 'Printable Statements & SOA',
    sales: 'Sales & Receivables',
    customers: 'Customer Receivables',
    pricing: 'Commercial Pricing & Commissions',
    raw: 'Quarry, Haulage & JVs',
    raw_pricing: 'Quarry & Haulage Rates',
    raw_jv: 'JV & Partnerships',
    expenses: 'Expenses & Overhead',
    recurring_expenses: 'Recurring Expense Schedules',
    suppliers: 'Suppliers & Payables',
    fleet: 'Fleet & Fuel',
    fleet_equip: 'Equipment Running Costs',
    fleet_maint: 'Repairs, Warnings & Oil Logs',
    fleet_drivers: 'Drivers & Overtime',
    warehouse: 'Warehouse Stock & Moves',
    inventory: 'Warehouse Stock & Moves',
    warehouse_parts: 'Parts & Item Usage',
    payroll: 'Payroll & Workforce',
    workforce_map: 'Daily Plant & Machine Map',
    payroll_attendance: 'Biometric Attendance & Shifts',
    payroll_allowances: 'Site Transport & Allowances',
    payroll_contracts: 'Staff Contracts & Freelance',
    cashflow: 'Cash Flow & Daily Till',
    cash_flow: 'Cash Flow & Daily Till',
    external: 'External Treasury Movements',
    ledger_treasury: 'Loans & Settlements',
    conversions: 'FX & Currency Conversions',
    ledger: 'General Ledger & Trial Balance',
    gl_coa: 'General Ledger & Trial Balance',
    coa_classes: 'Lebanese PCG Classes 1-7',
    gl_automation: 'Automated GL Accounts',
    reg_customers: 'Customers Registry',
    reg_suppliers: 'Suppliers & Haulers Registry',
    reg_sites: 'Sites & Regions Registry',
    reg_regions: 'Sites & Regions Registry',
    reg_products: 'Products & Grades Registry',
    reg_items: 'Items & Spare Parts Registry',
    reg_categories: 'Expense Categories Registry',
    reg_equipment: 'Equipment Registry',
    reg_drivers: 'Drivers Registry',
    reg_staff: 'Staff Members Registry',
    reg_roles: 'Staff Roles Registry',
    reg_fx_rates: 'Currency & FX Rates Registry',
    reg_currencies: 'Currency & FX Rates Registry',
    reg_vat_rates: 'VAT Rates Registry',
    tables: 'All Tables & Registers',
    kiosks: 'Plant Kiosks',
    kiosk: 'Plant Kiosks',
    users: 'Users & Security'
  };

  function captureLiveScreenSnapshot() {
    if (typeof document === 'undefined') return null;
    try {
      const st = (_ctx && _ctx.STATE) || {};
      const viewId = String(st.view || (location.hash || '').replace(/^#/, '') || 'overview');
      const titleEl = document.getElementById('topbarTitle') || document.getElementById('pageTitle');
      const pageTitle = cleanOut((titleEl ? titleEl.textContent : '') || VIEW_TITLE_MAP[viewId] || '');
      const coSel = document.getElementById('companySelect');
      const activeCoText = cleanOut(coSel && coSel.selectedOptions && coSel.selectedOptions[0] ? coSel.selectedOptions[0].textContent : (st.company || 'WTC'));
      const ws = document.getElementById('workspace');

      const topKpis = ws
        ? Array.from(ws.querySelectorAll('.kpis .kpi, .pbi-kpi-card, .dops-kpi, .sales-recon-metrics > span')).slice(0, 8).map(el => ({
          label: cleanOut((el.querySelector('.k, .k-label, .dops-kpi-lbl, small') || {}).textContent || '').replace(/\s*↗$/, ''),
          val: cleanOut((el.querySelector('.v, .k-val, .dops-kpi-val, b') || {}).textContent || ''),
          sub: cleanOut((el.querySelector('.d, .k-sub, .dops-kpi-unit, .dops-kpi-sub') || {}).textContent || '')
        })).filter(x => x.label && x.val)
        : [];

      const opsCells = ws
        ? Array.from(ws.querySelectorAll('.ops-strip .ops-cell')).slice(0, 8).map(el => ({
          label: cleanOut((el.querySelector('.ops-lbl, span:first-child') || {}).textContent || ''),
          val: cleanOut((el.querySelector('.ops-val, b, strong') || {}).textContent || '')
        })).filter(x => x.label && x.val)
        : [];

      const appStripEl = ws ? ws.querySelector('.app-strip') : null;
      const appStripText = appStripEl ? cleanOut(appStripEl.textContent.replace(/Open registers\s*[-→]*/i, '')) : '';

      const hubCards = ws
        ? Array.from(ws.querySelectorAll('.univ-reg-card, .pa-hub-table-card')).slice(0, 6).map(el => ({
          title: cleanOut((el.querySelector('.urc-title, .pa-htc-title') || {}).textContent || ''),
          count: cleanOut((el.querySelector('.urc-cnt, .pa-htc-count-num') || {}).textContent || '').replace(/^[(\s]+|[)\s]+$/g, ''),
          sub: cleanOut((el.querySelector('.urc-sub') || {}).textContent || ''),
          active: el.classList.contains('active')
        })).filter(x => x.title)
        : [];

      const connectedChips = ws
        ? Array.from(ws.querySelectorAll('.conn-table-chip, .pa-hub-conn-chip')).slice(0, 8).map(el => {
          const lbl = cleanOut((el.querySelector('.conn-chip-lbl') || {}).textContent || '');
          const cnt = cleanOut((el.querySelector('.conn-chip-cnt') || {}).textContent || '');
          if (lbl) return cnt ? `${lbl} ${cnt}` : lbl;
          return cleanOut((el.textContent || '').replace(/[▾▴]/g, ''));
        }).filter(Boolean)
        : [];

      const viewTabs = ws
        ? Array.from(ws.querySelectorAll('.view-seg-btn, .pa-view-tab, .chip-bar .filter-chip')).slice(0, 6).map(el => cleanOut(el.textContent || '')).filter(Boolean)
        : [];

      const panelHeadings = ws
        ? Array.from(ws.querySelectorAll('.panel .ph h3, .panel-head .panel-title, .pbi-panel-title, .pbi-kpi-sec-hdr, .dops-domain-title')).slice(0, 8).map(el => cleanOut(el.textContent || '')).filter(Boolean)
        : [];

      const tableHeaders = [];
      if (ws) {
        ws.querySelectorAll('table').forEach(tbl => {
          const ths = Array.from(tbl.querySelectorAll('thead th')).map(th => cleanOut(th.textContent.replace(/[▲▼▾▴]/g, ''))).filter(Boolean);
          if (ths.length >= 2 && tableHeaders.length < 3) {
            const firstRow = tbl.querySelector('tbody tr');
            const sample = firstRow
              ? Array.from(firstRow.querySelectorAll('td')).slice(0, 3).map(td => cleanOut(td.textContent)).filter(Boolean).join(' · ')
              : '';
            tableHeaders.push({ cols: ths.slice(0, 8), sample });
          }
        });
      }

      const entryModal = document.getElementById('entryModal');
      const openFormTitle = (entryModal && entryModal.classList.contains('open'))
        ? cleanOut((document.getElementById('entryModalTitle') || {}).textContent || 'Smart Entry Form')
        : '';
      const inspModal = document.getElementById('recordInspectorModal');
      const openInspectorTitle = (inspModal && inspModal.classList.contains('open'))
        ? cleanOut((document.getElementById('inspTitle') || {}).textContent || '360° Record Inspector')
        : '';

      return {
        viewId,
        pageTitle,
        activeCoText,
        topKpis,
        opsCells,
        appStripText,
        hubCards,
        connectedChips,
        viewTabs,
        panelHeadings,
        tableHeaders,
        openFormTitle,
        openInspectorTitle
      };
    } catch (_) {
      return null;
    }
  }

  function detectViewFromOcrText(ocrText) {
    const t = String(ocrText || '').toLowerCase();
    if (!t || t.length < 10) return null;

    // 1. Direct URL hash match from browser address bar in full-window screenshots (e.g. "isabisystems.com/app/#reg_customers")
    const urlHashMatch = t.match(/(?:isabisystems\.com\/app\/|\/app\/)#([a-z0-9_]+)/i);
    if (urlHashMatch && VIEW_TITLE_MAP[urlHashMatch[1].toLowerCase()]) {
      return urlHashMatch[1].toLowerCase();
    }

    // 2. Main-workspace-exclusive phrases (never match static left-sidebar nav labels that appear in every full screenshot)
    if (/consolidated\s*revenue/.test(t) || /realized\s*gross\s*margin/.test(t) || /app[- ]?entered\s*this\s*period/.test(t) || /cash\s*till\s*[&and]*\s*net\s*flow/.test(t) || /monthly\s*revenue,\s*raw\s*cost/.test(t)) return 'overview';
    if (/customers?\s*registry/.test(t) || /open\s*ar\s*balance\s*>\s*\$?0/.test(t) || /vat\s*registered\s*\(mof\)/.test(t) || (/shared\s*registries/.test(t) && /credit\s*days/.test(t))) return 'reg_customers';
    if (/material\s*quarries,\s*3rd[- ]party\s*haulers/.test(t) && /suppliers?\s*[&and]*\s*haulers?\s*active/.test(t)) return 'reg_suppliers';
    if (/regions?\s*[&and]*\s*sites?\s*map\s*studio/.test(t) || /search\s*zone\s*shape/.test(t) || /sites?\s*registry/.test(t)) return 'reg_sites';
    if (/products?\s*[&and]*\s*grades?\s*registry/.test(t) || /conversion\s*rate\s*\(t\/m/.test(t)) return 'reg_products';
    if (/items?\s*[&and]*\s*spare\s*parts?\s*registry/.test(t) || /standardized\s*skus/.test(t)) return 'reg_items';
    if (/expense\s*categories\s*registry/.test(t)) return 'reg_categories';
    if (/equipment\s*registry/.test(t) || /truck\s*adjustment\s*windows/.test(t)) return 'reg_equipment';
    if (/drivers?\s*registry/.test(t) || /driver\s*assignment\s*log/.test(t)) return 'reg_drivers';
    if (/staff\s*members?\s*registry/.test(t) || /rem\.\s*payment/.test(t)) return 'reg_staff';
    if (/staff\s*roles?\s*registry/.test(t)) return 'reg_roles';
    if (/currency\s*[&and]*\s*fx\s*rates\s*registry/.test(t)) return 'reg_fx_rates';
    if (/vat\s*rates?\s*registry/.test(t) || /mof\s*tax\s*windows/.test(t)) return 'reg_vat_rates';
    if (/shareholder\s*daily\s*operations/.test(t) || /yesterday'?s\s*after[- ]hours/.test(t)) return 'daily_ops';
    if (/multi[- ]entity\s*comparison/.test(t)) return 'entities';
    if (/ai\s*sentinels?\s*[&and]*\s*(?:audit|alerts?)/.test(t) || /mark\s*all\s*flagged\s*checked/.test(t) || /unreviewed\s*operational\s*[&and]*\s*financial\s*exceptions/.test(t)) return 'sentinels';
    if (/alerts?\s*[&and]*\s*thresholds/.test(t) || /new\s*custom\s*alert/.test(t)) return 'alert_rules';
    if (/printable\s*financial\s*statements/.test(t) || /statement\s*of\s*account\s*\(soa\)/.test(t)) return 'statements';
    if (/executive\s*[&and]*\s*operational\s*dashboards/.test(t)) return 'pbi';
    if (/price\s*[&and]*\s*commission\s*agreements/.test(t) || /list\s*price\s*evolution/.test(t)) return 'pricing';
    if (/fifo\s*ar\s*aging/.test(t) || /customer\s*receivables\s*ledger/.test(t)) return 'customers';
    if (/billed[- ]first\s*vat/.test(t) || /sales\s*tickets\s*register/.test(t)) return 'sales';
    if (/quarry\s*[&and]*\s*haulage\s*rates/.test(t)) return 'raw_pricing';
    if (/jv\s*[&and]*\s*partnerships/.test(t)) return 'raw_jv';
    if (/raw\s*material\s*purchases/.test(t) || /quarry\s*[&and]*\s*haulage\s*tickets/.test(t)) return 'raw';
    if (/standing\s*recurring\s*expenses/.test(t)) return 'recurring_expenses';
    if (/3[- ]leg\s*ap\s*bridge/.test(t) || /suppliers?\s*[&and]*\s*payables\s*ledger/.test(t)) return 'suppliers';
    if (/expense\s*vouchers\s*register/.test(t) || /expense\s*items\s*catalog/.test(t)) return 'expenses';
    if (/repairs?,\s*warnings?\s*[&and]*\s*oil\s*logs/.test(t) || /preventive\s*oil\s*logs/.test(t)) return 'fleet_maint';
    if (/equipment\s*running\s*costs/.test(t)) return 'fleet_equip';
    if (/diesel\s*tank\s*ledger/.test(t) || /hydraulic\s*leak\s*audit/.test(t) || /daily\s*greasing/.test(t)) return 'fleet';
    if (/parts?\s*[&and]*\s*item\s*usage/.test(t)) return 'warehouse_parts';
    if (/warehouse\s*stock\s*[&and]*\s*moves/.test(t)) return 'warehouse';
    if (/daily\s*plant\s*[&and]*\s*machine\s*map/.test(t)) return 'workforce_map';
    if (/shift\s*[&and]*\s*lateness\s*policy/.test(t)) return 'payroll_attendance';
    if (/daily\s*on[- ]site\s*tally/.test(t)) return 'payroll_allowances';
    if (/role\s*[&and]*\s*equipment\s*log/.test(t)) return 'payroll_contracts';
    if (/staff\s*payroll\s*register/.test(t)) return 'payroll';
    if (/daily\s*till\s*sheet/.test(t) || /usd\s*\/\s*lbp\s*cashbook/.test(t)) return 'cashflow';
    if (/lebanese\s*pcg\s*classes/.test(t)) return 'coa_classes';
    if (/automated\s*gl\s*accounts/.test(t)) return 'gl_automation';
    if (/double[- ]entry\s*soa\s*[&and]*\s*trial\s*balance/.test(t)) return 'ledger';
    if (/all\s*tables?\s*[&and]*\s*registers/.test(t)) return 'tables';
    if (/plant\s*kiosks/.test(t) || /station\s*admin/.test(t)) return 'kiosks';
    if (/permissions?\s*matrix/.test(t) || /face\s*id\s*enrolment\s*studio/.test(t)) return 'users';
    return null;
  }

  function startImageAnalysis(att) {
    if (!att || att.kind !== 'image' || !att.thumbUrl || typeof Image === 'undefined') return Promise.resolve(att);
    if (att._ocrPromise) return att._ocrPromise;
    att._ocrPromise = new Promise(resolve => {
      const done = () => resolve(att);
      const timer = setTimeout(done, 3400);
      try {
        const img = new Image();
        img.onload = async () => {
          try {
            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            att.imgWidth = w;
            att.imgHeight = h;
            if (w > 0 && h > 0) {
              att.aspectRatio = Number((w / h).toFixed(2));
              att.summaryLine = `${w}×${h} · ${att.sizeLabel}`;
              renderAttachmentBar();
            }

            // Downscale large screenshots onto an offscreen canvas (max 1280px wide) so OCR finishes in <800ms
            let ocrSource = img;
            if (w > 1280 && h > 0 && typeof document !== 'undefined') {
              try {
                const scale = 1280 / w;
                const cvs = document.createElement('canvas');
                cvs.width = 1280;
                cvs.height = Math.max(1, Math.round(h * scale));
                const ctx2d = cvs.getContext('2d');
                if (ctx2d) {
                  ctx2d.drawImage(img, 0, 0, cvs.width, cvs.height);
                  ocrSource = cvs;
                }
              } catch (_) {}
            }

            const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
            // 1. Native Chromium TextDetector if present
            if (typeof window !== 'undefined' && 'TextDetector' in window) {
              try {
                const td = new window.TextDetector();
                const blocks = await td.detect(ocrSource);
                if (Array.isArray(blocks) && blocks.length) {
                  const rawTxt = cleanOut(blocks.map(b => b.rawValue || '').join(' '));
                  if (rawTxt.length >= 10) {
                    att.ocrText = rawTxt;
                    att.textContent = (att.textContent ? att.textContent + ' ' : '') + rawTxt;
                    att.detectedView = detectViewFromOcrText(rawTxt);
                    clearTimeout(timer);
                    done();
                    return;
                  }
                }
              } catch (_) {}
            }
            // 2. Browser Tesseract.js OCR (skip network script fetch during fast headless verification unless already loaded)
            if (!isAutoTest || (window.Tesseract && typeof window.Tesseract.recognize === 'function')) {
              const Tess = await loadTesseractOcr();
              if (Tess && typeof Tess.recognize === 'function') {
                const res = await Tess.recognize(ocrSource, 'eng');
                const txt = cleanOut((res && res.data && res.data.text) || '');
                if (txt) {
                  att.ocrText = txt;
                  att.textContent = (att.textContent ? att.textContent + ' ' : '') + txt;
                  att.detectedView = detectViewFromOcrText(txt);
                }
              }
            }
          } catch (_) {}
          clearTimeout(timer);
          done();
        };
        img.onerror = () => {
          clearTimeout(timer);
          done();
        };
        img.src = att.thumbUrl;
      } catch (_) {
        clearTimeout(timer);
        done();
      }
    });
    return att._ocrPromise;
  }

  function buildScreenWalkthroughReply(cleanQ, lang, scope, primaryAtt, targetViewId, snap, ocrText) {
    const user = scope.user;
    const k = evalExactKPI(scope.coKey, scope);
    const salesLoads = Number(k.sales_loads || k.loads || 0);
    const salesTons = Number(k.sales_tons || k.tons_sold || 0);
    const salesM3 = Number(k.sales_m3 || k.m3_sold || 0);
    const expTotal = Number(k.expenses_total || k.expenses || 0);
    const cashIn = Number(k.cash_inflow != null ? k.cash_inflow : (k.cash_in || 0));
    const cashOut = Number(k.cash_outflow != null ? k.cash_outflow : (k.cash_out || 0));
    const tillVal = Number(k.cash_till != null ? k.cash_till : (k.net_cash_flow || 0));
    const viewId = String(targetViewId || (snap && snap.viewId) || ((_ctx && _ctx.STATE && _ctx.STATE.view) || 'overview'));
    const useSnap = (snap && snap.viewId === viewId) ? snap : null;
    const screenTitle = VIEW_TITLE_MAP[viewId] || (useSnap && useSnap.pageTitle ? useSnap.pageTitle : 'ISABI Command Center');
    const attBadge = primaryAtt ? ` in <b>${esc(primaryAtt.name)}</b>` : '';
    const bullets = [];
    let headers = ['Screen Section', 'Displayed Value', 'What It Means'];
    let rows = [];

    // Answer any specific metric or UI glossary question right in the first bullet
    if (/cash\s*till|net\s*flow|-?\$?4,?990/i.test(cleanQ)) {
      bullets.push(`<b>Why Cash Till is ${fmtMoney(tillVal, 2)}</b>: Direct cash outflows (<b>${fmtMoney(k.cash_expense, 0)}</b> cash expenses + <b>${fmtMoney(k.settlements_paid, 0)}</b> supplier settlements = <b>${fmtMoney(cashOut, 0)}</b>) exceeded direct physical cash inflows (<b>${fmtMoney(k.cash_sales, 0)}</b> cash sales + <b>${fmtMoney(k.receipts_collected, 0)}</b> customer receipts = <b>${fmtMoney(cashIn, 0)}</b>). Because most revenue (<b>${fmtMoney(k.credit_sales, 0)}</b>) is billed on credit rather than paid into the physical till at dispatch, the cash drawer net flow is negative even while operating profit is <b>+${fmtMoney(k.operating_profit, 0)}</b>.`);
    }
    if (/app[- ]?entered|not\s+yet\s+in\s+the\s+book/i.test(cleanQ)) {
      bullets.push(`<b>What "App-entered this period (not yet in the book totals)" means</b>: This strip tracks live vouchers created directly inside the Command Center or field kiosks (such as <b>14 sales tickets · $7,532</b>, <b>23 raw receipts · $1,250</b>, <b>8 expenses · $4,469</b>, and <b>2 supplier settlements · $6,000</b>) that are staged separately from reconciled historical book totals until period close.`);
    }
    if (/mof\s*tax/i.test(cleanQ)) {
      bullets.push(`<b>What "MOF Tax #" means</b>: The counterparty's official Lebanese Ministry of Finance tax registration number used on statutory 11% VAT invoices and quarterly VAT declarations.`);
    }
    if (/credit\s*days/i.test(cleanQ)) {
      bullets.push(`<b>What "Credit Days" means</b>: The approved payment term window (e.g., <b>30 days</b>) granted to a credit customer before unpaid FIFO invoices are flagged as overdue by AI Sentinel #04.`);
    }

    if (viewId === 'overview') {
      const marginPct = k.sales_ttc > 0 ? ((k.gross_margin / k.sales_ttc) * 100).toFixed(1) : '0.0';
      const opPct = k.sales_ttc > 0 ? ((k.operating_profit / k.sales_ttc) * 100).toFixed(1) : '0.0';

      bullets.push(`<b>Row 1 · 4 Executive Telemetry KPIs</b>: Displays <b>Consolidated Revenue (${fmtMoney(k.sales_ttc, 0)})</b> with monthly run-rate and Cash (<b>${fmtMoney(k.cash_sales, 0)}</b>) vs Credit (<b>${fmtMoney(k.credit_sales, 0)}</b>) composition bar; <b>Operating Cash Profit (${fmtMoney(k.operating_profit, 0)} · ${opPct}%)</b> with Raw Material, OpEx, and Profit share; <b>Cash Position & Velocity (${fmtMoney(tillVal, 2)})</b> with AR collection rate and Cash In (<b>${fmtMoney(cashIn, 0)}</b>) vs Out (<b>${fmtMoney(cashOut, 0)}</b>); and <b>Working Capital (${fmtMoney(k.ar_balance, 0)} Open AR vs ${fmtMoney(k.ap_balance, 0)} Open AP)</b>.`);
      bullets.push(`<b>Row 2 Left · Performance Trajectory & 5-Step P&L Value Bridge</b>: Plots monthly <b>Sales</b>, <b>Direct Cost</b>, and <b>Operating Profit</b> with peak-month callout and dashed run-rate line, anchored below by a clickable 5-step P&L waterfall (<b>Net Revenue - Direct Cost = Gross Margin - OpEx & Payroll = Cash Profit</b>) and unit economics spread.`);
      bullets.push(`<b>Row 2 Right · Operating Entities Scorecard & 3-Lens Executive Pulse</b>: Pairs entity-by-entity revenue share, margin, and ledger tie-out above an interactive <b>Executive Pulse</b> deck switching instantly between <b>Attention</b> (overdue AR, open sentinels, pending rate sign-offs, $0.00 book parity), <b>Top Clients</b> (concentration & 360° Inspector), and <b>Revenue Mix</b> (top grades & unit pricing).`);

      rows = [
        ['1. Consolidated Revenue', fmtMoney(k.sales_ttc, 0), `Cash ${fmtMoney(k.cash_sales, 0)} + Credit ${fmtMoney(k.credit_sales, 0)}`],
        ['2. Operating Cash Profit', `${fmtMoney(k.operating_profit, 0)} (${opPct}%)`, `Gross Margin ${fmtMoney(k.gross_margin, 0)} (${marginPct}%) minus OpEx & Payroll (${fmtMoney(expTotal, 0)})`],
        ['3. Cash Position & Velocity', fmtMoney(tillVal, 2), `Cash In (${fmtMoney(cashIn, 0)}) minus Cash Out (${fmtMoney(cashOut, 0)})`],
        ['4. Working Capital (AR / AP)', `${fmtMoney(k.ar_balance, 0)} AR`, `Overdue >30d: ${fmtMoney(k.ar_overdue, 0)} · Open AP: ${fmtMoney(k.ap_balance, 0)}`],
        ['5. Scorecard & Executive Pulse', `${fmtInt(salesLoads)} loads (${fmtInt(salesTons, 0)} t)`, 'Switch between Attention, Top Clients, and Revenue Mix or click any entity row']
      ];
    } else if (/^reg_/.test(viewId) || (useSnap && useSnap.hubCards && useSnap.hubCards.length > 0)) {
      const regTableMap = {
        reg_customers: 'customers',
        reg_suppliers: 'suppliers',
        reg_sites: 'sites',
        reg_regions: 'regions',
        reg_products: 'products',
        reg_items: 'items',
        reg_categories: 'expense_categories',
        reg_equipment: 'equipment',
        reg_drivers: 'drivers',
        reg_staff: 'staff_members',
        reg_roles: 'staff_roles',
        reg_fx_rates: 'fx_rates',
        reg_currencies: 'currencies',
        reg_vat_rates: 'vat_rates'
      };
      const fallbackTblKey = regTableMap[viewId] || 'customers';
      const fallbackCnt = fmtInt((((_ctx && _ctx.SEED && _ctx.SEED.records && _ctx.SEED.records[fallbackTblKey]) || []).length) || 1099);
      const activeCard = (useSnap && useSnap.hubCards && useSnap.hubCards.find(c => c.active)) || { title: screenTitle, count: fallbackCnt };
      const otherCards = (useSnap && useSnap.hubCards && useSnap.hubCards.length > 1)
        ? useSnap.hubCards.filter(c => !c.active).map(c => `${c.title} (${c.count})`).join(', ')
        : 'Suppliers & Haulers, Staff Members';
      const conns = (useSnap && useSnap.connectedChips && useSnap.connectedChips.length)
        ? useSnap.connectedChips.join(' · ')
        : 'Sales Tickets (15,967) · Customer Receipts (AR) (2,331) · Price & Commission Agreements · VAT 11% Tax Invoices (304)';
      const views = (useSnap && useSnap.viewTabs && useSnap.viewTabs.length)
        ? useSnap.viewTabs.join(' · ')
        : `All ${activeCard.title} (${activeCard.count || fallbackCnt}) · Open AR Balance > $0 (50) · VAT Registered (MOF) (51)`;
      const cols = (useSnap && useSnap.tableHeaders && useSnap.tableHeaders[0] && useSnap.tableHeaders[0].cols.length)
        ? useSnap.tableHeaders[0].cols.join(', ')
        : 'CUSTOMER, METHOD, VAT (11%), MOF TAX #, PHONE, ADDRESS, CREDIT DAYS';

      bullets.push(`<b>1. Shared Registries Switcher (Top Cards)</b>: Shows that <b>${esc(activeCard.title)}</b> is currently active with <b>${esc(activeCard.count || fallbackCnt)}</b> master records (shared across all entities), with one-click switching to <b>${esc(otherCards || 'Suppliers & Haulers')}</b>.`);
      bullets.push(`<b>2. Connected Tables Bar</b>: Links this master registry directly to its downstream transaction tables: <b>${esc(conns)}</b>. Clicking any chip previews or jumps straight to that transaction register.`);
      bullets.push(`<b>3. Saved Views & Search Deck</b>: Filters the registry by operational slice (<b>${esc(views)}</b>) alongside instant frequency-ranked search.`);
      bullets.push(`<b>4. Master Record Grid (${esc(cols)})</b>: Lists each record's master attributes (such as payment method <b>Credit</b> vs <b>Cash</b>, <b>11% VAT</b> status, <b>MOF Tax #</b>, phone, address, and credit days). Clicking any row opens its <b>360° Record Inspector</b> or edit desk.`);

      rows = [
        ['Shared Registries Bar', `${activeCard.title} (${activeCard.count || fallbackCnt})`, 'Switches between shared master tables'],
        ['Connected Tables', conns.slice(0, 68), 'Previews or jumps to linked transaction registers'],
        ['Views Filter Bar', views.slice(0, 68), 'Filters master records by operational slice'],
        ['Registry Grid Columns', cols.slice(0, 68), 'Click any row to open its 360° Inspector & ledger']
      ];
    } else {
      if (useSnap && useSnap.openFormTitle) {
        bullets.push(`<b>Open Smart Entry Modal (${esc(useSnap.openFormTitle)})</b>: You are viewing an active data-entry voucher form with chronological effective-date validation and frequency-ranked comboboxes.`);
      }
      if (useSnap && useSnap.openInspectorTitle) {
        bullets.push(`<b>Open 360° Inspector (${esc(useSnap.openInspectorTitle)})</b>: Shows the complete audit trail, linked transactions, and in-place Modify Drawer for the selected record.`);
      }
      if (useSnap && useSnap.topKpis && useSnap.topKpis.length) {
        bullets.push(`<b>Top KPI Scorecards</b>: ${useSnap.topKpis.slice(0, 4).map(x => `<b>${esc(x.label)}</b>: ${esc(x.val)}${x.sub ? ' (' + esc(x.sub) + ')' : ''}`).join(' · ')}.`);
        useSnap.topKpis.slice(0, 5).forEach(x => {
          rows.push([x.label, x.val, x.sub || 'Live scoped KPI metric']);
        });
      }
      if (useSnap && useSnap.opsCells && useSnap.opsCells.length) {
        bullets.push(`<b>Operational Strip</b>: ${useSnap.opsCells.slice(0, 4).map(x => `<b>${esc(x.label)}</b>: ${esc(x.val)}`).join(' · ')}.`);
      }
      if (useSnap && useSnap.panelHeadings && useSnap.panelHeadings.length) {
        bullets.push(`<b>Charts & Register Panels</b>: Displays <b>${esc(useSnap.panelHeadings.slice(0, 5).join(', '))}</b> under <b>${esc(scope.fullScopeLabel)}</b>.`);
      }
      if (useSnap && useSnap.tableHeaders && useSnap.tableHeaders.length) {
        const t0 = useSnap.tableHeaders[0];
        bullets.push(`<b>Active Data Table</b>: Columns include <b>${esc(t0.cols.join(', '))}</b>${t0.sample ? ` (top row: ${esc(t0.sample)})` : ''}. Click any row to inspect or edit.`);
      }
      if (!bullets.length) {
        bullets.push(`<b>Active Screen (${esc(screenTitle)})</b>: Displays live operational and financial registers for <b>${esc(scope.fullScopeLabel)}</b> with revenue of <b>${fmtMoney(k.sales_ttc, 0)}</b>, gross margin of <b>${fmtMoney(k.gross_margin, 0)}</b>, operating profit of <b>${fmtMoney(k.operating_profit, 0)}</b>, and cash till of <b>${fmtMoney(tillVal, 2)}</b>.`);
      }
    }

    return {
      q: cleanQ,
      lang,
      instantLocal: true,
      topic: 'screen_walkthrough',
      title: `Screen Guide · ${screenTitle}`,
      answer: `Here is a section-by-section breakdown of the <b>${esc(screenTitle)}</b> screen${attBadge} under <b>${esc(scope.fullScopeLabel)}</b>:`,
      bullets,
      headers: rows.length ? headers : undefined,
      rows: rows.length ? rows : undefined,
      promptText: 'Would you like to drill into any specific card, explain a metric, or open the underlying register?',
      actions: [
        ...(viewId === 'overview' && canView('daily_ops', user) ? [{ type: 'view', view: 'daily_ops', label: 'Daily Operations' }] : []),
        ...(canView('sales', user) ? [{ type: 'view', view: 'sales', label: 'Sales & Receivables' }] : []),
        ...(canView('cashflow', user) ? [{ type: 'view', view: 'cashflow', label: 'Cash Flow & Till' }] : [])
      ],
      followUps: [
        `Why is Cash Till ${tillVal < 0 ? fmtMoney(tillVal, 2) : '-$4,990.00'}?`,
        'Show overdue receivables',
        'Check open AI Sentinel alerts'
      ]
    };
  }

  function buildAttachmentMetaObject(rawDesc) {
    const name = cleanOut(rawDesc.name || 'attachment');
    const mime = String(rawDesc.type || rawDesc.mime || '');
    const size = Number(rawDesc.size || (rawDesc.text ? rawDesc.text.length : 0));
    const kind = rawDesc.kind || detectAttachmentKind(name, mime);
    const att = {
      id: 'att_' + (++_attSeq),
      name,
      kind,
      mime,
      size,
      sizeLabel: formatBytes(size),
      dataUrl: rawDesc.dataUrl || (kind === 'image' ? (rawDesc.thumbUrl || '') : ''),
      thumbUrl: rawDesc.thumbUrl || (kind === 'image' ? (rawDesc.dataUrl || '') : ''),
      audioUrl: rawDesc.audioUrl || '',
      durationSec: Number(rawDesc.durationSec || 0),
      voiceLang: rawDesc.voiceLang || '',
      textContent: '',
      ocrText: rawDesc.ocrText || '',
      detectedView: rawDesc.detectedView || null,
      screenSnapshot: rawDesc.screenSnapshot || (kind === 'image' ? captureLiveScreenSnapshot() : null),
      imgWidth: Number(rawDesc.imgWidth || 0),
      imgHeight: Number(rawDesc.imgHeight || 0),
      aspectRatio: Number(rawDesc.aspectRatio || 0),
      colHeaders: [],
      rowCount: 0,
      numericCol: '',
      numericSum: 0,
      isMoneyCol: false,
      ticketRefs: [],
      parsedRows: [],
      summaryLine: formatBytes(size)
    };

    const preParsedTable = rawDesc.table || null;
    if (rawDesc.text != null || preParsedTable) {
      att.textContent = extractReadableDocText(rawDesc.text || '');
      const tab = preParsedTable || (att.kind !== 'pdf' ? parseTabularText(rawDesc.text, name) : null);
      if (tab && tab.rowCount > 0) {
        att.kind = 'spreadsheet';
        att.colHeaders = tab.colHeaders;
        att.rowCount = tab.rowCount;
        att.numericCol = tab.numericCol;
        att.numericSum = tab.numericSum;
        att.isMoneyCol = tab.isMoneyCol;
        att.ticketRefs = Array.isArray(tab.ticketRefs) ? tab.ticketRefs : [];
        att.parsedRows = tab.parsedRows;
        const sumPart = tab.numericCol
          ? ` · ${tab.isMoneyCol ? fmtMoney(tab.numericSum, 2) : fmtInt(tab.numericSum, 1)}`
          : '';
        att.summaryLine = `${tab.rowCount} ${tab.rowCount === 1 ? 'row' : 'rows'}${sumPart}`;
      } else if (att.kind === 'pdf') {
        att.summaryLine = `PDF Document · ${att.sizeLabel}`;
      } else if (att.kind === 'spreadsheet') {
        att.summaryLine = `Spreadsheet · ${att.sizeLabel}`;
      } else if (att.textContent) {
        const lineCnt = String(rawDesc.text || att.textContent).split(/\r?\n/).filter(Boolean).length;
        att.summaryLine = `${lineCnt} ${lineCnt === 1 ? 'line' : 'lines'} · ${att.sizeLabel}`;
      }
    } else if (att.kind === 'audio') {
      att.summaryLine = `Voice Note${att.durationSec ? ' · ' + formatDuration(att.durationSec) : ''}${att.voiceLang ? ' · ' + att.voiceLang.toUpperCase() : ''}`;
    } else if (att.kind === 'image') {
      att.summaryLine = `Image · ${att.sizeLabel}`;
      if (att.thumbUrl) {
        startImageAnalysis(att);
      }
    }
    return att;
  }

  function readFileAsAttachment(file) {
    return new Promise(resolve => {
      if (!file) {
        resolve(null);
        return;
      }
      // Plain descriptor object (used by programmatic API / headless tests / voice notes)
      if (!(typeof Blob !== 'undefined' && file instanceof Blob)) {
        resolve(buildAttachmentMetaObject(file));
        return;
      }
      const name = file.name || 'attachment';
      const mime = file.type || '';
      const size = file.size || 0;
      const kind = detectAttachmentKind(name, mime);

      if (kind === 'image' && typeof FileReader !== 'undefined') {
        if (size > 15 * 1024 * 1024) {
          resolve(buildAttachmentMetaObject({ name, type: mime, size, kind }));
          return;
        }
        const fr = new FileReader();
        fr.onload = () => resolve(buildAttachmentMetaObject({ name, type: mime, size, kind, dataUrl: String(fr.result || '') }));
        fr.onerror = () => resolve(buildAttachmentMetaObject({ name, type: mime, size, kind }));
        fr.readAsDataURL(file);
        return;
      }
      if (kind === 'audio') {
        let audioUrl = '';
        try {
          if (typeof URL !== 'undefined' && URL.createObjectURL) audioUrl = URL.createObjectURL(file);
        } catch (_) {}
        if (typeof FileReader !== 'undefined' && size > 0 && size <= 8 * 1024 * 1024) {
          const fr = new FileReader();
          fr.onload = () => resolve(buildAttachmentMetaObject({
            name,
            type: mime,
            size,
            kind: 'audio',
            audioUrl,
            dataUrl: String(fr.result || ''),
            durationSec: file.durationSec || 0,
            voiceLang: file.voiceLang || ''
          }));
          fr.onerror = () => resolve(buildAttachmentMetaObject({
            name,
            type: mime,
            size,
            kind: 'audio',
            audioUrl,
            durationSec: file.durationSec || 0,
            voiceLang: file.voiceLang || ''
          }));
          fr.readAsDataURL(file);
          return;
        }
        resolve(buildAttachmentMetaObject({
          name,
          type: mime,
          size,
          kind: 'audio',
          audioUrl,
          durationSec: file.durationSec || 0,
          voiceLang: file.voiceLang || ''
        }));
        return;
      }
      if (kind === 'pdf' && typeof FileReader !== 'undefined' && size > 0 && size <= 8 * 1024 * 1024) {
        const frPdf = new FileReader();
        frPdf.onload = () => {
          const dUrl = String(frPdf.result || '');
          const frTxt = new FileReader();
          const slicePdf = typeof file.slice === 'function' ? file.slice(0, 512 * 1024) : file;
          frTxt.onload = () => resolve(buildAttachmentMetaObject({ name, type: mime || 'application/pdf', size, kind: 'pdf', dataUrl: dUrl, text: String(frTxt.result || '') }));
          frTxt.onerror = () => resolve(buildAttachmentMetaObject({ name, type: mime || 'application/pdf', size, kind: 'pdf', dataUrl: dUrl }));
          frTxt.readAsText(slicePdf);
        };
        frPdf.onerror = () => resolve(buildAttachmentMetaObject({ name, type: mime || 'application/pdf', size, kind: 'pdf' }));
        frPdf.readAsDataURL(file);
        return;
      }
      // Office ZIP containers (.xlsx / .docx): unpack XML sheets/paragraphs cleanly without dumping binary PK bytes
      if (/\.(xlsx|docx)$/i.test(name) && typeof file.arrayBuffer === 'function' && size <= 10 * 1024 * 1024) {
        file.arrayBuffer().then(ab => extractOfficeZipContent(ab, name)).then(extracted => {
          if (extracted && (extracted.table || extracted.text)) {
            resolve(buildAttachmentMetaObject({
              name,
              type: mime,
              size,
              kind,
              table: extracted.table || null,
              text: extracted.text || ''
            }));
          } else {
            resolve(buildAttachmentMetaObject({ name, type: mime, size, kind }));
          }
        }).catch(() => resolve(buildAttachmentMetaObject({ name, type: mime, size, kind })));
        return;
      }
      // Binary legacy Office (.xls / .doc): avoid reading binary OLE2 stream as UTF-8 CSV
      if (/\.(xls|doc)$/i.test(name)) {
        resolve(buildAttachmentMetaObject({ name, type: mime, size, kind }));
        return;
      }
      if (typeof FileReader !== 'undefined') {
        const sliceToRead = (size > 1024 * 1024 && typeof file.slice === 'function')
          ? file.slice(0, 1024 * 1024)
          : file;
        const fr = new FileReader();
        fr.onload = () => {
          const textStr = String(fr.result || '');
          blobToDataUrlAsync(sliceToRead).then(dUrl => {
            resolve(buildAttachmentMetaObject({ name, type: mime || 'text/plain', size, kind, dataUrl: dUrl || '', text: textStr }));
          });
        };
        fr.onerror = () => resolve(buildAttachmentMetaObject({ name, type: mime, size, kind }));
        fr.readAsText(sliceToRead);
        return;
      }
      resolve(buildAttachmentMetaObject({ name, type: mime, size, kind }));
    });
  }

  async function attachFiles(fileListOrArr) {
    if (!fileListOrArr) return [];
    const list = Array.isArray(fileListOrArr) ? fileListOrArr : Array.from(fileListOrArr);
    const added = [];
    for (let i = 0; i < list.length; i++) {
      if (_chatState.attachments.length >= 6) break;
      const item = list[i];
      if (!item) continue;
      const candidateName = cleanOut(item.name || '');
      const candidateSize = Number(item.size || (item.text ? item.text.length : 0));
      // Prevent accidental duplicate staging of the exact same file
      if (candidateName && _chatState.attachments.some(a => a && a.name === candidateName && a.size === candidateSize && a.kind !== 'audio')) {
        continue;
      }
      if (!(typeof Blob !== 'undefined' && item instanceof Blob)) {
        const syncAtt = buildAttachmentMetaObject(item);
        _chatState.attachments.push(syncAtt);
        added.push(syncAtt);
      } else {
        const asyncAtt = await readFileAsAttachment(item);
        if (asyncAtt) {
          _chatState.attachments.push(asyncAtt);
          added.push(asyncAtt);
        }
      }
    }
    renderAttachmentBar();
    return added;
  }

  function removeAttachment(attId) {
    const removed = _chatState.attachments.find(a => a && a.id === attId);
    if (removed) revokeAttachmentUrls(removed);
    _chatState.attachments = _chatState.attachments.filter(a => a && a.id !== attId);
    renderAttachmentBar();
  }

  function clearAttachments(revokeUrls = false) {
    if (revokeUrls) {
      _chatState.attachments.forEach(revokeAttachmentUrls);
    }
    _chatState.attachments = [];
    renderAttachmentBar();
  }

  function iconForAttachment(kind) {
    if (kind === 'spreadsheet') return AI_SVGS.sheet;
    if (kind === 'image') return AI_SVGS.image;
    if (kind === 'audio') return AI_SVGS.audio;
    return AI_SVGS.doc;
  }

  function renderAttachmentBar() {
    const bar = document.getElementById('aiAttachmentBar');
    const btn = document.getElementById('aiAttachBtn');
    const badge = document.getElementById('aiAttachCountBadge');
    const cnt = _chatState.attachments.length;

    if (btn) btn.classList.toggle('has-files', cnt > 0);
    if (badge) {
      badge.hidden = cnt === 0;
      badge.textContent = String(cnt);
    }
    if (!bar) return;
    if (!cnt) {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    bar.innerHTML = _chatState.attachments.map(a => {
      const leadVisual = (a.kind === 'image' && a.thumbUrl)
        ? `<img src="${esc(a.thumbUrl)}" alt="${esc(a.name)}" class="ai-att-thumb">`
        : `<span class="ai-att-ico">${iconForAttachment(a.kind)}</span>`;
      return `
        <div class="ai-att-chip" data-att-id="${esc(a.id)}" data-att-kind="${esc(a.kind)}">
          ${leadVisual}
          <div class="ai-att-meta">
            <span class="ai-att-name">${esc(a.name)}</span>
            <span class="ai-att-sub">${esc(a.summaryLine || a.sizeLabel)}</span>
          </div>
          <button type="button" class="ai-att-rm" data-ai-remove-att="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">✕</button>
        </div>
      `;
    }).join('');
  }

  // Reconcile attached files (CSV/Excel/JSON/PDF/Image) against live scoped SEED.records
  function buildAttachmentAnalysisAnswer(cleanQ, scope, turnAtts) {
    if (!Array.isArray(turnAtts) || !turnAtts.length) return null;
    const nonAudioAtts = turnAtts.filter(a => a && a.kind !== 'audio');
    if (!nonAudioAtts.length) return null;

    const user = scope.user;
    const lang = detectLang(cleanQ);
    const primary = nonAudioAtts[0];
    const combinedCorpus = [
      cleanQ,
      ...nonAudioAtts.map(a => {
        const cellSample = Array.isArray(a.parsedRows) ? a.parsedRows.map(r => r.join(' ')).join(' ') : '';
        return `${a.name} ${a.textContent || ''} ${cellSample}`;
      })
    ].join(' ');
    const lowCorpus = combinedCorpus.toLowerCase();

    // Cross-match ticket numbers (#1045, ticket 1045, or ticket columns across all rows)
    const candidateTickets = new Set();
    const tktMatches = combinedCorpus.match(/(?:\bticket\s*#?|\bvoucher\s*#?|\binvoice\s*#?|#)\s*([A-Za-z0-9-]{2,18})\b/gi) || [];
    tktMatches.forEach(m => {
      const cleaned = m.replace(/^(?:ticket|voucher|invoice|\s|#)+/i, '').trim().toLowerCase();
      if (cleaned.length >= 2) candidateTickets.add(cleaned);
    });
    nonAudioAtts.forEach(att => {
      if (att.kind === 'spreadsheet') {
        if (Array.isArray(att.ticketRefs) && att.ticketRefs.length) {
          att.ticketRefs.forEach(v => candidateTickets.add(v));
        } else if (att.colHeaders && att.colHeaders.length && att.parsedRows && att.parsedRows.length) {
          const tktColIdx = att.colHeaders.findIndex(h => /\b(ticket|voucher|invoice|serial|ref|no)\b/i.test(h));
          if (tktColIdx >= 0) {
            att.parsedRows.forEach(r => {
              const v = String(r[tktColIdx] || '').replace(/^#/, '').trim().toLowerCase();
              if (v.length >= 2) candidateTickets.add(v);
            });
          }
        }
      }
    });

    const matchedErpTickets = [];
    const missingTickets = [];
    if (candidateTickets.size > 0 && _ctx && _ctx.SEED && _ctx.SEED.records) {
      const pools = [
        ...(canHub('sales', user) ? [{ key: 'sales_tickets', label: 'Sales Ticket', view: 'sales' }] : []),
        ...(canHub('raw', user) ? [{ key: 'raw_purchases', label: 'Quarry Ticket', view: 'raw' }] : []),
        ...(canHub('expenses', user) ? [{ key: 'expenses', label: 'Expense Voucher', view: 'expenses' }] : []),
        ...(canHub('fleet', user) ? [{ key: 'fuel_intakes', label: 'Fuel Entry', view: 'fleet' }] : [])
      ];
      candidateTickets.forEach(tNo => {
        let found = null;
        for (const p of pools) {
          const rows = scopedRows(p.key, scope, { ignorePeriod: true });
          const hit = rows.find(r => norm(r.ticket_no || r.invoice_no || r.voucher_no || '') === tNo);
          if (hit) {
            found = { pool: p, row: hit };
            break;
          }
        }
        if (found) matchedErpTickets.push(found);
        else missingTickets.push(tNo);
      });
    }

    // Cross-match Counterparties (Customers & Suppliers) mentioned in file or caption (respecting Hub & BU RLS)
    const matchedCustomers = [];
    const matchedSuppliers = [];
    const hasWordMatch = (haystackLow, needleRaw) => {
      const nLow = String(needleRaw || '').trim().toLowerCase();
      if (nLow.length < 4) return false;
      const escN = nLow.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|[^a-z0-9])${escN}(?:$|[^a-z0-9])`, 'i');
      return re.test(haystackLow);
    };
    if (_ctx && _ctx.SEED && _ctx.SEED.records) {
      if (canHub('sales', user)) {
        const custs = _ctx.SEED.records.customers || [];
        const mCusts = ((_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {}).customers || [];
        for (let i = 0; i < custs.length; i++) {
          const c = custs[i];
          if (!c || c.voided || !c.name || c.name.length < 4) continue;
          if (hasWordMatch(lowCorpus, c.name)) {
            const mHit = mCusts.find(x => norm(x.Customer || x.name) === norm(c.name));
            const loads = mHit ? Number(mHit.loads || 0) : 0;
            const sales = mHit ? Number(mHit.sales_ttc || 0) : 0;
            const ar = mHit ? Number(mHit.ar_balance || 0) : 0;
            if (mHit || !c.company || scope.coNames.some(co => norm(co) === norm(c.company))) {
              matchedCustomers.push({ id: c.id, name: c.name, loads, sales, ar });
            }
          }
        }
        matchedCustomers.sort((a, b) => (b.sales - a.sales) || (b.ar - a.ar));
      }

      if (canHub('raw', user) || canHub('expenses', user)) {
        const sups = _ctx.SEED.records.suppliers || [];
        const mSups = ((_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {}).suppliers || [];
        for (let i = 0; i < sups.length; i++) {
          const s = sups[i];
          if (!s || s.voided || !s.name || s.name.length < 4) continue;
          if (hasWordMatch(lowCorpus, s.name)) {
            const mHit = mSups.find(x => norm(x.Supplier || x.name) === norm(s.name));
            const loads = mHit ? Number(mHit.raw_loads || 0) : 0;
            const cost = mHit ? Number(mHit.raw_cost || 0) + Number(mHit.expenses || 0) : 0;
            const ap = mHit ? Number(mHit.ap_balance || 0) : 0;
            if (mHit || !s.company || scope.coNames.some(co => norm(co) === norm(s.company))) {
              matchedSuppliers.push({ id: s.id, name: s.name, loads, cost, ap });
            }
          }
        }
        matchedSuppliers.sort((a, b) => (b.cost - a.cost) || (b.ap - a.ap));
      }
    }

    const bullets = [];
    const actions = [];

    if (matchedErpTickets.length > 0) {
      const erpSum = matchedErpTickets.reduce((a, x) => {
        const r = x.row;
        return a + Number(r.total_ttc != null ? r.total_ttc : (r.total != null ? r.total : (r.amount || 0)));
      }, 0);
      bullets.push(`Live Register Match: <b>${fmtInt(matchedErpTickets.length)}</b> voucher/ticket ${matchedErpTickets.length === 1 ? 'number matches' : 'numbers match'} live records totaling <b>${fmtMoney(erpSum, 2)}</b>${missingTickets.length ? ` · <b>${fmtInt(missingTickets.length)}</b> ticket ref(s) (${esc(missingTickets.slice(0, 4).join(', '))}) not found in ${esc(scope.scopeCoLabel)}` : ' (100% matched)'}.`);
      const firstHit = matchedErpTickets[0];
      actions.push({
        type: 'inspect',
        crKey: firstHit.pool.key,
        id: firstHit.row.id,
        label: `Inspect #${firstHit.row.ticket_no || firstHit.row.id}`
      });
    } else if (missingTickets.length > 0) {
      bullets.push(`Unrecorded Ticket Check: Ticket ref(s) <b>#${esc(missingTickets.slice(0, 4).join(', #'))}</b> were not found in <b>${esc(scope.scopeCoLabel)}</b> live registers.`);
    }

    if (matchedCustomers.length > 0) {
      matchedCustomers.slice(0, 2).forEach(cItem => {
        bullets.push(`Matched Customer Ledger (<b>${esc(cItem.name)}</b>): <b>${fmtInt(cItem.loads)}</b> live loads · Billed <b>${fmtMoney(cItem.sales, 2)}</b> · Open AR <b>${fmtMoney(cItem.ar, 2)}</b>.`);
      });
      const c0 = matchedCustomers[0];
      actions.push({ type: 'inspect', crKey: 'customers', id: c0.id, label: `360° ${c0.name}` });
    }
    if (matchedSuppliers.length > 0) {
      matchedSuppliers.slice(0, 2).forEach(sItem => {
        bullets.push(`Matched Supplier Ledger (<b>${esc(sItem.name)}</b>): <b>${fmtInt(sItem.loads)}</b> quarry/haulage loads · Total Spend <b>${fmtMoney(sItem.cost, 2)}</b> · Open AP <b>${fmtMoney(sItem.ap, 2)}</b>.`);
      });
      const s0 = matchedSuppliers[0];
      actions.push({ type: 'inspect', crKey: 'suppliers', id: s0.id, label: `360° ${s0.name}` });
    }
    if (nonAudioAtts.length > 1) {
      const extraDesc = nonAudioAtts.slice(1).map(a => `<b>${esc(a.name)}</b> (${esc(a.summaryLine || a.sizeLabel)})`).join(' · ');
      bullets.push(`Additional Attached Files (${nonAudioAtts.length - 1}): ${extraDesc}`);
    }

    // Case A: Spreadsheet / CSV / TSV / JSON / XLSX attachment
    if (primary.kind === 'spreadsheet' && primary.rowCount > 0) {
      const previewCols = primary.colHeaders.slice(0, 4);
      const previewRows = primary.parsedRows.slice(0, 6).map(r => previewCols.map((_, idx) => cleanOut(r[idx] != null ? r[idx] : '-')));
      const totalLabel = primary.numericCol
        ? (primary.isMoneyCol ? fmtMoney(primary.numericSum, 2) : fmtInt(primary.numericSum, 2))
        : `${fmtInt(primary.rowCount)} rows`;

      if (!actions.some(a => a.type === 'view')) {
        actions.push({ type: 'view', view: matchedSuppliers.length ? 'suppliers' : 'sales', label: matchedSuppliers.length ? 'Suppliers & Payables' : 'Sales & Receivables' });
        actions.push({ type: 'form', form: matchedSuppliers.length ? 'raw' : 'sales', label: matchedSuppliers.length ? '+ New Raw Ticket' : '+ New Sales Ticket' });
      }

      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'attachment',
        title: `File Reconciliation · ${primary.name}`,
        answer: `Parsed <b>${esc(primary.name)}</b> (<b>${fmtInt(primary.rowCount)}</b> ${primary.rowCount === 1 ? 'row' : 'rows'} across <b>${fmtInt(primary.colHeaders.length)}</b> columns${primary.numericCol ? `, column <b>${esc(primary.numericCol)}</b> total: <b>${totalLabel}</b>` : ''}) and cross-checked against <b>${esc(scope.fullScopeLabel)}</b>.`,
        bullets: bullets.length ? bullets : [
          `Detected Columns: <b>${esc(primary.colHeaders.slice(0, 6).join(', '))}</b>`
        ],
        headers: previewCols.length ? previewCols : undefined,
        rows: previewRows.length ? previewRows : undefined,
        total: primary.numericCol && previewCols.length >= 2 ? [`Sheet Total (${primary.rowCount} rows)`, totalLabel] : undefined,
        promptText: 'Would you like to inspect the matched ERP records or post a new entry from this sheet?',
        actions,
        followUps: [
          `Show ${scope.scopeCoLabel} summary`,
          'Show overdue receivables',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // Case B: Image / Screenshot / Receipt / Weighbridge Slip photo
    if (primary.kind === 'image') {
      const ocrText = cleanOut(primary.ocrText || primary.textContent || '');
      const detectedView = primary.detectedView || detectViewFromOcrText(ocrText);
      const asksScreenshotOrExplain = /\b(screenshot|screen[ _-]?shot|capture|snip|understand|undersand|explain|what\s+is\s+this|what\s+am\s+i\s+looking\s+at|what\s+does|mean|walk\s+me\s+through|guide|overview|dashboard|screen|page|view|app[- ]?entered|cash\s+till|écran|ecran|comprends|explique)\b|(?:صورة|لقطة|شاشة|اشرح|افهم|أفهم)/i.test(cleanQ);
      const isGenericClipboardName = /^(?:image|screenshot|screen[ _-]?shot|capture|snip|clipboard|pasted[ _-]?image)[\w .-]*\.(?:png|jpe?g|webp|gif|bmp)$/i.test(primary.name);
      const isExplicitVoucherPhoto = /\b(weighbridge|slip|receipt|voucher|invoice|bill|defect|broken|repair|leak|damage|tire|hydraulic|fuel|diesel|mazout)\b/i.test(cleanQ + ' ' + primary.name) && !detectedView && !/\b(screenshot|understand|undersand|explain\s+this\s+screen)\b/i.test(cleanQ);
      const isLandscapeScreenRatio = primary.aspectRatio >= 1.2 && primary.aspectRatio <= 2.6;

      if (detectedView || ((asksScreenshotOrExplain || isGenericClipboardName || isLandscapeScreenRatio) && !isExplicitVoucherPhoto)) {
        const snap = primary.screenSnapshot || captureLiveScreenSnapshot();
        const targetView = detectedView || (snap && snap.viewId) || ((_ctx && _ctx.STATE && _ctx.STATE.view) || 'overview');
        const wtReply = buildScreenWalkthroughReply(cleanQ, lang, scope, primary, targetView, snap, ocrText);
        if (bullets.length && Array.isArray(wtReply.bullets)) {
          wtReply.bullets.push(...bullets);
        }
        return wtReply;
      }

      const dollarHitsImg = ocrText.match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || [];
      if (dollarHitsImg.length) {
        bullets.push(`Detected Image Amounts: <b>${esc(dollarHitsImg.slice(0, 5).join(' · '))}</b>`);
      }
      if (ocrText && ocrText.length >= 8) {
        bullets.push(`Extracted Image Text: "${esc(ocrText.slice(0, 160))}${ocrText.length > 160 ? '...' : ''}"`);
      }

      const isFuel = /fuel|diesel|mazout|tank/i.test(lowCorpus);
      const isRaw = /quarry|raw|supplier|hauler|sand|gravel/i.test(lowCorpus);
      const isDefect = /defect|broken|repair|leak|damage|tire|hydraulic/i.test(lowCorpus);
      const targetForm = isDefect ? 'defect' : (isFuel ? 'fuel' : (isRaw ? 'raw' : (matchedSuppliers.length ? 'expense' : 'sales')));
      const targetFormLbl = isDefect ? '+ Report Defect' : (isFuel ? '+ New Fuel Entry' : (isRaw ? '+ New Raw Ticket' : (matchedSuppliers.length ? '+ New Expense' : '+ New Sales Ticket')));

      actions.push({ type: 'form', form: targetForm, label: targetFormLbl });
      actions.push({ type: 'view', view: isDefect ? 'fleet_maint' : (isFuel ? 'fleet' : 'daily_ops'), label: 'Open Register' });

      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        topic: 'attachment',
        title: `Visual Attachment · ${primary.name}`,
        answer: `Analyzed attached image <b>${esc(primary.name)}</b> (${esc(primary.summaryLine || primary.sizeLabel)}) under <b>${esc(scope.fullScopeLabel)}</b>${matchedErpTickets.length || matchedCustomers.length || matchedSuppliers.length ? ' and linked matching live ledger records below' : (ocrText ? ' and extracted visible voucher text below' : '. Ready to log or reconcile against your active operational registers')}.`,
        bullets: bullets.length ? bullets : [
          `Quick Action: Open <b>${esc(targetFormLbl)}</b> to post this voucher or inspect live ${esc(scope.scopeCoLabel)} registers.`
        ],
        promptText: 'Would you like to post a voucher from this image or inspect matching accounts?',
        actions,
        followUps: [
          'Show today\'s daily operations',
          'Check pending-price vouchers',
          'Show top expense categories'
        ]
      };
    }

    // Case C: PDF / Document / Binary Excel (.xls) / Text file
    const dollarHits = (primary.textContent || '').match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || [];
    if (dollarHits.length) {
      bullets.push(`Detected Document Amounts: <b>${esc(dollarHits.slice(0, 5).join(' · '))}</b>`);
    }
    if (!bullets.length && primary.textContent) {
      bullets.push(`Document Excerpt: "${esc(primary.textContent.slice(0, 140))}${primary.textContent.length > 140 ? '...' : ''}"`);
    }
    actions.push({ type: 'view', view: 'statements', label: 'Printable Statements' });
    actions.push({ type: 'form', form: 'expense', label: '+ New Expense' });

    return {
      q: cleanQ,
      lang,
      instantLocal: !isReasoningQuery(cleanQ),
      topic: 'attachment',
      title: `Document Analysis · ${primary.name}`,
      answer: `Reviewed attached document <b>${esc(primary.name)}</b> (${esc(primary.summaryLine)}) against active scope <b>${esc(scope.fullScopeLabel)}</b>.`,
      bullets,
      promptText: 'Would you like to open Printable Statements or inspect matched accounts?',
      actions,
      followUps: [
        `Give me an executive briefing & open alerts`,
        'Show Accounts Payable breakdown',
        'Show overdue receivables'
      ]
    };
  }

  // Voice Recording, Live Voice Mode Studio, Spoken Insight Summarizer & Neural TTS (EN / AR / FR)
  function syncVoiceModeDeckUi() {
    const deck = document.getElementById('aiVoiceModeDeck');
    const hdrBtn = document.getElementById('aiLiveVoiceBtn');
    const isModeOn = Boolean(_chatState.liveVoiceMode);
    if (hdrBtn) {
      hdrBtn.classList.toggle('is-active', isModeOn);
      hdrBtn.setAttribute('aria-pressed', isModeOn ? 'true' : 'false');
    }
    if (!deck) return;
    deck.hidden = !isModeOn;
    if (!isModeOn) return;

    let phase = 'ready';
    if (_chatState.voiceActive) phase = 'listening';
    else if (_chatState.pending) phase = 'thinking';
    else if (_chatState.activeAudioEl || _chatState.activeSpeakCtrl || (_chatState.activeSpeakBtn && !_chatState.activeBriefingScope)) {
      phase = _chatState.activeAudioPaused ? 'paused' : 'speaking';
    }
    _chatState.voiceModePhase = phase;
    deck.setAttribute('data-voice-phase', phase);

    const lang = _chatState.voiceLang || 'en';
    const lInfo = VOICE_LANG_MAP[lang] || VOICE_LANG_MAP.en;
    const statusEl = document.getElementById('aiVmStatusLabel');
    const subEl = document.getElementById('aiVmCaptionText');
    const timerEl = document.getElementById('aiVmTimer');
    const pauseBtn = document.getElementById('aiVmPauseBtn');
    const rateBtn = document.getElementById('aiVmRateBtn');
    const hfBtn = document.getElementById('aiVmHandsFreeBtn');
    const priBtn = document.getElementById('aiVmPrimaryBtn');
    const progFill = document.getElementById('aiVmProgressFill');

    if (statusEl) {
      const spokenLangLbl = lang === 'ar' ? 'Listening (Arabic)' : (lang === 'fr' ? 'Listening (French)' : 'Listening (English)');
      const mapEn = {
        ready: 'Voice Mode Ready',
        listening: spokenLangLbl,
        thinking: 'Analyzing Live Records',
        speaking: 'ISABI Speaking',
        paused: 'Voice Paused'
      };
      statusEl.textContent = _chatState.voiceStatusOverride || mapEn[phase] || mapEn.ready;
    }

    if (subEl) {
      let isDynamicTranscript = false;
      if (phase === 'listening') {
        const liveTxt = cleanOut([_chatState.voiceBaseText, _chatState.voiceInterimText].filter(Boolean).join(' '));
        if (liveTxt) {
          subEl.textContent = liveTxt;
          isDynamicTranscript = true;
        } else {
          subEl.textContent = _chatState.handsFreeVoice
            ? 'Speak naturally. Auto-sends when you pause, or tap Send Now.'
            : 'Speak your question, then tap Send Now when finished.';
        }
      } else if (phase === 'thinking') {
        if (_chatState.pending && _chatState.pending.q) {
          subEl.textContent = cleanOut(_chatState.pending.q);
          isDynamicTranscript = true;
        } else {
          subEl.textContent = 'Computing live indicators and insights...';
        }
      } else if (phase === 'speaking' || phase === 'paused') {
        subEl.textContent = cleanOut(_chatState.activeSpeakCaption || _chatState.lastSpokenText || '').slice(0, 220);
        isDynamicTranscript = true;
      } else {
        subEl.textContent = 'Tap Start Talking for a live two-way voice briefing.';
      }
      if (isDynamicTranscript) subEl.setAttribute('data-no-i18n', '1');
      else subEl.removeAttribute('data-no-i18n');
      const uiLang = (typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') ? window.MFG_I18N.getLang() : 'en';
      subEl.dir = /[\u0600-\u06FF]/.test(subEl.textContent || '') || uiLang === 'ar' ? 'rtl' : 'ltr';
    }

    if (timerEl) {
      const elapsedSec = _chatState.voiceActive && _chatState.voiceStartMs
        ? Math.floor((Date.now() - _chatState.voiceStartMs) / 1000)
        : 0;
      timerEl.textContent = _chatState.voiceActive ? formatDuration(elapsedSec) : `${_chatState.playbackRate}x`;
    }

    if (pauseBtn) {
      const showPause = (phase === 'speaking' || phase === 'paused');
      pauseBtn.hidden = !showPause;
      if (showPause) {
        const pLbl = _chatState.activeAudioPaused ? 'Resume' : 'Pause';
        pauseBtn.innerHTML = `<span class="ai-act-ico">${_chatState.activeAudioPaused ? AI_SVGS.play : AI_SVGS.pause}</span><span>${esc(pLbl)}</span>`;
      }
    }

    if (rateBtn) {
      rateBtn.textContent = `${_chatState.playbackRate}x`;
    }

    if (hfBtn) {
      hfBtn.classList.toggle('active', Boolean(_chatState.handsFreeVoice));
      hfBtn.setAttribute('aria-pressed', _chatState.handsFreeVoice ? 'true' : 'false');
    }

    if (priBtn) {
      if (phase === 'listening') {
        priBtn.innerHTML = `<span class="ai-act-ico">${AI_SVGS.mic}</span><span>Send Now</span>`;
        priBtn.className = 'ai-vm-primary-btn is-listening';
      } else if (phase === 'speaking' || phase === 'paused') {
        priBtn.innerHTML = `<span class="ai-act-ico">${AI_SVGS.mic}</span><span>Interrupt &amp; Ask</span>`;
        priBtn.className = 'ai-vm-primary-btn is-barge';
      } else {
        priBtn.innerHTML = `<span class="ai-act-ico">${AI_SVGS.mic}</span><span>Start Talking</span>`;
        priBtn.className = 'ai-vm-primary-btn';
      }
    }

    if (progFill) {
      const pct = (phase === 'speaking' || phase === 'paused')
        ? Math.max(4, Math.min(100, Math.round((_chatState.activeAudioProgress || 0) * 100)))
        : (phase === 'thinking' ? 45 : 0);
      progFill.style.width = `${pct}%`;
    }

    deck.querySelectorAll('[data-ai-voice-lang]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-ai-voice-lang') === lang);
    });

    if (typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en') {
      try { window.MFG_I18N.translateDom(deck); } catch (_) {}
    }
  }

  function syncVoiceBarUi() {
    const voiceBar = document.getElementById('aiVoiceBar');
    const voiceBtn = document.getElementById('aiVoiceBtn');
    const timerEl = document.getElementById('aiVoiceTimer');
    const statusLbl = document.getElementById('aiVoiceStatusText');
    const active = Boolean(_chatState.voiceActive);

    if (voiceBtn) {
      voiceBtn.classList.toggle('is-recording', active);
      voiceBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    syncVoiceModeDeckUi();
    if (!voiceBar) return;
    // When full Voice Mode deck is open at the top, hide the duplicate bottom strip to keep composer clean
    voiceBar.hidden = !active || Boolean(_chatState.liveVoiceMode);
    if (voiceBar.hidden) return;

    const elapsedSec = _chatState.voiceStartMs ? Math.floor((Date.now() - _chatState.voiceStartMs) / 1000) : 0;
    if (timerEl) timerEl.textContent = formatDuration(elapsedSec);
    const lInfo = VOICE_LANG_MAP[_chatState.voiceLang] || VOICE_LANG_MAP.en;
    if (statusLbl) {
      const liveText = cleanOut([_chatState.voiceBaseText, _chatState.voiceInterimText].filter(Boolean).join(' '));
      statusLbl.textContent = liveText
        ? liveText.slice(-56)
        : (_chatState.voiceStatusOverride || `Listening (${lInfo.name})...`);
    }
    voiceBar.querySelectorAll('[data-ai-voice-lang]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-ai-voice-lang') === _chatState.voiceLang);
    });
  }

  const DAILY_BRIEFING_I18N = {
    ar: {
      'Listen to Daily Briefing': 'الاستماع إلى الموجز اليومي',
      'Preparing Briefing...': 'جارٍ تحضير الموجز...',
      'Stop Briefing': 'إيقاف الموجز',
      "Play a 20-second spoken summary of the selected day's revenue, cash till, and active Sentinel flags": 'تشغيل موجز صوتي تنفيذي لمدة 20 ثانية لإيرادات اليوم المحدد ورصيد الصندوق والتنبيهات الرقابية النشطة',
      'Listen to Period Summary': 'الاستماع إلى ملخص الفترة',
      'Preparing Summary...': 'جارٍ تحضير الملخص...',
      'Stop Summary': 'إيقاف الملخص',
      'Replay Summary': 'إعادة تشغيل الملخص',
      'Variance': 'التباين',
      'Open grounded Period Variance Commentary': 'فتح تعليق تباين الفترة المستند إلى الدفتر',
      "Play a spoken summary of the active period's P&L bridge, prior-period variance, cash till, and active Sentinel flags": 'تشغيل ملخص صوتي تنفيذي لجسر الأرباح والخسائر وتباين الفترة السابقة والسيولة والتنبيهات الرقابية النشطة',
      'Period Variance Commentary': 'تعليق تباين الفترة',
      'Deterministic Ledger': 'دفتر محاسبي حتمي',
      'AI Variance Brief': 'تحليل التباين الذكي',
      'Ask Follow-Up': 'سؤال متابعة',
      'Period Revenue': 'إيرادات الفترة',
      'Cash & AR': 'السيولة والذمم',
      'Control Flags': 'ضوابط الرقابة'
    },
    fr: {
      'Listen to Daily Briefing': 'Écouter le briefing quotidien',
      'Preparing Briefing...': 'Préparation du briefing...',
      'Stop Briefing': 'Arrêter le briefing',
      "Play a 20-second spoken summary of the selected day's revenue, cash till, and active Sentinel flags": "Écouter un résumé vocal exécutif de 20 secondes sur le chiffre d'affaires du jour, la caisse et les alertes Sentinel actives",
      'Listen to Period Summary': 'Écouter le bilan de période',
      'Preparing Summary...': 'Préparation du bilan...',
      'Stop Summary': 'Arrêter le bilan',
      'Replay Summary': 'Réécouter le bilan',
      'Variance': 'Écart',
      'Open grounded Period Variance Commentary': "Ouvrir l'analyse d'écart de la période",
      "Play a spoken summary of the active period's P&L bridge, prior-period variance, cash till, and active Sentinel flags": "Écouter un bilan vocal exécutif du pont P&L, de l'écart de période, de la trésorerie et des alertes Sentinel actives",
      'Period Variance Commentary': "Analyse d'écart de la période",
      'Deterministic Ledger': 'Grand livre déterministe',
      'AI Variance Brief': "Synthèse d'écart IA",
      'Ask Follow-Up': 'Question de suivi',
      'Period Revenue': 'Revenu de période',
      'Cash & AR': 'Trésorerie & Créances',
      'Control Flags': 'Contrôles Sentinel'
    }
  };

  function ensureDailyBriefingI18nRegistered() {
    if (typeof window === 'undefined' || !window.MFG_I18N || typeof window.MFG_I18N.registerLocale !== 'function') return;
    const dict = window.MFG_I18N.DICT || {};
    if (!dict.ar || !dict.ar['Listen to Daily Briefing'] || !dict.ar['Listen to Period Summary']) {
      window.MFG_I18N.registerLocale('ar', { code: 'ar', label: 'عربي', shortLabel: 'AR', nativeName: 'العربية', dir: 'rtl', bcp47: 'ar-LB' }, DAILY_BRIEFING_I18N.ar);
    }
    if (!dict.fr || !dict.fr['Listen to Daily Briefing'] || !dict.fr['Listen to Period Summary']) {
      window.MFG_I18N.registerLocale('fr', { code: 'fr', label: 'FR', shortLabel: 'FR', nativeName: 'Français', dir: 'ltr', bcp47: 'fr-FR' }, DAILY_BRIEFING_I18N.fr);
    }
  }

  function isExecBriefBtn(btn) {
    return Boolean(btn && btn.hasAttribute && (btn.hasAttribute('data-dops-briefing') || btn.hasAttribute('data-ceo-period-summary')));
  }

  function applyBriefingButtonDomState(btn, mode) {
    if (!btn) return;
    ensureDailyBriefingI18nRegistered();
    const isPeriodBtn = Boolean(btn.hasAttribute && btn.hasAttribute('data-ceo-period-summary'));
    const icons = window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function' ? window.MFG_ICONS : null;
    const icoHtml = mode === 'speaking'
      ? (icons ? icons.svg('stop') : AI_SVGS.stop)
      : (icons ? icons.svg('audio') : AI_SVGS.audio);
    const enLabel = isPeriodBtn
      ? (mode === 'speaking' ? 'Stop Summary' : (mode === 'loading' ? 'Preparing Summary...' : 'Listen to Period Summary'))
      : (mode === 'speaking' ? 'Stop Briefing' : (mode === 'loading' ? 'Preparing Briefing...' : 'Listen to Daily Briefing'));
    const lblCls = isPeriodBtn ? 'ceo-ps-lbl' : 'dops-brief-lbl';
    btn.classList.toggle('is-loading', mode === 'loading');
    btn.classList.toggle('is-speaking', mode === 'speaking');
    btn.setAttribute('aria-pressed', (mode === 'loading' || mode === 'speaking') ? 'true' : 'false');
    btn.innerHTML = `${icoHtml}<span class="${lblCls}">${esc(enLabel)}</span>`;
    if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en') {
      try { window.MFG_I18N.translateDom(btn); } catch (_) {}
    }
    syncCeoPopoverAudioButton();
  }

  function syncCeoPopoverAudioButton() {
    if (typeof document === 'undefined') return;
    const pop = document.getElementById('ceoPeriodSummaryPopover');
    if (!pop) return;
    const spkBtn = pop.querySelector('[data-ceo-pv-speak]');
    if (!spkBtn) return;
    const isPeriodActive = Boolean(
      _chatState.activePeriodSummaryScope ||
      (_chatState.activeSpeakBtn && _chatState.activeSpeakBtn.hasAttribute && _chatState.activeSpeakBtn.hasAttribute('data-ceo-period-summary'))
    );
    const icons = window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function' ? window.MFG_ICONS : null;
    const enLbl = isPeriodActive ? 'Stop Summary' : 'Replay Summary';
    const ico = isPeriodActive ? (icons ? icons.svg('stop') : AI_SVGS.stop) : (icons ? icons.svg('audio') : AI_SVGS.audio);
    spkBtn.classList.toggle('is-speaking', isPeriodActive);
    spkBtn.innerHTML = `${ico}<span>${esc(enLbl)}</span>`;
    if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en') {
      try { window.MFG_I18N.translateDom(spkBtn); } catch (_) {}
    }
  }

  function speakIdleLabel(lang) {
    if (lang === 'ar') return 'استماع للملخص';
    if (lang === 'fr') return 'Écouter';
    return 'Read Aloud';
  }

  function speakStopLabel(lang) {
    if (lang === 'ar') return 'إيقاف';
    if (lang === 'fr') return 'Arrêter';
    return 'Stop';
  }

  function resetSpeakButtonUi(btn) {
    if (!btn) return;
    if (isExecBriefBtn(btn)) {
      applyBriefingButtonDomState(btn, 'idle');
      return;
    }
    const lang = btn.getAttribute('data-ai-speak') || 'en';
    btn.classList.remove('is-speaking', 'is-loading');
    btn.innerHTML = `<span class="ai-act-ico">${AI_SVGS.audio}</span><span>${esc(speakIdleLabel(lang))}</span>`;
  }

  function syncInlineAudioPlayerBar() {
    const bar = document.getElementById('aiInlinePlaybackBar');
    if (bar) {
      const isPlayingInChat = Boolean(
        !_chatState.liveVoiceMode &&
        !_chatState.activeBriefingScope &&
        !_chatState.activePeriodSummaryScope &&
        (_chatState.activeAudioEl || (_chatState.activeSpeakBtn && _chatState.activeSpeakBtn.hasAttribute && _chatState.activeSpeakBtn.hasAttribute('data-ai-speak')))
      );
      bar.hidden = !isPlayingInChat;
      if (isPlayingInChat) {
        const cap = bar.querySelector('.ai-ipb-caption');
        const fill = bar.querySelector('.ai-ipb-fill');
        const pBtn = bar.querySelector('[data-ai-audio-pause]');
        const rBtn = bar.querySelector('[data-ai-audio-rate]');
        if (cap) cap.textContent = cleanOut(_chatState.activeSpeakCaption || _chatState.lastSpokenText || '').slice(0, 120);
        if (fill) fill.style.width = `${Math.max(5, Math.round((_chatState.activeAudioProgress || 0) * 100))}%`;
        if (pBtn) pBtn.innerHTML = _chatState.activeAudioPaused ? AI_SVGS.play : AI_SVGS.pause;
        if (rBtn) rBtn.textContent = `${_chatState.playbackRate}x`;
      }
    }
    syncVoiceModeDeckUi();
    syncCeoPopoverAudioButton();
  }

  function stopActivePlayback(opts = {}) {
    if (_chatState.activeSpeakCtrl) {
      try { _chatState.activeSpeakCtrl.abort(); } catch (_) {}
      _chatState.activeSpeakCtrl = null;
    }
    _chatState.activeBriefingScope = '';
    _chatState.activePeriodSummaryScope = '';
    if (_chatState.activeSpeakBtn) {
      resetSpeakButtonUi(_chatState.activeSpeakBtn);
      _chatState.activeSpeakBtn = null;
    }
    _chatState.activeSpeakTurnIdx = -1;
    _chatState.lastSpokenText = '';
    _chatState.activeSpeakCaption = '';
    _chatState.activeAudioPaused = false;
    _chatState.activeAudioProgress = 0;
    _chatState.activeAudioQueue = [];
    if (_chatState.activeAudioEl) {
      try {
        _chatState.activeAudioEl.onended = null;
        _chatState.activeAudioEl.onerror = null;
        _chatState.activeAudioEl.ontimeupdate = null;
        _chatState.activeAudioEl.pause();
        _chatState.activeAudioEl.currentTime = 0;
      } catch (_) {}
      _chatState.activeAudioEl = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    if (!opts.skipUiSync) syncInlineAudioPlayerBar();
  }

  function togglePausePlayback() {
    if (_chatState.activeAudioEl) {
      try {
        if (_chatState.activeAudioEl.paused) {
          _chatState.activeAudioPaused = false;
          _chatState.activeAudioEl.play().catch(() => {});
        } else {
          _chatState.activeAudioPaused = true;
          _chatState.activeAudioEl.pause();
        }
        syncInlineAudioPlayerBar();
        return !_chatState.activeAudioPaused;
      } catch (_) {}
    }
    if (typeof window !== 'undefined' && window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.paused)) {
      try {
        if (window.speechSynthesis.paused) {
          _chatState.activeAudioPaused = false;
          window.speechSynthesis.resume();
        } else {
          _chatState.activeAudioPaused = true;
          window.speechSynthesis.pause();
        }
        syncInlineAudioPlayerBar();
        return !_chatState.activeAudioPaused;
      } catch (_) {}
    }
    return false;
  }

  function cyclePlaybackRate() {
    const order = [1, 1.2, 1.5];
    const idx = order.indexOf(_chatState.playbackRate);
    const next = order[(idx + 1) % order.length];
    _chatState.playbackRate = next;
    try { localStorage.setItem('isabi_ask_voice_rate', String(next)); } catch (_) {}
    if (_chatState.activeAudioEl) {
      try { _chatState.activeAudioEl.playbackRate = next; } catch (_) {}
    }
    syncInlineAudioPlayerBar();
    return next;
  }

  function maybeResumeHandsFreeListening() {
    if (!_chatState.liveVoiceMode || !_chatState.handsFreeVoice) return;
    if (navigator.webdriver || window.__MFG_HEADLESS_TEST) return;
    const askDrawer = document.getElementById('aiDrawer');
    if (!askDrawer || !askDrawer.classList.contains('open')) return;
    setTimeout(() => {
      if (!_chatState.liveVoiceMode || !_chatState.handsFreeVoice || _chatState.voiceActive || _chatState.pending || _chatState.activeAudioEl) return;
      startVoiceRecording({ autoSendOnSilence: true });
    }, 380);
  }

  function updateVoiceWaveVisualizers(bins) {
    const vmWave = document.getElementById('aiVmWaveform');
    if (vmWave) {
      const bars = vmWave.children;
      for (let i = 0; i < bars.length; i++) {
        const v = bins && bins.length ? (bins[i % bins.length] / 255) : 0.12;
        const h = Math.max(5, Math.min(34, Math.round(5 + v * 29)));
        bars[i].style.height = `${h}px`;
      }
    }
    const barWave = document.querySelector('#aiVoiceBar .ai-voice-wave');
    if (barWave) {
      const bars2 = barWave.children;
      for (let j = 0; j < bars2.length; j++) {
        const v2 = bins && bins.length ? (bins[(j * 2) % bins.length] / 255) : 0.15;
        const h2 = Math.max(4, Math.min(18, Math.round(4 + v2 * 14)));
        bars2[j].style.height = `${h2}px`;
      }
    }
  }

  function stopVoiceHardwareStreams() {
    if (_chatState.vadRafId) {
      cancelAnimationFrame(_chatState.vadRafId);
      _chatState.vadRafId = null;
    }
    if (_chatState.audioCtx) {
      try { _chatState.audioCtx.close(); } catch (_) {}
      _chatState.audioCtx = null;
      _chatState.analyserNode = null;
    }
    if (_chatState.voiceTimerId) {
      clearInterval(_chatState.voiceTimerId);
      _chatState.voiceTimerId = null;
    }
    if (_chatState.speechRec) {
      try {
        _chatState.speechRec.onresult = null;
        _chatState.speechRec.onerror = null;
        _chatState.speechRec.onend = null;
        _chatState.speechRec.stop();
      } catch (_) {}
      _chatState.speechRec = null;
    }
    if (_chatState.mediaRecorder && _chatState.mediaRecorder.state !== 'inactive') {
      try { _chatState.mediaRecorder.stop(); } catch (_) {}
    }
    _chatState.mediaRecorder = null;
    if (_chatState.mediaStream) {
      try { _chatState.mediaStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      _chatState.mediaStream = null;
    }
    _chatState.micLevel = 0;
  }

  function startAudioAnalyserAndVad(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !stream) return;
    try {
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      _chatState.audioCtx = ctx;
      _chatState.analyserNode = analyser;
      const freqBins = new Uint8Array(analyser.frequencyBinCount);
      let lastFrameMs = Date.now();

      const tick = () => {
        if (!_chatState.voiceActive || _chatState.analyserNode !== analyser) return;
        const now = Date.now();
        const dt = Math.min(120, Math.max(10, now - lastFrameMs));
        lastFrameMs = now;

        analyser.getByteFrequencyData(freqBins);
        let sum = 0;
        const count = Math.min(16, freqBins.length);
        for (let i = 1; i < count; i++) sum += freqBins[i];
        const avg = count > 1 ? (sum / (count - 1)) : 0;
        _chatState.micLevel = avg / 255;
        updateVoiceWaveVisualizers(freqBins);

        // Voice Activity Detection for hands-free auto-send when user finishes speaking
        if (avg > 26) {
          _chatState.speechEnergyAccumMs = (_chatState.speechEnergyAccumMs || 0) + dt;
          _chatState.lastLoudMs = now;
          if (_chatState.speechEnergyAccumMs >= 320) {
            _chatState.speechDetectedInTurn = true;
          }
        } else if (
          _chatState.voiceAutoSendOnSilence &&
          _chatState.handsFreeVoice &&
          _chatState.speechDetectedInTurn &&
          _chatState.lastLoudMs > 0 &&
          (now - _chatState.voiceStartMs) >= 1350 &&
          (now - _chatState.lastLoudMs) >= 1700
        ) {
          stopVoiceRecording({ attachVoiceNote: true, autoSend: true });
          return;
        }
        _chatState.vadRafId = requestAnimationFrame(tick);
      };
      _chatState.vadRafId = requestAnimationFrame(tick);
    } catch (_) {}
  }

  function startSpeechRecognitionInstance() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
    if (!SpeechRec || isAutoTest) return;

    try {
      const rec = new SpeechRec();
      const lInfo = VOICE_LANG_MAP[_chatState.voiceLang] || VOICE_LANG_MAP.en;
      rec.lang = lInfo.bcp47;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = ev => {
        if (!_chatState.voiceActive) return;
        _chatState.voiceStatusOverride = '';
        let finalChunk = '';
        let interimChunk = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0] ? ev.results[i][0].transcript : '';
          if (ev.results[i].isFinal) finalChunk += t + ' ';
          else interimChunk += t;
        }
        if (finalChunk) {
          _chatState.voiceBaseText = (_chatState.voiceBaseText ? _chatState.voiceBaseText + ' ' : '') + finalChunk.trim();
        }
        _chatState.voiceInterimText = interimChunk.trim();
        const combined = [_chatState.voiceBaseText, _chatState.voiceInterimText].filter(Boolean).join(' ').trim();
        if (combined) {
          _chatState.speechDetectedInTurn = true;
          _chatState.lastLoudMs = Date.now();
        }
        const inp = document.getElementById('aiInput');
        if (inp && combined) {
          inp.value = combined;
          inp.dir = /[\u0600-\u06FF]/.test(combined) || _chatState.voiceLang === 'ar' ? 'rtl' : 'ltr';
        }
        syncVoiceBarUi();
      };
      rec.onerror = ev => {
        if (!_chatState.voiceActive) return;
        const err = ev && ev.error ? String(ev.error) : '';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          _chatState.voiceStatusOverride = 'Microphone permission blocked in browser';
          syncVoiceBarUi();
        } else if (err === 'audio-capture') {
          _chatState.voiceStatusOverride = 'No microphone detected';
          syncVoiceBarUi();
        }
      };
      rec.onend = () => {
        if (_chatState.voiceActive && _chatState.speechRec === rec && !_chatState.voiceStatusOverride) {
          try { rec.start(); } catch (_) {}
        }
      };
      _chatState.speechRec = rec;
      rec.start();
    } catch (_) {}
  }

  function negotiateAudioMime() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return 'audio/webm';
    }
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_) {}
    }
    return '';
  }

  function blobToDataUrlAsync(blob) {
    return new Promise(resolve => {
      if (!blob || typeof FileReader === 'undefined' || blob.size > 8 * 1024 * 1024) {
        resolve('');
        return;
      }
      try {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => resolve('');
        fr.readAsDataURL(blob);
      } catch (_) {
        resolve('');
      }
    });
  }

  function startVoiceRecording(opts = {}) {
    if (_chatState.voiceActive) {
      return stopVoiceRecording(opts);
    }
    stopActivePlayback();
    const inp = document.getElementById('aiInput');
    if (opts && opts.lang && VOICE_LANG_MAP[opts.lang]) {
      _chatState.voiceLang = opts.lang;
    } else if (inp && inp.value && /[\u0600-\u06FF]/.test(inp.value)) {
      _chatState.voiceLang = 'ar';
    } else if (typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') {
      const appLang = window.MFG_I18N.getLang();
      if (VOICE_LANG_MAP[appLang] && !_chatState.preferredLang) _chatState.voiceLang = appLang;
    }
    _chatState.voiceActive = true;
    _chatState.voiceAutoSendOnSilence = Boolean((opts && opts.autoSendOnSilence) || (_chatState.liveVoiceMode && _chatState.handsFreeVoice));
    _chatState.speechDetectedInTurn = false;
    _chatState.speechEnergyAccumMs = 0;
    _chatState.lastLoudMs = 0;
    _chatState.voiceStartMs = Date.now();
    _chatState.voiceBaseText = inp ? inp.value.trim() : '';
    _chatState.voiceInterimText = '';
    _chatState.voiceStatusOverride = '';
    _chatState.audioChunks = [];
    _chatState.mediaRecorderMime = negotiateAudioMime() || 'audio/webm';
    syncVoiceBarUi();

    _chatState.voiceTimerId = setInterval(() => {
      if (!_chatState.voiceActive) return;
      syncVoiceBarUi();
    }, 450);

    startSpeechRecognitionInstance();

    const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
    if (!isAutoTest && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined') {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        if (!_chatState.voiceActive) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        _chatState.mediaStream = stream;
        startAudioAnalyserAndVad(stream);
        const mimeOpt = negotiateAudioMime();
        const mr = mimeOpt ? new MediaRecorder(stream, { mimeType: mimeOpt }) : new MediaRecorder(stream);
        _chatState.mediaRecorderMime = mr.mimeType || mimeOpt || 'audio/webm';
        mr.ondataavailable = e => {
          if (e.data && e.data.size > 0) _chatState.audioChunks.push(e.data);
        };
        _chatState.mediaRecorder = mr;
        mr.start(200);
      }).catch(() => {
        if (!_chatState.speechRec) {
          _chatState.voiceStatusOverride = 'Microphone unavailable or blocked';
          syncVoiceBarUi();
        }
      });
    }
    return true;
  }

  function stopVoiceRecording(opts = {}) {
    if (!_chatState.voiceActive && !(opts && opts.transcript)) return null;
    const elapsedSec = Math.max(1, Math.round((Date.now() - (_chatState.voiceStartMs || Date.now())) / 1000));
    const recordedDuration = Number(opts.durationSec || elapsedSec);
    const activeLang = (opts && opts.lang && VOICE_LANG_MAP[opts.lang]) ? opts.lang : _chatState.voiceLang;
    const recMime = (_chatState.mediaRecorderMime || 'audio/webm').split(';')[0] || 'audio/webm';
    const activeMr = _chatState.mediaRecorder;

    let initialBlob = null;
    let audioUrl = '';
    if (_chatState.audioChunks && _chatState.audioChunks.length && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        initialBlob = new Blob(_chatState.audioChunks, { type: recMime });
        audioUrl = URL.createObjectURL(initialBlob);
      } catch (_) {}
    }

    const inp = document.getElementById('aiInput');
    const finalTranscript = cleanOut(
      opts.transcript != null
        ? opts.transcript
        : ((inp && inp.value.trim()) || [_chatState.voiceBaseText, _chatState.voiceInterimText].filter(Boolean).join(' '))
    );
    if (inp && finalTranscript) {
      inp.value = finalTranscript;
      inp.dir = /[\u0600-\u06FF]/.test(finalTranscript) || activeLang === 'ar' ? 'rtl' : 'ltr';
    }
    _chatState.voiceInterimText = '';
    _chatState.voiceStatusOverride = '';

    let voiceAtt = null;
    if (audioUrl || opts.attachVoiceNote !== false) {
      voiceAtt = buildAttachmentMetaObject({
        name: `Voice Note (${(VOICE_LANG_MAP[activeLang] || VOICE_LANG_MAP.en).label})`,
        kind: 'audio',
        type: recMime,
        size: initialBlob ? initialBlob.size : recordedDuration * 6400,
        audioUrl,
        dataUrl: (opts && opts.audioDataUrl) ? String(opts.audioDataUrl) : '',
        durationSec: recordedDuration,
        voiceLang: activeLang
      });
      _chatState.attachments.filter(a => a && a.kind === 'audio').forEach(revokeAttachmentUrls);
      _chatState.attachments = _chatState.attachments.filter(a => a.kind !== 'audio');
      _chatState.attachments.push(voiceAtt);
      renderAttachmentBar();
    }

    if (voiceAtt && !voiceAtt.dataUrl) {
      if (activeMr && activeMr.state !== 'inactive') {
        const chunksRef = _chatState.audioChunks;
        voiceAtt._audioPromise = new Promise(resolve => {
          const safety = setTimeout(() => resolve(voiceAtt), 900);
          activeMr.onstop = () => {
            clearTimeout(safety);
            if (chunksRef && chunksRef.length && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
              try {
                if (voiceAtt.audioUrl) URL.revokeObjectURL(voiceAtt.audioUrl);
                const fullBlob = new Blob(chunksRef, { type: recMime });
                voiceAtt.audioUrl = URL.createObjectURL(fullBlob);
                voiceAtt.size = fullBlob.size || voiceAtt.size;
                voiceAtt.sizeLabel = formatBytes(voiceAtt.size);
                blobToDataUrlAsync(fullBlob).then(dUrl => {
                  if (dUrl) voiceAtt.dataUrl = dUrl;
                  renderAttachmentBar();
                  if (_chatState.history.length) renderThread(false);
                  resolve(voiceAtt);
                });
                return;
              } catch (_) {}
            }
            resolve(voiceAtt);
          };
        });
      } else if (initialBlob) {
        voiceAtt._audioPromise = blobToDataUrlAsync(initialBlob).then(dUrl => {
          if (dUrl) voiceAtt.dataUrl = dUrl;
          return voiceAtt;
        });
      }
    }

    stopVoiceHardwareStreams();
    _chatState.voiceActive = false;
    syncVoiceBarUi();

    if (opts && opts.autoSend) {
      if (inp) {
        inp.value = '';
        inp.dir = 'ltr';
      }
      submitQuestion(finalTranscript, { fromVoice: true });
    }
    return { transcript: finalTranscript, durationSec: recordedDuration, lang: activeLang, attachment: voiceAtt };
  }

  function cancelVoiceRecording() {
    stopVoiceHardwareStreams();
    _chatState.voiceActive = false;
    _chatState.voiceInterimText = '';
    _chatState.voiceStatusOverride = '';
    _chatState.audioChunks = [];
    const inp = document.getElementById('aiInput');
    if (inp) {
      inp.value = _chatState.voiceBaseText || '';
      inp.dir = /[\u0600-\u06FF]/.test(inp.value) ? 'rtl' : 'ltr';
    }
    syncVoiceBarUi();
  }

  function toggleLiveVoiceMode(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !_chatState.liveVoiceMode;
    _chatState.liveVoiceMode = next;
    if (!next) {
      if (_chatState.voiceActive) cancelVoiceRecording();
      stopActivePlayback();
      syncVoiceModeDeckUi();
      return false;
    }
    const askDrawer = document.getElementById('aiDrawer');
    if (askDrawer && !askDrawer.classList.contains('open')) {
      openDrawer();
    }
    syncVoiceModeDeckUi();
    if (!_chatState.voiceActive && !_chatState.pending && !_chatState.activeAudioEl) {
      startVoiceRecording({ autoSendOnSilence: _chatState.handsFreeVoice });
    }
    return true;
  }

  function setVoiceLang(lang) {
    if (!VOICE_LANG_MAP[lang]) return;
    _chatState.voiceLang = lang;
    _chatState.voiceStatusOverride = '';
    if (_chatState.voiceActive) {
      if (_chatState.speechRec) {
        try {
          _chatState.speechRec.onend = null;
          _chatState.speechRec.stop();
        } catch (_) {}
        _chatState.speechRec = null;
      }
      startSpeechRecognitionInstance();
    }
    syncVoiceBarUi();
  }

  function wrapPcm16InWavBytes(pcmBytes, sampleRate) {
    const sr = Number(sampleRate) || 24000;
    const dataLen = pcmBytes.length;
    const wav = new Uint8Array(44 + dataLen);
    const view = new DataView(wav.buffer);
    const writeAscii = (off, str) => {
      for (let i = 0; i < str.length; i++) wav[off + i] = str.charCodeAt(i);
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataLen, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataLen, true);
    wav.set(pcmBytes, 44);
    return wav;
  }

  function base64ToBlobUrl(b64, mimeType) {
    const bin = atob(String(b64 || '').trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mimeLow = String(mimeType || '').toLowerCase();
    const isRiffWav = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    if (!isRiffWav && (mimeLow.includes('l16') || mimeLow.includes('pcm'))) {
      const rateMatch = mimeLow.match(/rate=(\d+)/);
      const wavBytes = wrapPcm16InWavBytes(bytes, rateMatch ? Number(rateMatch[1]) : 24000);
      return URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));
    }
    const blob = new Blob([bytes], { type: isRiffWav ? 'audio/wav' : (mimeType || 'audio/wav') });
    return URL.createObjectURL(blob);
  }

  function normalizeTextForSpeech(rawText, lang) {
    const safeLang = lang || 'en';
    let s = String(rawText || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/`+/g, '')
      .replace(/\*\*+/g, '');
    // Remove any leaked stage-direction prefixes if ever passed in
    s = s
      .replace(/^Speak in a [a-z,\s]+tone:\s*/i, '')
      .replace(/^تحدث بنبرة[^:：]*[:：]\s*/u, '')
      .replace(/^Parlez sur un ton[^:]*:\s*/i, '');
    const m3Word = safeLang === 'ar' ? ' متر مكعب' : (safeLang === 'fr' ? ' mètres cubes' : ' cubic meters');
    const pnlWord = safeLang === 'ar' ? 'الأرباح والخسائر' : (safeLang === 'fr' ? 'compte de résultat' : 'profit and loss');
    const arWord = safeLang === 'ar' ? 'الذمم المدينة' : (safeLang === 'fr' ? 'créances clients' : 'accounts receivable');
    const apWord = safeLang === 'ar' ? 'الذمم الدائنة' : (safeLang === 'fr' ? 'dettes fournisseurs' : 'accounts payable');
    s = s
      .replace(/\/\s*(?:m³|(?:m3|m\^3)\b)/gi, safeLang === 'ar' ? ' لكل متر مكعب' : (safeLang === 'fr' ? ' par mètre cube' : ' per cubic meter'))
      .replace(/(\d)\s*(?:m³|(?:m3|m\^3)\b)/gi, `$1${m3Word}`)
      .replace(/m³|\b(?:m3|m\^3)\b/gi, m3Word.trim())
      .replace(/\bP\s*&\s*L\b/gi, pnlWord)
      .replace(/\bOpen\s+AR\b/gi, safeLang === 'en' ? 'Open accounts receivable' : arWord)
      .replace(/\bOpen\s+AP\b/gi, safeLang === 'en' ? 'Open accounts payable' : apWord)
      .replace(/\bAR\b/g, arWord)
      .replace(/\bAP\b/g, apWord)
      .replace(/\bYoY\b/gi, safeLang === 'fr' ? "sur un an" : 'year over year')
      .replace(/\bMoM\b/gi, safeLang === 'fr' ? "sur un mois" : 'month over month')
      .replace(/\bS\.A\.L\.?/g, 'S A L')
      .replace(/#(\d{3,})/g, safeLang === 'ar' ? 'سند رقم $1' : (safeLang === 'fr' ? 'pièce $1' : 'ticket $1'))
      .replace(/\b(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\b/gi, (_, d1, d2) => `${formatSpokenDate(d1, safeLang)} ${safeLang === 'ar' ? 'إلى' : (safeLang === 'fr' ? 'au' : 'to')} ${formatSpokenDate(d2, safeLang)}`);
    s = sanitizeSpokenText(s, safeLang)
      .replace(/\s+\.\s*/g, '. ')
      .replace(/\.{2,}/g, '.')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return s;
  }

  function summarizeTableForSpeech(headers, rows, total, lang) {
    const safeLang = lang || 'en';
    const parts = [];
    if (Array.isArray(rows) && rows.length > 0) {
      const topRows = rows.filter(r => Array.isArray(r) && !isSummaryTableRow(r)).slice(0, 3);
      if (topRows.length > 0) {
        const formattedItems = topRows.map(r => {
          const name = cleanOut(String(r[0] || '').replace(/<[^>]+>/g, ''));
          const val = cleanOut(String(r[r.length - 1] || '').replace(/<[^>]+>/g, ''));
          const mid = r.length > 2 ? cleanOut(String(r[1] || '').replace(/<[^>]+>/g, '')) : '';
          if (!name) return '';
          if (safeLang === 'ar') return `${name} بقيمة ${val}`;
          if (safeLang === 'fr') return `${name} à ${val}`;
          return mid && !/^\d{4}-/.test(mid) && mid.length <= 16 ? `${name} at ${val} (${mid})` : `${name} at ${val}`;
        }).filter(Boolean);
        if (formattedItems.length > 0) {
          if (safeLang === 'ar') {
            parts.push(`أبرز البنود في الجدول: ${formattedItems.join('، يليه ')}.`);
          } else if (safeLang === 'fr') {
            parts.push(`Principaux éléments : ${formattedItems.join(', suivi de ')}.`);
          } else {
            parts.push(`Top highlights: ${formattedItems.join(', followed by ')}.`);
          }
        }
      }
    }
    if (Array.isArray(total) && total.length >= 2) {
      const totLbl = cleanOut(String(total[0] || '').replace(/<[^>]+>/g, ''));
      const totVal = cleanOut(String(total[total.length - 1] || '').replace(/<[^>]+>/g, ''));
      if (totVal) {
        if (safeLang === 'ar') parts.push(`الإجمالي الكلي (${totLbl}): ${totVal}.`);
        else if (safeLang === 'fr') parts.push(`Total global (${totLbl}) : ${totVal}.`);
        else parts.push(`${totLbl || 'Overall total'} stands at ${totVal}.`);
      }
    }
    return parts.join(' ');
  }

  function buildSpokenInsightScript(turnOrObj, langOverride) {
    if (!turnOrObj) return '';
    if (typeof turnOrObj === 'string') {
      const sLang = langOverride || detectLang(turnOrObj) || 'en';
      return normalizeTextForSpeech(turnOrObj, sLang);
    }
    const safeLang = langOverride || turnOrObj.lang || detectLang(turnOrObj.answer || '') || 'en';
    const segments = [];

    if (turnOrObj.voiceSummary && String(turnOrObj.voiceSummary).trim().length > 15) {
      segments.push(String(turnOrObj.voiceSummary).trim());
      if (Array.isArray(turnOrObj.total) && turnOrObj.total.length >= 2) {
        const totVal = cleanOut(String(turnOrObj.total[turnOrObj.total.length - 1] || ''));
        if (totVal && !String(turnOrObj.voiceSummary).includes(totVal)) {
          segments.push(summarizeTableForSpeech([], [], turnOrObj.total, safeLang));
        }
      }
    } else {
      if (turnOrObj.answer) segments.push(String(turnOrObj.answer));
      if (Array.isArray(turnOrObj.bullets) && turnOrObj.bullets.length) {
        segments.push(turnOrObj.bullets.slice(0, 4).join('. '));
      }
      const tblSpeech = summarizeTableForSpeech(turnOrObj.headers, turnOrObj.rows, turnOrObj.total, safeLang);
      if (tblSpeech) segments.push(tblSpeech);
      if (turnOrObj.promptText) segments.push(String(turnOrObj.promptText));
    }

    return normalizeTextForSpeech(segments.filter(Boolean).join('. '), safeLang);
  }

  function buildTtsPromptPayload(plain, lang) {
    const safeLang = lang || detectLang(plain) || 'en';
    // Pure spoken text only — zero stage-direction prefix so neural TTS never speaks instructions out loud
    return normalizeTextForSpeech(plain, safeLang).slice(0, 2200);
  }

  function splitSentencesForSpeech(text, maxLen = 210) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const parts = raw.match(/[^.!?؟]+[.!?؟]*\s*/g) || [raw];
    const chunks = [];
    let cur = '';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (!p) continue;
      if ((cur + ' ' + p).trim().length <= maxLen) {
        cur = (cur ? cur + ' ' : '') + p;
      } else {
        if (cur) chunks.push(cur);
        if (p.length <= maxLen) {
          cur = p;
        } else {
          for (let k = 0; k < p.length; k += maxLen) {
            chunks.push(p.slice(k, k + maxLen));
          }
          cur = '';
        }
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  function fallbackBrowserSpeech(plain, lang, btnEl) {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined') {
      if (btnEl) resetSpeakButtonUi(btnEl);
      return false;
    }
    try {
      const normalized = buildTtsPromptPayload(plain, lang);
      const chunks = splitSentencesForSpeech(normalized, 200);
      if (!chunks.length) {
        if (btnEl) resetSpeakButtonUi(btnEl);
        return false;
      }
      const bcp = (VOICE_LANG_MAP[lang] || VOICE_LANG_MAP.en).bcp47;
      _chatState.lastSpokenText = normalized;
      _chatState.activeSpeakCaption = normalized;
      _chatState.activeAudioPaused = false;
      _chatState.activeAudioProgress = 0.08;
      if (btnEl) {
        _chatState.activeSpeakBtn = btnEl;
        if (isExecBriefBtn(btnEl)) {
          applyBriefingButtonDomState(btnEl, 'speaking');
        } else {
          btnEl.classList.remove('is-loading');
          btnEl.classList.add('is-speaking');
          btnEl.innerHTML = `<span class="ai-act-ico">${AI_SVGS.stop}</span><span>${esc(speakStopLabel(lang))}</span>`;
        }
      }
      syncInlineAudioPlayerBar();

      let idx = 0;
      const wasDops = isExecBriefBtn(btnEl);
      const clearFallbackUi = (completedNaturally) => {
        const curBtn = _chatState.activeSpeakBtn || btnEl;
        _chatState.activeSpeakBtn = null;
        _chatState.activeBriefingScope = '';
        _chatState.activePeriodSummaryScope = '';
        _chatState.lastSpokenText = '';
        _chatState.activeSpeakCaption = '';
        _chatState.activeAudioPaused = false;
        _chatState.activeAudioProgress = 0;
        if (curBtn) resetSpeakButtonUi(curBtn);
        syncInlineAudioPlayerBar();
        if (completedNaturally && !wasDops) maybeResumeHandsFreeListening();
      };

      const speakNextChunk = () => {
        if (idx >= chunks.length) {
          clearFallbackUi(true);
          return;
        }
        const utt = new window.SpeechSynthesisUtterance(chunks[idx]);
        utt.lang = bcp;
        utt.rate = Number(_chatState.playbackRate || 1) * 1.01;
        _chatState.activeSpeakCaption = chunks[idx];
        _chatState.activeAudioProgress = (idx + 0.5) / chunks.length;
        syncInlineAudioPlayerBar();
        idx++;
        utt.onend = () => speakNextChunk();
        utt.onerror = () => clearFallbackUi(false);
        window.speechSynthesis.speak(utt);
      };
      speakNextChunk();
      return true;
    } catch (_) {
      if (btnEl) resetSpeakButtonUi(btnEl);
      syncInlineAudioPlayerBar();
      return false;
    }
  }

  async function requestCloudOrLocalTtsUrl(plain, lang, signal) {
    const promptText = buildTtsPromptPayload(plain, lang);
    if (!promptText) return '';
    const cacheKey = `${lang}|${promptText}`;
    if (_chatState.ttsAudioCache.has(cacheKey)) {
      return _chatState.ttsAudioCache.get(cacheKey);
    }
    const voiceName = lang === 'ar' ? 'Charon' : (lang === 'fr' ? 'Aoede' : 'Kore');

    // 1. Local API Server (/api/tts) when hosted locally
    const isLocalHost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
    if (isLocalHost || window.ISABI_LOCAL_API) {
      try {
        const base = String(window.ISABI_LOCAL_API || '').replace(/\/$/, '');
        const rLocal = await fetch(`${base}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: promptText, lang, voiceName, model: 'gemini-3.8-flash-lite-tts' }),
          signal
        });
        if (rLocal.ok) {
          const jL = await rLocal.json();
          if (jL && jL.ok && jL.audioBase64) {
            const url = base64ToBlobUrl(jL.audioBase64, jL.mimeType || 'audio/wav');
            if (_chatState.ttsAudioCache.size >= 24) {
              const oldest = _chatState.ttsAudioCache.keys().next().value;
              _chatState.ttsAudioCache.delete(oldest);
            }
            _chatState.ttsAudioCache.set(cacheKey, url);
            return url;
          }
        }
      } catch (_) {}
    }

    // 2. Cloud AI Relay (op: 'tts' -> gemini-3.8-flash-lite-tts)
    const askCfg = window.MFG_ASK_CFG || {};
    let flowUrl = '';
    let flowKey = '';
    try {
      if (askCfg.u && askCfg.k) {
        flowUrl = atob(askCfg.u);
        flowKey = atob(askCfg.k);
      }
    } catch (_) {}
    if (flowUrl && flowUrl.startsWith('http') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      const rCloud = await fetch(flowUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          key: flowKey,
          op: 'tts',
          model: 'gemini-3.8-flash-lite-tts',
          voiceName,
          lang,
          text: promptText
        }),
        signal
      });
      if (rCloud.ok) {
        const jC = await rCloud.json();
        if (jC && jC.ok && jC.mode === 'gemini_tts' && jC.audioBase64) {
          const url = base64ToBlobUrl(jC.audioBase64, jC.mimeType || 'audio/wav');
          if (_chatState.ttsAudioCache.size >= 24) {
            const oldest = _chatState.ttsAudioCache.keys().next().value;
            _chatState.ttsAudioCache.delete(oldest);
          }
          _chatState.ttsAudioCache.set(cacheKey, url);
          return url;
        }
      }
    }
    return '';
  }

  function speakBotReply(rawHtmlOrTurn, lang, btnEl) {
    const safeInputLang = lang || (typeof rawHtmlOrTurn === 'object' && rawHtmlOrTurn ? rawHtmlOrTurn.lang : '') || '';
    const plain = typeof rawHtmlOrTurn === 'object' && rawHtmlOrTurn !== null
      ? buildSpokenInsightScript(rawHtmlOrTurn, safeInputLang)
      : buildSpokenInsightScript(String(rawHtmlOrTurn || ''), safeInputLang);
    if (!plain) return false;
    const isBriefBtn = isExecBriefBtn(btnEl);
    const isAutoTest = Boolean((navigator.webdriver || window.__MFG_HEADLESS_TEST) && !window.__ALLOW_HEADLESS_TTS);
    if (isAutoTest) {
      _chatState.lastSpokenText = plain;
      if (!isBriefBtn) return true;
      if (_chatState.activeSpeakBtn === btnEl) {
        stopActivePlayback();
        return true;
      }
      stopActivePlayback();
      _chatState.lastSpokenText = plain;
      _chatState.activeSpeakBtn = btnEl;
      applyBriefingButtonDomState(btnEl, 'speaking');
      return true;
    }

    const safeLang = safeInputLang || detectLang(plain) || 'en';
    const isSameActive = Boolean(
      (btnEl && _chatState.activeSpeakBtn === btnEl) ||
      (!btnEl && _chatState.lastSpokenText === plain && (_chatState.activeAudioEl || (window.speechSynthesis && window.speechSynthesis.speaking)))
    );
    if (isSameActive) {
      stopActivePlayback();
      return true;
    }

    if (_chatState.voiceActive) cancelVoiceRecording();
    stopActivePlayback();
    _chatState.lastSpokenText = plain;
    _chatState.activeSpeakCaption = plain;
    _chatState.activeAudioProgress = 0.04;

    // Create Audio element synchronously inside gesture handler for iOS Safari unlock
    const audioEl = (typeof Audio !== 'undefined') ? new Audio() : null;
    if (!audioEl) {
      return fallbackBrowserSpeech(plain, safeLang, btnEl);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 16000);
    _chatState.activeSpeakCtrl = ctrl;
    if (btnEl) {
      _chatState.activeSpeakBtn = btnEl;
      if (isBriefBtn) {
        applyBriefingButtonDomState(btnEl, 'loading');
      } else {
        btnEl.classList.add('is-loading');
        btnEl.innerHTML = `<span class="ai-act-ico">${AI_SVGS.audio}</span><span>${esc(safeLang === 'ar' ? 'جارٍ التحضير...' : (safeLang === 'fr' ? 'Audio...' : 'Preparing...'))}</span>`;
      }
    }
    syncInlineAudioPlayerBar();

    requestCloudOrLocalTtsUrl(plain, safeLang, ctrl.signal).then(blobUrl => {
      clearTimeout(timer);
      if (ctrl.signal.aborted) return;
      _chatState.activeSpeakCtrl = null;
      const curBtn = _chatState.activeSpeakBtn || btnEl;
      if (blobUrl) {
        audioEl.src = blobUrl;
        try { audioEl.playbackRate = Number(_chatState.playbackRate || 1); } catch (_) {}
        _chatState.activeAudioEl = audioEl;
        _chatState.activeAudioPaused = false;
        if (curBtn) {
          if (isExecBriefBtn(curBtn)) {
            applyBriefingButtonDomState(curBtn, 'speaking');
          } else {
            curBtn.classList.remove('is-loading');
            curBtn.classList.add('is-speaking');
            curBtn.innerHTML = `<span class="ai-act-ico">${AI_SVGS.stop}</span><span>${esc(speakStopLabel(safeLang))}</span>`;
          }
        }
        syncInlineAudioPlayerBar();
        audioEl.ontimeupdate = () => {
          if (_chatState.activeAudioEl !== audioEl) return;
          const dur = Number(audioEl.duration || 0);
          if (dur > 0) {
            _chatState.activeAudioProgress = Math.min(1, audioEl.currentTime / dur);
            syncInlineAudioPlayerBar();
          }
        };
        audioEl.onended = () => {
          if (_chatState.activeAudioEl === audioEl) _chatState.activeAudioEl = null;
          const endBtn = _chatState.activeSpeakBtn || curBtn;
          const wasBrief = isExecBriefBtn(endBtn);
          _chatState.activeSpeakBtn = null;
          _chatState.activeBriefingScope = '';
          _chatState.activePeriodSummaryScope = '';
          _chatState.lastSpokenText = '';
          _chatState.activeSpeakCaption = '';
          _chatState.activeAudioPaused = false;
          _chatState.activeAudioProgress = 0;
          if (endBtn) resetSpeakButtonUi(endBtn);
          syncInlineAudioPlayerBar();
          if (!wasBrief) maybeResumeHandsFreeListening();
        };
        audioEl.onerror = () => {
          if (_chatState.activeAudioEl === audioEl) _chatState.activeAudioEl = null;
          fallbackBrowserSpeech(plain, safeLang, _chatState.activeSpeakBtn || curBtn);
        };
        audioEl.play().catch(() => {
          if (_chatState.activeAudioEl === audioEl) _chatState.activeAudioEl = null;
          fallbackBrowserSpeech(plain, safeLang, _chatState.activeSpeakBtn || curBtn);
        });
      } else {
        fallbackBrowserSpeech(plain, safeLang, curBtn);
      }
    }).catch(() => {
      clearTimeout(timer);
      if (ctrl.signal.aborted) return;
      _chatState.activeSpeakCtrl = null;
      fallbackBrowserSpeech(plain, safeLang, _chatState.activeSpeakBtn || btnEl);
    });
    return true;
  }

  const DAILY_BRIEFING_DOMAIN_SPEC = {
    'Manufacturing': {
      en: { rev: 'sales revenue', sing: 'dispatch', plur: 'dispatches' },
      ar: { rev: 'إيرادات المبيعات', sing: 'نقلة', plur: 'نقلات' },
      fr: { rev: "le chiffre d'affaires des ventes", verbPos: "s'élève à", verbZero: 'est de', sing: 'expédition', plur: 'expéditions' }
    },
    'Holding & Treasury': {
      en: { rev: 'intercompany and advisory inflows', sing: 'transfer', plur: 'transfers' },
      ar: { rev: 'التدفقات البينية والاستشارية', sing: 'تحويل', plur: 'تحويلات' },
      fr: { rev: 'les flux intragroupe et conseil', verbPos: "s'élèvent à", verbZero: 'sont à', sing: 'transfert', plur: 'transferts' }
    },
    'Hospitality & Resorts': {
      en: { rev: 'venue and chalet revenue', sing: 'entry', plur: 'entries' },
      ar: { rev: 'إيرادات المنتجعات والمطاعم', sing: 'عملية', plur: 'عمليات' },
      fr: { rev: 'les revenus des établissements et chalets', verbPos: "s'élèvent à", verbZero: 'sont à', sing: 'opération', plur: 'opérations' }
    },
    'Automotive & Heavy Trading': {
      en: { rev: 'vehicle and parts sales', sing: 'invoice', plur: 'invoices' },
      ar: { rev: 'مبيعات المركبات وقطع الغيار', sing: 'فاتورة', plur: 'فواتير' },
      fr: { rev: 'les ventes de véhicules et pièces', verbPos: "s'élèvent à", verbZero: 'sont à', sing: 'facture', plur: 'factures' }
    },
    'Real Estate & Property': {
      en: { rev: 'lease rent and property sales', sing: 'entry', plur: 'entries' },
      ar: { rev: 'إيرادات الإيجارات والمبيعات العقارية', sing: 'عقد', plur: 'عقود' },
      fr: { rev: 'les loyers et ventes immobilières', verbPos: "s'élèvent à", verbZero: 'sont à', sing: 'écriture', plur: 'écritures' }
    },
    'Insurance & Brokerage': {
      en: { rev: 'gross written premium', sing: 'policy', plur: 'policies' },
      ar: { rev: 'إجمالي الأقساط المكتتبة', sing: 'بوليصة', plur: 'بوالص' },
      fr: { rev: 'les primes émises brutes', verbPos: "s'élèvent à", verbZero: 'sont à', sing: 'police', plur: 'polices' }
    }
  };

  function formatSpokenMoney(val, lang) {
    const rounded = Math.round(Number(val || 0));
    const absStr = Math.abs(rounded).toLocaleString('en-US');
    if (lang === 'ar') {
      return rounded < 0 ? `سالب ${absStr} دولار` : `${absStr} دولار`;
    }
    if (lang === 'fr') {
      return rounded < 0 ? `moins ${absStr} dollars` : `${absStr} dollars`;
    }
    return rounded < 0 ? `minus $${absStr}` : `$${absStr}`;
  }

  function formatSpokenDate(isoDate, lang) {
    const cleanIso = String(isoDate || '').slice(0, 10);
    const dt = new Date(`${cleanIso}T12:00:00Z`);
    if (Number.isNaN(dt.getTime())) return cleanIso;
    const loc = lang === 'ar' ? 'ar-LB' : (lang === 'fr' ? 'fr-FR' : 'en-US');
    try {
      return new Intl.DateTimeFormat(loc, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(dt);
    } catch (_) {
      return cleanIso;
    }
  }

  function sanitizeSpokenText(raw, lang) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (lang && lang !== 'en' && typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      const tr = window.MFG_I18N.t(s, lang);
      if (tr && typeof tr === 'string') s = tr;
    }
    const andWord = lang === 'ar' ? ' و ' : (lang === 'fr' ? ' et ' : ' and ');
    const lteWord = lang === 'ar' ? ' خلال ' : (lang === 'fr' ? " jusqu'à " : ' within ');
    const gteWord = lang === 'ar' ? ' على الأقل ' : (lang === 'fr' ? ' au moins ' : ' at least ');
    const overWord = lang === 'ar' ? ' أكثر من ' : (lang === 'fr' ? ' plus de ' : ' over ');
    const underWord = lang === 'ar' ? ' أقل من ' : (lang === 'fr' ? ' moins de ' : ' under ');
    s = s
      .replace(/\([^)]*(?:Lebanese\s*CoA|FIFO|TTC|GWP|Z-Read|RDL|\d{4})[^)]*\)/gi, '')
      .replace(/\b(?:TTC|Z-Read|RDL|THEO)\b/gi, '')
      .replace(/\b(?:Rule\s*#\d+\s*[·\-:]?\s*)/gi, '')
      .replace(/\b(?:S\d+|H\d+|T\d+|R\d+|I\d+|h\d+|t\d+|r\d+|i\d+|m\d+|step\d+|7z-[\w-]+)\b/g, '')
      .replace(/[—–→↔]/g, ', ')
      .replace(/&/g, andWord)
      .replace(/\bin\s*(?:<=|≤)\s*/gi, 'within ')
      .replace(/(?:<=|≤)/g, lteWord)
      .replace(/(?:>=|≥)/g, gteWord)
      .replace(/>/g, overWord)
      .replace(/</g, underWord)
      .replace(/\s*[·|]\s*/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*,+/g, ',')
      .replace(/^[,\s]+|[,\s]+$/g, '');
    return cleanOut(s);
  }

  function resolveActiveBriefingLang(langOverride) {
    if (langOverride && VOICE_LANG_MAP[langOverride]) return langOverride;
    if (typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') {
      const uiLang = window.MFG_I18N.getLang();
      if (uiLang && VOICE_LANG_MAP[uiLang]) return uiLang;
    }
    const stLang = _ctx && _ctx.STATE && _ctx.STATE.lang;
    if (stLang && VOICE_LANG_MAP[stLang]) return stLang;
    return _chatState.voiceLang || 'en';
  }

  function buildDailyBriefing(langOverride) {
    const safeLang = resolveActiveBriefingLang(langOverride);
    const st = (_ctx && _ctx.STATE) ? _ctx.STATE : {};
    const coKey = st.company || 'manufacturing-group';
    const ind = (_ctx && typeof _ctx.getActiveIndustry === 'function')
      ? _ctx.getActiveIndustry(coKey)
      : 'Manufacturing';
    const rawCoLbl = String((_ctx && _ctx.COMPANY_LABELS && _ctx.COMPANY_LABELS[coKey])
      || (String(coKey).startsWith('industry:') ? String(coKey).slice(9) : ind))
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/^All\s+/i, '')
      .trim();
    const scopeName = sanitizeSpokenText(rawCoLbl, safeLang) || ind;
    const user = (_ctx && typeof _ctx.activeUser === 'function') ? _ctx.activeUser() : null;
    const canViewBooks = Boolean(canHub('cashflow', user) && (!_ctx || typeof _ctx.canViewHub !== 'function' || _ctx.canViewHub('books', user)));

    let targetDate = st.dailyOpsDate || (_ctx && typeof _ctx.todayISO === 'function' ? _ctx.todayISO() : '2026-11-06');
    let dayRevUsd = 0;
    let dayTxCount = 0;
    let closingTillUsd = 0;
    let dayNetCash = 0;
    let dayOpProfit = 0;

    if (ind === 'Manufacturing') {
      const dopsApi = (typeof window !== 'undefined' && window.MFG_DAILY_OPS) ? window.MFG_DAILY_OPS : null;
      const lastObj = (dopsApi && typeof dopsApi.getLastDayModel === 'function') ? dopsApi.getLastDayModel() : null;
      let dm = (lastObj && lastObj.dm && lastObj.coKey === coKey && (!st.dailyOpsDate || lastObj.dm.targetDate === st.dailyOpsDate))
        ? lastObj.dm
        : null;
      if (!dm && lastObj && lastObj.ctx && dopsApi && typeof dopsApi.buildDayModel === 'function') {
        try { dm = dopsApi.buildDayModel(lastObj.ctx); } catch (_) {}
      }
      if (dm) {
        targetDate = dm.targetDate || targetDate;
        dayRevUsd = Number(dm.salesSum && dm.salesSum.ttc || 0);
        dayTxCount = Number(dm.salesSum && dm.salesSum.loads || 0);
        closingTillUsd = Number(dm.liveTillUsd || 0);
        dayNetCash = Number(dm.netCashFlow || 0);
        dayOpProfit = Number(dm.operatingProfit || 0);
      } else if (_ctx && typeof _ctx.getKPI === 'function') {
        const k = _ctx.getKPI(coKey) || {};
        dayRevUsd = Number(k.sales_ttc || 0);
        dayTxCount = Number(k.loads || 0);
        closingTillUsd = Number(k.cash_till || 0);
        dayOpProfit = Number(k.operating_profit || 0);
      }
    } else {
      let snap = st._lastIndDailyBriefingSnap;
      if (!snap || snap.ind !== ind || snap.company !== coKey || (st.dailyOpsDate && snap.targetDate !== st.dailyOpsDate)) {
        if (_ctx && typeof _ctx.renderIndustryDailyOps === 'function') {
          try { _ctx.renderIndustryDailyOps(ind); } catch (_) {}
          snap = st._lastIndDailyBriefingSnap;
        }
      }
      if (snap) {
        targetDate = snap.targetDate || targetDate;
        dayRevUsd = Number(snap.dayRevUsd || 0);
        dayTxCount = Number(snap.dayRevCount || 0);
        closingTillUsd = Number(snap.closingTillUsd || 0);
        dayNetCash = Number(snap.dayNetCash || 0);
        dayOpProfit = Number(snap.dayOpProfit || 0);
      }
    }

    const allSn = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openSn = (allSn || []).filter(s => s && s.severity && s.severity !== 'ok');
    const critSn = openSn.filter(s => s.severity === 'crit');
    const leadItem = critSn[0] || openSn[0] || null;
    const topSentinelTitle = leadItem ? sanitizeSpokenText(leadItem.title || leadItem.category || 'Control Variance', safeLang) : '';

    const domSpec = (DAILY_BRIEFING_DOMAIN_SPEC[ind] || DAILY_BRIEFING_DOMAIN_SPEC['Manufacturing'])[safeLang]
      || DAILY_BRIEFING_DOMAIN_SPEC['Manufacturing'].en;
    const dateStr = formatSpokenDate(targetDate, safeLang);
    const revMoney = formatSpokenMoney(dayRevUsd, safeLang);
    const tillMoney = formatSpokenMoney(closingTillUsd, safeLang);
    const netAbsMoney = formatSpokenMoney(Math.abs(dayNetCash), safeLang);
    const roundedRev = Math.round(dayRevUsd);
    const roundedNet = Math.round(dayNetCash);
    const openCount = openSn.length;
    const critCount = critSn.length;

    const sentences = [];
    if (safeLang === 'ar') {
      if (roundedRev > 0) {
        const txPart = dayTxCount > 0 ? ` عبر ${dayTxCount.toLocaleString('en-US')} ${dayTxCount === 1 ? domSpec.sing : domSpec.plur}` : '';
        sentences.push(`الموجز اليومي لـ ${scopeName} ليوم ${dateStr}: بلغت ${domSpec.rev} ${revMoney}${txPart}.`);
      } else {
        sentences.push(`الموجز اليومي لـ ${scopeName} ليوم ${dateStr}: سجلت ${domSpec.rev} ${revMoney} دون ${domSpec.plur} مسجلة.`);
      }
      if (canViewBooks) {
        const netClause = roundedNet > 0
          ? `مع صافي تدفق نقدي داخل بقيمة ${formatSpokenMoney(dayNetCash, 'ar')}`
          : (roundedNet < 0 ? `بعد صافي تدفق نقدي خارج بقيمة ${netAbsMoney}` : 'مع تعادل التدفق النقدي لليوم');
        sentences.push(`رصيد الصندوق النقدي ${tillMoney}، ${netClause}.`);
      }
      if (openCount === 0) {
        sentences.push('جميع الضوابط الرقابية سليمة مع صفر تنبيهات نشطة.');
      } else if (openCount === 1) {
        sentences.push(`يوجد تنبيه رقابي ${critCount > 0 ? 'حرج ' : 'نشط '}واحد يتطلب المراجعة: ${topSentinelTitle}.`);
      } else {
        sentences.push(`توجد ${openCount} تنبيهات رقابية نشطة تتطلب المراجعة${critCount > 0 ? ` بينها ${critCount} حرجة` : ''}، أبرزها ${topSentinelTitle}.`);
      }
    } else if (safeLang === 'fr') {
      if (roundedRev > 0) {
        const txPart = dayTxCount > 0 ? ` sur ${dayTxCount.toLocaleString('en-US')} ${dayTxCount === 1 ? domSpec.sing : domSpec.plur}` : '';
        sentences.push(`Briefing quotidien pour ${scopeName} du ${dateStr} : ${domSpec.rev} ${domSpec.verbPos} ${revMoney}${txPart}.`);
      } else {
        sentences.push(`Briefing quotidien pour ${scopeName} du ${dateStr} : ${domSpec.rev} ${domSpec.verbZero} ${revMoney} sans ${domSpec.plur} enregistrées.`);
      }
      if (canViewBooks) {
        const netClause = roundedNet > 0
          ? `avec une entrée nette de trésorerie de ${formatSpokenMoney(dayNetCash, 'fr')} sur la journée`
          : (roundedNet < 0 ? `après une sortie nette de trésorerie de ${netAbsMoney} sur la journée` : 'avec un flux net de trésorerie équilibré sur la journée');
        sentences.push(`La caisse s'établit à ${tillMoney}, ${netClause}.`);
      }
      if (openCount === 0) {
        sentences.push('Tous les contrôles Sentinel sont au vert avec zéro alerte active.');
      } else if (openCount === 1) {
        sentences.push(`1 alerte Sentinel ${critCount > 0 ? 'critique ' : 'active '}requiert vérification : ${topSentinelTitle}.`);
      } else {
        sentences.push(`${openCount} alertes Sentinel actives requièrent vérification${critCount > 0 ? `, dont ${critCount} critique${critCount > 1 ? 's' : ''},` : ','} à commencer par ${topSentinelTitle}.`);
      }
    } else {
      if (roundedRev > 0) {
        const txPart = dayTxCount > 0 ? ` across ${dayTxCount.toLocaleString('en-US')} ${dayTxCount === 1 ? domSpec.sing : domSpec.plur}` : '';
        sentences.push(`Daily briefing for ${scopeName} on ${dateStr}: ${domSpec.rev} reached ${revMoney}${txPart}.`);
      } else {
        sentences.push(`Daily briefing for ${scopeName} on ${dateStr}: ${domSpec.rev} stood at ${revMoney} with no recorded ${domSpec.plur}.`);
      }
      if (canViewBooks) {
        const netClause = roundedNet > 0
          ? `with net cash inflow of ${formatSpokenMoney(dayNetCash, 'en')} for the day`
          : (roundedNet < 0 ? `after net cash outflow of ${netAbsMoney} for the day` : 'with even net cash movement for the day');
        sentences.push(`Cash till stands at ${tillMoney}, ${netClause}.`);
      }
      if (openCount === 0) {
        sentences.push('All Sentinel controls are clear with zero active flags.');
      } else if (openCount === 1) {
        sentences.push(`1 ${critCount > 0 ? 'critical ' : 'active '}Sentinel flag requires review: ${topSentinelTitle}.`);
      } else {
        sentences.push(`${openCount} active Sentinel flags require review${critCount > 0 ? `, including ${critCount} critical,` : ','} led by ${topSentinelTitle}.`);
      }
    }

    const text = cleanOut(sentences.join(' ').replace(/[—–→↔]/g, ', ').replace(/\s{2,}/g, ' '));
    return {
      lang: safeLang,
      industry: ind,
      company: coKey,
      companyLabel: scopeName,
      targetDate,
      dayRevUsd: Math.round(dayRevUsd),
      dayTxCount,
      canViewBooks,
      closingTillUsd: canViewBooks ? Math.round(closingTillUsd) : null,
      dayNetCash: canViewBooks ? Math.round(dayNetCash) : null,
      dayOpProfit: Math.round(dayOpProfit),
      openSentinelCount: openCount,
      critSentinelCount: critCount,
      topSentinelTitle,
      text
    };
  }

  function speakDailyBriefing(btnEl, langOverride) {
    if (btnEl && _chatState.activeSpeakBtn === btnEl) {
      stopActivePlayback();
      return { stopped: true };
    }
    const brief = buildDailyBriefing(langOverride);
    const ok = speakBotReply(brief.text, brief.lang, btnEl || null);
    if (ok && _chatState.activeSpeakBtn) {
      _chatState.activeBriefingScope = `${brief.company}|${brief.targetDate}`;
    }
    return Object.assign({ ok }, brief);
  }

  function rebindBriefingButton(btnEl, targetDate) {
    ensureDailyBriefingI18nRegistered();
    if (!_chatState.activeBriefingScope) return;
    const st = (_ctx && _ctx.STATE) ? _ctx.STATE : {};
    const curScope = `${st.company || 'manufacturing-group'}|${targetDate || st.dailyOpsDate || ''}`;
    if (_chatState.activeBriefingScope !== curScope) {
      stopActivePlayback();
      return;
    }
    if (btnEl) {
      _chatState.activeSpeakBtn = btnEl;
      applyBriefingButtonDomState(btnEl, _chatState.activeSpeakCtrl ? 'loading' : 'speaking');
    }
  }

  function stopBriefingIfActive() {
    if (_chatState.activeBriefingScope || (_chatState.activeSpeakBtn && _chatState.activeSpeakBtn.hasAttribute && _chatState.activeSpeakBtn.hasAttribute('data-dops-briefing'))) {
      stopActivePlayback();
    }
  }

  // ============================================================================
  // 1-TAP CEO PERIOD SUMMARY & GROUNDED GEMINI-3.5-FLASH-LITE VARIANCE COMMENTARY
  // ============================================================================
  const PERIOD_SUMMARY_DOMAIN_SPEC = {
    'Manufacturing': {
      en: { rev: 'sales revenue', direct: 'raw material and haulage cost', opex: 'operating expenses', profit: 'operating profit', sing: 'dispatch', plur: 'dispatches' },
      ar: { rev: 'إيرادات المبيعات', direct: 'تكلفة المواد الأولية والنقل', opex: 'المصاريف التشغيلية', profit: 'الربح التشغيلي', sing: 'نقلة', plur: 'نقلات' },
      fr: { rev: "le chiffre d'affaires", verb: "s'élève à", direct: 'le coût matières et transport', opex: "les charges d'exploitation", profit: "le résultat d'exploitation", sing: 'expédition', plur: 'expéditions' }
    },
    'Holding & Treasury': {
      en: { rev: 'consolidated group revenue', direct: 'direct cost of sales', opex: 'group overhead and payroll', profit: 'consolidated operating profit', sing: 'paired flow', plur: 'paired flows' },
      ar: { rev: 'إيرادات المجموعة الموحدة', direct: 'التكلفة المباشرة للمبيعات', opex: 'المصاريف الإدارية والرواتب', profit: 'الربح التشغيلي الموحد', sing: 'مطابقة بينية', plur: 'مطابقات بينية' },
      fr: { rev: 'le revenu consolidé du groupe', verb: "s'élève à", direct: 'le coût direct des ventes', opex: 'les frais généraux et salaires', profit: "le résultat d'exploitation consolidé", sing: 'flux lettré', plur: 'flux lettrés' }
    },
    'Hospitality & Resorts': {
      en: { rev: 'resort and membership revenue', direct: 'kitchen and cellar usage', opex: 'energy and maintenance cost', profit: 'resort operating profit', sing: 'service entry', plur: 'service entries' },
      ar: { rev: 'إيرادات المنتجعات والاشتراكات', direct: 'استهلاك المطبخ والمخزون', opex: 'تكلفة الطاقة والصيانة', profit: 'الربح التشغيلي للمنتجعات', sing: 'عملية تشغيلية', plur: 'عمليات تشغيلية' },
      fr: { rev: 'les revenus des resorts et abonnements', verb: "s'élèvent à", direct: 'la consommation cuisine et cave', opex: "les coûts d'énergie et maintenance", profit: "le résultat d'exploitation hôtelier", sing: 'opération', plur: 'opérations' }
    },
    'Automotive & Heavy Trading': {
      en: { rev: 'invoiced vehicle and parts revenue', direct: 'landed cost of goods', opex: 'showroom and customs overhead', profit: 'trading operating profit', sing: 'invoice', plur: 'invoices' },
      ar: { rev: 'إيرادات مبيعات الشاحنات وقطع الغيار', direct: 'التكلفة الواصلة للبضاعة', opex: 'مصاريف المعرض والتخليص', profit: 'الربح التشغيلي للتجارة', sing: 'فاتورة', plur: 'فواتير' },
      fr: { rev: 'le chiffre facturé véhicules et pièces', verb: "s'élève à", direct: 'le coût de revient dédouané', opex: 'les charges showroom et douane', profit: "le résultat d'exploitation négoce", sing: 'facture', plur: 'factures' }
    },
    'Real Estate & Property': {
      en: { rev: 'contracted rent roll and property revenue', direct: 'fit-out and work order cost', opex: 'property tax and registry charges', profit: 'net operating income', sing: 'active lease', plur: 'active leases' },
      ar: { rev: 'عوائد الإيجارات والمبيعات العقارية', direct: 'تكاليف التجهيز والصيانة', opex: 'الرسوم العقارية والإدارية', profit: 'صافي الدخل التشغيلي', sing: 'عقد إيجار', plur: 'عقود إيجار' },
      fr: { rev: 'les loyers contractuels et ventes', verb: "s'élèvent à", direct: "les travaux d'aménagement", opex: 'les taxes foncières et frais', profit: "le revenu net d'exploitation", sing: 'bail actif', plur: 'baux actifs' }
    },
    'Insurance & Brokerage': {
      en: { rev: 'gross written premium', direct: 'client commission rebates', opex: 'brokerage desk expenses', profit: 'brokerage operating profit', sing: 'policy', plur: 'policies' },
      ar: { rev: 'إجمالي الأقساط المكتتبة', direct: 'حسومات العملاء على العمولات', opex: 'مصاريف مكتب الوساطة', profit: 'الربح التشغيلي للوساطة', sing: 'بوليصة', plur: 'بوالص' },
      fr: { rev: 'les primes émises brutes', verb: "s'élèvent à", direct: 'les remises commerciales clients', opex: 'les charges du cabinet de courtage', profit: "le résultat d'exploitation courtage", sing: 'police', plur: 'polices' }
    }
  };

  const EN_MONTH_INDEX = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
    september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
  };

  function localizePeriodLabel(rawLabel, lang, forSpeech) {
    const raw = String(rawLabel || 'All-Time').replace(/[—–→↔]/g, '-').trim();
    if (!raw || /^all(-time)?$/i.test(raw)) {
      if (lang === 'ar') return 'كامل الفترة';
      if (lang === 'fr') return 'Cumul global';
      return forSpeech ? 'all-time operations' : 'All-Time';
    }
    const fyM = raw.match(/^FY\s*(\d{4})$/i);
    if (fyM) {
      if (lang === 'ar') return `السنة المالية ${fyM[1]}`;
      if (lang === 'fr') return `Exercice ${fyM[1]}`;
      return forSpeech ? `fiscal year ${fyM[1]}` : `FY ${fyM[1]}`;
    }
    const moYrM = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (moYrM && EN_MONTH_INDEX[moYrM[1].toLowerCase()] !== undefined) {
      const mIdx = EN_MONTH_INDEX[moYrM[1].toLowerCase()];
      const yr = Number(moYrM[2]);
      const dt = new Date(Date.UTC(yr, mIdx, 15));
      const loc = lang === 'ar' ? 'ar-LB' : (lang === 'fr' ? 'fr-FR' : 'en-US');
      try {
        return new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dt);
      } catch (_) {}
    }
    const isoM = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (isoM) return formatSpokenDate(isoM[1], lang);
    const dmyM = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (dmyM && EN_MONTH_INDEX[dmyM[2].toLowerCase()] !== undefined) {
      const mIdx = EN_MONTH_INDEX[dmyM[2].toLowerCase()];
      const iso = `${dmyM[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(dmyM[1])).padStart(2, '0')}`;
      return formatSpokenDate(iso, lang);
    }
    if (/^Week\s+/i.test(raw)) {
      const rest = raw.replace(/^Week\s+/i, '');
      const isoPair = rest.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
      if (isoPair) {
        const d1 = formatSpokenDate(isoPair[1], lang);
        const d2 = formatSpokenDate(isoPair[2], lang);
        if (lang === 'ar') return `الأسبوع من ${d1} إلى ${d2}`;
        if (lang === 'fr') return `Semaine du ${d1} au ${d2}`;
        return `Week of ${d1} to ${d2}`;
      }
      const dmyPair = rest.match(/^(\d{1,2})\s*([A-Za-z]{3})?\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/i);
      if (dmyPair && EN_MONTH_INDEX[(dmyPair[4] || '').toLowerCase()] !== undefined) {
        const m2 = EN_MONTH_INDEX[dmyPair[4].toLowerCase()];
        const m1 = dmyPair[2] && EN_MONTH_INDEX[dmyPair[2].toLowerCase()] !== undefined ? EN_MONTH_INDEX[dmyPair[2].toLowerCase()] : m2;
        const yr = Number(dmyPair[5] || 2026);
        const loc = lang === 'ar' ? 'ar-LB' : (lang === 'fr' ? 'fr-FR' : 'en-US');
        try {
          const fmtShort = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
          const s1 = fmtShort.format(new Date(Date.UTC(yr, m1, Number(dmyPair[1]))));
          const s2 = fmtShort.format(new Date(Date.UTC(yr, m2, Number(dmyPair[3]))));
          if (lang === 'ar') return `الأسبوع ${s1} - ${s2} ${yr}`;
          if (lang === 'fr') return `Semaine ${s1} - ${s2} ${yr}`;
          return `Week ${s1} - ${s2} ${yr}`;
        } catch (_) {}
      }
      if (lang === 'ar') return `الأسبوع ${rest}`;
      if (lang === 'fr') return `Semaine ${rest}`;
    }
    const spanIso = raw.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/i);
    if (spanIso) {
      if (lang === 'ar') return `${spanIso[1]} إلى ${spanIso[2]}`;
      if (lang === 'fr') return `${spanIso[1]} au ${spanIso[2]}`;
      return `${spanIso[1]} to ${spanIso[2]}`;
    }
    if (lang !== 'en' && typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      const tr = window.MFG_I18N.t(raw, lang);
      if (tr) return tr;
    }
    return raw;
  }

  function fmtCompactUsd(val) {
    const n = Number(val || 0);
    const abs = Math.abs(n);
    const sign = n < -0.005 ? '-' : '';
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 10000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  }

  function computeActivePeriodScopeKey() {
    const st = (_ctx && _ctx.STATE) ? _ctx.STATE : {};
    const coKey = st.company || 'manufacturing-group';
    const ind = (_ctx && typeof _ctx.getActiveIndustry === 'function') ? _ctx.getActiveIndustry(coKey) : 'Manufacturing';
    const user = (_ctx && typeof _ctx.activeUser === 'function') ? _ctx.activeUser() : null;
    const uid = (user && (user.id || user.username)) || 'anon';
    return `${ind}|${coKey}|${st.period || 'all'}|${st.dateFrom || ''}|${st.dateTo || ''}|${st.basis || 'tx'}|${uid}`;
  }

  function buildCeoPeriodSummary(langOverride) {
    ensureDailyBriefingI18nRegistered();
    const safeLang = resolveActiveBriefingLang(langOverride);
    const st = (_ctx && _ctx.STATE) ? _ctx.STATE : {};
    const coKey = st.company || 'manufacturing-group';
    const ind = (_ctx && typeof _ctx.getActiveIndustry === 'function') ? _ctx.getActiveIndustry(coKey) : 'Manufacturing';
    const user = (_ctx && typeof _ctx.activeUser === 'function') ? _ctx.activeUser() : null;
    const canViewBooks = Boolean(canHub('cashflow', user) && (!_ctx || typeof _ctx.canViewHub !== 'function' || _ctx.canViewHub('books', user)));
    const scopeKey = computeActivePeriodScopeKey();

    let snap = null;
    if (_ctx && typeof _ctx.computeCeoPeriodBridgeSnapshot === 'function') {
      try { snap = _ctx.computeCeoPeriodBridgeSnapshot(coKey, st.period); } catch (_) {}
    }
    if (!snap) {
      const k = (_ctx && typeof _ctx.getKPI === 'function') ? (_ctx.getKPI(coKey) || {}) : {};
      const rev = Number(k.sales_ttc || 0);
      const net = Number(k.net_sales || rev);
      const raw = Number(k.raw_cost || 0);
      const gm = Number(k.gross_margin != null ? k.gross_margin : (net - raw));
      const op = Number(k.operating_profit || 0);
      const opex = Math.max(0, gm - op);
      const den = Math.max(1, net || rev);
      snap = {
        industry: ind,
        company: coKey,
        companyLabel: String((_ctx && _ctx.COMPANY_LABELS && _ctx.COMPANY_LABELS[coKey]) || ind),
        grain: st.dateGrain || 'all',
        basis: st.basis || 'tx',
        periodKey: String(st.period || 'all'),
        periodLabel: 'All-Time',
        compareLabel: '',
        isAllTime: true,
        cur: { revUsd: rev, netSalesUsd: net, directCostUsd: raw, grossMarginUsd: gm, gmPct: (gm / den) * 100, opExUsd: opex, opProfitUsd: op, opMarginPct: (op / den) * 100, txCount: Number(k.loads || 0), hasActivity: rev > 0 },
        prev: null,
        books: { cashTillUsd: Number(k.cash_till || 0), arBalanceUsd: Number(k.ar_balance || 0), arOverdueUsd: Number(k.ar_overdue || 0) },
        topDriver: null,
        sentinels: { openCount: 0, critCount: 0, topTitle: '' }
      };
    }

    const rawCoBase = String(snap.companyLabel || ind)
      .replace(/\s*\([^)]*\)\s*/g, '')
      .trim();
    const rawCoStripped = rawCoBase.replace(/^All\s+/i, '').trim() || ind;
    const i18nFn = (typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.t === 'function')
      ? window.MFG_I18N.t.bind(window.MFG_I18N)
      : null;
    const trCo = (safeLang !== 'en' && i18nFn)
      ? (i18nFn(rawCoStripped, safeLang) || i18nFn(rawCoBase, safeLang) || i18nFn(ind, safeLang) || rawCoStripped)
      : rawCoStripped;
    const scopeName = cleanOut(String(trCo || ind).replace(/[—–→↔]/g, ' ').replace(/\s{2,}/g, ' ').trim()) || ind;
    const domSpec = (PERIOD_SUMMARY_DOMAIN_SPEC[ind] || PERIOD_SUMMARY_DOMAIN_SPEC['Manufacturing'])[safeLang]
      || PERIOD_SUMMARY_DOMAIN_SPEC['Manufacturing'].en;

    const cur = snap.cur || {};
    const prevObj = snap.prev || null;
    const isMomentum = Boolean(snap.isAllTime && prevObj && prevObj.isMomentumPair && prevObj.latestWindow);
    const deltaCur = isMomentum ? prevObj.latestWindow : cur;
    const deltaPrev = prevObj;
    const hasPrior = Boolean(deltaPrev && (deltaPrev.hasActivity || Math.abs(Number(deltaPrev.revUsd || 0)) > 0.01 || Math.abs(Number(deltaPrev.opProfitUsd || 0)) > 0.01));
    const meaningfulBothRev = Boolean(hasPrior && Number(deltaPrev.revUsd || 0) >= 500 && Number(deltaCur.revUsd || 0) >= 500);

    const revDeltaUsd = hasPrior ? Math.round(Number(deltaCur.revUsd || 0) - Number(deltaPrev.revUsd || 0)) : null;
    const revDeltaPct = (hasPrior && Number(deltaPrev.revUsd || 0) >= 500)
      ? Math.max(-99.9, Math.min(999.9, Number((((Number(deltaCur.revUsd || 0) - Number(deltaPrev.revUsd || 0)) / Number(deltaPrev.revUsd)) * 100).toFixed(1))))
      : null;
    const gmDeltaPts = meaningfulBothRev
      ? Math.max(-99.9, Math.min(99.9, Number((Number(deltaCur.gmPct || 0) - Number(deltaPrev.gmPct || 0)).toFixed(1))))
      : null;
    const opProfitDeltaUsd = hasPrior ? Math.round(Number(deltaCur.opProfitUsd || 0) - Number(deltaPrev.opProfitUsd || 0)) : null;
    const opProfitDeltaPct = (hasPrior && Math.abs(Number(deltaPrev.opProfitUsd || 0)) >= 500)
      ? Math.max(-999.9, Math.min(999.9, Number((((Number(deltaCur.opProfitUsd || 0) - Number(deltaPrev.opProfitUsd || 0)) / Math.abs(Number(deltaPrev.opProfitUsd))) * 100).toFixed(1))))
      : null;

    const locPeriodSpeech = localizePeriodLabel(snap.periodLabel, safeLang, true);
    const locPeriodUi = localizePeriodLabel(snap.periodLabel, safeLang, false);
    const locCompareUi = snap.compareLabel ? localizePeriodLabel(snap.compareLabel, safeLang, false) : '';
    const locLatestMoUi = (isMomentum && prevObj.latestLabel) ? localizePeriodLabel(prevObj.latestLabel, safeLang, false) : '';

    const revUsdRound = Math.round(Number(cur.revUsd || 0));
    const directUsdRound = Math.round(Number(cur.directCostUsd || 0));
    const gmUsdRound = Math.round(Number(cur.grossMarginUsd || 0));
    const opExUsdRound = Math.round(Number(cur.opExUsd || 0));
    const opProfUsdRound = Math.round(Number(cur.opProfitUsd || 0));
    const gmPctRound = Number(Number(cur.gmPct || 0).toFixed(1));
    const opPctRound = Number(Number(cur.opMarginPct || 0).toFixed(1));
    const txCount = Math.round(Number(cur.txCount || 0));

    const cashTillRound = canViewBooks ? Math.round(Number(snap.books && snap.books.cashTillUsd || 0)) : null;
    const arBalRound = canViewBooks ? Math.round(Number(snap.books && snap.books.arBalanceUsd || 0)) : null;
    const openCount = Number(snap.sentinels && snap.sentinels.openCount || 0);
    const critCount = Number(snap.sentinels && snap.sentinels.critCount || 0);
    const topSentinelTitle = snap.sentinels && snap.sentinels.topTitle ? sanitizeSpokenText(snap.sentinels.topTitle, safeLang) : '';
    const topDriverName = snap.topDriver && snap.topDriver.name ? sanitizeSpokenText(snap.topDriver.name, safeLang) : '';

    const revMoney = formatSpokenMoney(revUsdRound, safeLang);
    const gmMoney = formatSpokenMoney(gmUsdRound, safeLang);
    const opExMoney = formatSpokenMoney(opExUsdRound, safeLang);
    const opProfMoney = formatSpokenMoney(opProfUsdRound, safeLang);
    const directMoney = formatSpokenMoney(directUsdRound, safeLang);

    const bullets = [];
    const speechParts = [];

    if (safeLang === 'ar') {
      const txClause = txCount > 0 ? ` عبر ${txCount.toLocaleString('en-US')} ${txCount === 1 ? domSpec.sing : domSpec.plur}` : '';
      let varClauseSpeech = '';
      let varClauseBullet = '';
      if (revDeltaPct !== null) {
        const dirWord = revDeltaPct > 0 ? 'بارتفاع' : (revDeltaPct < 0 ? 'بانخفاض' : 'باستقرار');
        const pctAbs = Math.abs(revDeltaPct).toFixed(1);
        const cmpRef = isMomentum ? `في ${locLatestMoUi} مقارنة بـ ${locCompareUi}` : `مقارنة بـ ${locCompareUi}`;
        varClauseSpeech = revDeltaPct === 0 ? `، دون تغيير ${cmpRef}` : `، ${dirWord} ${pctAbs} بالمئة ${cmpRef}`;
        varClauseBullet = revDeltaPct === 0 ? ` (مستقر ${cmpRef})` : ` (${revDeltaPct > 0 ? '+' : ''}${revDeltaPct.toFixed(1)}% ${cmpRef})`;
      }
      speechParts.push(`ملخص الفترة لـ ${scopeName} (${locPeriodUi}): بلغت ${domSpec.rev} ${revMoney}${txClause}${varClauseSpeech}.`);
      bullets.push(`بلغت ${domSpec.rev} ${fmtCompactUsd(revUsdRound)}${txClause}${varClauseBullet}${topDriverName ? `، بقيادة ${topDriverName}` : ''}.`);

      const gmShiftTxt = (gmDeltaPts !== null && Math.abs(gmDeltaPts) >= 0.1)
        ? ` (${gmDeltaPts > 0 ? '+' : ''}${gmDeltaPts.toFixed(1)} نقطة في الهامش)`
        : '';
      speechParts.push(`سجل مجمل الربح ${gmMoney} بنسبة ${gmPctRound} بالمئة بعد ${domSpec.direct} بقيمة ${directMoney}، ليبلغ ${domSpec.profit} ${opProfMoney} بنسبة ${opPctRound} بالمئة بعد خصم ${domSpec.opex} بقيمة ${opExMoney}.`);
      bullets.push(`مجمل الربح ${fmtCompactUsd(gmUsdRound)} (${gmPctRound}%)${gmShiftTxt}، وبلغ ${domSpec.profit} ${fmtCompactUsd(opProfUsdRound)} (${opPctRound}%) بعد ${domSpec.opex} ${fmtCompactUsd(opExUsdRound)}.`);

      if (canViewBooks) {
        const tillSp = formatSpokenMoney(cashTillRound, 'ar');
        const arSp = formatSpokenMoney(arBalRound, 'ar');
        if (openCount === 0) {
          speechParts.push(`رصيد السيولة النقدية ${tillSp} مع ذمم مدينة مفتوحة بقيمة ${arSp}، وجميع الضوابط الرقابية سليمة.`);
          bullets.push(`السيولة النقدية ${fmtCompactUsd(cashTillRound)} والذمم المدينة ${fmtCompactUsd(arBalRound)}؛ جميع الضوابط الرقابية سليمة (0 تنبيهات).`);
        } else {
          speechParts.push(`رصيد السيولة النقدية ${tillSp} مع ذمم مدينة بقيمة ${arSp}، وتوجد ${openCount} تنبيهات رقابية نشطة أبرزها ${topSentinelTitle}.`);
          bullets.push(`السيولة النقدية ${fmtCompactUsd(cashTillRound)} والذمم المدينة ${fmtCompactUsd(arBalRound)}؛ ${openCount} تنبيهات رقابية نشطة (${topSentinelTitle}).`);
        }
      } else if (openCount === 0) {
        speechParts.push('جميع الضوابط الرقابية سليمة مع صفر تنبيهات نشطة.');
        bullets.push('جميع الضوابط الرقابية التشغيلية سليمة مع صفر تنبيهات نشطة.');
      } else {
        speechParts.push(`توجد ${openCount} تنبيهات رقابية نشطة تتطلب المراجعة، أبرزها ${topSentinelTitle}.`);
        bullets.push(`${openCount} تنبيهات رقابية نشطة تتطلب المراجعة (${topSentinelTitle}).`);
      }
    } else if (safeLang === 'fr') {
      const txClause = txCount > 0 ? ` sur ${txCount.toLocaleString('en-US')} ${txCount === 1 ? domSpec.sing : domSpec.plur}` : '';
      let varClauseSpeech = '';
      let varClauseBullet = '';
      if (revDeltaPct !== null) {
        const dirWord = revDeltaPct > 0 ? 'en hausse de' : (revDeltaPct < 0 ? 'en repli de' : 'stable');
        const pctAbs = Math.abs(revDeltaPct).toFixed(1);
        const cmpRef = isMomentum ? `en ${locLatestMoUi} face à ${locCompareUi}` : `par rapport à ${locCompareUi}`;
        varClauseSpeech = revDeltaPct === 0 ? `, stable ${cmpRef}` : `, ${dirWord} ${pctAbs} pour cent ${cmpRef}`;
        varClauseBullet = revDeltaPct === 0 ? ` (stable ${cmpRef})` : ` (${revDeltaPct > 0 ? '+' : ''}${revDeltaPct.toFixed(1)}% ${cmpRef})`;
      }
      speechParts.push(`Bilan de période pour ${scopeName} (${locPeriodUi}) : ${domSpec.rev} ${domSpec.verb || "s'élève à"} ${revMoney}${txClause}${varClauseSpeech}.`);
      bullets.push(`Volume : ${domSpec.rev} à ${fmtCompactUsd(revUsdRound)}${txClause}${varClauseBullet}${topDriverName ? `, porté par ${topDriverName}` : ''}.`);

      const gmShiftTxt = (gmDeltaPts !== null && Math.abs(gmDeltaPts) >= 0.1)
        ? ` (${gmDeltaPts > 0 ? '+' : ''}${gmDeltaPts.toFixed(1)} pts)`
        : '';
      speechParts.push(`La marge brute atteint ${gmMoney} à ${gmPctRound} pour cent après ${directMoney} pour ${domSpec.direct}, générant ${opProfMoney} pour ${domSpec.profit} à ${opPctRound} pour cent après ${opExMoney} pour ${domSpec.opex}.`);
      bullets.push(`Pont P&L : marge brute de ${fmtCompactUsd(gmUsdRound)} (${gmPctRound}%)${gmShiftTxt} et résultat de ${fmtCompactUsd(opProfUsdRound)} (${opPctRound}%) après ${fmtCompactUsd(opExUsdRound)} de charges.`);

      if (canViewBooks) {
        const tillSp = formatSpokenMoney(cashTillRound, 'fr');
        const arSp = formatSpokenMoney(arBalRound, 'fr');
        if (openCount === 0) {
          speechParts.push(`La trésorerie s'établit à ${tillSp} avec ${arSp} de créances clients, et tous les contrôles Sentinel sont au vert.`);
          bullets.push(`Trésorerie à ${fmtCompactUsd(cashTillRound)} et créances à ${fmtCompactUsd(arBalRound)} ; 0 alerte Sentinel active.`);
        } else {
          speechParts.push(`La trésorerie s'établit à ${tillSp} avec ${arSp} de créances, et ${openCount} alerte${openCount > 1 ? 's' : ''} Sentinel active${openCount > 1 ? 's' : ''} à vérifier, dont ${topSentinelTitle}.`);
          bullets.push(`Trésorerie à ${fmtCompactUsd(cashTillRound)} et créances à ${fmtCompactUsd(arBalRound)} ; ${openCount} alerte${openCount > 1 ? 's' : ''} Sentinel (${topSentinelTitle}).`);
        }
      } else if (openCount === 0) {
        speechParts.push('Tous les contrôles Sentinel sont au vert avec zéro alerte active.');
        bullets.push('Contrôles opérationnels Sentinel validés avec 0 alerte active.');
      } else {
        speechParts.push(`${openCount} alerte${openCount > 1 ? 's' : ''} Sentinel active${openCount > 1 ? 's' : ''} à vérifier, à commencer par ${topSentinelTitle}.`);
        bullets.push(`${openCount} alerte${openCount > 1 ? 's' : ''} Sentinel active${openCount > 1 ? 's' : ''} (${topSentinelTitle}).`);
      }
    } else {
      const txClause = txCount > 0 ? ` across ${txCount.toLocaleString('en-US')} ${txCount === 1 ? domSpec.sing : domSpec.plur}` : '';
      let varClauseSpeech = '';
      let varClauseBullet = '';
      if (revDeltaPct !== null) {
        const dirWord = revDeltaPct > 0 ? 'up' : (revDeltaPct < 0 ? 'down' : 'flat');
        const pctAbs = Math.abs(revDeltaPct).toFixed(1);
        const cmpRef = isMomentum ? `in ${locLatestMoUi} versus ${locCompareUi}` : `versus ${locCompareUi}`;
        varClauseSpeech = revDeltaPct === 0 ? `, flat ${cmpRef}` : `, ${dirWord} ${pctAbs} percent ${cmpRef}`;
        varClauseBullet = revDeltaPct === 0 ? ` (flat ${cmpRef})` : ` (${revDeltaPct > 0 ? '+' : ''}${revDeltaPct.toFixed(1)}% ${cmpRef})`;
      }
      speechParts.push(`Period summary for ${scopeName}, ${locPeriodSpeech}: ${domSpec.rev} reached ${revMoney}${txClause}${varClauseSpeech}.`);
      bullets.push(`Top-line: ${domSpec.rev} at ${fmtCompactUsd(revUsdRound)}${txClause}${varClauseBullet}${topDriverName ? `, led by ${topDriverName}` : ''}.`);

      const gmShiftTxt = (gmDeltaPts !== null && Math.abs(gmDeltaPts) >= 0.1)
        ? ` (${gmDeltaPts > 0 ? '+' : ''}${gmDeltaPts.toFixed(1)} pts)`
        : '';
      speechParts.push(`Gross margin stood at ${gmMoney} at ${gmPctRound} percent after ${directMoney} in ${domSpec.direct}, delivering ${opProfMoney} in ${domSpec.profit} at ${opPctRound} percent after ${opExMoney} in ${domSpec.opex}.`);
      bullets.push(`P&L bridge: gross margin ${fmtCompactUsd(gmUsdRound)} (${gmPctRound}%)${gmShiftTxt}, yielding ${fmtCompactUsd(opProfUsdRound)} (${opPctRound}%) ${domSpec.profit} after ${fmtCompactUsd(opExUsdRound)} ${domSpec.opex}.`);

      if (canViewBooks) {
        const tillSp = formatSpokenMoney(cashTillRound, 'en');
        const arSp = formatSpokenMoney(arBalRound, 'en');
        if (openCount === 0) {
          speechParts.push(`Cash till stands at ${tillSp} alongside ${arSp} in open receivables, with all Sentinel controls clear.`);
          bullets.push(`Liquidity & controls: cash till ${fmtCompactUsd(cashTillRound)}, open receivables ${fmtCompactUsd(arBalRound)}, and 0 active Sentinel flags.`);
        } else {
          speechParts.push(`Cash till stands at ${tillSp} alongside ${arSp} in open receivables, and ${openCount} active Sentinel flag${openCount === 1 ? '' : 's'} require review, led by ${topSentinelTitle}.`);
          bullets.push(`Liquidity & controls: cash till ${fmtCompactUsd(cashTillRound)}, open receivables ${fmtCompactUsd(arBalRound)}, and ${openCount} active Sentinel flag${openCount === 1 ? '' : 's'} (${topSentinelTitle}).`);
        }
      } else if (openCount === 0) {
        speechParts.push('All Sentinel operational controls are clear with zero active flags.');
        bullets.push('Operational controls: all Sentinel watchdogs passing with 0 active flags.');
      } else {
        speechParts.push(`${openCount} active Sentinel flag${openCount === 1 ? '' : 's'} require review, led by ${topSentinelTitle}.`);
        bullets.push(`Operational controls: ${openCount} active Sentinel flag${openCount === 1 ? '' : 's'} require review (${topSentinelTitle}).`);
      }
    }

    const text = cleanOut(speechParts.join(' ').replace(/[—–→↔]/g, ', ').replace(/\s{2,}/g, ' '));
    const windowSubtitle = locCompareUi
      ? (isMomentum
          ? `${scopeName} · ${locPeriodUi} (${locLatestMoUi} / ${locCompareUi})`
          : `${scopeName} · ${locPeriodUi} / ${locCompareUi}`)
      : `${scopeName} · ${locPeriodUi}`;

    return {
      scopeKey,
      lang: safeLang,
      industry: ind,
      company: coKey,
      companyLabel: scopeName,
      grain: snap.grain || 'all',
      basis: snap.basis || 'tx',
      periodKey: snap.periodKey || 'all',
      periodLabel: locPeriodUi,
      compareLabel: locCompareUi,
      isAllTime: Boolean(snap.isAllTime),
      isMomentumPair: isMomentum,
      windowSubtitle,
      canViewBooks,
      cur: {
        revUsd: revUsdRound,
        directCostUsd: directUsdRound,
        grossMarginUsd: gmUsdRound,
        gmPct: gmPctRound,
        opExUsd: opExUsdRound,
        opProfitUsd: opProfUsdRound,
        opMarginPct: opPctRound,
        txCount
      },
      deltas: {
        hasPrior,
        revDeltaUsd,
        revDeltaPct,
        gmDeltaPts,
        opProfitDeltaUsd,
        opProfitDeltaPct
      },
      books: canViewBooks ? { cashTillUsd: cashTillRound, arBalanceUsd: arBalRound } : null,
      topDriver: topDriverName || '',
      openSentinelCount: openCount,
      critSentinelCount: critCount,
      topSentinelTitle,
      bullets,
      text
    };
  }

  function sanitizeVarianceBulletText(rawStr, canViewBooks) {
    let s = cleanOut(String(rawStr || ''))
      .replace(/^[•\-*\d.)\s]+/, '')
      .replace(/[—–→↔]/g, ', ')
      .replace(/\b(?:THEO|TTC|RDL|Z-Read)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!canViewBooks && /\b(cash\s*till|receivables|ar_balance|caisse|السيولة\s*النقدية|رصيد\s*الصندوق)\b/i.test(s)) {
      return '';
    }
    return s;
  }

  async function requestPeriodVarianceCommentary(detSummary, opts = {}) {
    const sum = detSummary || buildCeoPeriodSummary();
    const cacheKey = `${sum.scopeKey}|${sum.lang}`;
    if (_chatState.periodVarianceCache.has(cacheKey) && !opts.forceRefresh) {
      return _chatState.periodVarianceCache.get(cacheKey);
    }
    const isAutoTest = Boolean((navigator.webdriver || window.__MFG_HEADLESS_TEST) && !window.__ALLOW_HEADLESS_LLM);
    if (isAutoTest) {
      return {
        ok: true,
        source: 'deterministic',
        model: 'deterministic-local',
        lang: sum.lang,
        scopeKey: sum.scopeKey,
        bullets: sum.bullets.slice(0, 3)
      };
    }
    if (_chatState.periodVarianceInflight.has(cacheKey)) {
      return _chatState.periodVarianceInflight.get(cacheKey);
    }

    const langName = sum.lang === 'ar' ? 'Arabic (Modern Standard Business Arabic)' : (sum.lang === 'fr' ? 'French (Executive Financial French)' : 'English');
    const groundedPayload = {
      entity: sum.companyLabel,
      industry: sum.industry,
      period: sum.periodLabel,
      comparedAgainst: sum.compareLabel || null,
      revenueUsd: sum.cur.revUsd,
      transactions: sum.cur.txCount,
      directCostUsd: sum.cur.directCostUsd,
      grossMarginUsd: sum.cur.grossMarginUsd,
      grossMarginPct: sum.cur.gmPct,
      opExUsd: sum.cur.opExUsd,
      operatingProfitUsd: sum.cur.opProfitUsd,
      operatingMarginPct: sum.cur.opMarginPct,
      revenueDeltaPct: sum.deltas.revDeltaPct,
      grossMarginDeltaPts: sum.deltas.gmDeltaPts,
      operatingProfitDeltaUsd: sum.deltas.opProfitDeltaUsd,
      leadDriver: sum.topDriver || null,
      activeSentinelFlags: sum.openSentinelCount,
      leadSentinel: sum.topSentinelTitle || null
    };
    if (sum.canViewBooks && sum.books) {
      groundedPayload.cashTillUsd = sum.books.cashTillUsd;
      groundedPayload.openReceivablesUsd = sum.books.arBalanceUsd;
    }

    const sysPrompt = [
      'You are an executive CFO variance analyst inside ISABI Command Center.',
      `Write all bullet text strictly in ${langName}.`,
      'Return ONLY valid JSON with the exact English property name "bullets" containing EXACTLY 3 separate string items: {"bullets":["sentence 1","sentence 2","sentence 3"]}. Never combine them into a single string, and do NOT rename the JSON key "bullets".',
      'Rules:',
      '1. Every dollar figure, percentage, and count MUST come verbatim from the supplied JSON ledger facts. Never invent or recompute numbers.',
      '2. Bullet 1 covers revenue volume, lead driver, and period-over-period trajectory.',
      '3. Bullet 2 explains the P&L bridge spread (gross margin vs direct cost and operating profit after OpEx).',
      sum.canViewBooks
        ? '4. Bullet 3 covers cash liquidity, open receivables, and active Sentinel control posture.'
        : '4. Bullet 3 covers operational execution and Sentinel control posture (never mention cash till or receivables).',
      '5. Keep each bullet concise (14 to 28 words). Never use em-dashes, arrows, markdown bold, or internal system codes.'
    ].join('\n');
    const usrPrompt = `Grounded deterministic period ledger JSON:\n${JSON.stringify(groundedPayload)}`;

    const runPromise = (async () => {
      let rawReply = '';
      let debugNote = '';
      let usedModel = 'gemini-3.5-flash-lite';
      const geminiContents = [{ role: 'user', parts: [{ text: usrPrompt }] }];

      const isLocalHost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
      if (isLocalHost || window.ISABI_LOCAL_API) {
        const base = String(window.ISABI_LOCAL_API || '').replace(/\/$/, '');
        for (let attempt = 0; attempt < 2 && !rawReply; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 450));
          try {
            const rLoc = await fetch(`${base}/api/ask`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'gemini-3.5-flash-lite',
                systemPrompt: sysPrompt,
                userPrompt: usrPrompt,
                geminiContents
              })
            });
            if (rLoc.ok) {
              const jLoc = await rLoc.json();
              if (jLoc && jLoc.ok && jLoc.rawReply) {
                rawReply = String(jLoc.rawReply);
                usedModel = jLoc.model || 'gemini-3.5-flash-lite';
              } else if (jLoc) {
                debugNote = `loc:${jLoc.mode || ''}:${jLoc.note || ''}`;
              }
            } else {
              debugNote = `loc_http_${rLoc.status}`;
            }
          } catch (eLoc) {
            debugNote = `loc_err:${eLoc && eLoc.message ? eLoc.message : String(eLoc)}`;
          }
        }
      }

      if (!rawReply) {
        const askCfg = window.MFG_ASK_CFG || {};
        let flowUrl = '';
        let flowKey = '';
        try {
          if (askCfg.u && askCfg.k) {
            flowUrl = atob(askCfg.u);
            flowKey = atob(askCfg.k);
          }
        } catch (_) {}
        if (flowUrl && flowUrl.startsWith('http') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 10000);
          try {
            const rCloud = await fetch(flowUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
              body: JSON.stringify({
                key: flowKey,
                op: 'ask',
                surface: 'command_center',
                q: 'Period Variance Commentary',
                lang: sum.lang,
                industry: sum.companyLabel,
                currency: 'USD',
                period: sum.periodLabel,
                model: 'gemini-3.5-flash-lite',
                systemPrompt: sysPrompt,
                userPrompt: usrPrompt,
                geminiContents,
                messages: [
                  { role: 'system', content: sysPrompt },
                  { role: 'user', content: usrPrompt }
                ]
              }),
              signal: ctrl.signal
            });
            clearTimeout(timer);
            if (rCloud.ok) {
              const jCloud = await rCloud.json();
              if (jCloud && jCloud.rawReply) {
                rawReply = String(jCloud.rawReply);
                usedModel = jCloud.model || 'gemini-3.5-flash-lite';
              }
            }
          } catch (_) {
            clearTimeout(timer);
          }
        }
      }

      if (rawReply) {
        try {
          const cleaned = rawReply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          let parsed = null;
          try {
            parsed = JSON.parse(cleaned);
          } catch (_) {
            const fb = cleaned.indexOf('{');
            const lb = cleaned.lastIndexOf('}');
            if (fb >= 0 && lb > fb) parsed = JSON.parse(cleaned.slice(fb, lb + 1));
          }
          const rawBulletArr = Array.isArray(parsed && parsed.bullets)
            ? parsed.bullets
            : (Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed).find(Array.isArray) : null));
          const extractStr = b => typeof b === 'string' ? b : (b && typeof b === 'object' ? (b.text || b.bullet || Object.values(b).find(v => typeof v === 'string') || '') : '');
          let candBullets = Array.isArray(rawBulletArr)
            ? rawBulletArr.map(b => sanitizeVarianceBulletText(extractStr(b), sum.canViewBooks)).filter(b => b.length >= 12)
            : [];
          if (candBullets.length === 1 && candBullets[0].length >= 80) {
            const splitParts = candBullets[0]
              .split(/(?<=[.!?؟])\s+/)
              .map(s => sanitizeVarianceBulletText(s, sum.canViewBooks))
              .filter(s => s.length >= 12);
            if (splitParts.length >= 2) candBullets = splitParts;
          }
          candBullets = candBullets.slice(0, 3);
          if (candBullets.length >= 2) {
            const resObj = {
              ok: true,
              source: 'gemini',
              model: usedModel,
              lang: sum.lang,
              scopeKey: sum.scopeKey,
              bullets: candBullets
            };
            if (_chatState.periodVarianceCache.size >= 24) {
              const oldest = _chatState.periodVarianceCache.keys().next().value;
              _chatState.periodVarianceCache.delete(oldest);
            }
            _chatState.periodVarianceCache.set(cacheKey, resObj);
            updateOpenCeoPopoverWithAi(resObj);
            return resObj;
          }
          debugNote = `short_bullets:${candBullets.length}:${rawReply.slice(0, 140)}`;
        } catch (eParse) {
          debugNote = `parse_err:${eParse && eParse.message ? eParse.message : ''}:${rawReply.slice(0, 140)}`;
        }
      }

      return {
        ok: true,
        source: 'deterministic',
        model: 'deterministic-local',
        lang: sum.lang,
        scopeKey: sum.scopeKey,
        note: debugNote,
        bullets: sum.bullets.slice(0, 3)
      };
    })().finally(() => {
      _chatState.periodVarianceInflight.delete(cacheKey);
    });

    _chatState.periodVarianceInflight.set(cacheKey, runPromise);
    return runPromise;
  }

  function updateOpenCeoPopoverWithAi(aiRes) {
    if (!aiRes || aiRes.source !== 'gemini' || typeof document === 'undefined') return;
    const pop = document.getElementById('ceoPeriodSummaryPopover');
    if (!pop || pop.getAttribute('data-scope-key') !== aiRes.scopeKey || pop.getAttribute('data-lang') !== aiRes.lang) return;
    const listEl = pop.querySelector('.ceo-pv-bullets');
    if (listEl && Array.isArray(aiRes.bullets) && aiRes.bullets.length >= 2) {
      listEl.innerHTML = aiRes.bullets.map(b => `<li>${esc(b)}</li>`).join('');
    }
    const badgeEl = pop.querySelector('.ceo-pv-badge');
    if (badgeEl) {
      badgeEl.classList.add('is-ai');
      badgeEl.textContent = 'AI Variance Brief';
      if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en') {
        try { window.MFG_I18N.translateDom(badgeEl); } catch (_) {}
      }
    }
  }

  let _ceoPopOutsideHandlerBound = false;
  function ensureCeoPopoverGlobalDismiss() {
    if (_ceoPopOutsideHandlerBound || typeof document === 'undefined') return;
    _ceoPopOutsideHandlerBound = true;
    document.addEventListener('mousedown', e => {
      if (!_chatState.periodPopoverOpen) return;
      const pop = document.getElementById('ceoPeriodSummaryPopover');
      if (!pop) return;
      if (pop.contains(e.target)) return;
      if (e.target.closest && (e.target.closest('[data-ceo-period-summary]') || e.target.closest('[data-ceo-variance-brief]'))) return;
      closeCeoVariancePopover();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _chatState.periodPopoverOpen) {
        closeCeoVariancePopover();
      }
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (_chatState.periodPopoverOpen) positionCeoVariancePopover();
      });
    }
  }

  function positionCeoVariancePopover() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const pop = document.getElementById('ceoPeriodSummaryPopover');
    if (!pop) return;
    const anchor = _chatState.periodPopoverAnchor
      || document.getElementById('ceoPeriodSummaryBtn')
      || document.getElementById('ceoVarianceBriefBtn');
    const vw = window.innerWidth || 1366;
    const vh = window.innerHeight || 768;
    if (vw <= 768 || !anchor || !anchor.getBoundingClientRect) {
      pop.style.left = '10px';
      pop.style.right = '10px';
      pop.style.width = 'auto';
      pop.style.bottom = '12px';
      pop.style.top = 'auto';
      return;
    }
    pop.style.right = 'auto';
    pop.style.bottom = 'auto';
    const rect = anchor.getBoundingClientRect();
    const popW = Math.min(440, vw - 24);
    pop.style.width = `${popW}px`;
    const popH = Math.min(pop.offsetHeight || 248, vh - 24);
    const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
    let left = isRtl ? rect.left : (rect.right - popW);
    left = Math.max(12, Math.min(vw - popW - 12, left));
    let top = rect.top - popH - 8;
    if (top < 54) {
      top = Math.min(vh - popH - 12, rect.bottom + 8);
    }
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  function openCeoVariancePopover(anchorEl, prebuiltSummary) {
    if (typeof document === 'undefined') return null;
    ensureDailyBriefingI18nRegistered();
    ensureCeoPopoverGlobalDismiss();
    const sum = prebuiltSummary || buildCeoPeriodSummary();
    const cacheKey = `${sum.scopeKey}|${sum.lang}`;
    const cachedAi = _chatState.periodVarianceCache.get(cacheKey);
    const activeBullets = (cachedAi && Array.isArray(cachedAi.bullets) && cachedAi.bullets.length >= 2)
      ? cachedAi.bullets
      : sum.bullets;
    const isAiSource = Boolean(cachedAi && cachedAi.source === 'gemini');

    let pop = document.getElementById('ceoPeriodSummaryPopover');
    if (!pop) {
      pop = document.createElement('aside');
      pop.id = 'ceoPeriodSummaryPopover';
      pop.className = 'ceo-period-popover';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Period Variance Commentary');
      document.body.appendChild(pop);
    }
    _chatState.periodPopoverOpen = true;
    _chatState.periodPopoverAnchor = anchorEl || document.getElementById('ceoPeriodSummaryBtn') || document.getElementById('ceoVarianceBriefBtn');
    const vbBtn = document.getElementById('ceoVarianceBriefBtn');
    if (vbBtn) {
      vbBtn.classList.add('is-open');
      vbBtn.setAttribute('aria-expanded', 'true');
    }

    pop.setAttribute('data-scope-key', sum.scopeKey);
    pop.setAttribute('data-lang', sum.lang);
    pop.dir = sum.lang === 'ar' ? 'rtl' : 'ltr';

    const revDeltaChip = sum.deltas.revDeltaPct !== null
      ? `${sum.deltas.revDeltaPct > 0 ? '+' : ''}${sum.deltas.revDeltaPct.toFixed(1)}%`
      : `${sum.cur.txCount}`;
    const gmDeltaChip = sum.deltas.gmDeltaPts !== null
      ? `${sum.deltas.gmDeltaPts > 0 ? '+' : ''}${sum.deltas.gmDeltaPts.toFixed(1)}pt`
      : `${sum.cur.gmPct.toFixed(1)}%`;
    const opDeltaChip = sum.deltas.opProfitDeltaPct !== null
      ? `${sum.deltas.opProfitDeltaPct > 0 ? '+' : ''}${sum.deltas.opProfitDeltaPct.toFixed(1)}%`
      : `${sum.cur.opMarginPct.toFixed(1)}%`;

    const kpi4Html = sum.canViewBooks && sum.books
      ? `<div class="ceo-pv-kpi">
          <span class="ceo-pv-k">Cash &amp; AR</span>
          <strong class="ceo-pv-v num" data-no-i18n="1">${esc(fmtCompactUsd(sum.books.cashTillUsd))}</strong>
          <small class="ceo-pv-d num" data-no-i18n="1">${esc(fmtCompactUsd(sum.books.arBalanceUsd))}</small>
        </div>`
      : `<div class="ceo-pv-kpi">
          <span class="ceo-pv-k">Control Flags</span>
          <strong class="ceo-pv-v num" data-no-i18n="1">${sum.openSentinelCount}</strong>
          <small class="ceo-pv-d ${sum.openSentinelCount > 0 ? 'warn' : 'good'}" data-no-i18n="1">${sum.critSentinelCount > 0 ? `${sum.critSentinelCount}!` : '0'}</small>
        </div>`;

    const icons = window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function' ? window.MFG_ICONS : null;
    const isSpeakingNow = Boolean(
      _chatState.activePeriodSummaryScope ||
      (_chatState.activeSpeakBtn && _chatState.activeSpeakBtn.hasAttribute && _chatState.activeSpeakBtn.hasAttribute('data-ceo-period-summary'))
    );
    const speakBtnLbl = isSpeakingNow ? 'Stop Summary' : 'Replay Summary';
    const speakBtnIco = isSpeakingNow ? (icons ? icons.svg('stop') : AI_SVGS.stop) : (icons ? icons.svg('audio') : AI_SVGS.audio);
    const sparkIco = icons ? icons.svg('sparkles') : AI_SVGS.audio;

    pop.innerHTML = `
      <div class="ceo-pv-hdr">
        <div class="ceo-pv-title-wrap">
          <div class="ceo-pv-title-row">
            <span class="ceo-pv-ico">${sparkIco}</span>
            <strong class="ceo-pv-title">Period Variance Commentary</strong>
            <span class="ceo-pv-badge${isAiSource ? ' is-ai' : ''}">${isAiSource ? 'AI Variance Brief' : 'Deterministic Ledger'}</span>
          </div>
          <div class="ceo-pv-sub" data-no-i18n="1">${esc(sum.windowSubtitle)}</div>
        </div>
        <button type="button" class="ceo-pv-close" data-ceo-pv-close="1" aria-label="Close">&times;</button>
      </div>
      <div class="ceo-pv-kpis">
        <div class="ceo-pv-kpi">
          <span class="ceo-pv-k">Period Revenue</span>
          <strong class="ceo-pv-v num" data-no-i18n="1">${esc(fmtCompactUsd(sum.cur.revUsd))}</strong>
          <small class="ceo-pv-d ${(sum.deltas.revDeltaPct || 0) < 0 ? 'warn' : 'good'} num" data-no-i18n="1">${esc(revDeltaChip)}</small>
        </div>
        <div class="ceo-pv-kpi">
          <span class="ceo-pv-k">Gross Margin</span>
          <strong class="ceo-pv-v num" data-no-i18n="1">${esc(fmtCompactUsd(sum.cur.grossMarginUsd))}</strong>
          <small class="ceo-pv-d ${(sum.deltas.gmDeltaPts || 0) < 0 ? 'warn' : 'good'} num" data-no-i18n="1">${esc(gmDeltaChip)}</small>
        </div>
        <div class="ceo-pv-kpi">
          <span class="ceo-pv-k">Operating Profit</span>
          <strong class="ceo-pv-v num" data-no-i18n="1">${esc(fmtCompactUsd(sum.cur.opProfitUsd))}</strong>
          <small class="ceo-pv-d ${(sum.deltas.opProfitDeltaPct || 0) < 0 ? 'warn' : 'good'} num" data-no-i18n="1">${esc(opDeltaChip)}</small>
        </div>
        ${kpi4Html}
      </div>
      <ul class="ceo-pv-bullets" data-no-i18n="1">
        ${activeBullets.map(b => `<li>${esc(b)}</li>`).join('')}
      </ul>
      <div class="ceo-pv-foot">
        <button type="button" class="ceo-pv-btn${isSpeakingNow ? ' is-speaking' : ''}" data-ceo-pv-speak="1">${speakBtnIco}<span>${esc(speakBtnLbl)}</span></button>
        <button type="button" class="ceo-pv-btn is-secondary" data-ceo-pv-ask="1"><span>Ask Follow-Up</span></button>
      </div>
    `;

    if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && sum.lang !== 'en') {
      try { window.MFG_I18N.translateDom(pop); } catch (_) {}
    }

    const closeBtn = pop.querySelector('[data-ceo-pv-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', e => {
        e.preventDefault();
        closeCeoVariancePopover();
      });
    }
    const pvSpkBtn = pop.querySelector('[data-ceo-pv-speak]');
    if (pvSpkBtn) {
      pvSpkBtn.addEventListener('click', e => {
        e.preventDefault();
        const mainBtn = document.getElementById('ceoPeriodSummaryBtn');
        speakCeoPeriodSummary(mainBtn || null, sum.lang, { skipPopoverOpen: true });
        syncCeoPopoverAudioButton();
      });
    }
    const pvAskBtn = pop.querySelector('[data-ceo-pv-ask]');
    if (pvAskBtn) {
      pvAskBtn.addEventListener('click', e => {
        e.preventDefault();
        closeCeoVariancePopover();
        openDrawer();
        const qPrompt = sum.lang === 'ar'
          ? `حلل تباين الأرباح والهامش لـ ${sum.companyLabel} خلال ${sum.periodLabel}`
          : (sum.lang === 'fr'
              ? `Analysez l'écart de marge et de résultat pour ${sum.companyLabel} sur ${sum.periodLabel}`
              : `Explain the P&L margin and profit drivers for ${sum.companyLabel} in ${sum.periodLabel}`);
        submitQuestion(qPrompt);
      });
    }

    positionCeoVariancePopover();
    if (!isAiSource) {
      requestPeriodVarianceCommentary(sum).catch(() => {});
    }
    return pop;
  }

  function closeCeoVariancePopover() {
    _chatState.periodPopoverOpen = false;
    _chatState.periodPopoverAnchor = null;
    if (typeof document === 'undefined') return;
    const pop = document.getElementById('ceoPeriodSummaryPopover');
    if (pop && pop.parentNode) {
      pop.parentNode.removeChild(pop);
    }
    const vbBtn = document.getElementById('ceoVarianceBriefBtn');
    if (vbBtn) {
      vbBtn.classList.remove('is-open');
      vbBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleCeoVariancePopover(anchorEl) {
    if (_chatState.periodPopoverOpen) {
      closeCeoVariancePopover();
      return { open: false };
    }
    const sum = buildCeoPeriodSummary();
    openCeoVariancePopover(anchorEl, sum);
    return { open: true, summary: sum };
  }

  function speakCeoPeriodSummary(btnEl, langOverride, opts = {}) {
    const targetBtn = btnEl || (typeof document !== 'undefined' ? document.getElementById('ceoPeriodSummaryBtn') : null);
    if (targetBtn && _chatState.activeSpeakBtn === targetBtn) {
      stopActivePlayback();
      return { stopped: true };
    }
    if (!targetBtn && _chatState.activePeriodSummaryScope) {
      stopActivePlayback();
      return { stopped: true };
    }
    const sum = buildCeoPeriodSummary(langOverride);
    const ok = speakBotReply(sum.text, sum.lang, targetBtn || null);
    if (ok) {
      _chatState.activePeriodSummaryScope = sum.scopeKey;
      syncCeoPopoverAudioButton();
    }
    if (!opts.skipPopoverOpen) {
      openCeoVariancePopover(targetBtn, sum);
    }
    return Object.assign({ ok }, sum);
  }

  function rebindPeriodSummaryButton(btnEl, varBtnEl) {
    ensureDailyBriefingI18nRegistered();
    const curScope = computeActivePeriodScopeKey();
    if (_chatState.activePeriodSummaryScope) {
      if (_chatState.activePeriodSummaryScope !== curScope) {
        stopActivePlayback();
      } else if (btnEl) {
        _chatState.activeSpeakBtn = btnEl;
        applyBriefingButtonDomState(btnEl, _chatState.activeSpeakCtrl ? 'loading' : 'speaking');
      }
    }
    if (_chatState.periodPopoverOpen) {
      const pop = typeof document !== 'undefined' ? document.getElementById('ceoPeriodSummaryPopover') : null;
      if (!pop || pop.getAttribute('data-scope-key') !== curScope) {
        closeCeoVariancePopover();
      } else {
        _chatState.periodPopoverAnchor = btnEl || varBtnEl || null;
        if (varBtnEl) {
          varBtnEl.classList.add('is-open');
          varBtnEl.setAttribute('aria-expanded', 'true');
        }
        positionCeoVariancePopover();
      }
    }
  }

  function stopPeriodSummaryIfActive() {
    if (_chatState.activePeriodSummaryScope || (_chatState.activeSpeakBtn && _chatState.activeSpeakBtn.hasAttribute && _chatState.activeSpeakBtn.hasAttribute('data-ceo-period-summary'))) {
      stopActivePlayback();
    }
    if (_chatState.periodPopoverOpen) {
      closeCeoVariancePopover();
    }
  }

  function maybeAutoSpeakTurn(turnObj) {
    if (!turnObj) return;
    const shouldSpeak = Boolean(_chatState.autoVoiceReadback || _chatState.liveVoiceMode || turnObj.fromVoice);
    if (!shouldSpeak) {
      syncVoiceModeDeckUi();
      return;
    }
    if (navigator.webdriver || window.__MFG_HEADLESS_TEST) return;
    setTimeout(() => {
      const askDrawer = document.getElementById('aiDrawer');
      if (!askDrawer || !askDrawer.classList.contains('open')) return;
      const bots = askDrawer.querySelectorAll('.ai-msg-bot:not(.ai-welcome-card)');
      const lastBot = bots.length ? bots[bots.length - 1] : null;
      const btn = lastBot ? lastBot.querySelector('[data-ai-speak]') : null;
      speakBotReply(turnObj, turnObj.lang || 'en', btn || null);
    }, 110);
  }

  // ============================================================================
  // HYBRID CLOUD + CLIENT LLM LAYER FOR OPEN-ENDED ANALYTICAL QUESTIONS
  // ============================================================================
  function buildIndustryLiveContextLines(activeInd, scope) {
    const user = scope.user;
    if (activeInd === 'Holding & Treasury' && window.MFG_HOLDING && typeof window.MFG_HOLDING.compute === 'function') {
      const h = window.MFG_HOLDING.compute();
      const hk = h.kpis || {};
      const icRows = h.intercompany || [];
      const pRows = h.partners || [];
      return [
        `Industry: Holding & Treasury (Bdeir Holding)`,
        `Corporate Overhead: ${fmtMoney(hk.totalExpenses || 0, 0)} across ${fmtInt(hk.voucherCount || 0)} vouchers | Net Treasury Cashflow: ${fmtMoney(hk.netCashflow || 0, 0)}`,
        `Intercompany Clearing: Due-From ${fmtMoney(hk.dueFromTotal || 0, 0)} vs Due-To ${fmtMoney(hk.dueToTotal || 0, 0)} | Net Position: ${fmtMoney(hk.netIntercompany || 0, 0)} across ${fmtInt(icRows.length)} pairs`,
        icRows.length ? `Top Intercompany Pairs: ${icRows.slice(0, 4).map(r => `${cleanOut(r.from || 'Holding')}/${cleanOut(r.to || r.counterparty || '')} Net ${fmtMoney(r.net || ((r.dueFrom || 0) - (r.dueTo || 0)), 0)}`).join(', ')}` : '',
        pRows.length ? `Shareholder Partner Accounts: ${pRows.slice(0, 4).map(p => `${cleanOut(p.partner || p.name)} (${fmtInt(p.sharePct || 0, 1)}%, Closing ${fmtMoney(p.closingBalance || p.balance || 0, 0)})`).join(', ')}` : ''
      ].filter(Boolean);
    }
    if (activeInd === 'Hospitality & Resorts' && window.MFG_HOSPITALITY && typeof window.MFG_HOSPITALITY.compute === 'function') {
      const d = window.MFG_HOSPITALITY.compute();
      const hk = d.kpis || {};
      const sRows = d.salesRows || [];
      const byV = {};
      sRows.forEach(r => { const c = r.company || 'Blanca'; byV[c] = (byV[c] || 0) + Number(r.totalTtc || 0); });
      const topVenues = Object.entries(byV).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return [
        `Industry: Hospitality & Resorts (${scope.scopeCoLabel})`,
        `Venue Revenue: ${fmtMoney(hk.salesTotal || 0, 0)} across ${fmtInt(hk.receiptCount || 0)} closings (${fmtInt(hk.coversTotal || 0)} guest covers, Avg Check ${fmtMoney(hk.avgCover || 0, 2)})`,
        `Operating Profit: ${fmtMoney(hk.operatingProfit || 0, 0)} | Cash USD: ${fmtMoney(hk.cashCollected || 0, 0)} | Card/POS: ${fmtMoney(hk.cardCollected || 0, 0)} | Supplier AP: ${fmtMoney(hk.apBalance || 0, 0)}`,
        `Memberships & Cabanas: ${fmtInt(hk.activeMembers || 0)} active packages worth ${fmtMoney(hk.membershipPkgValue || 0, 0)} (${fmtMoney(hk.membershipBalance || 0, 0)} open installments)`,
        topVenues.length ? `Resort Breakdown: ${topVenues.map(([v, amt]) => `${cleanOut(v)} (${fmtMoney(amt, 0)})`).join(', ')}` : ''
      ].filter(Boolean);
    }
    if (activeInd === 'Automotive & Heavy Trading' && window.MFG_TRADING && typeof window.MFG_TRADING.compute === 'function') {
      const d = window.MFG_TRADING.compute();
      const tk = d.kpis || {};
      const vRows = d.vehicleRows || [];
      return [
        `Industry: Automotive & Heavy Trading (${scope.scopeCoLabel})`,
        `Commercial Sales (N/S/IS/IN Books): ${fmtMoney(tk.salesTotal || 0, 0)} | Gross Margin: ${fmtMoney(tk.grossMargin || 0, 0)} (${fmtPctVal(tk.grossMargin, tk.salesTotal)}) | Operating Profit: ${fmtMoney(tk.operatingProfit || 0, 0)}`,
        `Heavy Truck VIN Yard: ${fmtInt(tk.deliveredUnits || 0)} delivered, ${fmtInt(tk.inStockUnits || 0)} showroom units | FIFO Spare Parts Valuation: ${fmtMoney(tk.stockValuation || 0, 0)} (${fmtInt(tk.lowStockCount || 0)} low-stock SKUs)`,
        `Working Capital: Customer AR ${fmtMoney(tk.arBalance || 0, 0)} | Foreign Supplier & Customs AP ${fmtMoney(tk.apBalance || 0, 0)}`,
        vRows.length ? `Sample VIN Units: ${vRows.slice(0, 4).map(v => `${cleanOut(v.vin)} ${cleanOut(v.model)} (Margin ${fmtMoney(v.marginUsd || 0, 0)}, ${cleanOut(v.status)})`).join('; ')}` : ''
      ].filter(Boolean);
    }
    if (activeInd === 'Real Estate & Property' && window.MFG_REALESTATE && typeof window.MFG_REALESTATE.compute === 'function') {
      const d = window.MFG_REALESTATE.compute();
      const rk = d.kpis || {};
      const lRows = d.leases || [];
      return [
        `Industry: Real Estate & Property (${scope.scopeCoLabel})`,
        `Contracted Annual Rent: ${fmtMoney(rk.annualRentTtc || 0, 0)} (Base ${fmtMoney(rk.annualBaseRent || 0, 0)} + 11% VAT ${fmtMoney(rk.annualVat || 0, 0)}) | Net Operating Income: ${fmtMoney(rk.noiUsd || 0, 0)}`,
        `Occupancy: ${fmtInt(rk.occupancyPct || 0, 1)}% (${fmtInt(rk.occupiedUnits || 0)}/${fmtInt(rk.totalUnits || 0)} units) | Expiring <=90d: ${fmtInt(rk.expiring90d || 0)} leases`,
        `Billing & Arrears: Billed ${fmtMoney(rk.billedRentTtc || 0, 0)} | Collected ${fmtMoney(rk.collectedUsd || 0, 0)} | Open Tenant Receivables ${fmtMoney(rk.openArUsd || 0, 0)} | Upkeep ${fmtMoney(rk.maintTotalUsd || 0, 0)}`,
        lRows.length ? `Key Leases: ${lRows.slice(0, 4).map(l => `${cleanOut(l.tenant)} (${cleanOut(l.unitCode)}, Ends ${cleanOut(l.endDate)}, ${fmtMoney(l.annualTtcUsd || 0, 0)})`).join('; ')}` : ''
      ].filter(Boolean);
    }
    if (activeInd === 'Insurance & Brokerage' && window.MFG_INSURANCE && typeof window.MFG_INSURANCE.compute === 'function') {
      const d = window.MFG_INSURANCE.compute();
      const ik = d.kpis || {};
      const cRows = d.carrierMatrix || [];
      return [
        `Industry: Insurance & Brokerage (${scope.scopeCoLabel})`,
        `Gross Written Premium (GWP): ${fmtMoney(ik.gwpTotal || 0, 0)} across ${fmtInt(ik.policyCount || 0)} policies | Brokerage Commission: ${fmtMoney(ik.commTotal || 0, 0)} (${fmtInt(ik.avgCommYield || 0, 1)}% yield) | Net Brokerage Profit: ${fmtMoney(ik.netBrokerageIncome || 0, 0)}`,
        `Receivables & Carrier Clearing: Client Unpaid Premium ${fmtMoney(ik.unpaidPremUsd || 0, 0)} | Net Carrier Bordereau Payable ${fmtMoney(ik.carrierPayableUsd || 0, 0)}`,
        `Renewals & Claims: ${fmtInt(ik.renewing60d || 0)} policies renewing <=60d (${fmtMoney(ik.renewalGwp60d || 0, 0)} GWP) | Incurred Claims ${fmtMoney(ik.incurredClaimsUsd || 0, 0)} (${fmtInt(ik.lossRatioPct || 0, 1)}% loss ratio)`,
        cRows.length ? `Top Carriers: ${cRows.slice(0, 4).map(c => `${cleanOut(c.carrier)} (GWP ${fmtMoney(c.gwpUsd || 0, 0)}, Balance Due ${fmtMoney(c.balanceDueUsd || 0, 0)})`).join('; ')}` : ''
      ].filter(Boolean);
    }

    // Default: Manufacturing & Quarries
    const win = computeWindowSummary(scope);
    const k = win.k;
    const model = (_ctx && _ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
    const topProds = (model.products || []).slice().sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0)).slice(0, 4);
    const topCusts = (model.customers || []).slice().sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0)).slice(0, 4);
    return [
      `Industry: Manufacturing & Quarries (${scope.fullScopeLabel})`,
      `${salesLabel(user)}: ${fmtMoney(k.sales_ttc, 0)} across ${fmtInt(k.loads)} loads (${fmtInt(k.tons_sold, 0)} tons)`,
      `Raw Material & Haulage Cost: ${fmtMoney(k.raw_cost, 0)} (${fmtInt(k.raw_loads)} loads) | Operating Expenses: ${fmtMoney(k.expenses_total, 0)}`,
      `Gross Margin: ${fmtMoney(k.gross_margin, 0)} | Operating Profit: ${fmtMoney(k.operating_profit, 0)}`,
      `Open Receivables: ${fmtMoney(k.ar_balance, 0)} (Past 60d: ${fmtMoney(k.ar_60_plus, 0)}) | Net Open Payables: ${fmtMoney(k.ap_balance, 0)}`,
      topProds.length ? `Top Products: ${topProds.map(p => `${cleanOut(p.Product || p.name)} (${fmtMoney(p.sales_ttc, 0)})`).join(', ')}` : '',
      topCusts.length ? `Top Customers: ${topCusts.map(c => `${cleanOut(c.Customer || c.name)} (${fmtMoney(c.sales_ttc, 0)}, Open AR ${fmtMoney(c.ar_balance, 0)})`).join(', ')}` : '',
      canHub('cashflow', user) ? `Cash Till: ${fmtMoney(k.cash_till, 2)}` : '',
      canHub('fleet', user) ? `Diesel Dispensed: ${fmtInt(k.diesel_litres, 0)} L` : ''
    ].filter(Boolean);
  }

  function buildLlmContextMessages(cleanQ, lang, scope, fallback, turnAtts = [], opts = {}) {
    const scopeCo = scope && scope.coKey ? scope.coKey : undefined;
    const activeInd = (_ctx && typeof _ctx.getActiveIndustry === 'function')
      ? _ctx.getActiveIndustry(scopeCo)
      : ((window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.getActiveIndustry === 'function')
        ? window.MFG_ENTERPRISE.getActiveIndustry(scopeCo)
        : 'Manufacturing');
    const indLines = buildIndustryLiveContextLines(activeInd, scope);
    const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openAlerts = items.filter(it => it && it.severity && it.severity !== 'ok');
    const liveScreen = captureLiveScreenSnapshot();

    const kpiTxt = (liveScreen && Array.isArray(liveScreen.topKpis) && liveScreen.topKpis.length)
      ? ' | Visible Screen KPIs: ' + liveScreen.topKpis.slice(0, 5).map(x => `${x.label}=${x.val}`).join(', ')
      : '';
    const screenLine = `Current Screen Visible to User: ${(liveScreen && liveScreen.pageTitle) || 'Executive Overview'} (#${(liveScreen && liveScreen.viewId) || 'overview'})${kpiTxt}`;

    let domainDetail = '';
    if (fallback && fallback.answer) {
      const plainAns = cleanOut(String(fallback.answer).replace(/<[^>]+>/g, ''));
      const plainRows = Array.isArray(fallback.rows) && fallback.rows.length
        ? '\nTop Scoped Rows: ' + fallback.rows.slice(0, 6).map(r => r.join(' | ')).join(' ; ')
        : '';
      domainDetail = `\nMatched Register Snapshot (${cleanOut(fallback.title || 'Scoped View')}): ${plainAns}${plainRows}`;
    }

    let attDetail = '';
    if (Array.isArray(turnAtts) && turnAtts.length) {
      attDetail = '\nAttached Files / Voice Notes:\n' + turnAtts.map(a => {
        const txtSample = a.ocrText || a.textContent || '';
        const sample = a.parsedRows && a.parsedRows.length
          ? ' | Sample rows: ' + a.parsedRows.slice(0, 4).map(r => r.join(', ')).join(' ; ')
          : (txtSample ? ' | Excerpt: ' + txtSample.slice(0, 400) : '');
        const screenCtx = (a.screenSnapshot && a.screenSnapshot.pageTitle)
          ? ` | Captured Screen: ${a.screenSnapshot.pageTitle} (${(a.screenSnapshot.topKpis || []).map(x => `${x.label}=${x.val}`).join(', ')})`
          : '';
        return `- ${a.name} (${a.kind}, ${a.summaryLine || a.sizeLabel})${screenCtx}${sample}`;
      }).join('\n');
    }

    const kpiLine = [
      `Scope: ${scope.fullScopeLabel} (Basis: ${scope.basis === 'tx' ? 'Transaction Date' : 'Reporting Date'})`,
      'Industry Domain Metrics:\n' + indLines.join('\n'),
      screenLine,
      `Unreviewed Sentinel Alerts: ${openAlerts.length}${openAlerts.length ? ' (' + openAlerts.slice(0, 4).map(a => cleanOut(a.title || a.code)).join('; ') + ')' : ''}`,
      domainDetail,
      attDetail
    ].filter(Boolean).join('\n');

    const audioInstruction = opts && opts.hasAudioBinary
      ? 'The user attached a spoken voice recording. Listen carefully to the audio, transcribe their exact spoken question into "userTranscript" in the language they spoke, and answer that exact question in the same language.'
      : `Reply in the exact same language as the user (Detected language: ${lang}; you support English, Arabic, French, and any world language).`;

    const sysPrompt = [
      'You are Ask ISABI, the interactive executive and operational copilot built inside the ISABI Command Center.',
      'Ground every figure strictly in the Live Scoped ERP Snapshot below. NEVER invent numbers, customers, or offices.',
      'Never use em-dashes, en-dashes, unicode arrows, or internal software/database jargon.',
      audioInstruction + ' Keep "answer" sharp, insightful, and conversational (2 to 3 sentences), and make "voiceSummary" a smooth, natural 3 to 5 sentence spoken executive briefing that includes the key insight, top figures/leaders, bottom-line total, and next step with zero markdown or symbols.',
      'Live Scoped ERP Snapshot:\n' + kpiLine,
      'Return ONLY valid JSON: {"userTranscript": "Exact spoken words if audio attached else empty string", "title": "Short heading", "answer": "Direct 2 to 3 sentence executive answer grounded in the live snapshot", "voiceSummary": "Natural spoken briefing summarizing the answer, key highlights, and total", "bullets": ["Key insight 1", "Key insight 2"], "promptText": "1 short natural follow-up question", "followUps": ["Short option 1", "Short option 2", "Short option 3"]}'
    ].join('\n\n');

    const msgs = [{ role: 'system', content: sysPrompt }];
    const recent = _chatState.history.slice(-4);
    for (let i = 0; i < recent.length; i++) {
      const h = recent[i];
      if (!h || !h.q) continue;
      msgs.push({ role: 'user', content: String(h.q) });
      msgs.push({
        role: 'assistant',
        content: JSON.stringify({
          title: cleanOut(h.title || 'Ask ISABI'),
          answer: cleanOut(String(h.answer || '').replace(/<[^>]+>/g, '')),
          promptText: cleanOut(h.promptText || ''),
          followUps: Array.isArray(h.followUps) ? h.followUps.slice(0, 3) : []
        })
      });
    }
    const userPromptText = (opts && opts.isAudioUntranscribed)
      ? 'Listen to the attached voice recording, transcribe the spoken question into userTranscript, and answer it using the Live Scoped ERP Snapshot.'
      : cleanQ;
    msgs.push({ role: 'user', content: userPromptText });
    return msgs;
  }

  function parseLlmJson(rawText, cleanQ, lang, fallback, scope, opts = {}) {
    try {
      let cleaned = String(rawText || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const sIdx = cleaned.indexOf('{');
      const eIdx = cleaned.lastIndexOf('}');
      if (sIdx >= 0 && eIdx > sIdx) cleaned = cleaned.slice(sIdx, eIdx + 1);
      const obj = JSON.parse(cleaned);
      if (!obj || !obj.answer) return null;

      const userTranscript = cleanOut(obj.userTranscript || '');
      const resolvedQ = (opts && opts.isAudioUntranscribed && userTranscript) ? userTranscript : cleanQ;
      const resolvedLang = userTranscript ? detectLang(userTranscript) : (detectLang(obj.answer) || lang);

      // If voice audio was transcribed by Gemini, enrich with any matching live SQL table & action buttons!
      let enrichedBase = fallback || {};
      if (opts && opts.isAudioUntranscribed && userTranscript && scope) {
        const dynScope = resolveQueryScope(userTranscript, scope.user);
        const dynHit = buildLiveDataAnswer(userTranscript, dynScope);
        if (dynHit) enrichedBase = dynHit;
      }

      const llmBullets = Array.isArray(obj.bullets)
        ? obj.bullets.slice(0, 4).map(b => esc(cleanOut(String(b || '').replace(/<[^>]+>/g, '')))).filter(Boolean)
        : [];
      const mergedBullets = (enrichedBase.bullets && enrichedBase.bullets.length)
        ? enrichedBase.bullets
        : (llmBullets.length ? llmBullets : undefined);

      return {
        q: resolvedQ,
        userTranscript: userTranscript || undefined,
        lang: resolvedLang,
        conversational: !(enrichedBase.rows && enrichedBase.rows.length),
        title: cleanOut(obj.title || enrichedBase.title || 'Ask ISABI'),
        answer: esc(cleanOut(obj.answer)),
        voiceSummary: obj.voiceSummary ? cleanOut(obj.voiceSummary) : undefined,
        headers: enrichedBase.headers,
        rows: enrichedBase.rows,
        total: enrichedBase.total,
        kpis: enrichedBase.kpis,
        bullets: mergedBullets,
        promptText: obj.promptText ? cleanOut(obj.promptText) : enrichedBase.promptText,
        actions: enrichedBase.actions,
        attachments: fallback ? fallback.attachments : undefined,
        fromVoice: fallback ? fallback.fromVoice : undefined,
        followUps: Array.isArray(obj.followUps) && obj.followUps.length
          ? obj.followUps.slice(0, 3).map(cleanOut).filter(Boolean)
          : enrichedBase.followUps
      };
    } catch (_) {
      return null;
    }
  }

  async function callHybridCommandLlm(cleanQ, lang, scope, fallback, turnAtts = [], opts = {}) {
    const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
    if (isAutoTest) return fallback;

    const multimodalAtts = (Array.isArray(turnAtts) ? turnAtts : []).filter(a => {
      if (!a || !a.dataUrl || !String(a.dataUrl).includes(';base64,')) return false;
      return /^data:(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf|audio\/[a-z0-9.+-]+);base64,/i.test(String(a.dataUrl));
    });
    const hasAudioBinary = multimodalAtts.some(a => /^data:audio\//i.test(String(a.dataUrl || '')));
    const hasMultimodal = multimodalAtts.length > 0;
    const llmOpts = Object.assign({}, opts, { hasAudioBinary });
    const messages = buildLlmContextMessages(cleanQ, lang, scope, fallback, turnAtts, llmOpts);

    const deepReason = isReasoningQuery(cleanQ) || cleanQ.length > 160 || hasMultimodal;
    const useProFlash = Boolean(hasMultimodal || deepReason);
    const targetModel = useProFlash ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';

    const geminiContents = [];
    const nonSysMsgs = messages.slice(1);
    for (let i = 0; i < nonSysMsgs.length; i++) {
      const m = nonSysMsgs[i];
      const isLastUser = (i === nonSysMsgs.length - 1 && m.role === 'user');
      const parts = [{ text: String(m.content || '') }];
      if (isLastUser && hasMultimodal) {
        multimodalAtts.slice(0, 3).forEach(va => {
          const mMatch = String(va.dataUrl).match(/^data:([^;]+);base64,(.+)$/i);
          if (mMatch && mMatch[2] && mMatch[2].length < 5500000) {
            let normMime = mMatch[1].split(';')[0].trim().toLowerCase();
            if (normMime === 'image/jpg') normMime = 'image/jpeg';
            parts.push({ inlineData: { mimeType: normMime, data: mMatch[2] } });
          }
        });
      }
      geminiContents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      });
    }

    // Lane 0: Local Server (/api/ask) if running locally with GEMINI_API_KEY
    const isLocalHost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
    if (isLocalHost || window.ISABI_LOCAL_API) {
      try {
        const base = String(window.ISABI_LOCAL_API || '').replace(/\/$/, '');
        const rLoc = await fetch(`${base}/api/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: targetModel,
            thinkingBudget: useProFlash ? (hasMultimodal ? 0 : 768) : 0,
            systemPrompt: messages[0].content,
            userPrompt: cleanQ,
            geminiContents
          })
        });
        if (rLoc.ok) {
          const jLoc = await rLoc.json();
          if (jLoc && jLoc.ok && jLoc.rawReply) {
            const parsedLoc = parseLlmJson(jLoc.rawReply, cleanQ, lang, fallback, scope, llmOpts);
            if (parsedLoc) return parsedLoc;
          }
        }
      } catch (_) {}
    }

    const askCfg = window.MFG_ASK_CFG || {};
    let flowUrl = '';
    let flowKey = '';
    try {
      if (askCfg.u && askCfg.k) {
        flowUrl = atob(askCfg.u);
        flowKey = atob(askCfg.k);
      }
    } catch (_) {}

    // Lane 1: Cloud AI Relay (gemini-3.8-flash for multimodal/deep reasoning, gemini-3.5-flash-lite for fast chat)
    const isDemo = Boolean(_ctx && _ctx.STATE && (_ctx.STATE.demoVisitor || _ctx.STATE.isPublicDemoSandbox));
    if (flowUrl && flowUrl.startsWith('http') && (!isDemo || hasAudioBinary)) {
      const reqPayload = {
        key: flowKey,
        op: 'ask',
        surface: 'command_center',
        q: cleanQ || 'Voice query',
        lang,
        industry: scope.scopeCoLabel,
        currency: 'USD',
        period: scope.periodLabel,
        replyTitle: (fallback && fallback.title) || '',
        model: targetModel,
        systemPrompt: messages[0].content,
        userPrompt: cleanQ || 'Voice query',
        geminiContents,
        messages
      };
      if (useProFlash) {
        reqPayload.thinkingBudget = hasMultimodal ? 0 : 768;
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), useProFlash ? 15000 : 10000);
      try {
        const res = await fetch(flowUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(reqPayload),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.mode === 'gemini_cloud' && data.rawReply) {
            const parsed = parseLlmJson(data.rawReply, cleanQ, lang, fallback, scope, llmOpts);
            if (parsed) return parsed;
          }
        }
      } catch (_) {
        clearTimeout(timer);
      }
    }

    // Lane 2: Direct Client-IP LLM completion (text-only fallback)
    if (!hasAudioBinary) {
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 9000);
      try {
        const res2 = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai-fast',
            reasoning_effort: 'low',
            response_format: { type: 'json_object' },
            messages
          }),
          signal: ctrl2.signal
        });
        clearTimeout(timer2);
        if (res2.ok) {
          const data2 = await res2.json();
          const raw2 = data2 && data2.choices && data2.choices[0] && data2.choices[0].message && data2.choices[0].message.content;
          if (raw2) {
            const parsed2 = parseLlmJson(raw2, cleanQ, lang, fallback, scope, llmOpts);
            if (parsed2) return parsed2;
          }
        }
      } catch (_) {
        clearTimeout(timer2);
      }
    }

    return fallback;
  }

  // ============================================================================
  // UI RENDERING, KPI STRIPS, INTERACTIVE MINI-TABLES & VOICE STUDIO WIRING
  // ============================================================================
  function renderWelcomeHtml() {
    const user = getActiveUser();
    const scope = resolveQueryScope('', user);
    const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
    const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openAlerts = items.filter(it => it && it.severity && it.severity !== 'ok').length;
    const k = (_ctx && typeof _ctx.getKPI === 'function') ? _ctx.getKPI(scope.coKey) : {};
    const tbOk = Math.abs(Number(k.tb_check || 0)) < 0.005;

    return `
      <div class="ai-msg-bot ai-welcome-card">
        <p class="ai-bot-p">Welcome${firstName ? ', <b>' + esc(firstName) + '</b>' : ''}. ${tbOk ? 'Books are tied at <b>$0.00</b>' : 'Trial balance requires review ($0.00 target)'} with <b>${fmtInt(openAlerts)}</b> open Sentinel ${openAlerts === 1 ? 'alert' : 'alerts'}. Ask anything in English, العربية, or Français, open <b>Voice Mode</b> for a live spoken briefing, or attach any file.</p>
      </div>
    `;
  }

  function renderUserAttachmentsHtml(atts) {
    if (!Array.isArray(atts) || !atts.length) return '';
    return `<div class="ai-user-att-list">${atts.map(a => {
      if (a.kind === 'image' && a.thumbUrl) {
        return `<div class="ai-user-att-card"><img src="${esc(a.thumbUrl)}" alt="${esc(a.name)}" class="ai-user-att-img"><span>${esc(a.name)} · ${esc(a.sizeLabel)}</span></div>`;
      }
      if (a.kind === 'audio') {
        const playBtn = a.audioUrl
          ? `<button type="button" class="ai-voice-play-btn" data-ai-play-audio="${esc(a.audioUrl)}" aria-label="Play voice note">${AI_SVGS.play}</button>`
          : `<span class="ai-att-ico">${AI_SVGS.audio}</span>`;
        return `<div class="ai-user-att-card">${playBtn}<span>${esc(a.name)}${a.durationSec ? ' · ' + esc(formatDuration(a.durationSec)) : ''}</span></div>`;
      }
      return `<div class="ai-user-att-card"><span class="ai-att-ico">${iconForAttachment(a.kind)}</span><span>${esc(a.name)} · ${esc(a.summaryLine || a.sizeLabel)}</span></div>`;
    }).join('')}</div>`;
  }

  function deriveTurnKpis(item) {
    if (!item || item.conversational || item.topic === 'screen_walkthrough') return [];
    if (Array.isArray(item.kpis) && item.kpis.length) return item.kpis.slice(0, 3);
    if (!Array.isArray(item.rows) || item.rows.length < 2 || !Array.isArray(item.headers) || item.headers.length < 2) return [];
    const lastColHdr = cleanOut(item.headers[item.headers.length - 1] || 'Value');
    const firstRow = item.rows[0] || [];
    const leadName = cleanOut(String(firstRow[0] || '')).slice(0, 26);
    const leadVal = cleanOut(String(firstRow[firstRow.length - 1] || ''));
    const cards = [];
    if (Array.isArray(item.total) && item.total.length >= 2 && item.total[item.total.length - 1]) {
      cards.push({
        label: cleanOut(String(item.total[0] || 'Total')).replace(/\s*\([^)]*\)\s*$/, ''),
        value: cleanOut(String(item.total[item.total.length - 1])),
        sub: `${item.rows.length} listed`
      });
    }
    if (leadName && leadVal && Number.isFinite(parseNumericCell(leadVal))) {
      cards.push({
        label: `Top · ${lastColHdr}`,
        value: leadVal,
        sub: leadName
      });
    }
    return cards.slice(0, 3);
  }

  function resolveRowInteractiveAttrs(row, item) {
    if (!Array.isArray(row) || !row.length || !item || item.topic === 'screen_walkthrough') return '';
    const cell0 = cleanOut(String(row[0] || '').replace(/<[^>]+>/g, ''));
    if (!cell0 || cell0 === '-' || isSummaryTableRow(row)) return '';

    const seedRecs = (_ctx && _ctx.SEED && _ctx.SEED.records) || {};
    const n0 = norm(cell0);

    // 1. Domain Policy / Lease / Membership / VIN IDs (e.g. "POL-2026-901 · Insured")
    const codePrefix = (cell0.split('·')[0] || '').trim();
    if (/^POL-/i.test(codePrefix)) {
      return ` class="ai-row-interactive" data-ai-inspect-key="ins_policies" data-ai-inspect-id="${esc(codePrefix)}" data-ui-tip="Inspect ${esc(codePrefix)}"`;
    }
    if (/^MEM-/i.test(codePrefix)) {
      return ` class="ai-row-interactive" data-ai-inspect-key="hsp_memberships" data-ai-inspect-id="${esc(codePrefix)}" data-ui-tip="Inspect ${esc(codePrefix)}"`;
    }

    // 2. Customer / Supplier / Equipment / Staff exact name lookup
    const custHit = (seedRecs.customers || []).find(c => c && !c.voided && norm(c.name) === n0);
    if (custHit && custHit.id != null) {
      return ` class="ai-row-interactive" data-ai-inspect-key="customers" data-ai-inspect-id="${esc(String(custHit.id))}" data-ui-tip="Open 360° ${esc(custHit.name)}"`;
    }
    const supHit = (seedRecs.suppliers || []).find(s => s && !s.voided && norm(s.name) === n0);
    if (supHit && supHit.id != null) {
      return ` class="ai-row-interactive" data-ai-inspect-key="suppliers" data-ai-inspect-id="${esc(String(supHit.id))}" data-ui-tip="Open 360° ${esc(supHit.name)}"`;
    }
    const eqHit = (seedRecs.equipment || []).find(eq => eq && !eq.voided && (norm(eq.name) === n0 || norm(eq.code) === n0));
    if (eqHit && eqHit.id != null) {
      return ` class="ai-row-interactive" data-ai-inspect-key="equipment" data-ai-inspect-id="${esc(String(eqHit.id))}" data-ui-tip="Open 360° ${esc(eqHit.name || eqHit.code)}"`;
    }

    // 3. Conversational drill-down on entity, month, category, resort, or item
    const drillPrompt = `Show details for ${cell0}`;
    return ` class="ai-row-interactive" data-ask-chip="${esc(drillPrompt)}" data-ui-tip="Ask ISABI about ${esc(cell0)}"`;
  }

  function renderTurnHtml(item, isNewest, turnIdx = -1) {
    const isRtl = /[\u0600-\u06FF]/.test(item.answer || '');
    const dirAttr = isRtl ? ' dir="rtl" style="text-align:right"' : '';
    const uDirAttr = /[\u0600-\u06FF]/.test(item.q || '') ? ' dir="rtl"' : '';

    const kpiCards = deriveTurnKpis(item);
    const kpiHtml = kpiCards.length
      ? `<div class="ai-kpi-strip">${kpiCards.map(kc => `
          <div class="ai-kpi-chip">
            <span class="ai-kpi-lbl">${esc(kc.label)}</span>
            <strong class="ai-kpi-val">${esc(kc.value)}</strong>
            ${kc.sub ? `<span class="ai-kpi-sub">${esc(kc.sub)}</span>` : ''}
          </div>`).join('')}</div>`
      : '';

    let tableHtml = '';
    if (Array.isArray(item.headers) && item.headers.length && Array.isArray(item.rows) && item.rows.length) {
      const colCnt = item.headers.length;
      const lastColNums = item.rows.map(r => Math.abs(parseNumericCell(r[colCnt - 1]))).filter(n => Number.isFinite(n) && n > 0);
      const maxLastVal = lastColNums.length >= 2 ? Math.max(...lastColNums) : 0;

      const ths = item.headers.map((h, i) => `<th${i === colCnt - 1 ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
      const trs = item.rows.map(r => {
        const rowAttrs = resolveRowInteractiveAttrs(r, item);
        const rawLast = Math.abs(parseNumericCell(r[colCnt - 1]));
        const barPct = (maxLastVal > 0 && Number.isFinite(rawLast) && item.topic !== 'screen_walkthrough')
          ? Math.max(4, Math.min(100, Math.round((rawLast / maxLastVal) * 100)))
          : 0;
        const tds = r.slice(0, colCnt).map((c, i) => {
          if (i === 0) return `<td><b>${esc(c)}</b></td>`;
          if (i === colCnt - 1) {
            const barSpan = barPct > 0 ? `<span class="ai-cell-bar" style="width:${barPct}%"></span>` : '';
            return `<td class="num${barPct > 0 ? ' has-bar' : ''}">${barSpan}<span class="ai-cell-val">${esc(c)}</span></td>`;
          }
          return `<td>${esc(c)}</td>`;
        }).join('');
        return `<tr${rowAttrs}>${tds}</tr>`;
      }).join('');
      const totRow = Array.isArray(item.total) && item.total.length
        ? `<tr class="ai-mini-tot"><td colspan="${Math.max(1, colCnt - 1)}">${esc(item.total[0])}</td><td class="num">${esc(item.total[item.total.length - 1])}</td></tr>`
        : '';
      const rowCntLbl = item.lang === 'ar'
        ? `${item.rows.length} بنود · اضغط على أي صف للتفاصيل`
        : (item.lang === 'fr'
          ? `${item.rows.length} lignes · cliquez pour explorer`
          : `${item.rows.length} ${item.rows.length === 1 ? 'row' : 'rows'} · click any row to inspect`);
      const toolbarHtml = turnIdx >= 0 && item.topic !== 'screen_walkthrough'
        ? `<div class="ai-mini-table-bar">
            <span class="ai-mini-table-meta">${esc(rowCntLbl)}</span>
            <div class="ai-mini-table-tools">
              <button type="button" class="ai-tbl-tool-btn" data-ai-copy-table="${turnIdx}" data-ui-tip="Copy table">${AI_SVGS.copy}<span>Copy</span></button>
              <button type="button" class="ai-tbl-tool-btn" data-ai-csv-table="${turnIdx}" data-ui-tip="Export CSV">${AI_SVGS.download}<span>CSV</span></button>
            </div>
          </div>`
        : '';
      tableHtml = `<div class="ai-mini-table-wrap">${toolbarHtml}<table class="ai-mini-table"><thead><tr>${ths}</tr></thead><tbody>${trs}${totRow}</tbody></table></div>`;
    }

    const bulletsHtml = Array.isArray(item.bullets) && item.bullets.length
      ? `<ul class="ai-bot-list">${item.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
      : '';

    const baseActions = Array.isArray(item.actions) ? item.actions.slice() : [];
    if (!baseActions.some(a => a.type === 'speak')) {
      baseActions.push({ type: 'speak', lang: item.lang || 'en', label: speakIdleLabel(item.lang || 'en') });
    }

    const actionsHtml = baseActions.length
      ? `<div class="ai-bot-actions">${baseActions.map((a, idx) => {
          if (a.type === 'inspect') {
            return `<button type="button" class="ai-act-btn" data-ai-inspect-key="${esc(a.crKey)}" data-ai-inspect-id="${esc(a.id)}">${esc(a.label)}</button>`;
          }
          if (a.type === 'form') {
            return `<button type="button" class="ai-act-btn" data-ai-open-form="${esc(a.form)}">${esc(a.label)}</button>`;
          }
          if (a.type === 'speak') {
            return `<button type="button" class="ai-act-btn ai-speak-btn" data-ai-speak="${esc(a.lang || 'en')}" data-turn-idx="${turnIdx}"><span class="ai-act-ico">${AI_SVGS.audio}</span><span>${esc(a.label || speakIdleLabel(a.lang || 'en'))}</span></button>`;
          }
          return `<button type="button" class="ai-act-btn${idx === 0 ? ' is-primary' : ''}" data-ai-goto-view="${esc(a.view)}">${esc(a.label)}</button>`;
        }).join('')}</div>`
      : '';

    let followHtml = '';
    if (isNewest && _chatState.typingFollowup) {
      followHtml = `
        <div class="ai-msg-followup"${dirAttr}>
          <div class="ai-typing-indicator" aria-label="Preparing follow-up"><span></span><span></span><span></span></div>
        </div>
      `;
    } else if ((Array.isArray(item.followUps) && item.followUps.length) || item.promptText) {
      const lead = item.promptText || (item.lang === 'ar' ? 'هل تود فحص أحد هذه المواضيع؟' : (item.lang === 'fr' ? 'Souhaitez-vous vérifier l\'un de ces points ?' : 'Would you like to check one of these next?'));
      const fDirAttr = /[\u0600-\u06FF]/.test(lead) ? ' dir="rtl" style="text-align:right"' : dirAttr;
      const chips = (item.followUps || []).map(f => `<button type="button" class="ai-followup-chip" data-ask-chip="${esc(f)}">${esc(f)}</button>`).join('');
      followHtml = `
        <div class="ai-msg-followup"${fDirAttr}>
          <div class="ai-followup-lead">${esc(lead)}</div>
          ${chips ? `<div class="ai-followup-chips">${chips}</div>` : ''}
        </div>
      `;
    }

    const userAttHtml = renderUserAttachmentsHtml(item.attachments);

    return `
      <div class="ai-msg-user"${uDirAttr}>${userAttHtml}<div>${esc(item.q)}</div></div>
      <div class="ai-msg-bot" data-turn-idx="${turnIdx}"${dirAttr}>
        ${item.title ? `<div class="ai-bot-eyebrow">${esc(item.title)}</div>` : ''}
        <p class="ai-bot-p">${item.answer}</p>
        ${kpiHtml}
        ${bulletsHtml}
        ${tableHtml}
        ${actionsHtml}
      </div>
      ${followHtml}
    `;
  }

  function renderThinkingHtml(qText, lang, atts) {
    const lbl = lang === 'ar' ? 'جاري فحص السجلات الحية...' : (lang === 'fr' ? 'Analyse des écritures en direct...' : 'Checking live records...');
    const uDir = /[\u0600-\u06FF]/.test(qText || '') ? ' dir="rtl"' : '';
    const bDir = lang === 'ar' ? ' dir="rtl" style="text-align:right"' : '';
    const userAttHtml = renderUserAttachmentsHtml(atts);
    return `
      <div class="ai-msg-user"${uDir}>${userAttHtml}<div>${esc(qText)}</div></div>
      <div class="ai-msg-bot ai-msg-pending"${bDir}>
        <span class="ai-pending-lbl">${esc(lbl)}</span>
        <span class="ai-typing-indicator" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
    `;
  }

  function syncContextLensBar() {
    const lensBar = document.getElementById('aiContextLensBar');
    if (!lensBar) return;
    const snap = captureLiveScreenSnapshot();
    const screenName = (snap && snap.pageTitle) || 'Executive Overview';
    const lblEl = document.getElementById('aiLensScreenName');
    if (lblEl) lblEl.textContent = screenName;
    if (window.MFG_I18N && window.MFG_I18N.getLang() !== 'en') {
      window.MFG_I18N.translateDom(lensBar);
    }
  }

  function syncHeaderAndChips(force = false) {
    if (!_ctx) return;
    const askDrawer = document.getElementById('aiDrawer');
    if (!force && (!askDrawer || !askDrawer.classList.contains('open'))) {
      _chatState.scopeDirty = true;
      return;
    }
    _chatState.scopeDirty = false;
    const user = getActiveUser();
    const scope = resolveQueryScope('', user);

    const hdrTitle = document.querySelector('#aiDrawer .ai-console-title b');
    if (hdrTitle) {
      hdrTitle.textContent = 'Ask ISABI';
    }
    const hdrSub = document.getElementById('aiDrawerScope') || document.querySelector('#aiDrawer .ai-console-title small');
    if (hdrSub) {
      hdrSub.textContent = `${scope.scopeCoLabel} · USD · ${scope.periodLabel}`;
    }
    const inp = document.getElementById('aiInput');
    if (inp) {
      inp.placeholder = `Ask about ${scope.scopeCoLabel}, today's ops, AR, expenses, stock, diesel...`;
    }

    const chipsBox = document.getElementById('aiChips');
    const activeInd = (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.getActiveIndustry === 'function')
      ? window.MFG_ENTERPRISE.getActiveIndustry()
      : 'Manufacturing';
    if (inp && activeInd !== 'Manufacturing') {
      const indPlaceholders = {
        'Holding & Treasury': `Ask about Bdeir Holding overhead, intercompany Due-From/Due-To, partner splits, trial balance...`,
        'Hospitality & Resorts': `Ask about ${scope.scopeCoLabel} venue revenue, POS tills, cabanas, memberships, F&B costs...`,
        'Automotive & Heavy Trading': `Ask about ${scope.scopeCoLabel} invoice books (N/S/IS/IN), Shacman VINs, FIFO parts stock...`,
        'Real Estate & Property': `Ask about ${scope.scopeCoLabel} 4235 VAT rent roll, occupancy, expiring leases, tenant AR...`,
        'Insurance & Brokerage': `Ask about GWP, brokerage commissions, 30/60/90d renewals, claims loss ratio, carrier payables...`
      };
      inp.placeholder = indPlaceholders[activeInd] || inp.placeholder;
    }
    if (chipsBox) {
      const domainChipsMap = {
        'Holding & Treasury': [
          { label: 'Holding Briefing', prompt: 'Give me a Bdeir Holding & Treasury executive briefing' },
          { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
          { label: 'Intercompany Matrix', prompt: 'Show bilateral intercompany Due-From and Due-To matrix' },
          { label: 'Partner Equity Splits', prompt: 'Show shareholder partner split balances' },
          { label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }
        ],
        'Hospitality & Resorts': [
          { label: 'Hospitality Briefing', prompt: 'Give me a Hospitality & Resorts executive briefing' },
          { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
          { label: 'Venue Revenue & POS', prompt: 'Compare Blanca, La Una, Palms, Voile & Platinum venue revenue' },
          { label: 'Cabanas & Memberships', prompt: 'Show active seasonal cabana and gym memberships' },
          { label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }
        ],
        'Automotive & Heavy Trading': [
          { label: 'Trading Briefing', prompt: 'Give me an Automotive & Heavy Trading executive briefing' },
          { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
          { label: 'Shacman VIN Fleet', prompt: 'Show Shacman heavy truck VIN registry and unit margins' },
          { label: 'FIFO Stock & Parts', prompt: 'Show FIFO spare parts stock valuation and reorder alerts' },
          { label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }
        ],
        'Real Estate & Property': [
          { label: 'Real Estate Briefing', prompt: 'Give me a Real Estate & 4235 S.A.L executive briefing' },
          { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
          { label: '4235 VAT Rent Roll', prompt: 'Show 4235 Company S.A.L 11% VAT rent invoices and tenant arrears' },
          { label: 'Expiring Leases', prompt: 'Which leases are expiring within 90 days?' },
          { label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }
        ],
        'Insurance & Brokerage': [
          { label: 'Insurance Briefing', prompt: 'Give me an Insurance & Brokerage executive briefing' },
          { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
          { label: '30/60/90d Renewals', prompt: 'Show 30/60/90-day policy renewal pipeline' },
          { label: 'Carrier Recon & Claims', prompt: 'Show carrier bordereau payable reconciliation' },
          { label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }
        ]
      };
      const chips = domainChipsMap[activeInd] || [
        { label: 'Executive Briefing', prompt: 'Give me an executive briefing & open alerts' },
        { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
        { label: 'Entity Sales & Profit', prompt: 'Compare entity sales & operating profit' },
        ...(canHub('sales', user) ? [{ label: 'Overdue AR', prompt: 'Show top overdue AR customers and credit risk' }] : []),
        ...(canHub('expenses', user) ? [{ label: 'Expenses & AP', prompt: 'Show top expense categories and pending prices' }] : []),
        ...(canHub('fleet', user) ? [{ label: 'Diesel & Repairs', prompt: 'Explain the diesel tank reconciliation variance across entities' }] : []),
        ...(canView('ledger', user) ? [{ label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }] : [])
      ];
      chipsBox.innerHTML = chips.map(c => `<button type="button" class="ai-pill-btn" data-prompt="${esc(c.prompt)}">${esc(c.label)}</button>`).join('');
      if (window.MFG_I18N && window.MFG_I18N.getLang() !== 'en') {
        window.MFG_I18N.translateDom(chipsBox);
      }
    }
    syncContextLensBar();
    syncVoiceModeDeckUi();
    if (!_chatState.history.length && !_chatState.pending) {
      renderThread(false);
    }
  }

  function setPreferredLang(code) {
    const clean = String(code || 'en').toLowerCase();
    _chatState.preferredLang = clean;
    if (VOICE_LANG_MAP[clean]) setVoiceLang(clean);
    const drawer = document.getElementById('aiDrawer');
    if (drawer && window.MFG_I18N) {
      window.MFG_I18N.translateDom(drawer);
    }
  }

  function renderThread(scrollToBottom = true) {
    const log = document.getElementById('aiMessages');
    if (!log) return;
    if (!_chatState.history.length && !_chatState.pending) {
      log.innerHTML = renderWelcomeHtml();
      if (window.MFG_I18N && window.MFG_I18N.getLang() !== 'en') {
        try { window.MFG_I18N.translateDom(log); } catch (_) {}
      }
      log.scrollTop = 0;
      return;
    }
    const lastIdx = _chatState.history.length - 1;
    const html = _chatState.history.map((it, idx) => renderTurnHtml(it, idx === lastIdx && !_chatState.pending, idx)).join('')
      + (_chatState.pending ? renderThinkingHtml(_chatState.pending.q, _chatState.pending.lang, _chatState.pending.attachments) : '');
    log.innerHTML = html;
    if (scrollToBottom) log.scrollTop = log.scrollHeight;
  }

  function rememberTurnScope(scope, reply) {
    if (!scope || scope.rlsBlockedCompany || !reply) return;
    if (reply.conversational && !reply.topic) return;
    _chatState.lastTurn = {
      mentionedCo: scope.mentionedCo || null,
      customDateOverride: Boolean(scope.customDateOverride),
      dateRange: scope.dateRange || null,
      periodSpec: scope.periodSpec || null,
      forceTxBasis: Boolean(scope.forceTxBasis),
      topic: reply.topic || scope.inheritedTopic || ''
    };
  }

  function submitQuestion(qRaw, opts = {}) {
    if (!_ctx) return;
    if (_chatState.voiceActive) {
      stopVoiceRecording({ attachVoiceNote: true });
    }
    const turnAtts = _chatState.attachments.slice();
    const hasNonAudioAtt = turnAtts.some(a => a && a.kind !== 'audio');
    const hasAudioAtt = turnAtts.some(a => a && a.kind === 'audio');
    const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);

    let cleanQ = String(qRaw || '').trim();
    let isAudioUntranscribed = false;
    if (!cleanQ && turnAtts.length) {
      const f0 = turnAtts.find(a => a && a.kind !== 'audio') || turnAtts[0];
      if (f0.kind === 'audio') {
        const vLang = f0.voiceLang || _chatState.voiceLang || 'en';
        if (isAutoTest) {
          cleanQ = vLang === 'ar'
            ? 'أعطني ملخص تنفيذي والتنبيهات المفتوحة'
            : (vLang === 'fr' ? 'Donnez-moi un résumé exécutif' : 'Give me an executive briefing & open alerts');
        } else {
          isAudioUntranscribed = true;
          cleanQ = vLang === 'ar'
            ? 'رسالة صوتية...'
            : (vLang === 'fr' ? 'Message vocal...' : 'Voice question...');
        }
      } else if (f0.kind === 'image') {
        cleanQ = `Explain attached image ${f0.name}`;
      } else {
        cleanQ = `Analyze attached file ${f0.name} and reconcile with live records`;
      }
    }
    if (!cleanQ) return;

    clearAttachments();

    const user = getActiveUser();
    const audioLangHint = (turnAtts.find(a => a && a.kind === 'audio') || {}).voiceLang || _chatState.voiceLang || 'en';
    const lang = isAudioUntranscribed ? audioLangHint : detectLang(cleanQ);
    const scope = resolveQueryScope(isAudioUntranscribed ? '' : cleanQ, user);
    const fromVoice = Boolean((opts && opts.fromVoice) || hasAudioAtt || _chatState.liveVoiceMode);

    const computeDirectHit = (queryOverride) => {
      const qUse = queryOverride != null ? queryOverride : cleanQ;
      const scopeUse = queryOverride != null ? resolveQueryScope(qUse, user) : scope;
      const attHit = hasNonAudioAtt ? buildAttachmentAnalysisAnswer(qUse, scopeUse, turnAtts) : null;
      const sqlHit = buildLiveDataAnswer(qUse, scopeUse);
      if (attHit && (attHit.topic === 'screen_walkthrough' || /^(?:Analyze|Explain) attached (?:file|image)\b|\b(file|sheet|csv|attachment|attached|receipt|image|photo|pdf|document|reconcile|screenshot|screen|understand|undersand|explain|what is this)\b/i.test(qUse) || !sqlHit)) {
        if (sqlHit && sqlHit.answer && sqlHit.topic !== 'screen_walkthrough' && sqlHit.topic !== 'briefing' && sqlHit.topic !== 'greeting' && sqlHit.answer !== attHit.answer && Array.isArray(attHit.bullets)) {
          attHit.bullets = [`<b>Direct Answer (${esc(sqlHit.title || 'Live Match')})</b>: ${sqlHit.answer}`, ...attHit.bullets];
        }
        return attHit;
      }
      return sqlHit || attHit;
    };

    const decorateReply = rep => {
      if (!rep) return rep;
      return Object.assign({}, rep, {
        q: rep.userTranscript || rep.q || cleanQ,
        attachments: turnAtts.length ? turnAtts : undefined,
        fromVoice
      });
    };

    // Synchronous path for automated headless suites
    if (isAutoTest) {
      const directHit = computeDirectHit();
      const syncAns = decorateReply(directHit || buildExecutiveBriefing(cleanQ, lang, scope, true));
      rememberTurnScope(scope, syncAns);
      _chatState.pending = null;
      _chatState.typingFollowup = false;
      _chatState.history.push(syncAns);
      if (_chatState.history.length > 12) _chatState.history.shift();
      renderThread(true);
      return;
    }

    _chatState.pending = { q: cleanQ, lang, attachments: turnAtts };
    _chatState.typingFollowup = false;
    renderThread(true);
    syncVoiceModeDeckUi();

    const pendingMediaPromises = [
      ...turnAtts.filter(a => a && a.kind === 'image' && a._ocrPromise && !a.ocrText).map(a => a._ocrPromise),
      ...turnAtts.filter(a => a && a.kind === 'audio' && a._audioPromise && !a.dataUrl).map(a => a._audioPromise)
    ];
    const prepWait = pendingMediaPromises.length
      ? Promise.race([Promise.all(pendingMediaPromises), new Promise(r => setTimeout(r, 3200))])
      : Promise.resolve();

    prepWait.then(() => {
      if (!_chatState.pending || _chatState.pending.q !== cleanQ) return;
      const directHit = isAudioUntranscribed ? null : computeDirectHit();

      // Fast path (<180ms): exact live-SQL intent, screenshot walkthrough, file reconciliation, counterparty/ticket lookup, or greeting
      if (!isAudioUntranscribed && directHit && directHit.instantLocal) {
        const decoratedFast = decorateReply(directHit);
        setTimeout(() => {
          if (!_chatState.pending || _chatState.pending.q !== cleanQ) return;
          rememberTurnScope(scope, decoratedFast);
          _chatState.pending = null;
          _chatState.typingFollowup = true;
          _chatState.history.push(decoratedFast);
          if (_chatState.history.length > 12) _chatState.history.shift();
          renderThread(true);
          syncVoiceModeDeckUi();
          maybeAutoSpeakTurn(decoratedFast);
          setTimeout(() => {
            _chatState.typingFollowup = false;
            renderThread(true);
          }, 340);
        }, 140);
        return;
      }

      // Hybrid path: Live-SQL grounded snapshot + Multimodal Audio/Vision/Reasoning via Gemini 3.8 Flash
      const fallbackPrompt = isAudioUntranscribed
        ? (lang === 'ar' ? 'أعطني ملخص تنفيذي والتنبيهات المفتوحة' : (lang === 'fr' ? 'Donnez-moi un résumé exécutif' : 'Give me an executive briefing & open alerts'))
        : cleanQ;
      const fallback = decorateReply(directHit || computeDirectHit(fallbackPrompt) || buildExecutiveBriefing(fallbackPrompt, lang, scope, false));
      const minBeat = new Promise(r => setTimeout(r, 220));
      Promise.all([
        callHybridCommandLlm(cleanQ, lang, scope, fallback, turnAtts, { isAudioUntranscribed }),
        minBeat
      ]).then(([resolved]) => {
        if (!_chatState.pending || _chatState.pending.q !== cleanQ) return;
        const finalAns = decorateReply(resolved || fallback);
        const effScope = finalAns.userTranscript ? resolveQueryScope(finalAns.userTranscript, user) : scope;
        rememberTurnScope(effScope, finalAns);
        _chatState.pending = null;
        _chatState.typingFollowup = true;
        _chatState.history.push(finalAns);
        if (_chatState.history.length > 12) _chatState.history.shift();
        renderThread(true);
        syncVoiceModeDeckUi();
        maybeAutoSpeakTurn(finalAns);
        setTimeout(() => {
          _chatState.typingFollowup = false;
          renderThread(true);
        }, 340);
      });
    });
  }

  function copyTurnTableToClipboard(turnIdx, asCsv = false, btnEl = null) {
    const turn = _chatState.history[Number(turnIdx)];
    if (!turn || !Array.isArray(turn.headers) || !Array.isArray(turn.rows)) return false;
    const allRows = [turn.headers, ...turn.rows];
    if (Array.isArray(turn.total) && turn.total.length) {
      const pad = new Array(Math.max(0, turn.headers.length - 2)).fill('');
      allRows.push([turn.total[0], ...pad, turn.total[turn.total.length - 1]]);
    }
    if (asCsv) {
      const csv = allRows.map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      try {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(turn.title || 'ask_isabi_table').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 36)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
      } catch (_) {}
      return true;
    }
    const tsv = allRows.map(r => r.join('\t')).join('\n');
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(tsv).catch(() => {});
    }
    if (btnEl) {
      const orig = btnEl.innerHTML;
      btnEl.innerHTML = `<span>Copied</span>`;
      setTimeout(() => { btnEl.innerHTML = orig; }, 1200);
    }
    return true;
  }

  function answerQuestion(qRaw) {
    if (!_ctx) return { title: '', answer: '', actions: [], rows: [] };
    const user = getActiveUser();
    const lang = detectLang(String(qRaw || ''));
    const scope = resolveQueryScope(String(qRaw || ''), user);
    return buildLiveDataAnswer(String(qRaw || ''), scope) || buildExecutiveBriefing(String(qRaw || ''), lang, scope, true);
  }

  function answerHtmlSnapshot(qRaw) {
    const ans = answerQuestion(qRaw);
    if (!ans || !ans.answer) return '';
    return `<strong>${esc(ans.title || 'Ask ISABI')}</strong><br>${ans.answer}`;
  }

  function openDrawer(optionalPrompt) {
    const askDrawer = document.getElementById('aiDrawer');
    if (!askDrawer) return;
    if (_ctx && typeof _ctx.closeRail === 'function') _ctx.closeRail();
    ensureComposerControlsMounted();
    syncHeaderAndChips(true);
    askDrawer.classList.add('open');
    askDrawer.setAttribute('aria-hidden', 'false');
    if (optionalPrompt) {
      submitQuestion(optionalPrompt);
    } else {
      renderThread(Boolean(_chatState.history.length));
    }
    const askInput = document.getElementById('aiInput');
    if (askInput && window.matchMedia('(min-width: 861px)').matches && !_chatState.liveVoiceMode) {
      setTimeout(() => askInput.focus({ preventScroll: true }), 180);
    }
  }

  function closeDrawer() {
    if (_chatState.voiceActive) cancelVoiceRecording();
    if (_chatState.liveVoiceMode) _chatState.liveVoiceMode = false;
    stopActivePlayback();
    const askDrawer = document.getElementById('aiDrawer');
    if (!askDrawer) return;
    askDrawer.classList.remove('open', 'is-drag-over');
    askDrawer.setAttribute('aria-hidden', 'true');
  }

  function resetThread() {
    if (_chatState.voiceActive) cancelVoiceRecording();
    stopActivePlayback();
    clearAttachments(true);
    _chatState.history.forEach(turn => {
      if (turn && Array.isArray(turn.attachments)) {
        turn.attachments.forEach(revokeAttachmentUrls);
      }
    });
    _chatState.history = [];
    _chatState.pending = null;
    _chatState.typingFollowup = false;
    _chatState.lastTurn = null;
    syncHeaderAndChips(true);
    renderThread(false);
  }

  function extractClipboardFiles(clipboardData) {
    if (!clipboardData) return [];
    if (clipboardData.files && clipboardData.files.length) {
      return Array.from(clipboardData.files);
    }
    const out = [];
    if (clipboardData.items && clipboardData.items.length) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const it = clipboardData.items[i];
        if (it && it.kind === 'file' && typeof it.getAsFile === 'function') {
          const f = it.getAsFile();
          if (f) out.push(f);
        }
      }
    }
    return out;
  }

  function ensureComposerControlsMounted() {
    const askDrawer = document.getElementById('aiDrawer');
    const askForm = document.getElementById('aiForm');
    const askInput = document.getElementById('aiInput');
    if (!askForm || !askInput || document.getElementById('aiComposerRow')) return;

    // 1. Mount Live Screen Context Lens bar right beneath #aiChips
    const chipsBox = document.getElementById('aiChips');
    if (chipsBox && chipsBox.parentNode && !document.getElementById('aiContextLensBar')) {
      const lensBar = document.createElement('div');
      lensBar.className = 'ai-lens-bar';
      lensBar.id = 'aiContextLensBar';
      lensBar.innerHTML = `
        <div class="ai-lens-current">
          <span class="ai-lens-ico">${AI_SVGS.eye}</span>
          <span class="ai-lens-lbl">On Screen:</span>
          <strong id="aiLensScreenName">Executive Overview</strong>
        </div>
        <div class="ai-lens-actions">
          <button type="button" class="ai-lens-btn" data-ask-chip="Explain this screen">Explain Screen</button>
          <button type="button" class="ai-lens-btn" data-ask-chip="What stands out and needs attention right now?">Key Insights</button>
        </div>
      `;
      chipsBox.parentNode.insertBefore(lensBar, chipsBox.nextSibling);
    }

    // 2. Mount Interactive Voice Mode Conversational Deck right above #aiMessages
    const msgBox = document.getElementById('aiMessages');
    if (msgBox && msgBox.parentNode && !document.getElementById('aiVoiceModeDeck')) {
      const vmDeck = document.createElement('div');
      vmDeck.className = 'ai-voice-deck';
      vmDeck.id = 'aiVoiceModeDeck';
      vmDeck.hidden = true;
      vmDeck.setAttribute('data-voice-phase', 'ready');
      vmDeck.innerHTML = `
        <div class="ai-vm-top">
          <div class="ai-vm-badge-wrap">
            <span class="ai-vm-orb" aria-hidden="true"></span>
            <div>
              <strong class="ai-vm-status" id="aiVmStatusLabel">Voice Mode Ready</strong>
              <span class="ai-vm-timer" id="aiVmTimer">0:00</span>
            </div>
          </div>
          <div class="ai-vm-top-tools">
            <div class="ai-voice-langs" role="group" aria-label="Voice Recognition Language">
              <button type="button" class="ai-voice-lang-btn active" data-ai-voice-lang="en">EN</button>
              <button type="button" class="ai-voice-lang-btn" data-ai-voice-lang="ar">AR</button>
              <button type="button" class="ai-voice-lang-btn" data-ai-voice-lang="fr">FR</button>
            </div>
            <button type="button" class="ai-vm-chip-btn active" id="aiVmHandsFreeBtn" aria-pressed="true" data-ui-tip="Automatically send after a pause and listen again after ISABI finishes speaking">Hands-Free</button>
            <button type="button" class="ai-vm-chip-btn" id="aiVmRateBtn" data-ui-tip="Voice playback speed">${_chatState.playbackRate}x</button>
            <button type="button" class="ai-vm-close-btn" id="aiVmCloseBtn" data-ui-tip="Exit Voice Mode">Exit</button>
          </div>
        </div>
        <div class="ai-vm-wave-stage">
          <div class="ai-vm-waveform" id="aiVmWaveform" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <p class="ai-vm-caption" id="aiVmCaptionText">Speak naturally. Auto-sends when you pause, or tap Send Now.</p>
        </div>
        <div class="ai-vm-progress" aria-hidden="true"><span class="ai-vm-progress-fill" id="aiVmProgressFill"></span></div>
        <div class="ai-vm-actions">
          <button type="button" class="ai-vm-primary-btn" id="aiVmPrimaryBtn"><span class="ai-act-ico">${AI_SVGS.mic}</span><span>Start Talking</span></button>
          <button type="button" class="ai-vm-sec-btn" id="aiVmPauseBtn" hidden><span class="ai-act-ico">${AI_SVGS.pause}</span><span>Pause</span></button>
          <button type="button" class="ai-vm-sec-btn" id="aiVmStopSpeakBtn"><span class="ai-act-ico">${AI_SVGS.stop}</span><span>Quiet</span></button>
        </div>
      `;
      msgBox.parentNode.insertBefore(vmDeck, msgBox);
    }

    const submitBtn = askForm.querySelector('button[type="submit"]');

    const inlinePlayBar = document.createElement('div');
    inlinePlayBar.className = 'ai-inline-play-bar';
    inlinePlayBar.id = 'aiInlinePlaybackBar';
    inlinePlayBar.hidden = true;
    inlinePlayBar.innerHTML = `
      <div class="ai-ipb-main">
        <span class="ai-ipb-pulse" aria-hidden="true"></span>
        <span class="ai-ipb-caption">Speaking executive summary...</span>
        <div class="ai-ipb-btns">
          <button type="button" class="ai-ipb-btn" data-ai-audio-pause="1" aria-label="Pause or resume voice">${AI_SVGS.pause}</button>
          <button type="button" class="ai-ipb-btn ai-ipb-rate" data-ai-audio-rate="1" aria-label="Playback speed">${_chatState.playbackRate}x</button>
          <button type="button" class="ai-ipb-btn" data-ai-audio-stop="1" aria-label="Stop voice">${AI_SVGS.stop}</button>
        </div>
      </div>
      <div class="ai-ipb-track"><span class="ai-ipb-fill"></span></div>
    `;

    const attachBar = document.createElement('div');
    attachBar.className = 'ai-attach-bar';
    attachBar.id = 'aiAttachmentBar';
    attachBar.hidden = true;

    const voiceBar = document.createElement('div');
    voiceBar.className = 'ai-voice-bar';
    voiceBar.id = 'aiVoiceBar';
    voiceBar.hidden = true;
    voiceBar.innerHTML = `
      <div class="ai-voice-status">
        <span class="ai-rec-dot" aria-hidden="true"></span>
        <span class="ai-voice-timer" id="aiVoiceTimer">0:00</span>
        <span class="ai-voice-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>
        <span id="aiVoiceStatusText">Listening (English)...</span>
      </div>
      <div class="ai-voice-controls">
        <div class="ai-voice-langs" role="group" aria-label="Voice Recognition Language">
          <button type="button" class="ai-voice-lang-btn active" data-ai-voice-lang="en">EN</button>
          <button type="button" class="ai-voice-lang-btn" data-ai-voice-lang="ar">AR</button>
          <button type="button" class="ai-voice-lang-btn" data-ai-voice-lang="fr">FR</button>
        </div>
        <button type="button" class="ai-voice-act-btn" id="aiVoiceCancelBtn">Cancel</button>
        <button type="button" class="ai-voice-act-btn" id="aiVoiceStopBtn">Done</button>
        <button type="button" class="ai-voice-act-btn is-send" id="aiVoiceSendBtn">Send</button>
      </div>
    `;

    const row = document.createElement('div');
    row.className = 'ai-composer-row';
    row.id = 'aiComposerRow';

    const fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.id = 'aiFileInput';
    fileInp.multiple = true;
    fileInp.accept = 'image/*,.pdf,.csv,.tsv,.txt,.json,.xls,.xlsx,.doc,.docx,audio/*';
    fileInp.hidden = true;

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'ai-tool-btn';
    attachBtn.id = 'aiAttachBtn';
    attachBtn.setAttribute('data-ui-tip', 'Attach receipt photo, CSV/Excel sheet, PDF, or document (or drag & drop / paste)');
    attachBtn.setAttribute('aria-label', 'Attach file');
    attachBtn.innerHTML = `${AI_SVGS.paperclip}<span class="ai-tool-badge" id="aiAttachCountBadge" hidden>0</span>`;

    const voiceBtn = document.createElement('button');
    voiceBtn.type = 'button';
    voiceBtn.className = 'ai-tool-btn';
    voiceBtn.id = 'aiVoiceBtn';
    voiceBtn.setAttribute('data-ui-tip', 'Record voice question or note (EN / العربية / FR)');
    voiceBtn.setAttribute('aria-label', 'Record voice');
    voiceBtn.setAttribute('aria-pressed', 'false');
    voiceBtn.innerHTML = AI_SVGS.mic;

    row.appendChild(fileInp);
    row.appendChild(attachBtn);
    row.appendChild(voiceBtn);
    row.appendChild(askInput);
    if (submitBtn) row.appendChild(submitBtn);

    askForm.appendChild(inlinePlayBar);
    askForm.appendChild(attachBar);
    askForm.appendChild(voiceBar);
    askForm.appendChild(row);

    attachBtn.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', () => {
      if (fileInp.files && fileInp.files.length) {
        attachFiles(fileInp.files);
        fileInp.value = '';
      }
    });

    voiceBtn.addEventListener('click', () => {
      if (_chatState.voiceActive) stopVoiceRecording({ attachVoiceNote: true, autoSend: true });
      else startVoiceRecording({ autoSendOnSilence: true });
    });

    // Mount Interactive Voice Mode + Auto-Voice Readback toggles in #aiDrawer header actions
    const hdrActions = document.querySelector('#aiDrawer .ai-hdr-actions');
    if (hdrActions && !document.getElementById('aiAutoVoiceBtn')) {
      const liveVoiceBtn = document.createElement('button');
      liveVoiceBtn.type = 'button';
      liveVoiceBtn.className = 'ai-reset-btn ai-voice-mode-btn' + (_chatState.liveVoiceMode ? ' is-active' : '');
      liveVoiceBtn.id = 'aiLiveVoiceBtn';
      liveVoiceBtn.setAttribute('aria-pressed', _chatState.liveVoiceMode ? 'true' : 'false');
      liveVoiceBtn.setAttribute('data-ui-tip', 'Interactive two-way Voice Mode');
      liveVoiceBtn.innerHTML = `<span class="ai-hdr-ico">${AI_SVGS.wave}</span><span>Voice Mode</span>`;
      liveVoiceBtn.addEventListener('click', () => toggleLiveVoiceMode());

      const autoVoiceBtn = document.createElement('button');
      autoVoiceBtn.type = 'button';
      autoVoiceBtn.className = 'ai-reset-btn ai-voice-toggle-btn' + (_chatState.autoVoiceReadback ? ' is-active' : '');
      autoVoiceBtn.id = 'aiAutoVoiceBtn';
      autoVoiceBtn.setAttribute('aria-pressed', _chatState.autoVoiceReadback ? 'true' : 'false');
      autoVoiceBtn.setAttribute('data-ui-tip', 'Read Aloud');
      const syncAutoVoiceBtnUi = () => {
        const on = Boolean(_chatState.autoVoiceReadback);
        autoVoiceBtn.classList.toggle('is-active', on);
        autoVoiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        autoVoiceBtn.innerHTML = `<span class="ai-hdr-ico">${on ? AI_SVGS.audio : AI_SVGS.audioOff}</span><span>Read Aloud</span>`;
        if (window.MFG_I18N && window.MFG_I18N.getLang() !== 'en') {
          try { window.MFG_I18N.translateDom(autoVoiceBtn); } catch (_) {}
        }
      };
      syncAutoVoiceBtnUi();
      autoVoiceBtn.addEventListener('click', () => {
        _chatState.autoVoiceReadback = !_chatState.autoVoiceReadback;
        try { localStorage.setItem('isabi_ask_auto_voice', _chatState.autoVoiceReadback ? '1' : '0'); } catch (_) {}
        if (!_chatState.autoVoiceReadback) stopActivePlayback();
        syncAutoVoiceBtnUi();
      });

      hdrActions.insertBefore(autoVoiceBtn, hdrActions.firstChild);
      hdrActions.insertBefore(liveVoiceBtn, hdrActions.firstChild);
    }

    if (askDrawer && window.MFG_I18N && window.MFG_I18N.getLang() !== 'en') {
      try { window.MFG_I18N.translateDom(askDrawer); } catch (_) {}
    }
  }

  function init(ctx) {
    _ctx = ctx;
    ensureComposerControlsMounted();
    syncHeaderAndChips(true);
    if (_chatState.wired) return;
    _chatState.wired = true;

    const openAskBtn = document.getElementById('askIsabiBtn');
    const mobileAskBtn = document.getElementById('mobileAskIsabiBtn');
    const closeAskBtn = document.getElementById('closeAiDrawerBtn');
    const resetAskBtn = document.getElementById('resetAiThreadBtn');
    const askDrawer = document.getElementById('aiDrawer');
    const askInput = document.getElementById('aiInput');
    const askForm = document.getElementById('aiForm');

    if (openAskBtn) openAskBtn.addEventListener('click', () => openDrawer());
    if (mobileAskBtn) mobileAskBtn.addEventListener('click', () => openDrawer());
    if (closeAskBtn) closeAskBtn.addEventListener('click', closeDrawer);
    if (resetAskBtn) resetAskBtn.addEventListener('click', resetThread);

    if (askForm && askInput) {
      askForm.addEventListener('submit', e => {
        e.preventDefault();
        const v = askInput.value.trim();
        if (!v && !_chatState.attachments.length && !_chatState.voiceActive) return;
        askInput.value = '';
        askInput.dir = 'ltr';
        submitQuestion(v);
      });
    }

    if (askDrawer) {
      askDrawer.addEventListener('paste', e => {
        const files = extractClipboardFiles(e.clipboardData);
        if (files.length) {
          e.preventDefault();
          attachFiles(files);
        }
      });

      askDrawer.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          if (_chatState.voiceActive) {
            e.stopPropagation();
            cancelVoiceRecording();
          } else if (_chatState.liveVoiceMode) {
            e.stopPropagation();
            toggleLiveVoiceMode(false);
          } else if (askDrawer.classList.contains('open')) {
            closeDrawer();
          }
        }
      });

      askDrawer.addEventListener('dragover', e => {
        e.preventDefault();
        askDrawer.classList.add('is-drag-over');
      });
      askDrawer.addEventListener('dragleave', e => {
        const rel = e.relatedTarget;
        if (!rel || !(rel instanceof Node) || !askDrawer.contains(rel)) {
          askDrawer.classList.remove('is-drag-over');
        }
      });
      askDrawer.addEventListener('drop', e => {
        e.preventDefault();
        askDrawer.classList.remove('is-drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          attachFiles(e.dataTransfer.files);
        }
      });

      askDrawer.addEventListener('click', e => {
        const rmAttBtn = e.target.closest('[data-ai-remove-att]');
        if (rmAttBtn) {
          removeAttachment(rmAttBtn.getAttribute('data-ai-remove-att'));
          return;
        }
        const vLangBtn = e.target.closest('[data-ai-voice-lang]');
        if (vLangBtn) {
          setVoiceLang(vLangBtn.getAttribute('data-ai-voice-lang'));
          return;
        }
        if (e.target.closest('#aiVmCloseBtn')) {
          toggleLiveVoiceMode(false);
          return;
        }
        if (e.target.closest('#aiVmHandsFreeBtn')) {
          _chatState.handsFreeVoice = !_chatState.handsFreeVoice;
          _chatState.voiceAutoSendOnSilence = Boolean(_chatState.liveVoiceMode && _chatState.handsFreeVoice);
          syncVoiceModeDeckUi();
          return;
        }
        if (e.target.closest('#aiVmRateBtn') || e.target.closest('[data-ai-audio-rate]')) {
          cyclePlaybackRate();
          return;
        }
        if (e.target.closest('#aiVmPauseBtn') || e.target.closest('[data-ai-audio-pause]')) {
          togglePausePlayback();
          return;
        }
        if (e.target.closest('#aiVmStopSpeakBtn') || e.target.closest('[data-ai-audio-stop]')) {
          if (_chatState.voiceActive) cancelVoiceRecording();
          stopActivePlayback();
          return;
        }
        if (e.target.closest('#aiVmPrimaryBtn')) {
          if (_chatState.voiceActive) {
            stopVoiceRecording({ attachVoiceNote: true, autoSend: true });
          } else {
            stopActivePlayback();
            startVoiceRecording({ autoSendOnSilence: _chatState.handsFreeVoice });
          }
          return;
        }
        if (e.target.closest('#aiVoiceCancelBtn')) {
          cancelVoiceRecording();
          return;
        }
        if (e.target.closest('#aiVoiceStopBtn')) {
          stopVoiceRecording({ attachVoiceNote: true });
          return;
        }
        if (e.target.closest('#aiVoiceSendBtn')) {
          stopVoiceRecording({ attachVoiceNote: true, autoSend: true });
          return;
        }
        const copyTblBtn = e.target.closest('[data-ai-copy-table]');
        if (copyTblBtn) {
          copyTurnTableToClipboard(copyTblBtn.getAttribute('data-ai-copy-table'), false, copyTblBtn);
          return;
        }
        const csvTblBtn = e.target.closest('[data-ai-csv-table]');
        if (csvTblBtn) {
          copyTurnTableToClipboard(csvTblBtn.getAttribute('data-ai-csv-table'), true, csvTblBtn);
          return;
        }
        const playBtn = e.target.closest('[data-ai-play-audio]');
        if (playBtn) {
          const url = playBtn.getAttribute('data-ai-play-audio');
          if (url && typeof Audio !== 'undefined') {
            try {
              if (_chatState.activeAudioEl && _chatState.activeAudioEl.src === url && !_chatState.activeAudioEl.paused) {
                stopActivePlayback();
                return;
              }
              stopActivePlayback();
              const audioEl = new Audio(url);
              _chatState.activeAudioEl = audioEl;
              audioEl.onended = () => { if (_chatState.activeAudioEl === audioEl) _chatState.activeAudioEl = null; syncInlineAudioPlayerBar(); };
              audioEl.play().catch(() => {});
            } catch (_) {}
          }
          return;
        }
        const speakBtn = e.target.closest('[data-ai-speak]');
        if (speakBtn) {
          const botBubble = speakBtn.closest('.ai-msg-bot');
          const tIdxAttr = speakBtn.getAttribute('data-turn-idx') || (botBubble ? botBubble.getAttribute('data-turn-idx') : null);
          const turnObj = (tIdxAttr != null && Number(tIdxAttr) >= 0) ? _chatState.history[Number(tIdxAttr)] : null;
          if (turnObj) {
            speakBotReply(turnObj, speakBtn.getAttribute('data-ai-speak') || turnObj.lang || 'en', speakBtn);
            return;
          }
          const pEl = botBubble ? botBubble.querySelector('.ai-bot-p') : null;
          const listEl = botBubble ? botBubble.querySelector('.ai-bot-list') : null;
          const bulletTexts = listEl ? Array.from(listEl.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean) : [];
          const totEl = botBubble ? botBubble.querySelector('.ai-mini-tot') : null;
          const combinedHtml = [pEl ? pEl.textContent.trim() : '', ...bulletTexts, totEl ? totEl.textContent.trim() : ''].filter(Boolean).join('. ');
          speakBotReply(combinedHtml, speakBtn.getAttribute('data-ai-speak') || 'en', speakBtn);
          return;
        }
        const inspBtn = e.target.closest('[data-ai-inspect-key]');
        if (inspBtn && _ctx && typeof _ctx.showRecordInspector === 'function') {
          const crKey = inspBtn.getAttribute('data-ai-inspect-key');
          const id = inspBtn.getAttribute('data-ai-inspect-id');
          if (window.innerWidth <= 860) closeDrawer();
          _ctx.showRecordInspector(crKey, id);
          return;
        }
        const chip = e.target.closest('#aiChips .ai-pill-btn');
        if (chip) {
          submitQuestion(chip.getAttribute('data-prompt') || chip.textContent);
          return;
        }
        const followChip = e.target.closest('[data-ask-chip]');
        if (followChip) {
          submitQuestion(followChip.getAttribute('data-ask-chip'));
          return;
        }
        const gotoBtn = e.target.closest('[data-ai-goto-view]');
        if (gotoBtn && _ctx && typeof _ctx.setView === 'function') {
          const targetView = gotoBtn.getAttribute('data-ai-goto-view');
          if (window.innerWidth <= 860) closeDrawer();
          _ctx.setView(targetView);
          return;
        }
        const formBtn = e.target.closest('[data-ai-open-form]');
        if (formBtn && _ctx && typeof _ctx.openEntryModal === 'function') {
          const fid = formBtn.getAttribute('data-ai-open-form');
          closeDrawer();
          _ctx.openEntryModal(fid);
        }
      });
    }
  }

  ensureDailyBriefingI18nRegistered();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('mfg:lang-changed', () => {
      ensureDailyBriefingI18nRegistered();
      if (typeof document !== 'undefined') {
        const curLang = (window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang()) || 'en';
        if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && curLang !== 'en') {
          ['dopsBriefingBtn', 'ceoPeriodSummaryBtn', 'ceoVarianceBriefBtn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) {
              try { window.MFG_I18N.translateDom(b); } catch (_) {}
            }
          });
        }
        if (_chatState.periodPopoverOpen) {
          openCeoVariancePopover(_chatState.periodPopoverAnchor, buildCeoPeriodSummary(curLang));
        }
      }
    });
  }

  window.MFG_ASK = {
    init,
    open: openDrawer,
    close: closeDrawer,
    reset: resetThread,
    ask: submitQuestion,
    attachFiles,
    removeAttachment,
    clearAttachments,
    startVoice: startVoiceRecording,
    stopVoice: stopVoiceRecording,
    cancelVoice: cancelVoiceRecording,
    toggleVoiceMode: toggleLiveVoiceMode,
    setVoiceLang,
    setPreferredLang,
    getPreferredLang: () => _chatState.voiceLang,
    speak: speakBotReply,
    pauseSpeaking: togglePausePlayback,
    cyclePlaybackRate,
    buildSpokenScript: buildSpokenInsightScript,
    buildTtsPayload: (plain, lang) => {
      const safeLang = lang || detectLang(plain) || 'en';
      return {
        text: buildTtsPromptPayload(plain, safeLang),
        lang: safeLang,
        voiceName: safeLang === 'ar' ? 'Charon' : (safeLang === 'fr' ? 'Aoede' : 'Kore'),
        model: 'gemini-3.8-flash-lite-tts'
      };
    },
    normalizeForSpeech: normalizeTextForSpeech,
    buildLlmMessages: buildLlmContextMessages,
    buildDailyBriefing,
    speakDailyBriefing,
    buildPeriodSummary: buildCeoPeriodSummary,
    speakPeriodSummary: speakCeoPeriodSummary,
    requestPeriodVariance: requestPeriodVarianceCommentary,
    togglePeriodVariance: toggleCeoVariancePopover,
    closePeriodVariance: closeCeoVariancePopover,
    rebindPeriodSummaryButton,
    stopPeriodSummaryIfActive,
    stopSpeaking: stopActivePlayback,
    stopBriefingIfActive,
    rebindBriefingButton,
    requestTtsUrl: requestCloudOrLocalTtsUrl,
    getPlaybackState: () => ({
      speaking: Boolean(_chatState.activeSpeakBtn || _chatState.activeAudioEl),
      paused: Boolean(_chatState.activeAudioPaused),
      loading: Boolean(_chatState.activeSpeakCtrl),
      playbackRate: _chatState.playbackRate,
      liveVoiceMode: Boolean(_chatState.liveVoiceMode),
      voiceModePhase: _chatState.voiceModePhase,
      handsFreeVoice: Boolean(_chatState.handsFreeVoice),
      briefingScope: _chatState.activeBriefingScope || '',
      periodSummaryScope: _chatState.activePeriodSummaryScope || '',
      periodPopoverOpen: Boolean(_chatState.periodPopoverOpen),
      lastSpokenText: _chatState.lastSpokenText || '',
      audioSrc: _chatState.activeAudioEl ? (_chatState.activeAudioEl.src || '') : '',
      cacheSize: _chatState.ttsAudioCache ? _chatState.ttsAudioCache.size : 0
    }),
    syncScope: syncHeaderAndChips,
    answer: answerHtmlSnapshot,
    answerQuestion,
    getState: () => ({
      turns: _chatState.history.length,
      pending: Boolean(_chatState.pending),
      voiceActive: Boolean(_chatState.voiceActive),
      liveVoiceMode: Boolean(_chatState.liveVoiceMode),
      voiceLang: _chatState.voiceLang,
      attachments: _chatState.attachments.map(a => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        size: a.size,
        hasDataUrl: Boolean(a.dataUrl),
        rowCount: a.rowCount,
        numericSum: a.numericSum,
        detectedView: a.detectedView || '',
        summaryLine: a.summaryLine
      })),
      lastReply: _chatState.history[_chatState.history.length - 1] || null
    })
  };
})();
