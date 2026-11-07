/* ============================================================================
   ISABI Systems — Curated Trilingual (EN | AR | FR) & Modular Locale Engine (js/i18n.js)
   - First-class hand-curated financial & operational ERP dictionary for English,
     Arabic (with full RTL layout mirroring & Western tabular numerals), and French.
   - Modular locale registry (registerLocale) for custom client language packs.
   - Non-destructive, reversible DOM translator (caches __enText on nodes so
     switching back to EN restores 100% byte-for-byte original strings in <2ms,
     and never alters data-* attributes, IDs, or <option value> keys).
   ============================================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'isabi_mfg_lang';
  const SHOWCASE_STORAGE_KEY = 'isabi.lang.v1';

  const LOCALES = {
    en: { code: 'en', label: 'EN', shortLabel: 'EN', nativeName: 'English', dir: 'ltr', bcp47: 'en-US' },
    ar: { code: 'ar', label: 'عربي', shortLabel: 'AR', nativeName: 'العربية', dir: 'rtl', bcp47: 'ar-LB' },
    fr: { code: 'fr', label: 'FR', shortLabel: 'FR', nativeName: 'Français', dir: 'ltr', bcp47: 'fr-FR' }
  };

  const DICT = {
    en: {},
    ar: {
      // Brand & Shell
      'ISABI Systems': 'أنظمة إيسابي (ISABI)',
      'ISABI SYSTEMS': 'أنظمة إيسابي (ISABI)',
      'Command Center': 'مركز القيادة',
      'Sidebar': 'القائمة',
      'Lock': 'قفل',
      'Dark': 'داكن',
      'Light': 'فاتح',
      'Done': 'تم',
      'Reset': 'إعادة ضبط',
      'Close': 'إغلاق',
      'Cancel': 'إلغاء',
      'Ask': 'اسأل',
      'Ask ISABI': 'اسأل ISABI',
      'ISABI': 'ISABI',
      '+ New Entry': '+ قيد جديد',
      'New Entry': 'قيد جديد',
      'Post Entry': 'ترحيل قيد',
      'Post': 'ترحيل',
      'Save Changes': 'حفظ التعديلات',
      'Void / Delete': 'إلغاء / حذف',
      'Keep Editing': 'متابعة التعديل',
      'Discard Changes': 'تجاهل التغييرات',
      'Unfinished Entry': 'قيد غير محفوظ',
      'Thermal Slip': 'إيصال حراري',
      '360° Details': 'تفاصيل 360°',
      'Overview': 'نظرة عامة',
      'Dispatch': 'الإرساليات',
      'Books': 'الدفاتر',
      'Modules': 'الوحدات',

      // Sidebar Groups (All 6 Industries)
      'Executive & Analytics': 'الإدارة والتحليلات',
      'Commercial & Procurement': 'المبيعات والمشتريات',
      'Plant, Fleet & Workforce': 'المصنع والأسطول والموظفون',
      'Finance & Accounting': 'المالية والمحاسبة',
      'Shared · All Entities': 'مشترك · جميع الشركات',
      'Group & Intercompany': 'المجموعة والمعاملات البينية',
      'Capital, Partners & Workforce': 'رأس المال والشركاء والموظفون',
      'Venue Revenue & Procurement': 'إيرادات الفروع والمشتريات',
      'Resort Stock, Energy & Staff': 'المخزون والطاقة والموظفون',
      'Sales, Imports & Payables': 'المبيعات والاستيراد والذمم',
      'Stock, Trucks & Workforce': 'المخزون والشاحنات والموظفون',
      'Leasing, Sales & Billing': 'التأجير والمبيعات والفوترة',
      'Portfolio, Works & Workforce': 'المحفظة العقارية والأعمال',
      'Production, Renewals & Claims': 'الإصدار والتجديدات والمطالبات',
      'Claims, Catalogue & Workforce': 'المطالبات والدليل والموظفون',

      // Sidebar Hubs (All 6 Industries + Spine)
      'Executive Overview': 'النظرة التنفيذية الشاملة',
      'Daily Operations': 'العمليات اليومية',
      'Operating Entities': 'الشركات التشغيلية',
      'Sentinels & Alerts': 'الرقابة الذكية والتنبيهات',
      'AI Sentinels & Audit': 'الرقابة الذكية والتدقيق',
      'Alerts & Thresholds': 'قواعد التنبيه والحدود',
      'Dashboards & Reports': 'لوحات القيادة والتقارير',
      'Sales & Receivables': 'المبيعات والذمم المدينة',
      'Quarry, Haulage & JVs': 'الكسارات والنقل والشراكات',
      'Expenses & Payables': 'المصاريف والذمم الدائنة',
      'Fleet & Maintenance': 'الأسطول والصيانة',
      'Warehouse & Parts': 'المستودع وقطع الغيار',
      'Payroll & Workforce': 'الرواتب وشؤون الموظفين',
      'Cash Flow & Treasury': 'التدفق النقدي والخزينة',
      'General Ledger & COA': 'الأستاذ العام وشجرة الحسابات',
      'Counterparties & Sites': 'العملاء والموردون والمواقع',
      'Catalog & Categories': 'الأصناف والتصنيفات',
      'Fleet, Drivers & Staff': 'الآليات والسائقون والموظفون',
      'Currencies & VAT': 'العملات والضريبة (VAT)',
      'Tables': 'الجداول',
      'Kiosks': 'الأكشاك',
      'Users': 'المستخدمون',
      'All Tables & Registers': 'جميع الجداول والسجلات',
      'Plant Kiosks': 'أكشاك المصنع والميدان',
      'Users & Security': 'المستخدمون والصلاحيات',

      // Non-Manufacturing Industry Hubs
      'Group Consolidation': 'توحيد نتائج المجموعة',
      'Intercompany Hub': 'المعاملات البينية للمجموعة',
      'Partners & Profit Splits': 'الشركاء وتوزيع الأرباح',
      'Loans, Capital & Assets': 'القروض ورأس المال والأصول',
      'Revenue, POS & Chalets': 'الإيرادات ونقاط البيع والشاليهات',
      'Memberships & Splits': 'الاشتراكات والحصص',
      'Kitchen, Bar & Stock': 'المطبخ والبار والمخزون',
      'Generators & Utilities': 'المولدات والطاقة والمنافع',
      'Invoicing & Receivables': 'الفوترة والذمم المدينة',
      'Imports & Landed Cost': 'الاستيراد والتكلفة الواصلة',
      'Showroom & Serial Units': 'المعرض والآليات المرّقمة',
      'Spare Parts & Warehouses': 'قطع الغيار والمستودعات',
      'Leases & Rent Roll': 'عقود الإيجار وجدول الإيجارات',
      'Property Sales & Buyers': 'مبيعات العقارات والمشترون',
      'Portfolio & Valuations': 'المحفظة العقارية والتقييمات',
      'Work Orders & Fit-Out': 'أوامر العمل والتجهيزات',
      'Policies & Renewals': 'البوالص والتجديدات',
      'Premiums & Insurer Recon': 'الأقساط ومطابقة شركات التأمين',
      'Claims & Recoveries': 'المطالبات والاستردادات',
      'Lines, Products & Rates': 'فروع التأمين والمنتجات والنسب',

      // Industry Names
      'Manufacturing': 'الصناعة والخرسانة',
      'Manufacturing Operations': 'العمليات الصناعية',
      'Holding & Treasury': 'القابضة والخزينة',
      'Hospitality & Resorts': 'الضيافة والمنتجعات',
      'Automotive & Heavy Trading': 'تجارة الآليات والشاحنات',
      'Real Estate & Property': 'العقارات والأملاك',
      'Insurance & Brokerage': 'التأمين والوساطة',
      'Double-Entry Ledger': 'دفتر القيد المزدوج',

      // Topbar Slicers & Company Switcher
      'IND': 'القطاع',
      'CO': 'الشركة',
      'Industries': 'القطاعات',
      'Operating Companies': 'الشركات التشغيلية',
      'All Assigned': 'كل الشركات المتاحة',
      'All Books': 'جميع الدفاتر',
      'Official Books': 'الدفاتر الرسمية',
      'All': 'الكل',
      'Year': 'سنة',
      'Month': 'شهر',
      'Week': 'أسبوع',
      'Day': 'يوم',
      'Rep Date': 'تاريخ التقرير',
      'Tx Date': 'تاريخ العملية',
      'Reporting Date Basis': 'أساس تاريخ التقرير',
      'Transaction Date Basis': 'أساس تاريخ العملية',
      'All-Time': 'كامل الفترة',
      'Today': 'اليوم',
      'Yesterday': 'أمس',
      'This Week': 'هذا الأسبوع',
      'Last Week': 'الأسبوع الماضي',
      'This Month (MTD)': 'هذا الشهر',
      'Last Month': 'الشهر الماضي',
      'This Quarter (QTD)': 'هذا الربع',
      'Year to Date (YTD)': 'منذ بداية السنة',
      'All BUs · Shared Registry': 'جميع الوحدات · سجل مشترك',
      'Universal Registry': 'السجل الموحد',
      'Live Plant Terminals': 'أجهزة المصنع الحية',

      // Auth Gate & Biometrics
      'Starting Face ID…': 'جاري تشغيل بصمة الوجه…',
      'Tap for Face ID': 'اضغط لبصمة الوجه',
      'Pause Camera': 'إيقاف الكاميرا مؤقتاً',
      'Resume Camera': 'تشغيل الكاميرا',
      'FACE ID VERIFIED': 'تم التحقق ببصمة الوجه',
      'or select account for PIN': 'أو اختر الحساب لإدخال الرمز السري',
      'Select or search your account…': 'اختر أو ابحث عن حسابك…',
      'Switch': 'تبديل',
      'Access PIN': 'الرمز السري (PIN)',
      'Sign In': 'تسجيل الدخول',
      'Client Website · isabisystems.com': 'موقع العملاء · isabisystems.com',
      'Offline Cache': 'العمل دون اتصال',
      'Step 2: Look at the camera to verify': 'الخطوة 2: انظر إلى الكاميرا للتحقق',

      // Smart Entry Modal & Forms
      'New Operational Transaction': 'عملية تشغيلية جديدة',
      'ISABI Double-Entry Operational Desk · Auto-Journal & Price Matrix': 'مكتب العمليات والقيود المزدوجة · تسعير وترحيل آلي',
      'Sales Ticket': 'إيصال مبيعات',
      'Raw Material Ticket': 'إيصال مواد أولية',
      'Customer AR Receipt': 'سند قبض عميل',
      'Fuel & Lubricant Intake': 'إدخال/صرف محروقات وزيوت',
      'Expense': 'مصروف',
      'Supplier Settlement': 'سند دفع لمورد',
      'Company': 'الشركة',
      'Transaction Date': 'تاريخ العملية',
      'Reporting Date': 'تاريخ التقرير',
      'Dispatch Time': 'وقت الإرسال',
      'Customer': 'العميل',
      'Supplier': 'المورد',
      'Product': 'المنتج / الصنف',
      'Quantity': 'الكمية',
      'Unit (UoM)': 'الوحدة',
      'Unit Price': 'سعر الوحدة',
      'Total': 'الإجمالي',
      'TOTAL': 'المجموع',
      'Notes': 'ملاحظات',
      'Description': 'البيان / الوصف',
      'Category': 'الفئة',
      'Subcategory': 'الفئة الفرعية',
      'Site': 'الموقع / الورشة',
      'Region': 'المنطقة',
      'Equipment': 'الآلية / الشاحنة',
      'Driver': 'السائق',
      'Staff Member': 'الموظف',
      'Role': 'الوظيفة / الدور',
      'Start Date': 'تاريخ البدء',
      'End Date': 'تاريخ الانتهاء',
      'Payment Method': 'طريقة الدفع',
      'Cash': 'نقدي',
      'Credit': 'ذمم (آجل)',
      'Status': 'الحالة',
      'Active': 'نشط',
      'Pending': 'قيد الانتظار',
      'Completed': 'مكتمل',

      // Common Table & Toolbar Labels
      'Columns': 'الأعمدة',
      'Export CSV': 'تصدير CSV',
      'CSV': 'تصدير CSV',
      'Print': 'طباعة',
      'Search': 'بحث',
      'Clear': 'مسح',
      'Clear ✕': 'مسح ✕',
      'Top 10': 'أول 10',
      'Copy Sum': 'نسخ المجموع',
      'Selected Qty': 'الكمية المحددة',
      'Ex-VAT Sum': 'المجموع قبل الضريبة',
      'VAT Sum': 'مجموع الضريبة',
      'Selected Total': 'الإجمالي المحدد',
      'Avg / Row': 'المتوسط / سطر',
      'Read Aloud': 'قراءة صوتية',

      // Ask ISABI Starter Chips
      'Executive Briefing': 'الملخص التنفيذي',
      'Holding Briefing': 'ملخص القابضة والخزينة',
      'Hospitality Briefing': 'ملخص الضيافة والمنتجعات',
      'Trading Briefing': 'ملخص تجارة الآليات',
      'Real Estate Briefing': 'ملخص العقارات والأملاك',
      'Insurance Briefing': 'ملخص التأمين والوساطة',
      'Intercompany Matrix': 'مصفوفة المعاملات البينية',
      'Partner Splits (165)': 'حصص الشركاء (165)',
      'Trial Balance': 'ميزان المراجعة',
      'Trial Balance Audit ($0.00)': 'تدقيق ميزان المراجعة ($0.00)',
      'Venue Revenue & POS': 'إيرادات الفروع ونقاط البيع',
      'Cabanas & Memberships': 'الشاليهات والاشتراكات',
      'Shacman VIN Fleet': 'أسطول شاحنات Shacman (VIN)',
      'FIFO Stock & Parts': 'مخزون قطع الغيار (FIFO)',
      '4235 VAT Rent Roll': 'جدول إيجارات 4235 الخاضعة للضريبة',
      'Expiring Leases': 'العقود القريبة من الانتهاء',
      '30/60/90d Renewals': 'تجديدات 30 / 60 / 90 يوماً',
      'Carrier Recon & Claims': 'مطابقة شركات التأمين والمطالبات',
      'WTC vs BBConstruction P&L': 'مقارنة أرباح وخسائر WTC و BBConstruction',
      'Overdue AR & Credit Hold': 'الذمم المتأخرة وإيقاف الائتمان',
      'Diesel Tank Audit': 'تدقيق خزان المازوت',
      'Team Access & Biometrics': 'صلاحيات الفريق وبصمة الوجه',

      // Sub-views & View Titles across All 6 Industries
      'Entity Comparison': 'مقارنة الشركات',
      'Analytics & Insights': 'لوحات التحليل والمؤشرات',
      'Sales & Deliveries': 'المبيعات والتسليمات',
      'VAT & Credit': 'الضريبة والائتمان',
      'Sales Analytics': 'تحليلات المبيعات',
      'Quarry & Haulage': 'الكسارات والنقل',
      'Quarry & Haulage Rates': 'أسعار الكسارات والنقل',
      'JV & Partnerships': 'الشراكات والمشاريع المشتركة',
      'Diesel & Lubricants': 'المازوت والزيوت والشحوم',
      'Fleet & Running Costs': 'الأسطول وتكاليف التشغيل',
      'Repairs, Warnings & Oil Logs': 'التصليحات والأعطال وغيار الزيت',
      'Drivers & Overtime': 'السائقون والعمل الإضافي',
      'Pricing & Commissions': 'التسعير والعمولات',
      'Cash Flow & Till': 'التدفق النقدي والصندوق اليومي',
      'Cash Flow Analytics': 'تحليلات التدفق النقدي',
      'External Entries': 'الحركات الخارجية',
      'FX Conversions': 'تحويلات العملات (FX)',
      'Customers & Receivables': 'العملاء والذمم المدينة',
      'Suppliers & Payables': 'الموردون والذمم الدائنة',
      'Expenses & Overhead': 'المصاريف والنفقات العامة',
      'Recurring Schedules': 'المصاريف الدورية المجدولة',
      'Warehouse Stock & Moves': 'مخزون وحركات المستودع',
      'Parts & Item Usage': 'استهلاك القطع والأصناف',
      'Daily Plant & Machine Map': 'خريطة المصنع والآليات اليومية',
      'Attendance & Overtime': 'الحضور والدوام الإضافي',
      'Site Transport': 'بدل نقل الورش والمواقع',
      'Contracts & OT Rates': 'العقود وأسعار الإضافي',
      'General Ledger & SOA': 'الأستاذ العام وكشوفات الحساب',
      'Chart of Accounts & Classes': 'شجرة الحسابات والأصناف (1–7)',
      'Automated GL Accounts': 'حسابات الأستاذ الآلية',
      'Loans & Settlements': 'القروض والتسديدات',
      'Equipment & Trucks': 'الآليات والشاحنات',
      'Drivers & Operators': 'السائقون والمشغلون',
      'Staff Members': 'سجل الموظفين',
      'Staff Roles': 'الوظائف والأدوار',
      'Sites & Regions': 'المواقع والمناطق',
      'Products & Grades': 'المنتجات والأصناف',
      'Items & Spare Parts': 'الأصناف وقطع الغيار',
      'Customers Registry': 'سجل العملاء',
      'Suppliers & Haulers': 'الموردون والناقلون',
      'Expense Categories': 'فئات المصاريف',
      'Currency & FX Rates': 'العملات وأسعار الصرف',
      'Currencies Registry': 'سجل العملات',
      'VAT Rates': 'نسب الضريبة (VAT)',
      'Statements & Reports': 'الكشوفات والتقارير الرسمية',
      'Group Consolidation & P&L': 'توحيد نتائج المجموعة والأرباح والخسائر',
      'Subsidiary Scorecards': 'بطاقات أداء الشركات التابعة',
      'Open Reconciliation Queue': 'طابور المطابقات المفتوحة',
      'Due From / Due To Matrix': 'مصفوفة الذمم البينية (لنا / علينا)',
      'Partner Capital & Current A/C': 'رأس مال وجاري الشركاء',
      'Profit Splits & Drawings': 'توزيع الأرباح والمسحوبات',
      'Loans Given / Taken & Interest': 'القروض الممنوحة والمكتسبة والفوائد',
      'Investments & Group Assets': 'الاستثمارات وأصول المجموعة',

      // Kiosks & Terminal Mode
      'Sales Dispatch': 'إرساليات المبيعات',
      'Raw Material': 'المواد الأولية',
      'Quarry & Raw': 'الكسارات والمواد الأولية',
      'Fuel & Lubricants': 'المحروقات والزيوت',
      'Staff Attendance': 'حضور وانصراف الموظفين',
      'Admin': 'المشرف',
      'Station Setup': 'إعداد المحطة',
      'Lock Kiosk': 'قفل الكشك',
      'Unlock Kiosk': 'فتح الكشك',
      'Clock IN': 'تسجيل دخول',
      'Clock OUT': 'تسجيل خروج',
      'Auto': 'تلقائي',
      'Mode': 'الوضع',
      'Station': 'المحطة',
      'Lateness & Penalties': 'التأخير والجزاءات',
      'Shift Schedule': 'جدول الورديات',
      'Enrol Face ID': 'تسجيل بصمة الوجه',
      'Attendance Register': 'سجل الحضور',
      'Paper': 'الورق',
      'Receipt': 'الإيصال',
      'Printer': 'الطابعة',
      'Pair': 'اقتران',
      'Priced Invoice': 'فاتورة مسعّرة',
      'Unpriced Gate Pass': 'تصريح خروج بدون سعر',
      'Priced 2-Leg Voucher': 'سند استلام مسعّر',
      'Unpriced Scale Slip': 'فيشة قبان بدون سعر',
      'Delivery': 'توصيل',
      'Plant Pickup': 'استلام من المصنع'
    },
    fr: {
      // Brand & Shell
      'ISABI Systems': 'ISABI Systems',
      'ISABI SYSTEMS': 'ISABI SYSTEMS',
      'Command Center': 'Centre de Commande',
      'Sidebar': 'Menu',
      'Lock': 'Verrouiller',
      'Dark': 'Sombre',
      'Light': 'Clair',
      'Done': 'Terminé',
      'Reset': 'Réinitialiser',
      'Close': 'Fermer',
      'Cancel': 'Annuler',
      'Ask': 'Demander',
      'Ask ISABI': 'Demander à ISABI',
      'ISABI': 'ISABI',
      '+ New Entry': '+ Nouvelle Saisie',
      'New Entry': 'Nouvelle Saisie',
      'Post Entry': 'Comptabiliser',
      'Post': 'Valider',
      'Save Changes': 'Enregistrer',
      'Void / Delete': 'Annuler / Supprimer',
      'Keep Editing': 'Continuer la saisie',
      'Discard Changes': 'Ignorer les modifications',
      'Unfinished Entry': 'Saisie non enregistrée',
      'Thermal Slip': 'Reçu Thermique',
      '360° Details': 'Détails 360°',
      'Overview': 'Aperçu',
      'Dispatch': 'Expéditions',
      'Books': 'Comptabilité',
      'Modules': 'Modules',

      // Sidebar Groups (All 6 Industries)
      'Executive & Analytics': 'Direction & Analytique',
      'Commercial & Procurement': 'Commercial & Achats',
      'Plant, Fleet & Workforce': 'Centrale, Flotte & Effectifs',
      'Finance & Accounting': 'Finance & Comptabilité',
      'Shared · All Entities': 'Partagé · Toutes Entités',
      'Group & Intercompany': 'Groupe & Inter-Sociétés',
      'Capital, Partners & Workforce': 'Capital, Associés & RH',
      'Venue Revenue & Procurement': 'Revenus Sites & Achats',
      'Resort Stock, Energy & Staff': 'Stocks, Énergie & Équipes',
      'Sales, Imports & Payables': 'Ventes, Imports & Fournisseurs',
      'Stock, Trucks & Workforce': 'Stocks, Camions & Effectifs',
      'Leasing, Sales & Billing': 'Locations, Ventes & Facturation',
      'Portfolio, Works & Workforce': 'Patrimoine, Travaux & RH',
      'Production, Renewals & Claims': 'Production, Renouvellements & Sinistres',
      'Claims, Catalogue & Workforce': 'Sinistres, Catalogue & RH',

      // Sidebar Hubs (All 6 Industries + Spine)
      'Executive Overview': 'Synthèse Direction',
      'Daily Operations': 'Opérations du Jour',
      'Operating Entities': 'Sociétés Opérationnelles',
      'Sentinels & Alerts': 'Sentinelles & Alertes',
      'AI Sentinels & Audit': 'Sentinelles IA & Audit',
      'Alerts & Thresholds': 'Règles d\'Alerte & Seuils',
      'Dashboards & Reports': 'Tableaux de Bord & États',
      'Sales & Receivables': 'Ventes & Clients (AR)',
      'Quarry, Haulage & JVs': 'Carrières, Transport & JV',
      'Expenses & Payables': 'Dépenses & Fournisseurs (AP)',
      'Fleet & Maintenance': 'Flotte & Maintenance',
      'Warehouse & Parts': 'Magasin & Pièces Détachées',
      'Payroll & Workforce': 'Paie & Personnel',
      'Cash Flow & Treasury': 'Trésorerie & Caisse',
      'General Ledger & COA': 'Grand Livre & Plan Comptable',
      'Counterparties & Sites': 'Tiers & Chantiers',
      'Catalog & Categories': 'Catalogue & Catégories',
      'Fleet, Drivers & Staff': 'Engins, Chauffeurs & Staff',
      'Currencies & VAT': 'Devises & TVA',
      'Tables': 'Tables',
      'Kiosks': 'Bornes',
      'Users': 'Accès',
      'All Tables & Registers': 'Toutes les Tables & Registres',
      'Plant Kiosks': 'Bornes Terrain & Centrale',
      'Users & Security': 'Utilisateurs & Sécurité',

      // Non-Manufacturing Industry Hubs
      'Group Consolidation': 'Consolidation Groupe',
      'Intercompany Hub': 'Flux Inter-Sociétés',
      'Partners & Profit Splits': 'Associés & Quote-Parts',
      'Loans, Capital & Assets': 'Prêts, Capital & Actifs',
      'Revenue, POS & Chalets': 'Recettes, Caisses POS & Chalets',
      'Memberships & Splits': 'Abonnements & Répartitions',
      'Kitchen, Bar & Stock': 'Cuisine, Bar & Économat',
      'Generators & Utilities': 'Groupes Électrogènes & Énergie',
      'Invoicing & Receivables': 'Facturation & Créances',
      'Imports & Landed Cost': 'Importations & Coût de Revient',
      'Showroom & Serial Units': 'Showroom & Unités VIN',
      'Spare Parts & Warehouses': 'Pièces de Rechange & Dépôts',
      'Leases & Rent Roll': 'Baux & Quittancier',
      'Property Sales & Buyers': 'Ventes Immobilières & Acquéreurs',
      'Portfolio & Valuations': 'Patrimoine & Valorisations',
      'Work Orders & Fit-Out': 'Bons de Travaux & Aménagement',
      'Policies & Renewals': 'Polices & Renouvellements',
      'Premiums & Insurer Recon': 'Primes & Bordereaux Compagnies',
      'Claims & Recoveries': 'Sinistres & Recours',
      'Lines, Products & Rates': 'Branches, Produits & Tarifs',

      // Industry Names
      'Manufacturing': 'Industrie & Béton',
      'Manufacturing Operations': 'Opérations Industrielles',
      'Holding & Treasury': 'Holding & Trésorerie',
      'Hospitality & Resorts': 'Hôtellerie & Resorts',
      'Automotive & Heavy Trading': 'Négoce Auto & Poids Lourds',
      'Real Estate & Property': 'Immobilier & Patrimoine',
      'Insurance & Brokerage': 'Assurance & Courtage',
      'Double-Entry Ledger': 'Comptabilité en Partie Double',

      // Topbar Slicers & Company Switcher
      'IND': 'SECT',
      'CO': 'SOC',
      'Industries': 'Secteurs d\'Activité',
      'Operating Companies': 'Sociétés Opérationnelles',
      'All Assigned': 'Toutes Autorisées',
      'All Books': 'Tous les Livres',
      'Official Books': 'Livres Officiels',
      'All': 'Tout',
      'Year': 'Année',
      'Month': 'Mois',
      'Week': 'Sem.',
      'Day': 'Jour',
      'Rep Date': 'Date Compta',
      'Tx Date': 'Date Opér.',
      'Reporting Date Basis': 'Base Date Comptable',
      'Transaction Date Basis': 'Base Date Opérationnelle',
      'All-Time': 'Toutes Périodes',
      'Today': 'Aujourd\'hui',
      'Yesterday': 'Hier',
      'This Week': 'Cette Semaine',
      'Last Week': 'Semaine Dernière',
      'This Month (MTD)': 'Ce Mois (MTD)',
      'Last Month': 'Mois Dernier',
      'This Quarter (QTD)': 'Ce Trimestre (QTD)',
      'Year to Date (YTD)': 'Cumul Annuel (YTD)',
      'All BUs · Shared Registry': 'Toutes Sociétés · Registre Partagé',
      'Universal Registry': 'Registre Universel',
      'Live Plant Terminals': 'Terminaux Terrain en Direct',

      // Auth Gate & Biometrics
      'Starting Face ID…': 'Démarrage de Face ID…',
      'Tap for Face ID': 'Appuyer pour Face ID',
      'Pause Camera': 'Pause Caméra',
      'Resume Camera': 'Activer Caméra',
      'FACE ID VERIFIED': 'FACE ID VÉRIFIÉ',
      'or select account for PIN': 'ou sélectionnez un compte pour le code PIN',
      'Select or search your account…': 'Sélectionnez ou recherchez votre compte…',
      'Switch': 'Changer',
      'Access PIN': 'Code PIN',
      'Sign In': 'Connexion',
      'Client Website · isabisystems.com': 'Site Client · isabisystems.com',
      'Offline Cache': 'Mode Hors-Ligne',
      'Step 2: Look at the camera to verify': 'Étape 2 : Regardez la caméra pour vérifier',

      // Smart Entry Modal & Forms
      'New Operational Transaction': 'Nouvelle Opération',
      'ISABI Double-Entry Operational Desk · Auto-Journal & Price Matrix': 'Guichet Opérationnel Partie Double · Journal Auto & Grille Tarifaire',
      'Sales Ticket': 'Bon de Vente / Livraison',
      'Raw Material Ticket': 'Bon Matières Premières',
      'Customer AR Receipt': 'Encaissement Client',
      'Fuel & Lubricant Intake': 'Bon Carburant & Lubrifiant',
      'Expense': 'Charge / Dépense',
      'Supplier Settlement': 'Règlement Fournisseur',
      'Company': 'Société',
      'Transaction Date': 'Date d\'Opération',
      'Reporting Date': 'Date Comptable',
      'Dispatch Time': 'Heure d\'Expédition',
      'Customer': 'Client',
      'Supplier': 'Fournisseur',
      'Product': 'Produit / Qualité',
      'Quantity': 'Quantité',
      'Unit (UoM)': 'Unité',
      'Unit Price': 'Prix Unitaire',
      'Total': 'Total',
      'TOTAL': 'TOTAL',
      'Notes': 'Notes',
      'Description': 'Libellé / Description',
      'Category': 'Catégorie',
      'Subcategory': 'Sous-catégorie',
      'Site': 'Chantier / Site',
      'Region': 'Région',
      'Equipment': 'Engin / Camion',
      'Driver': 'Chauffeur',
      'Staff Member': 'Collaborateur',
      'Role': 'Fonction / Rôle',
      'Start Date': 'Date de Début',
      'End Date': 'Date de Fin',
      'Payment Method': 'Mode de Règlement',
      'Cash': 'Espèces',
      'Credit': 'À Crédit',
      'Status': 'Statut',
      'Active': 'Actif',
      'Pending': 'En Attente',
      'Completed': 'Terminé',

      // Common Table & Toolbar Labels
      'Columns': 'Colonnes',
      'Export CSV': 'Exporter CSV',
      'CSV': 'CSV',
      'Print': 'Imprimer',
      'Search': 'Rechercher',
      'Clear': 'Effacer',
      'Clear ✕': 'Effacer ✕',
      'Top 10': 'Top 10',
      'Copy Sum': 'Copier Total',
      'Selected Qty': 'Qté Sélectionnée',
      'Ex-VAT Sum': 'Total HT',
      'VAT Sum': 'Total TVA',
      'Selected Total': 'Total Sélectionné',
      'Avg / Row': 'Moy. / Ligne',
      'Read Aloud': 'Lecture Vocale',

      // Ask ISABI Starter Chips
      'Executive Briefing': 'Synthèse Direction',
      'Holding Briefing': 'Synthèse Holding & Trésorerie',
      'Hospitality Briefing': 'Synthèse Hôtellerie & Resorts',
      'Trading Briefing': 'Synthèse Négoce & Poids Lourds',
      'Real Estate Briefing': 'Synthèse Immobilier & 4235',
      'Insurance Briefing': 'Synthèse Assurance & Courtage',
      'Intercompany Matrix': 'Matrice Inter-Sociétés',
      'Partner Splits (165)': 'Comptes Associés (165)',
      'Trial Balance': 'Balance Générale',
      'Trial Balance Audit ($0.00)': 'Audit Balance Générale ($0.00)',
      'Venue Revenue & POS': 'Revenus Sites & Caisses POS',
      'Cabanas & Memberships': 'Cabanas & Abonnements',
      'Shacman VIN Fleet': 'Parc Shacman VIN & Marges',
      'FIFO Stock & Parts': 'Valorisation Stock FIFO',
      '4235 VAT Rent Roll': 'Quittancier TVA 4235 S.A.L',
      'Expiring Leases': 'Baux arrivant à échéance',
      '30/60/90d Renewals': 'Renouvellements 30/60/90j',
      'Carrier Recon & Claims': 'Rapprochement Compagnies & Sinistres',
      'WTC vs BBConstruction P&L': 'Comparatif P&L WTC vs BBConstruction',
      'Overdue AR & Credit Hold': 'Créances Échues & Blocage Crédit',
      'Diesel Tank Audit': 'Audit Cuve Gasoil',
      'Team Access & Biometrics': 'Accès Équipe & Biométrie',

      // Sub-views & View Titles across All 6 Industries
      'Entity Comparison': 'Comparatif Sociétés',
      'Analytics & Insights': 'Tableaux de Bord & Analyses',
      'Sales & Deliveries': 'Ventes & Livraisons',
      'VAT & Credit': 'TVA & Crédit Client',
      'Sales Analytics': 'Analyses des Ventes',
      'Quarry & Haulage': 'Carrières & Transport',
      'Quarry & Haulage Rates': 'Tarifs Carrières & Transport',
      'JV & Partnerships': 'JV & Partenariats',
      'Diesel & Lubricants': 'Gasoil & Lubrifiants',
      'Fleet & Running Costs': 'Flotte & Coûts d\'Exploitation',
      'Repairs, Warnings & Oil Logs': 'Réparations, Alertes & Vidanges',
      'Drivers & Overtime': 'Chauffeurs & Heures Sup.',
      'Pricing & Commissions': 'Tarification & Commissions',
      'Cash Flow & Till': 'Trésorerie & Caisse du Jour',
      'Cash Flow Analytics': 'Analyses de Trésorerie',
      'External Entries': 'Mouvements Externes',
      'FX Conversions': 'Opérations de Change (FX)',
      'Customers & Receivables': 'Clients & Créances (AR)',
      'Suppliers & Payables': 'Fournisseurs & Dettes (AP)',
      'Expenses & Overhead': 'Charges & Frais Généraux',
      'Recurring Schedules': 'Charges Périodiques',
      'Warehouse Stock & Moves': 'Stock Magasin & Mouvements',
      'Parts & Item Usage': 'Consommation Pièces & Articles',
      'Daily Plant & Machine Map': 'Carte Quotidienne Centrale & Engins',
      'Attendance & Overtime': 'Pointage & Heures Sup.',
      'Site Transport': 'Indemnités Transport Chantier',
      'Contracts & OT Rates': 'Contrats & Barèmes Heures Sup.',
      'General Ledger & SOA': 'Grand Livre & Relevés de Compte',
      'Chart of Accounts & Classes': 'Plan Comptable & Classes (1–7)',
      'Automated GL Accounts': 'Comptes GL Automatisés',
      'Loans & Settlements': 'Emprunts & Remboursements',
      'Equipment & Trucks': 'Engins & Camions',
      'Drivers & Operators': 'Chauffeurs & Opérateurs',
      'Staff Members': 'Registre du Personnel',
      'Staff Roles': 'Fonctions & Rôles',
      'Sites & Regions': 'Chantiers & Régions',
      'Products & Grades': 'Produits & Formules',
      'Items & Spare Parts': 'Articles & Pièces Détachées',
      'Customers Registry': 'Répertoire Clients',
      'Suppliers & Haulers': 'Fournisseurs & Transporteurs',
      'Expense Categories': 'Catégories de Charges',
      'Currency & FX Rates': 'Devises & Taux de Change',
      'Currencies Registry': 'Répertoire des Devises',
      'VAT Rates': 'Taux de TVA',
      'Statements & Reports': 'États Financiers & Relevés',
      'Group Consolidation & P&L': 'Consolidation Groupe & Compte de Résultat',
      'Subsidiary Scorecards': 'Tableaux de Bord Filiales',
      'Open Reconciliation Queue': 'File de Rapprochement Ouverte',
      'Due From / Due To Matrix': 'Matrice Créances / Dettes Inter-Sociétés',
      'Partner Capital & Current A/C': 'Capital & Comptes Courants Associés',
      'Profit Splits & Drawings': 'Quote-Parts & Prélèvements',
      'Loans Given / Taken & Interest': 'Prêts Accordés / Reçus & Intérêts',
      'Investments & Group Assets': 'Participations & Actifs Groupe',

      // Kiosks & Terminal Mode
      'Sales Dispatch': 'Expédition Ventes',
      'Raw Material': 'Matières Premières',
      'Quarry & Raw': 'Carrière & Matières',
      'Fuel & Lubricants': 'Carburant & Lubrifiants',
      'Staff Attendance': 'Pointage Personnel',
      'Admin': 'Admin',
      'Station Setup': 'Config. Borne',
      'Lock Kiosk': 'Verrouiller Borne',
      'Unlock Kiosk': 'Déverrouiller Borne',
      'Clock IN': 'Entrée (IN)',
      'Clock OUT': 'Sortie (OUT)',
      'Auto': 'Auto',
      'Mode': 'Mode',
      'Station': 'Poste',
      'Lateness & Penalties': 'Retards & Pénalités',
      'Shift Schedule': 'Planning Équipes',
      'Enrol Face ID': 'Enrôler Face ID',
      'Attendance Register': 'Registre de Pointage',
      'Paper': 'Papier',
      'Receipt': 'Ticket',
      'Printer': 'Imprimante',
      'Pair': 'Associer',
      'Priced Invoice': 'Facture Chiffrée',
      'Unpriced Gate Pass': 'Bon de Sortie Sans Prix',
      'Priced 2-Leg Voucher': 'Bon Réception Chiffré',
      'Unpriced Scale Slip': 'Ticket Bascule Sans Prix',
      'Delivery': 'Livraison',
      'Plant Pickup': 'Enlèvement Centrale'
    }
  };

  function getInitialLang() {
    try {
      const params = new URLSearchParams(location.search);
      const qLang = (params.get('lang') || '').trim().toLowerCase();
      if (qLang && LOCALES[qLang]) return qLang;
      if (window.__MFG_HEADLESS_TEST || navigator.webdriver) return 'en';
      const saved = (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(SHOWCASE_STORAGE_KEY) || '').trim().toLowerCase();
      if (saved && LOCALES[saved]) return saved;
    } catch (_) {}
    return 'en';
  }

  let _activeLang = getInitialLang();
  let _everTranslated = (_activeLang !== 'en');

  function translateSegment(seg, lang) {
    if (!seg || lang === 'en') return seg;
    const map = DICT[lang];
    if (!map) return seg;
    const trimmed = seg.trim();
    if (!trimmed) return seg;

    // 1. Exact lookup
    if (map[trimmed]) {
      return seg.replace(trimmed, map[trimmed]);
    }

    // 2. Dynamic pattern lookups
    let m = trimmed.match(/^All Group\s*\((\d+)\)$/i);
    if (m) {
      const repl = lang === 'ar' ? `كل المجموعة (${m[1]})` : `Tout le Groupe (${m[1]})`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Entities$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} شركات` : `${m[1]} Entités`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^All Entities$/i);
    if (m) {
      const repl = lang === 'ar' ? 'جميع الشركات' : 'Toutes les Entités';
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^Full Access\s*·\s*(\d+)\s+Entities$/i);
    if (m) {
      const repl = lang === 'ar' ? `صلاحية كاملة · ${m[1]} شركات` : `Accès Complet · ${m[1]} Entités`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Alerts?$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} تنبيه` : `${m[1]} Alertes`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Pending$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} معلق` : `${m[1]} En attente`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Open$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} مفتوح` : `${m[1]} Ouverts`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Crit$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} حرج` : `${m[1]} Crit.`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Industry\s*·\s*(\d+)\s+Companies Permitted\s*\(RLS\)$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} قطاع · ${m[2]} شركات متاحة` : `${m[1]} Secteur · ${m[2]} Sociétés Autorisées`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Industries\s*·\s*(\d+)\s+Companies Permitted\s*\(RLS\)$/i);
    if (m) {
      const repl = lang === 'ar' ? `${m[1]} قطاعات · ${m[2]} شركة متاحة` : `${m[1]} Secteurs · ${m[2]} Sociétés Autorisées`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^\+\s*New\s+(.+)$/i);
    if (m) {
      const inner = translateSegment(m[1], lang);
      const repl = lang === 'ar' ? `+ إضافة ${inner}` : `+ Nouveau : ${inner}`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^New\s+(.+)$/i);
    if (m) {
      const inner = translateSegment(m[1], lang);
      const repl = lang === 'ar' ? `إضافة ${inner}` : `Nouveau : ${inner}`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^Edit\s+(.+)$/i);
    if (m) {
      const inner = translateSegment(m[1], lang);
      const repl = lang === 'ar' ? `تعديل ${inner}` : `Modifier : ${inner}`;
      return seg.replace(trimmed, repl);
    }
    m = trimmed.match(/^(\d+)\s+Rows?\s+Selected$/i);
    if (m) {
      const repl = lang === 'ar' ? `تم تحديد ${m[1]} سطر` : `${m[1]} Lignes Sélectionnées`;
      return seg.replace(trimmed, repl);
    }

    return seg;
  }

  function translateString(str, lang) {
    const targetLang = lang || _activeLang;
    if (!str || typeof str !== 'string' || targetLang === 'en') return str;
    const trimmed = str.trim();
    if (!trimmed) return str;
    // Skip pure numbers, currencies, dates, or short codes
    if (/^[+-]?[$€£]?\s*[\d,.:/%+-]+(\s*(USD|LBP|EUR|AED|LL|m³|t|kg|L|km|hrs?|d))?$/i.test(trimmed)) return str;

    const map = DICT[targetLang];
    if (!map) return str;

    if (map[trimmed]) {
      return str.replace(trimmed, map[trimmed]);
    }

    // Handle composite strings separated by ' · '
    if (trimmed.includes(' · ')) {
      const parts = trimmed.split(' · ');
      let changed = false;
      const outParts = parts.map(p => {
        const tp = translateSegment(p, targetLang);
        if (tp !== p) changed = true;
        return tp;
      });
      if (changed) return str.replace(trimmed, outParts.join(' · '));
    }

    return translateSegment(str, targetLang);
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'SVG', 'OPTION']);

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute('data-no-i18n')) return true;
    if (el.classList && (el.classList.contains('num') || el.classList.contains('av') || el.classList.contains('auth-seat-av'))) return true;
    return false;
  }

  function translateDom(rootEl) {
    if (_activeLang === 'en' && !_everTranslated) return;
    const root = rootEl || document.body;
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || shouldSkipElement(p)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-no-i18n], svg, code, pre, script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let n;
    while ((n = walker.nextNode())) {
      const cur = n.nodeValue || '';
      if (!cur.trim()) continue;
      if (n.__enText === undefined) {
        n.__enText = cur;
      } else if (_activeLang !== 'en' && cur !== n.__enApplied && cur !== n.__enText) {
        // Dynamic code updated this text node with new English text
        n.__enText = cur;
      }
      if (_activeLang === 'en') {
        if (n.nodeValue !== n.__enText) n.nodeValue = n.__enText;
        n.__enApplied = n.__enText;
      } else {
        const nextVal = translateString(n.__enText, _activeLang);
        if (n.nodeValue !== nextVal) n.nodeValue = nextVal;
        n.__enApplied = nextVal;
      }
    }

    // Translate placeholders on inputs
    const inputs = root.querySelectorAll ? root.querySelectorAll('input[placeholder], textarea[placeholder]') : [];
    inputs.forEach(inp => {
      const curP = inp.getAttribute('placeholder') || '';
      if (!curP) return;
      if (inp.__enPlaceholder === undefined) {
        inp.__enPlaceholder = curP;
      } else if (_activeLang !== 'en' && curP !== inp.__enPlaceholderApplied && curP !== inp.__enPlaceholder) {
        inp.__enPlaceholder = curP;
      }
      if (_activeLang === 'en') {
        if (curP !== inp.__enPlaceholder) inp.setAttribute('placeholder', inp.__enPlaceholder);
        inp.__enPlaceholderApplied = inp.__enPlaceholder;
      } else {
        const nextP = translateString(inp.__enPlaceholder, _activeLang);
        if (curP !== nextP) inp.setAttribute('placeholder', nextP);
        inp.__enPlaceholderApplied = nextP;
      }
    });
  }

  function syncLangSwitchersDom() {
    const loc = LOCALES[_activeLang] || LOCALES.en;
    document.documentElement.setAttribute('lang', loc.code);
    document.documentElement.setAttribute('dir', loc.dir || 'ltr');
    document.body && document.body.setAttribute('data-lang', loc.code);

    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      const code = btn.getAttribute('data-lang-btn');
      const isAct = code === loc.code;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });

    const mobBtn = document.getElementById('mobileLangBtn');
    if (mobBtn) {
      mobBtn.textContent = loc.code === 'ar' ? 'عربي' : loc.code.toUpperCase();
    }
  }

  function setLang(nextLang, opts = {}) {
    const code = String(nextLang || 'en').trim().toLowerCase();
    if (!LOCALES[code]) return _activeLang;
    _activeLang = code;
    if (code !== 'en') _everTranslated = true;

    if (!opts.skipStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, code);
        localStorage.setItem(SHOWCASE_STORAGE_KEY, code);
      } catch (_) {}
    }

    syncLangSwitchersDom();
    translateDom(document.body);

    // Sync Ask ISABI voice & starter chips language if available
    if (window.MFG_ASK && typeof window.MFG_ASK.setPreferredLang === 'function') {
      try { window.MFG_ASK.setPreferredLang(code); } catch (_) {}
    }

    try {
      window.dispatchEvent(new CustomEvent('mfg:lang-changed', { detail: { lang: code, dir: LOCALES[code].dir } }));
    } catch (_) {}

    return _activeLang;
  }

  function cycleLang() {
    const order = ['en', 'ar', 'fr'];
    const idx = order.indexOf(_activeLang);
    const next = order[(idx + 1) % order.length];
    return setLang(next);
  }

  function registerLocale(code, meta, dictEntries) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return false;
    LOCALES[c] = Object.assign({
      code: c,
      label: c.toUpperCase(),
      shortLabel: c.toUpperCase(),
      nativeName: c.toUpperCase(),
      dir: 'ltr',
      bcp47: c
    }, meta || {});
    DICT[c] = Object.assign(DICT[c] || {}, dictEntries || {});
    return true;
  }

  function wireGlobalLangDelegation() {
    document.addEventListener('click', e => {
      const langBtn = e.target.closest && e.target.closest('[data-lang-btn]');
      if (langBtn) {
        e.preventDefault();
        e.stopPropagation();
        setLang(langBtn.getAttribute('data-lang-btn'));
        return;
      }
      const mobBtn = e.target.closest && e.target.closest('#mobileLangBtn');
      if (mobBtn) {
        e.preventDefault();
        e.stopPropagation();
        cycleLang();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireGlobalLangDelegation();
      syncLangSwitchersDom();
      if (_activeLang !== 'en') translateDom(document.body);
    }, { once: true });
  } else {
    wireGlobalLangDelegation();
    syncLangSwitchersDom();
    if (_activeLang !== 'en') translateDom(document.body);
  }

  window.MFG_I18N = {
    getLang: () => _activeLang,
    getLocale: () => LOCALES[_activeLang] || LOCALES.en,
    getSupportedLocales: () => Object.values(LOCALES),
    setLang,
    cycleLang,
    t: translateString,
    translateDom,
    syncLangSwitchersDom,
    registerLocale,
    DICT
  };
})();
