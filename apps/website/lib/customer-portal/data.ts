import { cache } from 'react';
import { prisma, type Prisma } from '@ejo/database';
import {
  jobCardPhase, jobCardStatus, jobCardStep, servicePhase, serviceStatus, serviceStep,
  JOB_CARD_STEPS, SERVICE_STEPS, warrantyState, type Phase, type StatusInfo, type WarrantyState,
} from './status';
import {
  addWorkingDays, daysBetween, moneyFor, num, vehicleLabel,
  APPROVAL_DEADLINE_WORKING_DAYS, READY_FOR_COLLECTION_GRACE_WORKING_DAYS, type Money,
} from './format';

/**
 * Every read the customer portal makes. Each query is fenced to one
 * customer, the signed-in customer's id from the session (never an id from
 * the URL without that fence), and selects only what a customer may see:
 * no internal notes, technician findings, costs, staff names or anything of
 * another customer.
 *
 * Estimates are shown only once the customer has been notified
 * (customerNotifiedAt), and on a Job Card only lines billed to the customer
 * count; warranty, goodwill and internal lines never reach this view.
 */

const vehicleSelect = { id: true, make: true, model: true, year: true, plateNumber: true } as const;
const paySelect = { id: true, amount: true, method: true, recordedAt: true } as const;
const refundSelect = { id: true, amount: true, method: true, recordedAt: true, referenceNumber: true } as const;

export type PaymentRow = { id: string; amount: number; method: string; recordedAt: Date };
export type RefundRow = { id: string; amount: number; method: string; recordedAt: Date; reference: string };

export type ServiceItem = {
  kind: 'jc' | 'vs';
  id: string;
  number: string;
  status: string;
  info: StatusInfo;
  phase: Phase;
  step: number;
  steps: readonly string[];
  vehicle: { id: string; label: string; plate: string | null };
  branchName: string | null;
  href: string;
  createdAt: Date;
  checkedInAt: Date | null;
  workStartedAt: Date | null;
  completedAt: Date | null;
  readyAt: Date | null;
  closedAt: Date | null;
  collectedAt: Date | null;
  cancelledAt: Date | null;
  escalatedAt: Date | null;
  lastUpdate: Date;
  estimateNotifiedAt: Date | null;
  money: Money;
  payments: PaymentRow[];
  refunds: RefundRow[];
  awaitingApproval: boolean;
  approvalDeadline: Date | null;
  waitingForCollection: boolean;
  collectBy: Date | null;
  waitingDays: number | null;
  inCustody: boolean;
  linked: { kind: 'jc' | 'vs'; id: string; number: string; relation: 'continued-as' | 'started-as' } | null;
  nextServiceDueDate: Date | null;
  nextServiceDueOdometer: number | null;
};

function latest(...dates: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...dates.filter((d): d is Date => Boolean(d)).map((d) => d.getTime())));
}
const toPay = (p: { id: string; amount: unknown; method: unknown; recordedAt: Date }): PaymentRow => ({ id: p.id, amount: num(p.amount), method: String(p.method), recordedAt: p.recordedAt });
const toRefund = (r: { id: string; amount: unknown; method: unknown; recordedAt: Date; referenceNumber: string }): RefundRow => ({ id: r.id, amount: num(r.amount), method: String(r.method), recordedAt: r.recordedAt, reference: r.referenceNumber });

export const jobCardItemSelect = {
  id: true, jobNumber: true, status: true, createdAt: true, updatedAt: true,
  workStartedAt: true, completedAt: true, readyForCollectionAt: true, closedAt: true, checkedOutAt: true,
  vehicle: { select: vehicleSelect },
  branch: { select: { name: true } },
  estimate: { select: { customerNotifiedAt: true, lineItems: { where: { billTo: 'CUSTOMER' as const }, select: { amount: true } } } },
  payments: { select: paySelect, orderBy: { recordedAt: 'asc' as const } },
  refunds: { select: refundSelect, orderBy: { recordedAt: 'asc' as const } },
  cancellationRequests: { where: { status: 'APPROVED' as const }, select: { decidedAt: true }, orderBy: { decidedAt: 'desc' as const }, take: 1 },
  escalatedFromVehicleService: { select: { id: true, serviceNumber: true } },
} satisfies Prisma.JobCardSelect;

