'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopBranchId, listEligibleManagersForBranch, getWorkshopOrgContext } from './workshop';
import { getWarrantyRoles, type WarrantyRoles } from './warranty';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { claimReadiness } from '@/lib/warranty-claim-readiness';

class WarrantyClaimError extends Error {}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function requireStaff(): Promise<{ id: string; roles: WarrantyRoles }> {
  const user = await requireUser();
  const roles = await getWarrantyRoles();
  if (!roles.isStaff) throw new WarrantyClaimError('Only Warranty staff, the Warranty HOD, a Branch Manager or a Master Administrator can do this.');
  return { id: user.id, roles };
}
async function requireApprover(): Promise<{ id: string; roles: WarrantyRoles }> {
  const user = await requireUser();
  const roles = await getWarrantyRoles();
  if (!roles.canApprove) throw new WarrantyClaimError('Only the Warranty HOD, a Branch Manager or a Master Administrator can do this.');
  return { id: user.id, roles };
}

async function hodsAndManagers(): Promise<{ id: string; fullName: string; email: string }[]> {
  const branchId = await getWorkshopBranchId();
  const [managers, hods] = await Promise.all([
    listEligibleManagersForBranch(branchId),
    prisma.user.findMany({ where: { branchId, isActive: true, roles: { some: { role: { slug: 'warranty-hod' } } } }, select: { id: true, fullName: true, email: true } }),
  ]);
  const all = [...hods, ...managers.supervisors];
  return all.filter((u, i) => all.findIndex((x) => x.id === u.id) === i);
}

