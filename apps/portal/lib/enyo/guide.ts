/**
 * Enyo's how-to guide: short, accurate steps for every live module, written
 * against the real pages and button names. Pure (no database, no session):
 * the guide_search tool passes the person's principal, and only entries whose
 * page they can open are returned. Entries that match but belong to someone
 * else's job are named (title only), so Enyo can say "that is done by …".
 *
 * Keep the button names here in step with the pages: Playwright selects by
 * the same names, so they rarely change.
 */
import { decide, type PermissionKey, type Principal } from '../authz/catalogue';

export type GuideEntry = {
  id: string;
  title: string;
  /** Words people use for this ("deposit", "pay", "money in"). Lower case. */
  keywords: string[];
  /** Short numbered steps, in order. */
  steps: string[];
  /** The page where it is done (a portal path). */
  page: string;
  /** Opening the page needs ANY of these (empty: everyone signed in). */
  needs: PermissionKey[];
  /** Carrying the steps out needs ANY of these (empty: whoever can open the page). */
  does?: PermissionKey[];
  /** Who usually does it, in plain words. */
  who?: string;
};

const WORKSHOP: PermissionKey[] = ['workshop.view'];
const STORE: PermissionKey[] = ['store.view'];
const WARRANTY: PermissionKey[] = ['warranty.view'];
const EVERYONE: PermissionKey[] = [];

