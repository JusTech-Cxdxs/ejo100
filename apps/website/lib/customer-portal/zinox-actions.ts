'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { clientIp } from '@/lib/customer-audit';
import { logCustomerError } from '@/lib/error-events';
import { currentCustomer, type SignedInCustomer } from './session';
import { deviceCover } from './zinox-data';
import type { ActionState } from './actions';

/**
 * Zinox edition self-service (customer and dealer portal). Every action:
 *  1. re-resolves the signed-in, ACTIVE customer from the session;
 *  2. touches only rows that belong to that customer (units by customerId,
 *     orders by customerId, warranties by customerId) within their organisation;
 *  3. validates on the server and answers in plain words;
 *  4. writes the audit trail as the customer (actor: customer, activatedVia: portal).
 * Nothing here creates a staff session or widens what the customer can see.
 */

const SIGNED_OUT: ActionState = { ok: false, error: 'Your session has ended. Please sign in again.' };
const FIELD_CAP = 2000;
const DAY = 86_400_000;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').slice(0, FIELD_CAP).replace(/\s+/g, ' ').trim();
const SERIAL = /^[A-Za-z0-9][A-Za-z0-9/_.-]{2,59}$/;

async function ip(): Promise<string | null> {
  try { return clientIp(await headers()); } catch { return null; }
}

/** The customer's own trail entry (customer.<verb> on the record), never blocking the action. */
async function audit(me: SignedInCustomer, verb: string, entityType: string, entityId: string, details: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { organisationId: me.organisationId, userId: null, action: `customer.${verb}`, entityType, entityId, metadata: JSON.parse(JSON.stringify({ actor: 'customer', customerId: me.id, activatedVia: 'portal', ...details })), ipAddress: await ip() } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Customer audit write failed', verb, err instanceof Error ? err.message : err);
  }
}

function done(message: string, path = '/customer-portal/dashboard'): ActionState {
  revalidatePath(path, 'layout');
  return { ok: true, message, at: Date.now() };
}

/** WR-2026-000001, the Warranty module's own pattern; the unique index settles a tie and we retry. */
async function nextWarrantyNumber(): Promise<string> {
  const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 4));
  const prefix = `WR-${year}-`;
  const latest = await prisma.warranty.findFirst({ where: { warrantyNumber: { startsWith: prefix } }, orderBy: { warrantyNumber: 'desc' }, select: { warrantyNumber: true } });
  const next = latest ? parseInt(latest.warrantyNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}
async function nextClaimNumber(): Promise<string> {
  const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 4));
  const prefix = `WC-${year}-`;
  const latest = await prisma.warrantyClaim.findFirst({ where: { claimNumber: { startsWith: prefix } }, orderBy: { claimNumber: 'desc' }, select: { claimNumber: true } });
  const next = latest ? parseInt(latest.claimNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}
async function nextServiceNumber(organisationId: string): Promise<string> {
  const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }).slice(0, 4));
  const rows = await prisma.$queryRaw<{ last: number }[]>`
    INSERT INTO "document_sequences" ("organisationId", "prefix", "year", "last")
    VALUES (${organisationId}, ${'SVC'}, ${year}, 1)
    ON CONFLICT ("organisationId", "prefix", "year") DO UPDATE SET "last" = "document_sequences"."last" + 1
    RETURNING "last"`;
  return `SVC-${year}-${String(rows[0]?.last ?? 1).padStart(6, '0')}`;
}
function isNumberClash(err: unknown): boolean {
  const e = err as { code?: string } | null;
  return e?.code === 'P2002';
}
async function withRetry<T>(attempt: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await attempt(); } catch (err) { if (i < tries && isNumberClash(err)) continue; throw err; }
  }
}

