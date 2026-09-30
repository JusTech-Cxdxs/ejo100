'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopBranchId, getWorkshopOrgContext, listEligibleManagersForBranch } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { visitOverdueMinutes, exitPassOverdueMinutes, durationText } from '@/lib/security-rules';
import { customerTotal } from '@/lib/estimate-billing';

class SecurityError extends Error {}

const HEAD_SLUGS = ['department-head', 'workshop-manager', 'store-manager', 'warranty-hod'];

type Person = { id: string; fullName: string; email: string };

// ── Roles ─────────────────────────────────────────────────────────────

async function slugsOf(userId: string): Promise<{ slugs: string[]; isMaster: boolean }> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  return { slugs: rows.map((r: { role: { slug: string } }) => r.role.slug), isMaster: rows.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin) };
}

export type SecurityRoles = { userId: string; isMaster: boolean; isCso: boolean; isOfficer: boolean; isReceptionist: boolean; isManager: boolean; isGate: boolean; isFrontDesk: boolean };

/** The viewer's place at the gate: security (CSO / officer) run the gate;
 * reception can also register and check visitors in; HR approves passes. */
export async function getSecurityRoles(): Promise<SecurityRoles> {
  const user = await requireUser();
  const { slugs, isMaster } = await slugsOf(user.id);
  const isCso = slugs.includes('chief-security-officer');
  const isOfficer = slugs.includes('security-officer');
  const isReceptionist = slugs.includes('receptionist');
  const isGate = isMaster || isCso || isOfficer;
  const isManager = (await managerApprovers(null)).some((m) => m.id === user.id);
  return { userId: user.id, isMaster, isCso, isOfficer, isReceptionist, isManager, isGate, isFrontDesk: isGate || isReceptionist };
}

async function requireGate(): Promise<SecurityRoles> {
  const r = await getSecurityRoles();
  if (!r.isGate) throw new SecurityError('Only Security can do this at the gate.');
  return r;
}
async function requireFrontDesk(): Promise<SecurityRoles> {
  const r = await getSecurityRoles();
  if (!r.isFrontDesk) throw new SecurityError('Only Security or Reception can do this.');
  return r;
}

async function usersWithSlugs(slugList: string[], where: Record<string, unknown> = {}): Promise<Person[]> {
  return prisma.user.findMany({
    where: { isActive: true, ...where, roles: { some: { role: { slug: { in: slugList } } } } },
    select: { id: true, fullName: true, email: true },
  });
}
async function masterAdmins(): Promise<Person[]> {
  return prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { isSuperAdmin: true } } } }, select: { id: true, fullName: true, email: true } });
}
async function gateStaff(): Promise<Person[]> {
  return usersWithSlugs(['chief-security-officer', 'security-officer']);
}

// ── Numbering & logged emails ─────────────────────────────────────────

async function nextNumber(prefix: 'VIS' | 'VP' | 'EP' | 'VX'): Promise<string> {
  const year = new Date().getFullYear();
  const start = `${prefix}-${year}-`;
  const latest =
    prefix === 'VIS'
      ? await prisma.visit.findFirst({ where: { visitNumber: { startsWith: start } }, orderBy: { visitNumber: 'desc' }, select: { visitNumber: true } }).then((r: { visitNumber: string } | null) => r?.visitNumber)
      : prefix === 'VP'
        ? await prisma.visit.findFirst({ where: { passNumber: { startsWith: start } }, orderBy: { passNumber: 'desc' }, select: { passNumber: true } }).then((r: { passNumber: string | null } | null) => r?.passNumber ?? undefined)
        : prefix === 'EP'
          ? await prisma.exitPass.findFirst({ where: { passNumber: { startsWith: start } }, orderBy: { passNumber: 'desc' }, select: { passNumber: true } }).then((r: { passNumber: string } | null) => r?.passNumber)
          : await prisma.vehicleGateExit.findFirst({ where: { exitNumber: { startsWith: start } }, orderBy: { exitNumber: 'desc' }, select: { exitNumber: true } }).then((r: { exitNumber: string } | null) => r?.exitNumber);
  const n = latest ? parseInt(latest.slice(start.length), 10) + 1 : 1;
  return `${start}${String(n).padStart(6, '0')}`;
}

/** Sends one email and ALWAYS records it — recipient, subject, success or
 * the error — in the Security email log and the record's audit trail. */
async function sendLogged(entityType: string, entityId: string, recipients: Person[], subject: string, heading: string, lines: string[], path: string, actorId: string | null) {
  const unique = recipients.filter((r, i, a) => r.email && a.findIndex((x) => x.email === r.email) === i);
  if (unique.length === 0) return;
  const org = await getWorkshopOrgContext().catch(() => ({ companyName: 'EJO 100', branchName: '', departmentName: '' }));
  const portal = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  for (const r of unique) {
    let sent = true;
    let error: string | null = null;
    try {
      await sendEmail(r.email, subject, renderWarrantyStaffNoticeEmail({ recipientName: r.fullName, heading, lines, actionUrl: `${portal}${path}`, logoUrl: `${portal}/images/logo/logo.png`, companyName: org.companyName, branchName: org.branchName }));
    } catch (err) {
      sent = false;
      error = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    }
    await prisma.securityEmailLog.create({ data: { entityType, entityId, recipient: `${r.fullName} <${r.email}>`, subject, sent, error } });
    await writeAuditLog({ userId: actorId, action: sent ? 'security.email_sent' : 'security.email_failed', entityType, entityId, metadata: { to: r.fullName, subject, ...(error ? { error } : {}) } });
  }
}

// ── Visitors ──────────────────────────────────────────────────────────
//
// Security records the visitor AT THE GATE (they are then on the premises
// and get a pass); Reception RECEIVES them and tells the host. Reception
// or Security can extend a stay; Security checks them out.