async function notify(recipients: { fullName: string; email: string }[], subject: string, heading: string, lines: string[], claimId: string) {
  try {
    const orgContext = await getWorkshopOrgContext();
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    for (const r of recipients) {
      await sendEmail(
        r.email,
        subject,
        renderWarrantyStaffNoticeEmail({ recipientName: r.fullName, heading, lines, actionUrl: `${portalUrl}/warranty/claims/${claimId}`, logoUrl: `${portalUrl}/images/logo/logo.png`, companyName: orgContext.companyName, branchName: orgContext.branchName }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send warranty claim notice', subject, err);
  }
}

/** WC-2026-000001 */
async function nextClaimNumber(): Promise<string> {
  const prefix = `WC-${new Date().getFullYear()}-`;
  const latest = await prisma.warrantyClaim.findFirst({ where: { claimNumber: { startsWith: prefix } }, orderBy: { claimNumber: 'desc' }, select: { claimNumber: true } });
  const next = latest ? parseInt(latest.claimNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

async function audit(userId: string, claimId: string, action: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action: `warranty_claim.${action}`, entityType: 'WarrantyClaim', entityId: claimId, metadata });
}

// ── Draft ─────────────────────────────────────────────────────────────

export type WarrantyClaimInput = {
  complaint: string;
  cause: string;
  correction: string;
  causalPart: string;
  causalPartNumber?: string;
  failureDate: Date;
  failureReading?: number;
  labourAmount: number;
  partsAmount: number;
  otherAmount: number;
  jobCardId?: string;
  vehicleServiceId?: string;
  remedy?: 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR';
  partReturnRequired?: boolean;
};

const REMEDIES = ['REIMBURSEMENT', 'REPLACEMENT', 'REPAIR'] as const;

function cleanInput(input: WarrantyClaimInput) {
  const failure = new Date(input.failureDate);
  if (Number.isNaN(failure.getTime())) throw new WarrantyClaimError('Enter a valid failure date.');
  if (input.failureReading !== undefined && (!Number.isInteger(input.failureReading) || input.failureReading < 0)) {
    throw new WarrantyClaimError('The odometer at failure must be a whole number of km.');
  }
  const amounts = [input.labourAmount, input.partsAmount, input.otherAmount].map((a) => round2(Number(a) || 0));
  if (amounts.some((a) => a < 0)) throw new WarrantyClaimError('Amounts cannot be negative.');
  if (input.jobCardId && input.vehicleServiceId) throw new WarrantyClaimError('Link the claim to a Job Card or a Vehicle Service, not both.');
  const [labourAmount, partsAmount, otherAmount] = amounts as [number, number, number];
  return {
    complaint: input.complaint.trim(),
    cause: input.cause.trim(),
    correction: input.correction.trim(),
    causalPart: input.causalPart.trim(),
    causalPartNumber: input.causalPartNumber?.trim() || null,
    failureDate: failure,
    failureReading: input.failureReading ?? null,
    labourAmount,
    partsAmount,
    otherAmount,
    claimedAmount: round2(labourAmount + partsAmount + otherAmount),
    jobCardId: input.jobCardId || null,
    vehicleServiceId: input.vehicleServiceId || null,
    ...(input.remedy ? { remedy: REMEDIES.includes(input.remedy) ? input.remedy : 'REIMBURSEMENT' } : {}),
    ...(input.partReturnRequired !== undefined ? { partReturnRequired: input.partReturnRequired } : {}),
  };
}

/** Open a claim against a warranty. A draft may be incomplete — the
 * readiness check decides when it can go for approval. The provider's
 * submission deadline is set from the failure date. */
export async function createWarrantyClaim(warrantyId: string, input: WarrantyClaimInput): Promise<{ id: string; claimNumber: string }> {
  const user = await requireStaff();
  const warranty = await prisma.warranty.findUnique({
    where: { id: warrantyId },
    select: { id: true, warrantyNumber: true, providerId: true, customerId: true, vehicleId: true, provider: { select: { claimSubmissionDays: true, partRetentionDays: true } }, policy: { select: { defaultRemedy: true } } },
  });
  if (!warranty) throw new WarrantyClaimError('Warranty not found.');
  const data = cleanInput(input);
  // Defaults: the policy's usual remedy; a failed-part return when the
  // provider has a retention rule (they'll want to inspect it).
  const remedy = data.remedy ?? warranty.policy.defaultRemedy;
  const partReturnRequired = data.partReturnRequired ?? warranty.provider.partRetentionDays !== null;
  if (!data.complaint) throw new WarrantyClaimError('Describe the complaint to start a claim.');
  const deadlineAt = warranty.provider.claimSubmissionDays ? new Date(data.failureDate.getTime() + warranty.provider.claimSubmissionDays * 86400000) : null;
  const claimNumber = await nextClaimNumber();
  const claim = await prisma.warrantyClaim.create({
    data: { ...data, remedy, partReturnRequired, partReturnStatus: partReturnRequired ? 'AWAITING' : null, claimNumber, warrantyId: warranty.id, providerId: warranty.providerId, customerId: warranty.customerId, vehicleId: warranty.vehicleId, deadlineAt, createdById: user.id },
  });
  await audit(user.id, claim.id, 'created', { claimNumber, warrantyNumber: warranty.warrantyNumber, claimedAmount: data.claimedAmount });
  await writeAuditLog({ userId: user.id, action: 'warranty.claim_opened', entityType: 'Warranty', entityId: warranty.id, metadata: { claimNumber } });
  return { id: claim.id, claimNumber };
}

export async function updateWarrantyClaim(claimId: string, input: WarrantyClaimInput): Promise<void> {
  const user = await requireStaff();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, failureDate: true, partReturnStatus: true, provider: { select: { claimSubmissionDays: true } } } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.status !== 'DRAFT') throw new WarrantyClaimError('Only a draft claim can be edited — it is already in the approval chain or with the provider.');
  const data = cleanInput(input);
  const deadlineAt = claim.provider.claimSubmissionDays ? new Date(data.failureDate.getTime() + claim.provider.claimSubmissionDays * 86400000) : null;
  const returnStatus = data.partReturnRequired === undefined ? undefined : data.partReturnRequired ? claim.partReturnStatus ?? 'AWAITING' : null;
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { ...data, deadlineAt, ...(returnStatus !== undefined ? { partReturnStatus: returnStatus } : {}) } });
  await audit(user.id, claimId, 'updated', { claimedAmount: data.claimedAmount });
}

async function loadForReadiness(claimId: string) {
  const claim = await prisma.warrantyClaim.findUnique({
    where: { id: claimId },
    include: { warranty: { select: { status: true, startsAt: true, endsAt: true, startReading: true, distanceLimit: true, policy: { select: { isSample: true, coversParts: true, coversLabour: true } } } } },
  });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  const readiness = claimReadiness(
    { ...claim, labourAmount: Number(claim.labourAmount), partsAmount: Number(claim.partsAmount), otherAmount: Number(claim.otherAmount) },
    { ...claim.warranty, isSamplePolicy: claim.warranty.policy.isSample, coversParts: claim.warranty.policy.coversParts, coversLabour: claim.warranty.policy.coversLabour },
  );
  return { claim, readiness };
}

