# Client-side JavaScript for ISABI Systems PWA

JS = r"""
(function () {
  'use strict';

  const WA_NUMBER = '96170444955';
  const EMAIL_ADDR = 'hbdeir16@gmail.com';
  const SEC_IDS = ['architecture', 'industries', 'sandbox', 'microsoft-ai', 'ingenuity', 'pricing', 'portal'];

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
        'Daily Outlet Revenue & Z-Report Auditing (Entrance, Cabanas, F&B, Events)',
        'Supplier Invoices, Food & Beverage Cost Control & Stock Takes',
        'Partner Statement of Accounts (SOA) & Automated Profit-Split Engine',
        'Seasonal Staff Contracts, Advances, Tips & Biometric Attendance'
      ],
      workflows: [
        'Offline POS till syncs daily Z-aggregates straight into the revenue ledger',
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
      name: 'Automotive, Heavy Trucks & Parts Trading',
      sub: 'VIN chassis tracking, bonded customs stock, showroom sales & SOA',
      badge: 'Industry Blueprint 02 · Trading & Dealership Operations',
      lead: 'Built for vehicle importers, heavy truck distributors, and spare-parts wholesalers managing high-value inventory across bonded warehouses, showrooms, and workshop service bays with strict multi-currency accounting.',
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
      lead: 'The executive crown for business owners and holding groups operating across several industries. Consolidates cash, receivables, profitability, partner capital accounts, and group talent pipelines into a single boardroom cockpit.',
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
      lead: 'When internet drops at a busy beach club, restaurant, or retail counter, cloud web pages freeze. ISABI Systems builds custom offline-first Progressive Web App tills that keep ringing sales, print thermal receipts locally, and sync to Dataverse automatically.',
      modules: [
        'Touch-Optimized Cashier Grid with Category Tabs, Modifiers & Fast Search',
        'IndexedDB / Local Offline Transaction Queue (100% functional without internet)',
        'Direct RawBT / ESC-POS Thermal Receipt & Kitchen Order Printing',
        'Shift Open / Close Cash Drawer Count & Variance Audit',
        'Automated Daily Z-Aggregate Sync into Dataverse Revenue Ledger'
      ],
      workflows: [
        'Cashier rings order and prints local thermal receipt in under 300ms',
        'If Wi-Fi or 4G drops, orders queue locally with zero interruption',
        'On shift close, manager reconciles cash + card totals and posts directly to ERP',
        'Zero per-terminal SaaS licensing fees'
      ],
      reports: [
        'Shift Z-Report & Cashier Cash Variance Log',
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
      lead: 'Replace proprietary fingerprint hardware that breaks and requires manual USB exports. Our tablet Attendance Kiosk verifies staff via face recognition + PIN, works offline at remote plants or resorts, and computes daily attendance into your ERP every night.',
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
      seriesNames: ['Auto & Trucks', 'Manufacturing', 'Hospitality'],
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
        ['Auto & Truck Dealership', 249.0, '21.4%', 'Today 17:15', 'closed', 'Balanced'],
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
        ['19 Oct', 'SI-2026-0841', 'Auto Dealership', '70100 Vehicle & Parts Sales', 0, 18450.00],
        ['19 Oct', 'TK-2026-4412', 'Concrete Plant', '70200 Ready-Mix Batch Sales (m³)', 0, 14200.00],
        ['19 Oct', 'POS-Z-0192', 'Flagship Resort', '70600 Outlet & Cabana Revenue', 0, 9640.00],
        ['18 Oct', 'RC-2026-1109', 'Group Treasury', '51100 Bank USD Settlement', 32500.00, 0],
        ['18 Oct', 'PI-2026-0518', 'Concrete Plant', '60110 Bulk Cement Silo Intake', 9790.00, 0]
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
        ['19 Oct', 'POS-Z-0814', 'Flagship Resort', '70610 Beach & Cabana Admissions', 0, 6420.00],
        ['19 Oct', 'POS-Z-0815', 'Flagship Resort', '70400 Restaurant & Bar TTC', 0, 8910.00],
        ['19 Oct', 'PI-2026-0392', 'Sunset Bay Club', '60210 F&B Provisions & Beverages', 3180.00, 0],
        ['18 Oct', 'JV-SOA-0041', 'All Properties', '45100 Partner Profit Split Allocation', 12150.00, 0],
        ['18 Oct', 'RC-2026-0912', 'Boutique Suites', '70120 Event & Banquet Deposit', 0, 4500.00]
      ]
    },
    trading: {
      groupTitle: 'Automotive & Heavy Truck Trading',
      viewTitle: 'Dealership, VIN Stock & SOA Overview',
      seriesNames: ['Heavy Trucks', 'Passenger & SUV', 'Spare Parts & Service'],
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
        ['Heavy Truck Division', 190.0, '17.5%', 'Today 16:40', 'closed', 'Reconciled'],
        ['Passenger & Fleet Division', 108.0, '20.4%', 'Today 17:10', 'closed', 'Reconciled'],
        ['Central Spare Parts Depot', 36.5, '31.2%', 'Today 16:55', 'closed', 'Reconciled'],
        ['Service & Warranty Bay', 14.5, '44.0%', 'Today 15:20', 'closed', 'Reconciled']
      ],
      alerts: [
        ['crit', '5 fleet customer installments past 60 days', 'Automated SOA PDF ready for WhatsApp & Email dispatch', 'Send SOA'],
        ['good', '3 heavy truck chassis cleared customs today', 'Landed cost allocated · Moved from Bonded to Showroom stock', 'View VINs'],
        ['warn', 'Fast-moving brake & filter SKUs below safety stock', 'Suggested supplier reorder batch generated', 'Order List'],
        ['good', 'Monthly statutory reconciliation verified', 'Operational sales, stock, and cash match statutory trial balance', 'Recon RDL']
      ],
      journal: [
        ['19 Oct', 'SI-TRK-0419', 'Heavy Truck Div', '70110 Heavy Truck Sales (VIN #8841)', 0, 68500.00],
        ['19 Oct', 'SI-PRT-1902', 'Spare Parts Depot', '70150 Wholesale Parts Invoicing', 0, 4820.00],
        ['19 Oct', 'LC-2026-0118', 'Heavy Truck Div', '60120 Customs & Port Clearance', 11400.00, 0],
        ['18 Oct', 'RC-2026-0774', 'Passenger Div', '51100 Dealer Installment Collection', 61920.00, 0],
        ['18 Oct', 'SV-2026-0310', 'Service Bay', '70500 Workshop Labor & Overhaul', 0, 2950.00]
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
        ['19 Oct', 'TK-2026-8821', 'Batch Plant #1', '70100 Ready-Mix C35 Structural (185 m³)', 0, 15725.00],
        ['19 Oct', 'TK-2026-8822', 'Mixer Fleet', '70300 Concrete Pump Boom Service', 0, 2400.00],
        ['19 Oct', 'PI-2026-0612', 'Batch Plant #1', '60100 Bulk Cement & Admixture Intake', 8950.00, 0],
        ['18 Oct', 'JV-DSL-0104', 'Mixer Fleet', '61300 Transit Mixer Diesel Allocation', 1840.00, 0],
        ['18 Oct', 'RC-2026-1402', 'Construction Div', '51100 Contractor Progress Collection', 22500.00, 0]
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
        ['19 Oct', 'RN-2026-0312', 'Boulevard Center', '70100 Q4 Anchor Retail Lease Billing', 0, 24500.00],
        ['19 Oct', 'RN-2026-0313', 'Harbor Residences', '70120 Penthouse Annual Lease', 0, 18000.00],
        ['18 Oct', 'RC-2026-0509', 'Logistics Park', '51100 Tenant Wire Transfer Settlement', 38900.00, 0],
        ['18 Oct', 'WO-2026-0088', 'Harbor Residences', '61400 Elevator & Generator Service', 3600.00, 0]
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
        ['good', '19 November corporate renewals pre-quoted', 'Comparison sheets & WhatsApp renewal summaries queued', 'Pipeline'],
        ['crit', '6 policy installments past 30-day grace window', 'Client SOA statements generated for account executives', 'Collect'],
        ['warn', '2 motor claims awaiting surveyor repair approval', 'Workshop estimate uploaded to SharePoint claim folder', 'Claims'],
        ['good', 'Monthly carrier net payable reconciled', 'Commission splits verified across 8 underwriting carriers', 'Settlement']
      ],
      journal: [
        ['19 Oct', 'POL-MED-4102', 'Medical Line', '70100 Corporate Group Medical Policy', 0, 28400.00],
        ['19 Oct', 'COM-MED-4102', 'Medical Line', '70800 Brokerage Commission Earned', 0, 4260.00],
        ['19 Oct', 'PAY-CAR-0091', 'Trust Account', '40100 Carrier Net Premium Settlement', 24140.00, 0],
        ['18 Oct', 'RC-PRM-1820', 'Motor & Fleet', '51100 Fleet Policy Premium Collection', 8520.00, 0]
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
        ['Levant Logistics · Heavy Truck Div', 'SI-TRK-0298', '64 Days', '$14,800.00'],
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
        ['Auto & Truck Trading', 'Vehicle VIN / Chassis & Customs Bill', 'Per-unit landed cost & dealer aging SOA'],
        ['Concrete & Manufacturing', 'Batch Ticket (m³), Mix Grade & Silo MT', 'Raw material yield & contractor credit gate'],
        ['Real Estate & Insurance', 'Lease Schedule / Policy & Endorsement', 'NOI yield / Carrier commission bordereaux']
      ],
      total: ['Deployment Timeframe', '3 to 6 Weeks to Live Production'],
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
      citation: 'Proven in live multi-million-dollar trading, manufacturing, and hospitality estates'
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
    deferredPrompt: null
  };

  let navScrollLockUntil = 0;
  let scrollTargetId = null;

  // ---------------- HELPERS ----------------
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
    trading: 'Auto & Truck Trading',
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
  const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const CURR_MULT = { USD: { mult: 1, sym: 'USD' }, EUR: { mult: 0.92, sym: 'EUR' }, AED: { mult: 3.67, sym: 'AED' } };
  const PERIOD_MULT = { mtd: { mult: 1, label: 'October 2026 (MTD)' }, qtd: { mult: 2.85, label: 'Q4 2026 (QTD)' }, ytd: { mult: 9.4, label: 'FY 2026 (YTD)' } };

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
      g += `<g class="col" data-m="${m} 2026" data-t="${total}k ${sym}" data-tip="${tip}">`
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
      ['trading', 'Auto & Truck Trading'],
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
        <td class="mu hide-xs">${r[0]}</td>
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
              <option value="mtd" ${state.sboxPeriod === 'mtd' ? 'selected' : ''}>October 2026 (MTD)</option>
              <option value="qtd" ${state.sboxPeriod === 'qtd' ? 'selected' : ''}>Q4 2026 (QTD)</option>
              <option value="ytd" ${state.sboxPeriod === 'ytd' ? 'selected' : ''}>FY 2026 (YTD)</option>
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
  }

  // ---------------- ASK ISABI AI SIMULATOR ----------------
  function formatAiMessageHTML(item) {
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

    const totLabel = item.total[0] || 'Total';
    const totVal = item.total[item.total.length - 1] || '';

    return `
      <div class="ai-msg-user">${item.q}</div>
      <div class="ai-msg-bot">
        ${BADGE_MINI_SVG}
        <div class="ai-bot-bubble">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#D9A54A;font-weight:700;margin-bottom:4px">ISABI · ${item.title}</div>
          <p>${item.answer}</p>
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
          <div class="ai-bot-meta">
            <span>${item.citation}</span>
            <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hello Hussein, I tested Ask ISABI on your website (' + item.title + ') and would like to discuss building this for our company.')}" target="_blank" rel="noopener" style="color:#D9A54A;font-weight:700">Discuss on WhatsApp</a>
          </div>
        </div>
      </div>
    `;
  }

  function matchCustomAiQuestion(qText) {
    const low = qText.toLowerCase();
    if (low.includes('price') || low.includes('cost') || low.includes('budget') || low.includes('tier')) {
      return Object.assign({}, AI_PROMPTS[3], { q: qText });
    }
    if (low.includes('reconcil') || low.includes('accountant') || low.includes('parallel') || low.includes('dual')) {
      return Object.assign({}, AI_PROMPTS[2], { q: qText });
    }
    if (low.includes('receiv') || low.includes('overdue') || low.includes('60') || low.includes('aging')) {
      return Object.assign({}, AI_PROMPTS[0], { q: qText });
    }
    return {
      q: qText,
      title: 'Custom Architectural Assessment',
      answer: 'ISABI Systems builds every application directly on <b>Microsoft Dataverse, Power Apps, Power Automate, and Power BI</b>, tailored to your exact entities and chart of accounts. Here is how we structure a bespoke implementation for your query:',
      headers: ['Phase', 'Engineering Deliverable', 'Timeline', 'Verification'],
      rows: [
        ['01. Schema & COA', 'Custom Dataverse tables, Business Units & role security', 'Week 1 to 2', 'Live ERP Forms'],
        ['02. Workflows & PWAs', 'Automated approvals, SOA generators & field POS/Kiosks', 'Week 2 to 4', 'End-to-End Test'],
        ['03. Power BI & .RDL', 'XMLA semantic models & printable Statement of Accounts', 'Week 3 to 5', '100% Reconciled'],
        ['04. Ask ISABI AI', 'Native AI wired to your live ledger and operational tables', 'Week 5 to 6', 'Production Go-Live']
      ],
      total: ['Indicative Investment Range', '$4,500 to $18,000+'],
      citation: 'Direct Principal Engineering by Hussein Bdeir · Zero Off-the-Shelf Compromises'
    };
  }

  function renderAiSection(idx = 0) {
    const pillsEl = document.getElementById('ai-prompt-pills');
    const threadEl = document.getElementById('ai-inline-thread');
    const drawerPills = document.getElementById('drawer-prompt-pills');
    const drawerThread = document.getElementById('ai-drawer-thread');

    const pillsHtml = AI_PROMPTS.map((p, i) => `
      <button type="button" class="ai-pill-btn ${i === idx ? 'active' : ''}" data-ai-idx="${i}">${p.q}</button>
    `).join('');

    if (pillsEl) pillsEl.innerHTML = pillsHtml;
    if (drawerPills) drawerPills.innerHTML = pillsHtml;

    const item = AI_PROMPTS[idx] || AI_PROMPTS[0];
    const msgHtml = formatAiMessageHTML(item);
    if (threadEl) threadEl.innerHTML = msgHtml;
    if (drawerThread && !drawerThread.innerHTML.trim()) {
      drawerThread.innerHTML = msgHtml;
    }
  }

  function openAiDrawer(customQ) {
    const backdrop = document.getElementById('ai-drawer-backdrop');
    const drawerThread = document.getElementById('ai-drawer-thread');
    if (!backdrop || !drawerThread) return;
    backdrop.hidden = false;
    if (customQ) {
      const resp = matchCustomAiQuestion(customQ);
      drawerThread.innerHTML = formatAiMessageHTML(resp);
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

    const minW = Math.max(3, Math.min(8, totalWeeks - 1));
    const maxW = minW + 2;
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
    const cfg = state.lastCfgSummary || { scale: state.cfgScaleLabel, modules: ['Core Dataverse ERP & Ledger'], range: '$9,500+', weeks: '4 to 6 Weeks' };

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

  // ---------------- THEME MANAGEMENT ----------------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('isabi.theme', t); } catch (e) {}
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.textContent = t === 'light' ? 'Dark' : 'Light';
    }
  }

  // ---------------- EVENT LISTENERS & INIT ----------------
  function init() {
    const savedTheme = (() => { try { return localStorage.getItem('isabi.theme'); } catch (e) { return null; } })() || 'dark';
    applyTheme(savedTheme);

    renderIndustries();
    renderSandbox();
    renderAiSection(0);
    updateRoi();
    updateConfigurator();

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
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
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
        state.sboxInd = loadSbox.dataset.loadSandbox;
        renderSandbox();
        scrollToTargetId('sandbox');
        showToast('Loaded ' + state.sboxInd.toUpperCase() + ' environment in Live ERP Sandbox');
        return;
      }

      // 8. Configure Industry Scope & Price
      const cfgIndJump = e.target.closest('[data-configure-ind]');
      if (cfgIndJump) {
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

      const aiIdxBtn = e.target.closest('[data-ai-idx]');
      if (aiIdxBtn) {
        const idx = parseInt(aiIdxBtn.dataset.aiIdx, 10) || 0;
        renderAiSection(idx);
        const drawerThread = document.getElementById('ai-drawer-thread');
        if (drawerThread) drawerThread.innerHTML = formatAiMessageHTML(AI_PROMPTS[idx]);
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
        showToast('Selected ' + tier + '. Complete your details below to connect with Hussein.');
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
    document.getElementById('close-ai-drawer')?.addEventListener('click', () => {
      document.getElementById('ai-drawer-backdrop').hidden = true;
    });
    document.getElementById('ai-drawer-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'ai-drawer-backdrop') e.target.hidden = true;
    });

    document.getElementById('ai-drawer-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('ai-drawer-input');
      const q = (inp?.value || '').trim();
      if (!q) return;
      const resp = matchCustomAiQuestion(q);
      document.getElementById('ai-drawer-thread').innerHTML = formatAiMessageHTML(resp);
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
      showToast('Scope loaded into Consultation Portal');
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

    // Register Service Worker with immediate update check
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
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
