/**
 * The EJO 100 roadmap: every module planned after Version 1, what it will do,
 * how it will work, and which records it builds on. Shown to everyone on the
 * Roadmap pages, so nobody mistakes "not yet" for "never".
 *
 * Plain data (no database), so it is the same for every organisation and
 * cheap to render. Status "Planned" means designed, not built. `next` marks
 * the phase being built after Version 1 closes (the AI phase).
 */
export type RoadmapPhase = { name: string; items: string[] };
/** One part of the design: the data it keeps, who may do what, how it is computed. */
export type RoadmapDesign = { label: string; detail: string };
export type RoadmapGroup = 'next' | 'people' | 'work' | 'customers' | 'supply' | 'money' | 'platform';
export type RoadmapModule = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  icon:
    | 'people' | 'payroll' | 'finance' | 'procurement' | 'suppliers' | 'warehouse' | 'factory' | 'documents' | 'reports'
    | 'crm' | 'assets' | 'mobile' | 'ai' | 'plug' | 'brand' | 'help'
    | 'target' | 'chat' | 'flow' | 'car' | 'contract' | 'checklist' | 'star' | 'tag' | 'receipt' | 'fleet' | 'tablet' | 'database';
  group: RoadmapGroup;
  /** Built first, after Version 1. */
  next?: boolean;
  phases: RoadmapPhase[];
  /** How it will work: data model, permissions, computation, delivery. */
  design?: RoadmapDesign[];
  connects: { label: string; href: string }[];
};

export const ROADMAP_GROUPS: { key: RoadmapGroup; name: string; blurb: string }[] = [
  { key: 'next', name: 'Next: the AI phase', blurb: 'Built straight after Version 1, on data that is already governed and fenced.' },
  { key: 'people', name: 'People & performance', blurb: 'Employees, pay and the targets each person, team and branch works to.' },
  { key: 'work', name: 'Everyday work', blurb: 'Talking, approving, checking and documenting the work, wherever it happens.' },
  { key: 'customers', name: 'Customers & sales', blurb: 'Selling vehicles and service, keeping customers, and hearing what they think.' },
  { key: 'supply', name: 'Buying, stock & assets', blurb: 'From purchase request to the bin location, the factory floor and the tool crib.' },
  { key: 'money', name: 'Finance & tax', blurb: 'The ledger, budgets, VAT and e-invoicing, fed by the work itself.' },
  { key: 'platform', name: 'Data & platform', blurb: 'Reports, the data warehouse, integrations and each organisation’s look.' },
];