// ── Approval chain: staff → Warranty HOD → Branch Manager ─────────────

/** Send a draft for approval — only when readiness has no blockers. The
 * sender's own level counts (an HOD's claim goes straight to the Manager;
 * a Manager's claim still needs the HOD, then is complete). */
export async function submitWarrantyClaimForApproval(claimId: string): Promise<void> {
  const user = await requireStaff();
  const { claim, readiness } = await loadForReadiness(claimId);
  if (claim.status !== 'DRAFT') throw new WarrantyClaimError('Only a draft claim can be sent for approval.');
  if (!readiness.ready) {
    throw new WarrantyClaimError(`This claim isn't ready — ${readiness.blockers} ${readiness.blockers === 1 ? 'item needs' : 'items need'} fixing first (see the readiness check).`);
  }
  const r = user.roles;
  const now = new Date();
  const hodDone = r.isHod && !r.isMaster;
  const managerDone = r.isManager && !r.isMaster;
  const status = hodDone && managerDone ? 'APPROVED_TO_SUBMIT' : hodDone ? 'PENDING_MANAGER' : 'PENDING_HOD';
  await prisma.warrantyClaim.update({
    where: { id: claimId },
    data: {
      status,
      reviewRequestedAt: now,
      returnReason: null,
      hodApprovedById: hodDone ? user.id : null,
      hodApprovedAt: hodDone ? now : null,
      managerApprovedById: managerDone ? user.id : null,
      managerApprovedAt: managerDone ? now : null,
    },
  });
  await audit(user.id, claimId, 'sent_for_approval', { claimNumber: claim.claimNumber, readinessScore: readiness.score, warnings: readiness.warnings });
  if (status !== 'APPROVED_TO_SUBMIT') {
    await notify(
      (await hodsAndManagers()).filter((x) => x.id !== user.id),
      `Warranty claim ${claim.claimNumber} needs approval`,
      'A warranty claim needs your approval',
      [`${claim.claimNumber} — ${claim.causalPart}`, `Amount claimed: ${naira(Number(claim.claimedAmount))}`, status === 'PENDING_HOD' ? 'Waiting on the Warranty HOD, then the Branch Manager.' : 'Waiting on the Branch Manager.'],
      claimId,
    );
  }
}

export async function approveWarrantyClaim(claimId: string): Promise<void> {
  const user = await requireApprover();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, createdById: true, claimNumber: true, causalPart: true, claimedAmount: true, managerApprovedAt: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.createdById === user.id && !user.roles.isMaster) throw new WarrantyClaimError('You cannot approve a claim you raised yourself.');
  const now = new Date();
  if (claim.status === 'PENDING_HOD') {
    if (!user.roles.isHod && !user.roles.isMaster) throw new WarrantyClaimError('This claim is waiting on the Warranty HOD.');
    const done = Boolean(claim.managerApprovedAt);
    await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: done ? 'APPROVED_TO_SUBMIT' : 'PENDING_MANAGER', hodApprovedById: user.id, hodApprovedAt: now } });
    await audit(user.id, claimId, 'hod_approved', { claimNumber: claim.claimNumber });
    if (!done) {
      const managers = await listEligibleManagersForBranch(await getWorkshopBranchId());
      await notify(managers.supervisors.filter((m: { id: string }) => m.id !== user.id), `Warranty claim ${claim.claimNumber} awaits Manager approval`, 'A warranty claim needs your approval', [`${claim.claimNumber} — ${claim.causalPart}`, `Amount claimed: ${naira(Number(claim.claimedAmount))}`, 'Approved by the Warranty HOD.'], claimId);
      return;
    }
  } else if (claim.status === 'PENDING_MANAGER') {
    if (!user.roles.isManager && !user.roles.isMaster) throw new WarrantyClaimError('This claim is waiting on the Branch Manager.');
    await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: 'APPROVED_TO_SUBMIT', managerApprovedById: user.id, managerApprovedAt: now } });
    await audit(user.id, claimId, 'manager_approved', { claimNumber: claim.claimNumber });
  } else {
    throw new WarrantyClaimError('This claim is not waiting for approval.');
  }
  const creator = await prisma.user.findUnique({ where: { id: claim.createdById }, select: { fullName: true, email: true } });
  if (creator) await notify([creator], `Warranty claim ${claim.claimNumber} approved — ready to submit`, 'Your warranty claim is approved', [`${claim.claimNumber} — ${claim.causalPart}`, 'Submit it to the provider and record their reference.'], claimId);
}

