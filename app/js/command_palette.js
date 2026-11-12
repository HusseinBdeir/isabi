/* ==========================================================================
   ISABI Systems · Global Search & Command Palette (js/command_palette.js)
   Deterministic 0ms search across 6 industries: Tables, Forms, Dashboards,
   Statements (01..27), Hubs, Named Records & Exact Ticket/Reference Numbers.
   Strictly obeys Hard Rule 11 (exact.concat(freqOrdered)), Hard Rule 14
   (EN | عربي | FR aliases & UI), Hard Rule 15 (deterministic search, Ask ISABI
   handoff on no match), and full seat/company/book_scope RLS.
   ========================================================================== */
(function () {
  'use strict';

  let _ctx = null;
  let _isOpen = false;
  let _activeIdx = 0;
  let _catFilter = 'all';
  let _currentItems = [];
  let _currentQuery = '';
  let _cachedIndex = null;
  let _cachedIndexKey = '';

  // Tab-to-Filter: a highlighted table result becomes an inline chip, the typed text becomes that table's filter
  let _filterTarget = null;
  let _filterPrevQuery = '';
  let _filterIndexRef = null;
  const FILTER_SUGGEST_LIMIT = 12;
  const FILTER_FACET_SKIP_KEY_RE = /^(id|notes|company|companies_list|bu|voided)$|date|(^|_)(time|at)$/i;
  const FILTER_FACET_REF_KEY_RE = /plate|truck|equipment|serial|vin|chassis|code|ref|ticket|invoice|voucher|doc_no|_no$/i;
  const FILTER_FACET_SERIAL_KEY_RE = /ticket|invoice|voucher|doc_no|reference|^ref$|_ref$/i;
  const FILTER_SVG ='<svg class="ic" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 5h16.8l-6.5 7.7v5.5l-3.8 1.9v-7.4z"/></svg>';

  const FREQ_STORAGE_PREFIX = 'isabi_cmdp_freq_v1::';

  const MFG_ONLY_TABLES = new Set([
    'sales_tickets', 'raw_purchases', 'vat_invoices',
    'fuel_intakes', 'fuel_malfunctions', 'equipment_defects', 'equipment_repairs',
    'repair_items', 'equipment_oil_logs', 'part_movements', 'warehouse_movements',
    'jv_partnerships', 'jv_distributions', 'price_rules', 'overtime_rates',
    'freelance_entries', 'logistics_allowances', 'products', 'product_types',
    'sites', 'equipment', 'company_equipment', 'drivers', 'company_drivers',
    'staff_assignments'
  ]);

  const MFG_ONLY_FORMS = new Set([
    'sales', 'raw', 'vatinvoice', 'pricerule', 'fuel', 'malfunction',
    'companyequipment', 'defect', 'repair', 'oillog', 'partlog', 'triprate',
    'warehousestock', 'jv', 'freelance', 'logistics', 'product'
  ]);

  const RDL_VERTICAL_INDUSTRY = {
    '23': 'Holding & Treasury',
    '24': 'Hospitality & Resorts',
    '25': 'Automotive & Heavy Trading',
    '26': 'Real Estate & Property',
    '27': 'Insurance & Brokerage'
  };

  const DOMAIN_TABLES_BY_IND = {
    'Holding & Treasury': [
      { key: 'hld_entities_tbl', domKey: 'hld_interactions', label: '14-Entity Group Scorecard', view: 'hld_entities', panelId: 'hldEntitiesScorecardPanel', noFilter: true },
      { key: 'hld_open_ic_tbl', domKey: 'hld_interactions', label: 'Intercompany Repayment Ledger', view: 'hld_open_recon', panelId: 'hldOpenReconPanel' },
      { key: 'hld_pairs_tbl', domKey: 'hld_interactions', label: 'Sister Pair Matrix', view: 'hld_due_matrix', panelId: 'hldDueMatrixPanel', noFilter: true },
      { key: 'hld_partners_tbl', domKey: 'hld_partners', label: 'Partner Splits & Agreements', view: 'hld_partners', panelId: 'hldPartnerChronoPanel' },
      { key: 'hld_extended_tbl', domKey: 'external_movements', label: 'Extended Stakeholder Ledger', view: 'hld_extended', panelId: 'hldExtendedEntriesPanel' },
      { key: 'hld_loans_tbl', domKey: 'hld_loans', label: 'Facility Rate Schedules', view: 'hld_loans', panelId: 'hldFacilitySchedulesPanel' }
    ],
    'Hospitality & Resorts': [
      { key: 'hsp_rev_tbl', domKey: 'hsp_revenue', label: 'Venue Revenue & Chalet Closes', view: 'hsp_revenue', panelId: 'hspRevenuePanel' },
      { key: 'hsp_memb_tbl', domKey: 'hsp_memberships', label: 'Seasonal Memberships & Arrears', view: 'hsp_memberships', panelId: 'hspMembershipsPanel' },
      { key: 'hsp_tariffs_tbl', domKey: 'hsp_tariffs', label: 'Seasonal Tariff Schedules', view: 'hsp_memberships', panelId: 'hspTariffsPanel' },
      { key: 'hsp_stock_tbl', domKey: 'hsp_stock', label: 'Cellar, Kitchen & Recipe BOM', view: 'hsp_stock', panelId: 'hspStockPanel' },
      { key: 'hsp_gen_tbl', domKey: 'hsp_energy', label: 'Generators, Diesel & Solar Logs', view: 'hsp_energy', panelId: 'hspEnergyPanel' }
    ],
    'Automotive & Heavy Trading': [
      { key: 'trd_inv_tbl', domKey: 'trd_sales', label: 'Sales Invoices & Books', view: 'trd_sales', panelId: 'trdSalesPanel' },
      { key: 'trd_tgt_tbl', domKey: 'trd_targets', label: 'Price Lists & Tariffs', view: 'trd_targets', panelId: 'trdTargetsPanel' },
      { key: 'trd_imp_tbl', domKey: 'trd_imports', label: 'Imports & Landed Cost', view: 'trd_purchases', panelId: 'trdPurchasesPanel' },
      { key: 'trd_vin_tbl', domKey: 'trd_trucks', label: 'Showroom Serial Units (VINs)', view: 'trd_trucks', panelId: 'trdTrucksPanel' },
      { key: 'trd_wh_tbl', domKey: 'trd_parts', label: '5-Warehouse Spare Parts', view: 'trd_stock', panelId: 'trdStockPanel' }
    ],
    'Real Estate & Property': [
      { key: 're_leases_tbl', domKey: 're_leases', label: 'Active Leases & Rent Roll', view: 're_leases' },
      { key: 're_prop_tbl', domKey: 're_units', label: 'Properties & /2400 Mulk Shares', view: 're_properties' },
      { key: 're_sales_tbl', domKey: 're_leases', label: 'Property Sales & Instalments', view: 're_sales' },
      { key: 're_wo_tbl', domKey: 're_maintenance', label: 'Fit-Out Work Orders & Recharges', view: 're_workorders' }
    ],
    'Insurance & Brokerage': [
      { key: 'ins_pol_tbl', domKey: 'ins_policies', label: 'Live Policies & Discounts', view: 'ins_policies' },
      { key: 'ins_ren_tbl', domKey: 'ins_policies', label: '30/60/90-Day Renewal Queue', view: 'ins_renewals' },
      { key: 'ins_stm_tbl', domKey: 'ins_statements', label: 'Carrier Statement Recon', view: 'ins_statements' },
      { key: 'ins_clm_tbl', domKey: 'ins_claims', label: 'Claims & Recovery Register', view: 'ins_claims' }
    ]
  };

  // Canonical sidebar hub/sub-tab & workspace panel target for all 53 TABLE_CATALOG registers
  const SIDEBAR_TABLE_TARGET_MAP = {
    sales_tickets: { view: 'sales', panelId: 'salesPanel' },
    receipts: {
      view: 'customers',
      panelId: 'rcptPanel',
      byInd: {
        'Automotive & Heavy Trading': { view: 'trd_receivables', panelId: 'trdReceivablesPanel' },
        'Real Estate & Property': { view: 're_receipts' },
        'Insurance & Brokerage': { view: 'ins_billing' },
        'Hospitality & Resorts': { view: 'hsp_memberships', panelId: 'hspMembershipsPanel' },
        'Holding & Treasury': {
          view: 'hld_open_recon',
          panelId: 'hldOpenReconPanel',
          fallbackView: 'reg_customers',
          fallbackPanelId: 'connTableExplorerCard',
          fallbackUnivRegKey: 'customers',
          fallbackUnivConnTableKey: 'receipts'
        }
      }
    },
    credit_terms: {
      view: 'reg_customers',
      panelId: 'connTableExplorerCard',
      univRegKey: 'customers',
      univConnTableKey: 'credit_terms'
    },
    vat_invoices: { view: 'customers', panelId: 'vatInvPanel' },
    price_rules: { view: 'pricing', panelId: 'pricingPanel' },
    raw_purchases: { view: 'raw', panelId: 'rawPanel' },
    jv_partnerships: { view: 'raw_jv', panelId: 'jvPartPanel' },
    jv_distributions: { view: 'raw_jv', panelId: 'jvDistPanel' },
    expenses: { view: 'expenses', panelId: 'expPanel' },
    expense_items: { view: 'expenses', panelId: 'expItemsTicketPanel' },
    recurring_expenses: { view: 'recurring_expenses', panelId: 'recurringExpPanel' },
    documents: {
      view: 'documents',
      panelId: 'documentsPanel',
      facetCols: ['name', 'doc_type', 'title', 'counterparty', 'reference', 'parent_label', 'file_name', 'status']
    },
    settlements: { view: 'suppliers', panelId: 'settlePanel' },
    warehouse_movements: { view: 'warehouse', panelId: 'warehouseMovesPanel' },
    repair_items: { view: 'warehouse_parts', panelId: 'whRepairPartsPanel' },
    fuel_intakes: { view: 'fleet', panelId: 'fuelPanel' },
    fuel_malfunctions: { view: 'fleet', panelId: 'malfunctionsRegPanel' },
    company_equipment: { view: 'fleet_equip', panelId: 'coFleetAssignPanel' },
    equipment_defects: { view: 'fleet_maint', panelId: 'defectsPanel' },
    equipment_repairs: { view: 'fleet_maint', panelId: 'repairsPanel' },
    equipment_oil_logs: { view: 'fleet_maint', panelId: 'oilSchedulePanel' },
    part_movements: { view: 'fleet_maint', panelId: 'partsLifecyclePanel' },
    company_drivers: { view: 'fleet_drivers', panelId: 'coDriversPanel' },
    overtime_rates: { view: 'fleet_drivers', panelId: 'otRatesPanel' },
    salaries: { view: 'payroll', panelId: 'paySalPanel' },
    attendance: { view: 'payroll_attendance', panelId: 'payAttPanel' },
    work_shifts: { view: 'payroll_attendance', panelId: 'payShiftTimingsPanel' },
    logistics_allowances: { view: 'payroll_allowances', panelId: 'payLogPanel' },
    employments: { view: 'payroll_contracts', panelId: 'payEmpPanel' },
    staff_assignments: { view: 'payroll_contracts', panelId: 'payRoleEquipLogPanel' },
    freelance_entries: { view: 'payroll_contracts', panelId: 'payFreelancePanel' },
    external_movements: { view: 'external', panelId: 'extEntriesPanel' },
    loans: { view: 'ledger_treasury', panelId: 'treasuryLoansPanel' },
    loan_settlements: { view: 'ledger_treasury', panelId: 'treasuryExtPanel' },
    conversions: { view: 'conversions', panelId: 'fxConversionsPanel' },
    gl_accounts: { view: 'gl_automation', panelId: 'glAutoPanel' },
    customers: { view: 'reg_customers', panelId: 'univRegPanel', univRegKey: 'customers' },
    suppliers: { view: 'reg_suppliers', panelId: 'univRegPanel', univRegKey: 'suppliers' },
    sites: { view: 'reg_sites', panelId: 'sitesRegPanel' },
    regions: { view: 'reg_regions', panelId: 'regionsRegPanel', searchKey: 'regionsSearch' },
    products: { view: 'reg_products', panelId: 'univRegPanel', univRegKey: 'products' },
    product_types: { view: 'reg_products', panelId: 'univRegPanel', univRegKey: 'product_types' },
    items: { view: 'reg_items', panelId: 'univRegPanel', univRegKey: 'items' },
    uoms: { view: 'reg_items', mfgView: 'reg_products', panelId: 'univRegPanel', univRegKey: 'uoms' },
    expense_categories: { view: 'reg_categories', panelId: 'univRegPanel', univRegKey: 'expense_categories' },
    expense_subcategories: { view: 'reg_categories', panelId: 'univRegPanel', univRegKey: 'expense_subcategories' },
    equipment: { view: 'reg_equipment', panelId: 'univRegPanel', univRegKey: 'equipment' },
    drivers: { view: 'reg_drivers', panelId: 'univRegPanel', univRegKey: 'drivers' },
    staff_members: { view: 'reg_staff', panelId: 'univRegPanel', univRegKey: 'staff_members' },
    staff_roles: { view: 'reg_roles', panelId: 'univRegPanel', univRegKey: 'staff_roles' },
    fx_rates: { view: 'reg_fx_rates', panelId: 'univRegPanel', univRegKey: 'fx_rates' },
    currencies: { view: 'reg_currencies', panelId: 'univRegPanel', univRegKey: 'currencies' },
    vat_rates: { view: 'reg_vat_rates', panelId: 'univRegPanel', univRegKey: 'vat_rates' }
  };

  let _panelFlashTimer = null;
  let _panelFocusRaf = 0;

  function lookupHubInfoForView(viewId) {
    const hubs = (_ctx && Array.isArray(_ctx.HUB_CATALOG)) ? _ctx.HUB_CATALOG : [];
    const icMap = (typeof window !== 'undefined' && window.MFG_ICONS && window.MFG_ICONS.ICONS) ? window.MFG_ICONS.ICONS : null;
    for (let i = 0; i < hubs.length; i++) {
      const h = hubs[i];
      if (!h || h.group === 'system') continue;
      const tabs = Array.isArray(h.tabs) ? h.tabs : [];
      for (let j = 0; j < tabs.length; j++) {
        const t = tabs[j];
        if (!t) continue;
        if (t.view === viewId || (Array.isArray(t.match) && t.match.includes(viewId))) {
          const resolvedIcon = icMap
            ? ((t.icon && icMap[t.icon]) ? t.icon : ((h.id && icMap[h.id]) ? h.id : 'tables'))
            : (t.icon || h.id || 'tables');
          return {
            hubId: h.id || '',
            hubTitle: String(h.title || h.label || '').trim(),
            tabTitle: String(t.label || '').trim(),
            icon: resolvedIcon
          };
        }
      }
    }
    return { hubId: '', hubTitle: '', tabTitle: '', icon: 'tables' };
  }

  function resolveSidebarTableTarget(tableKey, isMfgOnly, pctx) {
    const base = SIDEBAR_TABLE_TARGET_MAP[tableKey];
    if (!base) return null;
    const u = pctx && pctx.user;
    if (base.mfgView) {
      const canBaseView = Boolean(_ctx && _ctx.canViewView && _ctx.canViewView(base.view, u));
      const canMfgView = Boolean(_ctx && _ctx.canViewView && _ctx.canViewView(base.mfgView, u));
      const useMfg = canMfgView && ((pctx && pctx.activeInd === 'Manufacturing') || !canBaseView);
      return {
        view: useMfg ? base.mfgView : base.view,
        panelId: base.panelId || '',
        univRegKey: base.univRegKey || '',
        univConnTableKey: base.univConnTableKey || '',
        forceInd: ''
      };
    }
    if (!isMfgOnly && base.byInd && pctx && pctx.activeInd !== 'Manufacturing') {
      const indSpec = base.byInd[pctx.activeInd];
      if (indSpec) {
        if (
          _ctx && _ctx.canViewView &&
          !_ctx.canViewView(indSpec.view, u) &&
          indSpec.fallbackView &&
          _ctx.canViewView(indSpec.fallbackView, u)
        ) {
          return {
            view: indSpec.fallbackView,
            panelId: indSpec.fallbackPanelId || '',
            univRegKey: indSpec.fallbackUnivRegKey || '',
            univConnTableKey: indSpec.fallbackUnivConnTableKey || '',
            forceInd: ''
          };
        }
        return {
          view: indSpec.view,
          panelId: indSpec.panelId || '',
          univRegKey: indSpec.univRegKey || '',
          univConnTableKey: indSpec.univConnTableKey || '',
          forceInd: ''
        };
      }
    }
    return {
      view: base.view,
      panelId: base.panelId || '',
      univRegKey: base.univRegKey || '',
      univConnTableKey: base.univConnTableKey || '',
      forceInd: isMfgOnly ? 'Manufacturing' : ''
    };
  }

  function focusWorkspaceTablePanel(panelId, fallbackKey) {
    if (typeof document === 'undefined') return;
    if (_panelFocusRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(_panelFocusRaf);
      _panelFocusRaf = 0;
    }
    const expectedView = (_ctx && _ctx.STATE) ? _ctx.STATE.view : '';
    const applyFocus = () => {
      const ws = document.getElementById('workspace');
      if (!ws) return;
      let panelEl = panelId ? document.getElementById(panelId) : null;
      if (!panelEl && fallbackKey) {
        const rowHit = ws.querySelector(`[data-rkey="${fallbackKey}"], [data-ind-row-tbl="${fallbackKey}"]`);
        if (rowHit && typeof rowHit.closest === 'function') {
          panelEl = rowHit.closest('.conn-table-explorer-card, .panel-card, .panel, section');
        }
      }
      if (!panelEl) {
        const candidates = ws.querySelectorAll('.panel-card, .panel');
        for (let i = 0; i < candidates.length; i++) {
          if (candidates[i].querySelector('.table-wrap, table')) {
            panelEl = candidates[i];
            break;
          }
        }
      }
      if (!panelEl) return;

      const wsRect = ws.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();
      const thresholdPx = Math.min(240, Math.max(96, wsRect.height * 0.34));
      const deltaTop = panelRect.top - wsRect.top;
      if (deltaTop > thresholdPx || deltaTop < -8) {
        const targetScroll = Math.max(0, Math.round(ws.scrollTop + deltaTop - 12));
        if (Math.abs(ws.scrollTop - targetScroll) > 4) {
          ws.scrollTop = targetScroll;
        }
      }

      ws.querySelectorAll('.cmdp-panel-target-flash').forEach(el => {
        if (el !== panelEl) el.classList.remove('cmdp-panel-target-flash');
      });
      panelEl.classList.remove('cmdp-panel-target-flash');
      void panelEl.offsetWidth;
      panelEl.classList.add('cmdp-panel-target-flash');
      if (_panelFlashTimer) clearTimeout(_panelFlashTimer);
      _panelFlashTimer = setTimeout(() => {
        panelEl.classList.remove('cmdp-panel-target-flash');
        _panelFlashTimer = null;
      }, 1500);
    };

    applyFocus();
    if (typeof requestAnimationFrame === 'function') {
      _panelFocusRaf = requestAnimationFrame(() => {
        _panelFocusRaf = 0;
        if (_ctx && _ctx.STATE && expectedView && _ctx.STATE.view !== expectedView) return;
        applyFocus();
      });
    }
  }

  // Curated everyday words (EN + AR + FR + Lebanese operational terms) across all 6 industries
  const TABLE_ALIASES = {
    sales_tickets: 'invoice invoices billing bill delivery load weighbridge pad bon bons vente livraison facture مبيعات فاتورة فواتير بون تسليم نقلة شحنة زبائن',
    receipts: 'collection collections payment received cash in customer payment ar receipt voucher encaissement reçu client تحصيل قبض سند قبض دفعة زبون ذمم مدينة',
    vat_invoices: 'tax invoice iva official invoice 11% fiscal facture tva fiscale فاتورة ضريبية ضريبة القيمة المضافة رسمية',
    price_rules: 'pricing tariff discount commission agreement rate card deal prix tarif accord remise اتفاقية أسعار تسعير عمولة حسومات',
    credit_terms: 'payment terms credit limit due days plafond crédit délai paiement شروط الدفع سقف ائتمان مهلة سداد',
    raw_purchases: 'quarry haulage gravel sand aggregate purchase intake supplier ticket achat matière première carrière gravier sable مشتريات مواد أولية كسارة رمل بحص نقليات بون شراء',
    expenses: 'bill bills cost overhead opex voucher purchase petty cash dépense charge frais facture fournisseur مصروف مصاريف نفقة فاتورة مورد كلفة',
    expense_items: 'line items bill lines invoice lines articles dépense détail facture بنود المصاريف تفاصيل الفاتورة أصناف',
    recurring_expenses: 'rent subscription monthly bill fixed cost lease standing order loyer abonnement charge fixe مصاريف دورية إيجار ايجار اشتراك شهري ثابت',
    warehouse_movements: 'inventory stock in stock out shelf issue transfer mouvement stock magasin entrée sortie حركة المخزون مستودع إدخال إخراج جرد',
    settlements: 'supplier payment pay bill ap disbursement vendor payment règlement fournisseur décaissement تسديد مورد دفعة مورد سند صرف ذمم دائنة',
    jv_partnerships: 'joint venture 50 50 quarry partner co-venture partenariat carrière شريك شراكة محاصة كسارة',
    jv_distributions: 'partner payout profit split share dividend distribution bénéfice توزيع أرباح حصة شريك',
    documents: 'attachments scans receipts photos pdf files archive vault pièces jointes justificatifs مستندات إيصالات صور مرفقات أرشيف',
    fuel_intakes: 'diesel mazout petrol gasoil tank refill litres pump carburant plein citerne مازوت محروقات ديزل تعبئة خزان وقود ليتر',
    fuel_malfunctions: 'meter discrepancy fuel loss leak variance tank audit anomalie compteur écart carburant عطل عداد فرق مخزون نقص مازوت تسرب',
    company_equipment: 'fleet assignment truck company allocation affectation camion flotte تخصيص آليات شاحنات الشركة',
    equipment_defects: 'breakdown warning fault issue check engine panne alerte défaut camion عطل تحذير خلل شاحنة آلية',
    equipment_repairs: 'workshop maintenance mechanic fix garage overhaul réparation atelier entretien صيانة تصليح ورشة ميكانيك كراج',
    repair_items: 'spare parts used workshop parts pièces utilisées réparation قطع غيار مستعملة قطع تصليح',
    equipment_oil_logs: 'oil change grease filter service interval lube vidange huile graisse filtre غيار زيت تشحيم فلتر صيانة دورية',
    part_movements: 'tire battery serial custody removed part pneu batterie pièce remplacée تبديل قطع إطارات دواليب بطارية عهدة',
    company_drivers: 'driver assignment chauffeur roster affectation chauffeur توزيع السائقين شوفير',
    overtime_rates: 'trip rate bonus per load tariff prime voyage heures sup تعرفة النقلة بدل ساعات إضافية',
    salaries: 'payroll wage wages pay slip bonus salary disbursement salaire paie rémunération راتب رواتب معاش معاشات أجور دفعة راتب',
    attendance: 'clock in clock out timesheet shift lateness overtime absence pointage présence retard heures sup حضور دوام بصمة تأخير غياب ساعات إضافية',
    work_shifts: 'shift schedule working hours roster horaire équipe poste أوقات الدوام شفت جدول العمل',
    employments: 'contract hr hiring employee terms salary rate contrat travail embauche عقد عمل توظيف موظفين راتب أساسي',
    staff_assignments: 'operator truck assignment role history poste affectation employé مهام الموظفين تعيين آلية',
    freelance_entries: 'daily worker casual labor contractor day rate journalier pigiste عمال مياومة عمل حر يومية',
    logistics_allowances: 'transport allowance commute bus taxi indemnité transport بدل نقل مواصلات انتقال',
    external_movements: 'owner cash injection withdrawal external treasury extended stakeholder owes difference took gave apport retrait externe حركة خارجية ممتد ذمم الشركاء سحب إيداع صندوق خارجي',
    loans: 'debt bank loan partner advance borrowing facility prêt emprunt avance associé قرض قروض سلفة شريك تسهيلات مصرفية دين',
    loan_settlements: 'loan repayment installment drawdown interés remboursement prêt échéance tirage سداد قرض قسط سحب دفعة قرض',
    conversions: 'currency exchange usd lbp lira dollar fx change devise taux livre تغذية صيرفة تحويل عملة دولار ليرة',
    customers: 'client clients buyer account debtor حسابات الزبائن زبون زبائن عميل عملاء المشتري client acheteur',
    suppliers: 'vendor vendors hauler contractor creditor مورد موردين متعهد ناقل fournisseur transporteur prestataire',
    products: 'material aggregate sand gravel concrete grade produit matériau agrégat صنف أصناف مواد بحص رمل منتج',
    items: 'spare part parts catalog sku tool oil filter article pièce rechange outil قطع غيار أصناف المستودع عدة فلاتر',
    product_types: 'material family category famille produit فئات المنتجات أنواع المواد',
    uoms: 'unit of measure m3 ton truck litre unité mesure وحدة قياس طن متر مكعب نقلة',
    expense_categories: 'cost category spending type catégorie dépense فئات المصاريف تبويب النفقات',
    expense_subcategories: 'cost subcategory sous-catégorie dépense فئات فرعية للمصاريف',
    sites: 'project location quarry destination chantier site livraison مشروع مشاريع ورشة موقع كسارة وجهة',
    regions: 'zone area city route district région zone secteur منطقة مناطق خط التوصيل',
    equipment: 'truck trucks loader excavator bulldozer generator plate fleet machine camion pelle chargeuse plaque آلية آليات شاحنة شاحنات جرافة حفارة لوحة',
    drivers: 'chauffeur operator trucker سائق سائقين شوفير مشغل آلية conducteur chauffeur',
    staff_members: 'employee employees worker people team hr personnel employé salarié موظف موظفين عامل عمال كادر',
    staff_roles: 'job title position department poste fonction rôle مسمى وظيفي وظيفة قسم',
    fx_rates: 'exchange rate lbp rate dollar rate taux de change سعر الصرف سعر الدولار ليرة',
    vat_rates: 'tax rate 11 percent tva taux نسبة الضريبة ضريبة القيمة المضافة',
    currencies: 'usd lbp eur money devise monnaie عملات دولار ليرة يورو',
    gl_accounts: 'chart of accounts coa ledger bookkeeping journal plan comptable grand livre شجرة الحسابات دليل الحسابات دفتر الأستاذ محاسبة',

    // Sibling-industry 24 domain registers
    hld_entities_tbl: 'holding group companies subsidiaries scorecard consolidation 14 entities sociétés filiales مجموعة الشركات القابضة الشركات التابعة بطاقة الأداء',
    hld_open_ic_tbl: 'intercompany sister transfer due from due to repayment elimination inter-sociétés société sœur تحويلات بين الشركات الشقيقة ذمم شقيقة تسديد',
    hld_pairs_tbl: 'intercompany matrix sister balances netting paire sociétés matrice مصفوفة الشركات الشقيقة مطابقة الأرصدة',
    hld_partners_tbl: 'partner split shareholder equity profit share agreement associé actionnaire quote-part شراكة حصص الشركاء توزيع الأرباح مساهمين',
    hld_extended_tbl: 'stakeholder haj mohamad external ledger partner current account compte courant associé دفتر المساهمين حساب جاري شريك',
    hld_loans_tbl: 'holding loan credit line bank facility interest rate ligne crédit prêt groupe قروض القابضة تسهيلات ائتمانية فائدة',

    hsp_rev_tbl: 'hospitality resort chalet beach cabana gate admission restaurant venue close hôtel plage bungalow entrée إيرادات المنتجع شاليه شاليهات شاطئ دخولية مطعم إقفال يومي',
    hsp_memb_tbl: 'seasonal membership member pass subscription arrears resort club abonnement saisonnier adhésion اشتراك موسمي عضوية شاليه كابانا متأخرات المشتركين',
    hsp_tariffs_tbl: 'resort tariff room rate seasonal price cabana rate tarif saisonnier prix chalet تعرفة الشاليهات أسعار الموسم كابانا',
    hsp_stock_tbl: 'kitchen cellar bar food beverage f&b recipe bom commissary inventory cuisine cave boisson fiche technique مخزون المطبخ المشروبات البار وصفة كلفة الطبق',
    hsp_gen_tbl: 'generator diesel solar kwh electricity runtime resort utility groupe électrogène mazout solaire مولد كهرباء مازوت طاقة شمسية عداد ساعات',

    trd_inv_tbl: 'trading sales invoice pre-printed book korri shacman commercial facture vente carnet فواتير مبيعات التجارة دفتر فواتير شاكمان كوري',
    trd_tgt_tbl: 'showroom price list import tariff catalog price grille tarifaire prix catalogue لائحة الأسعار تعرفة الاستيراد صالة العرض',
    trd_imp_tbl: 'import shipment container landed cost customs clearance freight ocean bl b/l lc importation douane conteneur connaissement ملف استيراد شحنة حاوية جمرك تخليص كلفة واصلة بوليصة شحن',
    trd_vin_tbl: 'vin chassis serial number heavy truck vehicle showroom pdi warranty numéro châssis camion véhicule شاصي رقم الهيكل شاحنات صالة العرض كفالة',
    trd_wh_tbl: 'spare parts sku warehouse stock reorder auto parts pièces détachées entrepôt référence قطع غيار مستودعات رمز الصنف إعادة طلب',

    re_leases_tbl: 'real estate tenant rent lease contract rent roll occupancy 4235 locataire loyer bail baux état locatif عقارات مستأجر إيجار ايجار عقد إيجار جدول الإيجارات إشغال',
    re_prop_tbl: 'property building land plot cadastral apartment unit mulk 2400 valuation immeuble terrain lot quote-part عقار مبنى شقة حصة سهم 2400 تقييم عقاري',
    re_sales_tbl: 'property sale deed buyer instalment payment plan title transfer vente immobilière acte acheteur échéance بيع عقار سند ملكية تقسيط دفعات المشتري',
    re_wo_tbl: 'fit-out maintenance work order tenant recharge capex contractor travaux entretien bon commande refacturation أمر عمل صيانة عقار تشطيب تحميل المستأجر',

    ins_pol_tbl: 'insurance policy endorsement insured client premium gwp motor medical marine police assurance avenant assuré prime بوليصة تأمين وثيقة ملحق مؤمن قسط تأمين سيارات طبي',
    ins_ren_tbl: 'renewal expiry expiring retention 30 60 90 days renouvellement échéance expiration تجديد البوالص استحقاق انتهاء الصلاحية',
    ins_stm_tbl: 'carrier statement bordereau commission reconciliation insurer compagnie relevé courtage كشف شركة التأمين مطابقة العمولات بوردورو',
    ins_clm_tbl: 'claim fnol accident loss surveyor recovery settlement sinistre déclaration expert indemnisation مطالبة تأمين حادث خبير كشف تعويض'
  };

  const FORM_ALIASES = {
    sales: 'new sales ticket delivery load invoice bill client بون مبيعات فاتورة بيع تسليم نقلة bon vente livraison',
    receipt: 'new customer receipt collect cash ar payment تحصيل زبون سند قبض دفعة عميل encaissement reçu client',
    vatinvoice: 'new vat tax invoice 11% official facture tva فاتورة ضريبية رسمية',
    pricerule: 'new price agreement tariff commission discount اتفاقية سعر عمولة حسم accord tarifaire',
    creditterm: 'new credit terms limit payment days سقف ائتمان شروط دفع conditions crédit',
    raw: 'new raw material purchase quarry haulage ticket بون شراء مواد أولية كسارة نقلة achat matière carrière',
    expense: 'new expense bill cost voucher petty cash pay bill إضافة مصروف فاتورة نفقة saisir dépense charge',
    recurringexpense: 'new recurring expense rent monthly subscription إيجار مصروف شهري دوري loyer charge périodique',
    warehousestock: 'warehouse shelf adjust stock count inventory جرد مستودع تعديل مخزون ajustement stock',
    settlement: 'new supplier settlement pay vendor ap payment دفعة مورد تسديد ذمم دائنة règlement fournisseur',
    document: 'upload document scan receipt photo attachment رفع مستند إيصال صورة مرفق téléverser document reçu',
    jv: 'new jv partnership profit distribution شراكة محاصة توزيع أرباح partenariat',
    fuel: 'fuel refill diesel mazout tank lubricant intake gasoil litres تعبئة مازوت وقود ديزل محروقات خزان plein carburant mazout citerne',
    malfunction: 'stock discrepancy meter fault fuel loss فرق مخزون عطل عداد نقص مازوت écart stock compteur',
    companyequipment: 'assign fleet unit company truck تخصيص آلية شاحنة للشركة affecter camion',
    defect: 'report equipment defect warning breakdown تسجيل عطل تحذير شاحنة signaler panne défaut',
    repair: 'new equipment repair workshop maintenance garage تصليح آلية صيانة ورشة réparation entretien atelier',
    oillog: 'oil change service log grease filter غيار زيت صيانة فلتر تشحيم vidange huile service',
    partlog: 'part change tire battery serial custody تبديل قطعة إطار بطارية عهدة remplacement pièce pneu',
    triprate: 'overtime trip rate driver bonus تعرفة نقلة ساعات إضافية سائق tarif voyage heures sup',
    salary: 'pay salary bonus wage payroll advance دفع راتب معاش مكافأة سلفة salaire paie prime',
    attendance: 'log attendance clock in out overtime lateness تسجيل حضور دوام بصمة إضافي pointage présence',
    workshift: 'new shift timing schedule hours أوقات الدوام شفت جدول عمل horaire poste',
    employment: 'new employment contract hire staff salary عقد عمل توظيف موظف contrat travail embauche',
    staffassignment: 'assign staff role operator truck تعيين موظف مشغل آلية affectation poste',
    freelance: 'freelance daily labor casual worker مياومة عمل حر عامل يومي travail journalier',
    logistics: 'site transport commute allowance بدل نقل مواصلات ورشة indemnité transport',
    external: 'external entry owner cash movement حركة خارجية صندوق سحب إيداع écriture externe',
    treasury: 'new loan partner advance repayment drawdown قرض سلفة شريك سداد قسط prêt avance remboursement',
    conversion: 'fx conversion exchange usd lbp lira تحويل عملة صيرفة دولار ليرة change devise',
    customer: 'add customer new client buyer إضافة زبون عميل جديد nouveau client',
    supplier: 'add supplier new vendor hauler إضافة مورد متعهد ناقل nouveau fournisseur',
    product: 'add product material grade aggregate إضافة صنف مادة بحص رمل nouveau produit',
    item: 'add warehouse item spare part tool إضافة قطعة غيار صنف مستودع nouvel article pièce',
    expensecategory: 'add expense category cost type إضافة فئة مصاريف catégorie dépense',
    site: 'add site project quarry location إضافة موقع مشروع ورشة كسارة nouveau site chantier',
    region: 'add region zone route إضافة منطقة خط توصيل nouvelle région zone',
    equipment: 'add truck equipment machine plate إضافة شاحنة آلية لوحة nouveau camion équipement',
    driver: 'add driver chauffeur operator إضافة سائق شوفير nouveau chauffeur',
    staff: 'add staff employee worker إضافة موظف عامل nouvel employé',
    staffrole: 'add staff role job title إضافة وظيفة مسمى وظيفي nouveau rôle poste',
    fxrate: 'update fx rate exchange rate dollar lbp تعديل سعر الصرف الدولار taux de change',
    vatrate: 'vat rate tax percentage نسبة الضريبة معدل tva',
    currency: 'add currency money إضافة عملة devise',

    // Sibling domain forms
    hld_interactions: 'intercompany transfer sister company loan repayment تحويل بين شركات شقيقة تسديد transfert inter-sociétés',
    hld_extended: 'holding stakeholder entry partner cash قيد مساهمين حساب شريك écriture associé',
    hld_partners: 'partner profit split equity schedule جدول حصص الشركاء توزيع أرباح répartition associés',
    hld_loans: 'central treasury facility bank loan schedule قرض مركزي تسهيلات مصرفية facilité trésorerie prêt',
    hsp_revenue: 'venue chalet revenue daily close beach gate إقفال إيرادات شاليه مطعم منتجع clôture recette chalet plage',
    hsp_pos: 'pos till close register drawer z-report إقفال صندوق كاشير نقطة بيع clôture caisse pos',
    hsp_memberships: 'new seasonal membership cabana chalet contract اشتراك موسمي عضوية شاليه كابانا abonnement saisonnier',
    hsp_tariffs: 'seasonal resort chalet cabana tariff rate تعرفة موسمية أسعار الشاليهات tarif saisonnier chalet',
    hsp_stock: 'kitchen cellar stock intake commissary f&b إدخال مخزون مطبخ مشروبات بار entrée stock cuisine cave',
    hsp_energy: 'generator diesel solar runtime kwh log سجل مولد مازوت طاقة شمسية relevé générateur solaire',
    trd_sales: 'commercial vehicle parts sales tax invoice فاتورة مبيعات شاحنة قطع غيار facture vente véhicule pièces',
    trd_targets: 'showroom price list import tariff schedule لائحة أسعار صالة العرض تعرفة grille tarifaire',
    trd_purchases: 'import container landed cost customs bl file ملف استيراد حاوية جمرك كلفة واصلة dossier import douane',
    trd_trucks: 'new showroom vin chassis heavy truck unit إدخال شاحنة شاصي رقم هيكل unité châssis vin',
    trd_stock: 'new spare part sku multi-warehouse صنف قطع غيار مستودع référence pièce rechange',
    re_leases: 'new lease contract tenant rent residential commercial عقد إيجار مستأجر جديد contrat bail locataire',
    re_invoicing: 'new rent invoice period lease billing فاتورة إيجار مطالبة مستأجر quittance facture loyer',
    re_sales: 'property deed sale buyer instalment contract عقد بيع عقار تقسيط سند ملكية vente immobilière acte',
    re_workorders: 'property fit-out maintenance work order recharge أمر عمل صيانة عقار تشطيب bon travaux entretien',
    ins_policies: 'new insurance policy endorsement client coverage إصدار بوليصة تأمين ملحق وثيقة nouvelle police avenant',
    ins_claims: 'new claim file fnol accident survey فتح ملف حادث مطالبة تأمين تعويض déclaration sinistre',
    ins_agreements: 'carrier commission agreement brokerage rate اتفاقية عمولة شركة تأمين accord commission compagnie',
    ins_remittances: 'carrier bordereau remittance settlement تسديد شركة تأمين بوردورو كشف bordereau remise compagnie'
  };

  const STATEMENT_ALIASES = {
    '01': 'daily digest summary operations report ملخص العمليات اليومية rapport quotidien',
    '02': 'balance sheet assets liabilities equity ميزانية عمومية موجودات مطلوبات bilan comptable',
    '03': 'income statement p&l pnl profit and loss ebitda بيان الدخل أرباح وخسائر compte de résultat',
    '04': 'cash flow statement direct liquidity inflows outflows التدفقات النقدية سيولة tableau flux trésorerie',
    '05': 'trial balance 6 column debit credit ميزان المراجعة مدين دائن balance générale',
    '06': 'general journal double entry postings دفتر اليومية قيود محاسبية journal général',
    '07': 'sub-account statement gl ledger card كشف حساب فرعي أستاذ مساعد grand livre auxiliaire',
    '08': 'sales register revenue report سجل المبيعات journal des ventes',
    '09': 'expense register cost vouchers report سجل المصاريف والنفقات journal des dépenses',
    '10': 'payroll register staff earnings salaries report سجل الرواتب والأجور livre de paie',
    '11': 'raw material intake quarry report سجل المواد الأولية والكسارات registre matières premières',
    '12': 'fuel log diesel consumption tank report سجل المحروقات والمازوت journal carburant',
    '13': 'aged receivables ar aging overdue customers أعمار الذمم المدينة ديون الزبائن balance âgée clients',
    '14': 'customer statement of account soa client ledger كشف حساب زبون عميل relevé de compte client',
    '15': 'supplier balances ap aging owed vendors أرصدة الموردين ذمم دائنة soldes fournisseurs',
    '16': 'supplier statement of account soa vendor ledger كشف حساب مورد relevé compte fournisseur',
    '17': 'driver statement trips allowances earnings كشف حساب سائق relevé chauffeur',
    '18': 'vat return tax declaration output input 11% تصريح الضريبة القيمة المضافة déclaration tva',
    '19': 'p&l reconciliation operational vs gl tie مطابقة الأرباح والخسائر rapprochement résultat',
    '20': 'printable sales invoice customer bill طباعة فاتورة مبيعات facture client imprimable',
    '21': 'delivery ticket weighbridge slip bon طباعة بون تسليم نقلة bon de livraison',
    '22': 'receipt voucher cash collection slip طباعة سند قبض reçu encaissement',
    '23': 'holding intercompany partner split statement كشف الشركات الشقيقة وحصص الشركاء relevé inter-sociétés associés',
    '24': 'hospitality venue revenue pos till close statement كشف إيرادات المنتجع وصندوق الكاشير relevé recettes pos chalet',
    '25': 'trading invoice books stock valuation statement كشف دفاتر الفواتير وتقييم المخزون relevé carnets stock vin',
    '26': 'real estate official 4235 vat rent roll statement جدول الإيجارات الرسمي عقارات 4235 état locatif officiel tva',
    '27': 'insurance policy schedule carrier bordereau recon كشف بوالص التأمين ومطابقة الشركات bordereau polices compagnie'
  };

  const ENTRY_INTENT_WORDS = new Set([
    'enter', 'entering', 'add', 'adding', 'new', 'create', 'creating', 'post', 'posting',
    'log', 'logging', 'record', 'recording', 'issue', 'register', 'upload', 'book',
    'ادخال', 'ادخل', 'اضافه', 'اضف', 'جديد', 'جديده', 'تسجيل', 'سجل', 'اصدار', 'انشاء', 'رفع',
    'saisir', 'saisie', 'ajouter', 'nouveau', 'nouvelle', 'creer', 'enregistrer', 'emettre'
  ]);

  const QUESTION_STOP_WORDS = new Set([
    'where', 'do', 'does', 'did', 'i', 'we', 'you', 'how', 'to', 'can', 'could', 'should',
    'what', 'which', 'is', 'are', 'the', 'a', 'an', 'for', 'in', 'on', 'at', 'of', 'my',
    'our', 'find', 'open', 'show', 'me', 'go', 'want', 'need', 'page', 'screen', 'module',
    'اين', 'وين', 'كيف', 'فيني', 'بدي', 'اريد', 'في', 'من', 'على', 'الى', 'عن', 'صفحه', 'شاشه', 'قسم', 'افتح',
    'ou', 'comment', 'puis', 'je', 'peut', 'on', 'un', 'une', 'le', 'la', 'les', 'de', 'des', 'du', 'dans', 'pour', 'ouvrir', 'trouver'
  ]);

  function tr(str) {
    const s = String(str == null ? '' : str);
    if (!s) return '';
    if (window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      const lang = typeof window.MFG_I18N.getLang === 'function' ? window.MFG_I18N.getLang() : 'en';
      if (lang && lang !== 'en') return window.MFG_I18N.t(s, lang) || s;
    }
    return s;
  }

  function escHtml(val) {
    if (_ctx && typeof _ctx.esc === 'function') return _ctx.esc(val);
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function iconSvg(name) {
    if (window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function') {
      return window.MFG_ICONS.svg(name);
    }
    return '<svg class="ic" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="10.8" cy="10.8" r="6.8"/><line x1="15.8" y1="15.8" x2="20.8" y2="20.8"/></svg>';
  }

  function normSearch(raw) {
    if (raw == null) return '';
    let s = String(raw).toLowerCase();
    try {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {}
    s = s
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[’'`]/g, '')
      .replace(/[^\p{L}\p{N}#%+/.&-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  }

  function normRefCode(raw) {
    if (raw == null) return '';
    return String(raw)
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  const DEMO_COMPANY_KEY = 'democompany';

  function normCoKey(s) {
    return String(s || '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isCompanyPermitted(coName, pctx) {
    const raw = String(coName || '').trim();
    if (!raw) return true;
    if (pctx && pctx.demoActive) return true;
    return Boolean(pctx && pctx.allowedCosNormSet && pctx.allowedCosNormSet.has(normCoKey(raw)));
  }

  function getSeatKey(user) {
    const u = user || (_ctx && _ctx.activeUser && _ctx.activeUser()) || null;
    if (!u) return 'anon';
    return String(u.id || u.email || u.name || 'anon').trim().toLowerCase();
  }

  function loadSeatUsageMap(user) {
    try {
      const storeKey = FREQ_STORAGE_PREFIX + getSeatKey(user);
      const inDemo = Boolean(_ctx && _ctx.isDemoScopeActive && _ctx.isDemoScopeActive());
      const raw = inDemo
        ? sessionStorage.getItem('demo_sbx_' + storeKey)
        : localStorage.getItem(storeKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  let _suppressAutoTableUsage = false;
  let _suppressAllUsage = false;
  let _pendingUnivRegKey = '';

  function recordUsage(kind, key) {
    if (kind === 'view' && _pendingUnivRegKey && _ctx && _ctx.STATE) {
      _ctx.STATE.activeUnivRegKey = _pendingUnivRegKey;
      _pendingUnivRegKey = '';
    }
    if (_suppressAllUsage) return;
    if (!_ctx || !_ctx.STATE || !_ctx.STATE.authed || !kind || !key) return;
    if (_suppressAutoTableUsage && kind === 'table') return;
    try {
      const u = _ctx.activeUser ? _ctx.activeUser() : null;
      if (!u) return;
      const storeKey = FREQ_STORAGE_PREFIX + getSeatKey(u);
      const inDemo = Boolean(_ctx.isDemoScopeActive && _ctx.isDemoScopeActive());
      const map = loadSeatUsageMap(u);
      const bucketKey = `${kind}:${key}`;
      map[bucketKey] = Math.min(999999, (Number(map[bucketKey]) || 0) + 1);
      if (inDemo) {
        sessionStorage.setItem('demo_sbx_' + storeKey, JSON.stringify(map));
      } else {
        localStorage.setItem(storeKey, JSON.stringify(map));
      }
      _cachedIndexKey = '';
    } catch (_) {}
  }

  const _trilingualVariantsCache = new Map();

  function getTrilingualVariants(enLabel) {
    const base = String(enLabel || '').trim();
    if (!base) return [];
    const hit = _trilingualVariantsCache.get(base);
    if (hit) return hit;
    const out = [base];
    if (window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      try {
        const ar = window.MFG_I18N.t(base, 'ar');
        const fr = window.MFG_I18N.t(base, 'fr');
        if (ar && ar !== base) out.push(ar);
        if (fr && fr !== base) out.push(fr);
      } catch (_) {}
    }
    _trilingualVariantsCache.set(base, out);
    return out;
  }

  function getPermittedContext() {
    if (!_ctx || !_ctx.STATE || !_ctx.STATE.authed || _ctx.STATE.kioskLocked) return null;
    const STATE = _ctx.STATE;
    const u = _ctx.activeUser ? _ctx.activeUser() : null;
    if (!u) return null;
    const demoActive = Boolean(_ctx.isDemoScopeActive && _ctx.isDemoScopeActive());
    const isDemoCompany = Boolean(demoActive && STATE.company === DEMO_COMPANY_KEY);
    const catalog = (_ctx.getCompanyCatalog && _ctx.getCompanyCatalog()) || [];
    const catalogByNormName = new Map();
    catalog.forEach(c => {
      if (c && c.name) catalogByNormName.set(normCoKey(c.name), c);
    });
    const allowedCos = (_ctx.allowedCompanyNames && _ctx.allowedCompanyNames(u)) || [];
    const allowedCosSet = new Set(allowedCos);
    const allowedCosNormSet = new Set(allowedCos.map(normCoKey).filter(Boolean));
    const activeInd = (_ctx.getActiveIndustry && _ctx.getActiveIndustry(STATE.company)) || 'Manufacturing';

    const permittedIndustries = new Set();
    if (demoActive) {
      ['Manufacturing', 'Holding & Treasury', 'Hospitality & Resorts', 'Automotive & Heavy Trading', 'Real Estate & Property', 'Insurance & Brokerage'].forEach(ind => permittedIndustries.add(ind));
    } else {
      catalog.forEach(c => {
        if (c && allowedCosNormSet.has(normCoKey(c.name))) {
          permittedIndustries.add(c.industry || 'Manufacturing');
        }
      });
      if (!permittedIndustries.size) {
        permittedIndustries.add(activeInd || 'Manufacturing');
      }
    }

    const permittedScopesByInd = new Map();
    permittedIndustries.forEach(ind => {
      if (isDemoCompany) {
        permittedScopesByInd.set(ind, [DEMO_COMPANY_KEY]);
        return;
      }
      const cosInInd = catalog.filter(c => (c.industry || 'Manufacturing') === ind && (demoActive || allowedCosNormSet.has(normCoKey(c.name))));
      if (ind === 'Manufacturing') {
        if (cosInInd.length >= 2) {
          permittedScopesByInd.set(ind, ['manufacturing-group']);
        } else if (cosInInd.length === 1) {
          permittedScopesByInd.set(ind, [cosInInd[0].key]);
        }
      } else if (cosInInd.length >= 2) {
        permittedScopesByInd.set(ind, ['industry:' + ind]);
      } else if (cosInInd.length === 1) {
        permittedScopesByInd.set(ind, [cosInInd[0].key]);
      }
    });

    return {
      STATE,
      SEED: _ctx.SEED || { records: {} },
      user: u,
      demoActive,
      isDemoCompany,
      offScope: Boolean(_ctx.isOfficialScopeActive && _ctx.isOfficialScopeActive(u)),
      catalog,
      catalogByNormName,
      allowedCos,
      allowedCosSet,
      allowedCosNormSet,
      activeInd,
      permittedIndustries,
      permittedScopesByInd
    };
  }

  function ensureIndustryScope(targetInd, pctx, preferredCompanyName) {
    if (!_ctx || !targetInd) return;
    const STATE = _ctx.STATE;
    const curInd = (_ctx.getActiveIndustry && _ctx.getActiveIndustry(STATE.company)) || 'Manufacturing';
    if (pctx && pctx.isDemoCompany) {
      if (curInd !== targetInd && typeof window.__mfgSetDemoCompanyIndustry === 'function') {
        window.__mfgSetDemoCompanyIndustry(targetInd);
      }
      return;
    }
    if (preferredCompanyName && pctx && isCompanyPermitted(preferredCompanyName, pctx)) {
      const catHit = pctx.catalogByNormName.get(normCoKey(preferredCompanyName));
      if (catHit && catHit.key) {
        const curBu = _ctx.COMPANY_BU_MATCH && _ctx.COMPANY_BU_MATCH[STATE.company];
        if (curInd !== (catHit.industry || 'Manufacturing') || (curBu && normCoKey(curBu) !== normCoKey(preferredCompanyName))) {
          if (typeof _ctx.selectCompanyScope === 'function') {
            _ctx.selectCompanyScope(catHit.key, true);
          } else {
            STATE.company = catHit.key;
          }
          return;
        }
      }
    }
    if (curInd === targetInd) return;
    const scopes = (pctx && pctx.permittedScopesByInd.get(targetInd)) || [];
    const nextScope = scopes[0] || (targetInd === 'Manufacturing' ? 'manufacturing-group' : ('industry:' + targetInd));
    if (typeof _ctx.selectCompanyScope === 'function') {
      _ctx.selectCompanyScope(nextScope, true);
    } else {
      STATE.company = nextScope;
    }
  }

  function canAccessRdlInIndustry(rdlItem, targetInd, pctx) {
    if (!_ctx || typeof _ctx.canAccessRdlReport !== 'function') return false;
    const STATE = pctx.STATE;
    const savedCompany = STATE.company;
    const savedDemoInd = STATE.demoCompanyIndustry;
    const tempScopes = pctx.permittedScopesByInd.get(targetInd) || [];
    const tempScope = pctx.isDemoCompany
      ? DEMO_COMPANY_KEY
      : (tempScopes[0] || savedCompany);
    try {
      if (pctx.isDemoCompany) STATE.demoCompanyIndustry = targetInd;
      if (tempScope !== savedCompany) STATE.company = tempScope;
      return Boolean(_ctx.canAccessRdlReport(rdlItem, pctx.user));
    } finally {
      STATE.company = savedCompany;
      STATE.demoCompanyIndustry = savedDemoInd;
    }
  }

  function runScopedDomainRegister(ind, tabKey, pctx) {
    if (!_ctx || typeof _ctx.buildIndustryDomainTableRegister !== 'function') return null;
    const STATE = pctx.STATE;
    const savedCompany = STATE.company;
    const savedDemoInd = STATE.demoCompanyIndustry;
    const savedPeriod = STATE.period;
    try {
      if (pctx.isDemoCompany) {
        STATE.company = DEMO_COMPANY_KEY;
        STATE.demoCompanyIndustry = ind;
      } else {
        const scopes = pctx.permittedScopesByInd.get(ind) || [];
        if (scopes[0]) STATE.company = scopes[0];
      }
      STATE.period = 'ALL';
      return _ctx.buildIndustryDomainTableRegister(ind, tabKey);
    } catch (_) {
      return null;
    } finally {
      STATE.company = savedCompany;
      STATE.demoCompanyIndustry = savedDemoInd;
      STATE.period = savedPeriod;
    }
  }

  function getPermittedRowsForSeedTable(tableKey, isUniversal, pctx) {
    const rawList = (pctx.SEED && pctx.SEED.records && pctx.SEED.records[tableKey]) || [];
    if (!Array.isArray(rawList) || !rawList.length) return [];
    const checkOff = r => !pctx.offScope || !_ctx.isOfficialRecord || _ctx.isOfficialRecord(r, tableKey);

    if (pctx.isDemoCompany) {
      return rawList.filter(r => {
        if (!r || r.voided) return false;
        const isDemoRow = Boolean(r._demoSpineRow || String(r.id || '').startsWith('mi-'));
        if (!isDemoRow) return false;
        return checkOff(r);
      });
    }

    if (isUniversal) {
      const hasMultiSeed = Boolean(rawList._hasMultiIndustrySeed);
      return rawList.filter(r => {
        if (!r || r.voided) return false;
        if (!pctx.demoActive && r._demoSpineRow) return false;
        if (r.company && !pctx.demoActive && !isCompanyPermitted(r.company, pctx)) return false;
        if (r._industry) {
          if (!pctx.permittedIndustries.has(r._industry)) return false;
        } else if (hasMultiSeed || MFG_ONLY_TABLES.has(tableKey)) {
          if (!pctx.permittedIndustries.has('Manufacturing')) return false;
        }
        if (!checkOff(r)) return false;
        return true;
      });
    }

    const seenIds = new Set();
    const out = [];
    if (typeof _ctx.filterRecords === 'function') {
      pctx.permittedScopesByInd.forEach(scopes => {
        scopes.forEach(scopeKey => {
          const slice = _ctx.filterRecords(rawList, {
            company: scopeKey,
            ignorePeriod: true,
            ignoreSearch: true,
            ignoreCompany: false,
            ignoreRls: false,
            tableKey,
            user: pctx.user
          }) || [];
          for (let i = 0; i < slice.length; i++) {
            const r = slice[i];
            if (!r || r.voided) continue;
            if (r.company && !pctx.demoActive && !isCompanyPermitted(r.company, pctx)) continue;
            if (!checkOff(r)) continue;
            const uid = r.id != null ? String(r.id) : `${r.date || ''}|${r.ticket_no || r.name || i}`;
            if (seenIds.has(uid)) continue;
            seenIds.add(uid);
            out.push(r);
          }
        });
      });
      return out;
    }

    return rawList.filter(r => {
      if (!r || r.voided) return false;
      if (!pctx.demoActive && r._demoSpineRow) return false;
      if (r.company && !pctx.demoActive && !isCompanyPermitted(r.company, pctx)) return false;
      if (!checkOff(r)) return false;
      return true;
    });
  }

  // Statement parameters a Tab chip can set: the statement's own picker lists (dates, period, year and month stay on the statement)
  const STMT_PICK_PARAM_ORDER = ['customer', 'supplier', 'driver', 'staff', 'account', 'invoiceNo', 'ticketId', 'receiptId', 'category', 'equipment', 'equipType', 'product', 'site'];
  const STMT_DOC_PARAMS = new Set(['invoiceNo', 'ticketId', 'receiptId']);
  const STMT_NON_PICK_PARAMS = new Set(['from', 'to', 'asof', 'period', 'year', 'month']);
  // Registers whose rows come from one ledger only: [statement engine row list, field] per picker
  const STMT_VALUE_SOURCES = {
    '08': { customer: ['salesAll', 'customer'], product: ['salesAll', 'product'], site: ['salesAll', 'site'] },
    '09': { supplier: ['expAll', 'supplier'], category: ['expAll', 'category'] },
    '11': { supplier: ['rmAll', 'supplier'] },
    '12': { driver: ['fuelAll', 'driver'], equipment: ['fuelAll', 'equip'], equipType: ['fuelAll', 'equip_type'] }
  };

  // A signed-in seat inside the Demo Company still holds its live Manufacturing ledgers in memory. The palette lists
  // only sandbox rows there, so the chip offers and accepts no Manufacturing statement value in that scope.
  // The public sandbox session runs on the synthetic seed and keeps the chip.
  function stmtChipBlockedForScope(landInd) {
    const STATE = _ctx && _ctx.STATE;
    if (!STATE || STATE.company !== DEMO_COMPANY_KEY) return false;
    if (STATE.demoVisitor) return false;
    try {
      if (/[?&](autologin|demo)=1(&|$)/.test(String(window.location.search || ''))) return false;
    } catch (_) {}
    return (landInd || 'Manufacturing') === 'Manufacturing';
  }

  function stmtPickKeys(rdlMeta) {
    const params = (rdlMeta && Array.isArray(rdlMeta.params)) ? rdlMeta.params : [];
    return STMT_PICK_PARAM_ORDER.filter(k => params.indexOf(k) >= 0);
  }

  // Sibling pickers put back to "All" when the chip sets one, so the statement opens on exactly what the chip names
  function stmtResetKeys(rdlMeta) {
    const params = (rdlMeta && Array.isArray(rdlMeta.params)) ? rdlMeta.params : [];
    return params.filter(k => !STMT_NON_PICK_PARAMS.has(k) && !STMT_DOC_PARAMS.has(k));
  }

  // Runs inside the statement's landing scope (after any industry switch): the value is set only if this seat's
  // statement picker lists it there, so a stale or foreign value can never be forced into a statement.
  function applyStatementParamSelection(rdlMeta, sel, pctx) {
    const rdlApi = (typeof window !== 'undefined') ? window.MFG_RDL : null;
    if (!rdlApi || typeof rdlApi.buildRdlContext !== 'function' || typeof rdlApi.getParamComboConfig !== 'function') return false;
    if (!sel || stmtPickKeys(rdlMeta).indexOf(sel.key) < 0) return false;
    // Same preconditions as the suggestions: the seat's company limits are on STATE and the scope may carry a value
    if (!Array.isArray(pctx.STATE.allowedCompanyNames)) return false;
    if (stmtChipBlockedForScope((_ctx.getActiveIndustry && _ctx.getActiveIndustry(pctx.STATE.company)) || 'Manufacturing')) return false;
    try {
      const rctx = rdlApi.buildRdlContext(pctx.SEED, pctx.STATE);
      const cfg = rdlApi.getParamComboConfig(sel.key, rctx);
      const want = String(sel.value);
      if (!cfg || want === 'ALL' || !cfg.options.some(o => String(o.value) === want)) return false;
      stmtResetKeys(rdlMeta).forEach(k => {
        if (k !== sel.key) rctx.rdl.params[k] = 'ALL';
      });
      rctx.rdl.params[sel.key] = want;
      return true;
    } catch (_) {
      return false;
    }
  }

  function makeCandidate(spec) {
    const variants = spec.titleRaw
      ? [String(spec.titleEn || '').trim()].filter(Boolean)
      : getTrilingualVariants(spec.titleEn);
    const subVariants = spec.subEn ? getTrilingualVariants(spec.subEn) : [];
    const subTabVariants = spec.subTabEn ? getTrilingualVariants(spec.subTabEn) : [];
    const exactSet = new Set();
    variants.forEach(v => {
      const nv = normSearch(v);
      if (nv) exactSet.add(nv);
    });
    if (Array.isArray(spec.exactAliases)) {
      spec.exactAliases.forEach(a => {
        const na = normSearch(a);
        if (na) exactSet.add(na);
      });
    }
    const hayParts = []
      .concat(variants)
      .concat(subVariants)
      .concat(subTabVariants)
      .concat(spec.aliases || '')
      .concat(spec.industry || '')
      .concat(spec.extraHay || '');
    const hay = normSearch(hayParts.join(' '));
    const hayWords = hay ? hay.split(' ') : [];
    return {
      id: spec.id,
      kind: spec.kind,
      icon: spec.icon || 'search',
      titleEn: spec.titleEn,
      titleRaw: Boolean(spec.titleRaw),
      subEn: spec.subEn || '',
      subTabEn: spec.subTabEn || '',
      subRaw: spec.subRaw || '',
      industry: spec.industry || '',
      badgeEn: spec.badgeEn || 'Table',
      freq: Number(spec.freq) || 0,
      exactSet,
      hay,
      hayWords,
      filterable: spec.filterable || null,
      run: spec.run
    };
  }

  function buildSearchIndex() {
    const pctx = getPermittedContext();
    if (!pctx) return null;

    const u = pctx.user;
    const lang = (window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function') ? window.MFG_I18N.getLang() : 'en';
    const customPermsSig = String(u.custom_perms || '') + '|' + JSON.stringify((pctx.STATE && pctx.STATE.roleTabPolicies) || {});
    const seedRecs = (pctx.SEED && pctx.SEED.records) || {};
    const seedCountSig = (Array.isArray(seedRecs.sales_tickets) ? seedRecs.sales_tickets.length : 0)
      + ':' + (Array.isArray(seedRecs.customers) ? seedRecs.customers.length : 0)
      + ':' + (Array.isArray(seedRecs.expenses) ? seedRecs.expenses.length : 0);
    const indRowEditsSig = JSON.stringify((_ctx.getIndustryRowEditStore ? _ctx.getIndustryRowEditStore() : (pctx.STATE && pctx.STATE.industryRowEdits)) || {});
    const cacheKey = [
      getSeatKey(u),
      u.role || '',
      u.pbi_access || '',
      u.statements_access || '',
      customPermsSig,
      pctx.allowedCos.join(','),
      pctx.STATE.company || '',
      pctx.STATE.demoCompanyIndustry || '',
      pctx.activeInd,
      pctx.offScope ? 1 : 0,
      pctx.demoActive ? 1 : 0,
      pctx.isDemoCompany ? 1 : 0,
      (pctx.SEED && pctx.SEED._customRev) || 0,
      (pctx.SEED && pctx.SEED._industryRev) || 0,
      (pctx.STATE && pctx.STATE._indCustomRev) || 0,
      (pctx.SEED && pctx.SEED._recordsReady) ? 1 : 0,
      seedCountSig,
      indRowEditsSig,
      lang
    ].join('::');

    if (_cachedIndex && _cachedIndexKey === cacheKey) {
      return _cachedIndex;
    }

    const usageMap = loadSeatUsageMap(u);
    const usageScore = (kind, key) => (Number(usageMap[`${kind}:${key}`]) || 0) * 100000;
    const indBoost = ind => (!ind || ind === pctx.activeInd) ? 50000 : 0;

    const items = [];
    const exactRefMap = new Map();
    const scopedRowsCache = new Map();
    const getScopedRows = (tk, isUniv) => {
      if (!scopedRowsCache.has(tk)) {
        scopedRowsCache.set(tk, getPermittedRowsForSeedTable(tk, isUniv, pctx));
      }
      return scopedRowsCache.get(tk);
    };
    const domainRegCache = new Map();
    const getDomainReg = (ind, tabKey) => {
      const ck = `${ind}::${tabKey}`;
      if (!domainRegCache.has(ck)) {
        domainRegCache.set(ck, runScopedDomainRegister(ind, tabKey, pctx));
      }
      return domainRegCache.get(ck);
    };

    const tableCatalog = (window.MFG_PBI && Array.isArray(window.MFG_PBI.TABLE_CATALOG)) ? window.MFG_PBI.TABLE_CATALOG : [];

    // 1. All 53 Shared + Manufacturing TABLE_CATALOG Registers (routed directly to Sidebar Hub & Sub-Tab)
    for (let i = 0; i < tableCatalog.length; i++) {
      const meta = tableCatalog[i];
      if (!meta || !meta.key) continue;
      if (!_ctx.canAccessTable || !_ctx.canAccessTable(meta.key, u)) continue;
      const isMfgOnly = MFG_ONLY_TABLES.has(meta.key);
      if (isMfgOnly && !pctx.permittedIndustries.has('Manufacturing')) continue;
      if (meta.key === 'gl_accounts' && (!_ctx.canViewView || !_ctx.canViewView('ledger', u))) continue;

      const targetSpec = resolveSidebarTableTarget(meta.key, isMfgOnly, pctx);
      const targetView = targetSpec ? targetSpec.view : '';
      const canTargetView = Boolean(targetView && _ctx.canViewView && _ctx.canViewView(targetView, u));
      if (!canTargetView) continue;

      const rows = getScopedRows(meta.key, Boolean(meta.universal));
      const rowCnt = rows.length;
      const targetInd = (targetSpec && targetSpec.forceInd) ? targetSpec.forceInd : (isMfgOnly ? 'Manufacturing' : '');
      const cleanGroup = String(meta.group || '').replace(/^\d+\s*·\s*/, '');
      const hubInfo = lookupHubInfoForView(targetView);
      const subHubTitle = hubInfo.hubTitle || cleanGroup;
      const subTabTitle = (hubInfo.tabTitle && hubInfo.tabTitle !== subHubTitle && hubInfo.tabTitle !== meta.label)
        ? hubInfo.tabTitle
        : '';
      const exactAliases = [meta.key.replace(/_/g, ' ')];
      if (meta.singularLabel) exactAliases.push(meta.singularLabel);
      const aliasStr = TABLE_ALIASES[meta.key] || '';
      aliasStr.split(/\s+/).forEach(tok => { if (tok.length >= 3) exactAliases.push(tok); });

      items.push(makeCandidate({
        id: `table:${meta.key}`,
        kind: 'table',
        icon: hubInfo.icon || 'tables',
        titleEn: meta.label,
        subEn: subHubTitle,
        subTabEn: subTabTitle,
        subRaw: `${rowCnt.toLocaleString('en-US')}`,
        industry: targetInd && pctx.activeInd !== targetInd ? targetInd : '',
        badgeEn: 'Table',
        freq: usageScore('table', meta.key) + indBoost(targetInd) + Math.min(45000, rowCnt),
        exactAliases,
        aliases: `${aliasStr} ${meta.singularLabel || ''} table register جدول سجل`,
        extraHay: cleanGroup,
        filterable: {
          kind: 'seed',
          view: targetView,
          panelId: targetSpec ? targetSpec.panelId : '',
          fallbackKey: meta.key,
          searchKey: (targetSpec && targetSpec.univConnTableKey)
            ? 'univConnSearch'
            : ((SIDEBAR_TABLE_TARGET_MAP[meta.key] && SIDEBAR_TABLE_TARGET_MAP[meta.key].searchKey) || 'search'),
          tableKey: meta.key,
          universal: Boolean(meta.universal),
          forceInd: targetInd,
          facetCols: (SIDEBAR_TABLE_TARGET_MAP[meta.key] && SIDEBAR_TABLE_TARGET_MAP[meta.key].facetCols) || null,
          cols: Array.isArray(meta.cols) ? meta.cols : [],
          rowsFn: () => rows
        },
        run: () => {
          recordUsage('table', meta.key);
          if (targetSpec && targetSpec.forceInd) {
            ensureIndustryScope(targetSpec.forceInd, pctx);
          }
          if (!pctx.STATE.tableViews) pctx.STATE.tableViews = {};
          pctx.STATE.tableViews[meta.key] = 'all';
          pctx.STATE.univConnTableKey = (targetSpec && targetSpec.univConnTableKey) || '';
          pctx.STATE.univConnPartyFilter = '';
          pctx.STATE.univConnSearch = '';
          pctx.STATE.univConnView = '';
          pctx.STATE.univConnSubRole = '';
          _suppressAutoTableUsage = true;
          _pendingUnivRegKey = (targetSpec && targetSpec.univRegKey) || '';
          try {
            _ctx.setView(targetView);
          } finally {
            _suppressAutoTableUsage = false;
            _pendingUnivRegKey = '';
          }
          if (targetSpec && targetSpec.univRegKey && pctx.STATE.activeUnivRegKey !== targetSpec.univRegKey) {
            pctx.STATE.activeUnivRegKey = targetSpec.univRegKey;
          }
          focusWorkspaceTablePanel(targetSpec ? targetSpec.panelId : '', meta.key);
        }
      }));
    }

    // 2. All 24 Sibling-Industry Domain Registers (routed directly to Sidebar Hub & Sub-Tab)
    var domTableItemByKey = new Map();
    Object.keys(DOMAIN_TABLES_BY_IND).forEach(ind => {
      if (!pctx.permittedIndustries.has(ind)) return;
      const domTabs = DOMAIN_TABLES_BY_IND[ind] || [];
      domTabs.forEach((tab, idx) => {
        if (!_ctx.canViewView || !_ctx.canViewView(tab.view, u)) return;
        let domRowCnt = 25 - idx;
        const ds = getDomainReg(ind, tab.key);
        if (ds && Array.isArray(ds.rows)) domRowCnt = ds.rows.length;
        const aliasStr = TABLE_ALIASES[tab.key] || '';
        const exactAliases = [tab.label];
        aliasStr.split(/\s+/).forEach(tok => { if (tok.length >= 3) exactAliases.push(tok); });
        const hubInfo = lookupHubInfoForView(tab.view);
        const subHubTitle = hubInfo.hubTitle || ind;
        const subTabTitle = (hubInfo.tabTitle && hubInfo.tabTitle !== subHubTitle && hubInfo.tabTitle !== tab.label)
          ? hubInfo.tabTitle
          : '';

        const domTblCandidate = makeCandidate({
          id: `domtable:${tab.key}`,
          kind: 'table',
          icon: hubInfo.icon || tab.view,
          titleEn: tab.label,
          subEn: subHubTitle,
          subTabEn: subTabTitle,
          subRaw: `${domRowCnt.toLocaleString('en-US')}`,
          industry: pctx.activeInd !== ind ? ind : '',
          badgeEn: 'Table',
          freq: usageScore('table', tab.key) + indBoost(ind) + Math.min(40000, domRowCnt * 25),
          exactAliases,
          aliases: `${aliasStr} table register جدول سجل`,
          extraHay: ind,
          filterable: tab.noFilter ? null : {
            kind: 'dom',
            view: tab.view,
            panelId: tab.panelId || '',
            fallbackKey: tab.domKey || tab.key,
            searchKey: 'search',
            forceInd: ind,
            domTabKey: tab.key,
            coColIdx: -1,
            cellRows: [],
            cellRowIds: []
          },
          run: () => {
            recordUsage('table', tab.key);
            ensureIndustryScope(ind, pctx);
            _ctx.setView(tab.view);
            focusWorkspaceTablePanel(tab.panelId || '', tab.domKey || tab.key);
          }
        });
        domTableItemByKey.set(tab.key, domTblCandidate);
        items.push(domTblCandidate);
      });
    });

    // 3. Entry Forms (43 FORM_GROUPS + 23 Sibling-Industry Domain Forms)
    const formGroups = (window.MFG_FORMS && Array.isArray(window.MFG_FORMS.FORM_GROUPS)) ? window.MFG_FORMS.FORM_GROUPS : [];
    const formToTableVolume = {
      sales: 'sales_tickets', receipt: 'receipts', vatinvoice: 'vat_invoices', pricerule: 'price_rules',
      creditterm: 'credit_terms', raw: 'raw_purchases', expense: 'expenses', recurringexpense: 'recurring_expenses',
      warehousestock: 'warehouse_movements', settlement: 'settlements', document: 'documents', jv: 'jv_partnerships',
      fuel: 'fuel_intakes', malfunction: 'fuel_malfunctions', companyequipment: 'company_equipment',
      defect: 'equipment_defects', repair: 'equipment_repairs', oillog: 'equipment_oil_logs', partlog: 'part_movements',
      triprate: 'overtime_rates', salary: 'salaries', attendance: 'attendance', workshift: 'work_shifts',
      employment: 'employments', staffassignment: 'staff_assignments', freelance: 'freelance_entries',
      logistics: 'logistics_allowances', external: 'external_movements', treasury: 'loans', conversion: 'conversions',
      customer: 'customers', supplier: 'suppliers', product: 'products', item: 'items',
      expensecategory: 'expense_categories', site: 'sites', region: 'regions', equipment: 'equipment',
      driver: 'drivers', staff: 'staff_members', staffrole: 'staff_roles', fxrate: 'fx_rates',
      vatrate: 'vat_rates', currency: 'currencies'
    };

    formGroups.forEach(grp => {
      const cleanGrpTitle = String((grp && grp.title) || '').replace(/^\d+\s*·\s*/, '');
      ((grp && grp.forms) || []).forEach(f => {
        if (!f || !f.id) return;
        if (!_ctx.canEnterForm || !_ctx.canEnterForm(f.id, u)) return;
        if ((f.id === 'vatinvoice' || f.id === 'vatrate') && _ctx.canSeeTaxBreakdown && !_ctx.canSeeTaxBreakdown(u)) return;
        const isMfgForm = MFG_ONLY_FORMS.has(f.id);
        if (isMfgForm && !pctx.permittedIndustries.has('Manufacturing')) return;

        const linkedTbl = formToTableVolume[f.id] || '';
        const baseVol = linkedTbl ? getScopedRows(linkedTbl, false).length : 20;
        const aliasStr = FORM_ALIASES[f.id] || '';
        const targetInd = isMfgForm ? 'Manufacturing' : '';

        items.push(makeCandidate({
          id: `form:${f.id}`,
          kind: 'form',
          icon: 'edit',
          titleEn: f.label,
          subEn: cleanGrpTitle || 'Entry Form',
          industry: isMfgForm && pctx.activeInd !== 'Manufacturing' ? 'Manufacturing' : '',
          badgeEn: 'Entry Form',
          freq: usageScore('form', f.id) + indBoost(targetInd) + Math.min(35000, baseVol),
          exactAliases: [f.label, `new ${f.label}`, `enter ${f.label}`, `add ${f.label}`],
          aliases: `${aliasStr} form new enter add create post ادخال اضافة جديد نموذج فورم saisir ajouter nouveau formulaire`,
          run: () => {
            if (isMfgForm) ensureIndustryScope('Manufacturing', pctx);
            _ctx.openEntryModal(f.id);
          }
        }));
      });
    });

    const canAnyDomainEntry = Boolean(
      (_ctx.canModifyRecord && _ctx.canModifyRecord(u)) ||
      (_ctx.canEnterForm && (_ctx.canEnterForm('sales', u) || _ctx.canEnterForm('expense', u) || _ctx.canEnterForm('extended', u)))
    );
    const domFormsByInd = _ctx.INDUSTRY_DOMAIN_FORMS_BY_IND || {};
    if (canAnyDomainEntry) {
      Object.keys(domFormsByInd).forEach(ind => {
        if (!pctx.permittedIndustries.has(ind)) return;
        (domFormsByInd[ind] || []).forEach((spec, idx) => {
          if (!spec || !spec.key) return;
          if (_ctx.canManageSiblingChronoSchedule && !_ctx.canManageSiblingChronoSchedule(spec.key, u)) return;
          if (Array.isArray(spec.matchViews) && spec.matchViews.length && _ctx.canViewView) {
            if (!spec.matchViews.some(v => _ctx.canViewView(v, u))) return;
          }
          const aliasStr = FORM_ALIASES[spec.key] || '';
          items.push(makeCandidate({
            id: `domform:${spec.key}`,
            kind: 'form',
            icon: spec.key,
            titleEn: spec.label,
            subEn: spec.title || ind,
            industry: pctx.activeInd !== ind ? ind : '',
            badgeEn: 'Entry Form',
            freq: usageScore('form', spec.key) + indBoost(ind) + (800 - idx * 40),
            exactAliases: [spec.label, spec.title || '', `new ${spec.label}`],
            aliases: `${aliasStr} form new enter add create ادخال اضافة جديد نموذج saisir ajouter nouveau`,
            run: () => {
              ensureIndustryScope(ind, pctx);
              _ctx.openIndustryDomainEntryModal(spec.key);
            }
          }));
        });
      });
    }

    // 4. Native Dashboards (12 MFG PBI_PAGES + 30 Sibling INDUSTRY_PBI_PAGES_SPEC)
    const canPbiView = Boolean(_ctx.canViewView && _ctx.canViewView('pbi', u));
    const canViewBooks = Boolean(_ctx.canViewView && _ctx.canViewView('cashflow', u));
    const restrictedBookPages = new Set(['p06_ar', 'p07_ap', 'p14_cashflow', 'p16_financial']);

    if (canPbiView && pctx.permittedIndustries.has('Manufacturing')) {
      const mfgPages = (window.MFG_PBI && Array.isArray(window.MFG_PBI.PBI_PAGES)) ? window.MFG_PBI.PBI_PAGES : [];
      mfgPages.forEach((p, idx) => {
        if (!p || !p.id) return;
        if (!canViewBooks && restrictedBookPages.has(p.id)) return;
        if (_ctx.canAccessPbiPage && !_ctx.canAccessPbiPage(p.id, u)) return;
        items.push(makeCandidate({
          id: `pbi:mfg:${p.id}`,
          kind: 'dashboard',
          icon: 'pbi',
          titleEn: p.label,
          subEn: p.title || p.group || 'Dashboards & Reports',
          industry: pctx.activeInd !== 'Manufacturing' ? 'Manufacturing' : '',
          badgeEn: 'Dashboard',
          freq: usageScore('dashboard', p.id) + indBoost('Manufacturing') + (1200 - idx * 50),
          exactAliases: [p.label, `dashboard ${p.num}`],
          aliases: `${p.title || ''} ${p.group || ''} dashboard analytics kpi chart لوحة قيادة تحليلات مؤشرات tableau de bord`,
          run: () => {
            recordUsage('dashboard', p.id);
            ensureIndustryScope('Manufacturing', pctx);
            pctx.STATE.pbiPage = p.id;
            _ctx.setView('pbi');
          }
        }));
      });
    }

    const indPbiSpec = _ctx.INDUSTRY_PBI_PAGES_SPEC || {};
    if (canPbiView) {
      Object.keys(indPbiSpec).forEach(ind => {
        if (!pctx.permittedIndustries.has(ind)) return;
        (indPbiSpec[ind] || []).forEach((p, idx) => {
          if (!p || !p.id) return;
          if (p.view && _ctx.canViewView && !_ctx.canViewView(p.view, u)) return;
          const dashKey = `${ind}:${p.id}`;
          items.push(makeCandidate({
            id: `pbi:${dashKey}`,
            kind: 'dashboard',
            icon: 'pbi',
            titleEn: p.label,
            subEn: p.title || ind,
            industry: pctx.activeInd !== ind ? ind : '',
            badgeEn: 'Dashboard',
            freq: usageScore('dashboard', dashKey) + indBoost(ind) + (1100 - idx * 50),
            exactAliases: [p.label],
            aliases: `${p.title || ''} ${ind} dashboard analytics kpi لوحة قيادة تحليلات tableau de bord`,
            run: () => {
              recordUsage('dashboard', dashKey);
              ensureIndustryScope(ind, pctx);
              if (!pctx.STATE.indPbiPageByInd) pctx.STATE.indPbiPageByInd = {};
              pctx.STATE.indPbiPageByInd[ind] = p.id;
              _ctx.setView('pbi');
            }
          }));
        });
      });
    }

    // 5. Printable Statements 01..27 (RDL_CATALOG)
    const canStmtView = Boolean(_ctx.canViewView && _ctx.canViewView('statements', u));
    const rdlCatalog = (window.MFG_RDL && Array.isArray(window.MFG_RDL.RDL_CATALOG)) ? window.MFG_RDL.RDL_CATALOG : [];
    if (canStmtView) {
      rdlCatalog.forEach((r, idx) => {
        if (!r) return;
        const code = String(r.id || r.code || '').padStart(2, '0');
        const vertInd = RDL_VERTICAL_INDUSTRY[code] || '';
        const isMfgOnlyStmt = (code === '11' || code === '12' || code === '17');
        let targetInd = '';
        if (vertInd) {
          if (!pctx.permittedIndustries.has(vertInd)) return;
          targetInd = vertInd;
        } else if (isMfgOnlyStmt) {
          if (!pctx.permittedIndustries.has('Manufacturing')) return;
          targetInd = 'Manufacturing';
        }
        const checkInd = targetInd || (pctx.permittedIndustries.has(pctx.activeInd) ? pctx.activeInd : Array.from(pctx.permittedIndustries)[0]);
        if (!canAccessRdlInIndustry(r, checkInd, pctx)) return;

        const aliasStr = STATEMENT_ALIASES[code] || '';
        items.push(makeCandidate({
          id: `stmt:${code}`,
          kind: 'statement',
          icon: 'statements',
          titleEn: r.title || r.name,
          subEn: r.cat || 'Statements',
          subRaw: `#${code}`,
          industry: targetInd && pctx.activeInd !== targetInd ? targetInd : '',
          badgeEn: 'Statement',
          freq: usageScore('statement', code) + indBoost(targetInd) + (1000 - idx * 25),
          exactAliases: [code, `#${code}`, `statement ${code}`, r.name || '', r.title || '', r.ar || '', r.fr || ''],
          aliases: `${aliasStr} ${r.ar || ''} ${r.fr || ''} statement report print pdf rdl كشف تقرير طباعة relevé état rapport`,
          filterable: stmtPickKeys(r).length ? { kind: 'stmt', code, targetInd, paramKeys: stmtPickKeys(r), resetKeys: stmtResetKeys(r) } : null,
          run: sel => {
            recordUsage('statement', code);
            if (targetInd) ensureIndustryScope(targetInd, pctx);
            pctx.STATE.activeStatement = code;
            if (sel && sel.key) applyStatementParamSelection(r, sel, pctx);
            _ctx.setView('statements');
          }
        }));
      });
    }

    // 6. Hubs & Sub-Tab Views (HUB_CATALOG)
    const hubCatalog = Array.isArray(_ctx.HUB_CATALOG) ? _ctx.HUB_CATALOG : [];
    const seenViews = new Set();
    hubCatalog.forEach((h, hIdx) => {
      if (!h || !h.id) return;
      if (h.industry && !pctx.permittedIndustries.has(h.industry)) return;
      if (!h.industry && ['sales', 'raw', 'fleet', 'warehouse'].includes(h.id) && !pctx.permittedIndustries.has('Manufacturing')) return;
      if (_ctx.canViewHub && !_ctx.canViewHub(h.id, u)) return;

      (h.tabs || []).forEach((t, tIdx) => {
        if (!t || !t.view || seenViews.has(t.view)) return;
        if (_ctx.canViewView && !_ctx.canViewView(t.view, u)) return;
        seenViews.add(t.view);
        const targetInd = h.industry || (['sales', 'raw', 'fleet', 'warehouse'].includes(h.id) ? 'Manufacturing' : '');
        const hubTitle = String(h.title || h.label || '').trim();
        items.push(makeCandidate({
          id: `view:${t.view}`,
          kind: 'dashboard',
          icon: h.id,
          titleEn: t.label,
          subEn: hubTitle,
          industry: targetInd && pctx.activeInd !== targetInd ? targetInd : '',
          badgeEn: 'Hub',
          freq: usageScore('view', t.view) + indBoost(targetInd) + (750 - hIdx * 20 - tIdx * 5),
          exactAliases: [t.label, tIdx === 0 ? hubTitle : ''],
          aliases: `${hubTitle} hub module page قسم شاشة module`,
          run: () => {
            if (targetInd) ensureIndustryScope(targetInd, pctx);
            _ctx.setView(t.view);
          }
        }));
      });
    });

    // 7. Named Master Records + Sibling Domain Records
    const freqIdx = (_ctx.getFreqIndex && _ctx.getFreqIndex()) || null;
    const freqLookup = (mapObj, name) => {
      if (!mapObj || !name || typeof mapObj.get !== 'function') return 0;
      return Number(mapObj.get(String(name).trim().toLowerCase()) || 0);
    };

    const masterSpecs = [
      { key: 'customers', badge: 'Record', sub: 'Customers Registry', icon: 'reg_customers', univ: true, freqMap: freqIdx && freqIdx.customers, fields: ['name', 'official_name', 'phone', 'contact', 'mof_no'] },
      { key: 'suppliers', badge: 'Record', sub: 'Suppliers & Haulers', icon: 'suppliers', univ: true, freqMap: freqIdx && freqIdx.suppliers, fields: ['name', 'official_name', 'phone', 'contact', 'mof_no'] },
      { key: 'equipment', badge: 'Record', sub: 'Equipment & Trucks', icon: 'reg_equipment', univ: true, mfgOnly: true, freqMap: freqIdx && freqIdx.equipment, fields: ['name', 'plate_no', 'serial_no', 'type', 'default_driver'] },
      { key: 'staff_members', badge: 'Record', sub: 'Staff Members', icon: 'reg_staff', univ: true, freqMap: freqIdx && freqIdx.staff, fields: ['name', 'role_category', 'phone', 'reference'] },
      { key: 'drivers', badge: 'Record', sub: 'Drivers & Operators', icon: 'reg_drivers', univ: true, mfgOnly: true, freqMap: freqIdx && freqIdx.drivers, fields: ['name', 'phone', 'truck_plate'] },
      { key: 'sites', badge: 'Record', sub: 'Sites', icon: 'sites', univ: true, mfgOnly: true, freqMap: freqIdx && freqIdx.sites, fields: ['name', 'region', 'customer', 'supplier'] },
      { key: 'products', badge: 'Record', sub: 'Products & Grades', icon: 'reg_products', univ: true, mfgOnly: true, freqMap: freqIdx && freqIdx.products, fields: ['name', 'family', 'type'] },
      { key: 'items', badge: 'Record', sub: 'Items & Spare Parts', icon: 'warehouse', univ: true, freqMap: null, fields: ['name', 'code', 'part_no', 'category'] },
      { key: 'loans', badge: 'Record', sub: 'Loans & Partner Advances', icon: 'ledger_treasury', univ: false, freqMap: null, fields: ['name', 'counterparty', 'reference'] }
    ];

    masterSpecs.forEach(ms => {
      if (ms.mfgOnly && !pctx.permittedIndustries.has('Manufacturing')) return;
      if (!_ctx.canAccessTable || !_ctx.canAccessTable(ms.key, u)) return;
      const rows = getScopedRows(ms.key, ms.univ);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const primaryName = String(r.name || r.official_name || r.plate_no || r.counterparty || '').trim();
        if (!primaryName) continue;
        const plate = r.plate_no ? String(r.plate_no).trim() : '';
        const dispTitle = (ms.key === 'equipment' && plate && !primaryName.includes(plate))
          ? `${primaryName} (${plate})`
          : primaryName;
        const extraTokens = ms.fields.map(fk => r[fk]).filter(Boolean).join(' ');
        const exactArr = [primaryName];
        if (plate) exactArr.push(plate, plate.replace(/\s+/g, ''));
        if (r.code) exactArr.push(String(r.code));
        if (r.part_no) exactArr.push(String(r.part_no));

        const opFreq = freqLookup(ms.freqMap, primaryName);
        const rowInd = r._industry || (ms.mfgOnly ? 'Manufacturing' : '');
        const rowCo = r.company ? String(r.company) : '';

        items.push(makeCandidate({
          id: `rec:${ms.key}:${r.id}`,
          kind: 'record',
          icon: ms.icon,
          titleEn: dispTitle,
          titleRaw: true,
          subEn: ms.sub,
          subRaw: rowCo || (plate || ''),
          industry: rowInd && pctx.activeInd !== rowInd ? rowInd : '',
          badgeEn: ms.badge,
          freq: usageScore('record', `${ms.key}:${r.id}`) + indBoost(rowInd) + opFreq * 10,
          exactAliases: exactArr,
          extraHay: extraTokens,
          run: () => {
            recordUsage('record', `${ms.key}:${r.id}`);
            if (rowCo || rowInd) ensureIndustryScope(rowInd || pctx.activeInd, pctx, rowCo);
            if (typeof _ctx.openRecordFromTableRow === 'function') {
              _ctx.openRecordFromTableRow(ms.key, r.id, null);
            }
          }
        }));
      }
    });

    // Sibling-Industry Named Domain Records + Exact Reference Indexing
    const pushExactRef = (refVal, hitObj) => {
      const nr = normRefCode(refVal);
      if (!nr || nr.length < 2) return;
      let arr = exactRefMap.get(nr);
      if (!arr) {
        arr = [];
        exactRefMap.set(nr, arr);
      }
      if (arr.length < 8 && !arr.some(x => x.id === hitObj.id)) {
        arr.push(hitObj);
      }
    };

    if (typeof _ctx.buildIndustryDomainTableRegister === 'function') {
      const editStore = (_ctx.getIndustryRowEditStore ? _ctx.getIndustryRowEditStore() : (pctx.STATE && pctx.STATE.industryRowEdits)) || {};
      const editKeys = Object.keys(editStore);
      Object.keys(DOMAIN_TABLES_BY_IND).forEach(ind => {
        if (!pctx.permittedIndustries.has(ind)) return;
        const indPrefix = `${ind}::`;
        const indEditsByRowId = new Map();
        for (let ek = 0; ek < editKeys.length; ek++) {
          const fullKey = editKeys[ek];
          if (!fullKey.startsWith(indPrefix)) continue;
          const saved = editStore[fullKey];
          if (!saved || typeof saved !== 'object') continue;
          const parts = fullKey.split('::');
          const pid = String(saved.primaryId || parts[parts.length - 1] || '').trim();
          if (!pid) continue;
          const prev = indEditsByRowId.get(pid);
          if (!prev || Number(saved.rev || 0) >= Number(prev.rev || 0)) {
            indEditsByRowId.set(pid, saved);
          }
        }

        (DOMAIN_TABLES_BY_IND[ind] || []).forEach(tab => {
          if (_ctx.canViewView && !_ctx.canViewView(tab.view, u)) return;
          const ds = getDomainReg(ind, tab.key);
          if (!ds || !Array.isArray(ds.rows)) return;
          const hdrs = Array.isArray(ds.headers) ? ds.headers : [];
          const coColIdx = hdrs.findIndex(h => /\b(company|entity|resort|subsidiary)\b/i.test(String(h || '')));
          const dsTableTitle = ds.tableTitle || tab.label || '';
          let keptCount = 0;
          let validRowCnt = 0;
          const domTblRef = (typeof domTableItemByKey !== 'undefined' && domTableItemByKey) ? domTableItemByKey.get(tab.key) : null;
          const domFacetRows = (domTblRef && domTblRef.filterable) ? domTblRef.filterable.cellRows : null;
          if (domFacetRows) {
            domFacetRows.length = 0;
            domTblRef.filterable.cellRowIds.length = 0;
            domTblRef.filterable.coColIdx = coColIdx;
          }

          ds.rows.forEach((rawCells, rIdx) => {
            if (!Array.isArray(rawCells) || !rawCells.length) return;
            const origRowId = String(rawCells._rid || rawCells[0] || '').trim();
            if (!origRowId) return;
            let cells = rawCells;
            const isTillOwned = Boolean(_ctx.isTillOwnedRowId && _ctx.isTillOwnedRowId(origRowId));
            if (!isTillOwned) {
              const exactEditKey = _ctx.makeIndustryRowEditKey
                ? _ctx.makeIndustryRowEditKey(ind, dsTableTitle, origRowId)
                : `${ind}::${String(dsTableTitle).replace(/\(\d+[^)]*\)/g, '').trim().slice(0, 60)}::${origRowId}`;
              const savedEdit = editStore[exactEditKey] || indEditsByRowId.get(origRowId) || null;
              if (savedEdit) {
                if (savedEdit.voided) return;
                if (Array.isArray(savedEdit.cells) && savedEdit.cells.length) {
                  cells = _ctx.projectSavedDomainCellsToHeaders
                    ? _ctx.projectSavedDomainCellsToHeaders(savedEdit, hdrs, rawCells)
                    : savedEdit.cells;
                }
              }
            }
            const rowId = String(rawCells._rid || cells._rid || cells[0] || origRowId).trim();
            if (!rowId) return;
            const visRef = String(cells[0] || '').trim();
            const rowCo = coColIdx >= 0 ? String(cells[coColIdx] || '').trim() : '';
            const normRowCo = rowCo ? normCoKey(rowCo) : '';
            if (normRowCo && !pctx.demoActive && pctx.catalogByNormName.has(normRowCo) && !pctx.allowedCosNormSet.has(normRowCo)) {
              return;
            }
            if (pctx.offScope && normRowCo === 'properties') {
              return;
            }
            validRowCnt++;
            if (domFacetRows) {
              domFacetRows.push(cells);
              domTblRef.filterable.cellRowIds.push(origRowId);
            }
            const labelParts = cells.slice(0, 4).map(c => String(c || '').trim()).filter(Boolean);
            const titleDisp = labelParts.slice(0, 2).join(' · ') || rowId;
            const subRaw = labelParts.slice(2, 4).join(' · ');
            const runFn = () => {
              recordUsage('record', `${tab.key}:${rowId}`);
              ensureIndustryScope(ind, pctx, rowCo);
              if (typeof _ctx.navigateToRecordOrDomainRow === 'function') {
                _ctx.navigateToRecordOrDomainRow(tab.domKey, rowId, rowId, rowCo);
              }
            };
            if (keptCount < 350) {
              keptCount++;
              const candidate = makeCandidate({
                id: `domrec:${tab.key}:${rowId}:${rIdx}`,
                kind: 'record',
                icon: tab.view,
                titleEn: titleDisp,
                titleRaw: true,
                subEn: tab.label,
                subRaw: rowCo || subRaw,
                industry: pctx.activeInd !== ind ? ind : '',
                badgeEn: 'Record',
                freq: usageScore('record', `${tab.key}:${rowId}`) + indBoost(ind) + Math.max(1, 200 - rIdx),
                exactAliases: [rowId, visRef !== rowId ? visRef : '', cells[1] ? String(cells[1]) : ''],
                extraHay: cells.slice(0, 5).join(' '),
                run: runFn
              });
              items.push(candidate);
              pushExactRef(rowId, candidate);
              if (visRef && visRef !== rowId) pushExactRef(visRef, candidate);
            } else {
              const fallbackHit = {
                id: `domrec:${tab.key}:${rowId}:${rIdx}`,
                kind: 'record',
                icon: tab.view,
                titleEn: titleDisp,
                titleRaw: true,
                subEn: tab.label,
                subRaw: rowCo || subRaw,
                industry: pctx.activeInd !== ind ? ind : '',
                badgeEn: 'Record',
                freq: usageScore('record', `${tab.key}:${rowId}`) + indBoost(ind) + 1,
                exactSet: new Set(),
                hay: '',
                hayWords: [],
                run: runFn
              };
              pushExactRef(rowId, fallbackHit);
              if (visRef && visRef !== rowId) pushExactRef(visRef, fallbackHit);
            }
          });
          if (domTblRef) {
            domTblRef.subRaw = `${validRowCnt.toLocaleString('en-US')}`;
            domTblRef.freq = usageScore('table', tab.key) + indBoost(ind) + Math.min(40000, validRowCnt * 25);
          }
        });
      });
    }

    // 8. O(1) Exact Ticket / Invoice / Voucher / Reference Number Index across Transaction Tables
    const txRefSpecs = [
      { key: 'sales_tickets', sub: 'Sales Tickets', mfgOnly: true, fields: ['ticket_no', 'origin_ticket_no', 'external_invoice', 'vat_invoice', 'name', 'id'], partyField: 'customer' },
      { key: 'raw_purchases', sub: 'Raw Material Purchases', mfgOnly: true, fields: ['ticket_no', 'origin_ticket_no', 'invoice', 'name', 'id'], partyField: 'site_owner' },
      { key: 'fuel_intakes', sub: 'Fuel & Lubricant Intakes', mfgOnly: true, fields: ['ticket_no', 'invoice', 'name', 'id'], partyField: 'equipment' },
      { key: 'vat_invoices', sub: 'VAT 11% Tax Invoices', mfgOnly: true, taxOnly: true, fields: ['invoice_no', 'name', 'id'], partyField: 'customer' },
      { key: 'expenses', sub: 'General & Fleet Expenses', fields: ['invoice', 'invoice_no', 'voucher_no', 'reference', 'name', 'id'], partyField: 'supplier' },
      { key: 'receipts', sub: 'Customer Receipts (AR)', fields: ['invoice', 'voucher_no', 'reference', 'name', 'id'], partyField: 'customer' },
      { key: 'settlements', sub: 'Supplier Settlements (AP)', fields: ['invoice', 'voucher_no', 'reference', 'name', 'id'], partyField: 'supplier' },
      { key: 'salaries', sub: 'Staff Salary Payments', fields: ['voucher_no', 'reference', 'name', 'id'], partyField: 'staff' },
      { key: 'external_movements', sub: 'External & Extended Movements', fields: ['reference', 'voucher_no', 'name', 'id'], partyField: 'counterparty' },
      { key: 'loan_settlements', sub: 'Loan Repayments & Drawdowns', fields: ['reference', 'name', 'id'], partyField: 'counterparty' },
      { key: 'equipment_repairs', sub: 'Equipment Repairs', mfgOnly: true, fields: ['invoice', 'reference', 'name', 'id'], partyField: 'equipment' },
      { key: 'documents', sub: 'Document & Receipt Vault', fields: ['doc_no', 'reference', 'name', 'id'], partyField: 'counterparty' }
    ];

    txRefSpecs.forEach(ts => {
      if (ts.mfgOnly && !pctx.permittedIndustries.has('Manufacturing')) return;
      if (ts.taxOnly && _ctx.canSeeTaxBreakdown && !_ctx.canSeeTaxBreakdown(u)) return;
      if (!_ctx.canAccessTable || !_ctx.canAccessTable(ts.key, u)) return;
      const rows = getScopedRows(ts.key, false);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const primaryRef = ts.fields.map(fk => r[fk]).find(v => v != null && String(v).trim() !== '');
        if (!primaryRef) continue;
        const party = String(r[ts.partyField] || r.supplier || r.customer || r.company || '').trim();
        const dt = String(r.date || r.tx_date || '').slice(0, 10);
        const rowCo = r.company ? String(r.company) : '';
        const rowInd = r._industry || (ts.mfgOnly ? 'Manufacturing' : '');
        const hitObj = {
          id: `txref:${ts.key}:${r.id}`,
          kind: 'record',
          icon: 'receipt',
          titleEn: `#${String(primaryRef).replace(/^#+/, '')}${party ? ' · ' + party : ''}`,
          titleRaw: true,
          subEn: ts.sub,
          subRaw: [rowCo, dt].filter(Boolean).join(' · '),
          industry: rowInd && pctx.activeInd !== rowInd ? rowInd : '',
          badgeEn: 'Ticket / Ref',
          freq: 900000,
          exactSet: new Set(),
          hay: '',
          run: () => {
            recordUsage('table', ts.key);
            if (rowCo || rowInd) ensureIndustryScope(rowInd || pctx.activeInd, pctx, rowCo);
            if (typeof _ctx.openRecordFromTableRow === 'function') {
              _ctx.openRecordFromTableRow(ts.key, r.id, null);
            }
          }
        };
        for (let fIdx = 0; fIdx < ts.fields.length; fIdx++) {
          const val = r[ts.fields[fIdx]];
          if (val != null && String(val).trim() !== '') {
            pushExactRef(val, hitObj);
          }
        }
      }
    });

    _cachedIndex = {
      pctx,
      items,
      exactRefMap
    };
    _cachedIndexKey = cacheKey;
    return _cachedIndex;
  }

  function search(rawQuery, opts) {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const catFilter = options.category || (_isOpen ? _catFilter : 'all') || 'all';
    const idx = buildSearchIndex();
    if (!idx) {
      return { query: '', hasEntryIntent: false, exactCount: 0, totalCount: 0, items: [], showAskFallback: false };
    }

    const qTrim = String(rawQuery == null ? '' : rawQuery).trim();
    const matchCategory = item => {
      if (catFilter === 'all') return true;
      if (catFilter === 'tables') return item.kind === 'table';
      if (catFilter === 'forms') return item.kind === 'form';
      if (catFilter === 'dashboards') return item.kind === 'dashboard';
      if (catFilter === 'statements') return item.kind === 'statement';
      if (catFilter === 'records') return item.kind === 'record';
      return true;
    };

    // Before typing: show seat's most-used permitted tables + quick entry forms/views (Hard Rule 11)
    if (!qTrim) {
      if (catFilter !== 'all') {
        const pool = idx.items.filter(matchCategory).slice().sort((a, b) => b.freq - a.freq).slice(0, 24);
        return { query: '', hasEntryIntent: false, exactCount: 0, totalCount: pool.length, items: pool, showAskFallback: false };
      }
      const topTables = idx.items
        .filter(it => it.kind === 'table')
        .slice()
        .sort((a, b) => b.freq - a.freq)
        .slice(0, 8)
        .map(it => Object.assign({}, it, { sectionEn: 'Most-Used Tables' }));
      const topQuick = idx.items
        .filter(it => it.kind === 'form' || it.kind === 'dashboard' || it.kind === 'statement')
        .slice()
        .sort((a, b) => b.freq - a.freq)
        .slice(0, 6)
        .map(it => Object.assign({}, it, { sectionEn: 'Quick Entry Forms & Views' }));
      const combined = topTables.concat(topQuick);
      return { query: '', hasEntryIntent: false, exactCount: 0, totalCount: combined.length, items: combined, showAskFallback: false };
    }

    const qNorm = normSearch(qTrim);
    const rawTokens = qNorm ? qNorm.split(' ').filter(Boolean) : [];
    let hasEntryIntent = false;
    rawTokens.forEach(tok => {
      if (ENTRY_INTENT_WORDS.has(tok)) hasEntryIntent = true;
    });
    const contentTokens = rawTokens.filter(tok => !QUESTION_STOP_WORDS.has(tok) && !ENTRY_INTENT_WORDS.has(tok));
    const activeTokens = contentTokens.length ? contentTokens : rawTokens;
    const contentNorm = activeTokens.join(' ');

    const exact = [];
    const freqOrdered = [];
    const seenIds = new Set();

    // 1. Exact Ticket / Invoice / Voucher / Reference Number O(1) hits
    if (catFilter === 'all' || catFilter === 'records') {
      const qRef = normRefCode(qTrim);
      const refHits = qRef ? (idx.exactRefMap.get(qRef) || []) : [];
      for (let i = 0; i < refHits.length; i++) {
        const h = refHits[i];
        if (!seenIds.has(h.id)) {
          seenIds.add(h.id);
          exact.push(Object.assign({}, h, { _exactTier: 0, isExact: true, sectionEn: 'Exact Matches' }));
        }
      }
    }

    // 2. Deterministic match across all permitted Tables, Forms, Dashboards, Statements, Hubs & Named Records
    const minNamedRecordLen = activeTokens.length === 1 && activeTokens[0].length < 2;
    for (let i = 0; i < idx.items.length; i++) {
      const it = idx.items[i];
      if (seenIds.has(it.id)) continue;
      if (!matchCategory(it)) continue;
      if (it.kind === 'record' && minNamedRecordLen) continue;

      let allMatch = activeTokens.length > 0;
      for (let t = 0; t < activeTokens.length; t++) {
        const tok = activeTokens[t];
        if (it.kind === 'record' && tok.length <= 3) {
          let wordHit = false;
          const hw = it.hayWords || [];
          for (let w = 0; w < hw.length; w++) {
            if (hw[w].startsWith(tok)) {
              wordHit = true;
              break;
            }
          }
          if (!wordHit) {
            allMatch = false;
            break;
          }
        } else if (!it.hay.includes(tok)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) continue;

      const isDirectExact = it.exactSet.has(qNorm) || (contentNorm && it.exactSet.has(contentNorm));
      const isIntentFormMatch = hasEntryIntent && it.kind === 'form';
      if (isDirectExact || isIntentFormMatch) {
        const exactTier = (hasEntryIntent && it.kind === 'form') ? 0 : 1;
        exact.push(Object.assign({}, it, { _exactTier: exactTier, isExact: true, sectionEn: 'Exact Matches' }));
      } else {
        freqOrdered.push(Object.assign({}, it, { isExact: false, sectionEn: 'Matching Results' }));
      }
      seenIds.add(it.id);
    }

    // Hard Rule 11: exact match first, then operational usage frequency (stable sort, zero localeCompare / startsWith tiers)
    exact.sort((a, b) => (a._exactTier - b._exactTier) || (b.freq - a.freq));
    freqOrdered.sort((a, b) => b.freq - a.freq);

    const merged = exact.concat(freqOrdered);
    return {
      query: qTrim,
      hasEntryIntent,
      exactCount: exact.length,
      totalCount: merged.length,
      items: merged.slice(0, 40),
      showAskFallback: merged.length === 0
    };
  }

  // ==========================================================================
  // Tab-to-Filter: Tab on a highlighted table result pins it as an inline chip;
  // the typed text (or a frequency-ranked value of that table) opens the sidebar
  // hub & panel with the table filter already applied. 100% deterministic.
  // ==========================================================================
  const SEARCH_PLACEHOLDER_EN = 'Search tables, forms, reports, clients, plates, or ticket #...';
  const FILTER_PLACEHOLDER_EN = 'Type a client, plate, material, or reference to filter this table...';

  const STMT_PLACEHOLDER_EN = 'Type a customer, supplier, driver, account, or document number for this statement...';
  const FILTER_HINT_EN = 'Narrow this table before it opens';
  const STMT_HINT_EN = 'Choose who or what this statement is for before it opens';
  const FILTER_TAB_HINT_EN = 'Filter table';
  const STMT_TAB_HINT_EN = 'Set parameter';
  const FILTER_CHIP_X_EN = 'Remove table filter';
  const STMT_CHIP_X_EN = 'Remove statement parameter';

  function isFilterableItem(it) {
    return Boolean(it && (it.kind === 'table' || it.kind === 'statement') && it.filterable && typeof it.run === 'function');
  }

  function isStatementTarget(it) {
    return Boolean(it && it.kind === 'statement' && it.filterable && it.filterable.kind === 'stmt');
  }

  // Runs fn with STATE pointed at the scope the statement will land in (same temporary switch as the access check),
  // and puts the live scope and the statement's own parameters back afterwards, whatever fn does.
  function withStatementLandingScope(f, pctx, fn) {
    const STATE = pctx.STATE;
    const curInd = (_ctx.getActiveIndustry && _ctx.getActiveIndustry(STATE.company)) || 'Manufacturing';
    const savedCompany = STATE.company;
    const savedDemoInd = STATE.demoCompanyIndustry;
    const savedRdl = STATE.rdl;
    const savedParams = (savedRdl && savedRdl.params) ? Object.assign({}, savedRdl.params) : null;
    const cross = Boolean(f.targetInd && f.targetInd !== curInd);
    try {
      if (cross) {
        if (pctx.isDemoCompany) {
          STATE.demoCompanyIndustry = f.targetInd;
        } else {
          const scopes = pctx.permittedScopesByInd.get(f.targetInd) || [];
          if (!scopes[0]) return null;
          STATE.company = scopes[0];
        }
      }
      return fn();
    } finally {
      STATE.company = savedCompany;
      STATE.demoCompanyIndustry = savedDemoInd;
      if (!savedRdl) {
        try { delete STATE.rdl; } catch (_) {}
      } else {
        STATE.rdl = savedRdl;
        if (savedParams) {
          Object.keys(savedRdl.params).forEach(k => {
            if (!(k in savedParams)) delete savedRdl.params[k];
          });
          Object.assign(savedRdl.params, savedParams);
        }
      }
    }
  }

  // Values of the pinned statement's own pickers, read through the statement engine in the landing scope:
  // the same list, the same seat and company limits and the same usage order the statement itself offers.
  function buildStatementParamOptions(target) {
    const f = target && target.filterable;
    const pctx = _cachedIndex ? _cachedIndex.pctx : null;
    const rdlApi = (typeof window !== 'undefined') ? window.MFG_RDL : null;
    if (!f || !pctx || !_ctx || !rdlApi || typeof rdlApi.buildRdlContext !== 'function' || typeof rdlApi.getParamComboConfig !== 'function') return [];
    // Never read the statement engine before the seat's company limits are on STATE
    if (!Array.isArray(pctx.STATE.allowedCompanyNames)) return [];
    if (stmtChipBlockedForScope(f.targetInd || (_ctx.getActiveIndustry && _ctx.getActiveIndustry(pctx.STATE.company)) || 'Manufacturing')) return [];
    let built = null;
    try {
      built = withStatementLandingScope(f, pctx, () => {
        const rctx = rdlApi.buildRdlContext(pctx.SEED, pctx.STATE);
        if (f._optsRef === rctx.customers && Array.isArray(f._opts)) return f._opts;
        const perKey = [];
        f.paramKeys.forEach((k, kIdx) => {
          const cfg = rdlApi.getParamComboConfig(k, rctx);
          if (!cfg || !Array.isArray(cfg.options)) return;
          const isDoc = STMT_DOC_PARAMS.has(k);
          // A register reads one ledger while its picker lists every party: keep only the values that ledger carries,
          // so a suggested name never opens an empty register
          const src = (STMT_VALUE_SOURCES[f.code] || {})[k];
          let liveCount = null;
          if (src && Array.isArray(rctx[src[0]])) {
            liveCount = new Map();
            rctx[src[0]].forEach(row => {
              if (!row || row.is_receipt_row || row[src[1]] == null) return;
              const v = String(row[src[1]]);
              liveCount.set(v, (liveCount.get(v) || 0) + 1);
            });
          }
          let rank = 0;
          cfg.options.forEach(o => {
            if (!o || o.value === 'ALL' || o.value == null || o.value === '') return;
            if (liveCount && !liveCount.has(String(o.value))) return;
            const main = String(o.main || o.label || o.value);
            const code = (o.code && o.code !== 'ALL') ? String(o.code) : '';
            perKey.push({
              key: k,
              keyIdx: kIdx,
              rank: rank++,
              count: liveCount ? (liveCount.get(String(o.value)) || 0) : 0,
              value: String(o.value),
              paramLabelEn: String(cfg.label || ''),
              isDoc,
              codeRef: code ? normRefCode(code) : '',
              main,
              title: code ? `${code} · ${main}` : main,
              fill: code ? `${code} ${main}` : main,
              meta: isDoc ? String(o.meta || '') : '',
              hayRaw: `${code} ${main} ${o.q || ''}`,
              norm: null,
              exactA: null,
              exactB: null
            });
          });
        });
        // One list across the statement's pickers. A register with several pickers ranks every value by its row count in
        // that register's ledger; a single-picker statement keeps the picker's own usage order (count is 0 for all)
        perKey.sort((a, b) => (b.count - a.count) || (a.rank - b.rank) || (a.keyIdx - b.keyIdx));
        f._optsRef = rctx.customers;
        f._opts = perKey;
        return perKey;
      });
    } catch (_) {
      built = null;
    }
    return built || [];
  }

  // Hard Rule 11: exact value first, then the statement picker's own usage order, never alphabetical
  function searchStatementParamOptions(target, rawTerm) {
    const opts = buildStatementParamOptions(target);
    const qn = normSearch(rawTerm);
    if (!qn) return opts.slice(0, FILTER_SUGGEST_LIMIT);
    const toks = qn.split(' ');
    const qRef = normRefCode(rawTerm);
    const exact = [];
    const rest = [];
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      if (o.norm === null) {
        o.norm = normSearch(o.hayRaw);
        o.exactA = normSearch(o.fill);
        o.exactB = normSearch(o.main);
      }
      let ok = true;
      for (let t = 0; t < toks.length; t++) {
        if (!o.norm.includes(toks[t])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (o.exactA === qn || o.exactB === qn || (o.codeRef && o.codeRef === qRef)) {
        if (exact.length < FILTER_SUGGEST_LIMIT) exact.push(o);
      } else if (rest.length < FILTER_SUGGEST_LIMIT) {
        rest.push(o);
      }
    }
    return exact.concat(rest).slice(0, FILTER_SUGGEST_LIMIT);
  }

  function facetTextOf(val, colKey) {
    if (val == null || val === '' || typeof val === 'boolean' || typeof val === 'object') return '';
    const isRefCol = Boolean(colKey && FILTER_FACET_REF_KEY_RE.test(colKey));
    if (typeof val === 'number') {
      return (isRefCol && Number.isInteger(val) && val > 9) ? String(val) : '';
    }
    const s = String(val).replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 64) return '';
    if (s.indexOf(':') >= 0 || s.indexOf('"') >= 0 || s.indexOf('<') >= 0) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return '';
    if (/^[\d\s.,%$+\-/()]+$/.test(s)) return (isRefCol && /^\d{2,24}$/.test(s)) ? s : '';
    // Internal option codes (same_equipment) and measured figures ("0 LL", "1.08x (Optimal)") are not names to filter by
    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return '';
    if (/^[\d(+\-]/.test(s) && /\s/.test(s)) return '';
    // Auto-generated record labels ("Loan 2026-08-10 ... #792", "CRD-20240101-...", "OIL-0007") are one-off ids, not filter values
    if (/\d{4}-\d{2}-\d{2}/.test(s) || /(^|[^0-9])20\d{2}(0[1-9]|1[0-2])([0-2]\d|3[01])([^0-9]|$)/.test(s)) return '';
    if (/^[A-Z]{2,6}(-\d{4})?-\d{3,5}$/.test(s)) return '';
    return s;
  }

  // Rows the landing table is about to show: this seat's permitted rows, narrowed to the company scope and
  // date range the hub will open in, so a suggested value never leads to an empty table.
  function getLandingFacetRows(f) {
    const permitted = (typeof f.rowsFn === 'function' ? f.rowsFn() : null) || [];
    const pctx = _cachedIndex ? _cachedIndex.pctx : null;
    if (!permitted.length || !pctx || !_ctx || !_ctx.STATE) return permitted;
    const STATE = _ctx.STATE;
    const curInd = (_ctx.getActiveIndustry && _ctx.getActiveIndustry(STATE.company)) || 'Manufacturing';
    let scopeKey = STATE.company;
    let landInd = curInd;
    if (f.forceInd && f.forceInd !== curInd) {
      if (pctx.isDemoCompany) return permitted;
      const scopes = pctx.permittedScopesByInd.get(f.forceInd) || [];
      if (!scopes[0]) return permitted;
      scopeKey = scopes[0];
      landInd = f.forceInd;
    }
    if (f.universal) {
      const rawList = (pctx.SEED && pctx.SEED.records && pctx.SEED.records[f.tableKey]) || [];
      const hasMultiSeed = Boolean(rawList._hasMultiIndustrySeed);
      return permitted.filter(r => {
        if (r._industry && r._industry !== landInd) return false;
        if (hasMultiSeed && (r._industry || 'Manufacturing') !== landInd) return false;
        return true;
      });
    }
    if (typeof _ctx.filterRecords !== 'function') return permitted;
    const rawList = (pctx.SEED && pctx.SEED.records && pctx.SEED.records[f.tableKey]) || [];
    let scoped = [];
    try {
      scoped = _ctx.filterRecords(rawList, {
        company: scopeKey,
        ignoreSearch: true,
        tableKey: f.tableKey,
        user: pctx.user
      }) || [];
    } catch (_) {
      return permitted;
    }
    const permittedSet = new Set(permitted);
    return scoped.filter(r => permittedSet.has(r));
  }

  function getLandingFacetCellRows(f) {
    const cellRows = f.cellRows || [];
    if (!cellRows.length || !_ctx || !_ctx.STATE) return cellRows;
    const STATE = _ctx.STATE;
    const curInd = (_ctx.getActiveIndustry && _ctx.getActiveIndustry(STATE.company)) || 'Manufacturing';
    if (f.forceInd && f.forceInd !== curInd) return cellRows;
    // Already inside this industry: keep only the permitted rows the hub register lists for the live company scope and dates
    if (f.domTabKey && Array.isArray(f.cellRowIds) && typeof _ctx.buildIndustryDomainTableRegister === 'function') {
      const savedSearch = STATE.search;
      try {
        STATE.search = '';
        const live = _ctx.buildIndustryDomainTableRegister(f.forceInd, f.domTabKey);
        if (live && Array.isArray(live.rows)) {
          const liveIds = new Set();
          for (let i = 0; i < live.rows.length; i++) {
            const lr = live.rows[i];
            if (Array.isArray(lr) && lr.length) liveIds.add(String(lr._rid || lr[0] || '').trim());
          }
          return cellRows.filter((cells, i) => liveIds.has(f.cellRowIds[i]));
        }
      } catch (_) {
        /* fall through to the company-column narrowing */
      } finally {
        STATE.search = savedSearch;
      }
    }
    if (!(f.coColIdx >= 0)) return cellRows;
    const buName = _ctx.COMPANY_BU_MATCH ? _ctx.COMPANY_BU_MATCH[STATE.company] : '';
    if (!buName) return cellRows;
    const want = normCoKey(buName);
    return cellRows.filter(cells => {
      const co = normCoKey(cells[f.coColIdx]);
      return !co || co === want;
    });
  }

  // Values of the pinned table, counted over the rows this seat is permitted to see (same scoped rows as the index).
  // A column counts as naming something (client, plate, material, site) when it carries enough distinct values;
  // short option lists (unit, method, status) stay searchable by typing but never lead the before-typing list.
  function buildFilterFacets(target) {
    const f = target && target.filterable;
    if (!f) return [];
    const st = (_ctx && _ctx.STATE) || {};
    const facetsKey = [st.company, st.demoCompanyIndustry, st.period, st.dateFilter, st.dateFrom, st.dateTo, st.basis].join('|');
    if (Array.isArray(f._facets) && f._facetsKey === facetsKey) return f._facets;
    const tally = new Map();
    const colDistinct = new Map();
    let rowCnt = 0;
    const bump = (label, rowSeen, colId) => {
      const k = label.toLowerCase();
      let dset = colDistinct.get(colId);
      if (!dset) {
        dset = new Set();
        colDistinct.set(colId, dset);
      }
      dset.add(k);
      if (rowSeen.indexOf(k) >= 0) return;
      rowSeen.push(k);
      const hit = tally.get(k);
      if (hit) {
        hit.count++;
        if (hit.cols.indexOf(colId) < 0) hit.cols.push(colId);
      } else {
        tally.set(k, { label, count: 1, norm: null, cols: [colId], named: false });
      }
    };
    if (f.kind === 'seed') {
      const u = (_ctx && _ctx.activeUser) ? _ctx.activeUser() : null;
      const hideTax = Boolean(_ctx && _ctx.canSeeTaxBreakdown && !_ctx.canSeeTaxBreakdown(u));
      const rows = getLandingFacetRows(f);
      const cols = (f.facetCols || f.cols || []).filter(ck => ck
        && !FILTER_FACET_SKIP_KEY_RE.test(ck)
        && !(hideTax && /vat|tax|iva/i.test(ck)));
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        rowCnt++;
        const rowSeen = [];
        for (let c = 0; c < cols.length; c++) {
          const txt = facetTextOf(r[cols[c]], cols[c]);
          if (txt) bump(txt, rowSeen, cols[c]);
        }
      }
    } else {
      const cellRows = getLandingFacetCellRows(f);
      for (let i = 0; i < cellRows.length; i++) {
        const cells = cellRows[i];
        if (!Array.isArray(cells)) continue;
        rowCnt++;
        const rowSeen = [];
        const lim = Math.min(cells.length, 9);
        for (let c = 1; c < lim; c++) {
          const raw = cells[c];
          if (typeof raw !== 'string' || !raw) continue;
          const parts = raw.indexOf(' · ') >= 0 ? raw.split(' · ') : [raw];
          for (let p = 0; p < parts.length; p++) {
            const txt = facetTextOf(parts[p], '');
            if (txt) bump(txt, rowSeen, c);
          }
        }
      }
    }
    const namedMin = Math.min(8, Math.max(2, Math.ceil(rowCnt / 4)));
    const namedCols = new Set();
    const serialCols = new Set();
    colDistinct.forEach((dset, colId) => {
      if (dset.size >= namedMin) namedCols.add(colId);
      // A document-number column where nearly every row carries its own value (ticket #, voucher #) is a serial,
      // not a filter value; name, plate and chassis columns stay even when unique (registries list one row per name)
      if (rowCnt > 200 && dset.size > rowCnt * 0.9 && typeof colId === 'string' && FILTER_FACET_SERIAL_KEY_RE.test(colId)) serialCols.add(colId);
    });
    // Belt and braces on top of the row scoping: never suggest a company this seat cannot open
    const pctxNow = _cachedIndex ? _cachedIndex.pctx : null;
    const blockedCo = label => {
      if (!pctxNow || pctxNow.demoActive) return false;
      const nk = normCoKey(label);
      return Boolean(nk) && pctxNow.catalogByNormName.has(nk) && !pctxNow.allowedCosNormSet.has(nk);
    };
    const out = [];
    tally.forEach(fc => {
      if (fc.cols.every(colId => serialCols.has(colId))) return;
      if (blockedCo(fc.label)) return;
      fc.named = fc.cols.some(colId => namedCols.has(colId));
      out.push(fc);
    });
    out.sort((a, b) => b.count - a.count);
    f._facets = out;
    f._facetsKey = facetsKey;
    return out;
  }

  // Hard Rule 11: exact value first, then operational frequency (row count in the pinned table), never alphabetical
  function searchFilterFacets(target, rawTerm) {
    const facets = buildFilterFacets(target);
    const qn = normSearch(rawTerm);
    if (!qn) {
      const named = facets.filter(fc => fc.named);
      const pool = named.length >= 3 ? named : facets;
      return pool.slice(0, FILTER_SUGGEST_LIMIT).map(fc => ({ label: fc.label, count: fc.count, isExact: false }));
    }
    const toks = qn.split(' ');
    const exact = [];
    const rest = [];
    for (let i = 0; i < facets.length; i++) {
      const fc = facets[i];
      if (fc.norm === null) fc.norm = normSearch(fc.label);
      let ok = true;
      for (let t = 0; t < toks.length; t++) {
        if (!fc.norm.includes(toks[t])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (fc.norm === qn) {
        exact.push({ label: fc.label, count: fc.count, isExact: true });
      } else if (rest.length < FILTER_SUGGEST_LIMIT) {
        rest.push({ label: fc.label, count: fc.count, isExact: false });
      }
    }
    return exact.concat(rest).slice(0, FILTER_SUGGEST_LIMIT);
  }

  function getFilterTarget() {
    if (!_filterTarget) return null;
    const idx = buildSearchIndex();
    if (!idx) {
      _filterTarget = null;
      return null;
    }
    if (_filterIndexRef !== idx) {
      const wantId = _filterTarget.id;
      _filterTarget = idx.items.find(x => x.id === wantId && isFilterableItem(x)) || null;
      _filterIndexRef = idx;
    }
    return _filterTarget;
  }

  function syncFootHints() {
    if (typeof document === 'undefined') return;
    const tabHint = document.getElementById('cmdPaletteTabHint');
    const backHint = document.getElementById('cmdPaletteBackHint');
    const inFilter = Boolean(_filterTarget);
    const cur = _currentItems[_activeIdx];
    if (tabHint) {
      tabHint.hidden = inFilter || !isFilterableItem(cur);
      if (!tabHint.hidden) setEnglishText(document.getElementById('cmdPaletteTabHintLbl'), isStatementTarget(cur) ? STMT_TAB_HINT_EN : FILTER_TAB_HINT_EN);
    }
    if (backHint) backHint.hidden = !inFilter;
  }

  // Swaps a translated label for another English source string and lets the i18n layer re-translate it
  function setEnglishText(el, en) {
    if (!el || el.__cmdpEn === en) return;
    el.__cmdpEn = en;
    el.textContent = en;
    translateElementIfNeeded(el.parentNode || el);
  }

  function setEnglishAttr(el, attr, en) {
    if (!el || el['__cmdpEnAttr_' + attr] === en) return;
    el['__cmdpEnAttr_' + attr] = en;
    try {
      delete el['__enAttr_' + attr];
      delete el['__enAttrApp_' + attr];
    } catch (_) {}
    el.setAttribute(attr, en);
  }

  function syncFilterChrome() {
    if (typeof document === 'undefined') return;
    const dlg = document.getElementById('cmdPaletteDialog');
    if (!dlg) return;
    const on = Boolean(_filterTarget);
    dlg.classList.toggle('is-filter-mode', on);
    const chip = document.getElementById('cmdPaletteFilterChip');
    const chipLbl = document.getElementById('cmdPaletteFilterChipLbl');
    if (chip) chip.hidden = !on;
    if (chipLbl) chipLbl.textContent = on ? String(_filterTarget.titleEn || '') : '';
    const isStmt = on && isStatementTarget(_filterTarget);
    dlg.classList.toggle('is-stmt-mode', isStmt);
    setEnglishAttr(document.getElementById('cmdPaletteInput'), 'placeholder', on ? (isStmt ? STMT_PLACEHOLDER_EN : FILTER_PLACEHOLDER_EN) : SEARCH_PLACEHOLDER_EN);
    if (on) {
      setEnglishAttr(document.getElementById('cmdPaletteFilterChipX'), 'aria-label', isStmt ? STMT_CHIP_X_EN : FILTER_CHIP_X_EN);
      setEnglishText(document.getElementById('cmdPaletteFilterHint'), isStmt ? STMT_HINT_EN : FILTER_HINT_EN);
    }
    translateElementIfNeeded(dlg);
    syncFootHints();
  }

  function enterFilterMode(item) {
    if (!_isOpen || !isFilterableItem(item)) return false;
    const inp = document.getElementById('cmdPaletteInput');
    const clearBtn = document.getElementById('cmdPaletteClearBtn');
    if (!_filterTarget) _filterPrevQuery = _currentQuery;
    _filterTarget = item;
    _filterIndexRef = _cachedIndex;
    _currentQuery = '';
    if (inp) inp.value = '';
    if (clearBtn) clearBtn.hidden = true;
    _activeIdx = 0;
    syncFilterChrome();
    renderResults();
    if (inp) {
      try { inp.focus({ preventScroll: true }); } catch (_) {}
    }
    return true;
  }

  function exitFilterMode() {
    if (!_filterTarget) return false;
    const prevId = _filterTarget.id;
    const inp = document.getElementById('cmdPaletteInput');
    const clearBtn = document.getElementById('cmdPaletteClearBtn');
    _filterTarget = null;
    _filterIndexRef = null;
    _currentQuery = _filterPrevQuery || '';
    _filterPrevQuery = '';
    if (inp) inp.value = _currentQuery;
    if (clearBtn) clearBtn.hidden = !_currentQuery;
    _activeIdx = 0;
    syncFilterChrome();
    if (_isOpen) {
      renderResults();
      const backIdx = _currentItems.findIndex(x => x && x.id === prevId);
      if (backIdx > 0) {
        _activeIdx = backIdx;
        syncActiveRowDom();
      }
      if (inp) {
        try { inp.focus({ preventScroll: true }); } catch (_) {}
      }
    }
    return true;
  }

  function applyFilterAndOpen(target, rawTerm, picked) {
    if (!isFilterableItem(target)) return false;
    if (isStatementTarget(target)) {
      // A statement takes only a value its own picker lists; with none highlighted it opens as it is
      activateItem(target, (picked && picked.stmtSel) ? picked.stmtSel : null);
      return true;
    }
    const term = String(rawTerm == null ? '' : rawTerm).replace(/\s+/g, ' ').trim();
    const f = target.filterable;
    activateItem(target);
    if (!term || !_ctx || !_ctx.STATE) return true;
    const STATE = _ctx.STATE;
    if (f.view && STATE.view !== f.view) return true;
    STATE[f.searchKey || 'search'] = term;
    STATE.shown = {};
    const E = (typeof window !== 'undefined') ? window.MFG_ENTERPRISE : null;
    if (E && typeof E.renderApp === 'function') {
      E.renderApp();
    } else if (typeof _ctx.setView === 'function') {
      _suppressAllUsage = true;
      try {
        _ctx.setView(STATE.view, { reset: false, noPush: true });
      } finally {
        _suppressAllUsage = false;
      }
    }
    focusWorkspaceTablePanel(f.panelId, f.fallbackKey);
    return true;
  }

  function renderStatementModeResults(resultsEl, target) {
    const term = String(_currentQuery || '').replace(/\s+/g, ' ').trim();
    const sugg = searchStatementParamOptions(target, term);
    const allDocs = sugg.length > 0 && sugg.every(o => o.isDoc);
    const secEn = term ? 'Matching Values' : (allDocs ? 'Latest Records' : 'Most-Used Values');
    const items = sugg.map((o, i) => ({
      id: `stmtparam:${i}`,
      kind: 'filter',
      typed: false,
      filterTerm: o.fill,
      stmtSel: { key: o.key, value: o.value },
      opt: o
    }));
    _currentItems = items;
    if (_activeIdx >= items.length) _activeIdx = 0;

    if (!items.length) {
      resultsEl.innerHTML = `
        <div class="cmdp-empty">
          <div class="cmdp-empty-title"><span>${escHtml(target.titleEn)}</span></div>
          <div class="cmdp-empty-sub">${term ? 'No matching value for this statement. Press Enter to open it as it is.' : 'Press Enter to open this statement as it is.'}</div>
        </div>
      `;
      translateElementIfNeeded(resultsEl);
      syncFootHints();
      return;
    }

    let html = `<div class="cmdp-group-hdr"><span>${escHtml(secEn)}</span></div>`;
    for (let i = 0; i < items.length; i++) {
      const o = items[i].opt;
      const subHtml = `<span>${escHtml(o.paramLabelEn)}</span>${o.meta ? ` <span data-no-i18n="1">&middot; ${escHtml(o.meta)}</span>` : ''}`;
      html += `
        <button type="button" class="cmdp-item${i === _activeIdx ? ' is-active' : ''}" role="option" aria-selected="${i === _activeIdx ? 'true' : 'false'}" data-cmdp-idx="${i}">
          <span class="cmdp-item-ico" aria-hidden="true">${iconSvg('statements')}</span>
          <span class="cmdp-item-body">
            <span class="cmdp-item-title"><span data-no-i18n="1">${escHtml(o.title)}</span></span>
            <span class="cmdp-item-sub">${subHtml}</span>
          </span>
          <span class="cmdp-item-right">
            <span class="cmdp-badge kind-statement">Statement</span>
          </span>
        </button>
      `;
    }
    resultsEl.innerHTML = html;
    translateElementIfNeeded(resultsEl);
    syncFootHints();
  }

  function renderFilterModeResults(resultsEl, target) {
    if (isStatementTarget(target)) {
      renderStatementModeResults(resultsEl, target);
      return;
    }
    const term = String(_currentQuery || '').replace(/\s+/g, ' ').trim();
    const sugg = searchFilterFacets(target, term);
    const items = [];
    if (term) {
      items.push({ id: 'filter:typed', kind: 'filter', typed: true, filterTerm: term, sectionEn: 'Apply Filter' });
    }
    const suggSec = term ? 'Matching Values' : 'Most-Used Values';
    for (let i = 0; i < sugg.length; i++) {
      items.push({ id: `filter:value:${i}`, kind: 'filter', typed: false, filterTerm: sugg[i].label, count: sugg[i].count, sectionEn: suggSec });
    }
    _currentItems = items;
    if (_activeIdx >= items.length) _activeIdx = 0;

    if (!items.length) {
      resultsEl.innerHTML = `
        <div class="cmdp-empty">
          <div class="cmdp-empty-title"><span>${escHtml(target.titleEn)}</span></div>
          <div class="cmdp-empty-sub">Press Enter to open the table without a filter, or type to narrow it first.</div>
        </div>
      `;
      translateElementIfNeeded(resultsEl);
      syncFootHints();
      return;
    }

    const whereParts = [];
    if (target.subEn) whereParts.push(`<span>${escHtml(target.subEn)}</span>`);
    if (target.subTabEn) whereParts.push(`<span>${escHtml(target.subTabEn)}</span>`);
    whereParts.push(`<span>${escHtml(target.titleEn)}</span>`);
    const whereHtml = whereParts.join(' <span data-no-i18n="1">&middot;</span> ');

    let html = '';
    let lastSec = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.sectionEn !== lastSec) {
        lastSec = it.sectionEn;
        html += `<div class="cmdp-group-hdr"><span>${escHtml(it.sectionEn)}</span></div>`;
      }
      const titleHtml = it.typed
        ? `<span>Filter by</span> <span data-no-i18n="1">&ldquo;${escHtml(it.filterTerm)}&rdquo;</span>`
        : `<span data-no-i18n="1">${escHtml(it.filterTerm)}</span>`;
      const subHtml = it.typed
        ? whereHtml
        : `<span>Records</span> <span data-no-i18n="1">&middot;</span> <span class="cmdp-val-count" data-no-i18n="1">${Number(it.count || 0).toLocaleString('en-US')}</span>`;
      html += `
        <button type="button" class="cmdp-item${i === _activeIdx ? ' is-active' : ''}" role="option" aria-selected="${i === _activeIdx ? 'true' : 'false'}" data-cmdp-idx="${i}">
          <span class="cmdp-item-ico" aria-hidden="true">${FILTER_SVG}</span>
          <span class="cmdp-item-body">
            <span class="cmdp-item-title">${titleHtml}</span>
            <span class="cmdp-item-sub">${subHtml}</span>
          </span>
          <span class="cmdp-item-right">
            <span class="cmdp-badge kind-filter">Filter</span>
          </span>
        </button>
      `;
    }
    resultsEl.innerHTML = html;
    translateElementIfNeeded(resultsEl);
    syncFootHints();
  }

  function ensureModalDom() {
    if (typeof document === 'undefined') return null;
    let modal = document.getElementById('cmdPaletteModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'cmdPaletteModal';
    modal.className = 'cmdp-modal no-print';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Global Search');

    modal.innerHTML = `
      <div class="cmdp-dialog" id="cmdPaletteDialog">
        <div class="cmdp-search-row">
          <span class="cmdp-search-ico" aria-hidden="true">${iconSvg('search')}</span>
          <span class="cmdp-filter-chip" id="cmdPaletteFilterChip" hidden>
            <span class="cmdp-chip-ico" aria-hidden="true">${FILTER_SVG}</span>
            <span class="cmdp-chip-lbl" id="cmdPaletteFilterChipLbl"></span>
            <button type="button" class="cmdp-chip-x" id="cmdPaletteFilterChipX" aria-label="Remove table filter">&#10005;</button>
          </span>
          <input type="search" id="cmdPaletteInput" class="cmdp-input" autocomplete="off" spellcheck="false" placeholder="Search tables, forms, reports, clients, plates, or ticket #..." aria-label="Global Search">
          <button type="button" id="cmdPaletteClearBtn" class="cmdp-clear-btn" aria-label="Clear search" hidden>&#10005;</button>
          <button type="button" id="cmdPaletteCloseBtn" class="cmdp-esc-btn" aria-label="Close search" data-no-i18n="1"><span data-no-i18n="1">Esc</span></button>
        </div>
        <div class="cmdp-scope-bar">
          <div class="cmdp-filter-pills" id="cmdPaletteFilterPills" role="tablist" aria-label="Global Search">
            <button type="button" class="cmdp-filter-pill is-active" data-cmdp-cat="all"><span>All</span></button>
            <button type="button" class="cmdp-filter-pill" data-cmdp-cat="tables"><span>Tables</span></button>
            <button type="button" class="cmdp-filter-pill" data-cmdp-cat="forms"><span>Forms</span></button>
            <button type="button" class="cmdp-filter-pill" data-cmdp-cat="dashboards"><span>Dashboards</span></button>
            <button type="button" class="cmdp-filter-pill" data-cmdp-cat="statements"><span>Statements</span></button>
            <button type="button" class="cmdp-filter-pill" data-cmdp-cat="records"><span>Records</span></button>
          </div>
          <span class="cmdp-filter-hint" id="cmdPaletteFilterHint">Narrow this table before it opens</span>
          <span class="cmdp-scope-pill" id="cmdPaletteScopePill" data-no-i18n="1"></span>
        </div>
        <div class="cmdp-results" id="cmdPaletteResults" role="listbox" aria-label="Matching Results"></div>
        <div class="cmdp-foot">
          <div class="cmdp-foot-keys">
            <span><kbd data-no-i18n="1">&uarr;&darr;</kbd> <span>Navigate</span></span>
            <span><kbd data-no-i18n="1">&crarr;</kbd> <span>Open</span></span>
            <span id="cmdPaletteTabHint" hidden><kbd data-no-i18n="1">Tab</kbd> <span id="cmdPaletteTabHintLbl">Filter table</span></span>
            <span id="cmdPaletteBackHint" hidden><kbd data-no-i18n="1">&#9003;</kbd> <span>Back to search</span></span>
            <span><kbd data-no-i18n="1">Esc</kbd> <span>Close</span></span>
          </div>
          <span>Ranked by operational usage</span>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('mousedown', e => {
      if (e.target === modal) {
        e.preventDefault();
        close();
      }
    });
    // Escape steps out of the chip first even when focus sits on a button inside the dialog
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !_filterTarget) return;
      if (e.target && e.target.id === 'cmdPaletteInput') return;
      e.preventDefault();
      e.stopPropagation();
      exitFilterMode();
    });

    const inp = document.getElementById('cmdPaletteInput');
    const clearBtn = document.getElementById('cmdPaletteClearBtn');
    const closeBtn = document.getElementById('cmdPaletteCloseBtn');
    const pillsWrap = document.getElementById('cmdPaletteFilterPills');
    const resultsEl = document.getElementById('cmdPaletteResults');

    if (inp) {
      inp.addEventListener('input', () => {
        _currentQuery = inp.value || '';
        _activeIdx = 0;
        if (clearBtn) clearBtn.hidden = !_currentQuery;
        renderResults();
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (_currentItems.length) {
            _activeIdx = (_activeIdx + 1) % _currentItems.length;
            syncActiveRowDom();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (_currentItems.length) {
            _activeIdx = (_activeIdx - 1 + _currentItems.length) % _currentItems.length;
            syncActiveRowDom();
          }
        } else if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
          if (_filterTarget) {
            // Inside the chip: Shift+Tab steps back to search, Tab completes the highlighted value
            e.preventDefault();
            if (e.shiftKey) {
              exitFilterMode();
            } else {
              const cur = _currentItems[_activeIdx];
              if (cur && cur.kind === 'filter' && !cur.typed && cur.filterTerm && cur.filterTerm !== inp.value) {
                inp.value = cur.filterTerm;
                _currentQuery = cur.filterTerm;
                _activeIdx = 0;
                if (clearBtn) clearBtn.hidden = false;
                renderResults();
                // Two parties can read the same once accents and letter forms are folded: stay on the one completed
                if (cur.stmtSel) {
                  const keepIdx = _currentItems.findIndex(x => x && x.stmtSel && x.stmtSel.key === cur.stmtSel.key && x.stmtSel.value === cur.stmtSel.value);
                  if (keepIdx > 0) {
                    _activeIdx = keepIdx;
                    syncActiveRowDom();
                  }
                }
              }
            }
          } else if (!e.shiftKey && isFilterableItem(_currentItems[_activeIdx])) {
            e.preventDefault();
            enterFilterMode(_currentItems[_activeIdx]);
          }
        } else if (e.key === 'Backspace' && _filterTarget && !inp.value) {
          e.preventDefault();
          exitFilterMode();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (_filterTarget) {
            const target = getFilterTarget();
            const cur = _currentItems[_activeIdx];
            if (target) {
              applyFilterAndOpen(target, (cur && cur.kind === 'filter') ? cur.filterTerm : _currentQuery, cur);
            } else {
              exitFilterMode();
            }
          } else if (_currentItems.length && _currentItems[_activeIdx]) {
            activateItem(_currentItems[_activeIdx]);
          } else if (_currentQuery.trim()) {
            askIsabi(_currentQuery.trim());
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (_filterTarget) {
            exitFilterMode();
          } else {
            close();
          }
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!inp) return;
        inp.value = '';
        _currentQuery = '';
        _activeIdx = 0;
        clearBtn.hidden = true;
        renderResults();
        try { inp.focus({ preventScroll: true }); } catch (_) {}
      });
    }

    const chipX = document.getElementById('cmdPaletteFilterChipX');
    if (chipX) {
      chipX.addEventListener('click', e => {
        e.preventDefault();
        exitFilterMode();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => close());
    }

    if (pillsWrap) {
      pillsWrap.addEventListener('click', e => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-cmdp-cat]') : null;
        if (!btn) return;
        _catFilter = btn.getAttribute('data-cmdp-cat') || 'all';
        _activeIdx = 0;
        pillsWrap.querySelectorAll('[data-cmdp-cat]').forEach(b => {
          b.classList.toggle('is-active', b.getAttribute('data-cmdp-cat') === _catFilter);
        });
        renderResults();
        if (inp) {
          try { inp.focus({ preventScroll: true }); } catch (_) {}
        }
      });
    }

    if (resultsEl) {
      resultsEl.addEventListener('mousemove', e => {
        const row = e.target && e.target.closest ? e.target.closest('[data-cmdp-idx]') : null;
        if (!row) return;
        const idxNum = Number(row.getAttribute('data-cmdp-idx'));
        if (Number.isFinite(idxNum) && idxNum !== _activeIdx) {
          _activeIdx = idxNum;
          resultsEl.querySelectorAll('.cmdp-item').forEach((el, i) => {
            el.classList.toggle('is-active', i === _activeIdx);
          });
          syncFootHints();
        }
      });
      resultsEl.addEventListener('click', e => {
        const askBtn = e.target && e.target.closest ? e.target.closest('#cmdPaletteAskBtn') : null;
        if (askBtn) {
          e.preventDefault();
          askIsabi(_currentQuery.trim());
          return;
        }
        // Touch / mouse path into the same filter chip as Tab
        const filterBtn = e.target && e.target.closest ? e.target.closest('[data-cmdp-filter-idx]') : null;
        if (filterBtn && !_filterTarget) {
          e.preventDefault();
          e.stopPropagation();
          const fIdx = Number(filterBtn.getAttribute('data-cmdp-filter-idx'));
          if (Number.isFinite(fIdx)) enterFilterMode(_currentItems[fIdx]);
          return;
        }
        const row = e.target && e.target.closest ? e.target.closest('[data-cmdp-idx]') : null;
        if (!row) return;
        const idxNum = Number(row.getAttribute('data-cmdp-idx'));
        if (!Number.isFinite(idxNum) || !_currentItems[idxNum]) return;
        if (_filterTarget) {
          const target = getFilterTarget();
          if (target) applyFilterAndOpen(target, _currentItems[idxNum].filterTerm, _currentItems[idxNum]);
          else exitFilterMode();
          return;
        }
        activateItem(_currentItems[idxNum]);
      });
    }

    translateElementIfNeeded(modal);
    return modal;
  }

  function translateElementIfNeeded(el) {
    if (!el || !window.MFG_I18N || typeof window.MFG_I18N.translateDom !== 'function') return;
    try { window.MFG_I18N.translateDom(el); } catch (_) {}
  }

  function syncActiveRowDom() {
    const resultsEl = document.getElementById('cmdPaletteResults');
    if (!resultsEl) return;
    const rows = resultsEl.querySelectorAll('.cmdp-item');
    rows.forEach((el, idx) => {
      const on = idx === _activeIdx;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
      }
    });
    syncFootHints();
  }

  function syncScopePill() {
    const pill = document.getElementById('cmdPaletteScopePill');
    if (!pill) return;
    const pctx = getPermittedContext();
    if (!pctx) {
      pill.textContent = '';
      return;
    }
    const indTextEl = document.getElementById('companySwitchIndText');
    const coTextEl = document.getElementById('companySwitchCoText');
    const indLbl = (indTextEl && indTextEl.textContent.trim()) || tr(pctx.activeInd);
    const coLbl = (coTextEl && coTextEl.textContent.trim()) || pctx.allowedCos.join(', ');
    pill.textContent = `${indLbl} · ${coLbl}`;
  }

  function renderResults() {
    const resultsEl = document.getElementById('cmdPaletteResults');
    if (!resultsEl) return;
    syncScopePill();

    if (_filterTarget) {
      const target = getFilterTarget();
      if (target) {
        renderFilterModeResults(resultsEl, target);
        return;
      }
      // The pinned table left this seat's permitted index (scope, role or sign-out change)
      const inp = document.getElementById('cmdPaletteInput');
      const clearBtn = document.getElementById('cmdPaletteClearBtn');
      _currentQuery = _filterPrevQuery || '';
      _filterPrevQuery = '';
      _filterIndexRef = null;
      if (inp) inp.value = _currentQuery;
      if (clearBtn) clearBtn.hidden = !_currentQuery;
      _activeIdx = 0;
      syncFilterChrome();
    }

    const res = search(_currentQuery, { category: _catFilter });
    _currentItems = res.items || [];
    if (_activeIdx >= _currentItems.length) _activeIdx = 0;

    if (!_currentItems.length) {
      const qSafe = escHtml(res.query || _currentQuery.trim());
      resultsEl.innerHTML = `
        <div class="cmdp-empty">
          <div class="cmdp-empty-title">No matching tables, forms, reports, or records</div>
          <div class="cmdp-empty-sub">Search is instant and rule-based. Hand this question to Ask ISABI for live analysis.</div>
          ${qSafe ? `
            <button type="button" class="cmdp-ask-btn is-active" id="cmdPaletteAskBtn">
              ${iconSvg('sparkles')}
              <span>Ask ISABI</span>
              <span data-no-i18n="1">&ldquo;${qSafe}&rdquo;</span>
            </button>
          ` : ''}
        </div>
      `;
      translateElementIfNeeded(resultsEl);
      syncFootHints();
      return;
    }

    let html = '';
    let lastSec = '';
    for (let i = 0; i < _currentItems.length; i++) {
      const it = _currentItems[i];
      const sec = it.sectionEn || 'Matching Results';
      if (sec !== lastSec) {
        lastSec = sec;
        html += `<div class="cmdp-group-hdr"><span>${escHtml(sec)}</span></div>`;
      }
      const titleHtml = it.titleRaw
        ? `<span data-no-i18n="1">${escHtml(it.titleEn)}</span>`
        : `<span>${escHtml(it.titleEn)}</span>`;
      const subParts = [];
      if (it.subEn) subParts.push(`<span>${escHtml(it.subEn)}</span>`);
      if (it.subTabEn) subParts.push(`<span>${escHtml(it.subTabEn)}</span>`);
      if (it.subRaw) subParts.push(`<span data-no-i18n="1">${escHtml(it.subRaw)}</span>`);
      const indBadgeHtml = it.industry
        ? `<span class="cmdp-badge">${escHtml(it.industry)}</span>`
        : '';
      const filterBtnHtml = isFilterableItem(it)
        ? `<span class="cmdp-item-filter" role="button" data-cmdp-filter-idx="${i}" aria-label="${isStatementTarget(it) ? 'Set a parameter for this statement' : 'Filter this table'}">${FILTER_SVG}</span>`
        : '';

      html += `
        <button type="button" class="cmdp-item${i === _activeIdx ? ' is-active' : ''}" role="option" aria-selected="${i === _activeIdx ? 'true' : 'false'}" data-cmdp-idx="${i}">
          <span class="cmdp-item-ico" aria-hidden="true">${iconSvg(it.icon)}</span>
          <span class="cmdp-item-body">
            <span class="cmdp-item-title">${titleHtml}</span>
            <span class="cmdp-item-sub">${subParts.join(' <span data-no-i18n="1">&middot;</span> ')}</span>
          </span>
          <span class="cmdp-item-right">
            ${filterBtnHtml}
            ${indBadgeHtml}
            <span class="cmdp-badge kind-${escHtml(it.kind)}">${escHtml(it.badgeEn)}</span>
          </span>
        </button>
      `;
    }

    resultsEl.innerHTML = html;
    translateElementIfNeeded(resultsEl);
    syncFootHints();
  }

  function activateItem(item, runArg) {
    if (!item || typeof item.run !== 'function') return;
    close();
    if (_ctx) {
      const idStr = String(item.id || '');
      if (item.kind !== 'form' || idStr.startsWith('domform:')) {
        if (typeof _ctx.closeEntryModal === 'function') {
          try { _ctx.closeEntryModal(true); } catch (_) {}
        }
      }
      if (item.kind !== 'form' || idStr.startsWith('form:')) {
        if (typeof _ctx.closeIndustryDomainEntryModal === 'function') {
          try { _ctx.closeIndustryDomainEntryModal(); } catch (_) {}
        }
      }
      if (item.kind !== 'record' && typeof _ctx.closeRecordInspector === 'function') {
        try { _ctx.closeRecordInspector(); } catch (_) {}
      }
    }
    item.run(runArg);
  }

  function askIsabi(questionText) {
    const q = String(questionText || _currentQuery || '').trim();
    close();
    if (!q) return;
    if (window.MFG_ASK) {
      if (typeof window.MFG_ASK.open === 'function') window.MFG_ASK.open();
      if (typeof window.MFG_ASK.ask === 'function') window.MFG_ASK.ask(q);
    }
  }

  function open(opts) {
    if (!_ctx || !_ctx.STATE || !_ctx.STATE.authed || _ctx.STATE.kioskLocked) return false;
    if (typeof document !== 'undefined') {
      const stepUp = document.getElementById('stepUpAuthModal');
      if (stepUp && !stepUp.hidden) return false;
    }
    const options = (opts && typeof opts === 'object') ? opts : {};
    const modal = ensureModalDom();
    if (!modal) return false;

    if (typeof options.category === 'string') {
      _catFilter = options.category;
    } else if (!_isOpen) {
      _catFilter = 'all';
    }
    const pillsWrap = document.getElementById('cmdPaletteFilterPills');
    if (pillsWrap) {
      pillsWrap.querySelectorAll('[data-cmdp-cat]').forEach(b => {
        b.classList.toggle('is-active', b.getAttribute('data-cmdp-cat') === _catFilter);
      });
    }

    const inp = document.getElementById('cmdPaletteInput');
    const clearBtn = document.getElementById('cmdPaletteClearBtn');
    if (_filterTarget) {
      // Re-opening always starts from plain search; the chip never carries over
      if (inp) inp.value = _filterPrevQuery || '';
      _filterTarget = null;
      _filterPrevQuery = '';
      _filterIndexRef = null;
    }
    if (typeof options.query === 'string') {
      _currentQuery = options.query;
      if (inp) inp.value = _currentQuery;
    } else if (inp) {
      _currentQuery = inp.value || '';
    }
    if (clearBtn) clearBtn.hidden = !_currentQuery;

    _activeIdx = 0;
    _isOpen = true;
    modal.hidden = false;
    syncFilterChrome();
    renderResults();

    if (inp && options.focus !== false) {
      setTimeout(() => {
        try {
          inp.focus({ preventScroll: true });
          if (_currentQuery) inp.select();
        } catch (_) {}
      }, 0);
    }
    return true;
  }

  function filterTableById(itemId, term) {
    if (!_isOpen) return false;
    const idx = buildSearchIndex();
    const hit = idx ? idx.items.find(x => x.id === itemId) : null;
    if (!enterFilterMode(hit)) return false;
    if (typeof term === 'string' && term) {
      const inp = document.getElementById('cmdPaletteInput');
      const clearBtn = document.getElementById('cmdPaletteClearBtn');
      if (inp) inp.value = term;
      _currentQuery = term;
      _activeIdx = 0;
      if (clearBtn) clearBtn.hidden = false;
      renderResults();
    }
    return true;
  }

  function close(opts) {
    _isOpen = false;
    _catFilter = 'all';
    const modal = document.getElementById('cmdPaletteModal');
    if (modal) modal.hidden = true;
    if (_filterTarget) {
      const inpF = document.getElementById('cmdPaletteInput');
      const clearF = document.getElementById('cmdPaletteClearBtn');
      _currentQuery = _filterPrevQuery || '';
      if (inpF) inpF.value = _currentQuery;
      if (clearF) clearF.hidden = !_currentQuery;
      _filterTarget = null;
      _filterPrevQuery = '';
      _filterIndexRef = null;
      syncFilterChrome();
    }
    if (opts && opts.clearCache) {
      _cachedIndexKey = '';
      _cachedIndex = null;
      _currentItems = [];
      _currentQuery = '';
      const inp = document.getElementById('cmdPaletteInput');
      if (inp) inp.value = '';
      const clearBtn = document.getElementById('cmdPaletteClearBtn');
      if (clearBtn) clearBtn.hidden = true;
      const resultsEl = document.getElementById('cmdPaletteResults');
      if (resultsEl) resultsEl.innerHTML = '';
    }
  }

  function toggle(opts) {
    if (_isOpen) {
      close();
      return false;
    }
    return open(opts);
  }

  function mountTopbarButtons() {
    if (typeof document === 'undefined') return;
    const searchIco = iconSvg('search');

    const toolActions = document.querySelector('#topbar .tool-actions');
    if (toolActions && !document.getElementById('topbarSearchBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'topbarSearchBtn';
      btn.className = 'btn btn-ghost-bar desktop-tool-btn topbar-search-btn no-print';
      btn.setAttribute('aria-label', 'Global Search');
      btn.setAttribute('data-ui-tip', 'Search all tables, forms, dashboards, statements & records (Ctrl+K)');
      btn.innerHTML = `${searchIco}<span class="cmdp-top-lbl">Search</span><kbd class="cmdp-top-kbd" data-no-i18n="1">Ctrl+K</kbd>`;
      btn.addEventListener('click', e => {
        e.preventDefault();
        toggle();
      });
      toolActions.insertBefore(btn, toolActions.firstChild);
      translateElementIfNeeded(btn);
    }

    const mobActions = document.querySelector('#topbar .top-mobile-actions');
    if (mobActions && !document.getElementById('mobileSearchBtn')) {
      const mBtn = document.createElement('button');
      mBtn.type = 'button';
      mBtn.id = 'mobileSearchBtn';
      mBtn.className = 'btn btn-ghost-bar mobile-search-btn no-print';
      mBtn.setAttribute('aria-label', 'Global Search');
      mBtn.setAttribute('data-ui-tip', 'Search all tables, forms, dashboards, statements & records');
      mBtn.innerHTML = searchIco;
      mBtn.addEventListener('click', e => {
        e.preventDefault();
        toggle();
      });
      mobActions.insertBefore(mBtn, mobActions.firstChild);
      translateElementIfNeeded(mBtn);
    }
  }

  function init(ctx) {
    _ctx = ctx || null;
    _cachedIndexKey = '';
    mountTopbarButtons();
    ensureModalDom();

    window.addEventListener('mfg:records-seed-ready', () => {
      _cachedIndexKey = '';
      if (_isOpen) renderResults();
    });
    window.addEventListener('mfg:lang-changed', () => {
      _cachedIndexKey = '';
      const modal = document.getElementById('cmdPaletteModal');
      if (modal) translateElementIfNeeded(modal);
      if (_isOpen) renderResults();
    });
  }

  window.MFG_CMD_PALETTE = {
    init,
    mountTopbarButtons,
    open,
    close,
    toggle,
    isOpen: () => Boolean(_isOpen),
    isFilterMode: () => Boolean(_filterTarget),
    filterTable: filterTableById,
    exitFilterMode,
    search,
    askIsabi,
    recordUsage,
    invalidateCache: () => { _cachedIndexKey = ''; }
  };
})();