const VEHICLE_TYPES = ['ON_FOOT', 'CAR', 'MOTORCYCLE', 'TRUCK', 'BUS', 'OTHER'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export type VisitInput = {
  visitorName: string;
  company?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
  vehicleType: string;
  vehiclePlate?: string;
  purpose: string;
  hostUserId: string;
  expectedAt?: Date;
  expectedDurationMinutes: number;
  notes?: string;
};

function cleanVisit(i: VisitInput) {
  if (!i.visitorName.trim()) throw new SecurityError("Enter the visitor's name.");
  if (!i.purpose.trim()) throw new SecurityError('Enter the purpose of the visit.');
  if (!i.hostUserId) throw new SecurityError('Choose who they are visiting.');
  if (!VEHICLE_TYPES.includes(i.vehicleType as VehicleType)) throw new SecurityError('Choose how the visitor came — on foot or by which vehicle.');
  const plate = i.vehiclePlate?.trim().toUpperCase() || null;
  if (i.vehicleType !== 'ON_FOOT' && !plate) throw new SecurityError('Enter the plate number of the vehicle they came with.');
  if (!Number.isInteger(i.expectedDurationMinutes) || i.expectedDurationMinutes < 5 || i.expectedDurationMinutes > 24 * 60) {
    throw new SecurityError('Expected stay must be between 5 minutes and 24 hours.');
  }
  if (i.expectedAt && Number.isNaN(new Date(i.expectedAt).getTime())) throw new SecurityError('Enter a valid expected arrival time.');
  const t = (v?: string) => v?.trim() || null;
  return {
    visitorName: i.visitorName.trim(), company: t(i.company), phone: t(i.phone), idType: t(i.idType), idNumber: t(i.idNumber),
    vehicleType: i.vehicleType, vehiclePlate: i.vehicleType === 'ON_FOOT' ? null : plate, purpose: i.purpose.trim(), hostUserId: i.hostUserId,
    expectedAt: i.expectedAt ?? null, expectedDurationMinutes: i.expectedDurationMinutes, notes: t(i.notes),
  };
}

async function activeHost(id: string) {
  const host = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, email: true, isActive: true } });
  if (!host?.isActive) throw new SecurityError('That host is not an active member of staff.');
  return host;
}

/** Pre-register a visitor. Anyone can register their own visitor (they are
 * the host); Security / Reception can register one for anybody. */
export async function preRegisterVisit(input: VisitInput): Promise<{ id: string; visitNumber: string }> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const data = cleanVisit(input);
  if (data.hostUserId !== user.id && !roles.isFrontDesk) throw new SecurityError('You can only pre-register your own visitors.');
  if (!data.expectedAt) throw new SecurityError('Enter when the visitor is expected.');
  await activeHost(data.hostUserId);
  const visitNumber = await nextNumber('VIS');
  const visit = await prisma.visit.create({ data: { ...data, visitNumber, status: 'EXPECTED', branchId: await getWorkshopBranchId(), registeredById: user.id } });
  await writeAuditLog({ userId: user.id, action: 'visit.pre_registered', entityType: 'Visit', entityId: visit.id, metadata: { visitNumber, visitor: data.visitorName, expectedAt: data.expectedAt } });
  return { id: visit.id, visitNumber };
}

/** A visitor arriving at the gate without being pre-registered: Security
 * records them and they are on the premises with a pass straight away. */
export async function recordArrival(input: VisitInput): Promise<{ id: string; visitNumber: string; passNumber: string }> {
  const r = await requireGate();
  const data = cleanVisit(input);
  await activeHost(data.hostUserId);
  const [visitNumber, passNumber] = [await nextNumber('VIS'), await nextNumber('VP')];
  const visit = await prisma.visit.create({
    data: { ...data, expectedAt: null, visitNumber, passNumber, status: 'CHECKED_IN', isWalkIn: true, checkedInAt: new Date(), checkedInById: r.userId, branchId: await getWorkshopBranchId(), registeredById: r.userId },
  });
  await writeAuditLog({ userId: r.userId, action: 'visit.arrived', entityType: 'Visit', entityId: visit.id, metadata: { visitNumber, passNumber, visitor: data.visitorName, vehicle: data.vehiclePlate ?? 'On foot' } });
  return { id: visit.id, visitNumber, passNumber };
}

/** An expected visitor arrives: Security confirms how they came and issues
 * the pass. */
export async function checkInVisit(visitId: string, vehicleType?: string, vehiclePlate?: string): Promise<{ passNumber: string }> {
  const r = await requireGate();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true, vehicleType: true, vehiclePlate: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (v.status !== 'EXPECTED') throw new SecurityError('Only an expected visitor can be checked in.');
  const type = vehicleType && VEHICLE_TYPES.includes(vehicleType as VehicleType) ? vehicleType : v.vehicleType;
  const plate = type === 'ON_FOOT' ? null : (vehiclePlate?.trim().toUpperCase() || v.vehiclePlate);
  if (type !== 'ON_FOOT' && !plate) throw new SecurityError('Enter the plate number of the vehicle they came with.');
  const passNumber = await nextNumber('VP');
  await prisma.visit.update({ where: { id: visitId }, data: { status: 'CHECKED_IN', passNumber, checkedInAt: new Date(), checkedInById: r.userId, vehicleType: type, vehiclePlate: plate } });
  await writeAuditLog({ userId: r.userId, action: 'visit.checked_in', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, passNumber, vehicle: plate ?? 'On foot' } });
  return { passNumber };
}

/** Reception receives the visitor and tells the host (email + dashboard). */
export async function receiveVisit(visitId: string): Promise<void> {
  const r = await requireFrontDesk();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, receivedAt: true, visitNumber: true, visitorName: true, company: true, purpose: true, passNumber: true, host: { select: { id: true, fullName: true, email: true } } } });
  if (!v) throw new SecurityError('Visit not found.');
  if (v.status !== 'CHECKED_IN') throw new SecurityError('The visitor must be checked in at the gate first.');
  if (v.receivedAt) throw new SecurityError('This visitor has already been received at reception.');
  await prisma.visit.update({ where: { id: visitId }, data: { receivedAt: new Date(), receivedById: r.userId } });
  await writeAuditLog({ userId: r.userId, action: 'visit.received', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber } });
  await sendLogged('Visit', visitId, [v.host], `Your visitor is at reception — ${v.visitorName}`, 'Your visitor is at reception', [`${v.visitorName}${v.company ? ` (${v.company})` : ''}`, `Purpose: ${v.purpose}`, `Visitor pass: ${v.passNumber ?? ''}`], `/security/visitors/${visitId}`, r.userId);
}

/** Give a visitor more time (e.g. the person they are seeing is busy).
 * Reception or Security, with a reason; the overdue alert re-arms. */