export const serviceItemSelect = {
  id: true, serviceNumber: true, status: true, createdAt: true,
  checkedInAt: true, workStartedAt: true, completedAt: true, readyForCollectionAt: true, closedAt: true,
  collectedAt: true, cancelledAt: true, escalatedAt: true,
  nextServiceDueDate: true, nextServiceDueOdometer: true,
  vehicle: { select: vehicleSelect },
  branch: { select: { name: true } },
  serviceEstimate: { select: { customerNotifiedAt: true, lineItems: { select: { amount: true } } } },
  payments: { select: paySelect, orderBy: { recordedAt: 'asc' as const } },
  refunds: { select: refundSelect, orderBy: { recordedAt: 'asc' as const } },
  escalatedToJobCard: { select: { id: true, jobNumber: true } },
} satisfies Prisma.VehicleServiceSelect;

type JobCardRow = Prisma.JobCardGetPayload<{ select: typeof jobCardItemSelect }>;
type ServiceRow = Prisma.VehicleServiceGetPayload<{ select: typeof serviceItemSelect }>;

export function jobCardItem(jc: JobCardRow, now = new Date()): ServiceItem {
  const status = String(jc.status);
  const notifiedAt = jc.estimate?.customerNotifiedAt ?? null;
  const money = moneyFor({ notified: Boolean(notifiedAt), lines: jc.estimate?.lineItems ?? [], payments: jc.payments, refunds: jc.refunds });
  const cancelledAt = status === 'CANCELLED' ? (jc.cancellationRequests[0]?.decidedAt ?? jc.updatedAt) : null;
  const awaitingApproval = status === 'AWAITING_CUSTOMER_APPROVAL' && Boolean(notifiedAt);
  const waitingForCollection = (status === 'READY_FOR_COLLECTION' || status === 'CLOSED') && !jc.checkedOutAt;
  const readyAt = jc.readyForCollectionAt;
  return {
    kind: 'jc', id: jc.id, number: jc.jobNumber, status, info: jobCardStatus(status), phase: jobCardPhase(status),
    step: jobCardStep(status), steps: JOB_CARD_STEPS,
    vehicle: { id: jc.vehicle.id, label: vehicleLabel(jc.vehicle), plate: jc.vehicle.plateNumber },
    branchName: jc.branch?.name ?? null,
    href: `/customer-portal/dashboard/services/jc/${jc.id}`,
    createdAt: jc.createdAt, checkedInAt: jc.createdAt, workStartedAt: jc.workStartedAt, completedAt: jc.completedAt,
    readyAt, closedAt: jc.closedAt, collectedAt: jc.checkedOutAt, cancelledAt, escalatedAt: null,
    lastUpdate: latest(jc.createdAt, jc.workStartedAt, jc.completedAt, readyAt, jc.closedAt, jc.checkedOutAt, cancelledAt, notifiedAt, ...jc.payments.map((p) => p.recordedAt), ...jc.refunds.map((r) => r.recordedAt)),
    estimateNotifiedAt: notifiedAt,
    money,
    payments: jc.payments.map(toPay),
    refunds: jc.refunds.map(toRefund),
    awaitingApproval,
    approvalDeadline: awaitingApproval && notifiedAt ? addWorkingDays(notifiedAt, APPROVAL_DEADLINE_WORKING_DAYS) : null,
    waitingForCollection,
    collectBy: waitingForCollection && readyAt ? addWorkingDays(readyAt, READY_FOR_COLLECTION_GRACE_WORKING_DAYS) : null,
    waitingDays: waitingForCollection && readyAt ? Math.max(0, daysBetween(readyAt, now)) : null,
    // A cancelled Job Card's vehicle stays with us until it is checked out.
    inCustody: status !== 'CHECKED_OUT' && !jc.checkedOutAt,
    linked: jc.escalatedFromVehicleService ? { kind: 'vs', id: jc.escalatedFromVehicleService.id, number: jc.escalatedFromVehicleService.serviceNumber, relation: 'started-as' } : null,
    nextServiceDueDate: null,
    nextServiceDueOdometer: null,
  };
}

