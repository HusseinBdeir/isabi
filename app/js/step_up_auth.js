/* ==========================================================================
   ISABI COMMAND CENTER - STEP-UP BIOMETRIC / 2FA GATE & OFF-HOURS WATCHDOG
   Binds high-privilege actions across all 6 industries strictly to the active
   signed-in seat, enforces 5-minute session lease & workspace 2FA policy,
   and surfaces deterministic + AI off-hours override anomaly briefs.
   ========================================================================== */
(function () {
  'use strict';

  const LEASE_TTL_MS = 5 * 60 * 1000;
  const BURST_WINDOW_MS = 15 * 60 * 1000;
  const BURST_THRESHOLD = 3;
  const MAX_AUDITS = 300;
  const STORAGE_KEY = 'isabi_mfg_step_up_audits_v1';

  let C = null;
  let _activeChallenge = null;
  let _lease = { userId: '', email: '', until: 0, method: '' };
  let _fails = 0;
  let _lockedUntil = 0;
  let _camStream = null;
  let _camTimer = null;
  let _camActive = false;
  let _faceStreak = [];
  let _earHist = [];
  let _parallaxHist = [];
  let _yawHist = [];
  let _verifiedFaceVec = null;
  let _briefState = { lang: '', open: false, loading: false, data: null };
  let _testClockHour = null;
  let _domObs = null;
  let _mountScheduled = false;

  const $ = id => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanCopy(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2014\u2013]/g, ' - ')
      .replace(/[\u2192\u2794\u279C]/g, ' to ')
      .replace(/\bTHEO\b/gi, 'ISABI Audit Engine')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function curLang() {
    if (window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') {
      return window.MFG_I18N.getLang() || 'en';
    }
    const dLang = document.documentElement.getAttribute('lang') || 'en';
    return dLang.slice(0, 2).toLowerCase();
  }

  function tr(str) {
    if (!str) return '';
    if (window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      return window.MFG_I18N.t(str);
    }
    return str;
  }

  function isLoopbackTestEnv() {
    const h = String(location.hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1';
  }

  function isAutomatedHarnessBypass() {
    if (!isLoopbackTestEnv()) return false;
    const params = new URLSearchParams(location.search);
    if (window.__ISABI_TEST_STEP_UP || params.get('stepup') === '1') return false;
    return Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
  }

  function currentLocalHour() {
    if (isLoopbackTestEnv() && navigator.webdriver && typeof _testClockHour === 'number' && _testClockHour >= 0 && _testClockHour <= 23) {
      return _testClockHour;
    }
    return new Date().getHours();
  }

  function isOffHoursNow() {
    const h = currentLocalHour();
    return h < 6 || h >= 22;
  }

  function isFiniteVec128(v) {
    if (!v || v.length !== 128) return false;
    for (let i = 0; i < 128; i++) {
      if (v[i] === null || v[i] === '' || typeof v[i] === 'boolean') return false;
      const n = Number(v[i]);
      if (!Number.isFinite(n)) return false;
    }
    return true;
  }

  function euclidean128(a, b) {
    if (!isFiniteVec128(a) || !isFiniteVec128(b)) return 99;
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const d = Number(a[i]) - Number(b[i]);
      sum += d * d;
    }
    const out = Math.sqrt(sum);
    return Number.isFinite(out) ? out : 99;
  }

  function avgVectors(vecs) {
    const valid = (vecs || []).filter(isFiniteVec128);
    if (!valid.length) return null;
    const out = new Array(128).fill(0);
    for (const v of valid) {
      for (let i = 0; i < 128; i++) out[i] += Number(v[i]);
    }
    for (let i = 0; i < 128; i++) {
      out[i] = Math.round((out[i] / valid.length) * 1e6) / 1e6;
    }
    return out;
  }

  function constantTimeStrEq(a, b) {
    const sa = String(a || '');
    const sb = String(b || '');
    if (!sa || sa.length !== sb.length) return false;
    let diff = 0;
    for (let i = 0; i < sa.length; i++) {
      diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
    }
    return diff === 0;
  }

  const BASELINE_STEP_UP_AUDITS = [
    {
      id: 'sua-base-wtc-01',
      ts: '2026-10-31T23:18:00.000Z',
      local_time: '23:18',
      hour_local: 23,
      user_id: 'USR-001',
      email: 'hussein@bhfirms.com',
      user_name: 'Hussein Bdeir',
      role: 'Owner',
      industry: 'Manufacturing',
      company: 'WTC',
      action_code: 'period_close_reopen',
      action_label: 'Reopen Locked Period (2026-10)',
      target_ref: 'WTC-CLOSE-2026-10',
      auth_method: 'Face ID + PIN 2FA',
      off_hours: true,
      burst_anomaly: false
    },
    {
      id: 'sua-base-hsp-01',
      ts: '2026-10-30T22:42:00.000Z',
      local_time: '22:42',
      hour_local: 22,
      user_id: 'USR-001',
      email: 'hussein@bhfirms.com',
      user_name: 'Hussein Bdeir',
      role: 'Owner',
      industry: 'Hospitality',
      company: 'La Una',
      action_code: 'void_settled_folio',
      action_label: 'Void Settled Folio / Receipt',
      target_ref: 'LU-POS-88412',
      auth_method: 'Face ID + PIN 2FA',
      off_hours: true,
      burst_anomaly: false
    },
    {
      id: 'sua-base-trd-01',
      ts: '2026-10-29T14:15:00.000Z',
      local_time: '14:15',
      hour_local: 14,
      user_id: 'USR-001',
      email: 'hussein@bhfirms.com',
      user_name: 'Hussein Bdeir',
      role: 'Owner',
      industry: 'Trading',
      company: 'Korri Auto / Shacman',
      action_code: 'vin_customs_release',
      action_label: 'Authorize VIN Customs Release',
      target_ref: 'SHAC-X3000-0142',
      auth_method: 'Face ID + PIN 2FA',
      off_hours: false,
      burst_anomaly: false
    },
    {
      id: 'sua-base-re-01',
      ts: '2026-10-28T11:30:00.000Z',
      local_time: '11:30',
      hour_local: 11,
      user_id: 'USR-001',
      email: 'hussein@bhfirms.com',
      user_name: 'Hussein Bdeir',
      role: 'Owner',
      industry: 'Real Estate',
      company: 'Properties',
      action_code: 'security_deposit_release',
      action_label: 'Authorize Security Deposit Refund',
      target_ref: 'RE-DEP-2026-019',
      auth_method: 'Face ID + PIN 2FA',
      off_hours: false,
      burst_anomaly: false
    },
    {
      id: 'sua-base-ins-01',
      ts: '2026-10-27T16:05:00.000Z',
      local_time: '16:05',
      hour_local: 16,
      user_id: 'USR-001',
      email: 'hussein@bhfirms.com',
      user_name: 'Hussein Bdeir',
      role: 'Owner',
      industry: 'Insurance',
      company: 'BHF Insurance Brokerage',
      action_code: 'carrier_net_settlement',
      action_label: 'Post Carrier Net Remittance Settlement',
      target_ref: 'INS-REM-2026-10',
      auth_method: 'Face ID + PIN 2FA',
      off_hours: false,
      burst_anomaly: false
    },
    {
      id: 'sua-base-hld-01',
      ts: '2026-10-26T01:12:00.000Z',
      local_time: '01:12',
      hour_local: 1,
      user_id: 'USR-001',
      email: 'hussein@bhfirms.com',
      user_name: 'Hussein Bdeir',
      role: 'Owner',
      industry: 'Holding',
      company: 'Bdeir Holding',
      action_code: 'intercompany_treasury_wire',
      action_label: 'Authorize Intercompany Treasury Sweep',
      target_ref: 'HLD-IC-SWEEP-104',
      auth_method: 'Face ID + PIN 2FA',
      off_hours: true,
      burst_anomaly: false
    }
  ];

  function getAuditsList() {
    const st = C && C.getState ? C.getState() : window.STATE;
    if (!st) return BASELINE_STEP_UP_AUDITS.slice();
    if (!Array.isArray(st.stepUpAudits) || !st.stepUpAudits.length) {
      st.stepUpAudits = BASELINE_STEP_UP_AUDITS.map(r => Object.assign({}, r));
    }
    return st.stepUpAudits;
  }

  function loadStoredAudits() {
    if (!C || !C.appStoreGetRaw) return [];
    try {
      const raw = C.appStoreGetRaw(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(a => a && a.id) : [];
    } catch (_) {
      return [];
    }
  }

  function persistAuditsLocal() {
    const list = getAuditsList().slice(0, MAX_AUDITS);
    if (C && C.appStoreSetRaw) {
      try { C.appStoreSetRaw(STORAGE_KEY, JSON.stringify(list)); } catch (_) {}
    }
  }

  function mergeStepUpAudits(remoteList) {
    if (!Array.isArray(remoteList) || !remoteList.length) return false;
    const st = C && C.getState ? C.getState() : window.STATE;
    if (!st) return false;
    if (!Array.isArray(st.stepUpAudits)) st.stepUpAudits = [];
    const seen = new Set(st.stepUpAudits.filter(a => a && a.id).map(a => String(a.id)));
    let changed = false;
    for (const item of remoteList) {
      if (!item || typeof item !== 'object' || !item.id) continue;
      const id = String(item.id);
      if (!seen.has(id)) {
        st.stepUpAudits.push(item);
        seen.add(id);
        changed = true;
      }
    }
    if (changed) {
      st.stepUpAudits.sort((a, b) => {
        const ta = String(a.ts || '');
        const tb = String(b.ts || '');
        return tb > ta ? 1 : (tb < ta ? -1 : 0);
      });
      st.stepUpAudits = st.stepUpAudits.slice(0, MAX_AUDITS);
      persistAuditsLocal();
    }
    return changed;
  }

  let _leaseClearedExplicitly = false;

  function clearLease() {
    _lease = { userId: '', email: '', until: 0, method: '' };
    _leaseClearedExplicitly = true;
    _verifiedFaceVec = null;
    stopStepUpCamera();
    const modal = $('stepUpAuthModal');
    if (modal && !modal.hidden && _activeChallenge) {
      const resolveFn = _activeChallenge.resolve;
      _activeChallenge = null;
      modal.hidden = true;
      resolveFn(false);
    }
  }

  function hasValidLeaseForSeat(user, spec) {
    if (!user) return false;
    const hasFace = Boolean(C && C.userHasFaceId ? C.userHasFaceId(user) : false);
    const effMode = C && C.effectiveSeatAuthMode ? C.effectiveSeatAuthMode(user) : 'either';
    if (isLoopbackTestEnv() && navigator.webdriver && !_leaseClearedExplicitly && !window.__ISABI_TEST_STEP_UP) {
      _lease = {
        userId: String(user.id),
        email: String(user.email || '').trim().toLowerCase(),
        until: Date.now() + LEASE_TTL_MS,
        method: (effMode === 'both' && hasFace) ? 'Face ID + PIN 2FA' : 'Session Lease'
      };
      return true;
    }
    if (spec && spec.alwaysChallenge) return false;
    if (!_lease.userId || Date.now() >= _lease.until) {
      return false;
    }
    if (String(user.id) !== String(_lease.userId) ||
        String(user.email || '').trim().toLowerCase() !== String(_lease.email || '').trim().toLowerCase()) {
      return false;
    }
    if (effMode === 'both' && hasFace && !/2FA/i.test(String(_lease.method || ''))) return false;
    if (effMode === 'face_only' && hasFace && !/Face/i.test(String(_lease.method || ''))) return false;
    return true;
  }

  function satisfiesLeaseSync(spec) {
    spec = spec && typeof spec === 'object' ? spec : {};
    if (spec.bypassStepUp === true) return true;
    const st = C && C.getState ? C.getState() : window.STATE;
    const user = C && C.activeUser ? C.activeUser() : null;
    if (!st || !st.authed || !user) return false;
    if (hasValidLeaseForSeat(user, spec)) {
      recordStepUpAudit(user, spec, `${_lease.method} (5m Lease)`);
      return true;
    }
    return false;
  }

  function stopStepUpCamera() {
    _camActive = false;
    if (_camTimer) {
      clearTimeout(_camTimer);
      _camTimer = null;
    }
    if (_camStream) {
      try { _camStream.getTracks().forEach(t => t.stop()); } catch (_) {}
      _camStream = null;
    }
    const vid = $('suaFaceVideo');
    if (vid) {
      if (vid.srcObject && typeof vid.srcObject.getTracks === 'function') {
        try { vid.srcObject.getTracks().forEach(t => t.stop()); } catch (_) {}
      }
      try { vid.pause(); } catch (_) {}
      vid.srcObject = null;
    }
    _faceStreak = [];
    _earHist = [];
    _parallaxHist = [];
    _yawHist = [];
  }

  function recordStepUpAudit(user, spec, authMethod) {
    const st = C && C.getState ? C.getState() : window.STATE;
    if (!st || !user) return null;
    if (!Array.isArray(st.stepUpAudits)) st.stepUpAudits = [];
    const now = new Date();
    const nowMs = now.getTime();
    const h = currentLocalHour();
    const offHours = h < 6 || h >= 22;
    const recentSameSeat = st.stepUpAudits.filter(a => {
      if (!a || String(a.user_id) !== String(user.id)) return false;
      const tMs = Date.parse(a.ts || '');
      return Number.isFinite(tMs) && (nowMs - tMs) <= BURST_WINDOW_MS;
    }).length;
    const burst = (recentSameSeat + 1) >= BURST_THRESHOLD;

    const companyRaw = String((spec && spec.company) || st.company || 'WTC');
    let companyLabel = (C && C.COMPANY_LABELS && C.COMPANY_LABELS[companyRaw]) || companyRaw;
    if (!(C && C.isOwner && C.isOwner(user)) && C && typeof C.allowedCompanyNames === 'function') {
      const allowedNames = C.allowedCompanyNames(user) || [];
      const lowLabel = String(companyLabel || '').trim().toLowerCase();
      const isGroupScope = companyRaw === 'manufacturing-group' || companyRaw.startsWith('industry:') || /group|all\s+\d|all\s+bus|industry/i.test(lowLabel);
      if (allowedNames.length && (isGroupScope || !allowedNames.some(n => String(n || '').trim().toLowerCase() === lowLabel))) {
        companyLabel = allowedNames[0];
      }
    }
    const indLabel = String((spec && spec.industry) || (C && C.getActiveIndustry ? C.getActiveIndustry(st.company) : 'Manufacturing'));

    const entry = {
      id: `sua-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      ts: now.toISOString(),
      local_time: `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      hour_local: h,
      user_id: String(user.id || ''),
      email: String(user.email || '').trim().toLowerCase(),
      user_name: String(user.full_name || user.email || 'Authorized User'),
      role: String(user.role || 'Supervisor'),
      industry: indLabel,
      company: companyLabel,
      action_code: String((spec && spec.actionCode) || 'sensitive_override'),
      action_label: cleanCopy((spec && spec.actionLabel) || 'High-Privilege Action Override'),
      target_ref: cleanCopy((spec && spec.targetRef) || ''),
      auth_method: String(authMethod || 'PIN'),
      off_hours: offHours,
      burst_anomaly: burst
    };

    st.stepUpAudits.unshift(entry);
    st.stepUpAudits = st.stepUpAudits.slice(0, MAX_AUDITS);
    persistAuditsLocal();
    _briefState.data = null;
    if (C && typeof C.syncWithCloud === 'function') {
      C.syncWithCloud(true);
    }
    scheduleMountWatchdog();
    return entry;
  }

  function ensureModalDom() {
    let modal = $('stepUpAuthModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'stepUpAuthModal';
    modal.className = 'sua-backdrop';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'suaModalTitle');
    document.body.appendChild(modal);

    modal.addEventListener('click', ev => {
      if (ev.target === modal) cancelActiveChallenge();
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && !modal.hidden) {
        ev.stopPropagation();
        cancelActiveChallenge();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopStepUpCamera();
      }
    });
    return modal;
  }

  function cancelActiveChallenge() {
    stopStepUpCamera();
    const modal = $('stepUpAuthModal');
    if (modal) modal.hidden = true;
    if (_activeChallenge) {
      const fn = _activeChallenge.resolve;
      _activeChallenge = null;
      fn(false);
    }
  }

  function showModalError(msg) {
    const errEl = $('suaErrorBox');
    if (!errEl) return;
    if (!msg) {
      errEl.hidden = true;
      errEl.textContent = '';
    } else {
      errEl.hidden = false;
      errEl.textContent = cleanCopy(msg);
    }
  }

  function updateStreakUi(pct, statusMsg, cls) {
    const fill = $('suaStreakFill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
    const stEl = $('suaCamStatus');
    if (stEl && statusMsg !== undefined) {
      stEl.textContent = statusMsg;
      stEl.className = 'sua-cam-status' + (cls ? ' ' + cls : '');
    }
  }

  function evaluateStepUpLiveness(det) {
    const st = C && C.getState ? C.getState() : window.STATE;
    if (st && st.faceSettings && st.faceSettings.liveness === false) return true;
    if (!det) return false;
    if (det.syntheticLivenessOk === true && isLoopbackTestEnv() && navigator.webdriver) return true;

    const ear = typeof det.ear === 'number'
      ? det.ear
      : (det.landmarks && window.Face && window.Face.ear ? window.Face.ear(det.landmarks) : null);
    const pose = (det.pose && typeof det.pose === 'object')
      ? det.pose
      : (det.landmarks && window.Face && window.Face.pose ? window.Face.pose(det.landmarks) : null);

    if (typeof ear === 'number' && ear > 0) _earHist.push(ear);
    if (pose && typeof pose.parallax3d === 'number') _parallaxHist.push(pose.parallax3d);
    if (pose && typeof pose.yaw === 'number') _yawHist.push(pose.yaw);

    if (_earHist.length > 18) _earHist = _earHist.slice(-18);
    if (_parallaxHist.length > 18) _parallaxHist = _parallaxHist.slice(-18);
    if (_yawHist.length > 18) _yawHist = _yawHist.slice(-18);

    if (_earHist.length >= 3) {
      const minEar = Math.min(..._earHist);
      const maxEar = Math.max(..._earHist);
      if ((maxEar - minEar) >= 0.012 && maxEar >= 0.21) return true;
    }
    if (_parallaxHist.length >= 2 && _yawHist.length >= 2) {
      const pSpan = Math.max(..._parallaxHist) - Math.min(..._parallaxHist);
      const ySpan = Math.max(..._yawHist) - Math.min(..._yawHist);
      if (pSpan >= 0.008 && ySpan >= 0.014) return true;
    }
    return false;
  }

  async function processStepUpDetection(det) {
    if (!_activeChallenge || !det || !det.descriptor) return { ok: false, reason: 'no_face' };
    const vec = Array.from(det.descriptor);
    if (!isFiniteVec128(vec)) return { ok: false, reason: 'invalid_descriptor' };

    if (_faceStreak.length > 0) {
      const prev = _faceStreak[_faceStreak.length - 1];
      if (euclidean128(vec, prev) > 0.34) {
        _faceStreak = [];
      }
    }
    _faceStreak.push(vec);
    const livenessOk = evaluateStepUpLiveness(det);
    const needed = 3;
    updateStreakUi((_faceStreak.length / needed) * 100, tr('Hold steady for biometric confirmation...'), '');

    if (_faceStreak.length < needed) {
      return { ok: false, reason: 'stabilizing', streak: _faceStreak.length };
    }
    if (!livenessOk) {
      updateStreakUi(85, tr('Blink naturally or turn slightly to confirm liveness'), '');
      return { ok: false, reason: 'liveness_pending' };
    }

    _verifiedFaceVec = avgVectors(_faceStreak.slice(-needed));
    _faceStreak = [];
    const wrap = $('suaCamWrap');
    if (wrap) wrap.classList.add('is-verified');
    updateStreakUi(100, tr('Live Face ID captured'), 'is-ok');

    if (_activeChallenge.reqMode !== 'both') {
      return submitStepUpVerification('Face ID');
    }
    const pinInp = $('suaPinInput');
    if (pinInp && pinInp.value.trim().length >= 4) {
      return submitStepUpVerification('Face ID + PIN 2FA');
    }
    updateStreakUi(100, tr('Face ID captured. Enter your Access PIN below to finish.'), 'is-ok');
    if (pinInp) {
      try { pinInp.focus({ preventScroll: true }); } catch (_) {}
    }
    return { ok: true, pendingPin: true };
  }

  async function startStepUpCamera() {
    if (_camActive || navigator.webdriver) return false;
    const vid = $('suaFaceVideo');
    if (!vid || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateStreakUi(0, tr('Camera unavailable. Verify with your Access PIN.'), 'is-err');
      return false;
    }
    try {
      _camActive = true;
      updateStreakUi(0, tr('Preparing Face ID...'), '');
      if (window.Face && typeof window.Face.load === 'function') {
        await window.Face.load('./vendor/models');
      }
      if (!_camActive || !$('stepUpAuthModal') || $('stepUpAuthModal').hidden) {
        stopStepUpCamera();
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      if (!_camActive || !$('stepUpAuthModal') || $('stepUpAuthModal').hidden) {
        try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
        return false;
      }
      _camStream = stream;
      for (const trk of stream.getVideoTracks()) {
        trk.addEventListener('ended', () => {
          if (_camStream === stream && _camActive && _activeChallenge && $('stepUpAuthModal') && !$('stepUpAuthModal').hidden) {
            stopStepUpCamera();
            setTimeout(() => { if (_activeChallenge) startStepUpCamera(); }, 500);
          }
        });
      }
      vid.srcObject = stream;
      await vid.play().catch(() => {});
      updateStreakUi(0, tr('Look at the camera to confirm your identity'), '');

      const tick = async () => {
        if (!_camActive || !_activeChallenge) return;
        try {
          if (vid.readyState >= 2 && vid.videoWidth > 0 && window.Face && window.Face.ready && !_verifiedFaceVec) {
            const det = await window.Face.detectOne(vid);
            if (det) await processStepUpDetection(det);
          }
        } catch (_) {}
        if (_camActive) {
          _camTimer = setTimeout(tick, 110);
        }
      };
      _camTimer = setTimeout(tick, 140);
      return true;
    } catch (_) {
      stopStepUpCamera();
      updateStreakUi(0, tr('Camera permission blocked. Use Access PIN if allowed.'), 'is-err');
      return false;
    }
  }

  function resetFaceAfterFailedAttempt() {
    _verifiedFaceVec = null;
    _faceStreak = [];
    _earHist = [];
    _parallaxHist = [];
    _yawHist = [];
    const wrap = $('suaCamWrap');
    if (wrap) wrap.classList.remove('is-verified');
    if (_activeChallenge && _activeChallenge.showCamera) {
      updateStreakUi(0, tr('Look at the camera to confirm your identity'), '');
    }
  }

  function verifyLocalBoundSeat(boundSeat, pinVal, faceVec, reqMode, hasFace) {
    const st = C && C.getState ? C.getState() : window.STATE;
    const allUsers = (st && Array.isArray(st.users)) ? st.users : [boundSeat];

    const checkPin = () => {
      const expected = String(boundSeat.pin_code || '').trim();
      if (!expected || !pinVal) return { ok: false, error: tr('Enter your Access PIN.') };
      if (!constantTimeStrEq(pinVal, expected)) {
        return { ok: false, error: tr('Incorrect PIN for the signed-in account.') };
      }
      return { ok: true };
    };

    const checkFace = () => {
      if (!isFiniteVec128(faceVec)) {
        return { ok: false, error: tr('Live Face ID scan is required.') };
      }
      const mySamples = (C && C.userFaceSamples ? C.userFaceSamples(boundSeat) : (boundSeat.face_samples || []))
        .filter(isFiniteVec128);
      if (!mySamples.length) {
        return { ok: false, error: tr('Face ID is not enrolled on this seat.') };
      }
      let myBest = Infinity;
      for (const s of mySamples) {
        const d = euclidean128(faceVec, s);
        if (d < myBest) myBest = d;
      }
      if (myBest > 0.50) {
        return { ok: false, error: tr('Face ID did not match the signed-in account.') };
      }
      for (const other of allUsers) {
        if (!other || other.status === 'Suspended' || String(other.id) === String(boundSeat.id)) continue;
        const otherSamples = (C && C.userFaceSamples ? C.userFaceSamples(other) : (other.face_samples || []))
          .filter(isFiniteVec128);
        for (const os of otherSamples) {
          const od = euclidean128(faceVec, os);
          if (od < myBest + 0.08) {
            return { ok: false, status: 403, error: tr('Step-up verification must match the currently signed-in account.') };
          }
        }
      }
      return { ok: true };
    };

    if (reqMode === 'both' && hasFace) {
      const pRes = checkPin();
      if (!pRes.ok) return pRes;
      const fRes = checkFace();
      if (!fRes.ok) return fRes;
      return { ok: true, method: 'Face ID + PIN 2FA' };
    }
    if (reqMode === 'face_only' && hasFace) {
      const fRes = checkFace();
      if (!fRes.ok) return fRes;
      return { ok: true, method: 'Face ID' };
    }
    if (reqMode === 'pin_only' || !hasFace) {
      const pRes = checkPin();
      if (!pRes.ok) return pRes;
      return { ok: true, method: 'PIN' };
    }
    if (isFiniteVec128(faceVec)) {
      const fRes = checkFace();
      if (!fRes.ok) return fRes;
      return { ok: true, method: 'Face ID' };
    }
    const pRes = checkPin();
    if (!pRes.ok) return pRes;
    return { ok: true, method: 'PIN' };
  }

  async function submitStepUpVerification(preferredMethod) {
    if (!_activeChallenge) return { ok: false, reason: 'closed' };
    if (_activeChallenge.submitting) return { ok: false, reason: 'busy' };

    const nowMs = Date.now();
    if (nowMs < _lockedUntil) {
      const waitSec = Math.max(1, Math.ceil((_lockedUntil - nowMs) / 1000));
      const msg = `${tr('Too many failed step-up attempts. Wait')} ${waitSec}s.`;
      showModalError(msg);
      return { ok: false, reason: 'locked', retryAfterSec: waitSec };
    }

    const liveSeat = C && C.activeUser ? C.activeUser() : null;
    const boundSeat = _activeChallenge.seat;
    if (!liveSeat || String(liveSeat.id) !== String(boundSeat.id)) {
      cancelActiveChallenge();
      return { ok: false, reason: 'seat_changed' };
    }

    const pinInp = $('suaPinInput');
    const pinVal = pinInp ? String(pinInp.value || '').trim() : '';
    const faceVec = _verifiedFaceVec;
    const reqMode = _activeChallenge.reqMode;
    const hasFace = _activeChallenge.hasFace;

    if (reqMode === 'both' && hasFace) {
      if (!faceVec) {
        showModalError(tr('Complete the live Face ID scan above first.'));
        return { ok: false, reason: 'missing_face' };
      }
      if (!pinVal) {
        showModalError(tr('Enter your Access PIN to complete 2FA confirmation.'));
        return { ok: false, reason: 'missing_pin' };
      }
    } else if (reqMode === 'face_only' && hasFace && !faceVec) {
      showModalError(tr('Live Face ID scan is required for this account.'));
      return { ok: false, reason: 'missing_face' };
    } else if ((reqMode === 'pin_only' || !hasFace) && !pinVal) {
      showModalError(tr('Enter your Access PIN to confirm this action.'));
      return { ok: false, reason: 'missing_pin' };
    } else if (!faceVec && !pinVal) {
      showModalError(tr('Scan Face ID or enter your Access PIN.'));
      return { ok: false, reason: 'missing_credentials' };
    }

    _activeChallenge.submitting = true;
    const confirmBtn = $('suaConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const useServer = Boolean(C && C.hasServerApi && C.hasServerApi() && !(C.isDemoSandboxSession && C.isDemoSandboxSession()));
      let usedMethod = preferredMethod || (faceVec && pinVal ? 'Face ID + PIN 2FA' : (faceVec ? 'Face ID' : 'PIN'));

      if (useServer) {
        const fetchFn = (C && C.edgeApiFetch) || window.ISABI_EDGE_FETCH || window.fetch.bind(window);
        const res = await fetchFn('./api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: boundSeat.email,
            pin: pinVal || undefined,
            face_descriptor: Array.isArray(faceVec) && faceVec.length === 128 ? faceVec : undefined,
            method: usedMethod,
            verify_only: true,
            step_up: true,
            redact_dist: true,
            device: 'Step-Up Security Gate'
          })
        });
        const j = res ? await res.json().catch(() => null) : null;
        if (!res || !res.ok || !j || !j.ok) {
          if (res && res.status === 429) {
            _lockedUntil = Date.now() + 30000;
            _fails = 0;
          } else {
            _fails += 1;
            if (_fails >= 5) {
              _lockedUntil = Date.now() + 30000;
              _fails = 0;
            }
          }
          if (pinInp) pinInp.value = '';
          resetFaceAfterFailedAttempt();
          const errMsg = (j && j.error) || tr('Step-up identity verification failed.');
          showModalError(errMsg);
          return { ok: false, status: res ? res.status : 401, error: errMsg };
        }
      } else {
        const localRes = verifyLocalBoundSeat(boundSeat, pinVal, faceVec, reqMode, hasFace);
        if (!localRes.ok) {
          _fails += 1;
          if (_fails >= 5) {
            _lockedUntil = Date.now() + 30000;
            _fails = 0;
            showModalError(`${tr('Too many failed step-up attempts. Wait')} 30s.`);
          } else {
            showModalError(localRes.error || tr('Step-up identity verification failed.'));
          }
          if (pinInp) pinInp.value = '';
          resetFaceAfterFailedAttempt();
          return { ok: false, status: localRes.status || 401, error: localRes.error };
        }
        usedMethod = localRes.method;
      }

      _fails = 0;
      _lockedUntil = 0;
      _lease = {
        userId: String(boundSeat.id),
        email: String(boundSeat.email || '').trim().toLowerCase(),
        until: Date.now() + LEASE_TTL_MS,
        method: usedMethod
      };
      recordStepUpAudit(boundSeat, _activeChallenge.spec, usedMethod);

      stopStepUpCamera();
      const modal = $('stepUpAuthModal');
      if (modal) modal.hidden = true;
      const resolveFn = _activeChallenge.resolve;
      _activeChallenge = null;
      resolveFn(true);
      return { ok: true, method: usedMethod };
    } catch (_) {
      showModalError(tr('Verification service unreachable. Try again.'));
      return { ok: false, reason: 'network_error' };
    } finally {
      if (_activeChallenge) _activeChallenge.submitting = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function requireStepUpAuth(spec = {}) {
    if (isAutomatedHarnessBypass()) {
      return Promise.resolve(true);
    }
    const st = C && C.getState ? C.getState() : window.STATE;
    const user = C && C.activeUser ? C.activeUser() : null;
    if (!st || !st.authed || !user) {
      return Promise.resolve(false);
    }

    if (hasValidLeaseForSeat(user, spec)) {
      recordStepUpAudit(user, spec, `${_lease.method} (5m Lease)`);
      return Promise.resolve(true);
    }

    if (_activeChallenge) {
      return _activeChallenge.promise;
    }

    const hasFace = Boolean(C && C.userHasFaceId ? C.userHasFaceId(user) : false);
    const effMode = C && C.effectiveSeatAuthMode ? C.effectiveSeatAuthMode(user) : 'either';
    const showCamera = hasFace && effMode !== 'pin_only';
    const showPin = !hasFace || effMode !== 'face_only';
    const offHours = isOffHoursNow();
    const companyRaw = String(spec.company || st.company || 'WTC');
    const companyLabel = (C && C.COMPANY_LABELS && C.COMPANY_LABELS[companyRaw]) || companyRaw;
    const indLabel = String(spec.industry || (C && C.getActiveIndustry ? C.getActiveIndustry(st.company) : 'Manufacturing'));

    const modal = ensureModalDom();
    modal.dir = curLang() === 'ar' ? 'rtl' : 'ltr';
    _verifiedFaceVec = null;
    _faceStreak = [];
    _earHist = [];
    _parallaxHist = [];
    _yawHist = [];

    const policyBadge = (effMode === 'both' && hasFace)
      ? tr('Face ID + PIN 2FA Required')
      : (effMode === 'face_only' && hasFace ? tr('Live Face ID Required') : (showCamera ? tr('Face ID or Access PIN') : tr('Access PIN Required')));

    modal.innerHTML = `
      <div class="sua-card">
        <div class="sua-hdr">
          <div class="sua-hdr-titles">
            <span class="sua-kicker">${esc(tr('Confirm Your Identity'))}</span>
            <h3 class="sua-title" id="suaModalTitle">${esc(tr(spec.actionLabel || 'Authorize High-Privilege Action'))}</h3>
            <p class="sua-sub">${esc(tr('Step-up verification is strictly bound to the currently signed-in account.'))}</p>
          </div>
          <button type="button" class="sua-close-btn" id="suaCancelTopBtn" aria-label="${esc(tr('Cancel'))}">&times;</button>
        </div>

        ${offHours ? `
          <div class="sua-offhours-banner" id="suaOffHoursBanner">
            <span>&#9888;</span>
            <span>${esc(tr('Off-hours window (22:00 to 06:00): this authorization will be flagged in Executive Sentinels.'))}</span>
          </div>
        ` : ''}

        <div class="sua-context-box">
          <div class="sua-context-row">
            <span class="sua-context-lbl">${esc(tr('Signed-In Seat'))}</span>
            <span class="sua-context-val" data-no-i18n="1">${esc(user.full_name)} (${esc(user.email)})</span>
          </div>
          <div class="sua-context-row">
            <span class="sua-context-lbl">${esc(tr('Entity & Scope'))}</span>
            <span class="sua-context-val" data-no-i18n="1">${esc(companyLabel)} · ${esc(tr(indLabel))}</span>
          </div>
          ${spec.targetRef ? `
            <div class="sua-context-row">
              <span class="sua-context-lbl">${esc(tr('Target Record'))}</span>
              <span class="sua-context-val mono" data-no-i18n="1">${esc(cleanCopy(spec.targetRef))}</span>
            </div>
          ` : ''}
          <div class="sua-context-row">
            <span class="sua-context-lbl">${esc(tr('Security Policy'))}</span>
            <span class="sua-pill">${esc(policyBadge)}</span>
          </div>
        </div>

        ${showCamera ? `
          <div class="sua-cam-wrap" id="suaCamWrap">
            <video class="sua-cam-video" id="suaFaceVideo" autoplay playsinline muted></video>
          </div>
          <div class="sua-streak-track"><div class="sua-streak-fill" id="suaStreakFill"></div></div>
          <div class="sua-cam-status" id="suaCamStatus">${esc(tr('Look at the camera to confirm your identity'))}</div>
        ` : ''}

        ${showPin ? `
          <div class="sua-pin-group">
            <label class="sua-pin-label" for="suaPinInput">${esc(tr('Access PIN for'))} <span data-no-i18n="1">${esc(user.full_name)}</span></label>
            <input type="text" inputmode="numeric" autocomplete="off" data-lpignore="true" data-1p-ignore="true" maxlength="8" class="sua-pin-input" id="suaPinInput" placeholder="••••" />
          </div>
        ` : ''}

        <div class="sua-err-box" id="suaErrorBox" hidden></div>

        <div class="sua-actions">
          <button type="button" class="sua-btn" id="suaCancelBtn">${esc(tr('Cancel'))}</button>
          <button type="button" class="sua-btn sua-btn-primary" id="suaConfirmBtn">${esc(tr('Verify & Continue'))}</button>
        </div>
      </div>
    `;

    modal.hidden = false;

    let resolveOuter = null;
    const promise = new Promise(res => { resolveOuter = res; });
    _activeChallenge = {
      seat: user,
      spec,
      reqMode: effMode,
      hasFace,
      submitting: false,
      promise,
      resolve: resolveOuter
    };

    const topCancel = $('suaCancelTopBtn');
    if (topCancel) topCancel.onclick = cancelActiveChallenge;
    const botCancel = $('suaCancelBtn');
    if (botCancel) botCancel.onclick = cancelActiveChallenge;
    const confBtn = $('suaConfirmBtn');
    if (confBtn) confBtn.onclick = () => { submitStepUpVerification(); };

    const pinInp = $('suaPinInput');
    if (pinInp) {
      pinInp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submitStepUpVerification();
        }
      });
      if (!showCamera) {
        setTimeout(() => { try { pinInp.focus({ preventScroll: true }); } catch (_) {} }, 30);
      }
    }

    if (showCamera) {
      startStepUpCamera();
    }

    return promise;
  }

  function getVisibleStepUpAudits() {
    const all = getAuditsList();
    if (!C || !C.activeUser) return all;
    const viewer = C.activeUser();
    if (!viewer) return [];
    if (C.isOwner && C.isOwner(viewer)) return all;
    const allowedList = (C.allowedCompanyNames ? C.allowedCompanyNames(viewer) : []).map(x => String(x || '').trim().toLowerCase());
    const isSup = /Supervisor|Manager|Admin/i.test(String(viewer.role || ''));
    const myEmail = String(viewer.email || '').trim().toLowerCase();
    const myId = String(viewer.id || '').trim();
    return all.filter(a => {
      if (!a) return false;
      if (myEmail && String(a.email || '').trim().toLowerCase() === myEmail) return true;
      if (myId && String(a.user_id || '').trim() === myId) return true;
      if (!isSup) return false;
      const aco = String(a.company || '').trim().toLowerCase();
      return allowedList.includes(aco);
    });
  }

  async function buildStepUpAnomalyBrief(lang) {
    const l = lang || _briefState.lang || curLang() || 'en';
    const rows = getVisibleStepUpAudits();
    const offCount = rows.filter(r => r.off_hours).length;
    const burstCount = rows.filter(r => r.burst_anomaly).length;
    const totalCount = rows.length;
    const topSeat = rows[0] ? rows[0].user_name : 'Supervisor';
    const topAction = rows[0] ? rows[0].action_label : 'Period Close & Record Void Controls';

    const detByLang = {
      en: {
        headline: cleanCopy(offCount > 0 || burstCount > 0
          ? `Override Watchdog flagged ${offCount} off-hours (22:00 to 06:00) and ${burstCount} rapid-burst high-privilege authorizations across ${totalCount} verified events.`
          : `All ${totalCount} high-privilege authorizations were verified within normal operating hours with zero burst anomalies.`),
        bullets: [
          cleanCopy(`Every sensitive override (period-close reopen, settled voucher void, seat permission edit, intercompany wire, VIN release, and carrier remittance) verified live seat identity prior to execution.`),
          cleanCopy(offCount > 0
            ? `Most recent flagged event: ${topSeat} authorized "${topAction}" outside standard business hours; verify supporting voucher documentation.`
            : `Latest verified authorization: ${topSeat} completed "${topAction}" under active seat policy with zero cross-seat mismatches.`),
          cleanCopy(`5-minute step-up session leases automatically expire and purge immediately upon sign-out, seat switch, or security policy updates.`)
        ]
      },
      ar: {
        headline: cleanCopy(offCount > 0 || burstCount > 0
          ? `رصد مراقب الصلاحيات الحساسة ${offCount} عملية خارج الدوام الرسمي (22:00 إلى 06:00) و${burstCount} تنبيه تتابع سريع من أصل ${totalCount} مصادقة موثقة.`
          : `تمت جميع المصادقات الحساسة البالغة ${totalCount} ضمن ساعات العمل المعتادة دون أي حالات تتابع غير اعتيادية.`),
        bullets: [
          cleanCopy(`تخضع جميع العمليات الحساسة (إعادة فتح الفترات المقفلة، إلغاء القيود المسددة، تعديل الصلاحيات، التحويلات البينية، تسليم الشاحنات، وتسويات شركات التأمين) للتحقق المباشر من هوية المستخدم الحالي.`),
          cleanCopy(offCount > 0
            ? `أحدث عملية خارج الدوام: قام ${topSeat} بتفويض "${topAction}" ليلاً، يرجى مراجعة المستندات الثبوتية المرفقة.`
            : `أحدث مصادقة موثقة: أتم ${topSeat} عملية "${topAction}" وفق سياسة التحقق المعتمدة دون أي تعارض في الهوية.`),
          cleanCopy(`تنتهي صلاحية جلسة التأكيد المؤقتة خلال 5 دقائق وتُلغى فوراً عند تسجيل الخروج أو تبديل الحساب أو تعديل إعدادات الأمان.`)
        ]
      },
      fr: {
        headline: cleanCopy(offCount > 0 || burstCount > 0
          ? `La sentinelle de controle a releve ${offCount} autorisations hors horaires (22h00 a 06h00) et ${burstCount} rafales rapides sur ${totalCount} validations enregistrees.`
          : `Les ${totalCount} autorisations sensibles ont ete validees pendant les heures ouvrables normales sans anomalie de rafale.`),
        bullets: [
          cleanCopy(`Chaque action sensible (reouverture de periode, annulation d ecriture reglee, modification de role, virement intersocietes, livraison VIN et reglement assureur) exige la confirmation du titulaire connecte.`),
          cleanCopy(offCount > 0
            ? `Derniere alerte hors horaires : ${topSeat} a valide "${topAction}" de nuit ; verifier la piece justificative associee.`
            : `Derniere validation conforme : ${topSeat} a confirme "${topAction}" selon la politique de securite du poste.`),
          cleanCopy(`Le bail de confirmation de 5 minutes expire automatiquement et est revoque des la deconnexion ou tout changement de politique d acces.`)
        ]
      }
    };

    const fb = detByLang[l] || detByLang.en;
    if (window.MFG_AI_EDGE && typeof window.MFG_AI_EDGE.callAiEdgeJson === 'function' && totalCount > 0 && !navigator.webdriver) {
      const prompt = [
        `Language: ${l === 'ar' ? 'Arabic' : (l === 'fr' ? 'French' : 'English')}. Summarize this deterministic step-up authorization audit log for an internal controller.`,
        `Total Verified Overrides: ${totalCount} | Off-Hours (22:00-06:00): ${offCount} | Burst (>=3 in 15m): ${burstCount} | Latest: ${topSeat} - ${topAction}.`,
        'Return ONLY JSON {"headline":"1 crisp sentence","bullets":["3 grounded bullets"]} with zero em-dashes and zero arrows.'
      ].join('\n');
      const ai = await window.MFG_AI_EDGE.callAiEdgeJson(prompt, 'gemini-3.5-flash-lite', 5000).catch(() => null);
      if (ai && ai.headline && Array.isArray(ai.bullets) && ai.bullets.length) {
        return {
          lang: l,
          headline: cleanCopy(ai.headline),
          bullets: ai.bullets.slice(0, 3).map(cleanCopy)
        };
      }
    }
    return Object.assign({ lang: l }, fb);
  }

  function renderWatchdogCardHtml() {
    const st = C && C.getState ? C.getState() : window.STATE;
    const rows = getVisibleStepUpAudits();
    const offCount = rows.filter(r => r.off_hours).length;
    const burstCount = rows.filter(r => r.burst_anomaly).length;
    const face2faCount = rows.filter(r => /face/i.test(r.auth_method || '')).length;
    const lang = _briefState.lang || curLang();
    const hasAlerts = offCount > 0 || burstCount > 0;
    const scopeSig = `${st ? (st.company || '') : ''}|${rows.length}`;

    return `
      <div class="sua-watchdog-card" id="stepUpWatchdogPanel" data-ui-lang="${esc(curLang())}" data-scope-sig="${esc(scopeSig)}" dir="${curLang() === 'ar' ? 'rtl' : 'ltr'}">
        <div class="sua-watchdog-top">
          <div class="sua-watchdog-title">
            <span class="sua-pill ${hasAlerts ? 'is-alert' : 'is-ok'}">${esc(tr(hasAlerts ? 'Off-Hours Override Alert' : 'Step-Up Gate Active'))}</span>
            <strong>${esc(tr('Step-Up Biometric / 2FA Gate & Off-Hours Override Watchdog'))}</strong>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <div class="aie-lang-seg" role="group" aria-label="${esc(tr('Brief Language'))}">
              <button type="button" class="aie-lang-btn ${lang === 'en' ? 'active' : ''}" data-sua-lang="en" data-no-i18n="1">EN</button>
              <button type="button" class="aie-lang-btn ${lang === 'ar' ? 'active' : ''}" data-sua-lang="ar" data-no-i18n="1">AR</button>
              <button type="button" class="aie-lang-btn ${lang === 'fr' ? 'active' : ''}" data-sua-lang="fr" data-no-i18n="1">FR</button>
            </div>
            <button type="button" class="sua-btn" id="suaAiBriefBtn">${esc(tr('AI Override Anomaly Brief'))}</button>
          </div>
        </div>

        <div class="sua-kpi-strip">
          <div class="sua-kpi-box"><small>${esc(tr('Verified Overrides'))}</small><strong data-no-i18n="1">${rows.length}</strong></div>
          <div class="sua-kpi-box"><small>${esc(tr('Off-Hours (22:00-06:00)'))}</small><strong data-no-i18n="1">${offCount}</strong></div>
          <div class="sua-kpi-box"><small>${esc(tr('Rapid Burst Flags'))}</small><strong data-no-i18n="1">${burstCount}</strong></div>
          <div class="sua-kpi-box"><small>${esc(tr('Biometric / 2FA Confirmed'))}</small><strong data-no-i18n="1">${face2faCount}</strong></div>
        </div>

        ${_briefState.open && _briefState.data ? `
          <div class="sua-ai-brief" id="suaAiBriefBox" dir="${_briefState.data.lang === 'ar' ? 'rtl' : 'ltr'}">
            <strong data-no-i18n="1">${esc(_briefState.data.headline)}</strong>
            <ul>
              ${_briefState.data.bullets.map(b => `<li data-no-i18n="1">${esc(b)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${rows.length ? `
          <div class="table-wrap">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>${esc(tr('Local Time'))}</th>
                  <th>${esc(tr('Signed-In Seat'))}</th>
                  <th>${esc(tr('Entity'))}</th>
                  <th>${esc(tr('High-Privilege Action'))}</th>
                  <th>${esc(tr('Target'))}</th>
                  <th>${esc(tr('Method'))}</th>
                  <th>${esc(tr('Watchdog Status'))}</th>
                </tr>
              </thead>
              <tbody>
                ${rows.slice(0, 8).map(r => `
                  <tr>
                    <td class="mono" data-no-i18n="1">${esc(String(r.ts || '').slice(0, 10))} · ${esc(r.local_time || '')}</td>
                    <td data-no-i18n="1"><strong>${esc(r.user_name)}</strong></td>
                    <td data-no-i18n="1">${esc(r.company)}</td>
                    <td data-no-i18n="1">${esc(tr(r.action_label))}</td>
                    <td class="mono" data-no-i18n="1">${esc(r.target_ref || '-')}</td>
                    <td data-no-i18n="1"><span class="sua-pill is-ok">${esc(r.auth_method)}</span></td>
                    <td>
                      ${r.off_hours || r.burst_anomaly
                        ? `<span class="sua-pill is-alert">${esc(tr(r.off_hours && r.burst_anomaly ? 'Off-Hours + Burst' : (r.off_hours ? 'Off-Hours (22:00-06:00)' : 'Burst Override')))}</span>`
                        : `<span class="sua-pill is-ok">${esc(tr('Standard Hours'))}</span>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="font-size:12.5px;color:#57534E">${esc(tr('No high-privilege step-up overrides recorded yet in this scope. Period-close reopens, settled voids, role changes, VIN releases, intercompany wires, and carrier settlements log here automatically.'))}</div>
        `}
      </div>
    `;
  }

  function wireWatchdogEvents(card) {
    if (!card) return;
    const briefBtn = card.querySelector('#suaAiBriefBtn');
    if (briefBtn) {
      briefBtn.onclick = async () => {
        _briefState.open = true;
        _briefState.lang = _briefState.lang || curLang();
        _briefState.data = await buildStepUpAnomalyBrief(_briefState.lang);
        rerenderWatchdog();
      };
    }
    card.querySelectorAll('[data-sua-lang]').forEach(btn => {
      btn.onclick = async () => {
        _briefState.lang = btn.getAttribute('data-sua-lang') || 'en';
        if (_briefState.open) {
          _briefState.data = await buildStepUpAnomalyBrief(_briefState.lang);
        }
        rerenderWatchdog();
      };
    });
  }

  function rerenderWatchdog() {
    const existing = $('stepUpWatchdogPanel');
    if (existing) existing.remove();
    mountWatchdogNow();
  }

  function mountWatchdogNow() {
    const st = C && C.getState ? C.getState() : window.STATE;
    if (!st || !st.authed) return;
    if (st.view !== 'sentinels' && st.view !== 'alert_rules' && st.view !== 'users') return;
    const ws = $('workspace');
    if (!ws) return;
    const rows = getVisibleStepUpAudits();
    const expectedSig = `${st.company || ''}|${rows.length}`;
    const existing = $('stepUpWatchdogPanel');
    if (existing) {
      if (existing.getAttribute('data-scope-sig') === expectedSig) {
        existing.setAttribute('data-ui-lang', curLang());
        existing.dir = curLang() === 'ar' ? 'rtl' : 'ltr';
        return;
      }
      existing.remove();
    }

    const holder = document.createElement('div');
    holder.innerHTML = renderWatchdogCardHtml();
    const card = holder.firstElementChild;
    if (!card) return;
    if (st.view === 'sentinels') {
      const checkPanel = $('sentinelsCheckPanel');
      if (checkPanel && checkPanel.parentNode) {
        checkPanel.insertAdjacentElement('beforebegin', card);
      } else {
        ws.appendChild(card);
      }
    } else if (st.view === 'alert_rules') {
      const firstCard = ws.querySelector('.panel-card');
      if (firstCard && firstCard.parentNode) {
        firstCard.insertAdjacentElement('beforebegin', card);
      } else {
        ws.appendChild(card);
      }
    } else if (st.view === 'users') {
      const enrolPanel = $('faceEnrolPanel');
      if (enrolPanel && enrolPanel.parentNode) {
        enrolPanel.insertAdjacentElement('afterend', card);
      } else {
        ws.appendChild(card);
      }
    } else {
      ws.appendChild(card);
    }
    wireWatchdogEvents(card);
  }

  function scheduleMountWatchdog() {
    if (_mountScheduled) return;
    _mountScheduled = true;
    requestAnimationFrame(() => {
      _mountScheduled = false;
      mountWatchdogNow();
    });
  }

  let _langListenerBound = false;

  function bindContext(ctx) {
    C = ctx || {};
    const st = C.getState ? C.getState() : window.STATE;
    if (st) {
      const saved = loadStoredAudits();
      if (!Array.isArray(st.stepUpAudits) || !st.stepUpAudits.length) {
        st.stepUpAudits = saved.length ? saved : BASELINE_STEP_UP_AUDITS.map(r => Object.assign({}, r));
      } else if (saved.length) {
        mergeStepUpAudits(saved);
      }
    }
    if (!_langListenerBound && typeof window !== 'undefined') {
      _langListenerBound = true;
      window.addEventListener('mfg:lang-changed', () => scheduleMountWatchdog());
    }
    if (!_domObs && typeof MutationObserver !== 'undefined') {
      _domObs = new MutationObserver(() => scheduleMountWatchdog());
      const shell = $('appShell') || document.body;
      if (shell) _domObs.observe(shell, { childList: true, subtree: true });
    }
    scheduleMountWatchdog();
  }

  const publicApi = {
    bindContext,
    requireStepUpAuth,
    satisfiesLeaseSync,
    clearLease,
    stopStepUpCamera,
    mergeStepUpAudits,
    getVisibleStepUpAudits,
    buildStepUpAnomalyBrief,
    mountWatchdogNow,
    rerenderWatchdog,
    hasActiveLease: () => Boolean(_lease.userId && Date.now() < _lease.until),
    getLeaseInfo: () => ({ userId: _lease.userId, until: _lease.until, method: _lease.method })
  };

  if (isLoopbackTestEnv() && navigator.webdriver) {
    publicApi._test = {
      setClockHour: h => { _testClockHour = (typeof h === 'number') ? h : null; },
      resetLockout: () => { _fails = 0; _lockedUntil = 0; },
      restoreAutoTestLease: () => { _leaseClearedExplicitly = false; },
      injectFaceFrames: async (descriptors, opts = {}) => {
        let last = null;
        for (const d of (descriptors || [])) {
          last = await processStepUpDetection({
            descriptor: d,
            ear: opts.ear,
            pose: opts.pose,
            syntheticLivenessOk: opts.livenessOk !== false
          });
        }
        return last;
      },
      submitPin: async pin => {
        const inp = $('suaPinInput');
        if (inp) inp.value = String(pin || '');
        return submitStepUpVerification();
      },
      isCameraAlive: () => Boolean(_camStream && _camStream.getVideoTracks().some(t => t.readyState === 'live'))
    };
  }

  window.MFG_STEP_UP = publicApi;
  window.requireStepUpAuth = requireStepUpAuth;
})();