export async function extendVisit(visitId: string, extraMinutes: number, reason: string): Promise<void> {
  const r = await requireFrontDesk();
  if (!Number.isInteger(extraMinutes) || extraMinutes < 5 || extraMinutes > 12 * 60) throw new SecurityError('Choose how much more time — between 5 minutes and 12 hours.');
  if (!reason.trim()) throw new SecurityError('Give the reason for the extra time.');
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true, expectedDurationMinutes: true, extendedMinutes: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (v.status !== 'CHECKED_IN') throw new SecurityError('Only a visitor on the premises can be given more time.');
  await prisma.visit.update({ where: { id: visitId }, data: { expectedDurationMinutes: v.expectedDurationMinutes + extraMinutes, extendedMinutes: v.extendedMinutes + extraMinutes, overdueNotifiedAt: null } });
  await writeAuditLog({ userId: r.userId, action: 'visit.extended', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, extra: durationText(extraMinutes), newStay: durationText(v.expectedDurationMinutes + extraMinutes), reason: reason.trim() } });
}

export async function checkOutVisit(visitId: string): Promise<void> {
  const r = await requireGate();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true, passNumber: true, checkedInAt: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (v.status !== 'CHECKED_IN') throw new SecurityError('Only a visitor on the premises can be checked out.');
  const out = new Date();
  await prisma.visit.update({ where: { id: visitId }, data: { status: 'CHECKED_OUT', checkedOutAt: out, checkedOutById: r.userId } });
  await writeAuditLog({ userId: r.userId, action: 'visit.checked_out', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, passNumber: v.passNumber, duration: v.checkedInAt ? durationText((out.getTime() - new Date(v.checkedInAt).getTime()) / 60000) : undefined } });
}

export async function cancelVisit(visitId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true, hostUserId: true, registeredById: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (!roles.isFrontDesk && v.hostUserId !== user.id && v.registeredById !== user.id) throw new SecurityError('Only the host, whoever registered it, Reception or Security can cancel.');
  if (v.status !== 'EXPECTED') throw new SecurityError('Only a visit that has not started can be cancelled.');
  if (!reason.trim()) throw new SecurityError('Give a reason for cancelling.');
  await prisma.visit.update({ where: { id: visitId }, data: { status: 'CANCELLED', notes: reason.trim() } });
  await writeAuditLog({ userId: user.id, action: 'visit.cancelled', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, reason: reason.trim() } });
}

// ── Employee Exit Pass ────────────────────────────────────────────────

export type ExitPassInput = {
  reason: string;
  returning: boolean;
  expectedOutAt?: Date;
  expectedReturnAt?: Date;
  employeeIds: string[];
  others: { name: string; designation?: string }[];
};

/** Who authorises as Department Head for this requester: their reporting
 * manager if set; else heads/managers in their department; else a quiet
 * fallback so a pass can never be stuck. Never the requester. */
async function headApproversFor(requesterId: string): Promise<Person[]> {
  const me = await prisma.user.findUnique({ where: { id: requesterId }, select: { departmentId: true, employeeProfile: { select: { reportingManagerId: true } } } });
  const managerId = me?.employeeProfile?.reportingManagerId;
  if (managerId && managerId !== requesterId) {
    const m = await prisma.user.findUnique({ where: { id: managerId }, select: { id: true, fullName: true, email: true, isActive: true } });
    if (m?.isActive) return [{ id: m.id, fullName: m.fullName, email: m.email }];
  }
  if (me?.departmentId) {
    const heads = (await usersWithSlugs(HEAD_SLUGS, { departmentId: me.departmentId })).filter((h) => h.id !== requesterId);
    if (heads.length) return heads;
  }
  const any = (await usersWithSlugs(['department-head'])).filter((h) => h.id !== requesterId);
  return any.length ? any : (await masterAdmins()).filter((h) => h.id !== requesterId);
}
/** The Manager step — the branch's managers (the same people Warranty
 * uses as Branch Manager); a quiet fallback so a pass is never stuck. */
async function managerApprovers(excludeId: string | null): Promise<Person[]> {
  const m = await listEligibleManagersForBranch(await getWorkshopBranchId());
  const list = (m.usingFallback ? await masterAdmins() : (m.supervisors as Person[])).filter((x) => x.id !== excludeId);
  return list.length ? list : (await masterAdmins()).filter((x) => x.id !== excludeId);
}

/** Request a pass for yourself and/or others — several employees and named
 * non-staff (e.g. an intern) can leave on one pass. */
export async function createExitPass(input: ExitPassInput): Promise<{ id: string; passNumber: string }> {
  const user = await requireUser();
  const reason = input.reason.trim();
  if (!reason) throw new SecurityError('Enter the reason for going out.');
  const ids = [...new Set(input.employeeIds.filter(Boolean))];
  const others = input.others.map((o) => ({ name: o.name.trim(), designation: o.designation?.trim() || null })).filter((o) => o.name);
  if (ids.length + others.length === 0) throw new SecurityError('Add at least one person going out.');
  const out = input.expectedOutAt ? new Date(input.expectedOutAt) : null;
  const back = input.expectedReturnAt ? new Date(input.expectedReturnAt) : null;
  if (input.returning) {
    if (!back || Number.isNaN(back.getTime())) throw new SecurityError('Enter the expected time of return.');
    if (out && back.getTime() <= out.getTime()) throw new SecurityError('The return time must be after the time out.');
  }
  const employees = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, fullName: true, employeeId: true, department: { select: { name: true } }, employeeProfile: { select: { jobTitle: true } } } })
    : [];
  if (employees.length !== ids.length) throw new SecurityError('One of the employees chosen is not an active member of staff.');
  const passNumber = await nextNumber('EP');
  // A requester who is themselves a Department Head has already authorised.
  const { slugs } = await slugsOf(user.id);
  const requesterIsHead = HEAD_SLUGS.some((sl) => slugs.includes(sl));
  const now = new Date();
  const pass = await prisma.exitPass.create({
    data: {
      passNumber, branchId: await getWorkshopBranchId(), requestedById: user.id, reason, returning: input.returning,
      expectedOutAt: out, expectedReturnAt: input.returning ? back : null,
      status: requesterIsHead ? 'PENDING_MANAGER' : 'PENDING_HEAD',
      ...(requesterIsHead ? { headApprovedById: user.id, headApprovedAt: now } : {}),
      people: {
        create: [
          ...employees.map((e: (typeof employees)[number]) => ({ userId: e.id, name: e.fullName, employeeId: e.employeeId, designation: e.employeeProfile?.jobTitle ?? null, department: e.department?.name ?? null })),
          ...others.map((o) => ({ name: o.name, designation: o.designation })),
        ],
      },
    },
  });
  const names = [...employees.map((e: (typeof employees)[number]) => e.fullName), ...others.map((o) => o.name)];
  await writeAuditLog({ userId: user.id, action: 'exit_pass.requested', entityType: 'ExitPass', entityId: pass.id, metadata: { passNumber, people: names, returning: input.returning, reason } });
  const approvers = requesterIsHead ? await managerApprovers(user.id) : await headApproversFor(user.id);
  await sendLogged('ExitPass', pass.id, approvers, `Exit pass ${passNumber} needs your ${requesterIsHead ? 'approval' : 'authorisation'}`, 'An exit pass needs your decision', [`${passNumber} — ${names.join(', ')}`, `Reason: ${reason}`, input.returning && back ? `Expected back: ${back.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}` : 'Not returning today'], `/security/exit-passes/${pass.id}`, user.id);
  return { id: pass.id, passNumber };
}