function monthsOf(p: { durationMonths: number; durationUnit: string }): number {
  return p.durationUnit === 'MONTHS' ? p.durationMonths : Math.max(1, Math.round(p.durationMonths / 30));
}
function addMonths(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** The product policy a unit is activated under: the product's default, else the organisation's first active PRODUCT policy. */
async function productPolicy(organisationId: string, productPolicyId: string | null) {
  const select = { id: true, providerId: true, durationMonths: true, durationUnit: true, coverageSummary: true, exclusions: true, conditions: true } as const;
  const owned = { OR: [{ organisationId }, { organisationId: null }] };
  if (productPolicyId) {
    const p = await prisma.warrantyPolicy.findFirst({ where: { ...owned, id: productPolicyId, kind: 'PRODUCT', isActive: true, archivedAt: null }, select });
    if (p) return p;
  }
  return prisma.warrantyPolicy.findFirst({ where: { ...owned, kind: 'PRODUCT', isActive: true, archivedAt: null }, orderBy: { createdAt: 'asc' }, select });
}

/** A unit of this customer's organisation, by serial (held at one of its branches or sold to one of its customers). */
async function unitBySerial(me: SignedInCustomer, serial: string) {
  return prisma.finishedUnit.findFirst({
    where: { serialNumber: { equals: serial, mode: 'insensitive' }, OR: [{ location: { branch: { businessUnit: { organisationId: me.organisationId } } } }, { customer: { organisationId: me.organisationId } }] },
    select: { id: true, serialNumber: true, customerId: true, soldAt: true, status: true, product: { select: { name: true, warrantyPolicyId: true } }, configuration: { select: { name: true } }, warranties: { select: { id: true, kind: true, status: true, startsAt: true, endsAt: true } } },
  });
}

/** Creates the PRODUCT warranty for a unit that is the customer's and has none. */
async function activateFor(me: SignedInCustomer, unit: NonNullable<Awaited<ReturnType<typeof unitBySerial>>>): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const cover = deviceCover(unit.warranties.map((w) => ({ ...w, kind: String(w.kind), status: String(w.status) })));
  if (!cover.canActivate) return { ok: false, error: cover.state === 'none' ? 'This device already has a warranty record.' : `This device's warranty is already on record (${cover.label.toLowerCase()}).` };
  const policy = await productPolicy(me.organisationId, unit.product.warrantyPolicyId);
  if (!policy) return { ok: false, error: 'Warranty activation is not available online for this product yet. Please contact the Service Centre.' };
  const start = unit.soldAt ?? new Date();
  const endsAt = addMonths(start, monthsOf(policy));
  const subject = `${unit.product.name}${unit.configuration ? ` (${unit.configuration.name})` : ''} — serial ${unit.serialNumber}`;
  const w = await withRetry(async () => prisma.warranty.create({
    data: {
      warrantyNumber: await nextWarrantyNumber(), kind: 'PRODUCT', status: 'ACTIVE', policyId: policy.id, providerId: policy.providerId, customerId: me.id, finishedUnitId: unit.id,
      subjectDescription: subject, startsAt: start, endsAt, coverageSnapshot: policy.coverageSummary, exclusionsSnapshot: policy.exclusions, conditionsSnapshot: policy.conditions,
      origin: 'PORTAL', evidenceNote: `Activated by the customer on the portal on ${new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })}.`,
    },
    select: { id: true, warrantyNumber: true },
  }));
  await audit(me, 'warranty_activated', 'Warranty', w.id, { warrantyNumber: w.warrantyNumber, serialNumber: unit.serialNumber, product: unit.product.name, startsAt: start.toISOString(), endsAt: endsAt.toISOString() });
  return { ok: true, number: w.warrantyNumber };
}

// ---------------------------------------------------------------- Devices

