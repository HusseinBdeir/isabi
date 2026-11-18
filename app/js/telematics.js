/* ============================================================================
   ISABI Systems - Live Fleet GPS & Teltonika CAN-Bus Sensor Engine (js/telematics.js)
   Server-to-server telematics proxy consumer (`./api/telematics`), Map Studio live
   truck overlay, Closed-Loop Diesel & Trip Reconciliation (`io83` 0.1L ECU fuel +
   settled `io89` tank physics), Smart Entry meter auto-fill, Sentinel hooks,
   Ask ISABI grounding, and Cross-Industry Connected Asset strips.
   ============================================================================ */
(function () {
  'use strict';

  const PREF_STORAGE_KEY = 'isabi_telematics_ui_v1';
  const POLL_INTERVAL_MS = 30000;

  let _ctx = null;
  let _lastScopeSig = '';
  let _snapStore = { scopeBase: '', fetchedAt: '', units: [], geofences: [], demo: false, loading: false, error: '' };
  let _inflightSnapPromise = null;
  let _inflightSnapScope = '';
  let _snapAbort = null;

  let _histAbort = null;
  let _inflightHistKey = '';
  let _inflightHistPromise = null;
  const _histCache = new Map();

  let _pollTimer = null;

  const UI_STATE = {
    collapsed: false,
    reconOpenDeviceId: 0,
    reconDate: '',
    reconBusy: false,
    aiBriefByKey: new Map(),
    aiBusy: false
  };

  try {
    const rawPref = typeof localStorage !== 'undefined' ? localStorage.getItem(PREF_STORAGE_KEY) : null;
    if (rawPref) {
      const parsed = JSON.parse(rawPref);
      if (parsed && typeof parsed === 'object' && typeof parsed.collapsed === 'boolean') {
        UI_STATE.collapsed = parsed.collapsed;
      }
    }
  } catch (_) {}

  function saveUiPref() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify({ v: 1, collapsed: Boolean(UI_STATE.collapsed) }));
      }
    } catch (_) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normAlnum(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function fmtNum(v, dp) {
    if (_ctx && typeof _ctx.fmtNum === 'function') return _ctx.fmtNum(v, dp == null ? 0 : dp);
    const n = Number(v) || 0;
    const d = dp == null ? 0 : dp;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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

  function isHeadlessEnv() {
    return Boolean(
      (typeof navigator !== 'undefined' && (navigator.webdriver || /HeadlessChrome|HeadlessEdg/i.test(navigator.userAgent || ''))) ||
      window.__MFG_HEADLESS_TEST
    );
  }

  function isDemoActive() {
    const st = _ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : null;
    return Boolean((typeof window.__ISABI_IS_DEMO === 'function' && window.__ISABI_IS_DEMO()) || (st && st.demoVisitor));
  }

  function hasLiveApi() {
    if (window.__ISABI_FORCE_OFFLINE_TELEMATICS) return false;
    if (window.__ISABI_FORCE_TELEMATICS_API) return true;
    if (_ctx && typeof _ctx.hasServerApi === 'function') return Boolean(_ctx.hasServerApi());
    return Boolean(window.ISABI_LOCAL_API || (window.ISABI_HAS_EDGE_API && !isHeadlessEnv()));
  }

  function todayIso() {
    if (_ctx && typeof _ctx.todayISO === 'function') return _ctx.todayISO();
    return new Date().toISOString().slice(0, 10);
  }

  // Offline / Static Harness Fallback Units (strictly filtered through seat RLS & BU scope before exposure; sanitized in Demo Sandbox)
  function buildOfflineFallbackUnits() {
    const demo = isDemoActive();
    return [
      {
        device_id: 19130, equipment: 'TB1', aliases: ['tb1', '360676'], plate_no: '360676', company: 'WTC', driver: demo ? 'Demo Driver 1' : 'Majed Karam',
        vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
        status_code: 'parked', status_label: 'Parked', lat: 33.6308, lng: 35.4265, speed_kph: 0, acc_on: false,
        odometer_km: 38246.4, engine_hours: 1842.5, tank_litres: 244, tank_cap_l: 400, tank_pct: 61,
        ecu_fuel_total_l: 25630.5, ext_power_v: 25.7, zone_name: 'Sibline Plant & Quarry', stop_duration: '1h 12m', milestone_alert: ''
      },
      {
        device_id: 17733, equipment: 'TB3', aliases: ['tb3', '358599'], plate_no: '358599', company: 'WTC', driver: demo ? 'Demo Driver 2' : 'Khalife',
        vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
        status_code: 'parked', status_label: 'Parked', lat: 33.8403, lng: 35.4919, speed_kph: 0, acc_on: false,
        odometer_km: 345651.3, engine_hours: 1658.3, tank_litres: 184, tank_cap_l: 400, tank_pct: 46,
        ecu_fuel_total_l: 193407.4, ext_power_v: 25.6, zone_name: 'Choueifat Main Yard', stop_duration: '6h 16m', milestone_alert: ''
      },
      {
        device_id: 18460, equipment: 'Tb4', aliases: ['tb4', '358943', '358943w'], plate_no: '358943', company: 'WTC', driver: demo ? 'Demo Driver 3' : 'Wissam Mlaab',
        vehicle_model: 'Shacman F3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: false,
        status_code: 'power_cut', status_label: '0V Power Cut', lat: 33.6320, lng: 35.4261, speed_kph: 0, acc_on: false,
        odometer_km: 365228.1, engine_hours: 3890.1, tank_litres: 186.2, tank_cap_l: 380, tank_pct: 49,
        ecu_fuel_total_l: null, ext_power_v: 0, zone_name: 'Sibline Plant & Quarry', stop_duration: '27h 30m', milestone_alert: ''
      },
      {
        device_id: 18595, equipment: 'Tb7', aliases: ['tb7', '364656'], plate_no: '364656', company: 'WTC', driver: demo ? 'Demo Driver 4' : 'Mohamad Habib',
        vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
        status_code: 'moving', status_label: 'Moving', lat: 33.7613, lng: 35.4588, speed_kph: 72, acc_on: true,
        odometer_km: 499915.6, engine_hours: 5412.0, tank_litres: 192, tank_cap_l: 400, tank_pct: 48,
        ecu_fuel_total_l: 420256.2, ext_power_v: 27.6, zone_name: 'Damour Coastal Corridor', stop_duration: '0s', milestone_alert: 'Approaching 500,000 km major overhaul'
      },
      {
        device_id: 18553, equipment: 'TB8', aliases: ['tb8', '354578'], plate_no: '354578', company: 'WTC', driver: demo ? 'Demo Driver 5' : 'Hussein Saleh',
        vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
        status_code: 'parked', status_label: 'Parked', lat: 33.8404, lng: 35.4920, speed_kph: 0, acc_on: false,
        odometer_km: 317490.7, engine_hours: 3115.4, tank_litres: 260, tank_cap_l: 400, tank_pct: 65,
        ecu_fuel_total_l: 283815.2, ext_power_v: 25.8, zone_name: 'Choueifat Main Yard', stop_duration: '5h 42m', milestone_alert: ''
      },
      {
        device_id: 18571, equipment: 'Tb9', aliases: ['tb9', '364168'], plate_no: '354168'.replace('354168', '364168'), company: 'WTC', driver: demo ? 'Demo Driver 6' : 'Ali Saleh',
        vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
        status_code: 'parked', status_label: 'Parked', lat: 33.8402, lng: 35.4918, speed_kph: 0, acc_on: false,
        odometer_km: 453408.4, engine_hours: 3540.8, tank_litres: 196, tank_cap_l: 400, tank_pct: 49,
        ecu_fuel_total_l: 393611.9, ext_power_v: 26.0, zone_name: 'Choueifat Main Yard', stop_duration: '5h 50m', milestone_alert: ''
      },
      {
        device_id: 18593, equipment: '309570', aliases: ['309570', 'hino', 'hino 309570'], plate_no: '309570', company: 'WTC', driver: demo ? 'Demo Driver 7' : 'Hino Service Crew',
        vehicle_model: 'Hino 500', tracker_model: 'FMC920', has_can_fuel: false, has_ecu_io83: false,
        status_code: 'parked', status_label: 'Parked', lat: 33.8405, lng: 35.4921, speed_kph: 0, acc_on: false,
        odometer_km: 15835.0, engine_hours: 794.1, tank_litres: null, tank_cap_l: 200, tank_pct: null,
        ecu_fuel_total_l: null, ext_power_v: 25.1, zone_name: 'Choueifat Main Yard', stop_duration: '4h 18m', milestone_alert: ''
      }
    ];
  }

  function getSeatIdentitySig() {
    const u = _ctx && typeof _ctx.activeUser === 'function' ? _ctx.activeUser() : null;
    const uid = u ? String(u.id || u.email || 'anon').toLowerCase() : 'anon';
    const cos = _ctx && typeof _ctx.allowedCompanyNames === 'function' ? (_ctx.allowedCompanyNames() || []).join(',') : '';
    return `${uid}|${isDemoActive() ? 'demo' : 'live'}|${cos}`;
  }

  function getActiveCompanyScope() {
    const st = _ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : null;
    return String((st && st.company) || 'manufacturing-group').trim();
  }

  function ensureSeatScopeFresh() {
    const baseSig = getSeatIdentitySig();
    if (_lastScopeSig && _lastScopeSig !== baseSig) {
      if (_snapAbort) { try { _snapAbort.abort(); } catch (_) {} _snapAbort = null; }
      if (_histAbort) { try { _histAbort.abort(); } catch (_) {} _histAbort = null; }
      _inflightSnapPromise = null;
      _inflightHistPromise = null;
      _snapStore = { scopeBase: baseSig, fetchedAt: '', units: [], geofences: [], demo: isDemoActive(), loading: false, error: '' };
      _histCache.clear();
      UI_STATE.reconOpenDeviceId = 0;
      UI_STATE.reconBusy = false;
      UI_STATE.aiBusy = false;
      UI_STATE.aiBriefByKey.clear();
    }
    _lastScopeSig = baseSig;
  }

  const _TELEMATICS_SCOPE_CANON = {
    '4235company': '4235companysal',
    '4235companysal': '4235companysal',
    'insurance': 'insurancecompany',
    'insuranceco': 'insurancecompany',
    'insurancecompany': 'insurancecompany',
    'bbc': 'bbconstruction',
    'bbconstruction': 'bbconstruction',
    'lions': 'lionstransport',
    'lionstransport': 'lionstransport'
  };
  function _canonTelematicsCompanyAlnum(v) {
    const k = normAlnum(v);
    return _TELEMATICS_SCOPE_CANON[k] || k;
  }

  function canSeatAccessCompany(unitCo) {
    if (!unitCo) return false;
    if (isDemoActive()) return true;
    if (!_ctx || typeof _ctx.allowedCompanyNames !== 'function') return false;
    const u = typeof _ctx.activeUser === 'function' ? _ctx.activeUser() : null;
    if (!u) return false;
    const allowed = _ctx.allowedCompanyNames() || [];
    const target = _canonTelematicsCompanyAlnum(unitCo);
    return allowed.some(c => _canonTelematicsCompanyAlnum(c) === target);
  }

  function companyMatchesScope(unitCo, scopeRaw) {
    const uc = _canonTelematicsCompanyAlnum(unitCo || 'WTC');
    const sc = String(scopeRaw || '').trim().toLowerCase();
    if (!sc || sc === 'all') return true;
    if (sc === 'manufacturing-group' || sc === 'industry:manufacturing') {
      return uc === 'wtc' || uc === 'bbconstruction' || uc === 'lionstransport';
    }
    if (sc === 'bdeirholding' || sc === 'bdeir-holding' || sc === 'bdeir holding' || sc.startsWith('industry:holding')) {
      return true;
    }
    if (sc.startsWith('industry:')) {
      const ind = sc.slice(9).trim();
      if (ind.includes('trading')) return uc === 'korriauto' || uc === 'shacman';
      if (ind.includes('hospitality')) return ['blanca', 'launa', 'palms', 'voile', 'platinum'].includes(uc);
      if (ind.includes('real estate')) return uc === 'properties' || uc.includes('4235');
      if (ind.includes('insurance')) return uc.includes('insurance');
      return false;
    }
    return uc === _canonTelematicsCompanyAlnum(sc);
  }

  function enrichUnitWithIsabiGeo(u) {
    const out = Object.assign({}, u);
    const seed = _ctx && typeof _ctx.getSeed === 'function' ? _ctx.getSeed() : window.MFG_SEED;
    if (window.MFG_GEO && typeof window.MFG_GEO.findContainingRegion === 'function' && out.lat != null && out.lng != null && seed) {
      try {
        const regDet = window.MFG_GEO.findContainingRegion(Number(out.lat), Number(out.lng), seed);
        if (regDet && regDet.best) {
          out.isabi_region = regDet.best;
        }
      } catch (_) {}
    }
    return out;
  }

  function getScopedUnits(explicitScope) {
    ensureSeatScopeFresh();
    const scope = explicitScope != null ? explicitScope : getActiveCompanyScope();
    let pool = _snapStore.units;
    if (!pool || !pool.length) {
      pool = buildOfflineFallbackUnits();
      if (hasLiveApi() && !_snapStore.fetchedAt && !_snapStore.loading && !_snapStore.error && !isHeadlessEnv()) {
        setTimeout(() => { fetchSnapshot({ silent: false }); }, 20);
      }
    }
    const filtered = (pool || []).filter(u => u && canSeatAccessCompany(u.company) && companyMatchesScope(u.company, scope));
    return filtered.map(enrichUnitWithIsabiGeo);
  }

  function summarizeUnits(units) {
    let moving = 0, idling = 0, parked = 0, powerCut = 0, offline = 0, tankTotal = 0, tankCnt = 0, milestoneCnt = 0;
    const list = units || [];
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (u.status_code === 'moving') moving++;
      else if (u.status_code === 'idling') idling++;
      else if (u.status_code === 'power_cut') powerCut++;
      else if (u.status_code === 'offline') offline++;
      else parked++;
      if (u.tank_litres != null && Number.isFinite(Number(u.tank_litres))) {
        tankTotal += Number(u.tank_litres);
        tankCnt++;
      }
      if (u.milestone_alert) milestoneCnt++;
    }
    return {
      total: list.length,
      moving,
      idling,
      parked,
      powerCut,
      offline: offline + powerCut,
      tankTotalL: round1(tankTotal),
      tankCnt,
      milestoneCnt
    };
  }

  // Deterministic Settled Fuel Physics (Slosh Guard: zero false alerts on moving grade slosh!)
  function medianOf(arr) {
    if (!arr || !arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function parseClientTsSec(p) {
    if (!p) return 0;
    if (p.ts != null && Number(p.ts) > 0) return Number(p.ts);
    if (p.timestamp != null && Number(p.timestamp) > 1000000000) return Math.floor(Number(p.timestamp));
    const raw = String(p.raw_time || p.time || '').trim();
    if (!raw) return 0;
    const mDmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (mDmy) {
      let hh = Number(mDmy[4]);
      const ampm = (mDmy[7] || '').toUpperCase();
      if (ampm === 'PM' && hh < 12) hh += 12;
      else if (ampm === 'AM' && hh === 12) hh = 0;
      const ms = Date.UTC(Number(mDmy[3]), Number(mDmy[2]) - 1, Number(mDmy[1]), hh, Number(mDmy[5]), Number(mDmy[6] || 0));
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
    }
    const mYmd = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
    if (mYmd && mYmd[7]) {
      let hh = Number(mYmd[4]);
      const ampm = mYmd[7].toUpperCase();
      if (ampm === 'PM' && hh < 12) hh += 12;
      else if (ampm === 'AM' && hh === 12) hh = 0;
      const ms = Date.UTC(Number(mYmd[1]), Number(mYmd[2]) - 1, Number(mYmd[3]), hh, Number(mYmd[5]), Number(mYmd[6] || 0));
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
    }
    const d = Date.parse(raw.replace(' ', 'T'));
    return Number.isFinite(d) ? Math.floor(d / 1000) : 0;
  }

  function evaluateSettledFuelPhysics(points, tankCapL = 400) {
    const pts = (Array.isArray(points) ? points : [])
      .filter(p => p && typeof p === 'object')
      .map((p, idx) => ({
        idx,
        ts: parseClientTsSec(p),
        speed: Math.max(0, Number(p.speed != null ? p.speed : p.speed_kph) || 0),
        acc_on: p.acc_on != null ? Boolean(p.acc_on) : (Number(p.speed || p.speed_kph || 0) > 2),
        tank_l: p.tank_litres != null ? Number(p.tank_litres) : (p.tank_l != null ? Number(p.tank_l) : (p.io89 != null ? round1((Number(p.io89) / 100) * tankCapL) : null)),
        ecu_l: p.ecu_fuel_total_l != null ? Number(p.ecu_fuel_total_l) : (p.io83 != null && Number(p.io83) > 0 ? round1(Number(p.io83) / 10) : null),
        can_odo_km: p.can_odometer_km != null ? Number(p.can_odometer_km) : (p.io87 != null && Number(p.io87) > 0 ? round2(Number(p.io87) / 1000) : null),
        gps_odo_km: p.odometer_km != null ? Number(p.odometer_km) : (p.gps_total_km != null ? Number(p.gps_total_km) : null)
      }))
      .sort((a, b) => (a.ts - b.ts) || (a.idx - b.idx));

    let ecuBurnL = 0;
    let prevEcu = null;
    let minCanOdo = null, maxCanOdo = null, canOdoSamples = 0;
    let minGpsOdo = null, maxGpsOdo = null, gpsOdoSamples = 0;
    for (const p of pts) {
      if (p.ecu_l != null && p.ecu_l > 0) {
        if (prevEcu != null) {
          const d = p.ecu_l - prevEcu;
          if (d > 0 && d <= 50) ecuBurnL += d;
        }
        prevEcu = p.ecu_l;
      }
      if (p.can_odo_km != null && p.can_odo_km > 10) {
        canOdoSamples++;
        if (minCanOdo == null || p.can_odo_km < minCanOdo) minCanOdo = p.can_odo_km;
        if (maxCanOdo == null || p.can_odo_km > maxCanOdo) maxCanOdo = p.can_odo_km;
      }
      if (p.gps_odo_km != null && p.gps_odo_km > 10) {
        gpsOdoSamples++;
        if (minGpsOdo == null || p.gps_odo_km < minGpsOdo) minGpsOdo = p.gps_odo_km;
        if (maxGpsOdo == null || p.gps_odo_km > maxGpsOdo) maxGpsOdo = p.gps_odo_km;
      }
    }

    const wins = [];
    let cur = null;
    for (const p of pts) {
      if (p.speed <= 1.0) {
        if (!cur) cur = { startTs: p.ts, endTs: p.ts, tanks: [], ecuStart: p.ecu_l, ecuEnd: p.ecu_l, accOff: 0, cnt: 0 };
        if (p.ts > 0) {
          if (cur.startTs === 0) cur.startTs = p.ts;
          cur.endTs = p.ts;
        }
        cur.cnt++;
        if (!p.acc_on) cur.accOff++;
        if (p.tank_l != null && p.tank_l >= 0 && p.tank_l <= tankCapL * 1.1) cur.tanks.push(p.tank_l);
        if (p.ecu_l != null && p.ecu_l > 0) {
          if (cur.ecuStart == null) cur.ecuStart = p.ecu_l;
          cur.ecuEnd = p.ecu_l;
        }
      } else if (cur) {
        wins.push(cur);
        cur = null;
      }
    }
    if (cur) wins.push(cur);

    const refillEvents = [];
    const siphonAlerts = [];
    const settledLevels = [];

    for (const w of wins) {
      const hasValidTs = w.startTs > 0 && w.endTs >= w.startTs;
      const dur = hasValidTs ? (w.endTs - w.startTs) : (w.startTs === 0 && w.endTs === 0 ? w.cnt * 60 : 0);
      const isSettled = hasValidTs ? (dur >= 180) : (w.startTs === 0 && w.endTs === 0 && w.cnt >= 4);
      if (isSettled) {
        if (w.tanks.length >= 2) {
          const k = w.tanks.length >= 4 ? Math.min(5, Math.floor(w.tanks.length / 3)) : 1;
          const headM = round1(medianOf(w.tanks.slice(0, k)));
          const tailM = round1(medianOf(w.tanks.slice(-k)));
          settledLevels.push({ headM, tailM });
          const delta = round1(tailM - headM);
          const stopEcu = (w.ecuStart != null && w.ecuEnd != null && w.ecuEnd >= w.ecuStart) ? round1(w.ecuEnd - w.ecuStart) : 0;
          const mostlyOff = w.accOff >= Math.ceil(w.cnt * 0.5);
          if (delta >= 25) refillEvents.push({ delta_l: delta, before_l: headM, after_l: tailM });
          else if (delta <= -20 && mostlyOff && stopEcu <= 1.0) siphonAlerts.push({ drop_l: Math.abs(delta), before_l: headM, after_l: tailM, ecu_burn_l: stopEcu });
        } else if (w.tanks.length === 1) {
          settledLevels.push({ headM: w.tanks[0], tailM: w.tanks[0] });
        }
      }
    }

    const canSpan = (canOdoSamples >= 2 && minCanOdo != null && maxCanOdo != null && maxCanOdo >= minCanOdo) ? round1(maxCanOdo - minCanOdo) : null;
    const gpsSpan = (gpsOdoSamples >= 2 && minGpsOdo != null && maxGpsOdo != null && maxGpsOdo >= minGpsOdo) ? round1(maxGpsOdo - minGpsOdo) : null;
    const kmGps = (canSpan != null && canSpan <= 2500) ? canSpan : ((gpsSpan != null && gpsSpan <= 2500) ? gpsSpan : 0);

    return {
      km_gps: kmGps,
      ecu_burn_l: round1(ecuBurnL),
      opening_settled_l: settledLevels.length ? settledLevels[0].headM : null,
      closing_settled_l: settledLevels.length ? settledLevels[settledLevels.length - 1].tailM : null,
      refill_events: refillEvents,
      siphon_alerts: siphonAlerts
    };
  }

  async function fetchSnapshot(opts = {}) {
    ensureSeatScopeFresh();
    const u = _ctx && typeof _ctx.activeUser === 'function' ? _ctx.activeUser() : null;
    if (!u && !isDemoActive()) return null;
    if (!hasLiveApi()) {
      _snapStore.units = buildOfflineFallbackUnits();
      _snapStore.demo = isDemoActive();
      _snapStore.fetchedAt = new Date().toISOString();
      return getScopedUnits();
    }

    const baseSig = getSeatIdentitySig();
    if (!opts.force && _inflightSnapPromise && _inflightSnapScope === baseSig) {
      return _inflightSnapPromise;
    }

    if (_snapAbort) { try { _snapAbort.abort(); } catch (_) {} }
    const ctrl = new AbortController();
    _snapAbort = ctrl;
    _inflightSnapScope = baseSig;
    _snapStore.loading = true;

    const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
    const fetcher = window.ISABI_EDGE_FETCH || fetch;

    const p = (async () => {
      try {
        const res = await fetcher(`${base}/api/telematics?action=snapshot`, { signal: ctrl.signal });
        if (!res || !res.ok) {
          if (_snapAbort === ctrl) {
            _snapStore.loading = false;
            _snapStore.error = res ? `HTTP ${res.status}` : 'Network error';
          }
          return getScopedUnits();
        }
        const j = await res.json();
        if (_snapAbort !== ctrl || baseSig !== getSeatIdentitySig()) return [];
        if (j && j.ok && Array.isArray(j.units)) {
          _snapStore = {
            scopeBase: baseSig,
            fetchedAt: j.fetched_at || new Date().toISOString(),
            units: j.units,
            geofences: j.geofences || [],
            demo: Boolean(j.demo),
            loading: false,
            error: ''
          };
          if (!opts.silent && _ctx && typeof _ctx.rerenderWorkspace === 'function') {
            const st = _ctx.getState ? _ctx.getState() : null;
            if (st && (st.view === 'reg_sites' || st.view === 'reg_regions')) {
              const refreshedInPlace = Boolean(window.MFG_GEO && typeof window.MFG_GEO.refreshStudioMapInPlace === 'function' && window.MFG_GEO.refreshStudioMapInPlace());
              if (!refreshedInPlace) _ctx.rerenderWorkspace();
            } else if (st && (st.view === 'fleet' || st.view === 'fleet_equip' || st.view === 'reg_equipment' || st.view === 'sentinels' || st.view === 'trd_trucks' || st.view === 'hsp_energy' || st.view === 're_workorders' || st.view === 'ins_claims' || st.view === 'hld_consolidation' || st.view === 'entities')) {
              _ctx.rerenderWorkspace();
            }
          }
        }
        return getScopedUnits();
      } catch (err) {
        if (err && err.name === 'AbortError') return getScopedUnits();
        if (_snapAbort === ctrl) {
          _snapStore.loading = false;
          _snapStore.error = 'Telematics sync paused';
        }
        return getScopedUnits();
      } finally {
        if (_snapAbort === ctrl && _inflightSnapPromise === p) {
          _inflightSnapPromise = null;
        }
      }
    })();
    _inflightSnapPromise = p;

    return _inflightSnapPromise;
  }

  function buildFallbackHistory(unit, devId, fDate, tDate) {
    return {
      _fallback: true,
      demo: true,
      device_id: devId,
      equipment: unit.equipment,
      company: unit.company,
      from_date: fDate,
      to_date: tDate,
      points_count: 164,
      km_gps: unit.status_code === 'power_cut' ? 0 : 218.4,
      odo_start_km: unit.odometer_km ? round1(unit.odometer_km - (unit.status_code === 'power_cut' ? 0 : 218.4)) : null,
      odo_end_km: unit.odometer_km,
      has_ecu_io83: Boolean(unit.has_ecu_io83),
      ecu_burn_l: unit.has_ecu_io83 ? 156.2 : null,
      burn_rate_l_100km: unit.has_ecu_io83 ? 71.5 : null,
      burn_rate_l_km: unit.has_ecu_io83 ? 0.72 : null,
      opening_settled_l: unit.tank_litres != null ? round1(Math.min(unit.tank_cap_l || 400, unit.tank_litres + 40)) : null,
      closing_settled_l: unit.tank_litres,
      max_speed_kph: unit.status_code === 'power_cut' ? 0 : 78,
      power_cut_events: unit.status_code === 'power_cut' ? 1 : 0,
      refill_events: [],
      siphon_alerts: [],
      stops: [
        { start_time: `${fDate} 06:15:00`, end_time: `${fDate} 06:50:00`, duration_min: 35, lat: 33.8403, lng: 35.4919, zone_name: 'Choueifat Main Yard', settled_tank_l: unit.tank_litres, acc_off: true },
        { start_time: `${fDate} 10:20:00`, end_time: `${fDate} 10:55:00`, duration_min: 35, lat: 33.6306, lng: 35.4264, zone_name: 'Sibline Plant & Quarry', settled_tank_l: unit.tank_litres, acc_off: true }
      ]
    };
  }

  async function fetchUnitHistory(deviceId, fromDate, toDate) {
    ensureSeatScopeFresh();
    const devId = Number(deviceId || 0);
    const fDate = String(fromDate || todayIso()).slice(0, 10);
    const tDate = String(toDate || fDate).slice(0, 10);
    if (!devId) return null;

    const unit = getScopedUnits('all').find(x => x.device_id === devId);
    if (!unit || !canSeatAccessCompany(unit.company)) return null;

    const cacheKey = `${getSeatIdentitySig()}|${devId}|${fDate}|${tDate}`;
    if (_histCache.has(cacheKey)) return _histCache.get(cacheKey);

    if (!hasLiveApi()) {
      const mockHist = buildFallbackHistory(unit, devId, fDate, tDate);
      _histCache.set(cacheKey, mockHist);
      return mockHist;
    }

    if (_inflightHistPromise && _inflightHistKey === cacheKey) return _inflightHistPromise;
    if (_histAbort) { try { _histAbort.abort(); } catch (_) {} }
    const ctrl = new AbortController();
    _histAbort = ctrl;
    _inflightHistKey = cacheKey;
    UI_STATE.reconBusy = true;

    const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
    const fetcher = window.ISABI_EDGE_FETCH || fetch;
    const reqSig = getSeatIdentitySig();

    const p = (async () => {
      try {
        const qs = `action=history&device_id=${encodeURIComponent(devId)}&from_date=${encodeURIComponent(fDate)}&to_date=${encodeURIComponent(tDate)}`;
        const res = await fetcher(`${base}/api/telematics?${qs}`, { signal: ctrl.signal });
        if (_histAbort === ctrl) UI_STATE.reconBusy = false;
        if (_histAbort !== ctrl || reqSig !== getSeatIdentitySig()) return null;
        if (!res || !res.ok) {
          const fallback = buildFallbackHistory(unit, devId, fDate, tDate);
          _histCache.set(cacheKey, fallback);
          if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
          return fallback;
        }
        const j = await res.json();
        if (j && j.ok && j.history) {
          _histCache.set(cacheKey, j.history);
          if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
          return j.history;
        }
        const fallback = buildFallbackHistory(unit, devId, fDate, tDate);
        _histCache.set(cacheKey, fallback);
        if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
        return fallback;
      } catch (err) {
        if (_histAbort === ctrl) UI_STATE.reconBusy = false;
        if (err && err.name === 'AbortError') return null;
        if (_histAbort === ctrl && reqSig === getSeatIdentitySig()) {
          const fallback = buildFallbackHistory(unit, devId, fDate, tDate);
          _histCache.set(cacheKey, fallback);
          if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
          return fallback;
        }
        return null;
      } finally {
        if (_histAbort === ctrl && _inflightHistPromise === p) {
          _inflightHistPromise = null;
        }
      }
    })();
    _inflightHistPromise = p;

    return _inflightHistPromise;
  }

  function unitMatchesRecordEquip(unit, recEquipStr) {
    if (!unit || !recEquipStr) return false;
    const rk = normAlnum(recEquipStr);
    if (!rk) return false;
    if (normAlnum(unit.equipment) === rk || normAlnum(unit.plate_no) === rk) return true;
    return Array.isArray(unit.aliases) && unit.aliases.some(a => normAlnum(a) === rk);
  }

  function findUnitByEquipment(equipStr, companyOpt) {
    if (!equipStr) return null;
    const units = getScopedUnits(companyOpt || getActiveCompanyScope());
    return units.find(u => unitMatchesRecordEquip(u, equipStr)) || null;
  }

  // Strictly guarded: NEVER returns or applies live odometer when editing a historical ticket!
  function getLiveMeterHintForForm(equipStr, companyOpt, isEditingRecord) {
    if (isEditingRecord) return null;
    const u = findUnitByEquipment(equipStr, companyOpt);
    if (!u || (u.odometer_km == null && u.engine_hours == null)) return null;
    return {
      device_id: u.device_id,
      equipment: u.equipment,
      plate_no: u.plate_no,
      odometer_km: u.odometer_km != null ? Math.round(u.odometer_km) : null,
      engine_hours: u.engine_hours != null ? round1(u.engine_hours) : null,
      tank_litres: u.tank_litres,
      status_label: u.status_label,
      zone_name: u.isabi_region || u.zone_name || ''
    };
  }

  // Closed-Loop Reconciliation against live ISABI SQLite/SEED records (automatically reflects edits/voids!)
  function computeLedgerReconForUnitDate(unit, hist, dateIso) {
    const seed = _ctx && typeof _ctx.getSeed === 'function' ? _ctx.getSeed() : window.MFG_SEED;
    const st = _ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : null;
    const rec = (seed && seed.records) || {};
    const custRec = (st && st.customRecords) || {};
    const dStr = String(dateIso || todayIso()).slice(0, 10);

    const mergeNonVoided = key => {
      const byId = new Map();
      const baseArr = Array.isArray(rec[key]) ? rec[key] : [];
      const custArr = Array.isArray(custRec[key]) ? custRec[key] : [];
      baseArr.forEach(r => { if (r && r.id) byId.set(String(r.id), r); });
      custArr.forEach(r => { if (r && r.id) byId.set(String(r.id), r); });
      return Array.from(byId.values()).filter(r => r && !r.voided && !r.removed);
    };

    const recDateOf = r => String(r.rep_date || r.date || '').slice(0, 10);

    const fuelMatches = mergeNonVoided('fuel_intakes').filter(f =>
      recDateOf(f) === dStr &&
      normAlnum(f.company || 'WTC') === normAlnum(unit.company) &&
      unitMatchesRecordEquip(unit, f.equipment) &&
      /diesel|mazout/i.test(String(f.item || f.fuel_type || 'Diesel'))
    );
    const pumpLitres = round1(fuelMatches.reduce((s, f) => s + (Number(f.litres) || 0), 0));

    const salesMatches = mergeNonVoided('sales_tickets').filter(t =>
      recDateOf(t) === dStr &&
      normAlnum(t.company || 'WTC') === normAlnum(unit.company) &&
      unitMatchesRecordEquip(unit, t.truck)
    );
    const rawMatches = mergeNonVoided('raw_purchases').filter(t =>
      recDateOf(t) === dStr &&
      normAlnum(t.company || 'WTC') === normAlnum(unit.company) &&
      unitMatchesRecordEquip(unit, t.truck)
    );

    let tankVarianceL = null;
    let expectedClosingL = null;
    if (hist && hist.opening_settled_l != null && hist.closing_settled_l != null && hist.ecu_burn_l != null) {
      expectedClosingL = round1(hist.opening_settled_l + pumpLitres - hist.ecu_burn_l);
      tankVarianceL = round1(hist.closing_settled_l - expectedClosingL);
    }

    const quarryOrSiteStops = hist && Array.isArray(hist.stops)
      ? hist.stops.filter(s => s && !/choueifat|main yard/i.test(String(s.zone_name || ''))).length
      : 0;
    const totalBilledTrips = salesMatches.length + rawMatches.length;

    return {
      date: dStr,
      pumpLitres,
      pumpTicketsCount: fuelMatches.length,
      salesTripsCount: salesMatches.length,
      rawTripsCount: rawMatches.length,
      totalBilledTrips,
      quarryOrSiteStops,
      unbilledStopGap: Math.max(0, quarryOrSiteStops - totalBilledTrips),
      expectedClosingL,
      tankVarianceL
    };
  }

  // Strictly read-only CAN-bus & settled-tank dip calibration summary (zero network calls)
  function getCanFuelCalibrationSummary(companyOpt) {
    ensureSeatScopeFresh();
    const targetScope = companyOpt || getActiveCompanyScope();
    const units = getScopedUnits(targetScope);
    const ecuUnits = units.filter(u => u && u.has_ecu_io83);
    const sigPrefix = `${getSeatIdentitySig()}|`;
    const unitByDevId = new Map();
    units.forEach(u => {
      if (u && u.device_id != null) unitByDevId.set(Number(u.device_id), u);
    });

    let sumEcuBurnL = 0;
    let sumGpsKm = 0;
    let pairedPumpL = 0;
    let pairedEcuL = 0;
    let historySamplesCount = 0;
    let settledDipSamples = 0;
    const seenHistKeys = new Set();

    _histCache.forEach((hist, cacheKey) => {
      if (!hist || typeof cacheKey !== 'string' || !cacheKey.startsWith(sigPrefix)) return;
      const devId = Number(hist.device_id || 0);
      const u = unitByDevId.get(devId);
      if (!u || !canSeatAccessCompany(u.company)) return;
      const fDate = String(hist.from_date || '').slice(0, 10);
      const dedupKey = `${devId}|${fDate}`;
      if (seenHistKeys.has(dedupKey)) return;
      seenHistKeys.add(dedupKey);
      historySamplesCount += 1;
      if (hist.opening_settled_l != null && hist.closing_settled_l != null) {
        settledDipSamples += 1;
      }
      const km = Number(hist.km_gps || 0);
      const burn = Number(hist.ecu_burn_l || 0);
      if (hist.has_ecu_io83 && km > 10 && burn > 0) {
        const rate = burn / km;
        if (rate >= 0.25 && rate <= 1.65) {
          sumGpsKm += km;
          sumEcuBurnL += burn;
          if (fDate) {
            const recon = computeLedgerReconForUnitDate(u, hist, fDate);
            if (recon && recon.pumpLitres > 0 && hist.opening_settled_l != null && hist.closing_settled_l != null) {
              const adjBurn = hist.opening_settled_l + recon.pumpLitres - hist.closing_settled_l;
              if (adjBurn > 5 && burn > 5) {
                const ratio = adjBurn / burn;
                if (ratio >= 0.75 && ratio <= 1.35) {
                  pairedPumpL += adjBurn;
                  pairedEcuL += burn;
                }
              }
            }
          }
        }
      }
    });

    const seed = _ctx && typeof _ctx.getSeed === 'function' ? _ctx.getSeed() : window.MFG_SEED;
    const st = _ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : null;
    const dipBase = (seed && seed.records && Array.isArray(seed.records.diesel_dips)) ? seed.records.diesel_dips : [];
    const dipCust = (st && st.customRecords && Array.isArray(st.customRecords.diesel_dips)) ? st.customRecords.diesel_dips : [];
    const visibleDips = dipBase.concat(dipCust).filter(d => d && !d.voided && canSeatAccessCompany(d.company || 'WTC')).length;

    let ecuLPerKm = null;
    const ecuFromHistory = sumGpsKm > 10 && sumEcuBurnL > 0;
    if (ecuFromHistory) {
      ecuLPerKm = round2(sumEcuBurnL / sumGpsKm);
    } else if (ecuUnits.length > 0) {
      const explicitRates = ecuUnits
        .map(u => Number(u.ecu_l_per_km || u.burn_rate_l_km || 0))
        .filter(v => Number.isFinite(v) && v >= 0.25 && v <= 1.65);
      ecuLPerKm = explicitRates.length
        ? round2(explicitRates.reduce((a, b) => a + b, 0) / explicitRates.length)
        : 0.72;
    }

    const rawRatio = (pairedEcuL > 10 && pairedPumpL > 0) ? (pairedPumpL / pairedEcuL) : 1.0;
    const pumpToEcuRatio = round2(Math.max(0.90, Math.min(1.15, rawRatio)));
    const summary = summarizeUnits(units);

    return {
      scope: targetScope,
      connectedCount: units.length,
      ecuUnitsCount: ecuUnits.length,
      ecuLPerKm,
      ecuFromHistory,
      historySamplesCount,
      dipReconCount: settledDipSamples + visibleDips,
      pumpToEcuRatio,
      tankTotalL: summary ? summary.tankTotalL : 0
    };
  }

  function buildDeterministicTelemetryBrief(unit, hist, ledgerRecon) {
    if (!unit) return '';
    const lang = (window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') ? window.MFG_I18N.getLang() : 'en';
    const parts = [];
    if (lang === 'ar') {
      if (unit.status_code === 'power_cut') {
        parts.push(`الآلية ${unit.equipment} (${unit.plate_no}) تسجل انقطاع تغذية 0.0V في ${tr(unit.zone_name)}. يرجى فحص قاطع البطارية 24V قبل التحرك.`);
      }
      if (hist) {
        if (hist.has_ecu_io83 && hist.ecu_burn_l != null) {
          parts.push(`عداد المحرك CAN io83 سجل ${hist.ecu_burn_l.toFixed(1)} لتر عبر مسافة ${hist.km_gps.toFixed(1)} كم.`);
        }
        if (ledgerRecon && ledgerRecon.tankVarianceL != null) {
          parts.push(`فارق الخزان المستقر ${ledgerRecon.tankVarianceL >= 0 ? '+' : ''}${ledgerRecon.tankVarianceL.toFixed(1)} لتر مقابل قسائم المحطة (${ledgerRecon.pumpLitres.toFixed(1)} لتر).`);
        }
        parts.push((hist.siphon_alerts && hist.siphon_alerts.length > 0)
          ? `تنبيه: تم رصد ${hist.siphon_alerts.length} حالة نقص وقود أثناء التوقف والمحرك مطفأ.`
          : 'لم يُرصد أي سحب وقود أثناء التوقف.');
      }
      return parts.join(' ');
    }
    if (lang === 'fr') {
      if (unit.status_code === 'power_cut') {
        parts.push(`L'unité ${unit.equipment} (${unit.plate_no}) signale une coupure 0,0 V à ${tr(unit.zone_name)}. Vérifiez le coupe-batterie 24V avant départ.`);
      }
      if (hist) {
        if (hist.has_ecu_io83 && hist.ecu_burn_l != null) {
          parts.push(`Le calculateur CAN io83 a mesuré ${hist.ecu_burn_l.toFixed(1)} L injectés sur ${hist.km_gps.toFixed(1)} km.`);
        }
        if (ledgerRecon && ledgerRecon.tankVarianceL != null) {
          parts.push(`Écart réservoir stabilisé : ${ledgerRecon.tankVarianceL >= 0 ? '+' : ''}${ledgerRecon.tankVarianceL.toFixed(1)} L face aux bons pompe (${ledgerRecon.pumpLitres.toFixed(1)} L).`);
        }
        parts.push((hist.siphon_alerts && hist.siphon_alerts.length > 0)
          ? `Alerte : ${hist.siphon_alerts.length} baisse(s) réservoir à l'arrêt contact coupé.`
          : 'Aucune baisse suspecte détectée à l’arrêt.');
      }
      return parts.join(' ');
    }
    if (unit.status_code === 'power_cut') {
      parts.push(`${unit.equipment} (${unit.plate_no}) reports 0.0V external power at ${unit.zone_name}. Inspect the 24V master battery switch or tracker fuse before dispatching.`);
    }
    if (hist) {
      if (hist.has_ecu_io83 && hist.ecu_burn_l != null) {
        const rateTxt = hist.burn_rate_l_km != null ? ` (${hist.burn_rate_l_km.toFixed(2)} L/km)` : '';
        const gradeNote = (hist.burn_rate_l_km != null && hist.burn_rate_l_km >= 0.62 && hist.burn_rate_l_km <= 0.82)
          ? ' within normal loaded quarry grade corridor (0.60 - 0.80 L/km)'
          : (hist.burn_rate_l_km != null && hist.burn_rate_l_km > 0.82 ? ' above loaded grade norm; review idling time or payload' : '');
        parts.push(`CAN ECU io83 measured ${hist.ecu_burn_l.toFixed(1)} L injected across ${hist.km_gps.toFixed(1)} km${rateTxt}${gradeNote}.`);
      }
      if (ledgerRecon && ledgerRecon.tankVarianceL != null) {
        const absV = Math.abs(ledgerRecon.tankVarianceL);
        if (absV <= 15) {
          parts.push(`Closed-loop tank check reconciles within sensor tolerance (${ledgerRecon.tankVarianceL >= 0 ? '+' : ''}${ledgerRecon.tankVarianceL.toFixed(1)} L vs ${ledgerRecon.pumpLitres.toFixed(1)} L pump slips).`);
        } else {
          parts.push(`Settled tank variance is ${ledgerRecon.tankVarianceL >= 0 ? '+' : ''}${ledgerRecon.tankVarianceL.toFixed(1)} L (Pump slips: ${ledgerRecon.pumpLitres.toFixed(1)} L). Verify unposted pump slip or external station fill.`);
        }
      }
      if (hist.siphon_alerts && hist.siphon_alerts.length > 0) {
        parts.push(`Alert: ${hist.siphon_alerts.length} stationary ACC-Off fuel drop(s) detected while ECU burn was 0 L.`);
      } else {
        parts.push('Zero parked ACC-Off fuel drops detected.');
      }
    }
    return parts.join(' ');
  }

  function getWatchdogAlertsForSentinels(companyScope) {
    const units = getScopedUnits(companyScope);
    const out = [];
    for (const u of units) {
      const zName = u.isabi_region || u.zone_name || 'Unknown';
      if (u.status_code === 'power_cut') {
        out.push({
          kind: 'power_cut',
          severity: 'warn',
          equipment: u.equipment,
          plate_no: u.plate_no,
          company: u.company,
          zone_name: zName,
          detail: `${u.equipment} (${u.plate_no}) has 0V external power cut at ${zName} (${u.tank_litres != null ? u.tank_litres + ' L in tank' : 'offline'}).`
        });
      }
      if (u.milestone_alert) {
        out.push({
          kind: 'milestone_500k',
          severity: 'warn',
          equipment: u.equipment,
          plate_no: u.plate_no,
          company: u.company,
          zone_name: zName,
          detail: `${u.equipment} (${u.plate_no}) at ${fmtNum(u.odometer_km, 0)} km (${u.milestone_alert}).`
        });
      }
    }
    return out;
  }

  // ==================== DETERMINISTIC GPS DWELL VS. PINNED SITE DRIFT WATCHDOG ====================
  let _lastDwellAlerts = [];

  function _haversineMeters(lat1, lng1, lat2, lng2) {
    const la1 = Number(lat1), ln1 = Number(lng1), la2 = Number(lat2), ln2 = Number(lng2);
    if (![la1, ln1, la2, ln2].every(Number.isFinite)) return null;
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(la2 - la1);
    const dLng = toRad(ln2 - ln1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * (Math.sin(dLng / 2) ** 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
  }

  function _parseStopMinutes(val, strVal) {
    if (val != null && Number.isFinite(Number(val))) return Number(val);
    const s = String(strVal || '').trim().toLowerCase();
    if (!s) return 0;
    let total = 0;
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/);
    if (h) total += Number(h[1]) * 60;
    if (m) total += Number(m[1]);
    return total;
  }

  function _canonDwellInd(raw) {
    const k = norm(raw);
    if (!k || k === 'manufacturing' || k === 'manufacturing-group' || k === 'all') return 'manufacturing';
    if (k.includes('holding')) return 'holding';
    if (k.includes('hospitality') || k.includes('resort')) return 'hospitality';
    if (k.includes('trading') || k.includes('automotive')) return 'trading';
    if (k.includes('real estate') || k === 'real_estate' || k.includes('property')) return 'real_estate';
    if (k.includes('insurance') || k.includes('broker')) return 'insurance';
    return k;
  }

  function _companyDefaultInd(co) {
    const c = normAlnum(co);
    if (!c || c === 'wtc' || c === 'bbconstruction' || c === 'bbc' || c === 'lionstransport' || c === 'lions') return 'manufacturing';
    if (c.includes('holding')) return 'holding';
    if (['blanca', 'launa', 'palms', 'voile', 'platinum'].includes(c)) return 'hospitality';
    if (c === 'korriauto' || c === 'shacman') return 'trading';
    if (c === 'properties' || c.includes('4235')) return 'real_estate';
    if (c.includes('insurance')) return 'insurance';
    return 'manufacturing';
  }

  function _indStripToCanon(industryViewKey) {
    const k = String(industryViewKey || '').trim().toLowerCase();
    if (k.startsWith('trd_')) return 'trading';
    if (k.startsWith('hsp_')) return 'hospitality';
    if (k.startsWith('re_')) return 'real_estate';
    if (k.startsWith('ins_')) return 'insurance';
    if (k.startsWith('hld_')) return 'holding';
    return 'manufacturing';
  }

  function _canSeatAccessDwellStop(co, indCanon) {
    if (isDemoActive()) return true;
    if (co && !canSeatAccessCompany(co)) return false;
    try {
      if (typeof window.MFG_CAN_ACCESS_GEO_INDUSTRY === 'function') {
        const disp = { manufacturing: 'Manufacturing', holding: 'Holding & Treasury', hospitality: 'Hospitality & Resorts', trading: 'Automotive & Heavy Trading', real_estate: 'Real Estate & Property', insurance: 'Insurance & Brokerage' }[indCanon] || 'Manufacturing';
        if (!window.MFG_CAN_ACCESS_GEO_INDUSTRY(disp)) return false;
      }
    } catch (_) {}
    return true;
  }

  function _buildDemoDwellStops() {
    return [
      { id: 'demo_ds_mfg_1', company: 'WTC', industry: 'manufacturing', equipment: 'TB3', lat: 33.8098, lng: 35.4932, duration_min: 38, zone_name: 'Choueifat South Approach' },
      { id: 'demo_ds_mfg_2', company: 'BBConstruction', industry: 'manufacturing', equipment: 'TB1', lat: 33.6312, lng: 35.4310, duration_min: 26, zone_name: 'Sibline Quarry Gate' },
      { id: 'demo_ds_mfg_off', company: 'Lions Transport', industry: 'manufacturing', equipment: 'TB7', lat: 33.7420, lng: 35.4680, duration_min: 22, zone_name: 'Damour Layby' },
      { id: 'demo_ds_hsp_1', company: 'La Una', industry: 'hospitality', equipment: 'Resort Van 1', lat: 33.9752, lng: 35.6164, duration_min: 19, zone_name: 'La Una Service Ramp' },
      { id: 'demo_ds_trd_1', company: 'Korri Auto', industry: 'trading', equipment: 'Service Carrier 2', lat: 33.8968, lng: 35.5665, duration_min: 24, zone_name: 'Korri PDI Gate' },
      { id: 'demo_ds_re_1', company: 'Properties', industry: 'real_estate', equipment: 'MEP Van 4', lat: 33.8935, lng: 35.5092, duration_min: 18, zone_name: 'Tower B Service Dock' },
      { id: 'demo_ds_hld_1', company: 'Bdeir Holding', industry: 'holding', equipment: 'Cash Courier 1', lat: 33.8895, lng: 35.5028, duration_min: 15, zone_name: 'Treasury Vault Entrance' },
      { id: 'demo_ds_ins_1', company: 'Insurance Company', industry: 'insurance', equipment: 'Surveyor Unit 1', lat: 33.8822, lng: 35.5390, duration_min: 16, zone_name: 'Garage Inspection Gate' }
    ];
  }

  const DWELL_RULE_BY_IND = {
    manufacturing: 'S16',
    holding: 'ind_hld_09',
    hospitality: 'ind_hsp_09',
    trading: 'ind_trd_09',
    real_estate: 'ind_re_09',
    insurance: 'ind_ins_09'
  };

  function _resolveDwellThreshold(ruleId, paramKey, optVal, fallbackVal) {
    if (optVal != null && Number.isFinite(Number(optVal))) return Number(optVal);
    try {
      if (_ctx && typeof _ctx.getAlertParam === 'function') {
        const v = Number(_ctx.getAlertParam(ruleId, paramKey, fallbackVal));
        if (Number.isFinite(v) && v > 0) return v;
      }
      if (typeof window !== 'undefined' && window.MFG_ALERT_CONFIG && typeof window.MFG_ALERT_CONFIG.getParam === 'function') {
        const v = Number(window.MFG_ALERT_CONFIG.getParam(ruleId, paramKey, fallbackVal));
        if (Number.isFinite(v) && v > 0) return v;
      }
    } catch (_) {}
    return fallbackVal;
  }

  function _pointToSegmentMeters(pLat, pLng, aLat, aLng, bLat, bLng) {
    if (![pLat, pLng, aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.max(0.2, Math.cos((pLat * Math.PI) / 180));
    const ax = (aLng - pLng) * mPerLng;
    const ay = (aLat - pLat) * mPerLat;
    const bx = (bLng - pLng) * mPerLng;
    const by = (bLat - pLat) * mPerLat;
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-6) return _haversineMeters(pLat, pLng, aLat, aLng);
    const t = Math.max(0, Math.min(1, -((ax * abx) + (ay * aby)) / lenSq));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    return Math.round(Math.hypot(cx, cy));
  }

  function _minDistToVerifiedRoutes(lat, lng, indCanon, coName, siteName, geoCfg) {
    const siteNorm = norm(siteName || '');
    if (!siteNorm) return null;
    const coNorm = norm(coName || '');
    const segSite = `site:${siteNorm}`;
    const segBu = coNorm ? `bu:${coNorm}` : '';
    const routes = geoCfg && geoCfg.verifiedRoutes && typeof geoCfg.verifiedRoutes === 'object' ? geoCfg.verifiedRoutes : {};
    let best = null;
    for (const [k, r] of Object.entries(routes)) {
      if (!r || typeof r !== 'object') continue;
      const kl = norm(k);
      const rInd = kl.includes('::') ? _canonDwellInd(kl.split('::')[0]) : 'manufacturing';
      if (indCanon && rInd !== indCanon) continue;
      const bodyStr = kl.includes('::') ? kl.split('::').slice(1).join('::') : kl;
      const parts = bodyStr.split('||').map(x => norm(x)).filter(Boolean);
      const siteMatch = parts.some(p => p === segSite || p === siteNorm);
      if (!siteMatch) continue;
      const buPart = parts.find(p => p.startsWith('bu:'));
      const rCo = norm(r.company || (buPart ? buPart.slice(3) : ''));
      if (coNorm && rCo && rCo !== coNorm) continue;
      if (segBu && buPart && buPart !== segBu) continue;
      const hasCoords = Array.isArray(r.coords) && r.coords.length > 0;
      const hasLngLat = !hasCoords && Array.isArray(r.coordsLngLat) && r.coordsLngLat.length > 0;
      const pts = hasCoords ? r.coords : (hasLngLat ? r.coordsLngLat : (Array.isArray(r.points) ? r.points : null));
      if (!pts || !pts.length) continue;
      const parsed = pts.map(pt => ({
        lat: Array.isArray(pt) ? Number(hasLngLat ? pt[1] : pt[0]) : Number(pt && pt.lat),
        lng: Array.isArray(pt) ? Number(hasLngLat ? pt[0] : pt[1]) : Number(pt && pt.lng)
      })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (!parsed.length) continue;
      if (parsed.length === 1) {
        const d = _haversineMeters(lat, lng, parsed[0].lat, parsed[0].lng);
        if (d != null && (best == null || d < best)) best = d;
      } else {
        for (let i = 0; i < parsed.length - 1; i++) {
          const d = _pointToSegmentMeters(lat, lng, parsed[i].lat, parsed[i].lng, parsed[i + 1].lat, parsed[i + 1].lng);
          if (d != null && (best == null || d < best)) best = d;
        }
      }
    }
    return best;
  }

  function computeGpsDwellDriftDigest(opts = {}) {
    ensureSeatScopeFresh();
    const o = opts || {};
    const filterInd = o.industry && o.industry !== 'all' ? _canonDwellInd(o.industry) : '';
    const filterCo = o.companyScope || '';

    const rawStops = [];
    const extTest = typeof window !== 'undefined' && Array.isArray(window.__ISABI_TEST_DWELL_STOPS) ? window.__ISABI_TEST_DWELL_STOPS : [];
    for (const s of extTest) {
      if (s && s.lat != null && s.lng != null) rawStops.push(s);
    }
    if (isDemoActive()) {
      for (const ds of _buildDemoDwellStops()) rawStops.push(ds);
    }
    const curSeatPrefix = getSeatIdentitySig() + '|';
    const lbDays = Math.max(1, Number(o.lookbackDays || 30) || 30);
    const lbCutMs = Date.now() - lbDays * 86400000;
    const todayStr = todayIso();
    const histStopCoords = [];
    for (const [hk, hist] of _histCache.entries()) {
      if (!String(hk || '').startsWith(curSeatPrefix)) continue;
      if (!hist || !Array.isArray(hist.stops)) continue;
      if (hist._fallback || (hist.demo && !isDemoActive())) continue;
      const tail = String(hk).slice(curSeatPrefix.length);
      const [hkDev, hkFrom, hkTo] = tail.split('|');
      const devKey = String(hist.device_id || hkDev || '').trim();
      const eqKey = norm(hist.equipment || '');
      const histEndRaw = hist.to_date || hkTo || hist.from_date || hkFrom || '';
      const histEndMs = histEndRaw ? Date.parse(String(histEndRaw).slice(0, 10) + 'T23:59:59Z') : NaN;
      if (Number.isFinite(histEndMs) && histEndMs < lbCutMs) continue;
      for (const st of hist.stops) {
        if (!st || st.lat == null || st.lng == null) continue;
        const mins = _parseStopMinutes(st.duration_min, st.stop_duration);
        if (mins < 10) continue;
        const stTsRaw = st.end_time || st.start_time || histEndRaw || '';
        const stMs = stTsRaw ? Date.parse(String(stTsRaw).replace(' ', 'T')) : NaN;
        if (Number.isFinite(stMs) && stMs < lbCutMs) continue;
        const sLat = Number(st.lat);
        const sLng = Number(st.lng);
        const isToday = String(stTsRaw || histEndRaw).slice(0, 10) === todayStr;
        histStopCoords.push({ devKey, eqKey, lat: sLat, lng: sLng, isToday });
        rawStops.push({
          company: hist.company || 'WTC',
          industry: _companyDefaultInd(hist.company || 'WTC'),
          equipment: hist.equipment || '',
          lat: sLat,
          lng: sLng,
          duration_min: mins,
          zone_name: st.zone_name || ''
        });
      }
    }
    // Read only real live snapshot units (never buildOfflineFallbackUnits mock fixtures outside explicit Demo mode)
    const liveUnits = Array.isArray(_snapStore.units) && (!_snapStore.demo || isDemoActive()) ? _snapStore.units : [];
    for (const u of liveUnits) {
      if (!u || u.lat == null || u.lng == null || u.status_code === 'moving') continue;
      const uDev = u.device_id != null ? String(u.device_id).trim() : '';
      const uEq = norm(u.equipment || '');
      const uLat = Number(u.lat);
      const uLng = Number(u.lng);
      const sameStopCached = histStopCoords.some(hs => {
        if (!hs.isToday) return false;
        const sameUnit = (uDev && hs.devKey && uDev === hs.devKey) || (uEq && hs.eqKey && uEq === hs.eqKey);
        if (!sameUnit) return false;
        const d = _haversineMeters(hs.lat, hs.lng, uLat, uLng);
        return d != null && d <= 25;
      });
      if (sameStopCached) continue;
      const mins = _parseStopMinutes(u.stop_duration_min, u.stop_duration);
      if (mins < 10) continue;
      rawStops.push({
        company: u.company || 'WTC',
        industry: _companyDefaultInd(u.company || 'WTC'),
        equipment: u.equipment || '',
        lat: uLat,
        lng: uLng,
        duration_min: mins,
        zone_name: u.isabi_region || u.zone_name || ''
      });
    }

    if (!rawStops.length) {
      _lastDwellAlerts = [];
      return { totalClusters: 0, alertCount: 0, staleCount: 0, offPinCount: 0, clusters: [], alerts: [] };
    }

    const seed = _ctx && typeof _ctx.getSeed === 'function' ? _ctx.getSeed() : window.MFG_SEED;
    const geoCfg = (window.MFG_GEO && typeof window.MFG_GEO.exportGeoConfig === 'function')
      ? window.MFG_GEO.exportGeoConfig()
      : { companyHubs: {}, sites: {}, verifiedRoutes: {} };

    const hubs = [];
    if (window.MFG_GEO && typeof window.MFG_GEO.getAllCompanyHubs === 'function') {
      (window.MFG_GEO.getAllCompanyHubs(seed) || []).forEach(h => {
        if (h && h.lat != null && h.lng != null) hubs.push({ name: h.name, lat: Number(h.lat), lng: Number(h.lng) });
      });
    }
    if (geoCfg.companyHubs && typeof geoCfg.companyHubs === 'object') {
      Object.entries(geoCfg.companyHubs).forEach(([k, h]) => {
        if (h && h.lat != null && h.lng != null) hubs.push({ name: h.name || k, lat: Number(h.lat), lng: Number(h.lng) });
      });
    }

    // Filter non-hub >=10m stops with strict RLS and industry/company scope
    const eligible = [];
    for (const s of rawStops) {
      const mins = _parseStopMinutes(s.duration_min, s.stop_duration);
      if (mins < 10) continue;
      const co = String(s.company || 'WTC').trim();
      const ind = _canonDwellInd(s.industry || _companyDefaultInd(co));
      if (filterInd && ind !== filterInd) continue;
      if (filterCo && !companyMatchesScope(co, filterCo)) continue;
      if (!_canSeatAccessDwellStop(co, ind)) continue;
      const lat = Number(s.lat), lng = Number(s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4)) continue;
      const nearHub = hubs.some(h => {
        const d = _haversineMeters(lat, lng, h.lat, h.lng);
        return d != null && d <= 220;
      });
      if (nearHub) continue;
      eligible.push({ company: co, industry: ind, equipment: String(s.equipment || ''), lat, lng, duration_min: mins, zone_name: String(s.zone_name || '') });
    }

    // Deterministic greedy 200m clustering
    const clusters = [];
    for (const st of eligible) {
      let hit = null;
      for (const cl of clusters) {
        if (cl.industry !== st.industry || norm(cl.company) !== norm(st.company)) continue;
        const d = _haversineMeters(cl.dwellLat, cl.dwellLng, st.lat, st.lng);
        if (d != null && d <= 200) { hit = cl; break; }
      }
      if (hit) {
        const n = hit.stopCount + 1;
        hit.dwellLat = Math.round((((hit.dwellLat * hit.stopCount) + st.lat) / n) * 1e6) / 1e6;
        hit.dwellLng = Math.round((((hit.dwellLng * hit.stopCount) + st.lng) / n) * 1e6) / 1e6;
        hit.stopCount = n;
        hit.totalMin = Math.round(hit.totalMin + st.duration_min);
        if (st.equipment && !hit.units.includes(st.equipment)) hit.units.push(st.equipment);
      } else {
        clusters.push({
          id: `dw_${st.industry}_${clusters.length + 1}`,
          industry: st.industry,
          company: st.company,
          dwellLat: Math.round(st.lat * 1e6) / 1e6,
          dwellLng: Math.round(st.lng * 1e6) / 1e6,
          stopCount: 1,
          totalMin: Math.round(st.duration_min),
          units: st.equipment ? [st.equipment] : [],
          zoneHint: st.zone_name
        });
      }
    }

    if (!clusters.length) {
      _lastDwellAlerts = [];
      return { totalClusters: 0, alertCount: 0, staleCount: 0, offPinCount: 0, clusters: [], alerts: [] };
    }

    // Index all pinned sites per industry from SEED + GEO_STORE + active domain pins
    const sitePool = [];
    const seedSites = (seed && seed.records && Array.isArray(seed.records.sites)) ? seed.records.sites : [];
    for (const sr of seedSites) {
      if (!sr || sr.voided || sr._pinCleared) continue;
      if (sr.latitude == null || sr.longitude == null) continue;
      const lat = Number(sr.latitude), lng = Number(sr.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4)) continue;
      sitePool.push({
        id: String(sr.id || ''),
        name: String(sr.name || ''),
        company: String(sr.company || ''),
        industry: _canonDwellInd(sr._industry || 'manufacturing'),
        site_category: String(sr.site_category || 'supplier'),
        lat, lng
      });
    }
    if (geoCfg.sites && typeof geoCfg.sites === 'object') {
      for (const [gk, gv] of Object.entries(geoCfg.sites)) {
        if (!gv || gv._pinCleared || gv.latitude == null || gv.longitude == null) continue;
        const lat = Number(gv.latitude), lng = Number(gv.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4)) continue;
        const ind = gk.includes('::') ? _canonDwellInd(gk.split('::')[0]) : 'manufacturing';
        sitePool.push({
          id: String(gv.id || ''),
          name: String(gv.name || gk.split('::').pop().replace(/^(supplier|customer):/i, '')),
          company: String(gv.company || ''),
          industry: ind,
          site_category: String(gv.site_category || 'supplier'),
          lat, lng
        });
      }
    }
    const stNow = _ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : (typeof window !== 'undefined' ? window.STATE : null);
    if (stNow && stNow.industryCustomRows && typeof stNow.industryCustomRows === 'object') {
      for (const [bk, rows] of Object.entries(stNow.industryCustomRows)) {
        if (!Array.isArray(rows)) continue;
        const bkInd = _canonDwellInd(bk.split('::')[0] || '');
        for (const row of rows) {
          if (!row || row.voided || row._pinCleared) continue;
          const la = Number(row.latitude != null ? row.latitude : row.lat);
          const ln = Number(row.longitude != null ? row.longitude : row.lng);
          if (!Number.isFinite(la) || !Number.isFinite(ln) || (Math.abs(la) < 1e-4 && Math.abs(ln) < 1e-4)) continue;
          sitePool.push({
            id: String(row.id || row.code || ''),
            name: String(row.siteName || row.name || row.title || row.property || row.unit || bk),
            company: String(row.company || row.resort || row.entity || ''),
            industry: _canonDwellInd(row._industry || bkInd),
            site_category: String(row.site_category || 'supplier'),
            lat: la, lng: ln
          });
        }
      }
    }
    if (stNow && stNow.industryRowEdits && typeof stNow.industryRowEdits === 'object') {
      for (const [ek, eobj] of Object.entries(stNow.industryRowEdits)) {
        if (!eobj || eobj.voided) continue;
        const eInd = _canonDwellInd(eobj.ind || ek.split('::')[0] || '');
        const ePid = norm(eobj.primaryId || '');
        const eSn = norm(eobj.siteName || eobj.primaryId || '');
        if (eobj._pinCleared) {
          for (let i = sitePool.length - 1; i >= 0; i--) {
            const sp = sitePool[i];
            if (sp.industry !== eInd) continue;
            if ((ePid && norm(sp.id) === ePid) || (eSn && norm(sp.name) === eSn)) sitePool.splice(i, 1);
          }
          continue;
        }
        const la = Number(eobj.latitude != null ? eobj.latitude : eobj.lat);
        const ln = Number(eobj.longitude != null ? eobj.longitude : eobj.lng);
        if (!Number.isFinite(la) || !Number.isFinite(ln) || (Math.abs(la) < 1e-4 && Math.abs(ln) < 1e-4)) continue;
        let updated = false;
        for (const sp of sitePool) {
          if (sp.industry !== eInd) continue;
          if ((ePid && norm(sp.id) === ePid) || (eSn && norm(sp.name) === eSn)) {
            sp.lat = la;
            sp.lng = ln;
            updated = true;
          }
        }
        if (!updated) {
          sitePool.push({
            id: String(eobj.primaryId || ''),
            name: String(eobj.siteName || eobj.primaryId || ek),
            company: String(eobj.company || eobj.resort || eobj.entity || ''),
            industry: eInd,
            site_category: String(eobj.site_category || 'supplier'),
            lat: la, lng: ln
          });
        }
      }
    }

    const alerts = [];
    let staleCount = 0;
    let offPinCount = 0;
    for (const cl of clusters) {
      const clRuleId = DWELL_RULE_BY_IND[cl.industry] || 'S16';
      const clStaleMinM = Math.max(50, _resolveDwellThreshold(clRuleId, 'staleMinM', o.staleMinM, 250));
      const clOffPinMinM = Math.max(clStaleMinM + 50, _resolveDwellThreshold(clRuleId, 'offPinMinM', o.offPinMinM, 2500));
      const candSites = sitePool.filter(sp => sp.industry === cl.industry && (!sp.company || norm(sp.company) === norm(cl.company) || cl.industry === 'manufacturing'));
      let nearest = null;
      let nearestMeters = null;
      for (const sp of candSites) {
        const d = _haversineMeters(cl.dwellLat, cl.dwellLng, sp.lat, sp.lng);
        if (d != null && (nearestMeters == null || d < nearestMeters)) {
          nearestMeters = d;
          nearest = sp;
        }
      }
      const routeOffsetMeters = nearest
        ? _minDistToVerifiedRoutes(cl.dwellLat, cl.dwellLng, cl.industry, cl.company, nearest.name, geoCfg)
        : null;
      const isOffRoute = routeOffsetMeters != null && routeOffsetMeters > 300;
      if (nearest && nearestMeters <= clStaleMinM && !isOffRoute) continue;

      let kind = 'off_pin';
      let label = 'Unapproved Off-Pin Drop';
      let severity = 'warn';
      if (nearest && nearestMeters <= clOffPinMinM) {
        kind = 'stale_pin';
        label = 'Stale Pin Drift';
        severity = nearestMeters > Math.max(800, clStaleMinM * 2) ? 'crit' : 'warn';
        staleCount++;
      } else if (nearest && nearestMeters <= clStaleMinM && isOffRoute) {
        kind = 'stale_pin';
        label = 'Stale Pin Drift';
        staleCount++;
      } else {
        offPinCount++;
        severity = 'crit';
      }
      alerts.push({
        id: cl.id,
        kind,
        label,
        severity,
        industry: cl.industry,
        company: cl.company,
        dwellLat: cl.dwellLat,
        dwellLng: cl.dwellLng,
        stopCount: cl.stopCount,
        totalMin: cl.totalMin,
        units: cl.units,
        zoneHint: cl.zoneHint,
        siteId: nearest ? nearest.id : '',
        siteName: nearest ? nearest.name : (cl.zoneHint || 'Unpinned Location'),
        siteCategory: nearest ? nearest.site_category : 'supplier',
        pinnedLat: nearest ? nearest.lat : null,
        pinnedLng: nearest ? nearest.lng : null,
        shiftMeters: nearestMeters,
        routeOffsetMeters
      });
    }

    _lastDwellAlerts = alerts;
    return {
      totalClusters: clusters.length,
      alertCount: alerts.length,
      staleCount,
      offPinCount,
      alerts
    };
  }

  function renderDwellDriftStripHtml() {
    const digest = computeGpsDwellDriftDigest({ companyScope: getActiveCompanyScope(), industry: 'manufacturing' });
    if (!digest.alerts.length) return '';
    const rows = digest.alerts.slice(0, 6).map(a => `
      <div class="tel-dwell-row" data-tel-dwell-id="${esc(a.id)}">
        <div class="tel-dwell-main">
          <span class="badge ${a.kind === 'stale_pin' ? 'badge-warn' : 'badge-crit'}">${esc(tr(a.label))}</span>
          <b data-no-i18n="1">${esc(a.siteName)}</b>
          <span class="tel-dwell-meta" data-no-i18n="1">${esc(a.company)}${a.units.length ? ' · ' + esc(a.units.join(', ')) : ''} · ${a.shiftMeters != null ? fmtNum(a.shiftMeters, 0) + ' m' : 'Off-pin'} · ${fmtNum(a.stopCount, 0)} stops (${fmtNum(a.totalMin, 0)} min)</span>
        </div>
        <div class="tel-dwell-acts">
          <button type="button" class="tel-mini-btn is-brass" data-tel-dwell-map="${esc(a.id)}">${ic('pin')} <span>Inspect on Map</span></button>
          <button type="button" class="tel-mini-btn" data-tel-dwell-queue="${esc(a.id)}"><span>Queue Gate Pin</span></button>
        </div>
      </div>`).join('');
    return `
      <div class="tel-dwell-strip" id="telDwellDriftStrip">
        <div class="tel-dwell-hd">
          <span>${ic('shield')} <b>GPS Dwell vs. Pinned Site Drift Watchdog</b></span>
          <span class="badge badge-warn" data-no-i18n="1">${fmtNum(digest.alertCount, 0)}</span>
        </div>
        <div class="tel-dwell-list">${rows}</div>
      </div>`;
  }

  function startOrSyncAutoPoll() {
    if (isHeadlessEnv()) {
      stopAutoPoll();
      return;
    }
    const hasSurface = Boolean(document.getElementById('fleetTelematicsDeck') || document.getElementById('geoMapStudioDeck'));
    if (!hasSurface || (typeof document !== 'undefined' && document.hidden)) {
      stopAutoPoll();
      return;
    }
    if (!_snapStore.fetchedAt && !_snapStore.loading) {
      fetchSnapshot({ silent: false });
    }
    if (!_pollTimer) {
      _pollTimer = setInterval(() => {
        if (document.hidden || (!document.getElementById('fleetTelematicsDeck') && !document.getElementById('geoMapStudioDeck'))) {
          stopAutoPoll();
          return;
        }
        fetchSnapshot({ silent: false });
      }, POLL_INTERVAL_MS);
    }
  }

  function stopAutoPoll() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAutoPoll();
      else startOrSyncAutoPoll();
    });
  }

  // ==================== UI RENDERERS ====================
  function renderStatusPill(u) {
    const sc = u.status_code || 'parked';
    const spdTxt = sc === 'moving' && u.speed_kph > 0 ? ` · ${Math.round(u.speed_kph)} km/h` : '';
    return `<span class="tel-status-pill is-${esc(sc)}"><span>${esc(u.status_label || 'Parked')}</span>${spdTxt ? `<span data-no-i18n="1">${esc(spdTxt)}</span>` : ''}</span>`;
  }

  function renderReconDrawerHtml(units) {
    if (!UI_STATE.reconOpenDeviceId) return '';
    const unit = (units || []).find(x => x.device_id === UI_STATE.reconOpenDeviceId);
    if (!unit) return '';
    const dStr = UI_STATE.reconDate || todayIso();
    const cacheKey = `${getSeatIdentitySig()}|${unit.device_id}|${dStr}|${dStr}`;
    const hist = _histCache.get(cacheKey) || null;
    if (!hist && !UI_STATE.reconBusy) {
      setTimeout(() => { fetchUnitHistory(unit.device_id, dStr, dStr); }, 10);
    }
    const recon = computeLedgerReconForUnitDate(unit, hist, dStr);
    const briefKey = `${unit.device_id}|${dStr}`;
    const aiBrief = UI_STATE.aiBriefByKey.get(briefKey) || buildDeterministicTelemetryBrief(unit, hist, recon);

    return `
      <div class="tel-recon-drawer" id="telHistoryReconDrawer">
        <div class="tel-recon-top">
          <div>
            <strong>${ic('shield')} <span>Closed-Loop Diesel & Trip Reconciliation</span><span data-no-i18n="1">: ${esc(unit.equipment)} (${esc(unit.plate_no)})</span></strong>
            <span class="tel-sync-meta" style="margin-inline-start:8px" data-no-i18n="1">${esc(unit.vehicle_model)} · ${esc(unit.tracker_model)}</span>
          </div>
          <div class="tel-recon-controls">
            <label for="telReconDateInp" class="sr-only">Reconciliation Date</label>
            <input type="date" id="telReconDateInp" value="${esc(dStr)}" max="${esc(todayIso())}">
            <button type="button" class="tel-mini-btn is-brass" data-tel-refresh-hist="${unit.device_id}">${ic('rotate')} <span>Reconcile Day</span></button>
            <button type="button" class="tel-mini-btn" data-tel-ai-brief="${unit.device_id}">${ic('sparkles')} <span>AI Grade vs Siphon Check</span></button>
            <button type="button" class="tel-mini-btn" data-tel-close-recon="1"><span>Close</span></button>
          </div>
        </div>
        ${hist ? `
          <div class="tel-recon-grid">
            <div class="tel-recon-cell">
              <small>CAN GPS Distance</small>
              <b data-no-i18n="1">${fmtNum(hist.km_gps, 1)} km</b>
              <em>${hist.odo_end_km != null ? `<span data-no-i18n="1">${fmtNum(hist.odo_end_km, 0)} km · </span><span>odometer</span>` : `<span>GPS virtual track</span>`}</em>
            </div>
            <div class="tel-recon-cell">
              <small>CAN ECU Burn (io83)</small>
              <b>${hist.has_ecu_io83 && hist.ecu_burn_l != null ? `<span data-no-i18n="1">${fmtNum(hist.ecu_burn_l, 1)} L</span>` : `<span>No CAN Fuel</span>`}</b>
              <em>${hist.burn_rate_l_km != null ? `<span data-no-i18n="1">${hist.burn_rate_l_km.toFixed(2)} L/km · ${hist.burn_rate_l_100km.toFixed(1)} L/100km</span>` : `<span>Ignition & GPS telemetry</span>`}</em>
            </div>
            <div class="tel-recon-cell">
              <small>ISABI Pump Slips</small>
              <b data-no-i18n="1">${fmtNum(recon.pumpLitres, 1)} L</b>
              <em><span data-no-i18n="1">${fmtNum(recon.pumpTicketsCount)} </span><span>fuel tickets posted</span></em>
            </div>
            <div class="tel-recon-cell">
              <small>Settled Tank Variance</small>
              <b style="color:${recon.tankVarianceL != null && Math.abs(recon.tankVarianceL) > 20 ? 'var(--warn)' : 'var(--good)'}">${recon.tankVarianceL != null ? `<span data-no-i18n="1">${recon.tankVarianceL >= 0 ? '+' : ''}${fmtNum(recon.tankVarianceL, 1)} L</span>` : `<span>Settling</span>`}</b>
              <em>${hist.opening_settled_l != null && hist.closing_settled_l != null ? `<span>Open</span><span data-no-i18n="1">: ${fmtNum(hist.opening_settled_l, 0)} L · </span><span>Close</span><span data-no-i18n="1">: ${fmtNum(hist.closing_settled_l, 0)} L</span>` : `<span>Awaiting stationary window</span>`}</em>
            </div>
            <div class="tel-recon-cell">
              <small>Trips & Siphon Guard</small>
              <b style="color:${(hist.siphon_alerts && hist.siphon_alerts.length) ? 'var(--crit)' : 'var(--good)'}"><span data-no-i18n="1">${fmtNum(recon.totalBilledTrips)} </span><span>Tickets</span></b>
              <em>${(hist.siphon_alerts && hist.siphon_alerts.length) ? `<span data-no-i18n="1">${hist.siphon_alerts.length} </span><span>Parked Drop Alert</span>` : `<span data-no-i18n="1">0 </span><span>parked drops</span><span data-no-i18n="1"> · ${fmtNum(recon.quarryOrSiteStops)} </span><span>site stops</span>`}</em>
            </div>
          </div>
          <div class="tel-ai-brief">${ic('brain_radar')} <b><span>Telemetry Audit Note</span>:</b> <span id="telAuditBriefText" data-no-i18n="1">${esc(aiBrief)}</span></div>
        ` : `
          <div style="padding:10px 2px;font-size:12px;color:var(--ink-2)">Loading historical CAN-bus & GPS telemetry...</div>
        `}
      </div>
    `;
  }

  function renderFleetTelematicsDeck() {
    const units = getScopedUnits();
    if (!units.length) {
      return '';
    }
    setTimeout(startOrSyncAutoPoll, 30);

    const s = summarizeUnits(units);
    const powerCutUnit = units.find(u => u.status_code === 'power_cut');
    const milestoneUnit = units.find(u => Boolean(u.milestone_alert));
    const canFuelCreate = _ctx && typeof _ctx.canEnterForm === 'function' ? _ctx.canEnterForm('fuel') : false;
    const syncTimeRaw = _snapStore.fetchedAt ? String(_snapStore.fetchedAt).slice(11, 19) + ' UTC' : '';

    return `
      <section class="tel-deck" id="fleetTelematicsDeck" aria-label="Live Fleet GPS & CAN-Bus Sensor Telematics">
        <div class="tel-deck-head">
          <div class="tel-deck-title-wrap">
            <span class="tel-deck-icon">${ic('truck')}</span>
            <span class="tel-deck-title"><span class="tel-live-dot${s.powerCut > 0 ? ' is-warn' : ''}"></span><span>Live Fleet GPS & CAN-Bus Sensor Telematics</span></span>
            <span class="badge badge-brass"><span data-no-i18n="1">${fmtNum(s.total)} </span><span>Tracked Trucks</span></span>
            <span class="badge badge-ok">CAN io83 Fuel (0.1 L)</span>
            ${_snapStore.demo ? `<span class="badge badge-info">Demo Telemetry</span>` : ''}
          </div>
          <div class="tel-deck-actions">
            <span class="tel-sync-meta"><span>Synced</span>: ${syncTimeRaw ? `<span data-no-i18n="1">${esc(syncTimeRaw)}</span>` : `<span>Live</span>`}</span>
            <button type="button" class="tel-mini-btn" id="telRefreshNowBtn" data-tel-refresh-snap="1">${ic('rotate')} <span>Refresh GPS</span></button>
            <button type="button" class="tel-mini-btn is-brass" data-tel-open-map-all="1">${ic('pin')} <span>Live Fleet Map</span></button>
            <button type="button" class="tel-mini-btn" data-tel-toggle-collapse="1"><span>${UI_STATE.collapsed ? 'Expand' : 'Collapse'}</span></button>
          </div>
        </div>
        ${!UI_STATE.collapsed ? `
          <div class="tel-kpi-strip">
            <div class="tel-kpi-box">
              <div class="tel-kpi-lbl">Live Dispatch State</div>
              <div class="tel-kpi-val"><span data-no-i18n="1">${fmtNum(s.moving)} </span><span>Moving</span><span data-no-i18n="1"> · ${fmtNum(s.parked + s.idling)} </span><span>Yard / Site</span></div>
              <div class="tel-kpi-sub"><span data-no-i18n="1">${fmtNum(s.idling)} </span><span>idling</span><span data-no-i18n="1"> · ${fmtNum(s.parked)} </span><span>parked ignition off</span></div>
            </div>
            <div class="tel-kpi-box">
              <div class="tel-kpi-lbl">Onboard Truck Tanks</div>
              <div class="tel-kpi-val" data-no-i18n="1">${fmtNum(s.tankTotalL, 0)} L</div>
              <div class="tel-kpi-sub"><span data-no-i18n="1">${fmtNum(s.tankCnt)} </span><span>CAN fuel sensors</span><span data-no-i18n="1"> · </span><span>settled io89</span></div>
            </div>
            <div class="tel-kpi-box${s.powerCut > 0 ? ' is-alert' : ''}">
              <div class="tel-kpi-lbl">24V Power & Tamper Guard</div>
              <div class="tel-kpi-val">${s.powerCut > 0 ? `<span data-no-i18n="1">${fmtNum(s.powerCut)} </span><span>Power Cut (0V)</span>` : `<span>All 24V Nominal</span>`}</div>
              <div class="tel-kpi-sub">${powerCutUnit ? `<span data-no-i18n="1">${esc(powerCutUnit.equipment)} (${esc(powerCutUnit.plate_no)}) · </span><span>${esc(powerCutUnit.zone_name || 'Unknown')}</span>` : `<span>Continuous 24V chassis feed verified</span>`}</div>
            </div>
            <div class="tel-kpi-box${milestoneUnit ? ' is-warn' : ''}">
              <div class="tel-kpi-lbl">CAN Overhaul & Service Radar</div>
              <div class="tel-kpi-val">${milestoneUnit ? `<span data-no-i18n="1">${esc(milestoneUnit.equipment)} · ${fmtNum(milestoneUnit.odometer_km, 0)} km</span>` : `<span>All Within Interval</span>`}</div>
              <div class="tel-kpi-sub">${milestoneUnit ? `<span>${esc(milestoneUnit.milestone_alert)}</span>` : `<span>Live CAN io87 mileage & engine hours synced</span>`}</div>
            </div>
          </div>

          ${renderReconDrawerHtml(units)}
          ${renderDwellDriftStripHtml()}

          <div class="table-wrap" style="padding:0 15px 12px">
            <table class="ledger-table" id="fleetTelematicsTable">
              <thead>
                <tr>
                  <th>Unit & Plate</th>
                  <th>Driver</th>
                  <th>Live Status</th>
                  <th>Zone / Site</th>
                  <th class="r">CAN Mileage</th>
                  <th class="r">Engine Hrs</th>
                  <th class="r">Tank Level</th>
                  <th class="r">ECU Fuel Counter</th>
                  <th class="r">24V Power</th>
                  <th>Telematics Actions</th>
                </tr>
              </thead>
              <tbody>
                ${units.map(u => {
                  const pct = u.tank_pct != null ? Math.min(100, Math.max(3, Math.round(u.tank_pct))) : 0;
                  const lowTank = u.tank_litres != null && u.tank_litres < 75;
                  const pwrLow = u.ext_power_v != null && u.ext_power_v <= 1.0;
                  const isDemoDrv = /^Demo Driver \d+$/.test(String(u.driver || ''));
                  return `
                    <tr data-tel-unit-row="${u.device_id}">
                      <td class="mono" data-no-i18n="1"><strong>${esc(u.equipment)}</strong> <span style="color:var(--ink-2)">(${esc(u.plate_no)})</span>${u.milestone_alert ? ` <span class="badge badge-warn">500k km</span>` : ''}</td>
                      <td${isDemoDrv ? '' : ' data-no-i18n="1"'}>${esc(u.driver || '-')}</td>
                      <td>${renderStatusPill(u)}</td>
                      <td>${u.isabi_region ? `<span>${esc(u.isabi_region)}</span><span data-no-i18n="1"> · </span><span>${esc(u.zone_name || 'Unknown')}</span>` : `<span>${esc(u.zone_name || 'Unknown')}</span>`}</td>
                      <td class="r mono" data-no-i18n="1">${u.odometer_km != null ? `${fmtNum(u.odometer_km, 0)} km` : '-'}</td>
                      <td class="r mono" data-no-i18n="1">${u.engine_hours != null ? `${fmtNum(u.engine_hours, 1)} h` : '-'}</td>
                      <td class="r mono" data-no-i18n="1">${u.tank_litres != null ? `<span class="tel-tank-bar-wrap"><b>${fmtNum(u.tank_litres, 0)} L</b><span class="tel-tank-bar${lowTank ? ' is-low' : ''}"><i style="width:${pct}%"></i></span></span>` : '-'}</td>
                      <td class="r mono" data-no-i18n="1">${u.ecu_fuel_total_l != null ? `${fmtNum(u.ecu_fuel_total_l, 1)} L` : `<span style="color:var(--ink-2)">${esc(u.tracker_model)}</span>`}</td>
                      <td class="r mono" data-no-i18n="1"><span style="color:${pwrLow ? 'var(--crit);font-weight:700' : 'var(--ink-2)'}">${u.ext_power_v != null ? `${u.ext_power_v.toFixed(1)} V` : '-'}</span></td>
                      <td>
                        <div class="tel-row-actions">
                          <button type="button" class="tel-mini-btn is-brass" data-tel-open-recon="${u.device_id}">${ic('shield')} <span>Recon</span></button>
                          <button type="button" class="tel-mini-btn" data-tel-jump-map="${u.device_id}">${ic('pin')} <span>Map</span></button>
                          ${canFuelCreate ? `<button type="button" class="tel-mini-btn" data-tel-open-fuel="${esc(u.equipment)}"><span data-no-i18n="1">+ </span><span>Fuel</span></button>` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </section>
    `;
  }

  // Cross-Industry Connected Asset & Sensor Strips (`Hard Rule #13`)
  function renderCrossIndustryStrip(industryViewKey) {
    ensureSeatScopeFresh();
    const allAccessibleUnits = getScopedUnits('all');
    const s = summarizeUnits(allAccessibleUnits);

    const configs = {
      trd_trucks: {
        icon: 'trd_trucks',
        title: 'Connected VIN & Shacman CAN-Bus Telematics Bridge',
        desc: 'Teltonika FMC150 CAN-bus link tracks io87 chassis mileage, io83 cumulative Weichai ECU fuel injection (0.1 L), coolant io115, and 500,000 km warranty milestones.',
        chipsHtml: [
          '<span>Protocol: FMC150 J1939 CAN</span>',
          '<span>ECU Fuel: io83 (0.1 L)</span>',
          '<span>Warranty Trigger: io87 Odometer</span>'
        ]
      },
      hsp_energy: {
        icon: 'hsp_energy',
        title: 'Resort Generator Tank & Run-Hour Sensor Bridge',
        desc: 'Pairs stationary settled diesel tank sensors (io89 siphon guard while ACC Off) and engine worktime (io103) directly against R4 generator L/hr burn thresholds.',
        chipsHtml: [
          '<span>Siphon Guard: Settled ACC-Off</span>',
          '<span>Run Hours: CAN io103 Sync</span>',
          '<span>R4 Threshold: +15% L/hr</span>'
        ]
      },
      re_workorders: {
        icon: 're_workorders',
        title: 'Building Generator Reserve & MEP Van GPS Dispatch',
        desc: 'Verifies field service van arrival timestamps at managed properties and common-area generator diesel tank refills prior to posting tenant utility recharges.',
        chipsHtml: [
          '<span>Geofence Proof: Arrival Timestamp</span>',
          '<span>Common Diesel: Settled Tank L</span>',
          '<span>Recharge Audit: 100% Verified</span>'
        ]
      },
      ins_claims: {
        icon: 'ins_claims',
        title: 'Motor FNOL Telemetry & Incident GPS Playback',
        desc: 'Attaches verified GPS coordinates, pre-incident speed (km/h), 24V battery cut events, and route playback to commercial fleet Motor First Notice of Loss files.',
        chipsHtml: [
          '<span>FNOL Proof: Speed & Lat/Lng</span>',
          '<span>Tamper Check: 24V Power Log</span>',
          '<span>Surveyor Pack: Route Track</span>'
        ]
      },
      hld_consolidation: {
        icon: 'hld_consolidation',
        title: 'Group Connected Fleet & Sensor Telemetry Rollup',
        desc: 'Unified server-side telematics bridge across subsidiary fleets, resort generators, and insured motor assets ($0 per-seat telemetry software fees).',
        chipsHtml: s.total > 0
          ? [
              `<span data-no-i18n="1">${fmtNum(s.total)} </span><span>Connected Units</span>`,
              `<span data-no-i18n="1">${fmtNum(s.tankTotalL, 0)} L · </span><span>Onboard Diesel</span>`,
              s.powerCut > 0 ? `<span data-no-i18n="1">${s.powerCut} </span><span>0V Alert</span>` : '<span>All 24V Nominal</span>'
            ]
          : ['<span>Zero Browser Secrets</span>', '<span>BU Row-Level Security</span>']
      }
    };

    const cfg = configs[industryViewKey];
    if (!cfg) return '';
    const dwellDigest = computeGpsDwellDriftDigest({ industry: _indStripToCanon(industryViewKey) });
    const dwellChip = dwellDigest.alertCount > 0
      ? `<span class="tel-ind-chip is-dwell"><span data-no-i18n="1">${fmtNum(dwellDigest.alertCount, 0)} </span><span>Dwell Drift</span></span>`
      : `<span class="tel-ind-chip"><span>Pins Aligned (0 Drift)</span></span>`;

    const indByView = {
      trd_trucks: 'Automotive & Heavy Trading',
      hsp_energy: 'Hospitality & Resorts',
      re_workorders: 'Real Estate & Property',
      ins_claims: 'Insurance & Brokerage',
      hld_consolidation: 'Holding & Treasury'
    };
    const targetInd = indByView[industryViewKey] || '';
    const vrMap = (typeof window !== 'undefined' && window.MFG_GEO && typeof window.MFG_GEO.exportGeoConfig === 'function')
      ? (window.MFG_GEO.exportGeoConfig().verifiedRoutes || {})
      : {};
    const activeScope = getActiveCompanyScope();
    const scLow = String(activeScope || '').trim().toLowerCase();
    const isSingleEntityScope = Boolean(
      scLow
      && scLow !== 'all'
      && scLow !== 'manufacturing-group'
      && scLow !== 'bdeirholding'
      && scLow !== 'bdeir-holding'
      && scLow !== 'bdeir holding'
      && scLow !== 'democompany'
      && !scLow.startsWith('industry:')
    );
    const nrmSite = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const siteMatchesTargetInd = site => {
      if (!site) return false;
      const si = String(site._industry || '').trim();
      if (!targetInd || targetInd === 'Manufacturing') {
        return !site._multiIndustrySeed && (!si || si === 'Manufacturing');
      }
      if (targetInd === 'Holding & Treasury') {
        return si === 'Holding & Treasury' || si === 'Holding & Group Treasury';
      }
      return si === targetInd;
    };
    const isInactiveSite = site => Boolean(site && (site.voided || site.removed || site.active === false || /^(?:closed|inactive)$/i.test(String(site.status || '').trim())));
    const siteCoMap = new Map();
    const allSiteCoMap = new Map();
    const blockedSiteNames = new Set();
    const allBlockedSiteNames = new Set();
    const activeSiteNames = new Set();
    const otherIndSiteNames = new Set();
    const resolveSiteIndNorm = site => {
      if (!site) return '';
      if (!site._multiIndustrySeed && (!site._industry || String(site._industry).trim() === 'Manufacturing')) return 'Manufacturing';
      const si = String(site._industry || '').trim();
      return /^holding\s*&\s*(?:group\s+)?treasury$/i.test(si) ? 'Holding & Treasury' : si;
    };
    const normTargetInd = /^holding\s*&\s*(?:group\s+)?treasury$/i.test(String(targetInd || '')) ? 'Holding & Treasury' : String(targetInd || '');
    try {
      const seedObj = (_ctx && typeof _ctx.getSeed === 'function' ? _ctx.getSeed() : window.MFG_SEED) || {};
      const stObj = (_ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : null) || {};
      const seedSites = (seedObj.records && Array.isArray(seedObj.records.sites)) ? seedObj.records.sites : [];
      const custSites = (stObj.customRecords && Array.isArray(stObj.customRecords.sites)) ? stObj.customRecords.sites : [];
      const activeByIndName = new Map();
      const activeCustByIndName = new Map();
      const shadowedIds = new Set();
      custSites.forEach(site => {
        if (!site) return;
        const sInd = resolveSiteIndNorm(site);
        if (site.id) shadowedIds.add(String(site.id));
        if (site.override_id) shadowedIds.add(String(site.override_id));
        if (!site.name) return;
        const nk = nrmSite(site.name);
        if (!isInactiveSite(site)) {
          if (!activeByIndName.has(sInd)) activeByIndName.set(sInd, new Set());
          activeByIndName.get(sInd).add(nk);
          if (!activeCustByIndName.has(sInd)) activeCustByIndName.set(sInd, new Set());
          activeCustByIndName.get(sInd).add(nk);
          if (!normTargetInd || sInd === normTargetInd) activeSiteNames.add(nk);
          else otherIndSiteNames.add(nk);
        }
      });
      seedSites.forEach(site => {
        if (!site || !site.name) return;
        const sInd = resolveSiteIndNorm(site);
        const nk = nrmSite(site.name);
        const isTarget = !normTargetInd || sInd === normTargetInd;
        if (site.id && shadowedIds.has(String(site.id))) {
          const actSet = activeByIndName.get(sInd);
          if (!actSet || !actSet.has(nk)) {
            allBlockedSiteNames.add(nk);
            if (isTarget) blockedSiteNames.add(nk);
          }
          return;
        }
        if (!isInactiveSite(site)) {
          if (!activeByIndName.has(sInd)) activeByIndName.set(sInd, new Set());
          activeByIndName.get(sInd).add(nk);
          if (isTarget) activeSiteNames.add(nk);
          else otherIndSiteNames.add(nk);
        }
      });
      custSites.concat(seedSites).forEach((site, idx) => {
        if (!site || !site.name || !isInactiveSite(site)) return;
        const isSeed = idx >= custSites.length;
        if (isSeed && site.id && shadowedIds.has(String(site.id))) return;
        const sInd = resolveSiteIndNorm(site);
        const nk = nrmSite(site.name);
        const actSet = activeByIndName.get(sInd);
        if (!actSet || !actSet.has(nk)) {
          allBlockedSiteNames.add(nk);
          if (!normTargetInd || sInd === normTargetInd) blockedSiteNames.add(nk);
        }
      });
      const addCoEntry = (site, isSeed) => {
        if (!site || isInactiveSite(site) || !site.name || !site.company) return;
        if (isSeed && site.id && shadowedIds.has(String(site.id))) return;
        const sInd = resolveSiteIndNorm(site);
        const nk = nrmSite(site.name);
        if (isSeed) {
          const csSet = activeCustByIndName.get(sInd);
          if (csSet && csSet.has(nk)) return;
        }
        const co = String(site.company).trim();
        if (!allSiteCoMap.has(nk)) allSiteCoMap.set(nk, new Set());
        allSiteCoMap.get(nk).add(co);
        if (!normTargetInd || sInd === normTargetInd) {
          if (!siteCoMap.has(nk)) siteCoMap.set(nk, new Set());
          siteCoMap.get(nk).add(co);
        }
      };
      custSites.forEach(s => addCoEntry(s, false));
      seedSites.forEach(s => addCoEntry(s, true));
    } catch (_) {}

    let vrCnt = 0;
    let steepCnt = 0;
    const pfxLower = targetInd ? `${targetInd.toLowerCase()}::` : '';
    Object.entries(vrMap).forEach(([rk, vr]) => {
      if (!vr || !(Number(vr.km) > 0)) return;
      const kl = String(rk || '').toLowerCase();
      const isHoldingAlias = targetInd === 'Holding & Treasury' && (kl.startsWith('holding & group treasury::') || kl.startsWith('holding & treasury::'));
      const matchInd = isHoldingAlias || Boolean(pfxLower && kl.startsWith(pfxLower));
      if (!matchInd) return;
      const bodyPart = kl.includes('::') ? kl.slice(kl.indexOf('::') + 2) : kl;
      const buCos = [];
      const explicitBuCos = [];
      const siteCos = [];
      const allSiteCos = [];
      const routeSiteNames = [];
      let hasBlockedSite = false;
      if (vr.company) buCos.push(String(vr.company).trim());
      bodyPart.split('||').forEach(seg => {
        const t = seg.trim();
        if (t.startsWith('bu:')) {
          const coName = t.slice(3).trim();
          if (coName) {
            buCos.push(coName);
            explicitBuCos.push(coName);
          }
        } else if (t.startsWith('site:')) {
          const sn = nrmSite(t.slice(5));
          if (sn) {
            routeSiteNames.push(sn);
            if (blockedSiteNames.has(sn) || (!activeSiteNames.has(sn) && (allBlockedSiteNames.has(sn) || otherIndSiteNames.has(sn)))) {
              hasBlockedSite = true;
            }
            const matchedSet = siteCoMap.get(sn);
            if (matchedSet) matchedSet.forEach(c => siteCos.push(c));
            if (!normTargetInd && !(matchedSet && matchedSet.size)) {
              const allSet = allSiteCoMap.get(sn);
              if (allSet) allSet.forEach(c => allSiteCos.push(c));
            }
          }
        }
      });
      if (hasBlockedSite) return;
      if (!explicitBuCos.length && routeSiteNames.some(sn => !activeSiteNames.has(sn))) return;
      if (!buCos.length && !siteCos.length) return;
      if (buCos.some(c => !canSeatAccessCompany(c))) return;
      if (siteCos.some(c => !canSeatAccessCompany(c)) || allSiteCos.some(c => !canSeatAccessCompany(c))) return;
      if (isSingleEntityScope) {
        const scopeCos = buCos.concat(siteCos).concat(allSiteCos);
        if (!scopeCos.length || scopeCos.some(c => !companyMatchesScope(c, activeScope))) return;
      }
      vrCnt += 1;
      if (vr.elevAvailable && (Number(vr.maxGradePct || 0) >= 5 || Number(vr.elevGainM || 0) >= 150)) {
        steepCnt += 1;
      }
    });
    const terrainChip = vrCnt > 0
      ? `<span data-no-i18n="1">${fmtNum(vrCnt)} </span><span>Verified Corridors</span>${steepCnt > 0 ? ` (<span data-no-i18n="1">${fmtNum(steepCnt)}</span> <span>Grade &ge;5%</span>)` : ''}`
      : '<span>Grade-Adjusted Route Burn</span>';
    const chipsOut = cfg.chipsHtml.concat([terrainChip]);

    return `
      <div class="tel-ind-strip" data-tel-ind-strip="${esc(industryViewKey)}">
        <div class="tel-ind-strip-main">
          <span class="tel-deck-icon">${ic(cfg.icon)}</span>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:800;color:var(--ink)">${esc(cfg.title)}</div>
            <div style="font-size:11.5px;color:var(--ink-2);line-height:1.35">${esc(cfg.desc)}</div>
          </div>
        </div>
        <div class="tel-ind-strip-metrics">
          ${chipsOut.map(c => `<span class="tel-ind-chip">${c}</span>`).join('')}
          ${dwellChip}
        </div>
      </div>
    `;
  }

  // ==================== LEAFLET MAP STUDIO LIVE TRUCK OVERLAY ====================
  function makeTruckDivIcon(L, unit) {
    const sc = unit.status_code || 'parked';
    const bg = sc === 'moving' ? '#059669' : (sc === 'idling' ? '#D97706' : (sc === 'power_cut' || sc === 'offline' ? '#DC2626' : '#2563EB'));
    const lbl = esc(unit.equipment);
    const spd = sc === 'moving' && unit.speed_kph > 0 ? ` ${Math.round(unit.speed_kph)}kph` : (sc === 'power_cut' ? ' 0V' : '');
    const html = `
      <div style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:${bg};color:#FFFFFF;font-size:10.5px;font-weight:800;font-family:var(--font-mono,monospace);box-shadow:0 2px 6px rgba(0,0,0,0.28);border:1.5px solid #FFFFFF;white-space:nowrap">
        <span>${lbl}${esc(spd)}</span>
      </div>
    `;
    return L.divIcon({
      className: 'tel-leaflet-truck-icon',
      html,
      iconSize: null,
      iconAnchor: [24, 12]
    });
  }

  function renderLeafletTruckMarkers(L, layerGroup) {
    if (!L || !layerGroup) return 0;
    const units = getScopedUnits();
    let count = 0;
    units.forEach(u => {
      if (u.lat == null || u.lng == null || !Number.isFinite(Number(u.lat)) || !Number.isFinite(Number(u.lng))) return;
      count++;
      const marker = L.marker([Number(u.lat), Number(u.lng)], {
        icon: makeTruckDivIcon(L, u),
        zIndexOffset: 950
      }).addTo(layerGroup);

      const zoneTxt = u.isabi_region ? `${u.isabi_region} (${tr(u.zone_name)})` : tr(u.zone_name || 'Unknown');
      marker.bindPopup(`
        <div style="min-width:205px;font-family:inherit;font-size:12px;line-height:1.45">
          <div style="font-weight:800;font-size:13px">${esc(u.equipment)} · ${esc(u.plate_no)}</div>
          <div style="color:#64748B">${esc(u.driver || '-')} · <b>${esc(tr(u.status_label))}</b>${u.speed_kph > 0 ? ` (${Math.round(u.speed_kph)} km/h)` : ''}</div>
          <div>${esc(tr('Zone / Site'))}: <b>${esc(zoneTxt)}</b></div>
          ${u.odometer_km != null ? `<div>${esc(tr('CAN Mileage'))}: <b>${fmtNum(u.odometer_km, 0)} km</b></div>` : ''}
          ${u.tank_litres != null ? `<div>${esc(tr('Tank Level'))}: <b>${fmtNum(u.tank_litres, 0)} L</b> (${u.tank_pct != null ? u.tank_pct + '%' : '-'})</div>` : ''}
          ${u.ext_power_v != null ? `<div>${esc(tr('24V Power'))}: <b style="color:${u.ext_power_v <= 1 ? '#DC2626' : 'inherit'}">${u.ext_power_v.toFixed(1)} V</b></div>` : ''}
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">
            <button type="button" class="geo-mini-btn primary" data-popup-tel-recon="${u.device_id}">${esc(tr('Diesel & Trip Recon'))}</button>
          </div>
        </div>
      `);
    });
    return count;
  }

  // ==================== ASK ISABI GROUNDING ====================
  function buildAskContextSummary(explicitScope) {
    const units = getScopedUnits(explicitScope);
    if (!units.length) return '';
    const s = summarizeUnits(units);
    const lines = units.map(u =>
      `${u.equipment}(${u.plate_no}): ${u.status_label}${u.speed_kph > 0 ? ' ' + u.speed_kph + 'km/h' : ''} at ${u.isabi_region || u.zone_name}, odo=${u.odometer_km != null ? Math.round(u.odometer_km) + 'km' : 'n/a'}, tank=${u.tank_litres != null ? u.tank_litres + 'L' : 'n/a'}, io83=${u.ecu_fuel_total_l != null ? u.ecu_fuel_total_l + 'L' : 'n/a'}, pwr=${u.ext_power_v != null ? u.ext_power_v + 'V' : 'n/a'}`
    );
    return `LIVE FLEET GPS & CAN SENSORS (${s.total} trucks, ${s.moving} moving, ${s.powerCut} 0V power-cut, ${s.tankTotalL}L onboard diesel): ` + lines.join(' | ');
  }

  function tryAnswerTelematicsQuestion(qRaw, explicitScope) {
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) return null;
    const isTelQuery = /\b(gps|telematics|where\s+are\s+(?:the\s+|our\s+)?trucks|where\s+is\s+(?:tb\d*|309570|hino)|truck\s+locations?|live\s+trucks?|can[- ]bus|io83|power\s+cut|0v|onboard\s+diesel)\b|وين الشاحنات|موقع الشاحنات|تتبع|où sont les camions/i.test(q);
    if (!isTelQuery) return null;
    const allScoped = getScopedUnits(explicitScope);
    if (!allScoped.length) {
      return {
        matched: true,
        units: [],
        text: tr('No live GPS-tracked trucks are assigned to the current Business Unit scope.')
      };
    }
    const singleMatch = q.match(/\b(tb\d+|309570|hino)\b/i);
    const targetToken = singleMatch ? singleMatch[1] : '';
    const matchedSingle = targetToken ? allScoped.filter(u => unitMatchesRecordEquip(u, targetToken)) : [];
    const units = matchedSingle.length ? matchedSingle : allScoped;
    const s = summarizeUnits(units);
    const rows = units.map(u => `- **${u.equipment} (${u.plate_no})**: ${tr(u.status_label)}${u.speed_kph > 0 ? ` (${Math.round(u.speed_kph)} km/h)` : ''} · ${u.isabi_region || tr(u.zone_name)} · ${u.odometer_km != null ? fmtNum(u.odometer_km, 0) + ' km' : '-'} · ${u.tank_litres != null ? fmtNum(u.tank_litres, 0) + ' L' : '-'} · ${u.ext_power_v != null ? u.ext_power_v.toFixed(1) + ' V' : '-'}`).join('\n');
    return {
      matched: true,
      units,
      text: `**${tr('Live Fleet GPS & CAN-Bus Sensor Telematics')}** (${s.total} ${tr('Tracked Trucks')}, ${fmtNum(s.tankTotalL, 0)} L ${tr('Onboard Truck Tanks')}${s.powerCut > 0 ? `, ${s.powerCut} ${tr('Power Cut (0V)')}` : ''}):\n${rows}`
    };
  }

  // ==================== DOM EVENT DELEGATION ====================
  function wireDomEventsOnce() {
    if (typeof document === 'undefined' || document.documentElement._telDelegated) return;
    document.documentElement._telDelegated = true;

    document.addEventListener('click', ev => {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;

      const btnRefresh = t.closest('[data-tel-refresh-snap]');
      if (btnRefresh) {
        ev.preventDefault();
        fetchSnapshot({ force: true, silent: false });
        return;
      }

      const btnCollapse = t.closest('[data-tel-toggle-collapse]');
      if (btnCollapse) {
        ev.preventDefault();
        UI_STATE.collapsed = !UI_STATE.collapsed;
        saveUiPref();
        if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
        return;
      }

      const btnOpenRecon = t.closest('[data-tel-open-recon]');
      if (btnOpenRecon) {
        ev.preventDefault();
        const devId = Number(btnOpenRecon.getAttribute('data-tel-open-recon') || 0);
        if (!devId) return;
        UI_STATE.reconOpenDeviceId = UI_STATE.reconOpenDeviceId === devId ? 0 : devId;
        if (!UI_STATE.reconDate) UI_STATE.reconDate = todayIso();
        if (UI_STATE.reconOpenDeviceId) {
          fetchUnitHistory(devId, UI_STATE.reconDate, UI_STATE.reconDate);
        }
        if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
        return;
      }

      const btnPopupRecon = t.closest('[data-popup-tel-recon]');
      if (btnPopupRecon) {
        ev.preventDefault();
        const devId = Number(btnPopupRecon.getAttribute('data-popup-tel-recon') || 0);
        if (devId && _ctx && typeof _ctx.jumpView === 'function') {
          UI_STATE.collapsed = false;
          UI_STATE.reconOpenDeviceId = devId;
          if (!UI_STATE.reconDate) UI_STATE.reconDate = todayIso();
          fetchUnitHistory(devId, UI_STATE.reconDate, UI_STATE.reconDate);
          _ctx.jumpView('fleet');
        }
        return;
      }

      const btnCloseRecon = t.closest('[data-tel-close-recon]');
      if (btnCloseRecon) {
        ev.preventDefault();
        UI_STATE.reconOpenDeviceId = 0;
        if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
        return;
      }

      const btnRefreshHist = t.closest('[data-tel-refresh-hist]');
      if (btnRefreshHist) {
        ev.preventDefault();
        const devId = Number(btnRefreshHist.getAttribute('data-tel-refresh-hist') || 0);
        const inp = document.getElementById('telReconDateInp');
        if (inp && inp.value) UI_STATE.reconDate = inp.value;
        const dStr = UI_STATE.reconDate || todayIso();
        _histCache.delete(`${getSeatIdentitySig()}|${devId}|${dStr}|${dStr}`);
        fetchUnitHistory(devId, dStr, dStr);
        if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
        return;
      }

      const btnAiBrief = t.closest('[data-tel-ai-brief]');
      if (btnAiBrief) {
        ev.preventDefault();
        const devId = Number(btnAiBrief.getAttribute('data-tel-ai-brief') || 0);
        const unit = getScopedUnits('all').find(x => x.device_id === devId);
        if (!unit || UI_STATE.aiBusy) return;
        const dStr = UI_STATE.reconDate || todayIso();
        const hist = _histCache.get(`${getSeatIdentitySig()}|${devId}|${dStr}|${dStr}`) || null;
        const recon = computeLedgerReconForUnitDate(unit, hist, dStr);
        const detNote = buildDeterministicTelemetryBrief(unit, hist, recon);
        const bKey = `${devId}|${dStr}`;
        UI_STATE.aiBriefByKey.set(bKey, detNote);
        if (window.MFG_AI_EDGE && typeof window.MFG_AI_EDGE.explainTelematicsRecon === 'function') {
          const reqSig = getSeatIdentitySig();
          UI_STATE.aiBusy = true;
          window.MFG_AI_EDGE.explainTelematicsRecon({ unit, hist, recon, fallback: detNote }).then(note => {
            if (reqSig !== getSeatIdentitySig()) return;
            UI_STATE.aiBusy = false;
            if (note) {
              UI_STATE.aiBriefByKey.set(bKey, note);
              if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
            }
          }).catch(() => {
            if (reqSig === getSeatIdentitySig()) UI_STATE.aiBusy = false;
          });
        } else if (_ctx && typeof _ctx.rerenderWorkspace === 'function') {
          _ctx.rerenderWorkspace();
        }
        return;
      }

      const btnMapAll = t.closest('[data-tel-open-map-all]');
      if (btnMapAll) {
        ev.preventDefault();
        if (window.MFG_GEO && window.MFG_GEO.STUDIO) {
          window.MFG_GEO.STUDIO.collapsed = false;
          window.MFG_GEO.STUDIO.pinFilter = 'trucks';
          window.MFG_GEO.STUDIO.selectedRegion = '';
          window.MFG_GEO.STUDIO._userPanned = false;
        }
        if (_ctx && typeof _ctx.jumpView === 'function') _ctx.jumpView('reg_sites');
        return;
      }

      const btnJumpMap = t.closest('[data-tel-jump-map]');
      if (btnJumpMap) {
        ev.preventDefault();
        const devId = Number(btnJumpMap.getAttribute('data-tel-jump-map') || 0);
        const unit = getScopedUnits('all').find(x => x.device_id === devId);
        if (window.MFG_GEO && window.MFG_GEO.STUDIO) {
          window.MFG_GEO.STUDIO.collapsed = false;
          window.MFG_GEO.STUDIO.pinFilter = 'trucks';
          window.MFG_GEO.STUDIO.selectedRegion = (unit && unit.isabi_region) ? unit.isabi_region : '';
          window.MFG_GEO.STUDIO._focusTruckLatLng = (unit && unit.lat != null && unit.lng != null) ? [Number(unit.lat), Number(unit.lng)] : null;
          window.MFG_GEO.STUDIO._userPanned = false;
        }
        if (_ctx && typeof _ctx.jumpView === 'function') _ctx.jumpView('reg_sites');
        return;
      }

      const btnOpenFuel = t.closest('[data-tel-open-fuel]');
      if (btnOpenFuel) {
        ev.preventDefault();
        const eq = btnOpenFuel.getAttribute('data-tel-open-fuel') || '';
        if (eq && _ctx && typeof _ctx.openEntryModal === 'function') {
          _ctx.openEntryModal('fuel', { truck: eq, equipment: eq });
        }
        return;
      }

      const btnApplyMeter = t.closest('[data-apply-gps-meter]');
      if (btnApplyMeter) {
        ev.preventDefault();
        const st = _ctx && typeof _ctx.getState === 'function' ? _ctx.getState() : null;
        if (st && st.editingRecord) return; // Never overwrite historical edit-mode tickets!
        const valStr = btnApplyMeter.getAttribute('data-apply-gps-meter') || '';
        const meterInp = document.getElementById('f_meter');
        if (meterInp && !meterInp.readOnly && valStr) {
          meterInp.value = valStr;
          meterInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }

      const btnDwellMap = t.closest('[data-tel-dwell-map]');
      if (btnDwellMap) {
        ev.preventDefault();
        const did = btnDwellMap.getAttribute('data-tel-dwell-map') || '';
        const hit = _lastDwellAlerts.find(x => x.id === did) || computeGpsDwellDriftDigest({}).alerts.find(x => x.id === did);
        if (hit && window.MFG_GEO && typeof window.MFG_GEO.setStudioDwellDriftTarget === 'function') {
          window.MFG_GEO.setStudioDwellDriftTarget(hit);
        } else if (_ctx && typeof _ctx.jumpView === 'function') {
          _ctx.jumpView('reg_sites');
        }
        return;
      }

      const btnDwellQueue = t.closest('[data-tel-dwell-queue]');
      if (btnDwellQueue) {
        ev.preventDefault();
        const did = btnDwellQueue.getAttribute('data-tel-dwell-queue') || '';
        const hit = _lastDwellAlerts.find(x => x.id === did) || computeGpsDwellDriftDigest({}).alerts.find(x => x.id === did);
        if (hit && window.MFG_GEO && typeof window.MFG_GEO.openSuggestGatePinModal === 'function') {
          window.MFG_GEO.openSuggestGatePinModal({
            industry: hit.industry,
            company: hit.company,
            site_id: hit.siteId || '',
            site_name: hit.siteName || '',
            site_category: hit.siteCategory || '',
            existing_lat: hit.pinnedLat,
            existing_lng: hit.pinnedLng,
            suggested_lat: hit.dwellLat,
            suggested_lng: hit.dwellLng,
            access_note: `Observed ${Number(hit.stopCount || 1)} Teltonika stops (${Math.round(Number(hit.totalMin || 0))} min dwell)`
          });
        }
      }
    });

    document.addEventListener('change', ev => {
      const t = ev.target;
      if (t && t.id === 'telReconDateInp' && UI_STATE.reconOpenDeviceId) {
        UI_STATE.reconDate = t.value || todayIso();
        fetchUnitHistory(UI_STATE.reconOpenDeviceId, UI_STATE.reconDate, UI_STATE.reconDate);
      }
    });
    if (typeof window !== 'undefined' && !window._telLangWired) {
      window._telLangWired = true;
      window.addEventListener('mfg:lang-changed', () => {
        if (!UI_STATE.reconOpenDeviceId) return;
        const briefEl = document.getElementById('telAuditBriefText');
        if (!briefEl) return;
        const unit = getScopedUnits('all').find(x => x.device_id === UI_STATE.reconOpenDeviceId);
        if (!unit) return;
        const dStr = UI_STATE.reconDate || todayIso();
        const bKey = `${unit.device_id}|${dStr}`;
        if (UI_STATE.aiBriefByKey.has(bKey)) return;
        const hist = _histCache.get(`${getSeatIdentitySig()}|${unit.device_id}|${dStr}|${dStr}`) || null;
        const recon = computeLedgerReconForUnitDate(unit, hist, dStr);
        briefEl.textContent = buildDeterministicTelemetryBrief(unit, hist, recon);
      });
    }
  }

  function bindContext(ctx) {
    _ctx = ctx || _ctx;
    wireDomEventsOnce();
    ensureSeatScopeFresh();
  }

  function closeReconDrawer() {
    if (!UI_STATE.reconOpenDeviceId) return false;
    UI_STATE.reconOpenDeviceId = 0;
    if (_ctx && typeof _ctx.rerenderWorkspace === 'function') _ctx.rerenderWorkspace();
    return true;
  }

  function clearSessionCache() {
    if (_snapAbort) { try { _snapAbort.abort(); } catch (_) {} _snapAbort = null; }
    if (_histAbort) { try { _histAbort.abort(); } catch (_) {} _histAbort = null; }
    _inflightSnapPromise = null;
    _inflightHistPromise = null;
    stopAutoPoll();
    _snapStore = { scopeBase: '', fetchedAt: '', units: [], geofences: [], demo: false, loading: false, error: '' };
    _histCache.clear();
    UI_STATE.reconOpenDeviceId = 0;
    UI_STATE.reconBusy = false;
    UI_STATE.aiBusy = false;
    UI_STATE.aiBriefByKey.clear();
  }

  window.MFG_TELEMATICS = {
    bindContext,
    closeReconDrawer,
    clearSessionCache,
    fetchSnapshot,
    fetchUnitHistory,
    getScopedUnits,
    summarizeUnits,
    findUnitByEquipment,
    getLiveMeterHintForForm,
    evaluateSettledFuelPhysics,
    computeLedgerReconForUnitDate,
    getCanFuelCalibrationSummary,
    getWatchdogAlertsForSentinels,
    computeGpsDwellDriftDigest,
    renderFleetTelematicsDeck,
    renderCrossIndustryStrip,
    renderLeafletTruckMarkers,
    buildAskContextSummary,
    tryAnswerTelematicsQuestion,
    stopAutoPoll
  };
})();