export async function decideExitPass(passId: string, approve: boolean, reason: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, passNumber: true, requestedById: true, reason: true, requestedBy: { select: { id: true, fullName: true, email: true } } } });
  if (!p) throw new SecurityError('Exit pass not found.');
  if (p.requestedById === user.id && !roles.isMaster) throw new SecurityError('You cannot approve your own exit pass.');
  if (p.status === 'PENDING_HEAD') {
    const heads = await headApproversFor(p.requestedById);
    if (!heads.some((h) => h.id === user.id) && !roles.isMaster) throw new SecurityError('This pass is waiting for the Department Head.');
  } else if (p.status === 'PENDING_MANAGER') {
    if (!roles.isMaster && !(await managerApprovers(p.requestedById)).some((h) => h.id === user.id)) throw new SecurityError('This pass is waiting for the Manager.');
  } else {
    throw new SecurityError('This pass is not waiting for a decision.');
  }
  if (!approve && !reason.trim()) throw new SecurityError('Give a reason for declining.');
  const now = new Date();
  const atHead = p.status === 'PENDING_HEAD';
  if (!approve) {
    await prisma.exitPass.update({ where: { id: passId }, data: { status: 'DECLINED', declinedById: user.id, declinedAt: now, declineReason: reason.trim() } });
    await writeAuditLog({ userId: user.id, action: 'exit_pass.declined', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber, step: atHead ? 'Department Head' : 'Manager', reason: reason.trim() } });
    await sendLogged('ExitPass', passId, [p.requestedBy], `Exit pass ${p.passNumber} declined`, 'Your exit pass was declined', [p.passNumber, `Reason: ${reason.trim()}`], `/security/exit-passes/${passId}`, user.id);
    return;
  }
  const managers = await managerApprovers(p.requestedById);
  // A Department Head who is also a Manager approves both steps at once.
  const alsoManager = atHead && managers.some((m) => m.id === user.id);
  if (atHead && !alsoManager) {
    await prisma.exitPass.update({ where: { id: passId }, data: { status: 'PENDING_MANAGER', headApprovedById: user.id, headApprovedAt: now } });
    await writeAuditLog({ userId: user.id, action: 'exit_pass.head_authorised', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber } });
    await sendLogged('ExitPass', passId, managers, `Exit pass ${p.passNumber} needs your approval`, 'An exit pass needs the Manager\'s approval', [p.passNumber, `Reason: ${p.reason}`, 'Authorised by the Department Head.'], `/security/exit-passes/${passId}`, user.id);
    return;
  }
  await prisma.exitPass.update({ where: { id: passId }, data: { status: 'APPROVED', managerApprovedById: user.id, managerApprovedAt: now, ...(alsoManager ? { headApprovedById: user.id, headApprovedAt: now } : {}) } });
  if (alsoManager) await writeAuditLog({ userId: user.id, action: 'exit_pass.head_authorised', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber } });
  await writeAuditLog({ userId: user.id, action: 'exit_pass.manager_approved', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber } });
  await sendLogged('ExitPass', passId, [p.requestedBy, ...(await gateStaff())], `Exit pass ${p.passNumber} approved`, 'Exit pass approved', [p.passNumber, 'Approved — Security will record the time out at the gate.'], `/security/exit-passes/${passId}`, user.id);
}

export async function cancelExitPass(passId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, passNumber: true, requestedById: true } });
  if (!p) throw new SecurityError('Exit pass not found.');
  if (p.requestedById !== user.id) throw new SecurityError('Only the person who requested it can cancel it.');
  if (!['PENDING_HEAD', 'PENDING_MANAGER', 'APPROVED'].includes(p.status)) throw new SecurityError('A pass already used at the gate cannot be cancelled.');
  if (!reason.trim()) throw new SecurityError('Give a reason for cancelling.');
  await prisma.exitPass.update({ where: { id: passId }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
  await writeAuditLog({ userId: user.id, action: 'exit_pass.cancelled', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber, reason: reason.trim() } });
}

/** Time out at the gate — only on an approved pass. A no-return pass
 * closes as they leave. */
export async function exitPassGateOut(passId: string): Promise<void> {
  const r = await requireGate();
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, passNumber: true, returning: true } });
  if (!p) throw new SecurityError('Exit pass not found.');
  if (p.status !== 'APPROVED') throw new SecurityError('Only an approved exit pass can be used to leave — Security will not permit exit without approval.');
  await prisma.exitPass.update({ where: { id: passId }, data: { status: p.returning ? 'OUT' : 'CLOSED', gateOutAt: new Date(), gateOutById: r.userId } });
  await writeAuditLog({ userId: r.userId, action: 'exit_pass.gate_out', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber, returning: p.returning } });
}

export async function exitPassGateIn(passId: string): Promise<void> {
  const r = await requireGate();
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, passNumber: true, gateOutAt: true, expectedReturnAt: true } });
  if (!p) throw new SecurityError('Exit pass not found.');
  if (p.status !== 'OUT') throw new SecurityError('Only someone who went out on a returning pass can be recorded back in.');
  const now = new Date();
  await prisma.exitPass.update({ where: { id: passId }, data: { status: 'RETURNED', gateInAt: now, gateInById: r.userId } });
  const late = p.expectedReturnAt && now.getTime() > new Date(p.expectedReturnAt).getTime() ? durationText((now.getTime() - new Date(p.expectedReturnAt).getTime()) / 60000) : null;
  await writeAuditLog({ userId: r.userId, action: 'exit_pass.gate_in', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber, away: p.gateOutAt ? durationText((now.getTime() - new Date(p.gateOutAt).getTime()) / 60000) : undefined, late: late ?? undefined } });
}

// ── Vehicles cleared to leave (from the Workshop) ─────────────────────

/** Vehicles the Workshop has released (Job Card checked out, Vehicle
 * Service collected / handed back) that security has not yet seen out. */
