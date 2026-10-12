/**
 * The EJO 100 roadmap — every module planned after Version 1, what it will
 * do, and how it connects to what already runs. Shown to everyone on the
 * Roadmap pages, so nobody mistakes "not yet" for "never".
 *
 * Plain data (no database), so it is the same for every organisation and
 * cheap to render. Status "Planned" = designed, not built.
 */
export type RoadmapPhase = { name: string; items: string[] };
export type RoadmapModule = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  icon: 'people' | 'payroll' | 'finance' | 'procurement' | 'suppliers' | 'warehouse' | 'factory' | 'documents' | 'reports' | 'crm' | 'assets' | 'mobile' | 'ai' | 'plug' | 'brand' | 'help';
  phases: RoadmapPhase[];
  connects: { label: string; href: string }[];
};

export const ROADMAP: RoadmapModule[] = [
  {
    key: 'hr',
    name: 'HR & People',
    tagline: 'Every employee, from the gate to the payslip.',
    description: 'One record per person — who they are, where they work, when they arrive and leave, how they perform — feeding Payroll directly, with nothing typed twice.',
    icon: 'people',
    phases: [
      { name: 'Employee records', items: [
        'Full employee file: personal details, next of kin, CV, level of education, certificates and documents',
        'Date joined, contract type (permanent, contract, intern, casual), probation and contract end reminders',
        'Grade, job title, line manager, department and branch — the structure you already keep',
        'Self-service on My Profile: view your record, request corrections',
      ] },
      { name: 'Gate check-in & vehicles', items: [
        'Staff register the vehicles they own; any vehicle used on a given day is recorded at the gate',
        'Staff without a vehicle check in on foot at the gate',
        'Security sees, live, how many staff are on the compound and which staff vehicles are inside',
        'Built on the Security desk that already runs visitors, vehicles and exit passes',
      ] },
      { name: 'Clock in, clock out & attendance', items: [
        'Clock in and out at the workplace (QR scan, kiosk or phone), per branch and department',
        'Working-day rules per organisation — e.g. start 8:00, 8 working hours, grace to 8:30',
        'Lateness rules applied automatically — e.g. after 8:30 the day counts as 7 hours',
        'Leaving during working hours needs a Manager’s approval (the exit pass you already use); unapproved absence is deducted',
        'Overtime: staying beyond hours, approved by the Manager, counted separately',
        'Daily, weekly and monthly attendance summaries per person, department and branch',
      ] },
      { name: 'Staff ID cards', items: [
        'ID card generated from the employee record, with photo, employee ID and a QR code',
        'Virtual ID card on every staff member’s own portal',
        'Later: smart (NFC) cards — tap to check in at the gate or clock in, and to see balances',
      ] },
      { name: 'Leave, performance & recruitment', items: [
        'Leave types, balances and approvals; who is away, at a glance',
        'Targets and performance reviews — including what each person brings in (jobs, sales) from data the platform already holds',
        'Recruitment: openings, candidates, interviews, offers — becoming employees in one step',
        'Headcount planning per branch and department',
      ] },
    ],
    connects: [{ label: 'Users', href: '/users' }, { label: 'Security desk', href: '/security' }, { label: 'Organisation structure', href: '/structure' }],
  },
  {
    key: 'payroll',
    name: 'Payroll',
    tagline: 'Pay calculated from real attendance — accurate to the hour.',
    description: 'Salaries computed from HR attendance — per day, per week and per month — with Nigerian statutory deductions, approvals and bank-ready payment files.',
    icon: 'payroll',
    phases: [
      { name: 'Calculation', items: [
        'Daily rate from the working-day rules; hours actually worked from clock-in / clock-out',
        'Lateness and unapproved absence deducted; approved permissions and leave paid',
        'Overtime at the organisation’s own rates',
        'Allowances, bonuses, commissions and one-off adjustments',
      ] },
      { name: 'Statutory & deductions', items: [
        'PAYE income tax, pension (employee and employer contributions), NHF and other deductions',
        'Salary advances and staff loans, repaid automatically',
      ] },
      { name: 'Payment & records', items: [
        'Payroll runs with review and approval (prepared → checked → approved)',
        'Payslips on each person’s own portal and by email',
        'Bank payment schedule export; payroll journals into Finance',
      ] },
    ],
    connects: [{ label: 'HR & People', href: '/roadmap/hr' }, { label: 'Finance', href: '/roadmap/finance' }],
  },
  {
    key: 'finance',
    name: 'Finance & Accounting',
    tagline: 'The books, kept by the work itself.',
    description: 'A full general ledger fed automatically by payments, refunds, purchases, stock and payroll — so the accounts match the operations without re-keying.',
    icon: 'finance',
    phases: [
      { name: 'Ledger', items: ['Chart of accounts, cost centres per branch and department', 'Automatic journals from payments, refunds, goods receipts, stock issues and payroll', 'Period close and audit trail'] },
      { name: 'Receivables & payables', items: ['Customer invoices, statements and ageing', 'Supplier bills, payment runs and ageing', 'Bank reconciliation'] },
      { name: 'Tax, budgets & statements', items: ['VAT and withholding tax', 'Budgets vs actuals per cost centre', 'Profit & loss, balance sheet and cash flow — per branch, business unit and group'] },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }, { label: 'Workshop payments', href: '/workshop' }],
  },
  {
    key: 'procurement',
    name: 'Procurement',
    tagline: 'From request to purchase order, approved at every step.',
    description: 'Purchase requisitions, quotations, purchase orders and three-way matching — extending the outside-purchase approvals the workshop already uses.',
    icon: 'procurement',
    phases: [
      { name: 'Buying', items: ['Purchase requisitions from any department', 'Requests for quotation; quotes compared side by side', 'Purchase orders with approval limits by amount'] },
      { name: 'Receiving & matching', items: ['Goods receipts against the purchase order', 'Three-way match: order, receipt and supplier bill', 'Contracts and framework agreements'] },
    ],
    connects: [{ label: 'Outside purchases', href: '/workshop/external-procurement' }, { label: 'Inventory', href: '/inventory' }],
  },
  {
    key: 'suppliers',
    name: 'Suppliers',
    tagline: 'Know every supplier — and how well they deliver.',
    description: 'The supplier master: details, documents, price lists and performance, shared by Procurement, the Store and Finance.',
    icon: 'suppliers',
    phases: [
      { name: 'Supplier master', items: ['Company details, contacts, bank details (changes double-checked)', 'Registration documents and expiry reminders', 'Payment terms and price lists'] },
      { name: 'Performance', items: ['On-time delivery, quality and price scorecards', 'Preferred and blocked suppliers'] },
    ],
    connects: [{ label: 'Goods receipts', href: '/inventory' }],
  },
  {
    key: 'warehouse',
    name: 'Warehouse',
    tagline: 'Stock in many places, always where you think it is.',
    description: 'Multi-location stock: bins, transfers between branches, counts and scanning — on top of the stock and batch tracking the Store already keeps.',
    icon: 'warehouse',
    phases: [
      { name: 'Locations', items: ['Warehouses, zones and bins per branch', 'Transfers between branches with dispatch and receipt'] },
      { name: 'Accuracy', items: ['Cycle counts and stock takes with variance approval', 'Barcode and QR scanning for receipts, picks and counts', 'Batch, serial and expiry tracking across locations'] },
    ],
    connects: [{ label: 'Inventory', href: '/inventory' }, { label: 'Inventory Analytics', href: '/inventory/analytics' }],
  },
  {
    key: 'manufacturing',
    name: 'Manufacturing',
    tagline: 'Plan, make and cost what the group produces.',
    description: 'For the group’s manufacturing businesses: bills of materials, work orders, planning and true production cost.',
    icon: 'factory',
    phases: [
      { name: 'Production', items: ['Bills of materials and routings', 'Work orders: issue materials, record output and scrap', 'Material requirements planning'] },
      { name: 'Quality & cost', items: ['Quality checks at each stage', 'Actual vs standard cost per product'] },
    ],
    connects: [{ label: 'Inventory', href: '/inventory' }],
  },
  {
    key: 'crm',
    name: 'Sales & CRM',
    tagline: 'Every customer relationship in one place.',
    description: 'Leads, quotations and sales (including vehicle sales), with a 360° view of each customer built from the workshop history the platform already holds.',
    icon: 'crm',
    phases: [
      { name: 'Selling', items: ['Leads and opportunities by stage', 'Quotations and orders', 'Vehicle and parts sales'] },
      { name: 'Relationships', items: ['Customer 360: vehicles, visits, spend, warranties and complaints', 'Service reminders and campaigns (WhatsApp, SMS, email)', 'Loyalty and customer satisfaction'] },
    ],
    connects: [{ label: 'Customers', href: '/workshop/customers' }, { label: 'Service tracker', href: '/workshop/service-tracker' }],
  },
  {
    key: 'assets',
    name: 'Fleet & Assets',
    tagline: 'Everything the company owns, maintained and accounted for.',
    description: 'A register of company assets and vehicles — who has them, their condition, maintenance and depreciation.',
    icon: 'assets',
    phases: [
      { name: 'Register', items: ['Assets and company vehicles with tags (QR)', 'Assignment to staff and departments, with hand-over records'] },
      { name: 'Care & value', items: ['Maintenance schedules — company vehicles booked into the workshop', 'Depreciation into Finance'] },
    ],
    connects: [{ label: 'Workshop', href: '/workshop' }],
  },
  {
    key: 'documents',
    name: 'Documents',
    tagline: 'The right document, the right version, signed.',
    description: 'A central library for the organisation’s documents — versioned, permissioned and linked to the records they belong to.',
    icon: 'documents',
    phases: [
      { name: 'Library', items: ['Folders per organisation, branch and department', 'Versions, check-in / check-out and retention rules'] },
      { name: 'Signing', items: ['Templates and generated documents', 'Electronic approval and signature'] },
    ],
    connects: [{ label: 'Printed documents today', href: '/workshop/job-cards' }],
  },
  {
    key: 'reports',
    name: 'Reports',
    tagline: 'Any question, answered — and delivered on schedule.',
    description: 'A report builder over all modules, with saved reports, schedules and exports to Excel and PDF.',
    icon: 'reports',
    phases: [
      { name: 'Build & share', items: ['Report builder with filters, grouping and totals', 'Saved reports per role', 'Scheduled delivery by email', 'Export to Excel, CSV and PDF'] },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }],
  },
  {
    key: 'customer-app',
    name: 'Customer App',
    tagline: 'Customers book, follow and pay — from their phone.',
    description: 'Extends the Customer Portal: bookings, live job progress, estimate approval and online payment.',
    icon: 'mobile',
    phases: [
      { name: 'Self-service', items: ['Book a service and choose a time', 'Live job progress and photos', 'Approve estimates online', 'Pay online (card, transfer)'] },
    ],
    connects: [{ label: 'Vehicle Services', href: '/workshop/vehicle-service' }],
  },
  {
    key: 'intelligence',
    name: 'Intelligence',
    tagline: 'From what happened, to what to do next.',
    description: 'Forecasting, anomaly detection and an assistant on top of the analytics — built only once the data and the core are proven.',
    icon: 'ai',
    phases: [
      { name: 'Predict & advise', items: ['Demand and revenue forecasting', 'Anomaly detection (unusual discounts, stock movements, attendance)', 'Plain-language questions about your data, answered within your permissions'] },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }, { label: 'Inventory Analytics', href: '/inventory/analytics' }],
  },
  {
    key: 'integrations',
    name: 'Integrations',
    tagline: 'Connected to the tools the business already uses.',
    description: 'Messaging, payments and office tools connected — without moving work out of the platform.',
    icon: 'plug',
    phases: [
      { name: 'Connect', items: ['WhatsApp and SMS notifications', 'Payment gateways and bank feeds', 'Microsoft 365 / Google Workspace sign-in and calendars', 'Accounting exports'] },
    ],
    connects: [{ label: 'Notifications', href: '/notifications' }],
  },
  {
    key: 'branding',
    name: 'Branding',
    tagline: 'Each organisation, in its own colours.',
    description: 'Logo, colours and document styling per organisation — the platform runs many organisations, each looking like itself.',
    icon: 'brand',
    phases: [{ name: 'Brand', items: ['Logo and colours per organisation', 'Document and email styling', 'Custom domain per organisation'] }],
    connects: [{ label: 'Organisation', href: '/organisation' }],
  },
  {
    key: 'help',
    name: 'Help Center',
    tagline: 'Answers and guidance, inside the platform.',
    description: 'Guides for every role, what’s-new notes and a way to ask for help — without leaving the page you are on.',
    icon: 'help',
    phases: [{ name: 'Help', items: ['Step-by-step guides per role and module', 'What’s new in each release', 'Raise a support request'] }],
    connects: [{ label: 'My Profile — what I can do', href: '/profile' }],
  },
];

export const roadmapByKey = new Map(ROADMAP.map((m) => [m.key, m]));
