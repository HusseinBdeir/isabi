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

  const FX_RATE = 90000;
  const VAT_RATE = 0.11;
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
        { id: 'creditterm', label: 'Credit Terms', badge: 'bhf_creditterm', crKey: 'credit_terms', title: 'New Customer Credit Terms' },
        { id: 'customer', label: 'Customer', badge: 'bhf_customer', crKey: 'customers', title: 'New Customer (Universal Registry)', universal: true },
        { id: 'product', label: 'Product / Grade', badge: 'bhf_product', crKey: 'products', title: 'New Product / Aggregate Grade (Universal Registry)', universal: true }
      ]
    },
    {
      id: 'raw',
      icon: 'raw',
      label: '2. Quarry & JV',
      forms: [
        { id: 'raw', label: 'Raw Material Ticket', badge: 'bhf_rawpurchase', crKey: 'raw_purchases', title: 'New Raw Material Ticket' },
        { id: 'jv', label: 'JV Partnership & Dist.', badge: 'bhf_jvdistribution', crKey: 'jv_distributions', title: 'New Joint-Venture Entry' },
        { id: 'site', label: 'Site', badge: 'bhf_site', crKey: 'sites', title: 'New Site (Universal Registry)', universal: true }
      ]
    },
    {
      id: 'fleet',
      icon: 'fleet',
      label: '3. Fleet, Fuel & Maint.',
      forms: [
        { id: 'fuel', label: 'Fuel & Lubricant Intake', badge: 'bhf_fuelintake', crKey: 'fuel_intakes', title: 'New Fuel & Lubricant Intake' },
        { id: 'companyequipment', label: 'Company Fleet Unit', badge: 'bhf_companyequipment', crKey: 'company_equipment', title: 'New Company Fleet Unit (BU Assignment)' },
        { id: 'defect', label: 'Equipment Defect', badge: 'bhf_equipmentdefect', crKey: 'equipment_defects', title: 'Report Equipment / Truck Defect' },
        { id: 'partlog', label: 'Part Change & Custody', badge: 'bhf_partmovement', crKey: 'part_movements', title: 'Part Change, Removal & Disposition' },
        { id: 'triprate', label: 'Overtime Trip Rate', badge: 'bhf_triprate', crKey: 'overtime_rates', title: 'New Overtime Trip Rate' },
        { id: 'equipment', label: 'Equipment / Truck', badge: 'bhf_equipment', crKey: 'equipment', title: 'New Equipment / Truck (Universal Registry)', universal: true },
        { id: 'driver', label: 'Driver / Operator', badge: 'bhf_driver', crKey: 'drivers', title: 'New Driver / Operator (Universal Registry)', universal: true }
      ]
    },
    {
      id: 'expenses',
      icon: 'expenses',
      label: '4. Expenses & Payables',
      forms: [
        { id: 'expense', label: 'Expense (Cash / Credit)', badge: 'bhf_expense', crKey: 'expenses', title: 'New Expense' },
        { id: 'settlement', label: 'Supplier Settlement (AP)', badge: 'bhf_supplierpayment', crKey: 'settlements', title: 'New Supplier Settlement' },
        { id: 'supplier', label: 'Supplier / Hauler', badge: 'bhf_supplier', crKey: 'suppliers', title: 'New Supplier / Hauler (Universal Registry)', universal: true }
      ]
    },
    {
      id: 'payroll',
      icon: 'payroll',
      label: '5. Payroll & Workforce',
      forms: [
        { id: 'salary', label: 'Salary Payment', badge: 'bhf_salarypayment', crKey: 'salaries', title: 'New Salary Payment' },
        { id: 'attendance', label: 'Attendance', badge: 'bhf_attendance', crKey: 'attendance', title: 'New Staff Attendance' },
        { id: 'employment', label: 'Employment Contract', badge: 'bhf_employment', crKey: 'employments', title: 'New Employment Contract' },
        { id: 'freelance', label: 'Freelance Work', badge: 'bhf_freelancework', crKey: 'employments', title: 'New Freelance Work' },
        { id: 'logistics', label: 'Site Allowance (Mon–Sun)', badge: 'bhf_logistics', crKey: 'logistics_allowances', title: 'New Weekly Site Allowance' }
      ]
    },
    {
      id: 'treasury',
      icon: 'cashflow',
      label: '6. Treasury & FX',
      forms: [
        { id: 'treasury', label: 'Treasury / Loans / FX', badge: 'bhf_external', crKey: 'loans', title: 'New Treasury Entry' }
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
    const seed = (ctx && ctx.SEED) || window.MFG_SEED || {};
    const rec = getRecords(ctx);
    const sn = (((seed.sentinels || {}).fleet_fuel_overtime_auditor || {}).by_model || {})[companyName] || {};
    const coKey = companyName === 'BBConstruction' ? 'bbconstruction' : (companyName === 'Lions Transport' ? 'lionstransport' : 'wtc');
    const model = (seed.models && seed.models[coKey]) || {};
    const allKpi = (model.periods && model.periods.all) || {};

    let bought = sn.diesel_purchased_l != null ? Number(sn.diesel_purchased_l) : Number(allKpi.diesel_purchased || 0);
    let issued = sn.diesel_issued_l != null ? Number(sn.diesel_issued_l) : Number(allKpi.diesel_litres || 0);
    let sold = Number(allKpi.diesel_sold || 0);

    (rec.expenses || []).forEach(e => {
      if (e && e.source === 'app' && !e.voided && e.company === companyName && String(e.subcategory || '').toLowerCase() === 'diesel') {
        bought += Number(e.qty || 0);
      }
    });
    (rec.fuel_intakes || []).forEach(f => {
      if (f && f.source === 'app' && !f.voided && f.company === companyName && f.id !== excludeId && String(f.fuel_type || 'Diesel') === 'Diesel') {
        if (f.record_type === 'Bulk Purchase') bought += Number(f.litres || 0);
        else issued += Number(f.litres || 0);
      }
    });
    (rec.sales_tickets || []).forEach(t => {
      if (t && t.source === 'app' && !t.voided && t.company === companyName && t.id !== excludeId &&
          ['diesel', 'diesel trans'].includes(String(t.product || '').toLowerCase())) {
        sold += Number(t.qty || 0);
      }
    });

    const balance = bought - issued - sold;
    return { bought, issued, sold, balance };
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

    let pool = Math.max(0, Number(payAmount || 0));
    const vatOnly = method === 'VAT' || method === 'VATRent';
    const rowsHtml = tickets.slice(0, 12).map(t => {
      const due = vatOnly ? Number(t.vat || 0) : Number(t.total_ttc || t.total || 0);
      const alloc = Math.min(pool, Math.max(0, due));
      pool = round2(pool - alloc);
      const rem = round2(Math.max(0, due - alloc));
      const status = rem <= 0.005 && due > 0 ? 'SETTLED' : (alloc > 0 ? 'PARTIAL' : 'OPEN');
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
          <span>${tickets.length} Credit Tickets Found${pool > 0 ? ` · Unallocated Advance: ${fmtUsd(pool)}` : ''}</span>
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
    const legs = [];
    if (!legFilter || legFilter === 'all' || legFilter === 'material') {
      (rec.raw_purchases || []).forEach(r => {
        if (r && !r.voided && (!company || !r.company || r.company === company) && norm(r.site_owner) === sNorm && Number(r.cost || 0) > 0) {
          legs.push({ date: r.date, ref: `RAW #${r.ticket_no || '—'}`, leg: 'Leg 1 · Raw Material', detail: `${r.product || ''} @ ${r.site || ''}`, amount: Number(r.cost || 0) });
        }
      });
    }
    if (!legFilter || legFilter === 'all' || legFilter === 'haulage') {
      (rec.raw_purchases || []).forEach(r => {
        if (r && !r.voided && (!company || !r.company || r.company === company) && norm(r.truck_owner) === sNorm && Number(r.trans_cost || 0) > 0) {
          legs.push({ date: r.date, ref: `RAW #${r.ticket_no || '—'}`, leg: 'Leg 2 · Raw Haulage', detail: `${r.truck || ''} · ${r.product || ''}`, amount: Number(r.trans_cost || 0) });
        }
      });
      (rec.sales_tickets || []).forEach(t => {
        if (t && !t.voided && (!company || !t.company || t.company === company) && norm(t.truck_owner) === sNorm && Number(t.trans_cost || t.trans_price || 0) > 0) {
          legs.push({ date: t.date, ref: `TKT #${t.ticket_no || '—'}`, leg: 'Leg 2 · Sales Haulage', detail: `${t.customer || ''} @ ${t.site || ''}`, amount: Number(t.trans_cost || t.trans_price || 0) });
        }
      });
    }
    if (!legFilter || legFilter === 'all' || legFilter === 'expense') {
      (rec.expenses || []).forEach(e => {
        if (e && !e.voided && (!company || !e.company || e.company === company) && norm(e.supplier) === sNorm && String(e.method || '') === 'Credit' && Number(e.amount || 0) > 0) {
          legs.push({ date: e.date, ref: e.reference || `EXP ${String(e.date || '').slice(5, 10)}`, leg: 'Leg 3 · Credit Expense', detail: `${e.category || ''} · ${e.subcategory || ''}`, amount: Number(e.amount || 0) });
        }
      });
    }

    legs.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (!legs.length) {
      return `<div class="pa-subgrid-empty">No open payable rows in the current sample for <b>${esc(supplierName)}</b> — settlement posts against prior book AP balance / supplier advance.</div>`;
    }

    let pool = Math.max(0, Number(payAmount || 0));
    const rowsHtml = legs.slice(0, 12).map(l => {
      const alloc = Math.min(pool, Math.max(0, l.amount));
      pool = round2(pool - alloc);
      const rem = round2(Math.max(0, l.amount - alloc));
      const status = rem <= 0.005 ? 'SETTLED' : (alloc > 0 ? 'PARTIAL' : 'OPEN');
      const badgeCls = status === 'SETTLED' ? 'badge-ok' : (status === 'PARTIAL' ? 'badge-warn' : 'badge-brass');
      return `
        <tr>
          <td class="mono">${esc(String(l.date || '').slice(0, 10))}</td>
          <td class="mono"><b>${esc(l.ref)}</b></td>
          <td><span class="badge badge-info">${esc(l.leg)}</span></td>
          <td>${esc(l.detail)}</td>
          <td class="r">${fmtUsd(l.amount)}</td>
          <td class="r"><b>${alloc > 0 ? fmtUsd(alloc) : '—'}</b></td>
          <td class="r">${fmtUsd(rem)}</td>
          <td><span class="badge ${badgeCls}">${status}</span></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="pa-subgrid">
        <div class="pa-subgrid-hdr">
          <span>OPEN 3-LEG SUPPLIER PAYABLES · LIVE FIFO ALLOCATION PREVIEW</span>
          <span>${legs.length} Payable Legs Found${pool > 0 ? ` · Prepayment / Balance Relief: ${fmtUsd(pool)}` : ''}</span>
        </div>
        <div class="table-wrap" style="max-height:190px;overflow:auto">
          <table class="ledger-table">
            <thead>
              <tr><th>Date</th><th>Voucher</th><th>AP Leg</th><th>Description</th><th class="r">Leg Amount</th><th class="r">Allocated Now</th><th class="r">Remaining</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==================== MODAL GROUP & TAB BAR RENDERER ====================
  function renderModalTabsHtml(activeForm, canEnterFn, groupOverride) {
    const info = FORM_MAP[activeForm] || FORM_MAP.sales;
    const activeGroup = (groupOverride && FORM_GROUPS.find(g => g.id === groupOverride)) || FORM_GROUPS.find(g => g.id === info.groupId) || FORM_GROUPS[0];
    const extraQuarryTab = (activeGroup.id === 'raw' && (!canEnterFn || canEnterFn('pricerule')))
      ? `
          <button type="button" class="modal-tab ${groupOverride === 'raw' && activeForm === 'pricerule' ? 'active' : ''}" data-form="pricerule_raw">
            <span>Site &amp; Haulage Pricing</span>
          </button>
        `
      : '';
    return `
      <div class="pa-modal-groups">
        ${FORM_GROUPS.map(g => {
          const visibleForms = g.forms.filter(f => !canEnterFn || canEnterFn(f.id));
          if (!visibleForms.length) return '';
          return `<button type="button" class="pa-group-btn ${g.id === activeGroup.id ? 'active' : ''}" data-pa-group="${esc(g.id)}">${g.icon ? ic(g.icon) : ''}<span>${esc(g.label)}</span></button>`;
        }).join('')}
      </div>
      <div class="pa-modal-subtabs">
        ${activeGroup.forms.filter(f => !canEnterFn || canEnterFn(f.id)).map(f => `
          <button type="button" class="modal-tab ${!groupOverride && f.id === activeForm ? 'active' : ''}" data-form="${esc(f.id)}">
            <span>${esc(f.label)}</span>${f.universal ? '<span class="tbl-univ-tag">All BUs</span>' : ''}
          </button>
        `).join('')}${extraQuarryTab}
      </div>
    `;
  }

  // ==================== SECONDARY FORMS (GROUPS 2, 3, 4 — 18 FORMS) ====================
  function secHdr(title, sub) {
    return `<div class="pa-form-sec-hdr"><span>${title}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }
  function fld(label, inner, opts = {}) {
    const lockAttr = opts.lockField ? ` data-policy-lock="${esc(opts.lockField)}" data-lock-reason="${esc(opts.lockReason || 'Locked by business rule')}"` : '';
    const lockPill = opts.lockField ? `<span class="pa-lock-pill locked" data-lock-pill="${esc(opts.lockField)}" data-toggle-field-lock="${esc(opts.lockField)}" title="${esc(opts.lockReason || 'Locked by policy')}">${ic('lock')} LOCKED</span>` : '';
    return `<div class="form-field${opts.span ? ' span-3' : ''}${opts.cls ? ' ' + opts.cls : ''}${opts.lockField ? ' is-policy-locked' : ''}"${opts.id ? ` id="${opts.id}"` : ''}${lockAttr}${opts.hidden ? ' hidden' : ''}><label><span class="pa-fld-lbl">${label}</span>${lockPill}</label>${inner}${opts.afterHtml || ''}${opts.hint != null ? `<span class="hint"${opts.hintId ? ` id="${opts.hintId}"` : ''}>${opts.hint}</span>` : ''}</div>`;
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
    const prodNames = uniqSorted((rec.products || []).map(p => p.name), fIdx && fIdx.product);
    const prodByName = {};
    (rec.products || []).forEach(p => { if (p && p.name && !prodByName[p.name]) prodByName[p.name] = p; });
    const prodMetaItems = prodNames.map(n => {
      const p = prodByName[n];
      const u = (p && p.uom) || 'm³';
      const tf = p && Number(p.ton_factor) ? Number(p.ton_factor) : 0;
      return [n, u + (tf && tf !== 1 ? ` · ×${tf} t` : '')];
    });
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

    if (fType === 'pricerule') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${secHdr('1. Agreement Scope & Counterparty')}
          ${companyField}
          ${fld('Start Date *', inp('f_date', 'date', today))}
          ${fld('End Date', inp('f_enddate', 'date', ''))}
          ${fld('Rule Type *', sel('f_ruletype', [
            ['Sales (Delivery)', 'Sales (Delivery) — Customer + Site + Material/Trans'],
            ['Sales (Pickup)', 'Sales (Pickup) — Customer Material Price (Pick-up)'],
            ['List Price', 'List Price — Benchmark Product Price'],
            ['Commission', 'Commission — Per-Unit Plant Owner Fee (Product + Owner)'],
            ['Purchase Price (Site)', 'Purchase Price (Site) — Site Material Cost'],
            ['Transport Price (Site)', 'Transport Price (Site) — Site Haulage Rate'],
            ['Haulage (Customer Site)', 'Haulage (Customer Site) — 3P Delivery Hauler Rate']
          ], 'Sales (Delivery)'))}
          ${fld('Agreement Code / Name', inp('f_name', 'text', '', 'placeholder="Auto-named if blank"'))}
          ${fld('Product / Grade *', inp('f_product', 'text', '', 'list="dl_pr_prods" placeholder="Select or type grade..."') + dlMeta('dl_pr_prods', prodMetaItems))}
          ${fld('Customer (Sales Rules) *', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames), { id: 'wrap_pr_customer' })}
          ${fld('Supplier / Hauler *', inp('f_supplier', 'text', '', 'list="dl_suppliers" placeholder="Select or type supplier..."') + dl('dl_suppliers', supNames), { id: 'wrap_pr_supplier', hidden: true })}
          ${fld('Site / Destination', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type site..."') + dl('dl_sites', siteNames), { id: 'wrap_pr_site' })}
          ${secHdr('2. Unit Pricing, Client/Site Truck Size & Tier 1 / Tier 2 Adjustments')}
          ${fld('Priced Per Unit *', sel('f_uom', uoms, 'm³'))}
          ${fld('Material Unit Price ($) *', inp('f_unitprice', 'number', '0.00', 'step="0.01" min="0"'), { id: 'wrap_pr_matprice' })}
          ${fld('Transport Rate Per', sel('f_rateper', [['m³', 'Per m³'], ['Ton', 'Per Ton (× Ton Factor)'], ['Truck', 'Flat Per Truck Load']], 'm³'), { id: 'wrap_pr_transrate' })}
          ${fld('Transport Unit Price ($)', inp('f_transunitprice', 'number', '0.00', 'step="0.01" min="0"'), { id: 'wrap_pr_transprice' })}
          ${fld('Indifference Price ($)', inp('f_indiff', 'number', '', 'step="0.01" min="0" placeholder="Optional benchmark"'), { id: 'wrap_pr_indiff' })}
          ${fld('Client / Site Truck Size (m³)', inp('f_trucksize', 'number', '', 'step="0.5" min="0" placeholder="Optional — overrides truck m³ for client/site"'), { id: 'wrap_pr_trucksize', hintId: 'hint_pr_trucksize', hint: 'Optional: overrides truck capacity (m³) on matching Sales or Raw Material / Transport tickets.' })}
          ${fld('Target Truck Plate (Optional)', inp('f_pr_truck', 'text', '', 'list="dl_equip" placeholder="All trucks (or select specific truck)..."') + dl('dl_equip', equipNames), { id: 'wrap_pr_truck' })}
          ${fld('Tier 1 Truck Size (m³)', inp('f_qty1', 'number', '', 'step="0.5" min="0" placeholder="e.g. 14 or 20 m³"'), { id: 'wrap_pr_tier1' })}
          ${fld('Tier 1 Price Adj ($)', inp('f_adj1', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_adj1' })}
          ${fld('Tier 1 Trans Adj ($)', inp('f_transadj1', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_transadj1' })}
          ${fld('Tier 2 Truck Size (m³)', inp('f_qty2', 'number', '', 'step="0.5" min="0" placeholder="e.g. 22 or 25 m³"'), { id: 'wrap_pr_tier2', hidden: true })}
          ${fld('Tier 2 Price Adj ($)', inp('f_adj2', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_adj2', hidden: true })}
          ${fld('Tier 2 Trans Adj ($)', inp('f_transadj2', 'number', '0.00', 'step="0.01"'), { id: 'wrap_pr_transadj2', hidden: true })}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
        <div class="live-calc">
          <div><small>Base Material + Trans</small><b id="calc_mat">$0.00 / u</b></div>
          <div><small>Tier 1 Total per Load</small><b id="calc_tr">—</b></div>
          <div><small>Tier 2 Total per Load</small><b id="calc_vat">—</b></div>
          <div><small>Delivered Unit Price Total</small><b id="calc_total">$0.00</b></div>
        </div>
      `;
    }

    if (fType === 'vatinvoice') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          ${fld('Invoice Serial No. *', inp('f_ticketno', 'text', '', 'placeholder="e.g. VAT-2026-0412"'))}
          ${fld('Customer *', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames))}
          ${fld('Net Amount Ex-VAT ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'))}
          ${fld('VAT 11% ($)', inp('f_vat', 'number', '', 'step="0.01" min="0" readonly'), { id: 'wrap_f_vat', lockField: 'f_vat', lockReason: 'Locked to 11% Statutory Tax formula (Net HT × 11%)' })}
          ${fld('Payment Status', sel('f_status', [['Open', 'Open'], ['Settled', 'Settled'], ['Partial', 'Partial']], 'Open'))}
          ${fld('Notes', inp('f_notes', 'text', ''))}
        </div>
        <div class="live-calc">
          <div><small>Net HT</small><b id="calc_mat">$0.00</b></div>
          <div><small>11% VAT</small><b id="calc_vat">$0.00</b></div>
          <div><small>Total TTC</small><b id="calc_total">$0.00</b></div>
          <div><small>Tax Rate</small><b>11% Statutory VAT</b></div>
        </div>
      `;
    }

    if (fType === 'creditterm') {
      return `
        <div class="form-grid-3">
          ${companyField}
          ${fld('Effective Date *', inp('f_date', 'date', today))}
          ${fld('Customer *', inp('f_customer', 'text', '', 'list="dl_customers" placeholder="Select or type customer..."') + dl('dl_customers', custNames))}
          ${fld('Payment Days (Net Days) *', inp('f_days', 'number', '30', 'step="1" min="0"'))}
          ${fld('Credit Limit ($)', inp('f_amount', 'number', '25000', 'step="100" min="0"'))}
          ${fld('Notes', inp('f_notes', 'text', ''))}
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
          ${fld('Phone / Contact', inp('f_phone', 'tel', '', 'placeholder="+961 ..."'))}
          ${fld('Region / Address', inp('f_region', 'text', '', 'list="dl_regions" placeholder="Select or type region..."') + dl('dl_regions', regNames))}
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
          ${fld('Phone / Contact', inp('f_phone', 'tel', '', 'placeholder="+961 ..."'))}
          ${fld('Region / Location', inp('f_region', 'text', '', 'list="dl_regions" placeholder="Select or type region..."') + dl('dl_regions', regNames))}
          ${fld('Default Payment Method', sel('f_method', [['Credit', 'Credit'], ['Cash', 'Cash']], 'Credit'))}
          ${fld('MOF Tax Number', inp('f_mof', 'text', '', 'placeholder="Tax / MOF registration #"'))}
          <div class="form-field check-field"><input type="checkbox" id="f_iva"><label for="f_iva">IVA / VAT Registered (11% Input VAT)</label></div>
          <div class="form-field span-3" id="wrap_sup_drivers">
            ${secHdr('2. Hauler Fleet & Drivers (Auto-Enabled when Hauler / Truck Owner is Selected)')}
            <div class="pa-owner-drivers-panel">
              <div class="pa-owner-drivers-add">
                <div class="form-field">
                  <label for="f_sup_drv_name"><span class="pa-fld-lbl">Driver Full Name</span></label>
                  <input type="text" id="f_sup_drv_name" list="dl_drivers" placeholder="Enter driver name to link or add..." autocomplete="off">
                  ${dl('dl_drivers', driverNames)}
                </div>
                <div class="form-field">
                  <label for="f_sup_drv_phone"><span class="pa-fld-lbl">Driver Phone (Optional)</span></label>
                  <input type="text" id="f_sup_drv_phone" placeholder="+961 ..." autocomplete="off">
                </div>
                <div class="form-field">
                  <label for="f_sup_drv_truck"><span class="pa-fld-lbl">Default Truck Plate (Optional)</span></label>
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
          ${fld('Driver Full Name *', inp('f_driver', 'text', '', 'placeholder="Driver name"'))}
          ${fld('Default Truck Plate', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Select or type truck plate..."') + dl('dl_equip', equipNames))}
          ${fld('Truck Owner (Hauler Supplier)', inp('f_supplier', 'text', '', 'list="dl_suppliers" placeholder="Auto-filled from Truck Plate (or select hauler)..."') + dl('dl_suppliers', supNames), { id: 'wrap_drv_supplier' })}
          ${fld('Phone Number', inp('f_phone', 'text', '', 'placeholder="+961 ..."'))}
          <div class="form-field check-field"><input type="checkbox" id="f_iscompanydriver"><label for="f_iscompanydriver">Company Fleet Driver (WTC / BBC / Lions Payroll)</label></div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'salary') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          ${fld('Payroll Month *', inp('f_paymonth', 'month', today.slice(0, 7)))}
          ${fld('Staff / Driver Name *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff member..."') + dl('dl_staff', staffNames))}
          ${fld('Allocated Equipment (if Driver)', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Select or type equipment..."') + dl('dl_equip', equipNames))}
          ${fld('Payment Method *', sel('f_method', [['Cash', 'Cash'], ['Bank', 'Bank Transfer']], 'Cash'))}
          ${fld('USD Amount ($)', inp('f_usd', 'number', '', 'step="0.01" min="0" placeholder="0.00"'))}
          ${fld('LBP Amount (L.L.)', inp('f_lbp', 'number', '', 'step="1000" min="0" placeholder="0"'))}
          ${fld('Total USD Value (90k FX) *', inp('f_amount', 'number', '', 'step="0.01" readonly class="pa-locked-input"'), { id: 'wrap_f_amount', lockField: 'f_amount', lockReason: 'Locked to Dual-Currency FX formula (USD + LBP ÷ 90,000)' })}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'attendance') {
      return `
        <div class="form-grid-3">
          ${secHdr('1. Employee & Attendance Date', 'Select the employee to load their contract shift hours, hourly rate & overtime multiplier')}
          ${companyField}
          ${fld('Attendance Date *', inp('f_date', 'date', today), { hintId: 'hint_att_date', hint: '' })}
          ${fld('Staff Member *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff member..."') + dl('dl_staff', staffNames))}
          <div id="attStaffContractCard" class="att-contract-strip is-muted">
            <span>Select a <b>Staff Member</b> above to load their contract salary, daily shift hours &amp; overtime rate.</span>
          </div>

          ${secHdr('2. What Are You Recording?', 'Compared automatically against the selected employee contract shift; Leave & Half Day hide clock times')}
          <input type="hidden" id="f_att_mode" value="shift">
          <input type="hidden" id="f_status" value="Present">
          <input type="hidden" id="f_sched_hours" value="8">
          <div class="att-mode-deck" id="attModeDeck" role="tablist" aria-label="Attendance Entry Mode">
            <button type="button" class="att-mode-card active" data-att-mode="shift" role="tab" aria-selected="true">
              <span class="att-mode-card-top"><span>${ic('clock')} Worked Shift (In &amp; Out)</span></span>
              <span class="att-mode-card-sub">Log Time In &amp; Out · Overtime or Short/Late hours calculate from contract</span>
            </button>
            <button type="button" class="att-mode-card" data-att-mode="leave" role="tab" aria-selected="false">
              <span class="att-mode-card-top"><span>${ic('calendar')} Leave, Absence or Half Day</span></span>
              <span class="att-mode-card-sub">Half Day Off (0.5d), Full Absence (1d), Paid Vacation, or Sick Leave</span>
            </button>
            <button type="button" class="att-mode-card" data-att-mode="extra" role="tab" aria-selected="false">
              <span class="att-mode-card-top"><span>${ic('cashflow')} Extra Pay / Bonus</span></span>
              <span class="att-mode-card-sub">Extra shift bonus or payroll adjustment in USD ($) or LBP (LL)</span>
            </button>
          </div>

          <div class="att-subpanel" id="attShiftPanel">
            <div class="att-preset-bar" id="attPresetBar">
              <span class="att-preset-lbl">Shift Basis:</span>
              <button type="button" class="att-preset-pill active" id="attPresetRegularBtn" data-att-preset="regular">Regular Shift (Employee Contract)</button>
              <button type="button" class="att-preset-pill" data-att-preset="callout">Sunday / Call-Out (100% OT)</button>
              <button type="button" class="att-preset-pill" data-att-preset="noclock">Hours Only (No Clock)</button>
            </div>
            ${fld('Time In', inp('f_in', 'time', '08:00'), { id: 'wrap_f_in' })}
            ${fld('Time Out', inp('f_out', 'time', '16:00'), { id: 'wrap_f_out', hintId: 'hint_att_out', hint: '' })}
            ${fld('Actual Work Hours', inp('f_worked_hours', 'number', '8', 'step="0.5" min="0" readonly class="pa-locked-input"'), { id: 'wrap_f_worked_hours', hintId: 'hint_att_worked', hint: 'Calculated from Time In & Time Out' })}
            <div class="att-variance-grid">
              ${fld('Overtime Hours (+)', inp('f_hours', 'number', '0', 'step="0.5" min="0"'), { id: 'wrap_f_hours', hintId: 'hint_att_ot', hint: 'Auto-calculated above employee contract shift (editable)' })}
              ${fld('Short / Late Hours (−)', inp('f_late_hours', 'number', '0', 'step="0.5" min="0"'), { id: 'wrap_f_late_hours', hintId: 'hint_att_late', hint: 'Auto-calculated below employee contract shift (editable)' })}
            </div>
          </div>

          <div class="att-subpanel" id="attLeavePanel" hidden>
            <div class="att-preset-bar" id="attLeavePresetBar">
              <span class="att-preset-lbl">Leave Type:</span>
              <button type="button" class="att-preset-pill active" data-att-leave="Half Day">Half Day Off (0.5d)</button>
              <button type="button" class="att-preset-pill" data-att-leave="Absence">Full Day Absence (1.0d)</button>
              <button type="button" class="att-preset-pill" data-att-leave="VacAbsence">Paid Vacation</button>
              <button type="button" class="att-preset-pill" data-att-leave="Sick Leave">Sick Leave</button>
            </div>
            <input type="hidden" id="f_leave_type" value="Half Day">
            ${fld('Leave Duration (Days) *', inp('f_leave_days', 'number', '0.5', 'step="0.5" min="0.5"'), { hintId: 'hint_att_leave_days', hint: '0.5 = Half Day · 1.0 = Full Day · 2+ = Multi-Day' })}
            ${fld('Pay Treatment *', sel('f_leave_pay', [
              ['unpaid', 'Unpaid (Deduct from Monthly Salary)'],
              ['paid', 'Paid (Keep Full Monthly Salary)']
            ], 'unpaid'), { span2: true, hintId: 'hint_att_leave_pay', hint: '' })}
          </div>

          <div class="att-subpanel" id="attExtraPanel" hidden>
            ${fld('Bonus / Extra USD ($)', inp('f_extra_usd', 'number', '', 'step="0.01" placeholder="0.00"'))}
            ${fld('Bonus / Extra LBP (L.L.)', inp('f_extra_lbp', 'number', '', 'step="1000" placeholder="0"'))}
            ${fld('Total USD Equivalent ($)', inp('f_extra_total', 'number', '0.00', 'step="0.01" readonly class="pa-locked-input"'), { hint: 'USD + LBP ÷ 89,500' })}
          </div>

          ${fld('Notes', inp('f_notes', 'text', '', 'placeholder="Optional reason, Sunday shift note, site, or approval remark..."'), { span: true })}
        </div>
        <div class="live-calc" id="attLiveCalc">
          <div><small>Auto-Classification</small><b id="calc_att_type">Full Shift (On Time)</b></div>
          <div><small>Shift / Duration Math</small><b id="calc_att_math">08:00 to 16:00 = 8.0h</b></div>
          <div><small>Contract Rate Basis</small><b id="calc_att_rate">Select Staff Member</b></div>
          <div><small>Est. Payroll Impact</small><b id="calc_att_impact">$0.00 (Standard Shift)</b></div>
        </div>
      `;
    }

    if (fType === 'freelance' || fType === 'employment') {
      const isContract = fType === 'employment';
      return `
        <div class="form-grid-3">
          ${companyField}
          ${fld(isContract ? 'Start Date *' : 'Work Date *', inp('f_date', 'date', today))}
          ${fld('Staff / Worker Name *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff / worker..."') + dl('dl_staff', staffNames))}
          ${fld('Role / Trade *', inp('f_role', 'text', '', 'list="dl_roles" placeholder="Select or type role / trade..."') + dl('dl_roles', roleNames))}
          ${fld('Pay Basis', sel('f_paytype', isContract ? [['Monthly', 'Monthly Salary'], ['Daily', 'Daily Wage']] : [['Daily', 'Daily Freelance Rate'], ['Lump Sum', 'Task Lump Sum']], isContract ? 'Monthly' : 'Daily'))}
          ${fld(isContract ? 'Agreed Base Salary ($) *' : 'Amount ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'))}
          ${fld('Assigned Equipment / Site', inp('f_truck', 'text', '', 'list="dl_equip" placeholder="Select or type equipment..."') + dl('dl_equip', equipNames))}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'logistics') {
      return `
        ${adminHeaderHtml}
        <div class="form-grid-3">
          ${companyField}
          ${lockedDateField('Transaction Date *')}
          ${collapsibleRepDateField()}
          ${fld('Staff / Driver *', inp('f_staff', 'text', '', 'list="dl_staff" placeholder="Select or type staff / driver..."') + dl('dl_staff', staffNames))}
          ${fld('Site', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type site..."') + dl('dl_sites', siteNames))}
          ${fld('USD Allowance ($)', inp('f_usd', 'number', '', 'step="0.01" min="0"'))}
          ${fld('LBP Allowance (L.L.)', inp('f_lbp', 'number', '', 'step="1000" min="0"'))}
          ${fld('Total USD Value *', inp('f_amount', 'number', '', 'step="0.01" readonly class="pa-locked-input"'), { id: 'wrap_f_amount', lockField: 'f_amount', lockReason: 'Locked to Dual-Currency FX formula (USD + LBP ÷ 90,000)' })}
          <div class="form-field span-3" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding-top:4px">
            <strong style="font-size:12px">Days Worked:</strong>
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" id="f_day_${d.toLowerCase()}" ${i < 6 ? 'checked' : ''}> ${d}</label>`).join('')}
          </div>
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
        </div>
      `;
    }

    if (fType === 'triprate') {
      return `
        <div class="form-grid-3">
          ${companyField}
          ${fld('Effective From *', inp('f_date', 'date', today))}
          ${fld('Route / Rate Name *', inp('f_name', 'text', '', 'placeholder="e.g. WTC Site → Beirut Night Trip"'))}
          ${fld('Site / Destination *', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type destination site..."') + dl('dl_sites', siteNames))}
          ${fld('Equipment Category', sel('f_category', [['Truck', 'Dump Truck'], ['Mixer', 'Mixer'], ['All', 'All Fleet Units']], 'Truck'))}
          ${fld('Overtime Bonus per Trip ($) *', inp('f_amount', 'number', '10.00', 'step="0.50" min="0"'))}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
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
          ${fld('Counterparty / Partner / Account *', inp('f_counterparty', 'text', '', 'list="dl_counterparties" placeholder="Select or type partner, bank, or entity..."') + dl('dl_counterparties', counterpartyNames), { id: 'wrap_tr_cp' })}
          ${fld('Direction / Leg *', sel('f_direction', [['Inflow', 'Cash Inflow / Borrowed'], ['Outflow', 'Cash Outflow / Repaid']], 'Inflow'), { id: 'wrap_tr_dir' })}
          ${fld('Conversion Direction *', sel('f_conv_dir', [
            ['USD to LBP', 'USD → LBP (USD Decreases · LBP Increases)'],
            ['LBP to USD', 'LBP → USD (LBP Decreases · USD Increases)']
          ], 'USD to LBP'), { id: 'wrap_conv_dir', hidden: true })}
          ${fld('Exchange Rate (LL / $)', inp('f_fxrate', 'number', '89500', 'step="10" min="1"'), { id: 'wrap_conv_rate', hidden: true })}
          ${fld('USD Amount ($)', inp('f_usd', 'number', '', 'step="0.01" min="0"'), { id: 'wrap_tr_usd' })}
          ${fld('LBP Amount (L.L.)', inp('f_lbp', 'number', '', 'step="1000" min="0"'), { id: 'wrap_tr_lbp' })}
          ${fld('Total USD Value *', inp('f_amount', 'number', '', 'step="0.01" readonly class="pa-locked-input"'), { id: 'wrap_f_amount', lockField: 'f_amount', lockReason: 'Locked to Dual-Currency FX formula (USD + LBP ÷ 90,000)' })}
          ${fld('Reference / Voucher', inp('f_reference', 'text', ''))}
          ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
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
        ${fld('JV Site *', inp('f_site', 'text', '', 'list="dl_sites" placeholder="Select or type JV site..."') + dl('dl_sites', siteNames))}
        ${fld('JV Partner *', inp('f_counterparty', 'text', '', 'list="dl_suppliers" placeholder="Select or type JV partner..."') + dl('dl_suppliers', supNames))}
        ${fld('Partner Share (%)', inp('f_share', 'number', '50', 'step="0.5" min="0" max="100"'), { id: 'wrap_jv_share', hidden: true })}
        ${fld('Distribution Amount ($) *', inp('f_amount', 'number', '', 'step="0.01" min="0"'), { id: 'wrap_jv_amount' })}
        ${fld('Notes', inp('f_notes', 'text', ''), { span: true })}
      </div>
    `;
  }

  // ==================== PUBLIC API MOUNT ====================
  window.MFG_FORMS = {
    FX_RATE,
    VAT_RATE,
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
