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
      { key: 'hld_entities_tbl', domKey: 'hld_interactions', label: '14-Entity Group Scorecard', view: 'hld_entities' },
      { key: 'hld_open_ic_tbl', domKey: 'hld_interactions', label: 'Intercompany Repayment Ledger', view: 'hld_open_recon' },
      { key: 'hld_pairs_tbl', domKey: 'hld_interactions', label: 'Sister Pair Matrix', view: 'hld_due_matrix' },
      { key: 'hld_partners_tbl', domKey: 'hld_partners', label: 'Partner Splits & Agreements', view: 'hld_partners' },
      { key: 'hld_extended_tbl', domKey: 'external_movements', label: 'Extended Stakeholder Ledger', view: 'hld_extended' },
      { key: 'hld_loans_tbl', domKey: 'hld_loans', label: 'Facility Rate Schedules', view: 'hld_loans' }
    ],
    'Hospitality & Resorts': [
      { key: 'hsp_rev_tbl', domKey: 'hsp_revenue', label: 'Venue Revenue & Chalet Closes', view: 'hsp_revenue' },
      { key: 'hsp_memb_tbl', domKey: 'hsp_memberships', label: 'Seasonal Memberships & Arrears', view: 'hsp_memberships' },
      { key: 'hsp_tariffs_tbl', domKey: 'hsp_tariffs', label: 'Seasonal Tariff Schedules', view: 'hsp_memberships' },
      { key: 'hsp_stock_tbl', domKey: 'hsp_stock', label: 'Cellar, Kitchen & Recipe BOM', view: 'hsp_stock' },
      { key: 'hsp_gen_tbl', domKey: 'hsp_energy', label: 'Generators, Diesel & Solar Logs', view: 'hsp_energy' }
    ],
    'Automotive & Heavy Trading': [
      { key: 'trd_inv_tbl', domKey: 'trd_sales', label: 'Sales Invoices & Books', view: 'trd_sales' },
      { key: 'trd_tgt_tbl', domKey: 'trd_targets', label: 'Price Lists & Tariffs', view: 'trd_targets' },
      { key: 'trd_imp_tbl', domKey: 'trd_imports', label: 'Imports & Landed Cost', view: 'trd_purchases' },
      { key: 'trd_vin_tbl', domKey: 'trd_trucks', label: 'Showroom Serial Units (VINs)', view: 'trd_trucks' },
      { key: 'trd_wh_tbl', domKey: 'trd_parts', label: '5-Warehouse Spare Parts', view: 'trd_stock' }
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
    external_movements: 'owner cash injection withdrawal external treasury apport retrait externe حركة خارجية سحب إيداع صندوق خارجي',
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

  function recordUsage(kind, key) {
    if (!_ctx || !_ctx.STATE || !_ctx.STATE.authed || !kind || !key) return;
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
      return rawList.filter(r => {
        if (!r || r.voided) return false;
        if (!pctx.demoActive && r._demoSpineRow) return false;
        if (r.company && !pctx.demoActive && !isCompanyPermitted(r.company, pctx)) return false;
        const rowInd = r._industry || 'Manufacturing';
        if (!pctx.permittedIndustries.has(rowInd)) return false;
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

  function makeCandidate(spec) {
    const variants = spec.titleRaw
      ? [String(spec.titleEn || '').trim()].filter(Boolean)
      : getTrilingualVariants(spec.titleEn);
    const subVariants = spec.subEn ? getTrilingualVariants(spec.subEn) : [];
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
      subRaw: spec.subRaw || '',
      industry: spec.industry || '',
      badgeEn: spec.badgeEn || 'Table',
      freq: Number(spec.freq) || 0,
      exactSet,
      hay,
      hayWords,
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

    const canTablesView = Boolean(_ctx.canViewView && _ctx.canViewView('tables', u));
    const tableCatalog = (window.MFG_PBI && Array.isArray(window.MFG_PBI.TABLE_CATALOG)) ? window.MFG_PBI.TABLE_CATALOG : [];

    // 1. All 52 Shared + Manufacturing TABLE_CATALOG Registers
    if (canTablesView) {
      for (let i = 0; i < tableCatalog.length; i++) {
        const meta = tableCatalog[i];
        if (!meta || !meta.key) continue;
        if (!_ctx.canAccessTable || !_ctx.canAccessTable(meta.key, u)) continue;
        const isMfgOnly = MFG_ONLY_TABLES.has(meta.key);
        if (isMfgOnly && !pctx.permittedIndustries.has('Manufacturing')) continue;
        if (meta.key === 'gl_accounts' && (!_ctx.canViewView || !_ctx.canViewView('ledger', u))) continue;

        const rows = getScopedRows(meta.key, Boolean(meta.universal));
        const rowCnt = rows.length;
        const targetInd = isMfgOnly ? 'Manufacturing' : '';
        const cleanGroup = String(meta.group || '').replace(/^\d+\s*·\s*/, '');
        const exactAliases = [meta.key.replace(/_/g, ' ')];
        if (meta.singularLabel) exactAliases.push(meta.singularLabel);
        const aliasStr = TABLE_ALIASES[meta.key] || '';
        aliasStr.split(/\s+/).forEach(tok => { if (tok.length >= 3) exactAliases.push(tok); });

        items.push(makeCandidate({
          id: `table:${meta.key}`,
          kind: 'table',
          icon: 'tables',
          titleEn: meta.label,
          subEn: cleanGroup,
          subRaw: `${rowCnt.toLocaleString('en-US')}`,
          industry: isMfgOnly && pctx.activeInd !== 'Manufacturing' ? 'Manufacturing' : '',
          badgeEn: 'Table',
          freq: usageScore('table', meta.key) + indBoost(targetInd) + Math.min(45000, rowCnt),
          exactAliases,
          aliases: `${aliasStr} ${meta.singularLabel || ''} table register جدول سجل`,
          run: () => {
            if (isMfgOnly) ensureIndustryScope('Manufacturing', pctx);
            pctx.STATE.activeTableKey = meta.key;
            if (!pctx.STATE.tableViews) pctx.STATE.tableViews = {};
            pctx.STATE.tableViews[meta.key] = 'all';
            _ctx.setView('tables');
          }
        }));
      }

      // 2. All 24 Sibling-Industry Domain Registers
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

          const domTblCandidate = makeCandidate({
            id: `domtable:${tab.key}`,
            kind: 'table',
            icon: tab.view,
            titleEn: tab.label,
            subEn: ind,
            subRaw: `${domRowCnt.toLocaleString('en-US')}`,
            industry: pctx.activeInd !== ind ? ind : '',
            badgeEn: 'Table',
            freq: usageScore('table', tab.key) + indBoost(ind) + Math.min(40000, domRowCnt * 25),
            exactAliases,
            aliases: `${aliasStr} table register جدول سجل`,
            run: () => {
              recordUsage('table', tab.key);
              ensureIndustryScope(ind, pctx);
              if (!pctx.STATE.indActiveDomainTable) pctx.STATE.indActiveDomainTable = {};
              pctx.STATE.indActiveDomainTable[ind] = tab.key;
              pctx.STATE.indTablesSearch = '';
              _ctx.setView('tables');
            }
          });
          domTableItemByKey.set(tab.key, domTblCandidate);
          items.push(domTblCandidate);
        });
      });
    }

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
          run: () => {
            recordUsage('statement', code);
            if (targetInd) ensureIndustryScope(targetInd, pctx);
            pctx.STATE.activeStatement = code;
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
        items.push(makeCandidate({
          id: `view:${t.view}`,
          kind: 'dashboard',
          icon: h.id,
          titleEn: t.label,
          subEn: h.label,
          industry: targetInd && pctx.activeInd !== targetInd ? targetInd : '',
          badgeEn: 'Hub',
          freq: usageScore('view', t.view) + indBoost(targetInd) + (750 - hIdx * 20 - tIdx * 5),
          exactAliases: [t.label, tIdx === 0 ? h.label : ''],
          aliases: `${h.label} hub module page قسم شاشة module`,
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

          ds.rows.forEach((rawCells, rIdx) => {
            if (!Array.isArray(rawCells) || !rawCells.length) return;
            const origRowId = String(rawCells[0] || '').trim();
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
            const rowId = String(cells[0] || origRowId).trim();
            if (!rowId) return;
            const rowCo = coColIdx >= 0 ? String(cells[coColIdx] || '').trim() : '';
            const normRowCo = rowCo ? normCoKey(rowCo) : '';
            if (normRowCo && !pctx.demoActive && pctx.catalogByNormName.has(normRowCo) && !pctx.allowedCosNormSet.has(normRowCo)) {
              return;
            }
            if (pctx.offScope && normRowCo === 'properties') {
              return;
            }
            validRowCnt++;
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
                exactAliases: [rowId, cells[1] ? String(cells[1]) : ''],
                extraHay: cells.slice(0, 5).join(' '),
                run: runFn
              });
              items.push(candidate);
              pushExactRef(rowId, candidate);
            } else {
              pushExactRef(rowId, {
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
              });
            }
          });
          const domTblRef = (typeof domTableItemByKey !== 'undefined' && domTableItemByKey) ? domTableItemByKey.get(tab.key) : null;
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
          <span class="cmdp-scope-pill" id="cmdPaletteScopePill" data-no-i18n="1"></span>
        </div>
        <div class="cmdp-results" id="cmdPaletteResults" role="listbox" aria-label="Matching Results"></div>
        <div class="cmdp-foot">
          <div class="cmdp-foot-keys">
            <span><kbd data-no-i18n="1">&uarr;&darr;</kbd> <span>Navigate</span></span>
            <span><kbd data-no-i18n="1">&crarr;</kbd> <span>Open</span></span>
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
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (_currentItems.length && _currentItems[_activeIdx]) {
            activateItem(_currentItems[_activeIdx]);
          } else if (_currentQuery.trim()) {
            askIsabi(_currentQuery.trim());
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
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
        }
      });
      resultsEl.addEventListener('click', e => {
        const askBtn = e.target && e.target.closest ? e.target.closest('#cmdPaletteAskBtn') : null;
        if (askBtn) {
          e.preventDefault();
          askIsabi(_currentQuery.trim());
          return;
        }
        const row = e.target && e.target.closest ? e.target.closest('[data-cmdp-idx]') : null;
        if (!row) return;
        const idxNum = Number(row.getAttribute('data-cmdp-idx'));
        if (Number.isFinite(idxNum) && _currentItems[idxNum]) {
          activateItem(_currentItems[idxNum]);
        }
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
      if (it.subRaw) subParts.push(`<span data-no-i18n="1">${escHtml(it.subRaw)}</span>`);
      const indBadgeHtml = it.industry
        ? `<span class="cmdp-badge">${escHtml(it.industry)}</span>`
        : '';

      html += `
        <button type="button" class="cmdp-item${i === _activeIdx ? ' is-active' : ''}" role="option" aria-selected="${i === _activeIdx ? 'true' : 'false'}" data-cmdp-idx="${i}">
          <span class="cmdp-item-ico" aria-hidden="true">${iconSvg(it.icon)}</span>
          <span class="cmdp-item-body">
            <span class="cmdp-item-title">${titleHtml}</span>
            <span class="cmdp-item-sub">${subParts.join(' <span data-no-i18n="1">&middot;</span> ')}</span>
          </span>
          <span class="cmdp-item-right">
            ${indBadgeHtml}
            <span class="cmdp-badge kind-${escHtml(it.kind)}">${escHtml(it.badgeEn)}</span>
          </span>
        </button>
      `;
    }

    resultsEl.innerHTML = html;
    translateElementIfNeeded(resultsEl);
  }

  function activateItem(item) {
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
    item.run();
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
    translateElementIfNeeded(modal);
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

  function close(opts) {
    _isOpen = false;
    _catFilter = 'all';
    const modal = document.getElementById('cmdPaletteModal');
    if (modal) modal.hidden = true;
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
    search,
    askIsabi,
    recordUsage,
    invalidateCache: () => { _cachedIndexKey = ''; }
  };
})();