/** Back to draft, with the reason — at the approver's own step. */
export async function sendBackWarrantyClaim(claimId: string, reason: string): Promise<void> {
  const user = await requireApprover();
  const why = reason.trim();
  if (!why) throw new WarrantyClaimError('Say what needs fixing.');
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, createdById: true, claimNumber: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.status === 'PENDING_HOD' && !user.roles.isHod && !user.roles.isMaster) throw new WarrantyClaimError('This claim is waiting on the Warranty HOD.');
  if (claim.status === 'PENDING_MANAGER' && !user.roles.isManager && !user.roles.isMaster) throw new WarrantyClaimError('This claim is waiting on the Branch Manager.');
  if (claim.status !== 'PENDING_HOD' && claim.status !== 'PENDING_MANAGER' && claim.status !== 'APPROVED_TO_SUBMIT') throw new WarrantyClaimError('Only a claim in the approval chain can be sent back.');
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: 'DRAFT', returnReason: why, hodApprovedById: null, hodApprovedAt: null, managerApprovedById: null, managerApprovedAt: null } });
  await audit(user.id, claimId, 'sent_back', { claimNumber: claim.claimNumber, reason: why });
  const creator = await prisma.user.findUnique({ where: { id: claim.createdById }, select: { fullName: true, email: true } });
  if (creator) await notify([creator], `Warranty claim ${claim.claimNumber} sent back`, 'Your warranty claim was sent back', [claim.claimNumber, `What needs fixing: ${why}`], claimId);
}

// ── With the provider ─────────────────────────────────────────────────

export async function markWarrantyClaimSubmitted(claimId: string, providerReference: string): Promise<void> {
  const user = await requireStaff();
  const ref = providerReference.trim();
  if (!ref) throw new WarrantyClaimError("Enter the provider's claim reference (from their portal, email or form).");
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, deadlineAt: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.status !== 'APPROVED_TO_SUBMIT') throw new WarrantyClaimError('Only an approved claim can be marked as submitted to the provider.');
  const now = new Date();
  const late = claim.deadlineAt ? now.getTime() > new Date(claim.deadlineAt).getTime() : false;
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: 'SUBMITTED', providerReference: ref, submittedById: user.id, submittedAt: now } });
  await audit(user.id, claimId, 'submitted', { claimNumber: claim.claimNumber, providerReference: ref, late });
}

/** The provider's answer: accepted in full, accepted in part (between
 * zero and the amount claimed), or rejected (reason required). */
export async function recordWarrantyClaimDecision(claimId: string, decision: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED', approvedAmount: number | undefined, notes: string): Promise<void> {
  const user = await requireApprover();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, claimedAmount: true, createdById: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.status !== 'SUBMITTED') throw new WarrantyClaimError('A decision can only be recorded for a claim that is with the provider.');
  const claimed = Number(claim.claimedAmount);
  let approved: number;
  if (decision === 'ACCEPTED') approved = claimed;
  else if (decision === 'REJECTED') {
    if (!notes.trim()) throw new WarrantyClaimError("Record the provider's reason for rejecting the claim.");
    approved = 0;
  } else {
    approved = round2(Number(approvedAmount));
    if (!Number.isFinite(approved) || approved <= 0 || approved >= claimed) {
      throw new WarrantyClaimError(`A partial acceptance must be more than ₦0 and less than the ${naira(claimed)} claimed.`);
    }
    if (!notes.trim()) throw new WarrantyClaimError('Record what the provider did not accept, and why.');
  }
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: decision, approvedAmount: approved, decisionNotes: notes.trim() || null, decidedById: user.id, decidedAt: new Date() } });
  await audit(user.id, claimId, 'decision_recorded', { claimNumber: claim.claimNumber, decision, claimedAmount: claimed, approvedAmount: approved, notes: notes.trim() || undefined });
  const creator = await prisma.user.findUnique({ where: { id: claim.createdById }, select: { fullName: true, email: true } });
  if (creator) {
    await notify([creator], `Warranty claim ${claim.claimNumber}: ${decision.replace('_', ' ').toLowerCase()}`, 'Provider decision recorded', [claim.claimNumber, `Decision: ${decision.replace('_', ' ').toLowerCase()} — ${naira(approved)} of ${naira(claimed)}`, ...(notes.trim() ? [`Notes: ${notes.trim()}`] : [])], claimId);
  }
}

