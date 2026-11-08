/**
 * ISABI Systems — Server-Side Fleet Telematics & CAN-Bus Sensor Proxy
 * Connects server-to-server to Viewtech / Teltonika GPSWOX (`track.vt-lb.com`)
 * with zero client secret exposure, 20s Edge/D1 cache, strict BU RLS, Demo
 * Sandbox quarantine, and slosh-proof Teltonika FMC150 `<io83>` ECU fuel math.
 */

import {
  canAccessCompany,
  canAccessSentinelScope,
  isOwnerOrFullGroupSession,
  jsonResponse
} from './security.js';

const VT_BASE_URL = 'https://track.vt-lb.com/api';
const SNAPSHOT_TTL_MS = 20000;

export const VT_DEVICE_MAP = {
  19130: {
    device_id: 19130,
    equipment: 'TB1',
    aliases: ['tb1', '360676'],
    plate_no: '360676',
    company: 'WTC',
    driver: 'Majed Karam',
    vehicle_model: 'Shacman X3000',
    tracker_model: 'FMC150',
    tank_cap_l: 400,
    has_can_fuel: true,
    vt_plate_note: 'Pinned by device_id (blank plate in tracker metadata)'
  },
  17733: {
    device_id: 17733,
    equipment: 'TB3',
    aliases: ['tb3', '358599'],
    plate_no: '358599',
    company: 'WTC',
    driver: 'Khalife',
    vehicle_model: 'Shacman X3000',
    tracker_model: 'FMC150',
    tank_cap_l: 400,
    has_can_fuel: true,
    vt_plate_note: 'Pinned by device_id (tracker plate field had 356851)'
  },
  18460: {
    device_id: 18460,
    equipment: 'Tb4',
    aliases: ['tb4', '358943', '358943w'],
    plate_no: '358943',
    company: 'WTC',
    driver: 'Wissam Mlaab',
    vehicle_model: 'Shacman F3000',
    tracker_model: 'FMC150',
    tank_cap_l: 380,
    has_can_fuel: true,
    vt_plate_note: ''
  },
  18595: {
    device_id: 18595,
    equipment: 'Tb7',
    aliases: ['tb7', '364656'],
    plate_no: '364656',
    company: 'WTC',
    driver: 'Mohamad Habib',
    vehicle_model: 'Shacman X3000',
    tracker_model: 'FMC150',
    tank_cap_l: 400,
    has_can_fuel: true,
    vt_plate_note: ''
  },
  18553: {
    device_id: 18553,
    equipment: 'TB8',
    aliases: ['tb8', '354578'],
    plate_no: '354578',
    company: 'WTC',
    driver: 'Hussein Saleh',
    vehicle_model: 'Shacman X3000',
    tracker_model: 'FMC150',
    tank_cap_l: 400,
    has_can_fuel: true,
    vt_plate_note: ''
  },
  18571: {
    device_id: 18571,
    equipment: 'Tb9',
    aliases: ['tb9', '364168'],
    plate_no: '364168',
    company: 'WTC',
    driver: 'Ali Saleh',
    vehicle_model: 'Shacman X3000',
    tracker_model: 'FMC150',
    tank_cap_l: 400,
    has_can_fuel: true,
    vt_plate_note: 'Pinned by device_id (tracker plate field had 360676)'
  },
  18593: {
    device_id: 18593,
    equipment: '309570',
    aliases: ['309570', 'hino', 'hino 309570'],
    plate_no: '309570',
    company: 'WTC',
    driver: 'Hino Service Crew',
    vehicle_model: 'Hino 500',
    tracker_model: 'FMC920',
    tank_cap_l: 200,
    has_can_fuel: false,
    vt_plate_note: 'GPS + Ignition + Virtual Odometer'
  }
};

let _memSnapshotCache = { ts: 0, data: null };
let _memRefreshedHash = '';

function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round5(n) { return Math.round((Number(n) || 0) * 100000) / 100000; }

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pointInPolygon(lat, lng, coords) {
  if (!Array.isArray(coords) || coords.length < 3) return false;
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const yi = Number(coords[i].lat != null ? coords[i].lat : coords[i][1]);
    const xi = Number(coords[i].lng != null ? coords[i].lng : coords[i][0]);
    const yj = Number(coords[j].lat != null ? coords[j].lat : coords[j][1]);
    const xj = Number(coords[j].lng != null ? coords[j].lng : coords[j][0]);
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function parseTraccarXml(xmlStr) {
  const s = String(xmlStr || '');
  if (!s) return {};
  const numTag = tag => {
    const m = s.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'));
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) ? v : null;
  };
  const boolOrNumTag = tag => {
    const m = s.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'));
    if (!m) return null;
    const raw = m[1].trim().toLowerCase();
    if (raw === 'true') return 1;
    if (raw === 'false') return 0;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };

  const io83 = numTag('io83');   // Cumulative CAN injected fuel in 0.1 L
  const io87 = numTag('io87');   // CAN total mileage in meters
  const io89 = numTag('io89');   // CAN fuel level %
  const io103 = numTag('io103'); // CAN engine worktime
  const io85 = numTag('io85');   // Engine RPM
  const io115 = numTag('io115'); // Coolant temperature (0.1 C or C)
  const io82 = numTag('io82');   // Accelerator pedal %
  const di1 = boolOrNumTag('di1');
  const ignition = boolOrNumTag('ignition');
  const rawPower = numTag('power');
  const rawBatt = numTag('battery');
  const totalDistM = numTag('totaldistance');

  const extPowerV = rawPower == null ? null : round2(rawPower > 200 ? rawPower / 1000 : rawPower);
  const backupBattV = rawBatt == null ? null : round2(rawBatt > 100 ? rawBatt / 1000 : rawBatt);
  const coolantC = io115 == null ? null : round1(io115 > 250 ? io115 / 10 : io115);

  return {
    ecu_fuel_raw_01l: io83,
    ecu_fuel_total_l: (io83 != null && io83 > 0) ? round1(io83 / 10) : null,
    can_odometer_km: (io87 != null && io87 > 0) ? round2(io87 / 1000) : null,
    gps_total_km: (totalDistM != null && totalDistM > 0) ? round2(totalDistM / 1000) : null,
    tank_pct: (io89 != null && io89 >= 0 && io89 <= 105) ? round1(io89) : null,
    can_worktime_raw: io103,
    rpm: (io85 != null && io85 >= 0) ? Math.round(io85) : null,
    coolant_c: coolantC,
    pedal_pct: (io82 != null && io82 >= 0) ? round1(io82 > 100 ? io82 / 10 : io82) : null,
    acc_on: di1 != null ? Boolean(di1) : (ignition != null ? Boolean(ignition) : null),
    ext_power_v: extPowerV,
    backup_battery_v: backupBattV
  };
}