export const ROADMAP: RoadmapModule[] = [
  // ── Next: the AI phase ──────────────────────────────────────────────
  {
    key: 'help',
    name: 'AI support centre',
    tagline: 'Help desks for customers and staff, with an assistant that drafts the answer.',
    description: 'The customer side is live as the Support centre (v36): support@ / warranty@ / technical@ addresses, chat hand-overs and logged calls in one place, with targets, Enyo’s triage, drafts and answers to general questions, and satisfaction. Still to come: the staff help desk (“something is wrong here” from any page) and published guides.',
    icon: 'help',
    group: 'next',
    next: true,
    phases: [
      { name: 'Tickets (no AI yet)', items: [
        'Customer tickets from the customer portal’s Help page, linked to the vehicle, Job Card or payment they are about',
        'Staff tickets from any page (“something is wrong here”), with the page and error reference attached',
        'Routing to the right branch and department; owner, priority and due time (working days, Lagos)',
        'Replies by the portal and email; the customer never sees staff names, as on every customer email today',
        'Satisfaction question when a ticket is closed',
      ] },
      { name: 'Guides and answers', items: [
        'Step-by-step guides per role and module, and what’s new in each release',
        'Saved answers for common questions, kept by each organisation',
        'Guides link to the exact page the person needs, as analytics insights do',
      ] },
      { name: 'Assistant (AI)', items: [
        'Suggests a reply from the guides and from records the asker is allowed to see',
        'Customer side: answers about the customer’s own vehicles, jobs, payments and warranties only',
        'Staff side: “how do I…”, and “why can’t I…” answered from the permission catalogue',
        'A person approves every reply before it is sent; the ticket records “suggested by AI, sent by …”',
        'Hands over to a person whenever it is unsure, and on any complaint, refund or legal question',
      ] },
    ],
    design: [
      { label: 'Data', detail: 'SupportTicket (organisationId, branchId, raisedBy staff or customer, subject record, status OPEN → WAITING → RESOLVED → CLOSED, priority, dueAt), TicketMessage (author, body, visibility CUSTOMER or INTERNAL, aiSuggested flag, approvedBy), HelpArticle (organisation or platform-wide, versioned).' },
      { label: 'Permissions', detail: 'support.view and support.handle (branch or department scope) in the catalogue; customers reach only their own tickets through the customer session, never by an id from the URL.' },
      { label: 'AI boundary', detail: 'The assistant runs in the separate Python service (docs/AI_READINESS.md). It receives the asker’s question plus records fetched by the portal under the asker’s own permissions; it never queries the database itself and cannot send, close or refund anything.' },
      { label: 'Audit', detail: 'Every ticket change, every suggestion shown and every approval is an audit entry, so a reviewer can see what the assistant proposed and what the person actually sent.' },
      { label: 'Delivery', detail: '1) tickets and guides without AI; 2) assistant for staff questions about the platform; 3) assistant for customers, once the staff version has been measured for accuracy.' },
    ],
    connects: [{ label: 'My Profile: what I can do', href: '/profile' }, { label: 'Notifications', href: '/notifications' }],
  },
  {
    key: 'intelligence',
    name: 'Intelligence',
    tagline: 'From what happened, to what is likely next.',
    description: 'Forecasting and anomaly detection on top of the analytics the platform already computes, run in a separate Python service that only reads curated data and only advises.',
    icon: 'ai',
    group: 'next',
    next: true,
    phases: [
      { name: 'Insights on today’s analytics', items: [
        'Plain-language summaries of Business, Inventory and Warranty Analytics, each linking to the records behind it',
        'Questions about your data (“which branch had the most comebacks last month?”), answered within your permissions',
      ] },
      { name: 'Forecasting', items: [
        'Parts demand per part and branch, feeding reorder points and safety stock',
        'Workshop load and revenue per branch, by week',
        'Service due dates from mileage history (extends the vehicle picture on each vehicle page)',
      ] },
      { name: 'Anomaly detection', items: [
        'Unusual discounts, refunds, stock adjustments and price changes, sent to the manager to review',
        'Unusual sign-in or access patterns, sent to the organisation administrator',
        'Every alert says why it was raised and links to the exact record',
      ] },
    ],
    design: [
      { label: 'Service boundary', detail: 'A Python service (FastAPI, pandas / scikit-learn / statsmodels) behind an internal API with a service token. It reads curated, tenant-stamped views from the data warehouse, never the live tables, and writes results back only through the portal’s API as suggestions.' },
      { label: 'Fences', detail: 'Every request carries the organisation and the asking person’s principal; results are filtered by the same reachWhere rules before anyone sees them. Tables marked NEVER in the data inventory are not in the curated views at all.' },
      { label: 'Models', detail: 'Start with simple, explainable models (seasonal baselines, gradient-boosted trees, median-based outlier scores) whose results can be checked against the hand-worked analytics tests. Each forecast stores its inputs, version and error so accuracy is tracked over time.' },
      { label: 'People decide', detail: 'Intelligence never changes a record. A forecast can prefill a reorder quantity; the Store officer still saves it, and the audit trail says “suggested by AI, saved by …”.' },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }, { label: 'Inventory Analytics', href: '/inventory/analytics' }, { label: 'Warranty Analytics', href: '/warranty/analytics' }],
  },

  // ── People & performance ───────────────────────────────────────────
  {
    key: 'hr',
    name: 'HR & People',
    tagline: 'Every employee, from the gate to the payslip.',
    description: 'One record per person: who they are, where they work, when they arrive and leave, how they perform. It feeds Payroll directly, so nothing is typed twice.',
    icon: 'people',
    group: 'people',
    phases: [
      { name: 'Employee records', items: [
        'Full employee file: personal details, next of kin, CV, level of education, certificates and documents',
        'Date joined, contract type (permanent, contract, intern, casual), probation and contract end reminders',
        'Grade, job title, line manager, department and branch, using the structure you already keep',
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
        'Working-day rules per organisation, e.g. start 8:00, 8 working hours, grace to 8:30',
        'Lateness rules applied automatically, e.g. after 8:30 the day counts as 7 hours',
        'Leaving during working hours needs a Manager’s approval (the exit pass you already use); unapproved absence is deducted',
        'Overtime: staying beyond hours, approved by the Manager, counted separately',
        'Daily, weekly and monthly attendance summaries per person, department and branch',
      ] },
      { name: 'Staff ID cards', items: [
        'ID card generated from the employee record, with photo, employee ID and a QR code',
        'Virtual ID card on every staff member’s own portal',
        'Later: smart (NFC) cards to tap in at the gate or clock in, and to see balances',
      ] },
      { name: 'Leave, performance & recruitment', items: [
        'Leave types, balances and approvals; who is away, at a glance',
        'Performance reviews that start from each person’s Targets results (jobs, sales, turnaround)',
        'Recruitment: openings, candidates, interviews, offers, becoming employees in one step',
        'Headcount planning per branch and department',
      ] },
    ],
    connects: [{ label: 'Users', href: '/users' }, { label: 'Security desk', href: '/security' }, { label: 'Organisation structure', href: '/structure' }],
  },
  {
    key: 'payroll',
    name: 'Payroll',
    tagline: 'Pay calculated from attendance, accurate to the hour.',
    description: 'Salaries computed from HR attendance (per day, week and month) with Nigerian statutory deductions, approvals and bank-ready payment files.',
    icon: 'payroll',
    group: 'people',
    phases: [
      { name: 'Calculation', items: [
        'Daily rate from the working-day rules; hours worked from clock-in and clock-out',
        'Lateness and unapproved absence deducted; approved permissions and leave paid',
        'Overtime at the organisation’s own rates',
        'Allowances, bonuses, commissions (from Targets results) and one-off adjustments',
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
    connects: [{ label: 'HR & People', href: '/roadmap/hr' }, { label: 'Targets & performance', href: '/roadmap/targets' }, { label: 'Finance', href: '/roadmap/finance' }],
  },
  {
    key: 'targets',
    name: 'Targets & performance',
    tagline: 'Agreed targets for the organisation, each branch, department and person, tracked from the work itself.',
    description: 'Managers set targets (jobs completed, revenue, parts sales, turnaround, customer satisfaction) for a month, quarter or year. Progress is computed from the records the platform already holds, never typed in, and shown on each person’s dashboard with a clear “on pace” or “behind”.',
    icon: 'target',
    group: 'people',
    phases: [
      { name: 'Setting targets', items: [
        'Targets per organisation, branch, department, team or person, for a month, quarter or year',
        'Metrics from existing data: jobs completed, revenue (net of refunds), parts sales, labour sold, average turnaround, customer satisfaction',
        'Cascade: a branch target split across departments and people, with a warning when the parts do not add up to the whole',
        'Drafted by a Manager or Head of Department, approved one level up; nobody approves their own target',
        'Changes after approval go through the same approval, and the old value is kept',
      ] },
      { name: 'Progress on dashboards', items: [
        'Every person sees their own targets on their dashboard: actual, target, and pace for the working days gone',
        'Managers see their branch and departments, and each person under them, with drill-down to the jobs counted',
        'Headquarters sees every branch side by side',
        'Each figure opens the exact list of records behind it, as Business Analytics does today',
      ] },
      { name: 'Alerts & history', items: [
        'Notification to the person and their manager when pace falls below an agreed level mid-period',
        'Month-end summary email per branch',
        'Full history: what the target was, who approved it, and where progress stood on any day',
        'Results feed performance reviews (HR) and commissions (Payroll)',
      ] },
    ],
    design: [
      { label: 'Data', detail: 'Target (organisationId, metric, periodType MONTH | QUARTER | YEAR, periodStart, value, status DRAFT → SUBMITTED → APPROVED → ARCHIVED, createdBy, approvedBy); TargetAssignment (targetId, scope ORGANISATION | BRANCH | DEPARTMENT | TEAM | USER, scopeId, value); TargetSnapshot (assignmentId, day, actual, expectedToDate, computedAt), append-only.' },
      { label: 'Computation', detail: 'One pure function per metric in lib/targets, reusing lib/master-analytics.ts (sales counted at completion, refunds netted, the same metric register) and lib/visit-durations.ts for turnaround. Tested against hand-worked answers like tests/analytics.test.ts.' },
      { label: 'Freshness', detail: 'A nightly scheduled job (same pattern and CRON_SECRET check as the pricing-alerts job) writes one snapshot per assignment; a person’s own dashboard adds “today so far” on request. Pace uses working days from lib/nigeria-calendar.ts.' },
      { label: 'Permissions', detail: 'targets.view (OWN for everyone, BRANCH for managers, ALL for headquarters), targets.manage (Manager: branch, Head of Department: department), targets.approve (one level up, homeBranch). Every read goes through reachWhere; a person never sees a colleague’s target unless their scope covers it.' },
      { label: 'Audit', detail: 'target.created, target.submitted, target.approved, target.changed (with from and to). Snapshots are never edited, so a dispute can be settled from the record.' },
      { label: 'Delivery', detail: '1) branch and person targets for jobs completed and revenue; 2) all metrics, cascade and approvals; 3) alerts, history views and the feed into HR and Payroll.' },
    ],
    connects: [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Business Analytics', href: '/analytics' }, { label: 'Organisation structure', href: '/structure' }],
  },

  // ── Everyday work ──────────────────────────────────────────────────
  {
    key: 'messages',
    name: 'Messages',
    tagline: 'Chat inside the portal, with official messages kept on the record.',
    description: 'Direct and group chat between staff of the same organisation, like a work messenger built into the dashboard. Informal chat (“come and pick up the part at reception”) stays light. Official messages are recorded, cannot be deleted, can be emailed, and appear in the history of the Job Card or record they are about.',
    icon: 'chat',
    group: 'work',
    phases: [
      { name: 'Chat', items: [
        'Direct messages and group chats; automatic groups per branch and department',
        'A conversation attached to a record: open it from a Job Card, Vehicle Service, parts request or claim',
        'Mentions (@name) that notify the person; unread counts in the header',
        'Read receipts and “typing…”; a gentle sound that each person can switch off',
        'Search your own conversations',
      ] },
      { name: 'Official messages', items: [
        'Marked “official” by people allowed to send them (managers, heads of department, front desk for job matters)',
        'Recorded permanently: they cannot be edited or deleted, only followed by a correction',
        'Optionally emailed to the recipients, with the message and a link back to the portal',
        'When sent on a record, added to that record’s history (for example the Job Card trail) with sender, time and recipients',
        'Acknowledgement: recipients can be asked to confirm they have read it',
      ] },
      { name: 'Later', items: [
        'Attachments (photos, PDFs), stored per organisation with size and type limits',
        'Voice notes',
        'Messages with customers from the customer portal, tied to their Job Card',
      ] },
    ],
    design: [
      { label: 'Data', detail: 'Conversation (organisationId, kind DIRECT | GROUP | RECORD, title, recordType + recordId for record threads); ConversationMember (conversationId, userId, lastReadAt, mutedUntil); Message (conversationId, senderId, body, official, emailedAt, replyToId, editedAt, removedAt, createdAt); MessageMention; later MessageAttachment.' },
      { label: 'Official vs informal', detail: 'Official messages are IMMUTABLE in the data inventory (like payments) and also written to the audit log with the record’s entityType, which is how they reach the record’s history. Informal messages can be edited for 15 minutes and removed by the sender (the row keeps “message removed”); they are deleted after the organisation’s retention period (default 12 months) by a clean-up job.' },
      { label: 'Realtime', detail: 'Messages are saved by a server action (authorize, membership check, organisation fence). The server then sends a data-free ping on a private Supabase Realtime channel per person (topic org:<organisationId>:user:<userId>); the browser fetches the new messages through the same signed-in code. Private channels are enforced by RLS policies on realtime.messages with a short-lived token minted by the portal; until that is proven, the existing live pulse covers it. This replaces the single public topic used today.' },
      { label: 'Permissions', detail: 'messages.use (everyone, OWN), messages.official.send (role-based), messages.groups.manage (administrators). Members must be in the same organisation; there is no cross-organisation chat.' },
      { label: 'Moderation & audit', detail: 'Any member can report a message to the organisation administrator. Administrators do not read private chats by default; an investigation export needs a written reason, is audited and is visible to the platform owner. Official messages are always visible to whoever can see the record.' },
      { label: 'Data protection', detail: 'Messages are PERSONAL data under the NDPA 2023: a staff notice explains what is kept and for how long, a person can export their own messages, retention is enforced by the clean-up job, and informal chat is marked NEVER for AI in the data inventory.' },
      { label: 'Delivery', detail: '1) direct and group chat with the pulse fallback; 2) private realtime channels, read receipts, mentions and sound; 3) official messages on records with email; 4) attachments.' },
    ],
    connects: [{ label: 'Notifications', href: '/notifications' }, { label: 'Job Cards', href: '/workshop/job-cards' }],
  },
  {
    key: 'approvals',
    name: 'Approvals & workflow designer',
    tagline: 'Who approves what, set by each organisation instead of written into code.',
    description: 'The approval chains that run today (parts requests, outside purchases, warranty claims, exit passes, cancellations) are written in code. This module moves them to rules an administrator can see and adjust: amount limits, extra steps, delegates when someone is away.',
    icon: 'flow',
    group: 'work',
    phases: [
      { name: 'Rules', items: [
        'Approval rules per document type and branch: steps by role, amount bands (e.g. above ₦500,000 add the Branch Manager)',
        'Delegation while a person is on leave (from HR), with an end date',
        'Escalation after a number of working days without a decision',
        'Segregation of duties kept as a rule nobody can switch off: no one approves their own request',
      ] },
      { name: 'One inbox', items: [
        'Every approval waiting for a person in one list, with the amount, the requester and the record',
        'Approve or decline with a reason, from the list or from a phone',
        'Reminders and a weekly summary of what is waiting',
      ] },
      { name: 'Designer', items: [
        'A visual editor showing each chain as steps, with a test run before it goes live',
        'Every change to a rule is versioned and audited; requests already in progress finish on the rule they started with',
      ] },
    ],
    design: [
      { label: 'Data', detail: 'ApprovalRule (organisationId, documentType, branchId?, condition, version, active); ApprovalStep (ruleId, order, role or named person, scope); ApprovalRequest (rule version, recordType, recordId, status) and ApprovalDecision (step, decidedBy, decision, reason, at), append-only.' },
      { label: 'Safety', detail: 'Decisions use the existing compare-and-set and row-lock primitives in lib/integrity.ts, so two approvers clicking at once still produce one decision. The catalogue still decides who may attempt a step; the rule only adds steps, it never removes a permission check.' },
      { label: 'Migration', detail: 'One chain at a time, starting with outside purchases (which also closes the known gap where the reviewer and disburser can be the same person), each behind the existing Playwright journey for that chain.' },
    ],
    connects: [{ label: 'Outside purchases', href: '/workshop/external-procurement' }, { label: 'Roles', href: '/roles' }],
  },
  {
    key: 'documents',
    name: 'Documents & e-signature',
    tagline: 'The right document, the right version, signed.',
    description: 'A library for the organisation’s documents, versioned, permissioned and linked to the records they belong to, plus templates and electronic signature for estimates, hand-overs and contracts.',
    icon: 'documents',
    group: 'work',
    phases: [
      { name: 'Library', items: ['Folders per organisation, branch and department', 'Versions, check-in and check-out, and retention rules per document type', 'Documents attached to records: Job Cards, vehicles, customers, suppliers, employees'] },
      { name: 'Templates', items: ['Document templates per organisation (estimate, hand-over note, contract, letters) using the branding already on prints', 'Generated documents filed against their record automatically'] },
      { name: 'Signing', items: [
        'Customers sign estimate approval and vehicle hand-over on a tablet or in the customer portal',
        'Each signature stores who, when, the device address and a fingerprint (hash) of the exact document signed',
        'Internal approvals signed electronically by the approver',
      ] },
    ],
    design: [
      { label: 'Storage', detail: 'Files in private object storage per organisation (Supabase Storage first), served only through short-lived signed links after the same record check as the page.' },
      { label: 'Integrity', detail: 'A signed document is IMMUTABLE; a change produces a new version that needs a new signature.' },
    ],
    connects: [{ label: 'Printed documents today', href: '/workshop/job-cards' }],
  },
  {
    key: 'quality',
    name: 'Quality & checklists',
    tagline: 'Checklists each organisation can set, and a clear view of comebacks.',
    description: 'Today the vehicle inspection follows one checklist written in code. This module lets each organisation keep its own checklists (pre-delivery inspection, quality check before “ready”, road test, health check), with photos, and measures work that comes back.',
    icon: 'checklist',
    group: 'work',
    phases: [
      { name: 'Checklists', items: [
        'Checklist templates per organisation and vehicle type, versioned',
        'Pass, fail, advisory and not-applicable per item, with notes and photos',
        'Quality check required before a job moves to Ready for collection (where the organisation chooses)',
        'Advisory items become follow-up suggestions on the vehicle page and in the customer’s next reminder',
      ] },
      { name: 'Comebacks', items: [
        'A comeback is a job reopened, or a new job for the same complaint within an agreed number of days',
        'Comeback rate per branch, technician and job type, with the jobs behind each figure',
        'Corrective action recorded against the cause',
      ] },
    ],
    design: [
      { label: 'Data', detail: 'ChecklistTemplate (organisationId, kind, version), ChecklistItem, ChecklistRun (record, template version, performedBy), ChecklistAnswer. Existing VehicleInspection rows stay as they are; new inspections use templates.' },
      { label: 'Links', detail: 'Uses the rework reasons already recorded on Job Cards to find comebacks, so history counts from day one.' },
    ],
    connects: [{ label: 'Vehicle Services', href: '/workshop/vehicle-service' }, { label: 'Job Cards', href: '/workshop/job-cards' }],
  },
  {
    key: 'technician-app',
    name: 'Technician app',
    tagline: 'The job, the clock and the checklist on a phone, even with poor signal.',
    description: 'A phone and tablet app for technicians and supervisors: their assigned jobs, clocking on and off each job, inspections with photos, and parts requests. It keeps working offline and sends everything when the connection returns.',
    icon: 'tablet',
    group: 'work',
    phases: [
      { name: 'On the job', items: [
        'My jobs today, in order, with the complaint, vehicle history and approved estimate lines',
        'Clock on and off a job; time spent compared with time sold gives efficiency per technician and job type',
        'Checklists and inspections with photos taken on the phone',
        'Raise a parts request and see when the Store releases it',
      ] },
      { name: 'Offline', items: [
        'Works without signal: actions are queued on the device and sent in order when back online',
        'If someone else changed the job in the meantime, the technician sees what happened and nothing is overwritten',
      ] },
    ],
    design: [
      { label: 'Build', detail: 'An installable web app (PWA) from the portal code, so the same server actions and permission checks apply; no separate mobile API.' },
      { label: 'Offline sync', detail: 'Queued actions carry an idempotency key, as payments do today, and replay through compare-and-set, so a resend records once and a stale action is refused with a clear message.' },
      { label: 'Data', detail: 'LabourClock (jobCardId or vehicleServiceId, technicianId, startedAt, endedAt, reason). Efficiency feeds Targets.' },
    ],
    connects: [{ label: 'Job Cards', href: '/workshop/job-cards' }],
  },

  // ── Customers & sales ──────────────────────────────────────────────
  {
    key: 'crm',
    name: 'Sales & CRM',
    tagline: 'From the first enquiry to a customer who comes back.',
    description: 'Customer records and the customer 360 page are live. This adds the selling side: enquiries and leads, opportunities by stage, quotations, and campaigns sent to the right customers.',
    icon: 'crm',
    group: 'customers',
    phases: [
      { name: 'Pipeline', items: ['Enquiries from the website, phone and walk-ins, assigned to a sales person', 'Opportunities by stage with expected value and close date', 'Quotations for parts and service, converted to a Job Card or order in one step'] },
      { name: 'Campaigns', items: ['Customer segments from tags, vehicles, last visit and spend', 'Service campaigns by email now; SMS and WhatsApp when Integrations arrive', 'Results per campaign: bookings and revenue that followed'] },
    ],
    connects: [{ label: 'Customers', href: '/crm' }, { label: 'Service tracker', href: '/workshop/service-tracker' }],
  },
  {
    key: 'vehicle-sales',
    name: 'Vehicle sales',
    tagline: 'New and used vehicles, from stock to delivery, linked to warranty and service.',
    description: 'For the group’s vehicle sales branches: vehicles in stock, reservations, sales orders, trade-ins and delivery. A sold vehicle arrives in the workshop already registered, with its warranty and first service due.',
    icon: 'car',
    group: 'customers',
    phases: [
      { name: 'Stock', items: ['Vehicle stock by chassis number, model, colour, location and cost', 'Arrivals from the manufacturer or distributor; ageing of unsold stock', 'Demonstrators and transfers between branches'] },
      { name: 'Selling', items: ['Reservation with deposit, sales order and approval of discounts above a limit', 'Trade-in appraisal with photos, valued and approved', 'Finance and insurance referrals recorded (the lender or insurer stays outside the platform)'] },
      { name: 'Delivery', items: ['Pre-delivery inspection checklist (Quality)', 'Hand-over with customer signature (Documents)', 'Warranty registered automatically, service plan attached, first service reminder scheduled'] },
    ],
    design: [
      { label: 'Data', detail: 'StockVehicle (branchId, chassis, model, status IN_TRANSIT → IN_STOCK → RESERVED → SOLD → DELIVERED, cost), VehicleSale (customer, price, discounts, approvals, payments), TradeIn. On delivery a CustomerVehicle is created, so the workshop, warranty and service tracker see it with no re-typing.' },
      { label: 'Money', detail: 'Deposits and payments use the same immutable payment and refund rules as the workshop; journals go to Finance.' },
    ],
    connects: [{ label: 'Warranty', href: '/warranty' }, { label: 'Customers', href: '/crm' }],
  },
  {
    key: 'service-plans',
    name: 'Service plans & contracts',
    tagline: 'Maintenance plans, prepaid services and extended cover, tracked per vehicle.',
    description: 'Service intervals already drive the service tracker. This adds what is sold around them: prepaid service packages, maintenance contracts for companies, and extended warranty contracts, each with a balance the workshop can see at check-in.',
    icon: 'contract',
    group: 'customers',
    phases: [
      { name: 'Plans', items: ['Maintenance plans per model (e.g. every 10,000 km or 6 months, whichever comes first)', 'Prepaid packages: the customer pays for a number of services up front; each Vehicle Service uses one', 'Balance and expiry shown at check-in and on the customer portal'] },
      { name: 'Contracts', items: ['Maintenance contracts for company fleets, with covered items and limits', 'Extended warranty contracts sold after the manufacturer’s cover, linked to the Warranty module', 'Renewal reminders, staged in working days like other reminders'] },
    ],
    design: [
      { label: 'Data', detail: 'ServicePlan (organisationId, model rules, intervals), ServiceContract (customer or company, vehicle, plan, start, end, prepaid units, status), ContractUsage (contract, vehicleServiceId, units), append-only.' },
      { label: 'Money', detail: 'Prepaid amounts are recorded as received in advance and released to revenue as services are used (deferred revenue in Finance).' },
    ],
    connects: [{ label: 'Service tracker', href: '/workshop/service-tracker' }, { label: 'Warranty', href: '/warranty' }],
  },
  {
    key: 'feedback',
    name: 'Customer feedback',
    tagline: 'Ask every customer how it went, and act on the answer.',
    description: 'A short survey after each job (one “would you recommend us” question and three quick ratings), on the customer portal and by email. Low scores reach the branch manager the same day.',
    icon: 'star',
    group: 'customers',
    phases: [
      { name: 'Asking', items: ['Survey sent after check-out, respecting the customer’s email choice', 'Also answerable on the customer portal next to the job', 'One reminder only; never more than one survey per job'] },
      { name: 'Acting', items: ['Low score: a follow-up task to the branch manager, with the job attached', 'Satisfaction (CSAT) and recommendation (NPS) per branch, department and month', 'Results feed Targets; customers never see staff names'] },
    ],
    design: [
      { label: 'Data', detail: 'SurveyTemplate (organisationId, questions, version), SurveyInvite (customerId, recordType, recordId, sentAt, token), SurveyResponse (scores, comment, answeredAt). Invites use single-use tokens like the set-password links.' },
      { label: 'Privacy', detail: 'Comments are PERSONAL data; AI may read them only in aggregate (AGGREGATE_ONLY) for themes.' },
    ],
    connects: [{ label: 'Customers', href: '/crm' }, { label: 'Targets & performance', href: '/roadmap/targets' }],
  },
  {
    key: 'promotions',
    name: 'Price lists, promotions & loyalty',
    tagline: 'The right price for each customer, and a reason to come back.',
    description: 'Price lists for retail, fleet and staff customers, labour rates and fixed-price service menus, time-limited promotions, and loyalty points earned on what customers pay.',
    icon: 'tag',
    group: 'customers',
    phases: [
      { name: 'Prices', items: ['Price lists per branch and customer group, with start and end dates', 'Labour rates and fixed-price service menus (e.g. “10,000 km service”)', 'Builds on the Pricing Command Centre and pricing alerts in Inventory'] },
      { name: 'Promotions', items: ['Promotions with a code, dates, eligible customers and a budget', 'Discounts above a limit need approval, as estimates do today'] },
      { name: 'Loyalty', items: ['Points on amounts paid, net of refunds', 'Redemption at the front desk, approved and recorded', 'Points balance on the customer portal'] },
    ],
    design: [
      { label: 'Data', detail: 'PriceList and PriceListLine (part or labour, price, validity), Promotion, LoyaltyLedger (customerId, points, reason, record), append-only, so a balance is always the sum of its entries.' },
    ],
    connects: [{ label: 'Inventory pricing', href: '/inventory' }, { label: 'Customers', href: '/crm' }],
  },
  {
    key: 'fleet-accounts',
    name: 'Fleet & business accounts',
    tagline: 'Company customers on credit, with their own approvers and one monthly statement.',
    description: 'For companies that service many vehicles: a credit account with a limit and terms, purchase-order numbers on jobs, approval of estimates by the company’s fleet manager, and a consolidated monthly statement.',
    icon: 'fleet',
    group: 'customers',
    phases: [
      { name: 'Account', items: ['Credit limit and payment terms, approved by Finance', 'Company contacts with roles: fleet manager (approves estimates), accounts (receives statements)', 'Purchase-order number required on each job where the company asks for it'] },
      { name: 'Portal & billing', items: ['Fleet view on the customer portal: every vehicle, its jobs, spend and next service', 'Estimate approval by the fleet manager online', 'Monthly statement and ageing; jobs blocked when the account is over its limit, unless a Manager releases them'] },
    ],
    design: [
      { label: 'Data', detail: 'Builds on CustomerCompany (company name, tax ID) and CustomerContact. Adds CreditAccount (limit, terms, status, approvedBy) and statement runs in Finance.' },
      { label: 'Fences', detail: 'A fleet contact sees only the vehicles of their own company, checked from the customer session as every customer page is today.' },
    ],
    connects: [{ label: 'Customers', href: '/crm' }],
  },
  {
    key: 'customer-app',
    name: 'Customer app',
    tagline: 'Customers book, follow and pay from their phone.',
    description: 'Extends the customer portal: online booking into real workshop capacity, live job progress with photos, estimate approval and online payment.',
    icon: 'mobile',
    group: 'customers',
    phases: [
      { name: 'Booking', items: ['Book a service online from the slots the branch actually has (bays and technicians)', 'Reminder emails link straight to booking', 'Bookings arrive as scheduled Vehicle Services for the front desk to confirm'] },
      { name: 'Self-service', items: ['Live job progress and photos', 'Approve estimates online (signature from Documents)', 'Pay online by card or transfer, recorded as a payment with its gateway reference'] },
    ],
    connects: [{ label: 'Vehicle Services', href: '/workshop/vehicle-service' }, { label: 'Scheduling', href: '/schedule' }],
  },

  // ── Buying, stock & assets ─────────────────────────────────────────
  {
    key: 'procurement',
    name: 'Procurement',
    tagline: 'From request to purchase order, approved at every step.',
    description: 'Purchase requisitions, quotations, purchase orders and three-way matching, extending the outside-purchase approvals the workshop already uses.',
    icon: 'procurement',
    group: 'supply',
    phases: [
      { name: 'Buying', items: ['Purchase requisitions from any department', 'Requests for quotation; quotes compared side by side', 'Purchase orders with approval limits by amount (Approvals)'] },
      { name: 'Receiving & matching', items: ['Goods receipts against the purchase order', 'Three-way match: order, receipt and supplier bill', 'Contracts and framework agreements'] },
    ],
    connects: [{ label: 'Outside purchases', href: '/workshop/external-procurement' }, { label: 'Inventory', href: '/inventory' }],
  },
  {
    key: 'suppliers',
    name: 'Suppliers',
    tagline: 'Know every supplier, and how well they deliver.',
    description: 'The supplier master: details, documents, price lists and performance, shared by Procurement, the Store and Finance.',
    icon: 'suppliers',
    group: 'supply',
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
    description: 'Multi-location stock: bins, transfers between branches, counts and scanning, on top of the stock and batch tracking the Store already keeps.',
    icon: 'warehouse',
    group: 'supply',
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
    description: 'For the group’s manufacturing businesses: bills of materials, work orders, planning and production cost.',
    icon: 'factory',
    group: 'supply',
    phases: [
      { name: 'Production', items: ['Bills of materials and routings', 'Work orders: issue materials, record output and scrap', 'Material requirements planning'] },
      { name: 'Quality & cost', items: ['Quality checks at each stage (Quality checklists)', 'Actual vs standard cost per product'] },
    ],
    connects: [{ label: 'Inventory', href: '/inventory' }],
  },
  {
    key: 'assets',
    name: 'Fixed assets & tools',
    tagline: 'Everything the company owns, maintained, accounted for and signed out.',
    description: 'A register of company assets and vehicles (who has them, condition, maintenance and depreciation) and a tool crib for workshop special tools and diagnostic equipment.',
    icon: 'assets',
    group: 'supply',
    phases: [
      { name: 'Register', items: ['Assets and company vehicles with QR tags', 'Assignment to staff and departments, with hand-over records', 'Disposal with approval and the sale amount recorded'] },
      { name: 'Care & value', items: ['Maintenance schedules: company vehicles booked into the workshop like any customer’s', 'Depreciation (straight-line or reducing balance) posted to Finance monthly'] },
      { name: 'Tool crib', items: ['Special tools and diagnostic equipment signed out to a technician against a job', 'Overdue returns flagged to the workshop supervisor', 'Calibration due dates for torque wrenches, gauges and testers'] },
    ],
    connects: [{ label: 'Workshop', href: '/workshop' }],
  },

  // ── Finance & tax ──────────────────────────────────────────────────
  {
    key: 'finance',
    name: 'Finance & accounting',
    tagline: 'The books, kept by the work itself.',
    description: 'A general ledger fed automatically by payments, refunds, purchases, stock and payroll, so the accounts match the operations without re-keying, with budgets per cost centre.',
    icon: 'finance',
    group: 'money',
    phases: [
      { name: 'Ledger', items: ['Chart of accounts, cost centres per branch and department', 'Automatic journals from payments, refunds, goods receipts, stock issues and payroll', 'Period close and audit trail'] },
      { name: 'Receivables & payables', items: ['Customer invoices, statements and ageing', 'Supplier bills, payment runs and ageing', 'Bank reconciliation'] },
      { name: 'Budgets & statements', items: ['Budgets per cost centre and month, with versions and approval', 'Commitments from approved purchase orders shown against the budget', 'Budget vs actual with alerts when a line runs over', 'Profit and loss, balance sheet and cash flow per branch, business unit and group'] },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }, { label: 'Refunds', href: '/workshop/refunds' }],
  },
  {
    key: 'tax',
    name: 'Tax & e-invoicing',
    tagline: 'VAT on every invoice, and invoices cleared with the tax authority.',
    description: 'Tax codes on every invoice line, VAT and withholding tax returns, and electronic invoicing through the Nigeria Revenue Service’s Merchant Buyer Solution (MBS): business invoices cleared before they reach the buyer, consumer invoices reported within 24 hours.',
    icon: 'receipt',
    group: 'money',
    phases: [
      { name: 'Tax on invoices', items: ['Tax codes per line (standard VAT, exempt, zero-rated) and withholding tax', 'Customer and supplier tax IDs (company tax ID is already kept on company customers)', 'Credit notes for refunds, so a refund reverses the tax as well as the money'] },
      { name: 'E-invoicing (NRS MBS)', items: [
        'Invoices produced in the structured format the tax authority requires (UBL / XML)',
        'Business-to-business invoices sent for clearance before they go to the buyer; the invoice reference number (IRN) and stamp are printed on the invoice',
        'Consumer invoices reported within 24 hours',
        'A queue showing every invoice waiting, cleared or refused, with the reason and a retry',
      ] },
      { name: 'Returns', items: ['Monthly VAT and withholding tax summaries that reconcile to the ledger', 'Exports for the tax adviser'] },
    ],
    design: [
      { label: 'Adapter', detail: 'One adapter (like lib/email.ts) for the access point provider or the MBS API; business code never calls the provider directly. Credentials stay in server-side environment variables.' },
      { label: 'Integrity', detail: 'Invoice numbers are sequential per organisation with a unique constraint; a cleared invoice is IMMUTABLE and corrected only by a credit note. Every submission and response is kept with the invoice.' },
      { label: 'Timing', detail: 'Clearance depends on the organisation’s turnover band and the authority’s published dates; the module is switched on per organisation when its date applies.' },
    ],
    connects: [{ label: 'Customers', href: '/crm' }, { label: 'Finance & accounting', href: '/roadmap/finance' }],
  },

  // ── Data & platform ────────────────────────────────────────────────
  {
    key: 'reports',
    name: 'Reports',
    tagline: 'Any question answered, and delivered on schedule.',
    description: 'A report builder over all modules, with saved reports, schedules and exports to Excel and PDF.',
    icon: 'reports',
    group: 'platform',
    phases: [
      { name: 'Build & share', items: ['Report builder with filters, grouping and totals', 'Saved reports per role', 'Scheduled delivery by email', 'Export to Excel, CSV and PDF, fenced exactly like the pages they come from'] },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }],
  },
  {
    key: 'data-platform',
    name: 'Data warehouse & BI',
    tagline: 'One governed copy of the data for reporting, BI tools and AI.',
    description: 'Curated, read-only views of each subject (jobs, money, stock, warranty, security, people) with history kept by day, so heavy reporting and the AI service never slow the live system or read raw tables.',
    icon: 'database',
    group: 'platform',
    phases: [
      { name: 'Curated data', items: ['Subject views with the organisation and branch on every row', 'Daily snapshots for history (stock on hand, open jobs, receivables)', 'A data dictionary generated from the data inventory: owner, sensitivity, retention, AI access'] },
      { name: 'Use', items: ['Connections for Power BI or Excel with the same organisation and branch filters', 'The Reports module and the AI service read from here', 'A read replica only when measurements show analytics slowing live work'] },
    ],
    design: [
      { label: 'Rules', detail: 'Tables marked NEVER in the data inventory (sessions, accounts, tokens, informal chat) are left out entirely; PERSONAL columns are masked unless the reader’s role needs them.' },
      { label: 'Freshness', detail: 'Rebuilt nightly by a scheduled job, with the run recorded on Settings like the existing jobs.' },
    ],
    connects: [{ label: 'Business Analytics', href: '/analytics' }, { label: 'Audit Logs', href: '/audit-logs' }],
  },
  {
    key: 'integrations',
    name: 'Integrations',
    tagline: 'Connected to the tools and partners the business already uses.',
    description: 'Messaging, payments, manufacturers and office tools connected through one adapter each, without moving work out of the platform.',
    icon: 'plug',
    group: 'platform',
    phases: [
      { name: 'Messaging & payments', items: ['WhatsApp and SMS notifications', 'Payment gateways and bank feeds', 'Microsoft 365 / Google Workspace sign-in and calendars'] },
      { name: 'Manufacturers', items: ['Warranty claims submitted to the manufacturer’s system', 'Parts ordering and stock availability', 'Recall and campaign lists matched against vehicles, with customers contacted'] },
      { name: 'Open API', items: ['A documented API with keys per organisation and per purpose', 'Signed webhooks from the business event catalogue (job opened, payment recorded …)', 'Accounting exports'] },
    ],
    connects: [{ label: 'Notifications', href: '/notifications' }],
  },
  {
    key: 'branding',
    name: 'Branding',
    tagline: 'Each organisation in its own colours.',
    description: 'Logo, colours and document styling per organisation: the platform runs many organisations, each looking like itself.',
    icon: 'brand',
    group: 'platform',
    phases: [{ name: 'Brand', items: ['Logo and colours per organisation', 'Document and email styling', 'Custom domain per organisation'] }],
    connects: [{ label: 'Organisation', href: '/organisation' }],
  },
];

export const roadmapByKey = new Map(ROADMAP.map((m) => [m.key, m]));