/** Money received from the provider — never more than they approved. */
export async function recordWarrantyClaimSettlement(claimId: string, amount: number, reference: string): Promise<void> {
  const user = await requireApprover();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, approvedAmount: true, remedy: true, partReturnRequired: true, partReturnStatus: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.status !== 'ACCEPTED' && claim.status !== 'PARTIALLY_ACCEPTED') throw new WarrantyClaimError('Only an accepted claim can be settled.');
  if (claim.remedy !== 'REIMBURSEMENT') throw new WarrantyClaimError(claim.remedy === 'REPLACEMENT' ? 'This claim is settled by a replacement part — record it as received.' : 'This claim is settled by a repair — record the repaired part as returned.');
  assertPartSent(claim);
  const approved = Number(claim.approvedAmount ?? 0);
  const received = round2(Number(amount));
  if (!Number.isFinite(received) || received <= 0) throw new WarrantyClaimError('Enter the amount received.');
  if (received > approved) throw new WarrantyClaimError(`That is more than the provider approved (${naira(approved)}).`);
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: 'SETTLED', settledAmount: received, settlementReference: reference.trim() || null, settledById: user.id, settledAt: new Date() } });
  await audit(user.id, claimId, 'settled', { claimNumber: claim.claimNumber, approvedAmount: approved, settledAmount: received, shortfall: round2(approved - received), reference: reference.trim() || undefined });
}

function assertPartSent(claim: { partReturnRequired: boolean; partReturnStatus: string | null }) {
  if (claim.partReturnRequired && claim.partReturnStatus !== 'SENT' && claim.partReturnStatus !== 'RECEIVED_BY_PROVIDER') {
    throw new WarrantyClaimError('The provider requires the failed part back — record it as sent first.');
  }
}

// ── Failed-part return ────────────────────────────────────────────────

/** The failed part has left for the provider (waybill / courier / hand-
 * delivery reference required) — possible once the claim is approved. */
export async function recordFailedPartSent(claimId: string, reference: string): Promise<void> {
  const user = await requireStaff();
  const ref = reference.trim();
  if (!ref) throw new WarrantyClaimError('Enter the waybill, courier or delivery reference.');
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, partReturnRequired: true, partReturnStatus: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (!claim.partReturnRequired) throw new WarrantyClaimError('This claim does not need the failed part returned.');
  if (!['APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(claim.status)) throw new WarrantyClaimError('Send the failed part once the claim has been approved.');
  if (claim.partReturnStatus !== 'AWAITING') throw new WarrantyClaimError('The failed part has already been sent.');
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { partReturnStatus: 'SENT', partSentAt: new Date(), partSentReference: ref } });
  await audit(user.id, claimId, 'part_sent', { claimNumber: claim.claimNumber, reference: ref });
}

export async function recordFailedPartReceived(claimId: string): Promise<void> {
  const user = await requireStaff();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { claimNumber: true, partReturnStatus: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.partReturnStatus !== 'SENT') throw new WarrantyClaimError('Record the failed part as sent first.');
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { partReturnStatus: 'RECEIVED_BY_PROVIDER', partReceivedAt: new Date() } });
  await audit(user.id, claimId, 'part_received_by_provider', { claimNumber: claim.claimNumber });
}

// ── Non-money remedies ────────────────────────────────────────────────

/** Replacement remedy: the provider's replacement part has arrived —
 * closes the claim (its value = what the provider accepted). */
export async function recordReplacementReceived(claimId: string, replacementSerial: string, notes: string): Promise<void> {
  const user = await requireApprover();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, remedy: true, approvedAmount: true, partReturnRequired: true, partReturnStatus: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.remedy !== 'REPLACEMENT') throw new WarrantyClaimError('This claim is not settled by a replacement part.');
  if (claim.status !== 'ACCEPTED' && claim.status !== 'PARTIALLY_ACCEPTED') throw new WarrantyClaimError('Record the provider accepting the claim first.');
  assertPartSent(claim);
  await prisma.warrantyClaim.update({
    where: { id: claimId },
    data: { status: 'SETTLED', settledAmount: claim.approvedAmount, replacementSerial: replacementSerial.trim() || null, remedyNotes: notes.trim() || null, settledById: user.id, settledAt: new Date() },
  });
  await audit(user.id, claimId, 'replacement_received', { claimNumber: claim.claimNumber, replacementSerial: replacementSerial.trim() || undefined, notes: notes.trim() || undefined });
}