/** "Activate warranty" on a device the customer bought from us. */
export async function activateDeviceWarranty(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const unitId = text(fd, 'unitId');
  if (!unitId) return { ok: false, error: 'Choose the device to activate.' };
  const unit = await prisma.finishedUnit.findFirst({
    where: { id: unitId, customerId: me.id },
    select: { id: true, serialNumber: true, customerId: true, soldAt: true, status: true, product: { select: { name: true, warrantyPolicyId: true } }, configuration: { select: { name: true } }, warranties: { where: { customerId: me.id }, select: { id: true, kind: true, status: true, startsAt: true, endsAt: true } } },
  });
  if (!unit) return { ok: false, error: 'That device is not registered to you.' };
  try {
    const r = await activateFor(me, unit);
    if (!r.ok) return { ok: false, error: r.error };
    return done(`Warranty ${r.number} is now active on your ${unit.product.name}.`, '/customer-portal/dashboard/devices');
  } catch (err) {
    const ref = await logCustomerError('activateDeviceWarranty', err);
    return { ok: false, error: `We couldn’t activate the warranty just now. Please try again, or contact the Service Centre and quote reference ${ref}.` };
  }
}

/** "Register a device I bought from a dealer": by serial, with a proof note. The unit must exist and have no customer yet. */
export async function registerDealerDevice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const serial = text(fd, 'serial').toUpperCase();
  const proof = text(fd, 'proof');
  const fieldErrors: Record<string, string> = {};
  if (!SERIAL.test(serial)) fieldErrors.serial = 'Enter the serial number as printed on the device (letters, digits and dashes).';
  if (proof.length < 8) fieldErrors.proof = 'Tell us where and when you bought it (the dealer\'s name and the receipt number or date).';
  if (proof.length > 500) fieldErrors.proof = 'Keep the proof note under 500 characters.';
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  const unit = await unitBySerial(me, serial);
  if (!unit) return { ok: false, fieldErrors: { serial: 'We could not find a device with that serial. Check it against the label, or contact the dealer you bought it from.' }, error: 'Device not found.' };
  if (unit.customerId === me.id) return { ok: false, error: 'This device is already registered to you — activate its warranty from the list above.' };
  if (unit.customerId) return { ok: false, error: 'This device is registered to another customer. If you believe this is wrong, contact the Service Centre with your receipt.' };
  if (['IN_STOCK', 'RESERVED', 'PICKED', 'QUARANTINE', 'SCRAPPED'].includes(String(unit.status))) return { ok: false, error: 'This serial has not been released for sale yet. Please contact the dealer you bought it from.' };
  try {
    const claimed = await prisma.finishedUnit.updateMany({ where: { id: unit.id, customerId: null }, data: { customerId: me.id, soldAt: unit.soldAt ?? new Date(), status: 'SOLD' } });
    if (claimed.count !== 1) return { ok: false, error: 'This device was registered by someone else a moment ago. Please contact the Service Centre.' };
    await audit(me, 'device_registered', 'FinishedUnit', unit.id, { serialNumber: unit.serialNumber, product: unit.product.name, proofNote: proof, boughtFrom: 'dealer' });
    const r = await activateFor(me, { ...unit, customerId: me.id });
    const tail = r.ok ? ` Warranty ${r.number} is now active.` : ` ${r.error}`;
    return done(`Your ${unit.product.name} (serial ${unit.serialNumber}) is now registered to you.${tail}`, '/customer-portal/dashboard/devices');
  } catch (err) {
    const ref = await logCustomerError('registerDealerDevice', err);
    return { ok: false, error: `We couldn’t register the device just now. Please try again, or contact the Service Centre and quote reference ${ref}.` };
  }
}

// ---------------------------------------------------------------- Orders

const METHODS = ['BANK_TRANSFER', 'POS', 'CHEQUE', 'ONLINE', 'CASH'] as const;

