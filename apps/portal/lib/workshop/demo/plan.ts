/**
 * The workshop demo: six months of Isolo Branch — customers and their
 * vehicles, job cards in every status with their estimates, parts slips,
 * issued parts (by batch and serial), payments, deposits, a refund and
 * rework; vehicle services in every status with inspections, estimates,
 * an escalation and the service tracker; the store (suppliers, goods
 * receipts, stock below reorder, pricing alerts); warranty (providers,
 * policies, warranties, claims at every stage); security (visitors, exit
 * passes, road tests, incidents, deliveries, a contractor); scheduling,
 * broadcasts, support tickets; completed imports and exports; and the
 * Afprint-built vehicles sold and serviced at Isolo.
 *
 * Pure: a seeded plan from an anchor ("now"), the same every run for the
 * same anchor, cut so that nothing is dated after it. The loader
 * (./load.ts) writes it; the tests check that every rule the portal
 * enforces holds inside the plan (statuses in order, deposits at 70%,
 * stock never negative, a refund only after a cancellation…).
 */
import { DEMO_CUSTOMERS, DEMO_STAFF, demoPerson, type DemoStaff } from '../../demo/people';
import { addWorkingMinutes, planPlantDemo } from '../../plant/demo/plan';
import { MINIMUM_DEPOSIT_FRACTION } from '../../workshop-constants';
import { getApplicableTemplate } from '../../vehicle-inspection-template';
import {
  APPOINTMENT_TITLES, BROADCASTS, CATEGORIES, COLOURS, COMMERCIAL_COMPLAINTS, CUSTOMERS, DEMO_SOURCE, EXIT_REASONS, EXPORTS, IMPORTS, INCIDENTS, JOB_LINES, MODELS, PARTS, PASSENGER_COMPLAINTS,
  PLATE_PREFIXES, POLICIES, PROVIDERS, SERVICE_TEXTS, SUPPLIERS, TICKETS, VISITOR_COMPANIES, VISITOR_PURPOSES, type CatalogueModel, type LineSpec,
} from './catalogue';

export { DEMO_SOURCE };

// ── Randomness that is the same every run ───────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const between = (r: Rng, lo: number, hi: number) => lo + r() * (hi - lo);
const int = (r: Rng, lo: number, hi: number) => Math.floor(between(r, lo, hi + 1));
const chance = (r: Rng, p: number) => r() < p;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);
const wm = (d: Date, minutes: number) => addWorkingMinutes(d, minutes);
const isWorkDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** A Lagos clock time (UTC+1) on the day of `day`. */
const at = (day: Date, hh: number, mm = 0) => new Date(utcMidnight(day).getTime() + ((hh - 1) * 60 + mm) * 60_000);
const round500 = (n: number) => Math.ceil(n / 500) * 500;

// ── The people (keys are the demo sign-ins) ─────────────────────────────
const P = {
  frontdesk: demoPerson('receptionist', 'ISOLO'), manager: demoPerson('workshop-manager', 'ISOLO'), finance: demoPerson('finance-officer', 'ISOLO'),
  supPass: DEMO_STAFF.find((s) => s.email.startsWith('supervisor.passenger@'))!, supComm: DEMO_STAFF.find((s) => s.email.startsWith('supervisor.commercial@'))!,
  techPass: DEMO_STAFF.find((s) => s.email.startsWith('tech.passenger@'))!, techComm: DEMO_STAFF.find((s) => s.email.startsWith('tech.commercial@'))!,
  storeManager: demoPerson('store-manager', 'ISOLO'), storeOfficer: demoPerson('store-officer', 'ISOLO'), warrantyHod: demoPerson('warranty-hod', 'ISOLO'), warrantyOfficer: demoPerson('warranty-officer', 'ISOLO'),
  cso: demoPerson('chief-security-officer', 'ISOLO'), gate: demoPerson('security-officer', 'ISOLO'), care: demoPerson('customer-care', 'ISOLO'), careLead: demoPerson('customer-care-lead', 'HQ'),
  deptHead: demoPerson('department-head', 'ISOLO'), itAdmin: demoPerson('it-administrator', 'HQ'), admin: demoPerson('administrator', 'HQ'), executive: demoPerson('executive', 'HQ'),
  scheduling: demoPerson('scheduling-admin', 'HQ'), calendar: demoPerson('calendar-user', 'HQ'), broadcaster: demoPerson('broadcaster', 'HQ'), assistant: demoPerson('branch-assistant', 'ISOLO'), branchAdmin: demoPerson('branch-administrator', 'ISOLO'),
  plantManager: demoPerson('plant-manager', 'AFPRINT'),
};
const who = (s: DemoStaff) => s.email;