/** Repair remedy: the provider repaired the failed part and it is back —
 * closes the claim. */
export async function recordRepairedPartReturned(claimId: string, notes: string): Promise<void> {
  const user = await requireApprover();
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, remedy: true, approvedAmount: true, partReturnRequired: true, partReturnStatus: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.remedy !== 'REPAIR') throw new WarrantyClaimError('This claim is not settled by a repair.');
  if (claim.status !== 'ACCEPTED' && claim.status !== 'PARTIALLY_ACCEPTED') throw new WarrantyClaimError('Record the provider accepting the claim first.');
  assertPartSent(claim);
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: 'SETTLED', settledAmount: claim.approvedAmount, remedyNotes: notes.trim() || null, settledById: user.id, settledAt: new Date() } });
  await audit(user.id, claimId, 'repaired_part_returned', { claimNumber: claim.claimNumber, notes: notes.trim() || undefined });
}

/** A rejected claim can be corrected and sent again — counted. */
export async function reopenRejectedWarrantyClaim(claimId: string, reason: string): Promise<void> {
  const user = await requireStaff();
  const why = reason.trim();
  if (!why) throw new WarrantyClaimError('Say what will be corrected for the resubmission.');
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true, resubmissionCount: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (claim.status !== 'REJECTED') throw new WarrantyClaimError('Only a rejected claim can be reopened for resubmission.');
  await prisma.warrantyClaim.update({
    where: { id: claimId },
    data: { status: 'DRAFT', resubmissionCount: claim.resubmissionCount + 1, returnReason: why, providerReference: null, replacementSerial: null, remedyNotes: null, submittedById: null, submittedAt: null, decidedById: null, decidedAt: null, approvedAmount: null, hodApprovedById: null, hodApprovedAt: null, managerApprovedById: null, managerApprovedAt: null },
  });
  await audit(user.id, claimId, 'reopened', { claimNumber: claim.claimNumber, reason: why, resubmission: claim.resubmissionCount + 1 });
}

export async function cancelWarrantyClaim(claimId: string, reason: string): Promise<void> {
  const user = await requireStaff();
  const why = reason.trim();
  if (!why) throw new WarrantyClaimError('A reason is required to cancel a claim.');
  const claim = await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, claimNumber: true } });
  if (!claim) throw new WarrantyClaimError('Claim not found.');
  if (!['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT'].includes(claim.status)) {
    throw new WarrantyClaimError('A claim already with the provider (or decided) cannot be cancelled.');
  }
  await prisma.warrantyClaim.update({ where: { id: claimId }, data: { status: 'CANCELLED', cancelReason: why } });
  await audit(user.id, claimId, 'cancelled', { claimNumber: claim.claimNumber, reason: why });
}

// ── Queries ───────────────────────────────────────────────────────────

const CLAIM_LIST_INCLUDE = {
  warranty: { select: { id: true, warrantyNumber: true, subjectDescription: true } },
  provider: { select: { id: true, name: true } },
  customer: { select: { id: true, fullName: true } },
  vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true } },
  jobCard: { select: { id: true, jobNumber: true } },
  vehicleService: { select: { id: true, serviceNumber: true } },
  createdBy: { select: { fullName: true } },
} as const;