export const GUIDE: GuideEntry[] = [
  // ── Job Cards ─────────────────────────────────────────────────────
  {
    id: 'job-card-open', title: 'Open a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.job_card.create'], who: 'The front desk',
    keywords: ['open', 'new', 'create', 'job card', 'check in', 'register job', 'jc', 'repair', 'complaint', 'book in'],
    steps: [
      'Go to Workshop → Job Cards.',
      'In the "Open Job Card" form, search for the customer by name, email or phone.',
      'Pick the vehicle (only that customer\'s vehicles are listed; register a new one under Workshop → Vehicles first).',
      'Choose the supervisor under "Assign to supervisor".',
      'Enter the mileage at check-in and list each complaint (use "+ Add another complaint" for more).',
      'Press "Open Job Card". The supervisor is emailed to inspect the vehicle.',
    ],
  },
  {
    id: 'job-card-review', title: 'Approve or reject a new Job Card (supervisor)', page: '/approvals', needs: EVERYONE, does: ['workshop.job.supervise'], who: 'The assigned supervisor',
    keywords: ['approve', 'reject', 'review', 'job card', 'supervisor', 'accept job', 'supervise'],
    steps: [
      'Open Approvals (or the Job Card from your dashboard).',
      'In "Review this Job Card", check the customer, vehicle and complaints.',
      'Press "Approve", or "Reject" with a short reason.',
    ],
  },
  {
    id: 'job-card-assign', title: 'Assign a technician to a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.technician.assign'], who: 'The job\'s supervisor',
    keywords: ['assign', 'technician', 'allocate', 'give job', 'mechanic', 'reassign'],
    steps: [
      'Open the Job Card (it must be approved first).',
      'In "Assign technician", choose the technician.',
      'Press "Assign". The technician sees it under "Respond to this assignment" and presses "Accept" or "Reject" with a reason.',
    ],
  },
  {
    id: 'job-card-accept', title: 'Accept or turn down a job (technician)', page: '/dashboard', needs: EVERYONE, does: ['workshop.job.work'], who: 'The assigned technician',
    keywords: ['accept', 'turn down', 'reject assignment', 'my job', 'technician', 'respond'],
    steps: [
      'Open the Job Card or Vehicle Service from "My jobs" on your dashboard.',
      'In "Respond to this assignment", press "Accept", or "Reject" and give a reason.',
    ],
  },
  {
    id: 'job-card-estimate', title: 'Prepare and submit an estimate', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.estimate.edit'], who: 'The assigned technician and supervisor',
    keywords: ['estimate', 'quote', 'quotation', 'price', 'line', 'labour', 'parts', 'submit', 'cost'],
    steps: [
      'Open the Job Card and go to the Estimate section.',
      'Under "Add a line", choose the type (Store Part, Labour, Internal Job, outside part or job, Sundry), describe it, enter the quantity and price where you may, and press "Add".',
      'For Store Part lines, press "Request Store Matching" so the Store matches and prices them.',
      'When every line is priced, press "Submit for validation". The supervisor then approves it.',
    ],
  },
  {
    id: 'job-card-estimate-approve', title: 'Approve an estimate (supervisor, then Manager)', page: '/approvals', needs: EVERYONE, does: ['workshop.estimate.approve', 'workshop.estimate.final_approve'], who: 'The supervisor, then the Workshop Manager',
    keywords: ['approve estimate', 'final approval', 'manager', 'send back', 'validate', 'estimate'],
    steps: [
      'Open Approvals and choose the estimate.',
      'Supervisor: check the lines and press "Approve estimate", or "Send back" with a reason.',
      'Workshop Manager: press "Approve as Manager" for the final approval.',
    ],
  },
  {
    id: 'job-card-notify', title: 'Send an approved estimate to the customer', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.customer.notify'], who: 'The front desk that opened the job',
    keywords: ['notify', 'customer', 'send estimate', 'tell customer', 'email customer', 'approval'],
    steps: [
      'Open the Job Card once the Manager has approved the estimate.',
      'In the Estimate section, press "Notify customer". The customer is emailed the estimate.',
      'The Job Card moves to Awaiting Customer Approval until the 70% deposit is paid.',
    ],
  },
  {
    id: 'job-card-payment', title: 'Record a payment on a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.payment.record'], who: 'Finance',
    keywords: ['payment', 'pay', 'deposit', 'balance', 'money', 'cash', 'transfer', 'receipt', 'takings', '70%'],
    steps: [
      'Open the Job Card and go to Payments.',
      'Enter the amount (the suggestions fill in the 70% deposit, the full amount or the remaining balance) and choose Bank transfer or Cash.',
      'Add the transfer reference or receipt number in the notes, then press "Record payment".',
      'When payments reach the 70% deposit, the Job Card moves to In Progress by itself.',
    ],
  },
  {
    id: 'job-card-status', title: 'Move a Job Card to its next status', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.job.work', 'workshop.job.supervise'], who: 'The technician and supervisor on the job',
    keywords: ['status', 'in progress', 'awaiting parts', 'quality check', 'completed', 'ready for collection', 'rework', 'update'],
    steps: [
      'Open the Job Card and go to the Status section.',
      'Choose the next status (only the steps you may take are offered) and press "Update status".',
      'The supervisor marks the job Ready for Collection once the work is completed; "Send back for rework" returns it to the technician.',
    ],
  },
  {
    id: 'job-card-close', title: 'Close a Job Card and check the vehicle out', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.close.request', 'workshop.close.approve'], who: 'Front desk or supervisor asks; the Workshop Manager approves',
    keywords: ['close', 'check out', 'checkout', 'collect', 'collection', 'release vehicle', 'finish', 'done'],
    steps: [
      'When the customer has paid in full, open the Job Card and press "Request close".',
      'The Workshop Manager presses "Approve close" (or "Decline" with a note).',
      'The front desk then checks the vehicle out in the Status section, entering the name of the person collecting it.',
      'Security confirms the vehicle leaving at the gate.',
    ],
  },
  {
    id: 'job-card-cancel', title: 'Cancel a Job Card', page: '/workshop/job-cards', needs: WORKSHOP, does: ['workshop.close.request', 'workshop.close.approve'], who: 'Front desk or supervisor asks; the Workshop Manager approves',
    keywords: ['cancel', 'cancellation', 'stop job', 'customer withdrew', 'abandon'],
    steps: [
      'Open the Job Card, fill in "Request cancellation" with the reason and press "Request cancellation".',
      'The Workshop Manager presses "Approve cancellation" or "Decline".',
      'If the customer paid anything, Finance records the refund before the vehicle is handed back.',
    ],
  },
  {
    id: 'refund', title: 'Record a refund', page: '/workshop/refunds', needs: WORKSHOP, does: ['workshop.refund.record'], who: 'Finance',
    keywords: ['refund', 'money back', 'return money', 'overpaid', 'repay'],
    steps: [
      'Open the Job Card or Vehicle Service that was cancelled or overpaid.',
      'In the Refunds panel, enter the amount, method, who received it and the reason, then press "Record refund".',
      'The customer is emailed a receipt. Every refund is listed under Workshop → Refunds.',
    ],
  },
  {
    id: 'job-card-parts', title: 'Request parts from the Store for a job', page: '/workshop/parts-requests', needs: WORKSHOP, does: ['sourcing.request'], who: 'The technician or supervisor on the job',
    keywords: ['parts request', 'prs', 'request parts', 'store parts', 'spare', 'reserve', 'release parts'],
    steps: [
      'Make sure the Store Part lines on the estimate are matched by the Store.',
      'Open the Job Card (or Vehicle Service) and press "+ Request Store Parts" in Sourcing.',
      'Check the quantities and press "Raise Parts Request".',
      'The Workshop Manager approves it, then the Store presses "Approve & Reserve" and finally "Release" when handing the parts over.',
    ],
  },
  {
    id: 'outside-purchase', title: 'Buy a part or job from outside (external procurement)', page: '/workshop/external-procurement', needs: WORKSHOP, does: ['sourcing.request'], who: 'The technician asks; Finance and the Manager decide',
    keywords: ['outside purchase', 'external procurement', 'epr', 'buy outside', 'sublet', 'cash advance', 'disburse'],
    steps: [
      'Add the outside part or job to the estimate first.',
      'On the Job Card, press "+ Request Procurement" in Sourcing, check the lines and press "Raise Procurement Request".',
      'Finance reviews it and presses "Send to Manager"; the Manager presses "Approve"; Finance presses "Disburse" when paying out the cash.',
    ],
  },
  {
    id: 'road-test', title: 'Request a road test', page: '/security/road-tests', needs: ['security.view', 'workshop.job_card.view'], does: ['workshop.job.work', 'workshop.job.supervise'], who: 'The technician or supervisor on the job',
    keywords: ['road test', 'test drive', 'drive', 'rt', 'permit'],
    steps: [
      'Open the Job Card or Vehicle Service and press "Request road test".',
      'Choose the driver, describe what the test is checking, add the route if known and the expected duration, then press "Request approval".',
      'The Manager presses "Approve road test"; Security records the time out and the time in at the gate.',
    ],
  },
  {
    id: 'who-pays', title: 'Charge an estimate line to warranty, goodwill or internal', page: '/workshop/job-cards', needs: WORKSHOP, does: ['warranty.claim.approve'], who: 'The Warranty HOD or the Workshop Manager',
    keywords: ['who pays', 'warranty', 'goodwill', 'internal', 'not charged', 'bill to', 'free'],
    steps: [
      'Open the Job Card and find the "Who pays" panel next to the estimate.',
      'For the line, choose Warranty (and the covering warranty), Goodwill or Internal, give a reason, and press "Save".',
      'The customer\'s total, deposit and balance are recalculated straight away.',
    ],
  },
  {
    id: 'custody', title: 'See which vehicles are in the workshop', page: '/workshop/custody', needs: WORKSHOP,
    keywords: ['custody', 'in workshop', 'vehicles in', 'yard', 'waiting', 'in service'],
    steps: ['Go to Workshop → In custody to see every vehicle being worked on or waiting for approval or collection.', 'Vehicle Services have their own list at Workshop → Vehicle Service custody.'],
  },
  // ── Vehicle Services ──────────────────────────────────────────────
  {
    id: 'service-open', title: 'Open a Vehicle Service', page: '/workshop/vehicle-service', needs: WORKSHOP, does: ['workshop.job_card.create'], who: 'The front desk',
    keywords: ['vehicle service', 'service', 'sv', 'oil change', 'maintenance', 'open service', 'book service'],
    steps: [
      'Go to Workshop → Vehicle Service.',
      'In "Open a Vehicle Service", pick the customer, the vehicle and the supervisor, and list what the customer asked for.',
      'Press "Open Vehicle Service". To book a future visit instead, use "Book in for service".',
    ],
  },
  {
    id: 'service-inspection', title: 'Inspect a vehicle on a Vehicle Service', page: '/workshop/vehicle-service', needs: WORKSHOP, does: ['workshop.inspection.perform'], who: 'The assigned technician',
    keywords: ['inspection', 'checklist', 'inspect', 'condition', 'findings'],
    steps: [
      'Open the Vehicle Service and go to "Vehicle inspection".',
      'Work through the checklist, marking each item, and press "Complete".',
      'If more than routine work is needed, use "Or escalate to a Job Card" and press "Create Job Card & Estimate".',
    ],
  },
  {
    id: 'service-estimate', title: 'Estimate, approve and take payment on a Vehicle Service', page: '/workshop/vehicle-service', needs: WORKSHOP, does: ['workshop.estimate.edit', 'workshop.estimate.approve', 'workshop.payment.record'], who: 'Technician, supervisor, Manager, front desk and Finance in turn',
    keywords: ['service estimate', 'service payment', 'approve service', 'service quote'],
    steps: [
      'Add the estimate lines on the Vehicle Service page and press "Submit for validation".',
      'The supervisor presses "Approve estimate", then the Manager presses "Approve as manager".',
      'The front desk presses "Notify customer"; Finance records payments with "Record payment".',
      'Once paid, "Request close"; the Manager presses "Approve close".',
    ],
  },
  {
    id: 'service-tracker', title: 'See vehicles due for a service and send reminders', page: '/workshop/service-tracker', needs: WORKSHOP,
    keywords: ['service due', 'overdue', 'reminder', 'next service', 'tracker', 'due soon', 'follow up'],
    steps: [
      'Go to Workshop → Service tracker. Vehicles are grouped as Overdue, Due soon and On track.',
      'Press "Send reminder" to email the customer the reminder that is due.',
      'When the customer is already being looked after, press "Attend To" to take the vehicle off the overdue list.',
    ],
  },
  // ── Customers and vehicles ────────────────────────────────────────
  {
    id: 'customer-add', title: 'Register a new customer', page: '/crm', needs: ['crm.view', 'workshop.view'], does: ['workshop.customer.manage', 'crm.manage'], who: 'The front desk',
    keywords: ['new customer', 'register customer', 'add customer', 'client', 'customer'],
    steps: [
      'Go to Customers and press "Register customer" (front desk without the Customers page: Workshop → Customers, "Add customer").',
      'Enter the full name, primary address, email and phone (and a second phone if they have one).',
      'Press "Register customer". The customer is emailed a link to set their own portal password.',
    ],
  },
  {
    id: 'vehicle-add', title: 'Register a vehicle', page: '/workshop/vehicles', needs: WORKSHOP, does: ['workshop.customer.manage'], who: 'The front desk',
    keywords: ['register vehicle', 'add vehicle', 'new car', 'plate', 'vin', 'chassis'],
    steps: [
      'Go to Workshop → Vehicles and use "Register vehicle".',
      'Choose the owner, then enter the plate, chassis number (VIN), make, model, year, Passenger or Commercial, and mileage.',
      'Press "Register vehicle". No two vehicles may share a plate or VIN.',
    ],
  },
  {
    id: 'crm-360', title: 'See everything about a customer', page: '/crm', needs: ['crm.view'],
    keywords: ['customer', '360', 'history', 'spend', 'crm', 'profile', 'outstanding', 'visits'],
    steps: [
      'Go to Customers and search by name, phone or email.',
      'Open the customer to see their vehicles, Job Cards and Vehicle Services, payments and refunds, warranties, notes and activity.',
    ],
  },
  {
    id: 'crm-portal', title: 'Give a customer access to the customer portal', page: '/crm', needs: ['crm.view'], does: ['crm.manage'], who: 'The front desk or a CRM manager',
    keywords: ['portal', 'customer portal', 'password', 'set-password', 'sign in', 'access', 'login link'],
    steps: [
      'Open the customer under Customers and find the "Customer portal" card.',
      'Press "Send set-password link". The link is valid for 72 hours; no password is ever emailed.',
      'To stop access, give a reason and press "Switch off and sign out"; "Switch on" restores it.',
    ],
  },
  {
    id: 'crm-notes', title: 'Add a note to a customer', page: '/crm', needs: ['crm.view'], does: ['crm.manage'],
    keywords: ['note', 'customer note', 'remark', 'pin'],
    steps: ['Open the customer under Customers and go to Notes.', 'Type the note, tick "Pin to the top" if it matters, and press "Add note".'],
  },
  // ── Store and inventory ───────────────────────────────────────────
  {
    id: 'part-add', title: 'Add a part to the catalogue', page: '/inventory/parts', needs: STORE, does: ['store.parts.manage'], who: 'The Store',
    keywords: ['add part', 'new part', 'catalogue', 'catalog', 'item', 'stock item'],
    steps: [
      'Go to Inventory → Parts and use "Add a Part".',
      'Enter the name, part number, type, unit and how it is tracked (Quantity, Batch or Serialized).',
      'Press "Add Part". Set its selling price and stock levels on the part\'s own page.',
    ],
  },
  {
    id: 'part-price', title: 'Set a part\'s selling price or target margin', page: '/inventory/parts', needs: STORE, does: ['store.parts.manage'], who: 'The Store',
    keywords: ['price', 'selling price', 'margin', 'markup', 'pricing', 'reorder point', 'safety stock'],
    steps: [
      'Open the part under Inventory → Parts.',
      'Enter the selling price, or the target margin or markup, and press "Save".',
      'Reorder point and safety stock are set on the same page.',
    ],
  },
  {
    id: 'goods-receipt', title: 'Record a goods receipt (delivery into the Store)', page: '/inventory/goods-receipts', needs: ['store.parts.manage', 'store.grn.record', 'analytics.inventory.view', 'warranty.view'], does: ['store.grn.record'], who: 'The Store',
    keywords: ['goods receipt', 'grn', 'receive', 'delivery', 'stock in', 'supplier', 'restock'],
    steps: [
      'Go to Inventory → Goods Receipts and open "Record Goods Receipt".',
      'Enter the supplier, then for each part the quantity, unit and total cost (batch or serial numbers when the part needs them).',
      'Press "Record Goods Receipt". Stock goes up at once, and a pricing alert is raised if the new cost hurts the margin.',
    ],
  },
  {
    id: 'store-matching', title: 'Match estimate parts to stock (Store matching)', page: '/inventory/estimate-matching', needs: STORE, does: ['store.matching'], who: 'The Store',
    keywords: ['matching', 'match', 'estimate parts', 'store matching', 'unmatched'],
    steps: ['Go to Inventory → Estimate Matching to see estimates waiting on the Store.', 'Open one and press "Match" next to the right part for each line. The line is priced from the part\'s selling price.'],
  },
  {
    id: 'parts-request-store', title: 'Approve, reserve and release a parts request (Store)', page: '/workshop/parts-requests', needs: WORKSHOP, does: ['store.prs.release'], who: 'The Store',
    keywords: ['release', 'reserve', 'parts request', 'prs', 'hand over parts', 'issue parts'],
    steps: [
      'Open the parts request from Approvals or Workshop → Parts Requests.',
      'Press "Approve & Reserve" to hold the stock.',
      'When handing the parts over, press "Release". Part warranties are issued automatically.',
    ],
  },
  {
    id: 'pricing-alerts', title: 'Deal with pricing alerts', page: '/inventory/pricing', needs: ['store.parts.manage', 'store.grn.record', 'analytics.inventory.view', 'warranty.view'], does: ['store.parts.manage'], who: 'The Store',
    keywords: ['pricing alert', 'margin', 'loss', 'below cost', 'price alert', 'pricing command'],
    steps: ['Go to Inventory → Pricing Command Center.', 'For each alert press "Sync Price to Target" to reprice, or "Dismiss" with a reason to keep the current price.'],
  },
  {
    id: 'inventory-analytics', title: 'Read inventory analytics and the reorder planner', page: '/inventory/analytics', needs: ['analytics.inventory.view'],
    keywords: ['inventory analytics', 'reorder', 'stock value', 'turnover', 'dead stock', 'overstock', 'gmroi'],
    steps: ['Go to Inventory → Analytics.', '"What to do now" lists parts to reorder and stock that is not moving; the reorder planner shows how much to order.'],
  },
  // ── Warranty ──────────────────────────────────────────────────────
  {
    id: 'warranty-register', title: 'Register a vehicle warranty', page: '/warranty/register', needs: WARRANTY, does: ['warranty.manage'], who: 'Warranty staff',
    keywords: ['register warranty', 'vehicle warranty', 'new warranty', 'cover', 'guarantee'],
    steps: [
      'Go to Warranty → Register, find the vehicle by plate or VIN and press "Find".',
      'Choose the warranty policy, the delivery date, the odometer at delivery and the evidence.',
      'Press "Register warranty". A second person verifies it on the warranty page ("Evidence checked — verify") before it covers anything.',
    ],
  },
  {
    id: 'warranty-claim', title: 'Make a warranty claim', page: '/warranty/claims', needs: WARRANTY, does: ['warranty.manage'], who: 'Warranty staff, approved by the Warranty HOD and the Manager',
    keywords: ['claim', 'warranty claim', 'wc', 'provider', 'failed part', 'settlement'],
    steps: [
      'Go to Warranty → Claims and start a new claim from the warranty ("Start a warranty claim").',
      'Fill in the complaint, causal part and amounts, then press "Save draft claim" and send it for approval.',
      'The Warranty HOD and the Manager press "Approve"; then "Record as submitted", "Record decision" and "Record settlement" as the provider answers.',
    ],
  },
  {
    id: 'warranty-policies', title: 'Manage warranty policies and providers', page: '/warranty/policies', needs: WARRANTY, does: ['warranty.claim.approve'], who: 'The Warranty HOD or the Workshop Manager',
    keywords: ['policy', 'provider', 'warranty policy', 'manufacturer', 'coverage terms'],
    steps: ['Go to Warranty → Policies (or Providers) and use "Add policy" ("Add provider").', 'Removing one needs a request and two approvals ("Request deletion", then "Approve").'],
  },
  {
    id: 'warranty-analytics', title: 'Read warranty analytics', page: '/warranty/analytics', needs: ['analytics.warranty.view'],
    keywords: ['warranty analytics', 'expiring', 'claims by provider', 'recovered', 'approval rate'],
    steps: ['Go to Warranty → Analytics for coverage, claims, money recovered and what needs attention.'],
  },
  // ── Security ──────────────────────────────────────────────────────
  {
    id: 'exit-pass', title: 'Request an exit pass', page: '/security/exit-passes', needs: ['security.exit_pass.request'],
    keywords: ['exit pass', 'go out', 'leave', 'permission to leave', 'ep', 'step out'],
    steps: [
      'Go to My exit passes and start a new one ("Request an exit pass").',
      'Say who is going out, when, the reason, and whether you are coming back today.',
      'Press "Submit for approval". Your head of department and the Manager approve it; show it at the gate.',
    ],
  },
  {
    id: 'my-visitors', title: 'See the visitors coming to see me', page: '/security/my-visitors', needs: ['security.exit_pass.request'],
    keywords: ['my visitors', 'visitor', 'guest', 'expecting', 'host'],
    steps: ['Go to My visitors to see who is expected, who is on site and recent visits.', 'Expecting someone? Ask the front desk or Security to register them; you are told when they arrive.'],
  },
  {
    id: 'visitor-desk', title: 'Register and check in a visitor (desk)', page: '/security/visitors', needs: ['security.view'], does: ['security.reception.operate', 'security.gate.operate'], who: 'Reception and Security',
    keywords: ['visitor', 'register visitor', 'check in', 'visitor pass', 'reception', 'check out visitor'],
    steps: [
      'Go to Security → Visitors and fill in "Register a visitor" (who they are seeing, purpose, expected arrival and stay).',
      'Press "Book the visit", or "Register and issue pass" when they are already here.',
      'On arrival press "Check in and issue pass"; reception presses "Received at reception — tell the host"; press "Check out" when they leave.',
    ],
  },
  {
    id: 'deliveries', title: 'Record a delivery at the gate', page: '/security/deliveries', needs: ['security.view', 'store.grn.record'],
    keywords: ['delivery', 'supplier delivery', 'dlv', 'goods arriving', 'truck'],
    steps: [
      'Go to Security → Deliveries and open "Record a delivery".',
      'Enter the supplier, what is being delivered and the vehicle, then press "Announce the delivery" (or "Record arrival — tell the Store").',
      'The Store presses "Confirm received by the Store"; Security presses "Record vehicle leaving".',
    ],
  },
  {
    id: 'contractors', title: 'Get a contractor pass', page: '/security/contractors', needs: ['security.view', 'security.pass.approve'],
    keywords: ['contractor', 'ctr', 'workers', 'artisan', 'vendor on site'],
    steps: [
      'Go to Security → Contractors and open "Request a contractor pass".',
      'Enter the company, the work, where on site, the team and the days, then press "Submit for the Manager".',
      'The Manager presses "Approve pass"; the gate presses "Sign team in" and "Sign team out" each day.',
    ],
  },
  {
    id: 'incidents', title: 'Report a security incident', page: '/security/incidents', needs: ['security.view'], does: ['security.view'],
    keywords: ['incident', 'report', 'theft', 'accident', 'security issue', 'inc'],
    steps: [
      'Go to Security → Incidents and open "Report an incident".',
      'Describe what happened, when and where, the severity and any action taken, then press "Report incident".',
      'The Chief Security Officer can "Assign", "Close incident" and "Reopen".',
    ],
  },
  {
    id: 'vehicle-exit', title: 'Let a vehicle leave through the gate', page: '/security/vehicles', needs: ['security.view'], does: ['security.gate.operate'], who: 'Security',
    keywords: ['vehicle exit', 'gate', 'release vehicle', 'leave', 'vx', 'cleared to leave'],
    steps: ['Go to Security → Vehicles cleared to leave.', 'Open the vehicle, check who is collecting it and press "Confirm exit".'],
  },
  // ── Scheduling ────────────────────────────────────────────────────
  {
    id: 'appointment', title: 'Book an appointment or meeting', page: '/schedule/new', needs: ['schedule.view', 'schedule.manage'],
    keywords: ['appointment', 'meeting', 'book', 'calendar', 'schedule', 'room', 'apt'],
    steps: [
      'Go to Scheduling and open "New appointment".',
      'Choose whose calendar, the title, date, start time and duration, and a meeting room or location. Add any outside visitors.',
      'Press "Book appointment". Everyone involved is reminded about an hour before.',
    ],
  },
  {
    id: 'aides', title: 'Let an aide book on my calendar', page: '/schedule/aides', needs: ['schedule.view', 'schedule.manage'],
    keywords: ['aide', 'assistant', 'delegate', 'book for me', 'secretary'],
    steps: ['Go to Scheduling → Aides and use "Add an aide".', 'Choose the colleague and press "Add aide". Press "Remove" to take it away.'],
  },
  // ── Notifications, broadcasts, approvals ──────────────────────────
  {
    id: 'broadcast', title: 'Send a broadcast (notice)', page: '/notifications/broadcasts/new', needs: ['notifications.broadcast.send'],
    keywords: ['broadcast', 'notice', 'announcement', 'bc', 'message everyone', 'circular'],
    steps: [
      'Go to Notifications → Broadcasts and open "New broadcast".',
      'Choose who it is for, write the title and message, set when it starts and how long it runs, and whether to email it too.',
      'Press "Publish broadcast". You can stop it early from its page ("Stop broadcast").',
    ],
  },
  {
    id: 'notifications', title: 'See my notifications', page: '/notifications', needs: EVERYONE,
    keywords: ['notification', 'bell', 'alerts', 'messages', 'notification center'],
    steps: ['Press the bell, or go to the Notification Center, to see what needs your attention and the broadcasts running for you.'],
  },
  {
    id: 'approvals', title: 'See everything waiting for my decision', page: '/approvals', needs: EVERYONE,
    keywords: ['approvals', 'pending', 'waiting', 'decide', 'to approve', 'my approvals'],
    steps: ['Open Approvals from the menu. Items are grouped by area, oldest first.', 'Open one to approve or decline it on its own page.'],
  },
  {
    id: 'dashboard', title: 'Find my work for today', page: '/dashboard', needs: EVERYONE,
    keywords: ['my work', 'today', 'dashboard', 'my jobs', 'my numbers', 'to do'],
    steps: ['Open the Dashboard: "My jobs" lists the work assigned to you and "My numbers this month" shows your figures.', 'The bell and Approvals list what is waiting for you.'],
  },
  // ── Administration ────────────────────────────────────────────────
  {
    id: 'recycle-bin', title: 'Restore something deleted by mistake', page: '/recycle-bin', needs: ['admin.recycle_bin.manage'],
    keywords: ['recycle bin', 'restore', 'deleted', 'undo delete', 'bin', 'removed'],
    steps: ['Go to the Recycle bin.', 'Find the item and press "Restore". Items are kept for a limited time before being removed for good.', 'Records are moved there from their own page with "Move to Recycle bin".'],
  },
  {
    id: 'users', title: 'Add a member of staff and give them a role', page: '/users', needs: ['admin.users.manage'],
    keywords: ['user', 'staff', 'employee', 'add staff', 'role', 'new user', 'account', 'switch off'],
    steps: [
      'Go to People and fill in the add form (name, email, branch, department and first role).',
      'Press "Add and send the welcome email". They set their own password from the email.',
      'To give another role, choose it next to their name and press "Give".',
    ],
  },
  {
    id: 'roles', title: 'Change what a role can do', page: '/roles', needs: ['admin.roles.manage'],
    keywords: ['role', 'permission', 'access', 'grant', 'rights'],
    steps: ['Go to Roles and open the role.', 'Pick a permission and press "Add". Everyone holding the role is emailed their new access.'],
  },
  {
    id: 'structure', title: 'Add a branch or department', page: '/structure', needs: ['admin.structure.manage'],
    keywords: ['branch', 'department', 'business unit', 'structure', 'location', 'team'],
    steps: ['Go to Structure to add a business unit and "Open branch".', 'Open the branch (Branches) to add its departments.'],
  },
  {
    id: 'assist', title: 'Help a colleague with their work (Branch Assistant)', page: '/support/assist', needs: ['support.assist', 'admin.users.manage'], does: ['support.assist'], who: 'The Branch Assistant',
    keywords: ['assist', 'help colleague', 'assisted session', 'branch assistant', 'on behalf'],
    steps: [
      'Go to Assist a colleague and search for them.',
      'Press "Help …", have the colleague type their own password, and start the session.',
      'Everything done is recorded for the colleague with your name. End the session when finished.',
    ],
  },
  {
    id: 'business-analytics', title: 'Read business analytics (sales, profit, cash)', page: '/analytics', needs: ['analytics.business.view'],
    keywords: ['analytics', 'sales', 'revenue', 'profit', 'takings', 'collections', 'business', 'report'],
    steps: ['Go to Analytics and choose the period.', 'See sales, gross profit, collections, work in progress, money owed and what to do now.'],
  },
  {
    id: 'error-reference', title: 'What to do with an error reference number', page: '/dashboard', needs: EVERYONE,
    keywords: ['error', 'reference', 'something went wrong', 'quote reference', 'bug', 'problem'],
    steps: ['When a message says "quote reference" and a 10-digit number, try again once.', 'If it keeps happening, give that number to IT: they can look it up in the Error log.'],
  },
  {
    id: 'error-log', title: 'Look up an error reference (IT)', page: '/audit-logs/errors', needs: ['audit.view'],
    keywords: ['error log', 'reference', 'look up error', 'audit', 'troubleshoot'],
    steps: ['Go to Audit Logs → Error log.', 'Paste the 10-digit reference and press "Search" to see when, where and for whom it happened.'],
  },
  {
    id: 'password', title: 'Change my password', page: '/profile', needs: EVERYONE,
    keywords: ['password', 'change password', 'profile', 'my account', 'appearance', 'dark mode'],
    steps: ['Open your Profile from the account menu.', 'Use "Change my password". You can also choose light or dark appearance there.'],
  },
  // ── Enyo, reminders and mail ──────────────────────────────────────
  {
    id: 'enyo', title: 'Use Enyo, the assistant', page: '/dashboard', needs: EVERYONE,
    keywords: ['enyo', 'assistant', 'ai', 'chat', 'ask', 'remember', 'forget', 'help'],
    steps: [
      'Open Enyo from its button on any page and ask in your own words, for example "What is waiting for me?" or "Status of JC-2026-000412".',
      'Enyo only sees what your role can see, and links to the record so you can check it.',
      'Enyo can prepare drafts (a Job Card form, a reminder, a reply) but never saves or sends anything: you check and press the normal button.',
      'Say "Remember that …" for things it should keep in mind, and "Forget …" to remove them. Rate answers with the thumbs.',
    ],
  },
  {
    id: 'enyo-settings', title: 'Switch Enyo features on or off', page: '/settings/enyo', needs: ['admin.settings.manage'], does: ['enyo.manage'], who: 'Administrators',
    keywords: ['enyo settings', 'switch off ai', 'ai settings', 'display name', 'predictions', 'test connection', 'model'],
    steps: ['Go to Settings → Enyo.', 'Turn the staff assistant, customer assistant, website assistant or mail features on or off, set the display name and the predictions mode, then save.', 'Press "Test connection" to check that the model server answers.'],
  },
  {
    id: 'enyo-memory', title: 'See or delete what Enyo remembers about me', page: '/profile/enyo', needs: EVERYONE,
    keywords: ['enyo memory', 'what do you remember', 'forget me', 'remembered facts', 'privacy'],
    steps: ['Open your Profile and choose "My Enyo memory".', 'Each fact you asked Enyo to remember is listed. Press "Delete" next to any you want gone.'],
  },
  {
    id: 'enyo-learning', title: 'See how accurate Enyo\'s workshop predictions are', page: '/enyo/learning', needs: ['enyo.manage'], who: 'Administrators and managers with business analytics',
    keywords: ['learning', 'accuracy', 'predictions', 'likely lines', 'shadow mode', 'suggest mode', 'training data'],
    steps: ['Go to Settings → Enyo — learning (also linked from Business Analytics).', 'Read the accuracy by week, the lines it keeps missing and its progress toward the rule for switching to Suggest mode.', 'An administrator decides when to switch modes on Settings → Enyo.'],
  },
  {
    id: 'enyo-models', title: 'Review Enyo\'s trained models and set each capability\'s level', page: '/enyo/models', needs: ['enyo.manage'], does: ['enyo.manage'], who: 'Administrators',
    keywords: ['model', 'machine learning', 'ml', 'trained', 'shadow', 'assist', 'automation level', 'job time', 'ready time', 'unusual price', 'reorder', 'complaint themes'],
    steps: ['Go to Enyo learning and open "Models" (or go to /enyo/models).', 'Each model shows how it did on the newest jobs against a simple baseline. Press "Use this model" on one marked Ready to use.', 'Set each capability\'s level: Shadow measures it without showing anyone; Assist shows it to people, who still decide. "Retire" stops a model at once.'],
  },
  {
    id: 'reorder-suggestions', title: 'See which parts to reorder (Enyo)', page: '/inventory/reorder', needs: ['store.view', 'analytics.inventory.view'], who: 'Store staff and managers',
    keywords: ['reorder', 'restock', 'order parts', 'running low', 'reorder point', 'demand', 'forecast'],
    steps: ['Go to Inventory → Reorder suggestions (/inventory/reorder).', 'Each part listed is at or below the reorder point learned from its real use, with the next four weeks\' expected use and a suggested quantity.', 'Raise the order the usual way; nothing is ordered for you.'],
  },
  {
    id: 'support-inbox', title: 'Work the Support centre (emails to support@, chat hand-overs, calls)', page: '/crm/support', needs: ['crm.view'], does: ['support.tickets.manage'], who: 'Front desk, customer care, managers and administrators',
    keywords: ['support', 'ticket', 'handover', 'customer care', 'complaint', 'sup', 'customer message', 'inbox', 'support centre', 'warranty email', 'helpdesk', 'late', 'sla'],
    steps: [
      'Go to Customers → Support centre. Late and urgent requests are at the top; the tiles show Open, Unassigned, Late, Waiting on customers and Mine. Pick a team on the left to see only its requests.',
      'Open a request: read Enyo\'s summary and why a person is needed, check the customer\'s vehicles and jobs on the right, and whether they are verified before discussing their records or money.',
      'Reply in the box (or start from Enyo\'s suggested reply, or press "Ask Enyo for a draft"). It is emailed from the team\'s own address in the same thread and shows in their portal. Choose what happens next: wait for the customer, resolved, or on hold.',
      'Add an internal note for colleagues (the customer never sees notes), change the priority, move it to another team, or assign it.',
      'Going on leave or busy? Press "Mark me away" so new requests go to colleagues who are in.',
    ],
  },
  {
    id: 'support-new', title: 'Log a phone call or walk-in as a support request', page: '/crm/support/new', needs: ['crm.view'], does: ['support.tickets.manage'], who: 'Front desk and customer care',
    keywords: ['log a call', 'new ticket', 'new support request', 'walk in', 'whatsapp', 'phone complaint', 'open a ticket'],
    steps: ['Go to Customers → Support centre → New request.', 'Enter the customer (a known customer\'s email links their file), what it is about and what they said, the team and the priority.', 'Open it: it gets a SUP number, a target time and an owner like an email would.'],
  },
  {
    id: 'support-numbers', title: 'See the Support centre numbers (speed, targets, satisfaction)', page: '/crm/support/analytics', needs: ['crm.view'], does: ['support.tickets.manage'],
    keywords: ['support numbers', 'support analytics', 'first response', 'csat', 'satisfaction', 'sla', 'how fast', 'resolved by enyo'],
    steps: ['Go to Customers → Support centre → Numbers.', 'Choose the period. You see first-answer time, targets met, how many Enyo resolved and why people were needed, reopen rate, satisfaction, backlog age, topics and each team.', 'Ask Enyo: "How is support doing this month?" for the same figures in a sentence.'],
  },
  {
    id: 'support-setup', title: 'Set up support teams and addresses (support@, warranty@, technical@)', page: '/settings/support', needs: ['admin.settings.manage'], does: ['support.manage'], who: 'Administrators',
    keywords: ['support setup', 'support email', 'warranty@', 'technical@', 'customercare@', 'queue', 'team', 'auto reply', 'autoresponder', 'opening hours', 'targets', 'sla'],
    steps: [
      'Go to Settings → Support centre set-up.',
      'Add a team (for example Warranty), choose how Enyo helps (people only, Enyo drafts, or Enyo answers general questions), its targets and whether to send an acknowledgement.',
      'Connect the team\'s address with an app password. New mail becomes numbered requests within minutes; the customer gets the reference and when to expect an answer.',
      'Tick who works the team and how many open requests each takes. Set opening hours, holidays and the reminder and closing rules at the bottom.',
    ],
  },
  {
    id: 'reminders', title: 'Set a reminder', page: '/reminders', needs: EVERYONE,
    keywords: ['reminder', 'remind me', 'follow up', 'alarm', 'due'],
    steps: ['Go to Reminders and create a new one.', 'Give it a title and the date and time it is due, then save. You are reminded when it is due.', 'You can also ask Enyo: "Remind me to call Mr Ade at 3 pm" — check the draft and save it.'],
  },
  {
    id: 'reminders-delegate', title: 'Let a colleague set reminders for me', page: '/reminders', needs: EVERYONE,
    keywords: ['reminder for someone', 'remind my manager', 'delegate', 'set reminders for me', 'permission'],
    steps: ['Go to Reminders and open "Who may set reminders for me".', 'Choose the colleague and press allow. They can now set reminders for you; you can withdraw it at any time.', 'To set one for a colleague, they must have allowed you first.'],
  },
  {
    id: 'mail', title: 'Read and send email from my connected mailbox', page: '/mail', needs: EVERYONE,
    keywords: ['mail', 'email', 'inbox', 'mailbox', 'compose', 'reply'],
    steps: ['Go to Mail and connect your work mailbox the first time.', 'Open a message to read it, or compose a new one and press send.', 'Enyo can draft a reply for you to check before you send it.'],
  },
  {
    id: 'mail-connect', title: 'Connect my work email (Gmail, Zoho or your organisation\'s mail)', page: '/mail/connect', needs: EVERYONE,
    keywords: ['connect email', 'gmail', 'app password', 'imap', 'smtp', 'zoho', 'outlook', 'microsoft', 'mailbox settings'],
    steps: ['Go to Mail → Connect and pick your provider (Gmail, Zoho or your organisation\'s mail).', 'For Gmail, turn on 2-step verification and create an app password, then use that instead of your normal password.', 'Press connect: the portal checks the mailbox before saving. Then choose whether Enyo may read, sort and summarise your email.', 'Microsoft 365 mailboxes need a sign-in option that is not available yet.'],
  },
];

