/* ============================================================================
   ISABI Systems — Power Apps Form Automation & 24-Table Data Entry Engine (v4.0)
   100% Parity with m12_forms.py + bhf_manufacturing.js + m14_sitemap.py:
   - Embedded 4-Card Executive Cockpit (bhf_mfgCockpit.htm m283)
   - Live Contextual Intelligence Banner (bhf_live_banner m281)
   - Cascading Truck Owner -> Truck -> Driver locks & single-match auto-fill (m125/m126b/m130/m131)
   - Locked Truck Quick-View strip (qv_truck m99: Plate No · Type · Ownership · Capacity m³ · Default Driver)
   - Site -> Default Site Owner & Truck Owner auto-fill on Raw Material Ticket (m84/m125)
   - Sale Type (Delivery / Pickup / Unregistered) & Transport (Third-party / Company fleet) gating
   - Price Agreement engine with Tier 1 / Tier 2 truck capacity adjustments & List Price fallback (m70/m73/m103/m125/m136)
   - Unit override & per-load (Truck = 1) rules + Capacity Learn & Driver Owner Learn (m128/m222/m228/m229)
   - Customer Method lock (Cash/Credit m50/m58) + Customer-declared Qty & External Invoice flag gating (m60)
   - Diesel Tank balance guard (m207/m212) + Odometer/Hours rollback & spike guard (m277) + Burn rate L/100km
   - Duplicate Ticket No guard & Discount/60-Day Reporting Date guard (m277)
   - Dual-Currency (USD Amount + LBP Amount -> locked USD Value at 90,000 FX rate, bhf_usdPreview.js)
   - Category -> Subcategory strict cascade (bhf_subcatFilter.js) + Cash/Credit Expense scope (m140)
   - Live Open-Ticket / 3-Leg AP FIFO Allocation Preview on Customer & Supplier Settlements (step236/step240/step241)
   - All 24 Operational, Setup, HQ Master Data, Payroll, Logistics, Treasury & JV Forms
   ============================================================================ */