export async function listVehiclesClearedToLeave() {
  await requireUser();
  const since = new Date(Date.now() - 30 * 86400000);
  const [jcs, vss] = await Promise.all([
    prisma.jobCard.findMany({
      where: { status: 'CHECKED_OUT', checkedOutAt: { gte: since }, gateExit: null },
      orderBy: { checkedOutAt: 'desc' },
      select: { id: true, jobNumber: true, checkedOutAt: true, collectedByName: true, vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true } }, customer: { select: { fullName: true } } },
    }),
    prisma.vehicleService.findMany({
      where: { collectedAt: { gte: since }, status: { in: ['COLLECTED', 'CANCELLED'] }, escalatedToJobCardId: null, gateExit: null },
      orderBy: { collectedAt: 'desc' },
      select: { id: true, serviceNumber: true, collectedAt: true, collectedByName: true, status: true, vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true } }, customer: { select: { fullName: true } } },
    }),
  ]);
  return [
    ...jcs.map((j: (typeof jcs)[number]) => ({ kind: 'JOB_CARD' as const, id: j.id, number: j.jobNumber, releasedAt: j.checkedOutAt, collectedBy: j.collectedByName, vehicle: j.vehicle, customer: j.customer.fullName, cancelled: false })),
    ...vss.map((v: (typeof vss)[number]) => ({ kind: 'VEHICLE_SERVICE' as const, id: v.id, number: v.serviceNumber, releasedAt: v.collectedAt, collectedBy: v.collectedByName, vehicle: v.vehicle, customer: v.customer.fullName, cancelled: v.status === 'CANCELLED' })),
  ].sort((a, b) => (b.releasedAt?.getTime() ?? 0) - (a.releasedAt?.getTime() ?? 0));
}

export async function confirmVehicleExit(kind: 'JOB_CARD' | 'VEHICLE_SERVICE', recordId: string, collectedBy: string, notes: string): Promise<{ id: string; exitNumber: string }> {
  const r = await requireGate();
  const rec =
    kind === 'JOB_CARD'
      ? await prisma.jobCard.findUnique({ where: { id: recordId }, select: { status: true, vehicleId: true, jobNumber: true, gateExit: { select: { id: true } } } }).then((j: { status: string; vehicleId: string; jobNumber: string; gateExit: { id: string } | null } | null) => j && { released: j.status === 'CHECKED_OUT', vehicleId: j.vehicleId, number: j.jobNumber, done: Boolean(j.gateExit) })
      : await prisma.vehicleService.findUnique({ where: { id: recordId }, select: { status: true, collectedAt: true, vehicleId: true, serviceNumber: true, gateExit: { select: { id: true } } } }).then((v: { status: string; collectedAt: Date | null; vehicleId: string; serviceNumber: string; gateExit: { id: string } | null } | null) => v && { released: Boolean(v.collectedAt) && ['COLLECTED', 'CANCELLED'].includes(v.status), vehicleId: v.vehicleId, number: v.serviceNumber, done: Boolean(v.gateExit) });
  if (!rec) throw new SecurityError('Record not found.');
  if (!rec.released) throw new SecurityError('This vehicle has not been released by the Workshop — it may not leave.');
  if (rec.done) throw new SecurityError('This vehicle has already been recorded leaving.');
  const exitNumber = await nextNumber('VX');
  const row = await prisma.vehicleGateExit.create({
    data: { exitNumber, branchId: await getWorkshopBranchId(), vehicleId: rec.vehicleId, exitedById: r.userId, driverName: collectedBy.trim() || null, notes: notes.trim() || null, ...(kind === 'JOB_CARD' ? { jobCardId: recordId } : { vehicleServiceId: recordId }) },
  });
  const meta = { exitNumber, number: rec.number, collectedBy: collectedBy.trim() || undefined };
  await writeAuditLog({ userId: r.userId, action: 'vehicle.gate_exit', entityType: 'VehicleGateExit', entityId: row.id, metadata: meta });
  await writeAuditLog({ userId: r.userId, action: 'vehicle.gate_exit', entityType: kind === 'JOB_CARD' ? 'JobCard' : 'VehicleService', entityId: recordId, metadata: meta });
  await writeAuditLog({ userId: r.userId, action: 'vehicle.gate_exit', entityType: 'CustomerVehicle', entityId: rec.vehicleId, metadata: { exitNumber, number: rec.number } });
  return { id: row.id, exitNumber: row.exitNumber };
}

// ── Dashboard ─────────────────────────────────────────────────────────

