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
        ['D0', 'POS-Z-0192', 'Flagship Resort', '70600 Outlet & Cabana Revenue', 0, 9640.00],
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
        { k: 'Vault & Bank Cash', v: 94.6, unit: 'k', d: 'All POS Z-reports matched', cls: '' },
        { k: 'Supplier Payables Due', v: 18.2, unit: 'k', d: '4 beverage vendors due Friday', cls: 'crit' },
        { k: 'Partner Splits', v: '4', unit: ' Properties', d: 'SOA journals balanced', cls: '', books: true, fixed: true }
      ],
      entities: [
        ['Flagship Beach Resort', 142.0, '61.2%', 'Today 18:10', 'closed', 'Z-Synced'],
        ['Sunset Bay Club', 84.5, '56.8%', 'Today 17:55', 'closed', 'Z-Synced'],
        ['Palms Waterfront', 48.2, '52.1%', 'Today 16:30', 'closed', 'Z-Synced'],
        ['Boutique Hotel Suites', 29.3, '64.0%', 'Today 15:45', 'warn', '1 Stamp Due']
      ],
      alerts: [
        ['good', 'Offline POS Tills synchronized (100%)', '1,420 receipts across 6 tills matched to bank & cash vault', 'View Tills'],
        ['warn', 'Beverage stock variance check', 'Sunset Bay bar inventory count scheduled for 23:00 close', 'Open Count'],
        ['crit', '4 supplier invoices due for settlement', 'Approved for Friday payment run · Partner split applied', 'Pay Run'],
        ['good', 'Biometric Attendance Kiosk synced', '118 seasonal & permanent staff shifts verified today', 'Roster']
      ],
      journal: [
        ['D0', 'POS-Z-0814', 'Flagship Resort', '70610 Beach & Cabana Admissions', 0, 6420.00],
        ['D0', 'POS-Z-0815', 'Flagship Resort', '70400 Restaurant & Bar TTC', 0, 8910.00],
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
        ['Hospitality & Resorts', 'Outlet Z-Report, Cabana & Seasonal Shift', 'Daily TTC revenue & partner split journal'],
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

  // ---------------- STATE ----------------
  const state = {
    activeSec: 'architecture',
    activeInd: 'hospitality',
    indMobTab: 'modules',
    sboxInd: 'holding',
    sboxNav: 'Overview',
    sboxPeriod: 'mtd',
    sboxCurr: 'USD',
    sboxTheme: 'auto',
    sboxMobTab: 'chart',
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
      // Align section top border 2px underneath the sticky header bottom border so zero pixels of the previous section show
      return Math.max(0, Math.round(rectTop - hdrH + 2));
    }
    return Math.max(0, Math.round(rectTop - hdrH - 14));
  }

  function activateMobilePricingTab(targetTier) {
    document.querySelectorAll('[data-tier-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tierTab === targetTier);
    });
    const grid = document.getElementById('pricing-tiers-grid');
    if (grid) {
      if (targetTier === 'builder') {
        grid.setAttribute('data-mob-hide', '1');
      } else {
        grid.removeAttribute('data-mob-hide');
      }
    }
    document.querySelectorAll('[data-tier-card]').forEach(card => {
      if (card.dataset.tierCard === targetTier) {
        card.removeAttribute('data-mob-hide');
      } else {
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
        panel.removeAttribute('data-mob-hide');
      } else {
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

    const targetEl = document.getElementById(cleanId);
    if (!targetEl) return;

    const mappedSec = cleanId === 'scope-configurator' ? 'pricing' : (SEC_IDS.includes(cleanId) ? cleanId : state.activeSec);
    setActiveSection(mappedSec);

    scrollTargetId = cleanId;
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

    // Re-verify exact alignment after smooth scroll settles
    clearTimeout(scrollToTargetId._verifyTimer);
    scrollToTargetId._verifyTimer = setTimeout(() => {
      if (scrollTargetId === cleanId) {
        const currentTarget = document.getElementById(cleanId);
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

    // If scrolled near the very bottom of the page, highlight portal
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

  // ---------------- RENDER INDUSTRY BLUEPRINTS ----------------
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
    tabsEl.innerHTML = INDUSTRIES.map(ind => `
      <button type="button" class="ind-tab ${ind.id === state.activeInd ? 'active' : ''}" role="tab" aria-selected="${ind.id === state.activeInd}" data-ind-id="${ind.id}">
        <b>${isMobile ? (IND_SHORT_NAMES[ind.id] || ind.name) : ind.name}</b>
        <small>${ind.sub}</small>
      </button>
    `).join('');

    const cur = INDUSTRIES.find(x => x.id === state.activeInd) || INDUSTRIES[0];
    const mTab = state.indMobTab || 'modules';

    detailEl.innerHTML = `
      <div class="ind-detail-top">
        <div>
          <span class="ind-badge-pill">${cur.badge}</span>
          <h3>${cur.name}</h3>
          <p class="ind-detail-lead">${cur.lead}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;width:100%">
          <button type="button" class="btn btn-outline" data-load-sandbox="${cur.sandboxKey}">Preview in Live ERP Sandbox</button>
          <button type="button" class="btn btn-brass" data-configure-ind="${cur.cfgName}">Price This Industry System</button>
        </div>
      </div>

      <div class="mob-seg-bar" role="tablist" aria-label="Blueprint Layers">
        <button type="button" class="mob-seg-btn ${mTab === 'modules' ? 'active' : ''}" data-ind-subtab="modules">Tables (${cur.modules.length})</button>
        <button type="button" class="mob-seg-btn ${mTab === 'workflows' ? 'active' : ''}" data-ind-subtab="workflows">Workflows (${cur.workflows.length})</button>
        <button type="button" class="mob-seg-btn ${mTab === 'reports' ? 'active' : ''}" data-ind-subtab="reports">Power BI &amp; RDL (${cur.reports.length})</button>
      </div>

      <div class="ind-cols">
        <div class="ind-box" data-ind-box="modules" ${mTab !== 'modules' ? 'data-mob-hide="1"' : ''}>
          <h4>Custom Tables &amp; Modules</h4>
          <ul>${cur.modules.map(m => `<li>${m}</li>`).join('')}</ul>
        </div>
        <div class="ind-box" data-ind-box="workflows" ${mTab !== 'workflows' ? 'data-mob-hide="1"' : ''}>
          <h4>Automated Cloud Workflows</h4>
          <ul>${cur.workflows.map(w => `<li>${w}</li>`).join('')}</ul>
        </div>
        <div class="ind-box" data-ind-box="reports" ${mTab !== 'reports' ? 'data-mob-hide="1"' : ''}>
          <h4>Power BI &amp; Printable .RDL</h4>
          <ul>${cur.reports.map(r => `<li>${r}</li>`).join('')}</ul>
        </div>
      </div>

      <div class="ind-ledger-strip">
        <div class="ind-metrics-mini">
          ${cur.metrics.map(m => `<div><small>${m[0]}</small><b class="num">${m[1]}</b></div>`).join('')}
        </div>
        <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I am interested in an ISABI Systems blueprint for ' + cur.name + '. Can we schedule a quick walkthrough?')}" target="_blank" rel="noopener" class="btn btn-wa">
          Discuss ${cur.cfgName} on WhatsApp
        </a>
      </div>
    `;
  }

  // ---------------- RENDER LIVE ERP SANDBOX ----------------
  // Rolling 12 months ending in the current month, so the sandbox never looks stale
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
    const W = 660, H = 244, ml = 44, mr = 10, mt = 16, mb = 28;
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
      ['holding', 'Group Holding'],
      ['hospitality', 'Hospitality & Resorts'],
      ['trading', 'Auto & Equipment Trading'],
      ['manufacturing', 'Concrete & Mfg'],
      ['realestate', 'Real Estate'],
      ['insurance', 'Insurance Brokerage']
    ];

    barEl.innerHTML = sboxChoices.map(([k, lbl]) => `
      <button type="button" class="sbox-ind-btn ${state.sboxInd === k ? 'active' : ''}" data-sbox-ind="${k}">${lbl}</button>
    `).join('');

    const d = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const totalMult = cm.mult * pm.mult;

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
              <span>Ask ISABI</span>
            </button>
          </div>
        </header>

        <section class="kpis">${kpisHtml}</section>

        <div class="sbox-mob-tabs" role="tablist" aria-label="Mobile Sandbox Views">
          <button type="button" class="sbox-mob-tab ${mTab === 'chart' ? 'active' : ''}" data-sbox-mobtab="chart">Chart &amp; Entities</button>
          <button type="button" class="sbox-mob-tab ${mTab === 'ledger' ? 'active' : ''}" data-sbox-mobtab="ledger">General Ledger &amp; Alerts</button>
        </div>

        <section class="row2" ${mTab !== 'chart' ? 'data-mob-hide="1"' : ''}>
          <div class="panel ${focusChart ? 'panel-focus' : ''}">
            <div class="ph">
              <h3>Monthly Revenue Trajectory (${cm.sym} thousands)</h3>
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
              <h3>Operating Entities &amp; Books Status</h3>
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
            <div class="ph"><h3>Executive Exceptions &amp; Watchdogs</h3></div>
            <ul class="att">
              ${d.alerts.map(a => `<li class="${a[0]}"><b>${a[1]}</b><span>${a[2]}</span><button type="button" class="att-act" data-sbox-act="${a[1]}">${a[3]}</button></li>`).join('')}
            </ul>
          </div>

          <div class="panel ${focusGl ? 'panel-focus' : ''}">
            <div class="ph">
              <h3>Audited General Ledger Stream (Double-Entry)</h3>
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
        title: 'Companion POS Till Z-Report Audit',
        answer: `All 6 offline-capable cashier tills across the resort properties closed their shifts and synced 1,420 receipts into the Dataverse Revenue Ledger with zero cash/card variance.`,
        headers: ['Outlet Till', 'Receipts', 'Payment Split', 'Synced TTC (' + s + ')'],
        rows: [
          ['Main Gate & Cabana Desk (2 Tills)', '412', 'Cash + Whish + Card', fmtMoney(6420, m, s)],
          ['Beach Restaurant & Sunset Bar (3 Tills)', '846', 'Cash + POS Terminal', fmtMoney(8910, m, s)],
          ['VIP Lounge & Pool Bar (1 Till)', '162', 'Room Charge + Card', fmtMoney(3140, m, s)]
        ],
        total: ['Total Audited Daily POS Revenue', fmtMoney(18470, m, s)],
        citation: 'Source: IndexedDB POS Queue to Dataverse bhf_revenue · Z-Reports matched',
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

    // 0a-AR. Arabic language handler (greetings, how are you, pricing, industries, accounting, or custom Arabic queries)
    if (lang === 'ar') {
      if (/(مرحبا|أهلا|اهلا|السلام|صباح|مساء|كيف\s*حالك|كيفك|شو\s*الأخبار|شو\s*الاخبار|شلونك|اخبارك)/.test(cleanQ)) {
        return {
          q: cleanQ,
          lang: 'ar',
          title: 'مرحباً بك · الذكاء التشغيلي والمالي لنظام ISABI',
          answer: `أهلاً بك! أنا <b>ISABI</b>، المساعد الذكي المدمج في أنظمة <b>ISABI Systems</b>. أعمل حالياً بكفاءة تامة ومتصل مباشرةً ببيئة العرض الحية (<b>${sbox.groupTitle} · ${cm.sym} · ${pm.label}</b>) وجميع الأنظمة التشغيلية والمحاسبية الثمانية. كيف يمكنني مساعدتك اليوم؟`,
          bullets: [
            `<b>تحليل الأرقام والقيود الحية:</b> اسألني عن الذمم المدينة المتأخرة، قيود اليومية المزدوجة، أو مؤشرات الأداء في بيئة التجربة.`,
            `<b>استكشاف حلول القطاعات:</b> الضيافة والمنتجعات، تجارة السيارات والمعدات الثقيلة، الخرسانة والتصنيع، العقارات، الوساطة التأمينية، والشركات القابضة.`,
            `<b>التكلفة، النطاق، والتنفيذ:</b> تبدأ الأنظمة المتكاملة من <b>$4,500+</b> (شركة واحدة) و<b>$9,500+</b> (متعدد الفروع والذكاء الاصطناعي) مع تسليم فعلي خلال <b>أسبوع إلى أسبوعين</b>.`
          ],
          citation: `النطاق النشط: ${sbox.groupTitle} · ${cm.sym} · ${pm.label}`,
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
          title: 'الاستثمار الشفاف وتقدير النطاق المخصص',
          answer: `تقدم <b>ISABI Systems</b> ثلاث باقات واضحة بنطاق عمل ثابت: <b>$4,500+</b> لشركة واحدة، و<b>$9,500+</b> للمجموعات متعددة الفروع مع الذكاء الاصطناعي، و<b>$18,000+</b> للشركات القابضة الكبرى. بناءً على إعداداتك الحالية (${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)})، يبلغ التقدير المبدئي <b>${escapeHtml(cfg.range)}</b> والتسليم خلال <b>أسبوع إلى أسبوعين</b>.`,
          bullets: [
            `<b>ملكية كاملة 100%:</b> يتم بناء النظام بالكامل داخل حساب شركتك الخاص في Microsoft 365 &amp; Dataverse دون أي عمولة على التراخيص.`,
            `<b>تطبيقات نقاط البيع والحضور مجاناً لكل جهاز:</b> لا توجد أي رسوم إضافية لكل جهاز لوحي أو كاشير ($0 / Terminal).`,
            `<b>تواصل مباشر مع المؤسس:</b> يمكنك إرسال متطلباتك مباشرة إلى <b>حسين بدير</b> عبر واتساب على الرقم <b>+961 70 444 955</b>.`
          ],
          citation: 'تقدير النطاق المباشر · ISABI Systems',
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
        title: 'استشارة هندسية ومحاسبية مخصصة · ISABI',
        answer: `بخصوص سؤالك <b>"${escapeHtml(cleanQ)}"</b>: تصمم <b>ISABI Systems</b> قواعد بيانات محاسبية وتشغيلية مخصصة على سحابة Microsoft Dataverse مع لوحات Power BI وتقارير كشوفات حساب جاهزة للطباعة (.RDL) ومطابقة تامة بنسبة 100% مع برنامج المحاسبة القانوني لشركتك.`,
        bullets: [
          `<b>مصمم حول طريقة عملك:</b> نبني الجداول، صلاحيات الفروع، والاعتمادات الآلية حسب دورة العمل الفعلية لفريقك وليس قوالب جاهزة جامدة.`,
          `<b>النطاق المقدر حالياً:</b> ${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)} بتكلفة تقديرية <b>${escapeHtml(cfg.range)}</b> ومدة تسليم <b>أسبوع إلى أسبوعين</b>.`,
          `<b>مراجعة مباشرة مع المهندس الرئيسي:</b> اضغط على <i>Discuss on WhatsApp</i> أدناه لمناقشة هذا السؤال مباشرة مع <b>حسين بدير (+961 70 444 955)</b>.`
        ],
        citation: 'إشراف وتنفيذ مباشر من حسين بدير · Microsoft Dataverse + Power BI + Ask ISABI',
        actionCfg: state.cfgInd,
        followUps: [
          'كم تكلفة النظام المتكامل لعدة فروع؟',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers'
        ]
      };
    }

    // 0a-FR. French language handler (greetings, comment ça va, prix, comptabilité, or custom French queries)
    if (lang === 'fr') {
      if (/(bonjour|salut|bonsoir|comment\s+ca\s+va|comment\s+ça\s+va|comment\s+allez|ça\s+va|ca\s+va)/i.test(low)) {
        return {
          q: cleanQ,
          lang: 'fr',
          title: 'Bienvenue · Intelligence Système ISABI',
          answer: `Bonjour ! Je vais très bien, merci. Je suis <b>ISABI</b>, l'assistant d'intelligence financière et opérationnelle intégré à <b>ISABI Systems</b>. Tous nos modèles Power BI et le grand livre en direct (<b>${sbox.groupTitle} · ${cm.sym} · ${pm.label}</b>) fonctionnent avec un écart de réconciliation de <b>0.00</b>. Comment puis-je vous aider ?`,
          bullets: [
            `<b>Interroger le Grand Livre en Direct :</b> Demandez l'analyse des créances clients, des écritures comptables ou des marges par filiale.`,
            `<b>8 Modèles Sectoriels en Production :</b> Hôtellerie &amp; Resorts, Négoce Auto &amp; Équipements Lourds, Béton &amp; Industrie, Immobilier, Courtage d'Assurance, Holdings, Caisse POS hors-ligne et Pointeuse Biométrique.`,
            `<b>Tarification Fixe &amp; Mise en Production en 1 à 2 Semaines :</b> Dès <b>$4,500+</b> (entité unique) ou <b>$9,500+</b> (multi-filiales + IA), déployé à 100% dans votre propre tenant Microsoft 365.`
          ],
          citation: `Contexte actif : ${sbox.groupTitle} · ${cm.sym} · ${pm.label}`,
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
          title: 'Investissement Transparent & Périmètre Configuré',
          answer: `ISABI Systems propose trois forfaits à périmètre fixe : <b>$4,500+</b> (Entité Unique), <b>$9,500+</b> (Multi-Filiales &amp; Suite IA), et <b>$18,000+</b> (Groupe / Holding). Selon votre configuration actuelle (${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)}), le budget indicatif est de <b>${escapeHtml(cfg.range)}</b> avec une mise en service en <b>1 à 2 semaines</b>.`,
          bullets: [
            `<b>Propriété Client à 100% :</b> Déployé directement dans votre tenant Microsoft 365 &amp; Dataverse, sans marge sur les licences Microsoft.`,
            `<b>0 $ par Terminal :</b> Les applications PWA de caisse (POS) et de pointage biométrique s'installent sur un nombre illimité de tablettes.`,
            `<b>Contact Direct :</b> Échangez directement avec <b>Hussein Bdeir</b> sur WhatsApp au <b>+961 70 444 955</b> pour un chiffrage précis.`
          ],
          citation: 'Configurateur de Périmètre ISABI Systems · Section 06',
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
        title: 'Architecture Sur Mesure · ISABI Systems',
        answer: `Concernant votre question <b>"${escapeHtml(cleanQ)}"</b> : ISABI Systems conçoit votre schéma relationnel Dataverse, vos règles de validation, vos modèles Power BI et vos relevés de compte imprimables (.RDL) sur mesure en <b>1 à 2 semaines</b>, tout en assurant une réconciliation parfaite avec votre comptabilité officielle.`,
        bullets: [
          `<b>Adapté à Vos Processus :</b> Multi-devises (USD, EUR, AED, LBP), TVA, isolation par filiale (Business Unit) et applications mobiles hors-ligne.`,
          `<b>Estimation Actuelle :</b> ${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)} (<b>${escapeHtml(cfg.range)}</b> en <b>1 à 2 semaines</b>).`,
          `<b>Échange Direct avec l'Architecte :</b> Cliquez sur <i>Discuss on WhatsApp</i> ci-dessous pour en parler directement avec <b>Hussein Bdeir (+961 70 444 955)</b>.`
        ],
        citation: 'Conçu directement par Hussein Bdeir · Microsoft Dataverse + Power BI + Ask ISABI',
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
        title: 'Operational Status · All Ledgers Reconciled',
        answer: `I am doing great, thank you for asking! All 8 production blueprints and the <b>${sbox.groupTitle}</b> live sandbox ledger (<b>${cm.sym} · ${pm.label}</b>) are online and reconciled at <b>0.00 variance</b>. I am ready to answer any question about your business operations, accounting workflows, live sandbox numbers, or project scope.`,
        bullets: [
          `<b>Test Live Financial &amp; Operational Queries:</b> Ask me why overdue receivables increased, audit today's double-entry journal vouchers, or analyze the <i>${sbox.groupTitle}</i> dashboard.`,
          `<b>Ask About Your Specific Industry:</b> Tell me how many branches, resorts, plants, properties, or showrooms you run and I will map the exact Dataverse &amp; Power BI architecture.`,
          `<b>Scope, Timeline &amp; Pricing:</b> Ask about our 1-to-2 week go-live roadmap, parallel-run reconciliation with your accountant's software, or fixed-scope tiers ($4,500+ / $9,500+ / $18,000+).`
        ],
        citation: `System Status: Online · ${sbox.groupTitle} · ${cm.sym} · ${pm.label}`,
        followUps: [
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'How does ISABI customize the ERP for my specific industry?',
          'What would a complete multi-branch system cost and include?',
          'How does dual-entry reconciliation work with our existing accountant software?'
        ]
      };
    }

    // 0c-EN. Greetings ("hello", "hi", "hey", "salam", "marhaba", "good morning", "test")
    if (/^(hi|hello|hey|hola|salam|marhaba|ahlan|good\s+(morning|afternoon|evening|day)|greetings|yo|hi\s+there|hello\s+there|hey\s+there|test|testing)[\s!.,?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        title: 'Welcome · Native System Intelligence',
        answer: `Hello! I am <b>ISABI</b>, the embedded intelligence assistant for ISABI Systems. I am currently connected to the <b>${sbox.groupTitle}</b> live sandbox (<b>${cm.sym} · ${pm.label}</b>) and the architectural blueprints across all 8 production apps. How can I help you today?`,
        bullets: [
          `<b>Query Live Sandbox Figures:</b> Ask to analyze the <i>${sbox.groupTitle}</i> dashboard, inspect today's double-entry journal vouchers, or review overdue receivables.`,
          `<b>Explore Industry Blueprints:</b> Ask how we build custom systems for Hospitality, Auto &amp; Equipment Trading, Concrete &amp; Manufacturing, Real Estate, Insurance, or Holding Groups.`,
          `<b>Scope, Pricing &amp; Delivery:</b> Ask about our fixed-scope tiers ($4,500+ / $9,500+ / $18,000+), Microsoft licensing, parallel-run reconciliation, or the 2-week go-live plan.`
        ],
        citation: `Active Context: ${sbox.groupTitle} · ${cm.sym} · ${pm.label}`,
        followUps: [
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'How does ISABI customize the ERP for my specific industry?',
          'What would a complete multi-branch system cost and include?',
          'How does dual-entry reconciliation work with our existing accountant software?'
        ]
      };
    }

    // 0b. Identity, Capabilities & Help ("who are you", "what can you do", "help", "how do you work")
    if (low.includes('who are you') || low.includes('what are you') || low.includes('what can you do') || low.includes('what do you do') || low === 'help' || low.includes('help me') || low.includes('how do you work') || low.includes('what is ask isabi')) {
      return {
        q: cleanQ,
        title: 'About Ask ISABI · System Intelligence',
        answer: `<b>Ask ISABI</b> is the native AI assistant built into every ISABI Systems ERP and Power BI environment. Unlike generic chatbots, it reads your governed Dataverse tables and semantic models under the signed-in user's exact security role and cites the vouchers behind every figure.`,
        bullets: [
          `<b>In Production:</b> Executives and accountants ask natural-language questions about overdue receivables, supplier payables, daily outlet revenue, silo stock, or trial balance variances.`,
          `<b>On This Showcase Portal:</b> You can test live sandbox queries across 6 industries in USD, EUR, or AED, drill into all 24 executive alerts, or ask about architecture, pricing, and timelines.`,
          `<b>Strict Permission Fence:</b> A branch user can only query their own Business Unit; owners and partners can query the consolidated group.`
        ],
        citation: 'Architecture: Microsoft Dataverse + Power BI XMLA + Role-Scoped AI',
        followUps: [
          'Why did receivables past 60 days increase this month?',
          'Show the audited journal entries for ' + sbox.groupTitle,
          'How does Ask ISABI treat confidential figures?'
        ]
      };
    }

    // 0c. Polite acknowledgments ("thanks", "thank you", "great", "cool", "ok", "got it")
    if (/^(thanks|thank\s+you|thx|ty|great|awesome|cool|nice|perfect|got\s+it|understood|ok|okay|bye|goodbye)[\s!.,?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        title: 'At Your Service',
        answer: `You're welcome! Whenever you are ready, you can test another live query below, switch the industry or currency in the Live Sandbox, or send your scope directly to <b>Hussein Bdeir</b> on WhatsApp (<b>+961 70 444 955</b>).`,
        citation: 'ISABI Systems · The Books Close on ISABI',
        followUps: [
          'What should I know before commissioning an ISABI system?',
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

    // 14. Contact, Location, Lebanon, Middle East, Hussein Bdeir, WhatsApp
    if (low.includes('where') || low.includes('lebanon') || low.includes('middle east') || low.includes('hussein') || low.includes('contact') || low.includes('whatsapp') || low.includes('call') || low.includes('demo') || low.includes('walkthrough')) {
      return {
        q: cleanQ,
        title: 'Direct Principal Access · Hussein Bdeir',
        answer: `ISABI Systems is founded and led by <b>Hussein Bdeir</b>. Based in Lebanon, we work with owner-led enterprises and multi-entity holding groups across the Middle East and internationally. You work directly with the principal architect who designs your accounting schema and writes your system.`,
        headers: ['Direct Channel', 'Details', 'Response Window'],
        rows: [
          ['WhatsApp & Mobile', '+961 70 444 955', 'Same-Day Direct Reply'],
          ['Executive Email', 'hbdeir16@gmail.com', 'RFP, COA & Scope Review'],
          ['Step 01 · Discovery Call', '30-minute architecture & workflow review on Teams/WhatsApp', 'No obligation'],
          ['Step 02 · Live Walkthrough', 'Production demo of Hospitality, Trading, Mfg, Real Estate & Insurance', 'Fixed-scope proposal']
        ],
        total: ['Direct WhatsApp Line', '+961 70 444 955'],
        citation: 'Source: ISABI Systems Executive Consultation Portal · Section 08',
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
        title: 'Offline-First Field Continuity & Auto-Sync',
        answer: `Our field-facing Progressive Web Apps (<b>POS Till</b> and <b>Biometric Attendance Kiosk</b>) run 100% offline using local IndexedDB storage and Service Worker caching. If your resort, restaurant, or plant loses internet or power, cashiers keep printing thermal receipts and staff keep punching in with zero interruption.`,
        bullets: [
          `<b>Write-Ahead Local Queue:</b> Every receipt and biometric punch is saved locally on the tablet first, with cryptographic revision tracking.`,
          `<b>Automatic Ledger Sync:</b> The moment internet connectivity returns, queued transactions sync into Microsoft Dataverse and update your Power BI dashboards automatically.`,
          `<b>Zero Per-Terminal Licensing:</b> Install on unlimited Android tablets, iPads, or PCs with $0 per-device software fees.`
        ],
        citation: 'Source: ISABI Offline-First PWA Architecture · POS & Attendance Kiosk',
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
        title: 'Statutory CoA Compatibility, Multi-Currency & VAT',
        answer: `ISABI Systems is built specifically for enterprises operating across multi-currency environments (<b>USD, EUR, AED, LBP</b>) and Lebanese / regional Chart of Accounts standards. Your external auditor or chief accountant can keep their existing statutory software (such as Dolphin, PIMS, QuickBooks, or SAP) while ISABI runs your live daily operations and reconciles to <b>0.00 variance</b>.`,
        bullets: [
          `<b>4-Digit Lebanese &amp; IFRS Chart of Accounts:</b> Native support for Class 1 to 7 accounts, TTC / HT / VAT split, and automated partner profit-sharing.`,
          `<b>Parallel-Run Reconciliation Workspace:</b> A dedicated Power BI workspace compares every operational voucher against your accountant's book line-by-line so nothing is ever lost during transition.`,
          `<b>Multi-Currency Treasury:</b> Track cashboxes, bank accounts, customer SOAs, and supplier balances in USD, EUR, AED, or local currency simultaneously.`
        ],
        citation: 'Source: ISABI Dual-Entry & Multi-Currency Financial Core',
        followUps: [
          'How does dual-entry reconciliation work with our existing accountant software?',
          'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
          'What would a complete multi-branch system cost and include?'
        ]
      };
    }

    // 17. Conversational Custom Question Handler (never dumps an unrelated table)
    return {
      q: cleanQ,
      isCustomFallback: true,
      title: 'Custom Architectural Guidance',
      answer: `Regarding <b>"${escapeHtml(cleanQ)}"</b>: ISABI Systems engineers custom relational tables, form rules, workflows, and Power BI models inside your own Microsoft 365 &amp; Dataverse tenant rather than forcing your team into an off-the-shelf template.`,
      bullets: [
        `<b>Tailored to Your Rules:</b> Whether you need custom approval gates, multi-currency treasury, partner profit splits, or offline field PWAs, the schema is generated around your exact process.`,
        `<b>Current Configured Scope:</b> ${escapeHtml(cfg.industry)} · ${escapeHtml(cfg.scale)} (indicative range <b>${escapeHtml(cfg.range)}</b> in <b>${escapeHtml(cfg.weeks)}</b>).`,
        `<b>Direct Architect Review:</b> Click <i>Discuss on WhatsApp</i> below to send this exact question to Hussein Bdeir (+961 70 444 955) for a direct technical answer.`
      ],
      citation: 'Engineered directly by Hussein Bdeir · Microsoft Dataverse + Power BI + Ask ISABI',
      actionCfg: state.cfgInd,
      followUps: [
        'How does ISABI customize the ERP for my specific industry?',
        'Analyze the ' + sbox.groupTitle + ' dashboard numbers',
        'What would a complete multi-branch system cost and include?'
      ]
    };
  }

  function formatWelcomeMessageHTML() {
    const sbox = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const chipsHtml = AI_PROMPTS.map(p =>
      `<button type="button" class="ai-followup-btn" data-ai-ask="${escapeHtml(p.q)}">${escapeHtml(p.q)}</button>`
    ).join('');

    return `
      <div class="ai-msg-bot">
        ${BADGE_MINI_SVG}
        <div class="ai-bot-bubble">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#D9A54A;font-weight:700;margin-bottom:4px">ISABI · System Intelligence</div>
          <p>Welcome. I am <b>ISABI</b>, the native intelligence assistant for ISABI Systems. Ask me any question below about your industry workflows, live sandbox figures (<b>${sbox.groupTitle} · ${cm.sym} · ${pm.label}</b>), statutory reconciliation, or pricing, or choose a topic to begin:</p>
          <div class="ai-followups">${chipsHtml}</div>
          <div class="ai-bot-meta">
            <span>Connected to Live Sandbox (${sbox.groupTitle}) &amp; 8 Live Production Apps</span>
            <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I am exploring ISABI Systems and would like to discuss a custom system for our business.')}" target="_blank" rel="noopener" style="color:#D9A54A;font-weight:700">WhatsApp Hussein</a>
          </div>
        </div>
      </div>
    `;
  }

  function formatAiMessageHTML(item) {
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

    return `
      <div class="ai-msg-user"${userDirAttr}>${escapeHtml(item.q)}</div>
      <div class="ai-msg-bot">
        ${BADGE_MINI_SVG}
        <div class="ai-bot-bubble"${dirAttr}>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#D9A54A;font-weight:700;margin-bottom:4px">ISABI · ${item.title}</div>
          <p>${item.answer}</p>
          ${bulletsHtml}
          ${tableBlockHtml}
          ${followUpsHtml}
          <div class="ai-bot-meta">
            <span>${item.citation}</span>
            <div class="ai-bot-actions">
              ${extraActions}
              <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I asked Ask ISABI ("' + item.q + '") and would like to discuss this for our company.')}" target="_blank" rel="noopener" style="color:#D9A54A;font-weight:700">Discuss on WhatsApp</a>
            </div>
          </div>
        </div>
      </div>
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
          : formatAiMessageHTML(resolveAskIsabi(AI_PROMPTS[0].q));
        threadEl.scrollTop = 0;
      }
      updateAiScopeBar();
      return;
    }

    const threadHtml = state.aiHistory.map(item => formatAiMessageHTML(item)).join('') + pendingHtml;
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
      'You are ISABI, the native operational and financial intelligence assistant for ISABI Systems (founded by Hussein Bdeir, WhatsApp +961 70 444 955, email hbdeir16@gmail.com).',
      'ISABI Systems engineers custom ERP applications, double-entry financial ledgers, Power BI semantic models, printable statements (.rdl), and offline-first field PWAs (POS Till and Biometric Attendance Kiosk) on the Microsoft Cloud (Dataverse + Entra ID + Power Automate + Power BI) in 1 to 2 weeks.',
      'We have 8 live production apps: (1) Hospitality & Resorts, (2) Automotive & Heavy Equipment Trading, (3) Concrete, Construction & Manufacturing, (4) Real Estate & Property Development, (5) Insurance Brokerage & Underwriting, (6) Multi-Entity Group Holding, (7) Custom POS & Offline Till PWA, (8) Biometric Attendance Kiosk PWA.',
      'Pricing tiers: Tier 1 Single-Entity Foundation from $4,500+ (1 week); Tier 2 Multi-Entity & AI Suite from $9,500+ (1 to 2 weeks); Tier 3 Enterprise Holding from $18,000+ (2 weeks). Clients own 100% of their Microsoft 365 tenant and pay $0 per terminal for companion PWAs.',
      'Parallel-run reconciliation: our systems run alongside the client accountant existing statutory software (Dolphin, PIMS, QuickBooks, SAP, etc.) and reconcile line-by-line to 0.00 variance.',
      'Formatting rules: NEVER use em-dashes or unicode arrows. Reply in the same language as the user question (Detected language: ' + lang + ').',
      'Return ONLY a valid JSON object matching this schema: {"title": "Short executive heading", "answer": "2-3 sentence answer (<b> tags allowed for emphasis)", "bullets": ["<b>Point 1:</b> detail", "<b>Point 2:</b> detail"], "headers": [], "rows": [], "total": [], "citation": "Source citation", "followUps": ["Follow-up question 1", "Follow-up question 2", "Follow-up question 3"]}. Only populate headers/rows/total when a table is genuinely helpful; for conversational or conceptual questions leave headers and rows as empty arrays [] and use bullets instead.'
    ].join('\n');
  }

  function buildGeminiUserPrompt(qText) {
    const sbox = SANDBOX_DATA[state.sboxInd] || SANDBOX_DATA.holding;
    const cm = CURR_MULT[state.sboxCurr] || CURR_MULT.USD;
    const pm = PERIOD_MULT[state.sboxPeriod] || PERIOD_MULT.mtd;
    const cfg = state.lastCfgSummary || { industry: state.cfgInd, scale: state.cfgScaleLabel, range: '$12,300 to $15,000', weeks: '1 to 2 Weeks' };
    const recent = state.aiHistory.slice(-4).map(h => 'User: ' + h.q + '\nISABI: ' + (h.title || '') + ' - ' + String(h.answer || '').replace(/<[^>]+>/g, '')).join('\n\n');
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
      return {
        q: cleanQ,
        lang: lang,
        title: String(obj.title || fallbackResp.title || 'System Intelligence').replace(/[\u2014\u2192]/g, '-'),
        answer: String(obj.answer).replace(/[\u2014\u2192]/g, '-'),
        bullets: Array.isArray(obj.bullets) ? obj.bullets.map(b => String(b).replace(/[\u2014\u2192]/g, '-')) : (fallbackResp.bullets || []),
        headers: Array.isArray(obj.headers) && obj.headers.length ? obj.headers : undefined,
        rows: Array.isArray(obj.rows) && obj.rows.length ? obj.rows : undefined,
        total: Array.isArray(obj.total) && obj.total.length ? obj.total : undefined,
        citation: String(obj.citation || fallbackResp.citation || 'ISABI Systems · Native AI Intelligence').replace(/[\u2014\u2192]/g, '-'),
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
      renderAiThreads(false);
      return;
    }
    state.activeAiPillIdx = idx;
    state.aiReset = false;
    state.aiPendingQ = null;
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

    // In headless tests or preset chip clicks, resolve immediately while logging real visitor clicks in background
    if (navigator.webdriver || window.__ISABI_SYNC_TEST || !fromInputSubmit) {
      state.aiPendingQ = null;
      state.aiHistory.push(localResp);
      if (state.aiHistory.length > 8) state.aiHistory.shift();
      renderAiThreads(true);
      return;
    }

    // Show "ISABI is analyzing..." thinking indicator for typed visitor questions & invoke Phase 2 Cloud Flow
    state.aiPendingQ = { q: clean, lang: lang };
    renderAiThreads(true);

    const minDelay = new Promise(r => setTimeout(r, 380));
    Promise.all([callAskIsabiCloud(clean, lang, localResp), minDelay]).then(([finalResp]) => {
      if (!state.aiPendingQ || state.aiPendingQ.q !== clean) return;
      state.aiPendingQ = null;
      state.aiHistory.push(finalResp || localResp);
      if (state.aiHistory.length > 8) state.aiHistory.shift();
      renderAiThreads(true);
    });
  }

  function resetAiThread() {
    state.aiHistory = [];
    state.aiReset = true;
    state.aiPendingQ = null;
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

      // 4. Mobile Section 5 Ingenuity Switcher (Matrix vs ROI)
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

      // 6. Mobile Industry Detail Sub-Tab (Tables | Workflows | Power BI & RDL)
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

from part_endpoints import ASK_FLOW_U_B64, ASK_FLOW_K_B64  # noqa: E402
JS = JS.replace('__ASK_FLOW_U_B64__', ASK_FLOW_U_B64).replace('__ASK_FLOW_K_B64__', ASK_FLOW_K_B64)