export function serviceItem(vs: ServiceRow, now = new Date()): ServiceItem {
  const status = String(vs.status);
  const notifiedAt = vs.serviceEstimate?.customerNotifiedAt ?? null;
  const money = moneyFor({ notified: Boolean(notifiedAt), lines: vs.serviceEstimate?.lineItems ?? [], payments: vs.payments, refunds: vs.refunds });
  const awaitingApproval = status === 'CHECKED_IN' && Boolean(notifiedAt) && (money.depositDue ?? 0) > 0;
  const waitingForCollection = (status === 'READY_FOR_COLLECTION' || status === 'CLOSED') && !vs.collectedAt;
  const readyAt = vs.readyForCollectionAt;
  return {
    kind: 'vs', id: vs.id, number: vs.serviceNumber, status, info: serviceStatus(status), phase: servicePhase(status),
    step: serviceStep(status), steps: SERVICE_STEPS,
    vehicle: { id: vs.vehicle.id, label: vehicleLabel(vs.vehicle), plate: vs.vehicle.plateNumber },
    branchName: vs.branch?.name ?? null,
    href: `/customer-portal/dashboard/services/vs/${vs.id}`,
    createdAt: vs.createdAt, checkedInAt: vs.checkedInAt, workStartedAt: vs.workStartedAt, completedAt: vs.completedAt,
    readyAt, closedAt: vs.closedAt, collectedAt: vs.collectedAt, cancelledAt: vs.cancelledAt, escalatedAt: vs.escalatedAt,
    lastUpdate: latest(vs.createdAt, vs.checkedInAt, vs.workStartedAt, vs.completedAt, readyAt, vs.closedAt, vs.collectedAt, vs.cancelledAt, vs.escalatedAt, notifiedAt, ...vs.payments.map((p) => p.recordedAt), ...vs.refunds.map((r) => r.recordedAt)),
    estimateNotifiedAt: notifiedAt,
    money,
    payments: vs.payments.map(toPay),
    refunds: vs.refunds.map(toRefund),
    awaitingApproval,
    approvalDeadline: awaitingApproval && notifiedAt ? addWorkingDays(notifiedAt, APPROVAL_DEADLINE_WORKING_DAYS) : null,
    waitingForCollection,
    collectBy: waitingForCollection && readyAt ? addWorkingDays(readyAt, READY_FOR_COLLECTION_GRACE_WORKING_DAYS) : null,
    waitingDays: waitingForCollection && readyAt ? Math.max(0, daysBetween(readyAt, now)) : null,
    inCustody: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'].includes(status) && !vs.collectedAt,
    linked: vs.escalatedToJobCard ? { kind: 'jc', id: vs.escalatedToJobCard.id, number: vs.escalatedToJobCard.jobNumber, relation: 'continued-as' } : null,
    nextServiceDueDate: vs.nextServiceDueDate,
    nextServiceDueOdometer: vs.nextServiceDueOdometer,
  };
}

/** All of a customer's Job Cards and Vehicle Services, newest first, in one shape. */
export const loadServices = cache(async (customerId: string, take = 100): Promise<ServiceItem[]> => {
  const now = new Date();
  const [jobCards, services] = await Promise.all([
    prisma.jobCard.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take, select: jobCardItemSelect }),
    prisma.vehicleService.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take, select: serviceItemSelect }),
  ]);
  const items = [...jobCards.map((jc) => jobCardItem(jc, now)), ...services.map((vs) => serviceItem(vs, now))];
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
});

/** What the customer still owes on a job (0 for cancelled / escalated ones). */
export function outstanding(i: ServiceItem): number {
  if (i.phase === 'cancelled' || i.status === 'ESCALATED') return 0;
  return i.money.balance ?? 0;
}

// ------------------------------------------------------------------ Vehicles

export type VehicleCard = {
  id: string; label: string; plate: string | null; chassis: string | null; mileage: number | null; vehicleType: string | null;
  year: number | null; make: string | null; model: string | null; addedAt: Date;
};

export const loadVehicles = cache(async (customerId: string): Promise<VehicleCard[]> => {
  const rows = await prisma.customerVehicle.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, mileage: true, vehicleType: true, createdAt: true },
  });
  return rows.map((v) => ({
    id: v.id, label: vehicleLabel(v), plate: v.plateNumber, chassis: v.chassisNumber, mileage: v.mileage,
    vehicleType: v.vehicleType ? String(v.vehicleType) : null, year: v.year, make: v.make, model: v.model, addedAt: v.createdAt,
  }));
});

/** Next service due for a vehicle: the latest service's own prediction. */
export function nextServiceFor(vehicleId: string, items: ServiceItem[]): { date: Date | null; odometer: number | null; from: ServiceItem } | null {
  const done = items.find((i) => i.kind === 'vs' && i.vehicle.id === vehicleId && (i.nextServiceDueDate || i.nextServiceDueOdometer));
  return done ? { date: done.nextServiceDueDate, odometer: done.nextServiceDueOdometer, from: done } : null;
}

// ---------------------------------------------------------------- Warranties