(function () {
  'use strict';

  const DEFAULT_FX_RATE = 89500;
  const DEFAULT_VAT_PCT = 11;
  const getActiveFxRate = (dateStr, currency) => (typeof window !== 'undefined' && window.MFG_FX && typeof window.MFG_FX.getRate === 'function')
    ? Number(window.MFG_FX.getRate(dateStr, currency) || DEFAULT_FX_RATE)
    : DEFAULT_FX_RATE;
  const fmtFxRateLbl = r => Number(r || DEFAULT_FX_RATE).toLocaleString('en-US');
  const getActiveVatPct = dateStr => (typeof window !== 'undefined' && window.MFG_VAT && typeof window.MFG_VAT.getPct === 'function')
    ? Number(window.MFG_VAT.getPct(dateStr) ?? DEFAULT_VAT_PCT)
    : DEFAULT_VAT_PCT;
  const getActiveVatFraction = dateStr => getActiveVatPct(dateStr) / 100;
  const fmtVatPctLbl = p => {
    const n = Number(p ?? DEFAULT_VAT_PCT);
    return (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')) + '%';
  };
  const MIN_DATE = '2024-01-01';
  const ic = (name, cls) => (typeof window !== 'undefined' && window.MFG_ICONS ? window.MFG_ICONS.svg(name, cls) : '');

  const FORM_GROUPS = [
    {
      id: 'sales',
      icon: 'sales',
      label: '1. Sales & Receivables',
      forms: [
        { id: 'sales', label: 'Sales Ticket', badge: 'bhf_salesticket', crKey: 'sales_tickets', title: 'New Sales Ticket' },
        { id: 'receipt', label: 'Customer Receipt (AR)', badge: 'bhf_customerreceipt', crKey: 'receipts', title: 'New Customer Settlement' },
        { id: 'vatinvoice', label: 'VAT Invoice', badge: 'bhf_vatinvoice', crKey: 'vat_invoices', title: 'New VAT Invoice' },
        { id: 'pricerule', label: 'Price Agreement', badge: 'bhf_pricerule', crKey: 'price_rules', title: 'New Price Agreement' },
        { id: 'creditterm', label: 'Credit Terms', badge: 'bhf_creditterm', crKey: 'credit_terms', title: 'New Customer Credit Terms' }
      ]
    },
    {
      id: 'raw',
      icon: 'suppliers',
      label: '2. Purchases, Expenses & AP',
      forms: [
        { id: 'raw', label: 'Raw Material Ticket', badge: 'bhf_rawpurchase', crKey: 'raw_purchases', title: 'New Raw Material Ticket' },
        { id: 'expense', label: 'Expense (Cash / Credit)', badge: 'bhf_expense', crKey: 'expenses', title: 'New Expense' },
        { id: 'settlement', label: 'Supplier Settlement (AP)', badge: 'bhf_supplierpayment', crKey: 'settlements', title: 'New Supplier Settlement' },
        { id: 'jv', label: 'JV Partnership & Dist.', badge: 'bhf_jvdistribution', crKey: 'jv_distributions', title: 'New Joint-Venture Entry' }
      ]
    },
    {
      id: 'fleet',
      icon: 'fleet',
      label: '3. Fleet, Fuel & Maint.',
      forms: [
        { id: 'fuel', label: 'Fuel & Lubricant Intake', badge: 'bhf_fuelintake', crKey: 'fuel_intakes', title: 'New Fuel & Lubricant Intake' },
        { id: 'malfunction', label: 'Tank Malfunction / Discrepancy', badge: 'bhf_fuelmalfunction', crKey: 'fuel_malfunctions', title: 'New Tank Malfunction / Discrepancy' },
        { id: 'companyequipment', label: 'Company Fleet Unit', badge: 'bhf_companyequipment', crKey: 'company_equipment', title: 'New Company Fleet Unit (BU Assignment)' },
        { id: 'defect', label: 'Equipment Defect', badge: 'bhf_equipmentdefect', crKey: 'equipment_defects', title: 'Report Equipment / Truck Defect' },
        { id: 'partlog', label: 'Part Change & Custody', badge: 'bhf_partmovement', crKey: 'part_movements', title: 'Part Change, Removal & Disposition' },
        { id: 'triprate', label: 'Overtime Trip Rate', badge: 'bhf_triprate', crKey: 'overtime_rates', title: 'New Overtime Trip Rate' }
      ]
    },
    {
      id: 'payroll',
      icon: 'payroll',
      label: '4. Payroll & Workforce',
      forms: [
        { id: 'salary', label: 'Salary & Bonus', badge: 'bhf_salarypayment', crKey: 'salaries', title: 'New Salary Payment or Bonus' },
        { id: 'attendance', label: 'Attendance', badge: 'bhf_attendance', crKey: 'attendance', title: 'New Staff Attendance' },
        { id: 'employment', label: 'Employment Contract', badge: 'bhf_employment', crKey: 'employments', title: 'New Employment Contract' },
        { id: 'freelance', label: 'Freelance Work', badge: 'bhf_freelancework', crKey: 'employments', title: 'New Freelance Work' },
        { id: 'logistics', label: 'Site Allowance', badge: 'bhf_logistics', crKey: 'logistics_allowances', title: 'New Site Allowance' }
      ]
    },
    {
      id: 'treasury',
      icon: 'cashflow',
      label: '5. Treasury & FX',
      forms: [
        { id: 'treasury', label: 'Treasury / Loans / FX', badge: 'bhf_external', crKey: 'loans', title: 'New Treasury Entry' }
      ]
    },
    {
      id: 'universal',
      icon: 'globe',
      label: '6. Universal (All BUs)',
      universalGroup: true,
      forms: [
        { id: 'customer', label: 'Customer', badge: 'bhf_customer', crKey: 'customers', title: 'New Customer (Universal Registry)', universal: true },
        { id: 'supplier', label: 'Supplier / Hauler', badge: 'bhf_supplier', crKey: 'suppliers', title: 'New Supplier / Hauler (Universal Registry)', universal: true },
        { id: 'product', label: 'Product / Grade', badge: 'bhf_product', crKey: 'products', title: 'New Product / Aggregate Grade (Universal Registry)', universal: true },
        { id: 'expensecategory', label: 'Expense Category', badge: 'bhf_expensecategory', crKey: 'expense_categories', title: 'New Expense Category (Universal Registry)', universal: true },
        { id: 'site', label: 'Site', badge: 'bhf_site', crKey: 'sites', title: 'New Site (Universal Registry)', universal: true },
        { id: 'region', label: 'Region / Zone', badge: 'bhf_region', crKey: 'regions', title: 'New Region / Zone (Universal Registry)', universal: true },
        { id: 'equipment', label: 'Equipment / Truck', badge: 'bhf_equipment', crKey: 'equipment', title: 'New Equipment / Truck (Universal Registry)', universal: true },
        { id: 'driver', label: 'Driver / Operator', badge: 'bhf_driver', crKey: 'drivers', title: 'New Driver / Operator (Universal Registry)', universal: true },
        { id: 'fxrate', label: 'FX Rate', badge: 'bhf_fxrate', crKey: 'fx_rates', title: 'New FX Rate (Universal Registry)', universal: true },
        { id: 'vatrate', label: 'VAT Rate', badge: 'bhf_vatrate', crKey: 'vat_rates', title: 'New VAT Rate (Universal Registry)', universal: true },
        { id: 'currency', label: 'Currency', badge: 'bhf_currency', crKey: 'currencies', title: 'New Currency (Universal Registry)', universal: true }
      ]
    }
  ];

  const FORM_MAP = {};
  const FORM_TITLES = {};
  const FORM_CR_KEY = {};
  FORM_GROUPS.forEach(g => {
    g.forms.forEach(f => {
      FORM_MAP[f.id] = { ...f, groupId: g.id, groupLabel: g.label };
      FORM_TITLES[f.id] = f.title;
      FORM_CR_KEY[f.id] = f.crKey;
    });
  });

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

  function fmtUsd(n, dec = 2) {
    const v = Number(n || 0);
    const sign = v < 0 ? '−' : '';
    return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtNum(n, dec = 0) {
    const v = Number(n || 0);
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nowHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function parseTime(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    const m = s.match(/^(\d{1,2})[:.h](\d{1,2})(am|pm|a|p)?$/) ||
              s.match(/^(\d{1,2})(\d{2})(am|pm|a|p)?$/) ||
              s.match(/^(\d{1,2})()(am|pm|a|p)?$/);
    if (!m) return undefined;
    let h = parseInt(m[1], 10);
    const mi = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3];
    if (ap) {
      if (h < 1 || h > 12) return undefined;
      if (ap.charAt(0) === 'p' && h < 12) h += 12;
      if (ap.charAt(0) === 'a' && h === 12) h = 0;
    }
    if (h > 23 || mi > 59) return undefined;
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }

  function isOvertimeTime(hhmm) {
    const p = parseTime(hhmm) || hhmm;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(p || ''));
    if (!m) return false;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    return mins < 6 * 60 || mins > 17 * 60 + 59;
  }

  function getRecords(ctx) {
    return (ctx && ctx.SEED && ctx.SEED.records) ? ctx.SEED.records : (window.MFG_SEED && window.MFG_SEED.records) || {};
  }

  function uniqSorted(arr, freqMap) {
    const seen = new Set();
    const localCounts = new Map();
    const out = [];
    for (const x of (arr || [])) {
      const s = String(x || '').trim();
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
      return a.localeCompare(b);
    });
  }

  // ==================== EMBEDDED EXECUTIVE COCKPIT (bhf_mfgCockpit.htm m283) ====================
  function renderExecutiveCockpit() {
    // Removed from New Entry forms (2026-10-21): neither the Power Apps Executive Cockpit nor the
    // Power Apps form rules banner is needed when creating new entries.
    return '';
  }

  // ==================== DIESEL TANK BALANCE ENGINE (m207 / m212) ====================
  function computeDieselTank(ctx, companyName, excludeId) {
    const coKey = companyName === 'BBConstruction' ? 'bbconstruction' : (companyName === 'Lions Transport' ? 'lionstransport' : 'wtc');
    const rec = getRecords(ctx);
    if (typeof window !== 'undefined' && typeof window.MFG_DIESEL_TANK === 'function') {
      const dt = window.MFG_DIESEL_TANK(coKey, null);
      if (dt && dt.perCo && dt.perCo[companyName]) {
        const pc = dt.perCo[companyName];
        let bought = pc.boughtL, issued = pc.consumedL, discrepancy = pc.discrepancyL || 0, sold = pc.soldL;
        if (excludeId) {
          (rec.fuel_intakes || []).forEach(f => {
            if (f && f.id === excludeId && !f.voided && f.company === companyName) {
              if (f.record_type === 'Bulk Purchase') bought -= Number(f.litres || 0);
              else issued -= Number(f.litres || 0);
            }
          });
          (rec.fuel_malfunctions || []).forEach(m => {
            if (m && m.id === excludeId && !m.voided && m.company === companyName) {
              discrepancy -= Number(m.litres || 0);
            }
          });
          (rec.sales_tickets || []).forEach(t => {
            if (t && t.id === excludeId && !t.voided && t.company === companyName) {
              sold -= Number(t.qty || 0);
            }
          });
        }
        const balance = Math.round((bought - issued - discrepancy - sold) * 100) / 100;
        return { bought, issued, discrepancy, sold, balance };
      }
    }
    const seed = (ctx && ctx.SEED) || window.MFG_SEED || {};
    const sn = (((seed.sentinels || {}).fleet_fuel_overtime_auditor || {}).by_model || {})[companyName] || {};
    const model = (seed.models && seed.models[coKey]) || {};
    const allKpi = (model.periods && model.periods.all) || {};

    let bought = sn.diesel_purchased_l != null ? Number(sn.diesel_purchased_l) : Number(allKpi.diesel_purchased || 0);
    let issued = sn.diesel_issued_l != null ? Number(sn.diesel_issued_l) : Number(allKpi.diesel_litres || 0);
    let discrepancy = sn.diesel_discrepancy_l != null ? Number(sn.diesel_discrepancy_l) : 0;
    let sold = sn.diesel_sold_l != null ? Number(sn.diesel_sold_l) : Number(allKpi.diesel_sold || 0);

    (rec.expenses || []).forEach(e => {
      if (!e || e.source !== 'app' || e.voided || e.company !== companyName) return;
      const sub = String(e.subcategory || '').trim();
      const cat = String(e.category || '').trim();
      if (/^fuel$/i.test(cat) && (!sub || /^diesel$|^mazout$/i.test(sub)) && Number(e.qty || 0) > 0) {
        bought += Number(e.qty || 0);
      }
    });
    (rec.fuel_intakes || []).forEach(f => {
      if (f && f.source === 'app' && !f.voided && f.company === companyName && f.id !== excludeId && String(f.fuel_type || 'Diesel') === 'Diesel') {
        if (f.record_type === 'Bulk Purchase') bought += Number(f.litres || 0);
        else issued += Number(f.litres || 0);
      }
    });
    (rec.fuel_malfunctions || []).forEach(m => {
      if (m && m.source === 'app' && !m.voided && m.company === companyName && m.id !== excludeId) {
        discrepancy += Number(m.litres || 0);
      }
    });
    (rec.sales_tickets || []).forEach(t => {
      if (t && t.source === 'app' && !t.voided && t.company === companyName && t.id !== excludeId &&
          ['diesel', 'diesel trans'].includes(String(t.product || '').toLowerCase())) {
        sold += Number(t.qty || 0);
      }
    });

    const balance = Math.round((bought - issued - discrepancy - sold) * 100) / 100;
    return { bought, issued, discrepancy, sold, balance };
  }

  // ==================== PRICE AGREEMENT & TIER 1/2 ENGINE (m70 / m73 / m103 / m106 / m125 / m136) ====================
  // A tier's Adjustment is a PER-LOAD amount (bhf_total1 = Price × Truck Size 1 + Adjustment 1) that rides into the
  // ticket's Material Total (bhf_price = qty × unit price + adjustment − discount) — the unit price itself never changes.
  function matchTier(rule, truckCap) {
    if (!rule) return { tier: 0, qty: truckCap, adj: 0, transAdj: 0 };
    const q1 = rule.qty1 != null && rule.qty1 !== '' ? Number(rule.qty1) : null;
    const q2 = rule.qty2 != null && rule.qty2 !== '' ? Number(rule.qty2) : null;
    let q3 = rule.qty3 != null && rule.qty3 !== '' ? Number(rule.qty3) : null;
    let adj3Val = rule.adj3 != null && rule.adj3 !== '' ? Number(rule.adj3) : 0;
    if (q3 === null && rule.notes) {
      const m3 = String(rule.notes).match(/Tier\s*3:\s*qty\s*([\d.]+)\s*adj\s*([+-]?[\d.]+)/i);
      if (m3) {
        q3 = Number(m3[1]);
        adj3Val = Number(m3[2]);
      }
    }
    const overrideCap = rule.truck_size != null && rule.truck_size !== '' && Number(rule.truck_size) > 0 ? Number(rule.truck_size) : null;
    const effCap = (truckCap != null && truckCap > 0) ? truckCap : overrideCap;
    let t = 0;
    if (effCap != null && effCap > 0) {
      if (q2 !== null && Math.abs(q2 - effCap) < 0.01) t = 2;
      else if (q1 !== null && Math.abs(q1 - effCap) < 0.01) t = 1;
      else if (q3 !== null && Math.abs(q3 - effCap) < 0.01) t = 3;
    } else if (q1 !== null) {
      t = 1;
    }
    const adj = t === 3 ? adj3Val : (t === 2 ? Number(rule.adj2 || 0) : (t === 1 ? Number(rule.adj1 || 0) : 0));
    const transAdj = t === 2 ? Number(rule.trans_adj2 || 0) : (t === 1 ? Number(rule.trans_adj1 || 0) : 0);
    const resolvedQty = (effCap != null && effCap > 0) ? effCap : (t === 3 ? q3 : (t === 2 ? q2 : (t === 1 ? q1 : null)));
    return { tier: t, qty: resolvedQty, adj, transAdj, truckSizeOverride: overrideCap };
  }

  // ==================== TRUCK QUICK-VIEW STRIP (RETIRED) ====================
  function renderTruckQuickView() {
    // Removed (2026-10-22): Truck / Equipment, Truck Owner, Driver, and Quantity/Capacity already display on the form columns.
    return '';
  }

  // ==================== OPEN-TICKET & 3-LEG AP FIFO SUBGRID PREVIEWS ====================
  function renderCustomerOpenTicketsSubgrid(ctx, company, customerName, payAmount, method) {
    const rec = getRecords(ctx);
    const cNorm = norm(customerName);
    if (!cNorm) {
      return `<div class="pa-subgrid-empty">Select a <b>Customer</b> to inspect open Credit Tickets &amp; live FIFO receipt allocation.</div>`;
    }
    const tickets = (rec.sales_tickets || []).filter(t =>
      t && !t.voided && (!company || !t.company || t.company === company) &&
      norm(t.customer) === cNorm && String(t.method || 'Credit') === 'Credit'
    ).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    if (!tickets.length) {
      return `<div class="pa-subgrid-empty">No open Credit Sales Tickets in the current sample for <b>${esc(customerName)}</b> — receipt posts against prior book balance / customer advance.</div>`;
    }

    const vatOnly = method === 'VAT' || method === 'VATRent';
    const priorReceipts = (rec.receipts || []).reduce((sum, r) => {
      if (!r || r.voided || (company && r.company && r.company !== company) || norm(r.customer) !== cNorm) return sum;
      const m = String(r.method || '').trim();
      if (m === 'JV Adjusted' || m === 'Remove' || m === 'Adjusted' || m === 'Free' || m === 'Cash Return' || m === 'Cash Discount' || m === 'IVA' || m === 'RentConfig' || m === 'Rent' || m === 'VATRent') return sum;
      if (vatOnly && !(m === 'VAT' || m === 'VATConfig' || m === 'VAT Dis' || m === 'Cash VAT Dis')) return sum;
      return sum + Number(r.amount || 0) + Number(r.discount || 0);
    }, 0);
    const priorCrReturns = (rec.sales_tickets || []).reduce((sum, t) => {
      if (!t || t.voided || (company && t.company && t.company !== company) || norm(t.customer) !== cNorm) return sum;
      if (String(t.method || '') !== 'CR Return' && String(t.method || '') !== 'Credit Return') return sum;
      return sum + (vatOnly ? Number(t.vat || 0) : Number(t.total_ttc || t.total || 0));
    }, 0);
    let priorPool = Math.max(0, round2(priorReceipts + priorCrReturns));
    const afterPrior = tickets.map(t => {
      const origDue = vatOnly ? Number(t.vat || 0) : Number(t.total_ttc || t.total || 0);
      const priorUsed = Math.min(priorPool, Math.max(0, origDue));
      priorPool = round2(priorPool - priorUsed);
      const openDue = round2(Math.max(0, origDue - priorUsed));
      return { t, origDue, openDue };
    });
    const openTickets = afterPrior.filter(x => x.openDue > 0.005);
    const displayTickets = openTickets.length ? openTickets.slice(0, 12) : afterPrior.slice(-12);

    let pool = Math.max(0, Number(payAmount || 0));
    const rowsHtml = displayTickets.map(({ t, openDue }) => {
      const due = openDue;
      const alloc = Math.min(pool, Math.max(0, due));
      pool = round2(pool - alloc);
      const rem = round2(Math.max(0, due - alloc));
      const status = rem <= 0.005 ? 'SETTLED' : (alloc > 0 ? 'PARTIAL' : 'OPEN');
      const badgeCls = status === 'SETTLED' ? 'badge-ok' : (status === 'PARTIAL' ? 'badge-warn' : 'badge-info');
      return `
        <tr>
          <td class="mono">${esc(String(t.date || '').slice(0, 10))}</td>
          <td class="mono"><b>#${esc(t.ticket_no || '—')}</b></td>
          <td>${esc(t.product || '—')}</td>
          <td>${esc(t.site || '—')}</td>
          <td class="r">${fmtUsd(due)}</td>
          <td class="r"><b>${alloc > 0 ? fmtUsd(alloc) : '—'}</b></td>
          <td class="r">${fmtUsd(rem)}</td>
          <td><span class="badge ${badgeCls}">${status}</span></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="pa-subgrid">
        <div class="pa-subgrid-hdr">
          <span>OPEN CUSTOMER TICKETS · LIVE FIFO ALLOCATION PREVIEW (Oldest First)</span>
          <span>${openTickets.length} Open of ${tickets.length} Credit Tickets${pool > 0 ? ` · Unallocated Advance: ${fmtUsd(pool)}` : ''}</span>
        </div>
        <div class="table-wrap" style="max-height:190px;overflow:auto">
          <table class="ledger-table">
            <thead>
              <tr><th>Date</th><th>Ticket #</th><th>Product</th><th>Site</th><th class="r">${vatOnly ? 'VAT Due ($)' : 'Ticket TTC ($)'}</th><th class="r">Allocated Now</th><th class="r">Remaining</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSupplierOpenLegsSubgrid(ctx, company, supplierName, payAmount, legFilter) {
    const rec = getRecords(ctx);
    const sNorm = norm(supplierName);
    if (!sNorm) {
      return `<div class="pa-subgrid-empty">Select a <b>Supplier / Hauler</b> to inspect open 3-Leg Payables (Material Leg · Haulage Leg · Credit Expense Leg) &amp; live FIFO settlement allocation.</div>`;
    }
    const allLegs = [];
    let priorCreditReturns = 0;
    (rec.raw_purchases || []).forEach(r => {
      if (!r || r.voided || (company && r.company && r.company !== company)) return;
      const matOwner = r.site_owner || r.truck_owner;
      if (norm(matOwner) === sNorm) {
        const c = Number(r.cost || 0);
        if (c > 0) {
          allLegs.push({ date: r.date, ref: `RAW #${r.ticket_no || '—'}`, legType: 'material', leg: 'Leg 1 · Raw Material', detail: `${r.product || ''} @ ${r.site || ''}`, amount: c });
        } else if (c < 0) {
          priorCreditReturns += Math.abs(c);
        }
      }
      if (norm(r.truck_owner) === sNorm) {
        const hc = Number(r.trans_cost || 0);
        if (hc > 0) {
          allLegs.push({ date: r.date, ref: `RAW #${r.ticket_no || '—'}`, legType: 'haulage', leg: 'Leg 2 · Raw Haulage', detail: `${r.truck || ''} · ${r.product || ''}`, amount: hc });
        } else if (hc < 0) {
          priorCreditReturns += Math.abs(hc);
        }
      }
    });
    (rec.expenses || []).forEach(e => {
      if (!e || e.voided || (company && e.company && e.company !== company) || norm(e.supplier) !== sNorm) return;
      const m = String(e.method || '').trim();
      const amt = Number(e.amount || 0);
      if (m === 'Credit' || m === 'IVA' || m === 'VAT' || m === 'VAT Dis') {
        if (amt > 0) {
          allLegs.push({ date: e.date, ref: e.reference || `EXP ${String(e.date || '').slice(5, 10)}`, legType: 'expense', leg: 'Leg 3 · Credit Expense', detail: `${e.category || ''} · ${e.subcategory || ''}`, amount: amt });
        } else if (amt < 0) {
          priorCreditReturns += Math.abs(amt);
        }
      } else if (m === 'CR Return' && amt !== 0) {
        priorCreditReturns += Math.abs(amt);
      }
    });

    allLegs.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (!allLegs.length) {
      return `<div class="pa-subgrid-empty">No open payable rows in the current sample for <b>${esc(supplierName)}</b> — settlement posts against prior book AP balance / supplier advance.</div>`;
    }

    const priorSettled = (rec.settlements || []).reduce((sum, sp) => {
      if (!sp || sp.voided || (company && sp.company && sp.company !== company) || norm(sp.supplier) !== sNorm) return sum;
      const m = String(sp.method || '').trim();
      if (m === 'JV Adjusted' || m === 'Remove' || m === 'Adjusted' || m === 'Free' || m === 'Cash Return' || m === 'Cash Discount' || m === 'VAT' || m === 'VATConfig' || m === 'VAT Dis' || m === 'Cash VAT Dis' || m === 'IVA' || m === 'Commission' || m === 'RentConfig' || m === 'Rent' || m === 'VATRent') return sum;
      return sum + Number(sp.amount || 0) + Number(sp.discount || 0);
    }, 0);

    let priorPool = Math.max(0, round2(priorSettled + priorCreditReturns));
    const afterPriorAll = allLegs.map(l => {
      const origDue = Number(l.amount || 0);
      const priorUsed = Math.min(priorPool, Math.max(0, origDue));
      priorPool = round2(priorPool - priorUsed);
      const openDue = round2(Math.max(0, origDue - priorUsed));
      return { ...l, origDue, openDue };
    });

    const scopedAfterPrior = (!legFilter || legFilter === 'all')
      ? afterPriorAll
      : afterPriorAll.filter(l => l.legType === legFilter);
    if (!scopedAfterPrior.length) {
      return `<div class="pa-subgrid-empty">No payable legs matching the selected leg filter for <b>${esc(supplierName)}</b>.</div>`;
    }
    const openLegs = scopedAfterPrior.filter(l => l.openDue > 0.005);
    const displayLegs = openLegs.length ? openLegs.slice(0, 12) : scopedAfterPrior.slice(-12);

    let pool = Math.max(0, Number(payAmount || 0));
    const rowsHtml = displayLegs.map(l => {
      const due = l.openDue;
      const alloc = Math.min(pool, Math.max(0, due));
      pool = round2(pool - alloc);
      const rem = round2(Math.max(0, due - alloc));
      const status = rem <= 0.005 ? 'SETTLED' : (alloc > 0 ? 'PARTIAL' : 'OPEN');
      const badgeCls = status === 'SETTLED' ? 'badge-ok' : (status === 'PARTIAL' ? 'badge-warn' : 'badge-brass');
      return `
        <tr>
          <td class="mono">${esc(String(l.date || '').slice(0, 10))}</td>
          <td class="mono"><b>${esc(l.ref)}</b></td>
          <td><span class="badge badge-info">${esc(l.leg)}</span></td>
          <td>${esc(l.detail)}</td>
          <td class="r">${fmtUsd(due)}</td>
          <td class="r"><b>${alloc > 0 ? fmtUsd(alloc) : '—'}</b></td>
          <td class="r">${fmtUsd(rem)}</td>
          <td><span class="badge ${badgeCls}">${status}</span></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="pa-subgrid">
        <div class="pa-subgrid-hdr">
          <span>OPEN 3-LEG SUPPLIER PAYABLES · LIVE FIFO ALLOCATION PREVIEW (Oldest First)</span>
          <span>${openLegs.length} Open of ${scopedAfterPrior.length} Payable Legs${pool > 0 ? ` · Prepayment / Balance Relief: ${fmtUsd(pool)}` : ''}</span>
        </div>
        <div class="table-wrap" style="max-height:190px;overflow:auto">
          <table class="ledger-table">
            <thead>
              <tr><th>Date</th><th>Voucher</th><th>AP Leg</th><th>Description</th><th class="r">Open Leg ($)</th><th class="r">Allocated Now</th><th class="r">Remaining</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== MODAL GROUP & TAB BAR RENDERER ====================
  function renderModalTabsHtml(activeForm, canEnterFn, groupOverride) {
    if (groupOverride === 'expenses') groupOverride = 'raw';
    const info = FORM_MAP[activeForm] || FORM_MAP.sales;
    const effectiveGroupId = groupOverride === 'comm' ? 'sales' : groupOverride;
    const activeGroup = (effectiveGroupId && FORM_GROUPS.find(g => g.id === effectiveGroupId)) || FORM_GROUPS.find(g => g.id === info.groupId) || FORM_GROUPS[0];
    return `
      <div class="pa-modal-groups">
        ${FORM_GROUPS.map(g => {
          const visibleForms = g.forms.filter(f => !canEnterFn || canEnterFn(f.id));
          if (!visibleForms.length) return '';
          return `<button type="button" class="pa-group-btn${g.universalGroup ? ' is-universal-group' : ''} ${g.id === activeGroup.id ? 'active' : ''}" data-pa-group="${esc(g.id)}">${g.icon ? ic(g.icon) : ''}<span>${esc(g.label)}</span></button>`;
        }).join('')}
      </div>
      <div class="pa-modal-subtabs${activeGroup.universalGroup ? ' is-universal-subtabs' : ''}">
        ${(() => {
          const vis = activeGroup.forms.filter(f => !canEnterFn || canEnterFn(f.id));
          const showRawPr = activeGroup.id === 'raw' && (!canEnterFn || canEnterFn('pricerule_raw'));
          const rawPrTab = showRawPr ? `
          <button type="button" class="modal-tab ${groupOverride === 'raw' && activeForm === 'pricerule' ? 'active' : ''}" data-form="pricerule_raw" title="Add or update a Raw Material Site Cost or Site Haulage Rate agreement">
            <span>Price Agreement</span>
          </button>` : '';
          const rawAnchorObj = showRawPr ? (['settlement', 'expense', 'raw'].map(id => vis.find(f => f.id === id)).find(Boolean) || null) : null;
          let html = vis.map(f => {
            const baseTab = `
          <button type="button" class="modal-tab ${!groupOverride && f.id === activeForm ? 'active' : ''}" data-form="${esc(f.id)}">
            <span>${esc(f.label)}</span>${f.universal && !activeGroup.universalGroup ? '<span class="tbl-univ-tag">All BUs</span>' : ''}
          </button>`;
            if (activeGroup.id === 'sales' && f.id === 'pricerule') {
              return baseTab + `
          <button type="button" class="modal-tab ${groupOverride === 'comm' && activeForm === 'pricerule' ? 'active' : ''}" data-form="pricerule_comm" title="Add or step a per-unit Sales Commission rule by Product, Date Window &amp; Unit (m³ / Ton)">
            <span>Commission Rule</span>
          </button>`;
            }
            if (rawAnchorObj && f.id === rawAnchorObj.id) {
              return baseTab + rawPrTab;
            }
            return baseTab;
          }).join('');
          if (showRawPr && !rawAnchorObj) html = rawPrTab + html;
          return html;
        })()}
      </div>
    `;
  }

  // ==================== SECONDARY FORMS (GROUPS 2, 3, 4 — 18 FORMS) ====================
  function secHdr(title, sub) {
    return `<div class="pa-form-sec-hdr"><span>${title}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }
  function fld(label, inner, opts = {}) {
    const lockAttr = opts.lockField ? ` data-policy-lock="${esc(opts.lockField)}" data-lock-reason="${esc(opts.lockReason || 'Locked by business rule')}"` : '';
    const lockPill = opts.lockField ? `<span class="pa-lock-pill locked" data-lock-pill="${esc(opts.lockField)}" data-toggle-field-lock="${esc(opts.lockField)}" title="${esc(opts.lockReason || 'Locked by policy')}">${ic('lock')} <span class="lp-short">Locked</span><span class="sr-only"> LOCKED</span></span>` : '';
    return `<div class="form-field${opts.span ? ' span-3' : ''}${opts.span2 ? ' span-2' : ''}${opts.cls ? ' ' + opts.cls : ''}${opts.lockField ? ' is-policy-locked' : ''}"${opts.id ? ` id="${opts.id}"` : ''}${lockAttr}${opts.hidden ? ' hidden' : ''}><label><span class="pa-fld-lbl">${label}</span>${lockPill}</label>${inner}${opts.afterHtml || ''}${opts.hint != null ? `<span class="hint"${opts.hintId ? ` id="${opts.hintId}"` : ''}>${opts.hint}</span>` : ''}</div>`;
  }
  function inp(id, type, value, attrs = '') {
    return `<input type="${type}" id="${id}" value="${esc(value == null ? '' : value)}" autocomplete="off" ${attrs}>`;
  }
  function sel(id, options, value, attrs = '') {
    return `<select id="${id}" ${attrs}>${options.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  }
  function dl(id, values) {
    return `<datalist id="${id}">${values.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  }
  function dlMeta(id, items) {
    return `<datalist id="${id}">${items.map(it => {
      const [v, m] = Array.isArray(it) ? it : [it, ''];
      return `<option value="${esc(v)}"${m ? ` data-meta="${esc(m)}"` : ''}>`;
    }).join('')}</datalist>`;
  }

  function renderExtendedFormBody(fType, ctx, helpers) {
    const rec = getRecords(ctx);
    const comps = helpers.allowedCompanyNames();
    const company = helpers.defaultEntryCompany();
    const today = todayISO();
    const dateAttrs = `min="${MIN_DATE}" max="${today}" required`;
    const companyField = fld('Company (BU) *', sel('f_company', comps, company), { id: 'wrap_f_company' });
    const lockedDateField = (lbl = 'Transaction Date *') => fld(lbl, inp('f_date', 'date', today, `${dateAttrs} readonly`), {
      id: 'wrap_f_date',
      lockField: 'f_date',
      lockReason: 'Locked to entry date for Cash Flow accuracy — use Reporting Date for report adjustments',
      afterHtml: `<div class="repdate-bar"><button type="button" class="repdate-toggle-btn" id="toggleRepDateBtn">${ic('calendar')} Different Reporting Date?</button><span class="hint" id="hint_date"></span></div>`
    });
    const collapsibleRepDateField = () => fld('Reporting Date *', inp('f_repdate', 'date', today, dateAttrs), {
      id: 'wrap_f_repdate',
      hidden: true,
      afterHtml: `<div class="repdate-bar"><button type="button" class="repdate-reset-btn" id="resetRepDateBtn">× Same as Transaction Date</button><span class="hint" id="hint_repdate"></span></div>`
    });
    const fIdx = (helpers && typeof helpers.getFreqIndex === 'function')
      ? helpers.getFreqIndex()
      : (typeof window !== 'undefined' && typeof window.MFG_FREQ === 'function' ? window.MFG_FREQ() : null);
    const uoms = uniqSorted((rec.uoms || []).map(u => u.name).concat(['m³', 'Ton', 'Truck', 'Piece', 'Bag', 'Litre', 'kg']), fIdx && fIdx.uom);
    const prodByName = {};
    (rec.products || []).forEach(p => { if (p && p.name && !prodByName[p.name]) prodByName[p.name] = p; });
    const buildFallbackProdMetaItems = (sideKey) => {
      const fMap = sideKey === 'raw' ? (fIdx && fIdx.productRaw) : (sideKey === 'sales' || sideKey === 'comm' ? (fIdx && fIdx.productSales) : (fIdx && fIdx.product));
      return uniqSorted((rec.products || []).map(p => p.name), fMap).map(n => {
        const p = prodByName[n];
        const u = (p && p.uom) || 'm³';
        const tf = p && Number(p.ton_factor) ? Number(p.ton_factor) : 0;
        return [n, u + (tf && tf !== 1 ? ` · 1 m³ = ${tf} t` : '')];
      });
    };
    const custNames = helpers.customerNames();
    const supNames = helpers.supplierNames();
    const siteNames = helpers.siteNames();
    const equipNames = helpers.equipmentNames();
    const driverNames = helpers.driverNames();
    const staffNames = uniqSorted((rec.employments || []).map(e => e.staff || e.name).concat((rec.salaries || []).map(s => s.staff)), fIdx && fIdx.staff);
    const roleNames = uniqSorted(['Driver', 'Plant Operator', 'Crusher Operator', 'Loader Operator', 'Mechanic', 'Electrician', 'Weighbridge Clerk', 'Site Supervisor', 'Guard', 'General Labour'].concat((rec.employments || []).map(e => e.role)).concat((rec.freelance_sheets || []).map(f => f.role)), fIdx && fIdx.role);
    const counterpartyNames = uniqSorted(['Bdeir Holding', 'WTC', 'BBConstruction', 'Lions Transport', 'Cash Till', 'Bank Audi', 'Blom Bank'].concat((rec.loans || []).map(l => l.lender || l.counterparty || l.name)).concat((rec.external_movements || []).map(x => x.counterparty || x.name)).concat(supNames), fIdx && fIdx.counterparty);
    const regNames = uniqSorted((rec.regions || []).map(r => r.name).concat(['Beirut', 'Mount Lebanon', 'South', 'Bekaa', 'North', 'Nabatieh']), fIdx && fIdx.region);
    const adminHeaderHtml = `<div id="paAdminUnlockBox" hidden></div>`;
    const empByStaff = {};
    (rec.employments || []).forEach(e => {
      if (!e || e.voided) return;
      const sn = norm(e.staff || e.name);
      if (!sn) return;
      const prev = empByStaff[sn];
      const isCur = String(e.status || '').toLowerCase() === 'current';
      const prevCur = prev && String(prev.status || '').toLowerCase() === 'current';
      if (!prev || (isCur && !prevCur) || (isCur === prevCur && String(e.start_date || '') > String(prev.start_date || ''))) {
        empByStaff[sn] = e;
      }
    });
    const staffMetaItems = staffNames.map(n => {
      const e = empByStaff[norm(n)];
      if (!e) return [n, ''];
      const baseNet = round2(Number(e.salary_usd || e.amount || 0) + Number(e.reimbursement || 0) - Number(e.deduction || 0));
      const parts = [];
      if (e.role || e.position) parts.push(e.role || e.position);
      if (baseNet > 0) parts.push(`${fmtUsd(baseNet)}/mo`);
      if (e.company) parts.push(e.company);
      return [n, parts.join(' · ')];
    });

    if (fType === 'pricerule') {
      const grpOverride = (ctx && ctx.STATE && ctx.STATE.modalGroupOverride) || '';
      const isCommForm = grpOverride === 'comm';
      const isRawForm = grpOverride === 'raw';
      const prSide = isRawForm ? 'raw' : (isCommForm ? 'comm' : 'sales');
      const prProdMetaItems = (helpers && typeof helpers.domainProductMetaItems === 'function')
        ? helpers.domainProductMetaItems(prSide, company)
        : buildFallbackProdMetaItems(prSide);
      const prSiteNames = helpers.siteNames(isRawForm ? 'raw' : 'sales');
      const prSupNames = helpers.supplierNames(isRawForm ? 'raw_owner' : 'all');
      const prUomOpts = [
        ['m³', 'Per m³'],
        ['Ton', 'Per Ton'],
        ['Truck', 'Per Truck Load']
      ];
      const ruleTypeOpts = isRawForm
        ? ['Purchase Price (Site)', 'Transport Price (Site)']
        : ['Sales (Delivery)', 'Sales (Pickup)', 'List Price'];
      const defRuleType = isRawForm ? 'Purchase Price (Site)' : 'Sales (Delivery)';
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          <div class="pa-form-sec-hdr"><span id="pr_sec1_hdr">${isCommForm ? '1. Commission Product, Plant Owner &amp; Effective Date Window' : (isRawForm ? '1. Raw Material Site, Supplier / Hauler &amp; Effective Window' : '1. Sales Agreement Scope &amp; Customer')}</span></div>
          ${companyField}
          ${fld(isCommForm ? 'Effective Start Date *' : 'Start Date *', inp('f_date', 'date', today), { id: 'wrap_pr_startdate' })}
          ${fld(isCommForm ? 'Effective End Date (Optional · blank = Open)' : 'End Date (Optional)', inp('f_enddate', 'date', ''), { id: 'wrap_pr_enddate' })}
          ${isCommForm
            ? `<input type="hidden" id="f_ruletype" value="Commission">`
            : fld('Rule Type *', sel('f_ruletype', ruleTypeOpts, defRuleType), { id: 'wrap_pr_ruletype' })}
          ${fld(isRawForm ? 'Raw Material / Grade *' : 'Product / Grade *', inp('f_product', 'text', '', 'list="dl_pr_prods" placeholder="Select or type grade..."') + dlMeta('dl_pr_prods', prProdMetaItems), { id: 'wrap_pr_product' })}
          ${fld('Customer *', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames), { id: 'wrap_pr_customer', hidden: isCommForm || isRawForm })}
          ${fld(isCommForm ? 'Plant Owner / Beneficiary *' : (isRawForm ? 'Site Owner / Material Supplier *' : 'Supplier / Hauler *'), inp('f_supplier', 'text', '', 'list="dl_suppliers" placeholder="Select or type supplier..."') + dl('dl_suppliers', prSupNames), { id: 'wrap_pr_supplier', hidden: !isCommForm && !isRawForm })}
          ${fld(isRawForm ? 'Source Site *' : 'Delivery Site', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type site..."') + dl('dl_sites', prSiteNames), { id: 'wrap_pr_site', hidden: isCommForm })}
          <div id="pr_comm_history_box" class="form-field span-3" ${isCommForm ? '' : 'hidden'} style="background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:6px;padding:8px 12px;font-size:12px;line-height:1.45"></div>
          <div class="pa-form-sec-hdr"><span id="pr_sec2_hdr">${isCommForm ? '2. Commission Unit &amp; Rate' : '2. Pricing &amp; Volume Tiers'}</span></div>
          ${fld(isCommForm ? 'Commission Unit *' : 'Material Pricing Unit *', sel('f_uom', prUomOpts, 'm³'), { id: 'wrap_pr_uom', hintId: 'hint_pr_uom', hint: '' })}
          ${fld(isCommForm ? 'Commission Rate ($ / m³) *' : 'Material Unit Price ($ / m³) *', inp('f_unitprice', 'number', '0.00', 'step="0.01" min="0"'), { id: 'wrap_pr_matprice', hintId: 'hint_pr_matprice', hint: '' })}
          ${fld('Transportation Pricing Unit', sel('f_rateper', prUomOpts, 'm³'), { id: 'wrap_pr_transrate', hidden: isCommForm || isRawForm, hintId: 'hint_pr_transrate', hint: '' })}
          ${fld('Transportation Unit Price ($ / m³)', inp('f_transunitprice', 'number', '0.00', 'step="0.01" min="0"'), { id: 'wrap_pr_transprice', hidden: isCommForm || isRawForm, hintId: 'hint_pr_transprice', hint: '' })}
          ${fld('Target Truck Plate (Optional)', inp('f_pr_truck', 'text', '', 'list="dl_equip" placeholder="Select specific truck to adjust its m³..."') + dl('dl_equip', equipNames), { id: 'wrap_pr_truck', hidden: isCommForm, hintId: 'hint_pr_truck', hint: 'Select a specific truck first to override its m³ capacity for this client or site.' })}
          ${fld('Client / Site Truck Size (m³)', inp('f_trucksize', 'number', '', 'step="0.5" min="0" placeholder="Overrides selected truck m³..."'), { id: 'wrap_pr_trucksize', hidden: true, hintId: 'hint_pr_trucksize', hint: 'Overrides the selected truck capacity (m³) on matching m³ tickets.' })}
          ${fld('Tier 1 Truck Size (m³)', inp('f_qty1', 'number', '', 'step="0.5" min="0" placeholder="e.g. 14 or 20 m³"'), { id: 'wrap_pr_tier1', hidden: isCommForm })}
          ${fld('Tier 1 Material Adj ($)', inp('f_adj1', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_adj1', hidden: isCommForm })}
          ${fld('Tier 1 Transportation Adj ($)', inp('f_transadj1', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_transadj1', hidden: isCommForm || isRawForm })}
          ${fld('Tier 2 Truck Size (m³)', inp('f_qty2', 'number', '', 'step="0.5" min="0" placeholder="e.g. 22 or 25 m³"'), { id: 'wrap_pr_tier2', hidden: true })}
          ${fld('Tier 2 Material Adj ($)', inp('f_adj2', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_adj2', hidden: true })}
          ${fld('Tier 2 Transportation Adj ($)', inp('f_transadj2', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_transadj2', hidden: true })}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
        <div class="live-calc">
          <div><small id="lbl_calc_mat">${isCommForm ? 'Commission Rate' : 'Base Material + Trans'}</small><b id="calc_mat">$0.00 / u</b></div>
          <div><small id="lbl_calc_tr">${isCommForm ? 'Unit Equivalence' : 'Tier 1 Total per Load'}</small><b id="calc_tr">—</b></div>
          <div><small id="lbl_calc_vat">${isCommForm ? 'Effective Window' : 'Tier 2 Total per Load'}</small><b id="calc_vat">—</b></div>
          <div><small id="lbl_calc_total">${isCommForm ? 'Accrual Rate (GL 6222)' : 'Delivered Unit Price Total'}</small><b id="calc_total">$0.00</b></div>
        </div>
      `;
    }

    if (fType === 'vatinvoice') {
      const vPctLbl = fmtVatPctLbl(getActiveVatPct(today));
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          <div id="vatInvContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Invoice Serial No. *', inp('f_ticketno', 'text', '', 'placeholder="e.g. VAT-2026-0412"'))}
          ${fld('Customer *', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames), { hintId: 'hint_vat_cust', hint: '' })}
          ${fld('Net Amount Ex-VAT ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'))}
          ${fld(`VAT ${vPctLbl} ($)`, inp('f_vat', 'number', '', 'step="0.01" min="0" readonly'), { id: 'wrap_f_vat', lockField: 'f_vat', lockReason: `Locked to ${vPctLbl} Statutory Tax formula (Net HT × ${vPctLbl})` })}
          ${fld('Payment Status', sel('f_status', [['Open', 'Open'], ['Settled', 'Settled'], ['Partial', 'Partial']], 'Open'))}
          ${fld('Notes', inp('f_notes', 'text', ''))}
        </div>
        <div class="live-calc">
          <div><small>Net HT</small><b id="calc_mat">$0.00</b></div>
          <div><small id="lbl_vatinv_pct">${vPctLbl} VAT</small><b id="calc_vat">$0.00</b></div>
          <div><small>Total TTC</small><b id="calc_total">$0.00</b></div>
          <div><small>Customer VAT Status</small><b id="calc_vat_status">${vPctLbl} Statutory VAT</b></div>
        </div>
      `;
    }

    if (fType === 'creditterm') {
      return `
        <div class="form-grid-3">
          ${companyField}
          ${fld('Effective Date *', inp('f_date', 'date', today))}
          ${fld('Customer *', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames), { hintId: 'hint_ct_cust', hint: '' })}
          <div id="credTermContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Payment Days (Net Days) *', inp('f_days', 'number', '30', 'step="1" min="0"'))}
          ${fld('Credit Limit ($)', inp('f_amount', 'number', '25000', 'step="100" min="0"'))}
          ${fld('Notes', inp('f_notes', 'text', ''))}
        </div>
        <div class="live-calc" id="credTermLiveCalc">
          <div><small>Current Open AR</small><b id="calc_ct_ar">$0.00</b></div>
          <div><small>Credit Limit</small><b id="calc_ct_lim">$25,000</b></div>
          <div><small>Available Headroom</small><b id="calc_ct_head">$25,000</b></div>
          <div><small>Account Status</small><b id="calc_ct_status">Within Limit</b></div>
        </div>
      `;
    }

    if (fType === 'customer') {
      return `
        <div class="form-grid-3">
          ${fld('Customer Name *', inp('f_customer', 'text', '', 'placeholder="Full legal / trade name"'))}
          ${fld('Default Payment Method *', sel('f_method', [['Credit', 'Credit'], ['Cash', 'Cash']], 'Credit'))}
          ${fld('VAT Registered (11%)', sel('f_vatreg', [['No', 'No'], ['Yes', 'Yes — 11% VAT Applies']], 'No'))}
          ${fld('MOF Tax Number', inp('f_mof', 'text', '', 'placeholder="Ministry of Finance #"'), { id: 'wrap_cust_mof' })}
          ${fld('Phone', inp('f_phone', 'tel', '', 'placeholder="+961 ..."'))}
          ${fld('Region', inp('f_region', 'text', '', 'list="dl_regions" placeholder="Select or type region..."') + dl('dl_regions', regNames))}
          <div class="form-field check-field"><input type="checkbox" id="f_declqty"><label for="f_declqty">Uses Customer-declared Qty on tickets</label></div>
          <div class="form-field check-field"><input type="checkbox" id="f_extinv"><label for="f_extinv">Requires External Invoice # on tickets</label></div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'supplier') {
      return `
        <div class="form-grid-3">
          ${secHdr('1. Supplier / Hauler Identity (Universal Registry · All BUs)')}
          ${fld('Supplier / Hauler Name *', inp('f_supplier', 'text', '', 'list="dl_suppliers" placeholder="Select or type supplier, hauler, or vendor name..."') + dl('dl_suppliers', supNames))}
          <div class="form-field" id="wrap_f_category">
            <label for="supCategoryTrigger"><span class="pa-fld-lbl">Category *</span></label>
            <div class="pa-suggest-wrap pa-multiselect-wrap" id="supCategoryMultiWrap">
              <input type="hidden" id="f_category" value="Hauler / Truck Owner">
              <button type="button" class="pa-multiselect-trigger" id="supCategoryTrigger" aria-haspopup="listbox" aria-expanded="false">
                <div class="pa-ms-chips" id="supCategoryChips">
                  <span class="pa-ms-chip is-hauler-chip" data-ms-val="Hauler / Truck Owner">Hauler / Truck Owner</span>
                </div>
                <span class="pa-ms-count" id="supCategoryCount" hidden>1</span>
                <span class="pa-suggest-caret" aria-hidden="true">▾</span>
              </button>
              <div class="pa-suggest-menu pa-multiselect-menu" id="supCategoryMenu" role="listbox" aria-multiselectable="true" hidden></div>
            </div>
            <span class="hint" id="hint_sup_category">Hauler / Truck Owner opens Fleet &amp; Drivers below</span>
          </div>
          ${fld('Phone', inp('f_phone', 'tel', '', 'placeholder="+961 ..."'))}
          ${fld('Region', inp('f_region', 'text', '', 'list="dl_regions" placeholder="Select or type region..."') + dl('dl_regions', regNames))}
          ${fld('Default Payment Method', sel('f_method', [['Credit', 'Credit'], ['Cash', 'Cash']], 'Credit'))}
          ${fld('MOF Tax Number', inp('f_mof', 'text', '', 'placeholder="Tax / MOF registration #"'))}
          <div class="form-field check-field"><input type="checkbox" id="f_iva"><label for="f_iva">IVA / VAT Registered (11% Input VAT)</label></div>
          <div class="form-field span-3" id="wrap_sup_drivers">
            ${secHdr('2. Hauler Fleet & Drivers (Auto-Enabled when Hauler / Truck Owner is Selected)')}
            <div class="pa-owner-drivers-panel">
              <div class="pa-owner-drivers-add">
                <div class="form-field">
                  <label for="f_sup_drv_name"><span class="pa-fld-lbl">Driver</span></label>
                  <input type="text" id="f_sup_drv_name" list="dl_drivers" placeholder="Enter driver name to link or add..." autocomplete="off">
                  ${dl('dl_drivers', driverNames)}
                </div>
                <div class="form-field">
                  <label for="f_sup_drv_phone"><span class="pa-fld-lbl">Phone</span></label>
                  <input type="text" id="f_sup_drv_phone" placeholder="+961 ..." autocomplete="off">
                </div>
                <div class="form-field">
                  <label for="f_sup_drv_truck"><span class="pa-fld-lbl">Default Truck</span></label>
                  <input type="text" id="f_sup_drv_truck" list="dl_equip" placeholder="Assign default truck..." autocomplete="off">
                  ${dl('dl_equip', equipNames)}
                </div>
                <div class="form-field pa-owner-drivers-btn-wrap">
                  <label><span class="pa-fld-lbl">&nbsp;</span></label>
                  <button type="button" class="btn btn-brass" id="btnAddSupDriver">+ Add Driver to Owner</button>
                </div>
              </div>
              <div id="supOwnerDriversList" class="pa-owner-drivers-list"></div>
            </div>
          </div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'product') {
      return `
        <div class="form-grid-3">
          ${fld('Product / Grade Name *', inp('f_product', 'text', '', 'placeholder="e.g. Sand 0-4mm, Gravel 10-20mm"'))}
          ${fld('Default Unit (UoM) *', sel('f_uom', uoms, 'm³'))}
          ${fld('Product Type *', sel('f_prodtype', [['Material', 'Material (Aggregate / Concrete / Block)'], ['Fuel', 'Fuel (Diesel)'], ['Lubricant', 'Lubricant / Oil'], ['Service', 'Service / Transport'], ['Part', 'Spare Part']], 'Material'))}
          ${fld('Ton Conversion Factor (1 m³ = X Tons)', inp('f_tonfactor', 'number', '1.50', 'step="0.01" min="0.1"'))}
          ${fld('Standard List Price ($)', inp('f_unitprice', 'number', '', 'step="0.01" min="0"'))}
          <div class="form-field check-field"><input type="checkbox" id="f_ticketprod" checked><label for="f_ticketprod">Show on Sales / Raw Material tickets</label></div>
          <div class="form-field check-field"><input type="checkbox" id="f_fuelitem"><label for="f_fuelitem">Show on Fuel & Lubricant Intake</label></div>
          <div class="form-field check-field"><input type="checkbox" id="f_inputprod"><label for="f_inputprod">Raw Input Material</label></div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'expensecategory') {
      const expCatNames = uniqSorted(
        (rec.expense_categories || []).map(c => c && c.name).concat((rec.expenses || []).map(x => x && x.category)),
        fIdx && fIdx.category
      );
      const defaultSubcat = Boolean(ctx && ctx.STATE && (
        (ctx.STATE.view === 'reg_categories' && ctx.STATE.activeUnivRegKey === 'expense_subcategories') ||
        (ctx.STATE.view === 'tables' && ctx.STATE.activeTableKey === 'expense_subcategories')
      ));
      const defLvl = defaultSubcat ? 'subcategory' : 'category';
      return `
        <div class="form-grid-3">
          ${secHdr('1. Expense Taxonomy Identity (Universal Registry · All BUs)')}
          ${fld('Registry Level *', sel('f_cat_level', [
            ['category', 'Main Expense Category (Parent)'],
            ['subcategory', 'Expense Subcategory (Under Parent Category)']
          ], defLvl), { id: 'wrap_expcat_level' })}
          ${fld('Expense Category Name *', inp('f_category', 'text', '', 'placeholder="e.g. Plant Maintenance, Crusher Consumables..."'), { id: 'wrap_expcat_name', hidden: defaultSubcat })}
          ${fld('Accounting Cost Class *', sel('f_cost_class', [
            ['Operating Expense', 'Operating Expense (Class 62–67)'],
            ['Production Cost', 'Production Cost (Class 60/61)'],
            ['Capital Expenditure', 'Capital Expenditure (Class 22)']
          ], 'Operating Expense'), { id: 'wrap_expcat_class', hidden: defaultSubcat })}
          ${fld('GL Account Code', inp('f_gl_code', 'text', '', 'placeholder="Optional CoA code, e.g. 6121 or 6250"'), { id: 'wrap_expcat_gl', hidden: defaultSubcat })}
          ${fld('Parent Expense Category *', inp('f_parent_cat', 'text', '', 'list="dl_exp_cats" placeholder="Select parent expense category..."') + dl('dl_exp_cats', expCatNames), { id: 'wrap_expcat_parent', hidden: !defaultSubcat })}
          ${fld('Expense Subcategory Name *', inp('f_subcategory', 'text', '', 'placeholder="e.g. Hydraulic Hoses, Jaw Plates, Generator Filters..."'), { id: 'wrap_expcat_sub', hidden: !defaultSubcat })}
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional accounting classification or usage guidance..."'), { span: true })}
        </div>
      `;
    }

    if (fType === 'site') {
      return `
        <div class="form-grid-3">
          ${fld('Site Name *', inp('f_site', 'text', '', 'placeholder="Site name"'))}
          ${fld('Region *', inp('f_region', 'text', '', 'list="dl_regions" placeholder="Select or type region..."') + dl('dl_regions', regNames))}
          ${fld('Default Site Owner (Supplier)', inp('f_supplier', 'text', '', 'list="dl_suppliers" placeholder="Select or type supplier..."') + dl('dl_suppliers', supNames))}
          ${fld('Associated Customer (if Delivery Site)', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames))}
          ${fld('Latitude (GPS)', inp('f_lat', 'number', '', 'step="0.000001" placeholder="33.8938"'))}
          ${fld('Longitude (GPS)', inp('f_lng', 'number', '', 'step="0.000001" placeholder="35.5018"'))}
          <div class="form-field check-field"><input type="checkbox" id="f_isjv"><label for="f_isjv">Joint-Venture (JV) Site</label></div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'region') {
      return `
        <div class="form-grid-3">
          ${secHdr('1. Geographic Region Identity (Universal Registry · All BUs)')}
          ${fld('Region *', inp('f_region', 'text', '', 'placeholder="e.g. Metn, Keserwan, Chouf, Bekaa Central..."'))}
          ${fld('Region Code', inp('f_code', 'text', '', 'placeholder="e.g. MTN, KSR, BKA"'))}
          ${fld('Governorate', sel('f_corridor', [
            ['Mount Lebanon', 'Mount Lebanon'],
            ['Beirut', 'Beirut'],
            ['South', 'South Lebanon'],
            ['Nabatieh', 'Nabatieh'],
            ['Bekaa', 'Bekaa & Baalbek-Hermel'],
            ['North', 'North & Akkar']
          ], 'Mount Lebanon'))}
          ${fld('Reference Haulage Distance (km)', inp('f_distance_km', 'number', '', 'step="1" min="0" placeholder="Optional one-way km"'))}
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional corridor notes, toll/checkpoint info, or zone scope..."'), { span: true })}
        </div>
      `;
    }

    if (fType === 'fxrate') {
      const currList = ((rec.currencies || []).filter(c => c && !c.voided && !c.is_base && String(c.code || '').toUpperCase() !== 'USD'));
      const currOpts = currList.length
        ? currList.map(c => [c.code, `${c.code} · ${c.name || c.code}`])
        : [['LBP', 'LBP · Lebanese Pound']];
      return `
        <div class="form-grid-3">
          ${secHdr('1. Global Currency Exchange Rate Window (Universal Registry · All BUs)')}
          ${fld('Currency *', sel('f_currency', currOpts, 'LBP'), { id: 'wrap_fx_currency', hintId: 'hint_fx_currency', hint: 'Evaluated against $1.00 USD base currency across all Business Units.' })}
          ${fld('Effective Start Date *', inp('f_date', 'date', today), { id: 'wrap_fx_startdate', hintId: 'hint_fx_startdate', hint: 'Open-ended window; prior rate closes automatically on Start Date minus 1 day.' })}
          ${fld('Exchange Rate (per $1.00 USD) *', inp('f_fxrate', 'number', String(getActiveFxRate()), 'step="10" min="0.0001" placeholder="e.g. 89500"'), { id: 'wrap_fx_rate', hintId: 'hint_fx_rate', hint: '' })}
          <div id="fxRateContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional central bank circular, board resolution, or rate note..."'), { span: true })}
        </div>
        <div class="live-calc" id="fxRateLiveCalc">
          <div><small>Currency Pair</small><b id="calc_fx_pair">LBP / USD</b></div>
          <div><small>Effective Window</small><b id="calc_fx_window">Open</b></div>
          <div><small>Prior Window</small><b id="calc_fx_prior">Auto-closed</b></div>
          <div><small>1,000,000 Units in USD</small><b id="calc_fx_sample">$11.17</b></div>
        </div>
      `;
    }

    if (fType === 'vatrate') {
      const glOpts = uniqSorted(
        ['4427 State - VAT collected', '4426 State - VAT deductible']
          .concat((rec.coa || []).filter(a => a && /^442/.test(String(a.code || a.name || ''))).map(a => a.code && a.name ? `${a.code} ${a.name}` : (a.name || a.code)))
      );
      return `
        <div class="form-grid-3">
          ${secHdr('1. Statutory VAT Rate & Ministry of Finance LBP Rate (Universal Registry · All BUs)')}
          ${fld('Effective Start Date *', inp('f_date', 'date', today), { id: 'wrap_vat_startdate', hintId: 'hint_vat_startdate', hint: 'Open-ended statutory window; prior VAT window closes automatically on Start Date minus 1 day.' })}
          ${fld('Statutory VAT Rate (%) *', inp('f_vat_pct', 'number', String(getActiveVatPct(today)), 'step="0.1" min="0" max="100" placeholder="e.g. 11.0"'), { id: 'wrap_vat_pct', hintId: 'hint_vat_pct', hint: '' })}
          ${fld('Official MoF LBP VAT Rate (LL / $) *', inp('f_fxrate', 'number', String(getActiveFxRate(today, 'LBP')), 'step="10" min="1" placeholder="e.g. 89500"'), { id: 'wrap_vat_fxrate', hintId: 'hint_vat_fxrate', hint: 'Official Ministry of Finance LBP/$ exchange rate for VAT declarations.' })}
          <div id="vatRateContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Output VAT GL Account *', inp('f_output_vat_gl', 'text', '4427 State - VAT collected', 'list="dl_vat_gl"') + dl('dl_vat_gl', glOpts))}
          ${fld('Input VAT GL Account *', inp('f_input_vat_gl', 'text', '4426 State - VAT deductible', 'list="dl_vat_gl"'))}
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional statutory law or MoF circular reference..."'))}
        </div>
        <div class="live-calc" id="vatRateLiveCalc">
          <div><small>Statutory VAT %</small><b id="calc_vatr_pct">11.0%</b></div>
          <div><small>MoF LBP VAT Rate</small><b id="calc_vatr_fx">89,500 LL/$</b></div>
          <div><small>$100.00 Net HT Sample</small><b id="calc_vatr_sample">$11.00 VAT · $111.00 TTC</b></div>
          <div><small>Prior Window</small><b id="calc_vatr_prior">Auto-closed</b></div>
        </div>
      `;
    }

    if (fType === 'currency') {
      return `
        <div class="form-grid-3">
          ${secHdr('1. Currency Definition (Universal Registry · All BUs)')}
          ${fld('ISO Currency Code *', inp('f_code', 'text', '', 'maxlength="6" placeholder="e.g. EUR, GBP, AED"'), { id: 'wrap_curr_code', hintId: 'hint_curr_code', hint: '3-letter ISO 4217 currency code.' })}
          ${fld('Currency Name *', inp('f_name', 'text', '', 'placeholder="e.g. Euro, Pound Sterling, UAE Dirham"'))}
          ${fld('Symbol *', inp('f_symbol', 'text', '', 'maxlength="6" placeholder="e.g. €, £, AED"'))}
          ${fld('Decimal Precision', sel('f_precision', [
            ['2', '2 Decimals (0.01)'],
            ['0', '0 Decimals (Whole Units)'],
            ['3', '3 Decimals (0.001)']
          ], '2'))}
          ${fld('Operational Role', inp('f_role', 'text', 'Foreign Settlement Currency', 'placeholder="e.g. Foreign Trade & Settlement Currency"'), { span2: true })}
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional settlement or rounding notes..."'), { span: true })}
        </div>
      `;
    }

    if (fType === 'equipment' || fType === 'companyequipment') {
      const isCo = fType === 'companyequipment';
      return `
        <div class="form-grid-3">
          ${secHdr(isCo ? '1. Company Fleet Unit Assignment (BU-Specific)' : '1. Truck / Equipment Identity & Capacity (Universal Registry · All BUs)')}
          ${isCo ? companyField : ''}
          ${fld('Unit Code / Plate Identifier *', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="e.g. B-123456 or SHACMAN-04"') + dl('dl_equip', equipNames))}
          ${fld('License Plate No.', inp('f_plateno', 'text', '', 'placeholder="Plate number"'))}
          ${fld('Equipment Category *', sel('f_category', [['Truck', 'Dump Truck / Tipper'], ['Mixer', 'Transit Mixer'], ['Loader', 'Wheel Loader'], ['Excavator', 'Excavator'], ['Bulldozer', 'Bulldozer'], ['Generator', 'Generator / Crusher'], ['Service Vehicle', 'Pickup / Service Vehicle']], 'Truck'))}
          ${fld('Capacity (m³) *', inp('f_capacity', 'number', '18', 'step="0.5" min="0"'), { id: 'wrap_eq_capacity' })}
          ${fld('Model / Make', inp('f_model', 'text', '', 'placeholder="Mercedes / Volvo / Shacman / CAT"'))}
          ${secHdr('2. Owner & Active Driver Assignment')}
          ${fld('Ownership *', sel('f_ownership', isCo ? [['Owned', 'Company Owned Fleet'], ['Rented', 'Long-Term Rented']] : [['Subcontractor', 'Third-Party Hauler / Subcontractor'], ['Owned', 'Company Owned Fleet'], ['Customer', 'Customer Truck']], isCo ? 'Owned' : 'Subcontractor'))}
          ${fld('Truck Owner (Supplier / Hauler)', inp('f_supplier', 'text', isCo ? company : '', 'list="dl_suppliers" placeholder="Select or type truck owner..."') + dl('dl_suppliers', supNames), { id: 'wrap_eq_supplier', hidden: isCo, hintId: 'hint_eq_supplier', hint: '' })}
          ${fld('Default / Active Driver (Locked onto Tickets)', inp('f_driver', 'text', '', 'list="dl_drivers" placeholder="Select active driver..."') + dl('dl_drivers', driverNames), { id: 'wrap_eq_driver', hintId: 'hint_eq_driver', hint: 'Strictly auto-populated and locked on Sales, Raw Material, Lubricant & Diesel tickets unless changed in the Equipment Log.' })}
          ${fld('Effective From Date', inp('f_effdate', 'date', today), { id: 'wrap_eq_effdate' })}
          ${fld('Effective To Date (Blank = Open / Substitute End)', inp('f_effend', 'date', ''), { id: 'wrap_eq_effend' })}
        </div>
        <div id="wrap_eq_driver_log" hidden style="margin-top:12px"></div>
      `;
    }

    if (fType === 'defect' || fType === 'partlog') {
      const subsystems = [
        ['Engine & Powertrain', 'Engine & Powertrain'],
        ['Brakes & Suspension', 'Brakes & Suspension'],
        ['Hydraulics & Hoist', 'Hydraulics & Hoist'],
        ['Tyres & Wheels', 'Tyres & Wheels'],
        ['Electrical & Battery', 'Electrical & Battery'],
        ['Transmission & Gearbox', 'Transmission & Gearbox'],
        ['Body, Chassis & Bucket', 'Body, Chassis & Bucket'],
        ['Crusher / Plant Screen', 'Crusher / Plant Screen'],
        ['Cooling & Exhaust', 'Cooling & Exhaust'],
        ['Other', 'Other']
      ];
      const staffAndDrivers = uniqSorted(driverNames.concat(staffNames));
      const partNames = uniqSorted(
        (rec.products || []).filter(p => p && String(p.product_type || '').toLowerCase() === 'part').map(p => p.name)
          .concat((rec.part_movements || []).map(p => p && p.part_name))
          .concat((rec.equipment_defects || []).map(d => d && d.part_name))
          .concat(['Dynamo / Alternator', 'Starter Motor (March)', 'Hydraulic Pump', 'Brake Pads & Drum', 'Tyre 315/80R22.5', 'Oil Filter', 'Air Filter', 'Fuel Filter', 'Water Pump / Radiator', 'Battery 180Ah', 'Clutch Plate & Disc', 'Gearbox Bearing', 'Crusher Jaw Plate', 'Screen Mesh', 'Hydraulic Hose'])
      );
      const partLocations = uniqSorted(['WTC Main Warehouse', 'BBConstruction Spare Store', 'Lions Garage Store', 'Crusher Site Store'].concat(siteNames).concat(equipNames));
      const vendorsAndBuyers = uniqSorted(supNames.concat(custNames));

      if (fType === 'defect') {
        return `
          ${adminHeaderHtml}
          <div class="form-grid-3">
            ${secHdr('1. Unit Identity & Pre-Replacement Defect Notice', 'Notify management & garage ahead of failure so part replacements are pre-verified')}
            ${companyField}
            ${lockedDateField('Reported Date *')}
            ${collapsibleRepDateField()}
            ${fld('Equipment / Truck *', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Select truck, mixer, loader, crusher..."') + dl('dl_equip', equipNames), { id: 'wrap_f_truck', hintId: 'hint_truck', hint: '' })}
            ${fld('Reported By (Driver / Staff)', inp('f_reported_by', 'text', '', 'list="dl_staff_drivers" placeholder="Select driver, operator, or mechanic..."') + dl('dl_staff_drivers', staffAndDrivers))}
            ${fld('Meter Reading (km / h)', inp('f_meter', 'number', '', 'step="1" min="0" placeholder="Optional km or hours"'))}
            <div id="qv_truck_defect" class="span-3" style="grid-column:1 / -1"></div>
            ${secHdr('2. Affected Subsystem, Severity & Operational Status')}
            ${fld('Affected Subsystem *', sel('f_subsystem', subsystems, 'Engine & Powertrain'))}
            ${fld('Suspected Part / Piece', inp('f_part_name', 'text', '', 'list="dl_part_names" placeholder="e.g. Dynamo, Hydraulic Pump, Brake Drum..."') + dl('dl_part_names', partNames))}
            ${fld('Defect Severity *', sel('f_severity', [
              ['Minor — Monitor (Running)', 'Minor — Monitor (Running)'],
              ['Moderate — Needs Part Soon', 'Moderate — Needs Part Soon'],
              ['Critical — Down / Do Not Dispatch', 'Critical — Down / Do Not Dispatch']
            ], 'Moderate — Needs Part Soon'))}
            ${fld('Defect Status *', sel('f_status', [
              ['Open — Defect Reported', 'Open — Defect Reported'],
              ['Part Ordered / Scheduled', 'Part Ordered / Scheduled'],
              ['In Maintenance / Workshop', 'In Maintenance / Workshop'],
              ['Resolved — Part Changed', 'Resolved — Part Changed'],
              ['Closed — Inspected OK', 'Closed — Inspected OK']
            ], 'Open — Defect Reported'))}
            <div class="form-field check-field" style="grid-column:span 2"><input type="checkbox" id="f_sync_unit_status"><label for="f_sync_unit_status">Flag unit Fleet Status as "Under repair" until resolved</label></div>
            ${fld('Issue / Defect Description *', inp('f_description', 'text', '', 'placeholder="Describe symptom, leak, noise, warning light, or worn component..."'), { span: true })}
            ${fld('Notes / Action Plan', inp('f_notes', 'text', '', 'placeholder="Parts to order, vendor inspection, or target repair date..."'), { span: true })}
          </div>
          <div class="live-calc">
            <div><small>Unit Health Impact</small><b id="calc_def_health">Needs Part Soon</b></div>
            <div><small>Prior Open Issues</small><b id="calc_def_open">0 open</b></div>
            <div><small>Subsystem</small><b id="calc_def_sub">Engine &amp; Powertrain</b></div>
            <div><small>Pre-Notification</small><b id="calc_def_notif">Logged Before Replacement</b></div>
          </div>
        `;
      }

      return `
        ${adminHeaderHtml}
        <div id="partPreDefectBanner" class="pa-rec-banner info" style="margin-bottom:12px">
          ${ic('info')} Select an <b>Equipment / Truck</b> unit below to check whether a defect was reported beforehand.
        </div>
        <div class="form-grid-3">
          ${secHdr('1. Unit, Pre-Defect Verification & Part Piece Identity')}
          ${companyField}
          ${lockedDateField('Action Date *')}
          ${collapsibleRepDateField()}
          ${fld('Equipment / Truck *', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Select truck, mixer, loader, crusher..."') + dl('dl_equip', equipNames), { id: 'wrap_f_truck', hintId: 'hint_truck', hint: '' })}
          ${fld('Prior Reported Defect (Pre-Notification)', sel('f_defect_ref', [['', 'No Prior Defect Report (Emergency / Unnotified Change)']], ''), { id: 'wrap_f_defect_ref', hintId: 'hint_defect_ref', hint: '' })}
          ${fld('Action Type *', sel('f_action_type', [
            ['Part Replaced (Old Removed + New Installed)', 'Part Replaced (Old Removed + New Installed)'],
            ['Part Removed Only', 'Part Removed Only'],
            ['Part Sent to Maintenance / Rebuild', 'Part Sent to Maintenance / Rebuild'],
            ['Part Installed from Stock', 'Part Installed from Stock'],
            ['Used / Scrap Part Sold', 'Used / Scrap Part Sold'],
            ['Part Scrapped / Discarded', 'Part Scrapped / Discarded']
          ], 'Part Replaced (Old Removed + New Installed)'))}
          ${fld('Part / Piece Name *', inp('f_part_name', 'text', '', 'list="dl_part_names" placeholder="e.g. Dynamo, Starter Motor, Hydraulic Pump..."') + dl('dl_part_names', partNames))}
          ${fld('Part Code / Serial / Brand', inp('f_part_serial', 'text', '', 'placeholder="Optional OEM / serial / brand"'))}
          ${fld('Subsystem *', sel('f_subsystem', subsystems, 'Engine & Powertrain'))}
          ${secHdr('2. Removed / Tracked Piece Custody, Disposition & Financials')}
          ${fld('Pieces / Qty *', inp('f_qty', 'number', '1', 'step="1" min="1"'))}
          ${fld('Piece Condition *', sel('f_condition', [
            ['Repairable / Rebuildable', 'Repairable / Rebuildable'],
            ['Reusable Spare (Working)', 'Reusable Spare (Working)'],
            ['New / Reconditioned', 'New / Reconditioned'],
            ['Worn / Scrap Metal', 'Worn / Scrap Metal'],
            ['Damaged / Burnt Out', 'Damaged / Burnt Out']
          ], 'Repairable / Rebuildable'))}
          ${fld('Piece Custody / Disposition *', sel('f_disposition', [
            ['Stored in Warehouse / Spare Stock', 'Stored in Warehouse / Spare Stock'],
            ['In Maintenance / At Workshop', 'In Maintenance / At Workshop'],
            ['Sold (Used / Scrap)', 'Sold (Used / Scrap)'],
            ['Installed / Mounted on Unit', 'Installed / Mounted on Unit'],
            ['Scrapped / Discarded', 'Scrapped / Discarded']
          ], 'Stored in Warehouse / Spare Stock'))}
          ${fld('Warehouse Store / Target Unit', inp('f_location', 'text', 'WTC Main Warehouse', 'list="dl_part_locations" placeholder="Select store, site, or target truck..."') + dl('dl_part_locations', partLocations), { id: 'wrap_part_loc', hintId: 'hint_part_loc', hint: '' })}
          ${fld('Workshop Vendor / Buyer', inp('f_vendor_buyer', 'text', '', 'list="dl_suppliers_buyers" placeholder="Select workshop vendor or scrap buyer..."') + dl('dl_suppliers_buyers', vendorsAndBuyers), { id: 'wrap_part_party', hintId: 'hint_part_party', hint: '' })}
          ${fld('Supervisor / Approved By', inp('f_approved_by', 'text', '', 'list="dl_staff" placeholder="Select supervisor / approver..."') + dl('dl_staff', staffNames))}
          ${fld('New Replacement Part Cost ($)', inp('f_new_cost', 'number', '', 'step="0.01" min="0" placeholder="0.00"'), { id: 'wrap_part_newcost' })}
          ${fld('Workshop Rebuild Cost ($)', inp('f_repair_cost', 'number', '', 'step="0.01" min="0" placeholder="0.00"'), { id: 'wrap_part_repcost' })}
          ${fld('Used / Scrap Sale Proceeds ($)', inp('f_sale_proceeds', 'number', '', 'step="0.01" min="0" placeholder="0.00"'), { id: 'wrap_part_sale' })}
          <div class="form-field check-field span-3" id="wrap_resolve_defect" hidden><input type="checkbox" id="f_resolve_defect" checked><label for="f_resolve_defect">Mark linked prior defect report as "Resolved — Part Changed"</label></div>
          ${fld('Notes & Custody Details', inp('f_notes', 'text', '', 'placeholder="Shelf bin, workshop job card #, buyer receipt #, or mounting notes..."'), { span: true })}
        </div>
        <div class="live-calc">
          <div><small>Pre-Notification</small><b id="calc_part_notif">Pending Unit</b></div>
          <div><small>Piece Custody</small><b id="calc_part_disp">Stored in Warehouse</b></div>
          <div><small>Outlay (New + Repair)</small><b id="calc_part_cost">$0.00</b></div>
          <div><small>Net Cash Impact</small><b id="calc_part_net">$0.00</b></div>
        </div>
      `;
    }

    if (fType === 'driver') {
      return `
        <div class="form-grid-3">
          ${secHdr('1. Driver / Operator Identity & Truck Assignment (Universal Registry · All BUs)')}
          ${fld('Driver *', inp('f_driver', 'text', '', 'placeholder="Driver name"'))}
          ${fld('Default Truck Plate', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Select or type truck plate..."') + dl('dl_equip', equipNames))}
          ${fld('Truck Owner (Hauler Supplier)', inp('f_supplier', 'text', '', 'list="dl_suppliers" placeholder="Auto-filled from Truck Plate (or select hauler)..."') + dl('dl_suppliers', supNames), { id: 'wrap_drv_supplier' })}
          ${fld('Phone', inp('f_phone', 'text', '', 'placeholder="+961 ..."'))}
          <div class="form-field check-field"><input type="checkbox" id="f_iscompanydriver"><label for="f_iscompanydriver">Company Fleet Driver (WTC / BBC / Lions Payroll)</label></div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'salary') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3 att-compact-grid">
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          ${fld('Entry Type *', sel('f_sal_type', [
            ['payment', 'Salary Payment'],
            ['bonus', 'Bonus / Extra Pay']
          ], 'payment'), { id: 'wrap_sal_type' })}
          ${fld('Payroll Month *', inp('f_paymonth', 'month', today.slice(0, 7)), { id: 'wrap_sal_month' })}
          ${fld('Staff *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff..."') + dlMeta('dl_staff', staffMetaItems), { id: 'wrap_sal_staff', hintId: 'hint_sal_staff', hint: '' })}
          ${fld('Payment Method *', sel('f_method', [['Cash', 'Cash'], ['Bank', 'Bank Transfer']], 'Cash'), { id: 'wrap_sal_method' })}
          <div id="salStaffMonthCard" class="att-contract-strip is-muted">Select a <b>Staff</b> and <b>Payroll Month</b> above to view their monthly contract salary, attendance overtime/deductions, amount already paid, and remaining balance or advance status.</div>
          <div id="salQuickFillBar" class="att-preset-bar" hidden></div>
          ${fld('USD Amount ($)', inp('f_usd', 'number', '', 'step="0.01" min="0" placeholder="0.00"'), { hintId: 'hint_sal_usd', hint: '' })}
          ${fld('LBP Amount (L.L.)', inp('f_lbp', 'number', '', 'step="1000" min="0" placeholder="0"'))}
          ${fld(`Total USD Value (${fmtFxRateLbl(getActiveFxRate())} LL/$) *`, inp('f_amount', 'number', '', 'step="0.01" readonly class="pa-locked-input"'), { id: 'wrap_f_amount', lockField: 'f_amount', lockReason: `Locked to Dual-Currency FX formula (USD + LBP ÷ ${fmtFxRateLbl(getActiveFxRate())} LL/$)` })}
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional payroll note, bonus reason, or voucher ref..."'), { span: true })}
        </div>
        <div id="paSalSubgridWrap"></div>
        <div class="live-calc att-live-calc-compact" id="salLiveCalc">
          <div><small id="lbl_sal_earned">Month Net Earned</small><b id="calc_sal_earned">Select Staff</b></div>
          <div><small id="lbl_sal_paid">Already Paid (Month)</small><b id="calc_sal_paid">$0.00</b></div>
          <div><small id="lbl_sal_rem">Remaining After Payment</small><b id="calc_sal_rem">—</b></div>
          <div><small id="lbl_sal_status">Payment Classification</small><b id="calc_sal_status">Pending Staff</b></div>
        </div>
      `;
    }

    if (fType === 'attendance') {
      return `
        <div class="form-grid-3 att-compact-grid">
          ${companyField}
          ${fld('Attendance Date *', inp('f_date', 'date', today), { hintId: 'hint_att_date', hint: '' })}
          ${fld('Staff *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff..."') + dlMeta('dl_staff', staffMetaItems), { id: 'wrap_att_staff' })}
          <div id="attStaffContractCard" class="att-contract-strip" hidden></div>

          <input type="hidden" id="f_att_mode" value="shift">
          <input type="hidden" id="f_status" value="Present">
          <input type="hidden" id="f_sched_hours" value="8">
          <div class="att-preset-bar" id="attModeDeck" role="tablist" aria-label="Attendance Entry Mode">
            <span class="att-preset-lbl">Entry:</span>
            <button type="button" class="att-preset-pill active" id="attPresetRegularBtn" data-att-mode="shift" data-att-preset="regular">Regular Shift (Contract)</button>
            <button type="button" class="att-preset-pill" data-att-mode="shift" data-att-preset="callout">Sunday / Call-Out (100% OT)</button>
            <button type="button" class="att-preset-pill" data-att-mode="shift" data-att-preset="noclock">Hours Only</button>
            <button type="button" class="att-preset-pill" data-att-mode="leave">Leave / Absence / Half Day</button>
          </div>

          <div class="att-subpanel" id="attShiftPanel">
            ${fld('Time In', inp('f_in', 'time', '08:00'), { id: 'wrap_f_in' })}
            ${fld('Time Out', inp('f_out', 'time', '16:00'), { id: 'wrap_f_out', hintId: 'hint_att_out', hint: '' })}
            ${fld('Work Hours', inp('f_worked_hours', 'number', '8', 'step="0.5" min="0" readonly class="pa-locked-input"'), { id: 'wrap_f_worked_hours' })}
            ${fld('Overtime Hours (+)', inp('f_hours', 'number', '0', 'step="0.5" min="0"'), { id: 'wrap_f_hours' })}
            ${fld('Late Hours (−)', inp('f_late_hours', 'number', '0', 'step="0.5" min="0"'), { id: 'wrap_f_late_hours' })}
          </div>

          <div class="att-subpanel" id="attLeavePanel" hidden>
            <div class="att-preset-bar" id="attLeavePresetBar">
              <span class="att-preset-lbl">Leave Type:</span>
              <button type="button" class="att-preset-pill active" data-att-leave="Half Day">Half Day (0.5d)</button>
              <button type="button" class="att-preset-pill" data-att-leave="Absence">Full Absence (1.0d)</button>
              <button type="button" class="att-preset-pill" data-att-leave="VacAbsence">Paid Vacation</button>
              <button type="button" class="att-preset-pill" data-att-leave="Sick Leave">Sick Leave</button>
            </div>
            <input type="hidden" id="f_leave_type" value="Half Day">
            ${fld('Leave Days *', inp('f_leave_days', 'number', '0.5', 'step="0.5" min="0.5"'))}
            ${fld('Pay Treatment *', sel('f_leave_pay', [
              ['unpaid', 'Unpaid (Deduct from Salary)'],
              ['paid', 'Paid (Keep Full Salary)']
            ], 'unpaid'), { hintId: 'hint_att_leave_pay', hint: '' })}
          </div>

          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional remark..."'), { id: 'wrap_att_notes' })}
        </div>
        <div class="live-calc att-live-calc-compact" id="attLiveCalc">
          <div><small>Classification</small><b id="calc_att_type">Full Shift (On Time)</b></div>
          <div><small>Shift / Duration</small><b id="calc_att_math">08:00 to 16:00 = 8.0h</b></div>
          <div><small>Rate Basis</small><b id="calc_att_rate">Contract Basis</b></div>
          <div><small>Payroll Impact</small><b id="calc_att_impact">$0.00 (Standard Shift)</b></div>
        </div>
      `;
    }

    if (fType === 'freelance' || fType === 'employment') {
      const isContract = fType === 'employment';
      if (isContract) {
        return `
          <div class="form-grid-3">
            ${companyField}
            ${fld('Start Date *', inp('f_date', 'date', today))}
            ${fld('End Date', inp('f_enddate', 'date', ''), { id: 'wrap_emp_enddate' })}
            ${fld('Staff *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff..."') + dlMeta('dl_staff', staffMetaItems), { id: 'wrap_emp_staff', hintId: 'hint_emp_staff', hint: '' })}
            ${fld('Role', inp('f_role', 'text', '', 'list="dl_roles" placeholder="Select or type role..."') + dl('dl_roles', roleNames), { id: 'wrap_emp_role' })}
            ${fld('Pay Basis', sel('f_paytype', [['Monthly', 'Monthly'], ['Daily', 'Daily']], 'Monthly'), { id: 'wrap_emp_paytype' })}
            <div id="empStaffContextStrip" class="att-contract-strip" hidden></div>
            <div id="empEquipSiteBox" class="equip-site-readonly-box" role="region" aria-label="Connected Equipment and Sites Log" hidden></div>
            ${fld('Base Salary ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'), { id: 'wrap_emp_amount' })}
            ${fld('Work Days / Mo', inp('f_workdays', 'number', '30', 'step="1" min="1" max="31"'), { id: 'wrap_emp_workdays' })}
            ${fld('Hours / Day', inp('f_workhours', 'number', '8', 'step="0.5" min="1" max="24"'), { id: 'wrap_emp_workhours' })}
            ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
          </div>
          <div class="live-calc" id="empLiveCalc">
            <div><small>Contract</small><b id="calc_emp_prior">Select Staff</b></div>
            <div><small>Pay Basis</small><b id="calc_emp_basis">Monthly</b></div>
            <div><small>Daily / Hourly</small><b id="calc_emp_rates">—</b></div>
            <div><small>Monthly Salary</small><b id="calc_emp_total">$0.00</b></div>
          </div>
        `;
      }
      return `
        <div class="form-grid-3">
          ${companyField}
          ${fld('Work Date *', inp('f_date', 'date', today))}
          ${fld('Staff *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff..."') + dlMeta('dl_staff', staffMetaItems), { id: 'wrap_emp_staff', hintId: 'hint_emp_staff', hint: '' })}
          <div id="empStaffContextStrip" class="att-contract-strip" hidden></div>
          <div id="empEquipSiteBox" class="equip-site-readonly-box" role="region" aria-label="Connected Equipment and Sites Log" hidden></div>
          ${fld('Role', inp('f_role', 'text', '', 'list="dl_roles" placeholder="Select or type role..."') + dl('dl_roles', roleNames), { id: 'wrap_emp_role' })}
          ${fld('Pay Basis', sel('f_paytype', [['Daily', 'Daily'], ['Lump Sum', 'Lump Sum']], 'Daily'), { id: 'wrap_emp_paytype' })}
          ${fld('Amount ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'), { id: 'wrap_emp_amount' })}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
        <div class="live-calc" id="empLiveCalc">
          <div><small>Status</small><b id="calc_emp_prior">Select Staff</b></div>
          <div><small>Pay Basis</small><b id="calc_emp_basis">Daily</b></div>
          <div><small>Daily / Hourly</small><b id="calc_emp_rates">—</b></div>
          <div><small>Amount</small><b id="calc_emp_total">$0.00</b></div>
        </div>
      `;
    }

    if (fType === 'logistics') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3 att-compact-grid log-compact-grid">
          <input type="hidden" id="f_log_mode" value="range">
          <div class="att-preset-bar log-mode-bar" id="logModeDeck" role="tablist" aria-label="Site Allowance Mode">
            <span class="att-preset-lbl">Posting:</span>
            <button type="button" class="att-preset-pill active" data-log-mode="range">Date Range Posting</button>
            <button type="button" class="att-preset-pill" data-log-mode="single">Single Day Worked</button>
            <span class="log-mode-sep" aria-hidden="true"></span>
            <button type="button" class="att-preset-pill log-win-pill" data-log-win="week">This Week</button>
            <button type="button" class="att-preset-pill log-win-pill" data-log-win="month">This Month</button>
            <button type="button" class="att-preset-pill log-win-pill" data-log-win="open">Open-Ended</button>
          </div>
          ${companyField}
          ${fld('Start Date *', inp('f_date', 'date', today), { id: 'wrap_log_start', hintId: 'hint_log_dates', hint: '' })}
          ${fld('End Date (Blank = Open)', inp('f_enddate', 'date', today), { id: 'wrap_log_end' })}
          ${fld('Staff *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff..."') + dlMeta('dl_staff', staffMetaItems), { id: 'wrap_log_staff', hintId: 'hint_log_staff', hint: '' })}
          ${fld('Site *', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type site..."') + dl('dl_sites', siteNames), { id: 'wrap_log_site' })}
          ${fld('Equipment', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Optional excavator, loader, truck..."') + dl('dl_equip', equipNames), { id: 'wrap_log_equip' })}
          <div id="logStaffContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Daily USD ($ / day)', inp('f_usd', 'number', '', 'step="0.50" min="0" placeholder="0.00"'))}
          ${fld('Daily LBP (L.L. / day)', inp('f_lbp', 'number', '', 'step="50000" min="0" placeholder="e.g. 500000"'))}
          ${fld(`Daily Rate USD (${fmtFxRateLbl(getActiveFxRate())} LL/$) *`, inp('f_amount', 'number', '', 'step="0.01" readonly class="pa-locked-input"'), { id: 'wrap_f_amount', lockField: 'f_amount', lockReason: `Locked to Dual-Currency FX formula (USD + LBP ÷ ${fmtFxRateLbl(getActiveFxRate())} LL/$)` })}
          <div class="form-field check-field log-dow-field span-2" id="logDowBar" role="group" aria-label="Scheduled Working Days">
            <div class="log-dow-lbl-row">
              <span class="pa-fld-lbl">Scheduled Days *</span>
              <span class="log-dow-presets">
                <button type="button" class="log-dow-preset is-active" data-log-dow-preset="mon_sat">Mon–Sat</button>
                <button type="button" class="log-dow-preset" data-log-dow-preset="mon_fri">Mon–Fri</button>
                <button type="button" class="log-dow-preset" data-log-dow-preset="all_7">7d</button>
              </span>
            </div>
            <div class="log-dow-pills">
              ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `
                <label class="log-dow-pill${i < 6 ? ' is-on' : ''}${i === 6 ? ' is-sun' : ''}">
                  <input type="checkbox" id="f_day_${d.toLowerCase()}" ${i < 6 ? 'checked' : ''}>
                  <span class="log-dow-dot" aria-hidden="true"></span>
                  <span class="log-dow-txt">${d}</span>
                </label>`).join('')}
            </div>
          </div>
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional site task or note..."'), { id: 'wrap_log_notes' })}
        </div>
        <div class="live-calc att-live-calc-compact" id="logLiveCalc">
          <div><small id="lbl_log_days">Posted Window</small><b id="calc_log_days">1 day</b></div>
          <div><small>Daily Rate (USD)</small><b id="calc_log_daily">$0.00 / day</b></div>
          <div><small>Work Proof in Window</small><b id="calc_log_month">Select Staff</b></div>
          <div><small id="lbl_log_total">Window Allowance</small><b id="calc_log_total">$0.00</b></div>
        </div>
      `;
    }

    if (fType === 'triprate') {
      const otRegNames = uniqSorted(['Beirut', 'Sibline', 'Dekwaneh', 'Jnoub', 'Excluded'].concat((rec.overtime_rates || []).map(o => o && o.region)).concat(regNames), fIdx && fIdx.region);
      return `
        <div class="form-grid-3">
          ${companyField}
          ${fld('Start Date *', inp('f_date', 'date', today))}
          ${fld('End Date', inp('f_enddate', 'date', ''), { id: 'wrap_ot_enddate' })}
          ${fld('Region *', inp('f_region', 'text', '', 'list="dl_ot_regions" placeholder="e.g. Beirut, Sibline, Excluded..."') + dl('dl_ot_regions', otRegNames), { id: 'wrap_ot_region', hintId: 'hint_ot_region', hint: '' })}
          ${fld('Site (Optional)', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Auto-fills Region from site..."') + dl('dl_sites', siteNames), { id: 'wrap_ot_site' })}
          ${fld('Rate / Trip ($) *', inp('f_amount', 'number', '10.00', 'step="0.50" min="0"'))}
          <div id="otRateContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Rate Name', inp('f_name', 'text', '', 'placeholder="Auto-generated if left blank..."'))}
          ${fld('Equipment Category', sel('f_category', [['Truck', 'Dump Truck'], ['Mixer', 'Mixer'], ['All', 'All Fleet Units']], 'Truck'))}
          ${fld('Notes', inp('f_notes', 'text', ''))}
        </div>
      `;
    }

    if (fType === 'treasury') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          ${fld('Treasury Entry Type *', sel('f_trtype', [
            ['loan', 'Partner / Intercompany Loan Drawdown'],
            ['loan_settlement', 'Loan Repayment / Settlement'],
            ['external', 'External Cash Inflow / Outflow'],
            ['conversion', 'Currency Conversion USD ↔ LBP']
          ], 'loan'))}
          ${fld('Counterparty / Partner / Account *', inp('f_counterparty', 'text', '', 'list="dl_counterparties" placeholder="Select or type partner, bank, or entity..."') + dl('dl_counterparties', counterpartyNames), { id: 'wrap_tr_cp', hintId: 'hint_tr_cp', hint: '' })}
          ${fld('Direction / Leg *', sel('f_direction', [['Inflow', 'Cash Inflow / Borrowed'], ['Outflow', 'Cash Outflow / Repaid']], 'Inflow'), { id: 'wrap_tr_dir' })}
          <div id="trLiveContextStrip" class="att-contract-strip" hidden></div>
          ${fld('Conversion Direction *', sel('f_conv_dir', [
            ['USD to LBP', 'USD → LBP (USD Decreases · LBP Increases)'],
            ['LBP to USD', 'LBP → USD (LBP Decreases · USD Increases)']
          ], 'USD to LBP'), { id: 'wrap_conv_dir', hidden: true })}
          ${fld('Exchange Rate (LL / $)', inp('f_fxrate', 'number', String(getActiveFxRate()), 'step="10" min="1"'), { id: 'wrap_conv_rate', hidden: true })}
          ${fld('USD Amount ($)', inp('f_usd', 'number', '', 'step="0.01" min="0"'), { id: 'wrap_tr_usd', hintId: 'hint_tr_usd', hint: '' })}
          ${fld('LBP Amount (L.L.)', inp('f_lbp', 'number', '', 'step="1000" min="0"'), { id: 'wrap_tr_lbp' })}
          ${fld(`Total USD Value (${fmtFxRateLbl(getActiveFxRate())} LL/$) *`, inp('f_amount', 'number', '', 'step="0.01" readonly class="pa-locked-input"'), { id: 'wrap_f_amount', lockField: 'f_amount', lockReason: `Locked to Dual-Currency FX formula (USD + LBP ÷ ${fmtFxRateLbl(getActiveFxRate())} LL/$)` })}
          ${fld('Reference / Voucher', inp('f_reference', 'text', ''))}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
        <div class="live-calc" id="trLiveCalc">
          <div><small id="lbl_tr_c1">Counterparty Balance</small><b id="calc_tr_c1">—</b></div>
          <div><small id="lbl_tr_c2">This Entry (USD Eq.)</small><b id="calc_tr_c2">$0.00</b></div>
          <div><small id="lbl_tr_c3">Balance After Entry</small><b id="calc_tr_c3">—</b></div>
          <div><small id="lbl_tr_c4">Treasury Leg</small><b id="calc_tr_c4">Loan Drawdown</b></div>
        </div>
      `;
    }

    if (fType === 'malfunction') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${secHdr('1. Tank Discrepancy, Dates & Classification')}
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          ${fld('Discrepancy Type *', sel('f_disctype', [
            ['Malfunction', 'Malfunction (Meter / Physical Variance)'],
            ['Wash', 'Wash (Equipment Cleaning)'],
            ['Ghassanieh', 'Ghassanieh (House / Generator Supply)'],
            ['Configuration', 'Configuration (Tank Dip Calibration)']
          ], 'Malfunction'), { id: 'wrap_malf_type' })}
          ${fld('Quantity (Litres L) *', inp('f_qty', 'number', '', 'step="0.1" placeholder="e.g. 50 or -50"'), { id: 'wrap_malf_qty', hintId: 'hint_malf_qty', hint: '+ deducts from tank (used / shortage) · − adds to tank (surplus)' })}
          <div class="pa-form-sec-hdr" id="sec_malf_wash" hidden><span>2. Wash Ticket, Equipment &amp; Driver</span></div>
          ${fld('Ticket No.', inp('f_ticketno', 'text', '', 'placeholder="Optional wash slip or ticket #..."'), { id: 'wrap_malf_ticketno', hidden: true })}
          ${fld('Equipment', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Optional unit..."') + dl('dl_equip', equipNames), { id: 'wrap_malf_truck', hidden: true })}
          ${fld('Driver', inp('f_driver', 'text', '', 'list="dl_drivers" placeholder="Optional driver..."') + dl('dl_drivers', driverNames), { id: 'wrap_malf_driver', hidden: true })}
          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Explain meter variance, dip calibration, or wash note..."'), { id: 'wrap_malf_notes', span: true })}
        </div>
        <div id="malfLiveAlertBanner" class="att-contract-strip" hidden></div>
        <div class="live-calc" id="malfLiveCalc">
          <div><small>Tank Before Entry</small><b id="calc_malf_before">—</b></div>
          <div><small>Tank Impact</small><b id="calc_malf_delta">0.0 L</b></div>
          <div><small>Tank After Entry</small><b id="calc_malf_after">—</b></div>
          <div><small>Month Malfunction % (5% Watchdog)</small><b id="calc_malf_pct">0.0%</b></div>
        </div>
      `;
    }

    // jv
    return `
      ${adminHeaderHtml}
      <div class="form-grid-3">
        ${companyField}
        ${lockedDateField('Transaction Date *')}
        ${collapsibleRepDateField()}
        ${fld('JV Entry Type *', sel('f_jvtype', [['distribution', 'JV Profit / Cash Distribution'], ['partnership', 'New JV Site Partnership Setup']], 'distribution'))}
        ${fld('JV Site *', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type JV site..."') + dl('dl_sites', siteNames), { hintId: 'hint_jv_site', hint: '' })}
        ${fld('JV Partner *', inp('f_counterparty', 'text', '', 'list="dl_suppliers" placeholder="Select or type JV partner..."') + dl('dl_suppliers', supNames))}
        <div id="jvLiveContextStrip" class="att-contract-strip" hidden></div>
        ${fld('Partner Share (%)', inp('f_share', 'number', '50', 'step="0.5" min="0" max="100"'), { id: 'wrap_jv_share', hidden: true })}
        ${fld('Distribution Amount ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'), { id: 'wrap_jv_amount', hintId: 'hint_jv_amount', hint: '' })}
        ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
      </div>
      <div class="live-calc" id="jvLiveCalc">
        <div><small>50% Accrued Share</small><b id="calc_jv_accrued">—</b></div>
        <div><small>Already Distributed</small><b id="calc_jv_paid">—</b></div>
        <div><small>Remaining After Entry</small><b id="calc_jv_rem">—</b></div>
        <div><small>JV Status</small><b id="calc_jv_status">Select JV Site</b></div>
      </div>
    `;
  }

  // ==================== PUBLIC API MOUNT ====================
  window.MFG_FORMS = {
    get FX_RATE() { return getActiveFxRate(); },
    get VAT_RATE() { return getActiveVatFraction(); },
    get VAT_PCT() { return getActiveVatPct(); },
    MIN_DATE,
    FORM_GROUPS,
    FORM_MAP,
    FORM_TITLES,
    FORM_CR_KEY,
    parseTime,
    isOvertimeTime,
    renderExecutiveCockpit,
    computeDieselTank,
    matchTier,
    renderTruckQuickView,
    renderCustomerOpenTicketsSubgrid,
    renderSupplierOpenLegsSubgrid,
    renderModalTabsHtml,
    renderExtendedFormBody
  };
})();