export async function getSecurityDashboard() {
  await requireUser();
  const startOfDay = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) + 'T00:00:00+01:00');
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const visitSelect = { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, company: true, purpose: true, vehicleType: true, vehiclePlate: true, expectedAt: true, expectedDurationMinutes: true, checkedInAt: true, receivedAt: true, isWalkIn: true, host: { select: { fullName: true } } } as const;
  const passSelect = { id: true, passNumber: true, status: true, reason: true, returning: true, expectedOutAt: true, expectedReturnAt: true, gateOutAt: true, people: { select: { name: true } } } as const;
  const [onPremises, expectedToday, passesReady, passesOut, vehicles, jobCardsIn, servicesIn] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN' }, orderBy: { checkedInAt: 'asc' }, select: visitSelect }),
    prisma.visit.findMany({ where: { status: 'EXPECTED', expectedAt: { gte: startOfDay, lt: endOfDay } }, orderBy: { expectedAt: 'asc' }, select: visitSelect }),
    prisma.exitPass.findMany({ where: { status: 'APPROVED' }, orderBy: { managerApprovedAt: 'asc' }, select: passSelect }),
    prisma.exitPass.findMany({ where: { status: 'OUT' }, orderBy: { expectedReturnAt: 'asc' }, select: passSelect }),
    listVehiclesClearedToLeave(),
    // Workshop vehicles physically inside: work not yet released.
    prisma.jobCard.count({ where: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } } }),
    prisma.vehicleService.count({ where: { status: { in: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'] } } }),
  ]);
  const visitorVehicles = onPremises.filter((v: (typeof onPremises)[number]) => v.vehicleType !== 'ON_FOOT').length;
  const peopleOut = passesOut.reduce((s: number, p: (typeof passesOut)[number]) => s + p.people.length, 0);
  return {
    onPremises,
    atGateNotReceived: onPremises.filter((v: (typeof onPremises)[number]) => !v.receivedAt),
    expectedToday,
    passesReady,
    passesOut,
    vehicles,
    compound: {
      visitors: onPremises.length,
      peopleOut,
      visitorVehicles,
      workshopVehicles: jobCardsIn + servicesIn,
      awaitingExit: vehicles.length,
      vehiclesInside: visitorVehicles + jobCardsIn + servicesIn + vehicles.length,
    },
  };
}

// ── Queries ───────────────────────────────────────────────────────────

export async function listVisits(q?: string) {
  await requireUser();
  const t = q?.trim();
  return prisma.visit.findMany({
    where: t ? { OR: [{ visitNumber: { contains: t, mode: 'insensitive' } }, { passNumber: { contains: t, mode: 'insensitive' } }, { visitorName: { contains: t, mode: 'insensitive' } }, { company: { contains: t, mode: 'insensitive' } }, { vehiclePlate: { contains: t, mode: 'insensitive' } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, company: true, purpose: true, vehicleType: true, vehiclePlate: true, expectedAt: true, expectedDurationMinutes: true, checkedInAt: true, checkedOutAt: true, receivedAt: true, isWalkIn: true, host: { select: { fullName: true } } },
  });
}

export async function getVisit(id: string) {
  await requireUser();
  return prisma.visit.findUnique({
    where: { id },
    include: { host: { select: { id: true, fullName: true } }, registeredBy: { select: { fullName: true } }, checkedInBy: { select: { fullName: true } }, checkedOutBy: { select: { fullName: true } }, receivedBy: { select: { fullName: true } }, branch: true },
  });
}

export async function listExitPasses(scope: 'mine' | 'to_decide' | 'all', q?: string) {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const t = q?.trim();
  const rows = await prisma.exitPass.findMany({
    where: {
      ...(scope === 'mine' ? { OR: [{ requestedById: user.id }, { people: { some: { userId: user.id } } }] } : {}),
      ...(scope === 'to_decide' ? { status: { in: ['PENDING_HEAD', 'PENDING_MANAGER'] }, NOT: { requestedById: user.id } } : {}),
      ...(t ? { OR: [{ passNumber: { contains: t, mode: 'insensitive' } }, { reason: { contains: t, mode: 'insensitive' } }, { people: { some: { name: { contains: t, mode: 'insensitive' } } } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, passNumber: true, status: true, reason: true, returning: true, expectedOutAt: true, expectedReturnAt: true, gateOutAt: true, gateInAt: true, requestedById: true, createdAt: true, requestedBy: { select: { fullName: true } }, people: { select: { name: true } } },
  });
  if (scope !== 'to_decide') return rows;
  // Only the passes waiting at THIS viewer's step.
  const out: typeof rows = [];
  for (const p of rows) {
    if (p.status === 'PENDING_MANAGER' && (roles.isManager || roles.isMaster)) out.push(p);
    else if (p.status === 'PENDING_HEAD' && (roles.isMaster || (await headApproversFor(p.requestedById)).some((h) => h.id === user.id))) out.push(p);
  }
  return out;
}

export async function getExitPass(id: string) {
  await requireUser();
  return prisma.exitPass.findUnique({
    where: { id },
    include: {
      people: { include: { user: { select: { id: true } } } },
      requestedBy: { select: { id: true, fullName: true } },
      headApprovedBy: { select: { fullName: true } },
      managerApprovedBy: { select: { fullName: true } },
      declinedBy: { select: { fullName: true } },
      gateOutBy: { select: { fullName: true } },
      gateInBy: { select: { fullName: true } },
      branch: true,
    },
  });
}

/** Can this viewer decide this pass right now? (for the pass page) */
export async function canDecideExitPass(passId: string): Promise<boolean> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, requestedById: true } });
  if (!p || (p.requestedById === user.id && !roles.isMaster)) return false;
  if (p.status === 'PENDING_MANAGER') return roles.isManager || roles.isMaster;
  if (p.status === 'PENDING_HEAD') return roles.isMaster || (await headApproversFor(p.requestedById)).some((h) => h.id === user.id);
  return false;
}

/** Trail + every email for one Visit / Exit Pass. */
export async function getSecurityHistory(entityType: 'Visit' | 'ExitPass' | 'VehicleGateExit', entityId: string) {
  await requireUser();
  const [entries, emails] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' }, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } }),
    prisma.securityEmailLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return { entries: entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null })), emails };
}

/** Staff for pickers (hosts, people on a pass). */
export async function listActiveStaff() {
  await requireUser();
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, employeeId: true, department: { select: { name: true } }, employeeProfile: { select: { jobTitle: true } } },
  });
}

/** Dashboard notifications: walk-in visitors waiting on this host; exit
 * passes waiting at this viewer's step. */
export async function getSecurityDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const user = await requireUser();
  const [atReception, passes] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN', hostUserId: user.id, receivedAt: { not: null } }, select: { id: true, visitorName: true, purpose: true, receivedAt: true } }),
    listExitPasses('to_decide'),
  ]);
  return [
    ...atReception.map((v: (typeof atReception)[number]) => ({ id: `visit-${v.id}`, title: `Your visitor is at reception — ${v.visitorName}`, detail: v.purpose, url: `/security/visitors/${v.id}`, createdAt: v.receivedAt as Date })),
    ...passes.map((p: (typeof passes)[number]) => ({ id: `exitpass-${p.id}`, title: `Exit pass ${p.passNumber} needs your decision`, detail: p.people.map((x: { name: string }) => x.name).join(', '), url: `/security/exit-passes/${p.id}`, createdAt: p.createdAt })),
  ];
}

/** Searchable staff options (hosts, people on a pass). */
export async function searchStaffOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await requireUser();
  const q = query.trim();
  const rows = await prisma.user.findMany({
    where: { isActive: true, ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { employeeId: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { fullName: 'asc' },
    take: 25,
    select: { id: true, fullName: true, employeeId: true, department: { select: { name: true } }, employeeProfile: { select: { jobTitle: true } } },
  });
  return rows.map((u: (typeof rows)[number]) => ({ value: u.id, label: u.fullName, sublabel: [u.employeeId, u.employeeProfile?.jobTitle, u.department?.name].filter(Boolean).join(' · ') || undefined }));
}
export async function loadStaffOptions() {
  return searchStaffOptions('');
}

/** The signed-in person's id and name (forms). */
export async function getMe(): Promise<{ id: string; fullName: string }> {
  const user = await requireUser();
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, fullName: true } });
  if (!u) throw new SecurityError('Not signed in.');
  return u;
}