/** "Upload payment proof": a PENDING payment on the customer's own order, confirmed by Finance later. */
export async function uploadPaymentProof(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const orderId = text(fd, 'orderId');
  const amount = Math.round(Number(text(fd, 'amount').replace(/,/g, '')) * 100) / 100;
  const method = text(fd, 'method') as (typeof METHODS)[number];
  const reference = text(fd, 'reference');
  const proofNote = text(fd, 'proofNote');
  const paidOn = text(fd, 'paidAt');
  const fieldErrors: Record<string, string> = {};
  if (!Number.isFinite(amount) || amount <= 0) fieldErrors.amount = 'Enter the amount you paid.';
  if (!METHODS.includes(method)) fieldErrors.method = 'Choose how you paid.';
  if (reference.length < 3) fieldErrors.reference = 'Enter the transfer, POS or cheque reference.';
  if (proofNote.length > 500) fieldErrors.proofNote = 'Keep the note under 500 characters.';
  const paidAt = paidOn ? new Date(`${paidOn}T12:00:00+01:00`) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + DAY) fieldErrors.paidAt = 'Enter the date you paid (not in the future).';
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  const order = await prisma.salesOrder.findFirst({ where: { id: orderId, customerId: me.id }, select: { id: true, number: true, status: true, total: true, amountPaid: true } });
  if (!order) return { ok: false, error: 'That order is not yours or no longer exists.' };
  if (['DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED'].includes(String(order.status))) return { ok: false, error: `Order ${order.number} is ${String(order.status).toLowerCase()} — no further payment is expected on it.` };
  const outstanding = Math.max(0, Number(order.total) - Number(order.amountPaid));
  if (outstanding <= 0) return { ok: false, error: `Order ${order.number} is already paid in full.` };
  if (amount > outstanding * 1.0001) return { ok: false, fieldErrors: { amount: `Only ₦${outstanding.toLocaleString('en-NG', { minimumFractionDigits: 2 })} is outstanding on this order.` }, error: 'Please check the amount.' };
  const duplicate = await prisma.salesPayment.findFirst({ where: { salesOrderId: order.id, recordedByCustomerId: me.id, reference: { equals: reference, mode: 'insensitive' }, status: { in: ['PENDING', 'CONFIRMED'] } }, select: { id: true } });
  if (duplicate) return { ok: false, error: 'You have already sent proof with that reference — Finance is confirming it.' };
  try {
    const p = await prisma.salesPayment.create({ data: { salesOrderId: order.id, amount, method, reference, paidAt, status: 'PENDING', proofNote: proofNote || null, recordedByCustomerId: me.id }, select: { id: true } });
    await audit(me, 'payment_proof_uploaded', 'SalesOrder', order.id, { orderNumber: order.number, paymentId: p.id, amount, method, reference, proofNote: proofNote || null });
    return done(`Thank you. Your payment of ₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} on ${order.number} is recorded and will be confirmed by Finance.`, '/customer-portal/dashboard/orders');
  } catch (err) {
    const ref = await logCustomerError('uploadPaymentProof', err);
    return { ok: false, error: `We couldn’t record your payment just now. Please try again. If it keeps happening, call your branch and quote reference ${ref}.` };
  }
}

// ---------------------------------------------------------------- Claims