function parseNumFromSensorVal(valStr) {
  if (valStr == null || valStr === '-' || valStr === '') return null;
  if (typeof valStr === 'number') return Number.isFinite(valStr) ? valStr : null;
  const m = String(valStr).replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : null;
}

function medianOf(arr) {
  if (!arr || !arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function resolveLandmarkZone(lat, lng, geofences) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Unknown';
  if (Array.isArray(geofences)) {
    for (const gf of geofences) {
      if (gf && Array.isArray(gf.coordinates) && pointInPolygon(lat, lng, gf.coordinates)) {
        const nm = String(gf.name || '').trim();
        return (!nm || nm === 'الموقف') ? 'Choueifat Main Yard' : nm;
      }
    }
  }
  if (haversineKm(lat, lng, 33.8403, 35.4919) <= 0.85) return 'Choueifat Main Yard';
  if (haversineKm(lat, lng, 33.6306, 35.4264) <= 1.8) return 'Sibline Plant & Quarry';
  if (haversineKm(lat, lng, 33.758, 35.475) <= 4.0) return 'Damour Coastal Corridor';
  if (haversineKm(lat, lng, 33.888, 35.495) <= 4.5) return 'Greater Beirut';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function normalizeDevice(item, geofences = [], dbEquipMap = null) {
  const devId = Number(item && item.id);
  const pinned = VT_DEVICE_MAP[devId] || null;
  const rawName = String((item && item.name) || '').trim();
  const devData = (item && item.device_data) || {};
  const traccar = devData.traccar || {};
  const xml = parseTraccarXml(traccar.other || item.other || '');

  let equipment = pinned ? pinned.equipment : '';
  let plateNo = pinned ? pinned.plate_no : '';
  let company = pinned ? pinned.company : 'WTC';
  let driver = pinned ? pinned.driver : '';
  let tankCapL = pinned ? pinned.tank_cap_l : 400;
  let trackerModel = pinned ? pinned.tracker_model : String(traccar.protocol || 'GPS').toUpperCase();
  let vehicleModel = pinned ? pinned.vehicle_model : 'Heavy Truck';

  if (!pinned) {
    const namePlateMatch = rawName.match(/\b(\d{5,7})\b/);
    const candPlate = (namePlateMatch && namePlateMatch[1]) || String(devData.plate_number || '').replace(/\D+/g, '');
    plateNo = candPlate || String(devData.plate_number || '').trim();
    if (dbEquipMap && candPlate && dbEquipMap.has(candPlate)) {
      const eq = dbEquipMap.get(candPlate);
      equipment = eq.name || candPlate;
      company = eq.company || 'WTC';
      driver = eq.driver || '';
    } else {
      equipment = candPlate || rawName || `GPS-${devId}`;
    }
  }

  const sensors = Array.isArray(item && item.sensors) ? item.sensors : [];
  let senOdoKm = null;
  let senHours = null;
  let senFuelL = null;
  let senRpm = null;
  let senTempC = null;
  let senAcc = null;
  let senGsmPct = null;
  let senSats = null;

  for (const s of sensors) {
    if (!s) continue;
    const tp = String(s.type || '').toLowerCase();
    const nm = String(s.name || '').toLowerCase();
    const vNum = parseNumFromSensorVal(s.val != null ? s.val : s.value);
    if (tp === 'odometer' || nm.includes('mileage')) {
      if (vNum != null && vNum > 0) senOdoKm = round2(vNum);
    } else if (tp === 'engine_hours' || nm.includes('engine hours')) {
      if (vNum != null && vNum >= 0) senHours = round2(vNum);
    } else if (tp === 'fuel_tank' || nm.includes('fuel level')) {
      if (vNum != null && vNum >= 0) senFuelL = round1(vNum);
    } else if (tp === 'tachometer' || nm === 'rpm') {
      if (vNum != null && vNum >= 0) senRpm = Math.round(vNum);
    } else if (tp === 'temperature' || nm.includes('temp')) {
      if (vNum != null && vNum > -40 && vNum < 200) senTempC = round1(vNum);
    } else if (tp === 'acc' || nm === 'acc') {
      const sv = String(s.val || s.value || '').toLowerCase();
      senAcc = sv === 'on' || sv === '1' || sv === 'true' || Boolean(s.val === true);
    } else if (tp === 'gsm') {
      if (vNum != null) senGsmPct = Math.round(vNum);
    } else if (tp === 'satellites' || nm === 'gps') {
      if (vNum != null) senSats = Math.round(vNum);
    }
  }

  const lat = Number(item && (item.lat != null ? item.lat : traccar.lastValidLatitude));
  const lng = Number(item && (item.lng != null ? item.lng : traccar.lastValidLongitude));
  const speedKph = round1(Math.max(0, Number(item && item.speed) || 0));
  const onlineRaw = String((item && item.online) || '').toLowerCase(); // 'online' | 'ack' | 'offline' | 'engine'
  const accOn = xml.acc_on != null ? xml.acc_on : (senAcc != null ? senAcc : speedKph > 2);
  const rpm = xml.rpm != null ? xml.rpm : senRpm;
  const extPowerV = xml.ext_power_v;
  const odometerKm = xml.can_odometer_km != null ? xml.can_odometer_km : (senOdoKm != null ? senOdoKm : xml.gps_total_km);
  const engineHours = senHours != null ? senHours : (xml.can_worktime_raw != null ? round2(xml.can_worktime_raw / 3600) : null);
  const tankLitres = senFuelL != null ? senFuelL : (xml.tank_pct != null && tankCapL > 0 ? round1((xml.tank_pct / 100) * tankCapL) : null);
  const tankPct = xml.tank_pct != null ? xml.tank_pct : (tankLitres != null && tankCapL > 0 ? round1((tankLitres / tankCapL) * 100) : null);

  let statusCode = 'parked';
  let statusLabel = 'Parked';
  if (onlineRaw === 'offline' && extPowerV != null && extPowerV <= 1.0) {
    statusCode = 'power_cut';
    statusLabel = '0V Power Cut';
  } else if (onlineRaw === 'offline') {
    statusCode = 'offline';
    statusLabel = 'Offline';
  } else if (speedKph >= 3) {
    statusCode = 'moving';
    statusLabel = 'Moving';
  } else if (accOn || (rpm != null && rpm >= 300) || onlineRaw === 'engine') {
    statusCode = 'idling';
    statusLabel = 'Idling';
  }

  const zoneName = resolveLandmarkZone(lat, lng, geofences);
  const near500kKm = odometerKm != null && odometerKm >= 498500 && odometerKm < 505000;

  return {
    device_id: devId,
    equipment,
    aliases: pinned ? pinned.aliases : [equipment.toLowerCase(), plateNo.toLowerCase()].filter(Boolean),
    plate_no: plateNo,
    company,
    driver: driver || String((item && item.driver) || '').trim(),
    tracker_label: rawName,
    vehicle_model: vehicleModel,
    tracker_model: trackerModel,
    has_can_fuel: Boolean(pinned ? pinned.has_can_fuel : (xml.ecu_fuel_total_l != null || senFuelL != null)),
    has_ecu_io83: xml.ecu_fuel_total_l != null,
    online_raw: onlineRaw || 'ack',
    status_code: statusCode,
    status_label: statusLabel,
    lat: Number.isFinite(lat) ? round5(lat) : null,
    lng: Number.isFinite(lng) ? round5(lng) : null,
    course: Math.round(Number(item && item.course) || 0),
    speed_kph: speedKph,
    acc_on: Boolean(accOn),
    rpm,
    coolant_c: xml.coolant_c != null ? xml.coolant_c : senTempC,
    pedal_pct: xml.pedal_pct,
    odometer_km: odometerKm,
    engine_hours: engineHours,
    tank_litres: tankLitres,
    tank_cap_l: tankCapL,
    tank_pct: tankPct,
    ecu_fuel_total_l: xml.ecu_fuel_total_l,
    ext_power_v: extPowerV,
    backup_battery_v: xml.backup_battery_v,
    satellites: senSats,
    gsm_pct: senGsmPct,
    stop_duration: String((item && item.stop_duration) || ''),
    last_time: String((item && item.time) || (traccar && traccar.time) || ''),
    timestamp: Number(item && item.timestamp) || 0,
    zone_name: zoneName,
    milestone_alert: near500kKm ? 'Approaching 500,000 km major overhaul' : '',
    vt_plate_note: pinned ? pinned.vt_plate_note : ''
  };
}

function parseTimestampSec(pt) {
  if (pt && Number(pt.timestamp) > 1000000000) return Math.floor(Number(pt.timestamp));
  const raw = String((pt && (pt.raw_time || pt.time || pt.t)) || '').trim();
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

export function computeHistoryRecon(rawHist, unitMeta = {}, fromDate = '', toDate = '') {
  const tankCapL = Number(unitMeta.tank_cap_l) || 400;
  const flatPts = [];
  let ptSeq = 0;

  const pushPt = p => {
    if (!p || typeof p !== 'object') return;
    const rawLat = p.lat != null ? p.lat : p.latitude;
    const rawLng = p.lng != null ? p.lng : p.longitude;
    const hasDirectSensor = p.io89 != null || p.tank_litres != null || p.io83 != null || p.ecu_fuel_total_l != null;
    const lat = rawLat != null ? Number(rawLat) : (hasDirectSensor ? 33.8403 : NaN);
    const lng = rawLng != null ? Number(rawLng) : (hasDirectSensor ? 35.4919 : NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
    const xml = parseTraccarXml(p.other || p.xml || '');
    const speed = Math.max(0, Number(p.speed) || 0);
    const ts = p.ts != null ? Number(p.ts) : parseTimestampSec(p);
    const tankL = p.tank_litres != null
      ? Number(p.tank_litres)
      : (p.io89 != null ? round1((Number(p.io89) / 100) * tankCapL) : (xml.tank_pct != null ? round1((xml.tank_pct / 100) * tankCapL) : null));
    const canOdoKm = xml.can_odometer_km != null
      ? xml.can_odometer_km
      : (p.io87 != null && Number(p.io87) > 0 ? round2(Number(p.io87) / 1000) : null);
    const gpsOdoKm = p.odometer_km != null ? Number(p.odometer_km) : xml.gps_total_km;
    const ecuL = p.ecu_fuel_total_l != null
      ? Number(p.ecu_fuel_total_l)
      : (p.io83 != null && Number(p.io83) > 0 ? round1(Number(p.io83) / 10) : xml.ecu_fuel_total_l);
    flatPts.push({
      idx: ptSeq++,
      ts,
      time: String(p.raw_time || p.time || ''),
      lat: round5(lat),
      lng: round5(lng),
      speed: round1(speed),
      acc_on: p.acc_on != null ? Boolean(p.acc_on) : (xml.acc_on != null ? xml.acc_on : speed > 2),
      ecu_l: ecuL,
      can_odo_km: (canOdoKm != null && canOdoKm > 10) ? canOdoKm : null,
      gps_odo_km: (gpsOdoKm != null && gpsOdoKm > 10) ? gpsOdoKm : null,
      tank_l: (tankL != null && tankL >= 0 && tankL <= tankCapL * 1.1) ? tankL : null,
      ext_power_v: xml.ext_power_v
    });
  };

  if (Array.isArray(rawHist)) {
    rawHist.forEach(pushPt);
  } else if (rawHist && typeof rawHist === 'object') {
    if (Array.isArray(rawHist.items)) {
      rawHist.items.forEach(seg => {
        if (seg && Array.isArray(seg.items)) seg.items.forEach(pushPt);
        else pushPt(seg);
      });
    } else if (Array.isArray(rawHist.positions)) {
      rawHist.positions.forEach(pushPt);
    }
  }

  flatPts.sort((a, b) => (a.ts - b.ts) || (a.idx - b.idx));

  // 1. Separate CAN `<io87>` Span vs Virtual GPS `<totaldistance>` Span + ECU `<io83 / 10>` Burn
  let minCanOdo = null, maxCanOdo = null, canOdoSamples = 0;
  let minGpsOdo = null, maxGpsOdo = null, gpsOdoSamples = 0;
  let prevEcu = null;
  let ecuBurnL = 0;
  let ecuSamples = 0;
  let maxSpeedKph = 0;
  let powerCutEvents = 0;
  let prevPowerOk = true;

  for (const pt of flatPts) {
    if (pt.speed > maxSpeedKph) maxSpeedKph = pt.speed;
    if (pt.can_odo_km != null) {
      canOdoSamples++;
      if (minCanOdo == null || pt.can_odo_km < minCanOdo) minCanOdo = pt.can_odo_km;
      if (maxCanOdo == null || pt.can_odo_km > maxCanOdo) maxCanOdo = pt.can_odo_km;
    }
    if (pt.gps_odo_km != null) {
      gpsOdoSamples++;
      if (minGpsOdo == null || pt.gps_odo_km < minGpsOdo) minGpsOdo = pt.gps_odo_km;
      if (maxGpsOdo == null || pt.gps_odo_km > maxGpsOdo) maxGpsOdo = pt.gps_odo_km;
    }
    if (pt.ecu_l != null && pt.ecu_l > 0) {
      ecuSamples++;
      if (prevEcu != null) {
        const diff = pt.ecu_l - prevEcu;
        // Ignore 0 dropouts and cap single-step glitch at 50 L
        if (diff > 0 && diff <= 50) {
          ecuBurnL += diff;
        }
      }
      prevEcu = pt.ecu_l;
    }
    const pwrLow = pt.ext_power_v != null && pt.ext_power_v <= 1.0;
    if (pwrLow && prevPowerOk) powerCutEvents++;
    prevPowerOk = !pwrLow;
  }

  let haversineTotalKm = 0;
  for (let i = 1; i < flatPts.length; i++) {
    const segKm = haversineKm(flatPts[i - 1].lat, flatPts[i - 1].lng, flatPts[i].lat, flatPts[i].lng);
    if (segKm >= 0.03 && segKm <= 15) haversineTotalKm += segKm;
  }
  const daySpan = (fromDate && toDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(toDate))
    ? Math.max(1, Math.round((Date.parse(toDate + 'T00:00:00Z') - Date.parse(fromDate + 'T00:00:00Z')) / 86400000) + 1)
    : 1;
  const maxPlausibleKm = 2500 * daySpan;
  const canSpan = (canOdoSamples >= 2 && minCanOdo != null && maxCanOdo != null && maxCanOdo >= minCanOdo) ? round1(maxCanOdo - minCanOdo) : null;
  const gpsSpan = (gpsOdoSamples >= 2 && minGpsOdo != null && maxGpsOdo != null && maxGpsOdo >= minGpsOdo) ? round1(maxGpsOdo - minGpsOdo) : null;
  const fallbackKm = round1(Number(rawHist && rawHist.distance_sum ? parseNumFromSensorVal(rawHist.distance_sum) : haversineTotalKm) || 0);
  const useCanSpan = canSpan != null && canSpan <= maxPlausibleKm;
  const useGpsSpan = !useCanSpan && gpsSpan != null && gpsSpan <= maxPlausibleKm;
  const kmGps = useCanSpan ? canSpan : (useGpsSpan ? gpsSpan : fallbackKm);
  const minOdo = useCanSpan ? minCanOdo : (useGpsSpan ? minGpsOdo : (minCanOdo != null ? minCanOdo : minGpsOdo));
  const maxOdo = useCanSpan ? maxCanOdo : (useGpsSpan ? maxGpsOdo : (maxCanOdo != null ? maxCanOdo : maxGpsOdo));
  ecuBurnL = round1(ecuBurnL);

  // 2. Stationary Settled Windows (Slosh Guard: NEVER evaluate io89 while moving or <180s stop!)
  const stationaryWindows = [];
  let curWin = null;
  for (const pt of flatPts) {
    const isStat = pt.speed <= 1.0;
    if (isStat) {
      if (!curWin) {
        curWin = { startTs: pt.ts, endTs: pt.ts, startTime: pt.time, endTime: pt.time, lat: pt.lat, lng: pt.lng, tanks: [], ecuStart: pt.ecu_l, ecuEnd: pt.ecu_l, accOffCount: 0, totalCount: 0 };
      }
      if (pt.ts > 0) {
        if (curWin.startTs === 0) curWin.startTs = pt.ts;
        curWin.endTs = pt.ts;
      }
      curWin.endTime = pt.time;
      curWin.totalCount++;
      if (!pt.acc_on) curWin.accOffCount++;
      if (pt.tank_l != null) curWin.tanks.push(pt.tank_l);
      if (pt.ecu_l != null && pt.ecu_l > 0) {
        if (curWin.ecuStart == null) curWin.ecuStart = pt.ecu_l;
        curWin.ecuEnd = pt.ecu_l;
      }
    } else if (curWin) {
      stationaryWindows.push(curWin);
      curWin = null;
    }
  }
  if (curWin) stationaryWindows.push(curWin);

  const settledStops = [];
  const refillEvents = [];
  const siphonAlerts = [];

  for (const w of stationaryWindows) {
    const hasValidTs = w.startTs > 0 && w.endTs >= w.startTs;
    const durSec = hasValidTs ? (w.endTs - w.startTs) : (w.startTs === 0 && w.endTs === 0 ? w.totalCount * 60 : 0);
    const isSettled = hasValidTs ? (durSec >= 180) : (w.startTs === 0 && w.endTs === 0 && w.totalCount >= 4);
    const settledTank = medianOf(w.tanks);
    if (isSettled) {
      // Also check intra-stop jump/drop (e.g. refueled or siphoned while parked in the same stop!)
      let headMed = null;
      let tailMed = null;
      if (w.tanks.length >= 2) {
        const k = w.tanks.length >= 4 ? Math.min(5, Math.floor(w.tanks.length / 3)) : 1;
        headMed = round1(medianOf(w.tanks.slice(0, k)));
        tailMed = round1(medianOf(w.tanks.slice(-k)));
        const intraDelta = round1(tailMed - headMed);
        const stopEcuBurn = (w.ecuStart != null && w.ecuEnd != null && w.ecuEnd >= w.ecuStart) ? round1(w.ecuEnd - w.ecuStart) : 0;
        const mostlyAccOff = w.accOffCount >= Math.ceil(w.totalCount * 0.5);
        if (intraDelta >= 25) {
          refillEvents.push({ time: w.endTime || w.startTime, delta_l: intraDelta, before_l: headMed, after_l: tailMed, lat: w.lat, lng: w.lng });
        } else if (intraDelta <= -20 && mostlyAccOff && stopEcuBurn <= 1.0) {
          siphonAlerts.push({ time: w.endTime || w.startTime, drop_l: Math.abs(intraDelta), before_l: headMed, after_l: tailMed, ecu_burn_l: stopEcuBurn, lat: w.lat, lng: w.lng });
        }
      }
      settledStops.push({
        start_time: w.startTime,
        end_time: w.endTime,
        duration_min: Math.max(1, Math.round(durSec / 60)),
        lat: w.lat,
        lng: w.lng,
        zone_name: resolveLandmarkZone(w.lat, w.lng, []),
        settled_tank_l: settledTank != null ? round1(settledTank) : null,
        head_tank_l: headMed != null ? headMed : (settledTank != null ? round1(settledTank) : null),
        tail_tank_l: tailMed != null ? tailMed : (settledTank != null ? round1(settledTank) : null),
        acc_off: w.accOffCount >= Math.ceil(w.totalCount * 0.5)
      });
    }
  }

  const stopsWithTank = settledStops.filter(s => s.settled_tank_l != null);
  const openingSettledL = stopsWithTank.length ? stopsWithTank[0].head_tank_l : null;
  const closingSettledL = stopsWithTank.length ? stopsWithTank[stopsWithTank.length - 1].tail_tank_l : null;

  const trackSampleStep = Math.max(1, Math.ceil(flatPts.length / 180));
  const routeTrack = [];
  for (let i = 0; i < flatPts.length; i += trackSampleStep) {
    routeTrack.push([flatPts[i].lat, flatPts[i].lng, flatPts[i].speed]);
  }
  if (flatPts.length > 1) {
    const last = flatPts[flatPts.length - 1];
    routeTrack.push([last.lat, last.lng, last.speed]);
  }

  return {
    device_id: unitMeta.device_id || null,
    equipment: unitMeta.equipment || '',
    company: unitMeta.company || 'WTC',
    from_date: fromDate,
    to_date: toDate,
    points_count: flatPts.length,
    km_gps: kmGps,
    odo_start_km: minOdo != null ? round1(minOdo) : null,
    odo_end_km: maxOdo != null ? round1(maxOdo) : null,
    has_ecu_io83: ecuSamples >= 2,
    ecu_burn_l: ecuSamples >= 2 ? ecuBurnL : null,
    burn_rate_l_100km: (ecuSamples >= 2 && kmGps >= 5) ? round1((ecuBurnL / kmGps) * 100) : null,
    burn_rate_l_km: (ecuSamples >= 2 && kmGps >= 5) ? round2(ecuBurnL / kmGps) : null,
    opening_settled_l: openingSettledL,
    closing_settled_l: closingSettledL,
    max_speed_kph: maxSpeedKph,
    power_cut_events: powerCutEvents,
    refill_events: refillEvents,
    siphon_alerts: siphonAlerts,
    stops: settledStops.slice(0, 40),
    route_track: routeTrack
  };
}

export function buildDemoSnapshot(reqCompany = '') {
  const nowIso = new Date().toISOString();
  const demoUnits = [
    {
      device_id: 90001, equipment: 'TB1', aliases: ['tb1', '360676'], plate_no: '360676', company: 'WTC', driver: 'Demo Driver 1',
      tracker_label: 'Demo Tipper TB1', vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
      online_raw: 'online', status_code: 'moving', status_label: 'Moving', lat: 33.7624, lng: 35.4792, course: 18, speed_kph: 64,
      acc_on: true, rpm: 1480, coolant_c: 84, pedal_pct: 42, odometer_km: 318420.5, engine_hours: 4120.4,
      tank_litres: 248, tank_cap_l: 400, tank_pct: 62, ecu_fuel_total_l: 48210.4, ext_power_v: 27.6, backup_battery_v: 4.1,
      satellites: 18, gsm_pct: 90, stop_duration: '0s', last_time: nowIso, timestamp: Math.floor(Date.now() / 1000),
      zone_name: 'Damour Coastal Corridor', milestone_alert: '', vt_plate_note: ''
    },
    {
      device_id: 90002, equipment: 'TB3', aliases: ['tb3', '358599'], plate_no: '358599', company: 'WTC', driver: 'Demo Driver 3',
      tracker_label: 'Demo Tipper TB3', vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
      online_raw: 'ack', status_code: 'parked', status_label: 'Parked', lat: 33.8403, lng: 35.4919, course: 0, speed_kph: 0,
      acc_on: false, rpm: 0, coolant_c: 58, pedal_pct: 0, odometer_km: 345651.0, engine_hours: 1658.3,
      tank_litres: 184, tank_cap_l: 400, tank_pct: 46, ecu_fuel_total_l: 52190.8, ext_power_v: 25.4, backup_battery_v: 4.0,
      satellites: 20, gsm_pct: 80, stop_duration: '2h 14m', last_time: nowIso, timestamp: Math.floor(Date.now() / 1000),
      zone_name: 'Choueifat Main Yard', milestone_alert: '', vt_plate_note: ''
    },
    {
      device_id: 90003, equipment: 'Tb4', aliases: ['tb4', '358943'], plate_no: '358943', company: 'WTC', driver: 'Demo Driver 4',
      tracker_label: 'Demo Tipper Tb4', vehicle_model: 'Shacman F3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: false,
      online_raw: 'offline', status_code: 'power_cut', status_label: '0V Power Cut', lat: 33.6319, lng: 35.4261, course: 0, speed_kph: 0,
      acc_on: false, rpm: 0, coolant_c: 32, pedal_pct: 0, odometer_km: 289110.2, engine_hours: 3890.1,
      tank_litres: 142, tank_cap_l: 380, tank_pct: 37.4, ecu_fuel_total_l: null, ext_power_v: 0, backup_battery_v: 3.7,
      satellites: 14, gsm_pct: 60, stop_duration: '14h 20m', last_time: nowIso, timestamp: Math.floor(Date.now() / 1000) - 51600,
      zone_name: 'Sibline Plant & Quarry', milestone_alert: '', vt_plate_note: ''
    },
    {
      device_id: 90004, equipment: 'Tb7', aliases: ['tb7', '364656'], plate_no: '364656', company: 'WTC', driver: 'Demo Driver 7',
      tracker_label: 'Demo Tipper Tb7', vehicle_model: 'Shacman X3000', tracker_model: 'FMC150', has_can_fuel: true, has_ecu_io83: true,
      online_raw: 'online', status_code: 'moving', status_label: 'Moving', lat: 33.7851, lng: 35.4825, course: 195, speed_kph: 78,
      acc_on: true, rpm: 1560, coolant_c: 86, pedal_pct: 55, odometer_km: 499915.6, engine_hours: 5412.0,
      tank_litres: 215, tank_cap_l: 400, tank_pct: 53.8, ecu_fuel_total_l: 74120.2, ext_power_v: 27.8, backup_battery_v: 4.1,
      satellites: 19, gsm_pct: 95, stop_duration: '0s', last_time: nowIso, timestamp: Math.floor(Date.now() / 1000),
      zone_name: 'Damour Coastal Corridor', milestone_alert: 'Approaching 500,000 km major overhaul', vt_plate_note: ''
    }
  ];
  const filtered = filterUnitsByScope(demoUnits, null, reqCompany, true);
  return {
    ok: true,
    demo: true,
    fetched_at: nowIso,
    provider: 'ISABI Telematics Bridge (Demo Sandbox)',
    geofences: [
      { id: 73868, name: 'Choueifat Main Yard', center_lat: 33.8403, center_lng: 35.4919 }
    ],
    units: filtered,
    summary: summarizeUnits(filtered)
  };
}

function buildTestFixtureRawPayload() {
  return {
    devices: [
      {
        id: 19130, name: 'Shacman 360676ماجد ', online: 'ack', speed: 0, lat: 33.6308, lng: 35.4265, course: 90,
        time: '08-11-2026 10:04:26 PM', timestamp: 1794168266, stop_duration: '1h 12m',
        device_data: { plate_number: '', traccar: { protocol: 'teltonika', other: '<info><io83>482104</io83><io87>318420500</io87><io89>62</io89><io85>0</io85><io115>610</io115><di1>0</di1><power>25.73</power><battery>4.05</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '318420.5 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '4120.4 h' }, { type: 'fuel_tank', name: 'Fuel Level (Main)', val: '248 L' }]
      },
      {
        id: 17733, name: ' خليفة 3 358599', online: 'ack', speed: 0, lat: 33.8403, lng: 35.4919, course: 0,
        time: '08-11-2026 10:07:23 PM', timestamp: 1794168443, stop_duration: '6h 16m',
        device_data: { plate_number: '356851', traccar: { protocol: 'teltonika', other: '<info><io83>521908</io83><io87>345651000</io87><io89>46</io89><io85>0</io85><io115>630</io115><di1>0</di1><power>25.41</power><battery>4.02</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '345651 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '1658.32 h' }, { type: 'fuel_tank', name: 'Fuel Level (Main)', val: '184 L' }]
      },
      {
        id: 18460, name: 'وسام ملاعب 4 358943', online: 'offline', speed: 0, lat: 33.631958, lng: 35.426123, course: 0,
        time: '07-11-2026 07:08:45 PM', timestamp: 1794071325, stop_duration: '27h 30m',
        device_data: { plate_number: 'P-358943', traccar: { protocol: 'teltonika', other: '<info><io87>289110200</io87><io89>37</io89><di1>0</di1><power>0</power><battery>3.65</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '289110.2 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '3890.1 h' }, { type: 'fuel_tank', name: 'Fuel Level (Main)', val: '141 L' }]
      },
      {
        id: 18595, name: ' محمد حبيب 7 364656', online: 'online', speed: 84, lat: 33.7751, lng: 35.4812, course: 12,
        time: '08-11-2026 10:11:55 PM', timestamp: 1794168715, stop_duration: '0s',
        device_data: { plate_number: '364656', traccar: { protocol: 'teltonika', other: '<info><io83>741202</io83><io87>499915600</io87><io89>54</io89><io85>1590</io85><io115>860</io115><di1>1</di1><power>27.82</power><battery>4.10</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '499915.6 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '5412.0 h' }, { type: 'fuel_tank', name: 'Fuel Level (Main)', val: '216 L' }]
      },
      {
        id: 18553, name: 'حسين صالح 8 354578', online: 'ack', speed: 0, lat: 33.8404, lng: 35.4920, course: 0,
        time: '08-11-2026 10:02:47 PM', timestamp: 1794168167, stop_duration: '5h 42m',
        device_data: { plate_number: '354578', traccar: { protocol: 'teltonika', other: '<info><io83>398110</io83><io87>276430000</io87><io89>51</io89><di1>0</di1><power>25.30</power><battery>4.01</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '276430 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '3115.4 h' }, { type: 'fuel_tank', name: 'Fuel Level (Main)', val: '204 L' }]
      },
      {
        id: 18571, name: 'علي صالح 9 364168', online: 'ack', speed: 0, lat: 33.8402, lng: 35.4918, course: 0,
        time: '08-11-2026 10:02:31 PM', timestamp: 1794168151, stop_duration: '5h 50m',
        device_data: { plate_number: '360676', traccar: { protocol: 'teltonika', other: '<info><io83>441055</io83><io87>302180400</io87><io89>49</io89><di1>0</di1><power>25.55</power><battery>4.04</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '302180.4 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '3540.8 h' }, { type: 'fuel_tank', name: 'Fuel Level (Main)', val: '196 L' }]
      },
      {
        id: 18593, name: 'HINO 309570', online: 'ack', speed: 0, lat: 33.8405, lng: 35.4921, course: 0,
        time: '08-11-2026 10:09:05 PM', timestamp: 1794168545, stop_duration: '4h 18m',
        device_data: { plate_number: '309570', traccar: { protocol: 'teltonika', other: '<info><di1>0</di1><power>25.125</power><battery>4.06</battery></info>' } },
        sensors: [{ type: 'odometer', name: 'Mileage', val: '15834.95 Km' }, { type: 'engine_hours', name: 'Engine Hours', val: '794.07 h' }]
      }
    ],
    geofences: [
      { id: 73868, name: 'الموقف', coordinates: [{ lat: 33.8415, lng: 35.4905 }, { lat: 33.8415, lng: 35.4935 }, { lat: 33.8390, lng: 35.4935 }, { lat: 33.8390, lng: 35.4905 }] }
    ]
  };
}

function summarizeUnits(units) {
  let moving = 0;
  let idling = 0;
  let parked = 0;
  let powerCut = 0;
  let offline = 0;
  let totalTankL = 0;
  let tankUnits = 0;
  for (const u of units) {
    if (u.status_code === 'moving') moving++;
    else if (u.status_code === 'idling') idling++;
    else if (u.status_code === 'power_cut') powerCut++;
    else if (u.status_code === 'offline') offline++;
    else parked++;
    if (u.tank_litres != null) {
      totalTankL += Number(u.tank_litres) || 0;
      tankUnits++;
    }
  }
  return {
    total_units: units.length,
    moving_count: moving,
    idling_count: idling,
    parked_count: parked,
    power_cut_count: powerCut,
    offline_count: offline + powerCut,
    total_tank_litres: round1(totalTankL),
    tank_monitored_units: tankUnits
  };
}

function companyMatchesScope(unitCompany, reqScope) {
  const uc = String(unitCompany || 'WTC').trim().toLowerCase();
  const sc = String(reqScope || '').trim().toLowerCase();
  if (!sc || sc === 'all') return true;
  if (sc === 'manufacturing-group' || sc === 'industry:manufacturing') {
    return uc === 'wtc' || uc === 'bbconstruction' || uc === 'lions transport';
  }
  if (sc.startsWith('industry:')) {
    const ind = sc.slice(9).trim();
    if (ind.includes('trading')) return uc === 'korri auto' || uc === 'shacman';
    if (ind.includes('hospitality')) return ['blanca', 'la una', 'palms', 'voile', 'platinum'].includes(uc);
    if (ind.includes('real estate')) return uc === 'properties' || uc.includes('4235');
    if (ind.includes('insurance')) return uc.includes('insurance');
    if (ind.includes('holding')) return true;
    return false;
  }
  if (sc === 'bdeirholding' || sc === 'bdeir holding') return true;
  const norm = s => s.replace(/[^a-z0-9]/g, '');
  return norm(uc) === norm(sc);
}

function filterUnitsByScope(units, session, reqScope, isDemo = false) {
  return (units || []).filter(u => {
    if (!isDemo && session && !canAccessCompany(session, u.company)) return false;
    return companyMatchesScope(u.company, reqScope);
  });
}

async function fetchJsonWithTimeout(url, opts = {}, timeoutMs = 6500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (_) {}
    return { ok: r.ok, status: r.status, json: j };
  } finally {
    clearTimeout(t);
  }
}

async function resolveVtApiHash(env, forceRefresh = false) {
  if (!forceRefresh && _memRefreshedHash) return _memRefreshedHash;
  const envHash = String((env && env.VT_GPS_API_HASH) || '').trim();
  if (!forceRefresh && envHash) return envHash;

  const email = String((env && env.VT_GPS_EMAIL) || '').trim();
  const password = String((env && env.VT_GPS_PASSWORD) || '').trim();
  if (!email || !password) return envHash;

  const body = new URLSearchParams({ email, password }).toString();
  const res = await fetchJsonWithTimeout(`${VT_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body
  }, 6500);
  if (res.ok && res.json && res.json.user_api_hash) {
    _memRefreshedHash = String(res.json.user_api_hash).trim();
    return _memRefreshedHash;
  }
  return envHash;
}

async function loadDbEquipMap(env) {
  const map = new Map();
  if (!env || !env.DB) return map;
  try {
    const res = await env.DB.prepare('SELECT id, name, plate_no, company, driver, type FROM equipment WHERE voided = 0').all();
    for (const r of (res.results || [])) {
      const p = String(r.plate_no || '').replace(/\D+/g, '');
      if (p) map.set(p, r);
    }
  } catch (_) {}
  return map;
}

async function getNormalizedUpstreamSnapshot(env) {
  const now = Date.now();
  if (_memSnapshotCache.data && (now - _memSnapshotCache.ts) < SNAPSHOT_TTL_MS) {
    return _memSnapshotCache.data;
  }

  if (String((env && env.VT_TEST_FIXTURE) || '') === '1') {
    const fix = buildTestFixtureRawPayload();
    const normUnits = fix.devices.map(d => normalizeDevice(d, fix.geofences));
    const snap = {
      fetched_at: new Date(now).toISOString(),
      geofences: fix.geofences.map(g => ({ id: g.id, name: g.name, coordinates: g.coordinates })),
      units: normUnits
    };
    _memSnapshotCache = { ts: now, data: snap };
    return snap;
  }

  // Check D1 shared 20s cache across isolates
  if (env && env.DB) {
    try {
      const kv = await env.DB.prepare('SELECT payload_json, updated_at FROM edge_kv_store WHERE doc_key = ?').bind('telematics_vt_cache_v1').first();
      if (kv && kv.payload_json) {
        const parsed = JSON.parse(kv.payload_json);
        const ageMs = now - (Date.parse(kv.updated_at || '') || 0);
        if (parsed && Array.isArray(parsed.units) && ageMs >= 0 && ageMs < SNAPSHOT_TTL_MS) {
          _memSnapshotCache = { ts: now, data: parsed };
          return parsed;
        }
      }
    } catch (_) {}
  }

  let apiHash = await resolveVtApiHash(env, false);
  if (!apiHash) {
    throw new Error('Telematics upstream credentials not configured on server.');
  }

  const fetchDevices = h => fetchJsonWithTimeout(`${VT_BASE_URL}/get_devices?lang=en&user_api_hash=${encodeURIComponent(h)}`, { headers: { Accept: 'application/json' } }, 6500);
  let devRes = await fetchDevices(apiHash);
  if (devRes.status === 401 || (devRes.json && devRes.json.status === 0)) {
    apiHash = await resolveVtApiHash(env, true);
    if (apiHash) devRes = await fetchDevices(apiHash);
  }
  if (!devRes.ok || !Array.isArray(devRes.json)) {
    // Serve stale cache if available
    if (_memSnapshotCache.data) return Object.assign({}, _memSnapshotCache.data, { stale: true });
    throw new Error('Telematics upstream temporarily unavailable.');
  }

  let geofences = [];
  try {
    const gfRes = await fetchJsonWithTimeout(`${VT_BASE_URL}/get_geofences?lang=en&user_api_hash=${encodeURIComponent(apiHash)}`, { headers: { Accept: 'application/json' } }, 4500);
    const rawGfs = gfRes.json && gfRes.json.items && Array.isArray(gfRes.json.items.geofences) ? gfRes.json.items.geofences : [];
    geofences = rawGfs.map(g => {
      let coords = [];
      try { coords = typeof g.coordinates === 'string' ? JSON.parse(g.coordinates) : (g.coordinates || []); } catch (_) {}
      return { id: g.id, name: g.name, coordinates: coords };
    });
  } catch (_) {}

  const dbEquipMap = await loadDbEquipMap(env);
  const allDevices = [];
  for (const grp of devRes.json) {
    if (grp && Array.isArray(grp.items)) {
      for (const item of grp.items) allDevices.push(item);
    }
  }
  const units = allDevices.map(d => normalizeDevice(d, geofences, dbEquipMap));
  const snap = {
    fetched_at: new Date(now).toISOString(),
    geofences,
    units
  };
  _memSnapshotCache = { ts: now, data: snap };

  if (env && env.DB) {
    try {
      await env.DB.prepare(
        'INSERT INTO edge_kv_store (doc_key, payload_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at'
      ).bind('telematics_vt_cache_v1', JSON.stringify(snap), snap.fetched_at).run();
    } catch (_) {}
  }

  return snap;
}

export async function handleTelematics(request, env, session, url, parsedBody = null) {
  const action = String(url.searchParams.get('action') || 'snapshot').trim().toLowerCase();
  const reqCompany = String(url.searchParams.get('company') || '').trim();

  // 1. Demo Sandbox Quarantine (Zero live credentials or real customer/driver data)
  if (request.headers.get('X-ISABI-Demo') === '1') {
    const demoSnap = buildDemoSnapshot(reqCompany);
    if (action === 'history') {
      const devId = Number(url.searchParams.get('device_id') || 90001);
      const fromDate = String(url.searchParams.get('from_date') || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const toDate = String(url.searchParams.get('to_date') || fromDate).slice(0, 10);
      const u = demoSnap.units.find(x => x.device_id === devId) || demoSnap.units[0] || { device_id: devId, equipment: 'TB1', company: 'WTC', tank_cap_l: 400 };
      return jsonResponse({
        ok: true,
        demo: true,
        history: {
          device_id: u.device_id,
          equipment: u.equipment,
          company: u.company,
          from_date: fromDate,
          to_date: toDate,
          points_count: 142,
          km_gps: 248.4,
          odo_start_km: 318172.1,
          odo_end_km: 318420.5,
          has_ecu_io83: true,
          ecu_burn_l: 168.2,
          burn_rate_l_100km: 67.7,
          burn_rate_l_km: 0.68,
          opening_settled_l: 216,
          closing_settled_l: 248,
          max_speed_kph: 76,
          power_cut_events: 0,
          refill_events: [{ time: `${fromDate} 07:15:00`, delta_l: 200, before_l: 216, after_l: 416, lat: 33.8403, lng: 35.4919 }],
          siphon_alerts: [],
          stops: [
            { start_time: `${fromDate} 06:30:00`, end_time: `${fromDate} 07:25:00`, duration_min: 55, lat: 33.8403, lng: 35.4919, zone_name: 'Choueifat Main Yard', settled_tank_l: 216, acc_off: true },
            { start_time: `${fromDate} 09:10:00`, end_time: `${fromDate} 09:42:00`, duration_min: 32, lat: 33.6306, lng: 35.4264, zone_name: 'Sibline Plant & Quarry', settled_tank_l: 182, acc_off: true }
          ],
          route_track: [[33.8403, 35.4919, 0], [33.7624, 35.4792, 64], [33.6306, 35.4264, 0]]
        }
      });
    }
    return jsonResponse(demoSnap);
  }

  // 2. Active Authenticated Session Required
  if (!session) {
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }

  // 3. Validate Requested Company Scope against Seat BU RLS
  if (reqCompany && reqCompany.toLowerCase() !== 'all') {
    const allowedScope = canAccessSentinelScope(session, reqCompany) || canAccessCompany(session, reqCompany);
    if (!allowedScope) {
      return jsonResponse({ ok: false, error: `Cross-BU telematics access denied for ${reqCompany}.` }, 403);
    }
  }

  // 4. Deterministic Physics Verification Endpoint (Test Fixture Mode Only)
  if (action === 'verify_physics' && String((env && env.VT_TEST_FIXTURE) || '') === '1' && request.method === 'POST') {
    const body = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
    const recon = computeHistoryRecon(body.positions || body.points || [], body.unitMeta || { tank_cap_l: Number(body.tank_cap_l || 400) }, '2026-11-08', '2026-11-08');
    return jsonResponse({ ok: true, recon });
  }

  // 5. Historical Trip & ECU Fuel Reconciliation (`action=history`)
  if (action === 'history') {
    const devId = Number(url.searchParams.get('device_id') || 0);
    const fromDate = String(url.searchParams.get('from_date') || '').trim();
    const toDate = String(url.searchParams.get('to_date') || fromDate).trim();
    if (!Number.isInteger(devId) || devId <= 0) {
      return jsonResponse({ ok: false, error: 'Valid positive integer device_id is required.' }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) {
      return jsonResponse({ ok: false, error: 'Valid YYYY-MM-DD from_date <= to_date is required.' }, 400);
    }
    const spanDays = (Date.parse(toDate + 'T00:00:00Z') - Date.parse(fromDate + 'T00:00:00Z')) / 86400000;
    if (!Number.isFinite(spanDays) || spanDays > 14) {
      return jsonResponse({ ok: false, error: 'History window cannot exceed 14 days per query.' }, 400);
    }

    const pinned = VT_DEVICE_MAP[devId];
    let unitCompany = pinned ? pinned.company : '';
    let unitMeta = pinned || null;
    if (!pinned) {
      try {
        const snap = await getNormalizedUpstreamSnapshot(env);
        const found = (snap.units || []).find(u => u.device_id === devId);
        if (found) {
          unitCompany = found.company || '';
          unitMeta = found;
        }
      } catch (_) {}
    }

    if (!unitCompany) {
      if (!isOwnerOrFullGroupSession(session)) {
        return jsonResponse({ ok: false, error: `Cross-BU telematics history denied for device ${devId}.` }, 403);
      }
      return jsonResponse({ ok: false, error: `Device ${devId} is not registered in fleet telematics.` }, 404);
    }

    if (!canAccessCompany(session, unitCompany)) {
      return jsonResponse({ ok: false, error: `Cross-BU telematics history denied for device ${devId} (${unitCompany}).` }, 403);
    }

    if (String((env && env.VT_TEST_FIXTURE) || '') === '1') {
      const mockPts = [
        { timestamp: 1794117600, time: `${fromDate} 06:00:00`, lat: 33.8403, lng: 35.4919, speed: 0, other: '<info><io83>520000</io83><io87>345388100</io87><io89>48</io89><di1>0</di1><power>25.4</power></info>' },
        { timestamp: 1794118200, time: `${fromDate} 06:10:00`, lat: 33.8403, lng: 35.4919, speed: 0, other: '<info><io83>520000</io83><io87>345388100</io87><io89>48</io89><di1>0</di1><power>25.4</power></info>' },
        // Moving hill-slosh frames (io89 swings wildly 4% -> 33% while speed=62 kph, must NOT trigger siphon/refill!)
        { timestamp: 1794121800, time: `${fromDate} 07:10:00`, lat: 33.7600, lng: 35.4800, speed: 62, other: '<info><io83>520850</io83><io87>345510000</io87><io89>4</io89><di1>1</di1><power>27.7</power></info>' },
        { timestamp: 1794122100, time: `${fromDate} 07:15:00`, lat: 33.7400, lng: 35.4700, speed: 58, other: '<info><io83>520960</io83><io87>345525000</io87><io89>33</io89><di1>1</di1><power>27.7</power></info>' },
        { timestamp: 1794132000, time: `${fromDate} 10:00:00`, lat: 33.8403, lng: 35.4919, speed: 0, other: '<info><io83>521923</io83><io87>345651000</io87><io89>46</io89><di1>0</di1><power>25.4</power></info>' },
        { timestamp: 1794132600, time: `${fromDate} 10:10:00`, lat: 33.8403, lng: 35.4919, speed: 0, other: '<info><io83>521923</io83><io87>345651000</io87><io89>46</io89><di1>0</di1><power>25.4</power></info>' }
      ];
      return jsonResponse({ ok: true, history: computeHistoryRecon(mockPts, unitMeta, fromDate, toDate) });
    }

    try {
      let apiHash = await resolveVtApiHash(env, false);
      if (!apiHash) return jsonResponse({ ok: false, error: 'Telematics upstream credentials not configured.' }, 503);
      const q = new URLSearchParams({
        lang: 'en',
        user_api_hash: apiHash,
        device_id: String(devId),
        from_date: fromDate,
        from_time: '00:00',
        to_date: toDate,
        to_time: '23:59'
      }).toString();
      let hRes = await fetchJsonWithTimeout(`${VT_BASE_URL}/get_history?${q}`, { headers: { Accept: 'application/json' } }, 9000);
      if (hRes.status === 401) {
        apiHash = await resolveVtApiHash(env, true);
        if (apiHash) {
          const q2 = new URLSearchParams({ lang: 'en', user_api_hash: apiHash, device_id: String(devId), from_date: fromDate, from_time: '00:00', to_date: toDate, to_time: '23:59' }).toString();
          hRes = await fetchJsonWithTimeout(`${VT_BASE_URL}/get_history?${q2}`, { headers: { Accept: 'application/json' } }, 9000);
        }
      }
      if (!hRes.ok || !hRes.json) {
        return jsonResponse({ ok: false, error: 'Upstream history service unavailable.' }, 502);
      }
      const recon = computeHistoryRecon(hRes.json, unitMeta, fromDate, toDate);
      return jsonResponse({ ok: true, history: recon });
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Failed to retrieve telematics history.' }, 502);
    }
  }

  // 6. Live Fleet & Sensor Snapshot (`action=snapshot`)
  try {
    const snap = await getNormalizedUpstreamSnapshot(env);
    const scopedUnits = filterUnitsByScope(snap.units, session, reqCompany, false);
    return jsonResponse({
      ok: true,
      demo: false,
      stale: Boolean(snap.stale),
      fetched_at: snap.fetched_at,
      provider: 'ISABI Telematics Bridge (Teltonika CAN + GPS)',
      geofences: snap.geofences || [],
      units: scopedUnits,
      summary: summarizeUnits(scopedUnits)
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Telematics upstream unreachable.' }, 502);
  }
}
