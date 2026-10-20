# Client-side JavaScript for ISABI Systems PWA

JS = r"""
(function () {
  'use strict';

  const WA_NUMBER = '96170444955';
  const EMAIL_ADDR = 'hbdeir16@gmail.com';
  const ASK_FLOW_U_B64 = '__ASK_FLOW_U_B64__';
  const ASK_FLOW_K_B64 = '__ASK_FLOW_K_B64__';
  const SEC_IDS = ['architecture', 'industries', 'sandbox', 'microsoft-ai', 'ingenuity', 'pricing', 'faq', 'portal'];
  const NOW = new Date();
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dayLabel(offsetDays) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - offsetDays);
    return d.getDate() + ' ' + MONTH_ABBR[d.getMonth()];
  }
  const DAY_TOKENS = { D0: dayLabel(0), D1: dayLabel(1) };

  const BADGE_MINI_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="34" height="34" style="border-radius:7px;flex-shrink:0"><rect width="120" height="120" rx="26" fill="#0B1730"/><g transform="translate(39.52,77.62) scale(0.74)"><g fill="#F4F2EE"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g><g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/><rect x="0" y="17.5" width="55.66" height="3.4"/></g></g></svg>';
  const RAIL_MARK_SVG = '<svg viewBox="-9.5 -78.8 74.66 109.7" height="22"><g fill="#F4F2EE"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g><g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/><rect x="0" y="17.5" width="55.66" height="3.4"/></g></svg>';
  const ICONS = __ICONS_JSON__;

  // ---------------- 8 INDUSTRY BLUEPRINTS ----------------
  const INDUSTRIES = [
    {
      id: 'hospitality',
      sandboxKey: 'hospitality',
      cfgName: 'Hospitality & Resorts',
      name: 'Hospitality, Resorts & Beach Clubs',
      sub: 'Multi-property revenue, F&B cost control, seasonal payroll & partner splits',
      badge: 'Industry Blueprint 01 · Hospitality Operations',
      lead: 'Designed for multi-property hotel groups, beach resorts, and high-volume F&B venues where daily outlet cash auditing, seasonal staffing, supplier procurement, and partner profit-sharing must reconcile every night.',
      modules: [
        'Multi-Property Business Unit Isolation (Per Resort / Venue)',
        'Daily Outlet Revenue & End-of-Day Till Close Audit (Entrance, Cabanas, F&B, Events)',
        'Supplier Invoices, Food & Beverage Cost Control & Stock Takes',
        'Partner Statement of Accounts (SOA) & Automated Profit-Split Engine',
        'Seasonal Staff Contracts, Advances, Tips & Biometric Attendance'
      ],
      workflows: [
        'Offline POS till posts end-of-day sales totals straight into the revenue ledger',
        'Supervisor stamp workflow on petty cash and supplier credit purchases',
        'Automated monthly partner capital & profit distribution statements',
        'Nightly cross-property KPI flash report delivered to owners via Power BI'
      ],
      reports: [
        'Consolidated & Per-Property P&L (Year / Month / Week / Day picker)',
        'Printable Supplier & Partner Statement of Accounts (.rdl)',
        'Outlet Gross Margin & Revenue Mix Analytics',
        'Payroll, Attendance & Seasonal Labor Cost Ratio'
      ],
      metrics: [
        ['Properties Unified', '1 to 10+ Venues'],
        ['Daily Revenue Audit', 'Real-Time TTC'],
        ['Partner Split Accuracy', '100% Automated']
      ]
    },
    {
      id: 'trading',
      sandboxKey: 'trading',
      cfgName: 'Automotive & Heavy Equipment Trading',
      name: 'Automotive, Heavy Equipment & Parts Trading',
      sub: 'VIN chassis tracking, bonded customs stock, showroom sales & SOA',
      badge: 'Industry Blueprint 02 · Trading & Dealership Operations',
      lead: 'Built for vehicle importers, heavy equipment distributors, and spare-parts wholesalers managing high-value inventory across bonded warehouses, showrooms, and workshop service bays with strict multi-currency accounting.',
      modules: [
        'Vehicle VIN / Chassis Registry (In-Transit, Bonded Customs, Showroom, Sold)',
        'Landed Cost Calculator (FOB, Freight, Insurance, Customs Duty, Clearance)',
        'Spare Parts SKU Inventory, Multi-Warehouse Transfers & Reorder Alerts',
        'Dealer & Fleet Customer Invoicing, Installment Schedules & Aged Receivables',
        'Dual-Entry Statutory Book Reconciliation Bridge'
      ],
      workflows: [
        'Automated margin lock check before a showroom sales order is approved',
        'Customs clearance milestone tracking from Bill of Lading to plate registration',
        'Overdue receivable alerts at 30, 60, and 90 days with one-click SOA PDF',
        'Automated line-by-line variance check against statutory accounting registers'
      ],
      reports: [
        'Unit-by-Unit Gross Profit & Landed Cost Breakdown (.rdl & Power BI)',
        'Customer Receivable Aging (0-30, 31-60, 61-90, 90+ Days)',
        'Bonded vs Duty-Paid Stock Valuation Report',
        'Statutory vs Operational P&L Reconciliation Statement'
      ],
      metrics: [
        ['Inventory Granularity', 'Per VIN & SKU'],
        ['Costing Model', 'Full Landed Cost'],
        ['Receivable Control', 'Live Aging & SOA']
      ]
    },
    {
      id: 'manufacturing',
      sandboxKey: 'manufacturing',
      cfgName: 'Concrete, Construction & Manufacturing',
      name: 'Ready-Mix Concrete, Construction & Manufacturing',
      sub: 'Batch plant tickets, mixer fleet dispatch, silo raw materials & credit control',
      badge: 'Industry Blueprint 03 · Manufacturing & Fleet Operations',
      lead: 'Engineered for ready-mix concrete plants, construction material producers, and heavy transport fleets where every cubic meter batched, cement silo delivery, and transit mixer trip must be tracked from plant dispatch to customer signature.',
      modules: [
        'Sales Ticket & Batch Plant Dispatch Ledger (m³ poured, mix design, pump usage)',
        'Raw Material Silo & Aggregate Stock Ledger (Cement, Sand, Gravel, Admixtures)',
        'Transit Mixer, Pump & Heavy Transport Fleet Fuel and Maintenance Tracking',
        'Contractor Project Billing, Delivery Note Matching & Credit Limit Gates',
        'Multi-Company Inter-Entity Billing (Plant to Construction to Transport)'
      ],
      workflows: [
        'Real-time form rules enforcing pump fees, mix grade pricing, and customer credit caps',
        'Daily theoretical vs actual cement and aggregate consumption variance alerts',
        'Automated driver trip allowance and mixer utilization calculation',
        'One-click customer project billing statement grouped by construction site'
      ],
      reports: [
        'Daily Plant Production Volume (m³) & Average Selling Price per Mix',
        'Customer & Project Statement of Account with Ticket Breakdown (.rdl)',
        'Raw Material Yield, Silo Depletion & Gross Margin per Cubic Meter',
        'Fleet Profitability & Fuel Cost per Delivered Cubic Meter'
      ],
      metrics: [
        ['Production Tracking', 'Per Ticket & m³'],
        ['Stock Control', 'Live Silo & Yard'],
        ['Multi-Company', 'Inter-Entity Sync']
      ]
    },
    {
      id: 'realestate',
      sandboxKey: 'realestate',
      cfgName: 'Real Estate & Property Portfolio',
      name: 'Real Estate & Commercial Property Portfolios',
      sub: 'Asset registry, lease schedules, tenant billing, maintenance & net yield',
      badge: 'Industry Blueprint 04 · Real Estate Operations',
      lead: 'Tailored for property developers, commercial landlords, and family real estate portfolios managing residential towers, retail plazas, and land banks across multiple legal entities.',
      modules: [
        'Property, Building & Unit Registry (Occupied, Vacant, Under Renovation, Reserved)',
        'Tenant Lease Contracts, Escalation Clauses & Post-Dated Check (PDC) Schedules',
        'Automated Rent Invoicing, Deposit Ledgers & Utility Charge-Backs',
        'Property Maintenance Work Orders, Contractor Bids & CapEx vs OpEx Tagging',
        'Owner & Co-Investor Distribution Schedules'
      ],
      workflows: [
        '60-day and 30-day lease renewal and rent escalation notifications',
        'Automated tenant receipt generation and overdue collection reminders',
        'Maintenance approval routing with unit-level cost attribution',
        'Monthly property-by-property net operating income (NOI) close'
      ],
      reports: [
        'Portfolio Occupancy, Lease Expiry & Vacancy Roll-Forward',
        'Net Operating Income (NOI) & Cap Rate by Property (Power BI)',
        'Tenant Statement of Account & Rent Collection Aging (.rdl)',
        'Maintenance & CapEx Spend vs Budget'
      ],
      metrics: [
        ['Portfolio Visibility', 'Per Unit & Lease'],
        ['Rent & PDC Tracking', 'Automated Alerts'],
        ['Yield Reporting', 'Live NOI & Cashflow']
      ]
    },
    {
      id: 'insurance',
      sandboxKey: 'insurance',
      cfgName: 'Insurance Brokerage',
      name: 'Insurance Brokerage & Underwriting Operations',
      sub: 'Policy lifecycle, carrier commissions, endorsements, renewals & claims',
      badge: 'Industry Blueprint 05 · Insurance Brokerage Operations',
      lead: 'Built for insurance brokerages and agencies handling motor, medical, marine, property, and life policies across multiple carriers, where commission splits, sub-agent payouts, and client premium collections require exact accounting.',
      modules: [
        'Policy & Endorsement Registry (Motor, Medical, Property, Marine, Engineering)',
        'Carrier Bordereaux, Gross vs Net Premium & Commission Split Calculation',
        'Sub-Agent & Producer Commission Ledgers',
        'Claims Intake, Survey Tracking & Settlement Status',
        '90/60/30-Day Renewal Pipeline & Client Retention Console'
      ],
      workflows: [
        'Automatic calculation of carrier net payable and brokerage commission on policy issue',
        'Installment collection tracking with client WhatsApp and Email reminders',
        'Endorsement pro-rata premium adjustment and credit note generation',
        'Monthly carrier settlement reconciliation'
      ],
      reports: [
        'Production & Commission Revenue by Line of Business and Carrier',
        'Carrier Settlement Bordereaux & Client Statement of Account (.rdl)',
        'Renewal Retention Rate & Expiring Book Forecast',
        'Uncollected Premium Aging & Producer Net Payable'
      ],
      metrics: [
        ['Policy Accounting', 'Gross / Net / Comm'],
        ['Renewal Pipeline', '90-60-30d Radar'],
        ['Carrier Bordereaux', '1-Click Printable']
      ]
    },
    {
      id: 'holding',
      sandboxKey: 'holding',
      cfgName: 'Multi-Entity Holding Group',
      name: 'Multi-Entity Holding Groups & Family Offices',
      sub: 'Group treasury, intercompany eliminations, partner capital & recruitment',
      badge: 'Industry Blueprint 06 · Holding & Group Command',
      lead: 'The group view for owners and holding companies operating across several industries. It consolidates cash, receivables, profitability, partner capital accounts, and recruitment into one boardroom picture.',
      modules: [
        'Holding Root-Level Treasury, Bank Accounts & Multi-Currency Cash Positioning',
        'Intercompany Loan, Management Fee & Cross-Charge Ledger',
        'Shareholder & Partner Capital Accounts, Drawings & Dividend Schedules',
        'Executive Relationship, Legal Matter & Board Interaction Tracker',
        'Group-Wide Automated Recruitment (Tally to SharePoint CV Drive to Dataverse)'
      ],
      workflows: [
        'Overnight group consolidation across all operating Business Units',
        'Automated routing of job applicant CVs into per-company SharePoint folders',
        'Executive exception alerts when any subsidiary breaches overdue or margin thresholds',
        'One-click board pack generation across all operating companies'
      ],
      reports: [
        'Group Consolidated P&L, Balance Sheet & Cash Position',
        'Entity-by-Entity Performance & Books-Closed Status Matrix',
        'Intercompany Balance Confirmation & Partner SOA (.rdl)',
        'Group Recruitment Funnel & Headcount Analytics'
      ],
      metrics: [
        ['Group Consolidation', 'Cross-Industry'],
        ['Security Model', 'Strict BU Isolation'],
        ['Board Reporting', 'Live Daily Flash']
      ]
    },
    {
      id: 'pos',
      sandboxKey: 'hospitality',
      cfgName: 'Hospitality & Resorts',
      name: 'Custom Offline POS Till (Companion PWA)',
      sub: 'Zero-latency cashier till, offline sales queue & Bluetooth thermal printing',
      badge: 'Industry Blueprint 07 · Companion Field PWA',
      lead: 'When the internet drops at a busy beach club, restaurant, or retail counter, cloud-based tills stop. ISABI Systems builds offline-first web app tills that keep ringing sales, print thermal receipts locally, and sync to the ledger automatically.',
      modules: [
        'Touch-Optimized Cashier Grid with Category Tabs, Modifiers & Fast Search',
        'IndexedDB / Local Offline Transaction Queue (100% functional without internet)',
        'Direct RawBT / ESC-POS Thermal Receipt & Kitchen Order Printing',
        'Shift Open / Close Cash Drawer Count & Variance Audit',
        'Automated End-of-Day Sales Totals Sync into the Dataverse Revenue Ledger'
      ],
      workflows: [
        'Cashier rings order and prints local thermal receipt in under 300ms',
        'If Wi-Fi or 4G drops, orders queue locally with zero interruption',
        'On shift close, manager reconciles cash + card totals and posts directly to ERP',
        'Zero per-terminal SaaS licensing fees'
      ],
      reports: [
        'Shift Close Report & Cashier Cash Variance Log',
        'Hourly Sales Velocity & Top-Selling Item Mix',
        'Void, Discount & Complimentary Audit Trail',
        'Direct Feed into Group Power BI Revenue Dashboards'
      ],
      metrics: [
        ['Offline Uptime', '100% Local Queue'],
        ['Receipt Print Speed', '< 0.3 Seconds'],
        ['ERP Integration', 'Native Dataverse Sync']
      ]
    },
    {
      id: 'attendance',
      sandboxKey: 'manufacturing',
      cfgName: 'Concrete, Construction & Manufacturing',
      name: 'Biometric Face & PIN Attendance Kiosk (PWA)',
      sub: 'Tablet gate kiosk, facial verification, offline punch queue & nightly payroll sync',
      badge: 'Industry Blueprint 08 · Workforce & Gate Kiosk PWA',
      lead: 'Replace proprietary fingerprint hardware that breaks and needs manual USB exports. The tablet kiosk verifies staff by face and PIN, works offline at remote plants and resorts, and posts daily attendance into your ERP every night.',
      modules: [
        'Wall-Mounted Tablet PWA with Live Camera Face Enrolment & Verification',
        'Offline-Capable Punch Queue (Clock-In, Break, Clock-Out) with Photo Audit',
        'Multi-Site & Business Unit Routing (Plant, Resort, Showroom, Head Office)',
        'Automated Nightly Derivation Engine (Punches to Shifts, Overtime & Lateness)',
        'Direct Integration with ERP Payroll, Advances & Labor Cost Ledgers'
      ],
      workflows: [
        'Employee enters PIN with instant face match and records punch in 1 second',
        'Offline punches buffer on tablet and sync via encrypted Power Automate API',
        'Nightly job pairs clock-in/out, flags missing punches, and updates HR attendance table',
        'Managers review late arrivals and overtime exceptions on their morning dashboard'
      ],
      reports: [
        'Daily Site Attendance Roster & Live Headcount Present',
        'Monthly Employee Timesheet, Overtime & Lateness Summary (.rdl)',
        'Departmental Labor Cost vs Revenue Ratio',
        'Biometric Audit Log with Verification Confidence Scores'
      ],
      metrics: [
        ['Hardware Needed', 'Any Standard Tablet'],
        ['Verification', 'Face + PIN Audit'],
        ['Payroll Sync', 'Automated Nightly']
      ]
    }
  ];

  // ---------------- 6 LIVE SANDBOX ENVIRONMENTS ----------------
  const SANDBOX_DATA = {
    holding: {
      groupTitle: 'Multi-Entity Enterprise Group',
      viewTitle: 'Consolidated Group Overview',
      seriesNames: ['Auto & Equipment', 'Manufacturing', 'Hospitality'],
      seriesVals: [
        [165, 172, 158, 184, 162, 179, 195, 208, 214, 226, 238, 249],
        [140, 132, 148, 125, 138, 152, 168, 175, 182, 190, 198, 212],
        [92, 64, 38, 42, 35, 44, 68, 95, 142, 188, 224, 210]
      ],
      kpis: [
        { k: 'Consolidated Revenue', v: 671.0, unit: 'k', d: '+9.4% vs prior period', cls: 'good' },
        { k: 'Blended Gross Margin', v: 26.8, unit: '%', d: '+1.2 pt above target', cls: 'good', fixed: true },
        { k: 'Group Cash & Bank', v: 418.5, unit: 'k', d: '9 accounts, reconciled', cls: '' },
        { k: 'Receivables Past 60d', v: 42.3, unit: 'k', d: '7 invoices flagged', cls: 'crit' },
        { k: 'Operating Books', v: '6', unit: ' of 6', d: 'All entities balanced', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Auto & Equipment Dealership', 249.0, '21.4%', 'Today 17:15', 'closed', 'Balanced'],
        ['Ready-Mix Concrete Plant', 148.0, '28.2%', 'Today 16:50', 'closed', 'Balanced'],
        ['Flagship Beach Resort', 132.0, '58.6%', 'Today 18:10', 'closed', 'Balanced'],
        ['Boutique Hotel & Club', 78.0, '51.2%', 'Today 17:40', 'closed', 'Balanced'],
        ['Heavy Transport Fleet', 64.0, '24.0%', 'Yesterday', 'closed', 'Balanced'],
        ['Commercial Real Estate', 46.5, '79.5%', 'Today 14:20', 'closed', 'Balanced']
      ],
      alerts: [
        ['crit', '7 trade receivables past 60 days', 'Concentrated in fleet & contractor accounts · Ready for SOA dispatch', 'Review Aging'],
        ['warn', 'Statutory vs Operational reconciliation check', 'Zero unallocated variance across all 6 Business Units', 'View Audit'],
        ['warn', '2 supplier purchase orders above approval threshold', 'Awaiting principal digital stamp in Procurement queue', 'Approve'],
        ['good', 'Nightly automation fleet completed', 'Database backup 02:00 · Attendance sync 03:00 · Power BI refresh 07:00', 'Logs']
      ],
      journal: [
        ['D0', 'SI-2026-0841', 'Auto Dealership', '70100 Vehicle & Parts Sales', 0, 18450.00],
        ['D0', 'TK-2026-4412', 'Concrete Plant', '70200 Ready-Mix Batch Sales (m³)', 0, 14200.00],
        ['D0', 'POS-0192', 'Flagship Resort', '70600 Outlet & Cabana Revenue', 0, 9640.00],
        ['D1', 'RC-2026-1109', 'Group Treasury', '51100 Bank USD Settlement', 32500.00, 0],
        ['D1', 'PI-2026-0518', 'Concrete Plant', '60110 Bulk Cement Silo Intake', 9790.00, 0]
      ]
    },
    hospitality: {
      groupTitle: 'Hospitality & Resort Operations',
      viewTitle: 'Multi-Property Resort Command',
      seriesNames: ['F&B Outlets', 'Cabanas & Entrance', 'Events & Suites'],
      seriesVals: [
        [48, 32, 18, 22, 16, 20, 34, 52, 86, 118, 142, 134],
        [34, 18, 6, 4, 4, 6, 18, 32, 64, 96, 118, 108],
        [22, 14, 10, 18, 8, 12, 16, 24, 38, 54, 68, 62]
      ],
      kpis: [
        { k: 'Resort Revenue (TTC)', v: 304.0, unit: 'k', d: '+14.2% vs prior season', cls: 'good' },
        { k: 'F&B + Outlet Margin', v: 57.4, unit: '%', d: 'Food cost within 28% cap', cls: 'good', fixed: true },
        { k: 'Vault & Bank Cash', v: 94.6, unit: 'k', d: 'All till closes matched to cash', cls: '' },
        { k: 'Supplier Payables Due', v: 18.2, unit: 'k', d: '4 beverage vendors due Friday', cls: 'crit' },
        { k: 'Partner Splits', v: '4', unit: ' Properties', d: 'SOA journals balanced', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Flagship Beach Resort', 142.0, '61.2%', 'Today 18:10', 'closed', 'Tills Synced'],
        ['Sunset Bay Club', 84.5, '56.8%', 'Today 17:55', 'closed', 'Tills Synced'],
        ['Palms Waterfront', 48.2, '52.1%', 'Today 16:30', 'closed', 'Tills Synced'],
        ['Boutique Hotel Suites', 29.3, '64.0%', 'Today 15:45', 'warn', '1 Stamp Due']
      ],
      alerts: [
        ['good', 'Offline POS Tills synchronized (100%)', '1,420 receipts across 6 tills matched to bank & cash vault', 'View Tills'],
        ['warn', 'Beverage stock variance check', 'Sunset Bay bar inventory count scheduled for 23:00 close', 'Open Count'],
        ['crit', '4 supplier invoices due for settlement', 'Approved for Friday payment run · Partner split applied', 'Pay Run'],
        ['good', 'Biometric Attendance Kiosk synced', '118 seasonal & permanent staff shifts verified today', 'Roster']
      ],
      journal: [
        ['D0', 'POS-0814', 'Flagship Resort', '70610 Beach & Cabana Admissions', 0, 6420.00],
        ['D0', 'POS-0815', 'Flagship Resort', '70400 Restaurant & Bar TTC', 0, 8910.00],
        ['D0', 'PI-2026-0392', 'Sunset Bay Club', '60210 F&B Provisions & Beverages', 3180.00, 0],
        ['D1', 'JV-SOA-0041', 'All Properties', '45100 Partner Profit Split Allocation', 12150.00, 0],
        ['D1', 'RC-2026-0912', 'Boutique Suites', '70120 Event & Banquet Deposit', 0, 4500.00]
      ]
    },
    trading: {
      groupTitle: 'Automotive & Heavy Equipment Trading',
      viewTitle: 'Dealership, VIN Stock & SOA Overview',
      seriesNames: ['Heavy Equipment', 'Passenger & SUV', 'Spare Parts & Service'],
      seriesVals: [
        [120, 85, 140, 95, 110, 135, 160, 145, 175, 150, 185, 190],
        [68, 74, 62, 80, 72, 78, 84, 88, 92, 96, 102, 108],
        [32, 34, 31, 36, 35, 38, 41, 42, 44, 46, 48, 51]
      ],
      kpis: [
        { k: 'Dealership Sales (MTD)', v: 349.0, unit: 'k', d: '+8.1% vs prior month', cls: 'good' },
        { k: 'Realized Gross Margin', v: 19.8, unit: '%', d: 'After full landed cost', cls: 'good', fixed: true },
        { k: 'VIN Stock Valuation', v: 1240.0, unit: 'k', d: '24 units showroom · 9 bonded', cls: '' },
        { k: 'Receivables Past 60d', v: 31.4, unit: 'k', d: '5 dealer accounts flagged', cls: 'crit' },
        { k: 'Statutory Recon', v: '100', unit: '%', d: '0 variance vs accounting books', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Heavy Equipment Division', 190.0, '17.5%', 'Today 16:40', 'closed', 'Reconciled'],
        ['Passenger & Fleet Division', 108.0, '20.4%', 'Today 17:10', 'closed', 'Reconciled'],
        ['Central Spare Parts Depot', 36.5, '31.2%', 'Today 16:55', 'closed', 'Reconciled'],
        ['Service & Warranty Bay', 14.5, '44.0%', 'Today 15:20', 'closed', 'Reconciled']
      ],
      alerts: [
        ['crit', '5 fleet customer installments past 60 days', 'Automated SOA PDF ready for WhatsApp & Email dispatch', 'Send SOA'],
        ['good', '3 heavy equipment units cleared customs today', 'Landed cost allocated · Moved from Bonded to Showroom stock', 'View VINs'],
        ['warn', 'Fast-moving brake & filter SKUs below safety stock', 'Suggested supplier reorder batch generated', 'Order List'],
        ['good', 'Monthly statutory reconciliation verified', 'Operational sales, stock, and cash match statutory trial balance', 'Recon RDL']
      ],
      journal: [
        ['D0', 'SI-TRK-0419', 'Heavy Equipment Div', '70110 Heavy Equipment Sales (VIN #8841)', 0, 68500.00],
        ['D0', 'SI-PRT-1902', 'Spare Parts Depot', '70150 Wholesale Parts Invoicing', 0, 4820.00],
        ['D0', 'LC-2026-0118', 'Heavy Equipment Div', '60120 Customs & Port Clearance', 11400.00, 0],
        ['D1', 'RC-2026-0774', 'Passenger Div', '51100 Dealer Installment Collection', 61920.00, 0],
        ['D1', 'SV-2026-0310', 'Service Bay', '70500 Workshop Labor & Overhaul', 0, 2950.00]
      ]
    },
    manufacturing: {
      groupTitle: 'Manufacturing, Concrete & Fleet',
      viewTitle: 'Batch Plant, Silo Stock & Dispatch Control',
      seriesNames: ['Ready-Mix Concrete', 'Precast & Blocks', 'Transport & Pumping'],
      seriesVals: [
        [110, 118, 124, 108, 122, 134, 146, 152, 160, 168, 174, 182],
        [38, 42, 40, 36, 44, 48, 52, 54, 58, 60, 62, 66],
        [24, 26, 28, 22, 26, 30, 32, 34, 36, 38, 40, 42]
      ],
      kpis: [
        { k: 'Plant & Fleet Billing', v: 290.0, unit: 'k', d: '3,840 m³ batched MTD', cls: 'good' },
        { k: 'Unit Margin per m³', v: 28.4, unit: '%', d: 'Cement yield within 0.4% tol.', cls: 'good', fixed: true },
        { k: 'Silo & Aggregate Stock', v: 86.2, unit: 'k', d: '420 MT bulk cement on hand', cls: '' },
        { k: 'Contractor AR > 60d', v: 24.8, unit: 'k', d: '3 site accounts on credit hold', cls: 'crit' },
        { k: 'Plant Entities', v: '3', unit: ' of 3', d: 'Plant, Construction & Fleet synced', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Ready-Mix Batch Plant #1', 182.0, '29.1%', 'Today 17:30', 'closed', 'Tickets Synced'],
        ['Construction & Precast Div', 66.0, '26.8%', 'Today 16:45', 'closed', 'Balanced'],
        ['Heavy Mixer & Pump Fleet', 42.0, '27.5%', 'Today 17:05', 'closed', 'Balanced']
      ],
      alerts: [
        ['good', '142 batch plant delivery tickets verified today', 'All C30/C35 pours matched to signed site delivery notes', 'Tickets'],
        ['crit', '3 contractor accounts reached 85% credit limit', 'Form gate active: supervisor override required for new dispatch', 'Credit Gate'],
        ['warn', 'Silo #2 Portland Cement reorder trigger', 'Current level 115 MT · Scheduled bulk tanker delivery tomorrow 07:00', 'Silo Log'],
        ['good', 'Inter-entity transport charges auto-reconciled', 'Mixer fleet trip fees matched to plant cost of sales', 'Interco']
      ],
      journal: [
        ['D0', 'TK-2026-8821', 'Batch Plant #1', '70100 Ready-Mix C35 Structural (185 m³)', 0, 15725.00],
        ['D0', 'TK-2026-8822', 'Mixer Fleet', '70300 Concrete Pump Boom Service', 0, 2400.00],
        ['D0', 'PI-2026-0612', 'Batch Plant #1', '60100 Bulk Cement & Admixture Intake', 8950.00, 0],
        ['D1', 'JV-DSL-0104', 'Mixer Fleet', '61300 Transit Mixer Diesel Allocation', 1840.00, 0],
        ['D1', 'RC-2026-1402', 'Construction Div', '51100 Contractor Progress Collection', 22500.00, 0]
      ]
    },
    realestate: {
      groupTitle: 'Real Estate & Property Operations',
      viewTitle: 'Portfolio Yield, Leases & Collections',
      seriesNames: ['Commercial Plazas', 'Residential Towers', 'Industrial Warehouses'],
      seriesVals: [
        [62, 62, 64, 64, 66, 66, 68, 68, 70, 70, 72, 74],
        [44, 45, 45, 46, 46, 48, 48, 49, 50, 50, 52, 52],
        [22, 22, 24, 24, 24, 26, 26, 26, 28, 28, 28, 30]
      ],
      kpis: [
        { k: 'Rental Income (MTD)', v: 156.0, unit: 'k', d: '96.2% portfolio occupancy', cls: 'good' },
        { k: 'Net Operating Yield', v: 78.6, unit: '%', d: 'NOI after maintenance & tax', cls: 'good', fixed: true },
        { k: 'Escrow & Rent Bank', v: 214.0, unit: 'k', d: 'PDC schedule 100% logged', cls: '' },
        { k: 'Tenant Arrears > 30d', v: 9.4, unit: 'k', d: '2 retail units pending clearance', cls: 'crit' },
        { k: 'Active Leases', v: '84', unit: ' Units', d: 'All contracts & deposits audited', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Boulevard Commercial Center', 74.0, '81.2%', 'Today 15:10', 'closed', 'Audited'],
        ['Harbor View Residences', 52.0, '76.4%', 'Today 14:30', 'closed', 'Audited'],
        ['Logistics Park Warehouses', 30.0, '84.0%', 'Yesterday', 'closed', 'Audited']
      ],
      alerts: [
        ['warn', '4 commercial leases renewing in 45 days', '5% CPI escalation notices generated for executive review', 'Renewals'],
        ['crit', '2 tenant checks due for bank presentation', 'Scheduled in Treasury PDC calendar for Thursday morning', 'PDC Queue'],
        ['good', 'Tower HVAC preventive maintenance completed', 'Allocated across service-charge ledger with vendor warranty', 'Work Orders'],
        ['good', 'Quarterly landlord distribution statement ready', 'Net yield split computed across property co-owners', 'SOA PDF']
      ],
      journal: [
        ['D0', 'RN-2026-0312', 'Boulevard Center', '70100 Q4 Anchor Retail Lease Billing', 0, 24500.00],
        ['D0', 'RN-2026-0313', 'Harbor Residences', '70120 Penthouse Annual Lease', 0, 18000.00],
        ['D1', 'RC-2026-0509', 'Logistics Park', '51100 Tenant Wire Transfer Settlement', 38900.00, 0],
        ['D1', 'WO-2026-0088', 'Harbor Residences', '61400 Elevator & Generator Service', 3600.00, 0]
      ]
    },
    insurance: {
      groupTitle: 'Insurance Brokerage Operations',
      viewTitle: 'Policy Production, Commissions & Bordereaux',
      seriesNames: ['Medical & Group Life', 'Motor & Fleet', 'Commercial & Marine'],
      seriesVals: [
        [48, 52, 46, 58, 64, 54, 62, 68, 72, 76, 80, 84],
        [34, 36, 38, 35, 40, 42, 44, 46, 48, 50, 52, 55],
        [24, 28, 22, 30, 26, 32, 36, 34, 38, 42, 44, 48]
      ],
      kpis: [
        { k: 'Gross Written Premium', v: 187.0, unit: 'k', d: '+12.8% YoY book growth', cls: 'good' },
        { k: 'Net Commission Yield', v: 18.4, unit: '%', d: '$34.4k brokerage commission', cls: 'good', fixed: true },
        { k: 'Client Premium Trust', v: 112.0, unit: 'k', d: 'Matched to carrier bordereaux', cls: '' },
        { k: 'Uncollected Premium', v: 14.6, unit: 'k', d: '6 corporate endorsements due', cls: 'crit' },
        { k: 'Renewal Retention', v: '94.2', unit: '%', d: '48 policies renewed this month', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Corporate Medical & Life', 84.0, '16.5%', 'Today 17:00', 'closed', 'Bordereaux Ready'],
        ['Motor & Fleet Line', 55.0, '21.0%', 'Today 16:20', 'closed', 'Bordereaux Ready'],
        ['Marine, Cargo & Property', 48.0, '18.8%', 'Today 15:50', 'closed', 'Bordereaux Ready']
      ],
      alerts: [
        ['good', '19 corporate renewals due next month pre-quoted', 'Comparison sheets & WhatsApp renewal summaries queued', 'Pipeline'],
        ['crit', '6 policy installments past 30-day grace window', 'Client SOA statements generated for account executives', 'Collect'],
        ['warn', '2 motor claims awaiting surveyor repair approval', 'Workshop estimate uploaded to SharePoint claim folder', 'Claims'],
        ['good', 'Monthly carrier net payable reconciled', 'Commission splits verified across 8 underwriting carriers', 'Settlement']
      ],
      journal: [
        ['D0', 'POL-MED-4102', 'Medical Line', '70100 Corporate Group Medical Policy', 0, 28400.00],
        ['D0', 'COM-MED-4102', 'Medical Line', '70800 Brokerage Commission Earned', 0, 4260.00],
        ['D0', 'PAY-CAR-0091', 'Trust Account', '40100 Carrier Net Premium Settlement', 24140.00, 0],
        ['D1', 'RC-PRM-1820', 'Motor & Fleet', '51100 Fleet Policy Premium Collection', 8520.00, 0]
      ]
    }
  };

  // ---------------- ASK ISABI AI KNOWLEDGE BASE ----------------
  const AI_PROMPTS = [
    {
      q: 'Why did receivables past 60 days increase this month?',
      title: 'Overdue Receivables Audit',
      answer: 'I queried the live Receivables Ledger across all active Business Units. Overdue balances past 60 days stand at <b>$42,300</b> across 7 invoices, driven primarily by two fleet installment accounts and one contractor concrete pour schedule.',
      headers: ['Account / Entity', 'Voucher Ref', 'Days Past Due', 'Balance (USD)'],
      rows: [
        ['Apex Contracting · Concrete Plant', 'TK-2026-3104', '68 Days', '$16,400.00'],
        ['Levant Logistics · Heavy Equipment Div', 'SI-TRK-0298', '64 Days', '$14,800.00'],
        ['Metro Transit · Spare Parts Depot', 'SI-PRT-1411', '62 Days', '$6,250.00'],
        ['4 Smaller Balances (< $2k each)', 'Multiple', '61-74 Days', '$4,850.00']
      ],
      total: ['Total Audited Overdue (> 60 Days)', '$42,300.00'],
      citation: 'Source: Dataverse Receivables Ledger · Verified 100% against Printable SOA (.rdl)'
    },
    {
      q: 'How does ISABI customize the ERP for my specific industry?',
      title: 'Bespoke Schema Architecture',
      answer: 'Unlike off-the-shelf software that forces every business into generic "Invoice" and "Item" boxes, ISABI Systems engineers a <b>dedicated Dataverse relational schema</b> around your physical unit of operation while sharing a unified institutional accounting core.',
      headers: ['Industry Vertical', 'Custom Operational Unit', 'Automated Ledger Link'],
      rows: [
        ['Hospitality & Resorts', 'Outlet Till Close, Cabana & Seasonal Shift', 'Daily TTC revenue & partner split journal'],
        ['Auto & Equipment Trading', 'Vehicle VIN / Chassis & Customs Bill', 'Per-unit landed cost & dealer aging SOA'],
        ['Concrete & Manufacturing', 'Batch Ticket (m³), Mix Grade & Silo MT', 'Raw material yield & contractor credit gate'],
        ['Real Estate & Insurance', 'Lease Schedule / Policy & Endorsement', 'NOI yield / Carrier commission bordereaux']
      ],
      total: ['Deployment Timeframe', '1 to 2 Weeks to Live Production'],
      citation: 'Architecture: Microsoft Dataverse + Model-Driven Apps + XMLA Power BI + Paginated .RDL'
    },
    {
      q: 'How does dual-entry reconciliation work with our existing accountant software?',
      title: 'Zero-Risk Parallel Run & Reconciliation',
      answer: 'ISABI Systems is designed to stand on its own as your primary operational and financial system without ever putting your statutory compliance at risk. During onboarding, we deploy an automated <b>Statutory Reconciliation Bridge</b>.',
      headers: ['Reconciliation Layer', 'How It Works in Production', 'Audit Result'],
      rows: [
        ['01. Operational Capture', 'Staff key sales, purchases, stock, and cash directly into ISABI', 'Real-time operational ledger'],
        ['02. Statutory Anchor Import', 'Monthly trial balance from legacy accounting software is ingested', 'Account-by-account mapping'],
        ['03. Variance Engine', 'Power BI & Paginated RDL highlight any discrepancy down to $1', 'Instant root-cause drilldown'],
        ['04. Executive Sign-Off', 'Books close with the double rule once variance equals zero', '100% audit confidence']
      ],
      total: ['Typical Cutover Variance', '$0.00 Unexplained Difference'],
      citation: 'Proven in live trading, manufacturing, and hospitality groups'
    },
    {
      q: 'What would a complete multi-branch system cost and include?',
      title: 'Investment & Deliverables Breakdown',
      answer: 'For a growing company or multi-branch operation, our recommended <b>Multi-Entity & AI Operations Suite</b> starts at <b>$9,500</b> (one-time implementation) with optional <b>$650/month</b> continuous engineering and support.',
      headers: ['Deliverable Component', 'Included Specification', 'Standalone Value'],
      rows: [
        ['Custom Dataverse ERP App', 'Multi-Business Unit schema, forms, JS rules & security roles', 'Included'],
        ['Power BI Executive Suite', 'Operations + Financial workspaces with Year/Month/Week/Day pickers', 'Included'],
        ['Paginated .RDL Pack', 'Printable PDF/Excel Statement of Accounts, P&L & Aging', 'Included'],
        ['Ask ISABI + Companion PWA', 'Native AI assistant + Offline POS Till or Attendance Kiosk', 'Included']
      ],
      total: ['Indicative Complete Suite Investment', 'From $9,500 + $650/mo'],
      citation: 'Every engagement is fixed-scope after a 30-minute discovery call with Hussein Bdeir'
    }
  ];

  // ---------------- 18-APP INTERACTIVE ECOSYSTEM (ODOO-STYLE SUITE) ----------------
  const APP_SUITE = [
    {
      id: 'gl', cat: 'finance', emoji: ICONS.ledger, tone: 'tone-brass',
      name: 'General Ledger & COA', sub: 'Double-Entry & Class 1 to 7',
      kicker: 'Core Accounting Module · Microsoft Dataverse',
      desc: 'Full double-entry institutional accounting with regional Class 1 to 7 charts of accounts, multi-currency journals, and automated voucher numbering.',
      bullets: [
        ICONS.scale + ' Balanced Debit & Credit validation on every operational posting',
        ICONS.globe + ' Multi-currency ledger (USD, EUR, AED, LBP) with live FX rates',
        ICONS.lock + ' Immutable audit log of who created, edited, or stamped each entry'
      ],
      tables: ['bhf_journal', 'bhf_coa', 'bhf_voucher', 'bhf_fiscalperiod'],
      sbox: 'holding', ask: 'How does the ISABI General Ledger and Class 1 to 7 Chart of Accounts work?'
    },
    {
      id: 'soa', cat: 'finance', emoji: ICONS.soa, tone: 'tone-steel',
      name: 'Printable SOA & P&L', sub: 'PDF & Excel Paginated .RDL',
      kicker: 'Statutory & Partner Statements · Paginated .RDL',
      desc: 'Pixel-perfect printable Statements of Account for customers, suppliers, and equity partners, plus audited Balance Sheet, P&L, and Trial Balance packs.',
      bullets: [
        ICONS.soa + ' Running balance Statement of Account with opening & closing rules',
        ICONS.download + ' One-click export to print-ready PDF, Word, or formatted Excel',
        ICONS.partner + ' Automated monthly partner profit-split and capital statements'
      ],
      tables: ['StatementOfAccount.rdl', 'PartnerStatement.rdl', 'TrialBalance.rdl'],
      sbox: 'holding', ask: 'Tell me about the printable Statements of Account and P&L reports'
    },
    {
      id: 'pbi', cat: 'finance', emoji: ICONS.pbi, tone: 'tone-good',
      name: 'Power BI Suite', sub: 'Year / Month / Week / Day',
      kicker: 'Executive Analytics · XMLA Semantic Models',
      desc: 'Three governed workspaces per company (Operations, Financial, and Reconciliation) with instant period pickers and month-over-month variance.',
      bullets: [
        ICONS.calendar + ' Unified Year, Month, Week, and Day slicer across every visual',
        ICONS.trend + ' Consolidated group view plus per-branch Business Unit security',
        ICONS.bolt + ' Direct XMLA semantic model refresh on scheduled cloud pipelines'
      ],
      tables: ['Operations Workspace', 'Financial Workspace', 'Period Picker DAX'],
      sbox: 'holding', ask: 'How are the Power BI dashboards structured across Operations and Finance?'
    },
    {
      id: 'ai', cat: 'field', emoji: ICONS.ai, tone: 'tone-brass',
      name: 'Ask ISABI Native AI', sub: 'Cited Live Ledger Answers',
      kicker: 'Embedded System Intelligence · Role-Aware',
      desc: 'Your executive AI analyst wired directly to your live Dataverse ledger, stock, and receivables. Every answer cites the exact vouchers it used.',
      bullets: [
        ICONS.search + ' Queries live overdue receivables, margin shifts, and stock variances',
        ICONS.insurance + ' Respects Entra ID & Business Unit roles so branch data stays private',
        ICONS.ai_mark + ' Available inside the ERP header bar, Power BI, and WhatsApp'
      ],
      tables: ['bhf_isabi_ask_store', 'Live Ledger Context', 'Role-Scoped Citations'],
      sbox: 'holding', ask: 'How does Ask ISABI treat confidential figures?'
    },
    {
      id: 'ar', cat: 'finance', emoji: ICONS.ar, tone: 'tone-coral',
      name: 'Receivables & Credit', sub: '0-30-60-90d Aging & Gates',
      kicker: 'Credit Control & Collections · Automated Watchdogs',
      desc: 'Real-time customer receivable aging across 0 to 30, 31 to 60, 61 to 90, and 90+ day buckets, with form-level credit caps and one-click WhatsApp SOA dispatch.',
      bullets: [
        ICONS.lock + ' Form rules block new sales tickets when a client breaches credit limits',
        ICONS.trend + ' Live 0-30-60-90+ day aging matrix across all operating branches',
        ICONS.wa + ' One-click WhatsApp & email payment reminders with attached SOA'
      ],
      tables: ['bhf_customer', 'bhf_receivable', 'bhf_creditlimit', 'ARAging.rdl'],
      sbox: 'trading', ask: 'Why did receivables past 60 days increase this month?'
    },
    {
      id: 'partner', cat: 'finance', emoji: ICONS.partner, tone: 'tone-violet',
      name: 'Partner Equity Splits', sub: 'Capital & Profit Sharing',
      kicker: 'Multi-Partner Accounting · Automated Allocation',
      desc: 'Built for co-owned resorts, real estate developments, and trading joint ventures where each property or venture has custom partner equity percentages.',
      bullets: [
        ICONS.layers + ' Per-venue and per-project ownership percentage tables',
        ICONS.ar + ' Tracks partner drawings, capital injections, and management fees',
        ICONS.soa + ' Generates monthly audited partner distribution statements'
      ],
      tables: ['bhf_partner', 'bhf_partnersplit', 'bhf_capitalaccount'],
      sbox: 'hospitality', ask: 'How does ISABI automate partner profit splits and capital accounts?'
    },
    {
      id: 'bridge', cat: 'finance', emoji: ICONS.scale, tone: 'tone-teal',
      name: 'Statutory Book Bridge', sub: 'Zero-Variance Parallel Run',
      kicker: 'Safe Transition Engine · Dual-Entry Verification',
      desc: 'Runs alongside your existing accounting software during onboarding and compares every account line-by-line until the variance is $0.00.',
      bullets: [
        ICONS.sync + ' Imports monthly trial balances from legacy accounting registers',
        ICONS.search + ' Highlights any discrepancy down to $1 with instant voucher drilldown',
        ICONS.check + ' Protects tax and statutory compliance while operations modernize'
      ],
      tables: ['bhf_statutoryanchor', 'bhf_variancebridge', 'Reconciliation.pbix'],
      sbox: 'holding', ask: 'How does dual-entry reconciliation work with our existing accountant software?'
    },
    {
      id: 'treasury', cat: 'finance', emoji: ICONS.holding, tone: 'tone-steel',
      name: 'Treasury & PDC Vault', sub: 'Banks, Cash & Checks',
      kicker: 'Multi-Entity Cash Management · Class 5 Treasury',
      desc: 'Track bank accounts, petty cash safes, wire transfers, and post-dated check (PDC) maturity schedules across every subsidiary in real time.',
      bullets: [
        ICONS.holding + ' Live cash position across USD, EUR, AED, and local bank accounts',
        ICONS.calendar + ' Post-dated check (PDC) maturity radar and deposit alerts',
        ICONS.lock + ' Supervisor digital stamp required on inter-vault transfers'
      ],
      tables: ['bhf_bankaccount', 'bhf_treasurytransfer', 'bhf_pdccheck'],
      sbox: 'holding', ask: 'How does ISABI manage multi-currency treasury and post-dated checks?'
    },
    {
      id: 'hosp', cat: 'ops', emoji: ICONS.hospitality, tone: 'tone-brass',
      name: 'Hospitality & Resorts', sub: 'Outlets, Cabanas & F&B',
      kicker: 'Industry App 01 · Hospitality Operations',
      desc: 'Complete multi-property resort and F&B operations: daily outlet revenue audits, cabana bookings, supplier F&B provisions, and seasonal payroll.',
      bullets: [
        ICONS.pos + ' Daily outlet close across entrance, cabanas, restaurants, and bars',
        ICONS.box + ' Supplier invoice intake, recipe cost ratios, and beverage stock audits',
        ICONS.hr + ' Seasonal staff contracts, cash advances, tips, and attendance'
      ],
      tables: ['bhf_revenue', 'bhf_expense', 'bhf_supplier', 'bhf_employee'],
      sbox: 'hospitality', ask: 'Show the Hospitality, Resorts & Beach Clubs blueprint'
    },
    {
      id: 'vin', cat: 'ops', emoji: ICONS.trading, tone: 'tone-steel',
      name: 'VIN & Equipment Trade', sub: 'Chassis, Customs & Parts',
      kicker: 'Industry App 02 · Trading & Dealership Operations',
      desc: 'End-to-end vehicle, heavy equipment, and spare-parts trading from FOB shipment and bonded customs to showroom delivery and after-sales parts.',
      bullets: [
        ICONS.trading + ' Per-VIN chassis registry (In-Transit, Bonded Customs, Showroom, Sold)',
        ICONS.globe + ' Full landed cost engine: FOB + Freight + Insurance + Customs Duty',
        ICONS.box + ' Multi-warehouse spare parts SKU stock and minimum margin locks'
      ],
      tables: ['bhf_vehiclevin', 'bhf_landedcost', 'bhf_partssku', 'bhf_salesorder'],
      sbox: 'trading', ask: 'Show the Automotive, Heavy Equipment & Parts Trading blueprint'
    },
    {
      id: 'concrete', cat: 'ops', emoji: ICONS.manufacturing, tone: 'tone-good',
      name: 'Ready-Mix & Plant', sub: 'Batch Tickets m³ & Silos',
      kicker: 'Industry App 03 · Manufacturing Operations',
      desc: 'Built for ready-mix concrete plants and construction material producers tracking every cubic meter poured, mix design, pump fee, and cement silo.',
      bullets: [
        ICONS.soa + ' Sales ticket ledger by m³ poured, MPA mix grade, and pump usage',
        ICONS.dataverse + ' Live cement silo, sand, gravel, and admixture depletion vs. batch yield',
        ICONS.lock + ' Contractor project billing and automated credit-limit gates'
      ],
      tables: ['bhf_salesticket', 'bhf_mixdesign', 'bhf_silostock', 'bhf_project'],
      sbox: 'manufacturing', ask: 'Show the Concrete & Manufacturing blueprint'
    },
    {
      id: 'fleet', cat: 'ops', emoji: ICONS.fleet, tone: 'tone-coral',
      name: 'Fleet & Fuel Dispatch', sub: 'Mixers, Pumps & Trips',
      kicker: 'Heavy Transport & Fleet Module · Manufacturing & Logistics',
      desc: 'Track transit mixers, concrete pumps, and heavy transport trucks with per-trip driver allowances, fuel burn per cubic meter, and maintenance logs.',
      bullets: [
        ICONS.bolt + ' Fuel issue tracking and liters-per-m³ efficiency alerts by truck',
        ICONS.fleet + ' Automated driver trip bonuses and inter-company transport billing',
        ICONS.scope + ' Preventive maintenance schedules, tires, and workshop job cards'
      ],
      tables: ['bhf_fleetasset', 'bhf_tripdispatch', 'bhf_fuellog', 'bhf_maintenance'],
      sbox: 'manufacturing', ask: 'How does ISABI track transit mixer fleets, fuel, and inter-company transport?'
    },
    {
      id: 're', cat: 'ops', emoji: ICONS.realestate, tone: 'tone-violet',
      name: 'Real Estate & Leases', sub: 'Units, Rent & NOI Yield',
      kicker: 'Industry App 04 · Real Estate Operations',
      desc: 'Manage commercial and residential towers, retail plazas, and land banks with automated lease escalations, tenant billing, and per-property NOI.',
      bullets: [
        ICONS.realestate + ' Property and unit registry (Occupied, Vacant, Reserved, Refurbishment)',
        ICONS.soa + ' Lease contracts with 60/30-day renewal alerts and rent escalations',
        ICONS.scope + ' Maintenance work orders tagged automatically to CapEx vs. OpEx'
      ],
      tables: ['bhf_property', 'bhf_unit', 'bhf_lease', 'bhf_workorder'],
      sbox: 'realestate', ask: 'Show the Real Estate & Commercial Property Portfolios blueprint'
    },
    {
      id: 'ins', cat: 'ops', emoji: ICONS.insurance, tone: 'tone-teal',
      name: 'Insurance Bordereaux', sub: 'Policies, Splits & Claims',
      kicker: 'Industry App 05 · Insurance Brokerage Operations',
      desc: 'Policy lifecycle management across motor, medical, marine, and property lines with carrier bordereaux, producer splits, and 90/60/30-day renewals.',
      bullets: [
        ICONS.soa + ' Policy & endorsement registry with gross/net/commission split math',
        ICONS.holding + ' One-click printable carrier settlement bordereaux and client SOA',
        ICONS.bell + ' 90/60/30-day expiring book renewal radar and claims tracker'
      ],
      tables: ['bhf_policy', 'bhf_endorsement', 'bhf_bordereau', 'bhf_claim'],
      sbox: 'insurance', ask: 'Show the Insurance Brokerage & Underwriting Operations blueprint'
    },
    {
      id: 'holding', cat: 'ops', emoji: ICONS.holding, tone: 'tone-brass',
      name: 'Holding & Board Pack', sub: 'Multi-Company Command',
      kicker: 'Industry App 06 · Holding Operations',
      desc: 'Unifies all sister companies into one boardroom console while keeping each subsidiary isolated inside its own Dataverse Business Unit.',
      bullets: [
        ICONS.globe + ' Overnight group consolidation across all operating industries',
        ICONS.sync + ' Intercompany loans, management fees, and cross-charge elimination',
        ICONS.pbi + ' Executive board pack with entity-by-entity books-closed status'
      ],
      tables: ['bhf_interaction', 'bhf_intercompany', 'bhf_businessunit'],
      sbox: 'holding', ask: 'Show the Multi-Entity Holding Groups & Family Offices blueprint'
    },
    {
      id: 'pos', cat: 'field', emoji: ICONS.pos, tone: 'tone-good',
      name: 'Offline POS Till PWA', sub: '<0.3s Thermal Receipt Till',
      kicker: 'Companion Field App 07 · Progressive Web App',
      desc: 'Zero-latency cashier till that keeps ringing sales and printing Bluetooth thermal receipts through internet cuts, then syncs daily totals to Dataverse.',
      bullets: [
        ICONS.bolt + ' Sub-300ms local thermal receipt and kitchen order printing (RawBT)',
        ICONS.sync + ' 100% offline IndexedDB sales queue during Wi-Fi or power cuts',
        ICONS.ar + ' Zero per-terminal SaaS fees across unlimited cashier tablets'
      ],
      tables: ['IndexedDB bhfpos', 'RawBT ESC/POS', 'bhf_revenue Sync'],
      sbox: 'hospitality', ask: 'Tell me about the Offline POS Till PWA'
    },
    {
      id: 'kiosk', cat: 'field', emoji: ICONS.kiosk, tone: 'tone-steel',
      name: 'Face & PIN Gate Kiosk', sub: '1s Biometric Tablet PWA',
      kicker: 'Companion Field App 08 · Workforce Attendance PWA',
      desc: 'Replaces fragile fingerprint boxes with any standard wall-mounted tablet. Verifies staff by face + PIN in 1 second offline and syncs nightly to payroll.',
      bullets: [
        ICONS.kiosk + ' Live camera facial verification + 4-digit PIN with photo audit trail',
        ICONS.sync + ' Buffers clock-in, break, and clock-out punches offline at remote sites',
        ICONS.clock + ' Nightly cloud job pairs shifts, calculates overtime, and posts to HR'
      ],
      tables: ['bhf_punch', 'bhf_faceenrolment', 'bhf_attendance'],
      sbox: 'manufacturing', ask: 'Tell me about the Biometric Face & PIN Attendance Kiosk PWA'
    },
    {
      id: 'hr', cat: 'field', emoji: ICONS.hr, tone: 'tone-violet',
      name: 'Recruitment & CV Drive', sub: 'Applicant to SharePoint',
      kicker: 'HR & Talent Pipeline · Automated Cloud Flow',
      desc: 'Automated applicant intake that routes candidate CVs straight into per-company SharePoint drives and creates structured Dataverse review records.',
      bullets: [
        ICONS.download + ' Public application form auto-routes by target resort, plant, or branch',
        ICONS.folder + ' Uploads PDF CVs directly into per-Business Unit SharePoint folders',
        ICONS.hr + ' HR evaluation workflow from screening to one-click employee onboarding'
      ],
      tables: ['cr519_recruitment', 'SharePoint Per-BU Drive', 'bhf_employee'],
      sbox: 'holding', ask: 'How does the automated recruitment and SharePoint CV pipeline work?'
    }
  ];

  // ---------------- INDUSTRY ICONS, DAY-IN-THE-LIFE TIMELINES & BEFORE/AFTER ----------------
  const IND_EXTRAS = {
    hospitality: {
      emoji: ICONS.hospitality,
      dayFlow: [
        [ICONS.clock + ' 08:00 AM · Gate & Staff', 'Biometric Shift Check-In', 'Seasonal staff clock in on the tablet kiosk via Face + PIN; kitchen and bar stock deliveries are logged against supplier POs.', '✓ Live Headcount'],
        [ICONS.clock + ' 01:30 PM · Peak Service', 'Offline POS Tills Ringing', 'Entrance, cabanas, and beach bars ring orders and print Bluetooth thermal receipts in 0.2s, even if Wi-Fi drops.', '✓ 100% Uptime'],
        [ICONS.clock + ' 11:30 PM · Shift Close', 'Cash & Card Till Audit', 'Managers count drawers; end-of-day sales totals sync automatically into the Dataverse revenue ledger by outlet.', '✓ $0 Variance'],
        [ICONS.clock + ' 02:00 AM · Nightly Close', 'Owner Flash & Partner Split', 'Power BI refreshes consolidated TTC revenue, F&B cost ratios, and partner profit-split balances for morning review.', '✓ Books Closed']
      ],
      before: [
        ICONS.cross + ' Cashiers and accountants re-keying paper till slips into 12 separate Excel sheets every morning',
        ICONS.cross + ' Unexplained variances between F&B supplier deliveries, bar stock, and outlet cash',
        ICONS.cross + ' Days spent calculating monthly partner profit splits and advances by hand',
        ICONS.cross + ' Cloud POS terminals freezing whenever beach or resort internet fluctuates'
      ],
      after: [
        ICONS.check + ' Offline POS tills sync end-of-day sales totals straight into the Dataverse ledger automatically',
        ICONS.check + ' Every supplier invoice and petty cash voucher requires a digital supervisor stamp',
        ICONS.check + ' Partner Statement of Accounts (.rdl) and profit splits generate in one click',
        ICONS.check + ' Owners open one mobile Power BI dashboard to see every property and outlet live'
      ]
    },
    trading: {
      emoji: ICONS.trading,
      dayFlow: [
        [ICONS.clock + ' 08:30 AM · Port & Customs', 'VIN & Landed Cost Intake', 'New shipment arrives: FOB invoice, freight, insurance, and customs duty are allocated per VIN chassis automatically.', '✓ Exact Unit Cost'],
        [ICONS.clock + ' 11:45 AM · Showroom Floor', 'Margin-Locked Sales Order', 'Sales rep quotes a heavy truck; form rules verify minimum gross margin and check customer credit before approval.', '✓ Margin Protected'],
        [ICONS.clock + ' 03:30 PM · Parts Counter', 'SKU Dispatch & Workshop', 'Spare parts counter scans items across bonded and duty-paid depots; reorder alerts fire when stock hits threshold.', '✓ Live SKU Stock'],
        [ICONS.clock + ' 06:00 PM · Finance Desk', 'Aged SOA & Statutory Match', 'Overdue 30/60/90d installment alerts dispatch printable PDF Statements of Account and reconcile with statutory books.', '✓ Reconciled']
      ],
      before: [
        ICONS.cross + ' Landed cost per vehicle guessed on spreadsheets while customs duties and clearance bills arrive late',
        ICONS.cross + ' Sales reps giving discounts below true landed cost without management visibility',
        ICONS.cross + ' Spare parts stock discrepancies across showrooms, bonded warehouses, and service bays',
        ICONS.cross + ' Overdue dealer and fleet installments noticed weeks after payment dates pass'
      ],
      after: [
        ICONS.check + ' Every VIN tracks its exact lifecycle (In-Transit, Bonded, Showroom, Sold) and full landed cost',
        ICONS.check + ' Automated form gates block under-margin quotes and over-limit credit sales instantly',
        ICONS.check + ' Real-time multi-warehouse SKU stock with automated transfer and reorder alerts',
        ICONS.check + ' Live 0-30-60-90d receivable aging with one-click printable SOA and statutory book match'
      ]
    },
    manufacturing: {
      emoji: ICONS.manufacturing,
      dayFlow: [
        [ICONS.clock + ' 06:30 AM · Batch Plant Gate', 'Silo Check & Crew Clock-In', 'Drivers and plant operators verify on the Face + PIN kiosk; cement silo and aggregate levels are confirmed.', '✓ Plant Ready'],
        [ICONS.clock + ' 10:15 AM · Dispatch Desk', 'Sales Ticket & Credit Gate', 'Dispatcher keys a 42 m³ C35 pump pour; form rules auto-price mix + pump fee and verify contractor credit cap.', '✓ Credit Verified'],
        [ICONS.clock + ' 04:00 PM · Fleet & Yard', 'Mixer Trips & Fuel Audit', 'Transit mixer trips, driver allowances, and fuel burn per cubic meter are logged across plant and transport entities.', '✓ Fleet Tracked'],
        [ICONS.clock + ' 07:00 PM · Plant Close', 'Yield & Project SOA Pack', 'Theoretical vs. actual cement consumption is audited, and customer statements grouped by project site update live.', '✓ Yield Audited']
      ],
      before: [
        ICONS.cross + ' Paper delivery tickets lost between the batch plant, mixer drivers, and back-office billing',
        ICONS.cross + ' Pouring concrete for contractors who have already exceeded their credit limit',
        ICONS.cross + ' Cement and aggregate silo shrinkage going unnoticed until month-end physical counts',
        ICONS.cross + ' Inter-company billing between plant, construction, and transport companies taking weeks to untangle'
      ],
      after: [
        ICONS.check + ' Every cubic meter batched is captured on a governed Sales Ticket with mix grade and pump rules',
        ICONS.check + ' Real-time credit gates alert dispatchers before a truck leaves the yard',
        ICONS.check + ' Daily theoretical vs. actual silo depletion and gross margin per m³ in Power BI',
        ICONS.check + ' Automated inter-entity ledger and project-grouped customer Statements of Account (.rdl)'
      ]
    },
    realestate: {
      emoji: ICONS.realestate,
      dayFlow: [
        [ICONS.clock + ' 09:00 AM · Portfolio Desk', 'Lease & PDC Radar', 'System flags leases 60 days from expiry and lists post-dated checks (PDCs) maturing this week for bank deposit.', '✓ Zero Missed Dates'],
        [ICONS.clock + ' 12:00 PM · Tenant Portal', 'Rent & Utility Billing', 'Quarterly rent invoices, escalations, and utility charge-backs generate and post to tenant ledgers automatically.', '✓ Auto-Billed'],
        [ICONS.clock + ' 03:00 PM · Building Ops', 'Maintenance CapEx vs OpEx', 'Facility manager approves a contractor work order; cost is tagged to the exact building unit and CapEx/OpEx account.', '✓ Unit Costed'],
        [ICONS.clock + ' 06:30 PM · Owner View', 'Property NOI & Yield Close', 'Co-investors and owners view live occupancy, collection aging, and net operating income (NOI) per property.', '✓ Live NOI']
      ],
      before: [
        ICONS.cross + ' Lease renewals, rent escalation clauses, and post-dated check dates buried in static folders',
        ICONS.cross + ' Maintenance expenses lumped together with no clarity on unit-level profitability or CapEx vs. OpEx',
        ICONS.cross + ' Chasing overdue tenant rent without an instant, clean Statement of Account to send',
        ICONS.cross + ' Co-investor distributions calculated manually on error-prone spreadsheets each quarter'
      ],
      after: [
        ICONS.check + ' Automated 60/30-day lease expiry, escalation, and PDC deposit alerts',
        ICONS.check + ' Every work order and vendor bill is tied to a specific property, unit, and ledger class',
        ICONS.check + ' One-click printable Tenant Statement of Account (.rdl) and collection aging dashboard',
        ICONS.check + ' Live property-by-property NOI, occupancy roll-forward, and co-investor distribution schedules'
      ]
    },
    insurance: {
      emoji: ICONS.insurance,
      dayFlow: [
        [ICONS.clock + ' 09:00 AM · Underwriting', 'Policy & Endorsement Issue', 'Broker issues a corporate medical policy; gross premium, carrier net payable, and brokerage commission split calculate instantly.', '✓ Auto Split'],
        [ICONS.clock + ' 01:00 PM · Retention Desk', '90/60/30d Renewal Pipeline', 'Account executives work the automated renewal radar and send WhatsApp/Email installment reminders to clients.', '✓ High Retention'],
        [ICONS.clock + ' 04:00 PM · Claims Desk', 'Claim & Survey Tracking', 'Motor and marine claims log survey milestones and reserve statuses linked directly to the client policy record.', '✓ Full History'],
        [ICONS.clock + ' 06:00 PM · Carrier Close', '1-Click Carrier Bordereaux', 'Finance generates printable carrier settlement bordereaux and producer commission statements with zero manual math.', '✓ Bordereaux Ready']
      ],
      before: [
        ICONS.cross + ' Hours wasted reconciling carrier bordereaux spreadsheets against client premium collections',
        ICONS.cross + ' Sub-agent and producer commission splits miscalculated on mid-term policy endorsements',
        ICONS.cross + ' Expiring policies noticed too late, costing the brokerage valuable renewal revenue',
        ICONS.cross + ' No unified view of uncollected client premiums vs. net payables owed to carriers'
      ],
      after: [
        ICONS.check + ' Instant calculation of gross premium, carrier net payable, and producer commission on every policy',
        ICONS.check + ' Pro-rata endorsement adjustments and credit notes post directly to the ledger',
        ICONS.check + ' Automated 90/60/30-day renewal pipeline and client collection aging radar',
        ICONS.check + ' One-click printable Carrier Settlement Bordereaux and Client SOA (.rdl)'
      ]
    },
    holding: {
      emoji: ICONS.holding,
      dayFlow: [
        [ICONS.clock + ' 07:00 AM · Cloud Fleet', 'Overnight Group Sync', 'Scheduled pipelines audit all subsidiary Business Units, verify SharePoint backups, and refresh group semantic models.', '✓ 100% Green'],
        [ICONS.clock + ' 10:30 AM · Group Treasury', 'Multi-Entity Cash & Loans', 'CFO reviews consolidated USD/EUR/AED cash positions, intercompany balances, and partner capital accounts.', '✓ Group Visibility'],
        [ICONS.clock + ' 02:30 PM · HR & Talent', 'Automated CV Routing', 'New job applicants via Tally auto-route CVs into per-company SharePoint folders and Dataverse HR queues.', '✓ Zero Manual Filing'],
        [ICONS.clock + ' 05:30 PM · Boardroom', 'Ask ISABI Executive Brief', 'Chairman asks ISABI for a cross-industry margin and receivable briefing; every figure cites its underlying subsidiary ledger.', '✓ Board Ready']
      ],
      before: [
        ICONS.cross + ' Waiting 15 to 20 days after month-end for subsidiaries to email incompatible Excel packs',
        ICONS.cross + ' Intercompany loans and cross-charges out of balance between sister companies',
        ICONS.cross + ' Branch staff accidentally seeing sensitive figures belonging to other group entities',
        ICONS.cross + ' Job applicant CVs scattered across WhatsApp chats and personal email inboxes'
      ],
      after: [
        ICONS.check + ' Real-time group P&L, balance sheet, and cash position across all operating industries',
        ICONS.check + ' Governed intercompany ledger and partner equity capital accounts that always balance',
        ICONS.check + ' Strict Dataverse Business Unit isolation so every seat sees only its authorized scope',
        ICONS.check + ' Automated group-wide recruitment pipeline wired straight to SharePoint and Dataverse'
      ]
    },
    pos: {
      emoji: ICONS.pos,
      dayFlow: [
        [ICONS.clock + ' 09:00 AM · Cashier Open', 'PIN Unlock & Drawer Float', 'Cashier unlocks the tablet till with a 4-digit PIN (fail-closed lock screen) and logs the opening cash float.', '✓ Till Unlocked'],
        [ICONS.clock + ' 02:00 PM · High Volume', '0.2s Offline Receipt Print', 'Internet drops during peak lunch rush; cashier keeps ringing orders and printing thermal receipts via RawBT Bluetooth.', '✓ Zero Lag'],
        [ICONS.clock + ' 06:00 PM · Reconnect', 'Auto Queue Flush', 'Wi-Fi returns; the local IndexedDB transaction queue flushes pending sales to the cloud with revision safety.', '✓ Auto Synced'],
        [ICONS.clock + ' 11:00 PM · Shift Close', 'Drawer Count & Ledger Post', 'Supervisor runs the Shift Close Report, reconciles cash + card totals, and posts end-of-day revenue to Dataverse.', '✓ Posted to ERP']
      ],
      before: [
        ICONS.cross + ' Cloud POS systems freezing at the gate or bar the moment internet connectivity flickers',
        ICONS.cross + ' Paying steep monthly per-terminal SaaS fees for every seasonal cashier tablet',
        ICONS.cross + ' Slow browser print dialogs and garbled characters on thermal receipt printers',
        ICONS.cross + ' Re-keying daily till close ribbons into the accounting software by hand'
      ],
      after: [
        ICONS.check + ' 100% offline-first IndexedDB queue that never drops a single order or receipt',
        ICONS.check + ' Direct ESC/POS raster thermal printing over Bluetooth in under 300 milliseconds',
        ICONS.check + ' $0 per-terminal licence tax on unlimited iOS, Android, or Windows tablets',
        ICONS.check + ' Automated end-of-day sales totals sync straight into `bhf_revenue` and Power BI'
      ]
    },
    attendance: {
      emoji: ICONS.kiosk,
      dayFlow: [
        [ICONS.clock + ' 06:00 AM · Site Gate', '1-Second Face + PIN Punch', 'Staff walk up to the wall tablet, enter their PIN, and the live camera verifies their face in 1 second (even offline).', '✓ Biometric Match'],
        [ICONS.clock + ' 12:30 PM · Multi-Site', 'Offline Buffer & Sync', 'Remote plant and resort punches buffer locally in IndexedDB and sync via encrypted HTTP flow to Dataverse.', '✓ Photo Audited'],
        [ICONS.clock + ' 05:00 PM · HR Console', 'Enrolment & Roster Control', 'HR enrols a new hire face descriptor in 15 seconds on the tablet and assigns their Business Unit and shift.', '✓ Instant Enrol'],
        [ICONS.clock + ' 03:00 AM · Nightly Job', 'Payroll Shift Derivation', 'Nightly cloud engine pairs clock-in/out punches, flags missing outs, computes overtime, and updates `bhf_attendance`.', '✓ Payroll Ready']
      ],
      before: [
        ICONS.cross + ' Proprietary fingerprint boxes breaking in dusty plants or humid beach resorts',
        ICONS.cross + ' Buddy-punching with shared swipe cards or unverified paper sign-in sheets',
        ICONS.cross + ' HR driving to remote sites with a USB stick at month-end to export punch logs',
        ICONS.cross + ' Days spent manually pairing clock-in and clock-out timestamps in Excel for payroll'
      ],
      after: [
        ICONS.check + ' Runs on any off-the-shelf Android or iPad tablet mounted at the gate',
        ICONS.check + ' Dual Face + PIN verification with confidence score and photo audit on every punch',
        ICONS.check + ' Works 100% offline during power/internet cuts and syncs automatically to Dataverse',
        ICONS.check + ' Nightly derivation engine turns raw punches into audited shifts, lateness, and overtime'
      ]
    }
  };

  // ---------------- STATE ----------------
  const state = {
    activeSec: 'architecture',
    archView: 'apps',
    appCat: 'all',
    activeAppId: 'gl',
    activeInd: 'hospitality',
    indMobTab: 'modules',
    heroScreen: 'dashboard',
    heroCurr: 'USD',
    heroInd: 'all',
    heroAppId: 'ledger',
    heroAiTopic: 'ar',
    sboxMode: 'erp',
    soaDoc: 'soa',
    posCart: [
      { name: 'VIP Cabana Full Day', price: 120, qty: 1 },
      { name: 'Grilled Lobster Platter', price: 68, qty: 2 },
      { name: 'Sunset Pitcher', price: 34, qty: 1 }
    ],
    posSyncedCount: 142,
    kioskLastPunch: { name: 'Rami K. · Batch Plant Dispatcher', time: '06:02:14 AM', score: '99.4% Face + PIN Match', status: 'Synced to bhf_punch' },
    sboxInd: 'holding',
    sboxNav: 'Overview',
    sboxPeriod: 'mtd',
    sboxCurr: 'USD',
    sboxTheme: 'auto',
    sboxMobTab: 'chart',
    msTab: 'all',
    cfgInd: 'Hospitality & Resorts',
    cfgScale: 2,
    cfgScaleLabel: 'Multi-Branch (2 to 4 Entities)',
    cfgScaleAdd: 2500,
    aiHistory: [],
    activeAiPillIdx: 0,
    deferredPrompt: null
  };

  let navScrollLockUntil = 0;
  let scrollTargetId = null;

  // ---------------- HELPERS ----------------
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = document.getElementById('site-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 3800);
  }

  // ---------------- RENDER INTERACTIVE HERO COMMAND CENTER ----------------
  const HERO_CURR_MAP = {
    USD: { sym: '$', rate: 1, code: 'USD' },
    EUR: { sym: '€', rate: 0.92, code: 'EUR' },
    AED: { sym: 'AED ', rate: 3.67, code: 'AED' }
  };

  const HERO_VERTICALS = [
    { id: 'trading', emoji: ICONS.trading, name: 'Auto & Heavy Equipment', sub: 'VIN Stock, Customs & Parts', val: 524900, pct: 88, color: '#3B82F6', badge: '24% GP', kpi2Lbl: ICONS.trading + ' Active VIN Inventory', kpi2Val: '184 Units', kpi2Sub: '✓ 100% customs & landed cost tracked' },
    { id: 'hospitality', emoji: ICONS.hospitality, name: 'Hospitality & Resorts', sub: 'Outlets, Cabanas, POS & Splits', val: 418200, pct: 74, color: '#D9A54A', badge: '34% EBITDA', kpi2Lbl: ICONS.hospitality + ' Outlet Till Sync', kpi2Val: '100.0%', kpi2Sub: '✓ All POS closes matched to cash' },
    { id: 'manufacturing', emoji: ICONS.manufacturing, name: 'Concrete & Manufacturing', sub: 'Batch Plant m³, Fleet & Silos', val: 361400, pct: 64, color: '#10B981', badge: '29% GP', kpi2Lbl: ICONS.scale + ' Weighbridge Volume', kpi2Val: '14,820 m³', kpi2Sub: '✓ Zero unbilled dispatch tickets' },
    { id: 'realestate', emoji: ICONS.realestate, name: 'Real Estate & Insurance', sub: 'Leases, Policies & Commissions', val: 178100, pct: 42, color: '#8B5CF6', badge: '94% Occ.', kpi2Lbl: ICONS.realestate + ' Portfolio Occupancy', kpi2Val: '94.6%', kpi2Sub: '✓ Automated lease & policy SOA' }
  ];

  const HERO_AI_TOPICS = {
    ar: {
      lbl: ICONS.search + ' Overdue AR Audit',
      q: 'Audit overdue receivables across all Business Units',
      ans: 'Across all 6 Business Units, <b>7 invoices totaling $42,300</b> are past 60 days (led by 2 fleet buyer installments in Trading and 1 contractor account in Concrete). One-click printable Statements of Account are ready for WhatsApp dispatch.',
      cite: 'Cited: bhf_receivable +ARAging.rdl · Reconciled to $0.00'
    },
    margin: {
      lbl: ICONS.pbi + ' Margin by Unit',
      q: 'Compare Hospitality vs. Auto & Heavy Equipment margins',
      ans: '<b>Hospitality & Resorts</b> leads net operating margin at <b>34.2% EBITDA</b> ($418.2k MTD), while <b>Auto & Heavy Equipment</b> leads gross volume at <b>$524.9k MTD</b> (24.1% GP after customs & freight capitalization).',
      cite: 'Cited: Consolidated Power BI XMLA Model · Class 6 & 7 Ledger'
    },
    parallel: {
      lbl: ICONS.scale + ' Parallel Run',
      q: 'How does the parallel run guarantee zero variance?',
      ans: 'ISABI runs side-by-side with your existing accounting until every operational sale, stock movement, and bank voucher matches your statutory trial balance to <b>$0.00 variance</b> before cutover.',
      cite: 'Cited: Layer 03 Statutory Bridge & TrialBalance.rdl'
    },
    sprint: {
      lbl: ICONS.calendar + ' 14-Day Sprint',
      q: 'How does the 1 to 2 week go-live sprint work?',
      ans: '<b>Days 1-3:</b> Custom Dataverse tables & COA. <b>Days 4-6:</b> ERP forms, role security & Offline PWAs. <b>Days 7-10:</b> Power BI & printable SOA pack. <b>Days 11-14:</b> Historical data migration & zero-variance go-live.',
      cite: 'Cited: ISABI Code-First Schema & TMDL Compiler'
    }
  };

  function fmtHeroMoney(usdVal) {
    const c = HERO_CURR_MAP[state.heroCurr] || HERO_CURR_MAP.USD;
    const v = Math.round(usdVal * c.rate);
    return c.sym + v.toLocaleString('en-US');
  }

  function renderHeroStage() {
    const stageEl = document.getElementById('hlc-stage');
    if (!stageEl) return;

    const k1Lbl = document.getElementById('hlc-kpi1-lbl');
    const k1Val = document.getElementById('hlc-kpi1-val');
    const k1Sub = document.getElementById('hlc-kpi1-sub');
    const k2Lbl = document.getElementById('hlc-kpi2-lbl');
    const k2Val = document.getElementById('hlc-kpi2-val');
    const k2Sub = document.getElementById('hlc-kpi2-sub');
    const winTitle = document.getElementById('hlc-window-title');

    document.querySelectorAll('[data-hero-screen]').forEach(el => {
      const act = el.dataset.heroScreen === state.heroScreen;
      el.classList.toggle('active', act);
      if (el.hasAttribute('aria-selected')) el.setAttribute('aria-selected', String(act));
    });
    document.querySelectorAll('[data-hero-curr]').forEach(el => {
      el.classList.toggle('active', el.dataset.heroCurr === state.heroCurr);
    });

    if (state.heroScreen === 'pos') {
      if (winTitle) winTitle.textContent = 'ISABI Field PWAs · POS & Kiosk';
      const cartTotal = state.posCart.reduce((acc, item) => acc + item.price * item.qty, 0);
      const itemCount = state.posCart.reduce((acc, item) => acc + item.qty, 0);
      if (k1Lbl) k1Lbl.innerHTML = `${ICONS.pos} Live Offline Till Ticket`;
      if (k1Val) k1Val.textContent = fmtHeroMoney(cartTotal);
      if (k1Sub) k1Sub.textContent = `${itemCount} items · Synced receipts: ${state.posSyncedCount}`;
      if (k2Lbl) k2Lbl.innerHTML = `${ICONS.kiosk} Biometric Gate Kiosk`;
      if (k2Val) k2Val.textContent = '0.8s Match';
      if (k2Sub) k2Sub.textContent = `✓ ${state.kioskLastPunch.name.split('·')[0].trim()} (${state.kioskLastPunch.time})`;

      stageEl.innerHTML = `
        <div class="hlc-pos-box">
          <div class="hlc-pos-btns">
            <button type="button" class="hlc-pos-btn" data-pos-add="VIP Cabana|120"><span>${ICONS.hospitality} VIP Cabana</span><b>+${fmtHeroMoney(120)}</b></button>
            <button type="button" class="hlc-pos-btn" data-pos-add="Grilled Lobster|68"><span>${ICONS.pos} Lobster</span><b>+${fmtHeroMoney(68)}</b></button>
            <button type="button" class="hlc-pos-btn" data-pos-add="Sunset Pitcher|34"><span>${ICONS.pos} Pitcher</span><b>+${fmtHeroMoney(34)}</b></button>
            <button type="button" class="hlc-pos-btn" data-pos-add="Double Espresso|8"><span>${ICONS.pos} Espresso</span><b>+${fmtHeroMoney(8)}</b></button>
          </div>
          <div class="hlc-pos-receipt">
            <div class="hlc-pos-rhead">
              <span>THERMAL RECEIPT · TILL #01 (OFFLINE READY)</span>
              <b>Total: ${fmtHeroMoney(cartTotal)}</b>
            </div>
            <div class="hlc-pos-ritems">
              ${state.posCart.map(it => `<span>${it.qty}x ${it.name} (${fmtHeroMoney(it.price * it.qty)})</span>`).join(' · ')}
            </div>
            <div class="hlc-pos-racts">
              <button type="button" class="btn btn-brass" style="padding:6px 12px;font-size:12px" data-pos-sync="1">${ICONS.pos} Print &amp; Sync to Ledger</button>
              <button type="button" class="btn btn-outline" style="padding:6px 12px;font-size:12px;background:rgba(255,255,255,0.08);color:#F4F2EE;border-color:rgba(255,255,255,0.2)" data-kiosk-punch="Rami K. · Batch Plant|99.6% Face + PIN">${ICONS.kiosk} Simulate Gate Face Punch</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (state.heroScreen === 'apps') {
      if (winTitle) winTitle.textContent = 'ISABI App Suite · 18 Custom Modules';
      if (k1Lbl) k1Lbl.innerHTML = `${ICONS.apps} Production Modules`;
      if (k1Val) k1Val.textContent = '18 Apps';
      if (k1Sub) k1Sub.textContent = '✓ 100% Custom Schema · Zero Templates';
      if (k2Lbl) k2Lbl.innerHTML = `${ICONS.bolt} Go-Live Delivery`;
      if (k2Val) k2Val.textContent = '1 to 2 Wks';
      if (k2Sub) k2Sub.textContent = '✓ Deployed inside your M365 tenant';

      const heroApps = APP_SUITE.slice(0, 8);
      const curApp = APP_SUITE.find(a => a.id === state.heroAppId) || heroApps[0];
      stageEl.innerHTML = `
        <div class="hlc-apps-mini">
          <div class="hlc-apps-grid">
            ${heroApps.map(a => `
              <button type="button" class="hlc-app-chip ${a.id === curApp.id ? 'active' : ''}" data-hero-app="${a.id}">
                <span>${a.emoji}</span>
                <b>${a.name.split(' ')[0]} ${a.name.split(' ')[1] || ''}</b>
              </button>
            `).join('')}
          </div>
          <div class="hlc-app-detail">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
              <b>${curApp.emoji} ${curApp.name}</b>
              <span class="hlc-vrow-badge">${curApp.sub}</span>
            </div>
            <p>${curApp.desc}</p>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">
              <div class="hlc-table-tags">${curApp.tables.map(t => `<span>${t}</span>`).join('')}</div>
              <a href="#architecture" class="btn btn-brass" style="padding:5px 10px;font-size:11.5px">Explore All 18 Apps ▸</a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (state.heroScreen === 'ai') {
      if (winTitle) winTitle.textContent = 'Ask ISABI · Cited AI Assistant';
      if (k1Lbl) k1Lbl.innerHTML = `${ICONS.ai} AI Ledger Grounding`;
      if (k1Val) k1Val.textContent = '100% Cited';
      if (k1Sub) k1Sub.textContent = '✓ Live Dataverse Ledger, Stock & AR';
      if (k2Lbl) k2Lbl.innerHTML = `${ICONS.globe} Multilingual Fluency`;
      if (k2Val) k2Val.textContent = 'EN · AR · FR';
      if (k2Sub) k2Sub.textContent = '✓ Instant Executive Audits 24/7';

      const curTopic = HERO_AI_TOPICS[state.heroAiTopic] || HERO_AI_TOPICS.ar;
      stageEl.innerHTML = `
        <div class="hlc-ai-box">
          <div class="hlc-ind-pills">
            ${Object.entries(HERO_AI_TOPICS).map(([k, v]) => `
              <button type="button" class="hlc-ind-pill ${state.heroAiTopic === k ? 'active' : ''}" data-hero-ai-topic="${k}">${v.lbl}</button>
            `).join('')}
          </div>
          <div class="hlc-ai-card">
            <div class="hlc-ai-q"><b>You:</b> "${curTopic.q}"</div>
            <div class="hlc-ai-a"><b>${ICONS.ai} Ask ISABI:</b> ${curTopic.ans}</div>
            <div class="hlc-ai-foot">
              <small>${curTopic.cite}</small>
              <button type="button" class="btn btn-brass" style="padding:5px 10px;font-size:11.5px" data-open-ai="${curTopic.q}">Open Full Chat ▸</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Default: 'dashboard' mode
    if (winTitle) winTitle.textContent = 'ISABI Live Command Center';
    const selV = HERO_VERTICALS.find(v => v.id === state.heroInd);
    if (selV) {
      if (k1Lbl) k1Lbl.innerHTML = `${selV.emoji} ${selV.name} (MTD)`;
      if (k1Val) k1Val.textContent = fmtHeroMoney(selV.val);
      if (k1Sub) k1Sub.textContent = `▲ ${selV.badge} · ${selV.sub}`;
      if (k2Lbl) k2Lbl.innerHTML = selV.kpi2Lbl;
      if (k2Val) k2Val.textContent = selV.kpi2Val;
      if (k2Sub) k2Sub.textContent = selV.kpi2Sub;
    } else {
      if (k1Lbl) k1Lbl.innerHTML = `${ICONS.trend} Consolidated Revenue (MTD)`;
      if (k1Val) k1Val.textContent = fmtHeroMoney(1482600);
      if (k1Sub) k1Sub.textContent = '▲ +11.4% vs prior period · 6 Entities';
      if (k2Lbl) k2Lbl.innerHTML = `${ICONS.scale} Books Reconciled`;
      if (k2Val) k2Val.textContent = '100.0%';
      if (k2Sub) k2Sub.textContent = '✓ $0.00 statutory variance';
    }

    stageEl.innerHTML = `
      <div class="hlc-ind-pills" role="tablist" aria-label="Filter Vertical">
        <button type="button" class="hlc-ind-pill ${state.heroInd === 'all' ? 'active' : ''}" data-hero-ind="all">${ICONS.holding} All Group</button>
        <button type="button" class="hlc-ind-pill ${state.heroInd === 'hospitality' ? 'active' : ''}" data-hero-ind="hospitality">${ICONS.hospitality} Resorts</button>
        <button type="button" class="hlc-ind-pill ${state.heroInd === 'trading' ? 'active' : ''}" data-hero-ind="trading">${ICONS.trading} Auto &amp; Heavy Equipment</button>
        <button type="button" class="hlc-ind-pill ${state.heroInd === 'manufacturing' ? 'active' : ''}" data-hero-ind="manufacturing">${ICONS.manufacturing} Concrete</button>
        <button type="button" class="hlc-ind-pill ${state.heroInd === 'realestate' ? 'active' : ''}" data-hero-ind="realestate">${ICONS.realestate} Real Estate</button>
      </div>
      <div class="hlc-visual-list">
        ${HERO_VERTICALS.map(v => `
          <div class="hlc-vrow ${state.heroInd === v.id ? 'active' : ''}" data-hero-ind="${v.id}">
            <div class="hlc-vrow-main">
              <b>${v.emoji} ${v.name}</b>
              <small>${v.sub}</small>
            </div>
            <div class="hlc-vrow-bar"><i style="width:${v.pct}%;background:${v.color}"></i></div>
            <span class="hlc-vrow-badge">${v.badge}</span>
            <strong class="num">${fmtHeroMoney(v.val)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ---------------- RENDER 18-APP ODOO-STYLE SUITE & SPOTLIGHT ----------------
  function renderAppSuite() {
    const gridEl = document.getElementById('app-suite-grid');
    const spotEl = document.getElementById('app-spotlight');
    if (!gridEl || !spotEl) return;

    const filtered = state.appCat === 'all'
      ? APP_SUITE
      : APP_SUITE.filter(a => a.cat === state.appCat);

    if (!filtered.some(a => a.id === state.activeAppId) && filtered.length) {
      state.activeAppId = filtered[0].id;
    }

    gridEl.innerHTML = filtered.map(a => `
      <button type="button" class="app-tile ${a.id === state.activeAppId ? 'active' : ''}" role="option" aria-selected="${a.id === state.activeAppId}" data-app-id="${a.id}">
        <span class="app-icon ${a.tone}" aria-hidden="true">${a.emoji}</span>
        <b>${a.name}</b>
        <small>${a.sub}</small>
      </button>
    `).join('');

    const cur = APP_SUITE.find(a => a.id === state.activeAppId) || APP_SUITE[0];
    spotEl.innerHTML = `
      <div class="app-spot-head">
        <span class="app-icon ${cur.tone}" aria-hidden="true">${cur.emoji}</span>
        <div>
          <span class="app-spot-kicker">${cur.kicker}</span>
          <h3>${cur.name}</h3>
          <p>${cur.desc}</p>
        </div>
      </div>
      <div class="app-spot-specs">
        <ul class="app-spot-bullets">
          ${cur.bullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
        <div class="app-spot-tables">
          ${cur.tables.map(t => `<span>${t}</span>`).join('')}
        </div>
      </div>
      <div class="app-spot-actions">
        <button type="button" class="btn btn-brass" data-load-sandbox="${cur.sbox}">${ICONS.erp} Try in Sandbox</button>
        <button type="button" class="btn btn-outline" data-open-ai="${cur.ask}">${ICONS.ai} Ask ISABI</button>
      </div>
    `;
  }

  // ---------------- NAVIGATION ACTIVE UNDERLINE & EXACT SECTION SCROLL ----------------
  function setActiveSection(secId) {
    const resolved = SEC_IDS.includes(secId) ? secId : 'architecture';
    state.activeSec = resolved;
    document.querySelectorAll('[data-sec-link]').forEach(link => {
      const isMatch = link.dataset.secLink === resolved;
      link.classList.toggle('active', isMatch);
      if (isMatch && link.closest('#mobile-sec-nav')) {
        const nav = document.getElementById('mobile-sec-nav');
        if (nav) {
          const targetLeft = link.offsetLeft - (nav.clientWidth / 2) + (link.offsetWidth / 2);
          nav.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        }
      }
    });
  }

  function computeExactTargetScrollY(el) {
    if (!el) return 0;
    const hdr = document.getElementById('site-header');
    const hdrH = hdr ? hdr.offsetHeight : 70;
    const rectTop = el.getBoundingClientRect().top + window.scrollY;
    if (el.classList.contains('sec')) {
      return Math.max(0, Math.round(rectTop - hdrH + 2));
    }
    return Math.max(0, Math.round(rectTop - hdrH - 14));
  }

  function activatePricingView(viewKey) {
    document.querySelectorAll('[data-price-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.priceView === viewKey);
    });
    document.querySelectorAll('[data-price-panel]').forEach(panel => {
      if (panel.dataset.pricePanel === viewKey) {
        panel.removeAttribute('data-panel-hidden');
        panel.removeAttribute('data-mob-hide');
      } else {
        panel.setAttribute('data-panel-hidden', '1');
      }
    });
    if (viewKey === 'builder') {
      document.querySelectorAll('[data-tier-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tierTab === 'builder');
      });
    } else if (viewKey === 'tiers') {
      document.querySelectorAll('[data-tier-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tierTab === 'tier2');
      });
    }
  }

  function activateMobilePricingTab(targetTier) {
    document.querySelectorAll('[data-tier-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tierTab === targetTier);
    });
    if (targetTier === 'builder') {
      activatePricingView('builder');
      return;
    }
    activatePricingView('tiers');
    const grid = document.getElementById('pricing-tiers-grid');
    if (grid) {
      grid.removeAttribute('data-mob-hide');
      grid.removeAttribute('data-panel-hidden');
    }
    document.querySelectorAll('[data-tier-card]').forEach(card => {
      if (card.dataset.tierCard === targetTier) {
        card.removeAttribute('data-mob-hide');
      } else if (card.dataset.tierCard !== 'builder') {
        card.setAttribute('data-mob-hide', '1');
      }
    });
  }

  function activateMobileIngTab(targetKey) {
    document.querySelectorAll('[data-ing-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.ingTab === targetKey);
    });
    document.querySelectorAll('[data-ing-panel]').forEach(panel => {
      if (panel.dataset.ingPanel === targetKey) {
        panel.removeAttribute('data-panel-hidden');
        panel.removeAttribute('data-mob-hide');
      } else {
        panel.setAttribute('data-panel-hidden', '1');
        panel.setAttribute('data-mob-hide', '1');
      }
    });
  }

  function activateMobilePortalTab(targetKey) {
    document.querySelectorAll('[data-portal-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.portalTab === targetKey);
    });
    document.querySelectorAll('[data-portal-panel]').forEach(panel => {
      if (panel.dataset.portalPanel === targetKey) {
        panel.removeAttribute('data-mob-hide');
      } else {
        panel.setAttribute('data-mob-hide', '1');
      }
    });
  }

  function scrollToTargetId(rawId, updateHash = true, instant = false) {
    const cleanId = String(rawId || '').replace(/^#/, '');
    if (!cleanId || cleanId === 'top') {
      navScrollLockUntil = Date.now() + 900;
      scrollTargetId = null;
      setActiveSection('architecture');
      if (instant) {
        window.scrollTo(0, 0);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (updateHash && history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }

    if (cleanId === 'scope-configurator') {
      activateMobilePricingTab('builder');
    }

    const effectiveScrollId = (cleanId === 'scope-configurator' && window.innerWidth > 720) ? 'pricing' : cleanId;
    const targetEl = document.getElementById(effectiveScrollId);
    if (!targetEl) return;

    const mappedSec = cleanId === 'scope-configurator' ? 'pricing' : (SEC_IDS.includes(cleanId) ? cleanId : state.activeSec);
    setActiveSection(mappedSec);

    scrollTargetId = effectiveScrollId;
    navScrollLockUntil = Date.now() + 950;
    const exactY = computeExactTargetScrollY(targetEl);
    if (instant) {
      window.scrollTo(0, exactY);
    } else {
      window.scrollTo({ top: exactY, behavior: 'smooth' });
    }

    if (updateHash && history.replaceState) {
      history.replaceState(null, '', '#' + cleanId);
    }

    clearTimeout(scrollToTargetId._verifyTimer);
    scrollToTargetId._verifyTimer = setTimeout(() => {
      if (scrollTargetId === effectiveScrollId) {
        const currentTarget = document.getElementById(effectiveScrollId);
        if (currentTarget) {
          const desiredY = computeExactTargetScrollY(currentTarget);
          if (Math.abs(window.scrollY - desiredY) > 2 && Math.abs(window.scrollY - desiredY) < 120) {
            window.scrollTo(0, desiredY);
          }
        }
        scrollTargetId = null;
      }
    }, 650);
  }

  function updateActiveNavOnScroll() {
    if (Date.now() < navScrollLockUntil) return;
    const hdr = document.getElementById('site-header');
    const hdrH = hdr ? hdr.offsetHeight : 70;
    const probeY = window.scrollY + hdrH + 72;

    if ((window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 40)) {
      if (state.activeSec !== 'portal') setActiveSection('portal');
      return;
    }

    let current = SEC_IDS[0];
    for (let i = 0; i < SEC_IDS.length; i++) {
      const id = SEC_IDS[i];
      const el = document.getElementById(id);
      if (!el) continue;
      const top = el.offsetTop;
      if (probeY >= top) {
        current = id;
      }
    }
    if (current !== state.activeSec) {
      setActiveSection(current);
    }
  }

  // ---------------- RENDER INDUSTRY BLUEPRINTS (WITH 4 DESKTOP & MOBILE TABS) ----------------
  const IND_SHORT_NAMES = {
    hospitality: 'Hospitality & Resorts',
    trading: 'Auto & Equipment Trading',
    manufacturing: 'Concrete & Mfg',
    realestate: 'Real Estate',
    insurance: 'Insurance Brokerage',
    holding: 'Holding Groups',
    pos: 'Offline POS Till PWA',
    attendance: 'Attendance Kiosk PWA'
  };

  function renderIndustries() {
    const tabsEl = document.getElementById('ind-tabs');
    const detailEl = document.getElementById('ind-detail');
    if (!tabsEl || !detailEl) return;

    const isMobile = window.innerWidth <= 720;
    tabsEl.innerHTML = INDUSTRIES.map(ind => {
      const ex = IND_EXTRAS[ind.id] || { emoji: ICONS.realestate };
      return `
      <button type="button" class="ind-tab ${ind.id === state.activeInd ? 'active' : ''}" role="tab" aria-selected="${ind.id === state.activeInd}" data-ind-id="${ind.id}">
        <b>${ex.emoji} ${isMobile ? (IND_SHORT_NAMES[ind.id] || ind.name) : ind.name}</b>
        <small>${ind.sub}</small>
      </button>
    `;
    }).join('');

    const cur = INDUSTRIES.find(x => x.id === state.activeInd) || INDUSTRIES[0];
    const ex = IND_EXTRAS[cur.id] || IND_EXTRAS.hospitality;
    const mTab = state.indMobTab || 'modules';

    let bodyContentHtml = '';
    if (mTab === 'dayflow') {
      bodyContentHtml = `
        <div class="ind-flow-grid">
          ${ex.dayFlow.map(step => `
            <div class="ind-flow-step">
              <span class="ind-flow-time">${step[0]}</span>
              <h4>${step[1]}</h4>
              <p>${step[2]}</p>
              <span class="ind-flow-tag">${step[3]}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else if (mTab === 'beforeafter') {
      bodyContentHtml = `
        <div class="ind-ba-grid">
          <div class="ind-ba-card before">
            <h4>${ICONS.warn} Before ISABI (Spreadsheets &amp; Generic Templates)</h4>
            <ul>${ex.before.map(item => `<li>${item}</li>`).join('')}</ul>
          </div>
          <div class="ind-ba-card after">
            <h4>${ICONS.check} After ISABI (Governed Custom Architecture)</h4>
            <ul>${ex.after.map(item => `<li>${item}</li>`).join('')}</ul>
          </div>
        </div>
      `;
    } else {
      bodyContentHtml = `
        <div class="ind-cols">
          <div class="ind-box" data-ind-box="modules" ${mTab !== 'modules' ? 'data-mob-hide="1"' : ''}>
            <h4>${ICONS.box} Custom Tables &amp; Modules</h4>
            <ul>${cur.modules.map(m => `<li>${m}</li>`).join('')}</ul>
          </div>
          <div class="ind-box" data-ind-box="workflows" ${mTab !== 'workflows' && mTab !== 'modules' ? 'data-mob-hide="1"' : (isMobile && mTab !== 'workflows' ? 'data-mob-hide="1"' : '')}>
            <h4>${ICONS.bolt} Automated Cloud Workflows</h4>
            <ul>${cur.workflows.map(w => `<li>${w}</li>`).join('')}</ul>
          </div>
          <div class="ind-box" data-ind-box="reports" ${mTab !== 'reports' && mTab !== 'modules' ? 'data-mob-hide="1"' : (isMobile && mTab !== 'reports' ? 'data-mob-hide="1"' : '')}>
            <h4>${ICONS.pbi} Power BI &amp; Printable .RDL</h4>
            <ul>${cur.reports.map(r => `<li>${r}</li>`).join('')}</ul>
          </div>
        </div>
      `;
    }

    detailEl.innerHTML = `
      <div class="ind-detail-top">
        <div>
          <span class="ind-badge-pill">${ex.emoji} ${cur.badge}</span>
          <h3>${cur.name}</h3>
          <p class="ind-detail-lead">${cur.lead}</p>
        </div>
        <div class="ind-detail-acts">
          <button type="button" class="btn btn-outline" data-load-sandbox="${cur.sandboxKey}">${ICONS.erp} Preview in Live ERP Sandbox</button>
          <button type="button" class="btn btn-brass" data-configure-ind="${cur.cfgName}">${ICONS.scope} Price This Industry System</button>
        </div>
      </div>

      <div class="ind-subtabs" role="tablist" aria-label="Blueprint Views">
        <button type="button" class="ind-subtab-btn ${mTab === 'modules' ? 'active' : ''}" data-ind-subtab="modules">${ICONS.box} Core Modules (${cur.modules.length})</button>
        <button type="button" class="ind-subtab-btn ${mTab === 'dayflow' ? 'active' : ''}" data-ind-subtab="dayflow">${ICONS.clock} Day-in-the-Life Flow</button>
        <button type="button" class="ind-subtab-btn ${mTab === 'beforeafter' ? 'active' : ''}" data-ind-subtab="beforeafter">${ICONS.sync} Before vs. After</button>
        <button type="button" class="ind-subtab-btn ${mTab === 'reports' ? 'active' : ''}" data-ind-subtab="reports">${ICONS.pbi} Reports &amp; Workflows</button>
      </div>

      ${bodyContentHtml}

      <div class="ind-ledger-strip">
        <div class="ind-metrics-mini">
          ${cur.metrics.map(m => `<div><small>${m[0]}</small><b class="num">${m[1]}</b></div>`).join('')}
        </div>
        <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I am interested in an ISABI Systems blueprint for ' + cur.name + '. Can we schedule a quick walkthrough?')}" target="_blank" rel="noopener" class="btn btn-wa" aria-label="Discuss ${cur.name} on WhatsApp">
          ${ICONS.wa} Discuss on WhatsApp
        </a>
      </div>
    `;
  }

  // ---------------- RENDER LIVE ERP, SOA & FIELD PWA SANDBOX ----------------
  const MONTH_DATES = Array.from({ length: 12 }, (_, i) => new Date(NOW.getFullYear(), NOW.getMonth() - 11 + i, 1));
  const MONTHS = MONTH_DATES.map(d => MONTH_ABBR[d.getMonth()]);
  const MONTH_LABELS = MONTH_DATES.map(d => MONTH_ABBR[d.getMonth()] + ' ' + d.getFullYear());
  const CURR_MULT = { USD: { mult: 1, sym: 'USD' }, EUR: { mult: 0.92, sym: 'EUR' }, AED: { mult: 3.67, sym: 'AED' } };
  const CUR_Q = Math.floor(NOW.getMonth() / 3) + 1;
  const PERIOD_MULT = {
    mtd: { mult: 1, label: MONTH_FULL[NOW.getMonth()] + ' ' + NOW.getFullYear() + ' (MTD)' },
    qtd: { mult: 2.85, label: 'Q' + CUR_Q + ' ' + NOW.getFullYear() + ' (QTD)' },
    ytd: { mult: 9.4, label: 'FY ' + NOW.getFullYear() + ' (YTD)' }
  };
  const SBOX_LABELS = { holding: 'Group Holding', hospitality: 'Hospitality & Resorts', trading: 'Auto & Equipment Trading', manufacturing: 'Concrete & Manufacturing', realestate: 'Real Estate', insurance: 'Insurance Brokerage' };

  function buildSandboxChart(d, mult, sym) {
    const W = 660, H = 118, ml = 40, mr = 10, mt = 12, mb = 18;
    const pw = W - ml - mr, ph = H - mt - mb;
    const totals = MONTHS.map((_, i) => (d.seriesVals[0][i] + d.seriesVals[1][i] + d.seriesVals[2][i]) * mult);
    const rawMax = Math.max(...totals, 100);
    const max = Math.ceil(rawMax / 100) * 100;
    const y = v => mt + ph - (v / max) * ph;

    let g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const tv = Math.round(max * f);
      g += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}"/>`;
      g += `<text class="tick" x="${ml - 8}" y="${(y(tv) + 4).toFixed(1)}" text-anchor="end">${tv}</text>`;
    });
    g += `<text class="tick" x="${ml}" y="${mt - 4}" text-anchor="start">${sym} k</text>`;

    const slot = pw / 12, bw = 28;
    MONTHS.forEach((m, i) => {
      const x = ml + slot * i + (slot - bw) / 2;
      let base = 0, seg = '';
      const sVals = d.seriesVals.map(s => Math.round(s[i] * mult));
      const total = sVals[0] + sVals[1] + sVals[2];

      sVals.forEach((v, k) => {
        const top = y(base + v);
        const bottom = y(base) - (k ? 1.5 : 0);
        const h = Math.max(0, bottom - top);
        const last = k === sVals.length - 1;
        seg += last
          ? `<path class="s-${k + 1}" d="M${x.toFixed(1)} ${bottom.toFixed(1)}V${(top + 3).toFixed(1)}q0 -3 3 -3h${bw - 6}q3 0 3 3V${bottom.toFixed(1)}Z"/>`
          : `<rect class="s-${k + 1}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}"/>`;
        base += v;
      });

      const tip = d.seriesNames.map((nm, idx) => `${nm}: ${sVals[idx]}k`).join(' · ');
      g += `<g class="col" data-m="${MONTH_LABELS[i]}" data-t="${total}k ${sym}" data-tip="${tip}">`
        + `<rect class="hit" x="${(ml + slot * i).toFixed(1)}" y="${mt}" width="${slot.toFixed(1)}" height="${ph}"/>${seg}</g>`;
      g += `<text class="tick" x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle">${m}</text>`;
      if (i === 11) {
        g += `<text class="lbl" x="${(x + bw / 2).toFixed(1)}" y="${(y(total) - 6).toFixed(1)}" text-anchor="middle">${total}k</text>`;
      }
    });

    g += `<line class="axis" x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}"/>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly performance stacked chart">${g}</svg>`;
  }

  function renderSandbox() {
    const barEl = document.getElementById('sbox-ind-bar');
    const mockEl = document.getElementById('sandbox-mock');
    if (!barEl || !mockEl) return;

    const sboxChoices = [
      ['holding', ICONS.holding + ' Group Holding'],
      ['hospitality', ICONS.hospitality + ' Hospitality & Resorts'],
      ['trading', ICONS.trading + ' Auto & Equipment Trading'],
      ['manufacturing', ICONS.manufacturing + ' Concrete & Mfg'],
      ['realestate', ICONS.realestate + ' Real Estate'],
      ['insurance', ICONS.insurance + ' Insurance Brokerage']
    ];

    barEl.innerHTML = sboxChoices.map(([k, lbl]) => `
      <button type="button" class="sbox-ind-btn ${state.sboxInd === k ? 'active' : ''}" data-sbox-ind="${k}">${lbl}</button>
    `).join('');

    const d = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const totalMult = cm.mult * pm.mult;

    // MODE 2: PRINTABLE STATEMENT OF ACCOUNT (.RDL) VIEWER
    if (state.sboxMode === 'soa') {
      mockEl.className = 'mock mode-full';
      const docType = state.soaDoc || 'soa';
      let rowsHtml = '';
      let runBal = 18400 * cm.mult;
      d.journal.forEach((r, idx) => {
        const deb = r[4] ? (r[4] * cm.mult) : 0;
        const cred = r[5] ? (r[5] * cm.mult) : 0;
        runBal += (deb - cred);
        rowsHtml += `<tr>
          <td>${DAY_TOKENS[r[0]] || r[0]}</td>
          <td class="mono">${r[1]}</td>
          <td>${r[2]}</td>
          <td>${r[3]}</td>
          <td class="n">${deb ? deb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
          <td class="n">${cred ? cred.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
          <td class="n"><b>${runBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>
        </tr>`;
      });

      mockEl.innerHTML = `
        <div class="soa-viewer">
          <div class="soa-hdr">
            <div>
              <span class="ind-badge-pill">${ICONS.soa} Paginated .RDL Statement Preview · ${d.groupTitle}</span>
              <h3 style="font-size:20px;margin:4px 0">Audited Statement of Account &amp; Trial Balance (${cm.sym})</h3>
              <span style="font-size:12px;color:var(--m-muted)">Period: ${pm.label} · Lebanese / Regional Class 1 to 7 COA · Reconciled to $0.00 Variance</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="sbox-theme-btn ${docType === 'soa' ? 'active' : ''}" data-soa-doc="soa">${ICONS.soa} Statement of Account</button>
              <button type="button" class="sbox-theme-btn ${docType === 'tb' ? 'active' : ''}" data-soa-doc="tb">${ICONS.scale} Statutory Trial Balance</button>
              <button type="button" class="primary-mock" data-open-ai="Audit the ${d.groupTitle} Statement of Account in ${cm.sym}">${ICONS.ai} Ask ISABI to Audit</button>
            </div>
          </div>

          <div class="soa-meta-grid">
            <div class="soa-meta-cell"><small>Opening Balance (${cm.sym})</small><b class="num">${(18400 * cm.mult).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>
            <div class="soa-meta-cell"><small>Period Debits</small><b class="num">${(42600 * cm.mult).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>
            <div class="soa-meta-cell"><small>Period Credits</small><b class="num">${(38900 * cm.mult).toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></div>
            <div class="soa-meta-cell"><small>Statutory Book Variance</small><b class="num" style="color:var(--good)">0.00 (${cm.sym}) ✓</b></div>
          </div>

          <div class="panel">
            <table class="m-grid">
              <thead>
                <tr><th>Date</th><th>Voucher Ref</th><th>Business Unit</th><th>Class &amp; Account Description</th><th class="n">Debit (${cm.sym})</th><th class="n">Credit (${cm.sym})</th><th class="n">Running Balance (${cm.sym})</th></tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="total">
                  <td colspan="4"><b>Closing Audited Balance (Closed with the ISABI Double Rule)</b></td>
                  <td class="n">${(42600 * cm.mult).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="n">${(38900 * cm.mult).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="n"><b>${runBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
      updateAiScopeBar();
      return;
    }

    // MODE 3: INTERACTIVE OFFLINE POS TILL & BIOMETRIC GATE KIOSK PLAYGROUND
    if (state.sboxMode === 'pwa') {
      mockEl.className = 'mock mode-full';
      const cartTotal = state.posCart.reduce((acc, item) => acc + item.price * item.qty, 0);
      mockEl.innerHTML = `
        <div class="pwa-sim-grid">
          <div class="pwa-sim-card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div>
                <span class="ind-badge-pill">${ICONS.pos} Offline Cashier POS Till PWA</span>
                <h3 style="font-size:17px">Tap Items to Ring an Order &amp; Sync to Ledger</h3>
              </div>
              <span class="hlc-status"><i></i>Offline Queue Ready</span>
            </div>
            <div class="pos-items-grid">
              <button type="button" class="pos-item-btn" data-pos-add="VIP Cabana|120"><span>${ICONS.hospitality} VIP Cabana</span><b class="num">+$120</b></button>
              <button type="button" class="pos-item-btn" data-pos-add="Grilled Lobster|68"><span>${ICONS.pos} Grilled Lobster</span><b class="num">+$68</b></button>
              <button type="button" class="pos-item-btn" data-pos-add="Sunset Pitcher|34"><span>${ICONS.pos} Sunset Pitcher</span><b class="num">+$34</b></button>
              <button type="button" class="pos-item-btn" data-pos-add="Double Espresso|8"><span>${ICONS.pos} Double Espresso</span><b class="num">+$8</b></button>
            </div>
            <div class="pos-receipt-box">
              <div style="border-bottom:1px dashed rgba(255,255,255,0.25);padding-bottom:6px;margin-bottom:6px;display:flex;justify-content:space-between">
                <span>ISABI THERMAL RECEIPT · TILL #01</span>
                <span>Receipts Synced: ${state.posSyncedCount}</span>
              </div>
              ${state.posCart.map(it => `<div style="display:flex;justify-content:space-between"><span>${it.qty}x ${it.name}</span><span>$${(it.price * it.qty).toFixed(2)}</span></div>`).join('')}
              <div style="border-top:1px solid #D9A54A;border-bottom:3px double #D9A54A;margin-top:8px;padding:5px 0;display:flex;justify-content:space-between;font-weight:700;color:#D9A54A">
                <span>TOTAL TTC (INCL. VAT)</span>
                <span>$${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn-brass" style="flex:1" data-pos-sync="1">${ICONS.pos} Print Receipt &amp; Sync to Dataverse</button>
              <button type="button" class="btn btn-outline" data-pos-clear="1">Reset Till</button>
            </div>
          </div>

          <div class="pwa-sim-card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <div>
                <span class="ind-badge-pill">${ICONS.kiosk} Biometric Face &amp; PIN Gate Kiosk PWA</span>
                <h3 style="font-size:17px">Tap an Employee to Simulate a 1-Second Gate Punch</h3>
              </div>
              <span class="hlc-status"><i></i>Camera + PIN Live</span>
            </div>
            <div class="pos-items-grid">
              <button type="button" class="pos-item-btn" data-kiosk-punch="Rami K. · Batch Plant Dispatcher|99.4% Face + PIN"><span>${ICONS.kiosk} Rami K. · Batch Plant</span><b>Clock In</b></button>
              <button type="button" class="pos-item-btn" data-kiosk-punch="Maya S. · Resort Front Desk|99.7% Face + PIN"><span>${ICONS.kiosk} Maya S. · Front Desk</span><b>Clock In</b></button>
              <button type="button" class="pos-item-btn" data-kiosk-punch="Tariq N. · Heavy Equipment Bay|99.1% Face + PIN"><span>${ICONS.scope} Tariq N. · Service Bay</span><b>Clock In</b></button>
              <button type="button" class="pos-item-btn" data-kiosk-punch="Jad M. · Mixer Fleet Driver|99.5% Face + PIN"><span>${ICONS.fleet} Jad M. · Mixer Fleet</span><b>Clock Out</b></button>
            </div>
            <div class="pos-receipt-box">
              <div style="border-bottom:1px dashed rgba(255,255,255,0.25);padding-bottom:6px;margin-bottom:6px;display:flex;justify-content:space-between">
                <span>BIOMETRIC GATE VERIFICATION LOG</span>
                <span style="color:#3DB36A">● Verified</span>
              </div>
              <div><b>Employee:</b> ${state.kioskLastPunch.name}</div>
              <div><b>Timestamp:</b> ${state.kioskLastPunch.time}</div>
              <div><b>Biometric Audit:</b> ${state.kioskLastPunch.score}</div>
              <div style="color:#D9A54A;margin-top:4px"><b>Cloud Pipeline:</b> ${state.kioskLastPunch.status}</div>
            </div>
            <button type="button" class="btn btn-outline" style="width:100%" data-open-ai="How do the Offline POS Till and Biometric Attendance Kiosk PWAs sync to Dataverse?">${ICONS.ai} Ask ISABI How Offline Sync Works</button>
          </div>
        </div>
      `;
      updateAiScopeBar();
      return;
    }

    // MODE 1 (DEFAULT): 6-INDUSTRY LIVE ERP & POWER BI COMMAND CENTER
    mockEl.className = 'mock';
    const navItems = ['Overview', 'Sales & Revenue', 'Purchases & Stock', 'Cash & Treasury', 'General Ledger', 'Paginated .RDL'];

    const kpisHtml = d.kpis.map(k => {
      const val = k.fixed ? k.v : (k.v * totalMult).toFixed(1);
      return `
        <div class="kpi ${k.books ? 'books' : ''}">
          <div>
            <span class="k">${k.k}</span>
            <span class="v num">${val}<small>${k.unit}</small></span>
          </div>
          <span class="d ${k.cls || ''}">${k.d}</span>
        </div>
      `;
    }).join('');

    const entHtml = d.entities.map(r => {
      const v = (r[1] * totalMult).toFixed(1) + 'k';
      return `<tr><td><b>${r[0]}</b></td><td class="n">${v}</td><td class="n">${r[2]}</td><td class="mu hide-xs">${r[3]}</td><td><span class="m-chip ${r[4]}">${r[5]}</span></td></tr>`;
    }).join('');

    let totDebit = 0, totCredit = 0;
    const jHtml = d.journal.map(r => {
      const deb = r[4] ? (r[4] * cm.mult) : 0;
      const cred = r[5] ? (r[5] * cm.mult) : 0;
      totDebit += deb;
      totCredit += cred;
      return `<tr>
        <td class="mu hide-xs">${DAY_TOKENS[r[0]] || r[0]}</td>
        <td class="mono">${r[1]}</td>
        <td class="hide-xs">${r[2]}</td>
        <td>${r[3]}</td>
        <td class="n">${deb ? deb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
        <td class="n">${cred ? cred.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
      </tr>`;
    }).join('');

    const focusChart = state.sboxNav === 'Sales & Revenue' || state.sboxNav === 'Purchases & Stock';
    const focusEnt = state.sboxNav === 'Business Units' || state.sboxNav === 'Cash & Treasury';
    const focusAlerts = state.sboxNav === 'Audit Trail';
    const focusGl = state.sboxNav === 'General Ledger' || state.sboxNav === 'Paginated .RDL';

    const mTab = state.sboxMobTab || 'chart';

    mockEl.innerHTML = `
      <aside class="rail">
        <div class="brand">
          ${RAIL_MARK_SVG}
          <span style="font-family:Archivo,sans-serif;font-weight:800;letter-spacing:0.06em;font-size:15px">ISABI SYSTEMS</span>
        </div>
        <nav aria-label="Sandbox ERP Navigation">
          ${navItems.map(nm => `<button type="button" class="nav-item ${state.sboxNav === nm ? 'on' : ''}" data-sbox-nav="${nm}"><span>${nm}</span></button>`).join('')}
          <div class="grp">Governance</div>
          <button type="button" class="nav-item ${state.sboxNav === 'Business Units' ? 'on' : ''}" data-sbox-nav="Business Units"><span>Business Units</span></button>
          <button type="button" class="nav-item ${state.sboxNav === 'Audit Trail' ? 'on' : ''}" data-sbox-nav="Audit Trail"><span>Audit Trail</span></button>
        </nav>
        <div class="me">
          <span class="av">HB</span>
          <span>Executive Seat<small>${d.groupTitle}</small></span>
        </div>
      </aside>

      <div class="main">
        <header class="top">
          <div class="crumb">
            <span>${d.groupTitle} · ${state.sboxNav}</span>
            <b>${d.viewTitle}</b>
          </div>
          <div class="tools">
            <select class="pill-select" id="sbox-period-sel" aria-label="Sandbox Period">
              <option value="mtd" ${state.sboxPeriod === 'mtd' ? 'selected' : ''}>${PERIOD_MULT.mtd.label}</option>
              <option value="qtd" ${state.sboxPeriod === 'qtd' ? 'selected' : ''}>${PERIOD_MULT.qtd.label}</option>
              <option value="ytd" ${state.sboxPeriod === 'ytd' ? 'selected' : ''}>${PERIOD_MULT.ytd.label}</option>
            </select>
            <select class="pill-select" id="sbox-curr-sel" aria-label="Sandbox Currency">
              <option value="USD" ${state.sboxCurr === 'USD' ? 'selected' : ''}>USD ($)</option>
              <option value="EUR" ${state.sboxCurr === 'EUR' ? 'selected' : ''}>EUR (€)</option>
              <option value="AED" ${state.sboxCurr === 'AED' ? 'selected' : ''}>AED</option>
            </select>
            <button type="button" class="primary-mock" data-open-ai="Analyze the ${d.groupTitle} dashboard numbers and highlight key action items">
              <span>${ICONS.ai} Ask ISABI</span>
            </button>
          </div>
        </header>

        <section class="kpis">${kpisHtml}</section>

        <div class="sbox-mob-tabs" role="tablist" aria-label="Mobile Sandbox Views">
          <button type="button" class="sbox-mob-tab ${mTab === 'chart' ? 'active' : ''}" data-sbox-mobtab="chart">${ICONS.trend} Chart &amp; Entities</button>
          <button type="button" class="sbox-mob-tab ${mTab === 'ledger' ? 'active' : ''}" data-sbox-mobtab="ledger">${ICONS.ledger} General Ledger &amp; Alerts</button>
        </div>

        <section class="row2" ${mTab !== 'chart' ? 'data-mob-hide="1"' : ''}>
          <div class="panel ${focusChart ? 'panel-focus' : ''}">
            <div class="ph">
              <h3>${ICONS.pbi} Monthly Revenue Trajectory (${cm.sym} thousands)</h3>
              <div class="legend">
                <span><i class="sw-box s-1"></i>${d.seriesNames[0]}</span>
                <span><i class="sw-box s-2"></i>${d.seriesNames[1]}</span>
                <span><i class="sw-box s-3"></i>${d.seriesNames[2]}</span>
              </div>
            </div>
            <div class="chartwrap" id="sbox-chart-wrap">
              ${buildSandboxChart(d, cm.mult, cm.sym)}
              <div class="chart-tip" id="sbox-chart-tip" hidden></div>
            </div>
          </div>

          <div class="panel ${focusEnt ? 'panel-focus' : ''}">
            <div class="ph">
              <h3>${ICONS.realestate} Operating Entities &amp; Books Status</h3>
              <span style="font-size:11px;color:var(--m-steel);font-weight:600">${pm.label}</span>
            </div>
            <table class="m-grid">
              <thead>
                <tr><th>Entity / Business Unit</th><th class="n">Revenue</th><th class="n">Margin</th><th class="hide-xs">Last Sync</th><th>Books</th></tr>
              </thead>
              <tbody>${entHtml}</tbody>
            </table>
          </div>
        </section>

        <section class="row3" ${mTab !== 'ledger' ? 'data-mob-hide="1"' : ''}>
          <div class="panel ${focusAlerts ? 'panel-focus' : ''}">
            <div class="ph"><h3>${ICONS.bell} Executive Exceptions &amp; Watchdogs</h3></div>
            <ul class="att">
              ${d.alerts.map(a => `<li class="${a[0]}"><b>${a[1]}</b><span>${a[2]}</span><button type="button" class="att-act" data-sbox-act="${a[1]}">${a[3]}</button></li>`).join('')}
            </ul>
          </div>

          <div class="panel ${focusGl ? 'panel-focus' : ''}">
            <div class="ph">
              <h3>${ICONS.ledger} Audited General Ledger Stream (Double-Entry)</h3>
              <span style="font-size:11px;color:var(--m-muted)">Closed with the ISABI Double Rule</span>
            </div>
            <table class="m-grid">
              <thead>
                <tr><th class="hide-xs">Date</th><th>Voucher</th><th class="hide-xs">Business Unit</th><th>Account</th><th class="n">Debit (${cm.sym})</th><th class="n">Credit (${cm.sym})</th></tr>
              </thead>
              <tbody>
                ${jHtml}
                <tr class="total">
                  <td class="hide-xs"></td>
                  <td><b>Total</b></td>
                  <td class="hide-xs"></td>
                  <td><b>Audited Batch</b></td>
                  <td class="n">${totDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td class="n">${totCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    // Bind chart tooltip (hover + touch tap support)
    const cwrap = document.getElementById('sbox-chart-wrap');
    const tip = document.getElementById('sbox-chart-tip');
    if (cwrap && tip) {
      cwrap.querySelectorAll('.col').forEach(col => {
        const showTip = (clientX) => {
          tip.innerHTML = `<b>${col.dataset.m} · Total ${col.dataset.t}</b><span style="display:block;opacity:0.85;margin-top:2px">${col.dataset.tip}</span>`;
          tip.hidden = false;
          const r = cwrap.getBoundingClientRect();
          const relX = (clientX || (r.left + r.width / 2)) - r.left;
          const left = Math.min(Math.max(8, r.width - 230), Math.max(8, relX - 80));
          tip.style.left = left + 'px';
          tip.style.top = '10px';
        };
        col.addEventListener('mouseenter', e => showTip(e.clientX));
        col.addEventListener('mousemove', e => showTip(e.clientX));
        col.addEventListener('click', e => {
          e.stopPropagation();
          showTip(e.clientX);
        });
        col.addEventListener('mouseleave', () => { tip.hidden = true; });
      });
    }
    updateAiScopeBar();
  }

  // ---------------- ASK ISABI AI SIMULATOR ----------------
  function fmtMoney(usdVal, mult, sym, decimals = 2) {
    const v = usdVal * mult;
    const formatted = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return sym === 'USD' ? ('$' + formatted) : (formatted + ' ' + sym);
  }

  function updateAiScopeBar() {
    const indLabel = SBOX_LABELS[state.sboxInd] || 'Group Holding';
    const currLabel = (CURR_MULT[state.sboxCurr] || CURR_MULT.USD).sym;
    const perShort = String(state.sboxPeriod || 'mtd').toUpperCase();
    const txt = `${indLabel} · ${currLabel} · ${perShort}`;
    const el1 = document.getElementById('ai-inline-scope');
    const el2 = document.getElementById('ai-drawer-scope');
    if (el1) el1.textContent = txt;
    if (el2) el2.textContent = txt;
  }

  function buildAlertDrilldown(alertTitle) {
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const m = cm.mult;
    const s = cm.sym;
    const d0 = DAY_TOKENS.D0;
    const d1 = DAY_TOKENS.D1;

    const map = {
      '7 trade receivables past 60 days': {
        title: 'Executive Action Plan · Aged Receivables (> 60d)',
        answer: `Across the 6 operating Business Units, <b>7 invoices totaling ${fmtMoney(42300, m, s)}</b> are past the 60-day credit window. Printable Statements of Account (.rdl) and WhatsApp collection links are staged for dispatch.`,
        headers: ['Customer / Entity', 'Voucher', 'Age', 'Balance (' + s + ')'],
        rows: [
          ['Apex Contracting · Concrete Plant', 'TK-2026-3104', '68 Days', fmtMoney(16400, m, s)],
          ['Levant Logistics · Heavy Equipment Div', 'SI-TRK-0298', '64 Days', fmtMoney(14800, m, s)],
          ['Metro Transit · Spare Parts Depot', 'SI-PRT-1411', '62 Days', fmtMoney(6250, m, s)],
          ['4 Smaller Accounts (Auto & Real Estate)', 'Multiple', '61-74 Days', fmtMoney(4850, m, s)]
        ],
        total: ['Total Audited Overdue (> 60d)', fmtMoney(42300, m, s)],
        citation: 'Source: Dataverse Receivables Ledger & Aging RDL · Credit hold active at 85%',
        followUps: ['Show today\'s journal vouchers', 'How does dual-entry reconciliation work with our existing accountant software?']
      },
      'Statutory vs Operational reconciliation check': {
        title: 'Statutory vs Operational Trial Balance Audit',
        answer: `The automated reconciliation bridge compared all operational postings across the 6 Business Units against the statutory accounting trial balance. Unallocated variance across all classes (1 to 7) stands at <b>${fmtMoney(0, m, s)}</b>.`,
        headers: ['Ledger Class', 'Operational Balance', 'Statutory Book', 'Variance'],
        rows: [
          ['Class 4 · Third-Party AR / AP', fmtMoney(312400, m, s), fmtMoney(312400, m, s), fmtMoney(0, m, s)],
          ['Class 5 · Treasury, Vault & Banks', fmtMoney(418500, m, s), fmtMoney(418500, m, s), fmtMoney(0, m, s)],
          ['Class 6 · Purchases & Operating Cost', fmtMoney(491170, m, s), fmtMoney(491170, m, s), fmtMoney(0, m, s)],
          ['Class 7 · Consolidated Revenue (TTC)', fmtMoney(671000, m, s), fmtMoney(671000, m, s), fmtMoney(0, m, s)]
        ],
        total: ['Net Unexplained Variance', fmtMoney(0, m, s)],
        citation: 'Source: Statutory Reconciliation Bridge · Verified across 6 Business Units',
        followUps: ['Does our accountant have to change software?', 'Analyze the Group Holding dashboard numbers']
      },
      '2 supplier purchase orders above approval threshold': {
        title: 'Procurement Stamp Queue · Principal Approval',
        answer: `Two supplier purchase orders exceed the Business Unit supervisor threshold and are awaiting executive digital stamp before stock intake and payable posting.`,
        headers: ['PO Reference', 'Business Unit & Vendor', 'GL Account', 'Amount (' + s + ')'],
        rows: [
          ['PO-2026-0914', 'Concrete Plant · Holcim Bulk Cement (300 MT)', '60110 Raw Materials', fmtMoney(24600, m, s)],
          ['PO-2026-0918', 'Flagship Resort · Premium Beverage Import', '60210 F&B Provisions', fmtMoney(11850, m, s)]
        ],
        total: ['Total Awaiting Executive Stamp', fmtMoney(36450, m, s)],
        citation: 'Source: Power Automate Approval Flow & Dataverse Procurement Queue',
        followUps: ['How does role-based security work?', 'Show the Concrete & Manufacturing blueprint']
      },
      'Nightly automation fleet completed': {
        title: 'Nightly Cloud Automation Fleet Log',
        answer: `All scheduled Power Automate and Fabric pipelines completed on time with zero failed actions and verified row counts.`,
        headers: ['Job / Pipeline', 'Run Time', 'Target Store', 'Status'],
        rows: [
          ['Ops - Nightly Export to SharePoint', '02:00', '111 CSVs + Manifest Verified', 'Succeeded'],
          ['Ops - Attendance Kiosk Derivation', '03:00', 'Punches Paired to HR Shifts', 'Succeeded'],
          ['Ops - Re-root Universal Dimensions', '03:10', 'Shared Master Tables Audited', 'Succeeded'],
          ['Fabric XMLA Semantic Model Refresh', '07:00', 'Operations & Financial Models', 'Succeeded']
        ],
        total: ['Total Automated Fleet Health', '100% Green (0 Errors)'],
        citation: 'Source: Power Automate Run History & SharePoint DR Sentinel',
        followUps: ['Who owns the system and the data?', 'How do the offline PWAs sync to Dataverse?']
      },
      'Offline POS Tills synchronized (100%)': {
        title: 'Companion POS Till Close Audit',
        answer: `All 6 offline-capable cashier tills across the resort properties closed their shifts and synced 1,420 receipts into the Dataverse Revenue Ledger with zero cash/card variance.`,
        headers: ['Outlet Till', 'Receipts', 'Payment Split', 'Synced TTC (' + s + ')'],
        rows: [
          ['Main Gate & Cabana Desk (2 Tills)', '412', 'Cash + Whish + Card', fmtMoney(6420, m, s)],
          ['Beach Restaurant & Sunset Bar (3 Tills)', '846', 'Cash + POS Terminal', fmtMoney(8910, m, s)],
          ['VIP Lounge & Pool Bar (1 Till)', '162', 'Room Charge + Card', fmtMoney(3140, m, s)]
        ],
        total: ['Total Audited Daily POS Revenue', fmtMoney(18470, m, s)],
        citation: 'Source: IndexedDB POS Queue to Dataverse bhf_revenue · Till closes matched',
        followUps: ['Tell me about the Offline POS Till PWA', 'Analyze the Hospitality & Resort Operations dashboard numbers']
      },
      'Beverage stock variance check': {
        title: 'F&B Bar Inventory & Theoretical Yield Check',
        answer: `Sunset Bay Club bar stock count is scheduled for 23:00 shift close. Comparing POS recipe depletion against physical bottle stock flags 2 items for supervisor spot-check.`,
        headers: ['SKU / Category', 'Theoretical Stock', 'Bar Count', 'Variance (' + s + ')'],
        rows: [
          ['Premium Spirits (75cl Bottles)', '48.0 Units', '47.5 Units', fmtMoney(-42, m, s)],
          ['Imported Draft & Bottled Beer', '320 Units', '320 Units', fmtMoney(0, m, s)],
          ['Fresh Mixers & Soft Drinks', '540 Units', '538 Units', fmtMoney(-8, m, s)],
          ['Cellar & Banquet Wine Reserve', '94 Units', '94 Units', fmtMoney(0, m, s)]
        ],
        total: ['Net F&B Stock Variance (Within 0.3% Cap)', fmtMoney(-50, m, s)],
        citation: 'Source: Hospitality Stock Take Ledger & Outlet Gross Margin Model',
        followUps: ['How does ISABI customize the ERP for Hospitality & Resorts?', 'Show Hospitality supplier payables due']
      },
      '4 supplier invoices due for settlement': {
        title: 'Hospitality Supplier Payables & Partner Split Run',
        answer: `Four approved F&B and operating vendor invoices are scheduled for Friday settlement. Partner profit-split agreements are automatically applied to the property SOA.`,
        headers: ['Supplier Account', 'Voucher Ref', 'Property BU', 'Payable (' + s + ')'],
        rows: [
          ['Mediterranean Beverage Co.', 'PI-2026-0392', 'Sunset Bay Club', fmtMoney(6480, m, s)],
          ['Prime Fresh Foodservice', 'PI-2026-0395', 'Flagship Beach Resort', fmtMoney(5920, m, s)],
          ['Coastal Linen & Laundry', 'PI-2026-0401', 'Boutique Hotel Suites', fmtMoney(3400, m, s)],
          ['Sound & Lighting Production', 'PI-2026-0404', 'Palms Waterfront', fmtMoney(2400, m, s)]
        ],
        total: ['Total Friday Payment Run', fmtMoney(18200, m, s)],
        citation: 'Source: Dataverse Supplier Payables & Partner Agreement Split Engine',
        followUps: ['Show Hospitality journal entries', 'How do printable Statements of Account work?']
      },
      'Biometric Attendance Kiosk synced': {
        title: 'Biometric Gate Kiosk · Daily Shift Roster Audit',
        answer: `The wall-mounted tablet kiosks verified 118 staff punches today using face recognition + PIN and derived shift hours, lateness, and overtime into the ERP Attendance table.`,
        headers: ['Property / Department', 'Staff Present', 'Overtime Logged', 'Verification'],
        rows: [
          ['Flagship Resort · Kitchen & F&B', '54 Staff', '6.5 hrs', '100% Face + PIN'],
          ['Sunset Bay · Lifeguards & Cabanas', '32 Staff', '2.0 hrs', '100% Face + PIN'],
          ['Palms Waterfront · Operations', '19 Staff', '0.0 hrs', '100% Face + PIN'],
          ['Boutique Suites · Front Desk & HK', '13 Staff', '1.5 hrs', '100% Face + PIN']
        ],
        total: ['Total Verified Shifts Synced', '118 Shifts (0 Missing Punches)'],
        citation: 'Source: Attendance Kiosk PWA via Ops - Attendance Kiosk API Flow',
        followUps: ['Tell me about the Biometric Attendance Kiosk PWA', 'What hardware is needed for the kiosks?']
      },
      '5 fleet customer installments past 60 days': {
        title: 'Dealership Fleet Receivables & SOA Dispatch',
        answer: `Five fleet and commercial equipment buyers have installment notes past 60 days totaling <b>${fmtMoney(31400, m, s)}</b>. One-click PDF Statements of Account (.rdl) are ready for WhatsApp and email delivery.`,
        headers: ['Dealer / Fleet Account', 'Invoice / VIN Ref', 'Days Past Due', 'Overdue (' + s + ')'],
        rows: [
          ['Levant Heavy Haulage', 'SI-TRK-0298 (VIN #8792)', '66 Days', fmtMoney(14800, m, s)],
          ['Metro Transit Fleet', 'SI-PRT-1411 (Parts Account)', '63 Days', fmtMoney(6250, m, s)],
          ['Bekaa Quarry Transport', 'SI-TRK-0304 (VIN #8805)', '61 Days', fmtMoney(5400, m, s)],
          ['2 Regional Workshop Accounts', 'SI-PRT-1420 / 1429', '61-65 Days', fmtMoney(4950, m, s)]
        ],
        total: ['Total Dealership Overdue (> 60d)', fmtMoney(31400, m, s)],
        citation: 'Source: Trading Operations Customer Allocation & Aged Receivables RDL',
        followUps: ['Show the Auto & Equipment Trading blueprint', 'How are VIN landed costs calculated?']
      },
      '3 heavy equipment units cleared customs today': {
        title: 'VIN Customs Clearance & Landed Cost Capitalization',
        answer: `Three heavy equipment units moved from <b>Bonded Customs</b> to <b>Showroom Duty-Paid Stock</b> on ${d0}. FOB cost, ocean freight, marine insurance, and customs duty are capitalized per VIN.`,
        headers: ['Chassis VIN', 'Model & Spec', 'Customs + Freight', 'Total Landed (' + s + ')'],
        rows: [
          ['VIN #LZGJL484X20268841', '6x4 Tractor Head (430 HP)', fmtMoney(3800, m, s), fmtMoney(54200, m, s)],
          ['VIN #LZGJL484X20268842', '6x4 Tractor Head (430 HP)', fmtMoney(3800, m, s), fmtMoney(54200, m, s)],
          ['VIN #LZGJL484X20268845', '8x4 Tipper Chassis (400 HP)', fmtMoney(3800, m, s), fmtMoney(58600, m, s)]
        ],
        total: ['Total Capitalized Showroom Value (3 Units)', fmtMoney(167000, m, s)],
        citation: 'Source: Dataverse Vehicle VIN Registry & Landed Cost Sheet (LC-2026-0118)',
        followUps: ['Analyze the Automotive & Heavy Equipment Trading dashboard', 'Show Trading journal entries']
      },
      'Fast-moving brake & filter SKUs below safety stock': {
        title: 'Spare Parts Depot · Reorder Batch Calculation',
        answer: `The central depot stock watchdog flagged 14 fast-moving service SKUs below their 30-day safety threshold based on workshop and wholesale consumption velocity.`,
        headers: ['Part Category', 'SKUs Flagged', 'On Hand vs Min', 'Reorder Cost (' + s + ')'],
        rows: [
          ['Heavy Duty Air & Oil Filter Kits', '6 SKUs', '18 vs 45 Min', fmtMoney(4200, m, s)],
          ['Pneumatic Brake Pads & Linings', '5 SKUs', '12 vs 30 Min', fmtMoney(5800, m, s)],
          ['Clutch Plates & Flywheel Assemblies', '3 SKUs', '4 vs 12 Min', fmtMoney(6400, m, s)]
        ],
        total: ['Suggested Supplier Purchase Order Batch', fmtMoney(16400, m, s)],
        citation: 'Source: Trading Multi-Warehouse Stock Balance & Reorder Engine',
        followUps: ['How does ISABI customize the ERP for Auto & Equipment Trading?', 'Configure scope and pricing for Trading']
      },
      'Monthly statutory reconciliation verified': {
        title: 'Trading Operations · Statutory Trial Balance Match',
        answer: `Operational sales invoices, customs landed cost sheets, spare parts stock, and customer receipts match the statutory accounting books to the cent.`,
        headers: ['Reconciled Domain', 'Operational Ledger', 'Statutory Book', 'Variance'],
        rows: [
          ['MTD Vehicle & Parts Sales (TTC)', fmtMoney(349000, m, s), fmtMoney(349000, m, s), fmtMoney(0, m, s)],
          ['Bonded + Showroom VIN Valuation', fmtMoney(1240000, m, s), fmtMoney(1240000, m, s), fmtMoney(0, m, s)],
          ['Dealer Installment Collections', fmtMoney(61920, m, s), fmtMoney(61920, m, s), fmtMoney(0, m, s)],
          ['Trade Receivables Past 60d', fmtMoney(31400, m, s), fmtMoney(31400, m, s), fmtMoney(0, m, s)]
        ],
        total: ['Parallel-Run Audit Variance', fmtMoney(0, m, s)],
        citation: 'Source: Trading Parallel-Run Reconciliation RDL · 100% Matched',
        followUps: ['How does dual-entry reconciliation work with our existing accountant software?', 'Show Trading journal entries']
      },
      '142 batch plant delivery tickets verified today': {
        title: 'Batch Plant Dispatch & Ticket Book Verification',
        answer: `All 142 ready-mix concrete tickets poured on ${d0} reconciled against batch plant load cells, signed site delivery notes, and sequential ticket book gap checks.`,
        headers: ['Mix Grade / Service', 'Tickets', 'Volume Batched', 'Billing (' + s + ')'],
        rows: [
          ['C35 Structural Ready-Mix Concrete', '84 Tickets', '640 m³', fmtMoney(54400, m, s)],
          ['C30 Foundation & Slab Mix', '46 Tickets', '380 m³', fmtMoney(29640, m, s)],
          ['Mobile Boom Pump Service (36m / 42m)', '12 Dispatches', '1,020 m³ Pumped', fmtMoney(4800, m, s)]
        ],
        total: ['Total Audited Daily Plant Production', fmtMoney(88840, m, s)],
        citation: 'Source: Manufacturing Sales Ticket Ledger & Ticket Books Gap Check',
        followUps: ['Show the Concrete & Manufacturing blueprint', 'How do form rules enforce contractor credit limits?']
      },
      '3 contractor accounts reached 85% credit limit': {
        title: 'Contractor Credit Limit Gate · Dispatch Control',
        answer: `Form validation rules on the Sales Ticket screen automatically block new mixer dispatch when a contractor exceeds 85% of their approved credit cap without a supervisor override or receipt allocation.`,
        headers: ['Contractor Account', 'Credit Limit', 'Current Exposure', 'Utilization'],
        rows: [
          ['Apex Contracting · Tower Site B', fmtMoney(50000, m, s), fmtMoney(46400, m, s), '92.8% (Hold)'],
          ['Horizon Civil Works · Highway Lot', fmtMoney(40000, m, s), fmtMoney(35200, m, s), '88.0% (Gate)'],
          ['Cedars Precast & Foundations', fmtMoney(30000, m, s), fmtMoney(25800, m, s), '86.0% (Gate)']
        ],
        total: ['Total Protected Credit Exposure', fmtMoney(107400, m, s)],
        citation: 'Source: Dataverse Customer Credit Terms & Sales Ticket Form Gate JS',
        followUps: ['Analyze the Manufacturing, Concrete & Fleet dashboard', 'How does customer receipt allocation work?']
      },
      'Silo #2 Portland Cement reorder trigger': {
        title: 'Bulk Cement Silo Telemetry & Yield Audit',
        answer: `Silo #2 stands at <b>115 MT</b> after today's pours, crossing the 120 MT reorder threshold. Theoretical recipe consumption vs actual weighbridge intake shows a <b>0.31% variance</b> (well inside the 0.40% tolerance).`,
        headers: ['Storage Unit', 'Current Level', 'Daily Drawdown', 'Next Intake'],
        rows: [
          ['Silo #1 · Sulphate Resistant Cement', '185 MT', '42 MT / day', 'Sufficient (4.4d)'],
          ['Silo #2 · Ordinary Portland Cement', '115 MT', '68 MT / day', 'Tanker 07:00 (+90 MT)'],
          ['Silo #3 · GGBS & Fly Ash Blend', '120 MT', '19 MT / day', 'Sufficient (6.3d)'],
          ['Admixture & Plasticizer IBC Tanks', '6,400 L', '380 L / day', 'Sufficient (16d)']
        ],
        total: ['Total Bulk Cement On Hand', '420 MT (Silo #2 Delivery Confirmed)'],
        citation: 'Source: Manufacturing Raw Material Silo Ledger & Yield Report',
        followUps: ['Show Manufacturing journal entries', 'Configure scope and pricing for Concrete & Manufacturing']
      },
      'Inter-entity transport charges auto-reconciled': {
        title: 'Inter-Entity Billing · Plant to Construction to Fleet',
        answer: `Transit mixer trip fees and pump boom charges operated by the Heavy Transport entity are automatically mirrored as cost of sales in the Batch Plant entity, eliminating manual intercompany re-keying.`,
        headers: ['Intercompany Leg', 'Operational Driver', 'Elimination Account', 'Matched (' + s + ')'],
        rows: [
          ['Fleet BU to Batch Plant BU', '142 Mixer Trips + 12 Pump Shifts', '18100 Intercompany Clear', fmtMoney(14680, m, s)],
          ['Batch Plant BU to Construction BU', '210 m³ Internal Site Supply', '18100 Intercompany Clear', fmtMoney(16800, m, s)],
          ['Central Workshop to Fleet BU', 'Diesel & Preventive Maintenance', '61300 Fleet Diesel Alloc.', fmtMoney(4320, m, s)]
        ],
        total: ['Unreconciled Inter-Entity Difference', fmtMoney(0, m, s)],
        citation: 'Source: Multi-Business Unit Intercompany Ledger & Consolidated P&L',
        followUps: ['How does Multi-Business Unit isolation work?', 'Analyze the Multi-Entity Enterprise Group dashboard']
      },
      '4 commercial leases renewing in 45 days': {
        title: 'Commercial Lease Renewal & CPI Escalation Schedule',
        answer: `Four retail and office leases at Boulevard Commercial Center reach anniversary within 45 days. Renewal addenda with the contractual <b>5% CPI escalation</b> are staged for tenant signature.`,
        headers: ['Unit & Tenant', 'Expiry Date', 'Current Annual', 'Renewed (+5% ' + s + ')'],
        rows: [
          ['Unit G-04 · Anchor Pharmacy', '30 Nov', fmtMoney(48000, m, s), fmtMoney(50400, m, s)],
          ['Unit G-09 · Specialty Roastery', '05 Dec', fmtMoney(32000, m, s), fmtMoney(33600, m, s)],
          ['Floor 3-A · Maritime Law Partners', '12 Dec', fmtMoney(42000, m, s), fmtMoney(44100, m, s)],
          ['Floor 4-B · Engineering Studio', '15 Dec', fmtMoney(28000, m, s), fmtMoney(29400, m, s)]
        ],
        total: ['Renewed Annualized Rent Roll (4 Units)', fmtMoney(157500, m, s)],
        citation: 'Source: Real Estate Lease Registry & Automated 45-Day Escalation Flow',
        followUps: ['Show the Real Estate & Property Portfolio blueprint', 'Analyze the Real Estate & Property Operations dashboard']
      },
      '2 tenant checks due for bank presentation': {
        title: 'Treasury Post-Dated Check (PDC) Presentation Queue',
        answer: `Two quarterly tenant checks held in the Escrow Vault mature on Thursday morning and are queued for bank clearing and automatic lease receipt allocation.`,
        headers: ['Tenant & Property', 'Check Ref', 'Maturity', 'Amount (' + s + ')'],
        rows: [
          ['Anchor Retail Group · Boulevard Center', 'CHQ-884120', 'Thursday 09:00', fmtMoney(24500, m, s)],
          ['Penthouse Suite 12A · Harbor View', 'CHQ-551904', 'Thursday 09:00', fmtMoney(18000, m, s)]
        ],
        total: ['Total PDC Clearing Batch', fmtMoney(42500, m, s)],
        citation: 'Source: Real Estate Customer Receipt & PDC Maturity Calendar',
        followUps: ['Show Real Estate journal entries', 'How are landlord co-owner distributions calculated?']
      },
      'Tower HVAC preventive maintenance completed': {
        title: 'Property Work Order & Service-Charge Attribution',
        answer: `Work Order <b>WO-2026-0088</b> (Harbor View Residences chiller & generator overhaul) is signed off with vendor warranty attached in SharePoint and allocated to the building OpEx service-charge pool.`,
        headers: ['Work Order Component', 'Vendor', 'Classification', 'Cost (' + s + ')'],
        rows: [
          ['Rooftop Chiller Compressor Overhaul', 'ClimateTech MEP', 'OpEx · Service Charge', fmtMoney(2150, m, s)],
          ['Standby Generator Load-Bank Service', 'PowerGrid Lebanon', 'OpEx · Service Charge', fmtMoney(950, m, s)],
          ['Elevator Safety Brake Certification', 'LiftCorp Inspection', 'OpEx · Statutory', fmtMoney(500, m, s)]
        ],
        total: ['Total Audited Work Order (WO-2026-0088)', fmtMoney(3600, m, s)],
        citation: 'Source: Real Estate Maintenance Work Orders & NOI Yield Model',
        followUps: ['Show the Real Estate & Property Portfolio blueprint', 'Configure scope and pricing for Real Estate']
      },
      'Quarterly landlord distribution statement ready': {
        title: 'Co-Owner Net Operating Income (NOI) Distribution',
        answer: `Net Operating Income after maintenance, municipal taxes, and reserve retention is computed per property and split across co-owners according to the universal Partner Ownership registry.`,
        headers: ['Co-Owner / Partner Share', 'Equity Stake', 'Gross Share', 'Net Payout (' + s + ')'],
        rows: [
          ['Principal Holding Partner (55%)', '55.0%', fmtMoney(85800, m, s), fmtMoney(67450, m, s)],
          ['Co-Investor Partner A (30%)', '30.0%', fmtMoney(46800, m, s), fmtMoney(36790, m, s)],
          ['Co-Investor Partner B (15%)', '15.0%', fmtMoney(23400, m, s), fmtMoney(18395, m, s)]
        ],
        total: ['Total Quarterly Net Distribution (78.6% NOI)', fmtMoney(122635, m, s)],
        citation: 'Source: Real Estate Ownership Registry (bhf_partner) & Partner SOA RDL',
        followUps: ['Analyze the Real Estate & Property Operations dashboard', 'How do printable Statements of Account work?']
      },
      '19 corporate renewals due next month pre-quoted': {
        title: 'Insurance Brokerage · 90/60/30-Day Renewal Pipeline',
        answer: `All 19 corporate group medical, fleet, and property policies expiring next month have comparative carrier quotes generated and WhatsApp renewal summaries queued for account executives.`,
        headers: ['Line of Business', 'Policies Expiring', 'Expiring GWP', 'Quoted Renewal (' + s + ')'],
        rows: [
          ['Corporate Group Medical & Life', '7 Policies', fmtMoney(94000, m, s), fmtMoney(98500, m, s)],
          ['Commercial Motor & Equipment Fleets', '8 Policies', fmtMoney(46200, m, s), fmtMoney(47800, m, s)],
          ['Marine Cargo & All-Risk Property', '4 Policies', fmtMoney(31800, m, s), fmtMoney(32400, m, s)]
        ],
        total: ['Total Pre-Quoted Renewal Book (94.2% Retention)', fmtMoney(178700, m, s)],
        citation: 'Source: Insurance Operations Renewal Radar & Policy Registry',
        followUps: ['Show the Insurance Brokerage blueprint', 'Analyze the Insurance Brokerage Operations dashboard']
      },
      '6 policy installments past 30-day grace window': {
        title: 'Uncollected Premium Installments (> 30d Grace)',
        answer: `Six corporate policy endorsements and installment notes totaling <b>${fmtMoney(14600, m, s)}</b> passed the 30-day carrier grace window. Client SOA PDFs are staged for immediate collection.`,
        headers: ['Policyholder', 'Endorsement Ref', 'Days Past Grace', 'Premium Due (' + s + ')'],
        rows: [
          ['Phoenicia Freight · Marine Open Cover', 'END-MAR-0412', '38 Days', fmtMoney(5400, m, s)],
          ['MedStar Clinics · Group Medical Add-On', 'END-MED-0889', '35 Days', fmtMoney(4100, m, s)],
          ['4 Commercial Fleet Endorsements', 'END-MOT-1102..1109', '31-34 Days', fmtMoney(5100, m, s)]
        ],
        total: ['Total Premium Past Grace Window', fmtMoney(14600, m, s)],
        citation: 'Source: Insurance Premium Invoice Aging & Client SOA RDL',
        followUps: ['How are carrier commissions and net payables calculated?', 'Show Insurance journal entries']
      },
      '2 motor claims awaiting surveyor repair approval': {
        title: 'Claims Intake & Surveyor Approval Tracker',
        answer: `Two motor fleet accident files have garage repair estimates and accident photos uploaded in their SharePoint claim folders and await underwriter surveyor stamp.`,
        headers: ['Claim File', 'Policy & Vehicle', 'Workshop Estimate', 'Status'],
        rows: [
          ['CLM-2026-0194', 'POL-MOT-2210 · Delivery Van #14', fmtMoney(2850, m, s), 'Surveyor Review Today'],
          ['CLM-2026-0198', 'POL-MOT-2405 · Executive SUV', fmtMoney(1920, m, s), 'Parts Quote Attached']
        ],
        total: ['Total Active Reserve Under Survey', fmtMoney(4770, m, s)],
        citation: 'Source: Insurance Claims Registry & SharePoint Document Pipeline',
        followUps: ['Show the Insurance Brokerage blueprint', 'Configure scope and pricing for Insurance Brokerage']
      },
      'Monthly carrier net payable reconciled': {
        title: 'Carrier Settlement Bordereaux & Commission Split',
        answer: `Gross written premium, brokerage commission (18.4% blended yield), and sub-producer splits across all 8 underwriting carriers are reconciled to the cent.`,
        headers: ['Settlement Component', 'Accounting Class', 'Share', 'Amount (' + s + ')'],
        rows: [
          ['Gross Written Premium (GWP)', '4112 Policyholder Receivable', '100.0%', fmtMoney(187000, m, s)],
          ['Brokerage Commission Earned', '70800 Commission Revenue', '18.4%', fmtMoney(34408, m, s)],
          ['Net Payable to Underwriting Carriers', '4017 Insurer Payable Trust', '81.6%', fmtMoney(152592, m, s)]
        ],
        total: ['Unreconciled Bordereaux Variance', fmtMoney(0, m, s)],
        citation: 'Source: Insurance Carrier Bordereaux RDL & Trust Account Ledger',
        followUps: ['Analyze the Insurance Brokerage Operations dashboard', 'Show Insurance journal entries']
      }
    };

    if (map[alertTitle]) return map[alertTitle];
    for (const k of Object.keys(map)) {
      if (alertTitle.toLowerCase().includes(k.toLowerCase())) return map[alertTitle] || map[k];
    }
    return null;
  }

  function buildDashboardBriefing(indKey, qText) {
    const key = SANDBOX_DATA[indKey] ? indKey : (state.sboxInd || 'holding');
    const d = SANDBOX_DATA[key];
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const totalMult = cm.mult * pm.mult;
    const sym = cm.sym;

    const topEnt = d.entities[0];
    const k0 = d.kpis[0];
    const k1 = d.kpis[1];
    const k2 = d.kpis[2];
    const k3 = d.kpis[3];
    const revStr = fmtMoney(k0.v * 1000, totalMult, sym, 0);
    const cashStr = fmtMoney(k2.v * 1000, totalMult, sym, 0);
    const arStr = fmtMoney(k3.v * 1000, totalMult, sym, 0);

    const rows = d.entities.map(e => [
      e[0],
      fmtMoney(e[1] * 1000, totalMult, sym, 0),
      e[2],
      e[5] + ' (' + e[3] + ')'
    ]);

    return {
      q: qText,
      title: `${d.groupTitle} · Executive Briefing (${pm.label})`,
      answer: `Live analysis for <b>${d.groupTitle}</b> in <b>${sym}</b> (${pm.label}): ${k0.k} stands at <b>${revStr}</b> (${k0.d}) with <b>${k1.v}${k1.unit}</b> ${k1.k.toLowerCase()}. Liquid position (${k2.k}) is <b>${cashStr}</b>, while ${k3.k} is <b>${arStr}</b> (${k3.d}). Top contributor is <b>${topEnt[0]}</b> at <b>${topEnt[2]}</b> margin.`,
      headers: ['Operating Entity / BU', `Revenue (${sym})`, 'Margin', 'Books & Sync'],
      rows: rows,
      total: [`Consolidated ${k0.k} (${pm.label})`, revStr],
      citation: `Source: Live Sandbox (${d.groupTitle} · ${sym} · ${pm.label}) · Priority Action: ${d.alerts[0][1]}`,
      actionInd: key !== state.sboxInd ? key : null,
      followUps: [
        'Provide an executive action plan for: ' + d.alerts[0][1],
        'Show the audited journal entries for ' + d.groupTitle,
        'What would a complete multi-branch system cost and include?'
      ]
    };
  }

  function buildJournalAudit(indKey, qText) {
    const key = SANDBOX_DATA[indKey] ? indKey : (state.sboxInd || 'holding');
    const d = SANDBOX_DATA[key];
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const m = cm.mult;
    const sym = cm.sym;

    let totDeb = 0, totCred = 0;
    const rows = d.journal.map(r => {
      const deb = (r[4] || 0) * m;
      const cred = (r[5] || 0) * m;
      totDeb += deb;
      totCred += cred;
      const amtStr = deb > 0
        ? ('Dr ' + fmtMoney(r[4], m, sym))
        : ('Cr ' + fmtMoney(r[5], m, sym));
      return [
        `${DAY_TOKENS[r[0]] || r[0]} · ${r[1]}`,
        r[2],
        r[3],
        amtStr
      ];
    });

    return {
      q: qText,
      title: `${d.groupTitle} · Double-Entry General Ledger Stream`,
      answer: `Every operational transaction in <b>${d.groupTitle}</b> stamps its Lebanese / International Chart of Accounts code (Classes 1 to 7) automatically from the dimension row. Below is the live audited voucher batch in <b>${sym}</b>:`,
      headers: ['Date & Voucher', 'Business Unit', 'GL Account', `Posting (${sym})`],
      rows: rows,
      total: ['Balanced Double-Rule Batch Total', `Dr ${fmtMoney(totDeb / m, m, sym)} = Cr ${fmtMoney(totCred / m, m, sym)}`],
      citation: `Source: Dataverse General Ledger & SOA Journal Specification · Column-Level GL Security Active`,
      followUps: [
        'Analyze the ' + d.groupTitle + ' dashboard numbers',
        'How does dual-entry reconciliation work with our existing accountant software?',
        'How does Ask ISABI treat confidential figures?'
      ]
    };
  }

  function buildBlueprintResponse(indObj, qText) {
    const sbox = SANDBOX_DATA[indObj.sandboxKey] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const rev = fmtMoney(sbox.kpis[0].v * 1000, cm.mult * pm.mult, cm.sym, 0);

    return {
      q: qText,
      title: `${indObj.badge}`,
      answer: `${indObj.lead} In the live sandbox (${pm.label}), <b>${sbox.groupTitle}</b> tracks <b>${rev}</b> across its operating units with automated workflows and printable statements.`,
      headers: ['Architecture Layer', 'Custom Engineering Specification', 'Production Output'],
      rows: [
        ['01. Custom Modules', indObj.modules[0] + ' + ' + indObj.modules[1], indObj.metrics[0][1]],
        ['02. Operational Control', indObj.modules[2] + ' + ' + indObj.modules[3], indObj.metrics[1][1]],
        ['03. Cloud Automation', indObj.workflows[0], indObj.metrics[2][1]],
        ['04. BI & Statements', indObj.reports[0] + ' & ' + indObj.reports[1], '100% Reconciled']
      ],
      total: ['Typical Turnkey Go-Live Window', '1 to 2 Weeks (Fixed Scope)'],
      citation: `Source: ISABI Production Blueprint (${indObj.name}) · Microsoft Dataverse + Power BI`,
      actionInd: indObj.sandboxKey,
      actionCfg: indObj.cfgName,
      followUps: [
        'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
        'Show the audited journal entries for ' + sbox.groupTitle,
        'What would a complete multi-branch system cost and include?'
      ]
    };
  }

  function detectIndustryFromQuery(low) {
    if (low.includes('pos') || low.includes('till') || low.includes('cashier') || low.includes('thermal') || low.includes('rawbt') || low.includes('receipt print')) {
      return INDUSTRIES.find(x => x.id === 'pos');
    }
    if (low.includes('attendance') || low.includes('kiosk') || low.includes('biometric') || low.includes('face') || low.includes('punch')) {
      return INDUSTRIES.find(x => x.id === 'attendance');
    }
    if (low.includes('hospitality') || low.includes('resort') || low.includes('hotel') || low.includes('beach') || low.includes('cabana') || low.includes('f&b') || low.includes('restaurant')) {
      return INDUSTRIES.find(x => x.id === 'hospitality');
    }
    if (low.includes('trading') || low.includes('auto') || low.includes('truck') || low.includes('equipment') || low.includes('vin') || low.includes('chassis') || low.includes('dealer') || low.includes('customs') || low.includes('spare part')) {
      return INDUSTRIES.find(x => x.id === 'trading');
    }
    if (low.includes('manufactur') || low.includes('concrete') || low.includes('batch') || low.includes('cement') || low.includes('silo') || low.includes('mixer') || low.includes('pump') || low.includes('precast')) {
      return INDUSTRIES.find(x => x.id === 'manufacturing');
    }
    if (low.includes('real estate') || low.includes('realestate') || low.includes('property') || low.includes('lease') || low.includes('tenant') || low.includes('rent') || low.includes('pdc') || low.includes('landlord') || low.includes('noi')) {
      return INDUSTRIES.find(x => x.id === 'realestate');
    }
    if (low.includes('insur') || low.includes('broker') || low.includes('policy') || low.includes('policies') || low.includes('bordereau') || low.includes('underwrit') || low.includes('claim') || low.includes('endorsement')) {
      return INDUSTRIES.find(x => x.id === 'insurance');
    }
    if (low.includes('holding') || low.includes('family office') || low.includes('multi-entity') || low.includes('intercompany') || low.includes('group overview')) {
      return INDUSTRIES.find(x => x.id === 'holding');
    }
    return null;
  }

  function detectQueryLanguage(cleanQ) {
    if (/[\u0600-\u06FF]/.test(cleanQ)) return 'ar';
    const low = cleanQ.toLowerCase();
    if (/\b(bonjour|salut|bonsoir|comment\s+ca\s+va|comment\s+ça\s+va|comment\s+allez|combien|coute|coûte|prix|merci|comptabilit|entreprise|logiciel|système|systeme|société|societe|pouvez-vous|nous\s+avons|est-ce\s+que)\b/i.test(low)) {
      return 'fr';
    }
    return 'en';
  }

  function resolveAskIsabi(qText) {
    const cleanQ = String(qText || '').trim();
    const low = cleanQ.toLowerCase();
    const lang = detectQueryLanguage(cleanQ);
    const sbox = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const cfg = state.lastCfgSummary || {
      industry: state.cfgInd,
      scale: state.cfgScaleLabel,
      modules: ['Core Dataverse ERP & Ledger', 'Power BI Executive Dashboards', 'Printable .RDL Statements & SOA', 'Ask ISABI Native AI Assistant'],
      range: '$12,300 to $15,000',
      weeks: '1 to 2 Weeks'
    };

    // 0a-AR. Arabic language handler (two-bubble natural human conversation)
    if (lang === 'ar') {
      if (/(مرحبا|أهلا|اهلا|السلام|صباح|مساء|كيف\s*حالك|كيفك|شو\s*الأخبار|شو\s*الاخبار|شلونك|اخبارك)/.test(cleanQ)) {
        return {
          q: cleanQ,
          lang: 'ar',
          conversational: true,
          title: 'مرحباً بك · الذكاء التشغيلي والمالي لنظام ISABI',
          answer: `أهلاً بك! أنا بخير، شكراً لسؤالك. أتمنى أن يكون يومك موفقاً.`,
          promptText: `هل تبحث عن نظام مخصص لشركتك، أم تود الاطلاع على الأرقام والتقارير الحية أولاً؟`,
          followUps: [
            'كم تكلفة النظام المتكامل لعدة فروع؟',
            'كيف تتطابق قيود ISABI مع برنامج المحاسبة الحالي لدينا؟',
            'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
          ]
        };
      }
      if (/(سعر|تكلفة|اسعار|أسعار|بكم|كم\s+يكلف|ميزانية|عرض\s+سعر|باقات)/.test(cleanQ)) {
        return {
          q: cleanQ,
          lang: 'ar',
          conversational: true,
          title: 'الاستثمار الشفاف وتقدير النطاق المخصص',
          answer: `تبدأ الأنظمة المتكاملة لشركة واحدة من <b>$4,500+</b>، وللمجموعات متعددة الفروع مع الذكاء الاصطناعي من <b>$9,500+</b>، وللشركات القابضة من <b>$18,000+</b>. وبناءً على إعداداتك الحالية (${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)})، يبلغ التقدير المبدئي <b>${escapeHtml(cfg.range)}</b> والتسليم خلال <b>أسبوع إلى أسبوعين</b>.`,
          promptText: `هل ترغب في معرفة كيف نطابق القيود مع برنامج المحاسبة الحالي لديكم، أم تفضل التحدث مباشرة مع حسين بدير عبر واتساب؟`,
          actionCfg: state.cfgInd,
          followUps: [
            'كيف تتطابق قيود ISABI مع برنامج المحاسبة الحالي لدينا؟',
            'ما هي خطوات التنفيذ خلال الأسبوعين الأولين؟'
          ]
        };
      }
      return {
        q: cleanQ,
        lang: 'ar',
        conversational: true,
        title: 'استشارة هندسية ومحاسبية مخصصة · ISABI',
        answer: `نعم، نصمم النظام ليتطابق تماماً مع هذا المتطلب داخل حساب شركتكم في Microsoft 365 خلال أسبوع إلى أسبوعين، مع مطابقة يومية بنسبة 100% مع برنامج المحاسبة المعتمد لديكم.`,
        promptText: `هل تود إخباري بالمزيد عن قطاع عملكم وعدد الفروع، أو تجربة سؤال آخر؟`,
        actionCfg: state.cfgInd,
        followUps: [
          'كم تكلفة النظام المتكامل لعدة فروع؟',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
        ]
      };
    }

    // 0a-FR. French language handler (two-bubble natural human conversation)
    if (lang === 'fr') {
      if (/(bonjour|salut|bonsoir|comment\s+ca\s+va|comment\s+ça\s+va|comment\s+allez|ça\s+va|ca\s+va)/i.test(low)) {
        return {
          q: cleanQ,
          lang: 'fr',
          conversational: true,
          title: 'Bienvenue · Intelligence Système ISABI',
          answer: `Bonjour ! Je vais très bien, merci. J'espère que tout va bien de votre côté.`,
          promptText: `Explorez-vous un système sur mesure pour votre entreprise, ou souhaitez-vous voir comment fonctionnent nos chiffres et rapports en direct ?`,
          followUps: [
            'Combien coûte un système complet multi-filiales ?',
            'Peut-on garder notre logiciel comptable actuel en parallèle ?',
            'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
          ]
        };
      }
      if (/(combien|coute|coûte|prix|tarif|budget|devis)/i.test(low)) {
        return {
          q: cleanQ,
          lang: 'fr',
          conversational: true,
          title: 'Investissement Transparent & Périmètre Configuré',
          answer: `Un système pour une entité unique démarre à <b>$4,500+</b>, un déploiement multi-filiales avec IA à <b>$9,500+</b>, et un groupe holding à <b>$18,000+</b>. Selon votre configuration actuelle (${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)}), comptez environ <b>${escapeHtml(cfg.range)}</b> avec une mise en service en <b>1 à 2 semaines</b>.`,
          promptText: `Voulez-vous voir comment nous fonctionnons en parallèle avec votre logiciel comptable actuel, ou ajuster le périmètre ?`,
          actionCfg: state.cfgInd,
          followUps: [
            'Peut-on garder notre logiciel comptable actuel en parallèle ?',
            'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
          ]
        };
      }
      return {
        q: cleanQ,
        lang: 'fr',
        conversational: true,
        title: 'Architecture Sur Mesure · ISABI Systems',
        answer: `Tout à fait. Plutôt que de vous imposer un modèle figé, nous construisons vos tables, vos validations et vos tableaux de bord Power BI sur mesure dans votre propre compte Microsoft 365 en <b>1 à 2 semaines</b>.`,
        promptText: `Dans quel secteur d'activité êtes-vous, ou quelle autre question souhaitez-vous me poser ?`,
        actionCfg: state.cfgInd,
        followUps: [
          'Combien coûte un système complet multi-filiales ?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
        ]
      };
    }

    // 0b-EN. "How are you" / Status / Small-talk check-ins ("how are you", "how's it going", "how are things", "what's up", "are you real")
    if (/^(how\s+are\s+you(\s+doing|\s+today)?|how\s+is\s+it\s+going|how's\s+it\s+going|hows\s+it\s+going|how\s+are\s+things|how\s+do\s+you\s+do|what's\s+up|whats\s+up|sup|how's\s+everything|are\s+you\s+there|are\s+you\s+real|are\s+you\s+an?\s+(ai|bot))[\s!.,?]*$/i.test(cleanQ) ||
        low.includes('how are you')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Operational Status',
        answer: `I am doing great, thank you for asking! Hope your week is going well.`,
        promptText: `Are you exploring a custom system for your business, or would you like to see how the live numbers and reports work?`,
        followUps: [
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'How does ISABI customize the ERP for my specific industry?',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 0b2-EN. User says they are doing well ("i'm good", "doing well", "good thanks", "all good", "fine")
    if (/^(i'm\s+(good|well|great|fine|doing\s+well)|im\s+(good|well|great|fine)|doing\s+(well|good|great)|good\s+thanks|all\s+good|fine\s+thanks|not\s+bad|pretty\s+good)[\s!.,?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Welcome',
        answer: `Glad to hear it!`,
        promptText: `Tell me a little about your business (your industry or how many branches you run), or pick a question below to start:`,
        followUps: [
          'How does ISABI customize the ERP for my specific industry?',
          'What would a complete multi-branch system cost and include?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
        ]
      };
    }

    // 0c-EN. Greetings ("hello", "hi", "hey", "salam", "marhaba", "good morning", "test")
    if (/^(hi|hello|hey|hola|salam|marhaba|ahlan|good\s+(morning|afternoon|evening|day)|greetings|yo|hi\s+there|hello\s+there|hey\s+there|test|testing)[\s!.,?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Welcome · Native System Intelligence',
        answer: `Hello! Good to have you here. I'm <b>ISABI</b>.`,
        promptText: `What kind of business are you running, or what would you like to look at first?`,
        followUps: [
          'How does ISABI customize the ERP for my specific industry?',
          'What would a complete multi-branch system cost and include?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
        ]
      };
    }

    // 0b. Identity, Capabilities & Help ("who are you", "what can you do", "help", "how do you work")
    if (low.includes('who are you') || low.includes('what are you') || low.includes('what can you do') || low.includes('what do you do') || low === 'help' || low.includes('help me') || low.includes('how do you work') || low.includes('what is ask isabi')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'About Ask ISABI',
        answer: `I'm <b>ISABI</b>, the assistant built into every ISABI Systems ERP and Power BI workspace. Inside our clients' systems, I help owners and accountants check balances, trace vouchers, and pull statements in plain language.`,
        promptText: `Here on the website, I can walk you through our 8 live industry systems, run numbers in the sandbox, or estimate a build for your company. Which one would you like to try?`,
        followUps: [
          'Why did receivables past 60 days increase this month?',
          'How does ISABI customize the ERP for my specific industry?',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 0c. Polite acknowledgments ("thanks", "thank you", "great", "cool", "ok", "got it")
    if (/^(thanks|thank\s+you|thx|ty|great|awesome|cool|nice|perfect|got\s+it|understood|ok|okay|bye|goodbye)[\s!.,?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'At Your Service',
        answer: `You're very welcome! Anytime you want to talk directly with Hussein, you can reach him on WhatsApp at <b>+961 70 444 955</b>.`,
        promptText: `Is there anything else you'd like to check while you're here?`,
        followUps: [
          'What happens in the first two weeks?',
          'What would a complete multi-branch system cost and include?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
        ]
      };
    }

    // 0d. Conversational continuation ("yes", "sure", "tell me more", "elaborate", "go ahead")
    if (/^(yes|yeah|yep|sure|please|tell\s+me\s+more|elaborate|go\s+ahead|more\s+details|explain\s+more|next)[\s!.,?]*$/i.test(cleanQ)) {
      const prev = state.aiHistory.length ? state.aiHistory[state.aiHistory.length - 1] : null;
      if (prev && prev.followUps && prev.followUps.length) {
        return resolveAskIsabi(prev.followUps[0]);
      }
      return buildJournalAudit(state.sboxInd || 'holding', cleanQ);
    }

    // 1. Check exact match with the 4 preset prompts
    for (let i = 0; i < AI_PROMPTS.length; i++) {
      if (AI_PROMPTS[i].q.toLowerCase() === low) {
        const copy = Object.assign({}, AI_PROMPTS[i], { q: cleanQ });
        copy.followUps = AI_PROMPTS.filter((_, idx) => idx !== i).slice(0, 2).map(p => p.q);
        copy.followUps.push('Analyze the ' + sbox.groupTitle + ' dashboard numbers');
        return copy;
      }
    }

    // 2. Check all 24 Sandbox Executive Exception / Watchdog buttons
    if (low.startsWith('provide an executive action plan for:')) {
      const alertTitle = cleanQ.replace(/^provide an executive action plan for:\s*/i, '').trim();
      const drill = buildAlertDrilldown(alertTitle);
      if (drill) return Object.assign({ q: cleanQ }, drill);
    }
    for (const k of Object.keys(SANDBOX_DATA)) {
      for (const a of SANDBOX_DATA[k].alerts) {
        if (low.includes(a[1].toLowerCase())) {
          const drill = buildAlertDrilldown(a[1]);
          if (drill) return Object.assign({ q: cleanQ }, drill);
        }
      }
    }

    // 3. Sandbox Dashboard Analysis ("Analyze the ... dashboard numbers" or KPI/dashboard questions)
    const matchedIndObj = detectIndustryFromQuery(low);
    if (low.includes('analyze') || low.includes('dashboard') || low.includes('sandbox') || low.includes('kpi') || low.includes('performance') || low.includes('action items') || low.includes('summary') || low.includes('revenue') || low.includes('margin') || low.includes('entities') || low.includes('cash')) {
      const targetSboxKey = matchedIndObj ? matchedIndObj.sandboxKey : state.sboxInd;
      return buildDashboardBriefing(targetSboxKey, cleanQ);
    }

    // 4. Journal / General Ledger / Voucher / Debit / Credit / Chart of Accounts queries
    if (low.includes('journal') || low.includes('voucher') || low.includes('debit') || low.includes('credit') || low.includes('coa') || low.includes('chart of account') || low.includes('trial balance') || low.includes('double-entry') || low.includes('double entry') || low.includes('gl ') || low.includes('ledger')) {
      if (!low.includes('customizes the ledger')) {
        const targetSboxKey = matchedIndObj ? matchedIndObj.sandboxKey : state.sboxInd;
        return buildJournalAudit(targetSboxKey, cleanQ);
      }
    }

    // 5. Hero "Try It" ("Explain how ISABI Systems customizes the ledger for my industry") or generic customization question
    if (low.includes('customizes the ledger') || (low.includes('custom') && low.includes('industry') && !matchedIndObj)) {
      const curInd = INDUSTRIES.find(x => x.id === state.activeInd) || INDUSTRIES[0];
      return Object.assign({}, AI_PROMPTS[1], {
        q: cleanQ,
        answer: `Unlike off-the-shelf software that forces every company into generic "Invoice" and "Item" boxes, ISABI Systems engineers a <b>dedicated Dataverse relational schema</b> around your physical unit of operation while sharing a governed double-entry accounting core. Currently selected blueprint on page: <b>${curInd.name}</b>.`,
        actionInd: curInd.sandboxKey,
        actionCfg: curInd.cfgName,
        followUps: [
          'Show the ' + curInd.cfgName + ' blueprint in detail',
          'Analyze the ' + (SANDBOX_DATA[curInd.sandboxKey] || SANDBOX_DATA.holding).groupTitle + ' dashboard numbers',
          'How does dual-entry reconciliation work with our existing accountant software?'
        ]
      });
    }

    // 6. Specific Industry Blueprint or Companion PWA (Hospitality, Trading, Concrete, Real Estate, Insurance, Holding, POS, Attendance)
    if (matchedIndObj) {
      return buildBlueprintResponse(matchedIndObj, cleanQ);
    }

    // 7. Overdue Receivables / Aging / SOA / Collections / Payables
    if (low.includes('receiv') || low.includes('overdue') || low.includes('60') || low.includes('aging') || low.includes('ar ') || low.includes('collect') || low.includes('soa') || low.includes('statement of account') || low.includes('payable') || low.includes('supplier') || low.includes('invoice')) {
      const m = cm.mult;
      const s = cm.sym;
      return {
        q: cleanQ,
        title: `Live Receivables & SOA Audit (${s})`,
        answer: `I queried the Receivables Ledger across all active Business Units in <b>${s}</b>. Overdue balances past 60 days stand at <b>${fmtMoney(42300, m, s)}</b> across 7 invoices, with one-click printable Statements of Account (.rdl) ready for WhatsApp or email dispatch.`,
        headers: ['Account / Entity', 'Voucher Ref', 'Days Past Due', `Balance (${s})`],
        rows: [
          ['Apex Contracting · Concrete Plant', 'TK-2026-3104', '68 Days', fmtMoney(16400, m, s)],
          ['Levant Logistics · Heavy Equipment Div', 'SI-TRK-0298', '64 Days', fmtMoney(14800, m, s)],
          ['Metro Transit · Spare Parts Depot', 'SI-PRT-1411', '62 Days', fmtMoney(6250, m, s)],
          ['4 Smaller Balances (< $2k each)', 'Multiple', '61-74 Days', fmtMoney(4850, m, s)]
        ],
        total: ['Total Audited Overdue (> 60 Days)', fmtMoney(42300, m, s)],
        citation: 'Source: Dataverse Receivables Ledger · Verified 100% against Printable SOA (.rdl)',
        followUps: [
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'How do printable Statements of Account work?',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 8. Pricing, Scope Configurator, Cost, Budget, Tiers, Retainer
    if (low.includes('price') || low.includes('pricing') || low.includes('cost') || low.includes('budget') || low.includes('tier') || low.includes('how much') || low.includes('quote') || low.includes('retainer') || low.includes('invest') || low.includes('scope')) {
      const cfg = state.lastCfgSummary || {
        industry: state.cfgInd,
        scale: state.cfgScaleLabel,
        modules: ['Core Dataverse ERP & Ledger', 'Power BI Executive Dashboards', 'Printable .RDL Statements & SOA', 'Ask ISABI Native AI Assistant'],
        range: '$12,300 to $15,000',
        weeks: '1 to 2 Weeks'
      };
      return {
        q: cleanQ,
        title: 'Transparent Investment & Your Configured Scope',
        answer: `ISABI Systems offers three fixed-scope engagement tiers (<b>$4,500+</b> Single Entity, <b>$9,500+</b> Multi-Entity & AI Suite, and <b>$18,000+</b> Enterprise Group). Based on your current <b>Scope Configurator</b> selection for <b>${cfg.industry}</b> (${cfg.scale}), your estimated turnkey range is <b>${cfg.range}</b> delivered in <b>${cfg.weeks}</b>.`,
        headers: ['Engagement Option', 'Target Scale & Included Scope', 'Investment'],
        rows: [
          ['Your Configured Scope', `${cfg.industry} · ${cfg.scale} (${cfg.modules.length} modules)`, cfg.range],
          ['Tier 01 · Foundation', 'Single entity ERP, custom schema, roles, Power BI & 2 RDLs', 'From $4,500 (+$350/mo opt.)'],
          ['Tier 02 · Multi-Entity & AI', 'Multi-BU isolation, 3 PBI workspaces, full SOA pack, Ask ISABI & 1 PWA', 'From $9,500 (+$650/mo opt.)'],
          ['Tier 03 · Enterprise Group', 'Multi-industry apps, group treasury, partner splits & unlimited PWAs', 'From $18,000+ Custom']
        ],
        total: ['Your Live Configured Estimate', `${cfg.range} (${cfg.weeks})`],
        citation: 'Fixed-scope quotation confirmed after a 30-minute discovery call with Hussein Bdeir',
        actionCfg: state.cfgInd,
        followUps: [
          'Do we need to buy Microsoft licences?',
          'What happens in the first two weeks?',
          'Can we start small and add modules later?'
        ]
      };
    }

    // 9. Dual-Entry, Accountant Software, Migration from Excel/Legacy
    if (low.includes('reconcil') || low.includes('accountant') || low.includes('parallel') || low.includes('dual') || low.includes('statutory') || low.includes('excel') || low.includes('migrat') || low.includes('history') || low.includes('cutover') || low.includes('legacy')) {
      return Object.assign({}, AI_PROMPTS[2], {
        q: cleanQ,
        followUps: [
          'Show the Statutory vs Operational reconciliation check',
          'Who owns the system and the data?',
          'What happens in the first two weeks?'
        ]
      });
    }

    // 10. Microsoft Licensing, Tenant Ownership, Security, Permissions & Confidential Data
    if (low.includes('licen') || low.includes('own') || low.includes('security') || low.includes('confidential') || low.includes('permission') || low.includes('role') || low.includes('entra') || low.includes('privacy') || low.includes('tenant') || low.includes('who sees')) {
      return {
        q: cleanQ,
        title: 'Tenant Ownership, Licensing & Role Security',
        answer: `<b>You own 100% of the system and data.</b> Every database table, workflow, Power BI model, and Ask ISABI prompt runs inside your own Microsoft 365 & Dataverse tenant. Microsoft bills your licences directly at cost with zero markup from ISABI Systems and zero per-terminal fees on POS and Attendance PWAs.`,
        headers: ['Governance Layer', 'How It Is Enforced in Production', 'Client Benefit'],
        rows: [
          ['Tenant & Data Ownership', 'Deployed inside your own Microsoft 365 & Entra ID tenant', '100% client-owned forever'],
          ['Business Unit Isolation', 'Row-level Dataverse ownership per branch, resort, or plant', 'Staff see only their unit'],
          ['Entry vs Supervisor Roles', 'Entry seats create records; Supervisors audit & approve; GL is column-secured', 'Zero unauthorized edits'],
          ['Ask ISABI Security Scope', 'Queries execute under the signed-in user\'s exact Dataverse security role', 'Confidential figures protected']
        ],
        total: ['Companion POS & Kiosk Terminal Fees', '$0 / Terminal (Unlimited PWA Installs)'],
        citation: 'Source: Microsoft Entra ID + Dataverse Role & Column-Level Security Architecture',
        followUps: [
          'How does dual-entry reconciliation work with our existing accountant software?',
          'What would a complete multi-branch system cost and include?',
          'What happens in the first two weeks?'
        ]
      };
    }

    // 11. Commissioning, Timeline, First 2 Weeks, Process ("What should I know before commissioning...")
    if (low.includes('commission') || low.includes('week') || low.includes('timeline') || low.includes('how long') || low.includes('process') || low.includes('first') || low.includes('know before') || low.includes('start') || low.includes('onboard')) {
      return {
        q: cleanQ,
        title: 'Commissioning & 2-Week Go-Live Roadmap',
        answer: `Before commissioning an ISABI system, you only need your current spreadsheets or chart of accounts and a 30-minute walkthrough with Hussein Bdeir. Your accountant does not need to change software, and you can start with one entity and add modules later without rebuilding.`,
        headers: ['Delivery Window', 'Engineering Milestone', 'Client Sign-Off'],
        rows: [
          ['Days 1 to 3', 'Custom Dataverse schema, Chart of Accounts, Business Units & roles', 'Live ERP forms approved'],
          ['Days 3 to 6', 'Automated approvals, SharePoint document routing & POS/Kiosk PWAs', 'Workflows tested end-to-end'],
          ['Days 6 to 10', 'Power BI XMLA models (Year/Month/Week/Day) & printable .RDL statements', 'Historical data migrated'],
          ['Days 10 to 14', 'Ask ISABI wiring, team training, parallel-run reconciliation & go-live', '0.00 variance cutover']
        ],
        total: ['Typical End-to-End Delivery', '1 to 2 Weeks to Production'],
        citation: 'Source: ISABI Code-First Compiler Pipeline · Direct Principal Engineering',
        followUps: [
          'What would a complete multi-branch system cost and include?',
          'Do we need to buy Microsoft licences?',
          'Can we start small and add modules later?'
        ]
      };
    }

    // 12. Power BI, Printable Statements (.RDL), Reports
    if (low.includes('power bi') || low.includes('pbi') || low.includes('rdl') || low.includes('printable') || low.includes('report') || low.includes('xmla')) {
      return {
        q: cleanQ,
        title: 'Power BI Executive Suite & Printable Statements (.RDL)',
        answer: `Every ISABI implementation pairs interactive <b>Power BI semantic models</b> (with dynamic Year, Month, Week, and Day period pickers) with pixel-perfect <b>Paginated Reports (.rdl)</b> formatted for immediate PDF/Excel export and statutory audit.`,
        headers: ['Reporting Workspace', 'Audience & Access Gate', 'Included Outputs'],
        rows: [
          ['01. Operations Workspace', 'Branch Managers & Department Heads', 'Daily revenue, stock velocity, attendance & ticket books'],
          ['02. Financial Workspace', 'Owners, Partners & Chief Accountants', 'Consolidated P&L, balance sheet, cashflow & partner splits'],
          ['03. Printable .RDL Pack', 'In-App Viewer + Automated Email/WhatsApp', 'Customer/Supplier SOA, Aged Trial Balance & Payslips'],
          ['04. Reconciliation Workspace', 'Parallel-Run Audit Team', 'Line-by-line operational vs statutory variance check']
        ],
        total: ['Report Refresh & Delivery', 'Edit-Driven Auto Refresh + Scheduled PDF Subscriptions'],
        citation: 'Source: Power BI XMLA Pipeline & Shared RDL Institutional Style Engine',
        followUps: [
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'Why did receivables past 60 days increase this month?',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 13. ROI, Hours Saved, Payback Calculator
    if (low.includes('roi') || low.includes('save') || low.includes('hour') || low.includes('payback') || low.includes('close speed')) {
      const ent = parseInt(document.getElementById('roi-entities')?.value || '3', 10) || 3;
      const hrs = parseInt(document.getElementById('roi-hours')?.value || '35', 10) || 35;
      const closeDays = parseInt(document.getElementById('roi-close')?.value || '14', 10) || 14;
      const annualHours = Math.round(hrs * 52 * 0.78 + ent * 65);
      const annualVal = annualHours * 30;
      const estCost = ent === 1 ? 5500 : (ent <= 4 ? 10500 : 18500);
      const payback = Math.max(1.2, (estCost / (annualVal / 12))).toFixed(1);

      return {
        q: cleanQ,
        title: `Quantified ROI & Close-Cycle Impact (${ent} ${ent === 1 ? 'Entity' : 'Entities'})`,
        answer: `Based on your current ROI Estimator settings (<b>${ent} entities</b>, <b>${hrs} hrs/wk</b> of manual Excel work, and a <b>${closeDays}-day</b> monthly close), automating voucher capture, inter-branch consolidation, and SOA generation reclaims <b>${annualHours.toLocaleString('en-US')} hours per year</b>.`,
        headers: ['Impact Metric', 'Current Baseline', 'With ISABI Systems'],
        rows: [
          ['Manual Excel & Re-Keying', `${hrs} hrs / week`, `${annualHours.toLocaleString('en-US')} hrs/yr reclaimed`],
          ['Annual Productivity Value ($30/hr)', 'Manual overhead', '$' + annualVal.toLocaleString('en-US') + ' / year saved'],
          ['Monthly Books Close Cycle', `${closeDays} Calendar Days`, closeDays > 10 ? 'Same-Day / 48h Close' : 'Real-Time Daily Close'],
          ['Estimated Turnkey Payback', `~$${estCost.toLocaleString('en-US')} build`, `${payback} Months to full payback`]
        ],
        total: ['Estimated System Payback Period', `${payback} Months`],
        citation: 'Source: ISABI Operational Impact Estimator · Section 05',
        followUps: [
          'What would a complete multi-branch system cost and include?',
          'How does dual-entry reconciliation work with our existing accountant software?'
        ]
      };
    }

    // 14a. Location, Where are you based, Lebanon, Middle East
    if (low.includes('where') || low.includes('located') || low.includes('location') || low.includes('based') || low.includes('country') || low.includes('office') || low.includes('lebanon') || low.includes('beirut') || low.includes('middle east')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Location & Reach',
        answer: `We are based in <b>Lebanon</b> (founded and led by <b>Hussein Bdeir</b>), and we build and support systems for companies across Lebanon, the Middle East, and internationally.`,
        promptText: `Since everything deploys directly into your own Microsoft 365 cloud, we can work with your team anywhere. Where is your business based, or what kind of system are you exploring?`,
        followUps: [
          'What would a complete multi-branch system cost and include?',
          'How does ISABI customize the ERP for my specific industry?',
          'What happens in the first two weeks?'
        ]
      };
    }

    // 14b. About the website / About ISABI Systems / Services overview
    if (low.includes('website') || low.includes('this site') || low.includes('about isabi') || low.includes('what is isabi') || low.includes('what do you offer') || low.includes('your services') || low.includes('tell me more about')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'About ISABI Systems',
        answer: `This website is an interactive showcase of <b>ISABI Systems</b>. Here you can explore the <b>8 live industry ERP systems</b> we have built, test real multi-currency numbers in the <b>Live Sandbox</b>, or price out a custom setup in the <b>Scope Configurator</b>.`,
        promptText: `Would you like me to walk you through one of the 8 industries, or tell me what kind of business you run?`,
        followUps: [
          'How does ISABI customize the ERP for my specific industry?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 14c. Direct Contact, Hussein Bdeir, WhatsApp, Demo, Walkthrough
    if (low.includes('hussein') || low.includes('contact') || low.includes('whatsapp') || low.includes('phone') || low.includes('email') || low.includes('call') || low.includes('demo') || low.includes('walkthrough')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Direct Principal Access · Hussein Bdeir',
        answer: `You work directly with <b>Hussein Bdeir</b>, Founder and Principal Systems Architect. You can message him anytime on WhatsApp at <b>+961 70 444 955</b> or email <b>hbdeir16@gmail.com</b> for a 30-minute walkthrough.`,
        promptText: `Would you like to open WhatsApp now, or price out your scope on the page first?`,
        actionCfg: state.cfgInd,
        followUps: [
          'What would a complete multi-branch system cost and include?',
          'What happens in the first two weeks?'
        ]
      };
    }

    // 15. Offline / Internet Drop / Power Outage Resilience
    if (low.includes('offline') || low.includes('internet') || low.includes('wifi') || low.includes('outage') || low.includes('disconnect')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Offline-First Field Continuity',
        answer: `Our <b>POS Till</b> and <b>Biometric Attendance Kiosk</b> apps run 100% offline on local tablet storage. If your internet or power drops, cashiers keep printing thermal receipts and staff keep punching in, and everything syncs to the ledger automatically once the connection is back.`,
        promptText: `Would you like to see the POS Till or the Attendance Kiosk blueprint in detail?`,
        followUps: [
          'Show the Custom POS & Offline Till PWA blueprint',
          'Show the Biometric Attendance Kiosk PWA blueprint',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 16. Existing Accounting Software (Dolphin, PIMS, Omega, QuickBooks, Odoo, SAP, Xero) & Multi-Currency / VAT
    if (low.includes('dolphin') || low.includes('pims') || low.includes('omega') || low.includes('quickbooks') || low.includes('odoo') || low.includes('sap') || low.includes('xero') || low.includes('tally') || low.includes('vat') || low.includes('tva') || low.includes('lbp') || low.includes('multi-currency') || low.includes('multicurrency') || low.includes('currency')) {
      return {
        q: cleanQ,
        conversational: true,
        title: 'Statutory Compatibility & Multi-Currency',
        answer: `Your accountant doesn't have to change software. We run side-by-side with Dolphin, PIMS, QuickBooks, or SAP across <b>USD, EUR, AED, and LBP</b>, and our reconciliation view checks every voucher line-by-line until the two books agree to <b>0.00</b>.`,
        promptText: `Would you like to see how the parallel-run reconciliation check works, or explore a specific industry?`,
        followUps: [
          'How does dual-entry reconciliation work with our existing accountant software?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 17. Conversational Custom Question Handler (two-bubble human response, never dumps an unrelated table)
    return {
      q: cleanQ,
      conversational: true,
      isCustomFallback: true,
      title: 'Custom Architectural Guidance',
      answer: `We can build around that directly. Instead of forcing your team into a generic template, we set up the exact tables, approvals, and Power BI reports your workflow needs inside your own Microsoft 365 account (typical delivery for ${escapeHtml(cfg.scale)} is <b>${escapeHtml(cfg.weeks)}</b> at <b>${escapeHtml(cfg.range)}</b>).`,
      promptText: `Would you like to tell me a bit more about your industry and how many branches you run, or send this straight to Hussein on WhatsApp?`,
      actionCfg: state.cfgInd,
      followUps: [
        'How does ISABI customize the ERP for my specific industry?',
        'What would a complete multi-branch system cost and include?',
        'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
      ]
    };
  }

  function formatWelcomeMessageHTML() {
    const sbox = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const chipsHtml = AI_PROMPTS.map(p =>
      `<button type="button" class="ai-followup-btn" data-ai-ask="${escapeHtml(p.q)}">${escapeHtml(p.q)}</button>`
    ).join('');

    return `
      <div class="ai-msg-bot">
        ${BADGE_MINI_SVG}
        <div class="ai-bot-bubble is-conversational">
          <p>Welcome. I am <b>ISABI</b>, the assistant built into ISABI Systems. I can walk you through our 8 live industry systems, run numbers in the <b>${sbox.groupTitle}</b> sandbox, or answer questions about how we build around your accounting.</p>
        </div>
      </div>
      <div class="ai-msg-followup">
        <div class="ai-bot-followup-bubble">
          <p class="ai-followup-lead">What would you like to look at first?</p>
          <div class="ai-followups">${chipsHtml}</div>
        </div>
      </div>
    `;
  }

  function formatAiMessageHTML(item, isNewest = false) {
    let tableBlockHtml = '';
    if (item.headers && item.headers.length && item.rows && item.rows.length) {
      const colCount = item.headers.length;
      const headersHtml = item.headers.map((h, idx) =>
        `<th${idx === colCount - 1 ? ' style="text-align:right"' : ''}>${h}</th>`
      ).join('');

      const rowsHtml = item.rows.map(r => {
        const cells = r.slice(0, colCount).map((c, idx) => {
          if (idx === 0) return `<td><b>${c}</b></td>`;
          if (idx === colCount - 1) return `<td style="text-align:right">${c}</td>`;
          return `<td>${c}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      const totLabel = (item.total && item.total[0]) || 'Total';
      const totVal = (item.total && item.total[item.total.length - 1]) || '';

      tableBlockHtml = `
        <div class="ai-bot-table-wrap">
          <table class="ai-bot-table">
            <thead>
              <tr>${headersHtml}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="tot">
                <td colspan="${Math.max(1, colCount - 1)}">${totLabel}</td>
                <td style="text-align:right">${totVal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    const bulletsHtml = (item.bullets && item.bullets.length)
      ? `<ul class="ai-bot-bullets">${item.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
      : '';

    const followUpsHtml = (item.followUps && item.followUps.length)
      ? `<div class="ai-followups">${item.followUps.map(fq => `<button type="button" class="ai-followup-btn" data-ai-ask="${escapeHtml(fq)}">${escapeHtml(fq)}</button>`).join('')}</div>`
      : '';

    let extraActions = '';
    if (item.actionInd && SBOX_LABELS[item.actionInd]) {
      extraActions += `<button type="button" class="ai-act-link" data-load-sandbox="${escapeHtml(item.actionInd)}">Load ${escapeHtml(SBOX_LABELS[item.actionInd])} in Sandbox</button>`;
    }
    if (item.actionCfg) {
      extraActions += `<button type="button" class="ai-act-link" data-configure-ind="${escapeHtml(item.actionCfg)}">Configure Scope</button>`;
    }

    const isRtl = item.lang === 'ar' || /[\u0600-\u06FF]/.test(item.answer || '');
    const dirAttr = isRtl ? ' dir="rtl" style="text-align:right"' : '';
    const userDirAttr = /[\u0600-\u06FF]/.test(item.q || '') ? ' dir="rtl"' : '';
    const isConv = Boolean(item.conversational) && !tableBlockHtml;

    const defaultPromptLead = item.lang === 'ar'
      ? 'هل تود استكشاف أحد هذه المواضيع أو طرح سؤال آخر؟'
      : (item.lang === 'fr'
        ? 'Souhaitez-vous explorer l\'un de ces sujets ou poser une autre question ?'
        : 'Would you like to explore one of these next, or ask me something else?');
    const promptLead = item.promptText || defaultPromptLead;

    const bubble1Html = isConv
      ? `
      <div class="ai-msg-bot">
        ${BADGE_MINI_SVG}
        <div class="ai-bot-bubble is-conversational"${dirAttr}>
          <p>${item.answer}</p>
          ${bulletsHtml}
        </div>
      </div>`
      : `
      <div class="ai-msg-bot">
        ${BADGE_MINI_SVG}
        <div class="ai-bot-bubble"${dirAttr}>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#D9A54A;font-weight:700;margin-bottom:4px">ISABI · ${item.title}</div>
          <p>${item.answer}</p>
          ${bulletsHtml}
          ${tableBlockHtml}
          <div class="ai-bot-meta">
            <span>${item.citation || 'Source: ISABI Systems'}</span>
            <div class="ai-bot-actions">
              ${extraActions}
              <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I asked Ask ISABI ("' + item.q + '") and would like to discuss this for our company.')}" target="_blank" rel="noopener" style="color:#D9A54A;font-weight:700">Discuss on WhatsApp</a>
            </div>
          </div>
        </div>
      </div>`;

    let bubble2Html = '';
    if (isNewest && state.aiTypingFollowup) {
      bubble2Html = `
      <div class="ai-msg-followup">
        <div class="ai-thinking-bubble"${dirAttr}>
          <span class="ai-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>`;
    } else if (followUpsHtml || item.promptText) {
      const convActions = isConv
        ? `<div class="ai-bot-actions" style="margin-top:8px;font-size:11.5px">${extraActions}<a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I asked Ask ISABI ("' + item.q + '") and would like to discuss this for our company.')}" target="_blank" rel="noopener" style="color:#D9A54A;font-weight:700">Message Hussein on WhatsApp</a></div>`
        : '';
      bubble2Html = `
      <div class="ai-msg-followup">
        <div class="ai-bot-followup-bubble"${dirAttr}>
          <p class="ai-followup-lead">${promptLead}</p>
          ${followUpsHtml}
          ${convActions}
        </div>
      </div>`;
    }

    return `
      <div class="ai-msg-user"${userDirAttr}>${escapeHtml(item.q)}</div>
      ${bubble1Html}
      ${bubble2Html}
    `;
  }

  function formatThinkingMessageHTML(qText, lang) {
    const label = lang === 'ar'
      ? 'يقوم ISABI بتحليل سؤالك...'
      : (lang === 'fr' ? 'ISABI analyse votre question...' : 'ISABI is analyzing...');
    const userDirAttr = /[\u0600-\u06FF]/.test(qText || '') ? ' dir="rtl"' : '';
    const botDirAttr = lang === 'ar' ? ' dir="rtl"' : '';
    return `
      <div class="ai-msg-user"${userDirAttr}>${escapeHtml(qText)}</div>
      <div class="ai-msg-bot ai-msg-thinking">
        ${BADGE_MINI_SVG}
        <div class="ai-thinking-bubble"${botDirAttr}>
          <span>${label}</span>
          <span class="ai-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;
  }

  function renderAiThreads(scrollToBottom = false) {
    const pillsEl = document.getElementById('ai-prompt-pills');
    const threadEl = document.getElementById('ai-inline-thread');
    const drawerThread = document.getElementById('ai-drawer-thread');

    const pillsHtml = AI_PROMPTS.map((p, i) => `
      <button type="button" class="ai-pill-btn ${i === state.activeAiPillIdx ? 'active' : ''}" data-ai-idx="${i}">${p.q}</button>
    `).join('');

    if (pillsEl) pillsEl.innerHTML = pillsHtml;

    const pendingHtml = state.aiPendingQ
      ? formatThinkingMessageHTML(state.aiPendingQ.q, state.aiPendingQ.lang)
      : '';

    if (!state.aiHistory.length && !pendingHtml) {
      const welcomeHtml = formatWelcomeMessageHTML();
      if (drawerThread) {
        drawerThread.innerHTML = welcomeHtml;
        drawerThread.scrollTop = 0;
      }
      if (threadEl) {
        threadEl.innerHTML = state.aiReset
          ? welcomeHtml
          : formatAiMessageHTML(resolveAskIsabi(AI_PROMPTS[0].q), false);
        threadEl.scrollTop = 0;
      }
      updateAiScopeBar();
      return;
    }

    const lastIdx = state.aiHistory.length - 1;
    const threadHtml = state.aiHistory.map((item, idx) => formatAiMessageHTML(item, idx === lastIdx)).join('') + pendingHtml;
    if (threadEl) {
      threadEl.innerHTML = threadHtml;
      if (scrollToBottom) threadEl.scrollTop = threadEl.scrollHeight;
    }
    if (drawerThread) {
      drawerThread.innerHTML = threadHtml;
      if (scrollToBottom) drawerThread.scrollTop = drawerThread.scrollHeight;
    }
    updateAiScopeBar();
  }

  function buildGeminiSystemPrompt(lang) {
    return [
      'You are ISABI, the warm, human conversational assistant on the ISABI Systems website (https://husseinbdeir.github.io/isabi/).',
      'Company & Location: ISABI Systems is founded and led by Hussein Bdeir (Principal Systems Architect), based in Lebanon and serving owner-led companies and multi-entity holding groups across Lebanon, the Middle East, and worldwide. Direct WhatsApp: +961 70 444 955. Email: hbdeir16@gmail.com.',
      'What this website shows: Visitors can explore our 8 live industry ERP blueprints, test real multi-currency double-entry numbers in the Live Sandbox, calculate time savings in the ROI Estimator, or configure a custom quote in the Scope Configurator.',
      'What we build: Custom Microsoft Dataverse ERP apps, double-entry general ledgers, Power BI executive dashboards, printable .RDL Statements of Account, and offline field PWAs (POS Till & Biometric Attendance Kiosk) delivered inside the client\'s own Microsoft 365 account in 1 to 2 weeks.',
      '8 live apps: Hospitality & Resorts, Auto & Heavy Equipment Trading, Concrete & Manufacturing, Real Estate Portfolio, Insurance Brokerage, Multi-Entity Holding, Custom Offline POS PWA, Biometric Attendance Kiosk PWA.',
      'Pricing: Single-Entity Foundation from $4,500+ (1 week); Multi-Entity & AI Suite from $9,500+ (1 to 2 weeks); Enterprise Holding Group from $18,000+ (2 weeks). Clients own 100% of their Microsoft 365 tenant and pay $0 per terminal for PWAs. Runs side-by-side with existing accounting software (Dolphin, PIMS, QuickBooks, SAP) to 0.00 variance.',
      'Tone & Formatting rules: Speak like a friendly, sharp, natural human in a live chat. NEVER sound like a corporate brochure or dump walls of text. NEVER use em-dashes or unicode arrows. Reply in the same language as the user (Detected language: ' + lang + ').',
      'You ALWAYS reply in TWO short chat bubbles: (1) "answer": 1 to 2 natural, direct sentences answering what the user asked; (2) "promptText": 1 short, natural follow-up question inviting the user to continue the conversation.',
      'Return ONLY valid JSON: {"conversational": true, "title": "Short heading", "answer": "1-2 sentence natural human reply", "promptText": "1-sentence natural follow-up question", "headers": [], "rows": [], "total": [], "followUps": ["Short option 1", "Short option 2", "Short option 3"]}. Leave headers/rows/total empty [] unless the user explicitly asks for a numerical table.'
    ].join('\n');
  }

  function buildGeminiUserPrompt(qText) {
    const sbox = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const cfg = state.lastCfgSummary || { industry: state.cfgInd, scale: state.cfgScaleLabel, range: '$12,300 to $15,000', weeks: '1 to 2 Weeks' };
    const recent = state.aiHistory.slice(-4).map(h => 'User: ' + h.q + '\nISABI: ' + String(h.answer || '').replace(/<[^>]+>/g, '')).join('\n\n');
    return [
      'Active Live Sandbox Context: ' + sbox.groupTitle + ' | Currency: ' + cm.sym + ' | Period: ' + pm.label,
      'Active Scope Configurator: ' + cfg.industry + ' | Scale: ' + cfg.scale + ' | Estimate: ' + cfg.range + ' (' + cfg.weeks + ')',
      recent ? ('Recent Conversation:\n' + recent) : '',
      'Visitor Question: ' + qText
    ].filter(Boolean).join('\n\n');
  }

  function parseCloudAiReply(rawReply, cleanQ, lang, fallbackResp) {
    try {
      const cleaned = String(rawReply || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const obj = JSON.parse(cleaned);
      if (!obj || !obj.answer) return fallbackResp;
      const hasTable = Array.isArray(obj.headers) && obj.headers.length && Array.isArray(obj.rows) && obj.rows.length;
      return {
        q: cleanQ,
        lang: lang,
        conversational: obj.conversational !== undefined ? Boolean(obj.conversational) : !hasTable,
        title: String(obj.title || fallbackResp.title || 'System Intelligence').replace(/[\u2014\u2192]/g, '-'),
        answer: String(obj.answer).replace(/[\u2014\u2192]/g, '-'),
        promptText: obj.promptText ? String(obj.promptText).replace(/[\u2014\u2192]/g, '-') : fallbackResp.promptText,
        bullets: Array.isArray(obj.bullets) ? obj.bullets.map(b => String(b).replace(/[\u2014\u2192]/g, '-')) : [],
        headers: hasTable ? obj.headers : undefined,
        rows: hasTable ? obj.rows : undefined,
        total: Array.isArray(obj.total) && obj.total.length ? obj.total : undefined,
        citation: String(obj.citation || fallbackResp.citation || 'ISABI Systems').replace(/[\u2014\u2192]/g, '-'),
        actionInd: obj.actionInd || fallbackResp.actionInd,
        actionCfg: obj.actionCfg || fallbackResp.actionCfg,
        followUps: Array.isArray(obj.followUps) && obj.followUps.length ? obj.followUps.slice(0, 3) : (fallbackResp.followUps || [])
      };
    } catch (e) {
      return fallbackResp;
    }
  }

  async function callAskIsabiCloud(cleanQ, lang, fallbackResp) {
    if (navigator.webdriver) return fallbackResp;
    let flowUrl = '';
    let flowKey = '';
    try {
      flowUrl = atob(ASK_FLOW_U_B64);
      flowKey = atob(ASK_FLOW_K_B64);
    } catch (e) {
      return fallbackResp;
    }
    if (!flowUrl || !flowUrl.startsWith('http')) return fallbackResp;

    const cfg = state.lastCfgSummary || { industry: state.cfgInd, scale: state.cfgScaleLabel, range: '$12,300 to $15,000', weeks: '1 to 2 Weeks' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 14000);
    try {
      const res = await fetch(flowUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          key: flowKey,
          op: 'ask',
          q: cleanQ,
          lang: lang,
          industry: state.sboxInd || 'holding',
          currency: state.sboxCurr || 'USD',
          period: state.sboxPeriod || 'mtd',
          scale: cfg.scale || '',
          range: cfg.range || '',
          replyTitle: fallbackResp.title || '',
          systemPrompt: buildGeminiSystemPrompt(lang),
          userPrompt: buildGeminiUserPrompt(cleanQ)
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) return fallbackResp;
      const data = await res.json();
      if (data && data.mode === 'gemini_cloud' && data.rawReply) {
        return parseCloudAiReply(data.rawReply, cleanQ, lang, fallbackResp);
      }
      return fallbackResp;
    } catch (e) {
      clearTimeout(timer);
      return fallbackResp;
    }
  }

  function renderAiSection(idx = 0, isInitialLoad = false) {
    if (isInitialLoad) {
      state.activeAiPillIdx = 0;
      state.aiHistory = [];
      state.aiReset = false;
      state.aiPendingQ = null;
      state.aiTypingFollowup = false;
      renderAiThreads(false);
      return;
    }
    state.activeAiPillIdx = idx;
    state.aiReset = false;
    state.aiPendingQ = null;
    state.aiTypingFollowup = false;
    const preset = AI_PROMPTS[idx] || AI_PROMPTS[0];
    const resolved = resolveAskIsabi(preset.q);
    const last = state.aiHistory[state.aiHistory.length - 1];
    if (!last || last.q !== resolved.q) {
      state.aiHistory.push(resolved);
      if (state.aiHistory.length > 8) state.aiHistory.shift();
    }
    renderAiThreads(true);
  }

  function askIsabiQuestion(qText, openDrawer = false, fromInputSubmit = false) {
    const clean = String(qText || '').trim();
    if (!clean) return;
    state.aiReset = false;
    const matchIdx = AI_PROMPTS.findIndex(p => p.q.toLowerCase() === clean.toLowerCase());
    state.activeAiPillIdx = matchIdx >= 0 ? matchIdx : -1;
    const lang = detectQueryLanguage(clean);
    const localResp = resolveAskIsabi(clean);

    if (openDrawer) {
      const backdrop = document.getElementById('ai-drawer-backdrop');
      if (backdrop) backdrop.hidden = false;
    }

    // In headless tests or preset chip clicks, resolve immediately
    if (navigator.webdriver || window.__ISABI_SYNC_TEST || !fromInputSubmit) {
      state.aiPendingQ = null;
      state.aiTypingFollowup = false;
      state.aiHistory.push(localResp);
      if (state.aiHistory.length > 8) state.aiHistory.shift();
      renderAiThreads(true);
      return;
    }

    // Two-beat natural human conversation:
    // Beat 1: Show brief thinking indicator -> reveal Bubble 1 (direct answer)
    // Beat 2: Show brief typing dots in Bubble 2 -> reveal Bubble 2 (follow-up question & options)
    state.aiPendingQ = { q: clean, lang: lang };
    state.aiTypingFollowup = false;
    renderAiThreads(true);

    const hasLocalTable = Boolean(localResp.headers && localResp.headers.length);
    if (hasLocalTable) {
      callAskIsabiCloud(clean, lang, localResp);
      setTimeout(() => {
        if (!state.aiPendingQ || state.aiPendingQ.q !== clean) return;
        state.aiPendingQ = null;
        state.aiTypingFollowup = true;
        state.aiHistory.push(localResp);
        if (state.aiHistory.length > 8) state.aiHistory.shift();
        renderAiThreads(true);
        setTimeout(() => {
          state.aiTypingFollowup = false;
          renderAiThreads(true);
        }, 420);
      }, 280);
      return;
    }

    const minDelay = new Promise(r => setTimeout(r, 320));
    Promise.all([callAskIsabiCloud(clean, lang, localResp), minDelay]).then(([finalResp]) => {
      if (!state.aiPendingQ || state.aiPendingQ.q !== clean) return;
      state.aiPendingQ = null;
      state.aiTypingFollowup = true;
      state.aiHistory.push(finalResp || localResp);
      if (state.aiHistory.length > 8) state.aiHistory.shift();
      renderAiThreads(true);
      setTimeout(() => {
        state.aiTypingFollowup = false;
        renderAiThreads(true);
      }, 420);
    });
  }

  function resetAiThread() {
    state.aiHistory = [];
    state.aiReset = true;
    state.aiPendingQ = null;
    state.aiTypingFollowup = false;
    state.activeAiPillIdx = -1;
    const inp1 = document.getElementById('ai-inline-input');
    const inp2 = document.getElementById('ai-drawer-input');
    if (inp1) inp1.value = '';
    if (inp2) inp2.value = '';
    renderAiThreads(false);
    showToast('Conversation reset');
  }

  function openAiDrawer(customQ) {
    const backdrop = document.getElementById('ai-drawer-backdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    if (customQ) {
      askIsabiQuestion(customQ, true);
    } else {
      renderAiThreads(Boolean(state.aiHistory.length));
    }
    const inp = document.getElementById('ai-drawer-input');
    if (inp && window.innerWidth > 720) setTimeout(() => inp.focus(), 80);
  }

  // ---------------- ROI CALCULATOR ----------------
  function updateRoi() {
    const entEl = document.getElementById('roi-entities');
    const hrsEl = document.getElementById('roi-hours');
    const clsEl = document.getElementById('roi-close');
    if (!entEl || !hrsEl || !clsEl) return;

    const ent = parseInt(entEl.value, 10) || 3;
    const hrs = parseInt(hrsEl.value, 10) || 35;
    const closeDays = parseInt(clsEl.value, 10) || 14;

    document.getElementById('roi-entities-val').textContent = ent + (ent === 1 ? ' Entity' : ' Entities');
    document.getElementById('roi-hours-val').textContent = hrs + ' hrs / wk';
    document.getElementById('roi-close-val').textContent = closeDays + ' Days';

    const annualHoursSaved = Math.round(hrs * 52 * 0.78 + ent * 65);
    const annualValue = annualHoursSaved * 30;
    const estCost = ent === 1 ? 5500 : (ent <= 4 ? 10500 : 18500);
    const paybackMonths = Math.max(1.2, (estCost / (annualValue / 12))).toFixed(1);

    document.getElementById('roi-out-hours').textContent = annualHoursSaved.toLocaleString('en-US') + ' hrs/yr';
    document.getElementById('roi-out-dollars').textContent = '$' + annualValue.toLocaleString('en-US') + ' / yr';
    document.getElementById('roi-out-close').textContent = closeDays > 10 ? 'Same-Day / 48h' : 'Real-Time Daily';
    document.getElementById('roi-out-payback').textContent = paybackMonths + ' Months';
  }

  // ---------------- INTERACTIVE SCOPE & PRICING CONFIGURATOR ----------------
  function updateConfigurator() {
    const rowsEl = document.getElementById('cfg-out-rows');
    const titleEl = document.getElementById('cfg-out-title');
    const scaleEl = document.getElementById('cfg-out-scale');
    const totalEl = document.getElementById('cfg-out-total');
    const weeksEl = document.getElementById('cfg-out-weeks');
    if (!rowsEl) return;

    let baseCost = state.cfgScaleAdd;
    let totalWeeks = state.cfgScale >= 5 ? 3 : 2;
    const selectedMods = [];

    document.querySelectorAll('#cfg-mod-checks input[type="checkbox"]').forEach(cb => {
      const card = cb.closest('.cfg-check');
      if (cb.checked) {
        if (card) card.classList.add('active');
        const c = parseInt(cb.dataset.cost, 10) || 0;
        const w = parseInt(cb.dataset.wks, 10) || 0;
        baseCost += c;
        totalWeeks += w;
        selectedMods.push([cb.value, c]);
      } else if (card) {
        card.classList.remove('active');
      }
    });

    titleEl.textContent = state.cfgInd + ' System';
    scaleEl.textContent = state.cfgScaleLabel;

    let html = `<tr><td>Organizational Scale (${state.cfgScaleLabel})</td><td class="r num">${state.cfgScaleAdd ? '+$' + state.cfgScaleAdd.toLocaleString('en-US') : 'Base'}</td></tr>`;
    selectedMods.forEach(([nm, c]) => {
      html += `<tr><td>${nm}</td><td class="r num">$${c.toLocaleString('en-US')}</td></tr>`;
    });
    rowsEl.innerHTML = html;

    const low = baseCost;
    const high = Math.round((baseCost * 1.22) / 500) * 500;
    const rangeStr = `$${low.toLocaleString('en-US')} to $${high.toLocaleString('en-US')}`;
    totalEl.textContent = rangeStr;

    // Scope points (scale + modules) map to a delivery window: 1 to 2 Weeks for a typical scope, 1 to 3 only for the heaviest full-module enterprise scope.
    const minW = 1;
    const maxW = totalWeeks >= 10 ? 3 : 2;
    weeksEl.textContent = `${minW} to ${maxW} Weeks`;

    const indSel = document.getElementById('lead-industry');
    if (indSel) {
      Array.from(indSel.options).forEach(opt => {
        if (opt.value === state.cfgInd) indSel.value = state.cfgInd;
      });
    }

    state.lastCfgSummary = {
      industry: state.cfgInd,
      scale: state.cfgScaleLabel,
      modules: selectedMods.map(m => m[0]),
      range: rangeStr,
      weeks: `${minW} to ${maxW} Weeks`
    };
  }

  // ---------------- BUILD LEAD BRIEF TEXT ----------------
  function buildBriefText() {
    const name = (document.getElementById('lead-name')?.value || '').trim() || 'Prospective Client';
    const company = (document.getElementById('lead-company')?.value || '').trim() || 'Not specified';
    const role = (document.getElementById('lead-role')?.value || '').trim() || 'Executive';
    const contact = (document.getElementById('lead-contact')?.value || '').trim() || 'Via Direct Channel';
    const industry = document.getElementById('lead-industry')?.value || state.cfgInd;
    const budget = document.getElementById('lead-budget')?.value || 'Custom Scope';
    const notes = (document.getElementById('lead-notes')?.value || '').trim() || 'Interested in an architecture walkthrough and custom quotation.';
    const cfg = state.lastCfgSummary || { scale: state.cfgScaleLabel, modules: ['Core Dataverse ERP & Ledger'], range: '$9,500+', weeks: '1 to 2 Weeks' };

    return [
      'ISABI SYSTEMS - EXECUTIVE ARCHITECTURE INQUIRY',
      '==============================================',
      `Client Name: ${name} (${role})`,
      `Company / Group: ${company}`,
      `Contact Details: ${contact}`,
      `Industry Vertical: ${industry}`,
      `Target Tier: ${budget}`,
      `Configured Scale: ${cfg.scale}`,
      `Selected Modules: ${cfg.modules.join(', ')}`,
      `Indicative Investment Range: ${cfg.range} (${cfg.weeks})`,
      '',
      'Operational Goals & Notes:',
      notes
    ].join('\n');
  }

  // ---------------- SCROLL REVEAL (progressive, reduced-motion safe) ----------------
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length || !('IntersectionObserver' in window)) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    document.documentElement.classList.add('js-io');
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.add('in');
        el.addEventListener('transitionend', () => el.classList.add('done'), { once: true });
        setTimeout(() => el.classList.add('done'), 1200);
        io.unobserve(el);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
    els.forEach(el => io.observe(el));
  }

  // ---------------- THEME MANAGEMENT ----------------
  function applyTheme(t, persist) {
    const mode = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    if (persist) {
      try { localStorage.setItem('isabi.theme.v2', mode); } catch (e) {}
    }
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.textContent = mode === 'light' ? 'Dark' : 'Light';
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', mode === 'light' ? '#F4F2EE' : '#0B1730');
    }
  }

  // ---------------- EVENT LISTENERS & INIT ----------------
  function init() {
    const savedTheme = (() => { try { return localStorage.getItem('isabi.theme.v2'); } catch (e) { return null; } })() || 'light';
    applyTheme(savedTheme, false);

    renderAppSuite();
    renderIndustries();
    renderSandbox();
    renderAiSection(0, true);
    updateRoi();
    updateConfigurator();
    initReveal();
    const yearEl = document.getElementById('ftr-year');
    if (yearEl) yearEl.textContent = String(NOW.getFullYear());

    // Handle initial hash on page load immediately (zero previous-section bleed)
    if (window.location.hash && window.location.hash.length > 1) {
      const initId = window.location.hash.slice(1);
      scrollToTargetId(initId, false, true);
      window.addEventListener('load', () => scrollToTargetId(initId, false, true), { once: true });
    } else {
      updateActiveNavOnScroll();
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash && window.location.hash.length > 1) {
        scrollToTargetId(window.location.hash.slice(1), false, false);
      }
    });

    // Scroll spy listener
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
      if (!scrollTicking) {
        window.requestAnimationFrame(() => {
          updateActiveNavOnScroll();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      renderIndustries();
    }, { passive: true });

    // Theme toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark', true);
    });

    // Global delegated clicks
    document.addEventListener('click', e => {
      // 00a. Hero Interactive Screen Mode Switcher (dashboard | pos | apps | ai)
      const heroScreenBtn = e.target.closest('[data-hero-screen]');
      if (heroScreenBtn) {
        state.heroScreen = heroScreenBtn.dataset.heroScreen;
        renderHeroStage();
        return;
      }

      // 00b. Hero Currency Switcher (USD | EUR | AED)
      const heroCurrBtn = e.target.closest('[data-hero-curr]');
      if (heroCurrBtn) {
        state.heroCurr = heroCurrBtn.dataset.heroCurr;
        state.sboxCurr = state.heroCurr;
        const currSel = document.getElementById('sbox-curr-sel');
        if (currSel) currSel.value = state.heroCurr;
        renderHeroStage();
        renderSandbox();
        return;
      }

      // 00c. Hero Vertical Filter Pill or Row Click
      const heroIndBtn = e.target.closest('[data-hero-ind]');
      if (heroIndBtn) {
        state.heroInd = heroIndBtn.dataset.heroInd;
        renderHeroStage();
        return;
      }

      // 00d. Hero Mini App Explorer Chip Click
      const heroAppBtn = e.target.closest('[data-hero-app]');
      if (heroAppBtn) {
        state.heroAppId = heroAppBtn.dataset.heroApp;
        state.activeAppId = state.heroAppId;
        renderHeroStage();
        renderAppSuite();
        return;
      }

      // 00e. Hero Ask ISABI Topic Chip Click
      const heroAiTopicBtn = e.target.closest('[data-hero-ai-topic]');
      if (heroAiTopicBtn) {
        state.heroAiTopic = heroAiTopicBtn.dataset.heroAiTopic;
        renderHeroStage();
        return;
      }

      // 00f. Hero Bottom Quick AI Prompt Pill Click -> Switch Hero to AI screen or open drawer
      const heroAiQBtn = e.target.closest('[data-hero-ai-q]');
      if (heroAiQBtn) {
        const q = heroAiQBtn.dataset.heroAiQ || '';
        if (q.includes('overdue')) state.heroAiTopic = 'ar';
        else if (q.includes('Compare')) state.heroAiTopic = 'margin';
        else state.heroAiTopic = 'sprint';
        state.heroScreen = 'ai';
        renderHeroStage();
        return;
      }

      // 0a. Section 01 Architecture View Tabs (18-App Ecosystem | 4-Layer Stack | Why Not Templates?)
      const archViewBtn = e.target.closest('[data-arch-view]');
      if (archViewBtn) {
        const vKey = archViewBtn.dataset.archView;
        state.archView = vKey;
        document.querySelectorAll('[data-arch-view]').forEach(b => b.classList.toggle('active', b === archViewBtn));
        document.querySelectorAll('[data-arch-panel]').forEach(p => {
          if (p.dataset.archPanel === vKey) {
            p.removeAttribute('data-panel-hidden');
          } else {
            p.setAttribute('data-panel-hidden', '1');
          }
        });
        return;
      }

      // 0b. 18-App Suite Category Filter Pills
      const appCatBtn = e.target.closest('[data-app-cat]');
      if (appCatBtn) {
        state.appCat = appCatBtn.dataset.appCat;
        document.querySelectorAll('[data-app-cat]').forEach(b => b.classList.toggle('active', b === appCatBtn));
        renderAppSuite();
        return;
      }

      // 0c. 18-App Suite Tile Click -> Update Spotlight
      const appTileBtn = e.target.closest('[data-app-id]');
      if (appTileBtn) {
        state.activeAppId = appTileBtn.dataset.appId;
        renderAppSuite();
        return;
      }

      // 0d. Section 03 Sandbox Surface Mode Tabs (erp | soa | pwa)
      const sboxModeBtn = e.target.closest('[data-sbox-mode]');
      if (sboxModeBtn) {
        state.sboxMode = sboxModeBtn.dataset.sboxMode;
        document.querySelectorAll('[data-sbox-mode]').forEach(b => b.classList.toggle('active', b === sboxModeBtn));
        renderSandbox();
        return;
      }

      // 0e. Sandbox SOA Document Sub-Tabs
      const soaDocBtn = e.target.closest('[data-soa-doc]');
      if (soaDocBtn) {
        state.soaDoc = soaDocBtn.dataset.soaDoc;
        renderSandbox();
        return;
      }

      // 0f. Sandbox Interactive POS Till & Biometric Kiosk Playground
      const posAddBtn = e.target.closest('[data-pos-add]');
      if (posAddBtn) {
        const [nm, pr] = posAddBtn.dataset.posAdd.split('|');
        const price = parseFloat(pr) || 10;
        const existing = state.posCart.find(x => x.name === nm);
        if (existing) {
          existing.qty += 1;
        } else {
          state.posCart.push({ name: nm, price, qty: 1 });
        }
        renderSandbox();
        renderHeroStage();
        showToast('Added ' + nm + ' to Offline POS Till');
        return;
      }

      const posClearBtn = e.target.closest('[data-pos-clear]');
      if (posClearBtn) {
        state.posCart = [{ name: 'VIP Cabana Full Day', price: 120, qty: 1 }];
        renderSandbox();
        renderHeroStage();
        showToast('POS Till reset');
        return;
      }

      const posSyncBtn = e.target.closest('[data-pos-sync]');
      if (posSyncBtn) {
        state.posSyncedCount += 1;
        renderSandbox();
        renderHeroStage();
        showToast('Thermal receipt printed (0.2s) & synced to Dataverse bhf_revenue!');
        return;
      }

      const kioskPunchBtn = e.target.closest('[data-kiosk-punch]');
      if (kioskPunchBtn) {
        const [empName, matchScore] = kioskPunchBtn.dataset.kioskPunch.split('|');
        const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        state.kioskLastPunch = {
          name: empName,
          time: nowStr,
          score: matchScore + ' Match (0.8s)',
          status: 'Synced to Dataverse bhf_punch ✓'
        };
        renderSandbox();
        renderHeroStage();
        showToast('Verified ' + empName + ' via Face + PIN');
        return;
      }

      // 0g. Section 04 Microsoft Stack Pillar Tabs
      const msTabBtn = e.target.closest('[data-ms-tab]');
      if (msTabBtn) {
        const key = msTabBtn.dataset.msTab;
        state.msTab = key;
        document.querySelectorAll('[data-ms-tab]').forEach(b => b.classList.toggle('active', b === msTabBtn));
        document.querySelectorAll('[data-ms-card]').forEach(c => {
          if (key === 'all' || c.dataset.msCard === key) {
            c.removeAttribute('data-ms-hidden');
          } else {
            c.setAttribute('data-ms-hidden', '1');
          }
        });
        return;
      }

      // 0h. Section 06 Desktop & Mobile Pricing View Switcher (tiers | builder | guarantee)
      const priceViewBtn = e.target.closest('[data-price-view]');
      if (priceViewBtn) {
        activatePricingView(priceViewBtn.dataset.priceView);
        return;
      }

      // 0i. Section 07 FAQ Category Filter Tabs
      const faqCatBtn = e.target.closest('[data-faq-cat]');
      if (faqCatBtn) {
        const cat = faqCatBtn.dataset.faqCat;
        document.querySelectorAll('[data-faq-cat]').forEach(b => b.classList.toggle('active', b === faqCatBtn));
        document.querySelectorAll('#faq-grid [data-faq-item]').forEach(item => {
          const show = cat === 'all'
            || (cat === 'top' && item.dataset.faqTop === '1')
            || item.dataset.faqItem === cat;
          if (show) {
            item.removeAttribute('data-faq-hidden');
          } else {
            item.setAttribute('data-faq-hidden', '1');
          }
        });
        return;
      }

      // 0j. Section 08 Quick-Fill Project Topic Chips
      const topicChip = e.target.closest('[data-topic-ind]');
      if (topicChip) {
        document.querySelectorAll('[data-topic-ind]').forEach(b => b.classList.toggle('active', b === topicChip));
        const indVal = topicChip.dataset.topicInd;
        const noteVal = topicChip.dataset.topicNote;
        const tierVal = topicChip.dataset.topicTier;
        const indSel = document.getElementById('lead-industry');
        if (indSel) indSel.value = indVal;
        const tierSel = document.getElementById('lead-budget');
        if (tierSel && tierVal) tierSel.value = tierVal;
        const notesEl = document.getElementById('lead-notes');
        if (notesEl) notesEl.value = noteVal;
        showToast('Pre-filled project brief for ' + indVal);
        return;
      }

      // 1. Footer / Quick Jump to a specific Industry Blueprint
      const gotoInd = e.target.closest('[data-goto-ind]');
      if (gotoInd) {
        e.preventDefault();
        state.activeInd = gotoInd.dataset.gotoInd;
        renderIndustries();
        scrollToTargetId('industries');
        return;
      }

      // 2. Any hash anchor link (<a href="#...">) -> exact section scroll + immediate underline update
      const hashLink = e.target.closest('a[href^="#"]');
      if (hashLink && !hashLink.id?.includes('ftr-install-link')) {
        const href = hashLink.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          scrollToTargetId(href.slice(1));
          return;
        }
      }

      // 3. Mobile Section 1 Contrast Card Switcher
      const archTab = e.target.closest('[data-arch-tab]');
      if (archTab) {
        const targetKey = archTab.dataset.archTab;
        archTab.parentElement.querySelectorAll('[data-arch-tab]').forEach(b => b.classList.toggle('active', b === archTab));
        document.querySelectorAll('[data-arch-card]').forEach(card => {
          if (card.dataset.archCard === targetKey) {
            card.removeAttribute('data-mob-hide');
          } else {
            card.setAttribute('data-mob-hide', '1');
          }
        });
        return;
      }

      // 4. Section 5 Ingenuity Switcher (Matrix | ROI | Advantages | Roadmap)
      const ingTab = e.target.closest('[data-ing-tab]');
      if (ingTab) {
        activateMobileIngTab(ingTab.dataset.ingTab);
        return;
      }

      // 5. Mobile Section 6 Pricing Tier & Builder Switcher
      const tierTab = e.target.closest('[data-tier-tab]');
      if (tierTab) {
        activateMobilePricingTab(tierTab.dataset.tierTab);
        return;
      }

      // 6. Mobile Section 7 Portal Switcher (Brief Form vs Direct Channels)
      const portalTab = e.target.closest('[data-portal-tab]');
      if (portalTab) {
        activateMobilePortalTab(portalTab.dataset.portalTab);
        return;
      }

      // 5. Industry Blueprint Selector Tab
      const indBtn = e.target.closest('[data-ind-id]');
      if (indBtn) {
        state.activeInd = indBtn.dataset.indId;
        renderIndustries();
        if (window.innerWidth <= 720) {
          const det = document.getElementById('ind-detail');
          if (det) {
            const r = det.getBoundingClientRect();
            if (r.top > window.innerHeight * 0.7 || r.top < 60) {
              scrollToTargetId('ind-detail', false);
            }
          }
        }
        return;
      }

      // 6. Desktop & Mobile Industry Detail Sub-Tab (Modules | Day-in-the-Life | Before/After | Reports)
      const indSubTab = e.target.closest('[data-ind-subtab]');
      if (indSubTab) {
        state.indMobTab = indSubTab.dataset.indSubtab;
        renderIndustries();
        return;
      }

      // 7. Load Industry in Live ERP Sandbox
      const loadSbox = e.target.closest('[data-load-sandbox]');
      if (loadSbox) {
        const bd = document.getElementById('ai-drawer-backdrop');
        if (bd) bd.hidden = true;
        state.sboxMode = 'erp';
        document.querySelectorAll('[data-sbox-mode]').forEach(b => b.classList.toggle('active', b.dataset.sboxMode === 'erp'));
        state.sboxInd = loadSbox.dataset.loadSandbox;
        renderSandbox();
        scrollToTargetId('sandbox');
        showToast('Loaded the ' + (SBOX_LABELS[state.sboxInd] || state.sboxInd) + ' environment in the Live Sandbox');
        return;
      }

      // 8. Configure Industry Scope & Price
      const cfgIndJump = e.target.closest('[data-configure-ind]');
      if (cfgIndJump) {
        const bd = document.getElementById('ai-drawer-backdrop');
        if (bd) bd.hidden = true;
        state.cfgInd = cfgIndJump.dataset.configureInd;
        document.querySelectorAll('#cfg-ind-pills .cfg-pill').forEach(b => {
          b.classList.toggle('active', b.dataset.cfgInd === state.cfgInd);
        });
        updateConfigurator();
        activatePricingView('builder');
        scrollToTargetId('scope-configurator');
        return;
      }

      // 9. Sandbox Industry Switcher
      const sboxIndBtn = e.target.closest('[data-sbox-ind]');
      if (sboxIndBtn) {
        state.sboxInd = sboxIndBtn.dataset.sboxInd;
        renderSandbox();
        return;
      }

      // 10. Sandbox Left-Rail Module Navigation
      const sboxNavBtn = e.target.closest('[data-sbox-nav]');
      if (sboxNavBtn) {
        state.sboxNav = sboxNavBtn.dataset.sboxNav;
        if (state.sboxNav === 'General Ledger' || state.sboxNav === 'Audit Trail' || state.sboxNav === 'Paginated .RDL') {
          state.sboxMobTab = 'ledger';
        } else {
          state.sboxMobTab = 'chart';
        }
        renderSandbox();
        showToast('Viewing ERP module: ' + state.sboxNav);
        return;
      }

      // 11. Mobile Sandbox View Switcher (Chart & Entities | General Ledger & Alerts)
      const sboxMobTabBtn = e.target.closest('[data-sbox-mobtab]');
      if (sboxMobTabBtn) {
        state.sboxMobTab = sboxMobTabBtn.dataset.sboxMobtab;
        renderSandbox();
        return;
      }

      const sboxActBtn = e.target.closest('[data-sbox-act]');
      if (sboxActBtn) {
        openAiDrawer('Provide an executive action plan for: ' + sboxActBtn.dataset.sboxAct);
        return;
      }

      const sboxThemeBtn = e.target.closest('[data-sbox-t]');
      if (sboxThemeBtn) {
        const t = sboxThemeBtn.dataset.sboxT;
        document.getElementById('sandbox-wrap')?.setAttribute('data-sbox-theme', t);
        document.querySelectorAll('[data-sbox-t]').forEach(b => b.classList.toggle('active', b === sboxThemeBtn));
        return;
      }

      const aiResetBtn = e.target.closest('[data-ai-reset]');
      if (aiResetBtn) {
        e.preventDefault();
        resetAiThread();
        return;
      }

      const aiIdxBtn = e.target.closest('[data-ai-idx]');
      if (aiIdxBtn) {
        const idx = parseInt(aiIdxBtn.dataset.aiIdx, 10) || 0;
        renderAiSection(idx);
        return;
      }

      const aiAskBtn = e.target.closest('[data-ai-ask]');
      if (aiAskBtn) {
        askIsabiQuestion(aiAskBtn.dataset.aiAsk, false);
        return;
      }

      const openAiBtn = e.target.closest('[data-open-ai]');
      if (openAiBtn) {
        openAiDrawer(openAiBtn.dataset.openAi);
        return;
      }

      const tierBtn = e.target.closest('[data-select-tier]');
      if (tierBtn) {
        const tier = tierBtn.dataset.selectTier;
        const bSel = document.getElementById('lead-budget');
        if (bSel) bSel.value = tier;
        scrollToTargetId('portal');
        if (window.innerWidth > 720) {
          setTimeout(() => document.getElementById('lead-name')?.focus(), 500);
        }
        showToast('Selected ' + tier + '. Add your details below and send the brief to Hussein.');
        return;
      }

      const cfgIndPill = e.target.closest('[data-cfg-ind]');
      if (cfgIndPill) {
        state.cfgInd = cfgIndPill.dataset.cfgInd;
        document.querySelectorAll('#cfg-ind-pills .cfg-pill').forEach(b => b.classList.toggle('active', b === cfgIndPill));
        updateConfigurator();
        return;
      }

      const cfgScalePill = e.target.closest('[data-cfg-scale]');
      if (cfgScalePill) {
        state.cfgScale = parseInt(cfgScalePill.dataset.cfgScale, 10) || 1;
        state.cfgScaleLabel = cfgScalePill.dataset.scaleLabel;
        state.cfgScaleAdd = parseInt(cfgScalePill.dataset.scaleAdd, 10) || 0;
        document.querySelectorAll('#cfg-scale-pills .cfg-pill').forEach(b => b.classList.toggle('active', b === cfgScalePill));
        updateConfigurator();
        return;
      }
    });

    // Sandbox selects
    document.addEventListener('change', e => {
      if (e.target.id === 'sbox-period-sel') {
        state.sboxPeriod = e.target.value;
        renderSandbox();
      } else if (e.target.id === 'sbox-curr-sel') {
        state.sboxCurr = e.target.value;
        renderSandbox();
      } else if (e.target.closest('#cfg-mod-checks')) {
        updateConfigurator();
      }
    });

    // ROI sliders
    ['roi-entities', 'roi-hours', 'roi-close'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateRoi);
    });

    // Header & Mobile Ask ISABI buttons
    document.getElementById('hdr-ask-btn')?.addEventListener('click', () => openAiDrawer());
    document.getElementById('mob-ask-btn')?.addEventListener('click', () => openAiDrawer());
    document.getElementById('ai-inline-reset')?.addEventListener('click', resetAiThread);
    document.getElementById('ai-drawer-reset')?.addEventListener('click', resetAiThread);
    document.getElementById('close-ai-drawer')?.addEventListener('click', () => {
      document.getElementById('ai-drawer-backdrop').hidden = true;
    });
    document.getElementById('ai-drawer-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'ai-drawer-backdrop') e.target.hidden = true;
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const bd = document.getElementById('ai-drawer-backdrop');
        if (bd && !bd.hidden) bd.hidden = true;
      }
    });

    document.getElementById('ai-inline-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('ai-inline-input');
      const q = (inp?.value || '').trim();
      if (!q) return;
      askIsabiQuestion(q, false, true);
      inp.value = '';
    });

    document.getElementById('ai-drawer-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('ai-drawer-input');
      const q = (inp?.value || '').trim();
      if (!q) return;
      askIsabiQuestion(q, false, true);
      inp.value = '';
    });

    // Configurator CTAs
    document.getElementById('cfg-wa-btn')?.addEventListener('click', () => {
      const brief = buildBriefText();
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(brief)}`, '_blank', 'noopener');
    });

    document.getElementById('cfg-portal-btn')?.addEventListener('click', () => {
      const notesEl = document.getElementById('lead-notes');
      const cfg = state.lastCfgSummary;
      if (notesEl && cfg && !notesEl.value.trim()) {
        notesEl.value = `Configured Scope: ${cfg.industry} (${cfg.scale}). Modules: ${cfg.modules.join(', ')}. Indicative Range: ${cfg.range}.`;
      }
      scrollToTargetId('portal');
      if (window.innerWidth > 720) {
        setTimeout(() => document.getElementById('lead-name')?.focus(), 500);
      }
      showToast('Scope loaded into the inquiry form');
    });

    // Portal Dispatch Buttons
    document.getElementById('portal-send-wa')?.addEventListener('click', () => {
      const brief = buildBriefText();
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(brief)}`, '_blank', 'noopener');
    });

    document.getElementById('portal-send-email')?.addEventListener('click', () => {
      const company = (document.getElementById('lead-company')?.value || '').trim() || 'Enterprise Inquiry';
      const ind = document.getElementById('lead-industry')?.value || state.cfgInd;
      const subj = `ISABI Systems Consultation - ${company} (${ind})`;
      const body = buildBriefText();
      window.location.href = `mailto:${EMAIL_ADDR}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
    });

    document.getElementById('portal-copy-brief')?.addEventListener('click', () => {
      const brief = buildBriefText();
      navigator.clipboard?.writeText(brief).then(() => {
        showToast('Project Brief copied to clipboard');
      });
    });

    document.getElementById('copy-email-btn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(EMAIL_ADDR).then(() => {
        showToast('Copied ' + EMAIL_ADDR + ' to clipboard');
      });
    });

    document.getElementById('portal-print-brief')?.addEventListener('click', () => {
      window.print();
    });

    // PWA Install Handling
    const installBtn = document.getElementById('install-pwa-btn');
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.deferredPrompt = e;
      if (installBtn) installBtn.hidden = false;
    });

    function triggerInstall() {
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        state.deferredPrompt.userChoice.then(() => {
          state.deferredPrompt = null;
          if (installBtn) installBtn.hidden = true;
        });
      } else {
        showToast('To install: tap Share in your browser and choose "Add to Home Screen"');
      }
    }

    installBtn?.addEventListener('click', triggerInstall);
    document.getElementById('ftr-install-link')?.addEventListener('click', e => {
      e.preventDefault();
      triggerInstall();
    });

    // Register Service Worker with immediate update check & single-reload controllerchange
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          location.reload();
        }
      });
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
        reg.update().catch(() => {});
      }).catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
"""

import json  # noqa: E402
from part_endpoints import ASK_FLOW_U_B64, ASK_FLOW_K_B64  # noqa: E402
from part_icons import ICONS  # noqa: E402
JS = (
    JS.replace('__ASK_FLOW_U_B64__', ASK_FLOW_U_B64)
    .replace('__ASK_FLOW_K_B64__', ASK_FLOW_K_B64)
    .replace('__ICONS_JSON__', json.dumps(ICONS))
)