export async function listWarrantyClaims(options?: { q?: string; warrantyId?: string }) {
  await requireUser();
  const q = options?.q?.trim();
  return prisma.warrantyClaim.findMany({
    where: {
      ...(options?.warrantyId ? { warrantyId: options.warrantyId } : {}),
      ...(q
        ? {
            OR: [
              { claimNumber: { contains: q, mode: 'insensitive' } },
              { causalPart: { contains: q, mode: 'insensitive' } },
              { providerReference: { contains: q, mode: 'insensitive' } },
              { customer: { fullName: { contains: q, mode: 'insensitive' } } },
              { warranty: { warrantyNumber: { contains: q, mode: 'insensitive' } } },
              { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: CLAIM_LIST_INCLUDE,
  });
}

export async function getWarrantyClaim(claimId: string) {
  await requireUser();
  const claim = await prisma.warrantyClaim.findUnique({
    where: { id: claimId },
    include: {
      ...CLAIM_LIST_INCLUDE,
      warranty: {
        select: {
          id: true, warrantyNumber: true, subjectDescription: true, kind: true, status: true, startsAt: true, endsAt: true, startReading: true, distanceLimit: true,
          coverageSnapshot: true, exclusionsSnapshot: true, conditionsSnapshot: true, partSerial: { select: { serialNumber: true } },
          policy: { select: { id: true, code: true, name: true, isSample: true, coversParts: true, coversLabour: true, defaultRemedy: true } },
        },
      },
      provider: { select: { id: true, name: true, type: true, contactName: true, email: true, phone: true, claimSubmissionDays: true, partRetentionDays: true } },
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      vehicle: { select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, engineNumber: true, mileage: true } },
      hodApprovedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      submittedBy: { select: { fullName: true } },
      decidedBy: { select: { fullName: true } },
      settledBy: { select: { fullName: true } },
    },
  });
  if (!claim) return null;
  // The vehicle's full service & repair history — the evidence that the
  // maintenance conditions were kept, which providers check first.
  const history = claim.vehicleId
    ? await Promise.all([
        prisma.vehicleService.findMany({ where: { vehicleId: claim.vehicleId, status: { in: ['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'COLLECTED'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, serviceNumber: true, completedAt: true, createdAt: true, odometerAtService: true, status: true } }),
        prisma.jobCard.findMany({ where: { vehicleId: claim.vehicleId }, orderBy: { createdAt: 'asc' }, select: { id: true, jobNumber: true, createdAt: true, mileageAtCheckIn: true, status: true } }),
      ])
    : [[], []];
  const readiness = claimReadiness(
    { ...claim, labourAmount: Number(claim.labourAmount), partsAmount: Number(claim.partsAmount), otherAmount: Number(claim.otherAmount) },
    { status: claim.warranty.status, startsAt: claim.warranty.startsAt, endsAt: claim.warranty.endsAt, startReading: claim.warranty.startReading, distanceLimit: claim.warranty.distanceLimit, isSamplePolicy: claim.warranty.policy.isSample, coversParts: claim.warranty.policy.coversParts, coversLabour: claim.warranty.policy.coversLabour },
  );
  return { ...claim, serviceHistory: history[0], repairHistory: history[1], readiness };
}

export async function getWarrantyClaimAuditTrail(claimId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'WarrantyClaim', entityId: claimId }, orderBy: { createdAt: 'asc' }, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null }));
}

/** Claims waiting on this viewer (for the dashboard) — at their step in
 * the chain, approved and ready to submit, or close to the deadline. */
export async function getWarrantyClaimDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const roles = await getWarrantyRoles();
  if (!roles.isStaff) return [];
  const user = await requireUser();
  const soon = new Date(Date.now() + 5 * 86400000);
  const claims = await prisma.warrantyClaim.findMany({
    where: {
      OR: [
        ...(roles.isHod || roles.isMaster ? [{ status: 'PENDING_HOD' as const }] : []),
        ...(roles.isManager || roles.isMaster ? [{ status: 'PENDING_MANAGER' as const }] : []),
        { status: 'APPROVED_TO_SUBMIT' as const },
        { status: { in: ['DRAFT' as const, 'PENDING_HOD' as const, 'PENDING_MANAGER' as const, 'APPROVED_TO_SUBMIT' as const] }, deadlineAt: { lte: soon } },
      ],
      ...(roles.isMaster ? {} : { NOT: { AND: [{ createdById: user.id }, { status: { in: ['PENDING_HOD' as const, 'PENDING_MANAGER' as const] } }] } }),
    },
    orderBy: { updatedAt: 'desc' },
    take: 15,
    select: { id: true, claimNumber: true, status: true, causalPart: true, deadlineAt: true, updatedAt: true },
  });
  return claims.map((c: (typeof claims)[number]) => ({
    id: `warranty-claim-${c.id}`,
    title:
      c.status === 'APPROVED_TO_SUBMIT'
        ? `Submit claim ${c.claimNumber} to the provider`
        : c.status === 'DRAFT'
          ? `Claim ${c.claimNumber} — deadline close`
          : `Approve warranty claim ${c.claimNumber}`,
    detail: `${c.causalPart}${c.deadlineAt ? ` · deadline ${new Date(c.deadlineAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}` : ''}`,
    url: `/warranty/claims/${c.id}`,
    createdAt: c.updatedAt,
  }));
}