export type WarrantyItem = {
  id: string; number: string; kind: string; status: string; state: WarrantyState; subject: string;
  startsAt: Date; endsAt: Date; issuedAt: Date; distanceLimit: number | null; startReading: number | null;
  coverage: string; exclusions: string | null; conditions: string | null;
  policyName: string; coversParts: boolean; coversLabour: boolean; providerName: string;
  vehicle: { id: string; label: string; plate: string | null } | null;
  source: { kind: 'jc' | 'vs'; id: string; number: string } | null;
  claims: { id: string; number: string; status: string; complaint: string; failureDate: Date; resolution: string | null; createdAt: Date; decidedAt: Date | null; settledAt: Date | null }[];
};

export const loadWarranties = cache(async (customerId: string): Promise<WarrantyItem[]> => {
  const now = new Date();
  const rows = await prisma.warranty.findMany({
    where: { customerId },
    orderBy: { endsAt: 'desc' },
    take: 200,
    select: {
      id: true, warrantyNumber: true, kind: true, status: true, subjectDescription: true, startsAt: true, endsAt: true, issuedAt: true,
      distanceLimit: true, startReading: true, coverageSnapshot: true, exclusionsSnapshot: true, conditionsSnapshot: true,
      policy: { select: { name: true, coversParts: true, coversLabour: true } },
      provider: { select: { name: true } },
      vehicle: { select: vehicleSelect },
      jobCard: { select: { id: true, jobNumber: true } },
      vehicleService: { select: { id: true, serviceNumber: true } },
      claims: {
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, claimNumber: true, status: true, complaint: true, failureDate: true, customerResolution: true, createdAt: true, decidedAt: true, settledAt: true },
      },
    },
  });
  return rows.map((w) => ({
    id: w.id, number: w.warrantyNumber, kind: String(w.kind), status: String(w.status), state: warrantyState({ status: String(w.status), endsAt: w.endsAt }, now),
    subject: w.subjectDescription, startsAt: w.startsAt, endsAt: w.endsAt, issuedAt: w.issuedAt, distanceLimit: w.distanceLimit, startReading: w.startReading,
    coverage: w.coverageSnapshot, exclusions: w.exclusionsSnapshot, conditions: w.conditionsSnapshot,
    policyName: w.policy.name, coversParts: w.policy.coversParts, coversLabour: w.policy.coversLabour, providerName: w.provider.name,
    vehicle: w.vehicle ? { id: w.vehicle.id, label: vehicleLabel(w.vehicle), plate: w.vehicle.plateNumber } : null,
    source: w.jobCard ? { kind: 'jc', id: w.jobCard.id, number: w.jobCard.jobNumber } : w.vehicleService ? { kind: 'vs', id: w.vehicleService.id, number: w.vehicleService.serviceNumber } : null,
    claims: w.claims.map((c) => ({ id: c.id, number: c.claimNumber, status: String(c.status), complaint: c.complaint, failureDate: c.failureDate, resolution: c.customerResolution ? String(c.customerResolution) : null, createdAt: c.createdAt, decidedAt: c.decidedAt, settledAt: c.settledAt })),
  }));
});

// ---------------------------------------------------------------- Broadcasts

export type BroadcastItem = { id: string; title: string; message: string; category: string; startsAt: Date };

/** Live customer broadcasts for this customer (contract 4). */
export const loadBroadcasts = cache(async (customerId: string, organisationId: string): Promise<BroadcastItem[]> => {
  const now = new Date();
  const rows = await prisma.broadcast.findMany({
    where: {
      organisationId,
      isActive: true,
      startsAt: { lte: now },
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ audience: 'CUSTOMERS_ALL' }, { audience: 'CUSTOMERS_SELECTED', audienceIds: { has: customerId } }] },
      ],
    },
    orderBy: { startsAt: 'desc' },
    take: 20,
    select: { id: true, title: true, message: true, category: true, startsAt: true },
  });
  return rows.map((b) => ({ id: b.id, title: b.title, message: b.message, category: String(b.category), startsAt: b.startsAt }));
});

// ------------------------------------------------------------------ Contacts

export type BranchContact = { name: string; address: string | null; hotlines: string[]; email: string | null; bank: { bankName: string | null; accountName: string | null; accountNumber: string | null } | null; organisation: string; orgHotlines: string[]; orgEmail: string | null; orgAddress: string | null };

/**
 * Who to call: the branch of the customer's latest visit (Job Card or
 * service), with the organisation's own lines as the fallback.
 */