// ── What the plan holds ─────────────────────────────────────────────────
export type Dept = 'workshop-passenger' | 'workshop-commercial';
export type DemoCustomer = { key: string; name: string; type: 'INDIVIDUAL' | 'ORGANIZATION'; company: string | null; phone: string; address: string; email: string | null; since: Date; contacts: { name: string; role: string; phone: string }[]; tags: string[]; createdAt: Date };
export type DemoVehicle = { key: string; customerKey: string; make: string; model: string; type: 'PASSENGER' | 'COMMERCIAL'; year: number; plate: string; vin: string; engineNumber: string; engineType: string; colour: string; mileage: number; createdAt: Date; fromPlant: boolean; plantVin?: string };
export type EstimateLine = { key: string; type: LineSpec['type']; description: string; quantity: number; unitPrice: number; amount: number; partKey: string | null; billTo: 'CUSTOMER' | 'WARRANTY' | 'GOODWILL'; billToNote: string | null };
export type DemoEstimate = { status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'MANAGER_APPROVED'; lines: EstimateLine[]; createdAt: Date; submittedAt: Date | null; approvedAt: Date | null; managerApprovedAt: Date | null; customerNotifiedAt: Date | null; matchingRequestedAt: Date | null; customerTotal: number; total: number };
export type DemoPayment = { key: string; amount: number; method: 'BANK_TRANSFER' | 'CASH'; at: Date; note: string; byKey: string };
export type DemoSlipLine = { key: string; partKey: string; estimateLineKey: string; quantity: number; released: number | null; batches: { batchKey: string; quantity: number }[]; serials: string[]; quantityFromReceiptKey: string | null };
export type DemoSlip = { key: string; status: 'PENDING_HOD_APPROVAL' | 'PENDING_STORE_APPROVAL' | 'APPROVED' | 'RELEASED' | 'REJECTED'; createdAt: Date; hodAt: Date | null; storeAt: Date | null; releasedAt: Date | null; receivedByKey: string | null; lines: DemoSlipLine[]; rejectionReason: string | null; rejectionStage: 'HOD' | 'STORE' | null; rejectedAt: Date | null };
export type AuditEntry = { action: string; at: Date; byKey: string; metadata?: Record<string, unknown> };
export type JobCardStatus = 'CHECKED_IN' | 'AWAITING_CUSTOMER_APPROVAL' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'QUALITY_CHECK' | 'COMPLETED' | 'READY_FOR_COLLECTION' | 'CLOSED' | 'CHECKED_OUT' | 'CANCELLED';
export type DemoJobCard = {
  key: string; vehicleKey: string; customerKey: string; dept: Dept; kind: string; service: boolean; openedAt: Date; status: JobCardStatus;
  complaints: string[]; diagnosis: string | null; notes: string | null; mileage: number; technicianKey: string; supervisorKey: string;
  approvalStatus: 'PENDING' | 'APPROVED'; approvedAt: Date | null; technicianAcceptance: 'PENDING' | 'ACCEPTED'; technicianRespondedAt: Date | null;
  workStartedAt: Date | null; completedAt: Date | null; readyForCollectionAt: Date | null; closedAt: Date | null; checkedOutAt: Date | null; collectedByName: string | null;
  estimate: DemoEstimate | null; payments: DemoPayment[]; slips: DemoSlip[];
  rework: { at: Date; reason: string; byKey: string } | null;
  cancellation: { reason: string; requestedAt: Date; decidedAt: Date | null; status: 'PENDING' | 'APPROVED' } | null;
  close: { requestedAt: Date; decidedAt: Date | null; status: 'PENDING' | 'APPROVED' } | null;
  refund: { amount: number; method: 'BANK_TRANSFER' | 'CASH'; at: Date; paidToName: string; reason: string } | null;
  gateExit: { at: Date; driverName: string } | null;
  roadTest: { key: string; status: 'PENDING_MANAGER' | 'APPROVED' | 'OUT' | 'RETURNED'; requestedAt: Date; approvedAt: Date | null; outAt: Date | null; inAt: Date | null; startOdometer: number; endOdometer: number | null; purpose: string } | null;
  warrantyKey: string | null; escalatedFromServiceKey: string | null;
  audit: AuditEntry[];
};
export type ServiceStatus = 'SCHEDULED' | 'CHECKED_IN' | 'IN_SERVICE' | 'COMPLETED' | 'READY_FOR_COLLECTION' | 'CLOSED' | 'COLLECTED' | 'CANCELLED' | 'ESCALATED';
export type DemoService = {
  key: string; vehicleKey: string; customerKey: string; dept: Dept; createdAt: Date; status: ServiceStatus; text: string; odometer: number; technicianKey: string; supervisorKey: string;
  checkedInAt: Date | null; workStartedAt: Date | null; completedAt: Date | null; readyForCollectionAt: Date | null; closedAt: Date | null; collectedAt: Date | null; collectedByName: string | null; cancelledAt: Date | null; escalatedAt: Date | null; attendedAt: Date | null;
  nextServiceDueOdometer: number | null; nextServiceDueDate: Date | null; approvalStatus: 'PENDING' | 'APPROVED'; approvedAt: Date | null;
  inspection: { status: 'COMPLETED' | 'IN_PROGRESS'; startedAt: Date; completedAt: Date | null; items: { section: string; name: string; condition: string; severity: 'GOOD' | 'ATTENTION' | 'SERVICE_REQUIRED' | 'CRITICAL'; action: string }[] } | null;
  estimate: DemoEstimate | null; payments: DemoPayment[]; slips: DemoSlip[];
  cancellation: { reason: string; requestedAt: Date; decidedAt: Date; status: 'APPROVED' } | null; close: { requestedAt: Date; decidedAt: Date; status: 'APPROVED' } | null;
  escalatedToJobKey: string | null; gateExit: { at: Date; driverName: string } | null; audit: AuditEntry[];
};
export type DemoReceiptLine = { key: string; partKey: string; quantity: number; unitCost: number; batch: { key: string; number: string; expiry: Date } | null; serials: string[]; pricingAlert: { severity: 'DEFICIT' | 'BOOST' | 'CRITICAL_LOSS'; status: 'OPEN' | 'RESOLVED'; previousUnitCost: number; actualMargin: number; resolvedAt: Date | null; note: string | null } | null };
export type DemoReceipt = { key: string; supplierKey: string; receivedAt: Date; byKey: string; opening: boolean; notes: string | null; lines: DemoReceiptLine[]; delivery: { key: string; status: 'RECEIVED' | 'LEFT'; arrivedAt: Date; leftAt: Date | null; driverName: string; plate: string } | null };
export type DemoWarranty = { key: string; kind: 'ASSET' | 'PART'; policyKey: string; providerKey: string; customerKey: string; vehicleKey: string | null; partKey: string | null; serial: string | null; slipLineKey: string | null; jobKey: string | null; subject: string; startsAt: Date; endsAt: Date; startReading: number | null; distanceLimit: number | null; origin: 'AUTO' | 'MANUAL'; status: 'ACTIVE' | 'PENDING_VERIFICATION'; issuedByKey: string; verifiedByKey: string | null; verifiedAt: Date | null; evidenceNote: string | null; quantity: number | null };
export type ClaimStatus = 'DRAFT' | 'PENDING_HOD' | 'PENDING_MANAGER' | 'APPROVED_TO_SUBMIT' | 'SUBMITTED' | 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' | 'SETTLED';
export type DemoClaim = { key: string; warrantyKey: string; jobKey: string; status: ClaimStatus; complaint: string; cause: string; correction: string; causalPart: string; causalPartNumber: string | null; failureDate: Date; failureReading: number; labour: number; parts: number; logistics: number; claimed: number; approved: number | null; settled: number | null; createdAt: Date; reviewRequestedAt: Date | null; hodAt: Date | null; managerAt: Date | null; submittedAt: Date | null; decidedAt: Date | null; settledAt: Date | null; deadlineAt: Date; providerReference: string | null; settlementReference: string | null; decisionNotes: string | null; remedy: 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR'; partReturnRequired: boolean; partReturnStatus: 'AWAITING' | 'SENT' | 'RECEIVED_BY_PROVIDER' | null; customerResolution: 'REPAIRED_NO_CHARGE' | 'REPLACED_NO_CHARGE' | 'CUSTOMER_PAID' | null };
export type DemoVisit = { key: string; status: 'EXPECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED'; visitorName: string; company: string | null; phone: string; purpose: string; hostKey: string; expectedAt: Date; durationMinutes: number; vehicleType: string; plate: string | null; checkedInAt: Date | null; checkedOutAt: Date | null; walkIn: boolean; createdAt: Date };
export type DemoExitPass = { key: string; status: 'PENDING_HEAD' | 'PENDING_MANAGER' | 'APPROVED' | 'OUT' | 'RETURNED' | 'CLOSED' | 'DECLINED'; requestedByKey: string; reason: string; returning: boolean; createdAt: Date; expectedOutAt: Date; expectedReturnAt: Date | null; durationMinutes: number; headAt: Date | null; managerAt: Date | null; gateOutAt: Date | null; gateInAt: Date | null; declinedAt: Date | null; declineReason: string | null; people: { key: string; name: string; employeeId: string; designation: string }[] };
export type DemoIncident = { key: string; type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; status: 'OPEN' | 'UNDER_REVIEW' | 'CLOSED'; occurredAt: Date; location: string; description: string; actionTaken: string; reportedByKey: string; assignedToKey: string | null; closedAt: Date | null; resolution: string | null };
export type DemoDelivery = { key: string; receiptKey: string | null; status: 'EXPECTED' | 'AT_GATE' | 'RECEIVED' | 'LEFT'; supplierName: string; items: string; expectedAt: Date; arrivedAt: Date | null; receivedAt: Date | null; leftAt: Date | null; driverName: string; plate: string; createdAt: Date };
export type DemoContractor = { key: string; status: 'APPROVED'; company: string; work: string; workArea: string; leadName: string; teamSize: number; validFrom: Date; validUntil: Date; hostKey: string; requestedByKey: string; managerAt: Date; attendance: { date: Date; workers: number; inAt: Date; outAt: Date | null }[] };
export type DemoAppointment = { key: string; title: string; agenda: string | null; ownerKey: string; participantKeys: string[]; startsAt: Date; endsAt: Date; status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'; roomKey: string | null; location: string | null; createdAt: Date };
export type DemoTicket = { key: string; channel: 'CUSTOMER_PORTAL' | 'WEBSITE' | 'EMAIL' | 'STAFF'; subject: string; summary: string; priority: string; status: 'OPEN' | 'WAITING_ON_CUSTOMER' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED'; createdAt: Date; customerKey: string | null; contactName: string; contactPhone: string | null; contactEmail: string | null; assignedToKey: string | null; requesterKey: string | null; tags: string[]; firstResponseAt: Date | null; resolvedAt: Date | null; closedAt: Date | null; dueFirstResponseAt: Date; dueResolutionAt: Date; csat: number | null; replies: { at: Date; kind: 'CUSTOMER' | 'AGENT' | 'AI' | 'NOTE'; body: string; authorKey: string | null }[] };
export type DemoImport = { key: string; entity: string; fileName: string; rows: number; created: number; warnings: number; rejected: number; createdAt: Date; createdByKey: string; approvedByKey: string; signedOffByKey: string | null; totals: Record<string, unknown> | null };
export type DemoExport = { key: string; kind: string; format: 'xlsx' | 'csv'; summary: string; rows: number; createdAt: Date; createdByKey: string };

export type WorkshopDemoPlan = {
  anchor: Date; from: Date;
  customers: DemoCustomer[]; vehicles: DemoVehicle[];
  suppliers: { key: string; name: string; contact: string; phone: string; address: string; createdAt: Date }[];
  parts: { key: string; partNumber: string; name: string; categoryKey: string; typeName: string; tracking: 'QUANTITY' | 'BATCH' | 'SERIALIZED'; uom: string; price: number; reorder: number; safety: number; fit: string | null; warrantyPolicyKey: string | null; onHand: number; reserved: number; createdAt: Date }[];
  receipts: DemoReceipt[];
  providers: typeof PROVIDERS; policies: typeof POLICIES;
  warranties: DemoWarranty[]; claims: DemoClaim[];
  jobCards: DemoJobCard[]; services: DemoService[];
  reminders: { vehicleKey: string; sentAt: Date; dueOdometer: number; dueDate: Date; odometerAtSend: number }[];
  visits: DemoVisit[]; exitPasses: DemoExitPass[]; incidents: DemoIncident[]; deliveries: DemoDelivery[]; contractors: DemoContractor[];
  rooms: { key: string; name: string; location: string; capacity: number }[]; appointments: DemoAppointment[];
  broadcasts: { key: string; category: string; title: string; message: string; audience: string; startsAt: Date; endsAt: Date; createdAt: Date; byKey: string }[];
  announcement: { message: string; expiresAt: Date; createdAt: Date; byKey: string };
  tickets: DemoTicket[]; imports: DemoImport[]; exports: DemoExport[];
  figures: Record<string, number>;
};

// ── Helpers that keep the rules ─────────────────────────────────────────
const customerTotal = (lines: EstimateLine[]) => lines.filter((l) => l.billTo === 'CUSTOMER').reduce((s, l) => s + l.amount, 0);

/** Stock bookkeeping across the plan: receipts add, released slips take; FIFO batches, named serials. Never negative. */
class Stock {
  onHand = new Map<string, number>();
  reserved = new Map<string, number>();
  batches = new Map<string, { key: string; remaining: number; receivedAt: Date }[]>();
  serials = new Map<string, string[]>();
  lastReceiptLine = new Map<string, string>();
  /** Everything released over the plan, per part (the sizing pass reads it). */
  consumed = new Map<string, number>();
  add(partKey: string, qty: number, receiptLineKey: string, batch: { key: string; receivedAt: Date } | null, serials: string[]) {
    this.onHand.set(partKey, (this.onHand.get(partKey) ?? 0) + qty);
    this.lastReceiptLine.set(partKey, receiptLineKey);
    if (batch) { const list = this.batches.get(partKey) ?? []; list.push({ key: batch.key, remaining: qty, receivedAt: batch.receivedAt }); this.batches.set(partKey, list); }
    if (serials.length) this.serials.set(partKey, [...(this.serials.get(partKey) ?? []), ...serials]);
  }
  available(partKey: string) { return (this.onHand.get(partKey) ?? 0) - (this.reserved.get(partKey) ?? 0); }
  reserve(partKey: string, qty: number) { this.reserved.set(partKey, (this.reserved.get(partKey) ?? 0) + qty); }
  /** Takes from stock (and off the reservation): FIFO batches, the oldest serials. */
  release(partKey: string, qty: number, reservedBefore: boolean): { batches: { batchKey: string; quantity: number }[]; serials: string[]; quantityFromReceiptKey: string | null } {
    this.onHand.set(partKey, (this.onHand.get(partKey) ?? 0) - qty);
    this.consumed.set(partKey, (this.consumed.get(partKey) ?? 0) + qty);
    if (reservedBefore) this.reserved.set(partKey, (this.reserved.get(partKey) ?? 0) - qty);
    const out = { batches: [] as { batchKey: string; quantity: number }[], serials: [] as string[], quantityFromReceiptKey: this.lastReceiptLine.get(partKey) ?? null };
    const list = this.batches.get(partKey);
    if (list) {
      let left = qty;
      for (const b of list) { if (left <= 0) break; const take = Math.min(b.remaining, left); if (take > 0) { b.remaining -= take; out.batches.push({ batchKey: b.key, quantity: take }); left -= take; } }
    }
    const serials = this.serials.get(partKey);
    if (serials) out.serials = serials.splice(0, qty);
    return out;
  }
}

// ── The plan ────────────────────────────────────────────────────────────
/**
 * Two passes with the same dice: the first measures what the six months
 * take from the store, the second sizes the opening stock and the monthly
 * orders so nothing ever goes negative, most parts end comfortably above
 * their reorder point and the few the store let run down end below it.
 */
export function planWorkshopDemo(anchor: Date): WorkshopDemoPlan {
  const sizing = build(anchor, null);
  return build(anchor, sizing.consumed);
}

function build(anchor: Date, consumption: Map<string, number> | null): WorkshopDemoPlan & { consumed: Map<string, number> } {
  const r = mulberry32(20261102);
  const now = anchor;
  const from = plus(utcMidnight(now), -182 * DAY);
  const today = utcMidnight(now);
  const stock = new Stock();
  const partByKey = new Map(PARTS.map((p) => [p.key, p]));

  // Customers: the four sign-ins first (their records are the ones the portal shows), then the catalogue.
  const customers: DemoCustomer[] = [];
  const vehicles: DemoVehicle[] = [];
  let plateSeq = 100;
  let vinSeq = 410_000;
  const plate = () => `${pick(r, PLATE_PREFIXES)} ${String((plateSeq += 1)).slice(-3)} ${String.fromCharCode(65 + int(r, 0, 25))}${String.fromCharCode(65 + int(r, 0, 25))}`;
  const vinFor = (m: CatalogueModel) => {
    vinSeq += 1;
    const wmi = m.make === 'Isuzu' ? 'JAANLR85EL' : m.make === 'Soueast' ? 'LVVDB21B8R' : m.make === 'Toyota' ? 'AHTEB3CD40' : m.make === 'Hyundai' ? 'KMFGA17LPK' : m.make === 'Honda' ? 'JHMCR2F70K' : 'KNAPM81ADK';
    return `${wmi}D${String(vinSeq).slice(-6)}`;
  };
  const addVehicle = (customerKey: string, m: CatalogueModel, createdAt: Date, opts: { mileage?: number; year?: number; fromPlant?: { vin: string; engine: string; modelCode: string } } = {}): DemoVehicle => {
    const year = opts.year ?? int(r, m.years[0], m.years[1]);
    const v: DemoVehicle = {
      key: `v${vehicles.length + 1}`, customerKey, make: m.make, model: opts.fromPlant ? `${opts.fromPlant.modelCode} (built at Afprint)` : m.model, type: m.type, year, plate: plate(),
      vin: opts.fromPlant?.vin ?? vinFor(m), engineNumber: opts.fromPlant?.engine ?? `${m.engine.split('-')[0]}-${String(600_000 + vinSeq)}`, engineType: m.engine, colour: pick(r, COLOURS),
      mileage: opts.mileage ?? (m.type === 'COMMERCIAL' ? int(r, 20_000, 240_000) : int(r, 8_000, 140_000)), createdAt, fromPlant: Boolean(opts.fromPlant), plantVin: opts.fromPlant?.vin,
    };
    vehicles.push(v);
    return v;
  };
  const sinceOf = (createdAt: Date) => plus(createdAt, -int(r, 0, 1500) * DAY);
  const regDay = (daysAgoMax: number) => wm(at(plus(today, -int(r, 1, daysAgoMax) * DAY), 8, int(r, 0, 59)), int(r, 0, 300));
  const demoCust = (local: string) => DEMO_CUSTOMERS.find((c) => c.email.startsWith(`${local}@`))!;
  for (const c of DEMO_CUSTOMERS) {
    const createdAt = c.kind === 'PLANT' ? regDay(100) : regDay(170);
    customers.push({ key: c.email.split('@')[0]!, name: c.name, type: c.company ? 'ORGANIZATION' : 'INDIVIDUAL', company: c.company ?? null, phone: c.phone, address: c.address, email: c.email, since: sinceOf(createdAt), contacts: c.company ? [{ name: 'Fleet desk — Mr Dangiwa', role: 'Fleet Manager', phone: '0800 000 0112' }] : [], tags: c.company ? ['fleet', 'portal'] : ['portal'], createdAt });
  }
  const isuzuModel = (code: string) => MODELS.find((m) => m.model.startsWith(code))!;
  const S07 = MODELS.find((m) => m.model === 'S07')!;
  // Their vehicles: Adaora's S07; the fleet's trucks; the warranty customer's D-Max; the Afprint-built NQR comes below.
  addVehicle(demoCust('customer.adaora').email.split('@')[0]!, S07, customers[0]!.createdAt, { mileage: 18_400, year: 2025 });
  for (const code of ['NQR', 'NQR', 'NPR', 'FRR']) addVehicle('customer.fleet', isuzuModel(code), customers[1]!.createdAt, { mileage: int(r, 60_000, 190_000) });
  addVehicle('customer.warranty', MODELS.find((m) => m.model === 'D-Max')!, customers[2]!.createdAt, { mileage: 31_200, year: 2025 });
  for (const c of CUSTOMERS) {
    const createdAt = regDay(175);
    customers.push({ key: c.key, name: c.name, type: c.company ? 'ORGANIZATION' : 'INDIVIDUAL', company: c.company ?? null, phone: c.phone, address: c.address, email: null, since: sinceOf(createdAt), contacts: c.contacts ?? [], tags: c.tags ?? [], createdAt });
    const n = c.company ? int(r, 3, 5) : chance(r, 0.25) ? 2 : 1;
    for (let i = 0; i < n; i += 1) addVehicle(c.key, c.company ? pick(r, MODELS.filter((m) => m.type === 'COMMERCIAL')) : pick(r, MODELS.filter((m) => m.type === 'PASSENGER')), createdAt);
  }
  // The Afprint-built vehicles: the oldest in the plant demo's yard, sold through Isolo.
  const plant = planPlantDemo(anchor);
  const yard = plant.vehicles.filter((v) => v.stage === 'YARD').sort((a, b) => (a.gatePassedAt?.getTime() ?? 0) - (b.gatePassedAt?.getTime() ?? 0)).slice(0, 6);
  const plantOwners = ['customer.afprint', 'f01', 'f01', 'f02', 'c21', 'customer.fleet'];
  const plantVehicles: DemoVehicle[] = yard.map((pv, i) => {
    const m = pv.modelCode === 'S07' ? S07 : isuzuModel(pv.modelCode) ?? isuzuModel('NQR');
    const soldAt = wm(plus(pv.gatePassedAt ?? from, 3 * DAY), 120);
    return addVehicle(plantOwners[i]!, m, soldAt > now ? plus(now, -2 * DAY) : soldAt, { mileage: int(r, 400, 6_000), year: pv.modelYear, fromPlant: { vin: pv.vin, engine: pv.engineNumber, modelCode: pv.modelCode } });
  });
  const vehicleByKey = new Map(vehicles.map((v) => [v.key, v]));
  const customerByKey = new Map(customers.map((c) => [c.key, c]));

  // ── The store: suppliers, parts, receipts over the six months ──────────
  const suppliers = SUPPLIERS.map((s) => ({ key: s.key, name: s.name, contact: s.contact, phone: s.phone, address: s.address, createdAt: plus(from, -DAY) }));
  const partNumbers = new Map<string, string>();
  const catCount = new Map<string, number>();
  for (const p of PARTS) { const n = (catCount.get(p.category) ?? 0) + 1; catCount.set(p.category, n); partNumbers.set(p.key, `${p.category}-${String(n).padStart(3, '0')}`); }
  const receipts: DemoReceipt[] = [];
  let batchSeq = 0;
  let serialSeq = 0;
  const pricingAlertAt = new Set<string>();
  const receipt = (supplierKey: string, receivedAt: Date, lines: { partKey: string; quantity: number; costFactor?: number; alert?: 'DEFICIT' | 'CRITICAL_LOSS' | 'BOOST'; resolved?: boolean }[], opening = false): DemoReceipt => {
    const key = `grn${receipts.length + 1}`;
    const out: DemoReceipt = { key, supplierKey, receivedAt, byKey: who(chance(r, 0.7) ? P.storeOfficer : P.storeManager), opening, notes: opening ? 'Opening stock at the EJO cut-over (counted with Finance).' : null, lines: [], delivery: null };
    for (const [i, l] of lines.entries()) {
      const p = partByKey.get(l.partKey)!;
      const unitCost = Math.round(p.cost * (l.costFactor ?? between(r, 0.97, 1.04)));
      const lineKey = `${key}-${i + 1}`;
      const batch = p.tracking === 'BATCH' ? { key: `batch${(batchSeq += 1)}`, number: `LOT-${String(receivedAt.getUTCFullYear()).slice(2)}${String(receivedAt.getUTCMonth() + 1).padStart(2, '0')}-${String(batchSeq).padStart(3, '0')}`, expiry: plus(receivedAt, 730 * DAY) } : null;
      const serials = p.tracking === 'SERIALIZED' ? Array.from({ length: l.quantity }, () => `SN-${p.key.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${String((serialSeq += 1)).padStart(5, '0')}`) : [];
      let pricingAlert: DemoReceiptLine['pricingAlert'] = null;
      if (l.alert) {
        const margin = Math.round(((p.price - unitCost) / p.price) * 10_000) / 100;
        pricingAlert = { severity: l.alert, status: l.resolved ? 'RESOLVED' : 'OPEN', previousUnitCost: p.cost, actualMargin: margin, resolvedAt: l.resolved ? wm(receivedAt, 180) : null, note: l.resolved ? (l.alert === 'BOOST' ? 'Selling price kept; margin improved.' : 'Selling price raised 8% from Monday.') : null };
        pricingAlertAt.add(lineKey);
      }
      out.lines.push({ key: lineKey, partKey: l.partKey, quantity: l.quantity, unitCost, batch, serials, pricingAlert });
      stock.add(l.partKey, l.quantity, lineKey, batch ? { key: batch.key, receivedAt } : null, serials);
    }
    if (!opening) out.delivery = { key: `dlv-${key}`, status: 'LEFT', arrivedAt: plus(receivedAt, -35 * 60_000), leftAt: plus(receivedAt, 25 * 60_000), driverName: pick(r, ['Mr Sule', 'Mr Chukwu', 'Mr Bako', 'Mr Ikenna']), plate: plate() };
    receipts.push(out);
    return out;
  };
  /** Parts the store let run down: below their reorder point today (the stock alerts). */
  const THIN = new Set(['tie-rod', 'air-dryer', 'pads-f', 'cabin-filter']);
  // Opening stock on the first working day: generous for consumables, thin for the few parts that will run low.
  const openingDay = wm(at(from, 9), 0);
  /** Six months' use of a part (the sizing pass), or plenty on the first pass. */
  const totalUse = (partKey: string) => (consumption ? consumption.get(partKey) ?? 0 : 100_000);
  const openingQty = (partKey: string) => { const p = partByKey.get(partKey)!; const t = totalUse(partKey); return consumption ? (THIN.has(partKey) ? t + Math.ceil(p.reorder * 0.6) : Math.ceil(t * 0.7) + p.reorder) : 100_000; };
  const restockQty = (partKey: string) => { const p = partByKey.get(partKey)!; return consumption ? Math.max(Math.ceil(p.reorder * 0.5), Math.ceil(totalUse(partKey) * 0.1)) : 100; };
  for (const s of SUPPLIERS) {
    receipt(s.key, plus(openingDay, int(r, 0, 90) * 60_000), s.sells.map((partKey) => ({ partKey, quantity: openingQty(partKey), costFactor: 1 })), true);
  }
  // Monthly restocks per supplier (the second month's oil carries a cost jump that raises a pricing alert; one lamp order a saving).
  for (let month = 1; month <= 5; month += 1) {
    for (const s of SUPPLIERS) {
      const day = plus(from, (month * 30 + int(r, 0, 6)) * DAY);
      if (day >= today) continue;
      const lines = s.sells.filter((partKey) => chance(r, 0.8) && !THIN.has(partKey)).map((partKey) => {
        const base = { partKey, quantity: restockQty(partKey) };
        if (month === 2 && partKey === 'oil-15w40') return { ...base, costFactor: 1.21, alert: 'DEFICIT' as const, resolved: true };
        if (month === 4 && partKey === 'bulb-h4') return { ...base, costFactor: 0.82, alert: 'BOOST' as const, resolved: true };
        if (month === 5 && partKey === 'injector') return { ...base, costFactor: 1.34, alert: 'CRITICAL_LOSS' as const, resolved: false };
        if (month === 5 && partKey === 'pads-r') return { ...base, costFactor: 1.15, alert: 'DEFICIT' as const, resolved: false };
        return base;
      });
      if (lines.length) receipt(s.key, wm(at(day, int(r, 9, 14), int(r, 0, 59)), 0), lines);
    }
  }

  // ── Warranty set-up ────────────────────────────────────────────────────
  const warranties: DemoWarranty[] = [];
  const policyByKey = new Map(POLICIES.map((p) => [p.key, p]));
  const addWarranty = (w: Omit<DemoWarranty, 'key'>): DemoWarranty => { const out = { ...w, key: `wr${warranties.length + 1}` }; warranties.push(out); return out; };
  const assetPolicyFor = (v: DemoVehicle) => (v.make === 'Isuzu' ? policyByKey.get('isuzu-3y')! : v.make === 'Soueast' ? policyByKey.get('soueast-5y')! : null);
  // The Afprint-built vehicles leave with the maker's warranty, verified by the HOD.
  for (const v of plantVehicles) {
    const pol = assetPolicyFor(v)!;
    addWarranty({ kind: 'ASSET', policyKey: pol.key, providerKey: pol.provider, customerKey: v.customerKey, vehicleKey: v.key, partKey: null, serial: null, slipLineKey: null, jobKey: null, subject: `${v.make} ${v.model} · VIN ${v.vin}`, startsAt: v.createdAt, endsAt: plus(v.createdAt, pol.months * 30.4 * DAY), startReading: v.mileage, distanceLimit: pol.km ?? null, origin: 'MANUAL', status: 'ACTIVE', issuedByKey: who(P.warrantyOfficer), verifiedByKey: who(P.warrantyHod), verifiedAt: wm(v.createdAt, 240), evidenceNote: 'PDI certificate and sales invoice on file (Afprint build).', quantity: null });
  }
  // Newer Isuzu and Soueast vehicles registered with their maker's warranty from the sales papers.
  const warrantable = vehicles.filter((v) => !v.fromPlant && assetPolicyFor(v) && v.year >= 2024);
  for (const [i, v] of warrantable.slice(0, 11).entries()) {
    const pol = assetPolicyFor(v)!;
    const startsAt = plus(v.createdAt, -int(r, 30, 400) * DAY);
    const pending = i === 10;
    addWarranty({ kind: 'ASSET', policyKey: pol.key, providerKey: pol.provider, customerKey: v.customerKey, vehicleKey: v.key, partKey: null, serial: null, slipLineKey: null, jobKey: null, subject: `${v.make} ${v.model} · VIN ${v.vin}`, startsAt, endsAt: plus(startsAt, pol.months * 30.4 * DAY), startReading: Math.max(0, v.mileage - int(r, 5_000, 40_000)), distanceLimit: pol.km ?? null, origin: 'MANUAL', status: pending ? 'PENDING_VERIFICATION' : 'ACTIVE', issuedByKey: who(P.warrantyOfficer), verifiedByKey: pending ? null : who(P.warrantyHod), verifiedAt: pending ? null : wm(v.createdAt, int(r, 60, 600)), evidenceNote: pending ? 'Sales invoice photographed; warranty booklet to follow.' : 'Warranty booklet and sales invoice sighted.', quantity: null });
  }

  // ── Job cards and services across the six months ──────────────────────
  const jobCards: DemoJobCard[] = [];
  const services: DemoService[] = [];
  const mileageOf = new Map<string, number>(vehicles.map((v) => [v.key, Math.max(0, v.mileage - int(r, 4_000, 14_000))]));
  const lastServiceAt = new Map<string, Date>();
  const inWorkshop = new Map<string, Date>(); // vehicleKey → until
  const peopleFor = (dept: Dept) => (dept === 'workshop-passenger' ? { tech: P.techPass, sup: P.supPass } : { tech: P.techComm, sup: P.supComm });
  const deptOf = (v: DemoVehicle): Dept => (v.type === 'PASSENGER' ? 'workshop-passenger' : 'workshop-commercial');
  const collectorName = (c: DemoCustomer) => (c.type === 'ORGANIZATION' ? pick(r, ['Driver — Mr Sani', 'Driver — Mr Obi', 'Fleet desk — Mr Adewale', 'Driver — Mr Yusuf']) : c.name);
  let slipSeq = 0;
  let lineSeq = 0;

  const makeEstimate = (specs: LineSpec[], createdAt: Date, by: DemoStaff, warranty: DemoWarranty | null): DemoEstimate => {
    const lines: EstimateLine[] = specs.map((l) => {
      const qty = l.qty ?? 1;
      const warrantyLine = Boolean(warranty) && (l.type === 'STORE_PART' || l.type === 'LABOUR' || l.type === 'EXTERNAL_PART');
      return { key: `el${(lineSeq += 1)}`, type: l.type, description: l.description, quantity: qty, unitPrice: l.price, amount: qty * l.price, partKey: l.partKey ?? null, billTo: warrantyLine ? 'WARRANTY' : 'CUSTOMER', billToNote: warrantyLine ? `Covered by ${warranty!.subject.split(' · ')[0]} warranty` : null };
    });
    return { status: 'DRAFT', lines, createdAt, submittedAt: null, approvedAt: null, managerApprovedAt: null, customerNotifiedAt: null, matchingRequestedAt: null, customerTotal: customerTotal(lines), total: lines.reduce((s, l) => s + l.amount, 0) };
  };
  /** A parts slip for the estimate's store parts: HOD → store (reserved) → released (taken from stock), at the times given; stops where `stage` says. */
  const makeSlip = (est: DemoEstimate, requestedAt: Date, stage: 'PENDING_HOD_APPROVAL' | 'PENDING_STORE_APPROVAL' | 'APPROVED' | 'RELEASED', receivedBy: DemoStaff): DemoSlip | null => {
    const partLines = est.lines.filter((l) => l.type === 'STORE_PART' && l.partKey);
    if (!partLines.length) return null;
    const slip: DemoSlip = { key: `slip${(slipSeq += 1)}`, status: stage, createdAt: requestedAt, hodAt: null, storeAt: null, releasedAt: null, receivedByKey: null, lines: [], rejectionReason: null, rejectionStage: null, rejectedAt: null };
    for (const l of partLines) slip.lines.push({ key: `sl${slip.key}-${slip.lines.length + 1}`, partKey: l.partKey!, estimateLineKey: l.key, quantity: l.quantity, released: null, batches: [], serials: [], quantityFromReceiptKey: null });
    const order = ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED', 'RELEASED'];
    const reached = order.indexOf(stage);
    if (reached >= 1) slip.hodAt = wm(requestedAt, int(r, 20, 90));
    if (reached >= 2) { slip.storeAt = wm(slip.hodAt!, int(r, 15, 120)); for (const l of slip.lines) stock.reserve(l.partKey, l.quantity); }
    if (reached >= 3) {
      slip.releasedAt = wm(slip.storeAt!, int(r, 20, 150)); slip.receivedByKey = who(receivedBy);
      for (const l of slip.lines) { const taken = stock.release(l.partKey, l.quantity, true); l.released = l.quantity; l.batches = taken.batches; l.serials = taken.serials; l.quantityFromReceiptKey = taken.quantityFromReceiptKey; }
    }
    return slip;
  };
  const deposit = (total: number) => Math.min(total, round500(total * MINIMUM_DEPOSIT_FRACTION));

  type JobOpts = { vehicle: DemoVehicle; openedAt: Date; kind?: string; service?: boolean; target?: JobCardStatus; slow?: 'customer' | 'parts' | null; rework?: boolean; warranty?: DemoWarranty | null; fromServiceKey?: string | null; /** A quick job: the customer pays within the hour and the work is short, so a card opened a few days ago reaches its stage. */ quick?: boolean };
  /**
   * One job card from check-in to its state at the anchor. The timeline is
   * built in working time; the status is wherever the timeline has reached
   * by "now" (so recent cards sit at every stage), or stops at `target`.
   */
  const makeJobCard = (o: JobOpts): DemoJobCard => {
    const v = o.vehicle;
    const customer = customerByKey.get(v.customerKey)!;
    const dept = deptOf(v);
    const { tech, sup } = peopleFor(dept);
    const service = o.service ?? false;
    const kind = o.kind ?? (service ? (v.type === 'COMMERCIAL' ? 'service-truck' : 'service') : pick(r, (v.type === 'COMMERCIAL' ? COMMERCIAL_COMPLAINTS : PASSENGER_COMPLAINTS) as readonly (readonly [string, string, string])[])[2]);
    const complaintRow = ((v.type === 'COMMERCIAL' ? COMMERCIAL_COMPLAINTS : PASSENGER_COMPLAINTS) as readonly (readonly [string, string, string])[]).find((c) => c[2] === kind);
    const complaints = service ? [pick(r, SERVICE_TEXTS)] : [complaintRow?.[0] ?? kind];
    if (!service && chance(r, 0.2)) complaints.push(pick(r, ['Also check the horn', 'Customer asks for a wash before collection', 'Spare key not with the vehicle', 'Check tyre pressures']));
    const mileage = (mileageOf.get(v.key) ?? v.mileage) + int(r, 300, 2_600);
    mileageOf.set(v.key, mileage);
    const audit: AuditEntry[] = [];
    const log = (action: string, at: Date, by: DemoStaff, metadata?: Record<string, unknown>) => audit.push({ action, at, byKey: who(by), metadata });
    const jc: DemoJobCard = {
      key: `jc${jobCards.length + 1}`, vehicleKey: v.key, customerKey: v.customerKey, dept, kind, service, openedAt: o.openedAt, status: 'CHECKED_IN', complaints, diagnosis: null, notes: null, mileage,
      technicianKey: who(tech), supervisorKey: who(sup), approvalStatus: 'PENDING', approvedAt: null, technicianAcceptance: 'PENDING', technicianRespondedAt: null,
      workStartedAt: null, completedAt: null, readyForCollectionAt: null, closedAt: null, checkedOutAt: null, collectedByName: null, estimate: null, payments: [], slips: [], rework: null, cancellation: null, close: null, refund: null, gateExit: null, roadTest: null,
      warrantyKey: o.warranty?.key ?? null, escalatedFromServiceKey: o.fromServiceKey ?? null, audit,
    };
    log('job_card.created', o.openedAt, P.frontdesk, { jobNumber: '{number}' });
    if (o.target === 'CHECKED_IN') return jc;
    const stop = (status: JobCardStatus, when: Date | null) => { if (when && when <= now && (!o.target || o.target === status || !reached(o.target, status))) { jc.status = status; return false; } return true; };
    const order: JobCardStatus[] = ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'];
    const reached = (target: JobCardStatus, s: JobCardStatus) => order.indexOf(s) > order.indexOf(target);
    // 1. The supervisor accepts, the technician accepts, inspects and writes the estimate.
    let t = wm(o.openedAt, int(r, 20, 70));
    if (t > now) return jc;
    jc.approvalStatus = 'APPROVED'; jc.approvedAt = t; log('job_card.approved', t, sup, { jobNumber: '{number}' });
    t = wm(t, int(r, 10, 60)); if (t > now) return jc;
    jc.technicianAcceptance = 'ACCEPTED'; jc.technicianRespondedAt = t; log('assignment.accepted', t, tech);
    t = wm(t, int(r, 40, 150)); if (t > now) return jc;
    jc.diagnosis = service ? `Service per schedule at ${mileage.toLocaleString('en-NG')} km; ${pick(r, ['brake pads 40% left', 'tyres fine', 'coolant topped up', 'wiper blades due', 'battery tested OK'])}.` : complaintRow?.[1] ?? null;
    const est = makeEstimate(JOB_LINES[kind] ?? JOB_LINES.service!, t, tech, o.warranty ?? null);
    jc.estimate = est;
    log('estimate.line_item_added', t, tech, { lines: est.lines.length });
    // Cancellation before the estimate: the customer changes their mind.
    if (o.target === 'CANCELLED') {
      const reqAt = wm(t, int(r, 30, 400));
      const decidedAt = wm(reqAt, int(r, 30, 300));
      const paid = chance(r, 0.5) && reqAt > t;
      if (paid) { // deposit taken before the change of mind → refund
        est.status = 'MANAGER_APPROVED'; est.submittedAt = wm(t, 30); est.approvedAt = wm(est.submittedAt, 30); est.managerApprovedAt = wm(est.approvedAt, 30); est.customerNotifiedAt = wm(est.managerApprovedAt, 10);
        jc.status = 'AWAITING_CUSTOMER_APPROVAL';
        const dep = deposit(est.customerTotal);
        jc.payments.push({ key: `${jc.key}-p1`, amount: dep, method: 'BANK_TRANSFER', at: wm(est.customerNotifiedAt, 240), note: 'Deposit (70%)', byKey: who(P.finance) });
        log('payment.recorded', jc.payments[0]!.at, P.finance, { amount: dep });
      }
      jc.cancellation = { reason: pick(r, ['Customer will repair elsewhere (price)', 'Vehicle sold; owner no longer wants the repair', 'Insurance assessor took the vehicle', 'Customer travelled; will return next month']), requestedAt: reqAt, decidedAt: decidedAt <= now ? decidedAt : null, status: decidedAt <= now ? 'APPROVED' : 'PENDING' };
      log('cancellation.requested', reqAt, P.frontdesk);
      if (decidedAt <= now) {
        jc.status = 'CANCELLED'; log('cancellation.approved', decidedAt, P.manager);
        if (paid) { const refAt = wm(decidedAt, int(r, 120, 900)); if (refAt <= now) jc.refund = { amount: jc.payments[0]!.amount, method: 'BANK_TRANSFER', at: refAt, paidToName: customer.name, reason: 'Job card cancelled before work started; deposit returned.' }; }
        const outAt = wm(decidedAt, int(r, 60, 600));
        if (outAt <= now && chance(r, 0.6)) { jc.status = 'CHECKED_OUT'; jc.checkedOutAt = outAt; jc.collectedByName = collectorName(customer); jc.gateExit = { at: plus(outAt, 12 * 60_000), driverName: jc.collectedByName }; log('job_card.status_updated', outAt, P.frontdesk, { status: 'CHECKED_OUT' }); }
      }
      return jc;
    }
    // 2. Estimate: submitted → supervisor → manager → customer told.
    t = wm(t, int(r, 10, 40)); if (t > now) return jc;
    est.status = 'SUBMITTED'; est.submittedAt = t; log('estimate.submitted', t, tech);
    t = wm(t, int(r, 20, 120)); if (t > now) return jc;
    est.status = 'APPROVED'; est.approvedAt = t; log('estimate.approved', t, sup);
    t = wm(t, int(r, 30, 200)); if (t > now) return jc;
    est.status = 'MANAGER_APPROVED'; est.managerApprovedAt = t; log('estimate.manager_approved', t, P.manager);
    if (est.lines.some((l) => l.type === 'STORE_PART')) est.matchingRequestedAt = wm(t, 5);
    t = wm(t, int(r, 5, 30)); if (t > now) return jc;
    est.customerNotifiedAt = t; log('estimate.customer_notified', t, P.frontdesk);
    if (!stop('AWAITING_CUSTOMER_APPROVAL', t)) { /* status set */ }
    jc.status = 'AWAITING_CUSTOMER_APPROVAL';
    if (o.target === 'AWAITING_CUSTOMER_APPROVAL') return jc;
    // 3. The deposit (70%) starts the work — a slow customer takes days.
    const slowCustomer = o.slow === 'customer';
    t = wm(t, slowCustomer ? int(r, 2_500, 4_000) : o.quick ? int(r, 30, 120) : int(r, 60, 700)); if (t > now) return jc;
    const dep = est.customerTotal > 0 ? deposit(est.customerTotal) : 0;
    if (dep > 0) { jc.payments.push({ key: `${jc.key}-p1`, amount: dep, method: chance(r, 0.7) ? 'BANK_TRANSFER' : 'CASH', at: t, note: 'Deposit (70%) before work starts', byKey: who(P.finance) }); log('payment.recorded', t, P.finance, { amount: dep }); }
    jc.status = 'IN_PROGRESS'; jc.workStartedAt = t; log('job_card.status_updated', t, P.finance, { status: 'IN_PROGRESS' });
    if (o.target === 'IN_PROGRESS') return jc;
    // 4. Parts: the slip. A slow store (parts awaited) holds the card at AWAITING_PARTS.
    const slipAt = wm(t, int(r, 10, 60));
    if (o.slow === 'parts') {
      const slip = makeSlip(est, slipAt, 'PENDING_STORE_APPROVAL', tech);
      if (slip) { jc.slips.push(slip); if (slipAt <= now) { jc.status = 'AWAITING_PARTS'; log('job_card.status_updated', slipAt, sup, { status: 'AWAITING_PARTS' }); } }
      return jc;
    }
    const slip = makeSlip(est, slipAt, 'RELEASED', tech);
    if (slip) {
      if (slip.releasedAt! > now) { // the slip is on its way: the card waits for parts
        const partial = makeSlip(est, slipAt, slip.hodAt! > now ? 'PENDING_HOD_APPROVAL' : slip.storeAt! > now ? 'PENDING_STORE_APPROVAL' : 'APPROVED', tech)!;
        // undo the release bookkeeping the full slip did: rebuild stock from the partial (the full slip's reserve/release was already applied; reverse it)
        for (const l of slip.lines) { stock.onHand.set(l.partKey, (stock.onHand.get(l.partKey) ?? 0) + l.quantity); for (const b of l.batches) { const list = stock.batches.get(l.partKey)!; list.find((x) => x.key === b.batchKey)!.remaining += b.quantity; } if (l.serials.length) stock.serials.set(l.partKey, [...l.serials, ...(stock.serials.get(l.partKey) ?? [])]); }
        jc.slips.push(partial); jc.status = 'AWAITING_PARTS'; log('job_card.status_updated', slipAt, sup, { status: 'AWAITING_PARTS' });
        return jc;
      }
      jc.slips.push(slip);
    }
    if (o.target === 'AWAITING_PARTS') { jc.status = 'AWAITING_PARTS'; return jc; }
    // 5. Work, quality check, rework for a few, completion.
    const workMinutes = o.quick ? int(r, 90, 240) : service ? int(r, 150, 420) : int(r, 240, 1_500);
    t = wm(slip?.releasedAt ?? slipAt, workMinutes); if (t > now) return jc;
    jc.status = 'QUALITY_CHECK'; log('job_card.status_updated', t, tech, { status: 'QUALITY_CHECK' });
    if (o.target === 'QUALITY_CHECK') return jc;
    if (o.rework) {
      const rwAt = wm(t, int(r, 20, 90)); if (rwAt > now) return jc;
      jc.rework = { at: rwAt, reason: pick(r, ['Brake pedal still soft after the road test: bleed again', 'Warning lamp returned on the road test', 'A/C vent temperature 14 °C, limit 8 °C', 'Oil weep at the filter housing after the test run']), byKey: who(sup) };
      jc.status = 'IN_PROGRESS'; log('job_card.rework_requested', rwAt, sup, { reason: jc.rework.reason });
      t = wm(rwAt, int(r, 90, 400)); if (t > now) return jc;
      jc.status = 'QUALITY_CHECK'; log('job_card.status_updated', t, tech, { status: 'QUALITY_CHECK' });
    }
    // A road test for brakes, clutch, steering and suspension work.
    if (['brakes', 'clutch', 'steering', 'suspension', 'airbrake', 'spring', 'gearbox'].includes(kind)) {
      const reqAt = wm(t, int(r, 5, 30));
      const appAt = wm(reqAt, int(r, 10, 60)); const outAt = wm(appAt, int(r, 10, 40)); const inAt = wm(outAt, int(r, 25, 50));
      jc.roadTest = { key: `rt-${jc.key}`, status: inAt <= now ? 'RETURNED' : outAt <= now ? 'OUT' : appAt <= now ? 'APPROVED' : 'PENDING_MANAGER', requestedAt: reqAt, approvedAt: appAt <= now ? appAt : null, outAt: outAt <= now ? outAt : null, inAt: inAt <= now ? inAt : null, startOdometer: mileage, endOdometer: inAt <= now ? mileage + int(r, 6, 14) : null, purpose: `Road test after ${complaints[0]!.toLowerCase()}` };
      if (inAt > now) return jc;
      t = inAt;
    }
    t = wm(t, int(r, 20, 90)); if (t > now) return jc;
    jc.status = 'COMPLETED'; jc.completedAt = t; log('job_card.status_updated', t, sup, { status: 'COMPLETED' });
    if (o.target === 'COMPLETED') return jc;
    // 6. Ready for collection; the balance; the close request; checkout and the gate.
    t = wm(t, int(r, 15, 90)); if (t > now) return jc;
    jc.status = 'READY_FOR_COLLECTION'; jc.readyForCollectionAt = t; log('job_card.status_updated', t, sup, { status: 'READY_FOR_COLLECTION' }); log('collection.ready_reminder_sent', wm(t, 5), P.frontdesk);
    if (o.target === 'READY_FOR_COLLECTION') return jc;
    const balance = est.customerTotal - dep;
    t = wm(t, int(r, 60, 900)); if (t > now) return jc;
    if (balance > 0) { jc.payments.push({ key: `${jc.key}-p2`, amount: balance, method: chance(r, 0.6) ? 'BANK_TRANSFER' : 'CASH', at: t, note: 'Balance on collection', byKey: who(P.finance) }); log('payment.recorded', t, P.finance, { amount: balance }); }
    const closeReq = wm(t, int(r, 5, 40));
    const closeDec = wm(closeReq, int(r, 10, 120));
    if (closeReq > now) return jc;
    jc.close = { requestedAt: closeReq, decidedAt: closeDec <= now ? closeDec : null, status: closeDec <= now ? 'APPROVED' : 'PENDING' }; log('close.requested', closeReq, P.frontdesk);
    if (closeDec > now) return jc;
    jc.status = 'CLOSED'; jc.closedAt = closeDec; log('job_card.status_updated', closeDec, P.manager, { status: 'CLOSED' });
    if (o.target === 'CLOSED') return jc;
    t = wm(closeDec, int(r, 10, 200)); if (t > now) return jc;
    jc.status = 'CHECKED_OUT'; jc.checkedOutAt = t; jc.collectedByName = collectorName(customer); jc.gateExit = { at: plus(t, int(r, 5, 20) * 60_000), driverName: jc.collectedByName }; log('job_card.status_updated', t, P.frontdesk, { status: 'CHECKED_OUT' });
    if (service) lastServiceAt.set(v.key, t);
    return jc;
  };

  const makeService = (v: DemoVehicle, createdAt: Date, target?: ServiceStatus): DemoService => {
    const customer = customerByKey.get(v.customerKey)!;
    const dept = deptOf(v);
    const { tech, sup } = peopleFor(dept);
    const odometer = (mileageOf.get(v.key) ?? v.mileage) + int(r, 300, 2_200);
    mileageOf.set(v.key, odometer);
    const audit: AuditEntry[] = [];
    const log = (action: string, at: Date, by: DemoStaff, metadata?: Record<string, unknown>) => audit.push({ action, at, byKey: who(by), metadata });
    const sv: DemoService = {
      key: `sv${services.length + 1}`, vehicleKey: v.key, customerKey: v.customerKey, dept, createdAt, status: 'SCHEDULED', text: pick(r, SERVICE_TEXTS), odometer, technicianKey: who(tech), supervisorKey: who(sup),
      checkedInAt: null, workStartedAt: null, completedAt: null, readyForCollectionAt: null, closedAt: null, collectedAt: null, collectedByName: null, cancelledAt: null, escalatedAt: null, attendedAt: null,
      nextServiceDueOdometer: null, nextServiceDueDate: null, approvalStatus: 'PENDING', approvedAt: null, inspection: null, estimate: null, payments: [], slips: [], cancellation: null, close: null, escalatedToJobKey: null, gateExit: null, audit,
    };
    log('vehicle_service.created', createdAt, P.frontdesk);
    if (target === 'SCHEDULED') return sv;
    let t = wm(createdAt, int(r, 10, 90)); if (t > now) return sv;
    sv.approvalStatus = 'APPROVED'; sv.approvedAt = t;
    if (target === 'CANCELLED') {
      const reqAt = wm(t, int(r, 60, 300)); const decAt = wm(reqAt, int(r, 30, 200));
      sv.cancellation = { reason: 'Customer did not bring the vehicle; rebooked for next month', requestedAt: reqAt, decidedAt: decAt, status: 'APPROVED' }; sv.status = 'CANCELLED'; sv.cancelledAt = decAt; log('vehicle_service.cancelled', decAt, P.manager);
      return sv;
    }
    t = wm(t, int(r, 15, 120)); if (t > now) return sv;
    sv.status = 'CHECKED_IN'; sv.checkedInAt = t; log('vehicle_service.status_updated', t, P.frontdesk, { status: 'CHECKED_IN' });
    if (target === 'CHECKED_IN') return sv;
    // The inspection: every item in the template, a few needing attention.
    const insStart = wm(t, int(r, 10, 40));
    if (insStart <= now) {
      const template = getApplicableTemplate(v.type);
      const items = template.flatMap((s) => s.items.map((i) => ({ section: s.section, name: i.name, condition: i.conditionOptions[0] ?? 'Good', severity: 'GOOD' as const, action: i.actionOptions[0] ?? 'No action' })));
      for (const i of items) if (chance(r, 0.12)) { const sev = pick(r, ['ATTENTION', 'ATTENTION', 'SERVICE_REQUIRED', 'CRITICAL'] as const); Object.assign(i, { severity: sev, condition: sev === 'CRITICAL' ? 'Unsafe' : 'Worn', action: sev === 'ATTENTION' ? 'Monitor' : 'Replace' }); }
      const insEnd = wm(insStart, int(r, 25, 60));
      sv.inspection = { status: insEnd <= now ? 'COMPLETED' : 'IN_PROGRESS', startedAt: insStart, completedAt: insEnd <= now ? insEnd : null, items };
      t = insEnd <= now ? insEnd : insStart;
    }
    if (target === 'ESCALATED') {
      const escAt = wm(t, int(r, 20, 90)); if (escAt > now) return sv;
      sv.status = 'ESCALATED'; sv.escalatedAt = escAt; log('vehicle_service.escalated', escAt, sup);
      return sv; // the loader links the job card made for it
    }
    // The service estimate (labour and the parts): submitted, approved, the customer told, the deposit, the work.
    const est = makeEstimate(JOB_LINES[v.type === 'COMMERCIAL' ? 'service-truck' : 'service']!, t, tech, null);
    sv.estimate = est;
    t = wm(t, int(r, 10, 40)); if (t > now) return sv;
    est.status = 'SUBMITTED'; est.submittedAt = t;
    t = wm(t, int(r, 15, 90)); if (t > now) return sv;
    est.status = 'APPROVED'; est.approvedAt = t;
    t = wm(t, int(r, 15, 120)); if (t > now) return sv;
    est.status = 'MANAGER_APPROVED'; est.managerApprovedAt = t; est.matchingRequestedAt = wm(t, 5);
    t = wm(t, int(r, 5, 20)); if (t > now) return sv;
    est.customerNotifiedAt = t;
    t = wm(t, int(r, 30, 400)); if (t > now) return sv;
    const dep = deposit(est.customerTotal);
    sv.payments.push({ key: `${sv.key}-p1`, amount: dep, method: chance(r, 0.7) ? 'BANK_TRANSFER' : 'CASH', at: t, note: 'Deposit (70%) before work starts', byKey: who(P.finance) }); log('payment.recorded', t, P.finance, { amount: dep });
    sv.status = 'IN_SERVICE'; sv.workStartedAt = t; log('vehicle_service.status_updated', t, P.finance, { status: 'IN_SERVICE' });
    if (target === 'IN_SERVICE') return sv;
    const slip = makeSlip(est, wm(t, int(r, 10, 50)), 'RELEASED', tech);
    if (slip) { if (slip.releasedAt! > now) { for (const l of slip.lines) { stock.onHand.set(l.partKey, (stock.onHand.get(l.partKey) ?? 0) + l.quantity); for (const b of l.batches) stock.batches.get(l.partKey)!.find((x) => x.key === b.batchKey)!.remaining += b.quantity; if (l.serials.length) stock.serials.set(l.partKey, [...l.serials, ...(stock.serials.get(l.partKey) ?? [])]); } return sv; } sv.slips.push(slip); }
    t = wm(slip?.releasedAt ?? t, int(r, 120, 360)); if (t > now) return sv;
    sv.status = 'COMPLETED'; sv.completedAt = t; sv.attendedAt = t; sv.nextServiceDueOdometer = odometer + 10_000; sv.nextServiceDueDate = plus(t, 180 * DAY); log('vehicle_service.status_updated', t, sup, { status: 'COMPLETED' });
    lastServiceAt.set(v.key, t);
    if (target === 'COMPLETED') return sv;
    t = wm(t, int(r, 15, 60)); if (t > now) return sv;
    sv.status = 'READY_FOR_COLLECTION'; sv.readyForCollectionAt = t; log('vehicle_service.status_updated', t, sup, { status: 'READY_FOR_COLLECTION' });
    if (target === 'READY_FOR_COLLECTION') return sv;
    const balance = est.customerTotal - dep;
    t = wm(t, int(r, 60, 700)); if (t > now) return sv;
    if (balance > 0) { sv.payments.push({ key: `${sv.key}-p2`, amount: balance, method: 'BANK_TRANSFER', at: t, note: 'Balance on collection', byKey: who(P.finance) }); log('payment.recorded', t, P.finance, { amount: balance }); }
    const closeReq = wm(t, int(r, 5, 30)); const closeDec = wm(closeReq, int(r, 10, 100));
    if (closeDec > now) return sv;
    sv.close = { requestedAt: closeReq, decidedAt: closeDec, status: 'APPROVED' }; sv.status = 'CLOSED'; sv.closedAt = closeDec; log('vehicle_service.status_updated', closeDec, P.manager, { status: 'CLOSED' });
    if (target === 'CLOSED') return sv;
    t = wm(closeDec, int(r, 10, 180)); if (t > now) return sv;
    sv.status = 'COLLECTED'; sv.collectedAt = t; sv.collectedByName = collectorName(customer); sv.gateExit = { at: plus(t, int(r, 5, 20) * 60_000), driverName: sv.collectedByName }; log('vehicle_service.status_updated', t, P.frontdesk, { status: 'COLLECTED' });
    return sv;
  };

  // The days: about seven job cards and three services a week, more on Mondays, from `from` to today.
  const pickVehicle = (): DemoVehicle => {
    for (let i = 0; i < 20; i += 1) {
      const c = chance(r, 0.45) ? pick(r, customers.filter((x) => x.type === 'ORGANIZATION')) : pick(r, customers);
      const own = vehicles.filter((x) => x.customerKey === c.key);
      if (!own.length) continue;
      const v = pick(r, own);
      const until = inWorkshop.get(v.key);
      if (until && until > now) continue;
      return v;
    }
    return pick(r, vehicles);
  };
  const busy = (v: DemoVehicle, until: Date | null) => inWorkshop.set(v.key, until ?? plus(now, DAY));
  for (let d = utcMidnight(from); d <= today; d = plus(d, DAY)) {
    if (!isWorkDay(d)) continue;
    const isToday = d.getTime() === today.getTime();
    const nJobs = isToday ? 3 : d.getUTCDay() === 1 ? int(r, 1, 3) : int(r, 0, 2);
    for (let i = 0; i < nJobs; i += 1) {
      const v = pickVehicle();
      const openedAt = at(d, int(r, 7, 14), int(r, 0, 59));
      if (openedAt > now) continue;
      const slow = chance(r, 0.05) ? 'customer' : chance(r, 0.04) ? 'parts' : null;
      const jc = makeJobCard({ vehicle: v, openedAt, service: chance(r, 0.38), target: chance(r, 0.035) ? 'CANCELLED' : undefined, slow, rework: chance(r, 0.07) });
      jobCards.push(jc);
      busy(v, jc.checkedOutAt ?? (jc.status === 'CANCELLED' ? jc.cancellation?.decidedAt ?? null : null));
    }
    const nServices = isToday ? 2 : chance(r, 0.55) ? 1 : 0;
    for (let i = 0; i < nServices; i += 1) {
      const v = pickVehicle();
      const createdAt = at(d, int(r, 7, 13), int(r, 0, 59));
      if (createdAt > now) continue;
      const sv = makeService(v, createdAt, chance(r, 0.03) ? 'CANCELLED' : undefined);
      services.push(sv);
      busy(v, sv.collectedAt ?? sv.cancelledAt ?? null);
    }
  }
  // Scheduled services for the coming days (booked from the portal and the front desk).
  for (let i = 1; i <= 4; i += 1) {
    let d = plus(today, i * DAY); while (!isWorkDay(d)) d = plus(d, DAY);
    const v = pickVehicle();
    const sv = makeService(v, wm(plus(now, -int(r, 1, 4) * DAY), 30), 'SCHEDULED');
    sv.createdAt = at(d, int(r, 8, 11)); // the booking is for that day
    services.push(sv);
  }
  // Two services escalated into job cards: the inspection found more than a service.
  for (const [i, v] of [vehicles[4]!, vehicles[13]!].entries()) {
    const createdAt = at(plus(today, -(12 + i * 20) * DAY), 8, 15);
    const sv = makeService(v, createdAt, 'ESCALATED');
    services.push(sv);
    if (sv.status === 'ESCALATED') {
      const jc = makeJobCard({ vehicle: v, openedAt: wm(sv.escalatedAt!, 10), kind: v.type === 'COMMERCIAL' ? 'spring' : 'clutch', fromServiceKey: sv.key, target: i === 0 ? undefined : 'IN_PROGRESS' });
      jobCards.push(jc); sv.escalatedToJobKey = jc.key;
    }
  }
  // Job cards that show every stage today, whatever the dice did above.
  const stageDays: [JobCardStatus, number, Partial<JobOpts>][] = [
    ['CHECKED_IN', 0, {}], ['CHECKED_IN', 0, {}], ['AWAITING_CUSTOMER_APPROVAL', 1, {}], ['AWAITING_CUSTOMER_APPROVAL', 9, { slow: 'customer' }], ['IN_PROGRESS', 2, {}], ['AWAITING_PARTS', 3, { slow: 'parts' }],
    ['QUALITY_CHECK', 3, { quick: true }], ['QUALITY_CHECK', 4, { quick: true, rework: true }], ['COMPLETED', 4, { quick: true }], ['COMPLETED', 5, { quick: true }], ['READY_FOR_COLLECTION', 5, { quick: true }], ['READY_FOR_COLLECTION', 6, { quick: true }], ['CLOSED', 6, { quick: true }], ['CANCELLED', 2, {}],
  ];
  for (const [target, daysAgo, extra] of stageDays) {
    let d = plus(today, -daysAgo * DAY); while (!isWorkDay(d)) d = plus(d, -DAY);
    const v = pickVehicle();
    const jc = makeJobCard({ vehicle: v, openedAt: at(d, int(r, 8, 11), int(r, 0, 59)), target, ...extra });
    jobCards.push(jc); busy(v, null);
  }
  // The four sign-ins' own stories.
  const adaora = vehicles.find((v) => v.customerKey === 'customer.adaora')!;
  { const sv = makeService(adaora, at(plus(today, -1 * DAY), 8, 5), 'IN_SERVICE'); services.push(sv); busy(adaora, null); }
  const fleetTrucks = vehicles.filter((v) => v.customerKey === 'customer.fleet');
  { const jc = makeJobCard({ vehicle: fleetTrucks[0]!, openedAt: at(today, 7, 50), kind: 'airbrake', target: 'CHECKED_IN' }); jobCards.push(jc); busy(fleetTrucks[0]!, null); }
  { const jc = makeJobCard({ vehicle: fleetTrucks[1]!, openedAt: at(plus(today, -2 * DAY), 9, 10), kind: 'spring', target: 'READY_FOR_COLLECTION' }); jobCards.push(jc); busy(fleetTrucks[1]!, null); }
  // Every service on the plant-built vehicles, so their passports read from kit to first service.
  for (const v of plantVehicles) {
    const svAt = wm(plus(v.createdAt, int(r, 20, 60) * DAY), 60);
    if (svAt < now) { const sv = makeService(v, svAt); services.push(sv); busy(v, sv.collectedAt ?? null); }
  }

  // ── Warranty claims: nine stages, each on its own job card ────────────
  const claims: DemoClaim[] = [];
  const claimStages: ClaimStatus[] = ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'SETTLED'];
  const assetWarranties = warranties.filter((w) => w.kind === 'ASSET' && w.status === 'ACTIVE');
  const warrantyCustomerVehicle = vehicles.find((v) => v.customerKey === 'customer.warranty')!;
  // The warranty customer's D-Max has its own Isuzu warranty and the claim everyone asks about.
  const dmaxPolicy = policyByKey.get('isuzu-3y')!;
  const dmaxW = addWarranty({ kind: 'ASSET', policyKey: dmaxPolicy.key, providerKey: dmaxPolicy.provider, customerKey: 'customer.warranty', vehicleKey: warrantyCustomerVehicle.key, partKey: null, serial: null, slipLineKey: null, jobKey: null, subject: `Isuzu D-Max · VIN ${warrantyCustomerVehicle.vin}`, startsAt: plus(warrantyCustomerVehicle.createdAt, -200 * DAY), endsAt: plus(warrantyCustomerVehicle.createdAt, (36 * 30.4 - 200) * DAY), startReading: 12, distanceLimit: 100_000, origin: 'MANUAL', status: 'ACTIVE', issuedByKey: who(P.warrantyOfficer), verifiedByKey: who(P.warrantyHod), verifiedAt: wm(warrantyCustomerVehicle.createdAt, 300), evidenceNote: 'Warranty booklet stamped by the selling dealer.', quantity: null });
  const claimTexts: Record<string, { complaint: string; cause: string; correction: string; part: string; partNumber: string; kind: string }> = {
    injector: { complaint: 'Engine warning lamp; loss of power uphill', cause: 'Injector no. 3 internal leak (manufacturing)', correction: 'Injector replaced under warranty; codes cleared; road tested', part: 'Fuel injector', partNumber: '8-98011604-1', kind: 'injector' },
    electrical: { complaint: 'Alternator warning lamp; battery discharging', cause: 'Alternator regulator failed within warranty', correction: 'Alternator replaced; charging 28.2 V', part: 'Alternator 24V', partNumber: '8-97311-200-0', kind: 'electrical' },
    cooling: { complaint: 'Coolant loss; overheating warning', cause: 'Radiator end tank seam leaking (manufacturing)', correction: 'Radiator replaced; system pressure tested', part: 'Radiator assembly', partNumber: '8-98161-300-0', kind: 'cooling' },
    starter: { complaint: 'Intermittent no-crank', cause: 'Starter solenoid contacts pitted', correction: 'Starter motor replaced', part: 'Starter motor', partNumber: '8-98125-800-1', kind: 'starter' },
  };
  for (const [i, status] of claimStages.entries()) {
    const w = i === 4 ? dmaxW : assetWarranties[i % assetWarranties.length]!;
    const v = vehicleByKey.get(w.vehicleKey!)!;
    const text = i === 4 ? claimTexts.electrical! : pick(r, Object.values(claimTexts));
    const daysAgo = [1, 3, 5, 8, 21, 35, 48, 60, 95][i]!;
    let d = plus(today, -daysAgo * DAY); while (!isWorkDay(d)) d = plus(d, -DAY);
    const jc = makeJobCard({ vehicle: v, openedAt: at(d, int(r, 8, 11), int(r, 0, 59)), kind: text.kind, warranty: w, target: i < 2 ? 'IN_PROGRESS' : undefined });
    jobCards.push(jc); busy(v, jc.checkedOutAt ?? null);
    const labour = jc.estimate?.lines.filter((l) => l.billTo === 'WARRANTY' && l.type === 'LABOUR').reduce((s, l) => s + l.amount, 0) ?? 0;
    const parts = jc.estimate?.lines.filter((l) => l.billTo === 'WARRANTY' && l.type !== 'LABOUR').reduce((s, l) => s + l.amount, 0) ?? 0;
    const logistics = i % 3 === 0 ? 12_000 : 0;
    const claimed = labour + parts + logistics;
    const createdAt = wm(jc.openedAt, int(r, 200, 400));
    const step = (k: number) => wm(createdAt, k * int(r, 300, 900));
    const idx = claimStages.indexOf(status);
    const provider = PROVIDERS.find((p) => p.key === w.providerKey)!;
    const approved = status === 'PARTIALLY_ACCEPTED' ? Math.round(claimed * 0.6) : status === 'ACCEPTED' || status === 'SETTLED' ? claimed : status === 'REJECTED' ? 0 : null;
    claims.push({
      key: `wc${claims.length + 1}`, warrantyKey: w.key, jobKey: jc.key, status, complaint: text.complaint, cause: text.cause, correction: text.correction, causalPart: text.part, causalPartNumber: text.partNumber, failureDate: plus(jc.openedAt, -int(r, 1, 5) * DAY), failureReading: jc.mileage - int(r, 10, 300),
      labour, parts, logistics, claimed, approved, settled: status === 'SETTLED' ? claimed : null, createdAt,
      reviewRequestedAt: idx >= 1 ? step(1) : null, hodAt: idx >= 2 ? step(2) : null, managerAt: idx >= 3 ? step(3) : null, submittedAt: idx >= 4 ? step(4) : null, decidedAt: idx >= 5 ? step(5) : null, settledAt: status === 'SETTLED' ? step(6) : null,
      deadlineAt: plus(createdAt, provider.claimDays * DAY), providerReference: idx >= 4 ? `${provider.key === 'p-isuzu' ? 'ISZ' : 'SEM'}-WC-${String(70_000 + i * 37).slice(-5)}` : null, settlementReference: status === 'SETTLED' ? `CN-${String(1_000 + i)}` : null,
      decisionNotes: status === 'REJECTED' ? 'Failure attributed to contaminated fuel; not a manufacturing defect.' : status === 'PARTIALLY_ACCEPTED' ? 'Parts accepted; labour at the provider’s standard time, logistics declined.' : idx >= 5 ? 'Accepted in full.' : null,
      remedy: 'REPAIR', partReturnRequired: i % 2 === 0, partReturnStatus: i % 2 === 0 ? (idx >= 5 ? 'RECEIVED_BY_PROVIDER' : idx >= 4 ? 'SENT' : 'AWAITING') : null,
      customerResolution: idx >= 5 ? (status === 'REJECTED' ? 'CUSTOMER_PAID' : 'REPAIRED_NO_CHARGE') : null,
    });
  }
  // Part warranties: every released battery and brake pad set got one automatically.
  for (const jc of jobCards) for (const slip of jc.slips) if (slip.status === 'RELEASED') for (const l of slip.lines) {
    const p = partByKey.get(l.partKey)!;
    if (!p.warrantyPolicy) continue;
    const pol = policyByKey.get(p.warrantyPolicy)!;
    if (p.tracking === 'SERIALIZED') for (const sn of l.serials) addWarranty({ kind: 'PART', policyKey: pol.key, providerKey: pol.provider, customerKey: jc.customerKey, vehicleKey: jc.vehicleKey, partKey: p.key, serial: sn, slipLineKey: l.key, jobKey: jc.key, subject: `${p.name} · serial ${sn}`, startsAt: slip.releasedAt!, endsAt: plus(slip.releasedAt!, pol.months * 30.4 * DAY), startReading: jc.mileage, distanceLimit: null, origin: 'AUTO', status: 'ACTIVE', issuedByKey: slip.receivedByKey ?? who(P.storeOfficer), verifiedByKey: null, verifiedAt: null, evidenceNote: null, quantity: 1 });
    else addWarranty({ kind: 'PART', policyKey: pol.key, providerKey: pol.provider, customerKey: jc.customerKey, vehicleKey: jc.vehicleKey, partKey: p.key, serial: null, slipLineKey: l.key, jobKey: jc.key, subject: `${p.name} × ${l.quantity}`, startsAt: slip.releasedAt!, endsAt: plus(slip.releasedAt!, pol.months * 30.4 * DAY), startReading: jc.mileage, distanceLimit: null, origin: 'AUTO', status: 'ACTIVE', issuedByKey: slip.receivedByKey ?? who(P.storeOfficer), verifiedByKey: null, verifiedAt: null, evidenceNote: null, quantity: l.quantity });
  }

  // ── Service reminders: three vehicles due soon ─────────────────────────
  const reminders: WorkshopDemoPlan['reminders'] = [];
  for (const sv of services.filter((s) => s.status === 'COLLECTED' && s.nextServiceDueDate).slice(0, 3)) {
    reminders.push({ vehicleKey: sv.vehicleKey, sentAt: plus(today, -int(r, 1, 6) * DAY), dueOdometer: sv.nextServiceDueOdometer!, dueDate: sv.nextServiceDueDate!, odometerAtSend: sv.nextServiceDueOdometer! - int(r, 400, 900) });
  }

  // ── Parts stock today: the figures the store shows ─────────────────────
  const parts: WorkshopDemoPlan['parts'] = PARTS.map((p) => ({ key: p.key, partNumber: partNumbers.get(p.key)!, name: p.name, categoryKey: p.category, typeName: p.typeName, tracking: p.tracking, uom: p.uom, price: p.price, reorder: p.reorder, safety: p.safety, fit: p.fit ?? null, warrantyPolicyKey: p.warrantyPolicy ?? null, onHand: stock.onHand.get(p.key) ?? 0, reserved: stock.reserved.get(p.key) ?? 0, createdAt: plus(from, -DAY) }));

  // ── Security ───────────────────────────────────────────────────────────
  const visits: DemoVisit[] = [];
  const hostOf = () => pick(r, [P.frontdesk, P.supPass, P.supComm, P.manager, P.storeManager, P.warrantyHod]);
  const visitorNames = ['Mr Adebayo', 'Mrs Okonjo', 'Alhaji Danjuma', 'Ms Eze', 'Mr Okafor', 'Chief Olawale', 'Mrs Bassey', 'Mr Uche', 'Engr. Bello', 'Dr Nwosu', 'Mr Fashola', 'Mrs Ahmed'];
  for (let d = plus(from, 3 * DAY); d <= today; d = plus(d, DAY)) {
    if (!isWorkDay(d)) continue;
    const n = d.getTime() === today.getTime() ? 5 : int(r, 0, 2);
    for (let i = 0; i < n; i += 1) {
      const expectedAt = at(d, int(r, 8, 15), pick(r, [0, 15, 30, 45]));
      const purposeIdx = int(r, 0, VISITOR_PURPOSES.length - 1);
      const onFoot = chance(r, 0.3);
      const vis: DemoVisit = { key: `vis${visits.length + 1}`, status: 'EXPECTED', visitorName: pick(r, visitorNames), company: VISITOR_COMPANIES[purposeIdx] || null, phone: `0800 000 0${String(600 + visits.length).padStart(3, '0')}`, purpose: VISITOR_PURPOSES[purposeIdx]!, hostKey: who(hostOf()), expectedAt, durationMinutes: pick(r, [30, 60, 60, 90, 120]), vehicleType: onFoot ? 'ON_FOOT' : pick(r, ['CAR', 'CAR', 'TRUCK', 'MOTORCYCLE']), plate: onFoot ? null : plate(), checkedInAt: null, checkedOutAt: null, walkIn: chance(r, 0.25), createdAt: plus(expectedAt, -int(r, 60, 2_000) * 60_000) };
      const inAt = plus(expectedAt, int(r, -10, 40) * 60_000);
      const outAt = plus(inAt, (vis.durationMinutes + int(r, -20, 30)) * 60_000);
      if (inAt <= now) { vis.status = 'CHECKED_IN'; vis.checkedInAt = inAt; }
      if (outAt <= now && vis.status === 'CHECKED_IN') { vis.status = 'CHECKED_OUT'; vis.checkedOutAt = outAt; }
      if (vis.status === 'EXPECTED' && chance(r, 0.08) && expectedAt < plus(now, -DAY)) vis.status = 'CANCELLED';
      visits.push(vis);
    }
  }
  // Today, deliberately: one visitor long overdue, one just in, two still expected.
  visits.push({ key: `vis${visits.length + 1}`, status: 'CHECKED_IN', visitorName: 'Mr Ibrahim (Leadway assessor)', company: 'Leadway Assurance (demo)', phone: '0800 000 0699', purpose: 'Insurance assessor inspection', hostKey: who(P.supComm), expectedAt: plus(now, -3.5 * HOUR), durationMinutes: 60, vehicleType: 'CAR', plate: plate(), checkedInAt: plus(now, -3.2 * HOUR), checkedOutAt: null, walkIn: false, createdAt: plus(now, -26 * HOUR) });
  visits.push({ key: `vis${visits.length + 1}`, status: 'CHECKED_IN', visitorName: 'Mrs Okoye', company: null, phone: '0800 000 0698', purpose: 'Collecting a vehicle', hostKey: who(P.frontdesk), expectedAt: plus(now, -40 * 60_000), durationMinutes: 60, vehicleType: 'ON_FOOT', plate: null, checkedInAt: plus(now, -25 * 60_000), checkedOutAt: null, walkIn: true, createdAt: plus(now, -25 * 60_000) });
  visits.push({ key: `vis${visits.length + 1}`, status: 'EXPECTED', visitorName: 'Mr Adewale (Ojuelegba Bottling)', company: 'Ojuelegba Bottling Company Ltd', phone: '0800 000 0311', purpose: 'Fleet account meeting', hostKey: who(P.manager), expectedAt: plus(now, 1.5 * HOUR), durationMinutes: 90, vehicleType: 'CAR', plate: plate(), checkedInAt: null, checkedOutAt: null, walkIn: false, createdAt: plus(now, -2 * DAY) });
  visits.push({ key: `vis${visits.length + 1}`, status: 'EXPECTED', visitorName: 'Engr. Bello (Lagos Lubricants)', company: 'Lagos Lubricants Distribution', phone: '0800 000 0402', purpose: 'Supplier delivery follow-up', hostKey: who(P.storeManager), expectedAt: plus(now, 3 * HOUR), durationMinutes: 45, vehicleType: 'CAR', plate: plate(), checkedInAt: null, checkedOutAt: null, walkIn: false, createdAt: plus(now, -DAY) });

  const exitPasses: DemoExitPass[] = [];
  const staffFor = (s: DemoStaff) => ({ key: who(s), name: s.name, employeeId: s.employeeId, designation: s.jobTitle });
  for (let i = 0; i < 18; i += 1) {
    let d = plus(today, -int(r, 2, 170) * DAY); while (!isWorkDay(d)) d = plus(d, -DAY);
    const by = pick(r, [P.storeOfficer, P.techPass, P.techComm, P.finance, P.warrantyOfficer, P.frontdesk]);
    const createdAt = at(d, int(r, 8, 12), int(r, 0, 59));
    const outAt = plus(createdAt, int(r, 60, 150) * 60_000);
    const dur = pick(r, [60, 90, 120, 180]);
    const returning = chance(r, 0.85);
    const inAt = plus(outAt, (dur + int(r, -20, 25)) * 60_000);
    exitPasses.push({ key: `ep${exitPasses.length + 1}`, status: returning ? 'CLOSED' : 'OUT', requestedByKey: who(by), reason: pick(r, EXIT_REASONS), returning, createdAt, expectedOutAt: outAt, expectedReturnAt: returning ? plus(outAt, dur * 60_000) : null, durationMinutes: dur, headAt: plus(createdAt, int(r, 10, 40) * 60_000), managerAt: plus(createdAt, int(r, 45, 90) * 60_000), gateOutAt: outAt, gateInAt: returning ? inAt : null, declinedAt: null, declineReason: null, people: [staffFor(by)] });
    if (!returning) exitPasses[exitPasses.length - 1]!.status = 'CLOSED';
  }
  // Today: one out and overdue, one waiting for the department head, one waiting for the Manager, one declined last week.
  exitPasses.push({ key: `ep${exitPasses.length + 1}`, status: 'OUT', requestedByKey: who(P.storeOfficer), reason: 'Collect parts from Ladipo market (urgent: clutch kit for JC in the bay)', returning: true, createdAt: plus(now, -4 * HOUR), expectedOutAt: plus(now, -3.5 * HOUR), expectedReturnAt: plus(now, -1.5 * HOUR), durationMinutes: 120, headAt: plus(now, -3.8 * HOUR), managerAt: plus(now, -3.6 * HOUR), gateOutAt: plus(now, -3.4 * HOUR), gateInAt: null, declinedAt: null, declineReason: null, people: [staffFor(P.storeOfficer)] });
  exitPasses.push({ key: `ep${exitPasses.length + 1}`, status: 'PENDING_HEAD', requestedByKey: who(P.techComm), reason: 'Customer site visit — fleet truck will not start (Apapa)', returning: true, createdAt: plus(now, -50 * 60_000), expectedOutAt: plus(now, 40 * 60_000), expectedReturnAt: plus(now, 4 * HOUR), durationMinutes: 180, headAt: null, managerAt: null, gateOutAt: null, gateInAt: null, declinedAt: null, declineReason: null, people: [staffFor(P.techComm)] });
  exitPasses.push({ key: `ep${exitPasses.length + 1}`, status: 'PENDING_MANAGER', requestedByKey: who(P.finance), reason: 'Bank: lodge the day’s cash', returning: true, createdAt: plus(now, -2 * HOUR), expectedOutAt: plus(now, 30 * 60_000), expectedReturnAt: plus(now, 2 * HOUR), durationMinutes: 90, headAt: plus(now, -1.5 * HOUR), managerAt: null, gateOutAt: null, gateInAt: null, declinedAt: null, declineReason: null, people: [staffFor(P.finance)] });
  exitPasses.push({ key: `ep${exitPasses.length + 1}`, status: 'DECLINED', requestedByKey: who(P.techPass), reason: 'Personal errand', returning: true, createdAt: plus(today, -6 * DAY + 10 * HOUR), expectedOutAt: plus(today, -6 * DAY + 11 * HOUR), expectedReturnAt: plus(today, -6 * DAY + 13 * HOUR), durationMinutes: 120, headAt: plus(today, -6 * DAY + 10.3 * HOUR), managerAt: null, gateOutAt: null, gateInAt: null, declinedAt: plus(today, -6 * DAY + 10.8 * HOUR), declineReason: 'Two vehicles waiting in the passenger bay; take it after 15:00.', people: [staffFor(P.techPass)] });

  const incidents: DemoIncident[] = INCIDENTS.map((inc, i) => {
    const occurredAt = i === 0 ? plus(now, -5 * HOUR) : i === 1 ? plus(now, -2 * DAY) : plus(today, -int(r, 10, 160) * DAY + 11 * HOUR);
    const status = i === 0 ? 'OPEN' : i === 1 ? 'UNDER_REVIEW' : 'CLOSED';
    return { key: `inc${i + 1}`, type: inc.type, severity: inc.severity, status, occurredAt, location: inc.location, description: inc.text, actionTaken: inc.action, reportedByKey: who(P.gate), assignedToKey: status === 'OPEN' ? null : who(P.cso), closedAt: status === 'CLOSED' ? plus(occurredAt, int(r, 1, 3) * DAY) : null, resolution: status === 'CLOSED' ? 'Reviewed with the Manager; no further action.' : null };
  });
  const deliveries: DemoDelivery[] = receipts.filter((g) => g.delivery).map((g) => ({ key: g.delivery!.key, receiptKey: g.key, status: 'LEFT', supplierName: SUPPLIERS.find((s) => s.key === g.supplierKey)!.name, items: `${g.lines.length} line${g.lines.length === 1 ? '' : 's'} of parts (GRN)`, expectedAt: plus(g.delivery!.arrivedAt, -30 * 60_000), arrivedAt: g.delivery!.arrivedAt, receivedAt: g.receivedAt, leftAt: g.delivery!.leftAt, driverName: g.delivery!.driverName, plate: g.delivery!.plate, createdAt: plus(g.delivery!.arrivedAt, -DAY) }));
  deliveries.push({ key: 'dlv-today-1', receiptKey: null, status: 'AT_GATE', supplierName: 'Apapa Filter Supplies', items: 'Oil and fuel filters, 6 cartons', expectedAt: plus(now, -20 * 60_000), arrivedAt: plus(now, -8 * 60_000), receivedAt: null, leftAt: null, driverName: 'Mr Chukwu', plate: plate(), createdAt: plus(now, -DAY) });
  deliveries.push({ key: 'dlv-today-2', receiptKey: null, status: 'EXPECTED', supplierName: 'Lagos Lubricants Distribution', items: 'Engine oil 15W-40, 40 cans', expectedAt: plus(now, 2.5 * HOUR), arrivedAt: null, receivedAt: null, leftAt: null, driverName: 'Mr Bako', plate: plate(), createdAt: plus(now, -2 * DAY) });
  const contractors: DemoContractor[] = [{
    key: 'ctr1', status: 'APPROVED', company: 'Ikeja Roofing & Steel (demo)', work: 'Replace the roof sheets over bays 5–6', workArea: 'Commercial workshop, bays 5–6', leadName: 'Mr Okeke', teamSize: 4, validFrom: plus(today, -3 * DAY), validUntil: plus(today, 4 * DAY), hostKey: who(P.branchAdmin), requestedByKey: who(P.branchAdmin), managerAt: plus(today, -4 * DAY + 14 * HOUR),
    attendance: ([1, 2, 3].map((k) => { const d = plus(today, -k * DAY); return { date: d, workers: 4, inAt: at(d, 8, 5), outAt: at(d, 16, 40) as Date | null }; }).filter((a) => isWorkDay(a.date))).concat([{ date: today, workers: 3, inAt: at(today, 8, 10), outAt: null }]),
  }];

  // ── Scheduling, broadcasts, support ────────────────────────────────────
  const rooms = [{ key: 'room1', name: 'Manager’s meeting room', location: 'Admin block, first floor', capacity: 8 }, { key: 'room2', name: 'Training room', location: 'Admin block, ground floor', capacity: 20 }];
  const appointments: DemoAppointment[] = [];
  for (let d = plus(from, DAY); d <= plus(today, 10 * DAY); d = plus(d, DAY)) {
    if (!isWorkDay(d)) continue;
    const n = d.getTime() === today.getTime() ? 3 : chance(r, 0.4) ? 1 : 0;
    for (let i = 0; i < n; i += 1) {
      const startsAt = at(d, pick(r, [9, 10, 11, 14, 15]), pick(r, [0, 30]));
      const endsAt = plus(startsAt, pick(r, [30, 60, 60, 90]) * 60_000);
      const owner = pick(r, [P.manager, P.supPass, P.supComm, P.storeManager, P.warrantyHod, P.scheduling, P.careLead, P.cso]);
      const others = [P.manager, P.supPass, P.supComm, P.storeManager, P.finance, P.warrantyHod, P.frontdesk, P.calendar].filter((p) => p !== owner && chance(r, 0.35));
      const status = endsAt <= now ? (chance(r, 0.9) ? 'COMPLETED' : chance(r, 0.5) ? 'CANCELLED' : 'NO_SHOW') : 'SCHEDULED';
      const room = chance(r, 0.6) ? pick(r, rooms) : null;
      appointments.push({ key: `apt${appointments.length + 1}`, title: pick(r, APPOINTMENT_TITLES), agenda: chance(r, 0.5) ? 'Agenda circulated by email; minutes to follow.' : null, ownerKey: who(owner), participantKeys: others.map(who), startsAt, endsAt, status, roomKey: room?.key ?? null, location: room ? null : pick(r, ['Front desk', 'Commercial workshop office', 'Store office']), createdAt: plus(startsAt, -int(r, 1, 7) * DAY) });
    }
  }
  const broadcasts = BROADCASTS.map((b, i) => { const createdAt = plus(now, -b.daysAgo * DAY); return { key: `bc${i + 1}`, category: b.category, title: b.title, message: b.message, audience: b.audience, startsAt: createdAt, endsAt: plus(createdAt, b.days * DAY), createdAt, byKey: who(b.audience === 'BRANCH' ? P.branchAdmin : b.category === 'SECURITY_ALERT' ? P.cso : P.broadcaster) }; });
  const announcement = { message: 'Fleet customers: book December services with the front desk before the 20th.', expiresAt: plus(now, 14 * DAY), createdAt: plus(now, -2 * DAY), byKey: who(P.manager) };
  const tickets: DemoTicket[] = TICKETS.map((t, i) => {
    const createdAt = plus(now, -t.daysAgo * DAY);
    const customer = t.customerKey ? customerByKey.get(t.customerKey) ?? null : null;
    const staff = t.channel === 'STAFF';
    const requester = staff ? pick(r, [P.frontdesk, P.techPass, P.storeOfficer]) : null;
    const replies = t.replies.map((rp) => ({ at: plus(createdAt, rp.hoursLater * HOUR), kind: rp.from === 'customer' ? 'CUSTOMER' as const : rp.from === 'ai' ? 'AI' as const : rp.from === 'note' ? 'NOTE' as const : 'AGENT' as const, body: rp.text, authorKey: rp.from === 'agent' || rp.from === 'note' ? who(staff ? P.assistant : P.care) : null }));
    const firstResponse = replies.find((x) => x.kind !== 'CUSTOMER')?.at ?? null;
    const done = t.status === 'RESOLVED' || t.status === 'CLOSED';
    const last = replies.length ? replies[replies.length - 1]!.at : createdAt;
    return { key: `sup${i + 1}`, channel: t.channel, subject: t.subject, summary: t.summary, priority: t.priority, status: t.status, createdAt, customerKey: customer?.key ?? null, contactName: customer?.name ?? (staff ? requester!.name : pick(r, ['Mr Okoro', 'Mrs Adeniyi', 'Mr Lawal', 'Ms Umar'])), contactPhone: customer?.phone ?? null, contactEmail: customer?.email ?? null, assignedToKey: staff ? who(P.assistant) : t.status === 'OPEN' && i === 0 ? null : who(P.care), requesterKey: requester ? who(requester) : null, tags: [...(t.complaint ? ['complaint'] : []), ...(staff ? ['staff_help'] : [])], firstResponseAt: firstResponse, resolvedAt: done ? last : null, closedAt: t.status === 'CLOSED' ? plus(last, 2 * DAY) : null, dueFirstResponseAt: plus(createdAt, (t.priority === 'URGENT' ? 1 : t.priority === 'HIGH' ? 4 : 24) * HOUR), dueResolutionAt: plus(createdAt, (t.priority === 'URGENT' ? 8 : t.priority === 'HIGH' ? 48 : 120) * HOUR), csat: done && chance(r, 0.6) ? int(r, 4, 5) : null, replies };
  });
  const imports: DemoImport[] = IMPORTS.map((im, i) => ({ key: `imp${i + 1}`, entity: im.entity, fileName: im.fileName, rows: im.rows, created: im.created, warnings: im.warnings, rejected: im.rejected, createdAt: plus(now, -im.daysAgo * DAY), createdByKey: who(P.itAdmin), approvedByKey: who(P.admin), signedOffByKey: im.totals ? who(P.finance) : null, totals: im.totals ? { check: { ...im.totals }, loaded: { ...im.totals } } : null }));
  const exportsOut: DemoExport[] = EXPORTS.map((ex, i) => ({ key: `exp${i + 1}`, kind: ex.kind, format: ex.format, summary: ex.summary, rows: ex.rows, createdAt: plus(now, -ex.daysAgo * DAY), createdByKey: who(i === 2 ? P.careLead : P.manager) }));

  const byStatus = (xs: { status: string }[]) => xs.reduce<Record<string, number>>((m, x) => { m[x.status] = (m[x.status] ?? 0) + 1; return m; }, {});
  const figures: Record<string, number> = {
    customers: customers.length, vehicles: vehicles.length, jobCards: jobCards.length, services: services.length, receipts: receipts.length, warranties: warranties.length, claims: claims.length, visits: visits.length, tickets: tickets.length,
    belowReorder: parts.filter((p) => p.onHand - p.reserved < p.reorder).length, openPricingAlerts: receipts.flatMap((g) => g.lines).filter((l) => l.pricingAlert?.status === 'OPEN').length,
    ...Object.fromEntries(Object.entries(byStatus(jobCards)).map(([k, v]) => [`jc_${k}`, v])), ...Object.fromEntries(Object.entries(byStatus(services)).map(([k, v]) => [`sv_${k}`, v])),
  };
  return { anchor, from, customers, vehicles, suppliers, parts, receipts, providers: PROVIDERS, policies: POLICIES, warranties, claims, jobCards, services, reminders, visits, exitPasses, incidents, deliveries, contractors, rooms, appointments, broadcasts, announcement, tickets, imports, exports: exportsOut, figures, consumed: stock.consumed };
}