/** The staff account that stands as the author of records the portal opens on the customer's behalf (the schema needs one). */
async function portalActor(organisationId: string): Promise<{ id: string } | null> {
  for (const slug of ['service-supervisor', 'warranty-manager', 'customer-care', 'administrator']) {
    const u = await prisma.user.findFirst({ where: { organisationId, isActive: true, roles: { some: { role: { slug } } } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (u) return u;
  }
  return prisma.user.findFirst({ where: { organisationId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
}

/** "Report a fault" on one of the customer's devices: a warranty claim when covered, and the service job that receives the unit. */
export async function reportDeviceFault(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const unitId = text(fd, 'unitId');
  const fault = text(fd, 'fault');
  const fieldErrors: Record<string, string> = {};
  if (!unitId) fieldErrors.unitId = 'Choose the device.';
  if (fault.length < 10) fieldErrors.fault = 'Describe the fault in a sentence or two.';
  if (fault.length > 1500) fieldErrors.fault = 'Keep the description under 1,500 characters.';
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  const unit = await prisma.finishedUnit.findFirst({
    where: { id: unitId, customerId: me.id },
    select: {
      id: true, serialNumber: true, status: true, product: { select: { name: true } },
      warranties: { where: { customerId: me.id }, select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, warrantyNumber: true, providerId: true, provider: { select: { claimSubmissionDays: true, partRetentionDays: true } }, policy: { select: { defaultRemedy: true } } } },
      serviceJobs: { where: { status: { in: ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING', 'QA', 'READY'] } }, select: { number: true }, take: 1 },
    },
  });
  if (!unit) return { ok: false, error: 'That device is not registered to you.' };
  if (unit.serviceJobs[0]) return { ok: false, error: `Service job ${unit.serviceJobs[0].number} is already open for this device.` };
  const cover = deviceCover(unit.warranties.map((w) => ({ id: w.id, kind: String(w.kind), status: String(w.status), startsAt: w.startsAt, endsAt: w.endsAt })));
  const covered = cover.state === 'active' || cover.state === 'expiring';
  const warranty = covered ? unit.warranties.find((w) => w.id === cover.warrantyId) ?? null : null;
  const [actor, branch] = await Promise.all([portalActor(me.organisationId), prisma.branch.findFirst({ where: { businessUnit: { organisationId: me.organisationId } }, orderBy: { createdAt: 'asc' }, select: { id: true } })]);
  if (!actor || !branch) return { ok: false, error: 'The Service Centre cannot receive online reports yet. Please call your branch.' };
  try {
    let claimId: string | null = null;
    let claimNumber: string | null = null;
    if (warranty) {
      const open = await prisma.warrantyClaim.findFirst({ where: { warrantyId: warranty.id, status: { in: ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED'] } }, select: { claimNumber: true } });
      if (open) return { ok: false, error: `Claim ${open.claimNumber} is already open for this device.` };
      const partReturnRequired = warranty.provider.partRetentionDays !== null;
      const failureDate = new Date();
      const claim = await withRetry(async () => prisma.warrantyClaim.create({
        data: {
          claimNumber: await nextClaimNumber(), warrantyId: warranty.id, providerId: warranty.providerId, customerId: me.id,
          complaint: fault, cause: 'To be established by the Service Centre diagnosis.', correction: 'Pending repair at the Service Centre.', causalPart: unit.product.name, failureDate,
          remedy: warranty.policy.defaultRemedy, partReturnRequired, partReturnStatus: partReturnRequired ? 'AWAITING' : null,
          deadlineAt: warranty.provider.claimSubmissionDays ? new Date(failureDate.getTime() + warranty.provider.claimSubmissionDays * DAY) : null, createdById: actor.id,
        },
        select: { id: true, claimNumber: true },
      }));
      claimId = claim.id;
      claimNumber = claim.claimNumber;
      await audit(me, 'warranty_claim_logged', 'WarrantyClaim', claim.id, { claimNumber: claim.claimNumber, warrantyNumber: warranty.warrantyNumber, serialNumber: unit.serialNumber });
    }
    const job = await prisma.serviceJob.create({
      data: { number: await nextServiceNumber(me.organisationId), branchId: branch.id, finishedUnitId: unit.id, serialNumber: unit.serialNumber, productName: unit.product.name, customerId: me.id, warrantyClaimId: claimId, kind: covered ? 'WARRANTY' : 'PAID', status: 'OPEN', fault, openedById: actor.id },
      select: { id: true, number: true },
    });
    if (unit.status !== 'IN_SERVICE') await prisma.finishedUnit.updateMany({ where: { id: unit.id, customerId: me.id, status: { not: 'IN_SERVICE' } }, data: { status: 'IN_SERVICE' } });
    await audit(me, 'fault_reported', 'ServiceJob', job.id, { referenceNumber: job.number, serialNumber: unit.serialNumber, product: unit.product.name, kind: covered ? 'WARRANTY' : 'PAID', claimNumber });
    const how = covered ? `It is under warranty, so claim ${claimNumber} has been logged with it.` : 'It is out of warranty, so the Service Centre will send you a quotation once the fault is diagnosed.';
    return done(`Service job ${job.number} has been opened for your ${unit.product.name}. ${how} Please bring the device to the Service Centre with this job number.`, '/customer-portal/dashboard/claims');
  } catch (err) {
    const ref = await logCustomerError('reportDeviceFault', err);
    return { ok: false, error: `We couldn’t log the report just now. Please try again, or call the Service Centre and quote reference ${ref}.` };
  }
}