export const loadContact = cache(async (customerId: string, organisationId: string): Promise<BranchContact | null> => {
  const branchSelect = { name: true, address: true, hotlines: true, email: true, bankName: true, bankAccountName: true, bankAccountNumber: true } as const;
  const [jc, vs, org] = await Promise.all([
    prisma.jobCard.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, branch: { select: branchSelect } } }),
    prisma.vehicleService.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, branch: { select: branchSelect } } }),
    prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, hotlines: true, email: true, hqAddress: true } }),
  ]);
  const pick = jc && vs ? (jc.createdAt > vs.createdAt ? jc : vs) : (jc ?? vs);
  if (!pick && !org) return null;
  return {
    name: pick?.branch?.name ?? org?.name ?? 'Our team',
    address: pick?.branch?.address ?? null,
    hotlines: pick?.branch?.hotlines ?? [],
    email: pick?.branch?.email ?? null,
    bank: pick?.branch ? { bankName: pick.branch.bankName, accountName: pick.branch.bankAccountName, accountNumber: pick.branch.bankAccountNumber } : null,
    organisation: org?.name ?? '',
    orgHotlines: org?.hotlines ?? [],
    orgEmail: org?.email ?? null,
    orgAddress: org?.hqAddress ?? null,
  };
});

// ----------------------------------------------------------------- Estimates

/**
 * The estimate lines a customer may see — the SAME selects the Job Card and
 * Vehicle Service pages use (and Enyo's my_estimate tool): on a Job Card only
 * the lines billed to the customer; on either, nothing until the customer has
 * been notified (customerEstimateLines returns null before that).
 */
const estimateLineFields = { id: true, type: true, description: true, quantity: true, unitPrice: true, amount: true, unitOfMeasure: true } as const;
export const jobCardEstimateSelect = {
  customerNotifiedAt: true,
  lineItems: { where: { billTo: 'CUSTOMER' as const }, orderBy: { createdAt: 'asc' as const }, select: estimateLineFields },
} satisfies Prisma.EstimateSelect;
export const serviceEstimateSelect = {
  customerNotifiedAt: true,
  lineItems: { orderBy: { createdAt: 'asc' as const }, select: estimateLineFields },
} satisfies Prisma.ServiceEstimateSelect;

export type CustomerEstimateLine = { id: string; type: string; description: string; quantity: number; unitPrice: number | null; amount: number | null; unit: string | null };

type RawLine = { id: string; type: unknown; description: string; quantity: unknown; unitPrice: unknown; amount: unknown; unitOfMeasure: string | null };

export function customerEstimateLines(est: { customerNotifiedAt: Date | null; lineItems: RawLine[] } | null | undefined): CustomerEstimateLine[] | null {
  if (!est?.customerNotifiedAt) return null;
  return est.lineItems.map((l) => ({
    id: l.id, type: String(l.type), description: l.description, quantity: num(l.quantity),
    unitPrice: l.unitPrice === null || l.unitPrice === undefined ? null : num(l.unitPrice),
    amount: l.amount === null || l.amount === undefined ? null : num(l.amount),
    unit: l.unitOfMeasure,
  }));
}

/** One of the customer's own jobs with its customer-visible estimate (null lines = not sent yet), found by its number. */
export async function loadOwnEstimate(customerId: string, item: { kind: 'jc' | 'vs'; id: string }): Promise<CustomerEstimateLine[] | null> {
  if (item.kind === 'jc') {
    const jc = await prisma.jobCard.findFirst({ where: { id: item.id, customerId }, select: { estimate: { select: jobCardEstimateSelect } } });
    return customerEstimateLines(jc?.estimate);
  }
  const vs = await prisma.vehicleService.findFirst({ where: { id: item.id, customerId }, select: { serviceEstimate: { select: serviceEstimateSelect } } });
  return customerEstimateLines(vs?.serviceEstimate);
}

// ------------------------------------------------------------------- Support

export type SupportTicketView = {
  id: string; number: string; subject: string; status: string; createdAt: Date; updatedAt: Date;
  replies: { id: string; fromCustomer: boolean; body: string; createdAt: Date; kind: string }[];
};

/**
 * The customer's own support requests (hand-overs from the assistant) with
 * every reply, newest first. Staff replies carry no staff names here — they
 * read as "Customer care". Enyo's internal summary is never shown.
 */
export const loadSupportTickets = cache(async (customerId: string, organisationId: string): Promise<SupportTicketView[]> => {
  const rows = await prisma.supportTicket.findMany({
    where: { customerId, organisationId },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: {
      id: true, number: true, subject: true, status: true, createdAt: true, updatedAt: true,
      // Only what the customer may see: never a colleague's internal note or Enyo's draft.
      replies: { where: { visibility: 'PUBLIC', kind: { in: ['CUSTOMER', 'AGENT', 'AI'] } }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, fromCustomer: true, body: true, createdAt: true, kind: true } },
    },
  });
  return rows.map((t) => ({ ...t, status: String(t.status) }));
});
