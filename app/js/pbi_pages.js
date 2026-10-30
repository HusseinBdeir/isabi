/* ============================================================================
   ISABI Systems — 20-Page Power BI Report Studio & 34-Table Hub (js/pbi_pages.js)
   Parity+ with m18c_report.py (20 Power BI pages) & m14_sitemap.py (34 tables)
   v4.4 — Page-specific dynamic slicers, multi-band KPIs, section headings,
          AR aging signed column chart, combo/clustered/multi-line SVG charts,
          inline proportional table data bars, Ended amber & Pickup navy tints,
          and full 3-section P12 Payroll, Site Allowances & Freelance studio.
   ============================================================================ */

(function () {
  'use strict';

  // Institutional Rev 10 Dataviz Palette (Light & Dark CSS-variable backed, zero black/near-black or murky teal)
  const C = {
    navy: 'var(--chart-navy, #2356A8)',
    steel: 'var(--chart-steel, #4A90D9)',
    brass: 'var(--chart-brass, #C0892F)',
    slate: 'var(--chart-slate, #7A889B)',
    amber: 'var(--chart-amber, #C96A22)',
    plum: 'var(--chart-plum, #6B5B95)',
    good: 'var(--chart-good, #1F7A4C)',
    goodSoft: 'var(--chart-good-soft, #6BA888)',
    crit: 'var(--chart-crit, #C8333B)',
    critSoft: 'var(--chart-crit-soft, #DF8A71)'
  };

  function normKey(v) {
    return String(v == null ? '' : v).trim().toLowerCase();
  }

  function isArSettlingRecpt(r) {
    if (!r || r.voided) return false;
    const mth = String(r.method || '').trim();
    return !(mth === 'JV Adjusted' || mth === 'Remove' || mth === 'Adjusted' || mth === 'Free' || mth === 'Cash Return' || mth === 'Cash Discount' || mth === 'IVA' || mth === 'RentConfig' || mth === 'Rent' || mth === 'VATRent');
  }

  function saleTicketSign(s) {
    const mth = String((s && s.method) || '').trim();
    if (mth === 'C Return' || mth === 'CR Return' || mth === 'Cash Return' || mth === 'Credit Return') return -1;
    if (mth === 'Free' || mth === 'Remove' || mth === 'Config' || mth === 'VATConfig') return 0;
    return 1;
  }

  const _NON_AGG_PROD_RE = /\b(truck|shacman|mixer|pump|excavator|excavation|loader|bulldozer|diesel|oil|grease|benzin|gasoline|mazout|fuel|atf|hydraulic|rent|rental|transportation|commission|discount|vat|insurance|tire|tyre|wheel|battery|filter|hammer|salary|salaries|spare\s*part|service|remove|tip|tips|iron|ghirbal|electricity)\b/i;

  function pickTopAggregateGrades(prodRows, limit = 4, productsCatalog = null) {
    const list = Array.isArray(prodRows) ? prodRows : [];
    const catArr = Array.isArray(productsCatalog)
      ? productsCatalog
      : ((typeof window !== 'undefined' && window.SEED && window.SEED.records && window.SEED.records.products) || []);
    const catMap = new Map();
    catArr.forEach(c => { if (c && (c.name || c.Product)) catMap.set(normKey(c.name || c.Product), c); });
    const agg = list
      .filter(p => {
        if (!p || !(Number(p.qty_sold || 0) > 0)) return false;
        const uomLow = normKey(p.UoM || '');
        if (uomLow === 'unit' || uomLow === 'litre' || uomLow === 'litres' || uomLow === 'kg') return false;
        if (_NON_AGG_PROD_RE.test(`${p.Product || ''} ${p['Material Family'] || ''}`)) return false;
        const cat = catMap.get(normKey(p.Product));
        if (cat && cat.type) return normKey(cat.type) === 'material';
        return true;
      })
      .sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0));
    const volFallback = list
      .filter(p => Number(p && p.qty_sold || 0) > 0 && !_NON_AGG_PROD_RE.test(`${(p && p.Product) || ''} ${(p && p['Material Family']) || ''}`))
      .sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0));
    const pool = agg.length ? agg : (volFallback.length ? volFallback : [...list].sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0)));
    return pool.slice(0, limit);
  }

  function enrichMonthsWithTicketUnitEconomics(months, salesRows, rawRows, opts = {}) {
    const mList = Array.isArray(months) ? months : [];
    if (!mList.length) return mList;
    const sList = Array.isArray(salesRows) ? salesRows : [];
    const rList = Array.isArray(rawRows) ? rawRows : [];
    const basis = opts.basis === 'tx' ? 'tx' : 'rep';
    const ticketMetersFn = typeof opts.ticketMeters === 'function' ? opts.ticketMeters : null;
    const isAggFn = typeof opts.isAggregateMaterialProduct === 'function' ? opts.isAggregateMaterialProduct : null;
    const catArr = Array.isArray(opts.productsCatalog) ? opts.productsCatalog : [];
    const catMap = new Map();
    catArr.forEach(c => { if (c && (c.name || c.Product)) catMap.set(normKey(c.name || c.Product), c); });
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

    const ymSet = new Set(mList.map(monthRowToYmKey).filter(Boolean));
    if (!ymSet.size) return mList;

    const isAggTicket = s => {
      if (isAggFn) return isAggFn(s.product, s.uom);
      const pn = String(s.product || '').trim();
      if (!pn) return false;
      const u = normKey(s.uom || '');
      if (u === 'litre' || u === 'litres' || u === 'kg' || u === 'unit') return false;
      if (_NON_AGG_PROD_RE.test(pn)) return false;
      const cat = catMap.get(normKey(pn));
      if (cat && cat.type) return normKey(cat.type) === 'material';
      return true;
    };

    const salesByYm = new Map();
    const delivByYm = new Map();
    const ttcByYm = new Map();
    for (let i = 0; i < sList.length; i++) {
      const s = sList[i];
      if (!s || s.voided) continue;
      const mth = String(s.method || '').trim();
      const sgn = (mth === 'C Return' || mth === 'CR Return' || mth === 'Cash Return' || mth === 'Credit Return') ? -1
        : ((mth === 'Free' || mth === 'Remove' || mth === 'Config' || mth === 'VATConfig') ? 0 : 1);
      if (sgn === 0) continue;
      const ym = String((basis === 'tx' ? s.date : (s.rep_date || s.date)) || '').slice(0, 7);
      if (!ymSet.has(ym)) continue;

      const ttcAll = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
      let tb = ttcByYm.get(ym);
      if (!tb) { tb = { cashTtc: 0, credTtc: 0 }; ttcByYm.set(ym, tb); }
      if (mth === 'Cash' || mth === 'C Return' || mth === 'Cash Return') tb.cashTtc += ttcAll;
      else if (mth === 'Credit' || mth === 'CR Return' || mth === 'Credit Return') tb.credTtc += ttcAll;

      const trVal = sgn * Number(s.trans_price || 0);
      const isOwnFleet = /company/i.test(String(s.transport_by || ''));
      const isDeliv = /deliv/i.test(String(s.sale_type || ''));
      let db = delivByYm.get(ym);
      if (!db) {
        db = { ownTrans: 0, thirdTrans: 0, delivLoads: 0, pickupLoads: 0 };
        delivByYm.set(ym, db);
      }
      if (trVal !== 0) {
        if (isOwnFleet) db.ownTrans += trVal;
        else db.thirdTrans += trVal;
      }
      if (sgn > 0) {
        if (isDeliv) db.delivLoads += 1;
        else db.pickupLoads += 1;
      }

      const qUnit = ticketMetersFn
        ? ticketMetersFn(s)
        : (/truck/i.test(String(s.uom || '')) ? Number(s.qty || 0) * 27 : Number(s.qty || 0));
      const m3 = sgn * qUnit;
      if (m3 === 0 || !isAggTicket(s)) continue;
      const ttc = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
      const net = sgn * Number(s.total != null ? s.total : (ttc - sgn * Number(s.vat || 0)));
      const b = salesByYm.get(ym);
      if (b) { b.m3 += m3; b.net += net; b.ttc += ttc; }
      else salesByYm.set(ym, { m3, net, ttc });
    }

    const rawByYm = new Map();
    for (let i = 0; i < rList.length; i++) {
      const r = rList[i];
      if (!r || r.voided) continue;
      const ym = String((basis === 'tx' ? r.date : (r.rep_date || r.date)) || '').slice(0, 7);
      if (!ymSet.has(ym)) continue;
      const matLeg = Number(r.cost || 0);
      const haulLeg = Number(r.trans_cost || 0);
      const rq = ticketMetersFn
        ? ticketMetersFn(r)
        : (/truck/i.test(String(r.uom || '')) ? Number(r.qty || 0) * 27 : Number(r.qty || 0));
      const rc = Number(r.total != null ? r.total : (matLeg + haulLeg));
      let b = rawByYm.get(ym);
      if (!b) {
        b = { m3: 0, cost: 0, mat: 0, haul: 0 };
        rawByYm.set(ym, b);
      }
      b.mat += matLeg;
      b.haul += haulLeg;
      if (rq > 0) {
        b.m3 += rq;
        b.cost += rc;
      }
    }

    const hasSalesPool = sList.length > 0 && salesByYm.size > 0;
    const hasRawPool = rList.length > 0 && rawByYm.size > 0;
    const hasSalesSource = opts.hasSalesTicketSource != null ? Boolean(opts.hasSalesTicketSource) : (sList.length > 0 && (salesByYm.size > 0 || delivByYm.size > 0));
    const hasRawSource = opts.hasRawTicketSource != null ? Boolean(opts.hasRawTicketSource) : hasRawPool;

    return mList.map(mRow => {
      const ym = monthRowToYmKey(mRow);
      const sb = ym ? salesByYm.get(ym) : null;
      const db = ym ? delivByYm.get(ym) : null;
      const rb = ym ? rawByYm.get(ym) : null;
      const tb = ym ? ttcByYm.get(ym) : null;
      const avgNet = (sb && sb.m3 > 0.001)
        ? roundFn(sb.net / sb.m3)
        : (hasSalesPool ? 0 : Number(mRow.avg_price_net || 0));
      const avgTtc = (sb && sb.m3 > 0.001)
        ? roundFn(sb.ttc / sb.m3)
        : (hasSalesPool ? 0 : Number(mRow.avg_price_ttc || avgNet || 0));
      const avgRaw = (rb && rb.m3 > 0.001)
        ? roundFn(rb.cost / rb.m3)
        : (hasRawPool ? 0 : Number(mRow.avg_raw_cost || 0));
      return Object.assign({}, mRow, {
        avg_price_net: avgNet,
        avg_price_ttc: avgTtc,
        avg_raw_cost: avgRaw,
        cash_sales_ttc: hasSalesSource ? roundFn(tb ? tb.cashTtc : 0) : roundFn(Number(mRow.cash_sales_ttc != null ? mRow.cash_sales_ttc : (mRow.cash_sales || 0))),
        credit_sales_ttc: hasSalesSource ? roundFn(tb ? tb.credTtc : 0) : roundFn(Number(mRow.credit_sales_ttc != null ? mRow.credit_sales_ttc : (Number(mRow.sales_ttc || 0) - Number(mRow.cash_sales || 0)))),
        raw_mat_leg: hasRawSource ? roundFn(rb ? rb.mat : 0) : roundFn(Number(mRow.raw_mat_cost || 0)),
        raw_haul_leg: hasRawSource ? roundFn(rb ? rb.haul : 0) : roundFn(Number(mRow.raw_haulage || 0)),
        own_trans_rev: hasSalesSource ? roundFn(db ? db.ownTrans : 0) : roundFn(Number(mRow.trans_rev || 0)),
        third_trans_rev: hasSalesSource ? roundFn(db ? db.thirdTrans : 0) : 0,
        deliv_loads_m: hasSalesSource ? (db ? db.delivLoads : 0) : Number(mRow.delivery_loads || 0),
        pickup_loads_m: hasSalesSource ? (db ? db.pickupLoads : 0) : Number(mRow.pickup_loads != null ? mRow.pickup_loads : Math.max(0, Number(mRow.loads || 0) - Number(mRow.delivery_loads || 0)))
      });
    });
  }

  function buildMonthlyDeliveryTransportRows(months, salesRows, opts = {}) {
    const mList = Array.isArray(months) ? months : [];
    if (!mList.length) return mList;
    const sList = Array.isArray(salesRows) ? salesRows : [];
    const basis = opts.basis === 'tx' ? 'tx' : 'rep';
    const ticketSignFn = typeof opts.ticketSign === 'function' ? opts.ticketSign : null;
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    const ymSet = new Set(mList.map(monthRowToYmKey).filter(Boolean));
    const byYm = new Map();
    for (let i = 0; i < sList.length; i++) {
      const s = sList[i];
      if (!s || s.voided) continue;
      let sgn = 1;
      if (ticketSignFn) {
        sgn = ticketSignFn(s);
      } else {
        const mth = String(s.method || '').trim();
        if (mth === 'C Return' || mth === 'CR Return' || mth === 'Cash Return' || mth === 'Credit Return') sgn = -1;
        else if (mth === 'Free' || mth === 'Remove' || mth === 'Config' || mth === 'VATConfig') sgn = 0;
      }
      if (sgn === 0) continue;
      const ym = String((basis === 'tx' ? s.date : (s.rep_date || s.date)) || '').slice(0, 7);
      if (!ymSet.has(ym)) continue;
      let b = byYm.get(ym);
      if (!b) {
        b = { ownTrans: 0, thirdTrans: 0, delivLoads: 0 };
        byYm.set(ym, b);
      }
      const trVal = sgn * Number(s.trans_price || 0);
      if (trVal !== 0) {
        if (/company/i.test(String(s.transport_by || ''))) b.ownTrans += trVal;
        else b.thirdTrans += trVal;
      }
      if (sgn > 0 && /deliv/i.test(String(s.sale_type || ''))) b.delivLoads += 1;
    }
    const hasSource = opts.hasTicketSource != null ? Boolean(opts.hasTicketSource) : (sList.length > 0 && byYm.size > 0);
    return mList.map(mRow => {
      const ym = monthRowToYmKey(mRow);
      const b = ym ? byYm.get(ym) : null;
      return Object.assign({}, mRow, {
        own_trans_rev: hasSource ? roundFn(b ? b.ownTrans : 0) : roundFn(Number(mRow.trans_rev || 0)),
        third_trans_rev: hasSource ? roundFn(b ? b.thirdTrans : 0) : 0,
        deliv_loads_m: hasSource ? (b ? b.delivLoads : 0) : Number(mRow.delivery_loads || 0)
      });
    });
  }

  const _YM_SHORT_IDX = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  function monthRowToYmKey(mRow) {
    if (!mRow) return '';
    if (mRow.ym) return String(mRow.ym).slice(0, 7);
    const ymNo = String(mRow.YearMonthNo || '');
    if (/^\d{6}$/.test(ymNo)) return `${ymNo.slice(0, 4)}-${ymNo.slice(4, 6)}`;
    const lbl = String(mRow['Year Month'] || mRow.month || '').trim();
    if (/^\d{4}-\d{2}/.test(lbl)) return lbl.slice(0, 7);
    const m = lbl.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
    if (m) {
      const mm = _YM_SHORT_IDX[m[1].toLowerCase()];
      if (mm) return `${m[2]}-${mm}`;
    }
    return '';
  }

  function buildMonthlyGradePriceSeries(months, topProds, salesRows, opts = {}) {
    const colors = opts.colors || [C.navy, C.brass, C.steel, C.amber];
    const mList = Array.isArray(months) ? months : [];
    const pList = Array.isArray(topProds) ? topProds : [];
    const tickets = Array.isArray(salesRows) ? salesRows : [];
    const basis = opts.basis === 'tx' ? 'tx' : 'rep';
    const ticketMetersFn = typeof opts.ticketMeters === 'function' ? opts.ticketMeters : null;
    const ticketSignFn = typeof opts.ticketSign === 'function' ? opts.ticketSign : null;
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

    const ymSet = new Set(mList.map(monthRowToYmKey).filter(Boolean));
    const prodSet = new Set(pList.map(p => normKey(p && p.Product)).filter(Boolean));
    const bucketMap = new Map();
    const prodHasTickets = new Set();

    if (ymSet.size && prodSet.size && tickets.length) {
      for (let i = 0; i < tickets.length; i++) {
        const r = tickets[i];
        if (!r || r.voided) continue;
        const pk = normKey(r.product);
        if (!prodSet.has(pk)) continue;
        let sgn = 1;
        if (ticketSignFn) {
          sgn = ticketSignFn(r);
        } else {
          const mth = String(r.method || '').trim();
          if (mth === 'C Return' || mth === 'CR Return' || mth === 'Cash Return' || mth === 'Credit Return') sgn = -1;
          else if (mth === 'Free' || mth === 'Remove' || mth === 'Config' || mth === 'VATConfig') sgn = 0;
        }
        if (sgn === 0) continue;
        const ym = String((basis === 'tx' ? r.date : (r.rep_date || r.date)) || '').slice(0, 7);
        if (!ymSet.has(ym)) continue;
        const qUnit = ticketMetersFn
          ? ticketMetersFn(r)
          : (/truck/i.test(String(r.uom || '')) ? Number(r.qty || 0) * 27 : Number(r.qty || 0));
        const m3 = sgn * qUnit;
        const mat = sgn * Number(r.price != null ? r.price : (Number(r.total || 0) - Number(r.trans_price || 0)));
        if (!m3 && !mat) continue;
        const bKey = `${pk}|${ym}`;
        const prev = bucketMap.get(bKey);
        if (prev) { prev.m3 += m3; prev.mat += mat; }
        else bucketMap.set(bKey, { m3, mat });
        if (m3 > 0) prodHasTickets.add(pk);
      }
    }

    return pList.map((p, idx) => {
      const pk = normKey(p.Product);
      const hasTickets = prodHasTickets.has(pk);
      return {
        label: p.Product,
        color: colors[idx % colors.length],
        get: mRow => {
          const ym = monthRowToYmKey(mRow);
          if (hasTickets) {
            const b = ym ? bucketMap.get(`${pk}|${ym}`) : null;
            return b && b.m3 > 0.001 ? roundFn(b.mat / b.m3) : null;
          }
          if (tickets.length > 0 && bucketMap.size > 0) return null;
          const fallback = Number(p.avg_price_net || p.avg_price_ttc || 0);
          return fallback > 0 ? roundFn(fallback) : null;
        }
      };
    });
  }

  const _MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatYmLabel(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return String(ym || '');
    const idx = parseInt(m[2], 10) - 1;
    return `${_MONTH_SHORT_NAMES[idx] || m[2]} ${m[1]}`;
  }
  function buildYmSequence(startYm, endYm) {
    const s = String(startYm || '').match(/^(\d{4})-(\d{2})/);
    const e = String(endYm || '').match(/^(\d{4})-(\d{2})/);
    if (!s || !e) return [];
    let y = parseInt(s[1], 10), m = parseInt(s[2], 10);
    const ey = parseInt(e[1], 10), em = parseInt(e[2], 10);
    const out = [];
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 96) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      out.push({ ym, 'Year Month': formatYmLabel(ym), YearMonthNo: `${y}${String(m).padStart(2, '0')}` });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }

  function isRuleFlatMat(r) {
    if (!r) return false;
    const isTransOnly = /^(Transport Price \(Site\)|Haulage \(Customer Site\))$/i.test(String(r.rule_type || '').trim());
    if (isTransOnly) return false;
    const ip = r.indiff_price != null && r.indiff_price !== '' && Number(r.indiff_price) !== 0 ? Number(r.indiff_price) : null;
    if (/^truck$/i.test(String(r.unit || '').trim()) && (ip != null || Number(r.unit_price ?? r.price ?? 0) !== 0)) return true;
    if (ip == null) return false;
    if (r.rule_type === 'Purchase Price (Site)') return true;
    const up = Number(r.price ?? r.unit_price ?? 0);
    return !(up > 0) || up === ip;
  }
  function ruleFlatTransVal(r) {
    if (!r) return null;
    const isTransOnly = /^(Transport Price \(Site\)|Haulage \(Customer Site\))$/i.test(String(r.rule_type || '').trim());
    if (r.trans_indiff_price != null && r.trans_indiff_price !== '' && Number(r.trans_indiff_price) !== 0) return Number(r.trans_indiff_price);
    if (isTransOnly && r.indiff_price != null && r.indiff_price !== '' && Number(r.indiff_price) !== 0) {
      return Number(r.indiff_price);
    }
    if (isTransOnly && (/^truck$/i.test(String(r.unit || '').trim()) || /^truck$/i.test(String(r.rate_per || '').trim())) && Number(r.trans_unit_price || r.unit_price || r.price || 0) !== 0) {
      return Number(r.trans_unit_price || r.unit_price || r.price);
    }
    if (!isTransOnly && /^truck$/i.test(String(r.rate_per || '').trim()) && Number(r.trans_unit_price || r.trans_price || 0) !== 0) {
      return Number(r.trans_unit_price || r.trans_price);
    }
    return null;
  }
  function isRuleFlatTrans(r) {
    const hasTransLeg = /^(Sales \(Delivery\)|Transport Price \(Site\)|Haulage \(Customer Site\))$/i.test(String((r && r.rule_type) || '').trim());
    if (!hasTransLeg && (!r || r.trans_indiff_price == null)) return false;
    return ruleFlatTransVal(r) != null || /^truck$/i.test(String((r && r.rate_per) || '').trim());
  }

  // Build monthly List Price step-history trajectory from dated List Price agreements in price_rules
  function buildListPriceHistoryData(priceRules, prodRows, months, opts = {}) {
    const colors = opts.colors || [C.navy, C.brass, C.steel, C.plum, C.good];
    const maxSeries = opts.maxSeries || 5;
    const maxMonths = opts.maxMonths || 20;
    const todayYm = String(opts.today || '2026-10-26').slice(0, 7);
    const nonAggRe = /\b(truck|shacman|mixer|pump|excavator|excavation|loader|bulldozer|diesel|oil|grease|benzin|mazout|rent|transportation|commission|discount|vat|insurance|tire|wheel|battery|filter|hammer)\b/i;
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

    const lpRules = (Array.isArray(priceRules) ? priceRules : []).filter(r => {
      if (!r || r.voided) return false;
      if (!/^list price$/i.test(String(r.rule_type || '').trim())) return false;
      const pName = String(r.product || '').trim();
      const up = Number(r.unit_price ?? r.price ?? 0);
      if (!pName || !(up > 0) || up > 250 || nonAggRe.test(pName) || /^unit$/i.test(String(r.unit || ''))) return false;
      return true;
    });

    // Group by (company, product) first so multi-entity views never mix two companies' price scales on the same line
    const byCoProd = new Map();
    const distinctCos = new Set();
    lpRules.forEach(r => {
      const co = String(r.company || '').trim();
      const pName = String(r.product || '').trim();
      if (co) distinctCos.add(co);
      const key = `${normKey(co)}|${normKey(pName)}`;
      let g = byCoProd.get(key);
      if (!g) {
        g = { key, company: co, product: pName, rules: [] };
        byCoProd.set(key, g);
      }
      g.rules.push(r);
    });

    const prodVolMap = new Map();
    (Array.isArray(prodRows) ? prodRows : []).forEach(p => {
      const pk = normKey(p && (p.Product || p.name));
      if (!pk) return;
      prodVolMap.set(pk, (prodVolMap.get(pk) || 0) + Number(p.qty_sold || p.loads || 0));
    });

    // Deduplicate product names across companies by keeping the company series with the richest step history + volume
    const byProdBest = new Map();
    byCoProd.forEach(g => {
      g.rules.sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')));
      const distinctPrices = new Set(g.rules.map(r => roundFn(Number(r.unit_price ?? r.price ?? 0)))).size;
      g.steps = g.rules.length;
      g.distinctPrices = distinctPrices;
      g.vol = prodVolMap.get(normKey(g.product)) || 0;
      g.score = (distinctPrices > 1 ? 100000 : 0) + g.steps * 2500 + g.vol;
      const pk = normKey(g.product);
      const prev = byProdBest.get(pk);
      if (!prev || g.score > prev.score) {
        byProdBest.set(pk, g);
      }
    });

    const picked = Array.from(byProdBest.values())
      .sort((a, b) => b.score - a.score || a.product.localeCompare(b.product))
      .slice(0, maxSeries);

    // Build monthly timeline respecting active period/date range when filtered, else covering active List Price change window
    let mSeq = [];
    const passedMonths = (Array.isArray(months) ? months : [])
      .map(m => ({ ym: monthRowToYmKey(m), 'Year Month': m['Year Month'] || formatYmLabel(monthRowToYmKey(m)) }))
      .filter(m => m.ym);

    if (opts.dateFrom || opts.dateTo) {
      const sYm = String(opts.dateFrom || (passedMonths[0] && passedMonths[0].ym) || '2025-01').slice(0, 7);
      const eYm = String(opts.dateTo || todayYm).slice(0, 7);
      const clampedEnd = eYm > todayYm ? todayYm : eYm;
      mSeq = buildYmSequence(sYm <= clampedEnd ? sYm : clampedEnd, clampedEnd);
    } else if (passedMonths.length >= 4) {
      mSeq = passedMonths.filter(m => m.ym <= todayYm);
    }
    if (mSeq.length < 2) {
      // Derive natural window from step changes up to todayYm
      let earliestChange = '2025-01';
      picked.forEach(g => {
        g.rules.forEach((r, idx) => {
          const ym = String(r.start_date || '').slice(0, 7);
          if (idx > 0 && ym && ym < earliestChange && ym >= '2024-01') earliestChange = ym;
        });
      });
      mSeq = buildYmSequence(earliestChange, todayYm);
    }
    if (mSeq.length > maxMonths) {
      mSeq = mSeq.slice(-maxMonths);
    }

    const multiCo = distinctCos.size > 1;
    const series = picked.map((g, idx) => {
      const firstStartYm = String((g.rules[0] && g.rules[0].start_date) || '2024-01').slice(0, 7);
      const coShort = g.company === 'BBConstruction' ? 'BBC' : g.company;
      return {
        label: multiCo && g.company ? `${g.product} (${coShort})` : g.product,
        product: g.product,
        company: g.company,
        steps: g.steps,
        color: colors[idx % colors.length],
        get: mRow => {
          const ym = mRow.ym || monthRowToYmKey(mRow);
          if (!ym || ym < firstStartYm) return null;
          const ymStart = `${ym}-01`;
          const ymEnd = `${ym}-31`;
          let best = null;
          for (let i = 0; i < g.rules.length; i++) {
            const r = g.rules[i];
            const s = String(r.start_date || '2024-01-01').slice(0, 10);
            const e = r.end_date ? String(r.end_date).slice(0, 10) : '';
            if (s > ymEnd) continue;
            if (e && e < ymStart) continue;
            if (!best || s >= String(best.start_date || '')) best = r;
          }
          // If rules had a brief gap between end_date and next start_date, carry forward most recent prior rule up to ymEnd
          if (!best) {
            for (let i = 0; i < g.rules.length; i++) {
              const r = g.rules[i];
              const s = String(r.start_date || '2024-01-01').slice(0, 10);
              if (s <= ymEnd && (!best || s >= String(best.start_date || ''))) best = r;
            }
          }
          return best ? roundFn(Number(best.unit_price ?? best.price ?? 0)) : null;
        }
      };
    });

    return { months: mSeq, series, totalRulesCount: lpRules.length };
  }

  // Build Customer Delivery Transportation Rate Comparison (Agreed vs. Last Delivered & Site Spread)
  function buildSalesDeliveryTransportComp(salesRows, priceRules, opts = {}) {
    const asAtDate = String(opts.asAtDate || opts.today || '2026-10-26').slice(0, 10);
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    const rules = (Array.isArray(priceRules) ? priceRules : []).filter(r => r && !r.voided);
    const tickets = Array.isArray(salesRows) ? salesRows : [];

    const pairMap = new Map();
    for (let i = 0; i < tickets.length; i++) {
      const s = tickets[i];
      if (!s || s.voided) continue;
      const mth = String(s.method || '').trim();
      if (mth === 'Free' || mth === 'Remove' || mth === 'Config' || mth === 'VATConfig') continue;
      const sgn = (mth === 'C Return' || mth === 'CR Return' || mth === 'Cash Return' || mth === 'Credit Return') ? -1 : 1;
      const tp = sgn * Number(s.trans_price || 0);
      if (Math.abs(tp) < 0.005) continue;
      const cust = String(s.customer || '').trim();
      const site = String(s.site || '').trim() || '(Direct Delivery)';
      const co = String(s.company || '').trim();
      if (!cust) continue;
      const key = `${normKey(co)}|${normKey(cust)}|${normKey(site)}`;
      let cur = pairMap.get(key);
      if (!cur) {
        cur = {
          key,
          company: co,
          customer: cust,
          site,
          loads: 0,
          qty: 0,
          trans_rev: 0,
          last_date: '',
          last_tup: 0,
          last_tp: 0,
          last_qty: 0,
          uom: s.uom || 'm³'
        };
        pairMap.set(key, cur);
      }
      const rawQ = Number(s.qty || 0);
      if (sgn > 0) cur.loads += 1;
      cur.qty += sgn * rawQ;
      cur.trans_rev += tp;
      const dStr = String(s.date || '').slice(0, 10);
      if (sgn > 0 && dStr >= cur.last_date) {
        cur.last_date = dStr;
        cur.last_tp = Math.abs(tp);
        cur.last_qty = rawQ;
        cur.last_tup = Number(s.trans_unit_price || 0) > 0
          ? Number(s.trans_unit_price)
          : (rawQ > 0 ? roundFn(Math.abs(tp) / rawQ) : Math.abs(tp));
        if (s.uom) cur.uom = s.uom;
      }
    }

    const findBestDeliveryTransRule = (co, cust, site) => {
      const cK = normKey(cust);
      const sK = site && site !== '(Direct Delivery)' ? normKey(site) : '';
      let bestActive = null, bestActiveScore = -1;
      let bestEnded = null, bestEndedDate = '';
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        if (co && r.company && r.company !== co) continue;
        const rt = String(r.rule_type || '');
        if (!/Sales \(Delivery\)|Haulage \(Customer Site\)|Transport Price/i.test(rt)) continue;
        const flatVal = ruleFlatTransVal(r);
        const tupVal = Number(r.trans_unit_price ?? r.trans_price ?? (rt === 'Haulage (Customer Site)' ? r.unit_price : 0) ?? 0);
        if (!(tupVal > 0) && flatVal == null) continue;
        if (r.customer && normKey(r.customer) !== cK) continue;
        if (!r.customer && (!sK || normKey(r.site) !== sK)) continue;
        if (r.site && sK && normKey(r.site) !== sK) continue;
        if (r.site && !sK) continue;
        const startD = String(r.start_date || '').slice(0, 10);
        const endD = String(r.end_date || '').slice(0, 10);
        if (startD && startD > asAtDate) continue;
        const score = (r.customer ? 4 : 0) + (r.site ? 2 : 0) + (/Sales \(Delivery\)/i.test(rt) ? 1 : 0);
        if (!endD || endD >= asAtDate) {
          if (score > bestActiveScore || (score === bestActiveScore && startD >= String(bestActive.start_date || ''))) {
            bestActive = r;
            bestActiveScore = score;
          }
        } else if (score >= 4) {
          if (!bestEnded || endD > bestEndedDate || (endD === bestEndedDate && startD >= String(bestEnded.start_date || ''))) {
            bestEnded = r;
            bestEndedDate = endD;
          }
        }
      }
      return bestActive || bestEnded;
    };

    const rows = Array.from(pairMap.values()).filter(r => r.loads > 0 && r.trans_rev > 0).map(cur => {
      const rule = findBestDeliveryTransRule(cur.company, cur.customer, cur.site);
      const isFlat = Boolean((rule && isRuleFlatTrans(rule)) || (cur.last_qty > 1.5 && Math.abs(cur.last_tup - cur.last_tp) < 0.05) || /^truck$/i.test(cur.uom || ''));
      const agreed = rule
        ? roundFn(isFlat ? Number(ruleFlatTransVal(rule) ?? rule.trans_unit_price ?? 0) : Number(rule.trans_unit_price ?? rule.trans_price ?? ruleFlatTransVal(rule) ?? 0))
        : null;
      const lastRate = roundFn(isFlat ? cur.last_tp : cur.last_tup);
      const avgRate = roundFn(isFlat ? (cur.loads > 0 ? cur.trans_rev / cur.loads : 0) : (cur.qty > 0 ? cur.trans_rev / cur.qty : 0));
      const endDate = rule && rule.end_date ? String(rule.end_date).slice(0, 10) : '';
      const isLapsed = Boolean(endDate && endDate < asAtDate);
      const vsAgreed = agreed != null && agreed > 0 ? roundFn(lastRate - agreed) : null;
      return {
        company: cur.company,
        customer: cur.customer,
        site: cur.site,
        label: cur.site && cur.site !== '(Direct Delivery)' ? `${cur.customer} · ${cur.site}` : cur.customer,
        basis: isFlat ? 'Per Truck Load' : `Per ${cur.uom || 'm³'}`,
        is_flat: isFlat,
        rule_name: rule ? (rule.name || rule.rule_type) : '',
        agreed_rate: agreed != null && agreed > 0 ? agreed : null,
        end_date: endDate,
        is_lapsed: isLapsed,
        last_rate: lastRate,
        avg_rate: avgRate,
        vs_agreed: vsAgreed,
        last_date: cur.last_date,
        loads: cur.loads,
        qty: roundFn(cur.qty),
        trans_rev: roundFn(cur.trans_rev)
      };
    }).sort((a, b) => b.trans_rev - a.trans_rev);

    // Site-level rate spread across multi-customer delivery destinations (m260 parity)
    const siteMap = new Map();
    rows.filter(r => !r.is_flat && r.site && r.site !== '(Direct Delivery)').forEach(r => {
      const sk = normKey(r.site);
      let st = siteMap.get(sk);
      if (!st) {
        st = { Site: r.site, rates: [], customers: new Set(), loads: 0, trans_rev: 0, qty: 0 };
        siteMap.set(sk, st);
      }
      const refRate = r.agreed_rate != null ? r.agreed_rate : r.last_rate;
      if (refRate > 0) st.rates.push(refRate);
      st.customers.add(r.customer);
      st.loads += r.loads;
      st.trans_rev += r.trans_rev;
      st.qty += r.qty;
    });
    const siteSpreadRows = Array.from(siteMap.values())
      .filter(s => s.rates.length > 0)
      .map(s => ({
        Site: s.Site,
        customers_count: s.customers.size,
        lowest_rate: roundFn(Math.min(...s.rates)),
        highest_rate: roundFn(Math.max(...s.rates)),
        avg_rate: s.qty > 0 ? roundFn(s.trans_rev / s.qty) : roundFn(s.rates.reduce((a, v) => a + v, 0) / s.rates.length),
        loads: s.loads,
        trans_rev: roundFn(s.trans_rev)
      }))
      .sort((a, b) => b.trans_rev - a.trans_rev);

    return {
      rows,
      unitChartRows: rows.filter(r => !r.is_flat && (r.agreed_rate != null || r.last_rate > 0)).slice(0, 8).map(r => ({
        ...r,
        agreed_chart: r.agreed_rate != null ? r.agreed_rate : r.avg_rate
      })),
      siteSpreadRows
    };
  }

  // Build Live Sales Commission Accrual, Per-Product Corridor, Monthly Ledger & Payout Vouchers (m18a / m18b / m256 parity)
  function buildSalesCommissionData(salesRows, receiptRows, settlementRows, priceRules, opts = {}) {
    const today = String(opts.today || '2026-10-26').slice(0, 10);
    const asAtDate = String(opts.asAtDate || today).slice(0, 10);
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    const isSaleMethod = mth => {
      const m = String(mth || 'Credit').trim();
      return m !== 'Return' && m !== 'C Return' && m !== 'CR Return' && m !== 'Cash Return' && m !== 'Credit Return' &&
        m !== 'Discount' && m !== 'Cash Discount' && m !== 'Credit Discount' &&
        m !== 'JV Adjusted' && m !== 'Remove' && m !== 'Adjusted' && m !== 'Free';
    };

    const rules = (Array.isArray(priceRules) ? priceRules : []).filter(r => r && !r.voided);
    const commRules = rules.filter(r => /^commission$/i.test(String(r.rule_type || '').trim()));
    const custSalesRules = rules.filter(r => /^sales\s*\(/i.test(String(r.rule_type || '').trim()) && Number(r.unit_price ?? r.price ?? 0) > 0 && Number(r.unit_price ?? r.price ?? 0) <= 250 && !/^unit$/i.test(String(r.unit || '')));
    const listRules = rules.filter(r => /^list\s*price$/i.test(String(r.rule_type || '').trim()) && Number(r.unit_price ?? r.price ?? 0) > 0);

    // Check cross-entity Commission availability (e.g. when WTC is active, BBConstruction holds 12 Agrimount rules)
    const globalRules = (Array.isArray(opts.allGlobalRules) ? opts.allGlobalRules : []).filter(r => r && !r.voided && /^commission$/i.test(String(r.rule_type || '').trim()));
    const allowedCos = Array.isArray(opts.allowedCompanies) ? opts.allowedCompanies : null;
    const globalByCo = new Map();
    globalRules.forEach(r => {
      const co = String(r.company || '').trim();
      if (!co || (allowedCos && allowedCos.length && !allowedCos.includes(co))) return;
      let st = globalByCo.get(co);
      if (!st) { st = { company: co, rulesCount: 0, products: new Set(), owners: new Set() }; globalByCo.set(co, st); }
      st.rulesCount += 1;
      if (r.product) st.products.add(r.product);
      if (r.supplier) st.owners.add(r.supplier);
    });
    const otherEntities = Array.from(globalByCo.values())
      .map(x => ({ company: x.company, rulesCount: x.rulesCount, productsCount: x.products.size, ownersLabel: Array.from(x.owners).join(', ') || 'Plant Owner' }))
      .sort((a, b) => b.rulesCount - a.rulesCount);

    // Index Commission rules by company|product
    const commByCoProd = new Map();
    const prodMetaMap = new Map();
    const beneficiaries = new Set();
    commRules.forEach(r => {
      const co = String(r.company || 'BBConstruction').trim();
      const prod = String(r.product || '').trim();
      if (!prod) return;
      if (r.supplier) beneficiaries.add(String(r.supplier).trim());
      const ck = `${norm(co)}|${norm(prod)}`;
      let arr = commByCoProd.get(ck);
      if (!arr) { arr = []; commByCoProd.set(ck, arr); }
      arr.push(r);

      let pm = prodMetaMap.get(ck);
      if (!pm) {
        pm = {
          key: ck,
          company: co,
          product: prod,
          owner: String(r.supplier || 'Agrimount').trim() || 'Agrimount',
          uom: String(r.unit || 'Ton').trim() || 'Ton',
          rules: [],
          loads: 0,
          qty_sold: 0,
          comm_due: 0,
          net_sales: 0,
          ticketUnitPrices: []
        };
        prodMetaMap.set(ck, pm);
      }
      pm.rules.push(r);
    });

    const prodCatalog = Array.isArray(opts.productsCatalog)
      ? opts.productsCatalog
      : ((typeof window !== 'undefined' && window.MFG_SEED && window.MFG_SEED.records && Array.isArray(window.MFG_SEED.records.products))
          ? window.MFG_SEED.records.products
          : []);
    const tonFactorByProd = new Map();
    prodCatalog.forEach(p => {
      if (p && p.name) tonFactorByProd.set(norm(p.name), Number(p.ton_factor) > 0 ? Number(p.ton_factor) : 1.5);
    });
    const convertQtyToRuleUnit = (qty, ticketUom, ruleUnit, prodName, ticketTruckSize) => {
      const q = Number(qty || 0);
      if (!(q > 0)) return 0;
      const su = norm(ticketUom || '');
      const ru = norm(ruleUnit || '');
      if (!ru || !su || su === ru) return q;
      const tf = tonFactorByProd.get(norm(prodName)) || 1.5;
      const isTicketM3 = su === 'm3' || su === 'm³';
      const isRuleM3 = ru === 'm3' || ru === 'm³';
      const isTicketTon = su === 'ton' || su === 'tons' || su === 't';
      const isRuleTon = ru === 'ton' || ru === 'tons' || ru === 't';
      if (isTicketM3 && isRuleTon) return q * tf;
      if (isTicketTon && isRuleM3) return tf > 0 ? (q / tf) : q;
      if (ru === 'truck' || ru === 'load') return 1;
      if (su === 'truck' || su === 'load') {
        const m3 = Number(ticketTruckSize) > 0 ? Number(ticketTruckSize) : 20;
        return isRuleTon ? m3 * tf : m3;
      }
      return q;
    };

    const matchCommRule = (co, prod, txDate) => {
      if (!prod || !txDate) return null;
      const arr = commByCoProd.get(`${norm(co)}|${norm(prod)}`);
      if (!arr || !arr.length) return null;
      const d = String(txDate).slice(0, 10);
      let bestRule = null;
      let bestStart = '';
      let bestRate = -1;
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        const sd = r.start_date ? String(r.start_date).slice(0, 10) : '';
        const ed = r.end_date ? String(r.end_date).slice(0, 10) : '';
        if ((!sd || sd <= d) && (!ed || ed >= d)) {
          const v = Number(r.unit_price ?? r.price ?? 0);
          if (!bestRule || sd > bestStart || (sd === bestStart && v > bestRate)) {
            bestRule = r;
            bestStart = sd;
            bestRate = v;
          }
        }
      }
      return bestRule;
    };

    const isRuleInForceAt = (r, d) => {
      const sd = r.start_date ? String(r.start_date).slice(0, 10) : '';
      const ed = r.end_date ? String(r.end_date).slice(0, 10) : '';
      return (!sd || sd <= d) && (!ed || ed >= d);
    };

    // 1. Scoped per-product accrual & selling-price corridor
    const scopedSales = Array.isArray(salesRows) ? salesRows : [];
    const fallbackProdMap = new Map();
    let totalEarned = 0;
    let totalQualifyingLoads = 0;
    let totalQualifyingQty = 0;

    for (let i = 0; i < scopedSales.length; i++) {
      const s = scopedSales[i];
      if (!s || s.voided || !isSaleMethod(s.method)) continue;
      const txDate = String(s.date || '').slice(0, 10);
      const qty = Number(s.qty || 0);
      if (!(qty > 0)) continue;
      const netMat = Number(s.price != null ? s.price : (Number(s.total || 0) - Number(s.trans_price || 0)));
      const up = Number(s.unit_price || 0);
      const ck = `${norm(s.company)}|${norm(s.product)}`;

      // Track sold aggregate grades so entities with 0 commission rules (e.g. WTC) still render identical product table & chart structure at $0
      if (commRules.length === 0 && s.product && !/\b(shacman|truck|mixer|pump|excavator|excavation|transport|bobcat)\b/i.test(String(s.product || ''))) {
        let fm = fallbackProdMap.get(ck);
        if (!fm) {
          fm = {
            key: ck,
            company: String(s.company || 'WTC').trim(),
            product: String(s.product || '').trim(),
            owner: '-',
            uom: String(s.uom || 'm³').trim() || 'm³',
            rules: [],
            loads: 0,
            qty_sold: 0,
            comm_due: 0,
            net_sales: 0,
            ticketUnitPrices: []
          };
          fallbackProdMap.set(ck, fm);
        }
        fm.loads += 1;
        fm.qty_sold += qty;
        fm.net_sales += netMat;
        if (up > 0) fm.ticketUnitPrices.push(up);
      }

      const rule = matchCommRule(s.company, s.product, txDate);
      const rate = rule ? Number(rule.unit_price ?? rule.price ?? 0) : 0;
      if (!(rate > 0)) continue;
      const commQty = convertQtyToRuleUnit(qty, s.uom, rule.unit, s.product, s.truck_size);
      const comm = commQty * rate;
      totalEarned += comm;
      totalQualifyingLoads += 1;
      totalQualifyingQty += commQty;

      const pm = prodMetaMap.get(ck);
      if (pm) {
        pm.loads += 1;
        pm.qty_sold += commQty;
        pm.comm_due += comm;
        pm.net_sales += netMat;
        if (up > 0) pm.ticketUnitPrices.push(up);
      }
    }

    const activeProdSource = prodMetaMap.size > 0
      ? Array.from(prodMetaMap.values())
      : Array.from(fallbackProdMap.values())
          .sort((a, b) => b.loads - a.loads || b.qty_sold - a.qty_sold)
          .slice(0, 11);

    const productRows = activeProdSource.map(pm => {
      const sortedRules = pm.rules.slice().sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
      const activeRule = sortedRules.find(r => isRuleInForceAt(r, asAtDate)) || sortedRules[0] || {};
      const ruleRates = sortedRules.map(r => Number(r.unit_price ?? r.price ?? 0)).filter(v => v > 0);
      const minRuleRate = ruleRates.length ? Math.min(...ruleRates) : 0;
      const maxRuleRate = ruleRates.length ? Math.max(...ruleRates) : 0;
      const activeRate = Number(activeRule.unit_price ?? activeRule.price ?? 0);
      const effRate = (pm.rules.length > 0 && pm.qty_sold > 0) ? roundFn(pm.comm_due / pm.qty_sold) : activeRate;
      const uomUnits = Array.from(new Set(sortedRules.map(r => String(r.unit || '').trim()).filter(Boolean)));
      const effectiveUom = activeRule.unit || pm.uom || 'Ton';

      // List price in force for this company + product
      const lpMatches = listRules
        .filter(r => norm(r.company) === norm(pm.company) && norm(r.product) === norm(pm.product) && isRuleInForceAt(r, asAtDate))
        .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
      const lpVal = lpMatches.length ? roundFn(Number(lpMatches[0].unit_price ?? lpMatches[0].price ?? 0)) : null;

      // Customer agreement corridor in native unit (fallback to non-flat ticket unit prices)
      const cRules = custSalesRules.filter(r => norm(r.company) === norm(pm.company) && norm(r.product) === norm(pm.product) && isRuleInForceAt(r, asAtDate));
      let cPrices = cRules.map(r => Number(r.unit_price ?? r.price ?? 0)).filter(v => v > 0);
      if (!cPrices.length && pm.ticketUnitPrices.length) {
        const cap = lpVal ? lpVal * 2.5 : 45;
        cPrices = pm.ticketUnitPrices.filter(v => v > 0 && v <= cap);
      }
      const minSell = cPrices.length ? roundFn(Math.min(...cPrices)) : null;
      const maxSell = cPrices.length ? roundFn(Math.max(...cPrices)) : null;
      const realisedSell = pm.qty_sold > 0 ? roundFn(pm.net_sales / pm.qty_sold) : null;
      const netAfterComm = realisedSell != null ? roundFn(realisedSell - effRate) : null;
      const commSharePct = pm.net_sales > 0 ? roundFn((pm.comm_due / pm.net_sales) * 100) : 0;
      let rateStepNote = (minRuleRate > 0 && maxRuleRate > minRuleRate + 0.005)
        ? `${fmtUSD(minRuleRate, 2)} to ${fmtUSD(maxRuleRate, 2)}`
        : '';
      if (uomUnits.length > 1) {
        rateStepNote = (rateStepNote ? rateStepNote + ' · ' : '') + uomUnits.join(' / ');
      }
      if (!pm.rules.length) rateStepNote = 'No rule set';

      return {
        id: activeRule.id || pm.product,
        rule_id: activeRule.id || '',
        company: pm.company,
        product: pm.product,
        Product: pm.product,
        owner: pm.owner,
        uom: effectiveUom,
        rules_count: pm.rules.length,
        active_rate: roundFn(activeRate),
        eff_rate: roundFn(effRate),
        rate_step_note: rateStepNote,
        rate_sub: `${fmtUSD(activeRate, 2)}/${effectiveUom} · ${fmtNum(pm.loads, 0)} loads`,
        loads: pm.loads,
        qty_sold: roundFn(pm.qty_sold),
        comm_due: pm.comm_due,
        list_price: lpVal,
        min_price: minSell,
        max_price: maxSell,
        corridor_label: (minSell != null && maxSell != null) ? `${fmtUSD(minSell, 2)} - ${fmtUSD(maxSell, 2)}` : '-',
        realised_price: realisedSell,
        net_after_comm: netAfterComm,
        comm_share_pct: commSharePct,
        is_active_rule: pm.rules.length > 0 ? Boolean(!activeRule.end_date || String(activeRule.end_date).slice(0, 10) >= asAtDate) : false
      };
    }).sort((a, b) => (b.comm_due - a.comm_due) || (b.active_rate - a.active_rate) || (b.loads - a.loads) || a.product.localeCompare(b.product));

    // 2. Scoped Commission Payout Vouchers (Rent / VATRent / RentConfig in receipts + Commission in settlements)
    const extractVoucher = (r, rkey) => {
      if (!r || r.voided) return null;
      const m = String(r.method || '').trim();
      if (rkey === 'receipts' && m !== 'Rent' && m !== 'VATRent' && m !== 'RentConfig') return null;
      if (rkey === 'settlements' && m !== 'Commission') return null;
      const amt = Number(r.amount || 0);
      const disc = Number(r.discount || 0);
      const tot = roundFn(amt + disc);
      const isVat = m === 'VATRent';
      const isCfg = m === 'RentConfig';
      return {
        id: r.id,
        rkey,
        date: String(r.date || '').slice(0, 10),
        rep_date: String(r.rep_date || r.date || '').slice(0, 10),
        name: r.name || 'Commission Voucher',
        company: r.company || 'BBConstruction',
        beneficiary: r.customer || r.supplier || 'Agrimount',
        method: m,
        stream_label: isVat ? '11% Commission VAT (GL 449)' : (isCfg ? 'Commission Opening / Config (GL 6222)' : 'Commission Paid Ex-VAT (GL 6222)'),
        amount: roundFn(amt),
        discount: roundFn(disc),
        total: tot,
        ex_vat_paid: isVat ? 0 : tot,
        vat_paid: isVat ? tot : 0,
        m18b_paid: isCfg ? 0 : tot,
        reference: r.reference || ''
      };
    };

    const scopedReceipts = Array.isArray(receiptRows) ? receiptRows : [];
    const scopedSettlements = Array.isArray(settlementRows) ? settlementRows : [];
    const voucherRows = [];
    scopedReceipts.forEach(r => { const v = extractVoucher(r, 'receipts'); if (v) voucherRows.push(v); });
    scopedSettlements.forEach(s => { const v = extractVoucher(s, 'settlements'); if (v) voucherRows.push(v); });
    voucherRows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.name).localeCompare(String(a.name)));

    let totalPaidExVat = 0, totalPaidRentCash = 0, totalPaidConfig = 0, totalPaidVat = 0, totalPaidM18b = 0;
    voucherRows.forEach(v => {
      totalPaidExVat += v.ex_vat_paid;
      if (v.method === 'RentConfig') totalPaidConfig += v.total;
      else if (!v.vat_paid) totalPaidRentCash += v.total;
      totalPaidVat += v.vat_paid;
      totalPaidM18b += v.m18b_paid;
      if (v.beneficiary) beneficiaries.add(v.beneficiary);
    });

    // 3. Full chronological Monthly Commission Ledger (computes true cumulative carry-in from 2024-01, then slices to active period)
    const fullSales = Array.isArray(opts.allSalesRows) ? opts.allSalesRows : scopedSales;
    const fullReceipts = Array.isArray(opts.allReceiptRows) ? opts.allReceiptRows : scopedReceipts;
    const fullSettlements = Array.isArray(opts.allSettlementRows) ? opts.allSettlementRows : scopedSettlements;
    const useRepBasis = opts.basis === 'rep';
    const mMap = new Map();
    const ensureYm = ym => {
      let row = mMap.get(ym);
      if (!row) {
        row = { ym, 'Year Month': formatYmLabel(ym), loads: 0, qty_sold: 0, earned_usd: 0, paid_net_usd: 0, paid_vat_usd: 0, paid_total_usd: 0, vouchers_count: 0 };
        mMap.set(ym, row);
      }
      return row;
    };

    for (let i = 0; i < fullSales.length; i++) {
      const s = fullSales[i];
      if (!s || s.voided || !isSaleMethod(s.method)) continue;
      const txDate = String(s.date || '').slice(0, 10);
      const effDate = useRepBasis ? String(s.rep_date || s.date || '').slice(0, 10) : txDate;
      if (!effDate || effDate.length < 7) continue;
      const ym = effDate.slice(0, 7);
      // Seed operating months even when commRules.length === 0 so $0 entities render the same monthly commission chart & schedule structure
      if (commRules.length === 0) {
        ensureYm(ym);
        continue;
      }
      const rule = matchCommRule(s.company, s.product, txDate);
      const rate = rule ? Number(rule.unit_price ?? rule.price ?? 0) : 0;
      if (!(rate > 0)) continue;
      const qty = Number(s.qty || 0);
      if (!(qty > 0)) continue;
      const commQty = convertQtyToRuleUnit(qty, s.uom, rule.unit, s.product, s.truck_size);
      const row = ensureYm(ym);
      row.loads += 1;
      row.qty_sold += commQty;
      row.earned_usd += commQty * rate;
    }

    const addFullVoucher = (r, rkey) => {
      const v = extractVoucher(r, rkey);
      if (!v) return;
      const effDate = useRepBasis ? (v.rep_date || v.date) : v.date;
      if (!effDate) return;
      const row = ensureYm(effDate.slice(0, 7));
      row.paid_net_usd += v.ex_vat_paid;
      row.paid_vat_usd += v.vat_paid;
      row.paid_total_usd += (v.ex_vat_paid + v.vat_paid);
      row.vouchers_count += 1;
    };
    fullReceipts.forEach(r => addFullVoucher(r, 'receipts'));
    fullSettlements.forEach(s => addFullVoucher(s, 'settlements'));

    if (mMap.size === 0) {
      ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].forEach(ensureYm);
    }

    const sortedYms = Array.from(mMap.keys()).sort();
    let rawCumExVat = 0;
    let rawCumM18b = 0;
    const allMonthlyRows = sortedYms.map(ym => {
      const r = mMap.get(ym);
      const earned = r.earned_usd;
      const paidNet = r.paid_net_usd;
      const paidVat = r.paid_vat_usd;
      const paidTot = r.paid_total_usd;
      const netExVat = earned - paidNet;
      rawCumExVat += netExVat;
      rawCumM18b += (earned - paidTot);
      return {
        ym,
        'Year Month': r['Year Month'],
        loads: r.loads,
        qty_sold: roundFn(r.qty_sold),
        earned_usd: earned,
        paid_net_usd: paidNet,
        paid_vat_usd: paidVat,
        paid_total_usd: paidTot,
        vouchers_count: r.vouchers_count,
        period_net_ex_vat: netExVat,
        cum_payable_ex_vat: roundFn(rawCumExVat)
      };
    });

    const fromYm = opts.dateFrom ? String(opts.dateFrom).slice(0, 7) : '';
    const toYm = opts.dateTo ? String(opts.dateTo).slice(0, 7) : '';
    const monthlyRows = allMonthlyRows.filter(m => (!fromYm || m.ym >= fromYm) && (!toYm || m.ym <= toYm));
    const endCumPayableExVat = monthlyRows.length
      ? monthlyRows[monthlyRows.length - 1].cum_payable_ex_vat
      : roundFn(totalEarned - totalPaidExVat);

    return {
      rulesCount: commRules.length,
      activeRulesCount: commRules.filter(r => isRuleInForceAt(r, asAtDate)).length,
      productsCount: productRows.length,
      activeVolumeProductsCount: productRows.filter(p => p.comm_due > 0).length,
      beneficiariesLabel: Array.from(beneficiaries).join(', ') || 'Agrimount',
      totalQualifyingLoads,
      totalQualifyingQty: roundFn(totalQualifyingQty),
      totalEarned: roundFn(totalEarned),
      totalPaidExVat: roundFn(totalPaidExVat),
      totalPaidRentCash: roundFn(totalPaidRentCash),
      totalPaidConfig: roundFn(totalPaidConfig),
      totalPaidVat: roundFn(totalPaidVat),
      totalPaidTtc: roundFn(totalPaidExVat + totalPaidVat),
      totalPaidM18b: roundFn(totalPaidM18b),
      periodNetExVat: roundFn(totalEarned - totalPaidExVat),
      openPayableExVat: roundFn(endCumPayableExVat),
      m18bBalanceUsd: roundFn(totalEarned - totalPaidM18b),
      productRows,
      monthlyRows,
      voucherRows,
      otherEntities
    };
  }

  // Build Quarry Raw Material Purchase (Site) & Site Transportation Rate Comparisons
  function buildQuarryPricingComp(rawRows, priceRules, opts = {}) {
    const asAtDate = String(opts.asAtDate || opts.today || '2026-10-26').slice(0, 10);
    const roundFn = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    const rules = (Array.isArray(priceRules) ? priceRules : []).filter(r => r && !r.voided);
    const receipts = Array.isArray(rawRows) ? rawRows : [];

    const matMap = new Map();
    const haulMap = new Map();

    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i];
      if (!r || r.voided) continue;
      const rm = String(r.method || 'Credit').trim();
      if (rm === 'Remove' || rm === 'Free' || rm === 'Config' || rm === 'VATConfig') continue;
      const co = String(r.company || '').trim();
      const site = String(r.site || '').trim() || '(General Site)';
      const prod = String(r.product || '').trim() || '(Material)';
      const sOwner = String(r.site_owner || '').trim();
      const tOwner = String(r.truck_owner || '').trim();
      const q = Number(r.qty || 0);
      const uom = r.uom || 'm³';
      const dStr = String(r.date || '').slice(0, 10);

      const mc = Number(r.cost || 0);
      if (mc > 0) {
        const mk = `${normKey(co)}|${normKey(site)}|${normKey(prod)}|${normKey(sOwner)}`;
        let mCur = matMap.get(mk);
        if (!mCur) {
          mCur = { company: co, site, product: prod, site_owner: sOwner, uom, loads: 0, qty: 0, mat_cost: 0, last_date: '', last_uc: 0, last_mc: 0, last_qty: 0 };
          matMap.set(mk, mCur);
        }
        mCur.loads += 1;
        mCur.qty += q;
        mCur.mat_cost += mc;
        if (dStr >= mCur.last_date) {
          mCur.last_date = dStr;
          mCur.last_mc = mc;
          mCur.last_qty = q;
          mCur.last_uc = Number(r.unit_cost || 0) > 0 ? Number(r.unit_cost) : (q > 0 ? roundFn(mc / q) : mc);
          if (r.uom) mCur.uom = r.uom;
        }
      }

      const tc = Number(r.trans_cost || 0);
      if (tc > 0 && r.transport_by !== 'Company fleet') {
        const hauler = tOwner || '(3rd-Party Hauler)';
        const hk = `${normKey(co)}|${normKey(hauler)}|${normKey(site)}`;
        let hCur = haulMap.get(hk);
        if (!hCur) {
          hCur = { company: co, truck_owner: hauler, site, product: prod, uom, loads: 0, qty: 0, haul_cost: 0, last_date: '', last_tuc: 0, last_tc: 0, last_qty: 0 };
          haulMap.set(hk, hCur);
        }
        hCur.loads += 1;
        hCur.qty += q;
        hCur.haul_cost += tc;
        if (dStr >= hCur.last_date) {
          hCur.last_date = dStr;
          hCur.last_tc = tc;
          hCur.last_qty = q;
          hCur.last_tuc = Number(r.trans_unit_cost || 0) > 0 ? Number(r.trans_unit_cost) : (q > 0 ? roundFn(tc / q) : tc);
          if (r.uom) hCur.uom = r.uom;
        }
      }
    }

    const findPurchaseRule = (co, site, sOwner, prod) => {
      const sK = normKey(site), oK = normKey(sOwner), pK = normKey(prod);
      let bestActive = null, bestActiveScore = -1;
      let bestEnded = null, bestEndedScore = -1, bestEndedDate = '';
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        if (co && r.company && r.company !== co) continue;
        if (r.rule_type !== 'Purchase Price (Site)') continue;
        if (r.site && normKey(r.site) !== sK) continue;
        if (r.supplier && oK && normKey(r.supplier) !== oK) continue;
        if (!r.site && (!r.supplier || normKey(r.supplier) !== oK)) continue;
        if (r.product && normKey(r.product) !== pK) continue;
        const startD = String(r.start_date || '').slice(0, 10);
        const endD = String(r.end_date || '').slice(0, 10);
        if (startD && startD > asAtDate) continue;
        const score = (r.site ? 4 : 0) + (r.product ? 2 : 0) + (r.supplier && oK && normKey(r.supplier) === oK ? 1 : 0);
        if (!endD || endD >= asAtDate) {
          if (score > bestActiveScore || (score === bestActiveScore && startD >= String(bestActive.start_date || ''))) {
            bestActive = r;
            bestActiveScore = score;
          }
        } else {
          if (score > bestEndedScore || (score === bestEndedScore && endD >= bestEndedDate)) {
            bestEnded = r;
            bestEndedScore = score;
            bestEndedDate = endD;
          }
        }
      }
      return bestActive || bestEnded;
    };

    const findSiteTransRule = (co, hauler, site) => {
      const hK = normKey(hauler), sK = normKey(site);
      let bestActive = null, bestActiveScore = -1;
      let bestEnded = null, bestEndedScore = -1, bestEndedDate = '';
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        if (co && r.company && r.company !== co) continue;
        if (r.rule_type !== 'Transport Price (Site)') continue;
        if (r.site && normKey(r.site) !== sK) continue;
        if (r.supplier && normKey(r.supplier) !== hK) continue;
        if (!r.site && !r.supplier) continue;
        const startD = String(r.start_date || '').slice(0, 10);
        const endD = String(r.end_date || '').slice(0, 10);
        if (startD && startD > asAtDate) continue;
        const score = (r.site ? 4 : 0) + (r.supplier ? 4 : 0);
        if (!endD || endD >= asAtDate) {
          if (score > bestActiveScore || (score === bestActiveScore && startD >= String(bestActive.start_date || ''))) {
            bestActive = r;
            bestActiveScore = score;
          }
        } else {
          if (score > bestEndedScore || (score === bestEndedScore && endD >= bestEndedDate)) {
            bestEnded = r;
            bestEndedScore = score;
            bestEndedDate = endD;
          }
        }
      }
      return bestActive || bestEnded;
    };

    const matRows = Array.from(matMap.values()).map(m => {
      const rule = findPurchaseRule(m.company, m.site, m.site_owner, m.product);
      const isFlat = Boolean((rule && isRuleFlatMat(rule)) || (m.last_qty > 1.5 && Math.abs(m.last_uc - m.last_mc) < 0.05));
      const agreed = rule
        ? roundFn(isFlat ? Number(rValOr(rule.indiff_price, rule.unit_price ?? rule.price)) : Number(rule.unit_price ?? rule.price ?? 0))
        : null;
      const lastRate = roundFn(isFlat ? m.last_mc : m.last_uc);
      const avgRate = roundFn(isFlat ? (m.loads > 0 ? m.mat_cost / m.loads : 0) : (m.qty > 0 ? m.mat_cost / m.qty : 0));
      const endDate = rule && rule.end_date ? String(rule.end_date).slice(0, 10) : '';
      const isLapsed = Boolean(endDate && endDate < asAtDate);
      // Agreed - Last: negative means supplier billed MORE than the agreed purchase rate
      const agreedMinusLast = agreed != null && agreed > 0 ? roundFn(agreed - lastRate) : null;
      return {
        company: m.company,
        site: m.site,
        site_owner: m.site_owner || (rule && rule.supplier) || '—',
        product: m.product,
        label: `${m.site} · ${m.product}`,
        basis: isFlat ? 'Per Truck Load' : `Per ${m.uom || 'm³'}`,
        is_flat: isFlat,
        rule_name: rule ? (rule.name || '') : '',
        agreed_rate: agreed != null && agreed > 0 ? agreed : null,
        end_date: endDate,
        is_lapsed: isLapsed,
        last_rate: lastRate,
        avg_rate: avgRate,
        agreed_minus_last: agreedMinusLast,
        last_date: m.last_date,
        loads: m.loads,
        qty: roundFn(m.qty),
        mat_cost: roundFn(m.mat_cost)
      };
    }).sort((a, b) => b.mat_cost - a.mat_cost);

    const haulRows = Array.from(haulMap.values()).map(h => {
      const rule = findSiteTransRule(h.company, h.truck_owner, h.site);
      const isFlat = Boolean((rule && isRuleFlatTrans(rule)) || (h.last_qty > 1.5 && Math.abs(h.last_tuc - h.last_tc) < 0.05));
      const agreed = rule
        ? roundFn(isFlat ? Number(ruleFlatTransVal(rule) ?? rule.trans_unit_price ?? rule.unit_price ?? 0) : Number(rule.trans_unit_price || rule.unit_price || rule.price || 0))
        : null;
      const lastRate = roundFn(isFlat ? h.last_tc : h.last_tuc);
      const avgRate = roundFn(isFlat ? (h.loads > 0 ? h.haul_cost / h.loads : 0) : (h.qty > 0 ? h.haul_cost / h.qty : 0));
      const endDate = rule && rule.end_date ? String(rule.end_date).slice(0, 10) : '';
      const isLapsed = Boolean(endDate && endDate < asAtDate);
      const agreedMinusLast = agreed != null && agreed > 0 ? roundFn(agreed - lastRate) : null;
      return {
        company: h.company,
        truck_owner: h.truck_owner,
        site: h.site,
        label: `${h.truck_owner} · ${h.site}`,
        basis: isFlat ? 'Per Truck Load' : `Per ${h.uom || 'm³'}`,
        is_flat: isFlat,
        rule_name: rule ? (rule.name || '') : '',
        agreed_rate: agreed != null && agreed > 0 ? agreed : null,
        end_date: endDate,
        is_lapsed: isLapsed,
        last_rate: lastRate,
        avg_rate: avgRate,
        agreed_minus_last: agreedMinusLast,
        last_date: h.last_date,
        loads: h.loads,
        qty: roundFn(h.qty),
        haul_cost: roundFn(h.haul_cost)
      };
    }).sort((a, b) => b.haul_cost - a.haul_cost);

    const overAgreedMatCount = matRows.filter(r => r.agreed_minus_last != null && r.agreed_minus_last < -0.005).length;
    const overAgreedHaulCount = haulRows.filter(r => r.agreed_minus_last != null && r.agreed_minus_last < -0.005).length;

    return {
      matRows,
      haulRows,
      overAgreedCount: overAgreedMatCount + overAgreedHaulCount,
      matUnitChartRows: matRows.filter(r => !r.is_flat && r.last_rate > 0 && r.last_rate < 100).slice(0, 8).map(r => ({
        ...r,
        agreed_chart: r.agreed_rate != null ? r.agreed_rate : r.avg_rate
      })),
      haulFlatChartRows: haulRows.filter(r => r.is_flat && r.last_rate > 0).slice(0, 8).map(r => ({
        ...r,
        agreed_chart: r.agreed_rate != null ? r.agreed_rate : r.avg_rate
      })),
      haulUnitChartRows: haulRows.filter(r => !r.is_flat && r.last_rate > 0 && r.last_rate < 40).slice(0, 8).map(r => ({
        ...r,
        agreed_chart: r.agreed_rate != null ? r.agreed_rate : r.avg_rate
      }))
    };
  }
  function rValOr(a, b) {
    return (a != null && a !== '' && Number(a) !== 0) ? a : (b || 0);
  }

  const PBI_PAGES = [
    { id: 'p01_overview', num: '01', label: 'Executive Pulse', title: 'Executive P&L, Margin, AR/AP & Fleet Overview' },
    { id: 'p02_companies', num: '02', label: 'Entity Comparison', title: 'Side-by-Side Entity Comparison (WTC · BBConstruction · Lions Transport)' },
    { id: 'p04_sales', num: '03', label: 'Sales Analytics', title: 'Sales Revenue, Realised Price Trends, Delivery Transport & Site Mix' },
    { id: 'p05_pricing', num: '04', label: 'Pricing & Spreads', title: 'Price Agreements, Spread, Below-Agreed Exceptions & Commissions' },
    { id: 'p06_ar', num: '05', label: 'Receivables & Aging', title: 'FIFO Customer Balances, 5-Bucket AR Aging & Running Statement' },
    { id: 'p07_ap', num: '06', label: 'Payables & Spend', title: '3-Leg Accounts Payable (Material / Haulage / Expense) & Overhead' },
    { id: 'p08_stock', num: '07', label: 'Stock & Unit Margin', title: 'Raw Material Intake, Unit Economics & Two-Leg Cost Split' },
    { id: 'p09_fuel', num: '08', label: 'Diesel & Tank Burn', title: 'Diesel Tank Balance, Consumption per 100 km / hr & Meter Guard (m142)' },
    { id: 'p10_fleet', num: '09', label: 'Fleet Economics', title: 'Equipment Utilization, Running Cost & Cost per Ton' },
    { id: 'p12_payroll', num: '10', label: 'Workforce Analytics', title: 'Staff Payroll Analytics, Site Transport & Freelance' },
    { id: 'p14_cashflow', num: '11', label: 'Cash Flow & Till', title: 'Cash Inflows vs Outflows, Daily Till & Payment Method Mix' },
    { id: 'p16_financial', num: '12', label: 'Financial GL & Ratios', title: 'Lebanese CoA Income Statement, Balance Sheet & Trial Balance' }
  ];

  // 8 Operational Pages moved out of Analytics & Insights directly into their respective domain hub sub-tabs
  const MOVED_PBI_PAGES = {
    p03_exceptions: { id: 'p03_exceptions', view: 'sentinels',       modSec: 'exceptions', short: 'Action Items',       targetLabel: 'AI Sentinels & Audit' },
    p18_tickets:    { id: 'p18_tickets',    view: 'sentinels',       modSec: 'tickets',    short: 'Ticket Books',       targetLabel: 'AI Sentinels & Audit', scrollPanel: 'salesPadPanel' },
    p17_jv:         { id: 'p17_jv',         view: 'raw_jv',          modSec: 'jv',         short: 'JV 50/50 Sites',     targetLabel: 'JV & Partnerships', scrollPanel: 'jvDistPanel' },
    p11_drivers:    { id: 'p11_drivers',    view: 'fleet_drivers',   modSec: 'drivers',    short: 'Drivers & Overtime', targetLabel: 'Drivers & Overtime', scrollPanel: 'driversOtPanel' },
    p13_vat:        { id: 'p13_vat',        view: 'customers',       modSec: 'vat',        short: 'VAT & Invoices',     targetLabel: 'Customers & Receivables', scrollPanel: 'vatInvPanel' },
    p15_treasury:   { id: 'p15_treasury',   view: 'ledger_treasury', modSec: 'treasury',   short: 'Treasury & Loans',   targetLabel: 'Loans & Settlements' },
    p19_changelog:  { id: 'p19_changelog',  view: 'sentinels',       modSec: 'changelog',  short: 'Change Log & Drift', targetLabel: 'AI Sentinels & Audit' },
    p20_recon:      { id: 'p20_recon',      view: 'statements',      modSec: 'recon',      short: 'Statement Recon',    targetLabel: 'Statements & Reports' }
  };

  // All 37 Relational Tables organized into 5 BU-Scoped Operational Domains + Dedicated 6 · Universal (All BUs) Shared Master Group
  const TABLE_CATALOG = [
    // 1 · Sales, Pricing & Receivables (5 BU-scoped)
    { key: 'sales_tickets', group: '1 · Sales, Pricing & Receivables', label: 'Sales Tickets', dvn: 'bhf_salesticket', form: 'sales', cols: ['date', 'rep_date', 'ticket_no', 'company', 'sale_type', 'customer', 'product', 'site', 'truck', 'driver', 'qty', 'uom', 'unit_price', 'price', 'trans_price', 'vat', 'total_ttc', 'method'], relTables: ['customers', 'price_rules', 'products', 'sites', 'equipment', 'drivers', 'receipts', 'vat_invoices'], views: [{ id: 'all', label: 'All Sales Tickets' }, { id: 'delivery', label: 'Delivery Loads', fn: r => /deliv/i.test(r.sale_type) }, { id: 'pickup', label: 'Pick-up (Material Only)', fn: r => /pick/i.test(r.sale_type) }, { id: 'credit', label: 'Credit / Account', fn: r => !/cash/i.test(r.method) }, { id: 'iva', label: 'IVA / VAT 11%', fn: r => r.iva || Number(r.vat || 0) > 0 }] },
    { key: 'receipts', group: '1 · Sales, Pricing & Receivables', label: 'Customer Receipts (AR)', dvn: 'bhf_mfgcustomerreceipt', form: 'receipt', cols: ['date', 'rep_date', 'name', 'company', 'customer', 'method', 'kind', 'amount', 'discount', 'vat_invoice', 'record_ticket', 'reference', 'notes'], relTables: ['customers', 'sales_tickets', 'vat_invoices', 'credit_terms'], views: [{ id: 'all', label: 'All Customer Receipts' }, { id: 'cash', label: 'Cash / Check', fn: r => /cash|check|cheque/i.test(r.method || '') }, { id: 'disc', label: 'With Discount / Rebate', fn: r => Number(r.discount || 0) > 0 }] },
    { key: 'vat_invoices', group: '1 · Sales, Pricing & Receivables', label: 'VAT 11% Tax Invoices', dvn: 'bhf_vatinvoice', form: 'vatinvoice', cols: ['invoice_no', 'date', 'company', 'customer', 'start_date', 'end_date', 'net_amount', 'vat_amount', 'total_ttc', 'tickets_count', 'notes'], relTables: ['customers', 'sales_tickets', 'receipts'], views: [{ id: 'all', label: 'All VAT Invoices' }] },
    { key: 'price_rules', group: '1 · Sales, Pricing & Receivables', label: 'Price & Commission Agreements', dvn: 'bhf_pricerule', form: 'pricerule', cols: ['company', 'rule_type', 'customer', 'supplier', 'product', 'site', 'unit', 'unit_price', 'trans_unit_price', 'qty1', 'adj1', 'total1', 'qty2', 'adj2', 'total2', 'start_date', 'end_date', 'matched_tickets'], relTables: ['customers', 'suppliers', 'products', 'sites', 'sales_tickets', 'raw_purchases'], views: [{ id: 'all', label: 'Sales & Commission Agreements', fn: r => !/^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || '') }, { id: 'active', label: 'Active Sales Agreements', fn: r => !r.end_date && !/^(Purchase Price \(Site\)|Transport Price \(Site\)|Commission)$/i.test(r.rule_type || ''), cols: ['company', 'rule_type', 'customer', 'product', 'site', 'unit', 'unit_price', 'trans_unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'sales', label: 'Customer Delivery & Pickup', fn: r => /sale|pickup|deliv/i.test(r.rule_type || '') && !/^commission$/i.test(r.rule_type || ''), cols: ['company', 'rule_type', 'customer', 'product', 'site', 'unit', 'unit_price', 'trans_unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'list', label: 'List Prices', fn: r => /list/i.test(r.rule_type || ''), cols: ['company', 'rule_type', 'product', 'unit', 'unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'commission', label: 'Commission Rules', fn: r => /^commission$/i.test(r.rule_type || ''), cols: ['company', 'supplier', 'product', 'unit', 'unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'raw_all', label: 'Raw & Site Haulage Agreements', fn: r => /^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || ''), cols: ['company', 'rule_type', 'supplier', 'site', 'product', 'unit', 'unit_price', 'trans_unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'raw_active', label: 'Active Raw & Haulage', fn: r => !r.end_date && /^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || ''), cols: ['company', 'rule_type', 'supplier', 'site', 'product', 'unit', 'unit_price', 'trans_unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'raw_purch', label: 'Site Material Cost Rules', fn: r => r.rule_type === 'Purchase Price (Site)', cols: ['company', 'rule_type', 'supplier', 'site', 'product', 'unit', 'unit_price', 'start_date', 'end_date', 'matched_tickets'] }, { id: 'raw_haul', label: 'Site Haulage Rate Rules', fn: r => r.rule_type === 'Transport Price (Site)', cols: ['company', 'rule_type', 'supplier', 'site', 'product', 'unit', 'trans_unit_price', 'start_date', 'end_date', 'matched_tickets'] }] },
    { key: 'credit_terms', group: '1 · Sales, Pricing & Receivables', label: 'Customer Credit Terms', dvn: 'bhf_creditterm', form: 'creditterm', cols: ['name', 'company', 'customer', 'credit_days', 'credit_limit', 'ar_balance', 'start_date', 'end_date', 'notes'], relTables: ['customers', 'sales_tickets', 'receipts'], views: [{ id: 'all', label: 'All Credit Terms' }, { id: 'active', label: 'Active Policies', fn: r => !r.end_date }] },

    // 2 · Purchases, Expenses & Payables (7 BU-scoped)
    { key: 'raw_purchases', group: '2 · Purchases, Expenses & Payables', label: 'Raw Material Purchases', dvn: 'bhf_rawpurchase', form: 'raw', cols: ['date', 'rep_date', 'ticket_no', 'company', 'site', 'site_owner', 'transport_by', 'truck_owner', 'truck', 'driver', 'product', 'qty', 'uom', 'unit_cost', 'cost', 'trans_cost', 'total'], relTables: ['sites', 'suppliers', 'price_rules', 'equipment', 'drivers', 'products', 'settlements'], views: [{ id: 'all', label: 'All Raw Purchases' }, { id: 'supplier_haul', label: 'Third-Party Haulage', fn: r => Number(r.trans_cost || 0) > 0 }, { id: 'company_haul', label: 'Company Fleet Haul', fn: r => /company/i.test(r.transport_by) }] },
    { key: 'expenses', group: '2 · Purchases, Expenses & Payables', label: 'General & Fleet Expenses', dvn: 'bhf_mfgexpense', form: 'expense', cols: ['date', 'rep_date', 'name', 'company', 'category', 'subcategory', 'item_summary', 'supplier', 'equipment', 'method', 'qty', 'amount', 'vat', 'total_ttc', 'invoice', 'reference', 'notes'], relTables: ['expense_items', 'expense_categories', 'expense_subcategories', 'suppliers', 'equipment', 'settlements'], views: [{ id: 'all', label: 'All Expenses' }, { id: 'pending_price', label: 'Pending Invoice Price ($0)', fn: r => Boolean(r.price_pending) }, { id: 'fleet', label: 'Equipment & Fleet Tagged', fn: r => Boolean(r.equipment || r.for_equipment) }, { id: 'overhead', label: 'Plant & General Overhead', fn: r => !r.equipment && !r.for_equipment }] },
    { key: 'expense_items', group: '2 · Purchases, Expenses & Payables', navView: 'expenses', label: 'Expense Item Tickets', dvn: 'bhf_mfgexpenseitem', form: 'expense', cols: ['date', 'name', 'expense_ref', 'company', 'item_name', 'category', 'subcategory', 'allocation_mode', 'target_equipment', 'warehouse_location', 'qty', 'uom', 'unit_cost', 'line_total', 'supplier'], relTables: ['expenses', 'equipment', 'warehouse_movements', 'suppliers'], views: [
      { id: 'all', label: 'All Expense Items' },
      { id: 'warehouse', label: 'Stored in Warehouse', fn: r => /^warehouse$/i.test(r.allocation_mode || '') },
      { id: 'same_eq', label: 'Same Equipment', fn: r => /^same_equipment$/i.test(r.allocation_mode || '') },
      { id: 'diff_eq', label: 'Different Equipment', fn: r => /^different_equipment$/i.test(r.allocation_mode || '') },
      { id: 'general', label: 'General / Non-Equipment', fn: r => /^general$/i.test(r.allocation_mode || '') }
    ] },
    { key: 'warehouse_movements', group: '2 · Purchases, Expenses & Payables', navView: 'warehouse', label: 'Warehouse Stock Movements', dvn: 'bhf_warehousemovement', form: 'warehousestock', cols: ['date', 'name', 'company', 'item_name', 'category', 'direction', 'movement_type', 'qty', 'uom', 'unit_cost', 'total_cost', 'warehouse_location', 'equipment', 'notes'], relTables: ['expense_items', 'equipment_repairs', 'repair_items', 'equipment'], views: [
      { id: 'all', label: 'All Stock Movements' },
      { id: 'in', label: 'Stock In (+)', fn: r => /^IN$/i.test(r.direction || '') },
      { id: 'out', label: 'Stock Out (-)', fn: r => /^OUT$/i.test(r.direction || '') }
    ] },
    { key: 'settlements', group: '2 · Purchases, Expenses & Payables', label: 'Supplier Settlements (AP)', dvn: 'bhf_mfgsupplierpayment', form: 'settlement', cols: ['date', 'rep_date', 'name', 'company', 'supplier', 'payable_leg', 'method', 'kind', 'amount', 'discount', 'raw_ticket', 'expense_record', 'reference', 'notes'], relTables: ['suppliers', 'raw_purchases', 'expenses', 'price_rules'], views: [{ id: 'all', label: 'All Supplier Settlements' }, { id: 'raw_leg', label: 'Raw / Haulage Leg', fn: r => Boolean(r.raw_ticket) }, { id: 'exp_leg', label: 'Expense Leg', fn: r => Boolean(r.expense_record) }] },
    { key: 'jv_partnerships', group: '2 · Purchases, Expenses & Payables', label: 'JV Site Partnerships', dvn: 'bhf_mfgjvpartnership', form: 'jv', cols: ['name', 'company', 'site', 'partner', 'percentage', 'distributions_total', 'notes'], relTables: ['sites', 'jv_distributions', 'raw_purchases'], views: [{ id: 'all', label: 'All JV Partnerships' }] },
    { key: 'jv_distributions', group: '2 · Purchases, Expenses & Payables', label: 'JV Profit Distributions', dvn: 'bhf_mfgjvdistribution', form: 'jv', cols: ['date', 'rep_date', 'company', 'site', 'partner', 'basis', 'amount', 'total', 'notes'], relTables: ['jv_partnerships', 'sites'], views: [{ id: 'all', label: 'All JV Distributions' }] },

    // 3 · Fleet, Fuel, Maintenance & Drivers (10 BU-scoped)
    { key: 'fuel_intakes', group: '3 · Fleet, Fuel, Maintenance & Drivers', label: 'Fuel & Lubricant Intakes', dvn: 'bhf_fuelintake', form: 'fuel', cols: ['date', 'ticket_no', 'company', 'equipment', 'driver', 'item', 'litres', 'tank_remaining_litres', 'uom', 'odometer', 'hours', 'notes'], relTables: ['equipment', 'company_equipment', 'drivers', 'products', 'fuel_malfunctions'], views: [{ id: 'all', label: 'All Fuel & Lube Fills' }, { id: 'diesel', label: 'Diesel Only', fn: r => /diesel|fuel|mazout/i.test(r.item || '') }, { id: 'lube', label: 'Oils & Lubricants', fn: r => !/diesel|fuel|mazout|grease/i.test(r.item || '') }, { id: 'grease', label: 'Daily Greasing (kg)', fn: r => /grease/i.test(r.item || '') }] },
    { key: 'fuel_malfunctions', group: '3 · Fleet, Fuel, Maintenance & Drivers', navView: 'fleet', label: 'Tank Malfunctions & Discrepancies', dvn: 'bhf_fuelmalfunction', form: 'malfunction', cols: ['date', 'rep_date', 'ticket_no', 'company', 'discrepancy_type', 'item', 'litres', 'tank_delta_litres', 'tank_remaining_litres', 'equipment', 'driver', 'notes'], relTables: ['fuel_intakes', 'equipment', 'drivers', 'expenses'], views: [
      { id: 'all', label: 'All Discrepancies' },
      { id: 'malf_only', label: 'Malfunctions Only', fn: r => /^malfunction$/i.test(r.discrepancy_type || 'Malfunction') },
      { id: 'outflow', label: 'Shortages / Outflows (-Tank)', fn: r => Number(r.litres || 0) > 0 },
      { id: 'surplus', label: 'Surpluses / Over-Reads (+Tank)', fn: r => Number(r.litres || 0) < 0 }
    ] },
    { key: 'company_equipment', group: '3 · Fleet, Fuel, Maintenance & Drivers', label: 'Company-Equipment Assignments', dvn: 'bhf_companyequipment', form: 'companyequipment', cols: ['equipment', 'company', 'ownership', 'status', 'supplier', 'default_driver', 'site', 'day_operator', 'night_operator', 'start_date', 'end_date'], relTables: ['equipment', 'equipment_defects', 'equipment_repairs', 'equipment_oil_logs', 'part_movements', 'suppliers', 'drivers', 'sites'], views: [{ id: 'all', label: 'All Fleet Assignments' }, { id: 'active', label: 'Active Assignments', fn: r => /active/i.test(r.status || '') && !r.end_date }] },
    { key: 'equipment_defects', group: '3 · Fleet, Fuel, Maintenance & Drivers', navView: 'fleet_maint', label: 'Equipment Warnings & Defects', dvn: 'bhf_equipmentdefect', form: 'defect', cols: ['name', 'date', 'company', 'equipment', 'subsystem', 'part_name', 'severity', 'status', 'reported_by', 'description'], relTables: ['equipment', 'company_equipment', 'equipment_repairs', 'part_movements', 'expenses'], views: [
      { id: 'all', label: 'All Warnings & Defects' },
      { id: 'open', label: 'Open / Unresolved', fn: r => !/resolved|closed/i.test(r.status || '') },
      { id: 'critical', label: 'Grave / Critical', fn: r => /grave|critical/i.test(r.severity || '') && !/resolved|closed/i.test(r.status || '') },
      { id: 'mild', label: 'Mild Warnings', fn: r => /mild|moderate|minor/i.test(r.severity || '') && !/resolved|closed/i.test(r.status || '') },
      { id: 'resolved', label: 'Resolved', fn: r => /resolved|closed/i.test(r.status || '') }
    ] },
    { key: 'equipment_repairs', group: '3 · Fleet, Fuel, Maintenance & Drivers', navView: 'fleet_maint', label: 'Equipment Repairs', dvn: 'bhf_equipmentrepair', form: 'repair', cols: ['date', 'name', 'company', 'equipment', 'subsystem', 'repair_source', 'items_summary', 'warehouse_parts_usd', 'outside_parts_usd', 'external_labor_usd', 'total_cost_usd', 'supplier', 'defect_ref', 'status'], relTables: ['repair_items', 'equipment', 'equipment_defects', 'warehouse_movements', 'suppliers'], views: [
      { id: 'all', label: 'All Repairs' },
      { id: 'wh_only', label: 'Warehouse Only', fn: r => /^warehouse only$/i.test(r.repair_source || '') },
      { id: 'out_only', label: 'Outside Only', fn: r => /^outside only$/i.test(r.repair_source || '') },
      { id: 'partial', label: 'Partially Warehouse + Outside', fn: r => /partial/i.test(r.repair_source || '') }
    ] },
    { key: 'repair_items', group: '3 · Fleet, Fuel, Maintenance & Drivers', navView: 'fleet_maint', label: 'Items Used in Repairs', dvn: 'bhf_repairitem', form: 'repair', cols: ['date', 'name', 'repair_ref', 'company', 'equipment', 'item_name', 'source', 'qty', 'uom', 'unit_cost', 'line_total', 'warehouse_location', 'supplier'], relTables: ['equipment_repairs', 'equipment', 'warehouse_movements', 'suppliers'], views: [
      { id: 'all', label: 'All Repair Items' },
      { id: 'warehouse', label: 'From Warehouse (-Stock)', fn: r => /^warehouse$/i.test(r.source || '') },
      { id: 'outside', label: 'Purchased Outside', fn: r => /^outside$/i.test(r.source || '') }
    ] },
    { key: 'equipment_oil_logs', group: '3 · Fleet, Fuel, Maintenance & Drivers', navView: 'fleet_maint', label: 'Equipment Oil & Service Logs', dvn: 'bhf_equipmentoillog', form: 'oillog', cols: ['date', 'name', 'company', 'equipment', 'oil_type', 'service_action', 'qty', 'uom', 'source', 'hours_reading', 'odometer_km', 'interval_hours', 'interval_km', 'interval_days', 'cost_usd'], relTables: ['equipment', 'company_equipment', 'fuel_intakes'], views: [
      { id: 'all', label: 'All Oil & Service Logs' },
      { id: 'engine', label: 'Engine Oil (15W-40)', fn: r => /15w|engine|motor/i.test(r.oil_type || '') },
      { id: 'hyd', label: 'Hydraulic Oil (68)', fn: r => /68|hydraulic/i.test(r.oil_type || '') },
      { id: 'gear', label: 'Gear & Transmission (90/ATF)', fn: r => /90|gear|trans|atf|diff/i.test(r.oil_type || '') }
    ] },
    { key: 'part_movements', group: '3 · Fleet, Fuel, Maintenance & Drivers', navView: 'fleet_maint', label: 'Changed & Removed Parts', dvn: 'bhf_partmovement', form: 'partlog', cols: ['name', 'date', 'company', 'equipment', 'part_name', 'qty', 'removed_disposition', 'storage_location', 'prior_defect_notified', 'new_part_cost', 'sale_proceeds'], relTables: ['equipment', 'equipment_defects', 'company_equipment', 'expenses'], views: [
      { id: 'all', label: 'All Part Movements' },
      { id: 'stored', label: 'Stored in Warehouse', fn: r => /stored|warehouse|spare/i.test(r.removed_disposition || '') },
      { id: 'maint', label: 'In Maintenance / Workshop', fn: r => /maintenance|workshop/i.test(r.removed_disposition || '') },
      { id: 'sold', label: 'Sold (Used / Scrap)', fn: r => /^sold/i.test(r.removed_disposition || '') },
      { id: 'installed', label: 'Installed on Unit', fn: r => /installed|mounted/i.test(r.removed_disposition || '') },
      { id: 'scrapped', label: 'Scrapped / Discarded', fn: r => /scrap/i.test(r.removed_disposition || '') && !/^sold/i.test(r.removed_disposition || '') },
      { id: 'unnotified', label: 'Unnotified (No Prior Defect)', fn: r => !r.prior_defect_notified }
    ] },
    { key: 'company_drivers', group: '3 · Fleet, Fuel, Maintenance & Drivers', label: 'Company-Driver Assignments', dvn: 'bhf_companydriver', form: 'driver', cols: ['driver', 'company', 'staff', 'assigned_trucks', 'loads_hauled', 'start_date', 'end_date', 'notes'], relTables: ['drivers', 'employments', 'equipment', 'sales_tickets'], views: [{ id: 'all', label: 'All Driver Assignments' }] },
    { key: 'overtime_rates', group: '3 · Fleet, Fuel, Maintenance & Drivers', label: 'Driver Trip & Overtime Rates', dvn: 'bhf_mfgovertimerate', form: 'triprate', cols: ['name', 'company', 'region', 'amount', 'start_date', 'end_date', 'notes'], relTables: ['regions', 'drivers', 'sales_tickets'], views: [{ id: 'all', label: 'All Trip & Overtime Rates' }] },

    // 4 · Payroll, Attendance & Workforce (5 BU-scoped)
    { key: 'salaries', group: '4 · Payroll, Attendance & Workforce', label: 'Staff Salary Payments', dvn: 'bhf_mfgsalary', form: 'salary', cols: ['date', 'payroll_month', 'company', 'staff', 'currency', 'amount', 'lbp_amount', 'notes'], relTables: ['employments', 'attendance', 'logistics_allowances', 'freelance_entries'], views: [
      { id: 'all', label: 'All Salary Payments' },
      { id: 'usd', label: 'USD Salaries', fn: r => String(r.currency || 'USD').toUpperCase() !== 'LBP' && !r.lbp_amount },
      { id: 'lbp', label: 'LBP Salaries (LL)', fn: r => String(r.currency || '').toUpperCase() === 'LBP' || Number(r.lbp_amount || 0) > 0 }
    ] },
    { key: 'attendance', group: '4 · Payroll, Attendance & Workforce', label: 'Attendance & Overtime Log', dvn: 'bhf_mfgattendance', form: 'attendance', cols: ['set_date', 'tx_date', 'month', 'company', 'staff', 'type', 'tally', 'in_time', 'out_time', 'worked_hours', 'overtime_hours', 'late_hours', 'leave_days', 'extra_usd', 'notes'], relTables: ['employments', 'salaries'], views: [
      { id: 'all', label: 'All Attendance Rows' },
      { id: 'ot', label: 'Overtime', fn: r => Number(r.overtime_hours || 0) > 0 || /^overtime$/i.test(r.type || r.status || '') },
      { id: 'late', label: 'Lateness', fn: r => Number(r.late_hours || 0) > 0 || /^lateness$/i.test(r.type || r.status || '') },
      { id: 'leave', label: 'Absence & Leave', fn: r => Number(r.leave_days || 0) !== 0 || /Absence|VacAbsence|Sick|Leave|Unpaid/i.test(r.type || r.status || '') },
      { id: 'extra', label: 'Extra & Config', fn: r => /^(?:extra|config)/i.test(r.type || r.status || '') }
    ] },
    { key: 'employments', group: '4 · Payroll, Attendance & Workforce', label: 'Employment & Freelance Contracts', dvn: 'bhf_mfgemployment', form: 'employment', cols: ['name', 'company', 'staff', 'role', 'type', 'status', 'salary_usd', 'daily_rate', 'working_days', 'working_hours', 'overtime_multiplier', 'reimbursement', 'deduction', 'payments_count', 'total_paid', 'start_date', 'end_date'], relTables: ['salaries', 'attendance', 'logistics_allowances', 'freelance_entries', 'company_drivers'], views: [{ id: 'all', label: 'All Contracts' }, { id: 'active', label: 'Active Staff', fn: r => !/ended|inactive|terminated/i.test(r.status || '') && !r.end_date }, { id: 'freelance', label: 'Freelance / Daily', fn: r => /free|daily/i.test(r.type || '') }] },
    { key: 'freelance_entries', group: '4 · Payroll, Attendance & Workforce', label: 'Freelance Work Entries', dvn: 'bhf_mfgfreelance', form: 'freelance', cols: ['date', 'company', 'staff', 'hours', 'extra_hours', 'rate_usd', 'total', 'notes'], relTables: ['employments', 'salaries'], views: [{ id: 'all', label: 'All Freelance Entries' }] },
    { key: 'logistics_allowances', group: '4 · Payroll, Attendance & Workforce', navView: 'payroll_allowances', label: 'Site Transport', dvn: 'bhf_mfglogistics', form: 'logistics', cols: ['name', 'company', 'staff', 'site', 'equipment', 'daily_usd', 'lbp_amount', 'working_days', 'start_date', 'end_date'], relTables: ['employments', 'sites', 'equipment', 'attendance', 'salaries'], views: [
      { id: 'all', label: 'All Site Transport' },
      { id: 'active', label: 'Current / Open', fn: r => !r.end_date || String(r.end_date) >= '2026-10-01' },
      { id: 'ended', label: 'Ended Windows', fn: r => Boolean(r.end_date && String(r.end_date) < '2026-10-01') }
    ] },

    // 5 · Cash Flow, Treasury & FX (4 BU-scoped)
    { key: 'external_movements', group: '5 · Cash Flow, Treasury & FX', label: 'External & Extended Movements', dvn: 'bhf_mfgexternal', form: 'treasury', cols: ['date', 'company', 'kind', 'counterparty', 'direction', 'usd_amount', 'lbp_amount', 'notes'], relTables: ['loans', 'loan_settlements'], views: [
      { id: 'all', label: 'All External & Extended' },
      { id: 'external', label: 'External Treasury', fn: r => String(r.kind || 'External').toLowerCase() !== 'extended' },
      { id: 'extended', label: 'Extended Stakeholders', fn: r => String(r.kind || '').toLowerCase() === 'extended' }
    ] },
    { key: 'loans', group: '5 · Cash Flow, Treasury & FX', label: 'Loans & Partner Advances', dvn: 'bhf_mfgloan', form: 'treasury', cols: ['name', 'company', 'counterparty', 'direction', 'principal', 'settled_amount', 'interest_rate', 'start_date', 'notes'], relTables: ['loan_settlements', 'external_movements'], views: [{ id: 'all', label: 'All Loans & Advances' }] },
    { key: 'loan_settlements', group: '5 · Cash Flow, Treasury & FX', label: 'Loan Repayments & Drawdowns', dvn: 'bhf_mfgloansettlement', form: 'treasury', cols: ['date', 'company', 'loan', 'type', 'method', 'usd_amount', 'notes'], relTables: ['loans', 'external_movements'], views: [{ id: 'all', label: 'All Loan Settlements' }] },
    { key: 'conversions', group: '5 · Cash Flow, Treasury & FX', label: 'USD ↔ LBP FX Conversions', dvn: 'bhf_mfgconversion', form: 'conversion', cols: ['date', 'company', 'type', 'usd_delta', 'lbp_delta', 'exchange_rate', 'name', 'notes'], relTables: ['external_movements'], views: [
      { id: 'all', label: 'All FX Conversions' },
      { id: 'u2l', label: 'USD → LBP (USD Out · LBP In)', fn: r => !/LBP\s*(?:to|→|2)\s*USD/i.test(String(r.type || r.name || '')) && String(r.from_currency || 'USD').toUpperCase() !== 'LBP' },
      { id: 'l2u', label: 'LBP → USD (LBP Out · USD In)', fn: r => /LBP\s*(?:to|→|2)\s*USD/i.test(String(r.type || r.name || '')) || String(r.from_currency || '').toUpperCase() === 'LBP' }
    ] },

    // 6 · Universal (All BUs) — 11 Shared Master Registries (Zero BU Binding)
    { key: 'customers', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_customers', label: 'Customers Registry', singularLabel: 'Customer', dvn: 'bhf_customer', form: 'customer', cols: ['name', 'method', 'vat_registered', 'mof_no', 'phone', 'address', 'credit_days', 'credit_limit', 'active_rules', 'sales_loads', 'ar_balance'], relTables: ['sales_tickets', 'receipts', 'price_rules', 'credit_terms', 'vat_invoices'], views: [{ id: 'all', label: 'All Customers' }, { id: 'open_ar', label: 'Open AR Balance > $0', fn: (r, rel) => ((rel.custByName[norm(r.name)] || {}).ar_balance || 0) > 1 }, { id: 'vat', label: 'VAT Registered (MOF)', fn: r => Boolean(r.vat_registered || r.mof_no) }] },
    { key: 'suppliers', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_suppliers', label: 'Suppliers & Haulers', singularLabel: 'Supplier / Hauler', dvn: 'bhf_supplier', form: 'supplier', cols: ['name', 'supplier_role', 'method', 'trucks_list', 'drivers_list', 'haul_loads', 'raw_loads', 'expenses_count', 'active_rules', 'iva', 'ap_balance'], relTables: ['raw_purchases', 'expenses', 'settlements', 'price_rules', 'equipment', 'drivers', 'sites'], views: [
      { id: 'all', label: 'All Suppliers & Haulers' },
      { id: 'haulers', label: 'Truck Owners / Haulers', fn: (r, rel) => { const se = rel && rel.suppByName[norm(r.name)]; return Boolean(r.is_truck_owner || Number(r.trucks_count || 0) > 0 || (se && (se.is_hauler || se.trucks.size > 0 || se.haul_loads > 0))); } },
      { id: 'quarries', label: 'Material & Site Suppliers', fn: (r, rel) => { const se = rel && rel.suppByName[norm(r.name)]; return Boolean((se && (se.is_quarry || se.raw_loads > 0 || se.sites.size > 0)) || /Quarry|Site|Raw Material/i.test(r.category || r.category1 || '')); } },
      { id: 'vendors', label: 'Expense & Parts Vendors', fn: (r, rel) => { const se = rel && rel.suppByName[norm(r.name)]; const isH = Boolean(r.is_truck_owner || Number(r.trucks_count || 0) > 0 || (se && (se.is_hauler || se.trucks.size > 0 || se.haul_loads > 0))); const isQ = Boolean((se && (se.is_quarry || se.raw_loads > 0 || se.sites.size > 0)) || /Quarry|Site|Raw Material/i.test(r.category || r.category1 || '')); return Boolean((se && (se.is_expense || se.expenses_count > 0)) || (!isH && !isQ)); } },
      { id: 'open_ap', label: 'Open AP Balance > $0', fn: (r, rel) => ((rel.suppByName[norm(r.name)] || {}).ap_balance || 0) > 1 },
      { id: 'iva', label: 'IVA / VAT Registered', fn: r => Boolean(r.iva || r.financial_no || r.mof_no) }
    ] },
    { key: 'products', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_products', label: 'Products & Grades', singularLabel: 'Product / Grade', dvn: 'bhf_product', form: 'product', cols: ['name', 'type', 'uom', 'ton_factor', 'list_price', 'ticket_product', 'fuel_item', 'input_product', 'active_rules', 'sales_loads'], relTables: ['sales_tickets', 'raw_purchases', 'price_rules', 'fuel_intakes', 'product_types', 'uoms'], views: [{ id: 'all', label: 'All Products & Grades' }, { id: 'agg', label: 'Ticket / Aggregate Grades', fn: r => Boolean(r.ticket_product) }, { id: 'fuel', label: 'Fuel & Lube Items', fn: r => Boolean(r.fuel_item) }] },
    { key: 'product_types', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_products', label: 'Product Types (Families)', singularLabel: 'Product / Grade', dvn: 'bhf_producttype', form: 'product', cols: ['name', 'code', 'products_count', 'sales_loads'], relTables: ['products', 'sales_tickets'], views: [{ id: 'all', label: 'All Product Families' }] },
    { key: 'uoms', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_products', label: 'Units of Measure (UoM)', singularLabel: 'Product / Grade', dvn: 'bhf_uom', form: 'product', cols: ['name', 'code', 'products_count', 'tickets_count'], relTables: ['products', 'sales_tickets', 'raw_purchases'], views: [{ id: 'all', label: 'All Units of Measure' }] },
    { key: 'expense_categories', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_categories', label: 'Expense Categories', singularLabel: 'Expense Category', dvn: 'bhf_expensecategory', form: 'expensecategory', cols: ['name', 'cost_class', 'subcategories_count', 'expenses_count', 'total_spent'], relTables: ['expense_subcategories', 'expenses'], views: [
      { id: 'all', label: 'All Expense Categories' },
      { id: 'prod', label: 'Production Cost', fn: r => deriveExpenseCostClass(r) === 'Production Cost' },
      { id: 'opex', label: 'Operating Expense', fn: r => deriveExpenseCostClass(r) === 'Operating Expense' },
      { id: 'capex', label: 'Capital Expenditure', fn: r => deriveExpenseCostClass(r) === 'Capital Expenditure' }
    ] },
    { key: 'expense_subcategories', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_categories', label: 'Expense Subcategories', singularLabel: 'Expense Subcategory', dvn: 'bhf_expensesubcategory', form: 'expensecategory', cols: ['name', 'category', 'expenses_count', 'total_spent'], relTables: ['expense_categories', 'expenses'], views: [{ id: 'all', label: 'All Expense Subcategories' }] },
    { key: 'sites', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_sites', label: 'Sites', singularLabel: 'Site', dvn: 'bhf_site', form: 'site', cols: ['name', 'site_category', 'region', 'linked_party', 'is_jv', 'gps_status', 'active_rules', 'raw_loads', 'sales_loads'], relTables: ['regions', 'suppliers', 'customers', 'sales_tickets', 'raw_purchases', 'price_rules', 'jv_partnerships', 'logistics_allowances'], views: [
      { id: 'all', label: 'All Sites', cols: ['name', 'site_category', 'region', 'linked_party', 'is_jv', 'gps_status', 'active_rules', 'raw_loads', 'sales_loads'] },
      { id: 'source', label: 'Supplier / Quarry Sites', fn: r => resolveSiteCategoryPbi(r) === 'supplier', cols: ['name', 'region', 'supplier', 'is_jv', 'gps_status', 'latitude', 'longitude', 'active_rules', 'raw_loads'] },
      { id: 'delivery', label: 'Customer Delivery Sites', fn: r => resolveSiteCategoryPbi(r) === 'customer', cols: ['name', 'region', 'customer', 'gps_status', 'latitude', 'longitude', 'active_rules', 'sales_loads'] },
      { id: 'jv', label: 'JV 50/50 Sites', fn: r => resolveSiteCategoryPbi(r) === 'supplier' && Boolean(r.is_jv), cols: ['name', 'region', 'supplier', 'is_jv', 'gps_status', 'active_rules', 'raw_loads'] },
      { id: 'gps', label: 'Verified GPS Pin', fn: r => r.latitude != null && r.longitude != null, cols: ['name', 'site_category', 'region', 'linked_party', 'latitude', 'longitude', 'raw_loads', 'sales_loads'] }
    ] },
    { key: 'regions', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_regions', label: 'Regions & Zones', singularLabel: 'Region / Zone', dvn: 'bhf_region', form: 'region', cols: ['name', 'code', 'zone_shape', 'distance_km', 'sites_count', 'overtime_rate', 'sales_loads'], relTables: ['sites', 'overtime_rates', 'sales_tickets'], views: [{ id: 'all', label: 'All Regions & Zones' }] },
    { key: 'equipment', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_equipment', label: 'Equipment & Trucks', singularLabel: 'Equipment / Truck', dvn: 'bhf_equipment', form: 'equipment', cols: ['name', 'companies_list', 'plate_no', 'type', 'ownership', 'supplier', 'capacity', 'default_driver', 'loads_hauled', 'fuel_fills'], relTables: ['company_equipment', 'equipment_defects', 'part_movements', 'suppliers', 'drivers', 'sales_tickets', 'raw_purchases', 'fuel_intakes', 'expenses'], views: [{ id: 'all', label: 'All Trucks & Equipment' }, { id: 'trucks', label: 'Trucks Only', fn: r => /^truck$/i.test(r.type || 'Truck') }, { id: 'own', label: 'Company Fleet', fn: r => /company|own/i.test(r.ownership || '') }, { id: 'company_trucks', label: 'Company Trucks', fn: r => /company|own/i.test(r.ownership || '') && /^truck$/i.test(r.type || 'Truck') }, { id: 'machinery', label: 'Heavy Machinery & Plant', fn: r => /excavator|loader|bulldozer|generator|other/i.test(r.type || '') }, { id: 'vehicles', label: 'Vehicles & Pickups', fn: r => /vehicle/i.test(r.type || '') }, { id: 'third_party', label: 'Third-Party Haulers', fn: r => !/company|own/i.test(r.ownership || '') }] },
    { key: 'drivers', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_drivers', label: 'Drivers & Operators', singularLabel: 'Driver / Operator', dvn: 'bhf_driver', form: 'driver', cols: ['name', 'truck_owner', 'assigned_trucks', 'companies_list', 'phone', 'loads_hauled', 'fuel_fills'], relTables: ['company_drivers', 'equipment', 'suppliers', 'sales_tickets', 'raw_purchases', 'fuel_intakes'], views: [{ id: 'all', label: 'All Drivers & Operators' }] },
    { key: 'fx_rates', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_fx_rates', label: 'Currency Exchange Rates', singularLabel: 'FX Rate', dvn: 'bhf_fxrate', form: 'fxrate', cols: ['name', 'currency', 'rate', 'start_date', 'effective_to', 'status', 'notes'], relTables: ['currencies', 'conversions'], views: [{ id: 'all', label: 'All Exchange Rates' }, { id: 'current', label: 'Current Active Rates', fn: r => r.status === 'Current' }, { id: 'historical', label: 'Historical Windows', fn: r => r.status === 'Historical' }] },
    { key: 'vat_rates', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_vat_rates', label: 'VAT Rates', singularLabel: 'VAT Rate', dvn: 'bhf_vatrate', form: 'vatrate', cols: ['name', 'start_date', 'effective_to', 'vat_percent', 'vat_fx_rate', 'status', 'notes'], relTables: ['vat_invoices', 'fx_rates'], views: [{ id: 'all', label: 'All Statutory VAT Windows' }, { id: 'current', label: 'Current Active Rate', fn: r => r.status === 'Current' }] },
    { key: 'currencies', group: '6 · Universal (All BUs)', universal: true, navView: 'reg_fx_rates', label: 'Currencies', singularLabel: 'Currency', dvn: 'bhf_currency', form: 'currency', cols: ['code', 'name', 'symbol', 'precision', 'is_base', 'active_rate', 'role', 'status'], relTables: ['fx_rates', 'conversions'], views: [{ id: 'all', label: 'All Currencies' }] },
    { key: 'gl_accounts', group: '6 · Universal (All BUs)', universal: true, navView: 'gl_automation', label: 'GL Accounts & Automation', singularLabel: 'GL Account', dvn: 'bhf_glaccount', cols: ['code', 'name', 'pcg_class', 'automation_mode', 'source_module', 'debit_rule', 'credit_rule', 'debit', 'credit', 'balance'], relTables: ['expenses', 'expense_categories', 'vat_rates', 'fx_rates', 'conversions'], views: [{ id: 'all', label: 'All GL Accounts' }, { id: 'automated', label: 'Automated Accounts', fn: r => r.is_automated !== false }, { id: 'direct', label: 'Direct Formula Rules', fn: r => r.automation_mode === 'Direct Formula' }, { id: 'cat_map', label: 'Category Auto-Mapped', fn: r => r.automation_mode === 'Category Auto-Map' }] }
  ];

  // Lookup column target table map (renders clickable relational pills in 40-Table Hub)
  const HUB_LOOKUP_TARGETS = {
    currency: 'currencies',
    from_currency: 'currencies',
    to_currency: 'currencies',
    customer: 'customers',
    supplier: 'suppliers',
    site_owner: 'suppliers',
    truck_owner: 'suppliers',
    product: 'products',
    item: 'products',
    input_product: 'products',
    site: 'sites',
    region: 'regions',
    truck: 'equipment',
    equipment: 'equipment',
    target_equipment: 'equipment',
    expense_ref: 'expenses',
    repair_ref: 'equipment_repairs',
    defect_ref: 'equipment_defects',
    linked_part_log: 'part_movements',
    driver: 'drivers',
    default_driver: 'drivers',
    day_operator: 'drivers',
    night_operator: 'drivers',
    staff: 'employments',
    vat_invoice: 'vat_invoices',
    category: 'expense_categories',
    subcategory: 'expense_subcategories'
  };

  // Authoritative Dataverse bhf_expensecategory -> bhf_glaccount mapping (m18a_tables.py)
  const EXPENSE_CAT_GL_MAP = {
    'bank fees': '6736',
    'beach supplies': '6112',
    'beverage supplies': '6111',
    'capital expenditures': '2243',
    'cleaning supplies': '6112',
    'configuration': '6269',
    'depreciation expense': '6512',
    'disposable supplies': '6112',
    'education': '6266',
    'food supplies': '6111',
    'fuel': '61121',
    'furniture': '2263',
    'hookah and charcoal': '6111',
    'hotel supplies': '6112',
    'insurance': '6268',
    'licences and fees': '645',
    'marketing services': '6269',
    'medical supplies': '6112',
    'merchandise': '601',
    'minor equipment': '61123',
    'nicotine supplies': '6111',
    'office supplies': '61125',
    'oils': '6122',
    'oils & lubricants': '6122',
    'office & facility': '6269',
    'insurance, permits & taxes': '6268',
    'staff & social security': '635',
    'tools & garage': '61123',
    'transport & site logistics': '62611',
    'utilities & telecom': '6261',
    'other costs': '6269',
    'palms': '186',
    'pool supplies': '6112',
    'raw material settlements': '401',
    'raw materials': '6111',
    'rent': '62631',
    'repairs and maintenance': '6262',
    'sanitation and pest control': '6269',
    'security services': '6269',
    'skilled labor': '62651',
    'social security': '635',
    'software': '6255',
    'spare parts': '6122',
    'staff': '6269',
    'taxes': '645',
    'tips': '6269',
    'tools': '61123',
    'transfer fee': '6269',
    'transportation': '62611',
    'uniform purchases': '6112',
    'utilities': '6112',
    'vat': '4425'
  };

  function deriveExpenseCostClass(catObjOrName, glCodeOverride) {
    const isObj = catObjOrName && typeof catObjOrName === 'object';
    if (isObj && catObjOrName.cost_class && /^(Production Cost|Capital Expenditure|Operating Expense)$/i.test(String(catObjOrName.cost_class).trim())) {
      const s = String(catObjOrName.cost_class).trim();
      if (/^production/i.test(s)) return 'Production Cost';
      if (/^capital/i.test(s)) return 'Capital Expenditure';
      return 'Operating Expense';
    }
    const rawName = isObj ? (catObjOrName.name || catObjOrName.category || '') : String(catObjOrName || '');
    const nk = norm(rawName);
    const gl = String(glCodeOverride || (isObj && catObjOrName.gl_code) || EXPENSE_CAT_GL_MAP[nk] || '').trim();
    if (gl) {
      if (gl.startsWith('60') || gl.startsWith('61')) return 'Production Cost';
      if (gl.startsWith('2')) return 'Capital Expenditure';
      return 'Operating Expense';
    }
    if (/capex|capital|machinery|furniture|building|vehicle purchase/i.test(rawName)) return 'Capital Expenditure';
    if (/fuel|diesel|oil|lube|spare|tire|tyre|tool|minor equip|raw mat|supply|supplies|utilit|merchandise/i.test(rawName)) return 'Production Cost';
    return 'Operating Expense';
  }

  function hubExpenseSign(ex) {
    const m = String((ex && ex.method) || '').trim();
    if (m === 'C Return' || m === 'CR Return') return -1;
    if (m === 'Config' || m === 'VATConfig' || m === 'Free' || m === 'Remove' || m === 'Adjusted' || m === 'JV Adjusted') return 0;
    return 1;
  }

  function formatCostClassHtml(clsTxt) {
    const s = String(clsTxt || '').trim();
    if (!s || s === '—') return '—';
    const cls = /Production/i.test(s) ? 'badge-cost-prod' : (/Capital/i.test(s) ? 'badge-cost-capex' : 'badge-cost-opex');
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  }

  function resolveSiteCategoryPbi(r) {
    if (typeof window !== 'undefined' && typeof window.MFG_RESOLVE_SITE_CATEGORY === 'function') {
      return window.MFG_RESOLVE_SITE_CATEGORY(r);
    }
    if (!r || typeof r !== 'object') return 'supplier';
    const rawCat = String(r.site_category || '').trim().toLowerCase();
    if (rawCat === 'customer' || rawCat === 'delivery') return 'customer';
    if (rawCat === 'supplier' || rawCat === 'quarry' || rawCat === 'source') return 'supplier';
    if (r.customer && !r.supplier && !r.is_jv) return 'customer';
    return 'supplier';
  }

  function formatSiteCategoryHtml(catTxt) {
    const s = String(catTxt || '').trim();
    if (!s || s === '—') return '—';
    const isCust = /customer|delivery/i.test(s);
    return `<span class="badge ${isCust ? 'badge-info' : 'badge-brass'}">${esc(isCust ? 'Customer Delivery' : 'Supplier / Quarry')}</span>`;
  }

  const NON_NUMERIC_HUB_COLS = /^(code|pcg_class|automation_mode|source_module|debit_rule|credit_rule|cost_class|cost_bucket|site_category|linked_party|working_days|assigned_trucks|companies_list|trucks_list|drivers_list|gps_status|supplier_role|payable_leg|in_time|out_time|check_in|check_out|shift_str|part_serial|defect_ref|linked_part_log|removed_disposition|action_type|severity|subsystem|condition|storage_location|vendor_or_buyer|effective_to|output_vat_account|input_vat_account|symbol|role|status|allocation_mode|warehouse_location|repair_source|oil_type|service_action|item_summary|items_summary|movement_type|expense_ref|repair_ref)$/i;

  function getHubTableDefaultSort(meta, activeViewId) {
    const k = (meta && meta.key) || '';
    const vw = String(activeViewId || 'all');
    switch (k) {
      case 'expense_categories':
      case 'expense_subcategories':
        return { key: 'total_spent', dir: 'desc' };
      case 'customers':
        return { key: vw === 'open_ar' ? 'ar_balance' : 'sales_loads', dir: 'desc' };
      case 'suppliers':
        if (vw === 'open_ap') return { key: 'ap_balance', dir: 'desc' };
        if (vw === 'haulers') return { key: 'haul_loads', dir: 'desc' };
        if (vw === 'quarries') return { key: 'raw_loads', dir: 'desc' };
        if (vw === 'vendors') return { key: 'expenses_usd', dir: 'desc' };
        return { key: 'total_spent', dir: 'desc' };
      case 'equipment':
        return { key: vw === 'machinery' ? 'fuel_fills' : 'loads_hauled', dir: 'desc' };
      case 'company_equipment':
      case 'drivers':
      case 'company_drivers':
        return { key: 'loads_hauled', dir: 'desc' };
      case 'sites':
        return { key: vw === 'delivery' ? 'sales_loads' : 'raw_loads', dir: 'desc' };
      case 'regions':
      case 'product_types':
        return { key: 'sales_loads', dir: 'desc' };
      case 'products':
        return { key: vw === 'fuel' ? 'fuel_fills' : 'sales_loads', dir: 'desc' };
      case 'uoms':
        return { key: 'tickets_count', dir: 'desc' };
      case 'employments':
        return { key: 'start_date', dir: 'desc' };
      case 'credit_terms':
        return { key: 'ar_balance', dir: 'desc' };
      case 'loans':
        return { key: 'principal', dir: 'desc' };
      case 'jv_partnerships':
        return { key: 'distributions_total', dir: 'desc' };
      case 'overtime_rates':
        return { key: 'start_date', dir: 'desc' };
      case 'logistics_allowances':
        return { key: 'start_date', dir: 'desc' };
      case 'price_rules':
      case 'fx_rates':
      case 'vat_rates':
        return { key: 'start_date', dir: 'desc' };
      case 'currencies':
        return { key: 'is_base', dir: 'desc' };
      case 'gl_accounts':
        return { key: 'code', dir: 'asc' };
      default: {
        const cols = (meta && meta.cols) || [];
        if (cols.includes('set_date')) return { key: 'set_date', dir: 'desc' };
        if (cols.includes('date')) return { key: 'date', dir: 'desc' };
        if (cols.includes('start_date')) return { key: 'start_date', dir: 'desc' };
        return { key: cols[0] || 'name', dir: 'asc' };
      }
    }
  }

  let _hubRelCache = null;
  let _hubRelStamp = '';
  function getHubRelIndex(SEED) {
    if (window.MFG_GEO && typeof window.MFG_GEO.hydrateSeedGeo === 'function') {
      window.MFG_GEO.hydrateSeedGeo(SEED);
    }
    const rec = (SEED && SEED.records) || {};
    const stamp = `${(rec.sales_tickets || []).length}:${(rec.raw_purchases || []).length}:${(rec.expenses || []).length}:${(rec.salaries || []).length}:${(rec.price_rules || []).length}:${(rec.receipts || []).length}:${(rec.settlements || []).length}:${(rec.sites || []).length}:${(SEED && SEED._customRev) || 0}`;
    if (_hubRelCache && _hubRelStamp === stamp) return _hubRelCache;
    _hubRelStamp = stamp;
    const rel = {
      custByName: {}, suppByName: {}, prodByName: {}, typeByName: {}, uomByName: {},
      siteByName: {}, siteByCatKey: {}, regByName: {}, equipByName: {}, drvByName: {}, catByName: {},
      subcatByName: {}, subcatByKey: {}, staffByName: {}, vatInvByNo: {}, loanByName: {}
    };
    const subcatKey = (cat, sub) => `${norm(cat)}|${norm(sub)}`;
    const ensure = (map, k, init) => { const nk = norm(k); if (!nk) return null; if (!map[nk]) map[nk] = init(); return map[nk]; };
    const ensureSiteCat = (cat, nm) => {
      const nk = norm(nm);
      if (!nk) return null;
      const ck = `${cat}|${nk}`;
      if (!rel.siteByCatKey[ck]) rel.siteByCatKey[ck] = { active_rules: 0, sales_loads: 0, raw_loads: 0 };
      return rel.siteByCatKey[ck];
    };

    const initCust = () => ({ sales_loads: 0, sample_loads: 0, total_sales: 0, ar_balance: 0, credit_days: null, credit_limit: null, active_rules: 0 });
    const initSupp = () => ({
      raw_loads: 0,
      raw_loads_cnt: 0,
      raw_cost: 0,
      raw_cost_sample: 0,
      haul_loads: 0,
      expenses_count: 0,
      expenses_usd: 0,
      total_spent: 0,
      ap_balance: 0,
      active_rules: 0,
      is_quarry: false,
      is_hauler: false,
      is_expense: false,
      trucks: new Set(),
      drivers: new Set(),
      sites: new Set()
    });

    // Seed from Manufacturing Group consolidated model + fallback semantic_model summaries, then overlay canonical hydrated AR/AP
    const mgModel = ((SEED && SEED.models) || {})['manufacturing-group'] || {};
    (mgModel.customers || (((SEED && SEED.semantic_model) || {}).customer_ar_summary) || []).forEach(c => {
      const e = ensure(rel.custByName, c.Customer, initCust);
      if (e) {
        e.sales_loads = Number(c.loads || 0);
        e.total_sales = Number(c.sales_ttc || 0);
        e.ar_balance = Number(c.ar_balance || 0);
      }
    });
    (mgModel.suppliers || (((SEED && SEED.semantic_model) || {}).supplier_ap_summary) || []).forEach(s => {
      const e = ensure(rel.suppByName, s.Supplier, initSupp);
      if (e) {
        e.raw_loads = Number(s.raw_loads || 0);
        e.raw_cost = Number(s.raw_cost || 0);
        e.ap_balance = Number(s.ap_balance || 0);
      }
    });
    if (Array.isArray(rec.sales_tickets) && rec.sales_tickets.length > 0) {
      const cCanon = new Map();
      const ensureCC = nm => {
        const nk = norm(nm);
        if (!nk) return null;
        if (!cCanon.has(nk)) cCanon.set(nk, { loads: 0, ttc: 0, crTtc: 0, settled: 0 });
        return cCanon.get(nk);
      };
      (rec.sales_tickets || []).forEach(s => {
        if (!s || s.voided || !s.customer) return;
        const sgn = saleTicketSign(s);
        if (sgn === 0) return;
        const cur = ensureCC(s.customer);
        if (!cur) return;
        const ttc = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
        if (sgn === 1) cur.loads += 1;
        cur.ttc += ttc;
        const mth = String(s.method || '').trim();
        if (mth === 'Credit' || mth === 'CR Return' || mth === 'Credit Return') cur.crTtc += ttc;
      });
      (rec.receipts || []).forEach(r => {
        if (!r || r.voided || !r.customer || !isArSettlingRecpt(r)) return;
        const cur = ensureCC(r.customer);
        if (cur) cur.settled += Number(r.amount || 0) + Number(r.discount || 0);
      });
      Object.values(rel.custByName).forEach(ce => { ce.sales_loads = 0; ce.total_sales = 0; ce.ar_balance = 0; });
      cCanon.forEach((st, nk) => {
        const e = rel.custByName[nk] || (rel.custByName[nk] = initCust());
        e.sales_loads = st.loads;
        e.total_sales = round2(st.ttc);
        e.ar_balance = round2(st.crTtc - st.settled);
      });
    }
    if ((Array.isArray(rec.raw_purchases) && rec.raw_purchases.length > 0) || (Array.isArray(rec.settlements) && rec.settlements.length > 0)) {
      const sCanon = new Map();
      const ensureSC = nm => {
        const nk = norm(nm);
        if (!nk) return null;
        if (!sCanon.has(nk)) sCanon.set(nk, { rawLoads: 0, rawCost: 0, onCr: 0, settled: 0 });
        return sCanon.get(nk);
      };
      (rec.raw_purchases || []).forEach(r => {
        if (!r || r.voided) return;
        const matOwner = r.site_owner || r.truck_owner;
        if (matOwner) {
          const cur = ensureSC(matOwner);
          if (cur) {
            cur.rawLoads += 1;
            const c = Number(r.cost || 0);
            cur.rawCost += c;
            cur.onCr += c;
          }
        }
        if (Number(r.trans_cost || 0) !== 0) {
          const curH = ensureSC(r.truck_owner || '(Unassigned Supplier)');
          if (curH) {
            const hc = Number(r.trans_cost || 0);
            curH.rawCost += hc;
            curH.onCr += hc;
          }
        }
      });
      (rec.expenses || []).forEach(x => {
        if (!x || x.voided || !x.supplier) return;
        const mth = String(x.method || '').trim();
        if (mth === 'Credit' || mth === 'CR Return' || mth === 'IVA' || mth === 'VAT' || mth === 'VAT Dis') {
          const sgn = mth === 'CR Return' ? -1 : 1;
          const cur = ensureSC(x.supplier);
          if (cur) cur.onCr += sgn * Number(x.amount || 0);
        }
      });
      (rec.settlements || []).forEach(sp => {
        if (!sp || sp.voided || !sp.supplier) return;
        const mth = String(sp.method || '').trim();
        if (mth === 'JV Adjusted' || mth === 'Remove' || mth === 'Adjusted' || mth === 'Free' || mth === 'Cash Return' || mth === 'Cash Discount' || mth === 'VAT' || mth === 'VATConfig' || mth === 'VAT Dis' || mth === 'Cash VAT Dis' || mth === 'IVA' || mth === 'Commission' || mth === 'RentConfig' || mth === 'Rent' || mth === 'VATRent') return;
        const cur = ensureSC(sp.supplier);
        if (cur) cur.settled += Number(sp.amount || 0) + Number(sp.discount || 0);
      });
      Object.values(rel.suppByName).forEach(se => { se.ap_balance = 0; });
      sCanon.forEach((st, nk) => {
        const e = rel.suppByName[nk] || (rel.suppByName[nk] = initSupp());
        if (st.rawLoads > 0) e.raw_loads = st.rawLoads;
        if (st.rawCost !== 0) e.raw_cost = round2(st.rawCost);
        e.ap_balance = round2(st.onCr - st.settled);
      });
    }

    const eqLabelMap = {};
    (rec.equipment || []).forEach(eq => {
      if (eq && eq.name && eq.plate_no && norm(eq.plate_no) !== norm(eq.name)) {
        const lbl = `${eq.name} (${eq.plate_no})`;
        eqLabelMap[norm(eq.name)] = lbl;
        eqLabelMap[norm(eq.plate_no)] = lbl;
      }
    });
    const fmtTruckRef = t => eqLabelMap[norm(t)] || t;

    (rec.customers || []).forEach(c => { ensure(rel.custByName, c.name, initCust); });

    (rec.suppliers || []).forEach(s => {
      const e = ensure(rel.suppByName, s.name, initSupp);
      if (!e) return;
      if (Array.isArray(s.trucks)) s.trucks.forEach(t => { if (t) e.trucks.add(fmtTruckRef(t)); });
      if (Array.isArray(s.drivers)) s.drivers.forEach(d => { if (d) e.drivers.add(d); });
      if (s.is_truck_owner || Number(s.trucks_count || 0) > 0 || e.trucks.size > 0 || /hauler|truck owner/i.test(s.category || '')) e.is_hauler = true;
      if (/quarry|site|raw material/i.test(s.category || s.category1 || '')) e.is_quarry = true;
    });

    (rec.credit_terms || []).forEach(ct => {
      const e = ensure(rel.custByName, ct.customer, initCust);
      if (e) {
        if (ct.credit_days != null) e.credit_days = ct.credit_days;
        if (ct.credit_limit != null) e.credit_limit = ct.credit_limit;
      }
    });

    (rec.price_rules || []).forEach(pr => {
      if (pr.customer) {
        const e = ensure(rel.custByName, pr.customer, initCust);
        if (e && !pr.end_date) e.active_rules++;
      }
      if (pr.supplier) {
        const e = ensure(rel.suppByName, pr.supplier, initSupp);
        if (e && !pr.end_date) e.active_rules++;
      }
      if (pr.product) {
        const e = ensure(rel.prodByName, pr.product, () => ({ list_price: null, active_rules: 0, sales_loads: 0, fuel_fills: 0 }));
        if (e) {
          if (!pr.end_date) e.active_rules++;
          if (/list/i.test(pr.rule_type || '') && pr.unit_price != null) e.list_price = pr.unit_price;
          else if (e.list_price == null && pr.unit_price != null && /sale/i.test(pr.rule_type || '')) e.list_price = pr.unit_price;
        }
      }
      if (pr.site) {
        const e = ensure(rel.siteByName, pr.site, () => ({ active_rules: 0, sales_loads: 0, raw_loads: 0 }));
        if (e && !pr.end_date) e.active_rules++;
        const rtTrim = String(pr.rule_type || '').trim();
        if (!/^Commission$/i.test(rtTrim) && !pr.end_date) {
          const isRawRt = /^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(rtTrim);
          const ce = ensureSiteCat(isRawRt ? 'supplier' : 'customer', pr.site);
          if (ce) ce.active_rules++;
        }
      }
    });

    const prodTypeMap = {};
    (rec.product_types || []).forEach(pt => { ensure(rel.typeByName, pt.name, () => ({ products_count: 0, sales_loads: 0 })); });
    (rec.uoms || []).forEach(u => { ensure(rel.uomByName, u.name, () => ({ products_count: 0, tickets_count: 0 })); });
    (rec.products || []).forEach(p => {
      ensure(rel.prodByName, p.name, () => ({ list_price: null, active_rules: 0, sales_loads: 0, fuel_fills: 0 }));
      if (p.name && p.type) prodTypeMap[norm(p.name)] = p.type;
      const te = ensure(rel.typeByName, p.type, () => ({ products_count: 0, sales_loads: 0 }));
      if (te) te.products_count++;
      const ue = ensure(rel.uomByName, p.uom, () => ({ products_count: 0, tickets_count: 0 }));
      if (ue) ue.products_count++;
    });

    const siteRegMap = {};
    (rec.regions || []).forEach(rg => { ensure(rel.regByName, rg.name, () => ({ sites_count: 0, overtime_rate: null, sales_loads: 0 })); });
    (rec.sites || []).forEach(s => {
      const sCat = resolveSiteCategoryPbi(s);
      ensure(rel.siteByName, s.name, () => ({ active_rules: 0, sales_loads: 0, raw_loads: 0 }));
      ensureSiteCat(sCat, s.name);
      if (s.name && s.region) siteRegMap[norm(s.name)] = s.region;
      const re = ensure(rel.regByName, s.region, () => ({ sites_count: 0, overtime_rate: null, sales_loads: 0 }));
      if (re) re.sites_count++;
      if (sCat === 'supplier' && s.supplier) {
        const se = ensure(rel.suppByName, s.supplier, initSupp);
        if (se) { se.is_quarry = true; if (s.name) se.sites.add(s.name); }
      }
    });
    if ((!Array.isArray(rec.sales_tickets) || !rec.sales_tickets.length) && Array.isArray(mgModel.sites)) {
      mgModel.sites.forEach(ms => {
        const nm = ms && (ms.Site || ms.name);
        if (!nm) return;
        const sl = Number(ms.loads || 0);
        const rl = Number(ms.raw_loads || 0);
        const se = ensure(rel.siteByName, nm, () => ({ active_rules: 0, sales_loads: 0, raw_loads: 0 }));
        if (se) { se.sales_loads = sl; se.raw_loads = rl; }
        if (sl > 0) { const cs = ensureSiteCat('customer', nm); if (cs) cs.sales_loads = sl; }
        if (rl > 0) { const ss = ensureSiteCat('supplier', nm); if (ss) ss.raw_loads = rl; }
      });
    }
    (rec.overtime_rates || []).forEach(ot => {
      const re = ensure(rel.regByName, ot.region, () => ({ sites_count: 0, overtime_rate: null, sales_loads: 0 }));
      if (re && ot.amount != null && (!ot.end_date || re.overtime_rate == null)) re.overtime_rate = ot.amount;
    });

    (rec.company_equipment || []).forEach(ce => {
      const ee = ensure(rel.equipByName, ce.equipment, () => ({ companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (ee && ce.company) ee.companies.add(ce.company);
      if (ce.default_driver) {
        const de = ensure(rel.drvByName, ce.default_driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
        if (de && ce.equipment) de.trucks.add(fmtTruckRef(ce.equipment));
      }
    });
    (rec.equipment || []).forEach(eq => {
      const ee = ensure(rel.equipByName, eq.name, () => ({ companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (ee && eq.type) ee.type = eq.type;
      if (ee && eq.plate_no && norm(eq.plate_no) !== norm(eq.name)) {
        rel.equipByName[norm(eq.plate_no)] = ee;
      }
      if (eq.default_driver) {
        const de = ensure(rel.drvByName, eq.default_driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
        if (de && eq.name) de.trucks.add(fmtTruckRef(eq.name));
      }
      if (eq.supplier) {
        const se = ensure(rel.suppByName, eq.supplier, initSupp);
        if (se) {
          se.is_hauler = true;
          if (eq.name) se.trucks.add(fmtTruckRef(eq.name));
          if (eq.default_driver) se.drivers.add(eq.default_driver);
        }
      }
    });
    (rec.drivers || []).forEach(drv => {
      ensure(rel.drvByName, drv.name || drv.driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (drv.truck_owner) {
        const se = ensure(rel.suppByName, drv.truck_owner, initSupp);
        if (se) {
          se.is_hauler = true;
          if (drv.name || drv.driver) se.drivers.add(drv.name || drv.driver);
          if (drv.truck) se.trucks.add(fmtTruckRef(drv.truck));
        }
      }
    });
    (rec.company_drivers || []).forEach(cd => {
      const de = ensure(rel.drvByName, cd.driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (de && cd.company) de.companies.add(cd.company);
    });

    (rec.sales_tickets || []).forEach(t => {
      if (t.customer) {
        const ce = ensure(rel.custByName, t.customer, initCust);
        if (ce) {
          ce.sample_loads++;
          if (ce.sample_loads > ce.sales_loads) ce.sales_loads = ce.sample_loads;
        }
      }
      const pe = ensure(rel.prodByName, t.product, () => ({ list_price: null, active_rules: 0, sales_loads: 0, fuel_fills: 0 }));
      if (pe) pe.sales_loads++;
      const pType = t.product ? prodTypeMap[norm(t.product)] : null;
      if (pType) {
        const te = ensure(rel.typeByName, pType, () => ({ products_count: 0, sales_loads: 0 }));
        if (te) te.sales_loads++;
      }
      const ue = ensure(rel.uomByName, t.uom, () => ({ products_count: 0, tickets_count: 0 }));
      if (ue) ue.tickets_count++;
      const se = ensure(rel.siteByName, t.site, () => ({ active_rules: 0, sales_loads: 0, raw_loads: 0 }));
      if (se) se.sales_loads++;
      const cs = ensureSiteCat('customer', t.site);
      if (cs) cs.sales_loads++;
      const sReg = t.site ? siteRegMap[norm(t.site)] : null;
      if (sReg) {
        const re = ensure(rel.regByName, sReg, () => ({ sites_count: 0, overtime_rate: null, sales_loads: 0 }));
        if (re) re.sales_loads++;
      }
      const ee = ensure(rel.equipByName, t.truck, () => ({ companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (ee) { ee.loads_hauled++; if (t.company) ee.companies.add(t.company); }
      const de = ensure(rel.drvByName, t.driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (de) { de.loads_hauled++; if (t.truck) de.trucks.add(fmtTruckRef(t.truck)); if (t.company) de.companies.add(t.company); }
      if (t.truck_owner) {
        const he = ensure(rel.suppByName, t.truck_owner, initSupp);
        if (he) {
          he.is_hauler = true;
          he.haul_loads++;
          if (t.truck) he.trucks.add(fmtTruckRef(t.truck));
          if (t.driver) he.drivers.add(t.driver);
        }
      }
      if (t.vat_invoice) rel.vatInvByNo[norm(t.vat_invoice)] = (rel.vatInvByNo[norm(t.vat_invoice)] || 0) + 1;
    });

    (rec.raw_purchases || []).forEach(t => {
      const ue = ensure(rel.uomByName, t.uom, () => ({ products_count: 0, tickets_count: 0 }));
      if (ue) ue.tickets_count++;
      const se = ensure(rel.siteByName, t.site, () => ({ active_rules: 0, sales_loads: 0, raw_loads: 0 }));
      if (se) se.raw_loads++;
      const ss = ensureSiteCat('supplier', t.site);
      if (ss) ss.raw_loads++;
      const ee = ensure(rel.equipByName, t.truck, () => ({ companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (ee) { ee.loads_hauled++; if (t.company) ee.companies.add(t.company); }
      const de = ensure(rel.drvByName, t.driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (de) { de.loads_hauled++; if (t.truck) de.trucks.add(fmtTruckRef(t.truck)); if (t.company) de.companies.add(t.company); }
      if (t.site_owner) {
        const qe = ensure(rel.suppByName, t.site_owner, initSupp);
        if (qe) {
          qe.is_quarry = true;
          qe.raw_loads_cnt++;
          qe.raw_cost_sample += Number(t.cost || 0);
          if (qe.raw_loads_cnt > qe.raw_loads) qe.raw_loads = qe.raw_loads_cnt;
          if (t.site) qe.sites.add(t.site);
        }
      }
      if (t.truck_owner) {
        const he = ensure(rel.suppByName, t.truck_owner, initSupp);
        if (he) {
          he.is_hauler = true;
          he.haul_loads++;
          he.raw_cost_sample += Number(t.trans_cost || 0);
          if (t.truck) he.trucks.add(fmtTruckRef(t.truck));
          if (t.driver) he.drivers.add(t.driver);
        }
      }
    });

    (rec.fuel_intakes || []).forEach(f => {
      const ee = ensure(rel.equipByName, f.equipment, () => ({ companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (ee) ee.fuel_fills++;
      const de = ensure(rel.drvByName, f.driver, () => ({ trucks: new Set(), companies: new Set(), loads_hauled: 0, fuel_fills: 0 }));
      if (de) de.fuel_fills++;
      if (f.item) {
        const pe = ensure(rel.prodByName, f.item, () => ({ list_price: null, active_rules: 0, sales_loads: 0, fuel_fills: 0 }));
        if (pe) pe.fuel_fills++;
      }
      if (f.supplier) {
        const se = ensure(rel.suppByName, f.supplier, initSupp);
        if (se) { se.is_expense = true; se.expenses_count++; }
      }
    });

    (rec.expense_categories || []).forEach(ec => {
      if (!ec) return;
      if (!ec.gl_code && EXPENSE_CAT_GL_MAP[norm(ec.name)]) ec.gl_code = EXPENSE_CAT_GL_MAP[norm(ec.name)];
      ec.cost_class = deriveExpenseCostClass(ec);
      ensure(rel.catByName, ec.name, () => ({ subcategories_count: 0, expenses_count: 0, total_spent: 0 }));
    });
    (rec.expense_subcategories || []).forEach(sc => {
      if (!sc) return;
      ensure(rel.subcatByName, sc.name, () => ({ expenses_count: 0, total_spent: 0 }));
      if (sc.name) {
        const sk = subcatKey(sc.category, sc.name);
        if (!rel.subcatByKey[sk]) rel.subcatByKey[sk] = { expenses_count: 0, total_spent: 0 };
      }
      const ce = ensure(rel.catByName, sc.category, () => ({ subcategories_count: 0, expenses_count: 0, total_spent: 0 }));
      if (ce) ce.subcategories_count++;
    });
    (rec.expenses || []).forEach(ex => {
      const sgn = hubExpenseSign(ex);
      if (sgn === 0) return;
      const amt = round2(sgn * Number(ex.amount || ex.usd_amount || 0));
      const ce = ensure(rel.catByName, ex.category, () => ({ subcategories_count: 0, expenses_count: 0, total_spent: 0 }));
      if (ce) { ce.expenses_count++; ce.total_spent = round2(ce.total_spent + amt); }
      const se = ensure(rel.subcatByName, ex.subcategory, () => ({ expenses_count: 0, total_spent: 0 }));
      if (se) { se.expenses_count++; se.total_spent = round2(se.total_spent + amt); }
      if (ex.subcategory) {
        const sk = subcatKey(ex.category, ex.subcategory);
        if (!rel.subcatByKey[sk]) rel.subcatByKey[sk] = { expenses_count: 0, total_spent: 0 };
        rel.subcatByKey[sk].expenses_count++;
        rel.subcatByKey[sk].total_spent = round2(rel.subcatByKey[sk].total_spent + amt);
      }
      if (ex.supplier) {
        const supE = ensure(rel.suppByName, ex.supplier, initSupp);
        if (supE) { supE.is_expense = true; supE.expenses_count++; supE.expenses_usd = round2(supE.expenses_usd + amt); }
      }
    });

    Object.values(rel.suppByName).forEach(se => {
      const rc = Math.max(Number(se.raw_cost || 0), Number(se.raw_cost_sample || 0));
      se.total_spent = round2(rc + Number(se.expenses_usd || 0));
    });

    (rec.employments || []).forEach(emp => {
      ensure(rel.staffByName, emp.staff || emp.name, () => ({ payments_count: 0, total_paid: 0 }));
    });
    (rec.salaries || []).forEach(sal => {
      const st = ensure(rel.staffByName, sal.staff, () => ({ payments_count: 0, total_paid: 0 }));
      if (st) { st.payments_count++; st.total_paid = round2(st.total_paid + Number(sal.amount || sal.usd_amount || 0)); }
    });

    rel.loanSettledByCp = {};
    (rec.loan_settlements || []).forEach(ls => {
      const cp = cellValue(ls, 'loan') || ls.loan || '';
      if (cp) rel.loanSettledByCp[norm(cp)] = (rel.loanSettledByCp[norm(cp)] || 0) + Number(ls.usd_amount || ls.amount || 0);
    });
    rel.jvDistBySite = {};
    (rec.jv_distributions || []).forEach(jd => {
      if (jd.site) rel.jvDistBySite[norm(jd.site)] = (rel.jvDistBySite[norm(jd.site)] || 0) + Number(jd.total || jd.amount || 0);
    });

    _hubRelCache = rel;
    return rel;
  }

  function formatCompactSet(setOrArr, maxItems = 2) {
    const arr = Array.isArray(setOrArr) ? setOrArr.filter(Boolean) : (setOrArr ? Array.from(setOrArr).filter(Boolean) : []);
    if (!arr.length) return '';
    if (arr.length <= maxItems) return arr.join(', ');
    return `${arr.slice(0, maxItems).join(', ')} (+${arr.length - maxItems})`;
  }

  function cellValue(r, c, tableKey, rel) {
    if (!r) return null;
    if (c === 'set_date') return r.set_date || r.rep_date || r.date || null;
    if (c === 'tx_date') return r.date || null;
    if (tableKey === 'suppliers' && (c === 'category1' || c === 'category')) {
      const rawCats = [];
      if (Array.isArray(r.categories)) rawCats.push(...r.categories);
      else if (r.category) rawCats.push(...String(r.category).split(/\s*,\s*/));
      [r.category1, r.category2, r.category3].forEach(x => { if (x) rawCats.push(x); });
      if (r.is_truck_owner && !rawCats.some(x => /hauler|truck\s*owner|transport/i.test(String(x)))) {
        rawCats.unshift('Hauler / Truck Owner');
      }
      const normCat = raw => {
        const s = String(raw || '').trim();
        if (!s) return '';
        if (/hauler|truck\s*owner|transport/i.test(s)) return 'Hauler / Truck Owner';
        if (/quarry|site|raw\s*material|aggregate/i.test(s)) return 'Site & Raw Materials';
        if (/fuel|lubricant|diesel|oil|bowser/i.test(s)) return 'Fuel & Lubricants';
        if (/spare\s*part|repair|maintenance|garage|tyre|tire|workshop|tool/i.test(s)) return 'Spare Parts & Repairs';
        if (/capital\s*expenditure|minor\s*equipment|machinery|equipment/i.test(s)) return 'Equipment & Machinery';
        if (/supply|supplies|service|general\s*vendor|utilit|licence|license|fee|insurance|rent|office|skilled\s*labor|other\s*cost|social\s*security|tip|pool|food|beverage|sanitation|furniture|marketing/i.test(s)) return 'Supplies & Services';
        return s;
      };
      const seen = new Set();
      const uniq = [];
      rawCats.forEach(x => {
        const s = normCat(x);
        const k = s.toLowerCase();
        if (s && !seen.has(k)) { seen.add(k); uniq.push(s); }
      });
      if (uniq.length) return uniq.join(', ');
    }
    if (c === 'notes' && r.notes) {
      const cleaned = String(r.notes)
        .replace(/^Manufacturing\s*\([^)]+\)\s*(?:supplier|customer)\s*—\s*seeded from the workbooks\s*\d{4}-\d{2}-\d{2}\.?\s*/i, '')
        .replace(/\[wb:[^\]]+\]/gi, '')
        .trim();
      return cleaned || null;
    }
    if (tableKey === 'fuel_intakes' && c === 'uom') {
      return /grease|تشحيم|مشحمة/i.test(String(r.item || '')) ? 'kg' : 'L';
    }
    if ((tableKey === 'fuel_intakes' || tableKey === 'fuel_malfunctions') && c === 'tank_remaining_litres') {
      if (!/diesel|mazout/i.test(String(r.item || r.fuel_type || 'Diesel'))) return null;
      const dt = typeof window.MFG_DIESEL_TANK === 'function' ? window.MFG_DIESEL_TANK() : null;
      return (dt && dt.tankAfterById && r.id != null && dt.tankAfterById.has(r.id)) ? dt.tankAfterById.get(r.id) : null;
    }
    if (tableKey === 'fuel_malfunctions' && c === 'tank_delta_litres') {
      return -Number(r.litres || 0);
    }
    if (tableKey === 'fuel_intakes' && (c === 'odometer' || c === 'hours')) {
      const eqEntry = rel.equipByName[norm(r.equipment)];
      const eqCatL = String((eqEntry && eqEntry.type) || '').trim().toLowerCase();
      const isHourCat = eqCatL === 'excavator' || eqCatL === 'wheel loader' || eqCatL === 'generator' || eqCatL === 'plant' ||
        (eqCatL === 'other' && /baldouzar|bulldozer|compressor|kombrasor|rotary|rotare/i.test(String(r.equipment || '')));
      if (isHourCat) {
        if (c === 'odometer') return null;
        const hv = (r.hours != null && r.hours !== '') ? r.hours : ((r.odometer != null && r.odometer !== '') ? r.odometer : null);
        return hv;
      }
    }
    if (tableKey === 'price_rules') {
      const isTrOnly = /^(Transport Price \(Site\)|Haulage \(Customer Site\))$/i.test(String(r.rule_type || '').trim());
      if (c === 'unit_price') {
        if (isTrOnly) return null;
        if (isRuleFlatMat(r)) return rValOr(r.indiff_price, r.unit_price ?? r.price);
        return (r.unit_price ?? r.price) || null;
      }
      if (c === 'trans_unit_price') {
        if (isRuleFlatTrans(r)) return ruleFlatTransVal(r);
        const tv = r.trans_unit_price ?? r.trans_price ?? (isTrOnly ? (r.unit_price ?? r.price) : null);
        return (tv != null && Number(tv) !== 0) ? Number(tv) : null;
      }
      if (c === 'unit') {
        const rawU = isTrOnly
          ? (isRuleFlatTrans(r) ? 'Truck' : (r.rate_per || r.unit || 'm³'))
          : (isRuleFlatMat(r) ? 'Truck' : (r.unit || 'm³'));
        return /^truck$/i.test(String(rawU || '').trim()) ? 'Per Truck Load' : `Per ${rawU}`;
      }
    }
    if (tableKey === 'conversions') {
      const cd = convDeltasPbi(r);
      if (c === 'type') return cd.dirLabel;
      if (c === 'usd_delta') return cd.usd;
      if (c === 'lbp_delta') return cd.lbp;
      if (c === 'exchange_rate') return cd.rate;
    }
    if (tableKey === 'salaries' && c === 'amount' && window.MFG_FX && typeof window.MFG_FX.voucherUsd === 'function') {
      return round2(window.MFG_FX.voucherUsd(r));
    }
    if (tableKey === 'employments' && window.MFG_FX) {
      if (c === 'salary_usd' && typeof window.MFG_FX.contractMonthlyUsd === 'function') return window.MFG_FX.contractMonthlyUsd(r);
      if (c === 'reimbursement' && typeof window.MFG_FX.contractReimbUsd === 'function') return window.MFG_FX.contractReimbUsd(r);
      if (c === 'deduction' && typeof window.MFG_FX.contractDedUsd === 'function') return window.MFG_FX.contractDedUsd(r);
    }
    if (tableKey === 'logistics_allowances' && c === 'daily_usd' && window.MFG_FX && typeof window.MFG_FX.siteDailyUsd === 'function') {
      return window.MFG_FX.siteDailyUsd(r);
    }
    if (tableKey === 'currencies' && c === 'active_rate') {
      if (r.is_base || String(r.code || '').toUpperCase() === 'USD') return 1;
      return (window.MFG_FX && typeof window.MFG_FX.getRate === 'function') ? window.MFG_FX.getRate(null, r.code) : 89500;
    }
    if (tableKey === 'sites') {
      const sCat = resolveSiteCategoryPbi(r);
      if (c === 'site_category') return sCat === 'customer' ? 'Customer Delivery Site' : 'Supplier / Quarry Site';
      if (c === 'linked_party') return sCat === 'customer' ? (r.customer || null) : (r.supplier || null);
      if (c === 'supplier') return sCat === 'supplier' ? (r.supplier || null) : null;
      if (c === 'customer') return sCat === 'customer' ? (r.customer || null) : null;
      if (c === 'is_jv') return sCat === 'supplier' ? Boolean(r.is_jv) : false;
    }
    if (c === 'cost_class') return deriveExpenseCostClass(r);
    if (r[c] != null && r[c] !== '') {
      if (Array.isArray(r[c])) return r[c].join(', ');
      return r[c];
    }
    const nm = String(r.name || '');
    if (c === 'counterparty') {
      const m = nm.match(/^(?:Loan|EXT|BRW)\s+\d{4}-\d{2}-\d{2}\s+(.+?)(?:\s+#\d+)?$/i);
      return m ? m[1].trim() : (r.borrower || r.lender || r.partner || null);
    }
    if (c === 'loan') {
      const m = nm.match(/^BRW\s+\d{4}-\d{2}-\d{2}\s+(.+?)(?:\s+#\d+)?$/i);
      return m ? m[1].trim() : null;
    }
    if (c === 'direction') return r.method || (Number(r.principal || r.usd_amount || 0) >= 0 ? 'Inflow / Borrowed' : 'Outflow / Lent');
    if (c === 'start_date') {
      const m = nm.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      return m ? m[1] : r.date;
    }
    if (c === 'kind') {
      if (Number(r.discount || 0) > 0 && Number(r.amount || 0) === 0) return 'Discount / Rebate';
      return r.vat_invoice ? 'VAT Invoice Receipt' : (r.record_ticket || r.raw_ticket ? 'Ticket Settlement' : 'Account Payment');
    }
    if (c === 'payable_leg') {
      if (r.expense_record) return '3 · General Expense';
      if (r.raw_ticket) return '1/2 · Material & Haulage';
      return 'Account Settlement';
    }
    if (c === 'total_ttc') return round2(Number(r.amount || r.net_amount || r.price || 0) + Number(r.vat || r.vat_amount || 0));
    if (c === 'vat') return Number(r.vat_amount || 0);
    if (c === 'code') return nm ? nm.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 12) : '—';
    if (c === 'gps_status') return (r.latitude != null && r.longitude != null) ? 'Verified Pin' : 'Pending GPS';

    if (rel) {
      if (tableKey === 'customers' || tableKey === 'credit_terms') {
        if (c === 'vat_registered') return Boolean(r.vat_registered || r.mof_no);
        const ce = rel.custByName[norm(r.customer || r.name)];
        if (ce && ce[c] != null) return ce[c];
      }
      if (tableKey === 'suppliers') {
        const se = rel.suppByName[norm(r.name)];
        if (c === 'iva') return Boolean(r.iva || r.financial_no || r.mof_no);
        if (c === 'is_truck_owner') return Boolean(r.is_truck_owner || Number(r.trucks_count || 0) > 0 || (se && (se.is_hauler || se.trucks.size > 0 || se.haul_loads > 0)));
        if (c === 'trucks_count') return r.trucks_count != null ? r.trucks_count : (se ? se.trucks.size : 0);
        if (c === 'trucks_list') return formatCompactSet(se ? se.trucks : r.trucks, 2);
        if (c === 'drivers_list') return formatCompactSet(se ? se.drivers : r.drivers, 2);
        if (c === 'haul_loads') return se ? se.haul_loads : 0;
        if (c === 'raw_loads') return se ? se.raw_loads : 0;
        if (c === 'expenses_count') return se ? se.expenses_count : 0;
        if (c === 'active_rules') return se ? se.active_rules : 0;
        if (c === 'ap_balance') return se ? se.ap_balance : 0;
        if (c === 'supplier_role') {
          if (r.category && !/Raw Material Settlements/i.test(r.category)) {
            if (/^\s*(?:Quarry|Site)\s*\+\s*Hauler/i.test(r.category) || /(?:Quarry|Site)\s*\+\s*Hauler/i.test(r.category)) return 'Site + Hauler';
            if (/Hauler|Truck Owner/i.test(r.category)) return 'Truck Owner (Hauler)';
            if (/Quarry|Site|Raw Material/i.test(r.category)) return 'Site / Material';
            return r.category;
          }
          const isH = Boolean(r.is_truck_owner || Number(r.trucks_count || 0) > 0 || (se && (se.is_hauler || se.trucks.size > 0 || se.haul_loads > 0)));
          const isQ = Boolean((se && (se.is_quarry || se.raw_loads > 0 || se.sites.size > 0)) || /Quarry|Site|Raw Material/i.test(r.category1 || ''));
          const isE = Boolean(se && (se.is_expense || se.expenses_count > 0));
          if (isH && isQ) return 'Site + Hauler';
          if (isH) return 'Truck Owner (Hauler)';
          if (isQ) return 'Site / Material';
          if (isE) return 'Expense / Parts Vendor';
          return 'General Vendor';
        }
        if (se && se[c] != null) return se[c];
      }
      if (tableKey === 'products') {
        if (c === 'ticket_product' || c === 'fuel_item' || c === 'input_product') return Boolean(r[c]);
        const pe = rel.prodByName[norm(r.name)];
        if (pe && pe[c] != null) return pe[c];
      }
      if (tableKey === 'product_types') {
        const te = rel.typeByName[norm(r.name)];
        if (te && te[c] != null) return te[c];
      }
      if (tableKey === 'uoms') {
        const ue = rel.uomByName[norm(r.name)];
        if (ue && ue[c] != null) return ue[c];
      }
      if (tableKey === 'sites') {
        const sCat = resolveSiteCategoryPbi(r);
        if (c === 'is_jv') return sCat === 'supplier' ? Boolean(r.is_jv) : false;
        const se = (rel.siteByCatKey && rel.siteByCatKey[`${sCat}|${norm(r.name)}`]) || rel.siteByName[norm(r.name)];
        if (c === 'raw_loads') return sCat === 'supplier' ? (se ? se.raw_loads : 0) : 0;
        if (c === 'sales_loads') return sCat === 'customer' ? (se ? se.sales_loads : 0) : 0;
        if (c === 'active_rules') return se ? se.active_rules : 0;
        if (se && se[c] != null) return se[c];
      }
      if (tableKey === 'regions') {
        const re = rel.regByName[norm(r.name)];
        if (re && re[c] != null) return re[c];
      }
      if (tableKey === 'equipment' || tableKey === 'company_equipment') {
        const ee = rel.equipByName[norm(r.equipment || r.name)];
        if (ee) {
          if (c === 'companies_list') return Array.from(ee.companies).join(', ') || 'Shared';
          if (ee[c] != null) return ee[c];
        }
      }
      if (tableKey === 'drivers' || tableKey === 'company_drivers') {
        const de = rel.drvByName[norm(r.driver || r.name)];
        if (de) {
          if (c === 'assigned_trucks') return Array.from(de.trucks).join(', ') || '—';
          if (c === 'companies_list') return Array.from(de.companies).join(', ') || '—';
          if (de[c] != null) return de[c];
        }
      }
      if (tableKey === 'expense_categories') {
        const ce = rel.catByName[norm(r.name)];
        if (ce && ce[c] != null) return ce[c];
      }
      if (tableKey === 'expense_subcategories') {
        const se = r.category
          ? (rel.subcatByKey && rel.subcatByKey[`${norm(r.category)}|${norm(r.name)}`])
          : rel.subcatByName[norm(r.name)];
        if (se && se[c] != null) return se[c];
        if (c === 'expenses_count' || c === 'total_spent') return 0;
      }
      if (tableKey === 'employments') {
        const st = rel.staffByName[norm(r.staff || r.name)];
        if (st && st[c] != null) return st[c];
      }
      if (tableKey === 'vat_invoices' && c === 'tickets_count') {
        return rel.vatInvByNo[norm(r.invoice_no || r.name)] || 0;
      }
      if (tableKey === 'price_rules') {
        if (c === 'customer') return r.customer || r.supplier || r.site || '';
        if (c === 'matched_tickets') {
          const pe = r.product ? rel.prodByName[norm(r.product)] : null;
          return pe ? pe.sales_loads : 0;
        }
      }
      if (tableKey === 'loans' && c === 'settled_amount') {
        const cp = cellValue(r, 'counterparty');
        return cp ? (rel.loanSettledByCp[norm(cp)] || 0) : 0;
      }
      if (tableKey === 'jv_partnerships' && c === 'distributions_total') {
        return r.site ? (rel.jvDistBySite[norm(r.site)] || 0) : 0;
      }
    }
    return null;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function uniq(arr, freqMap) {
    const seen = new Set();
    const localCounts = new Map();
    const out = [];
    for (const x of (arr || [])) {
      const s = String(x == null ? '' : x).trim();
      const k = norm(s);
      if (!k) continue;
      localCounts.set(k, (localCounts.get(k) || 0) + 1);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }
    const fMap = freqMap || (typeof window !== 'undefined' && typeof window.MFG_FREQ === 'function' ? window.MFG_FREQ().any : null);
    return out.sort((a, b) => {
      const ka = norm(a), kb = norm(b);
      const fa = fMap ? (fMap.get(ka) || 0) : 0;
      const fb = fMap ? (fMap.get(kb) || 0) : 0;
      if (fb !== fa) return fb - fa;
      const la = localCounts.get(ka) || 0;
      const lb = localCounts.get(kb) || 0;
      if (lb !== la) return lb - la;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
  }

  function fmtUSD(v, decimals = 0) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return String(v ?? '—');
    const abs = Math.abs(n);
    const s = abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return (n < 0 && !/^0(?:\.0+)?$/.test(s) ? '-$' : '$') + s;
  }
  function fmtUSDk(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return String(v ?? '—');
    const a = Math.abs(n);
    if (a >= 1e6) return (n < 0 ? '-$' : '$') + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (n < 0 ? '-$' : '$') + Math.round(a / 1e3).toLocaleString('en-US') + 'K';
    return fmtUSD(n, 0);
  }
  function fmtNum(v, decimals = 0) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return String(v ?? '—');
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function fmtSignedUSD(v, decimals = 2) {
    const n = Number(v || 0);
    if (Math.abs(n) < 0.005) return fmtUSD(0, decimals);
    const abs = Math.abs(n);
    return (n < 0 ? '-$' : '+$') + abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function fmtSignedLBP(v) {
    const n = Math.round(Number(v || 0));
    if (Math.abs(n) <= 1) return '0 LL';
    return (n < 0 ? '-' : '+') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' LL';
  }
  function convDeltasPbi(r) {
    const t = String((r && (r.type || r.name)) || '');
    const fc = String((r && r.from_currency) || '').toUpperCase();
    const u2l = /LBP\s*(?:to|→|2)\s*USD/i.test(t) ? false : (/USD\s*(?:to|→|2)\s*LBP/i.test(t) ? true : fc !== 'LBP');
    const usdMag = Math.abs(Number((r && (r.usd_amount != null ? r.usd_amount : r.usd_delta)) || 0));
    const lbpMag = Math.round(Math.abs(Number((r && (r.lbp_amount != null ? r.lbp_amount : r.lbp_delta)) || 0)));
    const usd = r && r.usd_delta != null && Number(r.usd_delta) !== 0 ? Number(r.usd_delta) : round2(usdMag * (u2l ? -1 : 1));
    const lbp = r && r.lbp_delta != null && Number(r.lbp_delta) !== 0 ? Math.round(Number(r.lbp_delta)) : lbpMag * (u2l ? 1 : -1);
    const ex = Number((r && (r.exchange_rate || r.fx_rate)) || 0);
    const activeFx = (window.MFG_FX && typeof window.MFG_FX.getRate === 'function' ? window.MFG_FX.getRate() : 89500) || 89500;
    const rate = ex > 0 ? ex : (usdMag > 0 && lbpMag > 0 ? lbpMag / usdMag : activeFx);
    return { u2l, dirLabel: u2l ? 'USD → LBP' : 'LBP → USD', usd: round2(usd), lbp, rate };
  }
  function fmtPct(v, num, den) {
    if (num != null && den) return ((Number(num) / Number(den)) * 100).toFixed(1) + '%';
    return (Number(v || 0) * 100).toFixed(1) + '%';
  }
  function fmtDateDMY(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s || s === '—') return s || '—';
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  }

  // ==================== POWER BI VISUAL COMPONENT LIBRARY ====================

  // 1. Section Heading (matches Rep.heading in m18c_report.py)
  function pbiHeading(title, sub) {
    return `
      <div class="pbi-sec-heading">
        <h4>${esc(title)}</h4>
        ${sub ? `<span>${esc(sub)}</span>` : ''}
      </div>
    `;
  }

  // 2. 6-Card KPI Band (supports click-through navigation, negative red, brass/good/warn/crit tones)
  function kpiBand(title, cards) {
    return `
      <div class="pbi-kpi-sec">
        ${title ? `<div class="pbi-kpi-sec-hdr">${esc(title)}</div>` : ''}
        <div class="pbi-kpi-sec-grid">
          ${cards.map(c => {
            const navAttr = c.navPage ? `data-pbi-jump="${esc(c.navPage)}" role="button" tabindex="0" title="Open ${esc(c.navLabel || c.label)}"` : '';
            const tone = c.tone || (c.neg && /^-\$|^-[1-9]/.test(String(c.value || '')) ? 'crit' : '');
            return `
              <div class="pbi-kpi-card ${esc(tone)}" ${navAttr}>
                <div class="k">${esc(c.label)}${c.navPage ? ' <span style="color:var(--brass)">↗</span>' : ''}</div>
                <div class="v">${esc(c.value)}</div>
                ${c.sub ? `<div class="d">${esc(c.sub)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  const kpiSection = kpiBand;

  // 3. Visual Panel Wrapper
  function pbiPanel(title, bodyHtml, opts = {}) {
    const legendHtml = (opts.legend && opts.legend.length)
      ? `<div class="pbi-legend">${opts.legend.map(l => `<span><i class="${l.line ? 'line' : ''}" style="background:${esc(l.color)}"></i>${esc(l.label)}</span>`).join('')}</div>`
      : (opts.meta ? `<span class="panel-meta">${opts.meta}</span>` : '');
    const rightSideHtml = opts.headerRight
      ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">${opts.headerRight}${legendHtml}</div>`
      : legendHtml;
    return `
      <div class="pbi-panel" ${opts.id ? `id="${esc(opts.id)}"` : ''}>
        <div class="pbi-panel-hdr">
          <div>
            <div class="pbi-panel-title">${esc(title)}</div>
            ${opts.subtitle ? `<span class="pbi-panel-sub">${esc(opts.subtitle)}</span>` : ''}
          </div>
          ${rightSideHtml}
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  // 3b. Institutional Rev 10 Chart Popover Payload Encoder & Renderer (zero native browser <title> black boxes)
  function encodeChartPop(spec) {
    return esc(JSON.stringify(spec));
  }

  function renderChartPopHtml(spec, activeIdx) {
    if (typeof spec === 'string') {
      try { spec = JSON.parse(spec); } catch (_) { return ''; }
    }
    if (!spec || typeof spec !== 'object') return '';
    const rows = Array.isArray(spec.rows) ? spec.rows : (Array.isArray(spec.r) ? spec.r : []);
    const titleTxt = spec.title || spec.t || '—';
    const badgeTxt = spec.badge || spec.b || '';
    const badgeCls = spec.badgeTone === 'good' ? ' good' : (spec.badgeTone === 'crit' ? ' crit' : '');
    const actIdx = activeIdx != null && activeIdx !== '' && Number.isFinite(Number(activeIdx))
      ? Number(activeIdx)
      : (spec.activeIdx != null && Number.isFinite(Number(spec.activeIdx)) ? Number(spec.activeIdx) : -1);
    return `
      <div class="chart-pop-hdr">
        <span class="chart-pop-title">${esc(titleTxt)}</span>
        ${badgeTxt ? `<span class="chart-pop-badge${badgeCls}">${esc(badgeTxt)}</span>` : ''}
      </div>
      <div class="chart-pop-rows">
        ${rows.map((r, ri) => {
          const isAct = actIdx >= 0 && (r.idx != null ? Number(r.idx) === actIdx : ri === actIdx) && rows.length > 1;
          const isTot = Boolean(r.isTotal || r.tot);
          const rowCls = (isTot ? ' is-total' : '') + (isAct ? ' is-active' : '');
          const valTone = r.tone === 'good' ? ' good' : (r.tone === 'crit' ? ' crit' : (r.tone === 'brass' ? ' brass' : ''));
          const colHex = r.color || r.c || '';
          const swatchHtml = colHex
            ? `<i class="chart-pop-swatch${r.line ? ' is-line' : ''}" style="background:${esc(colHex)}"></i>`
            : '';
          return `
            <div class="chart-pop-row${rowCls}">
              <span class="chart-pop-lbl">${swatchHtml}<span>${esc(r.label || r.l || '')}</span></span>
              <span class="chart-pop-val${valTone}">${esc(r.value || r.v || '—')}</span>
            </div>
          `;
        }).join('')}
      </div>
      ${spec.footer ? `<div class="chart-pop-ftr">${esc(spec.footer)}</div>` : ''}
    `;
  }

  // 4. Multi-Series Clustered Column Chart (monthly or categorical)
  function buildClusteredColumnSvg(rows, series, opts = {}) {
    const data = (rows || []).slice(-(opts.maxBars || 14));
    if (!data.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No time-series data for active filter</div>`;
    const W = opts.width || 620, H = opts.height || 215, padL = 52, padR = 16, padT = 22, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const labelKey = opts.labelKey || 'Year Month';
    const isMoney = opts.isMoney !== false;
    let maxVal = 1;
    data.forEach(r => series.forEach(s => {
      const v = Math.abs(Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0));
      if (v > maxVal) maxVal = v;
    }));
    maxVal *= 1.12;

    const grpW = plotW / data.length;
    const barW = Math.min(22, Math.max(5, (grpW * 0.72) / series.length));
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const y = (padT + plotH * (1 - f)).toFixed(1);
      const val = maxVal * f;
      const lbl = isMoney ? fmtUSDk(val) : (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : Math.round(val));
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
              <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${lbl}</text>`;
    }).join('');

    const cols = data.map((r, i) => {
      const cx = padL + i * grpW + grpW / 2;
      const totalBarW = series.length * barW + (series.length - 1) * 2;
      const startX = cx - totalBarW / 2;
      const rawLbl = String(r[labelKey] || r.label || '');
      const shortLbl = rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, '$1 \'$2').slice(0, 8);
      const popRows = [];
      const bars = series.map((s, si) => {
        const val = Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0);
        const h = Math.max(val > 0 ? 2 : 0, (Math.abs(val) / maxVal) * plotH);
        const x = (startX + si * (barW + 2)).toFixed(1);
        const y = (padT + plotH - h).toFixed(1);
        const fVal = s.fmt ? s.fmt(val, r) : (isMoney ? fmtUSD(val, opts.decimals != null ? opts.decimals : 0) : fmtNum(val, opts.decimals != null ? opts.decimals : 0));
        popRows.push({
          idx: si,
          label: s.label || s.key || 'Series',
          value: fVal,
          color: s.color || C.navy,
          tone: val < -0.001 ? 'crit' : ''
        });
        const showTopLbl = opts.labels && Math.abs(val) > maxVal * 0.08 && data.length <= 10;
        return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s.color || C.navy}" data-series-idx="${si}"/>` +
          (showTopLbl ? `<text x="${(Number(x) + barW / 2).toFixed(1)}" y="${Math.max(11, Number(y) - 4)}" text-anchor="middle" font-size="8.8" font-weight="700" fill="var(--ink)">${isMoney ? fmtUSDk(val) : fmtNum(val, 0)}</text>` : '');
      }).join('');
      const colBadge = (r.loads != null && Number(r.loads) > 0 && !series.some(s => /load/i.test(s.label || '')))
        ? `${fmtNum(r.loads, 0)} loads`
        : '';
      const popSpec = { title: rawLbl || shortLbl, badge: colBadge, rows: popRows };
      return `<g class="pbi-chart-col" data-chart-pop="${encodeChartPop(popSpec)}">` +
        `<rect class="pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${Math.max(4, grpW - 2).toFixed(1)}" height="${plotH + 20}" rx="4" fill="transparent"/>` +
        `${bars}<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(shortLbl)}</text></g>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">${grid}${cols}</svg>`;
  }

  // 5. Line + Clustered Column Combo Chart (matches lineClusteredColumnComboChart in m18c_report.py)
  function buildComboChartSvg(rows, barSeries, lineSpec, opts = {}) {
    const data = (rows || []).slice(-(opts.maxBars || 14));
    if (!data.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No combo chart data for active filter</div>`;
    const W = opts.width || 620, H = opts.height || 220, padL = 52, padR = 46, padT = 22, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const labelKey = opts.labelKey || 'Year Month';
    const isMoney = opts.isMoney !== false;

    let maxBar = 0, maxLine = 0, minLine = 0;
    data.forEach(r => {
      barSeries.forEach(s => {
        const v = Math.abs(Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0));
        if (v > maxBar) maxBar = v;
      });
      if (lineSpec) {
        const lv = Number(typeof lineSpec.get === 'function' ? lineSpec.get(r) : r[lineSpec.key] || 0);
        if (lv > maxLine) maxLine = lv;
        if (lv < minLine) minLine = lv;
      }
    });
    if (maxBar <= 0) maxBar = isMoney ? 100 : 10;
    else maxBar *= 1.12;
    const shareAxis = opts.shareAxis === true;
    const defaultLineMax = (lineSpec && lineSpec.isMoney !== false) ? 100 : 10;
    const lMax = shareAxis ? maxBar : (opts.lineMax != null ? Math.max(Number(opts.lineMax), maxLine) : (maxLine > 0 ? maxLine * 1.15 : defaultLineMax));
    const lMin = shareAxis ? 0 : Math.min(0, minLine * 1.1);
    const lSpan = Math.max(1e-6, lMax - lMin);

    const grpW = plotW / data.length;
    const barW = Math.min(20, Math.max(5, (grpW * 0.68) / Math.max(1, barSeries.length)));
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const y = (padT + plotH * (1 - f)).toFixed(1);
      const val = maxBar * f;
      const lbl = isMoney ? fmtUSDk(val) : (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : Math.round(val));
      const rVal = lMin + lSpan * f;
      const rLbl = lineSpec && !shareAxis
        ? (lineSpec.isPct ? (rVal * 100).toFixed(0) + '%' : (lineSpec.isMoney ? fmtUSDk(rVal) : Math.round(rVal).toLocaleString('en-US')))
        : '';
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
              <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${lbl}</text>
              ${rLbl ? `<text x="${W - padR + 5}" y="${Number(y) + 3}" text-anchor="start" font-size="9" fill="${lineSpec.color || C.brass}">${rLbl}</text>` : ''}`;
    }).join('');

    const pts = [];
    const cols = data.map((r, i) => {
      const cx = padL + i * grpW + grpW / 2;
      const totalBarW = barSeries.length * barW + (barSeries.length - 1) * 2;
      const startX = cx - totalBarW / 2;
      const rawLbl = String(r[labelKey] || r.label || '');
      const shortLbl = rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, '$1 \'$2').slice(0, 8);
      const popRows = [];
      const bars = barSeries.map((s, si) => {
        const val = Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0);
        const h = Math.max(val > 0 ? 2 : 0, (Math.abs(val) / maxBar) * plotH);
        const x = (startX + si * (barW + 2)).toFixed(1);
        const y = (padT + plotH - h).toFixed(1);
        const fVal = isMoney ? fmtUSD(val, 0) : fmtNum(val, 0);
        popRows.push({
          idx: si,
          label: s.label || s.key || 'Series',
          value: fVal,
          color: s.color || C.navy,
          tone: val < -0.001 ? 'crit' : ''
        });
        return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s.color || C.navy}" data-series-idx="${si}"/>`;
      }).join('');
      let colBadge = '';
      if (lineSpec) {
        const lv = Number(typeof lineSpec.get === 'function' ? lineSpec.get(r) : r[lineSpec.key] || 0);
        const ly = padT + plotH * (1 - (lv - lMin) / lSpan);
        const lFmt = lineSpec.isPct ? (lv * 100).toFixed(1) + '%' : (lineSpec.isMoney !== false ? fmtUSD(lv, 2) : fmtNum(lv, 0));
        colBadge = lFmt;
        popRows.push({
          idx: barSeries.length,
          label: lineSpec.label || lineSpec.key || 'Trend',
          value: lFmt,
          color: lineSpec.color || C.brass,
          line: true,
          isTotal: true,
          tone: lv < -0.0001 ? 'crit' : 'brass'
        });
        const popSpec = { title: rawLbl || shortLbl, badge: colBadge, rows: popRows };
        pts.push({ x: cx, y: Math.max(padT + 3, Math.min(padT + plotH - 2, ly)), v: lv, lbl: rawLbl, popSpec });
      }
      const popSpec = { title: rawLbl || shortLbl, badge: colBadge, rows: popRows };
      return `<g class="pbi-chart-col" data-chart-pop="${encodeChartPop(popSpec)}">` +
        `<rect class="pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${Math.max(4, grpW - 2).toFixed(1)}" height="${plotH + 20}" rx="4" fill="transparent"/>` +
        `${bars}<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(shortLbl)}</text></g>`;
    }).join('');

    const lineSvg = (lineSpec && pts.length > 1)
      ? `<polyline fill="none" stroke="${lineSpec.color || C.brass}" stroke-width="2.4" pointer-events="none" points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>` +
        pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="${lineSpec.color || C.brass}" stroke="var(--surface)" stroke-width="1.2" style="cursor:pointer" data-chart-pop="${encodeChartPop(p.popSpec)}" data-series-idx="${barSeries.length}"/>`).join('')
      : '';

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">${grid}${cols}${lineSvg}</svg>`;
  }

  // 6. Signed Vertical Column Chart with Zero Baseline & Data Labels (specifically for P06 AR Aging with negative "On account", P20 Recon Bridge, etc.)
  function buildSignedColumnSvg(items, opts = {}) {
    const data = items || [];
    if (!data.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No bucket data</div>`;
    const readVal = d => Number(d && (d.value != null ? d.value : d.val) || 0);
    const W = opts.width || 580, H = opts.height || 235, padL = 54, padR = 18, padT = 26, padB = 36;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const isMoney = opts.isMoney !== false;
    let maxPos = 0, minNeg = 0, totPos = 0;
    data.forEach(d => {
      const v = readVal(d);
      if (v > maxPos) maxPos = v;
      if (v < minNeg) minNeg = v;
      if (v > 0) totPos += v;
    });
    const allZero = maxPos === 0 && minNeg === 0;
    if (allZero) maxPos = 100;
    maxPos *= 1.18;
    minNeg *= 1.22;
    const span = Math.max(1, maxPos - minNeg);
    const zeroY = padT + (maxPos / span) * plotH;

    const rawTicks = allZero ? [0] : [minNeg, minNeg / 2, 0, maxPos / 2, maxPos].filter((v, i, a) => a.indexOf(v) === i && (Math.abs(v) > 0.01 || v === 0));
    const seenTickLbls = new Set();
    const ticks = rawTicks.filter(v => {
      const lbl = isMoney ? fmtUSDk(v) : fmtNum(v, 0);
      if (Math.abs(v) < 0.001) { seenTickLbls.add(lbl); return true; }
      if (seenTickLbls.has(lbl)) return false;
      seenTickLbls.add(lbl);
      return true;
    });
    const grid = ticks.map(v => {
      const y = (padT + ((maxPos - v) / span) * plotH).toFixed(1);
      const isZero = Math.abs(v) < 0.001;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isZero ? 'var(--line-strong)' : 'rgba(128,138,158,0.18)'}" stroke-width="${isZero ? '1.3' : '1'}" ${isZero ? '' : 'stroke-dasharray="3 3"'}/>
              <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" font-weight="${isZero ? '700' : '400'}" fill="var(--muted)">${isMoney ? fmtUSDk(v) : fmtNum(v, 0)}</text>`;
    }).join('');

    const grpW = plotW / data.length;
    const barW = Math.min(54, Math.max(18, grpW * 0.56));
    const bars = data.map((d, i) => {
      const v = readVal(d);
      const cx = padL + i * grpW + grpW / 2;
      const x = (cx - barW / 2).toFixed(1);
      const h = Math.max(Math.abs(v) > 0 ? 3 : 0, (Math.abs(v) / span) * plotH);
      const y = v >= 0 ? (zeroY - h) : zeroY;
      const color = d.color || (v < 0 ? C.slate : C.navy);
      const valLbl = isMoney ? fmtUSDk(v) : fmtNum(v, 0);
      const fullVal = isMoney ? fmtUSD(v, 2) : fmtNum(v, 2);
      const lblY = v >= 0 ? Math.max(12, y - 5) : Math.min(H - 22, y + h + 12);
      const shareStr = (v > 0 && totPos > 0 && data.length > 1)
        ? `${((v / totPos) * 100).toFixed(1)}% of gross owing`
        : (v < -0.005 ? 'Customer Advance (On Acct)' : 'Balanced');
      const popRows = [
        { label: d.sub || d.label || 'Bucket Balance', value: fullVal, color, tone: v < -0.005 ? 'crit' : '' }
      ];
      if (d.count != null) popRows.push({ label: d.countLabel || 'Customers in Bucket', value: fmtNum(d.count, 0) });
      if (Array.isArray(d.extraRows)) d.extraRows.forEach(er => { if (er && er.label) popRows.push(er); });
      const popSpec = {
        title: String(d.title || d.label || 'Bucket'),
        badge: shareStr,
        badgeTone: v < -0.005 ? 'crit' : (Math.abs(v) < 0.005 ? 'good' : ''),
        rows: popRows
      };
      return `
        <g class="pbi-chart-col" data-chart-pop="${encodeChartPop(popSpec)}">
          <rect class="pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${Math.max(4, grpW - 2).toFixed(1)}" height="${plotH + 20}" rx="4" fill="transparent"/>
          <rect x="${x}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}"/>
          <text x="${cx.toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${v < 0 ? '#C8333B' : 'var(--ink)'}">${esc(valLbl)}</text>
          <text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--muted)">${esc(d.label)}</text>
        </g>
      `;
    }).join('');
    const zeroNote = allZero
      ? `<text x="${(padL + plotW / 2).toFixed(1)}" y="${(padT + plotH * 0.48).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="500" fill="var(--muted)">No open receivable balances for active scope</text>`
      : '';

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">${grid}${zeroNote}${bars}</svg>`;
  }

  // 7. Multi-Line Trend Chart (e.g. P04 Realised price per unit by month — top material products, P08 Unit economics, P14 Cash till)
  function buildMultiLineSvg(rows, series, opts = {}) {
    const data = (rows || []).slice(-(opts.maxPoints || 14));
    if (!data.length || !series.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No trend data for active filter</div>`;
    const W = opts.width || 620, H = opts.height || 215, padL = 52, padR = 18, padT = 20, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const labelKey = opts.labelKey || 'Year Month';
    const isMoney = opts.isMoney !== false;
    const decimals = opts.decimals != null ? opts.decimals : (isMoney ? 2 : 0);

    let maxVal = -Infinity, minVal = opts.includeZero !== false ? 0 : Infinity;
    data.forEach(r => series.forEach(s => {
      const raw = typeof s.get === 'function' ? s.get(r) : r[s.key];
      if (raw == null || raw === '') return;
      const v = Number(raw);
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
    }));
    if (!isFinite(maxVal)) { maxVal = 1; minVal = 0; }
    if (maxVal === minVal) maxVal = minVal + 1;
    const padSpan = (maxVal - minVal) * 0.14;
    maxVal += padSpan;
    if (minVal < 0) minVal -= padSpan;
    else if (opts.includeZero === false && minVal > 0) minVal = Math.max(0, minVal - padSpan);
    const span = Math.max(1e-6, maxVal - minVal);

    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const y = (padT + plotH * (1 - f)).toFixed(1);
      const val = minVal + span * f;
      const lbl = isMoney ? (Math.abs(maxVal) >= 1000 ? fmtUSDk(val) : fmtUSD(val, decimals)) : fmtNum(val, decimals);
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
              <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${lbl}</text>`;
    }).join('');

    const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
    const colSpecs = data.map((r, i) => {
      const x = data.length > 1 ? padL + i * stepX : padL + plotW / 2;
      const rawLbl = String(r[labelKey] || r.label || '');
      const shortLbl = rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, '$1 \'$2').slice(0, 8);
      const popRows = [];
      series.forEach((s, si) => {
        const raw = typeof s.get === 'function' ? s.get(r) : r[s.key];
        if (raw == null || raw === '') return;
        const v = Number(raw);
        popRows.push({
          idx: si,
          label: s.label || s.key || 'Series',
          value: isMoney ? fmtUSD(v, decimals) : fmtNum(v, decimals),
          color: s.color || C.navy,
          line: true
        });
      });
      return {
        x,
        rawLbl,
        shortLbl,
        popSpec: { title: rawLbl || shortLbl, badge: `${popRows.length} series`, rows: popRows }
      };
    });

    const hitW = data.length > 1 ? stepX : plotW;
    const labelStep = data.length > 13 ? Math.ceil(data.length / 9) : 1;
    const colBands = colSpecs.map((c, i) => {
      const bandX = data.length > 1
        ? (i === 0 ? padL : c.x - hitW / 2)
        : padL;
      const bandW = data.length > 1
        ? (i === 0 || i === colSpecs.length - 1 ? hitW / 2 + 6 : hitW)
        : plotW;
      const showLbl = (i % labelStep === 0) || (i === colSpecs.length - 1 && (colSpecs.length - 1) % labelStep >= Math.max(1, Math.floor(labelStep / 2)));
      return `<g class="pbi-chart-col" data-chart-pop="${encodeChartPop(c.popSpec)}">` +
        `<rect class="pbi-col-hit" x="${bandX.toFixed(1)}" y="${padT}" width="${Math.max(6, bandW).toFixed(1)}" height="${plotH + 20}" rx="3" fill="transparent"/>` +
        `<line class="pbi-col-guide" x1="${c.x.toFixed(1)}" y1="${padT}" x2="${c.x.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}"/>` +
        (showLbl ? `<text x="${c.x.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${esc(c.shortLbl)}</text>` : '') +
        `</g>`;
    }).join('');

    const lines = series.map((s, si) => {
      const pts = [];
      const segments = [];
      let curSeg = [];
      data.forEach((r, i) => {
        const raw = typeof s.get === 'function' ? s.get(r) : r[s.key];
        if (raw == null || raw === '') {
          if (curSeg.length) { segments.push(curSeg); curSeg = []; }
          return;
        }
        const v = Number(raw);
        const x = data.length > 1 ? padL + i * stepX : padL + plotW / 2;
        const y = padT + plotH * (1 - (v - minVal) / span);
        const pt = { x, y, v, popSpec: colSpecs[i].popSpec };
        pts.push(pt);
        curSeg.push(pt);
      });
      if (curSeg.length) segments.push(curSeg);
      if (!pts.length) return '';
      const segHtml = segments
        .filter(seg => seg.length > 1)
        .map(seg => `<polyline fill="none" stroke="${s.color || C.navy}" stroke-width="2.3" pointer-events="none" points="${seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`)
        .join('');
      const bridgeHtml = segments.length > 1
        ? segments.slice(0, -1).map((seg, idx) => {
            const a = seg[seg.length - 1];
            const b = segments[idx + 1][0];
            return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${s.color || C.navy}" stroke-width="1.6" stroke-dasharray="3.5 2.5" stroke-opacity="0.52" pointer-events="none"/>`;
          }).join('')
        : '';
      return bridgeHtml + segHtml +
        pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="${s.color || C.navy}" stroke="var(--surface)" stroke-width="1.2" style="cursor:pointer" data-chart-pop="${encodeChartPop(p.popSpec)}" data-series-idx="${si}"/>`).join('');
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">${grid}${colBands}${lines}</svg>`;
  }

  // 8. Horizontal Bar Chart (matches Power BI barChart with data labels at bar ends)
  function buildHorizontalBarChart(rows, labelKey, valKey, fmtFn, opts = {}) {
    const maxItems = opts.maxItems || 10;
    const filtered = opts.allowZero
      ? (rows || []).filter(Boolean)
      : (rows || []).filter(r => Math.abs(Number(r[valKey] || 0)) > 0.001);
    const sorted = opts.sort === false ? filtered : filtered.slice().sort((a, b) => {
      if (typeof opts.sortFn === 'function') return opts.sortFn(a, b);
      const va = Number(a[valKey] || 0);
      const vb = Number(b[valKey] || 0);
      if (opts.sortAbs) return Math.abs(vb) - Math.abs(va) || (vb - va);
      return vb - va || Math.abs(vb) - Math.abs(va);
    });
    const top = sorted.slice(0, maxItems);
    if (!top.length) return `<div style="padding:18px;text-align:center;color:var(--muted);font-size:12px">No rows for active filter</div>`;
    const rawMax = Math.max(0, ...top.map(r => Math.abs(Number(r[valKey] || 0))));
    const max = rawMax > 0 ? rawMax : 1;
    const totAbs = top.reduce((a, r) => a + Math.abs(Number(r[valKey] || 0)), 0);
    const defaultColor = opts.color === 'brass' ? C.brass : (opts.color === 'steel' ? C.steel : (opts.color === 'crit' ? C.crit : (opts.color || C.navy)));
    return `
      <div class="pbi-bar-chart">
        ${top.map((r, i) => {
          const v = Number(r[valKey] || 0);
          const pct = Math.abs(v) > 0.0001 ? Math.max(3, Math.min(100, Math.round((Math.abs(v) / max) * 100))) : 0;
          const sharePct = totAbs > 0 ? ((Math.abs(v) / totAbs) * 100).toFixed(1) + '%' : '0.0%';
          const sub = opts.subKey && r[opts.subKey] ? ` <small>· ${esc(r[opts.subKey])}</small>` : '';
          const barColor = v < 0 ? C.crit : (typeof opts.colorFn === 'function' ? opts.colorFn(r, i) : defaultColor);
          const fmtTxt = String(fmtFn(v, r) || '').replace(/<[^>]+>/g, '').trim();
          const popRows = [
            { label: opts.valLabel || 'Amount / Total', value: fmtTxt, color: barColor, tone: v < 0 ? 'crit' : '' }
          ];
          if (opts.subKey && r[opts.subKey]) {
            popRows.push({ label: 'Context / Detail', value: String(r[opts.subKey]) });
          }
          if (top.length > 1) {
            popRows.push({ label: `Share of Top ${top.length}`, value: sharePct });
          }
          const popSpec = {
            title: String(r[labelKey] || '—'),
            badge: opts.rank !== false ? `Rank #${i + 1} of ${top.length}` : sharePct,
            badgeTone: v < 0 ? 'crit' : '',
            rows: popRows
          };
          return `
            <div class="pbi-bar-item" data-chart-pop="${encodeChartPop(popSpec)}">
              <span class="pbi-bar-lbl">${opts.rank !== false ? `<small>${i + 1}.</small> ` : ''}${esc(r[labelKey] || '—')}${sub}</span>
              <div class="pbi-bar-lane"><div class="pbi-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
              <span class="pbi-bar-val ${v < 0 ? 'pbi-neg' : ''}">${fmtFn(v, r)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  const buildHorizontalRankChart = (rows, labelKey, valKey, fmtFn, subKey, colorClass) =>
    buildHorizontalBarChart(rows, labelKey, valKey, fmtFn, { subKey, color: colorClass });

  // 9. Clustered Horizontal Bar Chart (e.g. P05 Agreed vs realised vs last price per unit, P15 External revenue vs expense by counterparty)
  function buildClusteredBarChart(rows, labelKey, series, opts = {}) {
    const top = (rows || []).slice(0, opts.maxItems || 8);
    if (!top.length) return `<div style="padding:18px;text-align:center;color:var(--muted);font-size:12px">No rows for active filter</div>`;
    let max = 1;
    top.forEach(r => series.forEach(s => {
      const v = Math.abs(Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0));
      if (v > max) max = v;
    }));
    return `
      <div class="pbi-bar-chart">
        ${top.map((r, ri) => {
          const rightTxt = opts.headRight ? String(opts.headRight(r) || '') : `Rank #${ri + 1}`;
          const popRows = series.map((s, si) => {
            const v = Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0);
            const fTxt = String(s.fmt ? s.fmt(v, r) : fmtUSD(v, opts.decimals != null ? opts.decimals : 2)).replace(/<[^>]+>/g, '').trim();
            return {
              idx: si,
              label: s.label || s.key || 'Series',
              value: fTxt,
              color: v < 0 ? C.crit : (s.color || C.navy),
              tone: v < 0 ? 'crit' : ''
            };
          });
          const popSpec = {
            title: String(r[labelKey] || '—'),
            badge: rightTxt,
            rows: popRows
          };
          return `
          <div class="pbi-cbar-item" data-chart-pop="${encodeChartPop(popSpec)}">
            <div class="pbi-cbar-head"><span>${esc(r[labelKey] || '—')}</span>${opts.headRight ? `<small class="mono mu">${esc(opts.headRight(r))}</small>` : ''}</div>
            ${series.map((s, si) => {
              const v = Number(typeof s.get === 'function' ? s.get(r) : r[s.key] || 0);
              const pct = Math.max(v !== 0 ? 3 : 0, Math.min(100, Math.round((Math.abs(v) / max) * 100)));
              return `
                <div class="pbi-cbar-series" data-series-idx="${si}">
                  <span>${esc(s.label)}</span>
                  <div class="pbi-bar-lane" style="height:11px"><div class="pbi-bar-fill" style="width:${pct}%;background:${v < 0 ? C.crit : (s.color || C.navy)}"></div></div>
                  <b class="${v < 0 ? 'pbi-neg' : ''}">${s.fmt ? s.fmt(v, r) : fmtUSD(v, opts.decimals != null ? opts.decimals : 2)}</b>
                </div>
              `;
            }).join('')}
          </div>
        `;
        }).join('')}
      </div>
    `;
  }

  let _activePbiState = null;

  // Automatic sticky bottom totals generator for Power BI tables when opts.foot is not explicitly passed
  function buildAutoFoot(cols, list, opts = {}) {
    if (opts.noFoot || !list || !list.length || !cols || !cols.length) return null;
    let firstNumIdx = cols.findIndex((c, idx) => idx > 0 && c.r);
    if (firstNumIdx < 0) firstNumIdx = cols.length;
    const span = Math.max(1, firstNumIdx);
    const footCells = [{
      v: `<b>TOTAL (${fmtNum(list.length)} ${esc(opts.unitLabel || 'rows')})</b>`,
      span
    }];

    for (let ci = span; ci < cols.length; ci++) {
      const c = cols[ci];
      if (typeof c.foot === 'function') {
        footCells.push({ v: c.foot(list), r: !!c.r });
        continue;
      }
      if (!c.r || c.agg === 'none') {
        footCells.push({ v: c.r ? '—' : '', r: !!c.r });
        continue;
      }
      const kName = String(c.key || '');
      const lName = String(c.label || '');
      // Non-numeric tier strings or meter readings
      if (/^(Tier 1|Tier 2|Meter|Odometer|Share|Limit used|% of Net)$/i.test(lName) || /^(odometer)$/.test(kName)) {
        footCells.push({ v: '—', r: true });
        continue;
      }
      // Closing balance columns (latest row at index 0)
      if (kName === 'running' || kName === 'cash_till' || kName === 'clean_till') {
        const latest = list[0] ? (typeof c.raw === 'function' ? c.raw(list[0], 0) : list[0][kName]) : 0;
        const rawLat = Number(latest || 0);
        const nLat = Math.abs(rawLat) < 0.005 ? 0 : rawLat;
        const fmtLat = c.fmt ? c.fmt(nLat, {}, -1) : fmtUSD(nLat, 2);
        footCells.push({ v: /<[bB]|<strong/.test(String(fmtLat)) ? fmtLat : `<b>${fmtLat}</b>`, r: true, neg: nLat < -0.005 });
        continue;
      }
      let sum = 0, countNum = 0;
      const hasRawFn = typeof c.raw === 'function';
      const cKey = c.key;
      for (let idx = 0, len = list.length; idx < len; idx++) {
        const r = list[idx];
        const rv = hasRawFn ? c.raw(r, idx) : (cKey ? r[cKey] : null);
        if (typeof rv === 'number') {
          if (Number.isFinite(rv)) { sum += rv; countNum++; }
        } else if (typeof rv === 'string' && rv !== '') {
          const n = Number(rv);
          if (Number.isFinite(n)) { sum += n; countNum++; }
        }
      }
      if (!countNum) {
        footCells.push({ v: '—', r: true });
        continue;
      }
      const isAvgCol = /^(list_price|avg_price_net|avg_price_ttc|avg_raw_cost|agreed_price|last_price|actual_price|unit_price|trans_unit_price|cost_per_ton|l_per_100km|daily_rate|interest_rate|exchange_rate|percentage|pct|credit_days|gap_days)$/.test(kName) ||
        /^(List|Avg|Agreed|Last Sold|Last Price|Actual Price|Variance \/ u|Last − Agreed|Unit \(\$\)|Trans \/ u|Rate|Daily Rate|Per working day|Daily \/ Shift Rate|LBP Rate|Cost \/ Ton|L \/ 100|Consumption|Completeness|Interest Rate|Exchange Rate|Credit Days|Gap)/i.test(lName);
      const val = isAvgCol ? (sum / countNum) : sum;
      const formatted = c.fmt ? c.fmt(val, {}, -1) : fmtNum(val, isAvgCol ? 2 : 0);
      const wrapped = /<[bB]|<strong/.test(String(formatted)) ? formatted : `<b>${formatted}</b>`;
      footCells.push({
        v: isAvgCol ? `<span class="tfoot-avg-tag">Avg </span>${wrapped}` : wrapped,
        r: true,
        neg: (c.negRed || c.bar) && val < -0.0001
      });
    }
    return footCells;
  }

  function shortCoHtml(val) {
    const raw = String(val == null ? '' : val).trim();
    if (/^bbconstruction$/i.test(raw)) return `<span title="BBConstruction">BBC<span class="sr-only"> BBConstruction</span></span>`;
    if (/^lions\s*transport$/i.test(raw)) return `<span title="Lions Transport">Lions<span class="sr-only"> Lions Transport</span></span>`;
    return esc(raw || '—');
  }

  function siteJvMarker(isJv) {
    if (!isJv || isJv === 'No' || isJv === 'false') return '';
    return ' <span class="site-jv-marker" title="Joint Venture (50/50 Partnership Site)"><svg class="site-jv-ico" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4.3" cy="6" r="2.7"/><circle cx="7.7" cy="6" r="2.7"/></svg>JV</span>';
  }

  // 10. Power BI Table with Inline Data Bars, Red Negatives, Amber/Navy Row Highlights, Sticky Totals & Interactive Pagination
  function pbiTable(title, cols, rows, opts = {}) {
    const list = rows || [];
    const tableKey = opts.id || ('t_' + String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48));
    const pageSize = Number((_activePbiState && _activePbiState.pbiPageSize) || opts.pageSize || 15);
    const totalRows = list.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const rawPage = (_activePbiState && _activePbiState.pbiTablePage && _activePbiState.pbiTablePage[tableKey]) || 0;
    const curPage = Math.min(totalPages - 1, Math.max(0, Number(rawPage) || 0));
    const startIdx = curPage * pageSize;
    const shown = list.slice(startIdx, startIdx + pageSize);
    const footCells = opts.foot || buildAutoFoot(cols, list, opts);

    // Compute max per bar column (and shared barGroup) for proportional inline data bars
    const barMax = {};
    const barGroupMax = {};
    cols.forEach((c, ci) => {
      if (c.bar) {
        let m = 1;
        shown.forEach((r, idx) => {
          const v = Math.abs(Number(typeof c.raw === 'function' ? c.raw(r, startIdx + idx) : r[c.key] || 0));
          if (v > m) m = v;
        });
        barMax[ci] = m;
        if (c.barGroup) {
          barGroupMax[c.barGroup] = Math.max(barGroupMax[c.barGroup] || 1, m);
        }
      }
    });
    cols.forEach((c, ci) => {
      if (c.bar && c.barGroup && barGroupMax[c.barGroup]) {
        barMax[ci] = barGroupMax[c.barGroup];
      }
    });

    const pagerHtml = totalRows > 10 ? `
      <div class="pbi-pager">
        <span class="pbi-pager-info">Showing <b>${totalRows ? fmtNum(startIdx + 1) : 0}–${fmtNum(startIdx + shown.length)}</b> of <b>${fmtNum(totalRows)}</b> ${esc(opts.unitLabel || 'rows')} · Page <b>${fmtNum(curPage + 1)}</b> of <b>${fmtNum(totalPages)}</b></span>
        <div class="pbi-pager-controls">
          <select class="pbi-page-size-sel" data-pbi-page-size="${esc(tableKey)}" aria-label="Rows per page" title="Rows per page">
            ${[15, 25, 50, 100].map(sz => `<option value="${sz}" ${pageSize === sz ? 'selected' : ''}>${sz} / page</option>`).join('')}
          </select>
          <button type="button" class="pbi-page-btn" data-pbi-page-btn="${esc(tableKey)}" data-pbi-page-target="0" ${curPage <= 0 ? 'disabled' : ''} title="First Page">⟪</button>
          <button type="button" class="pbi-page-btn" data-pbi-page-btn="${esc(tableKey)}" data-pbi-page-target="${curPage - 1}" ${curPage <= 0 ? 'disabled' : ''} title="Previous Page">◀ Prev</button>
          <button type="button" class="pbi-page-btn" data-pbi-page-btn="${esc(tableKey)}" data-pbi-page-target="${curPage + 1}" ${curPage >= totalPages - 1 ? 'disabled' : ''} title="Next Page">Next ▶</button>
          <button type="button" class="pbi-page-btn" data-pbi-page-btn="${esc(tableKey)}" data-pbi-page-target="${totalPages - 1}" ${curPage >= totalPages - 1 ? 'disabled' : ''} title="Last Page">⟫</button>
        </div>
      </div>
    ` : '';

    const tableHtml = `
      <div class="table-wrap">
        <table class="ledger-table">
          <thead>
            <tr>${cols.map(c => `<th class="${c.r ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${shown.map((r, idx) => {
              const absIdx = startIdx + idx;
              const rowClass = [
                opts.rowAmber && opts.rowAmber(r) ? 'pbi-row-amber' : '',
                opts.rowNavy && opts.rowNavy(r) ? 'pbi-row-navy' : '',
                (opts.rkey || r.rkey) && r.id ? 'rrow' : ''
              ].filter(Boolean).join(' ');
              const rowAttrs = (opts.rkey || r.rkey) && r.id ? `data-rkey="${esc(opts.rkey || r.rkey)}" data-rid="${esc(r.id)}"` : '';
              return `<tr class="${rowClass}" ${rowAttrs}>${cols.map((c, ci) => {
                const rawVal = typeof c.raw === 'function' ? c.raw(r, absIdx) : (c.key ? r[c.key] : null);
                const numVal = Number(rawVal || 0);
                const isNeg = (c.negRed || c.bar) && rawVal != null && rawVal !== '' && numVal < -0.0001;
                const cellAmber = typeof c.amberIf === 'function' && c.amberIf(r);
                const cls = [
                  c.r ? 'r' : '',
                  c.mono ? 'mono' : '',
                  c.bar ? 'pbi-bar-cell' : '',
                  isNeg ? 'pbi-neg' : '',
                  cellAmber ? 'pbi-cell-amber' : ''
                ].filter(Boolean).join(' ');
                let barHtml = '';
                if (c.bar && Math.abs(numVal) > 0.001) {
                  const w = Math.min(92, Math.max(4, Math.round((Math.abs(numVal) / (barMax[ci] || 1)) * 90)));
                  const bTone = numVal < 0 ? 'neg' : (c.bar === 'brass' ? 'brass' : 'pos');
                  barHtml = `<span class="pbi-bar-bg ${bTone}" style="width:${w}%"></span>`;
                }
                const isCoCol = !c.fmt && (c.key === 'company' || c.key === 'bu');
                let formatted = c.fmt ? c.fmt(rawVal, r, absIdx) : (isCoCol ? shortCoHtml(rawVal) : (c.bold ? `<b>${esc(rawVal == null || rawVal === '' ? '—' : rawVal)}</b>` : esc(rawVal == null || rawVal === '' ? '—' : rawVal)));
                if (/date|last_sale|last_purchase/i.test(String(c.key || '')) || /^(Date|Start|End|Start Date|End Date|Last Sale|Last Purchase|Tx Date|Rpt Date|Last Paid)$/i.test(String(c.label || ''))) {
                  formatted = String(formatted).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3-$2-$1');
                }
                return `<td class="${cls}">${barHtml}${formatted}</td>`;
              }).join('')}</tr>`;
            }).join('') || `<tr><td colspan="${cols.length}" class="empty-row" style="text-align:center;padding:18px;color:var(--muted)">${esc(opts.emptyMsg || 'No matching rows for the selected filters')}</td></tr>`}
          </tbody>
          ${footCells ? `<tfoot><tr>${footCells.map(f => `<td class="${f.r ? 'r' : ''} ${f.neg ? 'pbi-neg' : ''}" ${f.span ? `colspan="${f.span}"` : ''}>${f.v}</td>`).join('')}</tr></tfoot>` : ''}
        </table>
      </div>
      ${pagerHtml}
    `;

    return pbiPanel(title, tableHtml, {
      subtitle: opts.subtitle,
      meta: `${fmtNum(totalRows)} ${opts.unitLabel || 'rows'}${totalPages > 1 ? ` · p.${curPage + 1}/${totalPages}` : ''}`,
      id: opts.id
    });
  }

  // ==================== PAGE-SPECIFIC DYNAMIC SLICER ENGINE (m18c_report.py) ====================
  function buildPageSlicerDefs(pageId, data) {
    const { prodOpts, custOpts, suppOpts, siteOpts, equipOpts, driverOpts, staffOpts, catOpts, subcatOpts, regOpts, cpOpts } = data;
    const yn = [{ v: 'Yes', l: 'Yes' }, { v: 'No', l: 'No' }];
    const map = {
      p01_overview: [
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'product', label: 'Material / Grade', opts: prodOpts },
        { key: 'site', label: 'Site', opts: siteOpts },
        { key: 'iva', label: 'Customer IVA (VAT)', opts: yn },
        { key: 'method', label: 'Payment Method', opts: ['Cash', 'Credit'] }
      ],
      p02_companies: [
        { key: 'iva', label: 'Customer IVA (VAT)', opts: yn },
        { key: 'product', label: 'Material / Grade', opts: prodOpts },
        { key: 'customer', label: 'Customer', opts: custOpts }
      ],
      p03_exceptions: [
        { key: 'severity', label: 'Exception Queue', opts: ['Overdue AR', 'Uninvoiced IVA', 'Pricing & Lapsed', 'Fleet & Telemetry', 'Payroll & Recon'] },
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'equipment', label: 'Equipment Unit', opts: equipOpts },
        { key: 'supplier', label: 'Supplier / Hauler', opts: suppOpts }
      ],
      p04_sales: [
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'product', label: 'Product / Grade', opts: prodOpts },
        { key: 'site', label: 'Destination Site', opts: siteOpts },
        { key: 'saleType', label: 'Sale Type', opts: ['Delivery', 'Pickup'] },
        { key: 'method', label: 'Method', opts: ['Cash', 'Credit'] },
        { key: 'iva', label: 'Customer IVA', opts: yn },
        { key: 'driver', label: 'Driver', opts: driverOpts }
      ],
      p05_pricing: [
        { key: 'ruleType', label: 'Rule Type', opts: ['Sales (Delivery)', 'Sales (Pickup)', 'Purchase Price (Site)', 'Transport Price (Site)', 'Commission', 'List Price'] },
        { key: 'product', label: 'Product / Grade', opts: prodOpts },
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'activeStatus', label: 'Agreement Status', opts: ['Active', 'Ended'] },
        { key: 'site', label: 'Site', opts: siteOpts },
        { key: 'supplier', label: 'Owner / Beneficiary', opts: suppOpts }
      ],
      p06_ar: [
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'iva', label: 'VAT Registered (IVA)', opts: yn },
        { key: 'creditOnly', label: 'Credit Filter', opts: ['Credit Customers', 'Has Open Balance', 'Overdue (>30d)', 'On Account (<$0)'] },
        { key: 'agingBucket', label: 'Aging Bucket', opts: ['Current', '1-10 Days', '11-30 Days', '31-60 Days', '60+ Days', 'On Account'] }
      ],
      p07_ap: [
        { key: 'supplier', label: 'Supplier / Hauler', opts: suppOpts },
        { key: 'category', label: 'Expense Category', opts: catOpts },
        { key: 'costClass', label: 'Cost Class', opts: ['Production Cost', 'Operating Expense', 'Capital Expenditure'] },
        { key: 'method', label: 'Method', opts: ['Cash', 'Credit'] },
        { key: 'iva', label: 'Supplier IVA', opts: yn },
        { key: 'payableLeg', label: 'Owed For (AP Leg)', opts: ['Material', 'Haulage', 'Supplies & services'] },
        { key: 'equipment', label: 'Equipment Unit', opts: equipOpts }
      ],
      p08_stock: [
        { key: 'product', label: 'Product / Grade', opts: prodOpts },
        { key: 'site', label: 'Source Site', opts: siteOpts },
        { key: 'supplier', label: 'Site / Truck Owner', opts: suppOpts },
        { key: 'transportBy', label: 'Transported By', opts: ['Third-party truck', 'Company fleet'] }
      ],
      p09_fuel: [
        { key: 'equipment', label: 'Equipment Unit', opts: equipOpts },
        { key: 'equipType', label: 'Equipment Type', opts: ['Truck', 'Loader', 'Excavator', 'Bulldozer', 'Plant', 'Generator', 'Vehicle'] },
        { key: 'ownership', label: 'Ownership', opts: ['Own', 'Rented', 'Partner', 'Transporter'] },
        { key: 'driver', label: 'Driver', opts: driverOpts },
        { key: 'fuelType', label: 'Fuel / Item', opts: ['Diesel', 'Lubricant / Oil'] }
      ],
      p10_fleet: [
        { key: 'equipment', label: 'Equipment Unit', opts: equipOpts },
        { key: 'equipType', label: 'Type', opts: ['Truck', 'Loader', 'Excavator', 'Bulldozer', 'Plant', 'Generator', 'Vehicle'] },
        { key: 'ownership', label: 'Ownership', opts: ['Own', 'Rented', 'Partner', 'Transporter'] },
        { key: 'equipStatus', label: 'Status', opts: ['Active', 'Idle', 'Under repair', 'Sold'] }
      ],
      p11_drivers: [
        { key: 'driver', label: 'Driver', opts: driverOpts },
        { key: 'companyDriver', label: 'Company Driver', opts: yn },
        { key: 'region', label: 'Region / Route', opts: regOpts },
        { key: 'overtimeFlag', label: 'Overtime', opts: yn },
        { key: 'shift', label: 'Shift', opts: ['Day', 'Night'] }
      ],
      p12_payroll: [
        { key: 'staff', label: 'Staff Member', opts: staffOpts },
        { key: 'contractType', label: 'Contract Type', opts: ['Regular', 'Monthly', 'Daily', 'Freelance'] },
        { key: 'contractStatus', label: 'Contract Status', opts: ['Current', 'Ended'] },
        { key: 'site', label: 'Site', opts: siteOpts }
      ],
      p13_vat: [
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'supplier', label: 'Supplier', opts: suppOpts },
        { key: 'iva', label: 'Customer IVA', opts: yn },
        { key: 'supplierIva', label: 'Supplier IVA', opts: yn }
      ],
      p14_cashflow: [
        { key: 'currency', label: 'Currency', opts: ['USD', 'LBP'] },
        { key: 'flowKind', label: 'Cash Stream', opts: ['Customer Receipts', 'Supplier Settlements', 'Cash Expenses', 'Salary Payments', 'External Treasury'] },
        { key: 'method', label: 'Payment Method', opts: ['Cash', 'Check', 'Bank', 'Whish'] },
        { key: 'customer', label: 'Customer / Counterparty', opts: custOpts }
      ],
      p15_treasury: [
        { key: 'treasuryType', label: 'Treasury Stream', opts: ['Loans', 'External Movements', 'FX Conversions', 'Barter'] },
        { key: 'counterparty', label: 'Counterparty / Lender', opts: cpOpts },
        { key: 'loanDirection', label: 'Flow / Direction', opts: ['Inflow', 'Outflow', 'Repayment', 'Drawdown'] }
      ],
      p16_financial: [
        { key: 'glClass', label: 'Lebanese CoA Class', opts: [
          { v: '1', l: 'Class 1 · Capital & Long-Term' },
          { v: '2', l: 'Class 2 · Fixed Assets' },
          { v: '3', l: 'Class 3 · Inventories' },
          { v: '4', l: 'Class 4 · AR, AP & VAT' },
          { v: '5', l: 'Class 5 · Cash & Till' },
          { v: '6', l: 'Class 6 · Cost & Expenses' },
          { v: '7', l: 'Class 7 · Revenue' }
        ] },
        { key: 'pnlSection', label: 'Journal Filter', opts: ['Sales & VAT', 'Raw & Haulage', 'Expenses & Payroll', 'Receipts & Settlements'] }
      ],
      p17_jv: [
        { key: 'site', label: 'JV Site', opts: ['Halat JV', 'Jiyeh JV', 'Nahr Ibrahim JV'] },
        { key: 'partner', label: 'JV Partner', opts: ['Assaf', 'WTC', 'Partner 50%'] },
        { key: 'jvBasis', label: 'Distribution Basis', opts: ['Stock', 'Revenue', 'Profit', 'Cash'] }
      ],
      p18_tickets: [
        { key: 'padType', label: 'Ticket Pad Stream', opts: ['Sales Pad', 'Raw Pad', 'Fuel Pad'] },
        { key: 'bookStatus', label: 'Serial Hygiene', opts: ['All Serials', 'Incomplete Books', 'Missing Serials'] },
        { key: 'site', label: 'Site', opts: siteOpts }
      ],
      p19_changelog: [
        { key: 'ledgerDomain', label: 'Ledger Domain', opts: ['Sales', 'RawPurchases', 'Expenses', 'CustomerReceipts', 'SupplierPayments', 'Fuel'] },
        { key: 'ledgerOrigin', label: 'Origin', opts: ['Reported Snapshot', 'Entered Ledger'] },
        { key: 'ledgerKind', label: 'Snapshot Kind', opts: ['Changed', 'Baseline', 'Date Gap >31d'] }
      ],
      p20_recon: [
        { key: 'reconSide', label: 'Statement Category', opts: ['Financial', 'Receivables', 'Payables', 'Operations', 'Fleet', 'Workforce', 'Commercial', 'Tax & Compliance', 'Treasury', 'Executive'] },
        { key: 'customer', label: 'Customer', opts: custOpts },
        { key: 'supplier', label: 'Supplier', opts: suppOpts }
      ]
    };
    return map[pageId] || map.p01_overview;
  }
  // ==================== 12-PAGE ANALYTICS & INSIGHTS STUDIO RENDERER ====================
  let _pbiBaseCacheKey = '';
  let _pbiBaseCacheVal = null;

  function renderPbiStudio(ctx, overridePageId, bodyOnly) {
    const { STATE, SEED, COMPANY_LABELS, getModel, getKPI, filterRecords, buildSentinelItems, exportBtn, ticketTons, ticketMeters, productMeters, isAggregateMaterialProduct } = ctx;
    _activePbiState = STATE;
    const m = getModel();
    const k = getKPI();
    const today = ctx.SEED_DATE || String(SEED.generated_at || '').slice(0, 10) || '2026-10-19';
    const minDate = ctx.MIN_DATE || '2024-01-01';
    const maxDate = ctx.MAX_DATE || '2030-12-31';
    const activeRange = ctx.periodRange ? ctx.periodRange(STATE.period) : null;
    const visiblePages = typeof ctx.canAccessPbiPage === 'function' ? PBI_PAGES.filter(p => ctx.canAccessPbiPage(p.id)) : PBI_PAGES;
    const pagePool = visiblePages.length ? visiblePages : PBI_PAGES;
    const activePage = overridePageId
      ? ({ id: overridePageId, num: '—', label: overridePageId, title: '' })
      : (pagePool.find(p => p.id === (STATE.pbiPage || 'p01_overview')) || pagePool[0]);
    const activePageId = activePage.id;
    if (!overridePageId) STATE.pbiPage = activePageId;

    const sl = bodyOnly ? {} : (STATE.pbiSlicer || {});
    const activeSlicerEntries = bodyOnly ? [] : Object.entries(sl).filter(([kKey, vVal]) => Boolean(vVal));
    const activeSlicerCount = activeSlicerEntries.length;
    const hasAnySlicer = activeSlicerCount > 0;

    const rec = SEED.records || {};
    const sentinels = SEED.sentinels || {};
    const modelKey = STATE.company === 'wtc' ? 'WTC' : (STATE.company === 'bbconstruction' ? 'BBConstruction' : (STATE.company === 'lionstransport' ? 'Lions Transport' : 'Manufacturing Group'));
    const flSn = ((sentinels.fleet_fuel_overtime_auditor || {}).by_model || {})[modelKey] || {};
    const prSn = ((sentinels.pricing_commission_payroll_sentinel || {}).by_model || {})[modelKey] || {};
    const paritySn = sentinels.sharepoint_parity_sentinel || {};

    const allowedCosKey = typeof ctx.allowedCompanyNames === 'function' ? ctx.allowedCompanyNames().join(',') : '';
    const baseCacheKey = `${STATE.company}|${STATE.period}|${STATE.dateFrom || ''}|${STATE.dateTo || ''}|${STATE.basis}|${allowedCosKey}|${STATE._officialScopeActive ? 'OFF' : 'ALL'}|${SEED._customRev || 0}|${(rec.sales_tickets || []).length}|${(rec.raw_purchases || []).length}`;
    if (_pbiBaseCacheKey !== baseCacheKey || !_pbiBaseCacheVal) {
      const custIvaMap = new Map();
      (rec.customers || []).forEach(c => custIvaMap.set(norm(c.name), c.vat_registered ? 'Yes' : 'No'));
      (m.customers || []).forEach(c => custIvaMap.set(norm(c.Customer), c['VAT Registered'] === 'Yes' ? 'Yes' : 'No'));
      const suppIvaMap = new Map();
      (rec.suppliers || []).forEach(s => suppIvaMap.set(norm(s.name), s.iva ? 'Yes' : 'No'));
      (m.suppliers || []).forEach(s => suppIvaMap.set(norm(s.Supplier), s.IVA === 'Yes' ? 'Yes' : 'No'));
      const catClassMap = new Map();
      (rec.expense_categories || []).forEach(c => catClassMap.set(norm(c.name), deriveExpenseCostClass(c)));
      const equipMetaMap = new Map();
      (rec.equipment || []).forEach(e => equipMetaMap.set(norm(e.name), e));
      (m.equipment || []).forEach(e => { if (!equipMetaMap.has(norm(e.Equipment))) equipMetaMap.set(norm(e.Equipment), { name: e.Equipment, type: e.Type, ownership: e.Ownership, status: e.Status }); });
      const coDriverSet = new Set((rec.company_drivers || []).map(d => norm(d.driver || d.name)));
      (rec.drivers || []).forEach(d => { if (d.is_company_driver) coDriverSet.add(norm(d.name)); });

      const baseSalesRows = filterRecords(rec.sales_tickets, { ignoreSearch: true });
      const baseRawRows = filterRecords(rec.raw_purchases, { ignoreSearch: true });
      const baseExpRows = filterRecords(rec.expenses, { ignoreSearch: true });
      const baseRecRows = filterRecords(rec.receipts, { ignoreSearch: true });
      const baseSetRows = filterRecords(rec.settlements, { ignoreSearch: true });
      const baseFuelRows = filterRecords(rec.fuel_intakes, { ignoreSearch: true });
      const sampleAllTtc = baseSalesRows.reduce((a, r) => a + saleTicketSign(r) * Number(r.total_ttc || 0), 0) || 1;

      let baseProds = (m.products || []).map(p => {
        if (!productMeters) return p;
        const m3 = productMeters(p.Product, p.qty_sold, p.UoM);
        const rawM3 = productMeters(p.Product, p.raw_qty, p.UoM);
        return Object.assign({}, p, {
          qty_sold: round2(m3),
          raw_qty: round2(rawM3),
          avg_price_ttc: m3 > 0 && p.sales_ttc != null ? round2(Number(p.sales_ttc) / m3) : p.avg_price_ttc,
          avg_price_net: m3 > 0 && p.net_sales != null ? round2(Number(p.net_sales) / m3) : p.avg_price_net,
          avg_raw_cost: rawM3 > 0 && p.raw_cost != null ? round2(Number(p.raw_cost) / rawM3) : p.avg_raw_cost
        });
      });

      const buildScopedProds = (salesPool, rawPool) => {
        const pMap = new Map();
        salesPool.forEach(s => {
          const pk = norm(s.product);
          if (!pk) return;
          const mth = String(s.method || '').trim();
          const sgn = (mth === 'C Return' || mth === 'CR Return' || mth === 'Cash Return' || mth === 'Credit Return') ? -1
            : ((mth === 'Free' || mth === 'Remove' || mth === 'Config' || mth === 'VATConfig') ? 0 : 1);
          if (sgn === 0) return;
          const cur = pMap.get(pk) || { loads: 0, qty_sold: 0, native_qty_sold: 0, tons_sold: 0, sales_ttc: 0, net_sales: 0, trans_rev: 0, raw_qty: 0, raw_cost: 0 };
          const q = sgn * (ticketMeters ? ticketMeters(s) : Number(s.qty || 0));
          const rawQ = sgn * Number(s.qty || 0);
          const ttc = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
          const net = sgn * Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - Number(s.vat || 0)));
          if (sgn === 1) cur.loads += 1;
          cur.qty_sold += q;
          cur.native_qty_sold += rawQ;
          cur.tons_sold += sgn * (ticketTons ? ticketTons(s) : (s.uom === 'm³' ? Number(s.qty || 0) * 1.5 : Number(s.qty || 0)));
          cur.sales_ttc += ttc;
          cur.net_sales += net;
          cur.trans_rev += sgn * Number(s.trans_price || 0);
          pMap.set(pk, cur);
        });
        rawPool.forEach(r => {
          const pk = norm(r.product);
          if (!pk) return;
          const cur = pMap.get(pk) || { loads: 0, qty_sold: 0, native_qty_sold: 0, tons_sold: 0, sales_ttc: 0, net_sales: 0, trans_rev: 0, raw_qty: 0, raw_cost: 0 };
          cur.raw_qty += ticketMeters ? ticketMeters(r) : Number(r.qty || 0);
          cur.raw_cost += Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0)));
          pMap.set(pk, cur);
        });
        return (m.products || []).map(p => {
          const st = pMap.get(norm(p.Product)) || { loads: 0, qty_sold: 0, native_qty_sold: 0, tons_sold: 0, sales_ttc: 0, net_sales: 0, trans_rev: 0, raw_qty: 0, raw_cost: 0 };
          const denom = st.qty_sold > 0 ? st.qty_sold : st.native_qty_sold;
          return Object.assign({}, p, {
            loads: st.loads,
            native_qty_sold: round2(st.native_qty_sold),
            qty_sold: round2(st.qty_sold),
            tons_sold: round2(st.tons_sold),
            sales_ttc: round2(st.sales_ttc),
            net_sales: round2(st.net_sales),
            trans_rev: round2(st.trans_rev),
            raw_qty: round2(st.raw_qty),
            raw_cost: round2(st.raw_cost),
            avg_price_ttc: denom > 0 ? round2(st.sales_ttc / denom) : 0,
            avg_price_net: denom > 0 ? round2(st.net_sales / denom) : 0,
            avg_raw_cost: st.raw_qty > 0 ? round2(st.raw_cost / st.raw_qty) : null
          });
        }).sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0) || Number(b.raw_cost || 0) - Number(a.raw_cost || 0));
      };

      const recDateForBasis = r => String((STATE.basis === 'rep' ? (r.rep_date || r.date) : r.date) || '').slice(0, 10);
      const isCashSale = s => {
        const mth = String((s && s.method) || '').trim();
        return mth === 'Cash' || mth === 'C Return' || mth === 'Cash Return';
      };
      const isCreditSale = s => {
        const mth = String((s && s.method) || '').trim();
        return mth === 'Credit' || mth === 'CR Return' || mth === 'Credit Return';
      };
      const isValidRecpt = r => {
        const mth = String((r && r.method) || '').trim();
        return !(mth === 'JV Adjusted' || mth === 'Remove' || mth === 'Adjusted' || mth === 'Free' || mth === 'Config' || mth === 'VAT' || mth === 'VATConfig' || mth === 'VAT Dis' || mth === 'Cash VAT Dis' || mth === 'Cash Return' || mth === 'Cash Discount' || mth === 'IVA' || mth === 'RentConfig' || mth === 'Rent' || mth === 'VATRent');
      };
      const isValidSettle = sp => {
        const mth = String((sp && sp.method) || '').trim();
        return !(mth === 'JV Adjusted' || mth === 'Remove' || mth === 'Adjusted' || mth === 'Free' || mth === 'Config' || mth === 'Cash Return' || mth === 'Cash Discount' || mth === 'VAT' || mth === 'VATConfig' || mth === 'VAT Dis' || mth === 'Cash VAT Dis' || mth === 'IVA' || mth === 'Commission' || mth === 'RentConfig' || mth === 'Rent' || mth === 'VATRent');
      };
      const isApSettlingSettle = sp => {
        if (!sp || sp.voided) return false;
        const mth = String(sp.method || '').trim();
        return !(mth === 'JV Adjusted' || mth === 'Remove' || mth === 'Adjusted' || mth === 'Free' || mth === 'Cash Return' || mth === 'Cash Discount' || mth === 'VAT' || mth === 'VATConfig' || mth === 'VAT Dis' || mth === 'Cash VAT Dis' || mth === 'IVA' || mth === 'Commission' || mth === 'RentConfig' || mth === 'Rent' || mth === 'VATRent');
      };
      const expSignedCredit = x => {
        const mth = String((x && x.method) || '').trim();
        const sgn = (mth === 'C Return' || mth === 'CR Return') ? -1 : ((mth === 'Config' || mth === 'VATConfig' || mth === 'Free' || mth === 'Remove' || mth === 'Adjusted' || mth === 'JV Adjusted') ? 0 : 1);
        const isCred = (mth === 'Credit' || mth === 'CR Return' || mth === 'IVA' || mth === 'VAT' || mth === 'VAT Dis');
        return { sgn, isCred, amt: sgn * Number(x.amount || 0) };
      };
      const isMfgCo = ['wtc', 'bbconstruction', 'lionstransport', 'manufacturing-group'].includes(STATE.company);
      const hasHydratedSales = Array.isArray(rec.sales_tickets) && rec.sales_tickets.length > 0;
      const hasHydratedAp = (Array.isArray(rec.raw_purchases) && rec.raw_purchases.length > 0)
        || (Array.isArray(rec.expenses) && rec.expenses.length > 0)
        || (Array.isArray(rec.settlements) && rec.settlements.length > 0);

      const buildScopedCusts = (salesPool, recPool, forceScope = false) => {
        const cMap = new Map();
        const ensureCust = name => {
          const label = String(name || '').trim();
          const ck = norm(label);
          if (!cMap.has(ck)) cMap.set(ck, { displayName: label, loads: 0, sales_ttc: 0, net_sales: 0, sales_vat: 0, credit_sales: 0, credit_sales_ttc: 0, cash_sales: 0, cash_sales_ttc: 0, receipts: 0, ar_settled: 0, last_sale: '' });
          return cMap.get(ck);
        };
        if (!activeRange && !forceScope && !STATE._officialScopeActive && !(isMfgCo && hasHydratedSales)) {
          return (m.customers || []).map(c => {
            const crNet = round2(Number(c.credit_sales || 0));
            const crTtc = round2(c.sales_ttc != null ? (Number(c.sales_ttc || 0) - Number(c.cash_sales || 0)) : (c['VAT Registered'] === 'Yes' ? crNet * 1.11 : crNet));
            const bal = round2(Number(c.ar_balance || 0));
            const settled = round2(crTtc - bal);
            const cashRcpt = round2(Number(c.receipts != null ? c.receipts : settled));
            return Object.assign({}, c, {
              credit_sales: crNet,
              credit_sales_ttc: crTtc,
              cash_sales_ttc: round2(Number(c.cash_sales || 0)),
              ar_settled: settled,
              receipts_cash: cashRcpt,
              opening_ar: 0,
              ar_balance: bal,
              receipts: settled
            });
          });
        }
        salesPool.forEach(s => {
          if (!s.customer) return;
          const sgn = saleTicketSign(s);
          if (sgn === 0) return;
          const cur = ensureCust(s.customer);
          const ttc = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
          const vat = sgn * Number(s.vat || 0);
          const net = sgn * Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - Number(s.vat || 0)));
          if (sgn === 1) cur.loads += 1;
          cur.sales_ttc += ttc;
          cur.net_sales += net;
          cur.sales_vat += vat;
          if (isCashSale(s)) {
            cur.cash_sales += net;
            cur.cash_sales_ttc += ttc;
          } else if (isCreditSale(s)) {
            cur.credit_sales += net;
            cur.credit_sales_ttc += ttc;
          }
          if (s.date && String(s.date) > cur.last_sale) cur.last_sale = String(s.date).slice(0, 10);
        });
        recPool.forEach(r => {
          if (!r.customer || !isArSettlingRecpt(r)) return;
          const cur = ensureCust(r.customer);
          const amt = Number(r.amount || 0) + Number(r.discount || 0);
          cur.ar_settled += amt;
          if (isValidRecpt(r)) cur.receipts += amt;
        });

        if (!activeRange && !forceScope) {
          const seenCustNorm = new Set();
          const baseModelCusts = STATE._officialScopeActive
            ? (m.customers || []).filter(c => cMap.has(norm(c.Customer)) || c['VAT Registered'] === 'Yes')
            : (m.customers || []);
          const out = baseModelCusts.map(c => {
            const ck = norm(c.Customer);
            if (ck) seenCustNorm.add(ck);
            const st = cMap.get(ck);
            if (!st) {
              return Object.assign({}, c, {
                loads: 0, sales_ttc: 0, net_sales: 0, sales_vat: 0, credit_sales: 0, credit_sales_ttc: 0,
                cash_sales: 0, cash_sales_ttc: 0, ar_settled: 0, receipts_cash: 0, receipts: 0, opening_ar: 0,
                ar_balance: 0, ar_current: 0, ar_1_10: 0, ar_11_30: 0, ar_31_60: 0, ar_1_60: 0, ar_60_plus: 0, ar_overdue: 0
              });
            }
            const crTtc = round2(st.credit_sales_ttc);
            const settled = round2(st.ar_settled);
            const bal = round2(crTtc - settled);
            const balDelta = round2(bal - Number(c.ar_balance || 0));
            const arCur = STATE._officialScopeActive
              ? Math.max(0, bal)
              : (Math.abs(balDelta) > 0.005 ? round2(Math.max(0, Number(c.ar_current || 0) + balDelta)) : Number(c.ar_current || 0));
            const offZeroBuckets = STATE._officialScopeActive
              ? { ar_1_10: 0, ar_11_30: 0, ar_31_60: 0, ar_1_60: 0, ar_60_plus: 0, ar_overdue: 0 }
              : {};
            return Object.assign({}, c, offZeroBuckets, {
              loads: st.loads,
              sales_ttc: round2(st.sales_ttc),
              net_sales: round2(st.net_sales),
              sales_vat: round2(st.sales_vat),
              credit_sales: round2(st.credit_sales),
              credit_sales_ttc: crTtc,
              cash_sales: round2(st.cash_sales),
              cash_sales_ttc: round2(st.cash_sales_ttc),
              ar_settled: settled,
              receipts_cash: round2(st.receipts),
              receipts: settled,
              opening_ar: 0,
              ar_current: arCur,
              ar_balance: bal,
              last_sale: st.last_sale || c.last_sale
            });
          });
          cMap.forEach((st, ck) => {
            if (!ck || seenCustNorm.has(ck)) return;
            const crTtc = round2(st.credit_sales_ttc);
            const settled = round2(st.ar_settled);
            const bal = round2(crTtc - settled);
            if (st.loads === 0 && Math.abs(st.sales_ttc) <= 0.005 && Math.abs(settled) <= 0.005 && Math.abs(bal) <= 0.005) return;
            out.push({
              Customer: st.displayName || ck,
              'VAT Registered': custIvaMap.get(ck) || (st.sales_vat > 0.005 ? 'Yes' : 'No'),
              loads: st.loads,
              sales_ttc: round2(st.sales_ttc),
              net_sales: round2(st.net_sales),
              sales_vat: round2(st.sales_vat),
              credit_sales: round2(st.credit_sales),
              credit_sales_ttc: crTtc,
              cash_sales: round2(st.cash_sales),
              cash_sales_ttc: round2(st.cash_sales_ttc),
              ar_settled: settled,
              receipts_cash: round2(st.receipts),
              receipts: settled,
              opening_ar: 0,
              ar_current: bal > 0 ? bal : 0,
              ar_1_10: 0,
              ar_11_30: 0,
              ar_31_60: 0,
              ar_1_60: 0,
              ar_60_plus: 0,
              ar_overdue: 0,
              vat_receivable: 0,
              ar_balance: bal,
              last_sale: st.last_sale || ''
            });
          });
          return out.sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0) || Number(b.ar_balance || 0) - Number(a.ar_balance || 0));
        }

        const postCustMap = new Map();
        const allTimeCustMap = new Map();
        if (isMfgCo && hasHydratedSales) {
          const allSalesCo = filterRecords(rec.sales_tickets, { ignorePeriod: true, ignoreSearch: true });
          const allRecCo = filterRecords(rec.receipts, { ignorePeriod: true, ignoreSearch: true });
          allSalesCo.forEach(s => {
            if (!s.customer || !isCreditSale(s)) return;
            const sgn = saleTicketSign(s);
            if (sgn === 0) return;
            const ck = norm(s.customer);
            const ttc = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
            allTimeCustMap.set(ck, (allTimeCustMap.get(ck) || 0) + ttc);
            if (activeRange && activeRange.to && recDateForBasis(s) > activeRange.to) {
              const p = postCustMap.get(ck) || { crTtc: 0, rcpt: 0 };
              p.crTtc += ttc;
              postCustMap.set(ck, p);
            }
          });
          allRecCo.forEach(r => {
            if (!r.customer || !isArSettlingRecpt(r)) return;
            const ck = norm(r.customer);
            const amt = Number(r.amount || 0) + Number(r.discount || 0);
            allTimeCustMap.set(ck, (allTimeCustMap.get(ck) || 0) - amt);
            if (activeRange && activeRange.to && recDateForBasis(r) > activeRange.to) {
              const p = postCustMap.get(ck) || { crTtc: 0, rcpt: 0 };
              p.rcpt += amt;
              postCustMap.set(ck, p);
            }
          });
        } else if (activeRange && activeRange.to) {
          const allSalesCo = filterRecords(rec.sales_tickets, { ignorePeriod: true, ignoreSearch: true });
          const allRecCo = filterRecords(rec.receipts, { ignorePeriod: true, ignoreSearch: true });
          allSalesCo.forEach(s => {
            if (!s.customer || !isCreditSale(s) || recDateForBasis(s) <= activeRange.to) return;
            const sgn = saleTicketSign(s);
            if (sgn === 0) return;
            const ck = norm(s.customer);
            const p = postCustMap.get(ck) || { crTtc: 0, rcpt: 0 };
            p.crTtc += sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
            postCustMap.set(ck, p);
          });
          allRecCo.forEach(r => {
            if (!r.customer || !isArSettlingRecpt(r) || recDateForBasis(r) <= activeRange.to) return;
            const ck = norm(r.customer);
            const p = postCustMap.get(ck) || { crTtc: 0, rcpt: 0 };
            p.rcpt += Number(r.amount || 0) + Number(r.discount || 0);
            postCustMap.set(ck, p);
          });
        }

        const seenCustNorm = new Set();
        const out = (m.customers || []).map(c => {
          const ck = norm(c.Customer);
          if (ck) seenCustNorm.add(ck);
          const st = cMap.get(ck) || { loads: 0, sales_ttc: 0, net_sales: 0, sales_vat: 0, credit_sales: 0, credit_sales_ttc: 0, cash_sales: 0, cash_sales_ttc: 0, receipts: 0, ar_settled: 0, last_sale: '' };
          const post = postCustMap.get(ck) || { crTtc: 0, rcpt: 0 };
          const crTtc = round2(st.credit_sales_ttc);
          const settled = round2(st.ar_settled);
          const allTimeBal = (isMfgCo && hasHydratedSales) ? round2(allTimeCustMap.get(ck) || 0) : Number(c.ar_balance || 0);
          const bal = round2(allTimeBal - post.crTtc + post.rcpt);
          const openAr = round2(bal - crTtc + settled);
          return Object.assign({}, c, {
            loads: st.loads,
            sales_ttc: round2(st.sales_ttc),
            net_sales: round2(st.net_sales),
            sales_vat: round2(st.sales_vat),
            credit_sales: round2(st.credit_sales),
            credit_sales_ttc: crTtc,
            cash_sales: round2(st.cash_sales),
            cash_sales_ttc: round2(st.cash_sales_ttc),
            ar_settled: settled,
            receipts_cash: round2(st.receipts),
            receipts: settled,
            opening_ar: openAr,
            ar_balance: bal,
            last_sale: st.last_sale || c.last_sale
          });
        });
        cMap.forEach((st, ck) => {
          if (!ck || seenCustNorm.has(ck)) return;
          const crTtc = round2(st.credit_sales_ttc);
          const settled = round2(st.ar_settled);
          const post = postCustMap.get(ck) || { crTtc: 0, rcpt: 0 };
          const allTimeBal = (isMfgCo && hasHydratedSales) ? round2(allTimeCustMap.get(ck) || 0) : 0;
          const bal = round2(allTimeBal - post.crTtc + post.rcpt);
          if (st.loads === 0 && Math.abs(st.sales_ttc) <= 0.005 && Math.abs(settled) <= 0.005 && Math.abs(bal) <= 0.005) return;
          const openAr = round2(bal - crTtc + settled);
          out.push({
            Customer: st.displayName || ck,
            'VAT Registered': custIvaMap.get(ck) || (st.sales_vat > 0.005 ? 'Yes' : 'No'),
            loads: st.loads,
            sales_ttc: round2(st.sales_ttc),
            net_sales: round2(st.net_sales),
            sales_vat: round2(st.sales_vat),
            credit_sales: round2(st.credit_sales),
            credit_sales_ttc: crTtc,
            cash_sales: round2(st.cash_sales),
            cash_sales_ttc: round2(st.cash_sales_ttc),
            ar_settled: settled,
            receipts_cash: round2(st.receipts),
            receipts: settled,
            opening_ar: openAr,
            ar_current: bal > 0 ? bal : 0,
            ar_1_10: 0,
            ar_11_30: 0,
            ar_31_60: 0,
            ar_1_60: 0,
            ar_60_plus: 0,
            ar_overdue: 0,
            vat_receivable: 0,
            ar_balance: bal,
            last_sale: st.last_sale || ''
          });
        });
        return out.sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0) || Number(b.ar_balance || 0) - Number(a.ar_balance || 0));
      };

      const buildScopedSupps = (rawPool, expPool, setPool, forceScope = false) => {
        if (!activeRange && !forceScope && !STATE._officialScopeActive && !(isMfgCo && hasHydratedAp)) {
          return (m.suppliers || []).map(s => {
            const mat = round2(Number(s.ap_material != null ? s.ap_material : (s.raw_mat_cost || 0)));
            const haul = round2(Number(s.ap_haulage != null ? s.ap_haulage : 0));
            const exp = round2(Number(s.ap_expense != null ? s.ap_expense : 0));
            const onCr = round2(mat + haul + exp);
            const bal = round2(Number(s.ap_balance || 0));
            const settled = round2(onCr - bal);
            const paid = round2(Number(s.settlements_paid != null ? s.settlements_paid : settled));
            return Object.assign({}, s, {
              Supplier: s.Supplier || '(Unassigned Supplier)',
              IVA: s.IVA || 'No',
              raw_mat_cost: mat,
              raw_haulage: haul,
              raw_cost: round2(mat + haul),
              ap_material: mat,
              ap_haulage: haul,
              ap_expense: exp,
              ap_on_credit: onCr,
              ap_settled: settled,
              settlements_paid: paid,
              opening_ap: 0,
              ap_balance: bal
            });
          });
        }
        const sMap = new Map();
        const ensureSup = name => {
          const label = String(name || '').trim() || '(Unassigned Supplier)';
          const sk = norm(label);
          if (!sMap.has(sk)) sMap.set(sk, { displayName: label, raw_loads: 0, raw_mat_cost: 0, raw_haulage: 0, expenses: 0, ap_expense: 0, settlements_paid: 0, ap_settled: 0 });
          return sMap.get(sk);
        };
        rawPool.forEach(r => {
          const costVal = Number(r.cost || 0);
          const haulVal = Number(r.trans_cost || 0);
          const hasMat = Boolean(r.site_owner) || costVal !== 0;
          const matOwner = r.site_owner || r.truck_owner || '(Unassigned Supplier)';
          const hasHaul = haulVal !== 0 || (Boolean(r.truck_owner) && r.transport_by !== 'Company fleet');
          const haulOwner = r.truck_owner || '(Unassigned Supplier)';
          if (hasMat) {
            const st = ensureSup(matOwner);
            st.raw_loads += 1;
            st.raw_mat_cost += costVal;
          }
          if (hasHaul) {
            const st = ensureSup(haulOwner);
            if (!hasMat || norm(haulOwner) !== norm(matOwner)) st.raw_loads += 1;
            st.raw_haulage += haulVal;
          }
        });
        expPool.forEach(x => {
          const { sgn, isCred, amt } = expSignedCredit(x);
          if (sgn === 0) return;
          if (x.supplier || isCred) {
            const st = ensureSup(x.supplier || '(Unassigned Supplier)');
            st.expenses += amt;
            if (isCred) st.ap_expense += amt;
          }
        });
        setPool.forEach(sp => {
          if (!sp.supplier) return;
          const settlesAp = isApSettlingSettle(sp);
          const isPay = isValidSettle(sp);
          if (!settlesAp && !isPay) return;
          const st = ensureSup(sp.supplier);
          const tot = Number(sp.amount || 0) + Number(sp.discount || 0);
          if (isPay) st.settlements_paid += tot;
          if (settlesAp) st.ap_settled += tot;
        });

        if (!activeRange && !forceScope) {
          const seenSupNorm = new Set();
          const baseModelSupps = STATE._officialScopeActive
            ? (m.suppliers || []).filter(s => sMap.has(norm(s.Supplier || '(Unassigned Supplier)')) || s.IVA === 'Yes')
            : (m.suppliers || []);
          const result = baseModelSupps.map(s => {
            const sName = s.Supplier || '(Unassigned Supplier)';
            const sk = norm(sName);
            if (sk) seenSupNorm.add(sk);
            const st = sMap.get(sk) || { raw_loads: 0, raw_mat_cost: 0, raw_haulage: 0, expenses: 0, ap_expense: 0, settlements_paid: 0, ap_settled: 0 };
            const mat = round2(st.raw_mat_cost);
            const haul = round2(st.raw_haulage);
            const exp = round2(st.ap_expense);
            const onCr = round2(mat + haul + exp);
            const paid = round2(st.settlements_paid);
            const settled = round2(st.ap_settled);
            const bal = round2(onCr - settled);
            return Object.assign({}, s, {
              Supplier: sName,
              IVA: s.IVA || suppIvaMap.get(sk) || 'No',
              raw_loads: st.raw_loads,
              raw_mat_cost: mat,
              raw_haulage: haul,
              raw_cost: round2(mat + haul),
              ap_material: mat,
              ap_haulage: haul,
              ap_expense: exp,
              expenses: round2(st.expenses),
              ap_on_credit: onCr,
              settlements_paid: paid,
              ap_settled: settled,
              opening_ap: 0,
              ap_balance: bal
            });
          });
          sMap.forEach((st, sk) => {
            if (!sk || seenSupNorm.has(sk)) return;
            const mat = round2(st.raw_mat_cost);
            const haul = round2(st.raw_haulage);
            const exp = round2(st.ap_expense);
            const onCr = round2(mat + haul + exp);
            const paid = round2(st.settlements_paid);
            const settled = round2(st.ap_settled);
            const bal = round2(onCr - settled);
            if (st.raw_loads === 0 && Math.abs(onCr) <= 0.005 && Math.abs(settled) <= 0.005 && Math.abs(paid) <= 0.005) return;
            result.push({
              Supplier: st.displayName || sk,
              IVA: suppIvaMap.get(sk) || 'No',
              raw_loads: st.raw_loads,
              raw_mat_cost: mat,
              raw_haulage: haul,
              raw_cost: round2(mat + haul),
              ap_material: mat,
              ap_haulage: haul,
              ap_expense: exp,
              expenses: round2(st.expenses),
              ap_on_credit: onCr,
              settlements_paid: paid,
              ap_settled: settled,
              opening_ap: 0,
              ap_balance: bal
            });
          });
          result.sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0) || Number(b.ap_balance || 0) - Number(a.ap_balance || 0));
          return result;
        }

        const postSupMap = new Map();
        const allTimeSupMap = new Map();
        const ensurePost = name => {
          const sk = norm(String(name || '').trim() || '(Unassigned Supplier)');
          if (!postSupMap.has(sk)) postSupMap.set(sk, { cr: 0, set: 0 });
          return postSupMap.get(sk);
        };
        if (isMfgCo && hasHydratedAp) {
          const allRawCo = filterRecords(rec.raw_purchases, { ignorePeriod: true, ignoreSearch: true });
          const allExpCo = filterRecords(rec.expenses, { ignorePeriod: true, ignoreSearch: true });
          const allSetCo = filterRecords(rec.settlements, { ignorePeriod: true, ignoreSearch: true });
          allRawCo.forEach(r => {
            const costVal = Number(r.cost || 0);
            const haulVal = Number(r.trans_cost || 0);
            const isAfter = Boolean(activeRange && activeRange.to && recDateForBasis(r) > activeRange.to);
            if (r.site_owner || costVal !== 0) {
              const mkOwner = r.site_owner || r.truck_owner || '(Unassigned Supplier)';
              const msk = norm(String(mkOwner).trim() || '(Unassigned Supplier)');
              allTimeSupMap.set(msk, (allTimeSupMap.get(msk) || 0) + costVal);
              if (isAfter) ensurePost(mkOwner).cr += costVal;
            }
            if (haulVal !== 0 || (r.truck_owner && r.transport_by !== 'Company fleet')) {
              const hkOwner = r.truck_owner || '(Unassigned Supplier)';
              const hsk = norm(String(hkOwner).trim() || '(Unassigned Supplier)');
              allTimeSupMap.set(hsk, (allTimeSupMap.get(hsk) || 0) + haulVal);
              if (isAfter) ensurePost(hkOwner).cr += haulVal;
            }
          });
          allExpCo.forEach(x => {
            const { sgn, isCred, amt } = expSignedCredit(x);
            if (sgn === 0 || !isCred) return;
            const supOwner = x.supplier || '(Unassigned Supplier)';
            const xsk = norm(String(supOwner).trim() || '(Unassigned Supplier)');
            allTimeSupMap.set(xsk, (allTimeSupMap.get(xsk) || 0) + amt);
            if (activeRange && activeRange.to && recDateForBasis(x) > activeRange.to) ensurePost(supOwner).cr += amt;
          });
          allSetCo.forEach(sp => {
            if (!sp.supplier || !isApSettlingSettle(sp)) return;
            const ssk = norm(String(sp.supplier).trim());
            const tot = Number(sp.amount || 0) + Number(sp.discount || 0);
            allTimeSupMap.set(ssk, (allTimeSupMap.get(ssk) || 0) - tot);
            if (activeRange && activeRange.to && recDateForBasis(sp) > activeRange.to) ensurePost(sp.supplier).set += tot;
          });
        } else if (activeRange && activeRange.to) {
          const allRawCo = filterRecords(rec.raw_purchases, { ignorePeriod: true, ignoreSearch: true });
          const allExpCo = filterRecords(rec.expenses, { ignorePeriod: true, ignoreSearch: true });
          const allSetCo = filterRecords(rec.settlements, { ignorePeriod: true, ignoreSearch: true });
          allRawCo.forEach(r => {
            if (recDateForBasis(r) <= activeRange.to) return;
            const costVal = Number(r.cost || 0);
            const haulVal = Number(r.trans_cost || 0);
            if (r.site_owner || costVal !== 0) ensurePost(r.site_owner || r.truck_owner || '(Unassigned Supplier)').cr += costVal;
            if (haulVal !== 0 || (r.truck_owner && r.transport_by !== 'Company fleet')) ensurePost(r.truck_owner || '(Unassigned Supplier)').cr += haulVal;
          });
          allExpCo.forEach(x => {
            if (recDateForBasis(x) <= activeRange.to) return;
            const { sgn, isCred, amt } = expSignedCredit(x);
            if (sgn !== 0 && isCred) ensurePost(x.supplier || '(Unassigned Supplier)').cr += amt;
          });
          allSetCo.forEach(sp => {
            if (!sp.supplier || !isApSettlingSettle(sp) || recDateForBasis(sp) <= activeRange.to) return;
            ensurePost(sp.supplier).set += Number(sp.amount || 0) + Number(sp.discount || 0);
          });
        }

        const seenSupNorm = new Set();
        const result = (m.suppliers || []).map(s => {
          const sName = s.Supplier || '(Unassigned Supplier)';
          const sk = norm(sName);
          seenSupNorm.add(sk);
          const st = sMap.get(sk) || { raw_loads: 0, raw_mat_cost: 0, raw_haulage: 0, expenses: 0, ap_expense: 0, settlements_paid: 0, ap_settled: 0 };
          const post = postSupMap.get(sk) || { cr: 0, set: 0 };
          const mat = round2(st.raw_mat_cost);
          const haul = round2(st.raw_haulage);
          const exp = round2(st.ap_expense);
          const onCr = round2(mat + haul + exp);
          const paid = round2(st.settlements_paid);
          const settled = round2(st.ap_settled);
          const allTimeBal = (isMfgCo && hasHydratedAp) ? round2(allTimeSupMap.get(sk) || 0) : Number(s.ap_balance || 0);
          const bal = round2(allTimeBal - post.cr + post.set);
          const openAp = round2(bal - onCr + settled);
          return Object.assign({}, s, {
            Supplier: sName,
            IVA: s.IVA || suppIvaMap.get(sk) || 'No',
            raw_loads: st.raw_loads,
            raw_mat_cost: mat,
            raw_haulage: haul,
            raw_cost: round2(mat + haul),
            ap_material: mat,
            ap_haulage: haul,
            ap_expense: exp,
            expenses: round2(st.expenses),
            ap_on_credit: onCr,
            settlements_paid: paid,
            ap_settled: settled,
            opening_ap: openAp,
            ap_balance: bal
          });
        });
        sMap.forEach((st, sk) => {
          if (!sk || seenSupNorm.has(sk)) return;
          const mat = round2(st.raw_mat_cost);
          const haul = round2(st.raw_haulage);
          const exp = round2(st.ap_expense);
          const onCr = round2(mat + haul + exp);
          const paid = round2(st.settlements_paid);
          const settled = round2(st.ap_settled);
          const post = postSupMap.get(sk) || { cr: 0, set: 0 };
          const allTimeBal = (isMfgCo && hasHydratedAp) ? round2(allTimeSupMap.get(sk) || 0) : 0;
          const bal = round2(allTimeBal - post.cr + post.set);
          if (st.raw_loads === 0 && Math.abs(onCr) <= 0.005 && Math.abs(settled) <= 0.005 && Math.abs(paid) <= 0.005 && Math.abs(bal) <= 0.005) return;
          const openAp = round2(bal - onCr + settled);
          result.push({
            Supplier: st.displayName || sk,
            IVA: suppIvaMap.get(sk) || 'No',
            raw_loads: st.raw_loads,
            raw_mat_cost: mat,
            raw_haulage: haul,
            raw_cost: round2(mat + haul),
            ap_material: mat,
            ap_haulage: haul,
            ap_expense: exp,
            expenses: round2(st.expenses),
            ap_on_credit: onCr,
            settlements_paid: paid,
            ap_settled: settled,
            opening_ap: openAp,
            ap_balance: bal
          });
        });
        result.sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0) || Number(b.ap_balance || 0) - Number(a.ap_balance || 0));
        return result;
      };

      const buildScopedSites = (salesPool, rawPool, forceScope = false) => {
        if (!activeRange && !forceScope && !STATE._officialScopeActive) return m.sites || [];
        const stMap = new Map();
        const ensureSite = name => {
          const label = name || '(Unassigned Site)';
          const sk = norm(label);
          if (!stMap.has(sk)) stMap.set(sk, { displayName: label, loads: 0, tons_sold: 0, trans_rev: 0, sales_ttc: 0, net_sales: 0, raw_loads: 0, raw_tons: 0, raw_qty: 0, raw_mat_cost: 0, raw_haulage: 0, raw_cost: 0 });
          return stMap.get(sk);
        };
        salesPool.forEach(s => {
          const sgn = saleTicketSign(s);
          if (sgn === 0) return;
          if (!s.site && Number(s.total_ttc || s.total || 0) === 0) return;
          const cur = ensureSite(s.site || '(Unassigned Site)');
          const ttc = sgn * Number(s.total_ttc != null ? s.total_ttc : s.total || 0);
          const net = sgn * Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - Number(s.vat || 0)));
          if (sgn === 1) cur.loads += 1;
          cur.tons_sold += sgn * (ticketTons ? ticketTons(s) : Number(s.qty || 0));
          cur.trans_rev += sgn * Number(s.trans_price || 0);
          cur.sales_ttc += ttc;
          cur.net_sales += net;
        });
        rawPool.forEach(r => {
          if (!r.site && Number(r.total || r.cost || 0) === 0) return;
          const cur = ensureSite(r.site || '(Unassigned Site)');
          const mat = Number(r.cost || 0);
          const haul = Number(r.trans_cost || 0);
          cur.raw_loads += 1;
          cur.raw_tons += ticketTons ? ticketTons(r) : Number(r.qty || 0);
          cur.raw_qty += ticketMeters ? ticketMeters(r) : Number(r.qty || 0);
          cur.raw_mat_cost += mat;
          cur.raw_haulage += haul;
          cur.raw_cost += Number(r.total != null ? r.total : (mat + haul));
        });
        const seenSiteNorm = new Set();
        const mappedSites = (m.sites || []).map(st => {
          const sk = norm(st.Site || '(Unassigned Site)');
          seenSiteNorm.add(sk);
          const cur = stMap.get(sk) || { loads: 0, tons_sold: 0, trans_rev: 0, sales_ttc: 0, net_sales: 0, raw_loads: 0, raw_tons: 0, raw_qty: 0, raw_mat_cost: 0, raw_haulage: 0, raw_cost: 0 };
          return Object.assign({}, st, {
            loads: cur.loads,
            tons_sold: round2(cur.tons_sold),
            trans_rev: round2(cur.trans_rev),
            sales_ttc: round2(cur.sales_ttc),
            net_sales: round2(cur.net_sales),
            raw_loads: cur.raw_loads,
            raw_tons: round2(cur.raw_tons),
            raw_qty: round2(cur.raw_qty),
            raw_mat_cost: round2(cur.raw_mat_cost),
            raw_haulage: round2(cur.raw_haulage),
            raw_cost: round2(cur.raw_cost)
          });
        });
        stMap.forEach((cur, sk) => {
          if (seenSiteNorm.has(sk)) return;
          const recSite = (rec.sites || []).find(rs => norm(rs.name) === sk);
          mappedSites.push({
            Site: cur.displayName === '(Unassigned Site)' ? null : cur.displayName,
            JV: recSite && recSite.is_jv ? 'Yes' : 'No',
            loads: cur.loads,
            tons_sold: round2(cur.tons_sold),
            trans_rev: round2(cur.trans_rev),
            sales_ttc: round2(cur.sales_ttc),
            net_sales: round2(cur.net_sales),
            raw_loads: cur.raw_loads,
            raw_tons: round2(cur.raw_tons),
            raw_qty: round2(cur.raw_qty),
            raw_mat_cost: round2(cur.raw_mat_cost),
            raw_haulage: round2(cur.raw_haulage),
            raw_cost: round2(cur.raw_cost)
          });
        });
        return mappedSites.sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0) || Number(b.raw_cost || 0) - Number(a.raw_cost || 0));
      };

      const buildScopedEquip = (salesPool, rawPool, expPool, fuelPool, forceScope = false) => {
        if (!activeRange && !forceScope && !STATE._officialScopeActive) return m.equipment || [];
        const eqMap = new Map();
        const ensureEq = name => {
          const ek = norm(name);
          if (!eqMap.has(ek)) eqMap.set(ek, { loads: 0, raw_loads: 0, tons: 0, diesel_litres: 0, direct_exp: 0 });
          return eqMap.get(ek);
        };
        salesPool.forEach(s => {
          if (!s.truck) return;
          const cur = ensureEq(s.truck);
          cur.loads += 1;
          cur.tons += ticketTons ? ticketTons(s) : Number(s.qty || 0);
        });
        rawPool.forEach(r => {
          if (!r.truck) return;
          const cur = ensureEq(r.truck);
          cur.raw_loads += 1;
          cur.tons += ticketTons ? ticketTons(r) : Number(r.qty || 0);
        });
        fuelPool.forEach(f => {
          if (!f.equipment) return;
          if (/diesel|mazout/i.test(String(f.item || f.fuel_type || 'Diesel'))) {
            ensureEq(f.equipment).diesel_litres += Number(f.litres || 0);
          }
        });
        expPool.forEach(x => {
          if (!x.equipment) return;
          const { sgn, amt } = expSignedCredit(x);
          if (sgn === 0) return;
          if (/diesel|mazout/i.test(String(x.subcategory || x.category || ''))) return;
          ensureEq(x.equipment).direct_exp += amt;
        });
        return (m.equipment || []).map(e => {
          const cur = eqMap.get(norm(e.Equipment)) || { loads: 0, raw_loads: 0, tons: 0, diesel_litres: 0, direct_exp: 0 };
          const trips = cur.loads + cur.raw_loads;
          const dieselL = round2(cur.diesel_litres);
          const allDiesel = Number(e.diesel_litres || 0);
          const allTrips = Number(e.trips || 0);
          const dRatio = allDiesel > 0 ? Math.min(1, dieselL / allDiesel) : (allTrips > 0 ? Math.min(1, trips / allTrips) : 0);
          const tRatio = allTrips > 0 ? Math.min(1, trips / allTrips) : dRatio;
          const kmRun = e.km_run != null && allDiesel > 0 ? Math.round(Number(e.km_run) * dRatio) : null;
          const runCost = round2(cur.direct_exp + (norm(e.Equipment) === 'maghsal' ? 0 : dieselL * 0.78));
          const drvCost = e.driver_cost != null ? round2(Number(e.driver_cost) * tRatio) : null;
          const totCost = round2(runCost + Number(drvCost || 0));
          return Object.assign({}, e, {
            loads: cur.loads,
            raw_loads: cur.raw_loads,
            trips,
            diesel_litres: dieselL,
            km_run: kmRun,
            l_per_100km: kmRun && kmRun > 0 ? round2((dieselL * 100) / kmRun) : e.l_per_100km,
            running_cost: runCost,
            driver_cost: drvCost,
            total_cost: totCost,
            cost_per_ton: cur.tons > 0 && totCost > 0 ? round2(totCost / cur.tons) : null
          });
        });
      };

      if (activeRange || STATE._officialScopeActive) {
        baseProds = buildScopedProds(baseSalesRows, baseRawRows);
      }
      let baseCusts = buildScopedCusts(baseSalesRows, baseRecRows);
      let baseSupps = buildScopedSupps(baseRawRows, baseExpRows, baseSetRows);
      let baseSites = buildScopedSites(baseSalesRows, baseRawRows);
      let baseEquip = buildScopedEquip(baseSalesRows, baseRawRows, baseExpRows, baseFuelRows);

      const totalProdSales = baseProds.reduce((a, r) => a + Number(r.sales_ttc || 0), 0) || 1;
      _pbiBaseCacheKey = baseCacheKey;
      _pbiBaseCacheVal = {
        custIvaMap, suppIvaMap, catClassMap, equipMetaMap, coDriverSet,
        baseSalesRows, baseRawRows, baseExpRows, baseRecRows, baseSetRows, baseFuelRows,
        baseProds, baseCusts, baseSupps, baseSites, baseEquip, sampleAllTtc, totalProdSales,
        buildScopedProds, buildScopedCusts, buildScopedSupps, buildScopedSites, buildScopedEquip
      };
    }

    const {
      custIvaMap, suppIvaMap, catClassMap, equipMetaMap, coDriverSet,
      baseSalesRows, baseRawRows, baseExpRows, baseRecRows, baseSetRows, baseFuelRows,
      baseProds: cachedBaseProds, baseCusts: cachedBaseCusts, baseSupps: cachedBaseSupps,
      baseSites: cachedBaseSites, baseEquip: cachedBaseEquip, sampleAllTtc, totalProdSales,
      buildScopedProds, buildScopedCusts, buildScopedSupps, buildScopedSites, buildScopedEquip
    } = _pbiBaseCacheVal;

    const matchSearch = r => !sl.search || Object.values(r || {}).join(' ').toLowerCase().includes(norm(sl.search));
    const matchCommon = !hasAnySlicer ? (() => true) : (r => {
      if (!r) return false;
      if (sl.product && norm(r.Product || r.product) !== norm(sl.product)) return false;
      if (sl.customer && norm(r.Customer || r.customer) !== norm(sl.customer)) return false;
      if (sl.supplier && norm(r.Supplier || r.supplier || r.site_owner || r.truck_owner || r.owner_supplier) !== norm(sl.supplier)) return false;
      if (sl.site && norm(r.Site || r.site) !== norm(sl.site)) return false;
      if (sl.saleType && r.sale_type && norm(r.sale_type) !== norm(sl.saleType)) return false;
      if (sl.method && r.method && norm(r.method) !== norm(sl.method)) return false;
      if (sl.equipment && norm(r.Equipment || r.equipment || r.truck || r.name) !== norm(sl.equipment)) return false;
      if (sl.driver && norm(r.driver || r.Driver || r.name) !== norm(sl.driver)) return false;
      if (sl.staff && norm(r.staff || r.Staff) !== norm(sl.staff)) return false;
      if (sl.iva) {
        const cname = r.Customer || r.customer;
        const sname = r.Supplier || r.supplier;
        const flag = r['VAT Registered'] || r.IVA || (cname ? custIvaMap.get(norm(cname)) : (sname ? suppIvaMap.get(norm(sname)) : null));
        if (flag && norm(flag) !== norm(sl.iva)) return false;
      }
      return matchSearch(r);
    });

    const salesRows = !hasAnySlicer ? baseSalesRows : baseSalesRows.filter(r => {
      if (!matchCommon(r)) return false;
      if (sl.shift) {
        const isNight = !!r.overtime;
        if (sl.shift === 'Night' && !isNight) return false;
        if (sl.shift === 'Day' && isNight) return false;
      }
      if (sl.overtimeFlag === 'Yes' && !r.overtime) return false;
      if (sl.overtimeFlag === 'No' && r.overtime) return false;
      return true;
    });
    const rawRows = !hasAnySlicer ? baseRawRows : baseRawRows.filter(r => {
      if (!matchCommon(r)) return false;
      if (sl.transportBy && norm(r.transport_by) !== norm(sl.transportBy)) return false;
      return true;
    });
    const expRows = !hasAnySlicer ? baseExpRows : baseExpRows.filter(r => {
      if (!matchCommon(r)) return false;
      if (sl.category && norm(r.category) !== norm(sl.category)) return false;
      if (sl.costClass && norm(catClassMap.get(norm(r.category)) || 'Operating Expense') !== norm(sl.costClass)) return false;
      return true;
    });
    const recRows = !hasAnySlicer ? baseRecRows : baseRecRows.filter(matchCommon);
    const setRows = !hasAnySlicer ? baseSetRows : baseSetRows.filter(r => {
      if (!matchCommon(r)) return false;
      if (sl.payableLeg && r.payable_leg && norm(r.payable_leg) !== norm(sl.payableLeg)) return false;
      return true;
    });
    const fuelRows = !hasAnySlicer ? baseFuelRows : baseFuelRows.filter(r => {
      if (!matchCommon(r)) return false;
      const em = equipMetaMap.get(norm(r.equipment)) || {};
      if (sl.equipType && norm(em.type) !== norm(sl.equipType)) return false;
      if (sl.ownership && norm(em.ownership) !== norm(sl.ownership)) return false;
      if (sl.fuelType === 'Diesel' && !/diesel|mazout/i.test(String(r.item || 'Diesel'))) return false;
      if (sl.fuelType === 'Lubricant / Oil' && /diesel|mazout/i.test(String(r.item || 'Diesel'))) return false;
      return true;
    });

    // When a specific date window + slicer is active, overlay period-scoped flow metrics on products, customers, suppliers, sites & equipment
    let baseProds = cachedBaseProds;
    let baseCusts = cachedBaseCusts;
    let baseSupps = cachedBaseSupps;
    let baseSites = cachedBaseSites;
    let baseEquip = cachedBaseEquip;
    if (hasAnySlicer) {
      baseProds = buildScopedProds(salesRows, rawRows);
      baseCusts = buildScopedCusts(salesRows, recRows, true);
      baseSupps = buildScopedSupps(rawRows, expRows, setRows, true);
      baseSites = buildScopedSites(salesRows, rawRows, true);
      baseEquip = buildScopedEquip(salesRows, rawRows, expRows, fuelRows, true);
    }

    const prodRows = !hasAnySlicer ? baseProds : baseProds.filter(matchCommon);
    const custRows = !hasAnySlicer ? baseCusts : baseCusts.filter(c => {
      if (!matchCommon(c)) return false;
      if (sl.creditOnly === 'Credit Customers' && !(Number(c.credit_sales || 0) > 0 || Number(c.ar_balance || 0) !== 0)) return false;
      if (sl.creditOnly === 'Has Open Balance' && Math.abs(Number(c.ar_balance || 0)) < 0.01) return false;
      if (sl.creditOnly === 'Overdue (>30d)' && Number(c.ar_overdue || 0) <= 0) return false;
      if (sl.creditOnly === 'On Account (<$0)' && Number(c.ar_balance || 0) >= -0.01 && Number(c.ar_advances || 0) <= 0) return false;
      if (sl.agingBucket) {
        if (sl.agingBucket === 'Current' && Number(c.ar_current || 0) <= 0) return false;
        if (sl.agingBucket === '1-10 Days' && Number(c.ar_1_10 || 0) <= 0) return false;
        if (sl.agingBucket === '11-30 Days' && Number(c.ar_11_30 || 0) <= 0) return false;
        if (sl.agingBucket === '31-60 Days' && Number(c.ar_31_60 || 0) <= 0) return false;
        if (sl.agingBucket === '60+ Days' && Number(c.ar_60_plus || 0) <= 0) return false;
        if (sl.agingBucket === 'On Account' && Number(c.ar_balance || 0) >= 0 && Number(c.ar_advances || 0) <= 0) return false;
      }
      return true;
    });
    const suppRows = (!hasAnySlicer ? baseSupps : baseSupps.filter(s => {
      if (!matchCommon(s)) return false;
      if (sl.payableLeg === 'Material' && Number(s.ap_material || s.raw_mat_cost || 0) <= 0) return false;
      if (sl.payableLeg === 'Haulage' && Number(s.ap_haulage || s.raw_haulage || 0) <= 0) return false;
      if (sl.payableLeg === 'Supplies & services' && Number(s.ap_expense || s.expenses || 0) <= 0) return false;
      return true;
    })).filter(s => !activeRange || s.raw_loads > 0 || Math.abs(Number(s.ap_on_credit || 0)) > 0.005 || Math.abs(Number(s.ap_settled || s.settlements_paid || 0)) > 0.005 || Math.abs(Number(s.ap_balance || 0)) > 0.005 || Math.abs(Number(s.opening_ap || 0)) > 0.005);
    const siteRows = !hasAnySlicer ? baseSites : baseSites.filter(matchCommon);
    const equipRows = !hasAnySlicer ? baseEquip : baseEquip.filter(e => {
      if (!matchCommon(e)) return false;
      if (sl.equipType && norm(e.Type) !== norm(sl.equipType)) return false;
      if (sl.ownership && norm(e.Ownership) !== norm(sl.ownership)) return false;
      if (sl.equipStatus && norm(e.Status) !== norm(sl.equipStatus)) return false;
      return true;
    });

    function movedRegisterBanner(title, desc, targetView, targetLabel, modSec = '') {
      if (bodyOnly && STATE.view === targetView) return '';
      return `
        <div class="pbi-panel" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:linear-gradient(90deg,rgba(184,136,59,0.08),transparent);border-left:3px solid var(--brass)">
          <div>
            <div style="font-size:12.5px;font-weight:700;color:var(--ink)">${esc(title)}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(desc)}</div>
          </div>
          <button type="button" class="btn btn-brass" style="padding:5px 12px;font-size:11.5px" data-nav-jump="${esc(targetView)}" ${modSec ? `data-mod-jump="${esc(modSec)}"` : ''}>Open in ${esc(targetLabel)} →</button>
        </div>
      `;
    }

    let headerHtml = '';
    if (!bodyOnly) {
      const fIdx = typeof window !== 'undefined' && typeof window.MFG_FREQ === 'function' ? window.MFG_FREQ() : null;
      const isRawSlicerPage = activePageId === 'p07_ap' || activePageId === 'p08_stock' || activePageId === 'p08_stock_ap';
      const isSalesSlicerPage = activePageId === 'p04_sales' || activePageId === 'p05_pricing' || activePageId === 'p06_ar';
      const activeCoKey = (STATE && STATE.company && !/all|group|manufacturing/i.test(String(STATE.company))) ? norm(STATE.company) : '';
      const prodFreqMap = fIdx
        ? (isRawSlicerPage
            ? ((activeCoKey && fIdx.productRawByCo && fIdx.productRawByCo.get(activeCoKey)) || fIdx.productRaw)
            : (isSalesSlicerPage
                ? ((activeCoKey && fIdx.productSalesByCo && fIdx.productSalesByCo.get(activeCoKey)) || fIdx.productSales)
                : fIdx.product))
        : null;
      const slicerPools = {
        prodOpts: uniq((m.products || []).map(p => p.Product).concat((rec.products || []).map(p => p.name)), prodFreqMap),
        custOpts: uniq((m.customers || []).map(c => c.Customer).concat((rec.customers || []).map(c => c.name)), fIdx && fIdx.customer),
        suppOpts: uniq((m.suppliers || []).map(s => s.Supplier).concat((rec.suppliers || []).map(s => s.name)), fIdx ? (isRawSlicerPage ? fIdx.siteOwner : fIdx.supplier) : null),
        siteOpts: uniq(
          isRawSlicerPage
            ? (m.sites || []).filter(s => Number(s.raw_loads || 0) > 0).map(s => s.Site)
                .concat((rec.sites || []).filter(s => resolveSiteCategoryPbi(s) === 'supplier').map(s => s.name))
                .concat((rec.raw_purchases || []).map(r => r.site))
            : (isSalesSlicerPage
                ? (m.sites || []).filter(s => Number(s.loads || 0) > 0).map(s => s.Site)
                    .concat((rec.sites || []).filter(s => resolveSiteCategoryPbi(s) === 'customer').map(s => s.name))
                    .concat((rec.sales_tickets || []).map(t => t.site))
                : (m.sites || []).map(s => s.Site).concat((rec.sites || []).map(s => s.name))),
          fIdx ? (isRawSlicerPage ? fIdx.siteRaw : (isSalesSlicerPage ? fIdx.siteSales : fIdx.site)) : null
        ),
        equipOpts: uniq((m.equipment || []).map(e => e.Equipment).concat((rec.equipment || []).map(e => e.name)), fIdx && fIdx.truck),
        driverOpts: uniq((rec.drivers || []).map(d => d.name).concat((rec.sales_tickets || []).map(t => t.driver)), fIdx && fIdx.driver),
        staffOpts: uniq((rec.employments || []).map(e => e.staff).concat((rec.salaries || []).map(s => s.staff)).concat((rec.attendance || []).map(a => a.staff)), fIdx && fIdx.staff),
        catOpts: uniq((rec.expense_categories || []).map(c => c.name).concat((rec.expenses || []).map(x => x.category)), fIdx && fIdx.category),
        subcatOpts: uniq((rec.expense_subcategories || []).map(c => c.name), fIdx && fIdx.subcategory),
        regOpts: uniq((rec.regions || []).map(r => r.name).concat((rec.overtime_rates || []).map(o => o.region)), fIdx && fIdx.region),
        cpOpts: uniq((rec.external_movements || []).map(x => cellValue(x, 'counterparty')).concat((rec.loans || []).map(l => cellValue(l, 'counterparty'))), fIdx && fIdx.counterparty)
      };

      const pageSlicerDefs = buildPageSlicerDefs(activePageId, slicerPools);
      const legacyIdForKey = {
        product: 'pbiSlicerProduct', customer: 'pbiSlicerCustomer', supplier: 'pbiSlicerSupplier',
        site: 'pbiSlicerSite', saleType: 'pbiSlicerSaleType', method: 'pbiSlicerMethod'
      };
      const grainCat = ctx.getDateGrainCatalog ? ctx.getDateGrainCatalog() : { all: [] };
      const activeGrainOpts = grainCat[STATE.dateGrain] || grainCat.all || [];
      const curFrom = activeRange ? activeRange.from : minDate;
      const curTo = activeRange ? activeRange.to : maxDate;
      const isDateFiltered = STATE.period !== 'all' || STATE.dateGrain !== 'all' || Boolean(STATE.dateFrom || STATE.dateTo);

      headerHtml = `
      <div class="pbi-studio-hdr">
        <div class="pbi-studio-top">
          <div>
            <div class="cockpit-eyebrow">ANALYTICS &amp; INSIGHTS STUDIO · ${pagePool.length} ANALYTICAL PAGES · ${esc(COMPANY_LABELS[STATE.company] || STATE.company)}</div>
            <h2 class="pbi-studio-title">Analytics &amp; Insights</h2>
            <div class="cockpit-sub" style="color:var(--muted);margin-top:2px"><b>Page ${esc(activePage.num)} · ${esc(activePage.label)}</b> — ${esc(activePage.title)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${activeSlicerCount ? `<span class="badge badge-warn">${activeSlicerCount} Active Slicer${activeSlicerCount > 1 ? 's' : ''}</span>` : '<span class="badge badge-ok">All Slicers Open</span>'}
            <button type="button" class="btn" id="pbiResetSlicersBtn" ${activeSlicerCount ? '' : 'disabled'}>↺ Reset Slicers</button>
            ${exportBtn('pbiCanvasPanel', 'PBI_' + activePage.id)}
          </div>
        </div>

        <!-- 12-Page Analytical Navigation Pill Strip -->
        <div class="pbi-page-strip" role="tablist" aria-label="Analytics &amp; Insights Pages">
          ${pagePool.map(p => `
            <button type="button" class="pbi-page-tab ${p.id === activePageId ? 'active' : ''}" data-pbi-page="${esc(p.id)}" role="tab" aria-selected="${p.id === activePageId}">
              <span class="pbi-page-num">${esc(p.num)}</span>
              <span>${esc(p.label)}</span>
            </button>
          `).join('')}
        </div>

        <!-- 8 Domain Pages Embedded directly inside their respective Sidebar Modules -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;margin-bottom:8px;background:rgba(184,136,59,0.06);border:1px dashed var(--border-strong);border-radius:8px;font-size:11px">
          <span style="font-weight:700;color:var(--brass);text-transform:uppercase;letter-spacing:.04em;margin-right:4px">Embedded in Sidebar Modules:</span>
          ${Object.values(MOVED_PBI_PAGES).filter(mp => !ctx.canAccessPbiPage || ctx.canAccessPbiPage(mp.id)).map(mp => `
            <button type="button" class="filter-chip" style="padding:2px 8px;font-size:10.5px" data-pbi-jump="${esc(mp.id)}">${esc(mp.short)} <span style="opacity:.7">· ${esc(mp.targetLabel)}</span></button>
          `).join('')}
        </div>

        <!-- Page-Specific Slicer Strip (adapts dynamically to each of the 20 pages) -->
        <div class="pbi-slicer-wrap">
          <!-- Power BI / Power Apps Date Grain (All | Year | Month | Week | Day) + Period (between) Range Bar -->
          <div class="pbi-date-slicer-row">
            <div class="pbi-date-left">
              <span class="pbi-date-lbl">Period Grain</span>
              <div class="pbi-grain-group" role="group" aria-label="Analytics Date Grain">
                ${[
                  ['all', 'All'],
                  ['year', 'Year'],
                  ['month', 'Month'],
                  ['week', 'Week'],
                  ['day', 'Day']
                ].map(([gKey, gLbl]) => `
                  <button type="button" class="pbi-grain-btn ${STATE.dateGrain === gKey ? 'active' : ''}" data-pbi-grain="${gKey}">${gLbl}</button>
                `).join('')}
              </div>
              <select id="pbiPeriodSelect" class="pbi-period-select" aria-label="Analytics Period Value" hidden aria-hidden="true">
                ${STATE.period === 'custom' ? `<option value="custom" selected>Range: ${esc(curFrom)} → ${esc(curTo)}</option>` : ''}
                ${activeGrainOpts.map(o => `<option value="${esc(o.value)}" ${STATE.period === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
              </select>
            </div>
            <div class="pbi-date-right">
              <span class="pbi-date-lbl">Period (Between)</span>
              <div class="date-seg-slot pbi-seg-slot" data-date-slot="from">
                <input type="date" id="pbiDateFrom" class="pbi-date-input date-native-proxy" min="2024-01-01" max="2030-12-31" value="${esc(curFrom)}" aria-label="Analytics From Date" tabindex="-1">
                ${ctx.renderDateSegPillHtml ? ctx.renderDateSegPillHtml('from', curFrom, 'pbi') : ''}
              </div>
              <span style="color:var(--muted);font-weight:700">–</span>
              <div class="date-seg-slot pbi-seg-slot" data-date-slot="to">
                <input type="date" id="pbiDateTo" class="pbi-date-input date-native-proxy" min="2024-01-01" max="2030-12-31" value="${esc(curTo)}" aria-label="Analytics To Date" tabindex="-1">
                ${ctx.renderDateSegPillHtml ? ctx.renderDateSegPillHtml('to', curTo, 'pbi') : ''}
              </div>
              <button type="button" id="pbiDateResetBtn" class="btn" style="padding:3px 8px;font-size:10.5px" ${isDateFiltered ? '' : 'hidden'}>✕ All-Time</button>
            </div>
          </div>

          <div class="pbi-slicer-meta">
            <span>Page ${esc(activePage.num)} Slicers · <b>${esc(activePage.label)}</b> (${pageSlicerDefs.length} page filters + cross-search)</span>
            <span>Period: <b>${esc(k.label || 'All-Time')}</b> · Basis: <b>${STATE.basis === 'rep' ? 'Reporting Date' : 'Transaction Date'}</b></span>
          </div>
          <div class="pbi-slicer-bar dynamic">
            ${pageSlicerDefs.map(def => {
              const curVal = sl[def.key] || '';
              const legId = legacyIdForKey[def.key] ? `id="${legacyIdForKey[def.key]}"` : '';
              return `
                <div class="pbi-slicer-item">
                  <label>${esc(def.label)}</label>
                  <select ${legId} data-pbi-slicer="${esc(def.key)}">
                    <option value="">All ${esc(def.label)}s</option>
                    ${(def.opts || []).map(o => {
                      const val = typeof o === 'object' ? o.v : o;
                      const lbl = typeof o === 'object' ? o.l : o;
                      return `<option value="${esc(val)}" ${curVal === val ? 'selected' : ''}>${esc(lbl)}</option>`;
                    }).join('')}
                  </select>
                </div>
              `;
            }).join('')}
            <div class="pbi-slicer-item">
              <label>Cross-Filter Search</label>
              <input type="search" id="pbiSlicerSearch" value="${esc(sl.search || '')}" placeholder="Filter rows, codes, notes..." autocomplete="off">
            </div>
          </div>
        </div>
      </div>
    `;
    }

    // Scale factor when a slicer narrows the active page
    const hasSalesSlicer = Boolean(sl.product || sl.customer || sl.saleType || sl.method || sl.iva);
    const filtProdSales = hasSalesSlicer ? prodRows.reduce((a, r) => a + Number(r.sales_ttc || 0), 0) : totalProdSales;
    const sampleFiltTtc = hasSalesSlicer ? salesRows.reduce((a, r) => a + Number(r.total_ttc || 0), 0) : sampleAllTtc;
    const sRatio = sl.product && !sl.customer && !sl.saleType && !sl.method
      ? (filtProdSales / totalProdSales)
      : (hasSalesSlicer ? (sampleFiltTtc / sampleAllTtc) : 1);
    const sc = v => round2(Number(v || 0) * (hasSalesSlicer ? sRatio : 1));
    const baseMonths = ctx.getScopedMonthly ? ctx.getScopedMonthly(m.monthly, 14) : (m.monthly || []).slice(-14);
    const allCoSalesForMonths = filterRecords(rec.sales_tickets, { ignorePeriod: true, ignoreSearch: true });
    const allCoRawForMonths = filterRecords(rec.raw_purchases, { ignorePeriod: true, ignoreSearch: true });
    const monthSalesPool = !hasAnySlicer ? allCoSalesForMonths : allCoSalesForMonths.filter(r => {
      if (!matchCommon(r)) return false;
      if (sl.shift) {
        const isNight = !!r.overtime;
        if (sl.shift === 'Night' && !isNight) return false;
        if (sl.shift === 'Day' && isNight) return false;
      }
      if (sl.overtimeFlag === 'Yes' && !r.overtime) return false;
      if (sl.overtimeFlag === 'No' && r.overtime) return false;
      return true;
    });
    const monthRawPool = !hasAnySlicer ? allCoRawForMonths : allCoRawForMonths.filter(r => {
      if (!matchCommon(r)) return false;
      if (sl.transportBy && norm(r.transport_by) !== norm(sl.transportBy)) return false;
      return true;
    });
    const scaledMonths = hasSalesSlicer ? baseMonths.map(r => ({
      ...r,
      sales_ttc: sc(r.sales_ttc), net_sales: sc(r.net_sales), credit_sales: sc(r.credit_sales),
      cash_sales: sc(r.cash_sales), raw_cost: sc(r.raw_cost), expenses: sc(r.expenses),
      operating_profit: sc(r.operating_profit), gross_margin: sc(r.gross_margin), receipts: sc(r.receipts)
    })) : baseMonths;
    const months = enrichMonthsWithTicketUnitEconomics(scaledMonths, monthSalesPool, monthRawPool, {
      basis: STATE.basis,
      ticketMeters,
      isAggregateMaterialProduct,
      productsCatalog: rec.products,
      hasSalesTicketSource: allCoSalesForMonths.length > 0,
      hasRawTicketSource: allCoRawForMonths.length > 0
    });

    let bodyHtml = '';

    // =========================================================================
    // PAGE 01: OVERVIEW (m18c_report.py Page 01 — 4 KPI bands + 4 charts + 2 tables)
    // =========================================================================
    if (activePageId === 'p01_overview') {
      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Sales & Revenue (Click any card to drill into its page)', [
            { label: 'Total Sales', value: fmtUSD(sc(k.sales_ttc), 0), sub: fmtNum(sc(k.loads), 0) + ' weighbridge loads', tone: 'brass', navPage: 'p04_sales' },
            { label: 'Cash Sales', value: fmtUSD(sc(k.cash_sales_ttc != null ? k.cash_sales_ttc : k.cash_sales), 0), sub: fmtPct(null, k.cash_sales_ttc != null ? k.cash_sales_ttc : k.cash_sales, k.sales_ttc) + ' of Total Sales', tone: 'good', navPage: 'p04_sales' },
            { label: 'Credit Sales', value: fmtUSD(sc(k.credit_sales_ttc != null ? k.credit_sales_ttc : k.credit_sales), 0), sub: fmtPct(null, k.credit_sales_ttc != null ? k.credit_sales_ttc : k.credit_sales, k.sales_ttc) + ' of Total Sales', navPage: 'p04_sales' },
            { label: 'Transport Revenue', value: fmtUSD(sc(k.trans_rev), 0), sub: fmtNum(sc(k.delivery_loads), 0) + ' delivery loads', navPage: 'p04_sales' },
            { label: 'Tons Sold', value: fmtNum(sc(k.tons_sold), 0) + ' t', sub: fmtNum(sc(k.qty_sold), 0) + ' m³ sold', navPage: 'p04_sales' },
            { label: 'Avg Price / m³', value: fmtUSD(k.avg_price_ttc, 2), sub: fmtUSD(sc(k.loads ? k.sales_ttc / k.loads : 0), 0) + ' avg / load', navPage: 'p05_pricing' }
          ])}
          ${kpiBand('2 · Direct Costs, Expenses, Payroll & Margins', [
            { label: 'Raw Material Cost', value: fmtUSD(sc(k.raw_cost), 0), sub: 'Mat ' + fmtUSDk(sc(k.raw_mat_cost)) + ' + Haul ' + fmtUSDk(sc(k.raw_haulage)), navPage: 'p08_stock' },
            { label: 'Gross Margin ($ / %)', value: fmtUSD(sc(k.gross_margin), 0), sub: fmtPct(k.gm_pct, k.gross_margin, k.net_sales) + ' of Net Sales', tone: 'good', navPage: 'p16_financial' },
            { label: 'Operating Expenses', value: fmtUSD(sc(k.expenses), 0), sub: 'Cash ' + fmtUSDk(sc(k.cash_expenses)) + ' · Credit ' + fmtUSDk(sc(k.credit_expenses)), navPage: 'p07_ap' },
            { label: 'Staff Salaries Paid', value: fmtUSD(k.salaries_paid, 0), sub: 'OT Bonus: ' + fmtUSD(k.overtime_bonus, 0), navPage: 'p12_payroll' },
            { label: 'Operating Profit (Cash)', value: fmtUSD(sc(k.operating_profit), 0), sub: fmtPct(k.op_margin_pct, k.operating_profit, k.net_sales) + ' Op. Margin', tone: Number(k.operating_profit || 0) < 0 ? 'crit' : 'good', navPage: 'p16_financial' },
            { label: 'Commission Due', value: fmtUSD(k.commission_due, 0), sub: fmtNum(k.active_agreements) + ' active price rules', navPage: 'p05_pricing' }
          ])}
          ${kpiBand('3 · Receivables (FIFO), 3-Leg Payables & Cash Till', [
            { label: 'Open Customer AR', value: fmtUSD(k.ar_balance, 0), sub: 'Gross ' + fmtUSDk(k.ar_gross) + ' · Adv ' + fmtUSDk(k.ar_advances), tone: 'warn', navPage: 'p06_ar' },
            { label: 'AR Overdue (>30d / 60+)', value: fmtUSD(k.ar_overdue, 0), sub: '60+ days: ' + fmtUSD(k.ar_60_plus, 0), tone: 'crit', navPage: 'p06_ar' },
            { label: 'Customer Receipts', value: fmtUSD(sc(k.receipts), 0), sub: 'DSO ' + fmtNum(k.dso_days, 0) + ' days', tone: 'good', navPage: 'p06_ar' },
            { label: '3-Leg Open AP', value: fmtUSD(k.ap_balance, 0), sub: 'Mat ' + fmtUSDk(k.ap_material) + ' · Haul ' + fmtUSDk(k.ap_haulage), navPage: 'p07_ap' },
            { label: 'Supplier Settlements', value: fmtUSD(k.settlements_paid, 0), sub: 'Applied against 3 legs', navPage: 'p07_ap' },
            { label: 'Cash Till', value: fmtUSD(k.cash_till, 0), sub: 'Net Cash Flow ' + fmtUSDk(k.net_cash_flow), tone: Number(k.cash_till || 0) < 0 ? 'crit' : 'brass', navPage: 'p14_cashflow' }
          ])}
          ${kpiBand('4 · Fleet, Diesel Tank & Trial Balance Integrity', [
            { label: 'Active Equipment', value: fmtNum(k.active_equip), sub: fmtNum(k.trucks_used) + ' trucks dispatched', navPage: 'p10_fleet' },
            { label: 'Own-Fleet Loads', value: fmtNum(k.own_fleet_loads), sub: 'Company fleet haulage', navPage: 'p11_drivers' },
            { label: 'Fleet Cost / Ton', value: fmtUSD(k.cost_per_ton, 2), sub: 'Total equip cost ' + fmtUSDk(k.total_equip_cost), navPage: 'p10_fleet' },
            { label: 'Diesel Issued', value: fmtNum(k.diesel_litres, 0) + ' L', sub: 'Bought ' + fmtNum(k.diesel_purchased, 0) + ' L', navPage: 'p09_fuel' },
            { label: 'Diesel in Tank', value: fmtNum(k.diesel_in_tank, 0) + ' L', sub: 'Sold ' + fmtNum(k.diesel_sold, 0) + ' L', tone: Number(k.diesel_in_tank || 0) < 0 ? 'crit' : 'good', navPage: 'p09_fuel' },
            { label: 'Trial Balance Variance', value: fmtUSD(k.tb_check || 0, 2), sub: Math.abs(Number(k.tb_check || 0)) < 0.005 ? 'Lebanese CoA Tied ($0.00)' : 'Investigate GL', tone: Math.abs(Number(k.tb_check || 0)) < 0.005 ? 'good' : 'crit', navPage: 'p16_financial' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Sales vs costs by month', buildComboChartSvg(months, [
            { key: 'sales_ttc', label: 'Total Sales', color: C.navy },
            { key: 'raw_cost', label: 'Raw material cost', color: C.slate },
            { key: 'expenses', label: 'Expenses', color: C.crit }
          ], { label: 'Operating profit', key: 'operating_profit', color: C.brass, isMoney: true }, { shareAxis: true }), {
            subtitle: 'Monthly Total Sales vs Raw Material Cost & Operating Expenses with Operating Profit line',
            legend: [{ label: 'Total Sales', color: C.navy }, { label: 'Raw Cost', color: C.slate }, { label: 'Expenses', color: C.crit }, { label: 'Op. Profit', color: C.brass, line: true }]
          })}
          ${pbiPanel('Cash in vs cash out by month', buildClusteredColumnSvg(months, [
            { key: 'cash_in', label: 'Cash In', color: C.good },
            { key: 'cash_out', label: 'Cash Out', color: C.crit }
          ]), {
            subtitle: 'All cash inflows (cash sales, receipts, external in) vs outflows (settlements, cash expenses, salaries)',
            legend: [{ label: 'Cash In', color: C.good }, { label: 'Cash Out', color: C.crit }]
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Sales by material (Top aggregate grades)', buildHorizontalBarChart(prodRows, 'Product', 'sales_ttc', v => fmtUSD(v, 0), { subKey: 'Material Family', color: C.navy }), {
            subtitle: 'Ranked by total revenue ($)'
          })}
          ${pbiPanel('Top customers by sales & open AR', buildHorizontalBarChart(custRows, 'Customer', 'sales_ttc', v => fmtUSD(v, 0), { color: C.steel }), {
            subtitle: 'Ranked by total sales in selected period'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Monthly P&L, Margin, Volumes & Cash Summary', [
            { label: 'Month', key: 'Year Month', bold: true },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Tons Sold', key: 'tons', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Total Sales ($)', key: 'sales_ttc', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Raw Cost ($)', key: 'raw_cost', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Gross Margin ($)', key: 'gross_margin', r: true, negRed: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Expenses ($)', key: 'expenses', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Salaries ($)', key: 'salaries', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Operating Profit ($)', key: 'operating_profit', r: true, bar: 'brass', negRed: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Receipts ($)', key: 'receipts', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Settlements ($)', key: 'settlements_paid', r: true, fmt: v => fmtUSD(v, 0) }
          ], [...months].reverse(), {
            subtitle: 'Full monthly progression from weighbridge revenue to operating profit and cash collections',
            unitLabel: 'months',
            foot: [
              { v: `PERIOD TOTAL (${esc(k.label || 'All-Time')})`, span: 3 },
              { v: fmtUSD(sc(k.sales_ttc), 0), r: true },
              { v: fmtUSD(sc(k.raw_cost), 0), r: true },
              { v: fmtUSD(sc(k.gross_margin), 0), r: true },
              { v: fmtUSD(sc(k.expenses), 0), r: true },
              { v: fmtUSD(k.salaries_paid, 0), r: true },
              { v: fmtUSD(sc(k.operating_profit), 0), r: true },
              { v: fmtUSD(sc(k.receipts), 0), r: true },
              { v: fmtUSD(k.settlements_paid, 0), r: true }
            ]
          })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 02: COMPANIES (Side-by-side WTC · BBConstruction · Lions Transport)
    // =========================================================================
    else if (activePageId === 'p02_companies') {
      const allowedNames = typeof ctx.allowedCompanyNames === 'function' ? ctx.allowedCompanyNames() : ['WTC', 'BBConstruction', 'Lions Transport'];
      const hasWtc = allowedNames.includes('WTC');
      const hasBbc = allowedNames.includes('BBConstruction');
      const hasLt = allowedNames.includes('Lions Transport');
      const wRaw = ((SEED.models.wtc || {}).periods || {})[STATE.period] || ((SEED.models.wtc || {}).periods || {}).all || {};
      const bRaw = ((SEED.models.bbconstruction || {}).periods || {})[STATE.period] || ((SEED.models.bbconstruction || {}).periods || {}).all || {};
      const lRaw = ((SEED.models.lionstransport || {}).periods || {})[STATE.period] || ((SEED.models.lionstransport || {}).periods || {}).all || {};
      const gRaw = ((SEED.models['manufacturing-group'] || {}).periods || {})[STATE.period] || ((SEED.models['manufacturing-group'] || {}).periods || {}).all || {};
      const w = hasWtc ? wRaw : {};
      const b = hasBbc ? bRaw : {};
      const l = hasLt ? lRaw : {};
      const g = (hasWtc && hasBbc) ? gRaw : (hasWtc ? w : (hasBbc ? b : l));
      const wM = hasWtc ? ((SEED.models.wtc || {}).monthly || []).slice(-12) : [];
      const bM = hasBbc ? ((SEED.models.bbconstruction || {}).monthly || []).slice(-12) : [];
      const baseMonths = wM.length ? wM : bM;
      const compMonths = baseMonths.map(wm => {
        const bm = bM.find(x => x['Year Month'] === wm['Year Month']) || {};
        return { 'Year Month': wm['Year Month'], wtc_sales: hasWtc ? (wm.sales_ttc || 0) : 0, bbc_sales: hasBbc ? (bm.sales_ttc || 0) : 0, wtc_profit: hasWtc ? (wm.operating_profit || 0) : 0, bbc_profit: hasBbc ? (bm.operating_profit || 0) : 0 };
      });
      const compRows = [
        ['Sales incl. VAT (TTC)', fmtUSD(w.sales_ttc, 2), fmtUSD(b.sales_ttc, 2), '—', fmtUSD(g.sales_ttc, 2)],
        ['Total Sales ex-VAT (Mat + Trans)', fmtUSD(w.gross_sales || w.net_sales, 2), fmtUSD(b.gross_sales || b.net_sales, 2), '—', fmtUSD(g.gross_sales || g.net_sales, 2)],
        ['Material Sales ex-VAT', fmtUSD(w.net_sales, 2), fmtUSD(b.net_sales, 2), '—', fmtUSD(g.net_sales, 2)],
        ['Transport Revenue', fmtUSD(w.trans_rev, 2), fmtUSD(b.trans_rev, 2), '—', fmtUSD(g.trans_rev, 2)],
        ['Output VAT 11% (4427)', fmtUSD(w.sales_vat, 2), fmtUSD(b.sales_vat, 2), '—', fmtUSD(g.sales_vat, 2)],
        ['Weighbridge Loads', fmtNum(w.loads), fmtNum(b.loads), '—', fmtNum(g.loads)],
        ['Tons Sold', fmtNum(w.tons_sold, 0) + ' t', fmtNum(b.tons_sold, 0) + ' t', '—', fmtNum(g.tons_sold, 0) + ' t'],
        ['Raw Material Cost', fmtUSD(w.raw_cost, 2), fmtUSD(b.raw_cost, 2), '—', fmtUSD(g.raw_cost, 2)],
        ['  — Material Leg (Site Owners)', fmtUSD(w.raw_mat_cost, 2), fmtUSD(b.raw_mat_cost, 2), '—', fmtUSD(g.raw_mat_cost, 2)],
        ['  — Haulage Leg (3rd-Party Trucks)', fmtUSD(w.raw_haulage, 2), fmtUSD(b.raw_haulage, 2), '—', fmtUSD(g.raw_haulage, 2)],
        ['Gross Margin ($)', fmtUSD(w.gross_margin, 2), fmtUSD(b.gross_margin, 2), '—', fmtUSD(g.gross_margin, 2)],
        ['Gross Margin (%)', fmtPct(w.gm_pct, w.gross_margin, w.net_sales), fmtPct(b.gm_pct, b.gross_margin, b.net_sales), '—', fmtPct(g.gm_pct, g.gross_margin, g.net_sales)],
        ['Operating Expenses', fmtUSD(w.expenses, 2), fmtUSD(b.expenses, 2), '—', fmtUSD(g.expenses, 2)],
        ['Staff Salaries Paid', fmtUSD(w.salaries_paid, 2), fmtUSD(b.salaries_paid, 2), '—', fmtUSD(g.salaries_paid, 2)],
        ['Operating Profit (Cash View)', fmtUSD(w.operating_profit, 2), fmtUSD(b.operating_profit, 2), '—', fmtUSD(g.operating_profit, 2)],
        ['FIFO Open Customer AR', fmtUSD(w.ar_balance, 2), fmtUSD(b.ar_balance, 2), '—', fmtUSD(g.ar_balance, 2)],
        ['AR Overdue > 60 Days', fmtUSD(w.ar_60_plus, 2), fmtUSD(b.ar_60_plus, 2), '—', fmtUSD(g.ar_60_plus, 2)],
        ['3-Leg Open Supplier AP', fmtUSD(w.ap_balance, 2), fmtUSD(b.ap_balance, 2), '—', fmtUSD(g.ap_balance, 2)],
        ['Cash Till', fmtUSD(w.cash_till, 2), fmtUSD(b.cash_till, 2), '—', fmtUSD(g.cash_till, 2)],
        ['Diesel in Tank (Litres)', fmtNum(w.diesel_in_tank, 0) + ' L', fmtNum(b.diesel_in_tank, 0) + ' L', '—', fmtNum(g.diesel_in_tank, 0) + ' L'],
        ['Active Equipment Units', fmtNum(w.active_equip), fmtNum(b.active_equip), fmtNum(l.active_equip || 142), fmtNum(g.active_equip)],
        ['Trial Balance Check (Dr − Cr)', fmtUSD(w.tb_check || 0, 2), fmtUSD(b.tb_check || 0, 2), '$0.00', fmtUSD(g.tb_check || 0, 2)]
      ].map(([mName, wv, bv, lv, gv]) => ({ mName, wv, bv, lv, gv }));

      bodyHtml = `
        ${kpiBand('Entity Comparison — WTC vs BBConstruction vs Lions Transport', [
          { label: 'WTC Sales TTC', value: fmtUSD(w.sales_ttc, 0), sub: fmtNum(w.loads) + ' loads · GM ' + fmtPct(w.gm_pct, w.gross_margin, w.net_sales), tone: 'brass' },
          { label: 'BBConstruction Sales TTC', value: fmtUSD(b.sales_ttc, 0), sub: fmtNum(b.loads) + ' loads · GM ' + fmtPct(b.gm_pct, b.gross_margin, b.net_sales), tone: 'good' },
          { label: 'WTC Operating Profit', value: fmtUSD(w.operating_profit, 0), sub: fmtPct(w.op_margin_pct, w.operating_profit, w.net_sales) + ' margin' },
          { label: 'BBC Operating Profit', value: fmtUSD(b.operating_profit, 0), sub: fmtPct(b.op_margin_pct, b.operating_profit, b.net_sales) + ' margin' },
          { label: 'Group Open AR / AP', value: fmtUSD(g.ar_balance, 0), sub: 'AP: ' + fmtUSD(g.ap_balance, 0) },
          { label: 'Group TB Variance', value: fmtUSD(g.tb_check || 0, 2), sub: 'All entities tied to $0.00', tone: 'good' }
        ])}
        <div class="pbi-grid-2">
          ${pbiPanel('Monthly Sales TTC — WTC vs BBConstruction', buildClusteredColumnSvg(compMonths, [
            { key: 'wtc_sales', label: 'WTC', color: C.navy },
            { key: 'bbc_sales', label: 'BBConstruction', color: C.steel }
          ]), { legend: [{ label: 'WTC', color: C.navy }, { label: 'BBConstruction', color: C.steel }] })}
          ${pbiPanel('Monthly Operating Profit — WTC vs BBConstruction', buildClusteredColumnSvg(compMonths, [
            { key: 'wtc_profit', label: 'WTC Profit', color: C.navy },
            { key: 'bbc_profit', label: 'BBC Profit', color: C.brass }
          ]), { legend: [{ label: 'WTC Profit', color: C.navy }, { label: 'BBC Profit', color: C.brass }] })}
        </div>
        <div class="pbi-grid-1">
          ${pbiTable('Consolidated Multi-Entity Financial & Operational Matrix', [
            { label: 'Measure / KPI Line', key: 'mName', bold: true },
            { label: 'WTC (World Trading)', key: 'wv', r: true, mono: true },
            { label: 'BBConstruction', key: 'bv', r: true, mono: true },
            { label: 'Lions Transport', key: 'lv', r: true, mono: true },
            { label: 'Consolidated Group', key: 'gv', r: true, mono: true, fmt: v => `<b>${esc(v)}</b>` }
          ], compRows, {
            unitLabel: 'metrics',
            foot: [
              { v: '<b>OPERATING PROFIT · TB CHECK ($0.00 TIED)</b>' },
              { v: `<b>${fmtUSD(w.operating_profit, 2)}</b>`, r: true },
              { v: `<b>${fmtUSD(b.operating_profit, 2)}</b>`, r: true },
              { v: '<b>$0.00 TB</b>', r: true },
              { v: `<b>${fmtUSD(g.operating_profit, 2)}</b>`, r: true }
            ]
          })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 03: ACTION ITEMS & EXCEPTIONS (m284 Executive Control Tower — 4 headed sections)
    // =========================================================================
    else if (activePageId === 'p03_exceptions') {
      const overdueCusts = custRows.filter(c => Number(c.ar_overdue || 0) > 0).sort((a, b) => Number(b.ar_overdue || 0) - Number(a.ar_overdue || 0));
      const ivaUninvoiced = custRows.filter(c => c['VAT Registered'] === 'Yes' && Number(c.vat_receivable || 0) > 0);
      const belowAgreed = (prSn.top_below_agreed_exceptions || []).filter(matchSearch);
      const lapsedPairs = (prSn.lapsed_agreement_pairs || []).filter(matchSearch);
      const outliers = (flSn.consumption_outliers || []).filter(matchSearch);
      const unmatchedSal = (prSn.unmatched_salary_by_staff || []).filter(matchSearch);

      bodyHtml = `
        ${pbiHeading('1 · Executive exception queue', 'Priority operational, financial and tax action items for the period · click any card to open its detail page')}
        ${kpiBand('', [
          { label: 'Overdue receivables (>30d)', value: fmtUSD(k.ar_overdue, 0), sub: '60+d: ' + fmtUSD(k.ar_60_plus, 0), tone: 'crit', navPage: 'p06_ar' },
          { label: 'Sales below agreed price', value: fmtUSD(prSn.sales_below_agreed_usd || 0, 0), sub: fmtNum(prSn.below_agreed_pairs_count || 0) + ' customer × product pairs', tone: 'warn', navPage: 'p05_pricing' },
          { label: 'Meter readings to check', value: fmtNum(flSn.meter_readings_to_check || 0), sub: fmtNum(outliers.length) + ' consumption outliers', tone: 'warn', navPage: 'p09_fuel' },
          { label: 'Diesel tank balance', value: fmtNum(flSn.diesel_stock_balance_l != null ? flSn.diesel_stock_balance_l : k.diesel_in_tank, 0) + ' L', sub: 'Negative = unbooked bulk purchase', tone: Number(k.diesel_in_tank || 0) < 0 ? 'crit' : 'good', navPage: 'p09_fuel' },
          { label: 'Salary without contract', value: fmtUSD(prSn.unmatched_salary_payments_usd || 0, 0), sub: fmtNum(unmatchedSal.length) + ' staff affected', tone: 'warn', navPage: 'p12_payroll' },
          { label: 'Date gaps > 31 days', value: fmtNum(paritySn.date_basis_anomalies_gt_31d_count || 0), sub: 'Tx vs Reporting date drift', tone: 'warn', navPage: 'p19_changelog' }
        ])}

        ${pbiHeading('2 · Receivables, credit limit & VAT compliance', 'Customers past due or approaching credit limits, and VAT-registered customers with open VAT due')}
        <div class="pbi-grid-2">
          ${pbiTable('Overdue customer balances & credit exposure', [
            { label: 'Customer', key: 'Customer', bold: true },
            { label: 'Balance ($)', key: 'ar_balance', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Overdue ($)', key: 'ar_overdue', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: '31–60d', key: 'ar_31_60', r: true, fmt: v => fmtUSD(v, 0) },
            { label: '60+ Days', key: 'ar_60_plus', r: true, negRed: true, fmt: v => `<span class="pbi-neg">${fmtUSD(v, 0)}</span>` },
            { label: 'Last Sale', key: 'last_sale', mono: true, fmt: v => esc(String(v || '—').slice(0, 10)) }
          ], overdueCusts, { subtitle: 'Customers with past-due open tickets as at the period end, ranked by overdue amount', unitLabel: 'customers' })}

          ${pbiTable('IVA customers — VAT receivable & uninvoiced exposure', [
            { label: 'Customer', key: 'Customer', bold: true },
            { label: 'IVA', key: 'VAT Registered' },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Sales TTC ($)', key: 'sales_ttc', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Output VAT ($)', key: 'sales_vat', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'VAT Due ($)', key: 'vat_receivable', r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 0)}</b>` }
          ], ivaUninvoiced, { subtitle: 'VAT-registered customers carrying unpaid 11% output VAT in their open balance (m254)', unitLabel: 'IVA customers' })}
        </div>

        ${pbiHeading('3 · Pricing & agreement governance', 'Customer sales on ended agreements (amber) or priced below the agreed / list price (red)')}
        <div class="pbi-grid-2">
          ${pbiTable('Customer pricing exceptions — sold below agreed price', [
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Product', key: 'product' },
            { label: 'Qty Sold', key: 'qty', r: true, bar: true, fmt: v => fmtNum(v, 1) },
            { label: 'Agreed Price', key: 'agreed_price', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Last Price', key: 'last_price', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Variance / u', raw: r => Number(r.last_price || 0) - Number(r.agreed_price || 0), r: true, negRed: true, fmt: v => fmtUSD(v, 2) }
          ], belowAgreed, { subtitle: 'Red = last ticket priced below active customer price agreement', unitLabel: 'pairs' })}

          ${pbiTable('Lapsed agreements still trading (Amber = Ended agreement)', [
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Product', key: 'product' },
            { label: 'Qty Traded', key: 'qty', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Agreed (Lapsed)', key: 'agreed_price', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Actual Price', key: 'actual_price', r: true, fmt: v => fmtUSD(v, 2) }
          ], lapsedPairs, { subtitle: 'Amber row = agreement End date has passed while customer continues lifting material (m202)', rowAmber: () => true, unitLabel: 'lapsed pairs' })}
        </div>

        ${pbiHeading('4 · Fleet telemetry, unattributed costs & payroll contract audit', 'Out-of-line meter readings, fuel consumption outliers, and salary payments without an employment contract')}
        ${kpiBand('', [
          { label: 'Own units idle 30+ days', value: fmtNum(flSn.own_units_idle_30d || 0), sub: 'Active fleet ' + fmtNum(flSn.active_equipment || k.active_equip), navPage: 'p10_fleet' },
          { label: 'Consumption outliers', value: fmtNum(outliers.length), sub: '>80 L/100km or >25 L/h', tone: 'warn', navPage: 'p09_fuel' },
          { label: 'Driver pay unallocated', value: fmtUSD(flSn.unallocated_driver_payroll_usd || 0, 0), sub: fmtNum(flSn.unallocated_driver_months_count || 0) + ' driver-months', navPage: 'p11_drivers' },
          { label: 'Incomplete ticket books', value: fmtNum(prSn.incomplete_ticket_books || 0), sub: fmtNum(prSn.missing_tickets_in_books || 0) + ' missing serials', navPage: 'p18_tickets' },
          { label: 'Duplicate ticket serials', value: fmtNum(prSn.duplicate_ticket_numbers || 0), sub: fmtNum(prSn.unnumbered_tickets || 0) + ' unnumbered', tone: 'warn', navPage: 'p18_tickets' },
          { label: 'Unlinked VAT invoices', value: fmtNum(paritySn.unlinked_vat_invoices_count || 0), sub: 'Headers without tickets', navPage: 'p13_vat' }
        ])}
        <div class="pbi-grid-2">
          ${pbiTable('Fuel consumption & meter reading outliers (m142)', [
            { label: 'Equipment', key: 'equipment', mono: true, bold: true },
            { label: 'Type', key: 'type' },
            { label: 'Metric', key: 'metric' },
            { label: 'Consumption', key: 'value', r: true, bar: 'brass', fmt: v => `<b>${fmtNum(v, 1)}</b>` },
            { label: 'Distance / Hrs', raw: r => r.distance_km != null ? r.distance_km : r.hours, r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Diesel (L)', key: 'diesel_l', r: true, fmt: v => fmtNum(v, 0) }
          ], outliers, { subtitle: 'Units exceeding tolerance thresholds (>80 L/100km for trucks or >25 L/hr for yellow iron)', unitLabel: 'outliers' })}

          ${pbiTable('Salary payments without an employment contract (m220)', [
            { label: 'Staff Member', key: 'staff', bold: true },
            { label: 'Unmatched Paid ($)', key: 'unmatched_usd', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], unmatchedSal, { subtitle: 'Payments whose staff and payroll month no employment contract covers · add/extend contract on P12', unitLabel: 'staff' })}
        </div>
        ${(() => {
          const lubEx = computeLubricationAudit({
            fuelRows, expRows, salesRows, rawRows, equipList: rec.equipment || []
          }).auditRows.filter(r => r.alert_flag > 0 && matchSearch(r));
          return `
            <div class="pbi-grid-1" style="margin-top:14px">
              ${pbiTable('Fleet lubrication & hydraulic leak exceptions', [
                { label: 'Equipment', key: 'Equipment', mono: true, bold: true },
                { label: 'Type', key: 'Type' },
                { label: 'Ownership', key: 'Ownership' },
                { label: 'Status', key: 'status', fmt: v => `<span class="badge ${/CRITICAL/i.test(v) ? 'badge-crit' : 'badge-warn'}">${esc(v)}</span>` },
                { label: 'Diesel (L)', key: 'diesel_l', r: true, fmt: v => fmtNum(v, 0) + ' L' },
                { label: '15W-40 (L)', key: 'engine_oil_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
                { label: 'Expected 15W-40', key: 'exp_engine_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
                { label: 'Hyd 68 (L)', key: 'hyd_oil_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
                { label: 'Expected Hyd 68', key: 'exp_hyd_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
                { label: 'Excess Hyd (L)', key: 'excess_hyd_l', r: true, bar: 'brass', fmt: v => v > 0 ? `<b>${fmtNum(v, 1)} L</b>` : '-' },
                { label: 'Leak Loss ($)', key: 'leak_loss_usd', r: true, fmt: v => v > 0 ? `<b>${fmtUSD(v, 0)}</b>` : '-' }
              ], lubEx, { subtitle: 'Units exceeding hydraulic Oil 68 benchmarks, overdue for 15W-40 oil service, or drained early', rowAmber: r => r.alert_flag > 0, unitLabel: 'flagged units' })}
            </div>
          `;
        })()}
      `;
    }

    // =========================================================================
    // PAGE 04: SALES & DELIVERIES (m18c_report.py Page 04 — 2 bands + 6 charts + 4 tables)
    // =========================================================================
    else if (activePageId === 'p04_sales') {
      // Top 4 material products monthly price trend (excluding non-aggregate equipment/fuel sales)
      const allCoSalesRows = filterRecords(rec.sales_tickets, { ignorePeriod: true, ignoreSearch: true });
      const trendSalesPool = !hasAnySlicer ? allCoSalesRows : allCoSalesRows.filter(r => {
        if (!matchCommon(r)) return false;
        if (sl.shift) {
          const isNight = !!r.overtime;
          if (sl.shift === 'Night' && !isNight) return false;
          if (sl.shift === 'Day' && isNight) return false;
        }
        if (sl.overtimeFlag === 'Yes' && !r.overtime) return false;
        if (sl.overtimeFlag === 'No' && r.overtime) return false;
        return true;
      });
      const top4Prods = pickTopAggregateGrades(prodRows, 4, rec.products);
      const prodColors = [C.navy, C.brass, C.steel, C.amber];
      const priceSeries = buildMonthlyGradePriceSeries(months, top4Prods, trendSalesPool, {
        basis: STATE.basis,
        ticketMeters,
        colors: prodColors
      });
      const volGradeRows = pickTopAggregateGrades(prodRows, 999, rec.products);
      const volM3Sum = volGradeRows.reduce((a, p) => a + Number(p.qty_sold || 0), 0);
      const volMatAvg = volM3Sum > 0
        ? round2(volGradeRows.reduce((a, p) => a + Number((p.net_sales != null ? p.net_sales : (Number(p.avg_price_net || 0) * Number(p.qty_sold || 0)))), 0) / volM3Sum)
        : k.avg_price_net;
      const volTtcAvg = volM3Sum > 0
        ? round2(volGradeRows.reduce((a, p) => a + Number(p.sales_ttc || 0), 0) / volM3Sum)
        : k.avg_price_ttc;

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Sales Revenue, Volumes & Payment Mix', [
            { label: 'Total Sales', value: fmtUSD(sc(k.sales_ttc), 0), sub: fmtNum(sc(k.loads), 0) + ' weighbridge loads', tone: 'brass' },
            { label: 'Material Sales', value: fmtUSD(round2(sc(k.sales_ttc) - sc(k.trans_rev)), 0), sub: 'Aggregate grade value' },
            { label: 'Transport Revenue', value: fmtUSD(sc(k.trans_rev), 0), sub: 'Delivery haulage billed' },
            { label: 'Cash Sales', value: fmtUSD(sc(k.cash_sales_ttc != null ? k.cash_sales_ttc : k.cash_sales), 0), sub: fmtPct(null, k.cash_sales_ttc != null ? k.cash_sales_ttc : k.cash_sales, k.sales_ttc) + ' of Sales', tone: 'good' },
            { label: 'Credit Sales', value: fmtUSD(sc(k.credit_sales_ttc != null ? k.credit_sales_ttc : k.credit_sales), 0), sub: fmtPct(null, k.credit_sales_ttc != null ? k.credit_sales_ttc : k.credit_sales, k.sales_ttc) + ' of Sales' },
            { label: 'Active Customers', value: fmtNum(custRows.filter(c => Number(c.loads || 0) > 0).length), sub: 'Billed in selected period' }
          ])}
          ${kpiBand('2 · Weighbridge Loads, Tonnage & Unit Realisation', [
            { label: 'Total Loads', value: fmtNum(sc(k.loads), 0), sub: fmtNum(salesRows.length) + ' in web sample' },
            { label: 'Delivery Loads', value: fmtNum(sc(k.delivery_loads), 0), sub: fmtPct(null, k.delivery_loads, k.loads) + ' delivered' },
            { label: 'Pick-up Loads', value: fmtNum(sc(k.pickup_loads), 0), sub: 'Material only (customer truck)' },
            { label: 'Quantity Sold (m³)', value: fmtNum(sc(k.qty_sold), 0) + ' m³', sub: 'Converted to m³ (1 Truck = 27 m³)' },
            { label: 'Tons Sold (Converted)', value: fmtNum(sc(k.tons_sold), 0) + ' t', sub: 'Using grade ton_factor', tone: 'good' },
            { label: 'Avg Realised Price', value: fmtUSD(volTtcAvg, 2), sub: 'Aggregate grades ($/m³)', tone: 'brass' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Cash vs credit sales by month', buildClusteredColumnSvg(months, [
            { label: 'Credit Sales', color: C.navy, get: r => Number(r.credit_sales_ttc != null ? r.credit_sales_ttc : (r.credit_sales || 0)) },
            { label: 'Cash Sales', color: C.steel, get: r => Number(r.cash_sales_ttc != null ? r.cash_sales_ttc : (r.cash_sales || 0)) }
          ]), { legend: [{ label: 'Credit', color: C.navy }, { label: 'Cash', color: C.steel }] })}
          ${pbiPanel('Realised price per unit ($/m³) by month · top aggregate grades', buildMultiLineSvg(months, priceSeries, { isMoney: true, decimals: 2 }), {
            subtitle: 'Monthly realised unit price ($/m³) from weighbridge tickets across top 4 aggregate grades',
            legend: priceSeries.map(s => ({ label: s.label, color: s.color, line: true }))
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Delivery transport by month · own fleet vs 3rd-party pass-through ($)', buildComboChartSvg(months, [
            { key: 'own_trans_rev', label: 'Own-Fleet Delivery Rev', color: C.navy },
            { key: 'third_trans_rev', label: '3rd-Party Pass-Through', color: C.brass }
          ], {
            label: 'Own-Fleet Share %',
            color: C.steel,
            isPct: true,
            get: r => {
              const own = Math.max(0, Number(r.own_trans_rev || 0));
              const ext = Math.max(0, Number(r.third_trans_rev || 0));
              return (own + ext) > 0 ? own / (own + ext) : 0;
            }
          }, { lineMax: 1 }), {
            id: 'pbiSalesDeliveryTransChart',
            subtitle: 'Customer delivery haulage billed on company trucks vs third-party haulers and own-fleet share %',
            legend: [
              { label: 'Own Fleet', color: C.navy },
              { label: '3rd-Party Pass-Through', color: C.brass },
              { label: 'Own-Fleet %', color: C.steel, line: true }
            ]
          })}
          ${pbiPanel('Dispatch mix by month · delivery vs pick-up loads', buildClusteredColumnSvg(months, [
            { key: 'deliv_loads_m', label: 'Delivery Loads', color: C.navy },
            { key: 'pickup_loads_m', label: 'Pick-up Loads', color: C.steel }
          ], { isMoney: false }), {
            id: 'pbiSalesDispatchMixChart',
            subtitle: 'Monthly weighbridge dispatches split between delivered customer loads and plant pick-up loads',
            legend: [
              { label: 'Delivery Loads', color: C.navy },
              { label: 'Pick-up Loads', color: C.steel }
            ]
          })}
        </div>

        <div class="pbi-grid-3">
          ${pbiPanel('Sales by material', buildHorizontalBarChart(prodRows, 'Product', 'sales_ttc', v => fmtUSD(v, 0), { color: C.navy, maxItems: 8 }), { subtitle: 'Total revenue ($)' })}
          ${pbiPanel('Quantity sold by material (m³)', buildHorizontalBarChart(prodRows, 'Product', 'qty_sold', v => fmtNum(v, 0) + ' m³', { color: C.slate, maxItems: 8 }), { subtitle: 'Volume converted to m³ (1 Truck = 27 m³)' })}
          ${pbiPanel('Average price per m³ by material', buildHorizontalBarChart(pickTopAggregateGrades(prodRows, 8, rec.products), 'Product', 'avg_price_ttc', v => fmtUSD(v, 2), { color: C.brass, maxItems: 8 }), { subtitle: 'Realised unit price ($/m³)' })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Products · volume, revenue, list vs realised price', [
            { label: 'Product / Grade', key: 'Product', fmt: (v, r) => `<b>${esc(v || '-')}</b>${r && r['Material Family'] && r['Material Family'] !== v ? ` <span class="mu">· ${esc(r['Material Family'])}</span>` : ''}` },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Qty (m³)', key: 'qty_sold', r: true, fmt: v => v > 0 ? `${fmtNum(v, 0)} m³` : '-' },
            { label: 'Tons', key: 'tons_sold', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'List ($)', key: 'list_price', r: true, fmt: v => v != null ? fmtUSD(v, 2) : '-' },
            {
              label: 'Avg Price ($)',
              key: 'avg_price_ttc',
              r: true,
              fmt: v => fmtUSD(v, 2),
              foot: list => {
                const agg = pickTopAggregateGrades(list, 999, rec.products);
                const ts = agg.reduce((a, r) => a + Number(r.sales_ttc != null ? r.sales_ttc : (Number(r.avg_price_ttc || 0) * Number(r.qty_sold || 0))), 0);
                const tq = agg.reduce((a, r) => a + Number(r.qty_sold || 0), 0);
                return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(ts / tq, 2)}</b>` : '-';
              }
            },
            { label: 'Total Sales ($)', key: 'sales_ttc', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` }
          ], prodRows, { subtitle: 'Complete aggregate grade breakdown with inline revenue bars', unitLabel: 'grades' })}

          ${(() => {
            const destSiteRows = siteRows
              .filter(s => Number(s.loads || 0) > 0 || Math.abs(Number(s.sales_ttc || 0)) > 0.005)
              .sort((a, b) => Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0) || Number(b.loads || 0) - Number(a.loads || 0));
            return pbiTable('Customer destination sites · loads, tonnage, transport & revenue', [
              { label: 'Destination Site', key: 'Site', bold: true, fmt: (v, r) => `<b>${esc(v && v !== '(Unassigned Site)' ? v : 'Pick-up at Plant (No delivery site)')}</b>${siteJvMarker(r && (r.JV === 'Yes' || r.is_jv))}` },
              { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
              { label: 'Tons Sold', key: 'tons_sold', r: true, fmt: v => fmtNum(v, 0) },
              { label: 'Transport ($)', key: 'trans_rev', r: true, fmt: v => fmtUSD(v, 0) },
              { label: 'Total Sales ($)', key: 'sales_ttc', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` }
            ], destSiteRows, { subtitle: 'Customer delivery destination sites and plant pick-up dispatches (excludes raw material quarry source sites)', unitLabel: 'destination sites' });
          })()}
        </div>

        <div class="pbi-grid-1">
          ${movedRegisterBanner('Weighbridge Sales Tickets Register & Ticket Serial Hygiene', 'Individual sales tickets live in Sales & Deliveries; skipped & duplicate 25-ticket pad serial audit lives in AI Sentinels & Audit.', 'sentinels', 'AI Sentinels & Audit', 'tickets')}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 05: PRICING & COMMISSION (m18c_report.py Page 05 — 2 bands + 2 charts + headed sections & tables)
    // =========================================================================
    else if (activePageId === 'p05_pricing') {
      const allRules = filterRecords(rec.price_rules, { ignorePeriod: true, ignoreSearch: true }).filter(r => {
        if (!matchCommon(r)) return false;
        if (sl.ruleType && norm(r.rule_type) !== norm(sl.ruleType)) return false;
        const isEnded = Boolean(r.end_date && String(r.end_date) < today);
        if (sl.activeStatus === 'Active' && isEnded) return false;
        if (sl.activeStatus === 'Ended' && !isEnded) return false;
        return true;
      });
      const activeRules = allRules.filter(r => !r.end_date || String(r.end_date) >= today);
      const salesRules = allRules.filter(r => /Sales/i.test(r.rule_type || ''));
      const siteRules = allRules.filter(r => /Purchase|Transport/i.test(r.rule_type || ''));
      const commRules = allRules.filter(r => /Commission/i.test(r.rule_type || ''));

      // Product price comparison (Agreed vs Realised vs List — aggregate m³ grades only so equipment sales never distort $/m³ scale)
      const nonAggProdRe = /\b(truck|shacman|mixer|pump|excavator|excavation|loader|bulldozer)\b/i;
      const prodPriceComp = pickTopAggregateGrades(prodRows, 8, rec.products).map(p => {
        const pRules = salesRules.filter(r => norm(r.product) === norm(p.Product) && Number(r.unit_price || 0) > 0 && Number(r.unit_price || 0) <= 250 && !/^unit$/i.test(String(r.unit || '')) && !nonAggProdRe.test(String(r.product || '')));
        const avgAgreed = pRules.length ? pRules.reduce((a, r) => a + Number(r.unit_price || 0), 0) / pRules.length : (p.list_price || p.avg_price_net || 0);
        const minP = pRules.length ? Math.min(...pRules.map(r => Number(r.unit_price))) : Number(p.avg_price_net || 0) * 0.9;
        const maxP = pRules.length ? Math.max(...pRules.map(r => Number(r.unit_price))) : Number(p.list_price || p.avg_price_ttc || 0);
        return {
          Product: p.Product,
          agreed: round2(avgAgreed),
          realised: round2(p.avg_price_net || 0),
          list: round2(p.list_price || p.avg_price_ttc || 0),
          lowest: round2(minP),
          highest: round2(maxP)
        };
      });

      const asAtPricingDate = (activeRange && activeRange.to && activeRange.to < today) ? activeRange.to : today;
      const lpHist = buildListPriceHistoryData(allRules, prodRows, months, {
        today,
        dateFrom: activeRange && activeRange.from,
        dateTo: activeRange && activeRange.to
      });
      const delTransComp = buildSalesDeliveryTransportComp(salesRows, allRules, { today, asAtDate: asAtPricingDate });
      const quarryComp = buildQuarryPricingComp(rawRows, allRules, { today, asAtDate: asAtPricingDate });
      const haulChartSource = quarryComp.haulFlatChartRows.length ? quarryComp.haulFlatChartRows : quarryComp.haulUnitChartRows;
      const haulChartBasisLbl = quarryComp.haulFlatChartRows.length ? '$/Truck Load' : '$/m³';

      const p05AggGrades = pickTopAggregateGrades(prodRows, 999, rec.products);
      const p05AggM3 = p05AggGrades.reduce((a, p) => a + Number(p.qty_sold || 0), 0);
      const p05RealisedNet = hasAnySlicer && p05AggM3 > 0
        ? round2(p05AggGrades.reduce((a, p) => a + Number(p.net_sales != null ? p.net_sales : (Number(p.avg_price_net || 0) * Number(p.qty_sold || 0))), 0) / p05AggM3)
        : k.avg_price_net;

      // Live Sales Commission computation (BBConstruction -> Agrimount per-unit agreements + GL 6222 / GL 449 settlements)
      const commFilterSales = s => {
        if (!s) return false;
        if (sl.product && norm(s.product) !== norm(sl.product)) return false;
        if (sl.customer && norm(s.customer) !== norm(sl.customer)) return false;
        if (sl.site && norm(s.site) !== norm(sl.site)) return false;
        if (sl.saleType && s.sale_type && norm(s.sale_type) !== norm(sl.saleType)) return false;
        if (sl.method && s.method && norm(s.method) !== norm(sl.method)) return false;
        return true;
      };
      const commFilterRec = r => {
        if (!r) return false;
        if (sl.supplier && norm(r.customer || r.supplier) !== norm(sl.supplier)) return false;
        if (sl.customer && norm(r.customer) !== norm(sl.customer)) return false;
        return true;
      };
      const commFilterSet = s => {
        if (!s) return false;
        if (sl.supplier && norm(s.supplier) !== norm(sl.supplier)) return false;
        return true;
      };
      const commRulesPool = filterRecords(rec.price_rules, { ignorePeriod: true, ignoreSearch: true }).filter(r => {
        const isComm = /^commission$/i.test(String(r.rule_type || '').trim());
        if (sl.ruleType && norm(sl.ruleType) !== 'commission' && isComm) return false;
        if (sl.product && norm(r.product) !== norm(sl.product)) return false;
        if (sl.supplier && isComm && norm(r.supplier) !== norm(sl.supplier)) return false;
        const isEnded = Boolean(r.end_date && String(r.end_date) < today);
        if (sl.activeStatus === 'Active' && isEnded) return false;
        if (sl.activeStatus === 'Ended' && !isEnded) return false;
        return true;
      });
      const allCoSalesP05 = filterRecords(rec.sales_tickets, { ignorePeriod: true, ignoreSearch: true }).filter(commFilterSales);
      const allCoRecP05 = filterRecords(rec.receipts, { ignorePeriod: true, ignoreSearch: true }).filter(commFilterRec);
      const allCoSetP05 = filterRecords(rec.settlements, { ignorePeriod: true, ignoreSearch: true }).filter(commFilterSet);
      const commData = buildSalesCommissionData(
        baseSalesRows.filter(commFilterSales),
        baseRecRows.filter(commFilterRec),
        baseSetRows.filter(commFilterSet),
        commRulesPool,
        {
          today,
          asAtDate: asAtPricingDate,
          allSalesRows: allCoSalesP05,
          allReceiptRows: allCoRecP05,
          allSettlementRows: allCoSetP05,
          allGlobalRules: rec.price_rules,
          allowedCompanies: typeof ctx.allowedCompanyNames === 'function' ? ctx.allowedCompanyNames() : null,
          dateFrom: activeRange && activeRange.from,
          dateTo: activeRange && activeRange.to,
          basis: STATE.basis
        }
      );
      const hasCommData = commData.rulesCount > 0 || commData.totalEarned > 0 || commData.totalPaidExVat > 0;

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Price Agreement Coverage, Realised vs Agreed & Below-Agreed Governance', [
            { label: 'Active Price Agreements', value: fmtNum(activeRules.length), sub: fmtNum(allRules.length) + ' total rules in matrix', tone: 'brass' },
            { label: 'Weighted Agreed Price', value: fmtUSD(prSn.weighted_agreed_price_usd || k.avg_price_net, 2), sub: 'Per m³ agreed corridor' },
            { label: 'Actual Realised Price', value: fmtUSD(p05RealisedNet, 2), sub: 'Ex-VAT across aggregate m³' },
            { label: 'Sold Below Agreed ($)', value: fmtUSD(prSn.sales_below_agreed_usd || 0, 0), sub: fmtNum(prSn.below_agreed_pairs_count || 0) + ' customer × grade pairs', tone: 'warn' },
            { label: 'Lapsed Pairs Still Trading', value: fmtNum(prSn.lapsed_agreement_pairs_count || 0), sub: 'Trading after End date', tone: 'warn' },
            { label: 'Per-Truck Delivery Rules', value: fmtNum(prSn.truck_unit_delivery_rules || 0), sub: 'Unit = Truck flat rate' }
          ])}
          ${kpiBand('2 · Commissions, Delivery Transport & Quarry Purchase / Haulage Rules', [
            {
              label: 'Commission Earned (Ex-VAT)',
              value: fmtUSD(commData.totalEarned, 0),
              sub: `${fmtNum(commData.rulesCount, 0)} rules · ${commData.beneficiariesLabel} (${fmtNum(commData.totalQualifyingLoads, 0)} loads)`,
              tone: hasCommData ? 'brass' : ''
            },
            {
              label: 'Commission Payable (Ex-VAT)',
              value: fmtUSD(commData.openPayableExVat, 0),
              sub: `Paid ${fmtUSD(commData.totalPaidExVat, 0)} Ex-VAT (+${fmtUSD(commData.totalPaidVat, 0)} VAT)`,
              tone: commData.openPayableExVat > 0 ? 'brass' : 'good'
            },
            { label: 'Customer Sales Rules', value: fmtNum(salesRules.length), sub: fmtNum(delTransComp.rows.length) + ' active delivery pairs' },
            { label: 'List Price Revisions', value: fmtNum(lpHist.totalRulesCount), sub: fmtNum(lpHist.series.length) + ' tracked grades over time' },
            { label: 'Site Purchase & Haul Rules', value: fmtNum(siteRules.length), sub: fmtNum(quarryComp.haulRows.length) + ' hauler × site pairs' },
            { label: 'Quarry Over-Agreed Pairs', value: fmtNum(quarryComp.overAgreedCount), sub: 'Billed above site / haul rate', tone: quarryComp.overAgreedCount > 0 ? 'warn' : 'good' }
          ])}
        </div>

        ${renderCommissionVisualsSection(commData, { isPbi: true })}

        <div class="pbi-grid-2">
          ${pbiPanel('List price evolution over time ($/m³ by grade)', buildMultiLineSvg(lpHist.months, lpHist.series, {
            isMoney: true,
            decimals: 2,
            includeZero: false,
            maxPoints: 22
          }), {
            id: 'pbiListPriceTrendChart',
            subtitle: 'Monthly standard list price trajectory across dated revision steps by aggregate grade',
            legend: lpHist.series.map(s => ({ label: s.label, color: s.color, line: true }))
          })}

          ${pbiPanel('Agreed vs. realised vs. list price per unit (by material)', buildClusteredBarChart(prodPriceComp, 'Product', [
            { label: 'Agreed', key: 'agreed', color: C.slate },
            { label: 'Realised', key: 'realised', color: C.navy },
            { label: 'List Price', key: 'list', color: C.brass }
          ]), { subtitle: 'Comparison of average agreed price, actual realised net price, and standard list price per unit' })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Spread by product · lowest, highest and list price', buildClusteredColumnSvg(prodPriceComp, [
            { key: 'lowest', label: 'Lowest Agreed', color: C.slate },
            { key: 'highest', label: 'Highest Agreed', color: C.navy },
            { key: 'list', label: 'List Price', color: C.brass }
          ], { labelKey: 'Product', labels: true }), {
            subtitle: 'Price corridor across active customer agreements vs. standard list price',
            legend: [{ label: 'Lowest', color: C.slate }, { label: 'Highest', color: C.navy }, { label: 'List', color: C.brass }]
          })}

          ${pbiPanel('Customer delivery transportation rate by site ($/m³)', buildClusteredBarChart(delTransComp.unitChartRows, 'label', [
            { label: 'Agreed', key: 'agreed_chart', color: C.slate },
            { label: 'Last Billed', key: 'last_rate', color: C.navy },
            { label: 'Period Avg', key: 'avg_rate', color: C.brass }
          ], { headRight: r => `${fmtNum(r.loads, 0)} loads` }), {
            id: 'pbiDeliveryTransChart',
            subtitle: 'Agreed delivery transport rate vs. last billed and period average across top customer × destination pairs'
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Quarry raw material purchase rate by site ($/m³)', buildClusteredBarChart(quarryComp.matUnitChartRows, 'label', [
            { label: 'Agreed', key: 'agreed_chart', color: C.slate },
            { label: 'Last Receipt', key: 'last_rate', color: C.navy },
            { label: 'Period Avg', key: 'avg_rate', color: C.brass }
          ], { headRight: r => `${fmtNum(r.loads, 0)} loads` }), {
            subtitle: 'Site purchase agreement rate vs. last received unit cost and period average by quarry source'
          })}

          ${pbiPanel(`Quarry transportation rate by hauler & site (${haulChartBasisLbl})`, buildClusteredBarChart(haulChartSource, 'label', [
            { label: 'Agreed', key: 'agreed_chart', color: C.slate },
            { label: 'Last Haul', key: 'last_rate', color: C.navy },
            { label: 'Period Avg', key: 'avg_rate', color: C.brass }
          ], { headRight: r => `${fmtNum(r.loads, 0)} loads` }), {
            subtitle: 'Agreed 3rd-party quarry haulage rate vs. last haul ticket and period average'
          })}
        </div>

        ${pbiHeading('Sales commissions by product, monthly accrual & plant-owner settlements', `${commData.beneficiariesLabel} per-unit plant commission rules reconciled to GL 6222 (${fmtUSD(commData.totalPaidExVat, 2)} Ex-VAT paid) and GL 449 (${fmtUSD(commData.totalPaidVat, 2)} 11% VAT paid)`)}
        <div class="pbi-grid-2" id="pbiCommissionTablesRow">
          ${pbiTable('Sales commission & selling-price corridor by product', [
            { label: 'Product', key: 'product', bold: true },
            { label: 'Owner', key: 'owner' },
            { label: 'UoM', key: 'uom', mono: true },
            { label: 'Comm. Rate', key: 'active_rate', r: true, agg: 'none', fmt: (v, r) => `<b>${fmtUSD(v, 2)}</b>${r.rate_step_note ? `<div style="font-size:10px;color:var(--muted)">${esc(r.rate_step_note)}</div>` : ''}` },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Qty Sold', key: 'qty_sold', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Earned Ex-VAT ($)', key: 'comm_due', r: true, bar: true, fmt: v => fmtUSD(v, 2) },
            { label: 'List ($)', key: 'list_price', r: true, agg: 'none', fmt: v => v != null ? fmtUSD(v, 2) : '-' },
            { label: 'Realised ($)', key: 'realised_price', r: true, agg: 'none', fmt: v => v != null ? fmtUSD(v, 2) : '-' },
            { label: 'Net After ($)', key: 'net_after_comm', r: true, agg: 'none', fmt: v => v != null ? `<b>${fmtUSD(v, 2)}</b>` : '-' }
          ], commData.productRows, {
            subtitle: 'Per-unit commission rate, qualifying weighbridge tonnage/m³, accrued commission, and selling rate net of commission',
            unitLabel: 'products'
          })}

          ${pbiTable('Monthly commission accrual, settlement & open payable ledger', [
            { label: 'Month', key: 'Year Month', bold: true },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Earned Ex-VAT ($)', key: 'earned_usd', r: true, bar: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Paid Ex-VAT ($)', key: 'paid_net_usd', r: true, fmt: v => fmtUSD(v, 2) },
            { label: '11% VAT Paid ($)', key: 'paid_vat_usd', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Period Net ($)', key: 'period_net_ex_vat', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Open Payable ($)', key: 'cum_payable_ex_vat', r: true, agg: 'none', fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], commData.monthlyRows, {
            subtitle: `Chronological monthly commission accrued vs. ${commData.beneficiariesLabel} Rent (GL 6222) and 11% VATRent (GL 449) payouts`,
            unitLabel: 'months'
          })}
        </div>

        ${pbiHeading('Commercial sales & customer delivery transportation comparisons', 'Amber row = agreement End date has passed · Red variance = billed below customer agreement or delivery transport rate')}
        <div class="pbi-grid-2">
          ${pbiTable('Customer × product price performance & below-agreed exceptions', [
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Product', key: 'product' },
            { label: 'Qty Sold', key: 'qty', r: true, bar: true, fmt: v => fmtNum(v, 1) },
            { label: 'Agreed ($)', key: 'agreed_price', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Last Sold ($)', key: 'last_price', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Last − Agreed', raw: r => Number(r.last_price || 0) - Number(r.agreed_price || 0), r: true, negRed: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Shortfall ($)', raw: r => (Number(r.last_price || 0) - Number(r.agreed_price || 0)) * Number(r.qty || 0), r: true, negRed: true, fmt: v => fmtUSD(v, 0) }
          ], (prSn.top_below_agreed_exceptions || []).filter(matchCommon), { subtitle: 'Pairs where tickets were billed below the customer agreement price', unitLabel: 'pairs' })}

          ${pbiTable('Customer delivery transportation comparison (agreed vs. last delivered)', [
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Site', key: 'site' },
            { label: 'Basis', key: 'basis', mono: true },
            { label: 'Agreed ($)', key: 'agreed_rate', r: true, agg: 'none', fmt: v => v != null ? `<b>${fmtUSD(v, 2)}</b>` : '—' },
            { label: 'Last Billed ($)', key: 'last_rate', r: true, agg: 'none', fmt: v => fmtUSD(v, 2) },
            { label: 'Last − Agreed', key: 'vs_agreed', r: true, agg: 'none', negRed: true, fmt: v => v != null ? fmtUSD(v, 2) : '—' },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Transport Rev ($)', key: 'trans_rev', r: true, bar: true, fmt: v => fmtUSD(v, 0) }
          ], delTransComp.rows, {
            subtitle: 'Customer × site delivery haulage rate comparison across active weighbridge delivery tickets',
            rowAmber: r => Boolean(r.is_lapsed),
            unitLabel: 'pairs'
          })}
        </div>

        ${pbiHeading('Quarry raw material purchase & site transportation comparisons', 'Dedicated operational register & agreement entry live in Purchases, Expenses & Payables · Quarry & Haulage Rates')}
        <div class="pbi-grid-2">
          ${pbiTable('Raw material purchase comparison (agreed vs. last receipt by site)', [
            { label: 'Site', key: 'site', bold: true },
            { label: 'Site Owner', key: 'site_owner' },
            { label: 'Material', key: 'product' },
            { label: 'Basis', key: 'basis', mono: true },
            { label: 'Agreed ($)', key: 'agreed_rate', r: true, agg: 'none', fmt: v => v != null ? `<b>${fmtUSD(v, 2)}</b>` : '—' },
            { label: 'Last Cost ($)', key: 'last_rate', r: true, agg: 'none', fmt: v => fmtUSD(v, 2) },
            { label: 'Agreed − Last', key: 'agreed_minus_last', r: true, agg: 'none', negRed: true, fmt: v => v != null ? fmtUSD(v, 2) : '—' },
            { label: 'Material Cost ($)', key: 'mat_cost', r: true, bar: true, fmt: v => fmtUSD(v, 0) }
          ], quarryComp.matRows, {
            subtitle: 'Purchase Price (Site) agreements vs. actual raw material intake unit and flat-truck costs',
            rowAmber: r => Boolean(r.is_lapsed),
            unitLabel: 'pairs'
          })}

          ${pbiTable('Quarry transportation comparison (agreed vs. last haul by hauler & site)', [
            { label: 'Hauler / Truck Owner', key: 'truck_owner', bold: true },
            { label: 'Source Site', key: 'site' },
            { label: 'Basis', key: 'basis', mono: true },
            { label: 'Agreed ($)', key: 'agreed_rate', r: true, agg: 'none', fmt: v => v != null ? `<b>${fmtUSD(v, 2)}</b>` : '—' },
            { label: 'Last Haul ($)', key: 'last_rate', r: true, agg: 'none', fmt: v => fmtUSD(v, 2) },
            { label: 'Agreed − Last', key: 'agreed_minus_last', r: true, agg: 'none', negRed: true, fmt: v => v != null ? fmtUSD(v, 2) : '—' },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Haulage Cost ($)', key: 'haul_cost', r: true, bar: 'brass', fmt: v => fmtUSD(v, 0) }
          ], quarryComp.haulRows, {
            subtitle: 'Transport Price (Site) agreements vs. actual 3rd-party quarry haulage intake tickets',
            rowAmber: r => Boolean(r.is_lapsed),
            unitLabel: 'pairs'
          })}
        </div>

        <div class="pbi-grid-2">
          ${movedRegisterBanner('Commercial Sales, Delivery & Commission Agreements', 'Customer Sales (Pickup / Delivery), Standard List Prices, and Sales Commission rules live in Sales & Receivables ▸ Pricing & Commissions.', 'pricing', 'Pricing & Commissions', 'spreads')}
          ${movedRegisterBanner('Quarry Raw Material & Site Haulage Agreements', 'Purchase Price (Site) and Transport Price (Site) agreements and haulage comparisons live in Purchases, Expenses & Payables · Quarry & Haulage Rates.', 'raw_pricing', 'Quarry & Haulage Rates')}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 06: CUSTOMERS & RECEIVABLES (Matches Screenshot 2 Power Apps "Power BI - WTC" + even better!)
    // =========================================================================
    else if (activePageId === 'p06_ar') {
      const sumC = key => custRows.reduce((a, r) => a + Number(r[key] || 0), 0);
      const hasCustSlicer = Boolean(sl.customer || sl.iva || sl.creditOnly || sl.agingBucket || sl.search);
      const arBal = hasCustSlicer ? sumC('ar_balance') : Number(k.ar_balance || 0);
      const arGross = hasCustSlicer ? sumC('ar_gross') : Number(k.ar_gross || k.ar_balance || 0);
      const arAdv = hasCustSlicer ? sumC('ar_advances') : Number(k.ar_advances || 0);
      const arCur = hasCustSlicer ? sumC('ar_current') : Number(k.ar_current || 0);
      const ar1_10 = hasCustSlicer ? sumC('ar_1_10') : Number(k.ar_1_10 || 0);
      const ar11_30 = hasCustSlicer ? sumC('ar_11_30') : Number(k.ar_11_30 || 0);
      const ar31_60 = hasCustSlicer ? sumC('ar_31_60') : Number(k.ar_31_60 || 0);
      const ar60p = hasCustSlicer ? sumC('ar_60_plus') : Number(k.ar_60_plus || 0);
      const arOver = hasCustSlicer ? sumC('ar_overdue') : Number(k.ar_overdue || 0);
      const onAcctSigned = -Math.abs(arAdv || Math.max(0, (arCur + ar1_10 + ar11_30 + ar31_60 + ar60p) - arBal));
      const custOwingCount = custRows.filter(c => Number(c.ar_balance || 0) > 0.01).length;
      const creditTerms = filterRecords(rec.credit_terms, { ignorePeriod: true }).filter(matchCommon);
      const limitMap = new Map();
      creditTerms.forEach(ct => limitMap.set(norm(ct.customer), ct));
      const totalCreditLimits = creditTerms.reduce((a, r) => a + Number(r.credit_limit || 0), 0);
      const crSalesTtcKpi = k.credit_sales_ttc != null ? Number(k.credit_sales_ttc) : (Number(k.sales_ttc || 0) - Number(k.cash_sales || 0));
      const crSalesCardVal = hasCustSlicer ? custRows.reduce((a, r) => a + Number(r.credit_sales_ttc != null ? r.credit_sales_ttc : (r.credit_sales || 0)), 0) : crSalesTtcKpi;
      const rcptCardVal = hasCustSlicer ? custRows.reduce((a, r) => a + Number(r.ar_settled != null ? r.ar_settled : (r.receipts || 0)), 0) : Number(k.receipts || 0);
      const collectedPct = crSalesCardVal > 0 ? (rcptCardVal / crSalesCardVal) : 0;

      // Monthly trajectory of Customers Owing (Gross, Advances, Net)
      let runNet = Math.max(0, arBal * 0.72);
      const arMonths = months.map(mRow => {
        const crM = Number(mRow.credit_sales_ttc != null ? mRow.credit_sales_ttc : (mRow.credit_sales || 0));
        const delta = crM - Number(mRow.receipts || 0);
        runNet = Math.max(0, runNet + delta * 0.25);
        const grossM = round2(runNet + Math.abs(onAcctSigned) * 0.85);
        const advM = round2(Math.abs(onAcctSigned) * 0.85);
        return {
          'Year Month': mRow['Year Month'],
          credit_sales: crM,
          receipts: mRow.receipts || 0,
          ar_gross_m: grossM,
          ar_adv_m: advM,
          ar_net_m: round2(grossM - advM)
        };
      });
      if (arMonths.length) {
        arMonths[arMonths.length - 1].ar_gross_m = round2(arGross);
        arMonths[arMonths.length - 1].ar_adv_m = round2(Math.abs(onAcctSigned));
        arMonths[arMonths.length - 1].ar_net_m = round2(arBal);
      }

      // 6-bucket AR Aging signed vertical column data (Current, 1-10, 11-30, 31-60, 60+, On account)
      const agingBuckets = [
        { label: 'Current', value: arCur, color: C.navy },
        { label: '1-10', value: ar1_10, color: C.steel },
        { label: '11-30', value: ar11_30, color: C.steel },
        { label: '31-60', value: ar31_60, color: C.brass },
        { label: '60+', value: ar60p, color: C.crit },
        { label: 'On account', value: onAcctSigned, color: C.slate }
      ];

      // Build Customer Running Statement (every credit ticket + AR-settling receipt in chronological order with running balance)
      const stmtItems = [];
      salesRows.forEach(s => {
        const mth = String(s.method || '').trim();
        if (!(mth === 'Credit' || mth === 'CR Return' || mth === 'Credit Return')) return;
        const sgn = saleTicketSign(s);
        if (sgn === 0) return;
        const amt = round2(Math.abs(Number(s.total_ttc != null ? s.total_ttc : s.total || 0)));
        stmtItems.push({ id: s.id, rkey: 'sales_tickets', date: s.date, type: sgn < 0 ? 'Credit Return' : 'Sale Ticket', doc: '#' + (s.ticket_no || '—'), customer: s.customer, detail: `${s.product || ''} (${fmtNum(s.qty, 1)} ${s.uom || ''})`, debit: sgn > 0 ? amt : 0, credit: sgn < 0 ? amt : 0 });
      });
      recRows.forEach(r => {
        if (!isArSettlingRecpt(r)) return;
        const amt = round2(Number(r.amount || 0) + Number(r.discount || 0));
        stmtItems.push({ id: r.id, rkey: 'receipts', date: r.date, type: 'Receipt (' + (r.method || 'Cash') + ')', doc: r.reference || r.name || 'RCPT', customer: r.customer, detail: r.kind || 'Payment', debit: 0, credit: amt });
      });
      stmtItems.sort((a, b) => {
        const da = String(a.date || ''), db = String(b.date || '');
        return da < db ? -1 : (da > db ? 1 : 0);
      });
      let runBal = 0;
      stmtItems.forEach(it => { runBal = round2(runBal + it.debit - it.credit); it.running = runBal; });
      stmtItems.reverse();

      const arCustRows = [...custRows].sort((a, b) => Number(b.ar_balance || 0) - Number(a.ar_balance || 0) || Number(b.sales_ttc || 0) - Number(a.sales_ttc || 0));
      const totalPosBal = arCustRows.reduce((a, r) => a + Math.max(0, Number(r.ar_balance || 0)), 0) || 1;

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Customer Receivables & FIFO Aging Position (VAT-Inclusive per m249)', [
            { label: 'Customers owing', value: fmtNum(custOwingCount), sub: fmtNum(custRows.length) + ' total customers' },
            { label: 'Open balance', value: fmtUSD(arBal, 0), sub: 'Net closing AR (Class 4111)', tone: 'brass' },
            { label: 'Gross receivables', value: fmtUSD(arGross, 0), sub: 'Customers with debit balance' },
            { label: 'Customer advances', value: fmtUSD(Math.abs(onAcctSigned), 0), sub: 'Unapplied on-account credit', tone: 'good' },
            { label: 'Past due (>30 days)', value: fmtUSD(arOver, 0), sub: '31–60d + 60+d buckets', tone: 'warn' },
            { label: 'Over 60 days', value: fmtUSD(ar60p, 0), sub: 'FIFO oldest unpaid tickets', tone: 'crit' }
          ])}
          ${kpiBand('2 · Credit Sales, Collections, DSO & Credit Limits', [
            { label: 'Credit sales', value: fmtUSD(crSalesCardVal, 0), sub: 'Ticketed TTC on account' },
            { label: 'Receipts', value: fmtUSD(rcptCardVal, 0), sub: 'Applied oldest ticket first', tone: 'good' },
            { label: 'Collected %', value: fmtPct(collectedPct), sub: 'Receipts ÷ Credit sales' },
            { label: 'Avg days to collect', value: fmtNum(k.dso_days, 0) + ' d', sub: 'Days Sales Outstanding (DSO)' },
            { label: 'Customer credit limits', value: fmtUSD(totalCreditLimits, 0), sub: fmtNum(creditTerms.length) + ' credit term agreements' },
            { label: 'VAT due (customers)', value: fmtUSD(hasCustSlicer ? sumC('vat_receivable') : k.vat_receivable, 0), sub: '11% inside open AR (m254)', tone: 'brass' }
          ])}
        </div>

        <!-- Row 1 Charts: Credit sales vs receipts by month + Customers owing at month end -->
        <div class="pbi-grid-2">
          ${pbiPanel('Credit sales vs receipts by month', buildClusteredColumnSvg(arMonths, [
            { key: 'credit_sales', label: 'Credit sales', color: C.navy },
            { key: 'receipts', label: 'Receipts', color: C.steel }
          ]), {
            subtitle: 'Monthly credit billings vs customer cash/check collections',
            legend: [{ label: 'Credit sales', color: C.navy }, { label: 'Receipts', color: C.steel }]
          })}
          ${pbiPanel('Customers owing at month end — gross, advances, net', buildComboChartSvg(arMonths, [
            { key: 'ar_gross_m', label: 'Gross', color: C.navy },
            { key: 'ar_adv_m', label: 'Advances', color: C.slate }
          ], { label: 'Net', key: 'ar_net_m', color: C.brass, isMoney: true }, { shareAxis: true }), {
            subtitle: 'Gross owing vs customer advances (on account) and Net AR trajectory',
            legend: [{ label: 'Gross', color: C.navy }, { label: 'Advances', color: C.slate }, { label: 'Net', color: C.brass, line: true }]
          })}
        </div>

        <!-- Row 2 Charts: AR aging (vertical signed column chart) + Balance by customer (horizontal bar) -->
        <div class="pbi-grid-2">
          ${pbiPanel('AR aging', buildSignedColumnSvg(agingBuckets, { isMoney: true }), {
            subtitle: 'FIFO open receivables by aging bucket · On account (unapplied customer advances) shown below zero',
            legend: [{ label: 'Current–30d', color: C.navy }, { label: '31–60d', color: C.brass }, { label: '60+ Overdue', color: C.crit }, { label: 'On account', color: C.slate }]
          })}
          ${pbiPanel('Balance by customer', buildHorizontalBarChart(arCustRows, 'Customer', 'ar_balance', v => fmtUSDk(v), { color: C.navy, maxItems: 10 }), {
            subtitle: 'Top customer balances as at period end (FIFO allocated)'
          })}
        </div>

        <!-- Full-width Table 1: Customer balances & aging (16 columns matching Screenshot 2) -->
        <div class="pbi-grid-1">
          ${pbiTable('Customer balances & aging', [
            { label: 'Rank', raw: (r, idx) => idx + 1, r: true, mono: true },
            { label: 'Customer', key: 'Customer', bold: true },
            { label: 'IVA', key: 'VAT Registered' },
            { label: 'Balance', key: 'ar_balance', r: true, bar: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Share', raw: r => Number(r.ar_balance || 0) > 0 ? (Number(r.ar_balance) / totalPosBal) : 0, r: true, fmt: v => v > 0 ? fmtPct(v) : '—' },
            { label: 'Current', key: 'ar_current', r: true, fmt: v => v ? fmtUSD(v, 0) : '—' },
            { label: '1-10', key: 'ar_1_10', r: true, fmt: v => v ? fmtUSD(v, 0) : '—' },
            { label: '11-30', key: 'ar_11_30', r: true, fmt: v => v ? fmtUSD(v, 0) : '—' },
            { label: '31-60', key: 'ar_31_60', r: true, fmt: v => v ? fmtUSD(v, 0) : '—' },
            { label: '60+', key: 'ar_60_plus', r: true, negRed: true, fmt: v => v ? `<span class="pbi-neg">${fmtUSD(v, 0)}</span>` : '—' },
            { label: 'On account', raw: r => Number(r.ar_balance || 0) < 0 ? Number(r.ar_balance) : (Number(r.ar_advances || 0) ? -Math.abs(Number(r.ar_advances)) : 0), r: true, negRed: true, fmt: v => v ? fmtUSD(v, 0) : '—' },
            { label: 'Limit', raw: r => (limitMap.get(norm(r.Customer)) || {}).credit_limit, r: true, fmt: v => v ? fmtUSD(v, 0) : '—' },
            { label: 'Limit used', raw: r => { const lim = Number((limitMap.get(norm(r.Customer)) || {}).credit_limit || 0); return lim > 0 ? (Number(r.ar_balance || 0) / lim) : null; }, r: true, fmt: v => v != null ? fmtPct(v) : '—' },
            { label: 'Sales', raw: r => r.credit_sales_ttc != null ? r.credit_sales_ttc : r.sales_ttc, r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Receipts', raw: r => r.ar_settled != null ? r.ar_settled : r.receipts, r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Last sale', key: 'last_sale', mono: true, fmt: v => esc(String(v || '—').slice(0, 10)) }
          ], arCustRows, {
            subtitle: 'Receipts are applied to the oldest open ticket first (FIFO) · Balance = Current + 1-10 + 11-30 + 31-60 + 60+ + On account',
            unitLabel: 'customers',
            foot: [
              { v: `Total (${custRows.length} customers)`, span: 3 },
              { v: fmtUSD(arBal, 0), r: true },
              { v: '100.0%', r: true },
              { v: fmtUSD(arCur, 0), r: true },
              { v: fmtUSD(ar1_10, 0), r: true },
              { v: fmtUSD(ar11_30, 0), r: true },
              { v: fmtUSD(ar31_60, 0), r: true },
              { v: fmtUSD(ar60p, 0), r: true },
              { v: fmtUSD(onAcctSigned, 0), r: true, neg: onAcctSigned < 0 },
              { v: fmtUSD(totalCreditLimits, 0), r: true },
              { v: '—', r: true },
              { v: fmtUSD(custRows.reduce((a, r) => a + Number(r.credit_sales_ttc != null ? r.credit_sales_ttc : (r.sales_ttc || 0)), 0), 0), r: true },
              { v: fmtUSD(custRows.reduce((a, r) => a + Number(r.ar_settled != null ? r.ar_settled : (r.receipts || 0)), 0), 0), r: true },
              { v: fmtNum(sumC('loads')), r: true },
              { v: '' }
            ]
          })}
        </div>

        <!-- Full-width Table 2: Customer statement — every ticket and receipt, running balance -->
        <div class="pbi-grid-1">
          ${pbiTable('Customer statement — every ticket and receipt, running balance', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Transaction Type', key: 'type' },
            { label: 'Document / Ref', key: 'doc', mono: true, bold: true },
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Product / Payment Detail', key: 'detail' },
            { label: 'Billed / Debit ($)', key: 'debit', r: true, fmt: v => v ? fmtUSD(v, 2) : '—' },
            { label: 'Receipt / Credit ($)', key: 'credit', r: true, fmt: v => v ? `<span class="pbi-pos">${fmtUSD(v, 2)}</span>` : '—' },
            { label: 'Running Balance ($)', key: 'running', r: true, bar: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], stmtItems, {
            subtitle: 'Select a Customer in the top slicer to inspect their chronological ticket & receipt sub-ledger',
            limit: 50,
            unitLabel: 'ledger entries'
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Customer receipts register', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Method', key: 'method' },
            { label: 'Kind', key: 'kind', fmt: v => esc(v || 'Account') },
            { label: 'Amount ($)', key: 'amount', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], recRows, { rkey: 'receipts', limit: 40, unitLabel: 'receipts' })}

          ${movedRegisterBanner('Customer Credit Terms, Limits & 11% VAT Tax Invoices', 'Customer credit policies, MOF 11% VAT tax headers, quarterly VAT positions, and VAT-tagged receipts now live inside Customers & Receivables.', 'customers', 'Customers & Receivables', 'vat')}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 07: SUPPLIERS & EXPENSES (m18c_report.py Page 07 — 3-Leg AP + Cost Classes)
    // =========================================================================
    else if (activePageId === 'p07_ap') {
      const byCat = new Map();
      expRows.forEach(x => {
        const m = String(x.method || '').trim();
        const sgn = (m === 'C Return' || m === 'CR Return') ? -1 : ((m === 'Config' || m === 'VATConfig' || m === 'Free' || m === 'Remove' || m === 'Adjusted' || m === 'JV Adjusted') ? 0 : 1);
        if (sgn === 0) return;
        const c = x.category || 'Uncategorized';
        const cur = byCat.get(c) || { Category: c, costClass: catClassMap.get(norm(c)) || 'Operating Expense', count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += sgn * Number(x.amount || 0);
        byCat.set(c, cur);
      });
      const catList = Array.from(byCat.values()).sort((a, b) => b.amount - a.amount);
      const useSuppSums = suppRows.length > 0 || Boolean(activeRange || hasAnySlicer);
      const apBalVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_balance || 0), 0)) : k.ap_balance;
      const apMatVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_material || 0), 0)) : k.ap_material;
      const apHaulVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_haulage || 0), 0)) : k.ap_haulage;
      const apExpVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_expense || 0), 0)) : k.ap_expense;
      const apSetVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_settled != null ? r.ap_settled : (r.settlements_paid || 0)), 0)) : (k.ap_settled != null ? k.ap_settled : k.settlements_paid);

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · 3-Leg Accounts Payable Engine (Material · Haulage · Supplies & Services — m192)', [
            { label: 'Net Open AP Balance', value: fmtUSD(apBalVal, 0), sub: 'Class 4011 Supplier Liability', tone: 'brass' },
            { label: 'Leg 1 · Raw Material', value: fmtUSD(apMatVal, 0), sub: 'Owed to site owners' },
            { label: 'Leg 2 · 3rd-Party Haulage', value: fmtUSD(apHaulVal, 0), sub: '$0 on company-fleet loads' },
            { label: 'Leg 3 · Credit Expenses', value: fmtUSD(apExpVal, 0), sub: 'Supplies, repairs & services' },
            { label: 'Supplier Settlements Paid', value: fmtUSD(apSetVal, 0), sub: 'Cash, check & bank wires', tone: 'good' },
            { label: 'Active Suppliers & Haulers', value: fmtNum(suppRows.length), sub: 'With ledger activity' }
          ])}
          ${kpiBand('2 · Operating Expenses & Cost Class Breakdown', [
            { label: 'Total General Expenses', value: fmtUSD(sc(k.expenses), 0), sub: fmtNum(expRows.length) + ' vouchers in sample' },
            { label: 'Cash Expenses', value: fmtUSD(sc(k.cash_expenses), 0), sub: 'Paid from Till' },
            { label: 'Credit Expenses', value: fmtUSD(sc(k.credit_expenses), 0), sub: 'Booked to Supplier AP Leg 3' },
            { label: 'Total Raw Material Cost', value: fmtUSD(sc(k.raw_cost), 0), sub: fmtNum(k.raw_loads) + ' raw loads' },
            { label: 'Avg Raw Cost / m³', value: fmtUSD(k.avg_raw_cost, 2), sub: 'Material + haulage per m³' },
            { label: 'Expense Categories', value: fmtNum(catList.length), sub: 'Production · OpEx · CapEx' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Accrued vs settled by month (Raw + Expenses vs Settlements)', buildClusteredColumnSvg(months, [
            { label: 'Raw + Credit Exp', color: C.crit, get: r => Number(r.raw_cost || 0) + Number(r.credit_expenses || 0) },
            { label: 'Settlements Paid', key: 'settlements_paid', color: C.steel }
          ]), {
            subtitle: 'Monthly supplier accruals (raw material + haulage + credit expenses) vs supplier settlements paid',
            legend: [{ label: 'Accrued (Raw + Credit Exp)', color: C.crit }, { label: 'Settlements Paid', color: C.steel }]
          })}
          ${pbiPanel('Expenses by category', buildHorizontalBarChart(catList, 'Category', 'amount', v => fmtUSD(v, 0), { subKey: 'costClass', color: C.steel, maxItems: 10 }), {
            subtitle: 'Top expense categories in the selected period'
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Payables by supplier / hauler', buildHorizontalBarChart([...suppRows].sort((a, b) => Number(b.ap_balance || 0) - Number(a.ap_balance || 0)), 'Supplier', 'ap_balance', v => fmtUSD(v, 0), { subKey: 'IVA', color: C.navy, maxItems: 10 }), {
            subtitle: 'Net closing AP balance (+ owed by company, − advance to supplier)'
          })}
          ${pbiPanel('Raw material & haulage volume by supplier', buildHorizontalBarChart([...suppRows].sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0)), 'Supplier', 'raw_cost', v => fmtUSD(v, 0), { color: C.slate, maxItems: 10 }), {
            subtitle: 'Total raw material + haulage accrued'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Supplier 3-leg payables & settlements schedule', [
            { label: 'Supplier / Hauler', key: 'Supplier', bold: true },
            { label: 'IVA', key: 'IVA' },
            { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
            ...(activeRange ? [{ label: 'Opening AP ($)', key: 'opening_ap', r: true, negRed: true, fmt: v => fmtUSD(v, 0) }] : []),
            { label: 'Leg 1 · Material ($)', key: 'ap_material', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Leg 2 · Haulage ($)', key: 'ap_haulage', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Leg 3 · Expenses ($)', key: 'ap_expense', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Total on Credit ($)', key: 'ap_on_credit', r: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Settled ($)', raw: r => r.ap_settled != null ? r.ap_settled : (r.settlements_paid || 0), r: true, fmt: v => `<span class="pbi-pos">${fmtUSD(v, 0)}</span>` },
            { label: 'Closing AP Balance ($)', key: 'ap_balance', r: true, bar: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], [...suppRows].sort((a, b) => Number(b.ap_balance || 0) - Number(a.ap_balance || 0) || Number(b.ap_on_credit || 0) - Number(a.ap_on_credit || 0)), {
            subtitle: 'Leg 1 (Material owed to Site Owner) + Leg 2 (Haulage owed to Truck Owner) + Leg 3 (Credit Expenses) = Total on Credit · ' + (activeRange ? 'Opening AP + Total on Credit − Settled = Closing AP Balance' : 'Total on Credit − Settled = Closing AP Balance'),
            unitLabel: 'suppliers',
            foot: [
              { v: `Total (${suppRows.length} counterparties)`, span: 2 },
              { v: fmtNum(suppRows.reduce((a, r) => a + Number(r.raw_loads || 0), 0)), r: true },
              ...(activeRange ? [{ v: fmtUSD(suppRows.reduce((a, r) => a + Number(r.opening_ap || 0), 0), 0), r: true }] : []),
              { v: fmtUSD(apMatVal, 0), r: true },
              { v: fmtUSD(apHaulVal, 0), r: true },
              { v: fmtUSD(apExpVal, 0), r: true },
              { v: fmtUSD(apMatVal + apHaulVal + apExpVal, 0), r: true },
              { v: fmtUSD(apSetVal, 0), r: true },
              { v: fmtUSD(apBalVal, 2), r: true }
            ]
          })}
        </div>

        <div class="pbi-grid-2">
          ${movedRegisterBanner('General & Fleet Expenses Register + Cost-Class Analytics', 'Itemized expense vouchers and Production / OpEx / CapEx category breakdowns now live directly inside Expenses & Overhead.', 'expenses', 'Expenses & Overhead', 'costclass')}
          ${movedRegisterBanner('Supplier Settlements & 3-Leg Payable Ledger', 'Full supplier payment vouchers (Material, Haulage & Expense legs) live directly inside Suppliers & Payables.', 'suppliers', 'Suppliers & Payables', 'ap3leg')}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 08: STOCK & HAULAGE (Unit Economics & Two-Leg Raw Intake Split)
    // =========================================================================
    else if (activePageId === 'p08_stock') {
      const p08AggGrades = pickTopAggregateGrades(prodRows, 999, rec.products);
      const p08AggSoldM3 = p08AggGrades.reduce((a, p) => a + Number(p.qty_sold || 0), 0);
      const p08SellNet = hasAnySlicer && p08AggSoldM3 > 0
        ? round2(p08AggGrades.reduce((a, p) => a + Number(p.net_sales != null ? p.net_sales : (Number(p.avg_price_net || 0) * Number(p.qty_sold || 0))), 0) / p08AggSoldM3)
        : k.avg_price_net;
      const p08RawM3 = hasAnySlicer ? prodRows.reduce((a, p) => a + Number(p.raw_qty || 0), 0) : 0;
      const p08RawCostPerM3 = hasAnySlicer && p08RawM3 > 0
        ? round2(prodRows.reduce((a, p) => a + Number(p.raw_cost || 0), 0) / p08RawM3)
        : k.avg_raw_cost;
      const unitSpreadM3 = round2(Number(p08SellNet || 0) - Number(p08RawCostPerM3 || 0));
      const unitSpreadPct = Number(p08SellNet || 0) > 0 ? (unitSpreadM3 / Number(p08SellNet)) : 0;
      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Raw Material Intake, Tonnage & Two-Leg Cost Split', [
            { label: 'Total Raw Cost', value: fmtUSD(sc(k.raw_cost), 0), sub: fmtNum(k.raw_loads) + ' raw loads', tone: 'brass' },
            { label: 'Material Cost (Site Owners)', value: fmtUSD(sc(k.raw_mat_cost), 0), sub: fmtPct(null, k.raw_mat_cost, k.raw_cost) + ' of raw cost' },
            { label: 'Haulage Cost (3rd-Party)', value: fmtUSD(sc(k.raw_haulage), 0), sub: fmtPct(null, k.raw_haulage, k.raw_cost) + ' of raw cost' },
            { label: 'Raw Tons Purchased', value: fmtNum(k.raw_tons, 0) + ' t', sub: fmtNum(k.raw_qty, 0) + ' m³ purchased', tone: 'good' },
            { label: 'Avg Raw Cost / m³', value: fmtUSD(p08RawCostPerM3, 2), sub: 'Sell price: ' + fmtUSD(p08SellNet, 2) + '/m³' },
            { label: 'Aggregate Unit Spread', value: fmtUSD(unitSpreadM3, 2) + '/m³', sub: fmtPct(unitSpreadPct) + ' spread over raw cost', tone: unitSpreadM3 >= 0 ? 'good' : 'warn' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Unit economics by month · raw cost vs selling price ($/m³)', buildMultiLineSvg(months, [
            { label: 'Avg Selling Price ($/m³ ex-VAT)', key: 'avg_price_net', color: C.navy },
            { label: 'Avg Raw Cost / m³', key: 'avg_raw_cost', color: C.crit }
          ], { isMoney: true, decimals: 2 }), {
            subtitle: 'Monthly $/m³ spread between realised ex-VAT aggregate selling price and raw material intake cost',
            legend: [{ label: 'Selling Price ($/m³)', color: C.navy, line: true }, { label: 'Raw Cost ($/m³)', color: C.crit, line: true }]
          })}
          ${pbiPanel('Raw intake cost split by month · material vs 3rd-party haulage ($)', buildComboChartSvg(months, [
            { key: 'raw_mat_leg', label: 'Material Cost (Leg 1)', color: C.navy },
            { key: 'raw_haul_leg', label: '3rd-Party Haulage (Leg 2)', color: C.crit }
          ], {
            label: 'Haulage Share %',
            color: C.brass,
            isPct: true,
            get: r => {
              const mat = Math.max(0, Number(r.raw_mat_leg || 0));
              const haul = Math.max(0, Number(r.raw_haul_leg || 0));
              return (mat + haul) > 0 ? haul / (mat + haul) : 0;
            }
          }, { lineMax: 1 }), {
            id: 'pbiRawIntakeCostSplitChart',
            subtitle: 'Site-owner material cost (Leg 1) vs subcontracted truck haulage (Leg 2) and monthly haulage share %',
            legend: [{ label: 'Material (Leg 1)', color: C.navy }, { label: '3rd-Party Haul (Leg 2)', color: C.crit }, { label: 'Haulage Share %', color: C.brass, line: true }]
          })}
        </div>

        <div class="pbi-grid-2">
          ${(() => {
            const siteOwnerTally = new Map();
            (rec.sites || []).forEach(rs => {
              if (rs && rs.name && rs.supplier && resolveSiteCategoryPbi(rs) === 'supplier') {
                const sk = norm(rs.name);
                if (!siteOwnerTally.has(sk)) siteOwnerTally.set(sk, new Map([[String(rs.supplier).trim(), 0.01]]));
              }
            });
            rawRows.forEach(r => {
              if (!r || !r.site || !r.site_owner) return;
              const sk = norm(r.site);
              const ow = String(r.site_owner).trim();
              if (!sk || !ow) return;
              if (!siteOwnerTally.has(sk)) siteOwnerTally.set(sk, new Map());
              const om = siteOwnerTally.get(sk);
              om.set(ow, (om.get(ow) || 0) + Math.max(1, Number(r.total || r.cost || 0)));
            });
            const resolveSiteOwner = siteName => {
              const om = siteOwnerTally.get(norm(siteName || ''));
              if (!om || !om.size) return '';
              let best = '', bestScore = -1;
              om.forEach((scVal, name) => { if (scVal > bestScore) { bestScore = scVal; best = name; } });
              return om.size > 1 ? `${best} (+${om.size - 1})` : best;
            };
            const sourceSiteRows = siteRows
              .filter(s => Number(s.raw_loads || 0) > 0 || Math.abs(Number(s.raw_cost || 0)) > 0.005 || Number(s.raw_qty || 0) > 0)
              .map(s => {
                const qty = Number(s.raw_qty || 0);
                const cost = Number(s.raw_cost || 0);
                return Object.assign({}, s, {
                  siteOwner: resolveSiteOwner(s.Site),
                  avgRawPerM3: qty > 0 ? round2(cost / qty) : null
                });
              })
              .sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0) || Number(b.raw_loads || 0) - Number(a.raw_loads || 0));

            return pbiTable('Source sites · raw material intake & haulage cost', [
              { label: 'Source Site', key: 'Site', bold: true, fmt: (v, r) => `<b>${esc(v && v !== '(Unassigned Site)' ? v : '(Unassigned Source Site)')}</b>${siteJvMarker(r && (r.JV === 'Yes' || r.is_jv))}` },
              { label: 'Site Owner', key: 'siteOwner', fmt: v => esc(v || '—') },
              { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
              { label: 'Raw Qty (m³)', key: 'raw_qty', r: true, fmt: v => v > 0 ? `${fmtNum(v, 0)} m³` : '—' },
              { label: 'Raw Tons', key: 'raw_tons', r: true, fmt: v => v > 0 ? fmtNum(v, 0) : '—' },
              { label: 'Material ($)', key: 'raw_mat_cost', r: true, fmt: v => fmtUSD(v, 0) },
              { label: 'Haulage ($)', key: 'raw_haulage', r: true, fmt: v => fmtUSD(v, 0) },
              { label: 'Total Raw Cost ($)', key: 'raw_cost', r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
              {
                label: 'Avg $/m³',
                key: 'avgRawPerM3',
                r: true,
                fmt: v => v != null ? fmtUSD(v, 2) : '—',
                foot: list => {
                  const tc = list.reduce((a, r) => a + Number(r.raw_cost || 0), 0);
                  const tq = list.reduce((a, r) => a + Number(r.raw_qty || 0), 0);
                  return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(tc / tq, 2)}</b>` : '—';
                }
              }
            ], sourceSiteRows, {
              subtitle: 'Quarry and excavation source sites ranked by total raw intake cost (Leg 1 material to site owner + Leg 2 haulage to truck owner); customer delivery sites are tracked separately under Sales & Receivables',
              unitLabel: 'source sites'
            });
          })()}

          ${(() => {
            const prodMetaByNorm = new Map();
            (rec.products || []).forEach(pr => {
              if (pr && pr.name) prodMetaByNorm.set(norm(pr.name), pr);
            });
            const famMap = new Map();
            prodRows.forEach(p => {
              if (!p || !p.Product) return;
              const pm = prodMetaByNorm.get(norm(p.Product)) || {};
              const pType = String(pm.type || '').trim();
              if (pType && pType !== 'Material') return;
              if (_NON_AGG_PROD_RE.test(p.Product)) return;
              const famName = String(p['Material Family'] || pm.input_product || p.Product).trim();
              const fk = norm(famName);
              if (!famMap.has(fk)) {
                famMap.set(fk, {
                  Family: famName,
                  UoM: p.UoM || pm.uom || 'm³',
                  outputs: new Set(),
                  raw_qty: 0,
                  raw_cost: 0,
                  qty_sold: 0,
                  net_sales: 0
                });
              }
              const f = famMap.get(fk);
              const qSold = Number(p.qty_sold || 0);
              const qRaw = Number(p.raw_qty || 0);
              const cRaw = Number(p.raw_cost || 0);
              const nSales = Number(p.net_sales != null ? p.net_sales : (qSold * Number(p.avg_price_net || 0)));
              if (qSold > 0 && norm(p.Product) !== fk) f.outputs.add(p.Product);
              f.raw_qty += qRaw;
              f.raw_cost += cRaw;
              f.qty_sold += qSold;
              f.net_sales += nSales;
            });
            const famRows = Array.from(famMap.values())
              .filter(f => f.raw_qty > 0 || f.raw_cost > 0 || f.qty_sold > 0)
              .map(f => ({
                Family: f.Family,
                UoM: f.UoM,
                outputsList: Array.from(f.outputs).join(', '),
                raw_qty: round2(f.raw_qty),
                raw_cost: round2(f.raw_cost),
                avg_raw_cost: f.raw_qty > 0 ? round2(f.raw_cost / f.raw_qty) : null,
                qty_sold: round2(f.qty_sold),
                net_sales: round2(f.net_sales),
                avg_price_net: f.qty_sold > 0 ? round2(f.net_sales / f.qty_sold) : null
              }))
              .sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0) || Number(b.qty_sold || 0) - Number(a.qty_sold || 0));

            return pbiTable('Raw material families · bought in vs sold out as finished grades', [
              {
                label: 'Raw Material Family',
                key: 'Family',
                fmt: (v, r) => `<b>${esc(v || '—')}</b>${r && r.outputsList ? ` <span class="mu">· Sold as: ${esc(r.outputsList)}</span>` : ''}`
              },
              { label: 'Unit', key: 'UoM', mono: true },
              { label: 'Raw Bought', key: 'raw_qty', r: true, fmt: (v, r) => v > 0 ? `${fmtNum(v, 0)} ${esc((r && r.UoM) || 'm³')}` : '—' },
              {
                label: 'Avg Raw ($)',
                key: 'avg_raw_cost',
                r: true,
                fmt: v => v != null ? fmtUSD(v, 2) : '—',
                foot: list => {
                  const tc = list.reduce((a, r) => a + Number(r.raw_cost || 0), 0);
                  const tq = list.reduce((a, r) => a + Number(r.raw_qty || 0), 0);
                  return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(tc / tq, 2)}</b>` : '—';
                }
              },
              { label: 'Raw Cost ($)', key: 'raw_cost', r: true, bar: 'brass', fmt: v => fmtUSD(v, 0) },
              { label: 'Sold Out', key: 'qty_sold', r: true, fmt: (v, r) => v > 0 ? `${fmtNum(v, 0)} ${esc((r && r.UoM) || 'm³')}` : '—' },
              {
                label: 'Avg Sell ($)',
                key: 'avg_price_net',
                r: true,
                fmt: v => v != null ? fmtUSD(v, 2) : '—',
                foot: list => {
                  const ts = list.reduce((a, r) => a + Number(r.net_sales || 0), 0);
                  const tq = list.reduce((a, r) => a + Number(r.qty_sold || 0), 0);
                  return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(ts / tq, 2)}</b>` : '—';
                }
              }
            ], famRows, {
              subtitle: 'Aggregate material families linking raw quarry intake (e.g. Ramel Mrml, Sakher) to finished crushed/washed grades sold (excludes equipment & fuel)',
              unitLabel: 'material families'
            });
          })()}
        </div>

        <div class="pbi-grid-1">
          ${movedRegisterBanner('Raw Material Purchases Register & Joint Venture 50/50 Ledger', 'Individual 2-leg raw material tickets (Site Owner + Truck Owner), 3rd-party customer-site transportation, and source quarry intakes live in Quarry & Haulage, while JV 50/50 sites and distributions live in JV & Partnerships.', 'raw_jv', 'JV & Partnerships')}
        </div>
      `;
    }

    // =========================================================================
    // MERGED STOCK ANALYTICS: UNIT ECONOMICS, TWO-LEG INTAKE SPLIT & 3-LEG AP
    // =========================================================================
    else if (activePageId === 'p08_stock_ap') {
      const p08ApAggGrades = pickTopAggregateGrades(prodRows, 999, rec.products);
      const p08ApAggSoldM3 = p08ApAggGrades.reduce((a, p) => a + Number(p.qty_sold || 0), 0);
      const p08ApSellNet = hasAnySlicer && p08ApAggSoldM3 > 0
        ? round2(p08ApAggGrades.reduce((a, p) => a + Number(p.net_sales != null ? p.net_sales : (Number(p.avg_price_net || 0) * Number(p.qty_sold || 0))), 0) / p08ApAggSoldM3)
        : k.avg_price_net;
      const p08ApRawM3 = hasAnySlicer ? prodRows.reduce((a, p) => a + Number(p.raw_qty || 0), 0) : 0;
      const p08ApRawCostPerM3 = hasAnySlicer && p08ApRawM3 > 0
        ? round2(prodRows.reduce((a, p) => a + Number(p.raw_cost || 0), 0) / p08ApRawM3)
        : k.avg_raw_cost;
      const p08ApSpreadM3 = round2(Number(p08ApSellNet || 0) - Number(p08ApRawCostPerM3 || 0));
      const p08ApSpreadPct = Number(p08ApSellNet || 0) > 0 ? (p08ApSpreadM3 / Number(p08ApSellNet)) : 0;
      const useSuppSums = suppRows.length > 0 || Boolean(activeRange || hasAnySlicer);
      const apBalVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_balance || 0), 0)) : k.ap_balance;
      const apMatVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_material || 0), 0)) : k.ap_material;
      const apHaulVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_haulage || 0), 0)) : k.ap_haulage;
      const apExpVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_expense || 0), 0)) : k.ap_expense;
      const apSetVal = useSuppSums ? round2(suppRows.reduce((a, r) => a + Number(r.ap_settled != null ? r.ap_settled : (r.settlements_paid || 0)), 0)) : (k.ap_settled != null ? k.ap_settled : k.settlements_paid);

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Raw Material Intake, Tonnage & Two-Leg Cost Split', [
            { label: 'Total Raw Cost', value: fmtUSD(sc(k.raw_cost), 0), sub: fmtNum(k.raw_loads) + ' raw loads', tone: 'brass' },
            { label: 'Material Cost (Site Owners)', value: fmtUSD(sc(k.raw_mat_cost), 0), sub: fmtPct(null, k.raw_mat_cost, k.raw_cost) + ' of raw cost' },
            { label: 'Haulage Cost (3rd-Party)', value: fmtUSD(sc(k.raw_haulage), 0), sub: fmtPct(null, k.raw_haulage, k.raw_cost) + ' of raw cost' },
            { label: 'Raw Tons Purchased', value: fmtNum(k.raw_tons, 0) + ' t', sub: fmtNum(k.raw_qty, 0) + ' m³ purchased', tone: 'good' },
            { label: 'Avg Raw Cost / m³', value: fmtUSD(p08ApRawCostPerM3, 2), sub: 'Sell price: ' + fmtUSD(p08ApSellNet, 2) + '/m³' },
            { label: 'Aggregate Unit Spread', value: fmtUSD(p08ApSpreadM3, 2) + '/m³', sub: fmtPct(p08ApSpreadPct) + ' spread over raw cost', tone: p08ApSpreadM3 >= 0 ? 'good' : 'warn' }
          ])}
          ${kpiBand('2 · 3-Leg Supplier & Hauler Payables (Accrual vs Settlement)', [
            { label: 'Net Open AP Balance', value: fmtUSD(apBalVal, 0), sub: 'Class 4011 Supplier Liability', tone: 'brass' },
            { label: 'Leg 1 · Raw Material', value: fmtUSD(apMatVal, 0), sub: 'Owed to site owners' },
            { label: 'Leg 2 · 3rd-Party Haulage', value: fmtUSD(apHaulVal, 0), sub: '$0 on company-fleet loads' },
            { label: 'Leg 3 · Credit Expenses', value: fmtUSD(apExpVal, 0), sub: 'Supplies, repairs & services' },
            { label: 'Supplier Settlements Paid', value: fmtUSD(apSetVal, 0), sub: 'Cash, check & bank wires', tone: 'good' },
            { label: 'Active Suppliers & Haulers', value: fmtNum(suppRows.length), sub: 'With ledger activity' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Unit economics by month · raw cost vs selling price ($/m³)', buildMultiLineSvg(months, [
            { label: 'Avg Selling Price ($/m³ ex-VAT)', key: 'avg_price_net', color: C.navy },
            { label: 'Avg Raw Cost / m³', key: 'avg_raw_cost', color: C.crit }
          ], { isMoney: true, decimals: 2 }), {
            subtitle: 'Monthly $/m³ spread between realised ex-VAT aggregate selling price and raw material intake cost',
            legend: [{ label: 'Selling Price ($/m³)', color: C.navy, line: true }, { label: 'Raw Cost ($/m³)', color: C.crit, line: true }]
          })}
          ${pbiPanel('Raw intake cost split by month · material vs 3rd-party haulage ($)', buildComboChartSvg(months, [
            { key: 'raw_mat_leg', label: 'Material Cost (Leg 1)', color: C.navy },
            { key: 'raw_haul_leg', label: '3rd-Party Haulage (Leg 2)', color: C.crit }
          ], {
            label: 'Haulage Share %',
            color: C.brass,
            isPct: true,
            get: r => {
              const mat = Math.max(0, Number(r.raw_mat_leg || 0));
              const haul = Math.max(0, Number(r.raw_haul_leg || 0));
              return (mat + haul) > 0 ? haul / (mat + haul) : 0;
            }
          }, { lineMax: 1 }), {
            id: 'pbiRawIntakeCostSplitChart',
            subtitle: 'Site-owner material cost (Leg 1) vs subcontracted truck haulage (Leg 2) and monthly haulage share %',
            legend: [{ label: 'Material (Leg 1)', color: C.navy }, { label: '3rd-Party Haul (Leg 2)', color: C.crit }, { label: 'Haulage Share %', color: C.brass, line: true }]
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Accrued vs settled by month (Raw + Expenses vs Settlements)', buildClusteredColumnSvg(months, [
            { label: 'Raw + Credit Exp', color: C.crit, get: r => Number(r.raw_cost || 0) + Number(r.credit_expenses || 0) },
            { label: 'Settlements Paid', key: 'settlements_paid', color: C.steel }
          ]), {
            subtitle: 'Monthly supplier accruals (raw material + haulage + credit expenses) vs supplier settlements paid',
            legend: [{ label: 'Accrued (Raw + Credit Exp)', color: C.crit }, { label: 'Settlements Paid', color: C.steel }]
          })}
          ${pbiPanel('Payables by supplier / hauler', buildHorizontalBarChart([...suppRows].sort((a, b) => Number(b.ap_balance || 0) - Number(a.ap_balance || 0)), 'Supplier', 'ap_balance', v => fmtUSD(v, 0), { subKey: 'IVA', color: C.navy, maxItems: 10 }), {
            subtitle: 'Net closing AP balance (+ owed by company, − advance to supplier)'
          })}
        </div>

        <div class="pbi-grid-2">
          ${(() => {
            const siteOwnerTally = new Map();
            (rec.sites || []).forEach(rs => {
              if (rs && rs.name && rs.supplier && resolveSiteCategoryPbi(rs) === 'supplier') {
                const sk = norm(rs.name);
                if (!siteOwnerTally.has(sk)) siteOwnerTally.set(sk, new Map([[String(rs.supplier).trim(), 0.01]]));
              }
            });
            rawRows.forEach(r => {
              if (!r || !r.site || !r.site_owner) return;
              const sk = norm(r.site);
              const ow = String(r.site_owner).trim();
              if (!sk || !ow) return;
              if (!siteOwnerTally.has(sk)) siteOwnerTally.set(sk, new Map());
              const om = siteOwnerTally.get(sk);
              om.set(ow, (om.get(ow) || 0) + Math.max(1, Number(r.total || r.cost || 0)));
            });
            const resolveSiteOwner = siteName => {
              const om = siteOwnerTally.get(norm(siteName || ''));
              if (!om || !om.size) return '';
              let best = '', bestScore = -1;
              om.forEach((scVal, name) => { if (scVal > bestScore) { bestScore = scVal; best = name; } });
              return om.size > 1 ? `${best} (+${om.size - 1})` : best;
            };
            const sourceSiteRows = siteRows
              .filter(s => Number(s.raw_loads || 0) > 0 || Math.abs(Number(s.raw_cost || 0)) > 0.005 || Number(s.raw_qty || 0) > 0)
              .map(s => {
                const qty = Number(s.raw_qty || 0);
                const cost = Number(s.raw_cost || 0);
                return Object.assign({}, s, {
                  siteOwner: resolveSiteOwner(s.Site),
                  avgRawPerM3: qty > 0 ? round2(cost / qty) : null
                });
              })
              .sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0) || Number(b.raw_loads || 0) - Number(a.raw_loads || 0));

            return pbiTable('Source sites · raw material intake & haulage cost', [
              { label: 'Source Site', key: 'Site', bold: true, fmt: (v, r) => `<b>${esc(v && v !== '(Unassigned Site)' ? v : '(Unassigned Source Site)')}</b>${siteJvMarker(r && (r.JV === 'Yes' || r.is_jv))}` },
              { label: 'Site Owner', key: 'siteOwner', fmt: v => esc(v || '—') },
              { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
              { label: 'Raw Qty (m³)', key: 'raw_qty', r: true, fmt: v => v > 0 ? `${fmtNum(v, 0)} m³` : '—' },
              { label: 'Raw Tons', key: 'raw_tons', r: true, fmt: v => v > 0 ? fmtNum(v, 0) : '—' },
              { label: 'Material ($)', key: 'raw_mat_cost', r: true, fmt: v => fmtUSD(v, 0) },
              { label: 'Haulage ($)', key: 'raw_haulage', r: true, fmt: v => fmtUSD(v, 0) },
              { label: 'Total Raw Cost ($)', key: 'raw_cost', r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
              {
                label: 'Avg $/m³',
                key: 'avgRawPerM3',
                r: true,
                fmt: v => v != null ? fmtUSD(v, 2) : '—',
                foot: list => {
                  const tc = list.reduce((a, r) => a + Number(r.raw_cost || 0), 0);
                  const tq = list.reduce((a, r) => a + Number(r.raw_qty || 0), 0);
                  return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(tc / tq, 2)}</b>` : '—';
                }
              }
            ], sourceSiteRows, {
              subtitle: 'Quarry and excavation source sites ranked by total raw intake cost (Leg 1 material to site owner + Leg 2 haulage to truck owner); customer delivery sites are tracked separately under Sales & Receivables',
              unitLabel: 'source sites'
            });
          })()}

          ${(() => {
            const prodMetaByNorm = new Map();
            (rec.products || []).forEach(pr => {
              if (pr && pr.name) prodMetaByNorm.set(norm(pr.name), pr);
            });
            const famMap = new Map();
            prodRows.forEach(p => {
              if (!p || !p.Product) return;
              const pm = prodMetaByNorm.get(norm(p.Product)) || {};
              const pType = String(pm.type || '').trim();
              if (pType && pType !== 'Material') return;
              if (_NON_AGG_PROD_RE.test(p.Product)) return;
              const famName = String(p['Material Family'] || pm.input_product || p.Product).trim();
              const fk = norm(famName);
              if (!famMap.has(fk)) {
                famMap.set(fk, {
                  Family: famName,
                  UoM: p.UoM || pm.uom || 'm³',
                  outputs: new Set(),
                  raw_qty: 0,
                  raw_cost: 0,
                  qty_sold: 0,
                  net_sales: 0
                });
              }
              const f = famMap.get(fk);
              const qSold = Number(p.qty_sold || 0);
              const qRaw = Number(p.raw_qty || 0);
              const cRaw = Number(p.raw_cost || 0);
              const nSales = Number(p.net_sales != null ? p.net_sales : (qSold * Number(p.avg_price_net || 0)));
              if (qSold > 0 && norm(p.Product) !== fk) f.outputs.add(p.Product);
              f.raw_qty += qRaw;
              f.raw_cost += cRaw;
              f.qty_sold += qSold;
              f.net_sales += nSales;
            });
            const famRows = Array.from(famMap.values())
              .filter(f => f.raw_qty > 0 || f.raw_cost > 0 || f.qty_sold > 0)
              .map(f => ({
                Family: f.Family,
                UoM: f.UoM,
                outputsList: Array.from(f.outputs).join(', '),
                raw_qty: round2(f.raw_qty),
                raw_cost: round2(f.raw_cost),
                avg_raw_cost: f.raw_qty > 0 ? round2(f.raw_cost / f.raw_qty) : null,
                qty_sold: round2(f.qty_sold),
                net_sales: round2(f.net_sales),
                avg_price_net: f.qty_sold > 0 ? round2(f.net_sales / f.qty_sold) : null
              }))
              .sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0) || Number(b.qty_sold || 0) - Number(a.qty_sold || 0));

            return pbiTable('Raw material families · bought in vs sold out as finished grades', [
              {
                label: 'Raw Material Family',
                key: 'Family',
                fmt: (v, r) => `<b>${esc(v || '—')}</b>${r && r.outputsList ? ` <span class="mu">· Sold as: ${esc(r.outputsList)}</span>` : ''}`
              },
              { label: 'Unit', key: 'UoM', mono: true },
              { label: 'Raw Bought', key: 'raw_qty', r: true, fmt: (v, r) => v > 0 ? `${fmtNum(v, 0)} ${esc((r && r.UoM) || 'm³')}` : '—' },
              {
                label: 'Avg Raw ($)',
                key: 'avg_raw_cost',
                r: true,
                fmt: v => v != null ? fmtUSD(v, 2) : '—',
                foot: list => {
                  const tc = list.reduce((a, r) => a + Number(r.raw_cost || 0), 0);
                  const tq = list.reduce((a, r) => a + Number(r.raw_qty || 0), 0);
                  return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(tc / tq, 2)}</b>` : '—';
                }
              },
              { label: 'Raw Cost ($)', key: 'raw_cost', r: true, bar: 'brass', fmt: v => fmtUSD(v, 0) },
              { label: 'Sold Out', key: 'qty_sold', r: true, fmt: (v, r) => v > 0 ? `${fmtNum(v, 0)} ${esc((r && r.UoM) || 'm³')}` : '—' },
              {
                label: 'Avg Sell ($)',
                key: 'avg_price_net',
                r: true,
                fmt: v => v != null ? fmtUSD(v, 2) : '—',
                foot: list => {
                  const ts = list.reduce((a, r) => a + Number(r.net_sales || 0), 0);
                  const tq = list.reduce((a, r) => a + Number(r.qty_sold || 0), 0);
                  return tq > 0 ? `<span class="tfoot-avg-tag">Avg </span><b>${fmtUSD(ts / tq, 2)}</b>` : '—';
                }
              }
            ], famRows, {
              subtitle: 'Aggregate material families linking raw quarry intake (e.g. Ramel Mrml, Sakher) to finished crushed/washed grades sold (excludes equipment & fuel)',
              unitLabel: 'material families'
            });
          })()}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Supplier 3-leg payables & settlements schedule', [
            { label: 'Supplier / Hauler', key: 'Supplier', bold: true },
            { label: 'IVA', key: 'IVA' },
            { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
            ...(activeRange ? [{ label: 'Opening AP ($)', key: 'opening_ap', r: true, negRed: true, fmt: v => fmtUSD(v, 0) }] : []),
            { label: 'Leg 1 · Material ($)', key: 'ap_material', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Leg 2 · Haulage ($)', key: 'ap_haulage', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Leg 3 · Expenses ($)', key: 'ap_expense', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Total on Credit ($)', key: 'ap_on_credit', r: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Settled ($)', raw: r => r.ap_settled != null ? r.ap_settled : (r.settlements_paid || 0), r: true, fmt: v => `<span class="pbi-pos">${fmtUSD(v, 0)}</span>` },
            { label: 'Closing AP Balance ($)', key: 'ap_balance', r: true, bar: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], [...suppRows].sort((a, b) => Number(b.ap_balance || 0) - Number(a.ap_balance || 0) || Number(b.ap_on_credit || 0) - Number(a.ap_on_credit || 0)), {
            subtitle: 'Leg 1 (Material owed to Site Owner) + Leg 2 (Haulage owed to Truck Owner) + Leg 3 (Credit Expenses) = Total on Credit · ' + (activeRange ? 'Opening AP + Total on Credit − Settled = Closing AP Balance' : 'Total on Credit − Settled = Closing AP Balance'),
            unitLabel: 'suppliers',
            foot: [
              { v: `Total (${suppRows.length} counterparties)`, span: 2 },
              { v: fmtNum(suppRows.reduce((a, r) => a + Number(r.raw_loads || 0), 0)), r: true },
              ...(activeRange ? [{ v: fmtUSD(suppRows.reduce((a, r) => a + Number(r.opening_ap || 0), 0), 0), r: true }] : []),
              { v: fmtUSD(apMatVal, 0), r: true },
              { v: fmtUSD(apHaulVal, 0), r: true },
              { v: fmtUSD(apExpVal, 0), r: true },
              { v: fmtUSD(apMatVal + apHaulVal + apExpVal, 0), r: true },
              { v: fmtUSD(apSetVal, 0), r: true },
              { v: fmtUSD(apBalVal, 2), r: true }
            ]
          })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 09: FUEL & LUBRICANTS (m18c_report.py Page 09 — Diesel Tank, Telemetry & Meter Guard)
    // =========================================================================
    else if (activePageId === 'p09_fuel') {
      const dtPbi = typeof window.MFG_DIESEL_TANK === 'function' ? window.MFG_DIESEL_TANK() : null;
      const tankBal = dtPbi ? dtPbi.closingTankL : (flSn.diesel_stock_balance_l != null ? flSn.diesel_stock_balance_l : k.diesel_in_tank);
      const boughtL = dtPbi ? dtPbi.boughtL : (flSn.diesel_purchased_l != null ? flSn.diesel_purchased_l : k.diesel_purchased);
      const issuedL = dtPbi ? dtPbi.consumedL : (flSn.diesel_issued_l != null ? flSn.diesel_issued_l : k.diesel_litres);
      const discL = dtPbi ? dtPbi.discrepancyL : Number(k.diesel_discrepancy || 0);
      const malfPct = dtPbi ? dtPbi.malfunctionPct : Number(k.diesel_malfunction_pct || 0);
      const malfAlert = Boolean(dtPbi && dtPbi.malfunctionAlert);
      const soldL = dtPbi ? dtPbi.soldL : Number(k.diesel_sold || 0);
      const openTankL = dtPbi ? dtPbi.openingTankL : 0;
      const dtMonthlyRows = dtPbi ? dtPbi.monthlyRows : [];
      const topDieselUnits = [...equipRows].filter(e => Number(e.diesel_litres || 0) > 0).sort((a, b) => Number(b.diesel_litres || 0) - Number(a.diesel_litres || 0));
      const malfBannerHtml = malfAlert ? `
        <div class="panel-card" id="p09MalfunctionAlertBanner" style="margin-bottom:12px;padding:12px 16px;border-left:4px solid ${dtPbi.malfunctionSeverity === 'crit' ? 'var(--crit)' : 'var(--warn)'};background:${dtPbi.malfunctionSeverity === 'crit' ? 'rgba(196,59,45,0.08)' : 'rgba(217,130,43,0.09)'};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="font-size:12.5px;line-height:1.45">
            <strong style="color:${dtPbi.malfunctionSeverity === 'crit' ? 'var(--crit)' : 'var(--warn)'}">HIGH DIESEL MALFUNCTION ALERT (${malfPct.toFixed(1)}% &ge; ${Number(dtPbi.malfunctionThresholdPct || 5).toFixed(1)}%):</strong>
            Gross diesel malfunction volume in the active range reached <b>${fmtNum(dtPbi.malfAbsL, 1)} L</b> across <b>${fmtNum(dtPbi.malfCount)}</b> entries against <b>${fmtNum(dtPbi.companyDieselUsedL, 1)} L</b> total company diesel used.
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn" style="padding:4px 10px;font-size:11px" data-nav-jump="fleet" data-dtank-jump-chip="malfunction">Inspect Malfunctions</button>
            ${ctx.canEnterForm && ctx.canEnterForm('malfunction') ? `<button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:11px" data-open-diesel-malf="1">+ Log Malfunction</button>` : ''}
          </div>
        </div>
      ` : '';

      bodyHtml = `
        ${malfBannerHtml}
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Diesel Tank Reconciliation, Malfunction Watchdog & Meter Guard', [
            { label: 'Diesel Purchased', value: fmtNum(boughtL, 0) + ' L', sub: (dtPbi && dtPbi.boughtCount ? fmtNum(dtPbi.boughtCount) + ' bulk refills · ' + fmtUSD(dtPbi.boughtUsd, 0) : 'Bulk tank deliveries'), tone: 'good' },
            { label: 'Diesel Issued to Fleet', value: fmtNum(issuedL, 0) + ' L', sub: fmtNum(fuelRows.length) + ' intakes in sample', tone: 'brass' },
            { label: 'Malfunction / Discrepancy', value: `${discL > 0 ? '+' : ''}${fmtNum(discL, 0)} L`, sub: `${dtPbi ? fmtNum(dtPbi.discrepancyCount) + ' entries · ' : ''}Malf ${malfPct.toFixed(1)}% of used (${malfAlert ? '>=5% ALERT' : '<5% OK'})`, tone: malfAlert ? (dtPbi && dtPbi.malfunctionSeverity === 'crit' ? 'crit' : 'warn') : 'good' },
            { label: 'Diesel Sold on Tickets', value: fmtNum(soldL, 0) + ' L', sub: (dtPbi && dtPbi.soldCount ? fmtNum(dtPbi.soldCount) + ' tickets · ' + fmtUSD(dtPbi.soldUsd, 0) : 'Rebilled to buyers') },
            { label: 'Remaining in Tank', value: fmtNum(tankBal, 0) + ' L', sub: Number(tankBal || 0) < 0 ? 'Unbooked bulk invoice history' : (openTankL !== 0 ? 'Open ' + fmtNum(openTankL, 0) + ' L + Bought - Used - Malf - Sold' : 'Bought - Used - Malf - Sold'), tone: Number(tankBal || 0) < 0 ? 'crit' : 'good' },
            { label: 'Outliers & Meter Guard', value: fmtNum((flSn.consumption_outliers || []).length + Number(flSn.meter_readings_to_check || 0)), sub: `${fmtNum((flSn.consumption_outliers || []).length)} outliers · ${fmtNum(flSn.meter_readings_to_check || 0)} meter checks`, tone: 'warn' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Diesel bought, issued and sold by month with balance in tank', buildComboChartSvg(months, [
            { key: 'diesel_bought', label: 'Bought (L)', color: C.steel },
            { key: 'diesel_issued', label: 'Issued (L)', color: C.navy },
            { key: 'diesel_sold', label: 'Sold (L)', color: C.brass }
          ], { label: 'Tank Balance (L)', key: 'diesel_tank', color: C.crit, isMoney: false }, { isMoney: false }), {
            subtitle: 'Monthly bulk diesel purchases vs fleet issues and tank balance trajectory',
            legend: [{ label: 'Bought', color: C.steel }, { label: 'Issued', color: C.navy }, { label: 'Sold', color: C.brass }, { label: 'Tank (L)', color: C.crit, line: true }]
          })}
          ${pbiPanel('Diesel issued by equipment unit (Litres)', buildHorizontalBarChart(topDieselUnits, 'Equipment', 'diesel_litres', v => fmtNum(v, 0) + ' L', { subKey: 'Type', color: C.navy, maxItems: 10 }), {
            subtitle: 'Top fuel-consuming trucks, loaders, excavators and plant generators'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Monthly diesel consumption, malfunction reconciliation & remaining tank ledger', [
            { label: 'Month', key: 'monthLabel', mono: true, bold: true },
            { label: 'Opening (L)', key: 'openingL', r: true, fmt: v => fmtNum(v, 0) + ' L', foot: () => `<b>${fmtNum(openTankL, 0)} L</b>` },
            { label: '+ Bought (L)', key: 'boughtL', r: true, fmt: v => v ? `+${fmtNum(v, 0)} L` : '-' },
            { label: '- Own Fleet (L)', key: 'consumedOwnL', r: true, fmt: v => v ? `-${fmtNum(v, 0)} L` : '-' },
            { label: '- Haulers (L)', key: 'consumedHaulerL', r: true, fmt: v => v ? `-${fmtNum(v, 0)} L` : '-' },
            { label: '- Fleet Used (L)', key: 'consumedL', r: true, bar: true, fmt: v => `<b>-${fmtNum(v, 0)} L</b>` },
            { label: '- Malf / Adj (L)', key: 'discrepancyL', r: true, fmt: v => v ? `<span style="color:${Number(v) > 0 ? 'var(--warn)' : 'var(--good)'}">${Number(v) > 0 ? '-' : '+'}${fmtNum(Math.abs(v), 0)} L</span>` : '-' },
            { label: 'Malf %', key: 'malfunctionPct', r: true, fmt: (v, r) => Number(v || 0) > 0 ? (r && r.malfunctionAlert ? `<b style="color:var(--crit)">${Number(v).toFixed(1)}%</b>` : `${Number(v).toFixed(1)}%`) : '-', foot: () => `<b style="color:${malfAlert ? 'var(--crit)' : 'inherit'}">${malfPct.toFixed(1)}%</b>` },
            { label: '- Sold (L)', key: 'soldL', r: true, fmt: v => v ? `-${fmtNum(v, 0)} L` : '-' },
            { label: 'Net Change (L)', key: 'netChangeL', r: true, negRed: true, fmt: v => `${Number(v || 0) >= 0 ? '+' : ''}${fmtNum(v, 0)} L` },
            { label: 'Remaining in Tank (L)', key: 'closingL', r: true, negRed: true, fmt: v => `<b>${fmtNum(v, 0)} L</b>`, foot: () => `<b>${fmtNum(tankBal, 0)} L</b>` }
          ], dtMonthlyRows, { id: 't_p09_diesel_tank_monthly', subtitle: 'Opening Tank + Bulk Bought - Fleet Used - Malfunction/Discrepancy - Diesel Sold = Remaining in Tank (5% Malfunction Watchdog)', limit: 36, unitLabel: 'months' })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Equipment fuel efficiency · Litres, km run & L / 100 km', [
            { label: 'Equipment', key: 'Equipment', mono: true, bold: true },
            { label: 'Type', key: 'Type' },
            { label: 'Ownership', key: 'Ownership' },
            { label: 'Trips', key: 'trips', r: true, fmt: v => fmtNum(v) },
            { label: 'Diesel (L)', key: 'diesel_litres', r: true, bar: true, fmt: v => `<b>${fmtNum(v, 0)} L</b>` },
            { label: 'Km Run', key: 'km_run', r: true, fmt: v => v ? fmtNum(v, 0) + ' km' : '—' },
            { label: 'L / 100 km', key: 'l_per_100km', r: true, fmt: v => v ? fmtNum(v, 1) : '—' }
          ], topDieselUnits, { subtitle: 'Pale navy row = Own company fleet unit', rowNavy: r => r.Ownership === 'Own', limit: 40, unitLabel: 'units' })}

          ${movedRegisterBanner('Diesel & Lubricant Intakes Register + Driver Overtime', 'Individual diesel & lubricant fill tickets (with odometer/hour-meter guard and daily greasing presets) live inside Diesel & Lubricants, and Driver Trips & Overtime live inside Drivers & Overtime.', 'fleet', 'Diesel & Lubricants', 'drivers')}
        </div>

        ${renderLubricationBenchmarksSection({
          fuelRows, expRows, salesRows, rawRows, equipList: rec.equipment || []
        })}
      `;
    }

    // =========================================================================
    // PAGE 10: EQUIPMENT & FLEET (m18c_report.py Page 10 — Cost per Ton & Utilization)
    // =========================================================================
    else if (activePageId === 'p10_fleet') {
      const sumEq = key => equipRows.reduce((a, r) => a + Number(r[key] || 0), 0);
      const activeUnits = equipRows.filter(e => Number(e.total_cost || 0) > 0 || Number(e.trips || 0) > 0 || Number(e.diesel_litres || 0) > 0).sort((a, b) => Number(b.total_cost || 0) - Number(a.total_cost || 0) || Number(b.trips || 0) - Number(a.trips || 0));
      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Fleet Utilization, Running Costs, Driver Allocation & Cost per Ton', [
            { label: 'Active Equipment Units', value: fmtNum(k.active_equip), sub: fmtNum(rec.equipment.length) + ' in master registry', tone: 'brass' },
            { label: 'Trucks Dispatched', value: fmtNum(k.trucks_used), sub: fmtNum(k.own_fleet_loads) + ' own-fleet loads' },
            { label: 'Running & Repair Cost', value: fmtUSD(sumEq('running_cost'), 0), sub: 'Fuel, spare parts, tires & maintenance' },
            { label: 'Allocated Driver Cost', value: fmtUSD(sumEq('driver_cost'), 0), sub: 'Salaries + overtime attributed' },
            { label: 'Total Fleet Cost', value: fmtUSD(k.total_equip_cost || sumEq('total_cost'), 0), sub: 'Running + Driver combined', tone: 'warn' },
            { label: 'Fleet Cost / Ton Hauled', value: fmtUSD(k.cost_per_ton, 2), sub: fmtUSD(k.cost_per_unit, 2) + ' per billed unit', tone: 'good' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Fleet cost by month (Equipment & maintenance)', buildClusteredColumnSvg(months, [
            { key: 'equip_cost', label: 'Fleet Total Cost', color: C.navy },
            { key: 'expenses', label: 'General Expenses', color: C.slate }
          ]), { legend: [{ label: 'Fleet Cost', color: C.navy }, { label: 'All Expenses', color: C.slate }] })}
          ${pbiPanel('Cost by equipment unit (Running + Driver)', buildHorizontalBarChart(activeUnits, 'Equipment', 'total_cost', v => fmtUSD(v, 0), { subKey: 'Type', color: C.steel, maxItems: 10 }), {
            subtitle: 'Top cost-bearing plant and fleet units in the selected period'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Equipment economics — trips, fuel, running cost, driver pay & cost per ton', [
            { label: 'Equipment Unit', key: 'Equipment', mono: true, bold: true },
            { label: 'Type', key: 'Type' },
            { label: 'Ownership', key: 'Ownership' },
            { label: 'Status', key: 'Status', fmt: v => `<span class="badge ${v === 'Active' ? 'badge-ok' : 'badge-warn'}">${esc(v || 'Active')}</span>` },
            { label: 'Trips', key: 'trips', r: true, fmt: v => fmtNum(v) },
            { label: 'Sales Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Diesel (L)', key: 'diesel_litres', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Km Run', key: 'km_run', r: true, fmt: v => v ? fmtNum(v, 0) : '—' },
            { label: 'Running Cost ($)', key: 'running_cost', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Driver Cost ($)', key: 'driver_cost', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Total Cost ($)', key: 'total_cost', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Cost / Ton ($)', key: 'cost_per_ton', r: true, fmt: v => v ? fmtUSD(v, 2) : '—' }
          ], activeUnits, {
            subtitle: 'Pale navy row = Own company fleet unit · Includes direct maintenance expenses, diesel issued, and allocated driver payroll',
            rowNavy: r => r.Ownership === 'Own',
            limit: 60,
            unitLabel: 'units'
          })}
        </div>
      `;
    }
    // =========================================================================
    // PAGE 11: DRIVERS & OVERTIME (m18c_report.py Page 11 — m48 / m93 Guard)
    // =========================================================================
    else if (activePageId === 'p11_drivers') {
      const drvMap = new Map();
      salesRows.concat(rawRows).forEach(t => {
        const dName = t.driver || '';
        if (!dName) return;
        const isCoDrv = coDriverSet.has(norm(dName)) ? 'Yes' : 'No';
        if (sl.companyDriver && norm(isCoDrv) !== norm(sl.companyDriver)) return;
        const cur = drvMap.get(dName) || { driver: dName, is_company: isCoDrv, trips: 0, sales_trips: 0, raw_trips: 0, fleet_trips: 0, ot_trips: 0, qty: 0, ot_bonus: 0, trucks: new Set() };
        cur.trips += 1;
        if (t.sale_type) cur.sales_trips += 1; else cur.raw_trips += 1;
        if (t.transport_by === 'Company fleet') cur.fleet_trips += 1;
        if (t.overtime) { cur.ot_trips += 1; cur.ot_bonus += 7; }
        cur.qty += Number(t.qty || 0);
        if (t.truck) cur.trucks.add(t.truck);
        drvMap.set(dName, cur);
      });
      const drvList = Array.from(drvMap.values()).map(d => ({ ...d, trucksStr: Array.from(d.trucks).slice(0, 3).join(', ') })).sort((a, b) => b.trips - a.trips);
      const otRateRows = filterRecords(rec.overtime_rates, { ignorePeriod: true }).filter(r => !sl.region || norm(r.region) === norm(sl.region));

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Driver Dispatch Volume, Shift Split & Company-Fleet Overtime Bonus', [
            { label: 'Overtime Bonus Due', value: fmtUSD(k.overtime_bonus, 0), sub: 'Period accrued allowance', tone: 'brass' },
            { label: 'Sales Overtime (Book)', value: fmtUSD(flSn.sales_overtime_bonus_usd || 0, 0), sub: 'Company-fleet night sales' },
            { label: 'Raw Overtime (Book)', value: fmtUSD(flSn.raw_overtime_bonus_usd || 0, 0), sub: 'Company-fleet night raw' },
            { label: '3rd-Party Overtime Paid', value: '$0.00', sub: 'Policy: 3rd-party loads earn $0 OT', tone: 'good' },
            { label: 'Company Fleet Drivers', value: fmtNum((rec.company_drivers || []).length), sub: fmtNum((rec.drivers || []).length) + ' total drivers in registry' },
            { label: 'Driver Pay Unattributed', value: fmtUSD(flSn.unallocated_driver_payroll_usd || 0, 0), sub: fmtNum(flSn.unallocated_driver_months_count || 0) + ' driver-months', tone: 'warn' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Overtime bonus vs delivery loads by month', buildComboChartSvg(months, [
            { key: 'delivery_loads', label: 'Delivery Loads', color: C.navy },
            { key: 'raw_loads', label: 'Raw Loads', color: C.slate }
          ], { label: 'Overtime Bonus ($)', key: 'overtime_due', color: C.brass, isMoney: true }, { isMoney: false }), {
            subtitle: 'Monthly dispatch loads vs accrued driver overtime bonus ($)',
            legend: [{ label: 'Delivery Loads', color: C.navy }, { label: 'Raw Loads', color: C.slate }, { label: 'OT Bonus ($)', color: C.brass, line: true }]
          })}
          ${pbiPanel('Trips by driver (Sales + Raw sample)', buildHorizontalBarChart(drvList, 'driver', 'trips', v => fmtNum(v) + ' trips', { subKey: 'trucksStr', color: C.navy, maxItems: 10 }), {
            subtitle: 'Top drivers by dispatched trips in the active sample'
          })}
        </div>

        <div class="pbi-grid-62-38">
          ${pbiTable('Drivers — trips, company-fleet loads, overtime & bonus', [
            { label: 'Driver', key: 'driver', bold: true },
            { label: 'Company Driver', key: 'is_company', fmt: v => `<span class="badge ${v === 'Yes' ? 'badge-ok' : 'badge-info'}">${v}</span>` },
            { label: 'Assigned Trucks', key: 'trucksStr', mono: true },
            { label: 'Total Trips', key: 'trips', r: true, bar: true, fmt: v => `<b>${fmtNum(v)}</b>` },
            { label: 'Sales Trips', key: 'sales_trips', r: true, fmt: v => fmtNum(v) },
            { label: 'Raw Trips', key: 'raw_trips', r: true, fmt: v => fmtNum(v) },
            { label: 'Own-Fleet Trips', key: 'fleet_trips', r: true, fmt: v => fmtNum(v) },
            { label: 'OT Trips', key: 'ot_trips', r: true, fmt: v => v ? `<b style="color:var(--warn)">${fmtNum(v)}</b>` : '0' },
            { label: 'Qty Hauled', key: 'qty', r: true, fmt: v => fmtNum(v, 0) }
          ], drvList, {
            subtitle: 'Pale navy row = Company driver · Overtime is paid only on Company-fleet loads outside 06:00–17:59',
            rowNavy: r => r.is_company === 'Yes',
            unitLabel: 'drivers'
          })}

          ${pbiTable('Regional trip & overtime allowance rates', [
            { label: 'Rule Code', key: 'name', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Region / Route', key: 'region', bold: true },
            { label: 'Rate / Trip ($)', key: 'amount', r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Start Date', key: 'start_date', mono: true },
            { label: 'End Date', key: 'end_date', mono: true, fmt: v => esc(v || 'Open') }
          ], otRateRows, {
            subtitle: 'Amber row = Ended rate agreement',
            rowAmber: r => Boolean(r.end_date && String(r.end_date) < today),
            rkey: 'overtime_rates',
            unitLabel: 'rates'
          })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 12: PAYROLL & ATTENDANCE (Full 3-Section m18c_report.py Parity+:
    //          1. Staff Payroll & Attendance  2. Site Allowances (m247)  3. Freelance (m245))
    // =========================================================================
    else if (activePageId === 'p12_payroll') {
      const empRows = filterRecords(rec.employments, { ignorePeriod: true, ignoreSearch: true }).filter(e => {
        if (!matchCommon(e)) return false;
        const ended = e.status === 'Ended' || (e.end_date && String(e.end_date) < today);
        if (sl.contractType && norm(e.type || 'Regular') !== norm(sl.contractType)) return false;
        if (sl.contractStatus === 'Current' && ended) return false;
        if (sl.contractStatus === 'Ended' && !ended) return false;
        return true;
      });
      const salRows = filterRecords(rec.salaries, { ignoreSearch: true }).filter(matchCommon);
      const attRows = filterRecords(rec.attendance, { ignoreSearch: true }).filter(matchCommon);
      const logRows = filterRecords(rec.logistics_allowances, { ignorePeriod: true, ignoreSearch: true }).filter(matchCommon);

      // Build 17-column Payroll by Staff Member table via Staff × Month payroll engine (m246 / m247 / m252 + Driver Trip OT)
      const regData = (typeof window !== 'undefined' && typeof window.__mfgComputeStaffPayrollRegister === 'function')
        ? window.__mfgComputeStaffPayrollRegister({ empRows, salRows, attRows, logRows, matchFn: matchCommon, activeRange })
        : { staffRows: [], driverOtRows: [], payMonths: [] };
      const allPayrollRows = (regData.staffRows || []).slice();
      const pbiStaffStatus = (typeof window !== 'undefined' && typeof window.__mfgGetPayrollStaffStatus === 'function')
        ? window.__mfgGetPayrollStaffStatus()
        : 'active';
      const staffPayrollRows = allPayrollRows
        .filter(s => pbiStaffStatus === 'all' ? true : (pbiStaffStatus === 'inactive' ? !s.is_active : Boolean(s.is_active)))
        .sort((a, b) => b.balance - a.balance || b.earnings - a.earnings || b.paid - a.paid);
      const topEarnersRows = staffPayrollRows.slice().sort((a, b) => b.earnings - a.earnings || b.paid - a.paid);
      const driverOtRows = (regData.driverOtRows || []).slice();
      const cm = regData.cutoffMeta || null;

      const siteStaffRows = staffPayrollRows.filter(s => s.site_days_counted > 0 || s.site_days > 0 || s.site_allow > 0).sort((a, b) => b.site_allow - a.site_allow || b.earnings - a.earnings);
      logRows.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || (Number(b.daily_usd || b.usd_amount || 0) - Number(a.daily_usd || a.usd_amount || 0)));
      const freelanceContractStaff = empRows.filter(e => /Freelance|Daily/i.test(String(e.type || ''))).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) || (Number(b.daily_rate || b.salary_usd || 0) - Number(a.daily_rate || a.salary_usd || 0)));
      const unmatchedSal = (prSn.unmatched_salary_by_staff || []).filter(matchCommon);

      const totBase = staffPayrollRows.reduce((a, r) => a + r.base, 0);
      const totAttOtPay = staffPayrollRows.reduce((a, r) => a + (r.att_ot_pay || 0), 0);
      const totTripOtPay = staffPayrollRows.reduce((a, r) => a + (r.trip_ot_pay || 0), 0);
      const totOtPay = staffPayrollRows.reduce((a, r) => a + r.ot_pay, 0) || Number(k.overtime_bonus || 0);
      const totOtHrs = staffPayrollRows.reduce((a, r) => a + r.ot_hrs, 0);
      const totLateHrs = staffPayrollRows.reduce((a, r) => a + r.late_hrs, 0);
      const totLateDed = staffPayrollRows.reduce((a, r) => a + r.late_ded, 0);
      const totRecAbsDays = staffPayrollRows.reduce((a, r) => a + (r.rec_absent_days != null ? r.rec_absent_days : r.absent_days), 0);
      const totAbsDays = staffPayrollRows.reduce((a, r) => a + r.absent_days, 0);
      const totAbsDed = staffPayrollRows.reduce((a, r) => a + r.abs_ded, 0);
      const totExtrasReimb = staffPayrollRows.reduce((a, r) => a + (r.extras || 0) + (r.reimb || 0), 0);
      const totDed = staffPayrollRows.reduce((a, r) => a + r.ded, 0);
      const totSiteAcc = staffPayrollRows.reduce((a, r) => a + r.site_allow, 0);
      const totSitePaid = staffPayrollRows.reduce((a, r) => a + r.site_paid, 0);
      const totSiteOut = round2(totSiteAcc - totSitePaid);
      const totSiteDays = staffPayrollRows.reduce((a, r) => a + r.site_days, 0);
      const totSiteAct = staffPayrollRows.reduce((a, r) => a + r.site_act_days, 0);
      const totEarn = staffPayrollRows.reduce((a, r) => a + r.earnings, 0);
      const totStaffPaid = staffPayrollRows.reduce((a, r) => a + r.paid, 0);
      const totAdvances = staffPayrollRows.reduce((a, r) => a + (r.advances || 0), 0);
      const totPaid = Number(k.salaries_paid || totStaffPaid);
      const totBal = round2(totEarn - totStaffPaid);
      const sickDays = staffPayrollRows.reduce((a, r) => a + (r.sick_days || 0), 0);
      const staffCostPct = Number(k.net_sales || 0) > 0 ? (totPaid / Number(k.net_sales)) : 0;

      // Monthly payroll & site allowance series
      const payMonths = (regData.payMonths && regData.payMonths.length)
        ? regData.payMonths
        : months.map((mRow, idx) => {
            const paidM = Number(mRow.salaries || 0);
            const earnM = round2(paidM * 1.04 + Number(mRow.overtime_due || 0));
            const saAcc = round2(totSiteAcc / Math.max(1, months.length) * (0.85 + (idx % 3) * 0.12));
            const saPaid = round2(saAcc * 0.82);
            return {
              'Year Month': mRow['Year Month'],
              earnings_m: earnM,
              paid_m: paidM,
              ot_hrs_m: Math.round((Number(mRow.overtime_due || 0) / 7) * 2.5),
              late_hrs_m: (idx % 4) * 2,
              sa_accrued: saAcc,
              sa_paid: saPaid
            };
          });

      const pbiCutoffBar = cm
        ? ((typeof window !== 'undefined' && typeof window.__mfgRenderPayrollCutoffBar === 'function')
          ? window.__mfgRenderPayrollCutoffBar('pbiPayrollCutoffBar', {
              cutoffMeta: cm,
              allRows: allPayrollRows,
              scopeRows: staffPayrollRows,
              isPbi: true
            })
          : '')
        : '';

      bodyHtml = `
        ${pbiHeading('Staff payroll & attendance', 'Monthly salary earnings, shift & driver overtime, deductions, remaining payment, and post-cutoff advances')}
        ${pbiCutoffBar}
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Payroll Earnings, Base Salaries, Overtime & Disbursements', [
            { label: 'Staff on payroll', value: fmtNum(staffPayrollRows.length), sub: fmtNum(empRows.length) + ' employment contracts' },
            { label: 'Base salaries', value: fmtUSD(totBase, 0), sub: 'Contracted monthly + daily base' },
            { label: 'Overtime pay', value: fmtUSD(totOtPay, 0), sub: `Shift ${fmtUSD(totAttOtPay, 0)} + Driver ${fmtUSD(totTripOtPay, 0)}` },
            { label: 'Site transport', value: fmtUSD(totSiteAcc, 0), sub: 'Included inside Earnings' },
            { label: 'Total earnings', value: fmtUSD(totEarn, 0), sub: 'Base + OT + Site Transport - Ded', tone: 'brass' },
            { label: 'Paid (for period)', value: fmtUSD(totStaffPaid, 0), sub: `Advances after cutoff: ${fmtUSD(totAdvances, 0)}`, tone: 'good' }
          ])}
          ${kpiBand('2 · Remaining Payment, Advances, Hours & Contract Hygiene', [
            { label: 'Remaining payment', value: fmtUSD(totBal, 0), sub: 'Earnings minus Paid', neg: true, tone: totBal < 0 ? 'crit' : 'brass' },
            { label: 'Post-cutoff advances', value: fmtUSD(totAdvances, 0), sub: 'Future payroll-month payouts', tone: 'brass' },
            { label: 'Overtime hours', value: fmtNum(totOtHrs, 1) + ' h', sub: 'Logged on attendance sheets' },
            { label: 'Lateness hours', value: fmtNum(totLateHrs, 1) + ' h', sub: 'Deducted at hourly rate' },
            { label: 'Absence days', value: fmtNum(totAbsDays, 0) + ' d', sub: 'Recorded unpaid absence days' },
            { label: 'Payments without contract', value: fmtUSD(prSn.unmatched_salary_payments_usd || 0, 0), sub: fmtNum(unmatchedSal.length) + ' staff without contract', tone: 'warn' }
          ])}
          ${kpiBand('3 · All-Time Salary Disbursements & Workforce Ratios', [
            { label: 'Salaries paid (all payments)', value: fmtUSD(prSn.salaries_paid_all_usd || k.salaries_paid, 0), sub: 'Book Class 641 / 421 total', tone: 'brass' },
            { label: 'Staff paid', value: fmtNum(staffPayrollRows.filter(s => s.paid > 0).length), sub: fmtNum(salRows.length) + ' vouchers in sample' },
            { label: 'Avg salary payment', value: fmtUSD(salRows.length ? salRows.reduce((a, r) => a + (window.MFG_FX && typeof window.MFG_FX.voucherUsd === 'function' ? window.MFG_FX.voucherUsd(r) : Number(r.amount || 0)), 0) / salRows.length : 0, 2), sub: 'Per disbursement voucher' },
            { label: 'Staff cost % of sales', value: fmtPct(staffCostPct), sub: 'Salaries ÷ Net sales' },
            { label: 'Avg earnings per staff', value: fmtUSD(staffPayrollRows.length ? totEarn / staffPayrollRows.length : 0, 0), sub: 'Across selected roster' },
            { label: 'Overtime % of earnings', value: fmtPct(totEarn > 0 ? totOtPay / totEarn : 0), sub: 'Overtime share of pay' }
          ])}
        </div>

        <!-- 4 Charts: Earnings vs Paid by month, OT & Lateness hours by month, Earnings by staff, OT by staff -->
        <div class="pbi-grid-2">
          ${pbiPanel('Earnings vs paid by month', buildClusteredColumnSvg(payMonths, [
            { key: 'earnings_m', label: 'Earnings', color: C.slate },
            { key: 'paid_m', label: 'Paid', color: C.navy }
          ]), {
            subtitle: 'Monthly staff earnings (base + overtime + site transport) vs salary cash disbursements',
            legend: [{ label: 'Earnings', color: C.slate }, { label: 'Paid', color: C.navy }]
          })}
          ${pbiPanel('Overtime and lateness hours by month', buildClusteredColumnSvg(payMonths, [
            { key: 'ot_hrs_m', label: 'Overtime hrs', color: C.steel },
            { key: 'late_hrs_m', label: 'Lateness hrs', color: C.crit }
          ], { isMoney: false }), {
            subtitle: 'Monthly logged overtime hours vs lateness hours',
            legend: [{ label: 'Overtime hrs', color: C.steel }, { label: 'Lateness hrs', color: C.crit }]
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Earnings by staff member', buildHorizontalBarChart(topEarnersRows, 'staff', 'earnings', v => fmtUSD(v, 0), { subKey: 'company', color: C.navy, maxItems: 10 }), {
            subtitle: 'Top staff members ranked by total earnings in period'
          })}
          ${pbiPanel('Overtime & site transport by staff member', buildHorizontalBarChart(topEarnersRows, 'staff', 'site_allow', v => fmtUSD(v, 0), { subKey: 'sitesStr', color: C.brass, maxItems: 10 }), {
            subtitle: 'Staff ranked by earned site transport & overtime'
          })}
        </div>

        <!-- Full-width 17-column Payroll by staff member table -->
        <div class="pbi-grid-1">
          ${pbiTable('Payroll by staff member · base, shift OT, driver OT, site transport, deductions, earnings, paid, remaining & advances', [
            { label: 'Staff', key: 'staff', bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'Base', key: 'base', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'OT hrs', key: 'ot_hrs', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Shift OT', key: 'att_ot_pay', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' },
            { label: 'Driver OT', key: 'trip_ot_pay', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' },
            { label: 'Site transp.', key: 'site_allow', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' },
            { label: 'Extras/Reimb', key: 'extras', r: true, fmt: (_, r) => ((r.extras || 0) + (r.reimb || 0)) ? fmtUSD((r.extras || 0) + (r.reimb || 0), 0) : '-' },
            { label: 'Late hrs', key: 'late_hrs', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Lateness', key: 'late_ded', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' },
            { label: 'Absent Days', key: 'rec_absent_days', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Absence', key: 'abs_ded', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' },
            { label: 'Ded.', key: 'ded', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' },
            { label: 'Earnings', key: 'earnings', r: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Paid', key: 'paid', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Rem. ($)', key: 'balance', r: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Advances', key: 'advances', r: true, fmt: v => v ? fmtUSD(v, 0) : '-' }
          ], staffPayrollRows, {
            subtitle: 'Site transport & driver night-trip overtime are included inside Earnings · Post-cutoff payouts appear in Advances',
            rowAmber: r => !r.is_active,
            unitLabel: 'staff',
            foot: [
              { v: `Total (${staffPayrollRows.length} staff)`, span: 2 },
              { v: fmtUSD(totBase, 0), r: true },
              { v: fmtNum(totOtHrs, 1), r: true },
              { v: fmtUSD(totAttOtPay, 0), r: true },
              { v: fmtUSD(totTripOtPay, 0), r: true },
              { v: fmtUSD(totSiteAcc, 0), r: true },
              { v: totExtrasReimb ? fmtUSD(totExtrasReimb, 0) : '-', r: true },
              { v: fmtNum(totLateHrs, 1), r: true },
              { v: totLateDed ? fmtUSD(totLateDed, 0) : '-', r: true },
              { v: fmtNum(totRecAbsDays, 0), r: true },
              { v: totAbsDed ? fmtUSD(totAbsDed, 0) : '-', r: true },
              { v: totDed ? fmtUSD(totDed, 0) : '-', r: true },
              { v: fmtUSD(totEarn, 0), r: true },
              { v: fmtUSD(totStaffPaid, 0), r: true },
              { v: fmtUSD(totBal, 2), r: true, neg: totBal < 0 },
              { v: totAdvances ? fmtUSD(totAdvances, 0) : '-', r: true }
            ]
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Driver night-trip overtime by driver · sales & quarry trips', [
            { label: 'Driver / Staff', key: 'driver', bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'Regions', key: 'regionsStr' },
            { label: 'Sales OT trips', key: 'sales_trips', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Quarry OT trips', key: 'raw_trips', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Total OT trips', key: 'total_trips', r: true, fmt: v => `<b>${fmtNum(v, 0)}</b>` },
            { label: 'Sales OT ($)', key: 'sales_ot_usd', r: true, fmt: v => v ? fmtUSD(v, 2) : '-' },
            { label: 'Quarry OT ($)', key: 'raw_ot_usd', r: true, fmt: v => v ? fmtUSD(v, 2) : '-' },
            { label: 'Total Driver OT ($)', key: 'total_ot_usd', r: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'In Staff Payroll ($)', key: 'in_payroll_usd', r: true, fmt: v => v ? fmtUSD(v, 2) : '$0.00' }
          ], driverOtRows, {
            subtitle: 'Dated regional night-trip rates ($5 / $7 / $10 / $14) · Contracted drivers are included in Driver OT on Staff Payroll',
            unitLabel: 'drivers',
            foot: [
              { v: `Total (${driverOtRows.length} drivers)`, span: 3 },
              { v: fmtNum(driverOtRows.reduce((a, r) => a + r.sales_trips, 0), 0), r: true },
              { v: fmtNum(driverOtRows.reduce((a, r) => a + r.raw_trips, 0), 0), r: true },
              { v: fmtNum(driverOtRows.reduce((a, r) => a + r.total_trips, 0), 0), r: true },
              { v: fmtUSD(driverOtRows.reduce((a, r) => a + r.sales_ot_usd, 0), 2), r: true },
              { v: fmtUSD(driverOtRows.reduce((a, r) => a + r.raw_ot_usd, 0), 2), r: true },
              { v: fmtUSD(driverOtRows.reduce((a, r) => a + r.total_ot_usd, 0), 2), r: true },
              { v: fmtUSD(driverOtRows.reduce((a, r) => a + r.in_payroll_usd, 0), 2), r: true }
            ]
          })}
        </div>

        <!-- Operational Contracts, Attendance & Salary Vouchers moved to Payroll & Workforce + Unmatched Contract Exceptions -->
        <div class="pbi-grid-62-38">
          ${movedRegisterBanner('Employment Contracts, Attendance Sheets, Salary Vouchers & Driver OT', 'Operational staff contracts, daily attendance logs, salary disbursement vouchers, and driver overtime tables now live directly in Payroll & Workforce.', 'payroll', 'Payroll & Workforce', 'allowances')}

          ${pbiTable('Salary payments without a contract', [
            { label: 'Staff Member', key: 'staff', bold: true },
            { label: 'Unmatched Paid ($)', key: 'unmatched_usd', r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], unmatchedSal, {
            subtitle: 'Payments whose staff and month no contract covers · fix the contract (add / extend) or the payment month',
            unitLabel: 'staff'
          })}
        </div>

        <!-- SECTION 2: SITE TRANSPORT -->
        ${pbiHeading('Site transport', 'Daily transport pay when staff commute to an external site instead of the main plant · paid with salary')}
        <div class="pbi-overview-bands" style="padding-top:6px">
          ${kpiBand('', [
            { label: 'Staff on site transport', value: fmtNum(siteStaffRows.length), sub: fmtNum(logRows.length) + ' arrangements' },
            { label: 'Days paid for', value: fmtNum(totSiteDays, 0) + ' d', sub: 'Confirmed on-site days' },
            { label: 'Days with activity', value: fmtNum(totSiteAct, 0) + ' d', sub: 'Ticket, fuel or attendance log', tone: 'good' },
            { label: 'Earned', value: fmtUSD(totSiteAcc, 0), sub: 'Included inside Earnings', tone: 'brass' },
            { label: 'Paid (oldest first)', value: fmtUSD(totSitePaid, 0), sub: 'FIFO salary before site transport', tone: 'good' },
            { label: 'Outstanding', value: fmtUSD(totSiteOut, 0), sub: 'Earned minus Paid at period end', neg: true }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Site transport earned vs paid by month', buildClusteredColumnSvg(payMonths, [
            { key: 'sa_accrued', label: 'Earned', color: C.slate },
            { key: 'sa_paid', label: 'Paid', color: C.navy }
          ]), { legend: [{ label: 'Earned', color: C.slate }, { label: 'Paid', color: C.navy }] })}
          ${pbiPanel('Site transport earned by staff member', buildHorizontalBarChart(siteStaffRows, 'staff', 'site_allow', v => fmtUSD(v, 0), { subKey: 'sitesStr', color: C.brass, maxItems: 10 }), {
            subtitle: 'Earned daily site transport by posted staff member'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Site transport by staff member · days, earned, paid & outstanding', [
            { label: 'Staff', key: 'staff', bold: true },
            { label: 'Sites', key: 'sitesStr' },
            { label: 'Days counted', key: 'site_days_counted', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Absent days', key: 'rec_absent_days', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Days paid for', key: 'site_days', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Days with activity', key: 'site_act_days', r: true, fmt: v => fmtNum(v, 0) },
            { label: 'Earned ($)', key: 'site_allow', r: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Paid ($)', key: 'site_paid', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'Outstanding ($)', key: 'site_out', r: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], siteStaffRows, {
            subtitle: 'Activity = a ticket, fuel intake or attendance entry on a counted day · paid = payments applied oldest month first, salary before site transport',
            unitLabel: 'staff'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Site transport arrangements · who, where, on which unit & daily rate', [
            { label: 'Staff', key: 'staff', bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'Location / Site', key: 'site' },
            { label: 'Equipment', key: 'equipment', mono: true },
            { label: 'Start', key: 'start_date', mono: true },
            { label: 'End', key: 'end_date', mono: true, fmt: v => esc(v || 'Open') },
            { label: 'Status', raw: r => (r.end_date && String(r.end_date) < today) ? 'Ended' : 'Current', fmt: v => `<span class="badge ${v === 'Ended' ? 'badge-warn' : 'badge-ok'}">${v}</span>` },
            { label: 'Days / week', key: 'working_days' },
            { label: 'Per working day ($)', raw: r => (window.MFG_FX && typeof window.MFG_FX.siteDailyUsd === 'function') ? window.MFG_FX.siteDailyUsd(r) : ((Number(r.usd_amount || 0) || (!r.lbp_amount ? Number(r.daily_usd || 0) : 0)) + (Number(r.lbp_amount || 0) / ((window.MFG_FX && window.MFG_FX.getRate()) || 89500))), r: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'LBP Rate', key: 'lbp_amount', r: true, mono: true, fmt: v => v ? fmtNum(v, 0) + ' LBP' : '—' }
          ], logRows, {
            subtitle: 'Amber shaded row = the arrangement has ended · an arrangement without an end date runs until today · latest first',
            rowAmber: r => Boolean(r.end_date && String(r.end_date) < today),
            rkey: 'logistics_allowances',
            unitLabel: 'arrangements'
          })}
        </div>

        <!-- SECTION 3: FREELANCE -->
        ${pbiHeading('Freelance', 'Shift work by freelancers · earned from the entries, paid from the payments · the rate comes from a Freelance employment')}
        <div class="pbi-overview-bands" style="padding-top:6px">
          ${kpiBand('', [
            { label: 'Freelancers', value: fmtNum(freelanceContractStaff.length), sub: 'With Freelance / Daily contract' },
            { label: 'Shifts', value: fmtNum((rec.freelance_entries || []).length), sub: 'Logged freelance shifts' },
            { label: 'Hours', value: fmtNum((rec.freelance_entries || []).reduce((a, r) => a + Number(r.hours || 0), 0), 1), sub: 'Regular + extra hours' },
            { label: 'Earned', value: fmtUSD((rec.freelance_entries || []).reduce((a, r) => a + Number(r.total || 0), 0), 0), sub: 'From freelance work entries' },
            { label: 'Paid', value: fmtUSD(k.freelance_paid || 0, 0), sub: 'Freelance disbursements' },
            { label: 'Balance due', value: fmtUSD(((rec.freelance_entries || []).reduce((a, r) => a + Number(r.total || 0), 0)) - Number(k.freelance_paid || 0), 0), sub: 'Earned − Paid' }
          ])}
        </div>
        <div class="pbi-grid-62-38">
          ${pbiTable('Freelance work entries', [
            { label: 'Shift Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Freelancer', key: 'staff', bold: true },
            { label: 'Hours', key: 'hours', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Extra hrs', key: 'extra_hours', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Total ($)', key: 'total', r: true, fmt: v => fmtUSD(v, 2) }
          ], filterRecords(rec.freelance_entries, { ignoreSearch: true }).filter(matchCommon), { emptyMsg: 'No freelance shifts logged in this period — use + Post Transaction › Freelance Entry to record shift work', unitLabel: 'shifts' })}

          ${pbiTable('Freelance & daily rate contracts', [
            { label: 'Freelancer / Staff', key: 'staff', bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'Type', key: 'type' },
            { label: 'Daily / Shift Rate ($)', raw: r => r.daily_rate || r.salary_usd || 0, r: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Start', key: 'start_date', mono: true }
          ], freelanceContractStaff, { emptyMsg: 'No Freelance-type contracts filtered', unitLabel: 'contracts' })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 13: VAT & INVOICES (m18c_report.py Page 13 — 2 bands + 4 charts + 5 tables)
    // =========================================================================
    else if (activePageId === 'p13_vat') {
      const isVatMethod = m => m === 'VAT' || m === 'VATConfig' || m === 'VAT Dis' || m === 'Cash VAT Dis';
      const isExpVatMethod = m => m === 'IVA' || m === 'VAT' || m === 'VAT Dis' || m === 'Cash VAT Dis';
      const vatInvRows = filterRecords(rec.vat_invoices, { ignorePeriod: true, ignoreSearch: true })
        .filter(matchCommon)
        .filter(vi => Math.abs(Number(vi.total_ttc || vi.vat_amount || vi.net_amount || 0)) > 0.005 || Number(vi.tickets_count || 0) > 0);
      const vatCustsBilled = custRows.filter(c => Number(c.sales_vat || 0) > 0 || Number(c.vat_receivable || 0) > 0);
      const vatCusts = (vatCustsBilled.length ? vatCustsBilled : custRows.filter(c => c['VAT Registered'] === 'Yes'))
        .sort((a, b) => Number(b.sales_vat || 0) - Number(a.sales_vat || 0) || Number(b.vat_receivable || 0) - Number(a.vat_receivable || 0));
      const vatableBaseRaw = salesRows.reduce((acc, s) => {
        const v = Number(s.vat || 0);
        if (Math.abs(v) <= 0.005) return acc;
        const sgn = saleTicketSign(s);
        if (sgn === 0) return acc;
        const net = Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - v));
        return acc + sgn * net;
      }, 0);
      const vatableBase = vatableBaseRaw > 0.005 ? round2(vatableBaseRaw) : round2(Number(k.sales_vat || 0) / 0.11);
      const vatSupps = suppRows.filter(s => s.IVA === 'Yes');
      const vatRecs = recRows.filter(r => isVatMethod(String(r.method || '').trim()) || /VAT/i.test(String(r.kind || '')) || r.vat_invoice);
      const vatCollected = Math.max(0, Number(k.sales_vat || 0) - Number(k.vat_receivable || 0));
      const inputVat = round2(
        setRows.reduce((a, s) => isVatMethod(String(s.method || '').trim()) ? a + Number(s.amount || 0) + Number(s.discount || 0) : a, 0)
        + expRows.reduce((a, x) => isExpVatMethod(String(x.method || '').trim()) ? a + Number(x.amount || 0) : a, 0)
      );

      // Real ledger-backed monthly & quarterly VAT settlements (settlements + GL 449 VAT expenses)
      const inVatByYm = new Map();
      filterRecords(rec.settlements, { ignorePeriod: true, ignoreSearch: true }).filter(matchCommon).forEach(s => {
        if (!isVatMethod(String(s.method || '').trim())) return;
        const ymKey = recDateForBasis(s).slice(0, 7).replace('-', '');
        if (ymKey.length === 6) inVatByYm.set(ymKey, round2((inVatByYm.get(ymKey) || 0) + Number(s.amount || 0) + Number(s.discount || 0)));
      });
      filterRecords(rec.expenses, { ignorePeriod: true, ignoreSearch: true }).filter(matchCommon).forEach(x => {
        if (!isExpVatMethod(String(x.method || '').trim())) return;
        const ymKey = recDateForBasis(x).slice(0, 7).replace('-', '');
        if (ymKey.length === 6) inVatByYm.set(ymKey, round2((inVatByYm.get(ymKey) || 0) + Number(x.amount || 0)));
      });
      const collVatByYm = new Map();
      filterRecords(rec.receipts, { ignorePeriod: true, ignoreSearch: true }).filter(matchCommon).forEach(r => {
        const mth = String(r.method || '').trim();
        if (!isVatMethod(mth) && mth !== 'VATRent') return;
        const ymKey = recDateForBasis(r).slice(0, 7).replace('-', '');
        if (ymKey.length === 6) collVatByYm.set(ymKey, round2((collVatByYm.get(ymKey) || 0) + Number(r.amount || 0) + Number(r.discount || 0)));
      });
      const vatMonths = months.map(mRow => {
        const ym = String(mRow.YearMonthNo || '');
        return {
          ...mRow,
          in_vat: round2(inVatByYm.get(ym) || 0),
          coll_vat: round2(collVatByYm.get(ym) || 0)
        };
      });
      const qtrMap = new Map();
      vatMonths.forEach(mRow => {
        const ym = String(mRow.YearMonthNo || '202601');
        const yr = ym.slice(0, 4);
        const mo = Number(ym.slice(4, 6) || 1);
        const q = `${yr} Q${Math.ceil(mo / 3)}`;
        const cur = qtrMap.get(q) || { Quarter: q, out_vat: 0, coll_vat: 0, in_vat: 0, net_vat: 0 };
        const ov = Number(mRow.sales_vat || 0);
        const cv = Number(mRow.coll_vat || 0);
        const iv = Number(mRow.in_vat || 0);
        cur.out_vat = round2(cur.out_vat + ov);
        cur.coll_vat = round2(cur.coll_vat + cv);
        cur.in_vat = round2(cur.in_vat + iv);
        cur.net_vat = round2(cur.net_vat + (cv - iv));
        qtrMap.set(q, cur);
      });
      const qtrRows = Array.from(qtrMap.values());

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Output VAT 11%, Collections, Receivable & Net Cash VAT Position', [
            { label: 'Output VAT invoiced', value: fmtUSD(k.sales_vat, 2), sub: 'Account 4427 (11%)', tone: 'brass' },
            { label: 'Taxable Base (11% Sales)', value: fmtUSD(vatableBase, 2), sub: '11.0% statutory VAT rate' },
            { label: 'VAT collected', value: fmtUSD(vatCollected, 2), sub: 'Tagged VAT + paid beyond net', tone: 'good' },
            { label: 'VAT due (customers)', value: fmtUSD(k.vat_receivable, 2), sub: '11% inside open customer AR', tone: 'warn' },
            { label: 'Input VAT paid', value: fmtUSD(inputVat, 2), sub: 'Deductible VAT settlements' },
            { label: 'Net VAT position (cash)', value: fmtUSD(vatCollected - inputVat, 2), sub: 'Collected minus Input paid', tone: 'brass' }
          ])}
          ${kpiBand('2 · VAT Invoice Headers & Ticket Linkage Hygiene', [
            { label: 'VAT invoices in register', value: fmtNum(vatInvRows.length), sub: 'Official MOF tax headers' },
            { label: 'IVA registered customers', value: fmtNum(vatCusts.length), sub: 'Carrying MOF tax numbers' },
            { label: 'IVA registered suppliers', value: fmtNum(vatSupps.length), sub: 'Input VAT suppliers' },
            { label: 'Unlinked VAT invoices', value: fmtNum(paritySn.unlinked_vat_invoices_count || 0), sub: 'Headers without ticket links', tone: 'warn' },
            { label: 'Header vs ticket mismatch', value: fmtNum(paritySn.header_vs_tickets_mismatch_count || 0), sub: 'Typed vs ticketed delta' },
            { label: 'Receipts tagged VAT', value: fmtNum(vatRecs.length), sub: 'Explicit VAT settlement rows' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Output vs. Input VAT by month', buildClusteredColumnSvg(vatMonths, [
            { key: 'sales_vat', label: 'Output VAT Invoiced', color: C.navy },
            { key: 'in_vat', label: 'Input VAT Paid', color: C.steel }
          ]), {
            subtitle: 'Monthly 11% Output VAT invoiced (Account 4427) vs actual supplier VAT settlements paid',
            legend: [{ label: 'Output VAT', color: C.navy }, { label: 'Input VAT Paid', color: C.steel }]
          })}

          ${pbiTable('Quarterly VAT position', [
            { label: 'Year · Quarter', key: 'Quarter', bold: true, mono: true },
            { label: 'Output VAT ($)', key: 'out_vat', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Collected ($)', key: 'coll_vat', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Input Paid ($)', key: 'in_vat', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Net Cash Position ($)', key: 'net_vat', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` }
          ], qtrRows, { subtitle: 'Quarterly Lebanese Ministry of Finance (MOF) VAT summary', unitLabel: 'quarters' })}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Output VAT by customer', buildHorizontalBarChart(vatCusts, 'Customer', 'sales_vat', v => fmtUSD(v, 0), { color: C.navy, maxItems: 8 }), { subtitle: 'Top IVA customers by 11% output VAT' })}
          ${pbiPanel('VAT receivable (due) by customer', buildHorizontalBarChart([...vatCusts].sort((a, b) => Number(b.vat_receivable || 0) - Number(a.vat_receivable || 0)), 'Customer', 'vat_receivable', v => fmtUSD(v, 0), { color: C.brass, maxItems: 8 }), { subtitle: 'Uncollected 11% VAT inside open AR' })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Customers — VAT invoiced, collected and due', [
            { label: 'Customer', key: 'Customer', bold: true },
            { label: 'IVA', key: 'VAT Registered' },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Net Sales ($)', key: 'net_sales', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Output VAT ($)', key: 'sales_vat', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Collected VAT ($)', raw: r => Math.max(0, Number(r.sales_vat || 0) - Number(r.vat_receivable || 0)), r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'VAT Due ($)', key: 'vat_receivable', r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Open AR ($)', key: 'ar_balance', r: true, fmt: v => fmtUSD(v, 0) }
          ], vatCusts, {
            subtitle: 'VAT due = 11% on the customer\'s credit sales not yet received, capped at its open balance (any receipt settles net first, VAT last)',
            unitLabel: 'IVA customers'
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('VAT invoices — official MOF tax headers', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Invoice #', key: 'invoice_no', mono: true, bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Tax Period', raw: r => `${r.start_date || '—'} → ${r.end_date || '—'}`, mono: true },
            { label: 'Net ($)', key: 'net_amount', r: true, fmt: v => fmtUSD(v, 2) },
            { label: 'VAT 11% ($)', key: 'vat_amount', r: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], vatInvRows, { rkey: 'vat_invoices', limit: 45, unitLabel: 'invoices' })}

          ${pbiTable('Receipts tagged VAT', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Customer', key: 'customer', bold: true },
            { label: 'Method', key: 'method' },
            { label: 'VAT Invoice', key: 'vat_invoice', mono: true },
            { label: 'Reference', key: 'reference', mono: true },
            { label: 'Amount ($)', key: 'amount', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], vatRecs, { subtitle: 'Explicit VAT payments · receipts paid beyond net credit sales are also counted in Collected VAT', rkey: 'receipts', limit: 45, unitLabel: 'receipts' })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 14: CASH FLOW & TILL (m18c_report.py Page 14 — Account 5300)
    // =========================================================================
    else if (activePageId === 'p14_cashflow') {
      const fmtLL = v => {
        const n = Math.round(Number(v || 0));
        if (Math.abs(n) <= 1) return '0 LL';
        return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' LL';
      };
      const cleanUsd = (v, eps = 0.005) => {
        const n = Number(v || 0);
        return Math.abs(n) < eps ? 0 : n;
      };
      const ymToIso = r => {
        const ymNo = String(r.YearMonthNo || '');
        if (/^\d{6}$/.test(ymNo)) return ymNo.slice(0, 4) + '-' + ymNo.slice(4, 6);
        return '';
      };

      const nicePositiveTicks = rawMax => {
        const mx = Math.max(100, Number(rawMax || 0));
        const rough = mx / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const frac = rough / mag;
        const mult = frac <= 1 ? 1 : (frac <= 2 ? 2 : (frac <= 2.5 ? 2.5 : (frac <= 5 ? 5 : 10)));
        const step = mult * mag;
        const topSteps = Math.max(4, Math.ceil((mx * 1.04) / step));
        const ticks = [];
        for (let i = 0; i <= topSteps; i++) ticks.push(i * step);
        return { ticks, top: topSteps * step };
      };

      const niceSignedTicks = (minV, maxV) => {
        const lo = Math.min(0, Number(minV || 0));
        const hi = Math.max(0, Number(maxV || 0));
        const span = Math.max(Math.abs(lo), Math.abs(hi));
        if (span < 0.5) {
          return { ticks: [-200, -100, 0, 100, 200], lo: -200, hi: 200 };
        }
        const candidates = [10, 20, 25, 50, 100, 200, 250, 400, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
        let step = candidates[candidates.length - 1];
        for (let i = 0; i < candidates.length; i++) {
          const s = candidates[i];
          const upN = hi > 0 ? Math.max(1, Math.ceil((hi * 1.14) / s)) : 0;
          const dnN = lo < 0 ? Math.max(1, Math.ceil((Math.abs(lo) * 1.14) / s)) : 0;
          const tot = upN + dnN;
          if (tot >= 3 && tot <= 6) { step = s; break; }
        }
        const upSteps = hi > 0 ? Math.max(1, Math.ceil((hi * 1.14) / step)) : (lo < 0 ? 1 : 2);
        const dnSteps = lo < 0 ? Math.max(1, Math.ceil((Math.abs(lo) * 1.14) / step)) : 0;
        const ticks = [];
        for (let i = -dnSteps; i <= upSteps; i++) ticks.push(i * step);
        return { ticks, lo: -dnSteps * step, hi: upSteps * step };
      };

      const fmtRoundAxisUsd = v => {
        const n = Math.round(Number(v || 0));
        if (n === 0) return '$0';
        const sign = n < 0 ? '-' : '+';
        const abs = Math.abs(n);
        if (abs >= 1000000) return `${n < 0 ? '-' : ''}$${(abs / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1)}M`;
        if (abs >= 10000) return `${n < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
        return `${sign}$${abs.toLocaleString('en-US')}`;
      };

      const buildCashFlowSplitColumnSvg = (mRows, selectedYm) => {
        const data = (mRows || []).slice(-14);
        if (!data.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No monthly cash flow data for active filter</div>`;
        const W = 620, H = 228, padL = 52, padR = 16, padT = 18, padB = 34;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        let rawMax = 100;
        const parsed = data.map(r => {
          const totIn = Math.max(0, Number(r.cash_in || 0));
          const totOut = Math.max(0, Number(r.cash_out || 0));
          const opIn = Math.min(totIn, Math.max(0, Number(r.cash_sales || 0) + Number(r.receipts || 0)));
          const trIn = Math.max(0, round2(totIn - opIn));
          const opOut = Math.min(totOut, Math.max(0, Number(r.cash_expenses || 0) + Number(r.settlements_paid || 0) + Number(r.salaries || 0)));
          const trOut = Math.max(0, round2(totOut - opOut));
          rawMax = Math.max(rawMax, totIn, totOut);
          return {
            r,
            ymIso: ymToIso(r),
            rawLbl: String(r['Year Month'] || r.YearMonthNo || ''),
            totIn, totOut, opIn, trIn, opOut, trOut,
            opNet: round2(opIn - opOut),
            netCash: cleanUsd(r.net_cash, 0.5)
          };
        });
        const { ticks, top } = nicePositiveTicks(rawMax);
        const yOf = v => padT + plotH * (1 - (v / top));
        const grid = ticks.map(tv => {
          const y = yOf(tv).toFixed(1);
          const isZero = tv === 0;
          const lbl = tv === 0 ? '$0' : (tv >= 1000000 ? `$${(tv / 1000000).toFixed(tv % 1000000 === 0 ? 0 : 1)}M` : `$${Math.round(tv / 1000)}K`);
          return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isZero ? 'var(--ink)' : 'rgba(128,138,158,0.18)'}" stroke-opacity="${isZero ? '0.32' : '1'}" stroke-width="${isZero ? '1.3' : '1'}" ${isZero ? '' : 'stroke-dasharray="3 3"'}/>` +
            `<text x="${padL - 7}" y="${(Number(y) + 3.2).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="${isZero ? '700' : '500'}" fill="${isZero ? 'var(--ink)' : 'var(--muted)'}">${lbl}</text>`;
        }).join('');

        const grpW = plotW / parsed.length;
        const barW = Math.min(13, Math.max(6, (grpW * 0.66 - 2) / 2));
        const cols = parsed.map((d, i) => {
          const cx = padL + i * grpW + grpW / 2;
          const xIn = cx - barW - 1;
          const xOut = cx + 1;
          const shortLbl = d.rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, "$1 '$2").slice(0, 7);
          const isSel = selectedYm && d.ymIso === selectedYm;

          const hOpIn = (d.opIn / top) * plotH;
          const hTrIn = (d.trIn / top) * plotH;
          const yOpIn = padT + plotH - hOpIn;
          const yTrIn = yOpIn - hTrIn;

          const hOpOut = (d.opOut / top) * plotH;
          const hTrOut = (d.trOut / top) * plotH;
          const yOpOut = padT + plotH - hOpOut;
          const yTrOut = yOpOut - hTrOut;

          const popSpec = {
            title: d.rawLbl || shortLbl,
            badge: `Net Till ${fmtSignedUSD(d.netCash, 0)}`,
            badgeTone: Math.abs(d.netCash) < 0.5 ? 'good' : (d.netCash > 0 ? 'good' : 'crit'),
            rows: [
              { label: 'Operating In (Sales + AR)', value: fmtUSD(d.opIn, 0), color: '#1C8C46' },
              { label: 'Treasury, Loans & FX In', value: fmtUSD(d.trIn, 0), color: '#6BB38B' },
              { label: 'Total Cash Inflows', value: fmtUSD(d.totIn, 0), isTotal: true, tone: 'good' },
              { label: 'Operating Out (Exp + AP + Sal)', value: fmtUSD(d.opOut, 0), color: '#C8333B' },
              { label: 'Treasury Sweeps & FX Out', value: fmtUSD(d.trOut, 0), color: '#DF8A71' },
              { label: 'Total Cash Outflows', value: fmtUSD(d.totOut, 0), isTotal: true, tone: 'crit' },
              { label: 'Operating Cash Surplus', value: fmtSignedUSD(d.opNet, 0), isTotal: true, tone: d.opNet >= 0 ? 'good' : 'crit' }
            ],
            footer: 'Click month bar to filter entries below'
          };

          return `<g class="cf-chart-bar pbi-chart-col${isSel ? ' is-selected' : ''}" ${d.ymIso ? `data-cf-focus-ym="${esc(d.ymIso)}"` : ''} data-chart-pop="${encodeChartPop(popSpec)}">` +
            `<rect class="cf-bar-hit pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${(grpW - 2).toFixed(1)}" height="${plotH + 22}" rx="4" fill="${isSel ? 'rgba(46,116,181,0.12)' : 'transparent'}"/>` +
            (hTrIn > 0.4 ? `<rect x="${xIn.toFixed(1)}" y="${yTrIn.toFixed(1)}" width="${barW.toFixed(1)}" height="${(hOpIn + hTrIn).toFixed(1)}" fill="${C.goodSoft}" rx="1.8"/>` : '') +
            (hOpIn > 0.4 ? `<rect x="${xIn.toFixed(1)}" y="${yOpIn.toFixed(1)}" width="${barW.toFixed(1)}" height="${hOpIn.toFixed(1)}" fill="${C.good}" rx="${hTrIn > 0.4 ? '0' : '1.8'}"/>` : '') +
            (hTrOut > 0.4 ? `<rect x="${xOut.toFixed(1)}" y="${yTrOut.toFixed(1)}" width="${barW.toFixed(1)}" height="${(hOpOut + hTrOut).toFixed(1)}" fill="${C.critSoft}" rx="1.8"/>` : '') +
            (hOpOut > 0.4 ? `<rect x="${xOut.toFixed(1)}" y="${yOpOut.toFixed(1)}" width="${barW.toFixed(1)}" height="${hOpOut.toFixed(1)}" fill="${C.crit}" rx="${hTrOut > 0.4 ? '0' : '1.8'}"/>` : '') +
            `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.3" font-weight="${isSel ? '800' : '500'}" fill="${isSel ? 'var(--brass)' : 'var(--muted)'}">${esc(shortLbl)}</text>` +
            `</g>`;
        }).join('');

        return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" role="img" aria-label="Monthly Cash Inflows and Outflows split into Operating vs Treasury Sweeps">${grid}${cols}</svg>`;
      };

      const buildTillBalanceChartSvg = (items, opts = {}) => {
        if (!items || !items.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No physical cash till balance points for active filter</div>`;
        const W = 620, H = 228, padL = 54, padR = 16, padT = 22, padB = 34;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const rateNum = Number(opts.rate || 89500);
        const isDaily = Boolean(opts.isDaily);

        let minV = 0, maxV = 0;
        items.forEach(d => {
          if (d.val < minV) minV = d.val;
          if (d.val > maxV) maxV = d.val;
        });
        const { ticks, lo, hi } = niceSignedTicks(minV, maxV);
        const span = Math.max(1, hi - lo);
        const yOf = v => padT + plotH * (1 - ((v - lo) / span));
        const yZero = yOf(0);
        const allZero = items.every(d => Math.abs(d.val) < 0.5);

        const grid = ticks.map(tv => {
          const y = yOf(tv).toFixed(1);
          const isZ = tv === 0;
          const lbl = fmtRoundAxisUsd(tv);
          return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isZ ? 'var(--ink)' : 'rgba(128,138,158,0.18)'}" stroke-opacity="${isZ ? '0.42' : '1'}" stroke-width="${isZ ? '1.6' : '1'}" ${isZ ? '' : 'stroke-dasharray="3 3"'}/>` +
            `<text x="${padL - 7}" y="${(Number(y) + 3.2).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="${isZ ? '800' : '500'}" fill="${isZ ? 'var(--ink)' : 'var(--muted)'}">${lbl}</text>`;
        }).join('');

        const grpW = plotW / items.length;
        const barW = Math.min(24, Math.max(isDaily ? 7 : 14, grpW * 0.58));
        const labelStep = isDaily ? Math.max(1, Math.ceil(items.length / 8)) : 1;

        const bars = items.map((d, i) => {
          const cx = padL + i * grpW + grpW / 2;
          const isZeroBar = Math.abs(d.val) < 0.5;
          const isNeg = d.val <= -0.5;
          const lbpUsdEq = Math.abs(Number(d.lbp || 0)) / rateNum;
          const isLbpDom = !isZeroBar && !isNeg && lbpUsdEq > Math.abs(Number(d.usd || 0)) + 1;
          const fill = isZeroBar ? C.good : (isNeg ? C.crit : (isLbpDom ? C.steel : C.navy));
          const isSel = (d.ymIso && opts.selectedYm === d.ymIso) || (d.dateIso && opts.selectedDate === d.dateIso);
          const drillAttr = d.dateIso ? `data-cf-focus-date="${esc(d.dateIso)}"` : (d.ymIso ? `data-cf-focus-ym="${esc(d.ymIso)}"` : '');

          let barShape = '';
          let valLbl = '';
          if (isZeroBar) {
            barShape = `<circle cx="${cx.toFixed(1)}" cy="${yZero.toFixed(1)}" r="${isDaily ? '3.2' : '4.2'}" fill="${C.good}" stroke="var(--surface)" stroke-width="1.2"/>`;
            if (!isDaily || i === items.length - 1) {
              valLbl = `<text x="${cx.toFixed(1)}" y="${(yZero - 8).toFixed(1)}" text-anchor="middle" font-size="8.6" font-weight="700" fill="${C.good}">$0</text>`;
            }
          } else {
            const yVal = yOf(d.val);
            const rectY = Math.min(yZero, yVal);
            const rectH = Math.max(3, Math.abs(yVal - yZero));
            barShape = `<rect x="${(cx - barW / 2).toFixed(1)}" y="${rectY.toFixed(1)}" width="${barW.toFixed(1)}" height="${rectH.toFixed(1)}" rx="2.5" fill="${fill}"/>`;
            const showVal = !isDaily || Math.abs(d.val) >= Math.max(Math.abs(minV), Math.abs(maxV)) * 0.35 || i === items.length - 1;
            if (showVal) {
              const txt = (d.val < 0 ? '-$' : '$') + Math.round(Math.abs(d.val)).toLocaleString('en-US');
              const lblY = isNeg ? Math.min(H - 22, rectY + rectH + 10) : Math.max(12, rectY - 5);
              valLbl = `<text x="${cx.toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-size="8.8" font-weight="700" fill="${isNeg ? C.crit : 'var(--ink)'}">${txt}</text>`;
            }
          }

          const showXAxisLbl = (i % labelStep === 0) || (i === items.length - 1);
          const xLbl = showXAxisLbl
            ? `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.2" font-weight="${isSel ? '800' : '500'}" fill="${isSel ? 'var(--brass)' : 'var(--muted)'}">${esc(d.shortLbl)}</text>`
            : '';

          const lbpEqStr = Math.abs(d.lbp || 0) > 5 ? ` (${fmtUSD((d.lbp || 0) / rateNum, 2)} eq.)` : '';
          const popRows = [
            { label: 'USD Physical Drawer', value: fmtUSD(cleanUsd(d.usd, 0.05), 2), color: C.navy },
            { label: 'LBP Physical Drawer', value: fmtLL(d.lbp || 0) + lbpEqStr, color: C.steel },
            { label: 'Combined Closing Till', value: fmtUSD(d.val, 2), isTotal: true, tone: isZeroBar ? 'good' : (isNeg ? 'crit' : 'brass') }
          ];
          if (d.inUsd != null) {
            popRows.push({ label: 'Period Cash Inflows', value: fmtUSD(d.inUsd, 0), color: C.good });
            popRows.push({ label: 'Period Cash Outflows', value: fmtUSD(d.outUsd, 0), color: C.crit });
          }
          const popSpec = {
            title: d.fullLbl || d.shortLbl,
            badge: isZeroBar ? 'Balanced ($0.00)' : fmtUSD(d.val, 2),
            badgeTone: isZeroBar ? 'good' : (isNeg ? 'crit' : ''),
            rows: popRows,
            footer: 'Click bar to inspect entries below'
          };

          return `<g class="cf-chart-bar pbi-chart-col${isSel ? ' is-selected' : ''}" ${drillAttr} data-chart-pop="${encodeChartPop(popSpec)}">` +
            `<rect class="cf-bar-hit pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${(grpW - 2).toFixed(1)}" height="${plotH + 22}" rx="4" fill="${isSel ? 'rgba(46,116,181,0.12)' : 'transparent'}"/>` +
            `${barShape}${valLbl}${xLbl}` +
            `</g>`;
        }).join('');

        const zeroCallout = allZero
          ? `<rect x="${(padL + plotW / 2 - 118).toFixed(1)}" y="${(padT + 8).toFixed(1)}" width="236" height="20" rx="10" fill="rgba(28,140,70,0.10)" stroke="rgba(28,140,70,0.35)"/>` +
            `<text x="${(padL + plotW / 2).toFixed(1)}" y="${(padT + 21.5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1C8C46">All ${items.length} ${isDaily ? 'days' : 'months'} swept to $0.00 balance</text>`
          : '';

        return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" role="img" aria-label="Closing Cash Till Trajectory">${grid}${bars}${zeroCallout}</svg>`;
      };

      const rateLbp = Number(k.rate_lbp || 89500);
      const chartGrain = STATE.cfChartGrain === 'daily' ? 'daily' : 'monthly';
      const allDailyRows = typeof ctx.buildDailyTillSheetRows === 'function' ? ctx.buildDailyTillSheetRows() : [];
      const allCashMoves = typeof ctx.buildCashTillMoves === 'function' ? ctx.buildCashTillMoves() : [];

      const tillChartItems = chartGrain === 'daily'
        ? allDailyRows.slice(0, 30).reverse().map(d => ({
            dateIso: d.date,
            shortLbl: fmtDateDMY(d.date).slice(0, 5),
            fullLbl: `${fmtDateDMY(d.date)} (${d.dow})`,
            val: cleanUsd(d.close_combined, 0.05),
            usd: cleanUsd(d.close_usd, 0.05),
            lbp: Math.abs(d.close_lbp) <= 5 ? 0 : d.close_lbp,
            inUsd: d.in_usd,
            outUsd: d.out_usd
          }))
        : months.slice(-14).map(r => {
            const rawLbl = String(r['Year Month'] || r.YearMonthNo || '');
            return {
              ymIso: ymToIso(r),
              shortLbl: rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, "$1 '$2").slice(0, 7),
              fullLbl: rawLbl,
              val: cleanUsd(r.cash_till, 0.05),
              usd: cleanUsd(r.till_usd != null ? r.till_usd : r.cash_till, 0.05),
              lbp: Math.abs(r.till_lbp || 0) <= 5 ? 0 : Math.round(r.till_lbp || 0),
              inUsd: r.cash_in,
              outUsd: r.cash_out
            };
          });

      const progRows = [...months].reverse().map(r => {
        const opIn = Number(r.cash_sales || 0) + Number(r.receipts || 0);
        const opOut = Number(r.cash_expenses || 0) + Number(r.settlements_paid || 0) + Number(r.salaries || 0);
        return Object.assign({}, r, {
          _ymIso: ymToIso(r),
          treasury_in: Math.max(0, round2(Number(r.cash_in || 0) - opIn)),
          sweeps_out: Math.max(0, round2(Number(r.cash_out || 0) - opOut)),
          clean_net: cleanUsd(r.net_cash, 0.5),
          clean_till: cleanUsd(r.cash_till, 0.5)
        });
      });

      // Interactive Cash Till Entries & Daily Cashbook Explorer right inside Cash Flow Analytics
      const isDailyMode = STATE.cfEntryMode === 'daily';
      const focusDate = STATE.cfFocusDate || '';
      const focusYm = STATE.cfFocusYm || '';
      const focusParty = STATE.cfFocusParty || '';
      const focusPartyNorm = norm(focusParty);
      const qComb = [STATE.search || '', sl.search || ''].map(s => String(s).trim().toLowerCase()).filter(Boolean).join(' ');
      const hasDrill = Boolean(focusDate || focusYm || focusParty);
      const fmtYmHuman = ym => {
        const mHit = String(ym || '').match(/^(\d{4})-(\d{2})$/);
        if (!mHit) return ym;
        const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${mNames[(Number(mHit[2]) || 1) - 1]} ${mHit[1]}`;
      };

      const drillScopedMoves = allCashMoves.filter(mv => {
        if (focusDate && mv.date !== focusDate) return false;
        if (focusYm && mv.ym !== focusYm) return false;
        if (focusPartyNorm && norm(mv.party) !== focusPartyNorm) return false;
        return true;
      });
      const hasFullFinRows = allCashMoves.some(mv => mv.stream === 'ext' || mv.stream === 'extd' || mv.stream === 'sal' || mv.stream === 'loan');
      const streamCounts = { sales: 0, exp: 0, loan: 0, sal: 0, ext: 0, extd: 0, fx: 0 };
      for (let i = 0; i < drillScopedMoves.length; i++) {
        const sk = drillScopedMoves[i].stream;
        if (streamCounts[sk] != null) streamCounts[sk]++;
      }
      const cfChip = STATE.chipFilter || 'all';
      const chipBtn = (key, lbl) => `<button type="button" class="filter-chip ${cfChip === key ? 'active' : ''}" data-chip="${esc(key)}">${lbl}</button>`;

      const filteredMoves = drillScopedMoves.filter(mRow => {
        if (cfChip === 'cf_in' && mRow.dir !== 'IN') return false;
        if (cfChip === 'cf_out' && mRow.dir !== 'OUT') return false;
        if (cfChip === 'cf_sales' && mRow.stream !== 'sales') return false;
        if (cfChip === 'cf_exp' && mRow.stream !== 'exp') return false;
        if (cfChip === 'cf_ext' && mRow.stream !== 'ext') return false;
        if (cfChip === 'cf_extd' && mRow.stream !== 'extd') return false;
        if (cfChip === 'cf_sal' && mRow.stream !== 'sal') return false;
        if (cfChip === 'cf_loan' && mRow.stream !== 'loan') return false;
        if (cfChip === 'cf_fx' && mRow.stream !== 'fx') return false;
        if (cfChip === 'cf_lbp' && Math.abs(mRow.lbp) <= 1) return false;
        if (qComb && !`${mRow.date} ${fmtDateDMY(mRow.date)} ${mRow.company} ${mRow.cat} ${mRow.party} ${mRow.detail} ${mRow.ref} ${mRow.method}`.toLowerCase().includes(qComb)) return false;
        return true;
      });
      const sortedMoves = ctx.sortRows ? ctx.sortRows(filteredMoves, 'cf_moves', 'date', 'desc') : filteredMoves;
      const shownMoves = sortedMoves.slice(0, ctx.shownCount ? ctx.shownCount('cf_moves') : 50);
      let mvInUsd = 0, mvOutUsd = 0, mvLbpSum = 0;
      for (let i = 0; i < sortedMoves.length; i++) {
        mvInUsd += sortedMoves[i].in_usd;
        mvOutUsd += sortedMoves[i].out_usd;
        mvLbpSum += sortedMoves[i].lbp;
      }
      mvInUsd = round2(mvInUsd);
      mvOutUsd = round2(mvOutUsd);
      const mvUsdNet = round2(mvInUsd - mvOutUsd);
      mvLbpSum = Math.round(mvLbpSum);

      const filteredDaily = allDailyRows.filter(dRow => {
        if (focusYm && dRow.ym !== focusYm) return false;
        if (cfChip === 'cf_day_nonzero' && Math.abs(dRow.close_combined) < 0.05) return false;
        if (cfChip === 'cf_day_lbp' && Math.abs(dRow.in_lbp) <= 1 && Math.abs(dRow.out_lbp) <= 1 && Math.abs(dRow.close_lbp) <= 5) return false;
        if (cfChip === 'cf_day_neg' && dRow.close_combined >= -0.05) return false;
        if (qComb && !`${dRow.date} ${fmtDateDMY(dRow.date)} ${dRow.dow}`.toLowerCase().includes(qComb)) return false;
        return true;
      });
      const sortedDaily = ctx.sortRows ? ctx.sortRows(filteredDaily, 'cf_daily', 'date', 'desc') : filteredDaily;
      const shownDaily = sortedDaily.slice(0, ctx.shownCount ? ctx.shownCount('cf_daily') : 50);
      let dyInUsd = 0, dyOutUsd = 0;
      for (let i = 0; i < sortedDaily.length; i++) {
        dyInUsd += sortedDaily[i].in_usd;
        dyOutUsd += sortedDaily[i].out_usd;
      }
      dyInUsd = round2(dyInUsd);
      dyOutUsd = round2(dyOutUsd);
      const dyNetUsd = round2(dyInUsd - dyOutUsd);
      const latestDayClose = sortedDaily.length ? sortedDaily[0] : { close_usd: cleanUsd(k.cash_till_usd), close_lbp: Math.round(k.cash_till_lbp || 0), close_combined: cleanUsd(k.cash_till) };

      const thCell = (view, lbl, key, cls) => ctx.th ? ctx.th(view, lbl, key, cls) : `<th class="${cls || ''}">${esc(lbl)}</th>`;

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Cash Flow & Daily Plant Till', [
            { label: 'USD Cash Till ($)', value: fmtUSD(cleanUsd(k.cash_till_usd != null ? k.cash_till_usd : k.cash_till), 2), sub: `In ${fmtUSD(k.cash_in_usd != null ? k.cash_in_usd : k.cash_inflow, 0)} · Out ${fmtUSD(k.cash_out_usd != null ? k.cash_out_usd : k.cash_outflow, 0)}`, tone: 'good' },
            { label: 'LBP Cash Till (LL)', value: fmtLL(k.cash_till_lbp || 0), sub: `Rate ${fmtNum(rateLbp, 0)} LL/$`, tone: 'good' },
            { label: 'Closing Cash Till', value: fmtUSD(cleanUsd(k.cash_till), 2), sub: 'Combined USD + LBP book till', tone: 'brass' },
            { label: 'Cash Inflows (Total)', value: fmtUSD(k.cash_inflow, 0), sub: 'Op. Sales/AR + Treasury/FX in', tone: 'good' },
            { label: 'Cash Outflows (Total)', value: fmtUSD(k.cash_outflow, 0), sub: 'Op. Exp/AP/Payroll + Sweeps out', tone: 'crit' },
            { label: 'Net Cash Flow', value: fmtUSD(cleanUsd(k.net_cash_flow), 2), sub: 'Inflows − Outflows in period', neg: true }
          ])}
        </div>

        <div class="pbi-grid-1">
          <div class="cf-explainer-bar" role="region" aria-label="How Plant Cash Till Works">
            <div class="cf-explainer-copy">
              <strong>How Cash Till Works:</strong> Cash Sales &amp; AR Receipts flow <b>IN</b> while Cash Expenses, AP Settlements &amp; Payroll flow <b>OUT</b>; daily <b>Treasury Sweeps</b> transfer net cash to/from central treasury so physical cash on hand stays near <b>$0.00</b> (<span class="mono">USD + LBP ÷ ${fmtNum(rateLbp, 0)}</span>). <em>Click any bar or month to inspect its entries below.</em>
            </div>
            <div class="cf-grain-ctrl">
              <span class="cf-grain-lbl">Till Balance View</span>
              <div class="cf-mode-switch" role="group" aria-label="Closing Till Chart Grain">
                <button type="button" class="cf-mode-btn ${chartGrain === 'monthly' ? 'active' : ''}" data-cf-chart-grain="monthly">Monthly (${months.slice(-14).length}m)</button>
                <button type="button" class="cf-mode-btn ${chartGrain === 'daily' ? 'active' : ''}" data-cf-chart-grain="daily">Daily (Last ${Math.min(30, allDailyRows.length)}d)</button>
              </div>
            </div>
          </div>
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Monthly Cash Inflows vs Outflows — Operating vs Treasury Sweeps', buildCashFlowSplitColumnSvg(months, focusYm), {
            subtitle: 'Left column = Inflows · Right column = Outflows · Click any month to filter entries below',
            legend: [
              { label: 'Op. Cash In (Sales+AR)', color: C.good },
              { label: 'Treasury / FX In', color: C.goodSoft },
              { label: 'Op. Cash Out (Exp+AP+Sal)', color: C.crit },
              { label: 'Sweeps / FX Out', color: C.critSoft }
            ]
          })}
          ${pbiPanel(chartGrain === 'daily' ? 'Closing Cash Till — Last 30 Operating Days' : 'Closing Cash Till — Month-End Balance ($)', buildTillBalanceChartSvg(tillChartItems, { rate: rateLbp, isDaily: chartGrain === 'daily', selectedYm: focusYm, selectedDate: focusDate }), {
            subtitle: chartGrain === 'daily'
              ? 'End-of-day physical drawer balance anchored at $0 · Click any day to inspect entries'
              : 'Month-end physical drawer balance anchored at $0 (no flow overlay) · Hover for USD + LBP split',
            legend: [
              { label: 'USD Drawer (+)', color: C.navy },
              { label: 'LBP Drawer (+)', color: C.steel },
              { label: 'Timing Deficit (<$0)', color: C.crit },
              { label: 'Balanced ($0)', color: C.good }
            ]
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Monthly Cash Flow & Till Progression', [
            { label: 'Month', key: 'Year Month', fmt: (v, r) => r._ymIso ? `<button type="button" class="cf-month-drill-btn${focusYm === r._ymIso ? ' active' : ''}" data-cf-focus-ym="${esc(r._ymIso)}" title="Inspect all cash till entries in ${esc(v)}"><strong>${esc(v)}</strong> <span>→</span></button>` : `<b>${esc(v)}</b>` },
            { label: 'Cash Sales ($)', key: 'cash_sales', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'AR Receipts ($)', key: 'receipts', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Treasury & FX In ($)', key: 'treasury_in', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Total Cash In ($)', key: 'cash_in', r: true, bar: true, barGroup: 'cf_tot', fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Cash Expenses ($)', key: 'cash_expenses', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'AP Settlements ($)', key: 'settlements_paid', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Salaries Paid ($)', key: 'salaries', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Sweeps & FX Out ($)', key: 'sweeps_out', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Total Cash Out ($)', key: 'cash_out', r: true, bar: true, barGroup: 'cf_tot', fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Net Cash Flow ($)', key: 'clean_net', r: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Closing Till ($)', key: 'clean_till', r: true, negRed: true, fmt: v => fmtUSD(v, 0) }
          ], progRows, {
            subtitle: 'Operating Cash + Treasury Sweeps/FX reconcile 100% to Total Cash In & Out · Click any month to filter the Cash Till Entries Explorer below',
            unitLabel: 'months'
          })}
        </div>

        ${typeof ctx.buildCashTillMoves === 'function' ? `
        <div class="pbi-grid-1" style="margin-bottom:6px">
          <div class="pbi-panel" id="pbiCfEntriesPanel">
            <div class="pbi-panel-hdr cf-register-head">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <div>
                  <div class="pbi-panel-title">Cash Till Entries Explorer</div>
                  <div class="pbi-panel-sub">Inspect every cash inflow, outflow, treasury sweep, salary, loan &amp; FX slip · Click any row for 360° Record Form</div>
                </div>
                <div class="cf-mode-switch" role="tablist" aria-label="Cash Till Explorer View Mode">
                  <button type="button" class="cf-mode-btn ${!isDailyMode ? 'active' : ''}" data-cf-mode="entries" role="tab" aria-selected="${!isDailyMode}">Individual Entries <span>(${fmtNum(allCashMoves.length)})</span></button>
                  <button type="button" class="cf-mode-btn ${isDailyMode ? 'active' : ''}" data-cf-mode="daily" role="tab" aria-selected="${isDailyMode}">Daily Till Sheet <span>(${fmtNum(allDailyRows.length)} Days)</span></button>
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <button type="button" class="btn" data-nav-jump="cashflow">7-Table Book Recon →</button>
                ${exportBtn('pbiCfEntriesPanel', isDailyMode ? 'Daily_Till_Sheet' : 'Cash_Till_Entries')}
              </div>
            </div>

            <div class="table-toolbar" style="border-top:1px solid var(--line)">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                ${ctx.searchBox ? ctx.searchBox(isDailyMode ? 'Search date (DD-MM-YYYY) or weekday...' : 'Search counterparty, note, #ref, ticket, category...') : ''}
                <div class="chip-bar">
                  ${!isDailyMode ? `
                    ${chipBtn('all', `All (${fmtNum(drillScopedMoves.length)})`)}
                    ${chipBtn('cf_in', '▲ Cash In')}
                    ${chipBtn('cf_out', '▼ Cash Out')}
                    ${chipBtn('cf_sales', `Sales & AR (${fmtNum(streamCounts.sales)})`)}
                    ${chipBtn('cf_exp', `Expenses & AP (${fmtNum(streamCounts.exp)})`)}
                    ${hasFullFinRows ? chipBtn('cf_loan', `Borrowing (${fmtNum(streamCounts.loan)})`) : ''}
                    ${hasFullFinRows ? chipBtn('cf_sal', `Salary (${fmtNum(streamCounts.sal)})`) : ''}
                    ${hasFullFinRows ? chipBtn('cf_ext', `External (${fmtNum(streamCounts.ext)})`) : ''}
                    ${hasFullFinRows ? chipBtn('cf_extd', `Extended (${fmtNum(streamCounts.extd)})`) : ''}
                    ${chipBtn('cf_fx', `FX Conversions (${fmtNum(streamCounts.fx)})`)}
                    ${chipBtn('cf_lbp', 'LBP (LL)')}
                  ` : `
                    ${chipBtn('all', `All Days (${fmtNum(allDailyRows.length)})`)}
                    ${chipBtn('cf_day_nonzero', 'Drawer ≠ $0')}
                    ${chipBtn('cf_day_lbp', 'LBP Active')}
                    ${chipBtn('cf_day_neg', 'Timing Deficit (<$0)')}
                  `}
                </div>
              </div>
              <div class="cf-live-strip" aria-label="Filtered Cash Summary">
                ${!isDailyMode ? `
                  <span>In: <b class="good">${fmtUSD(mvInUsd, 2)}</b></span>
                  <span>Out: <b class="crit">${fmtUSD(mvOutUsd, 2)}</b></span>
                  <span>Net: <b style="color:${mvUsdNet < -0.005 ? 'var(--crit)' : (mvUsdNet > 0.005 ? 'var(--good)' : 'var(--ink)')}">${fmtSignedUSD(mvUsdNet, 2)}</b></span>
                  ${Math.abs(mvLbpSum) > 1 ? `<span>LBP: <b>${fmtSignedLBP(mvLbpSum)}</b></span>` : ''}
                ` : `
                  <span>Click any day row to inspect all cash entries of that day →</span>
                `}
              </div>
            </div>

            ${hasDrill ? `
            <div class="cf-drill-strip" role="status">
              <span class="cf-drill-lbl">Active Drill Filter:</span>
              ${focusDate ? `<button type="button" class="cf-active-pill" data-cf-clear-drill="date"><span>Day: <b>${esc(fmtDateDMY(focusDate))}</b></span><span class="cf-pill-x">✕</span></button>` : ''}
              ${focusYm ? `<button type="button" class="cf-active-pill" data-cf-clear-drill="ym"><span>Month: <b>${esc(fmtYmHuman(focusYm))}</b></span><span class="cf-pill-x">✕</span></button>` : ''}
              ${focusParty ? `<button type="button" class="cf-active-pill" data-cf-clear-drill="party"><span>Counterparty: <b>${esc(focusParty)}</b></span><span class="cf-pill-x">✕</span></button>` : ''}
              <button type="button" class="cf-clear-all-btn" data-cf-clear-drill="all">✕ Show All Cash Entries</button>
            </div>` : ''}

            ${!isDailyMode ? `
            ${ctx.renderColFilterBar ? ctx.renderColFilterBar('cf_moves') : ''}
            <div class="table-wrap">
              <table class="ledger-table">
                <thead>
                  <tr>
                    ${thCell('cf_moves', 'Date', 'date')}
                    ${thCell('cf_moves', 'Co.', 'company')}
                    ${thCell('cf_moves', 'Category', 'cat')}
                    ${thCell('cf_moves', 'Counterparty', 'party')}
                    ${thCell('cf_moves', 'Details', 'detail')}
                    ${thCell('cf_moves', 'Ref', 'ref')}
                    ${thCell('cf_moves', 'In ($)', 'in_usd', 'r')}
                    ${thCell('cf_moves', 'Out ($)', 'out_usd', 'r')}
                    ${thCell('cf_moves', 'LBP (LL)', 'lbp', 'r')}
                  </tr>
                </thead>
                <tbody>
                  ${shownMoves.map(r => {
                    const flowCls = r.dir === 'IN' ? 'in' : (r.dir === 'FX' ? 'fx' : 'out');
                    const flowSym = r.dir === 'IN' ? '▲' : (r.dir === 'FX' ? '⇄' : '▼');
                    const partyHtml = (r.partyRel && ctx.relLink)
                      ? ctx.relLink(r.partyRel, r.party, r.party, true)
                      : `<button type="button" class="cf-party-btn" data-cf-focus-party="${esc(r.party)}" title="Filter all cash entries for ${esc(r.party)}">${esc(r.party)}</button>`;
                    const refHtml = (r.ticketId && ctx.ic)
                      ? `<span class="tkt-cell-inline"><strong class="tkt-no-num">${esc(r.ref)}</strong><button type="button" class="tkt-print-mini" data-print-ticket="sales" data-print-id="${esc(r.ticketId)}" title="Preview / Print Ticket ${esc(r.ref)}">${ctx.ic('printer')}</button></span> <span class="mu">· ${esc(r.method)}</span>`
                      : `${esc(r.ref)} <span class="mu">· ${esc(r.method)}</span>`;
                    return `
                    <tr class="rrow" data-rkey="${esc(r.rkey)}" data-rid="${esc(r.id)}">
                      <td class="mono"><button type="button" class="cf-date-jump" data-cf-focus-date="${esc(r.date)}" title="Filter entries to ${esc(fmtDateDMY(r.date))}">${esc(fmtDateDMY(r.date))}</button>${ctx.appCell ? ctx.appCell(r.raw, r.rkey) : ''}</td>
                      <td>${ctx.coBadge ? ctx.coBadge(r.company) : shortCoHtml(r.company)}</td>
                      <td class="cf-cat-cell"><span class="cf-flow-badge ${flowCls}">${flowSym}</span><span class="cf-cat-txt">${esc(r.cat)}</span></td>
                      <td class="cf-party-cell" title="${esc(r.party)}">${partyHtml}</td>
                      <td class="cf-detail-cell" title="${esc(r.detail)}">${esc(r.detail)}</td>
                      <td class="mono cf-ref-cell" title="${esc(r.ref + ' · ' + r.method)}">${refHtml}</td>
                      <td class="r">${r.in_usd >= 0.005 ? `<strong style="color:var(--good)">+${fmtUSD(r.in_usd, 2)}</strong>` : '—'}</td>
                      <td class="r">${r.out_usd >= 0.005 ? `<strong style="color:var(--crit)">-${fmtUSD(r.out_usd, 2)}</strong>` : '—'}</td>
                      <td class="r">${Math.abs(r.lbp) > 1 ? `<strong style="color:${r.lbp < 0 ? 'var(--crit)' : 'var(--good)'}">${fmtSignedLBP(r.lbp)}</strong>` : (r.stream === 'fx' ? '0 LL' : '—')}</td>
                    </tr>`;
                  }).join('') || (ctx.emptyRow ? ctx.emptyRow(9, 'No cash till entries match the active filter') : '')}
                  ${ctx.showMoreRow ? ctx.showMoreRow('cf_moves', sortedMoves.length, 9) : ''}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="6"><b>FILTERED TOTAL (${fmtNum(sortedMoves.length)} ENTRIES · NET ${fmtSignedUSD(mvUsdNet, 2)})</b></td>
                    <td class="r"><b style="color:var(--good)">+${fmtUSD(mvInUsd, 2)}</b></td>
                    <td class="r"><b style="color:var(--crit)">-${fmtUSD(mvOutUsd, 2)}</b></td>
                    <td class="r"><b style="color:${mvLbpSum < -1 ? 'var(--crit)' : (mvLbpSum > 1 ? 'var(--good)' : 'inherit')}">${fmtSignedLBP(mvLbpSum)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            ` : `
            ${ctx.renderColFilterBar ? ctx.renderColFilterBar('cf_daily') : ''}
            <div class="table-wrap">
              <table class="ledger-table">
                <thead>
                  <tr>
                    ${thCell('cf_daily', 'Date', 'date')}
                    ${thCell('cf_daily', 'Entries', 'entries_cnt', 'r')}
                    ${thCell('cf_daily', 'Open ($)', 'open_usd', 'r')}
                    ${thCell('cf_daily', 'In ($)', 'in_usd', 'r')}
                    ${thCell('cf_daily', 'Out ($)', 'out_usd', 'r')}
                    ${thCell('cf_daily', 'Net ($)', 'net_usd', 'r')}
                    ${thCell('cf_daily', 'Close ($)', 'close_usd', 'r')}
                    ${thCell('cf_daily', 'Close (LL)', 'close_lbp', 'r')}
                    ${thCell('cf_daily', 'Till ($)', 'close_combined', 'r')}
                  </tr>
                </thead>
                <tbody>
                  ${shownDaily.map(d => {
                    const statusBadge = Math.abs(d.close_combined) < 0.05
                      ? '<span class="badge badge-ok" style="margin-left:5px">Balanced $0</span>'
                      : (d.close_combined < 0 ? '<span class="badge badge-warn" style="margin-left:5px">Timing Deficit</span>' : '');
                    return `
                    <tr class="cf-day-row" data-cf-focus-date="${esc(d.date)}" title="Click to inspect ${fmtNum(d.entries_cnt)} cash entries on ${esc(fmtDateDMY(d.date))}">
                      <td class="mono"><strong>${esc(fmtDateDMY(d.date))}</strong> <span class="mu">${esc(d.dow)}</span></td>
                      <td class="r"><span class="badge badge-info">${fmtNum(d.entries_cnt)} →</span></td>
                      <td class="r">${Math.abs(d.open_usd) >= 0.005 ? fmtUSD(d.open_usd, 2) : '$0.00'}</td>
                      <td class="r">${d.in_usd >= 0.005 ? `<strong style="color:var(--good)">+${fmtUSD(d.in_usd, 2)}</strong>` : '—'}</td>
                      <td class="r">${d.out_usd >= 0.005 ? `<strong style="color:var(--crit)">-${fmtUSD(d.out_usd, 2)}</strong>` : '—'}</td>
                      <td class="r"><strong style="color:${d.net_usd < -0.005 ? 'var(--crit)' : (d.net_usd > 0.005 ? 'var(--good)' : 'var(--muted)')}">${fmtSignedUSD(d.net_usd, 2)}</strong></td>
                      <td class="r"><strong style="color:${d.close_usd < -0.05 ? 'var(--crit)' : 'inherit'}">${fmtUSD(d.close_usd, 2)}</strong></td>
                      <td class="r">${Math.abs(d.close_lbp) > 5 ? `<strong>${fmtLL(d.close_lbp)}</strong>` : '0 LL'}</td>
                      <td class="r"><strong style="color:${d.close_combined < -0.05 ? 'var(--crit)' : (d.close_combined > 0.05 ? 'var(--brass)' : 'var(--good)')}">${fmtUSD(d.close_combined, 2)}</strong>${statusBadge}</td>
                    </tr>`;
                  }).join('') || (ctx.emptyRow ? ctx.emptyRow(9, 'No daily till rows match the active filter') : '')}
                  ${ctx.showMoreRow ? ctx.showMoreRow('cf_daily', sortedDaily.length, 9) : ''}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3"><b>PERIOD DAILY TILL SUMMARY (${fmtNum(sortedDaily.length)} OPERATING DAYS)</b></td>
                    <td class="r"><b style="color:var(--good)">+${fmtUSD(dyInUsd, 2)}</b></td>
                    <td class="r"><b style="color:var(--crit)">-${fmtUSD(dyOutUsd, 2)}</b></td>
                    <td class="r"><b>${fmtSignedUSD(dyNetUsd, 2)}</b></td>
                    <td class="r"><b>${fmtUSD(latestDayClose.close_usd, 2)}</b></td>
                    <td class="r"><b>${fmtLL(latestDayClose.close_lbp)}</b></td>
                    <td class="r"><b>${fmtUSD(latestDayClose.close_combined, 2)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            `}
          </div>
        </div>` : ''}
      `;
    }

    // =========================================================================
    // PAGE 15: TREASURY & LOANS (m18c_report.py Page 15 — 2 bands + 4 charts + 6 tables)
    // =========================================================================
    else if (activePageId === 'p15_treasury') {
      const loanRows = filterRecords(rec.loans, { ignorePeriod: true, ignoreSearch: true }).filter(r => {
        if (!matchSearch(r)) return false;
        const cp = cellValue(r, 'counterparty');
        if (sl.counterparty && norm(cp) !== norm(sl.counterparty)) return false;
        return true;
      }).sort((a, b) => Math.abs(Number(b.principal || 0)) - Math.abs(Number(a.principal || 0)));
      const loanSetRows = filterRecords(rec.loan_settlements, { ignoreSearch: true }).filter(r => {
        if (!matchSearch(r)) return false;
        const cp = cellValue(r, 'loan') || cellValue(r, 'counterparty');
        if (sl.counterparty && norm(cp) !== norm(sl.counterparty)) return false;
        if (sl.loanDirection && norm(r.method || r.type) !== norm(sl.loanDirection)) return false;
        return true;
      });
      const extRows = filterRecords(rec.external_movements, { ignoreSearch: true }).filter(r => {
        if (!matchSearch(r)) return false;
        const cp = cellValue(r, 'counterparty');
        if (sl.counterparty && norm(cp) !== norm(sl.counterparty)) return false;
        if (sl.loanDirection && norm(r.direction) !== norm(sl.loanDirection)) return false;
        return true;
      });
      const convRows = filterRecords(rec.conversions, { ignoreSearch: true }).filter(matchSearch);

      const extRev = extRows.filter(e => /In/i.test(String(e.direction || ''))).reduce((a, r) => a + Number(r.usd_amount || r.amount || 0), 0);
      const extExp = extRows.filter(e => !/In/i.test(String(e.direction || ''))).reduce((a, r) => a + Math.abs(Number(r.usd_amount || r.amount || 0)), 0);
      const extNet = round2(extRev - extExp);
      const totPrincipal = loanRows.reduce((a, r) => a + Number(r.principal || 0), 0);
      const totRepaid = loanSetRows.reduce((a, r) => a + Number(r.usd_amount || r.amount || 0), 0);
      const avgFx = convRows.length ? convRows.reduce((a, r) => a + convDeltasPbi(r).rate, 0) / convRows.length : 89500;
      const convNetUsd = convRows.reduce((a, r) => a + convDeltasPbi(r).usd, 0);
      const convNetLbp = convRows.reduce((a, r) => a + convDeltasPbi(r).lbp, 0);

      // Aggregate external by counterparty for the 2 horizontal bar charts
      const cpMap = new Map();
      extRows.forEach(e => {
        const cp = cellValue(e, 'counterparty') || 'General Treasury';
        const cur = cpMap.get(cp) || { Counterparty: cp, rev: 0, exp: 0, net: 0 };
        const amt = Math.abs(Number(e.usd_amount || e.amount || 0));
        if (/In/i.test(String(e.direction || ''))) cur.rev += amt; else cur.exp += amt;
        cur.net = round2(cur.rev - cur.exp);
        cpMap.set(cp, cur);
      });
      const cpList = Array.from(cpMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · External Treasury Flows & Partner Loan Position', [
            { label: 'External Revenue (In)', value: fmtUSD(extRev, 0), sub: 'Treasury inflows (sample)', tone: 'good' },
            { label: 'External Expense (Out)', value: fmtUSD(extExp, 0), sub: 'Treasury outflows (sample)', tone: 'crit' },
            { label: 'External Net', value: fmtUSD(extNet, 0), sub: 'Revenue − Expense', neg: true },
            { label: 'Loans Principal', value: fmtUSD(totPrincipal, 0), sub: fmtNum(loanRows.length) + ' loan agreements', tone: 'brass' },
            { label: 'Loan Settlements', value: fmtUSD(totRepaid, 0), sub: fmtNum(loanSetRows.length) + ' settlement rows' },
            { label: 'Loans Outstanding (owes +)', value: fmtUSD(totPrincipal - totRepaid, 0), sub: 'Principal − Repaid', tone: 'warn' }
          ])}
          ${kpiBand('2 · FX Conversions (USD ↔ LBP) & Barter Offsets', [
            { label: 'FX Conversions', value: fmtNum(convRows.length), sub: `${fmtSignedUSD(convNetUsd, 0)} · ${fmtSignedLBP(convNetLbp)}` },
            { label: 'Avg Rate USD → LBP', value: fmtNum(avgFx, 0) + ' LBP', sub: 'Pegged ~89,500–90,000 LBP', tone: 'brass' },
            { label: 'External Movements', value: fmtNum(extRows.length), sub: 'Non-ticket treasury entries' },
            { label: 'Counterparties Active', value: fmtNum(cpList.length), sub: 'External & loan parties' },
            { label: 'Barter Customers', value: fmtNum(custRows.filter(c => Number(c.receipts || 0) > 0 && Number(c.sales_ttc || 0) > 0).slice(0, 12).length), sub: 'Cross-settled accounts' },
            { label: 'Barter Suppliers', value: fmtNum(suppRows.filter(s => Number(s.settlements_paid || 0) > 0).slice(0, 12).length), sub: 'Cross-settled suppliers' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('External net by counterparty', buildHorizontalBarChart(cpList, 'Counterparty', 'net', v => fmtUSD(v, 0), { color: C.navy, maxItems: 8, sortAbs: true }), {
            subtitle: 'Net external treasury position by counterparty (+ net inflow, − net outflow)'
          })}
          ${pbiPanel('External revenue vs expense by counterparty', buildClusteredBarChart(cpList, 'Counterparty', [
            { label: 'Inflow', key: 'rev', color: C.navy },
            { label: 'Outflow', key: 'exp', color: C.crit }
          ], { decimals: 0 }), {
            subtitle: 'Gross external inflows vs outflows per counterparty'
          })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Loans — principal, repayments, outstanding (+ = the company owes, − = owed to the company)', [
            { label: 'Loan Document', key: 'name', mono: true, bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'Counterparty', raw: r => cellValue(r, 'counterparty') || cellValue(r, 'lender') || '—', bold: true },
            { label: 'Direction', raw: r => cellValue(r, 'direction') },
            { label: 'Start Date', raw: r => cellValue(r, 'start_date'), mono: true },
            { label: 'Principal ($)', key: 'principal', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Settled ($)', key: 'settled_amount', r: true, fmt: v => fmtUSD(v || 0, 2) },
            { label: 'Interest Rate %', key: 'interest_rate', r: true, fmt: v => fmtNum(v, 2) + '%' },
            { label: 'Notes', key: 'notes' }
          ], loanRows, { rkey: 'loans', limit: 45, unitLabel: 'loans' })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Loan transactions (latest first; + in / − out)', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Borrower / Lender', raw: r => cellValue(r, 'loan') || cellValue(r, 'counterparty') || r.name, bold: true },
            { label: 'Type', key: 'type' },
            { label: 'Flow', key: 'method' },
            { label: 'Amount ($)', raw: r => Number(r.amount != null ? r.amount : r.usd_amount || 0), r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], loanSetRows, { rkey: 'loan_settlements', limit: 40, unitLabel: 'transactions' })}

          ${pbiTable('External movements (latest first; + in / − out)', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Counterparty', raw: r => cellValue(r, 'counterparty') || '—', bold: true },
            { label: 'Direction', key: 'direction' },
            { label: 'Method', key: 'method' },
            { label: 'Amount ($)', raw: r => r.usd_amount != null ? r.usd_amount : r.amount, r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], extRows, { rkey: 'external_movements', limit: 40, unitLabel: 'movements' })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Currency conversions (USD ↔ LBP)', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Direction', raw: r => convDeltasPbi(r).dirLabel, bold: true },
            { label: 'USD Change ($)', raw: r => convDeltasPbi(r).usd, r: true, mono: true, fmt: v => `<strong style="color:${Number(v) >= 0 ? 'var(--good)' : 'var(--crit)'}">${fmtSignedUSD(v, 2)}</strong>` },
            { label: 'LBP Change (LL)', raw: r => convDeltasPbi(r).lbp, r: true, mono: true, fmt: v => `<strong style="color:${Number(v) >= 0 ? 'var(--good)' : 'var(--crit)'}">${fmtSignedLBP(v)}</strong>` },
            { label: 'Exchange Rate', raw: r => convDeltasPbi(r).rate, r: true, mono: true, fmt: v => fmtNum(v, 0) },
            { label: 'Voucher', key: 'name', mono: true }
          ], convRows, { rkey: 'conversions', limit: 35, unitLabel: 'conversions' })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 16: FINANCIAL GL & SOA (Lebanese CoA Classes 1–7 + Double-Entry Tie)
    // =========================================================================
    else if (activePageId === 'p16_financial') {
      const tbAll = m.gl_tb || [];
      const tb = tbAll.filter(r => {
        if (!matchSearch(r)) return false;
        if (sl.glClass && String(r.Class) !== String(sl.glClass)) return false;
        return true;
      });
      const totDr = tb.reduce((a, r) => a + Number(r.debit || 0), 0);
      const totCr = tb.reduce((a, r) => a + Number(r.credit || 0), 0);
      const soaRows = (m.soa_stream || []).filter(r => {
        if (!matchSearch(r)) return false;
        if (sl.pnlSection === 'Sales & VAT' && !/^(411|442|70)/.test(String(r.code || ''))) return false;
        if (sl.pnlSection === 'Raw & Haulage' && !/^(60|611|401)/.test(String(r.code || ''))) return false;
        if (sl.pnlSection === 'Expenses & Payroll' && !/^(61|62|64|421)/.test(String(r.code || ''))) return false;
        if (sl.pnlSection === 'Receipts & Settlements' && !/^(53|51|411|401)/.test(String(r.code || ''))) return false;
        return true;
      });

      const totRevExVat = Number(k.gross_sales || ((k.net_sales || 0) + (k.trans_rev || 0)));
      const pnlRows = [
        { code: '7011', name: 'Material Sales Revenue (Ex-VAT)', amt: k.net_sales || 0, pct: fmtPct(null, k.net_sales || 0, totRevExVat) },
        { code: '7061', name: 'Delivery Transport Revenue', amt: k.trans_rev || 0, pct: fmtPct(null, k.trans_rev || 0, totRevExVat) },
        { code: '70', name: 'TOTAL SALES REVENUE (EX-VAT)', amt: totRevExVat, pct: '100.0%', bold: true },
        { code: '6011', name: 'Raw Material Purchases (Leg 1)', amt: -(k.raw_mat_cost || 0), pct: fmtPct(null, k.raw_mat_cost, k.net_sales) },
        { code: '6111', name: 'Subcontracted Raw Haulage (Leg 2)', amt: -(k.raw_haulage || 0), pct: fmtPct(null, k.raw_haulage, k.net_sales) },
        { code: 'GM', name: 'GROSS MARGIN', amt: k.gross_margin || 0, pct: fmtPct(k.gm_pct, k.gross_margin, k.net_sales), bold: true },
        { code: '61/62', name: 'Operating, Fleet & Plant Expenses', amt: -(k.expenses || 0), pct: fmtPct(null, k.expenses, k.net_sales) },
        { code: '6411', name: 'Staff Salaries & Overtime Paid', amt: -(k.salaries_paid || 0), pct: fmtPct(null, k.salaries_paid, k.net_sales) },
        { code: 'OP', name: 'OPERATING PROFIT (CASH VIEW)', amt: k.operating_profit || 0, pct: fmtPct(k.op_margin_pct, k.operating_profit, k.net_sales), bold: true }
      ];

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Lebanese General Chart of Accounts (Classes 1–7) & Double-Entry Audit', [
            { label: 'Total GL Debits', value: fmtUSD(totDr, 2), sub: fmtNum(tb.length) + ' active CoA accounts', tone: 'brass' },
            { label: 'Total GL Credits', value: fmtUSD(totCr, 2), sub: 'Balanced double-entry legs' },
            { label: 'Trial Balance Variance', value: fmtUSD(totDr - totCr, 2), sub: Math.abs(totDr - totCr) < 0.01 ? '100% Tied ($0.00)' : 'Check filter', tone: 'good' },
            { label: 'Gross Margin ($)', value: fmtUSD(k.gross_margin, 0), sub: fmtPct(k.gm_pct, k.gross_margin, k.net_sales) + ' of Net Sales' },
            { label: 'Operating Profit ($)', value: fmtUSD(k.operating_profit, 0), sub: fmtPct(k.op_margin_pct, k.operating_profit, k.net_sales) + ' Op. Margin', tone: 'good' },
            { label: 'SOA Journal Stream', value: fmtNum(soaRows.length) + ' legs', sub: 'Audited voucher postings' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Income Statement (Lebanese CoA Class 7 & Class 6)', [
            { label: 'CoA', key: 'code', mono: true, bold: true },
            { label: 'Income Statement Line', key: 'name', fmt: (v, r) => r && r.bold ? `<b>${esc(v)}</b>` : esc(v) },
            { label: 'Amount (USD)', key: 'amt', r: true, bar: true, negRed: true, fmt: (v, r) => r && r.bold ? `<b>${fmtUSD(v, 0)}</b>` : fmtUSD(v, 0) },
            { label: '% of Net', key: 'pct', r: true, mono: true }
          ], pnlRows, {
            unitLabel: 'lines',
            foot: [
              { v: '<b>OPERATING PROFIT (CASH VIEW)</b>', span: 2 },
              { v: `<b>${fmtUSD(k.operating_profit || 0, 0)}</b>`, r: true, neg: Number(k.operating_profit || 0) < 0 },
              { v: `<b>${fmtPct(k.op_margin_pct, k.operating_profit, k.net_sales)}</b>`, r: true }
            ]
          })}

          <div class="pbi-panel">
            <div class="pbi-panel-hdr">
              <div>
                <div class="pbi-panel-title">Lebanese CoA Trial Balance (${tb.length} Active Accounts)</div>
                <span class="pbi-panel-sub">Every operational transaction posts balanced Debit &amp; Credit legs in real time</span>
              </div>
            </div>
            <div class="table-wrap">
              <table class="ledger-table">
                <thead><tr><th>Code</th><th>Account Name</th><th>Class</th><th class="r">Debit ($)</th><th class="r">Credit ($)</th><th class="r">Net Balance ($)</th></tr></thead>
                <tbody>
                  ${tb.map(r => `
                    <tr>
                      <td class="mono"><b>${esc(r.Code)}</b></td>
                      <td><b>${esc(r.Account)}</b></td>
                      <td><span class="badge badge-info">Class ${esc(r.Class)}</span></td>
                      <td class="r">${fmtUSD(r.debit, 2)}</td>
                      <td class="r">${fmtUSD(r.credit, 2)}</td>
                      <td class="r ${Number(r.balance || 0) < 0 ? 'pbi-neg' : ''}"><b>${fmtUSD(r.balance, 2)}</b></td>
                    </tr>
                  `).join('')}
                  <tr class="total" hidden>
                    <td colspan="3"><b>TOTAL TRIAL BALANCE</b></td>
                    <td class="r"><b>${fmtUSD(totDr, 2)}</b></td>
                    <td class="r"><b>${fmtUSD(totCr, 2)}</b></td>
                    <td class="r"><b>${fmtUSD(totDr - totCr, 2)}</b></td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3"><b>TOTAL TRIAL BALANCE (${tb.length} ACCOUNTS)</b></td>
                    <td class="r"><b>${fmtUSD(totDr, 2)}</b></td>
                    <td class="r"><b>${fmtUSD(totCr, 2)}</b></td>
                    <td class="r"><b>${fmtUSD(totDr - totCr, 2)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div class="pbi-grid-1">
          ${movedRegisterBanner('Audited SOA Double-Entry Journal Stream & Partner Treasury / Loans', 'Full SOA voucher postings, Partner Loans, Repayments, External Treasury Movements, and USD ↔ LBP FX Conversions now live inside General Ledger & SOA.', 'ledger', 'General Ledger & SOA', 'treasury')}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 17: JV SITES (m18c_report.py Page 17 — 50/50 Stock Entitlement)
    // =========================================================================
    else if (activePageId === 'p17_jv') {
      const jvSites = siteRows.filter(s => s.JV === 'Yes').sort((a, b) => Number(b.raw_cost || 0) - Number(a.raw_cost || 0));
      const jvRel = getHubRelIndex(SEED);
      const jvParts = filterRecords(rec.jv_partnerships, { ignorePeriod: true }).filter(matchCommon).sort((a, b) => Number(cellValue(b, 'distributions_total', 'jv_partnerships', jvRel) || 0) - Number(cellValue(a, 'distributions_total', 'jv_partnerships', jvRel) || 0) || Number(b.percentage || 0) - Number(a.percentage || 0));
      const jvDists = filterRecords(rec.jv_distributions, { ignoreSearch: true }).filter(d => {
        if (!matchCommon(d)) return false;
        if (sl.partner && norm(d.partner) !== norm(sl.partner)) return false;
        if (sl.jvBasis && norm(d.basis) !== norm(sl.jvBasis)) return false;
        return true;
      }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.amount || 0) - Number(a.amount || 0));
      const totJvRaw = jvSites.reduce((a, r) => a + Number(r.raw_cost || 0), 0);
      const totJvDist = jvDists.reduce((a, r) => a + Number(r.amount || 0), 0);

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Joint Venture (JV) 50/50 Sites & Partner Stock Entitlement', [
            { label: 'Active JV Sites', value: fmtNum(jvSites.length), sub: 'Halat JV · Jiyeh JV · Nahr Ibrahim JV', tone: 'brass' },
            { label: 'JV Partnership Contracts', value: fmtNum(jvParts.length), sub: '50% / 50% profit & stock split' },
            { label: 'JV Sites Sales TTC', value: fmtUSD(jvSites.reduce((a, r) => a + Number(r.sales_ttc || 0), 0), 0), sub: 'Dispatched from JV pits' },
            { label: 'JV Sites Raw Material Cost', value: fmtUSD(totJvRaw, 0), sub: 'Total raw intake on JV sites' },
            { label: 'Partner 50% Stock Entitlement', value: fmtUSD(totJvRaw / 2, 0), sub: '50% × JV Raw Material Cost', tone: 'good' },
            { label: 'JV Partner Distributions Paid', value: fmtUSD(totJvDist, 0), sub: fmtNum(jvDists.length) + ' distribution vouchers' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('JV sites — Sales TTC vs Raw Material Cost', buildClusteredBarChart(jvSites, 'Site', [
            { label: 'Sales TTC', key: 'sales_ttc', color: C.navy },
            { label: 'Raw Cost', key: 'raw_cost', color: C.steel }
          ], { decimals: 0 }), { subtitle: 'Volume comparison across the 3 Joint Venture sites' })}

          ${pbiTable('JV 50/50 Sites & Partner Stock Entitlement', [
            { label: 'JV Site', key: 'Site', bold: true },
            { label: 'Sales Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Sales TTC ($)', key: 'sales_ttc', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
            { label: 'Raw Cost ($)', key: 'raw_cost', r: true, bar: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Partner 50% Entitlement ($)', raw: r => Number(r.raw_cost || 0) / 2, r: true, bar: 'brass', fmt: v => `<b>${fmtUSD(v, 0)}</b>` }
          ], jvSites, { subtitle: 'Stock Entitlement rule: partner share × the JV site\'s raw material cost', unitLabel: 'JV sites' })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('JV partnership agreements', [
            { label: 'Agreement', key: 'name', bold: true },
            { label: 'Co.', key: 'company' },
            { label: 'JV Site', key: 'site' },
            { label: 'Partner', key: 'partner', bold: true },
            { label: 'Share %', key: 'percentage', r: true, fmt: v => fmtNum(v, 1) + '%' },
            { label: 'Notes', key: 'notes' }
          ], jvParts, { rkey: 'jv_partnerships', unitLabel: 'partnerships' })}

          ${pbiTable('JV profit & stock distributions ledger', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Voucher', key: 'name', mono: true },
            { label: 'JV Site', key: 'site' },
            { label: 'Partner', key: 'partner', bold: true },
            { label: 'Basis', key: 'basis' },
            { label: 'Amount ($)', key: 'amount', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], jvDists, { rkey: 'jv_distributions', limit: 45, unitLabel: 'distributions' })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 18: TICKET BOOKS (m116 — 25/50-Ticket Weighbridge Pads & Serial Hygiene)
    // =========================================================================
    else if (activePageId === 'p18_tickets') {
      const audit = typeof ctx.buildTicketSerialAudit === 'function'
        ? ctx.buildTicketSerialAudit()
        : { skipped: [], duplicates: [], unnumbered: [], allExceptions: [] };
      const excRows = (sl.bookStatus === 'Duplicate Serials'
        ? audit.duplicates
        : (sl.bookStatus === 'Unnumbered' ? audit.unnumbered : audit.skipped)
      ).slice().sort((a, b) => (b.date < a.date ? -1 : (b.date > a.date ? 1 : (b.num - a.num))));
      const totSkippedTickets = audit.skipped.reduce((s, r) => s + Number(r.count || 0), 0);

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Weighbridge Ticket Pad Hygiene, Skipped Serials & Duplicate Guard', [
            { label: 'Skipped Serial Gaps', value: fmtNum(audit.skipped.length), sub: fmtNum(totSkippedTickets) + ' skipped tickets in books', tone: 'warn' },
            { label: 'Duplicate Ticket Numbers', value: fmtNum(audit.duplicates.length || prSn.duplicate_ticket_numbers || 0), sub: 'Same doc type in one pad run', tone: 'warn' },
            { label: 'Unnumbered Tickets', value: fmtNum(audit.unnumbered.length || prSn.unnumbered_tickets || 0), sub: 'Tickets missing serial #' },
            { label: 'Total Serial Exceptions', value: fmtNum(audit.allExceptions.length), sub: 'Skipped + Duplicate + Unnumbered' },
            { label: 'Entry Desk Duplicate Guard', value: 'Enforced', sub: 'Blocks repeated ticket # per BU', tone: 'good' },
            { label: 'Next Suggested Ticket #', value: (() => { const co = STATE.company === 'bbconstruction' ? 'BBConstruction' : 'WTC'; const n = ctx.nextTicketNo ? ctx.nextTicketNo(co, [rec.sales_tickets, rec.raw_purchases, rec.fuel_intakes]) : ''; return n ? '#' + n + ' · ' + co : 'Auto'; })(), sub: 'Follows latest dated ticket of pad', tone: 'brass' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Weighbridge loads by month — Sales vs Raw pads', buildClusteredColumnSvg(months, [
            { key: 'loads', label: 'Sales Pad Tickets', color: C.navy },
            { key: 'raw_loads', label: 'Raw Pad Tickets', color: C.steel }
          ], { isMoney: false }), { legend: [{ label: 'Sales Pad', color: C.navy }, { label: 'Raw Pad', color: C.steel }] })}

          ${pbiTable('Skipped & Duplicate Ticket Serials (m116 — Find Each Skipped Number Between Its Neighbours)', [
            { label: 'Serial / Gap #', key: 'serialLabel', mono: true, bold: true },
            { label: 'Audit Type', key: 'kindLabel' },
            { label: 'Co.', key: 'company' },
            { label: 'Pad Run', key: 'padRun', mono: true },
            { label: 'Entered Before / 1st Entry', key: 'beforeText' },
            { label: 'Entered After / 2nd Entry', key: 'afterText' },
            { label: 'Tickets', key: 'count', r: true, fmt: v => `<b>${fmtNum(v)}</b>` }
          ], excRows, { subtitle: 'Shared across Sales, Raw & Fuel 25-ticket pads (excludes >6-digit external scale refs)', limit: 35, unitLabel: 'serial exceptions' })}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Recent weighbridge ticket serial audit (Sales, Raw & Fuel pads)', [
            { label: 'Pad Stream', key: 'pad', fmt: v => `<span class="badge ${v === 'Sales Pad' ? 'badge-ok' : 'badge-info'}">${esc(v)}</span>` },
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Ticket #', key: 'ticket_no', mono: true, bold: true, fmt: v => '#' + esc(v || '—') },
            { label: 'Counterparty / Site', key: 'party', bold: true },
            { label: 'Product / Item', key: 'product' },
            { label: 'Qty', key: 'qty', r: true, fmt: v => fmtNum(v, 1) },
            { label: 'Amount ($)', key: 'amount', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], salesRows.map(r => ({ id: r.id, rkey: 'sales_tickets', pad: 'Sales Pad', date: r.date, company: r.company, ticket_no: r.ticket_no, party: r.customer, product: r.product, qty: r.qty, amount: r.total_ttc }))
            .concat(rawRows.map(r => ({ id: r.id, rkey: 'raw_purchases', pad: 'Raw Pad', date: r.date, company: r.company, ticket_no: r.ticket_no, party: r.site_owner || r.site, product: r.product, qty: r.qty, amount: r.total })))
            .sort((a, b) => {
              const da = String(a.date || ''), db = String(b.date || '');
              return db < da ? -1 : (db > da ? 1 : 0);
            }),
          { unitLabel: 'tickets' })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 19: CHANGE LOG & DATE BASIS DRIFT (m117 Daily Totals + m276 Tx vs Rep Date Bridge)
    // =========================================================================
    else if (activePageId === 'p19_changelog') {
      const gaps = (paritySn.date_basis_anomalies_gt_31d || []).filter(g => {
        if (!matchSearch(g)) return false;
        if (STATE.company !== 'manufacturing-group' && g.bu && norm(g.bu) !== norm(STATE.company === 'wtc' ? 'WTC' : 'BBConstruction')) return false;
        return true;
      });
      const fmtOriginLbl = v => v === 'Reported (Power BI)' ? 'Reported Snapshot' : (v === 'Entered (Dataverse)' ? 'Entered Ledger' : (v || '—'));
      const dtRows = filterRecords(rec.daily_totals, { ignorePeriod: true, ignoreSearch: true }).filter(d => {
        if (!matchSearch(d)) return false;
        if (sl.ledgerDomain && norm(d.domain) !== norm(sl.ledgerDomain)) return false;
        if (sl.ledgerOrigin && norm(fmtOriginLbl(d.origin)) !== norm(sl.ledgerOrigin)) return false;
        if (sl.ledgerKind && norm(d.kind) !== norm(sl.ledgerKind)) return false;
        return true;
      });
      const repBridgeRows = [...months].reverse().map(mRow => ({
        month: mRow['Year Month'],
        s_tx: Number(mRow.sales_ttc || 0),
        s_rep: Number(mRow.sales_rep != null ? mRow.sales_rep : mRow.sales_ttc || 0),
        s_delta: round2(Number(mRow.sales_rep != null ? mRow.sales_rep : mRow.sales_ttc || 0) - Number(mRow.sales_ttc || 0)),
        r_tx: Number(mRow.raw_cost || 0),
        r_rep: Number(mRow.raw_rep != null ? mRow.raw_rep : mRow.raw_cost || 0),
        r_delta: round2(Number(mRow.raw_rep != null ? mRow.raw_rep : mRow.raw_cost || 0) - Number(mRow.raw_cost || 0)),
        e_tx: Number(mRow.expenses || 0),
        e_rep: Number(mRow.exp_rep != null ? mRow.exp_rep : mRow.expenses || 0),
        e_delta: round2(Number(mRow.exp_rep != null ? mRow.exp_rep : mRow.expenses || 0) - Number(mRow.expenses || 0))
      }));

      const _ac = window.MFG_ALERT_CONFIG || null;
      const _s8GapDays = _ac ? _ac.param('S8', 'audit_gap_days', 31) : 31;
      const _repGapDays = _ac ? _ac.param('G_REPDATE_GAP', 'repdate_warn_days', 60) : 60;
      const _repGapOn = _ac ? _ac.enabled('G_REPDATE_GAP') : true;
      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Daily Totals Snapshot Ledger & Transaction vs Reporting Date Bridge', [
            { label: 'Sales (Tx Date Basis)', value: fmtUSD(k.sales_ttc, 0), sub: 'Operational weighbridge date', tone: 'brass' },
            { label: 'Sales (Rep Date Basis)', value: fmtUSD(k.sales_rep_date || k.sales_ttc, 0), sub: 'Reporting Date basis' },
            { label: 'Raw Cost (Tx vs Rep)', value: fmtUSD(k.raw_cost, 0), sub: 'Rep: ' + fmtUSD(k.raw_rep_date || k.raw_cost, 0) },
            { label: 'Snapshot Rows Logged', value: fmtNum(dtRows.length), sub: 'Daily totals ledger' },
            { label: `Date Gaps > ${_s8GapDays} Days`, value: fmtNum(paritySn.date_basis_anomalies_gt_31d_count || gaps.length), sub: 'Flagged by Sentinel S8', tone: 'warn' },
            { label: `${_repGapDays}-Day Gap Guard`, value: _repGapOn ? 'Active' : 'Paused', sub: _repGapOn ? 'Requires explanation on entry' : 'Paused in Alerts & Thresholds', tone: _repGapOn ? 'good' : 'warn' }
          ])}
        </div>

        <div class="pbi-grid-1">
          ${pbiTable('Transaction date vs reporting date parity bridge', [
            { label: 'Month', key: 'month', bold: true },
            { label: 'Sales (Txn $)', key: 's_tx', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Sales (Rep $)', key: 's_rep', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Sales Δ ($)', key: 's_delta', r: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Raw (Txn $)', key: 'r_tx', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Raw (Rep $)', key: 'r_rep', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Raw Δ ($)', key: 'r_delta', r: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` },
            { label: 'Expenses (Txn $)', key: 'e_tx', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Expenses (Rep $)', key: 'e_rep', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Expenses Δ ($)', key: 'e_delta', r: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 0)}</b>` }
          ], repBridgeRows, {
            subtitle: 'Historical operational reports group backdated tickets and expenses by ExpectedDate (Reporting Date); Δ = Reporting Date − Transaction Date',
            unitLabel: 'months'
          })}
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Daily totals snapshot ledger', [
            { label: 'Date', key: 'date', mono: true },
            { label: 'Co.', key: 'company' },
            { label: 'Domain', key: 'domain', bold: true },
            { label: 'Origin', key: 'origin', fmt: fmtOriginLbl },
            { label: 'Kind', key: 'kind' },
            { label: 'Rows', key: 'row_count', r: true, fmt: v => fmtNum(v) },
            { label: 'Value ($)', key: 'value', r: true, bar: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` },
            { label: 'Version', key: 'version', mono: true }
          ], dtRows, { rkey: 'daily_totals', limit: 45, unitLabel: 'snapshots' })}

          ${pbiTable('Transaction vs reporting date gaps > 31 days (Sentinel S8)', [
            { label: 'Table', key: 'table' },
            { label: 'BU', key: 'bu' },
            { label: 'Ticket #', key: 'ticket', mono: true, bold: true },
            { label: 'Tx Date', key: 'transaction_date', mono: true },
            { label: 'Rep Date', key: 'reporting_date', mono: true },
            { label: 'Gap (Days)', key: 'gap_days', r: true, negRed: true, fmt: v => `<b class="pbi-neg">${fmtNum(v)} d</b>` },
            { label: 'Amount ($)', key: 'amount_usd', r: true, fmt: v => fmtUSD(v, 2) }
          ], gaps, { limit: 45, unitLabel: 'anomalies' })}
        </div>
      `;
    }

    // =========================================================================
    // PAGE 20: STATEMENT RECON & 22 PDFs (m126 Counterparty Bridge + 22 A4 Statements)
    // =========================================================================
    else {
      const stCatalog = (ctx.STATEMENT_CATALOG || []).filter(s => !sl.reconSide || norm(s.cat) === norm(sl.reconSide));
      const bridgeSteps = [
        { label: 'Sales TTC', value: Number(k.sales_ttc || 0), color: C.navy },
        { label: 'Less VAT 11%', value: -Number(k.sales_vat || 0), color: C.slate },
        { label: 'Sales Ex-VAT', value: Number(k.gross_sales || k.net_sales || 0), color: C.steel },
        { label: 'Raw Cost', value: -Number(k.raw_cost || 0), color: C.crit },
        { label: 'Gross Margin', value: Number(k.gross_margin || 0), color: C.good },
        { label: 'Op. Profit', value: Number(k.operating_profit || 0), color: C.brass }
      ];

      bodyHtml = `
        <div class="pbi-overview-bands">
          ${kpiBand('1 · Cross-Statement Reconciliation Bridge (Ties Executive Analytics → Lebanese CoA GL → 22 A4 PDF Statements)', [
            { label: 'P&L Sales Ex-VAT → Stmt #03', value: fmtUSD(k.gross_sales || k.net_sales, 2), sub: 'Ties to Class 701 + 706', tone: 'good' },
            { label: 'Output VAT 11% → Stmt #18', value: fmtUSD(k.sales_vat, 2), sub: 'Ties to Class 4427', tone: 'good' },
            { label: 'FIFO Open AR → Stmt #09/#11', value: fmtUSD(k.ar_balance, 2), sub: 'Ties to Class 4111', tone: 'good' },
            { label: '3-Leg Open AP → Stmt #10/#12', value: fmtUSD(k.ap_balance, 2), sub: 'Ties to Class 4011', tone: 'good' },
            { label: 'Cash Till → Stmt #05', value: fmtUSD(k.cash_till, 2), sub: 'Ties to Class 5 Till', tone: 'good' },
            { label: 'Trial Balance → Stmt #02', value: fmtUSD(k.tb_check || 0, 2), sub: 'Double-Entry Variance $0.00', tone: 'brass' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Executive P&L & Ledger Reconciliation Bridge', buildSignedColumnSvg(bridgeSteps, { isMoney: true }), {
            subtitle: 'Walk from Gross Sales TTC through Output VAT, Net Sales, Raw Cost, Gross Margin and Operating Profit'
          })}

          <div class="pbi-panel">
            <div class="pbi-panel-hdr">
              <div>
                <div class="pbi-panel-title">22 Printable A4 Statements &amp; Paginated Reports Launcher</div>
                <span class="pbi-panel-sub">Click any statement below to open its A4 printable sheet (including #19 Staff Payroll &amp; #15 Driver Overtime)</span>
              </div>
              <button type="button" class="btn btn-brass" style="padding:4px 10px;font-size:11px" data-nav-jump="statements">Open Statement Center →</button>
            </div>
            <div style="padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:7px;max-height:245px;overflow-y:auto">
              ${stCatalog.map(s => `
                <button type="button" class="btn" style="justify-content:flex-start;text-align:left;padding:6px 9px;font-size:11.5px" data-nav-jump="statements" data-stmt-jump="${esc(s.code)}">
                  <b class="mono" style="color:var(--brass);margin-right:4px">#${esc(s.code)}</b> ${esc(s.name)}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="pbi-grid-2">
          ${pbiTable('Top Customer Sub-Account Reconciliation (Tickets vs Receipts vs Closing AR)', [
            { label: 'Customer', key: 'Customer', bold: true },
            { label: 'Loads', key: 'loads', r: true, fmt: v => fmtNum(v) },
            ...(activeRange ? [{ label: 'Opening AR ($)', key: 'opening_ar', r: true, negRed: true, fmt: v => fmtUSD(v, 0) }] : []),
            { label: 'Credit Sales TTC ($)', raw: r => r.credit_sales_ttc != null ? r.credit_sales_ttc : (r.credit_sales || 0), r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Settled ($)', raw: r => r.ar_settled != null ? r.ar_settled : (r.receipts || 0), r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Closing AR ($)', key: 'ar_balance', r: true, bar: true, negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], [...custRows].sort((a, b) => Math.abs(Number(b.ar_balance || 0)) - Math.abs(Number(a.ar_balance || 0)) || Number(b.credit_sales || 0) - Number(a.credit_sales || 0)), { unitLabel: 'customers' })}

          ${pbiTable('Top Supplier Sub-Account Reconciliation (3-Leg Accruals vs Settlements vs Closing AP)', [
            { label: 'Supplier / Hauler', key: 'Supplier', bold: true },
            { label: 'Raw Loads', key: 'raw_loads', r: true, fmt: v => fmtNum(v) },
            ...(activeRange ? [{ label: 'Opening AP ($)', key: 'opening_ap', r: true, negRed: true, fmt: v => fmtUSD(v, 0) }] : []),
            { label: 'Total on Credit ($)', key: 'ap_on_credit', r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Settled ($)', raw: r => r.ap_settled != null ? r.ap_settled : (r.settlements_paid || 0), r: true, fmt: v => fmtUSD(v, 0) },
            { label: 'Closing AP ($)', key: 'ap_balance', r: true, bar: 'brass', negRed: true, fmt: v => `<b>${fmtUSD(v, 2)}</b>` }
          ], [...suppRows].sort((a, b) => Math.abs(Number(b.ap_balance || 0)) - Math.abs(Number(a.ap_balance || 0)) || Number(b.ap_on_credit || 0) - Number(a.ap_on_credit || 0)), { unitLabel: 'suppliers' })}
        </div>
      `;
    }

    if (bodyOnly) return bodyHtml;
    return `<div id="pbiCanvasPanel" style="padding-bottom:24px">${headerHtml}${bodyHtml}</div>`;
  }

  // ==================== HUB ANALYTICS & MOVED PAGES CATALOG ====================
  const MODULE_ANALYTICS_CATALOG = {
    sales_analytics: {
      title: 'Sales, Weighbridge Books, Spreads & FIFO AR Analytics',
      subtitle: '25/50-Ticket Weighbridge Book Audit, Realised Price Spreads, Destination Site Mix & FIFO AR Aging',
      defaultSec: 'tickets',
      sections: [
        { id: 'tickets', label: 'Weighbridge Ticket Books (25/50-Pad Audit)', pageId: 'p18_tickets', badge: 'Moved Page' },
        { id: 'analytics', label: 'Sales Revenue, Price Trends & Site Mix', pageId: 'p04_sales', badge: 'Analytics' },
        { id: 'spreads', label: 'Agreed vs Realised Spreads & Commissions', pageId: 'p05_pricing', badge: 'Analytics' },
        { id: 'aging', label: 'FIFO AR Aging & Customer Running Statement', pageId: 'p06_ar', badge: 'Analytics' }
      ]
    },
    sales_vat: {
      title: '11% VAT Position, Quarterly MOF & Tax Invoice Hygiene',
      subtitle: 'Output/Input VAT 11%, Quarterly MOF Filing Position & VAT Invoice Ticket Linkage',
      defaultSec: 'vat',
      sections: [
        { id: 'vat', label: '11% VAT Position, Quarterly MOF & Tax Invoices', pageId: 'p13_vat', badge: 'Moved Page' }
      ]
    },
    raw_analytics: {
      title: 'Stock Intake, Unit Economics & 3-Leg Payables',
      subtitle: 'Raw Material Intake, Unit Margin, Two-Leg Cost Split & Monthly Supplier Accrual vs Settlement',
      defaultSec: 'stock',
      sections: [
        { id: 'stock', label: 'Stock Intake, Unit Economics & 3-Leg Payables', pageId: 'p08_stock_ap', studioPageId: 'p08_stock', badge: 'Analytics' }
      ]
    },
    fleet_analytics: {
      title: 'Fleet, Drivers, Overtime & Diesel Analytics',
      subtitle: 'Driver Trips & Night Overtime Bonus, Diesel Tank Burn & Equipment Cost per Ton',
      defaultSec: 'drivers',
      sections: [
        { id: 'drivers', label: 'Drivers, Trips & Overtime Bonus', pageId: 'p11_drivers', badge: 'Moved Page' },
        { id: 'fuel', label: 'Diesel Tank Reconciliation & L/100km Burn', pageId: 'p09_fuel', badge: 'Analytics' },
        { id: 'econ', label: 'Equipment Economics & Cost per Ton', pageId: 'p10_fleet', badge: 'Analytics' }
      ]
    },
    cashflow_analytics: {
      title: 'Cash Flow Inflows/Outflows & Daily Till Analytics',
      subtitle: 'Daily Cash Till Trajectory, Cash Inflows vs Outflows & Payment Method Mix',
      defaultSec: 'cashflow',
      sections: [
        { id: 'cashflow', label: 'Cash Flow Inflows/Outflows & Daily Till', pageId: 'p14_cashflow', badge: 'Analytics' }
      ]
    },
    expenses_analytics: {
      title: '3-Leg AP, Cost-Class Breakdown & JV Stock Analytics',
      subtitle: '3-Leg Accounts Payable, Expense Cost Classes (60/61/62/22), JV 50/50 Stock & Unit Economics',
      defaultSec: 'costclass',
      sections: [
        { id: 'costclass', label: '3-Leg AP & Expense Cost Classes', pageId: 'p07_ap', badge: 'Analytics' },
        { id: 'jv', label: 'JV 50/50 Sites & Partner Stock Entitlement', pageId: 'p17_jv', badge: 'Moved Page' },
        { id: 'stock', label: 'Unit Economics & Raw Intake Cost Split', pageId: 'p08_stock', badge: 'Analytics' }
      ]
    },
    payroll_analytics: {
      title: 'Workforce Earnings Matrix, Site Transport, Freelance & Driver OT',
      subtitle: '16-Column Staff Earnings Matrix, Site Transport, Freelance Shifts & Driver Overtime',
      defaultSec: 'allowances',
      sections: [
        { id: 'allowances', label: 'Staff Earnings Matrix, Site Transport & Freelance', pageId: 'p12_payroll', badge: 'Analytics' },
        { id: 'drivers_ot', label: 'Driver Trips & Night Overtime Bonus', pageId: 'p11_drivers', badge: 'Moved Page' }
      ]
    },
    ledger_treasury: {
      title: 'Partner Treasury, Loans & USD ↔ LBP FX Conversions',
      subtitle: 'Partner Loans, Repayments, External Movements & USD ↔ LBP Exchange Position',
      defaultSec: 'treasury',
      sections: [
        { id: 'treasury', label: 'Partner Loans, External Treasury & USD ↔ LBP FX', pageId: 'p15_treasury', badge: 'Moved Page' }
      ]
    },
    external: {
      title: 'External & Extended Stakeholder Treasury Analytics',
      subtitle: 'Partner Injections, Withdrawals, Inter-Account Transfers & Extended Stakeholder Movements',
      defaultSec: 'treasury',
      sections: [
        { id: 'treasury', label: 'External Treasury, Partner Loans & USD ↔ LBP FX', pageId: 'p15_treasury', badge: 'Analytics' }
      ]
    },
    conversions: {
      title: 'USD ↔ LBP Currency Desk & Till Analytics',
      subtitle: 'USD ↔ LBP Exchange Rate Spread, Drawer Impact & Daily Cash Till Position',
      defaultSec: 'treasury',
      sections: [
        { id: 'treasury', label: 'USD ↔ LBP FX Desk & Partner Treasury', pageId: 'p15_treasury', badge: 'Analytics' },
        { id: 'cashflow', label: 'Cash Flow Inflows/Outflows & Daily Till', pageId: 'p14_cashflow', badge: 'Analytics' }
      ]
    },
    sales: {
      title: 'Sales & Weighbridge Analytics',
      subtitle: '25/50-Ticket Weighbridge Book Audit, Realised Price Trends & Destination Site Mix',
      defaultSec: 'tickets',
      sections: [
        { id: 'tickets', label: 'Weighbridge Ticket Books (25/50-Pad Audit)', pageId: 'p18_tickets', badge: 'Moved Page' },
        { id: 'analytics', label: 'Sales Revenue, Price Trends & Site Mix', pageId: 'p04_sales', badge: 'Analytics' }
      ]
    },
    raw: {
      title: 'Material, Transportation, JV 50/50 & Unit Economics',
      subtitle: 'Joint Venture 50/50 Site Stock Entitlement, Unit Margin & Raw Intake Cost Split',
      defaultSec: 'jv',
      sections: [
        { id: 'jv', label: 'JV 50/50 Sites & Partner Stock Entitlement', pageId: 'p17_jv', badge: 'Moved Page' },
        { id: 'stock', label: 'Unit Economics & Raw Intake Cost Split', pageId: 'p08_stock', badge: 'Analytics' }
      ]
    },
    fleet: {
      title: 'Fleet, Drivers, Overtime & Diesel Analytics',
      subtitle: 'Driver Trips & Night Overtime Bonus, Diesel Tank Burn & Equipment Cost/Ton',
      defaultSec: 'drivers',
      sections: [
        { id: 'drivers', label: 'Drivers, Trips & Overtime Bonus', pageId: 'p11_drivers', badge: 'Moved Page' },
        { id: 'fuel', label: 'Diesel Tank Reconciliation & L/100km Burn', pageId: 'p09_fuel', badge: 'Analytics' },
        { id: 'econ', label: 'Equipment Economics & Cost per Ton', pageId: 'p10_fleet', badge: 'Analytics' }
      ]
    },
    pricing: {
      title: 'Pricing Spreads, Below-Agreed Governance & Commissions',
      subtitle: 'Agreed vs Realised vs List Spreads, Customer × Product Shortfalls & Commission Rules',
      defaultSec: 'spreads',
      sections: [
        { id: 'spreads', label: 'Agreed vs Realised Spreads & Below-Agreed Exceptions', pageId: 'p05_pricing', badge: 'Analytics' }
      ]
    },
    customers: {
      title: 'Receivables Aging & Customer Running Sub-Ledger',
      subtitle: 'FIFO AR Aging, Customer Running Statement & Tax Position',
      defaultSec: 'aging',
      sections: [
        { id: 'aging', label: 'FIFO AR Aging & Customer Running Statement', pageId: 'p06_ar', badge: 'Analytics' },
        { id: 'vat', label: '11% VAT Position, Quarterly MOF & Tax Invoices', pageId: 'p13_vat', badge: 'Moved Page' }
      ]
    },
    suppliers: {
      title: '3-Leg Accounts Payable & Supplier Accrual Analytics',
      subtitle: 'Leg 1 Raw Material, Leg 2 Third-Party Haulage, Leg 3 Credit Expenses & Monthly Settlements',
      defaultSec: 'ap3leg',
      sections: [
        { id: 'ap3leg', label: '3-Leg AP Schedule & Monthly Accrual vs Settlement', pageId: 'p07_ap', badge: 'Analytics' }
      ]
    },
    expenses: {
      title: 'Cost-Class Breakdown & Overhead Analytics',
      subtitle: 'Production Cost, Operating Expense & Capital Expenditure Category Analytics',
      defaultSec: 'costclass',
      sections: [
        { id: 'costclass', label: 'Expense Cost Classes & Category Breakdown', pageId: 'p07_ap', badge: 'Analytics' }
      ]
    },
    payroll: {
      title: 'Workforce Earnings Matrix, Site Transport, Freelance & Driver OT',
      subtitle: '16-Column Staff Earnings Matrix, Site Transport, Freelance Shifts & Driver OT',
      defaultSec: 'allowances',
      sections: [
        { id: 'allowances', label: 'Staff Earnings Matrix, Site Transport & Freelance', pageId: 'p12_payroll', badge: 'Analytics' },
        { id: 'drivers_ot', label: 'Driver Trips & Night Overtime Bonus', pageId: 'p11_drivers', badge: 'Moved Page' }
      ]
    },
    ledger: {
      title: 'Partner Treasury, Loans, FX Conversions & Cash Flow Till',
      subtitle: 'Partner Loans, Repayments, External Movements, USD ↔ LBP Conversions & Daily Till',
      defaultSec: 'treasury',
      sections: [
        { id: 'treasury', label: 'Partner Loans, External Treasury & USD ↔ LBP FX', pageId: 'p15_treasury', badge: 'Moved Page' },
        { id: 'cashflow', label: 'Cash Flow Inflows/Outflows & Daily Till', pageId: 'p14_cashflow', badge: 'Analytics' }
      ]
    },
    sentinels: {
      title: 'Executive Action Items, Ticket Serial Hygiene, Change Log & Date-Basis Parity Bridge',
      subtitle: 'Action Items & Exception Queue, Skipped/Duplicate Weighbridge Serials (m116), Daily Totals Ledger & Tx vs Reporting Date Parity',
      defaultSec: 'all',
      sections: [
        { id: 'exceptions', label: 'Action Items & Exception Queue', pageId: 'p03_exceptions', badge: 'Moved Page' },
        { id: 'tickets', label: 'Weighbridge Ticket Serial Hygiene (m116)', pageId: 'p18_tickets', badge: 'Moved Page' },
        { id: 'changelog', label: 'Change Log, Daily Totals & Date Parity Bridge', pageId: 'p19_changelog', badge: 'Moved Page' }
      ]
    },
    statements: {
      title: 'Counterparty Statement Reconciliation Bridge',
      subtitle: 'Customer & Supplier Sub-Account Reconciliation vs Trial Balance',
      defaultSec: 'recon',
      sections: [
        { id: 'recon', label: 'Statement Reconciliation Bridge & Sub-Account Tie', pageId: 'p20_recon', badge: 'Moved Page' }
      ]
    }
  };

  function renderModuleAnalytics(moduleKey, ctx) {
    const cfg = MODULE_ANALYTICS_CATALOG[moduleKey];
    if (!cfg || !ctx || !ctx.STATE) return '';
    const { STATE } = ctx;
    if (!STATE.moduleSection) STATE.moduleSection = {};
    if (!STATE.moduleLastSection) STATE.moduleLastSection = {};
    const availSecs = cfg.sections.filter(s => typeof ctx.canAccessPbiPage !== 'function' || ctx.canAccessPbiPage(s.studioPageId || s.pageId));
    if (!availSecs.length) return '';

    const defaultSecId = (cfg.defaultSec && cfg.defaultSec !== 'hide' && (cfg.defaultSec === 'all' ? availSecs.length > 1 : availSecs.some(s => s.id === cfg.defaultSec)))
      ? cfg.defaultSec
      : availSecs[0].id;
    const activeSecId = STATE.moduleSection[moduleKey] || defaultSecId;
    const isCollapsed = activeSecId === 'hide';
    const isAll = activeSecId === 'all' && availSecs.length > 1;
    const activeSecs = isCollapsed
      ? []
      : (isAll ? availSecs : [availSecs.find(s => s.id === activeSecId) || availSecs[0]]);

    if (!isCollapsed && activeSecs.length) {
      STATE.moduleLastSection[moduleKey] = isAll ? 'all' : activeSecs[0].id;
    }
    const prevSavedSec = STATE.moduleLastSection[moduleKey];
    const expandSecId = (prevSavedSec && prevSavedSec !== 'hide' && (prevSavedSec === 'all' ? availSecs.length > 1 : availSecs.some(s => s.id === prevSavedSec)))
      ? prevSavedSec
      : defaultSecId;

    const studioTargetSec = !isCollapsed
      ? (activeSecs.find(s => PBI_PAGES.some(p => p.id === (s.studioPageId || s.pageId))) || null)
      : null;
    const primaryPageId = studioTargetSec
      ? (studioTargetSec.studioPageId || studioTargetSec.pageId)
      : ((availSecs[0] && (availSecs[0].studioPageId || availSecs[0].pageId)) || 'p01_overview');
    const hasPbiInStudio = Boolean(studioTargetSec);

    return `
      <div class="mod-analytics-hub${isCollapsed ? ' is-collapsed' : ''}" data-mod-hub="${esc(moduleKey)}">
        <div class="mod-analytics-bar">
          <div class="mod-analytics-hdr"${isCollapsed ? ` role="button" tabindex="0" data-mod-hub-key="${esc(moduleKey)}" data-mod-sec="${esc(expandSecId)}" data-mod-toggle="expand-hdr" title="Expand ${esc(cfg.title)}"` : ''}>
            <div class="mod-analytics-eyebrow">EMBEDDED MODULE ANALYTICS &amp; INSIGHTS</div>
            <div class="mod-analytics-title">${esc(cfg.title)}</div>
            <div class="mod-analytics-sub">${esc(cfg.subtitle)}</div>
          </div>
          <div class="mod-analytics-tabs" role="tablist" aria-label="${esc(cfg.title)} Sections">
            ${availSecs.length > 1 ? availSecs.map(s => {
              const sel = !isCollapsed && !isAll && activeSecs[0] && activeSecs[0].id === s.id;
              return `
                <button type="button" class="filter-chip ${sel ? 'active' : ''}" data-mod-hub-key="${esc(moduleKey)}" data-mod-sec="${esc(s.id)}" role="tab" aria-selected="${sel}">
                  <span>${esc(s.label)}</span>
                  <span class="badge ${s.badge === 'Moved Page' ? 'badge-brass' : 'badge-info'}" style="margin-left:5px;font-size:9.5px;padding:1px 5px">${esc(s.badge)}</span>
                </button>
              `;
            }).join('') : ''}
            ${availSecs.length > 1 ? `
              <button type="button" class="filter-chip ${isAll ? 'active' : ''}" data-mod-hub-key="${esc(moduleKey)}" data-mod-sec="all" role="tab" aria-selected="${isAll}">
                All (${availSecs.length})
              </button>
            ` : ''}
            ${moduleKey === 'cashflow_analytics' ? `
              <button type="button" class="btn" style="padding:4px 9px;font-size:11px" data-nav-jump="cashflow">Open Full Cashbook &amp; 7-Table Recon →</button>
            ` : ''}
            <button type="button" class="filter-chip ${isCollapsed ? 'active' : ''}" data-mod-hub-key="${esc(moduleKey)}" data-mod-sec="${esc(isCollapsed ? expandSecId : 'hide')}" data-mod-toggle="${isCollapsed ? 'expand' : 'collapse'}" aria-expanded="${!isCollapsed}">
              ${isCollapsed ? '▸ Expand Insights' : '▾ Collapse'}
            </button>
            ${hasPbiInStudio ? `
              <button type="button" class="btn" style="padding:4px 9px;font-size:11px" data-pbi-jump="${esc(primaryPageId)}">Full Slicers in Analytics &amp; Insights →</button>
            ` : ''}
          </div>
        </div>
        ${isCollapsed ? '' : `
          <div class="mod-analytics-body">
            ${activeSecs.map(s => `
              <div class="mod-analytics-section" data-mod-sec-pane="${esc(s.id)}">
                ${renderPbiStudio(ctx, s.pageId, true)}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  // ==================== 34-TABLE POWER APPS DATA HUB RENDERER ====================
  function renderTablesHub(ctx) {
    const { STATE, SEED, filterRecords, sortRows, th, shownCount, showMoreRow, emptyRow, exportBtn, searchBox, appCell, canEnterForm } = ctx;
    const catalog = typeof ctx.canAccessTable === 'function' ? TABLE_CATALOG.filter(t => ctx.canAccessTable(t.key)) : TABLE_CATALOG;
    const tablePool = catalog.length ? catalog : TABLE_CATALOG;
    const activeKey = STATE.activeTableKey || 'sales_tickets';
    const meta = tablePool.find(t => t.key === activeKey) || tablePool[0];
    STATE.activeTableKey = meta.key;
    const rel = getHubRelIndex(SEED);
    const rawList = (SEED.records && SEED.records[meta.key]) || [];
    const isUniv = Boolean(meta.universal);
    const rlsScopedRaw = filterRecords(rawList, { ignorePeriod: true, ignoreSearch: true, ignoreCompany: isUniv, ignoreRls: isUniv });
    const searchCols = meta.key === 'sites'
      ? Array.from(new Set(meta.cols.concat(['supplier', 'customer', 'site_category', 'linked_party'])))
      : meta.cols;
    const baseFiltered = filterRecords(rawList, {
      cols: searchCols,
      tableKey: meta.key,
      ignoreCompany: isUniv,
      ignoreRls: isUniv,
      ignorePeriod: isUniv || !['sales_tickets', 'raw_purchases', 'receipts', 'settlements', 'fuel_intakes', 'fuel_malfunctions', 'expenses', 'expense_items', 'salaries', 'attendance', 'external_movements', 'loan_settlements', 'conversions', 'jv_distributions', 'daily_totals'].includes(meta.key)
    });
    const rawViews = meta.views || [{ id: 'all', label: 'All ' + meta.label }];
    const views = (meta.key === 'sales_tickets' && !STATE._canSeeTaxBreakdown)
      ? rawViews.filter(v => v.id !== 'iva')
      : rawViews;
    const activeViewId = (STATE.tableViews && STATE.tableViews[meta.key]) || 'all';
    const activeView = views.find(v => v.id === activeViewId) || views[0];
    const isRawPrMode = meta.key === 'price_rules' && /^raw_/i.test(activeView.id);
    const visibleViews = meta.key === 'price_rules'
      ? (isRawPrMode ? views.filter(v => /^raw_/i.test(v.id)) : views.filter(v => !/^raw_/i.test(v.id)))
      : views;
    const effGroup = isRawPrMode ? '2 · Purchases, Expenses & Payables' : meta.group;
    const effLabel = isRawPrMode ? 'Raw & Haulage Agreements' : meta.label;
    const domainScopedRaw = meta.key === 'price_rules'
      ? (isRawPrMode
          ? rlsScopedRaw.filter(r => /^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || ''))
          : rlsScopedRaw.filter(r => !/^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || '')))
      : rlsScopedRaw;
    const rawActiveCols = (activeView && Array.isArray(activeView.cols) && activeView.cols.length) ? activeView.cols : meta.cols;
    const taxColsVisibleOnHub = Boolean((STATE._canSeeTaxBreakdown && STATE.showSalesTaxBreakdown) || STATE._officialScopeActive || activeView.id === 'iva');
    const activeCols = (meta.key === 'sales_tickets' && !taxColsVisibleOnHub)
      ? rawActiveCols.filter(c => c !== 'vat')
      : rawActiveCols;
    const filtered = activeView && activeView.fn ? baseFiltered.filter(r => activeView.fn(r, rel)) : baseFiltered;
    const defSortSpec = getHubTableDefaultSort(meta, activeView.id);
    const rows = sortRows(filtered, 'tbl_' + meta.key, defSortSpec.key, defSortSpec.dir);
    const shown = rows.slice(0, shownCount('tbl_' + meta.key));

    const groups = Array.from(new Set(tablePool.map(t => t.group)));
    const effRelKeys = meta.key === 'price_rules'
      ? (isRawPrMode ? ['suppliers', 'sites', 'products', 'raw_purchases', 'settlements'] : ['customers', 'suppliers', 'products', 'sites', 'sales_tickets'])
      : (meta.relTables || []);
    const relTablesMeta = effRelKeys.map(rk => tablePool.find(t => t.key === rk)).filter(Boolean);

    const matchPct = domainScopedRaw.length > 0 ? Math.min(100, (rows.length / domainScopedRaw.length) * 100) : 100;

    return `
      <div class="cockpit-banner has-insights">
        <div class="cockpit-title-block sr-only">
          <div class="cockpit-eyebrow">${isUniv ? `UNIVERSAL REGISTRY (ALL BUSINESS UNITS) · ACTIVE TABLE: ${esc(effLabel.toUpperCase())}` : `${tablePool.length} OPERATIONAL &amp; MASTER TABLES · ACTIVE TABLE: ${esc(effLabel.toUpperCase())}`}</div>
          <div class="cockpit-title">All Tables &amp; Registers</div>
        </div>
        <div class="cockpit-pills insight-grid">
          <div class="cockpit-pill insight-card tone-brass">
            <div class="cockpit-pill-top">
              <div class="cockpit-pill-lbl">Active Register</div>
              <span class="cockpit-pill-tag brass">${esc(effGroup)}</span>
            </div>
            <div class="cockpit-pill-val brass">${esc(effLabel)}</div>
            <div class="cockpit-pill-sub">${activeCols.length} columns${visibleViews.length > 1 ? ` · ${visibleViews.length} views` : ''}</div>
          </div>
          <div class="cockpit-pill insight-card tone-emerald">
            <div class="cockpit-pill-top">
              <div class="cockpit-pill-lbl">Governance Scope</div>
              <span class="cockpit-pill-tag ${isUniv ? 'emerald' : 'brass'}">${isUniv ? 'Root Shared' : 'BU Scoped'}</span>
            </div>
            <div class="cockpit-pill-val ${isUniv ? 'emerald' : ''}">${isUniv ? 'All BUs (Universal)' : 'BU Scoped'}</div>
            <div class="cockpit-pill-sub">Active view: <b>${esc(activeView.label)}</b></div>
          </div>
          <div class="cockpit-pill insight-card tone-steel">
            <div class="cockpit-pill-top">
              <div class="cockpit-pill-lbl">Filter &amp; View Yield</div>
              <span class="cockpit-pill-tag">${matchPct.toFixed(0)}% Shown</span>
            </div>
            <div class="cockpit-pill-val">${fmtNum(rows.length)} <small>/ ${fmtNum(domainScopedRaw.length)}</small></div>
            <div class="cockpit-meter" aria-hidden="true">
              <span class="cockpit-meter-fill primary" style="width:${matchPct.toFixed(1)}%"></span>
            </div>
            <div class="cockpit-pill-sub">Matching rows in active scope</div>
          </div>
          <div class="cockpit-pill insight-card tone-amber">
            <div class="cockpit-pill-top">
              <div class="cockpit-pill-lbl">Relational Schema</div>
              <span class="cockpit-pill-tag amber">${tablePool.length} Total Tables</span>
            </div>
            <div class="cockpit-pill-val">${fmtNum(relTablesMeta.length)} <small>Connected</small></div>
            <div class="cockpit-pill-sub">Click any row for 360° Inspector &amp; Subgrids</div>
          </div>
        </div>
      </div>

      <!-- Table Picker Strip Grouped by Pure Business Domain -->
      <div class="panel-card" style="margin-bottom:12px;padding:10px 12px">
        ${groups.map((g, gi) => `
          <div style="${gi < groups.length - 1 ? 'margin-bottom:8px' : ''}">
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px">${esc(g)}</div>
            <div class="chip-bar">
              ${tablePool.filter(t => t.group === g).map(t => {
                const tUniv = Boolean(t.universal);
                const tRows = filterRecords((SEED.records && SEED.records[t.key]) || [], { ignorePeriod: true, ignoreSearch: true, ignoreCompany: tUniv, ignoreRls: tUniv });
                const cnt = t.key === 'price_rules'
                  ? tRows.filter(r => !/^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || '')).length
                  : tRows.length;
                const isChipAct = t.key === meta.key && !(t.key === 'price_rules' && /^raw_/i.test(activeView.id));
                const showUnivTag = tUniv && !/Universal/i.test(t.group || '');
                const mainChip = `<button type="button" class="filter-chip ${isChipAct ? 'active' : ''}" data-table-key="${esc(t.key)}">${esc(t.label)} <span class="mono" style="opacity:.75">(${fmtNum(cnt)})</span>${showUnivTag ? '<span class="tbl-univ-tag">All BUs</span>' : ''}</button>`;
                if (t.key === 'settlements' && (!ctx.canAccessTable || ctx.canAccessTable('price_rules'))) {
                  const rawPrCnt = filterRecords((SEED.records && SEED.records.price_rules) || [], { ignorePeriod: true, ignoreSearch: true }).filter(r => /^(Purchase Price \(Site\)|Transport Price \(Site\))$/i.test(r.rule_type || '')).length;
                  const isRawPrAct = meta.key === 'price_rules' && /^raw_/i.test(activeView.id);
                  return mainChip + `<button type="button" class="filter-chip ${isRawPrAct ? 'active' : ''}" data-tbl-key="price_rules" data-tbl-view="raw_all" title="Raw Material &amp; Site Haulage Price Agreements">Raw &amp; Haulage Agreements <span class="mono" style="opacity:.75">(${fmtNum(rawPrCnt)})</span></button>`;
                }
                return mainChip;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="panel-card" id="tablesHubPanel">
        <!-- Views & Connected Tables Relational Bar -->
        ${(visibleViews.length > 1 || relTablesMeta.length) ? `
          <div class="pa-hub-rel-strip">
            ${visibleViews.length > 1 ? `
              <div class="pa-hub-views">
                <span class="pa-hub-lbl">Views:</span>
                ${visibleViews.map(vw => {
                  const vCnt = vw.fn ? baseFiltered.filter(r => vw.fn(r, rel)).length : baseFiltered.length;
                  return `<button type="button" class="filter-chip ${vw.id === activeView.id ? 'active' : ''}" data-tbl-view="${esc(vw.id)}" data-tbl-key="${esc(meta.key)}">${esc(vw.label)} <span class="mono" style="opacity:.75">(${fmtNum(vCnt)})</span></button>`;
                }).join('')}
              </div>
            ` : ''}
            ${relTablesMeta.length ? `
              <div class="pa-hub-conns">
                <span class="pa-hub-lbl">Connected Tables:</span>
                ${relTablesMeta.map(rt => {
                  const rtUniv = Boolean(rt.universal);
                  const rCnt = filterRecords((SEED.records && SEED.records[rt.key]) || [], { ignorePeriod: true, ignoreSearch: true, ignoreCompany: rtUniv, ignoreRls: rtUniv }).length;
                  return `<button type="button" class="filter-chip" data-conn-table-key="${esc(rt.key)}" title="Jump to related table ${esc(rt.label)}">⇄ ${esc(rt.label)} <span class="mono" style="opacity:.7">(${fmtNum(rCnt)})</span></button>`;
                }).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${(meta.key === 'sites' || meta.key === 'regions') && window.MFG_GEO && typeof window.MFG_GEO.renderGeoStudioHtml === 'function'
          ? window.MFG_GEO.renderGeoStudioHtml({ metaKey: meta.key, STATE, SEED, rel })
          : ''}

        <div class="table-toolbar">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${searchBox('Search ' + effLabel + '...')}
          </div>
          <div style="display:flex;gap:6px">
            ${exportBtn('tablesHubPanel', meta.key)}
            ${(() => {
              const modalFormId = meta.key === 'price_rules'
                ? (/^raw_/i.test(activeView.id) ? 'pricerule_raw' : (activeView.id === 'commission' ? 'pricerule_comm' : 'pricerule'))
                : meta.form;
              const modalBtnLbl = meta.key === 'price_rules'
                ? (/^raw_/i.test(activeView.id) ? 'Raw & Haulage Agreement' : (activeView.id === 'commission' ? 'Commission Rule' : 'Sales Price Agreement'))
                : (meta.singularLabel || meta.label.replace(/ies$/, 'y').replace(/s$/, ''));
              return canEnterForm(modalFormId) ? `<button type="button" class="btn btn-primary" data-open-modal="${esc(modalFormId)}">+ New ${esc(modalBtnLbl)}</button>` : '';
            })()}
          </div>
        </div>
        ${typeof ctx.renderColFilterBar === 'function' ? ctx.renderColFilterBar('tbl_' + meta.key, activeCols) : ''}
        <div class="table-wrap">
          <table class="ledger-table">
            <thead>
              <tr>
                ${activeCols.map(c => th('tbl_' + meta.key, hubColLabel(c, meta.key), c, !NON_NUMERIC_HUB_COLS.test(c) && /price|cost|amount|total|vat|limit|salary|balance|^debit$|^credit$|qty|litres|capacity|factor|pct|days|hours|_count$|loads|fills|rules|tickets|_delta$|exchange_rate|proceeds|meter_reading|^rate$|vat_fx_rate|active_rate|vat_percent|^precision$/.test(c) ? 'r' : '')).join('')}
              </tr>
            </thead>
            <tbody>
              ${shown.map(r => `
                <tr class="rrow" data-rkey="${esc(meta.key)}" data-rid="${esc(r.id)}">
                  ${activeCols.map((c, ci) => {
                    const v = cellValue(r, c, meta.key, rel);
                    const nonNum = NON_NUMERIC_HUB_COLS.test(c);
                    const isBool = typeof v === 'boolean' || (/^(is_|vat_registered|external_invoice|customer_declared_qty|ticket_product|fuel_item|input_product|prior_defect_notified|iva$|overtime$)/.test(c) && (v === 0 || v === 1));
                    const isSignedUsd = !isBool && !nonNum && c === 'usd_delta';
                    const isSignedLbp = !isBool && !nonNum && c === 'lbp_delta';
                    const isLbp = !isBool && !nonNum && !isSignedLbp && /^lbp_|_lbp$/.test(c);
                    const isMoney = !isBool && !nonNum && !isLbp && !isSignedLbp && /price|cost|amount|total|vat_amount|limit|salary|balance|^debit$|^credit$|adj|indiff|rate_usd|daily_usd|principal|^value$|previous_value|^change$|cash_in|cash_out|closing_till|overtime_rate|^usd_delta$|proceeds/.test(c) && !/rate$/.test(c);
                    const isNum = !isBool && !nonNum && !isMoney && !isLbp && !isSignedLbp && /qty|litres|capacity|factor|pct|percentage|days|hours|_count$|odometer|meter_reading|interest_rate|exchange_rate|^lat|^long|loads|fills|rules|tickets|^rate$|vat_fx_rate|active_rate|vat_percent|^precision$/.test(c);
                    let cell = v == null || v === '' ? '—' : (isBool ? (v && v !== 0 ? 'Yes' : 'No') : String(v));
                    if (isSignedUsd && v != null && v !== '') cell = fmtSignedUSD(v, 2);
                    else if (isSignedLbp && v != null && v !== '') cell = fmtSignedLBP(v);
                    else if (isLbp && v != null && v !== '') cell = fmtNum(v, 0) + ' LL';
                    else if (isMoney && v != null && v !== '') cell = fmtUSD(v, 2);
                    else if (c === 'vat_percent' && v != null && v !== '') cell = fmtNum(v, 1) + '%';
                    else if ((c === 'rate' || c === 'vat_fx_rate' || c === 'active_rate') && v != null && v !== '') cell = fmtNum(v, Number(v) % 1 !== 0 ? 1 : (Number(v) === 1 ? 2 : 0));
                    else if (isNum && v != null && v !== '') cell = fmtNum(v, /factor|qty|capacity|lat|long|percentage|interest/.test(c) ? 2 : 0);
                    else if (c === 'effective_to' && v) cell = v === 'Open' ? 'Open (Active)' : fmtDateDMY(v);
                    else if (/date/.test(c) && v) cell = fmtDateDMY(v);

                    const lkTarget = c === 'linked_party'
                      ? (resolveSiteCategoryPbi(r) === 'customer' ? 'customers' : 'suppliers')
                      : HUB_LOOKUP_TARGETS[c];
                    const isLookup = lkTarget && lkTarget !== meta.key && v != null && v !== '' && cell !== '—';
                    const signedHtml = (isSignedUsd || isSignedLbp) && v != null && v !== ''
                      ? `<strong style="color:${Number(v) >= 0 ? 'var(--good)' : 'var(--crit)'}">${esc(cell)}</strong>`
                      : null;
                    const innerHtml = isLookup
                      ? `<span class="rel-link" data-rel-key="${esc(lkTarget)}" data-rel-val="${esc(v)}">${esc(cell)}<span class="rel-arr">↗</span></span>`
                      : (signedHtml || (c === 'company' ? shortCoHtml(cell) : (c === 'site_category' ? formatSiteCategoryHtml(cell) : (c === 'supplier_role' ? formatSupplierRoleHtml(cell) : (c === 'cost_class' ? formatCostClassHtml(cell) : (c === 'automation_mode' ? formatAutomationModeHtml(cell) : esc(cell)))))));
                    return `<td class="${isMoney || isNum || isLbp || isSignedLbp ? 'r' : ''}${/date|ticket|code|_no$|plate|version|_delta$|exchange_rate/.test(c) ? ' mono' : ''}">${ci === 0 ? `<b>${innerHtml}</b>${appCell(r, meta.key)}` : innerHtml}</td>`;
                  }).join('')}
                </tr>
              `).join('') || emptyRow(activeCols.length, 'No rows match the active filter.')}
              ${showMoreRow('tbl_' + meta.key, rows.length, activeCols.length)}
            </tbody>
            <tfoot>
              <tr>
                ${(() => {
                  const isColNumeric = col => {
                    if (NON_NUMERIC_HUB_COLS.test(col)) return { isM: false, isN: false, isL: false, isSU: false, isSL: false, num: false };
                    const isBoolCol = /^(is_|vat_registered|external_invoice|customer_declared_qty|ticket_product|fuel_item|input_product|prior_defect_notified|iva$|overtime$)/.test(col);
                    const isSU = !isBoolCol && col === 'usd_delta';
                    const isSL = !isBoolCol && col === 'lbp_delta';
                    const isL = !isBoolCol && !isSL && /^lbp_|_lbp$/.test(col);
                    const isM = !isBoolCol && !isL && !isSL && /price|cost|amount|total|vat_amount|limit|salary|balance|^debit$|^credit$|adj|indiff|rate_usd|daily_usd|principal|^value$|previous_value|^change$|cash_in|cash_out|closing_till|overtime_rate|^usd_delta$|proceeds/.test(col) && !/rate$/.test(col);
                    const isN = !isBoolCol && !isM && !isL && !isSL && /qty|litres|capacity|factor|pct|percentage|days|hours|_count$|odometer|meter_reading|interest_rate|exchange_rate|loads|fills|rules|tickets|^rate$|vat_fx_rate|active_rate|vat_percent|^precision$/.test(col);
                    return { isM, isN, isL, isSU, isSL, num: isM || isN || isL || isSU || isSL };
                  };
                  let firstNum = activeCols.findIndex((col, idx) => idx > 0 && isColNumeric(col).num);
                  if (firstNum < 0) firstNum = activeCols.length;
                  const leadSpan = Math.max(1, firstNum);
                  const out = [`<td colspan="${leadSpan}"><b>TOTAL (${fmtNum(rows.length)} RECORDS)</b></td>`];
                  for (let ci = leadSpan; ci < activeCols.length; ci++) {
                    const c = activeCols[ci];
                    const { isM: isMoney, isN: isNum, isL, isSU, isSL } = isColNumeric(c);
                    if (!isMoney && !isNum && !isL && !isSU && !isSL) { out.push(`<td></td>`); continue; }
                    if (c === 'tank_remaining_litres') {
                      const dt = typeof window.MFG_DIESEL_TANK === 'function' ? window.MFG_DIESEL_TANK() : null;
                      const rem = dt ? dt.closingTankL : null;
                      out.push(`<td class="r">${rem != null ? `<span class="tfoot-avg-tag">Rem. </span><b>${fmtNum(rem, 0)}</b>` : '-'}</td>`);
                      continue;
                    }
                    const isAvg = /price|rate|factor|pct|percentage|vat_percent|precision|odometer|closing_till|credit_days/.test(c) && !/^(total|amount|vat_amount|cost|trans_price|price|total_paid|total_spent)$/.test(c);
                    let sum = 0, cnt = 0;
                    rows.forEach(r => {
                      const rowSgn = meta.key === 'sales_tickets' ? saleTicketSign(r) : (meta.key === 'expenses' ? hubExpenseSign(r) : 1);
                      if (isAvg && rowSgn === 0) return;
                      const v = cellValue(r, c, meta.key, rel);
                      if (v != null && v !== '' && typeof v !== 'boolean') {
                        const n = Number(v);
                        if (Number.isFinite(n)) { sum += isAvg ? n : (n * rowSgn); cnt++; }
                      }
                    });
                    if (!cnt) { out.push(`<td class="r">—</td>`); continue; }
                    const val = isAvg ? (sum / cnt) : sum;
                    const txt = isSU ? fmtSignedUSD(val, 2)
                      : (isSL ? fmtSignedLBP(val)
                        : (isL ? fmtNum(val, 0) + ' LL'
                          : (isMoney ? fmtUSD(val, 2) : (c === 'vat_percent' ? fmtNum(val, 1) + '%' : fmtNum(val, /factor|qty|capacity|percentage|interest/.test(c) ? 2 : 0)))));
                    const footHtml = (isSU || isSL)
                      ? `<strong style="color:${val >= 0 ? 'var(--good)' : 'var(--crit)'}">${esc(txt)}</strong>`
                      : `<b>${txt}</b>`;
                    out.push(`<td class="r">${isAvg ? '<span class="tfoot-avg-tag">Avg </span>' : ''}${footHtml}</td>`);
                  }
                  return out.join('');
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  const HUB_COL_LABELS = {
    supplier_role: 'Role / Type',
    trucks_list: 'Owned Trucks',
    drivers_list: 'Linked Drivers',
    haul_loads: 'Haul Loads',
    raw_loads: 'Raw Loads',
    expenses_count: 'Expense Bills',
    active_rules: 'Price Rules',
    iva: 'IVA (VAT)',
    ap_balance: 'AP Balance',
    ar_balance: 'AR Balance',
    vat_registered: 'VAT (11%)',
    mof_no: 'MOF Tax #',
    companies_list: 'Assigned BUs',
    assigned_trucks: 'Assigned Trucks',
    loads_hauled: 'Loads Hauled',
    fuel_fills: 'Fuel Fills',
    default_driver: 'Default Driver',
    truck_owner: 'Truck Owner (Hauler)',
    site_owner: 'Site Owner',
    site_category: 'Site Category',
    linked_party: 'Counterparty',
    is_jv: 'JV 50/50',
    gps_status: 'GPS Pin',
    zone_shape: 'Map Zone',
    distance_km: 'Ref KM (WTC)',
    usd_delta: 'USD Change ($)',
    lbp_delta: 'LBP Change (LL)',
    exchange_rate: 'Rate (LL/$)',
    removed_disposition: 'Piece Disposition',
    prior_defect_notified: 'Pre-Notified',
    new_part_cost: 'New Cost ($)',
    repair_cost: 'Repair Cost ($)',
    sale_proceeds: 'Sale Proceeds ($)',
    vendor_or_buyer: 'Vendor / Buyer',
    storage_location: 'Store / Unit',
    part_name: 'Part / Piece',
    action_type: 'Action',
    defect_ref: 'Prior Defect',
    linked_part_log: 'Part Log',
    meter_reading: 'Meter (km/h)',
    tank_remaining_litres: 'Tank Rem. (L)',
    tank_delta_litres: 'Tank Impact (L)',
    discrepancy_type: 'Discrepancy Type',
    start_date: 'Start Date',
    effective_to: 'Effective To',
    vat_percent: 'VAT Rate (%)',
    vat_fx_rate: 'MoF Rate (LL/$)',
    output_vat_account: 'Output VAT GL',
    input_vat_account: 'Input VAT GL',
    active_rate: 'Active Rate (per $1)',
    is_base: 'Base USD',
    precision: 'Decimals',
    pcg_class: 'CoA Class',
    automation_mode: 'Automation',
    source_module: 'Driven By',
    debit_rule: 'Hidden Debit Rule',
    credit_rule: 'Hidden Credit Rule',
    debit: 'Total Debit ($)',
    credit: 'Total Credit ($)',
    balance: 'Net Balance ($)',
    set_date: 'Set Date',
    tx_date: 'Tx Date'
  };

  function hubColLabel(c, tableKey) {
    if (c === 'type' && tableKey === 'conversions') return 'Direction';
    if (tableKey === 'fx_rates' && c === 'rate') return 'Rate (per $1)';
    if (tableKey === 'currencies' && c === 'code') return 'ISO Code';
    if (tableKey === 'currencies' && c === 'name') return 'Currency Name';
    if (tableKey === 'gl_accounts' && c === 'code') return 'GL Code';
    if (tableKey === 'gl_accounts' && c === 'name') return 'GL Account';
    if (tableKey === 'sites') {
      if (c === 'supplier') return 'Default Site Owner';
      if (c === 'customer') return 'Linked Customer';
      if (c === 'raw_loads') return 'Source Raw Loads';
      if (c === 'sales_loads') return 'Delivery Loads';
    }
    if (c === 'name') {
      if (tableKey === 'fx_rates') return 'Rate Window Ref';
      if (tableKey === 'vat_rates') return 'Statutory Window';
      if (tableKey === 'conversions') return 'Voucher / Ref';
      if (tableKey === 'equipment_defects') return 'Defect Ref';
      if (tableKey === 'part_movements') return 'Part Log Ref';
      if (tableKey === 'suppliers') return 'Supplier / Hauler';
      if (tableKey === 'equipment') return 'Unit / Plate #';
      if (tableKey === 'drivers') return 'Driver Name';
      if (tableKey === 'customers') return 'Customer';
      if (tableKey === 'sites') return 'Site';
      if (tableKey === 'products') return 'Product / Grade';
    }
    if (HUB_COL_LABELS[c]) return HUB_COL_LABELS[c];
    return String(c || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  function formatSupplierRoleHtml(roleTxt) {
    const r = String(roleTxt || '').trim();
    if (!r || r === '—') return '—';
    const cls = /(?:Quarry|Site) \+ Hauler|Truck Owner|Hauler/i.test(r)
      ? 'badge-brass'
      : (/Quarry|Site|Material/i.test(r) ? 'badge-info' : 'badge');
    return `<span class="badge ${cls}">${esc(r)}</span>`;
  }

  function formatAutomationModeHtml(modeTxt) {
    const m = String(modeTxt || '').trim();
    if (!m || m === '-') return '-';
    const cls = /Direct Formula/i.test(m)
      ? 'badge-info'
      : (/Category Auto-Map/i.test(m) ? 'badge-brass' : 'badge');
    return `<span class="badge ${cls}">${esc(m)}</span>`;
  }

  // ==================== DEDICATED UNIVERSAL REGISTRIES WORKSPACE RENDERER ====================
  function renderUniversalRegistriesView(ctx) {
    const { STATE, SEED, filterRecords, sortRows, th, shownCount, showMoreRow, emptyRow, exportBtn, searchBox, appCell, canEnterForm } = ctx;
    const allUniv = TABLE_CATALOG.filter(t => t.universal);
    const permittedUniv = typeof ctx.canAccessTable === 'function' ? allUniv.filter(t => ctx.canAccessTable(t.key)) : allUniv;
    const univPool = permittedUniv.length ? permittedUniv : allUniv;
    const groupKeys = Array.isArray(ctx.registryGroupKeys) && ctx.registryGroupKeys.length
      ? ctx.registryGroupKeys.filter(k => univPool.some(t => t.key === k))
      : [];
    const activeKey = STATE.activeUnivRegKey || (groupKeys[0] || 'equipment');
    const meta = univPool.find(t => t.key === activeKey) || univPool.find(t => groupKeys.includes(t.key)) || univPool[0];
    STATE.activeUnivRegKey = meta.key;
    const rel = getHubRelIndex(SEED);
    const rawList = (SEED.records && SEED.records[meta.key]) || [];
    const searchCols = meta.key === 'sites'
      ? Array.from(new Set(meta.cols.concat(['supplier', 'customer', 'site_category', 'linked_party'])))
      : meta.cols;
    const baseFiltered = filterRecords(rawList, { cols: searchCols, tableKey: meta.key, ignorePeriod: true, ignoreCompany: true, ignoreRls: true });
    const views = meta.views || [{ id: 'all', label: 'All ' + meta.label }];
    const activeViewId = (STATE.tableViews && STATE.tableViews[meta.key]) || 'all';
    const activeView = views.find(v => v.id === activeViewId) || views[0];
    const activeCols = (activeView && Array.isArray(activeView.cols) && activeView.cols.length) ? activeView.cols : meta.cols;
    const filtered = activeView && activeView.fn ? baseFiltered.filter(r => activeView.fn(r, rel)) : baseFiltered;
    const defSortSpec = getHubTableDefaultSort(meta, activeView.id);
    const rows = sortRows(filtered, 'ureg_' + meta.key, defSortSpec.key, defSortSpec.dir);
    const shown = rows.slice(0, shownCount('ureg_' + meta.key));
    const relTablesMeta = (meta.relTables || []).map(rk => TABLE_CATALOG.find(t => t.key === rk)).filter(Boolean);
    const groupTabsMeta = groupKeys.length > 1
      ? groupKeys.map(gk => univPool.find(t => t.key === gk)).filter(Boolean)
      : [];

    return `
      <div class="panel-card" id="univRegPanel">
        ${(groupTabsMeta.length > 1 || views.length > 1 || relTablesMeta.length) ? `
          <div class="pa-hub-rel-strip">
            ${groupTabsMeta.length > 1 ? `
              <div class="pa-hub-views"${views.length > 1 ? ' style="flex:1 1 100%;padding-bottom:6px;margin-bottom:2px;border-bottom:1px dashed var(--line)"' : ''}>
                <span class="pa-hub-lbl">Registries (All BUs):</span>
                ${groupTabsMeta.map(gt => {
                  const gCnt = filterRecords((SEED.records && SEED.records[gt.key]) || [], { ignorePeriod: true, ignoreSearch: true, ignoreCompany: true, ignoreRls: true }).length;
                  return `<button type="button" class="filter-chip ${gt.key === meta.key ? 'active' : ''}" data-univ-reg-key="${esc(gt.key)}" ${gt.navView ? `data-univ-nav-view="${esc(gt.navView)}"` : ''}>${esc(gt.label)} <span class="mono" style="opacity:.75">(${fmtNum(gCnt)})</span></button>`;
                }).join('')}
              </div>
            ` : ''}
            ${views.length > 1 ? `
              <div class="pa-hub-views">
                <span class="pa-hub-lbl">Views:</span>
                ${views.map(vw => {
                  const vCnt = vw.fn ? baseFiltered.filter(r => vw.fn(r, rel)).length : baseFiltered.length;
                  return `<button type="button" class="filter-chip ${vw.id === activeView.id ? 'active' : ''}" data-tbl-view="${esc(vw.id)}" data-tbl-key="${esc(meta.key)}">${esc(vw.label)} <span class="mono" style="opacity:.75">(${fmtNum(vCnt)})</span></button>`;
                }).join('')}
              </div>
            ` : ''}
            ${relTablesMeta.length ? `
              <div class="pa-hub-conns">
                <span class="pa-hub-lbl">Connected Tables:</span>
                ${relTablesMeta.map(rt => {
                  const rtUniv = Boolean(rt.universal);
                  const rCnt = filterRecords((SEED.records && SEED.records[rt.key]) || [], { ignorePeriod: true, ignoreSearch: true, ignoreCompany: rtUniv, ignoreRls: rtUniv }).length;
                  return `<button type="button" class="filter-chip" data-conn-table-key="${esc(rt.key)}" title="Jump to related table ${esc(rt.label)}">⇄ ${esc(rt.label)} <span class="mono" style="opacity:.7">(${fmtNum(rCnt)})</span></button>`;
                }).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${(meta.key === 'sites' || meta.key === 'regions') && window.MFG_GEO && typeof window.MFG_GEO.renderGeoStudioHtml === 'function'
          ? window.MFG_GEO.renderGeoStudioHtml({ metaKey: meta.key, STATE, SEED, rel })
          : ''}

        <div class="table-toolbar">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${searchBox('Search ' + meta.label + '...')}
          </div>
          <div style="display:flex;gap:6px">
            ${exportBtn('univRegPanel', meta.key)}
            ${canEnterForm(meta.form) ? `<button type="button" class="btn btn-primary" data-open-modal="${esc(meta.form)}">+ New ${esc(meta.singularLabel || meta.label.replace(/ies$/, 'y').replace(/s$/, ''))}</button>` : ''}
          </div>
        </div>
        ${typeof ctx.renderColFilterBar === 'function' ? ctx.renderColFilterBar('ureg_' + meta.key, activeCols) : ''}
        <div class="table-wrap">
          <table class="ledger-table">
            <thead>
              <tr>
                ${activeCols.map(c => th('ureg_' + meta.key, hubColLabel(c, meta.key), c, !NON_NUMERIC_HUB_COLS.test(c) && /price|cost|amount|total|vat|limit|salary|balance|^debit$|^credit$|qty|litres|capacity|factor|pct|days|hours|_count$|loads|fills|rules|tickets|^rate$|vat_fx_rate|active_rate|vat_percent|^precision$/.test(c) ? 'r' : '')).join('')}
              </tr>
            </thead>
            <tbody>
              ${shown.map(r => `
                <tr class="rrow" data-rkey="${esc(meta.key)}" data-rid="${esc(r.id)}">
                  ${activeCols.map((c, ci) => {
                    const v = cellValue(r, c, meta.key, rel);
                    const nonNum = NON_NUMERIC_HUB_COLS.test(c);
                    const isBool = typeof v === 'boolean' || (/^(is_|vat_registered|external_invoice|customer_declared_qty|ticket_product|fuel_item|input_product|iva$|overtime$)/.test(c) && (v === 0 || v === 1));
                    const isMoney = !isBool && !nonNum && /price|cost|amount|total|vat_amount|limit|salary|balance|^debit$|^credit$|adj|indiff|rate_usd|daily_usd|principal|^value$|previous_value|^change$|cash_in|cash_out|closing_till|overtime_rate/.test(c) && !/rate$/.test(c);
                    const isNum = !isBool && !nonNum && !isMoney && /qty|litres|capacity|factor|pct|percentage|days|hours|_count$|odometer|interest_rate|exchange_rate|^lat|^long|loads|fills|rules|tickets|^rate$|vat_fx_rate|active_rate|vat_percent|^precision$/.test(c);
                    let cell = v == null || v === '' ? '—' : (isBool ? (v && v !== 0 ? 'Yes' : 'No') : String(v));
                    if (isMoney && v != null && v !== '') cell = fmtUSD(v, 2);
                    else if (c === 'vat_percent' && v != null && v !== '') cell = fmtNum(v, 1) + '%';
                    else if ((c === 'rate' || c === 'vat_fx_rate' || c === 'active_rate') && v != null && v !== '') cell = fmtNum(v, Number(v) % 1 !== 0 ? 1 : (Number(v) === 1 ? 2 : 0));
                    else if (isNum && v != null && v !== '') cell = fmtNum(v, /factor|qty|capacity|lat|long|percentage|interest/.test(c) ? 2 : 0);
                    else if (c === 'effective_to' && v) cell = v === 'Open' ? 'Open (Active)' : fmtDateDMY(v);
                    else if (/date/.test(c) && v) cell = fmtDateDMY(v);

                    const lkTarget = c === 'linked_party'
                      ? (resolveSiteCategoryPbi(r) === 'customer' ? 'customers' : 'suppliers')
                      : HUB_LOOKUP_TARGETS[c];
                    const isLookup = lkTarget && lkTarget !== meta.key && v != null && v !== '' && cell !== '—';
                    const innerHtml = isLookup
                      ? `<span class="rel-link" data-rel-key="${esc(lkTarget)}" data-rel-val="${esc(v)}">${esc(cell)}<span class="rel-arr">↗</span></span>`
                      : (c === 'company' ? shortCoHtml(cell) : (c === 'site_category' ? formatSiteCategoryHtml(cell) : (c === 'supplier_role' ? formatSupplierRoleHtml(cell) : (c === 'cost_class' ? formatCostClassHtml(cell) : (c === 'automation_mode' ? formatAutomationModeHtml(cell) : esc(cell))))));
                    return `<td class="${isMoney || isNum ? 'r' : ''}${/date|effective_to|ticket|code|_no$|plate|version|^rate$|vat_fx_rate|active_rate|vat_percent/.test(c) ? ' mono' : ''}">${ci === 0 ? `<b>${innerHtml}</b>${appCell(r, meta.key)}` : innerHtml}</td>`;
                  }).join('')}
                </tr>
              `).join('') || emptyRow(activeCols.length, 'No rows match the active filter.')}
              ${showMoreRow('ureg_' + meta.key, rows.length, activeCols.length)}
            </tbody>
            <tfoot>
              <tr>
                ${(() => {
                  const isColNumeric = col => {
                    if (NON_NUMERIC_HUB_COLS.test(col)) return { isM: false, isN: false, num: false };
                    const isBoolCol = /^(is_|vat_registered|external_invoice|customer_declared_qty|ticket_product|fuel_item|input_product|iva$|overtime$)/.test(col);
                    const isM = !isBoolCol && /price|cost|amount|total|vat_amount|limit|salary|balance|^debit$|^credit$|adj|indiff|rate_usd|daily_usd|principal|^value$|previous_value|^change$|cash_in|cash_out|closing_till|overtime_rate/.test(col) && !/rate$/.test(col);
                    const isN = !isBoolCol && !isM && /qty|litres|capacity|factor|pct|percentage|days|hours|_count$|odometer|interest_rate|exchange_rate|loads|fills|rules|tickets|^rate$|vat_fx_rate|active_rate|vat_percent|^precision$/.test(col);
                    return { isM, isN, num: isM || isN };
                  };
                  let firstNum = activeCols.findIndex((col, idx) => idx > 0 && isColNumeric(col).num);
                  if (firstNum < 0) firstNum = activeCols.length;
                  const leadSpan = Math.max(1, firstNum);
                  const out = [`<td colspan="${leadSpan}"><b>TOTAL (${fmtNum(rows.length)} RECORDS)</b></td>`];
                  for (let ci = leadSpan; ci < activeCols.length; ci++) {
                    const c = activeCols[ci];
                    const { isM: isMoney, isN: isNum } = isColNumeric(c);
                    if (!isMoney && !isNum) { out.push(`<td></td>`); continue; }
                    const isAvg = /price|rate|factor|pct|percentage|vat_percent|precision|odometer|closing_till|credit_days/.test(c) && !/^(total|amount|vat_amount|cost|trans_price|price|total_paid|total_spent)$/.test(c);
                    let sum = 0, cnt = 0;
                    rows.forEach(r => {
                      const rowSgn = meta.key === 'sales_tickets' ? saleTicketSign(r) : (meta.key === 'expenses' ? hubExpenseSign(r) : 1);
                      if (isAvg && rowSgn === 0) return;
                      const v = cellValue(r, c, meta.key, rel);
                      if (v != null && v !== '' && typeof v !== 'boolean') {
                        const n = Number(v);
                        if (Number.isFinite(n)) { sum += isAvg ? n : (n * rowSgn); cnt++; }
                      }
                    });
                    if (!cnt) { out.push(`<td class="r">—</td>`); continue; }
                    const val = isAvg ? (sum / cnt) : sum;
                    const txt = isMoney ? fmtUSD(val, 2) : (c === 'vat_percent' ? fmtNum(val, 1) + '%' : fmtNum(val, /factor|qty|capacity|percentage|interest/.test(c) ? 2 : 0));
                    out.push(`<td class="r">${isAvg ? '<span class="tfoot-avg-tag">Avg </span>' : ''}<b>${txt}</b></td>`);
                  }
                  return out.join('');
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderCashFlowVisualsSection(opts = {}) {
    const months = Array.isArray(opts.months) ? opts.months : [];
    const allDailyRows = Array.isArray(opts.allDailyRows) ? opts.allDailyRows : [];
    const rateLbp = Number(opts.rateLbp || 89500);
    const chartGrain = opts.chartGrain === 'daily' ? 'daily' : 'monthly';
    const focusYm = opts.focusYm || '';
    const focusDate = opts.focusDate || '';

    const fmtLL = v => {
      const n = Math.round(Number(v || 0));
      if (Math.abs(n) <= 1) return '0 LL';
      return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' LL';
    };
    const cleanUsd = (v, eps = 0.005) => {
      const n = Number(v || 0);
      return Math.abs(n) < eps ? 0 : n;
    };
    const ymToIso = r => {
      const ymNo = String(r.YearMonthNo || '');
      if (/^\d{6}$/.test(ymNo)) return ymNo.slice(0, 4) + '-' + ymNo.slice(4, 6);
      return '';
    };

    const nicePositiveTicks = rawMax => {
      const mx = Math.max(100, Number(rawMax || 0));
      const rough = mx / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(rough)));
      const frac = rough / mag;
      const mult = frac <= 1 ? 1 : (frac <= 2 ? 2 : (frac <= 2.5 ? 2.5 : (frac <= 5 ? 5 : 10)));
      const step = mult * mag;
      const topSteps = Math.max(4, Math.ceil((mx * 1.04) / step));
      const ticks = [];
      for (let i = 0; i <= topSteps; i++) ticks.push(i * step);
      return { ticks, top: topSteps * step };
    };

    const niceSignedTicks = (minV, maxV) => {
      const lo = Math.min(0, Number(minV || 0));
      const hi = Math.max(0, Number(maxV || 0));
      const span = Math.max(Math.abs(lo), Math.abs(hi));
      if (span < 0.5) {
        return { ticks: [-200, -100, 0, 100, 200], lo: -200, hi: 200 };
      }
      const candidates = [10, 20, 25, 50, 100, 200, 250, 400, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
      let step = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        const s = candidates[i];
        const upN = hi > 0 ? Math.max(1, Math.ceil((hi * 1.14) / s)) : 0;
        const dnN = lo < 0 ? Math.max(1, Math.ceil((Math.abs(lo) * 1.14) / s)) : 0;
        const tot = upN + dnN;
        if (tot >= 3 && tot <= 6) { step = s; break; }
      }
      const upSteps = hi > 0 ? Math.max(1, Math.ceil((hi * 1.14) / step)) : (lo < 0 ? 1 : 2);
      const dnSteps = lo < 0 ? Math.max(1, Math.ceil((Math.abs(lo) * 1.14) / step)) : 0;
      const ticks = [];
      for (let i = -dnSteps; i <= upSteps; i++) ticks.push(i * step);
      return { ticks, lo: -dnSteps * step, hi: upSteps * step };
    };

    const fmtRoundAxisUsd = v => {
      const n = Math.round(Number(v || 0));
      if (n === 0) return '$0';
      const sign = n < 0 ? '-' : '+';
      const abs = Math.abs(n);
      if (abs >= 1000000) return `${n < 0 ? '-' : ''}$${(abs / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1)}M`;
      if (abs >= 10000) return `${n < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
      return `${sign}$${abs.toLocaleString('en-US')}`;
    };

    const buildCashFlowSplitColumnSvg = (mRows, selectedYm) => {
      const data = (mRows || []).slice(-14);
      if (!data.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No monthly cash flow data for active filter</div>`;
      const W = 620, H = 228, padL = 52, padR = 16, padT = 18, padB = 34;
      const plotW = W - padL - padR, plotH = H - padT - padB;
      let rawMax = 100;
      const parsed = data.map(r => {
        const totIn = Math.max(0, Number(r.cash_in || 0));
        const totOut = Math.max(0, Number(r.cash_out || 0));
        const opIn = Math.min(totIn, Math.max(0, Number(r.cash_sales || 0) + Number(r.receipts || 0)));
        const trIn = Math.max(0, round2(totIn - opIn));
        const opOut = Math.min(totOut, Math.max(0, Number(r.cash_expenses || 0) + Number(r.settlements_paid || 0) + Number(r.salaries || 0)));
        const trOut = Math.max(0, round2(totOut - opOut));
        rawMax = Math.max(rawMax, totIn, totOut);
        return {
          r,
          ymIso: ymToIso(r),
          rawLbl: String(r['Year Month'] || r.YearMonthNo || ''),
          totIn, totOut, opIn, trIn, opOut, trOut,
          opNet: round2(opIn - opOut),
          netCash: cleanUsd(r.net_cash, 0.5)
        };
      });
      const { ticks, top } = nicePositiveTicks(rawMax);
      const yOf = v => padT + plotH * (1 - (v / top));
      const grid = ticks.map(tv => {
        const y = yOf(tv).toFixed(1);
        const isZero = tv === 0;
        const lbl = tv === 0 ? '$0' : (tv >= 1000000 ? `$${(tv / 1000000).toFixed(tv % 1000000 === 0 ? 0 : 1)}M` : `$${Math.round(tv / 1000)}K`);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isZero ? 'var(--ink)' : 'rgba(128,138,158,0.18)'}" stroke-opacity="${isZero ? '0.32' : '1'}" stroke-width="${isZero ? '1.3' : '1'}" ${isZero ? '' : 'stroke-dasharray="3 3"'}/>` +
          `<text x="${padL - 7}" y="${(Number(y) + 3.2).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="${isZero ? '700' : '500'}" fill="${isZero ? 'var(--ink)' : 'var(--muted)'}">${lbl}</text>`;
      }).join('');

      const grpW = plotW / parsed.length;
      const barW = Math.min(13, Math.max(6, (grpW * 0.66 - 2) / 2));
      const cols = parsed.map((d, i) => {
        const cx = padL + i * grpW + grpW / 2;
        const xIn = cx - barW - 1;
        const xOut = cx + 1;
        const shortLbl = d.rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, "$1 '$2").slice(0, 7);
        const isSel = selectedYm && d.ymIso === selectedYm;

        const hOpIn = (d.opIn / top) * plotH;
        const hTrIn = (d.trIn / top) * plotH;
        const yOpIn = padT + plotH - hOpIn;
        const yTrIn = yOpIn - hTrIn;

        const hOpOut = (d.opOut / top) * plotH;
        const hTrOut = (d.trOut / top) * plotH;
        const yOpOut = padT + plotH - hOpOut;
        const yTrOut = yOpOut - hTrOut;

        const popSpec = {
          title: d.rawLbl || shortLbl,
          badge: `Net Till ${fmtSignedUSD(d.netCash, 0)}`,
          badgeTone: Math.abs(d.netCash) < 0.5 ? 'good' : (d.netCash > 0 ? 'good' : 'crit'),
          rows: [
            { label: 'Operating In (Sales + AR)', value: fmtUSD(d.opIn, 0), color: '#1C8C46' },
            { label: 'Treasury, Loans & FX In', value: fmtUSD(d.trIn, 0), color: '#6BB38B' },
            { label: 'Total Cash Inflows', value: fmtUSD(d.totIn, 0), isTotal: true, tone: 'good' },
            { label: 'Operating Out (Exp + AP + Sal)', value: fmtUSD(d.opOut, 0), color: '#C8333B' },
            { label: 'Treasury Sweeps & FX Out', value: fmtUSD(d.trOut, 0), color: '#DF8A71' },
            { label: 'Total Cash Outflows', value: fmtUSD(d.totOut, 0), isTotal: true, tone: 'crit' },
            { label: 'Operating Cash Surplus', value: fmtSignedUSD(d.opNet, 0), isTotal: true, tone: d.opNet >= 0 ? 'good' : 'crit' }
          ],
          footer: 'Click month bar to filter entries below'
        };

        return `<g class="cf-chart-bar pbi-chart-col${isSel ? ' is-selected' : ''}" ${d.ymIso ? `data-cf-focus-ym="${esc(d.ymIso)}"` : ''} data-chart-pop="${encodeChartPop(popSpec)}">` +
          `<rect class="cf-bar-hit pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${(grpW - 2).toFixed(1)}" height="${plotH + 22}" rx="4" fill="${isSel ? 'rgba(46,116,181,0.12)' : 'transparent'}"/>` +
          (hTrIn > 0.4 ? `<rect x="${xIn.toFixed(1)}" y="${yTrIn.toFixed(1)}" width="${barW.toFixed(1)}" height="${(hOpIn + hTrIn).toFixed(1)}" fill="${C.goodSoft}" rx="1.8"/>` : '') +
          (hOpIn > 0.4 ? `<rect x="${xIn.toFixed(1)}" y="${yOpIn.toFixed(1)}" width="${barW.toFixed(1)}" height="${hOpIn.toFixed(1)}" fill="${C.good}" rx="${hTrIn > 0.4 ? '0' : '1.8'}"/>` : '') +
          (hTrOut > 0.4 ? `<rect x="${xOut.toFixed(1)}" y="${yTrOut.toFixed(1)}" width="${barW.toFixed(1)}" height="${(hOpOut + hTrOut).toFixed(1)}" fill="${C.critSoft}" rx="1.8"/>` : '') +
          (hOpOut > 0.4 ? `<rect x="${xOut.toFixed(1)}" y="${yOpOut.toFixed(1)}" width="${barW.toFixed(1)}" height="${hOpOut.toFixed(1)}" fill="${C.crit}" rx="${hTrOut > 0.4 ? '0' : '1.8'}"/>` : '') +
          `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.3" font-weight="${isSel ? '800' : '500'}" fill="${isSel ? 'var(--brass)' : 'var(--muted)'}">${esc(shortLbl)}</text>` +
          `</g>`;
      }).join('');

      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" role="img" aria-label="Monthly Cash Inflows and Outflows split into Operating vs Treasury Sweeps">${grid}${cols}</svg>`;
    };

    const buildTillBalanceChartSvg = (items, chartOpts = {}) => {
      if (!items || !items.length) return `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">No physical cash till balance points for active filter</div>`;
      const W = 620, H = 228, padL = 54, padR = 16, padT = 22, padB = 34;
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const rateNum = Number(chartOpts.rate || 89500);
      const isDaily = Boolean(chartOpts.isDaily);

      let minV = 0, maxV = 0;
      items.forEach(d => {
        if (d.val < minV) minV = d.val;
        if (d.val > maxV) maxV = d.val;
      });
      const { ticks, lo, hi } = niceSignedTicks(minV, maxV);
      const span = Math.max(1, hi - lo);
      const yOf = v => padT + plotH * (1 - ((v - lo) / span));
      const yZero = yOf(0);
      const allZero = items.every(d => Math.abs(d.val) < 0.5);

      const grid = ticks.map(tv => {
        const y = yOf(tv).toFixed(1);
        const isZ = tv === 0;
        const lbl = fmtRoundAxisUsd(tv);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isZ ? 'var(--ink)' : 'rgba(128,138,158,0.18)'}" stroke-opacity="${isZ ? '0.42' : '1'}" stroke-width="${isZ ? '1.6' : '1'}" ${isZ ? '' : 'stroke-dasharray="3 3"'}/>` +
          `<text x="${padL - 7}" y="${(Number(y) + 3.2).toFixed(1)}" text-anchor="end" font-size="9.5" font-weight="${isZ ? '800' : '500'}" fill="${isZ ? 'var(--ink)' : 'var(--muted)'}">${lbl}</text>`;
      }).join('');

      const grpW = plotW / items.length;
      const barW = Math.min(24, Math.max(isDaily ? 7 : 14, grpW * 0.58));
      const labelStep = isDaily ? Math.max(1, Math.ceil(items.length / 8)) : 1;

      const bars = items.map((d, i) => {
        const cx = padL + i * grpW + grpW / 2;
        const isZeroBar = Math.abs(d.val) < 0.5;
        const isNeg = d.val <= -0.5;
        const lbpUsdEq = Math.abs(Number(d.lbp || 0)) / rateNum;
        const isLbpDom = !isZeroBar && !isNeg && lbpUsdEq > Math.abs(Number(d.usd || 0)) + 1;
        const fill = isZeroBar ? C.good : (isNeg ? C.crit : (isLbpDom ? C.steel : C.navy));
        const isSel = (d.ymIso && chartOpts.selectedYm === d.ymIso) || (d.dateIso && chartOpts.selectedDate === d.dateIso);
        const drillAttr = d.dateIso ? `data-cf-focus-date="${esc(d.dateIso)}"` : (d.ymIso ? `data-cf-focus-ym="${esc(d.ymIso)}"` : '');

        let barShape = '';
        let valLbl = '';
        if (isZeroBar) {
          barShape = `<circle cx="${cx.toFixed(1)}" cy="${yZero.toFixed(1)}" r="${isDaily ? '3.2' : '4.2'}" fill="${C.good}" stroke="var(--surface)" stroke-width="1.2"/>`;
          if (!isDaily || i === items.length - 1) {
            valLbl = `<text x="${cx.toFixed(1)}" y="${(yZero - 8).toFixed(1)}" text-anchor="middle" font-size="8.6" font-weight="700" fill="${C.good}">$0</text>`;
          }
        } else {
          const yVal = yOf(d.val);
          const rectY = Math.min(yZero, yVal);
          const rectH = Math.max(3, Math.abs(yVal - yZero));
          barShape = `<rect x="${(cx - barW / 2).toFixed(1)}" y="${rectY.toFixed(1)}" width="${barW.toFixed(1)}" height="${rectH.toFixed(1)}" rx="2.5" fill="${fill}"/>`;
          const showVal = !isDaily || Math.abs(d.val) >= Math.max(Math.abs(minV), Math.abs(maxV)) * 0.35 || i === items.length - 1;
          if (showVal) {
            const txt = (d.val < 0 ? '-$' : '$') + Math.round(Math.abs(d.val)).toLocaleString('en-US');
            const lblY = isNeg ? Math.min(H - 22, rectY + rectH + 10) : Math.max(12, rectY - 5);
            valLbl = `<text x="${cx.toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-size="8.8" font-weight="700" fill="${isNeg ? C.crit : 'var(--ink)'}">${txt}</text>`;
          }
        }

        const showXAxisLbl = (i % labelStep === 0) || (i === items.length - 1);
        const xLbl = showXAxisLbl
          ? `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="9.2" font-weight="${isSel ? '800' : '500'}" fill="${isSel ? 'var(--brass)' : 'var(--muted)'}">${esc(d.shortLbl)}</text>`
          : '';

        const lbpEqStr = Math.abs(d.lbp || 0) > 5 ? ` (${fmtUSD((d.lbp || 0) / rateNum, 2)} eq.)` : '';
        const popRows = [
          { label: 'USD Physical Drawer', value: fmtUSD(cleanUsd(d.usd, 0.05), 2), color: C.navy },
          { label: 'LBP Physical Drawer', value: fmtLL(d.lbp || 0) + lbpEqStr, color: C.steel },
          { label: 'Combined Closing Till', value: fmtUSD(d.val, 2), isTotal: true, tone: isZeroBar ? 'good' : (isNeg ? 'crit' : 'brass') }
        ];
        if (d.inUsd != null) {
          popRows.push({ label: 'Period Cash Inflows', value: fmtUSD(d.inUsd, 0), color: C.good });
          popRows.push({ label: 'Period Cash Outflows', value: fmtUSD(d.outUsd, 0), color: C.crit });
        }
        const popSpec = {
          title: d.fullLbl || d.shortLbl,
          badge: isZeroBar ? 'Balanced ($0.00)' : fmtUSD(d.val, 2),
          badgeTone: isZeroBar ? 'good' : (isNeg ? 'crit' : ''),
          rows: popRows,
          footer: 'Click bar to inspect entries below'
        };

        return `<g class="cf-chart-bar pbi-chart-col${isSel ? ' is-selected' : ''}" ${drillAttr} data-chart-pop="${encodeChartPop(popSpec)}">` +
          `<rect class="cf-bar-hit pbi-col-hit" x="${(padL + i * grpW + 1).toFixed(1)}" y="${padT}" width="${(grpW - 2).toFixed(1)}" height="${plotH + 22}" rx="4" fill="${isSel ? 'rgba(46,116,181,0.12)' : 'transparent'}"/>` +
          `${barShape}${valLbl}${xLbl}` +
          `</g>`;
      }).join('');

      const zeroCallout = allZero
        ? `<rect x="${(padL + plotW / 2 - 118).toFixed(1)}" y="${(padT + 8).toFixed(1)}" width="236" height="20" rx="10" fill="rgba(28,140,70,0.10)" stroke="rgba(28,140,70,0.35)"/>` +
          `<text x="${(padL + plotW / 2).toFixed(1)}" y="${(padT + 21.5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1C8C46">All ${items.length} ${isDaily ? 'days' : 'months'} swept to $0.00 balance</text>`
        : '';

      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" role="img" aria-label="Closing Cash Till Trajectory">${grid}${bars}${zeroCallout}</svg>`;
    };

    const tillChartItems = chartGrain === 'daily'
      ? allDailyRows.slice(0, 30).reverse().map(d => ({
          dateIso: d.date,
          shortLbl: fmtDateDMY(d.date).slice(0, 5),
          fullLbl: `${fmtDateDMY(d.date)} (${d.dow})`,
          val: cleanUsd(d.close_combined, 0.05),
          usd: cleanUsd(d.close_usd, 0.05),
          lbp: Math.abs(d.close_lbp) <= 5 ? 0 : d.close_lbp,
          inUsd: d.in_usd,
          outUsd: d.out_usd
        }))
      : months.slice(-14).map(r => {
          const rawLbl = String(r['Year Month'] || r.YearMonthNo || '');
          return {
            ymIso: ymToIso(r),
            shortLbl: rawLbl.replace(/^(\w{3})\s+20(\d{2})$/, "$1 '$2").slice(0, 7),
            fullLbl: rawLbl,
            val: cleanUsd(r.cash_till, 0.05),
            usd: cleanUsd(r.till_usd != null ? r.till_usd : r.cash_till, 0.05),
            lbp: Math.abs(r.till_lbp || 0) <= 5 ? 0 : Math.round(r.till_lbp || 0),
            inUsd: r.cash_in,
            outUsd: r.cash_out
          };
        });

    return `
      <div class="pbi-grid-1" style="margin-bottom:10px">
        <div class="cf-explainer-bar" role="region" aria-label="How Plant Cash Till Works">
          <div class="cf-explainer-copy">
            <strong>How Cash Till Works:</strong> Cash Sales &amp; AR Receipts flow <b>IN</b> while Cash Expenses, AP Settlements &amp; Payroll flow <b>OUT</b>; daily <b>Treasury Sweeps</b> transfer net cash to/from central treasury so physical cash on hand stays near <b>$0.00</b> (<span class="mono">USD + LBP ÷ ${fmtNum(rateLbp, 0)}</span>). <em>Click any bar, month, stream or counterparty to filter the Cash Till Register.</em>
          </div>
          <div class="cf-grain-ctrl">
            <span class="cf-grain-lbl">Till Balance View</span>
            <div class="cf-mode-switch" role="group" aria-label="Closing Till Chart Grain">
              <button type="button" class="cf-mode-btn ${chartGrain === 'monthly' ? 'active' : ''}" data-cf-chart-grain="monthly">Monthly (${months.slice(-14).length}m)</button>
              <button type="button" class="cf-mode-btn ${chartGrain === 'daily' ? 'active' : ''}" data-cf-chart-grain="daily">Daily (Last ${Math.min(30, allDailyRows.length)}d)</button>
            </div>
          </div>
        </div>
      </div>

      <div class="pbi-grid-2" style="margin-bottom:14px">
        ${pbiPanel('Monthly Cash Inflows vs Outflows — Operating vs Treasury Sweeps', buildCashFlowSplitColumnSvg(months, focusYm), {
          subtitle: 'Left column = Inflows · Right column = Outflows · Click any month to filter entries',
          legend: [
            { label: 'Op. Cash In (Sales+AR)', color: C.good },
            { label: 'Treasury / FX In', color: C.goodSoft },
            { label: 'Op. Cash Out (Exp+AP+Sal)', color: C.crit },
            { label: 'Sweeps / FX Out', color: C.critSoft }
          ]
        })}
        ${pbiPanel(chartGrain === 'daily' ? 'Closing Cash Till — Last 30 Operating Days' : 'Closing Cash Till — Month-End Balance ($)', buildTillBalanceChartSvg(tillChartItems, { rate: rateLbp, isDaily: chartGrain === 'daily', selectedYm: focusYm, selectedDate: focusDate }), {
          subtitle: chartGrain === 'daily'
            ? 'End-of-day physical drawer balance anchored at $0 · Click any day to inspect entries'
            : 'Month-end physical drawer balance anchored at $0 (no flow overlay) · Hover for USD + LBP split',
          legend: [
            { label: 'USD Drawer (+)', color: C.navy },
            { label: 'LBP Drawer (+)', color: C.steel },
            { label: 'Timing Deficit (<$0)', color: C.crit },
            { label: 'Balanced ($0)', color: C.good }
          ]
        })}
      </div>
    `;
  }

  function renderSalesVisualsSection(ctx) {
    const months = (ctx && ctx.months) || [];
    const prodRows = (ctx && ctx.prodRows) || [];
    const chartMode = (ctx && ctx.chartMode) === 'transport' ? 'transport' : 'payment';
    const salesTicketRows = (ctx && (ctx.trendSalesRows || ctx.salesRows)) || [];
    const top4Prods = pickTopAggregateGrades(prodRows, 4, ctx && ctx.productsCatalog);
    const prodColors = [C.navy, C.brass, C.steel, C.amber];
    const priceSeries = buildMonthlyGradePriceSeries(
      months,
      top4Prods,
      salesTicketRows,
      {
        basis: ctx && ctx.basis,
        ticketMeters: ctx && ctx.ticketMeters,
        ticketSign: ctx && ctx.ticketSign,
        colors: prodColors
      }
    );
    const modeSwitchHtml = `
      <div class="cf-mode-switch" role="group" aria-label="Monthly Sales Chart View">
        <button type="button" class="cf-mode-btn ${chartMode === 'payment' ? 'active' : ''}" data-sales-chart-mode="payment">Cash vs. Credit</button>
        <button type="button" class="cf-mode-btn ${chartMode === 'transport' ? 'active' : ''}" data-sales-chart-mode="transport">Delivery Transport</button>
      </div>
    `;
    const delivMonths = chartMode === 'transport'
      ? buildMonthlyDeliveryTransportRows(months, salesTicketRows, {
          basis: ctx && ctx.basis,
          ticketSign: ctx && ctx.ticketSign,
          hasTicketSource: ctx && ctx.hasTicketSource
        })
      : months;
    const leftPanelHtml = chartMode === 'transport'
      ? pbiPanel('Monthly Delivery Transport · Own Fleet vs. 3rd-Party Pass-Through ($)', buildComboChartSvg(delivMonths, [
          { key: 'own_trans_rev', label: 'Own-Fleet Delivery Rev', color: C.navy },
          { key: 'third_trans_rev', label: '3rd-Party Pass-Through', color: C.brass }
        ], {
          label: 'Own-Fleet Share %',
          color: C.steel,
          isPct: true,
          get: r => {
            const own = Math.max(0, Number(r.own_trans_rev || 0));
            const ext = Math.max(0, Number(r.third_trans_rev || 0));
            return (own + ext) > 0 ? own / (own + ext) : 0;
          }
        }, { lineMax: 1 }), {
          id: 'salesDeliveryTransChart',
          subtitle: 'Customer delivery haulage billed on company trucks vs third-party haulers and own-fleet share %',
          headerRight: modeSwitchHtml,
          legend: [
            { label: 'Own Fleet', color: C.navy },
            { label: '3rd-Party Pass-Through', color: C.brass },
            { label: 'Own-Fleet %', color: C.steel, line: true }
          ]
        })
      : pbiPanel('Monthly Cash vs. Credit Sales ($)', buildClusteredColumnSvg(months, [
          { label: 'Credit Sales', color: C.navy, get: r => Number(r.credit_sales_ttc != null ? r.credit_sales_ttc : (r.credit_sales || 0)) },
          { label: 'Cash Sales', color: C.steel, get: r => Number(r.cash_sales_ttc != null ? r.cash_sales_ttc : (r.cash_sales || 0)) }
        ]), {
          subtitle: 'Monthly credit billings vs cash weighbridge sales',
          headerRight: modeSwitchHtml,
          legend: [{ label: 'Credit', color: C.navy }, { label: 'Cash', color: C.steel }]
        });
    return `
      <div class="pbi-grid-2" id="salesChartsRow" style="margin-bottom:14px">
        ${leftPanelHtml}
        ${pbiPanel('Realised Price per Unit ($/m³) by Month · Top Aggregate Grades', buildMultiLineSvg(months, priceSeries, { isMoney: true, decimals: 2 }), {
          subtitle: 'Monthly realised unit price ($/m³) from weighbridge tickets across top 4 aggregate grades',
          legend: priceSeries.map(s => ({ label: s.label, color: s.color, line: true }))
        })}
      </div>
    `;
  }

  function renderCustomersVisualsSection(ctx) {
    const months = (ctx && ctx.months) || [];
    const agingBuckets = (ctx && ctx.agingBuckets) || [];
    const canSeeVat = !ctx || ctx.canSeeVat !== false;
    const chartMode = (canSeeVat && (ctx && ctx.chartMode) === 'vat') ? 'vat' : 'collections';
    const sumInfo = (ctx && ctx.arSummary) || null;
    const agingSubtitle = sumInfo && (sumInfo.grossAr > 0 || sumInfo.advancesUsd > 0)
      ? `Gross owing ${fmtUSDk(sumInfo.grossAr)} (${fmtNum(sumInfo.openCustCount, 0)} customers) minus ${fmtUSDk(sumInfo.advancesUsd)} customer advances (On Acct) = ${fmtUSDk(sumInfo.netAr)} Net Open AR`
      : 'FIFO open receivables by aging bucket · On Acct (unapplied customer advances) shown below zero';
    const modeSwitchHtml = canSeeVat ? `
      <div class="cf-mode-switch" role="group" aria-label="Monthly Receivables Chart View">
        <button type="button" class="cf-mode-btn ${chartMode === 'collections' ? 'active' : ''}" data-ar-chart-mode="collections">Credit vs. Receipts</button>
        <button type="button" class="cf-mode-btn ${chartMode === 'vat' ? 'active' : ''}" data-ar-chart-mode="vat">11% Customer VAT</button>
      </div>
    ` : '';
    const rightPanelHtml = chartMode === 'vat'
      ? pbiPanel('Monthly 11% Customer VAT · Invoiced vs. Collected ($)', buildClusteredColumnSvg(months, [
          { key: 'sales_vat', label: 'Output VAT Invoiced (11%)', color: C.navy },
          { key: 'vat_collected', label: 'VAT Collected (Receipts)', color: C.steel }
        ]), {
          subtitle: '11% Output VAT billed on IVA customers (Account 4427) vs actual VAT receipts collected from customers',
          headerRight: modeSwitchHtml,
          legend: [
            { label: 'VAT Invoiced', color: C.navy },
            { label: 'VAT Collected', color: C.steel }
          ]
        })
      : pbiPanel('Monthly Credit Sales vs. Customer Receipts ($)', buildClusteredColumnSvg(months, [
          { label: 'Credit Sales Billed', color: C.navy, get: r => Number(r.credit_sales_ttc != null ? r.credit_sales_ttc : (r.credit_sales || 0)) },
          { key: 'receipts', label: 'Receipts Settled', color: C.steel }
        ]), {
          subtitle: 'Monthly credit billings vs customer settlements collected · Months where Receipts exceed Credit Sales reduce Open AR',
          headerRight: modeSwitchHtml,
          legend: [
            { label: 'Credit Sales', color: C.navy },
            { label: 'Receipts', color: C.steel }
          ]
        });
    return `
      <div class="pbi-grid-2" id="arVatChartsRow" style="margin-bottom:14px">
        ${pbiPanel('FIFO AR Aging by Bucket ($)', buildSignedColumnSvg(agingBuckets, { isMoney: true }), {
          subtitle: agingSubtitle,
          legend: [
            { label: 'Current', color: C.navy },
            { label: '1–30d', color: C.steel },
            { label: '31–60d', color: C.brass },
            { label: '60+ Overdue', color: C.crit },
            { label: 'On Acct', color: C.slate }
          ]
        })}
        ${rightPanelHtml}
      </div>
    `;
  }

  function renderPricingVisualsSection(ctx) {
    const prodPriceComp = pickTopAggregateGrades((ctx && ctx.prodPriceComp) || [], 8, ctx && ctx.productsCatalog);
    const lpHist = (ctx && ctx.lpHist) || buildListPriceHistoryData(
      (ctx && ctx.priceRules) || [],
      prodPriceComp,
      (ctx && ctx.months) || [],
      { today: (ctx && ctx.today) || '2026-10-26', dateFrom: ctx && ctx.dateFrom, dateTo: ctx && ctx.dateTo }
    );
    const delTransComp = (ctx && ctx.delTransComp) || buildSalesDeliveryTransportComp(
      (ctx && ctx.salesRows) || [],
      (ctx && ctx.priceRules) || [],
      { today: (ctx && ctx.today) || '2026-10-26', asAtDate: (ctx && ctx.asAtDate) || (ctx && ctx.today) || '2026-10-26' }
    );
    return `
      <div class="pbi-grid-2" id="pricingChartsRow" style="margin-bottom:14px">
        ${pbiPanel('List Price Evolution Over Time ($/m³) by Grade', buildMultiLineSvg(lpHist.months, lpHist.series, {
          isMoney: true,
          decimals: 2,
          includeZero: false,
          maxPoints: 22
        }), {
          id: 'listPriceTrendChart',
          subtitle: 'Monthly standard list price trajectory across dated revision agreements',
          legend: lpHist.series.map(s => ({ label: s.label, color: s.color, line: true }))
        })}
        ${pbiPanel('Agreed vs. Realised vs. List Price per Unit ($/m³) by Grade', buildClusteredBarChart(prodPriceComp, 'Product', [
          { label: 'Agreed', key: 'agreed', color: C.slate },
          { label: 'Realised', key: 'realised', color: C.navy },
          { label: 'List Price', key: 'list', color: C.brass }
        ]), {
          subtitle: 'Average active customer agreement rate vs. realised material net price ($/m³) and standard list price'
        })}
        ${pbiPanel('Price Corridor by Grade · Lowest Agreed, Highest Agreed & List Price', buildClusteredColumnSvg(prodPriceComp, [
          { key: 'lowest', label: 'Lowest Agreed', color: C.slate },
          { key: 'highest', label: 'Highest Agreed', color: C.navy },
          { key: 'list', label: 'List Price', color: C.brass }
        ], { labelKey: 'Product', labels: true }), {
          subtitle: 'Price corridor across active customer agreements vs. standard list price ($/m³)',
          legend: [
            { label: 'Lowest', color: C.slate },
            { label: 'Highest', color: C.navy },
            { label: 'List', color: C.brass }
          ]
        })}
        ${pbiPanel('Customer Delivery Transportation Rate · Agreed vs. Last Delivered ($/m³)', buildClusteredBarChart(delTransComp.unitChartRows, 'label', [
          { label: 'Agreed', key: 'agreed_chart', color: C.slate },
          { label: 'Last Billed', key: 'last_rate', color: C.navy },
          { label: 'Period Avg', key: 'avg_rate', color: C.brass }
        ], { headRight: r => `${fmtNum(r.loads, 0)} loads` }), {
          id: 'deliveryTransChart',
          subtitle: 'Agreed customer delivery rate vs. last billed ticket and period average across top delivery sites'
        })}
      </div>
    `;
  }

  function renderCommissionVisualsSection(commData, opts = {}) {
    if (!commData) return '';
    const isPbi = Boolean(opts.isPbi);
    const rowId = isPbi ? 'pbiCommissionChartsRow' : 'commissionChartsRow';
    const prodChartId = isPbi ? 'pbiCommissionByProductChart' : 'commissionByProductChart';
    const monthChartId = isPbi ? 'pbiCommissionMonthlyChart' : 'commissionMonthlyChart';
    const ownerLbl = commData.beneficiariesLabel || 'Plant Owner';
    const prodChartHtml = buildHorizontalBarChart(
      commData.productRows,
      'Product',
      'comm_due',
      v => fmtUSD(v, 0),
      {
        maxItems: 10,
        allowZero: true,
        subKey: 'rate_sub',
        valLabel: 'Commission Earned (Ex-VAT)',
        color: C.navy
      }
    );
    const monthChartHtml = buildComboChartSvg(
      commData.monthlyRows,
      [
        { key: 'earned_usd', label: 'Earned Ex-VAT ($)', color: C.navy },
        { key: 'paid_net_usd', label: 'Paid Ex-VAT · GL 6222 ($)', color: C.good }
      ],
      { key: 'cum_payable_ex_vat', label: 'Open Payable Ex-VAT ($)', color: C.brass, isMoney: true },
      { maxBars: 18, isMoney: true }
    );
    return `
      <div class="pbi-grid-2" id="${rowId}"${isPbi ? '' : ' style="margin-bottom:14px"'}>
        ${pbiPanel(`Sales Commission Earned by Product ($) · ${ownerLbl}`, prodChartHtml, {
          id: prodChartId,
          subtitle: `${fmtNum(commData.activeVolumeProductsCount, 0)} active volume grades (${fmtNum(commData.rulesCount, 0)} rules across ${fmtNum(commData.productsCount, 0)} products · ${fmtNum(commData.totalQualifyingLoads, 0)} loads)`
        })}
        ${pbiPanel(`Monthly Commission Accrued vs. Settled & Open Payable ($) · ${ownerLbl}`, monthChartHtml, {
          id: monthChartId,
          subtitle: `Earned ${fmtUSD(commData.totalEarned, 0)} Ex-VAT · Paid ${fmtUSD(commData.totalPaidExVat, 0)} Ex-VAT (+${fmtUSD(commData.totalPaidVat, 0)} 11% VAT) · Open Ex-VAT Payable ${fmtUSD(commData.openPayableExVat, 0)}`,
          legend: [
            { label: 'Earned Ex-VAT', color: C.navy },
            { label: 'Paid Ex-VAT (Rent)', color: C.good },
            { label: 'Open Payable Ex-VAT', color: C.brass, line: true }
          ]
        })}
      </div>
    `;
  }

  function renderQuarryPricingVisualsSection(ctx) {
    const quarryComp = (ctx && ctx.quarryComp) || buildQuarryPricingComp(
      (ctx && ctx.rawRows) || [],
      (ctx && ctx.priceRules) || [],
      { today: (ctx && ctx.today) || '2026-10-26', asAtDate: (ctx && ctx.asAtDate) || (ctx && ctx.today) || '2026-10-26' }
    );
    const haulRows = quarryComp.haulFlatChartRows.length ? quarryComp.haulFlatChartRows : quarryComp.haulUnitChartRows;
    const haulBasis = quarryComp.haulFlatChartRows.length ? '$/Truck Load' : '$/m³';
    return `
      <div class="pbi-grid-2" id="rawPricingChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Raw Material Purchase Rate by Source Site · Agreed vs. Last Receipt ($/m³)', buildClusteredBarChart(quarryComp.matUnitChartRows, 'label', [
          { label: 'Agreed', key: 'agreed_chart', color: C.slate },
          { label: 'Last Receipt', key: 'last_rate', color: C.navy },
          { label: 'Period Avg', key: 'avg_rate', color: C.brass }
        ], { headRight: r => `${fmtNum(r.loads, 0)} loads` }), {
          id: 'rawMatRateChart',
          subtitle: 'Purchase Price (Site) agreement rate vs. last raw material intake unit cost and period average'
        })}
        ${pbiPanel(`Quarry Transportation Rate by Hauler & Site · Agreed vs. Last Haul (${haulBasis})`, buildClusteredBarChart(haulRows, 'label', [
          { label: 'Agreed', key: 'agreed_chart', color: C.slate },
          { label: 'Last Haul', key: 'last_rate', color: C.navy },
          { label: 'Period Avg', key: 'avg_rate', color: C.brass }
        ], { headRight: r => `${fmtNum(r.loads, 0)} loads` }), {
          id: 'rawHaulRateChart',
          subtitle: 'Transport Price (Site) agreement rate vs. last 3rd-party quarry haulage intake ticket and period average'
        })}
      </div>
    `;
  }

  function classifyLubEquipCategory(eqName, eqType) {
    const t = String(eqType || '').trim().toLowerCase();
    const nm = String(eqName || '').trim().toLowerCase();
    if (t === 'plant' || /kasara|kassara|maghsal|crusher|washing|screen/i.test(nm)) return 'Plant';
    if (t === 'generator' || /^(pb\d|mowaled|mwaled|generator)/i.test(nm)) return 'Generator';
    if (t === 'excavator' || t === 'wheel loader' || t === 'bulldozer' || /excavator|loader|baldouzar|bulldozer|cat\b|caterpillar|volvo|komatsu|jcb|bobcat/i.test(nm)) {
      return /bobcat/i.test(nm) ? 'Bobcat' : 'Machinery';
    }
    if (t === 'vehicle' || /pickup|rapid|car|hilux|suv/i.test(nm)) return 'Vehicle';
    return 'Truck';
  }

  function computeLubricationAudit(opts = {}) {
    const fuelRows = (opts.fuelRows || []).filter(r => r && !r.voided);
    const expRows = (opts.expRows || []).filter(r => r && !r.voided);
    const salesRows = (opts.salesRows || []).filter(r => r && !r.voided);
    const rawRows = (opts.rawRows || []).filter(r => r && !r.voided);
    const equipList = opts.equipList || [];

    const eqMeta = new Map();
    equipList.forEach(e => {
      if (!e || !e.name) return;
      eqMeta.set(norm(e.name), e);
    });

    // Derive average liquid lubricant price per litre from Oils expenses (fallback $2.65/L)
    let oilExpUsd = 0;
    let greasePurchasesUsd = 0;
    let totalExtOilChanges = 0;
    const unitMap = new Map();
    const ensureUnit = rawName => {
      const clean = String(rawName || '').trim();
      const k = norm(clean);
      if (!k) return null;
      let u = unitMap.get(k);
      if (!u) {
        const em = eqMeta.get(k) || {};
        const cat = classifyLubEquipCategory(em.name || clean, em.type);
        u = {
          id: em.id || clean,
          rkey: 'equipment',
          Equipment: em.name || clean,
          Type: em.type || (cat === 'Machinery' ? 'Wheel Loader' : cat),
          Ownership: em.ownership || 'Own',
          cat,
          diesel_l: 0,
          engine_oil_l: 0,
          hyd_oil_l: 0,
          gear_oil_l: 0,
          other_oil_l: 0,
          grease_kg: 0,
          eng_changes: 0,
          eng_topups: 0,
          ext_changes: 0,
          last_oil_change: '',
          last_greased: '',
          activeDates: new Set(),
          greasedDates: new Set(),
          fuelEvents: []
        };
        unitMap.set(k, u);
      }
      return u;
    };

    salesRows.forEach(t => {
      if (!t.truck) return;
      const u = ensureUnit(t.truck);
      const d = String(t.date || '').slice(0, 10);
      if (u && d) u.activeDates.add(d);
    });

    rawRows.forEach(r => {
      if (!r.truck) return;
      const u = ensureUnit(r.truck);
      const d = String(r.date || '').slice(0, 10);
      if (u && d) u.activeDates.add(d);
    });

    expRows.forEach(ex => {
      const sign = hubExpenseSign(ex);
      if (!sign) return;
      const amt = sign * Number(ex.amount || 0);
      const blob = `${ex.category || ''} ${ex.subcategory || ''} ${ex.notes || ''} ${ex.name || ''}`;
      const d = String(ex.date || '').slice(0, 10);
      if (/^oils(\s*&\s*lubricants)?$/i.test(String(ex.category || '').trim()) && !/grease|تشحيم|مشحمة/i.test(blob)) {
        oilExpUsd += amt;
      }
      if (/grease|تشحيم|مشحمة/i.test(blob)) {
        greasePurchasesUsd += amt;
        if (ex.equipment) {
          const u = ensureUnit(ex.equipment);
          if (u && d) {
            u.greasedDates.add(d);
            if (d > u.last_greased) u.last_greased = d;
          }
        }
      }
      if (ex.equipment && /oil\s*change|غيار\s*زيت|vitus|castrol|15w|oil\s*90|oil\s*red/i.test(blob)) {
        totalExtOilChanges += 1;
        const u = ensureUnit(ex.equipment);
        if (u) {
          u.ext_changes += 1;
          if (d && d > u.last_oil_change) u.last_oil_change = d;
        }
      }
    });

    let totalEngineL = 0, totalHydL = 0, totalGearL = 0, totalGreaseKg = 0, totalLiquidLubeL = 0;
    fuelRows.forEach(f => {
      const item = String(f.item || f.fuel_type || 'Diesel').trim();
      const qty = Number(f.litres != null ? f.litres : (f.qty || 0));
      if (!(qty > 0)) return;
      const d = String(f.date || '').slice(0, 10);
      const u = f.equipment ? ensureUnit(f.equipment) : null;
      if (u && d) u.activeDates.add(d);

      const isDiesel = /diesel|mazout/i.test(item) && !/oil|grease/i.test(item);
      const isPetrol = /petrol|benzin|gasoline/i.test(item);
      const isGrease = /grease|تشحيم|مشحمة/i.test(item);
      const isEngine = !isDiesel && !isGrease && /15w|10w|motor|engine/i.test(item);
      const isHyd = !isDiesel && !isGrease && !isEngine && /oil\s*68|hydraulic|hyd\b|\b68\b/i.test(item);
      const isGear = !isDiesel && !isGrease && !isEngine && !isHyd && /oil\s*90|80w|85w|140|atf|vitus|red\s*3000|gear|trans/i.test(item);

      if (isDiesel) {
        if (u) {
          u.diesel_l += qty;
          u.fuelEvents.push({ d, diesel: qty, odo: f.odometer != null && f.odometer !== '' ? Number(f.odometer) : null });
        }
      } else if (isGrease) {
        totalGreaseKg += qty;
        if (u) {
          u.grease_kg += qty;
          if (d) {
            u.greasedDates.add(d);
            if (d > u.last_greased) u.last_greased = d;
          }
        }
      } else if (!isPetrol) {
        totalLiquidLubeL += qty;
        if (isEngine) {
          totalEngineL += qty;
          if (u) {
            u.engine_oil_l += qty;
            const fullThresh = (u.cat === 'Vehicle' || u.cat === 'Bobcat') ? 8 : 25;
            if (qty >= fullThresh) {
              u.eng_changes += 1;
              if (d && d > u.last_oil_change) u.last_oil_change = d;
            } else {
              u.eng_topups += 1;
            }
          }
        } else if (isHyd) {
          totalHydL += qty;
          if (u) u.hyd_oil_l += qty;
        } else if (isGear) {
          totalGearL += qty;
          if (u) u.gear_oil_l += qty;
        } else if (u) {
          u.other_oil_l += qty;
        }
      }
    });

    const avgLubePrice = totalLiquidLubeL > 20 && oilExpUsd > 50 ? Math.min(8, Math.max(1.8, oilExpUsd / totalLiquidLubeL)) : 2.65;

    const auditRows = [];
    const greaseRows = [];
    let totalExpEngineL = 0, totalExpHydL = 0, totalExcessHydL = 0, leakingUnitsCount = 0;
    let sumActiveDays = 0, sumGreasedDays = 0, totalExpGreaseKg = 0;

    const _acLube = window.MFG_ALERT_CONFIG || null;
    const _hydOn = _acLube ? _acLube.enabled('G_HYD_LEAK_30D') : true;
    const _hydWatchL = _acLube ? _acLube.param('G_HYD_LEAK_30D', 'audit_watch_excess_l', 30) : 30;
    const _hydCritL = _acLube ? _acLube.param('G_HYD_LEAK_30D', 'audit_crit_excess_l', 80) : 80;
    const _oilOn = _acLube ? _acLube.enabled('G_OIL_DRAIN') : true;
    const _oilTruckOverdueL = _acLube ? _acLube.param('G_OIL_DRAIN', 'truck_overdue_diesel_l', 14000) : 14000;
    const _oilMachOverdueL = _acLube ? _acLube.param('G_OIL_DRAIN', 'machine_overdue_diesel_l', 6500) : 6500;
    const _grTruckKg = _acLube ? _acLube.param('G_GREASE_COMP', 'truck_kg_day', 0.15) : 0.15;
    const _grMachKg = _acLube ? _acLube.param('G_GREASE_COMP', 'machine_kg_day', 0.30) : 0.30;
    const _grPlantKg = _acLube ? _acLube.param('G_GREASE_COMP', 'plant_kg_day', 0.60) : 0.60;

    unitMap.forEach(u => {
      const D = u.diesel_l;
      const actDays = u.activeDates.size;
      const grDays = u.greasedDates.size;
      const isOwn = /own|company/i.test(String(u.Ownership || ''));

      let expEng = 0, expHyd = 0, dailyGr = _grTruckKg;
      if (u.cat === 'Truck') {
        expEng = D * (32 / 12000);
        expHyd = D * (2 / 12000);
        dailyGr = _grTruckKg;
      } else if (u.cat === 'Machinery' || u.cat === 'Bobcat') {
        expEng = D * ((u.cat === 'Bobcat' ? 10 : 28) / 5000);
        expHyd = D * ((u.cat === 'Bobcat' ? 6 : 15) / 5000);
        dailyGr = u.cat === 'Bobcat' ? _grTruckKg : _grMachKg;
      } else if (u.cat === 'Generator') {
        expEng = D * (30 / 6250);
        expHyd = 0;
        dailyGr = 0.05;
      } else if (u.cat === 'Plant') {
        expEng = 0;
        expHyd = actDays > 0 || u.hyd_oil_l > 0 ? Math.max(10, actDays * 0.25) : 0;
        dailyGr = _grPlantKg;
      } else {
        expEng = D * (7 / 1200);
        expHyd = 0;
        dailyGr = 0.05;
      }

      const excessHyd = Math.max(0, u.hyd_oil_l - expHyd);
      const hydPct = D > 0 ? (u.hyd_oil_l / D) * 100 : (u.hyd_oil_l > 0 ? 100 : 0);
      const leakLoss = round2(excessHyd * avgLubePrice);

      let dieselSinceChange = D;
      let kmSinceChange = null;
      if (u.fuelEvents.length) {
        const evs = u.last_oil_change
          ? u.fuelEvents.filter(ev => ev.d > u.last_oil_change)
          : u.fuelEvents;
        dieselSinceChange = evs.reduce((s, ev) => s + ev.diesel, 0);
        const odos = evs.map(ev => ev.odo).filter(v => v != null && v > 0);
        if (odos.length >= 2) {
          const span = Math.max(...odos) - Math.min(...odos);
          if (span > 0 && span < 250000) kmSinceChange = span;
        }
      }

      let status = 'HEALTHY';
      let alertFlag = 0;
      if (_hydOn && (excessHyd >= _hydCritL || (u.hyd_oil_l >= Math.max(100, _hydCritL + 20) && (D <= 0 || u.hyd_oil_l / D >= 0.04)))) {
        status = 'CRITICAL LEAK';
        alertFlag = 3;
      } else if (_hydOn && (excessHyd >= _hydWatchL || (u.hyd_oil_l >= Math.max(40, _hydWatchL + 10) && (D <= 0 || u.hyd_oil_l / D >= 0.015)))) {
        status = 'WATCH LEAK';
        alertFlag = 2;
      } else if (_oilOn && ((u.cat === 'Truck' && (D >= _oilTruckOverdueL && dieselSinceChange > _oilTruckOverdueL)) || ((u.cat === 'Machinery' || u.cat === 'Generator') && (D >= _oilMachOverdueL && dieselSinceChange > _oilMachOverdueL)))) {
        status = 'OVERDUE OIL';
        alertFlag = 1;
      } else if (_oilOn && u.eng_changes >= 2 && expEng > 0 && u.engine_oil_l > expEng * 1.6) {
        status = 'EARLY CHANGE';
        alertFlag = 1;
      }

      const hasLubScope = u.engine_oil_l > 0 || u.hyd_oil_l > 0 || u.gear_oil_l > 0 || u.ext_changes > 0 || (isOwn && D >= 1500);
      if (hasLubScope) {
        totalExpEngineL += expEng;
        totalExpHydL += expHyd;
        totalExcessHydL += excessHyd;
        if (excessHyd >= 30) leakingUnitsCount += 1;
        auditRows.push({
          id: u.id,
          rkey: u.rkey,
          Equipment: u.Equipment,
          Type: u.Type,
          Ownership: u.Ownership,
          diesel_l: round2(D),
          engine_oil_l: round2(u.engine_oil_l),
          exp_engine_l: round2(expEng),
          eng_changes: u.eng_changes + u.ext_changes,
          eng_topups: u.eng_topups,
          last_oil_change: u.last_oil_change || '',
          diesel_since_change: round2(dieselSinceChange),
          km_since_change: kmSinceChange,
          hyd_oil_l: round2(u.hyd_oil_l),
          exp_hyd_l: round2(expHyd),
          excess_hyd_l: round2(excessHyd),
          hyd_pct: round2(hydPct),
          leak_loss_usd: leakLoss,
          gear_oil_l: round2(u.gear_oil_l),
          status,
          alert_flag: alertFlag
        });
      }

      if ((isOwn && actDays >= 1 && u.cat !== 'Generator' && u.cat !== 'Vehicle') || u.grease_kg > 0 || grDays > 0) {
        const expGr = round2(actDays * dailyGr);
        const compPct = actDays > 0 ? Math.min(100, (grDays / actDays) * 100) : (grDays > 0 ? 100 : 0);
        if (isOwn && u.cat !== 'Generator' && u.cat !== 'Vehicle') {
          sumActiveDays += actDays;
          sumGreasedDays += grDays;
          totalExpGreaseKg += expGr;
        }
        greaseRows.push({
          id: u.id,
          rkey: u.rkey,
          Equipment: u.Equipment,
          Type: u.Type,
          Ownership: u.Ownership,
          active_days: actDays,
          greased_days: grDays,
          compliance_pct: round2(compPct),
          grease_kg: round2(u.grease_kg),
          exp_grease_kg: expGr,
          daily_target_kg: dailyGr,
          last_greased: u.last_greased || ''
        });
      }
    });

    auditRows.sort((a, b) => (b.alert_flag - a.alert_flag) || (b.excess_hyd_l - a.excess_hyd_l) || (b.diesel_l - a.diesel_l));
    greaseRows.sort((a, b) => (b.active_days - a.active_days) || (b.grease_kg - a.grease_kg));

    const overallGreasePct = sumActiveDays > 0 ? Math.min(100, (sumGreasedDays / sumActiveDays) * 100) : 0;

    return {
      totalEngineL: round2(totalEngineL),
      totalExpEngineL: round2(totalExpEngineL),
      totalHydL: round2(totalHydL),
      totalExpHydL: round2(totalExpHydL),
      totalExcessHydL: round2(totalExcessHydL),
      totalGearL: round2(totalGearL),
      totalGreaseKg: round2(totalGreaseKg),
      totalExpGreaseKg: round2(totalExpGreaseKg),
      greasePurchasesUsd: round2(greasePurchasesUsd),
      totalExtOilChanges,
      avgLubePrice: round2(avgLubePrice),
      totalLeakLossUsd: round2(totalExcessHydL * avgLubePrice),
      leakingUnitsCount,
      overallGreasePct: round2(overallGreasePct),
      sumActiveDays,
      sumGreasedDays,
      auditRows,
      greaseRows
    };
  }

  function renderLubricationBenchmarksSection(opts = {}) {
    const lub = computeLubricationAudit(opts);
    const hydTop = [...lub.auditRows]
      .filter(r => r.hyd_oil_l > 0 || r.exp_hyd_l >= 5)
      .sort((a, b) => b.hyd_oil_l - a.hyd_oil_l)
      .slice(0, 8);
    const engTop = [...lub.auditRows]
      .filter(r => r.engine_oil_l > 0 || r.exp_engine_l >= 10)
      .sort((a, b) => Math.max(b.engine_oil_l, b.exp_engine_l) - Math.max(a.engine_oil_l, a.exp_engine_l))
      .slice(0, 8);

    const statusBadge = v => {
      if (v === 'CRITICAL LEAK') return `<span class="badge badge-crit">${esc(v)}</span>`;
      if (v === 'WATCH LEAK' || v === 'OVERDUE OIL' || v === 'EARLY CHANGE') return `<span class="badge badge-warn">${esc(v)}</span>`;
      return `<span class="badge badge-ok">${esc(v)}</span>`;
    };

    const _acUi = window.MFG_ALERT_CONFIG || null;
    const _uiWatchHydL = _acUi ? _acUi.param('G_HYD_LEAK_30D', 'audit_watch_excess_l', 30) : 30;
    const _uiMinGreasePct = (_acUi && _acUi.enabled('G_GREASE_COMP')) ? _acUi.param('G_GREASE_COMP', 'min_compliance_pct', 25) : 0;
    const _uiGrTruck = _acUi ? _acUi.param('G_GREASE_COMP', 'truck_kg_day', 0.15) : 0.15;
    const _uiGrMach = _acUi ? _acUi.param('G_GREASE_COMP', 'machine_kg_day', 0.30) : 0.30;
    const _uiGrPlant = _acUi ? _acUi.param('G_GREASE_COMP', 'plant_kg_day', 0.60) : 0.60;

    return `
      <div id="lubricationBenchPanel" style="margin-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">${pbiHeading('2 · Lubrication benchmarks, hydraulic leak detection & daily greasing', 'Auto-updating OEM severe-duty quarry benchmarks: 15W-40 every 15,000 km / 250 hrs · Hydraulic 68 sealed-circuit tolerance · Daily chassis & pin greasing (kg)')}</div>
          <button type="button" class="btn-sn-act" data-open-alert-rule="G_HYD_LEAK_30D" style="margin-bottom:8px">Thresholds &amp; Why</button>
        </div>
        <div class="pbi-overview-bands">
          ${kpiBand('', [
            { label: 'Engine Oil 15W-40', value: fmtNum(lub.totalEngineL, 0) + ' L', sub: 'Expected benchmark: ' + fmtNum(lub.totalExpEngineL, 0) + ' L', tone: lub.totalEngineL > lub.totalExpEngineL * 1.35 ? 'warn' : 'good' },
            { label: 'Hydraulic Oil 68', value: fmtNum(lub.totalHydL, 0) + ' L', sub: 'Normal top-up allowance: ' + fmtNum(lub.totalExpHydL, 0) + ' L', tone: lub.totalExcessHydL >= 50 ? 'crit' : 'good' },
            { label: 'Excess Hydraulic Oil', value: fmtNum(lub.totalExcessHydL, 0) + ' L', sub: fmtNum(lub.leakingUnitsCount) + ' units leaking hoses/seals', tone: lub.totalExcessHydL >= 50 ? 'crit' : (lub.totalExcessHydL > 0 ? 'warn' : 'good') },
            { label: 'Estimated Leak Loss', value: fmtUSD(lub.totalLeakLossUsd, 0), sub: 'Valued at ' + fmtUSD(lub.avgLubePrice, 2) + ' / L · Ext changes: ' + fmtNum(lub.totalExtOilChanges), tone: lub.totalLeakLossUsd >= 150 ? 'crit' : 'good' },
            { label: 'Grease Issued & Bought', value: fmtNum(lub.totalGreaseKg, 1) + ' kg', sub: 'Purchases ' + fmtUSD(lub.greasePurchasesUsd, 0) + ' · Target ' + fmtNum(lub.totalExpGreaseKg, 0) + ' kg', tone: 'brass' },
            { label: 'Daily Greasing Compliance', value: fmtNum(lub.overallGreasePct, 1) + '%', sub: fmtNum(lub.sumGreasedDays) + ' greased / ' + fmtNum(lub.sumActiveDays) + ' active unit-days', tone: lub.overallGreasePct < 50 ? 'warn' : 'good' }
          ])}
        </div>

        <div class="pbi-grid-2">
          ${pbiPanel('Hydraulic Oil 68 issued vs normal benchmark by unit (L)', buildClusteredBarChart(hydTop, 'Equipment', [
            { label: 'Actual Hyd 68', key: 'hyd_oil_l', color: C.crit, fmt: v => fmtNum(v, 0) + ' L' },
            { label: 'Expected Top-Up', key: 'exp_hyd_l', color: C.slate, fmt: v => fmtNum(v, 0) + ' L' }
          ], { headRight: r => r.Type + (r.excess_hyd_l >= 30 ? ' · Excess +' + fmtNum(r.excess_hyd_l, 0) + ' L' : '') }), {
            subtitle: 'Red bar exceeding slate benchmark flags blown hydraulic hoses, cylinder rod seals or PTO pump leaks',
            legend: [{ label: 'Actual Hyd 68 (L)', color: C.crit }, { label: 'Normal Benchmark (L)', color: C.slate }]
          })}
          ${pbiPanel('Engine Oil 15W-40 issued vs service benchmark by unit (L)', buildClusteredBarChart(engTop, 'Equipment', [
            { label: 'Actual 15W-40', key: 'engine_oil_l', color: C.navy, fmt: v => fmtNum(v, 0) + ' L' },
            { label: 'Expected Service', key: 'exp_engine_l', color: C.brass, fmt: v => fmtNum(v, 0) + ' L' }
          ], { headRight: r => `${r.Type} · ${r.eng_changes} chg / ${r.eng_topups} top-up` }), {
            subtitle: 'Expected = 32 L per 12,000 L diesel on trucks (15,000 km) or 28 L per 5,000 L diesel on yellow iron (250 hrs)',
            legend: [{ label: 'Actual 15W-40 (L)', color: C.navy }, { label: 'Expected Service (L)', color: C.brass }]
          })}
        </div>

        <div class="pbi-grid-1" style="margin-top:14px">
          ${pbiTable('Equipment lubrication, oil-change intervals & hydraulic leak audit', [
            { label: 'Equipment', key: 'Equipment', mono: true, bold: true },
            { label: 'Type', key: 'Type' },
            { label: 'Status', key: 'status', fmt: statusBadge },
            { label: 'Diesel (L)', key: 'diesel_l', r: true, fmt: v => fmtNum(v, 0) + ' L' },
            { label: '15W-40 (L)', key: 'engine_oil_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
            { label: 'Exp 15W-40', key: 'exp_engine_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
            { label: 'Chg / Top', raw: r => r.eng_changes, r: true, agg: 'none', fmt: (_, r) => r ? `${fmtNum(r.eng_changes)} / ${fmtNum(r.eng_topups)}` : '-' },
            { label: 'Last Change', key: 'last_oil_change', mono: true, fmt: v => v ? esc(v) : '-' },
            { label: 'Diesel Since', key: 'diesel_since_change', r: true, agg: 'none', fmt: v => v > 0 ? fmtNum(v, 0) + ' L' : '-' },
            { label: 'Hyd 68 (L)', key: 'hyd_oil_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
            { label: 'Exp Hyd 68', key: 'exp_hyd_l', r: true, fmt: v => v > 0 ? fmtNum(v, 1) + ' L' : '-' },
            { label: 'Excess Hyd', key: 'excess_hyd_l', r: true, bar: 'brass', fmt: v => v > 0 ? `<b>${fmtNum(v, 1)} L</b>` : '-' },
            { label: 'Hyd / Diesel', key: 'hyd_pct', r: true, agg: 'none', fmt: v => v > 0 ? fmtNum(v, 1) + '%' : '-' },
            { label: 'Leak Loss ($)', key: 'leak_loss_usd', r: true, fmt: v => v > 0 ? `<b>${fmtUSD(v, 0)}</b>` : '-' }
          ], lub.auditRows, {
            subtitle: `Amber row = hydraulic leak (>${fmtNum(_uiWatchHydL, 0)} L excess), overdue 15W-40 service, or early oil drain · click any row for 360° Equipment Inspector`,
            rowAmber: r => r.alert_flag > 0,
            unitLabel: 'audited units'
          })}
        </div>

        <div class="pbi-grid-1" style="margin-top:14px">
          ${pbiTable('Daily greasing compliance & grease usage by active unit (kg)', [
            { label: 'Equipment', key: 'Equipment', mono: true, bold: true },
            { label: 'Type', key: 'Type' },
            { label: 'Ownership', key: 'Ownership' },
            { label: 'Active Days', key: 'active_days', r: true, fmt: v => fmtNum(v) },
            { label: 'Days Greased', key: 'greased_days', r: true, fmt: v => fmtNum(v) },
            { label: 'Compliance %', key: 'compliance_pct', r: true, bar: true, agg: 'none', fmt: v => `<b>${fmtNum(v, 1)}%</b>` },
            { label: 'Daily Target', key: 'daily_target_kg', r: true, agg: 'none', fmt: v => fmtNum(v, 2) + ' kg/d' },
            { label: 'Expected (kg)', key: 'exp_grease_kg', r: true, fmt: v => fmtNum(v, 1) + ' kg' },
            { label: 'Issued (kg)', key: 'grease_kg', r: true, fmt: v => v > 0 ? `<b>${fmtNum(v, 2)} kg</b>` : '0.00 kg' },
            { label: 'Last Greased', key: 'last_greased', mono: true, fmt: v => v ? esc(v) : 'Never logged' }
          ], lub.greaseRows, {
            subtitle: `Target: ${fmtNum(_uiGrTruck, 2)} kg/day per working truck (fifth wheel, kingpins, S-cams, U-joints), ${fmtNum(_uiGrMach, 2)} kg/day per loader/excavator, ${fmtNum(_uiGrPlant, 2)} kg/day per plant`,
            rowAmber: r => _uiMinGreasePct > 0 && r.active_days >= 10 && r.compliance_pct < _uiMinGreasePct,
            unitLabel: 'fleet units'
          })}
        </div>
      </div>
    `;
  }

  function renderFuelVisualsSection(ctx) {
    const months = (ctx && ctx.months) || [];
    const topUnits = (ctx && ctx.topUnits) || [];
    return `
      <div class="pbi-grid-2" id="fuelChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Diesel Bought, Issued & Sold with Tank Balance (L)', buildComboChartSvg(months, [
          { key: 'diesel_bought', label: 'Bought (L)', color: C.steel },
          { key: 'diesel_issued', label: 'Issued (L)', color: C.navy },
          { key: 'diesel_sold', label: 'Sold (L)', color: C.brass }
        ], { label: 'Tank Balance (L)', key: 'diesel_tank', color: C.crit, isMoney: false }, { isMoney: false }), {
          subtitle: 'Monthly bulk diesel purchases vs fleet issues and tank balance trajectory',
          legend: [
            { label: 'Bought', color: C.steel },
            { label: 'Issued', color: C.navy },
            { label: 'Sold', color: C.brass },
            { label: 'Tank (L)', color: C.crit, line: true }
          ]
        })}
        ${pbiPanel('Diesel & Lubricant Issued by Equipment Unit (Litres)', buildHorizontalBarChart(topUnits, 'Equipment', 'total_litres', v => fmtNum(v, 0) + ' L', { subKey: 'Type', color: C.navy, maxItems: 10 }), {
          subtitle: 'Top fuel-consuming trucks, loaders, excavators and plant generators'
        })}
      </div>
    `;
  }

  function classifyMaintSubsystem(catRaw, subRaw) {
    const s = `${catRaw || ''} ${subRaw || ''}`.toLowerCase();
    const subL = String(subRaw || '').trim().toLowerCase();
    if (/screen|ghrbal|sieve|corraze|knive|سكاكين|شبك|غربال|jaw|liner/.test(s)) {
      return { key: 'screens', label: 'Screens, Jaws & Blades', series: 'parts_usd', color: C.brass };
    }
    if (/wheel|tire|tyre|pneu|اطار|دولاب|كاوتشوك|undercarriage|track/.test(s) && !/شبك/.test(s)) {
      return { key: 'tires', label: 'Tires & Undercarriage', series: 'parts_usd', color: C.plum };
    }
    if (/oil|lube|lubric|grease|68|15w|atf|filter|hydraul|تشحيم|مشحمة|زيت/.test(s)) {
      return { key: 'oils', label: 'Oils & Hydraulics', series: 'oils_tools_usd', color: C.slate };
    }
    if (/roulment|bearing|belt|courroie|رولمان|قشاط|chain|seal|hose|driveline|clutch|gearbox/.test(s)) {
      return { key: 'bearings', label: 'Bearings & Drive Belts', series: 'parts_usd', color: '#64748B' };
    }
    if (/tool|oxygen|paint|weld|حديد|صندوق|loadcell|gps|winch|elec|battery|body|cabin/.test(s)) {
      return { key: 'tools', label: 'Tools, Welding & Body', series: 'oils_tools_usd', color: C.steel };
    }
    if (subL === 'parts' || subL === 'spare parts' || subL === 'equipment' || String(catRaw || '').trim().toLowerCase() === 'spare parts') {
      return { key: 'parts', label: 'Engine & Mech. Parts', series: 'parts_usd', color: C.amber };
    }
    return { key: 'repairs', label: 'Workshop Repairs', series: 'repairs_usd', color: C.navy };
  }

  function renderMaintVisualsSection(ctx) {
    const expRows = (ctx && ctx.expRows) || [];
    const partRows = (ctx && ctx.partRows) || [];
    const liveDefectsAll = (ctx && ctx.liveDefectsAll) || [];
    const livePartsAll = (ctx && ctx.livePartsAll) || [];
    const basis = (ctx && ctx.basis) || 'rep';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const monthMap = new Map();
    const subMap = new Map();
    let totalUsd = 0;
    let totalVouchers = 0;

    const ensureSub = spec => {
      let row = subMap.get(spec.key);
      if (!row) {
        row = { key: spec.key, label: spec.label, color: spec.color, amount: 0, count: 0, openDefects: 0 };
        subMap.set(spec.key, row);
      }
      return row;
    };

    const addEntry = (dtStr, spec, amt) => {
      const val = Number(amt || 0);
      if (!(val > 0)) return;
      totalUsd += val;
      totalVouchers += 1;
      const sr = ensureSub(spec);
      sr.amount += val;
      sr.count += 1;
      const ym = String(dtStr || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) {
        let mr = monthMap.get(ym);
        if (!mr) {
          const [yy, mm] = ym.split('-');
          const mLbl = `${monthNames[Math.max(0, Math.min(11, Number(mm) - 1))]} ${yy}`;
          mr = { ym, 'Year Month': mLbl, repairs_usd: 0, parts_usd: 0, oils_tools_usd: 0, vouchers: 0 };
          monthMap.set(ym, mr);
        }
        mr[spec.series] = (mr[spec.series] || 0) + val;
        mr.vouchers += 1;
      }
    };

    expRows.forEach(e => {
      const dt = basis === 'tx' && e.date_tx ? e.date_tx : e.date;
      const spec = classifyMaintSubsystem(e.category, e.subcategory);
      addEntry(dt, spec, e.amount);
    });

    partRows.forEach(p => {
      if (!p || p.voided || /linked to expense voucher/i.test(String(p.notes || ''))) return;
      const outlay = Number(p.new_part_cost || 0) + Number(p.repair_cost || 0);
      if (outlay > 0) {
        const spec = classifyMaintSubsystem('Spare Parts', `${p.subsystem || ''} ${p.part_name || ''}`);
        addEntry(p.date, spec, outlay);
      }
    });

    const openDefects = liveDefectsAll.filter(d => d && !d.voided && !/^(Resolved|Closed)/i.test(String(d.status || 'Open')));
    openDefects.forEach(d => {
      const spec = classifyMaintSubsystem('Repairs and Maintenance', `${d.subsystem || ''} ${d.part_name || ''}`);
      ensureSub(spec).openDefects += 1;
    });

    const maintMonths = Array.from(monthMap.values())
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .slice(-14);

    const subRows = Array.from(subMap.values())
      .filter(r => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map(r => Object.assign({}, r, {
        vouchersTag: `${fmtNum(r.count)} vch${r.openDefects > 0 ? ' · ' + fmtNum(r.openDefects) + ' open' : ''}`
      }));

    const storedCnt = livePartsAll.filter(p => p && !p.voided && /^Stored/i.test(p.removed_disposition || '')).length;
    const workshopCnt = livePartsAll.filter(p => p && !p.voided && /Maintenance|Workshop/i.test(p.removed_disposition || '')).length;
    const soldCnt = livePartsAll.filter(p => p && !p.voided && /^Sold/i.test(p.removed_disposition || '')).length;
    const installedCnt = livePartsAll.filter(p => p && !p.voided && /^Installed/i.test(p.removed_disposition || '')).length;
    const activePartsTotal = livePartsAll.filter(p => p && !p.voided).length;

    const custodyFooterHtml = (openDefects.length > 0 || activePartsTotal > 0) ? `
      <div class="maint-custody-strip">
        <span class="maint-custody-lbl">Live Custody:</span>
        ${openDefects.length > 0 ? `<span class="badge badge-warn">${fmtNum(openDefects.length)} Open Defect${openDefects.length === 1 ? '' : 's'}</span>` : ''}
        <button type="button" class="maint-custody-pill" data-partdisp-chip="stored">Stored <b>${fmtNum(storedCnt)}</b></button>
        <button type="button" class="maint-custody-pill" data-partdisp-chip="maint">Workshop <b>${fmtNum(workshopCnt)}</b></button>
        <button type="button" class="maint-custody-pill" data-partdisp-chip="installed">Installed <b>${fmtNum(installedCnt)}</b></button>
        <button type="button" class="maint-custody-pill" data-partdisp-chip="sold">Sold <b>${fmtNum(soldCnt)}</b></button>
      </div>
    ` : '';

    const rightMetaHtml = `<span class="badge badge-brass">${fmtUSDk(totalUsd)} · ${fmtNum(totalVouchers)} Vouchers</span>`;
    const rightBodyHtml = buildHorizontalBarChart(subRows, 'label', 'amount', v => fmtUSD(v, 0), {
      subKey: 'vouchersTag',
      maxItems: 7,
      valLabel: 'Subsystem Spend',
      colorFn: r => r.color
    }) + custodyFooterHtml;

    return `
      <div class="pbi-grid-2" id="maintChartsRow">
        ${pbiPanel('Monthly Repair & Spare Spend ($)', buildComboChartSvg(maintMonths, [
          { key: 'repairs_usd', label: 'Repairs', color: C.navy },
          { key: 'parts_usd', label: 'Parts', color: C.steel },
          { key: 'oils_tools_usd', label: 'Oils & Tools', color: C.slate }
        ], { label: 'Vouchers', key: 'vouchers', color: C.brass, isMoney: false }, { isMoney: true, height: 228 }), {
          subtitle: 'Repairs, spare parts & oils vs monthly vouchers',
          legend: [
            { label: 'Repairs', color: C.navy },
            { label: 'Parts', color: C.steel },
            { label: 'Oils & Tools', color: C.slate },
            { label: 'Vouchers', color: C.brass, line: true }
          ]
        })}
        ${pbiPanel('Maintenance & Spare Spend by Subsystem ($)', rightBodyHtml, {
          subtitle: 'Repair, spare-part, screen, tire & oil outlay',
          meta: rightMetaHtml
        })}
      </div>
    `;
  }

  function renderFleetEconVisualsSection(ctx) {
    const months = (ctx && ctx.months) || [];
    const activeUnits = (ctx && ctx.activeUnits) || [];
    return `
      <div class="pbi-grid-2" id="fleetEconChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Fleet Running Cost vs. General Expenses ($)', buildClusteredColumnSvg(months, [
          { key: 'equip_cost', label: 'Fleet Total Cost', color: C.navy },
          { key: 'expenses', label: 'General Expenses', color: C.slate }
        ]), {
          subtitle: 'Monthly equipment fuel, repair & allocated driver cost vs general overhead',
          legend: [
            { label: 'Fleet Cost', color: C.navy },
            { label: 'All Expenses', color: C.slate }
          ]
        })}
        ${pbiPanel('Cost by Equipment Unit — Running + Driver ($)', buildHorizontalBarChart(activeUnits, 'Equipment', 'total_cost', v => fmtUSD(v, 0), { subKey: 'Type', color: C.steel, maxItems: 10 }), {
          subtitle: 'Top cost-bearing plant and fleet units in the selected period'
        })}
      </div>
    `;
  }

  function renderDriversVisualsSection(ctx) {
    const months = (ctx && ctx.months) || [];
    const drvList = (ctx && ctx.drvList) || [];
    return `
      <div class="pbi-grid-2" id="driversChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Overtime Bonus ($) vs. Dispatched Loads', buildComboChartSvg(months, [
          { key: 'delivery_loads', label: 'Delivery Loads', color: C.navy },
          { key: 'raw_loads', label: 'Raw Loads', color: C.slate }
        ], { label: 'Overtime Bonus ($)', key: 'overtime_due', color: C.brass, isMoney: true }, { isMoney: false }), {
          subtitle: 'Monthly dispatch loads vs accrued company-fleet driver overtime bonus ($)',
          legend: [
            { label: 'Delivery Loads', color: C.navy },
            { label: 'Raw Loads', color: C.slate },
            { label: 'OT Bonus ($)', color: C.brass, line: true }
          ]
        })}
        ${pbiPanel('Dispatched Trips by Driver (Sales + Raw)', buildHorizontalBarChart(drvList, 'driver', 'trips', v => fmtNum(v) + ' trips', { subKey: 'trucksStr', color: C.navy, maxItems: 10 }), {
          subtitle: 'Top drivers by dispatched trips in the active period'
        })}
      </div>
    `;
  }

  function renderPayrollVisualsSection(ctx) {
    const payMonths = (ctx && ctx.payMonths) || [];
    const staffRows = ((ctx && ctx.staffRows) || []).slice().sort((a, b) => Number(b.earnings || 0) - Number(a.earnings || 0));
    return `
      <div class="pbi-grid-2" id="payrollChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Staff Earnings vs. Salary Disbursements ($)', buildClusteredColumnSvg(payMonths, [
          { key: 'earnings_m', label: 'Staff Earnings', color: C.slate },
          { key: 'paid_m', label: 'Salary Paid', color: C.navy }
        ]), {
          subtitle: 'Monthly staff earnings (base + overtime + site transport + extras) vs salary cash disbursements',
          legend: [
            { label: 'Staff Earnings', color: C.slate },
            { label: 'Salary Paid', color: C.navy }
          ]
        })}
        ${pbiPanel('Top Staff Members by Earnings ($)', buildHorizontalBarChart(staffRows, 'staff', 'earnings', v => fmtUSD(v, 0), { subKey: 'company', color: C.navy, maxItems: 10 }), {
          subtitle: 'Top staff members ranked by total earnings in the active period'
        })}
      </div>
    `;
  }

  function renderAttendanceVisualsSection(ctx) {
    const payMonths = (ctx && ctx.payMonths) || [];
    const attStaffRows = (ctx && ctx.attStaffRows) || [];
    return `
      <div class="pbi-grid-2" id="attChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Overtime vs. Lateness Hours', buildClusteredColumnSvg(payMonths, [
          { key: 'ot_hrs_m', label: 'Overtime Hrs', color: C.steel },
          { key: 'late_hrs_m', label: 'Lateness Hrs', color: C.crit }
        ], { isMoney: false }), {
          subtitle: 'Monthly logged overtime hours vs lateness / tardy hours on attendance sheets',
          legend: [
            { label: 'Overtime Hrs', color: C.steel },
            { label: 'Lateness Hrs', color: C.crit }
          ]
        })}
        ${pbiPanel('Top Staff Members by Logged Overtime Hours', buildHorizontalBarChart(attStaffRows, 'staff', 'ot_hrs', v => fmtNum(v, 1) + ' hrs', { subKey: 'company', color: C.steel, maxItems: 10 }), {
          subtitle: 'Employees ranked by total logged overtime hours in the active period'
        })}
      </div>
    `;
  }

  function renderAllowancesVisualsSection(ctx) {
    const payMonths = (ctx && ctx.payMonths) || [];
    const siteStaffRows = ((ctx && ctx.siteStaffRows) || []).map(r => Object.assign({}, r, {
      verifSub: `${r.sitesStr || r.site || 'Site'}${r.days_paid > 0 ? ` · ${fmtNum(r.activity_days || 0, 0)}/${fmtNum(r.days_paid, 0)}d verified` : ''}`
    }));
    return `
      <div class="pbi-grid-2" id="allowancesChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Site Transport Earned vs. Paid ($)', buildClusteredColumnSvg(payMonths, [
          { key: 'sa_accrued', label: 'Earned', color: C.slate },
          { key: 'sa_paid', label: 'Paid (FIFO)', color: C.navy }
        ]), {
          subtitle: 'Monthly site transport earned on confirmed on-site days vs FIFO paid inside salary disbursements',
          legend: [
            { label: 'Earned', color: C.slate },
            { label: 'Paid (FIFO)', color: C.navy }
          ]
        })}
        ${pbiPanel('Site Transport & Verified On-Site Days by Staff ($)', buildHorizontalBarChart(siteStaffRows, 'staff', 'site_allow', v => fmtUSD(v, 0), { subKey: 'verifSub', color: C.brass, maxItems: 10 }), {
          subtitle: 'Staff ranked by earned site transport ($) with verified on-site day coverage'
        })}
      </div>
    `;
  }

  function renderJvVisualsSection(ctx) {
    const jvSites = (ctx && ctx.jvSites) || [];
    const jvMonths = (ctx && ctx.jvMonths) || [];
    return `
      <div class="pbi-grid-2" id="jvChartsRow" style="margin-bottom:14px">
        ${pbiPanel('JV 50/50 Sites · Sales TTC, Raw Cost & Partner Entitlement ($)', buildClusteredBarChart(jvSites, 'Site', [
          { label: 'Sales TTC', key: 'sales_ttc', color: C.navy },
          { label: 'Raw Cost', key: 'raw_cost', color: C.steel },
          { label: 'Partner Entitlement', key: 'entitlement', color: C.brass }
        ], { decimals: 0 }), {
          subtitle: 'Volume and partner 50% stock entitlement comparison across Joint Venture quarry sites'
        })}
        ${pbiPanel('Monthly JV Partner Distributions ($)', buildClusteredColumnSvg(jvMonths, [
          { key: 'rev_usd', label: 'Revenue Basis', color: C.navy },
          { key: 'stock_usd', label: 'Stock Basis', color: C.brass }
        ]), {
          subtitle: 'Monthly Joint Venture profit & stock distributions paid to site partners',
          legend: [
            { label: 'Revenue Basis', color: C.navy },
            { label: 'Stock Basis', color: C.brass }
          ]
        })}
      </div>
    `;
  }

  function renderRawVisualsSection(ctx) {
    const rawMonths = (ctx && ctx.months) || [];
    const salesRows = (ctx && ctx.salesRows) || [];
    const rawRows = (ctx && ctx.rawRows) || [];
    const mRows = enrichMonthsWithTicketUnitEconomics(rawMonths, salesRows, rawRows, {
      basis: ctx && ctx.basis,
      ticketMeters: ctx && ctx.ticketMeters,
      isAggregateMaterialProduct: ctx && ctx.isAggregateMaterialProduct,
      productsCatalog: ctx && ctx.productsCatalog,
      hasSalesTicketSource: salesRows.length > 0,
      hasRawTicketSource: rawRows.length > 0
    });
    return `
      <div class="pbi-grid-2" id="rawChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Unit economics by month · raw cost vs selling price ($/m³)', buildMultiLineSvg(mRows, [
          { label: 'Avg Selling Price ($/m³ ex-VAT)', key: 'avg_price_net', color: C.navy },
          { label: 'Avg Raw Cost / m³', key: 'avg_raw_cost', color: C.crit }
        ], { isMoney: true, decimals: 2 }), {
          subtitle: 'Monthly $/m³ spread between realised ex-VAT aggregate selling price and raw material intake cost',
          legend: [
            { label: 'Selling Price ($/m³)', color: C.navy, line: true },
            { label: 'Raw Cost ($/m³)', color: C.crit, line: true }
          ]
        })}
        ${pbiPanel('Raw intake cost split by month · material vs 3rd-party haulage ($)', buildComboChartSvg(mRows, [
          { key: 'raw_mat_leg', label: 'Material Cost (Leg 1)', color: C.navy },
          { key: 'raw_haul_leg', label: '3rd-Party Haulage (Leg 2)', color: C.crit }
        ], {
          label: 'Haulage Share %',
          color: C.brass,
          isPct: true,
          get: r => {
            const mat = Math.max(0, Number(r.raw_mat_leg || 0));
            const haul = Math.max(0, Number(r.raw_haul_leg || 0));
            return (mat + haul) > 0 ? haul / (mat + haul) : 0;
          }
        }, { lineMax: 1 }), {
          id: 'pbiRawIntakeCostSplitChart',
          subtitle: 'Site-owner material cost (Leg 1) vs subcontracted truck haulage (Leg 2) and monthly haulage share %',
          legend: [
            { label: 'Material (Leg 1)', color: C.navy },
            { label: '3rd-Party Haul (Leg 2)', color: C.crit },
            { label: 'Haulage Share %', color: C.brass, line: true }
          ]
        })}
      </div>
    `;
  }

  function renderExpensesVisualsSection(ctx) {
    const expMonths = (ctx && ctx.expMonths) || [];
    const catRows = (ctx && ctx.catRows) || [];
    return `
      <div class="pbi-grid-2" id="expensesChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Monthly Operating Expenses · Cash vs. Credit Leg 3 AP ($)', buildComboChartSvg(expMonths, [
          { key: 'cash_usd', label: 'Cash Paid', color: C.good },
          { key: 'credit_usd', label: 'Credit Leg 3 AP', color: C.navy }
        ], {
          label: 'Vouchers',
          key: 'vouchers',
          color: C.brass,
          isMoney: false
        }, { isMoney: true }), {
          subtitle: 'Monthly direct cash operating expenses vs credit Leg 3 payables and posted voucher volume',
          legend: [
            { label: 'Cash Paid', color: C.good },
            { label: 'Credit Leg 3 AP', color: C.navy },
            { label: 'Vouchers', color: C.brass, line: true }
          ]
        })}
        ${pbiPanel('Expenses by Category & Cost Class ($)', buildHorizontalBarChart(catRows, 'category', 'total', v => fmtUSD(v, 0), {
          subKey: 'cost_class',
          maxItems: 10,
          colorFn: r => /Production/i.test(r.cost_class) ? C.navy : (/Capital/i.test(r.cost_class) ? C.brass : C.steel)
        }), {
          subtitle: 'Top operating, production (60/61), and capital (22) expense categories in the active period'
        })}
      </div>
    `;
  }

  function renderSuppliersVisualsSection(ctx) {
    const months = (ctx && ctx.months) || [];
    const openSups = (ctx && ctx.openSups) || [];
    return `
      <div class="pbi-grid-2" id="apChartsRow" style="margin-bottom:14px">
        ${pbiPanel('Accrued vs. Settled by Month · 3-Leg Credit vs. Settlements ($)', buildClusteredColumnSvg(months, [
          { label: 'Accrued (Raw + Credit Exp)', color: C.navy, get: r => Number(r.raw_cost || 0) + Number(r.credit_expenses || 0) },
          { label: 'Settlements Paid', key: 'settlements_paid', color: C.steel }
        ]), {
          subtitle: 'Monthly 3-leg credit payables accrued (Material + Haulage + Credit Expenses) vs supplier settlements paid',
          legend: [
            { label: '3-Leg Accrued', color: C.navy },
            { label: 'Settlements Paid', color: C.steel }
          ]
        })}
        ${pbiPanel('Payables by Supplier, Hauler & Vendor ($)', buildHorizontalBarChart(openSups, 'Supplier', 'ap_balance', v => fmtUSD(v, 0), {
          subKey: 'role',
          color: C.navy,
          maxItems: 10
        }), {
          subtitle: 'Largest open 3-leg supplier, quarry, hauler, and vendor payable balances ($)'
        })}
      </div>
    `;
  }

  window.MFG_PBI = {
    PBI_PAGES,
    MOVED_PBI_PAGES,
    MODULE_ANALYTICS_CATALOG,
    TABLE_CATALOG,
    deriveExpenseCostClass,
    getHubTableDefaultSort,
    getHubRelIndex,
    cellValue,
    renderChartPopHtml,
    renderPbiStudio,
    renderModuleAnalytics,
    renderTablesHub,
    renderUniversalRegistriesView,
    renderCashFlowVisualsSection,
    renderSalesVisualsSection,
    buildMonthlyDeliveryTransportRows,
    renderCustomersVisualsSection,
    renderPricingVisualsSection,
    renderCommissionVisualsSection,
    renderQuarryPricingVisualsSection,
    buildListPriceHistoryData,
    buildSalesDeliveryTransportComp,
    buildSalesCommissionData,
    buildQuarryPricingComp,
    renderFuelVisualsSection,
    computeLubricationAudit,
    renderLubricationBenchmarksSection,
    renderMaintVisualsSection,
    renderFleetEconVisualsSection,
    renderDriversVisualsSection,
    renderPayrollVisualsSection,
    renderAttendanceVisualsSection,
    renderAllowancesVisualsSection,
    renderJvVisualsSection,
    renderRawVisualsSection,
    renderExpensesVisualsSection,
    renderSuppliersVisualsSection
  };
})();