const STOP = new Set(['how', 'do', 'i', 'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'my', 'me', 'is', 'can', 'what', 'where', 'and', 'or', 'with', 'please', 'you', 'it', 'this', 'that', 'should', 'does', 'one', 'we']);

/** Lower-case words of a question, without filler. */
export function guideWords(q: string): string[] {
  return q.toLowerCase().replace(/[^a-z0-9%\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

/** How well one entry matches the question (0 = not at all). */
export function guideScore(e: GuideEntry, q: string): number {
  const words = guideWords(q);
  if (!words.length) return 0;
  const phrase = words.join(' ');
  const title = e.title.toLowerCase();
  let s = 0;
  if (title.includes(phrase)) s += 6;
  for (const k of e.keywords) {
    if (phrase.includes(k)) s += k.includes(' ') ? 5 : 3;
  }
  for (const w of words) {
    if (title.split(/[^a-z0-9%]+/).includes(w)) s += 2;
    else if (e.keywords.some((k) => k.split(' ').includes(w))) s += 1;
  }
  return s;
}

/** Whether this person may open the entry's page (the same rule the page enforces). */
export function canOpenGuide(e: GuideEntry, p: Principal): boolean {
  return e.needs.length === 0 || e.needs.some((k) => decide(p, k).allowed);
}

export type GuideHit = { id: string; title: string; href: string; youCanDoThis: boolean; who?: string; steps: string[] };

/**
 * The best matching entries this person can open, plus the titles of
 * matches they can't (so Enyo can say it exists but is someone else's).
 */
export function searchGuide(q: string, p: Principal, limit = 3): { results: GuideHit[]; notYours: string[] } {
  const ranked = GUIDE.map((e) => ({ e, s: guideScore(e, q) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s);
  const results: GuideHit[] = [];
  const notYours: string[] = [];
  for (const { e } of ranked) {
    if (canOpenGuide(e, p)) {
      if (results.length < limit) {
        const youCanDoThis = !e.does?.length || e.does.some((k) => decide(p, k).allowed);
        results.push({ id: e.id, title: e.title, href: e.page, youCanDoThis, ...(e.who ? { who: e.who } : {}), steps: e.steps });
      }
    } else if (notYours.length < 3) notYours.push(e.title);
  }
  return { results, notYours };
}