/** The latest vehicles recorded leaving through the gate. */
export async function listRecentVehicleExits() {
  await requireUser();
  return prisma.vehicleGateExit.findMany({
    orderBy: { exitedAt: 'desc' },
    take: 50,
    select: {
      id: true, exitNumber: true, exitedAt: true, driverName: true, notes: true,
      exitedBy: { select: { fullName: true } },
      vehicle: { select: { id: true, make: true, model: true, plateNumber: true } },
      jobCard: { select: { id: true, jobNumber: true } },
      vehicleService: { select: { id: true, serviceNumber: true } },
    },
  });
}

/** One vehicle gate exit, for its printed slip. */
export async function getVehicleGateExit(id: string) {
  await requireUser();
  return prisma.vehicleGateExit.findUnique({
    where: { id },
    include: {
      branch: true,
      exitedBy: { select: { fullName: true } },
      vehicle: { select: { make: true, model: true, plateNumber: true, chassisNumber: true } },
      jobCard: { select: { jobNumber: true, checkedOutAt: true, collectedByName: true, customer: { select: { fullName: true } } } },
      vehicleService: { select: { serviceNumber: true, collectedAt: true, collectedByName: true, customer: { select: { fullName: true } } } },
    },
  });
}

// ── Individual pages behind each dashboard number ─────────────────────

const VISIT_ROW = { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, company: true, phone: true, purpose: true, vehicleType: true, vehiclePlate: true, expectedAt: true, expectedDurationMinutes: true, extendedMinutes: true, checkedInAt: true, receivedAt: true, isWalkIn: true, host: { select: { fullName: true } } } as const;
const PASS_ROW = { id: true, passNumber: true, status: true, reason: true, returning: true, expectedOutAt: true, expectedReturnAt: true, gateOutAt: true, requestedBy: { select: { fullName: true } }, people: { select: { name: true, employeeId: true, department: true } } } as const;

/** Visitors on the premises now. */
export async function listOnPremises() {
  await requireUser();
  return prisma.visit.findMany({ where: { status: 'CHECKED_IN' }, orderBy: { checkedInAt: 'asc' }, select: VISIT_ROW });
}

/** Everyone out on an exit pass now. */
export async function listPeopleOut() {
  await requireUser();
  return prisma.exitPass.findMany({ where: { status: 'OUT' }, orderBy: { expectedReturnAt: 'asc' }, select: PASS_ROW });
}

/** Overdue now — visitors past their stay, people past their return time.
 * Managed on the Overdue page (follow up, extend); no automatic emails. */
export async function listOverdue() {
  await requireUser();
  const now = new Date();
  const [visits, passes] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN' }, select: VISIT_ROW }),
    prisma.exitPass.findMany({ where: { status: 'OUT', returning: true }, select: PASS_ROW }),
  ]);
  return {
    visits: visits.map((v: (typeof visits)[number]) => ({ ...v, overdueMinutes: visitOverdueMinutes(v, now) })).filter((v: { overdueMinutes: number }) => v.overdueMinutes > 0).sort((a: { overdueMinutes: number }, b: { overdueMinutes: number }) => b.overdueMinutes - a.overdueMinutes),
    passes: passes.map((p: (typeof passes)[number]) => ({ ...p, overdueMinutes: exitPassOverdueMinutes(p, now) })).filter((p: { overdueMinutes: number }) => p.overdueMinutes > 0).sort((a: { overdueMinutes: number }, b: { overdueMinutes: number }) => b.overdueMinutes - a.overdueMinutes),
  };
}

export type InsideVehicle = { kind: 'VISITOR' | 'JOB_CARD' | 'VEHICLE_SERVICE'; stage: 'VISITOR' | 'WORKSHOP' | 'CLEARED'; id: string; number: string; plate: string | null; description: string; who: string; since: Date | null; href: string };

/** Every vehicle inside the compound now: visitors' vehicles, workshop
 * vehicles still being worked on, and released vehicles not yet out. */
export async function listVehiclesInside(): Promise<InsideVehicle[]> {
  await requireUser();
  const [visits, jcs, vss, cleared] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN', vehicleType: { not: 'ON_FOOT' } }, select: { id: true, passNumber: true, visitorName: true, vehicleType: true, vehiclePlate: true, checkedInAt: true } }),
    prisma.jobCard.findMany({ where: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } }, select: { id: true, jobNumber: true, createdAt: true, vehicle: { select: { make: true, model: true, plateNumber: true } }, customer: { select: { fullName: true } } } }),
    prisma.vehicleService.findMany({ where: { status: { in: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'] } }, select: { id: true, serviceNumber: true, createdAt: true, vehicle: { select: { make: true, model: true, plateNumber: true } }, customer: { select: { fullName: true } } } }),
    listVehiclesClearedToLeave(),
  ]);
  const car = (v: { make: string | null; model: string | null }) => [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
  return [
    ...visits.map((v: (typeof visits)[number]) => ({ kind: 'VISITOR' as const, stage: 'VISITOR' as const, id: v.id, number: v.passNumber ?? '', plate: v.vehiclePlate, description: v.vehicleType, who: v.visitorName, since: v.checkedInAt, href: `/security/visitors/${v.id}` })),
    ...jcs.map((j: (typeof jcs)[number]) => ({ kind: 'JOB_CARD' as const, stage: 'WORKSHOP' as const, id: j.id, number: j.jobNumber, plate: j.vehicle.plateNumber, description: car(j.vehicle), who: j.customer.fullName, since: j.createdAt, href: `/workshop/job-cards/${j.id}` })),
    ...vss.map((v: (typeof vss)[number]) => ({ kind: 'VEHICLE_SERVICE' as const, stage: 'WORKSHOP' as const, id: v.id, number: v.serviceNumber, plate: v.vehicle.plateNumber, description: car(v.vehicle), who: v.customer.fullName, since: v.createdAt, href: `/workshop/vehicle-service/${v.id}` })),
    ...cleared.map((c) => ({ kind: c.kind, stage: 'CLEARED' as const, id: c.id, number: c.number, plate: c.vehicle.plateNumber, description: car(c.vehicle), who: c.customer, since: c.releasedAt, href: `/security/vehicles/release/${c.kind === 'JOB_CARD' ? 'job-card' : 'vehicle-service'}/${c.id}` })),
  ].sort((a, b) => (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0));
}

/** One released vehicle, for its own release (confirm exit) page. */
export async function getClearedVehicle(kind: 'JOB_CARD' | 'VEHICLE_SERVICE', id: string) {
  await requireUser();
  if (kind === 'JOB_CARD') {
    const j = await prisma.jobCard.findUnique({
      where: { id },
      select: { id: true, jobNumber: true, status: true, checkedOutAt: true, collectedByName: true, gateExit: { select: { id: true, exitNumber: true } }, vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true, mileage: true } }, customer: { select: { fullName: true, phone: true } }, payments: { select: { amount: true } }, estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } } },
    });
    if (!j) return null;
    const paid = j.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0);
    return { kind, id: j.id, number: j.jobNumber, released: j.status === 'CHECKED_OUT', releasedAt: j.checkedOutAt, collectedBy: j.collectedByName, exit: j.gateExit, vehicle: j.vehicle, customer: j.customer, cancelled: false, total: customerTotal(j.estimate?.lineItems ?? []), paid };
  }
  const v = await prisma.vehicleService.findUnique({
    where: { id },
    select: { id: true, serviceNumber: true, status: true, collectedAt: true, collectedByName: true, gateExit: { select: { id: true, exitNumber: true } }, vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true, mileage: true } }, customer: { select: { fullName: true, phone: true } }, payments: { select: { amount: true } } },
  });
  if (!v) return null;
  return { kind, id: v.id, number: v.serviceNumber, released: Boolean(v.collectedAt) && ['COLLECTED', 'CANCELLED'].includes(v.status), releasedAt: v.collectedAt, collectedBy: v.collectedByName, exit: v.gateExit, vehicle: v.vehicle, customer: v.customer, cancelled: v.status === 'CANCELLED', total: null, paid: v.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0) };
}

/** Vehicle exit history, newest first, searchable. */
export async function listVehicleExits(q?: string) {
  await requireUser();
  const t = q?.trim();
  return prisma.vehicleGateExit.findMany({
    where: t ? { OR: [{ exitNumber: { contains: t, mode: 'insensitive' } }, { driverName: { contains: t, mode: 'insensitive' } }, { vehicle: { plateNumber: { contains: t, mode: 'insensitive' } } }, { jobCard: { jobNumber: { contains: t, mode: 'insensitive' } } }, { vehicleService: { serviceNumber: { contains: t, mode: 'insensitive' } } }] } : undefined,
    orderBy: { exitedAt: 'desc' },
    take: 300,
    select: {
      id: true, exitNumber: true, exitedAt: true, driverName: true, notes: true,
      exitedBy: { select: { fullName: true } },
      vehicle: { select: { id: true, make: true, model: true, plateNumber: true } },
      jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
      vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { fullName: true } } } },
    },
  });
}

/** Give someone out on a pass more time to return (CSO / Security, with
 * a reason). */
export async function extendExitPassReturn(passId: string, extraMinutes: number, reason: string): Promise<void> {
  const r = await requireGate();
  if (!Number.isInteger(extraMinutes) || extraMinutes < 5 || extraMinutes > 12 * 60) throw new SecurityError('Choose how much more time — between 5 minutes and 12 hours.');
  if (!reason.trim()) throw new SecurityError('Give the reason for the extra time.');
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, returning: true, passNumber: true, expectedReturnAt: true } });
  if (!p) throw new SecurityError('Exit pass not found.');
  if (p.status !== 'OUT' || !p.returning || !p.expectedReturnAt) throw new SecurityError('Only someone out on a returning pass can be given more time.');
  const next = new Date(new Date(p.expectedReturnAt).getTime() + extraMinutes * 60000);
  await prisma.exitPass.update({ where: { id: passId }, data: { expectedReturnAt: next } });
  await writeAuditLog({ userId: r.userId, action: 'exit_pass.extended', entityType: 'ExitPass', entityId: passId, metadata: { passNumber: p.passNumber, extra: durationText(extraMinutes), newReturn: next.toISOString(), reason: reason.trim() } });
}

/** A follow-up note on a visitor or exit pass (e.g. "called — on the way
 * back"), kept on its audit trail. */
export async function addSecurityFollowUp(entityType: 'Visit' | 'ExitPass', id: string, note: string): Promise<void> {
  const r = await requireFrontDesk();
  if (!note.trim()) throw new SecurityError('Write the follow-up note.');
  const exists = entityType === 'Visit' ? await prisma.visit.findUnique({ where: { id }, select: { id: true } }) : await prisma.exitPass.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new SecurityError('Record not found.');
  await writeAuditLog({ userId: r.userId, action: 'security.follow_up', entityType, entityId: id, metadata: { note: note.trim() } });
}

export type SecurityRecord = { type: 'VISIT' | 'EXIT_PASS' | 'VEHICLE_EXIT'; id: string; number: string; title: string; detail: string; status: string; at: Date; href: string };

/** The Security register: every visit, exit pass and vehicle exit, newest
 * first, searchable by any number, name or plate. */
export async function searchSecurityRecords(q?: string, type?: string): Promise<SecurityRecord[]> {
  await requireUser();
  const t = q?.trim();
  const want = (x: string) => !type || type === x;
  const [visits, passes, exits] = await Promise.all([
    want('VISIT') ? listVisits(t) : Promise.resolve([]),
    want('EXIT_PASS') ? listExitPasses('all', t) : Promise.resolve([]),
    want('VEHICLE_EXIT') ? listVehicleExits(t) : Promise.resolve([]),
  ]);
  return [
    ...visits.map((v: Awaited<ReturnType<typeof listVisits>>[number]) => ({ type: 'VISIT' as const, id: v.id, number: [v.visitNumber, v.passNumber].filter(Boolean).join(' · '), title: v.visitorName, detail: `${v.company ? `${v.company} · ` : ''}${v.purpose} · visiting ${v.host.fullName}`, status: v.status, at: v.checkedInAt ?? v.expectedAt ?? new Date(0), href: `/security/visitors/${v.id}` })),
    ...passes.map((p: Awaited<ReturnType<typeof listExitPasses>>[number]) => ({ type: 'EXIT_PASS' as const, id: p.id, number: p.passNumber, title: p.people.map((x: { name: string }) => x.name).join(', '), detail: p.reason, status: p.status, at: p.createdAt, href: `/security/exit-passes/${p.id}` })),
    ...exits.map((x: Awaited<ReturnType<typeof listVehicleExits>>[number]) => ({ type: 'VEHICLE_EXIT' as const, id: x.id, number: x.exitNumber, title: `${[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}${x.vehicle.plateNumber ? ` — ${x.vehicle.plateNumber}` : ''}`, detail: `${x.jobCard?.jobNumber ?? x.vehicleService?.serviceNumber ?? ''} · ${x.jobCard?.customer.fullName ?? x.vehicleService?.customer.fullName ?? ''}`, status: 'LEFT', at: x.exitedAt, href: `/security/vehicles/exits/${x.id}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}
