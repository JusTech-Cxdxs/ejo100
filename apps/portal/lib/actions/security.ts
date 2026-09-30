'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopBranchId, getWorkshopOrgContext, listEligibleManagersForBranch } from './workshop';
import { listEligibleStoreManagersForBranch, listEligibleStoreOfficersForBranch } from './store';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { visitOverdueMinutes, exitPassOverdueMinutes, roadTestOverdueMinutes, durationText, INCIDENT_TYPES } from '@/lib/security-rules';
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

async function nextNumber(prefix: 'VIS' | 'VP' | 'EP' | 'VX' | 'RT' | 'INC' | 'DLV'): Promise<string> {
  const year = new Date().getFullYear();
  const start = `${prefix}-${year}-`;
  const latest =
    prefix === 'VIS'
      ? await prisma.visit.findFirst({ where: { visitNumber: { startsWith: start } }, orderBy: { visitNumber: 'desc' }, select: { visitNumber: true } }).then((r: { visitNumber: string } | null) => r?.visitNumber)
      : prefix === 'VP'
        ? await prisma.visit.findFirst({ where: { passNumber: { startsWith: start } }, orderBy: { passNumber: 'desc' }, select: { passNumber: true } }).then((r: { passNumber: string | null } | null) => r?.passNumber ?? undefined)
        : prefix === 'INC'
          ? await prisma.securityIncident.findFirst({ where: { incidentNumber: { startsWith: start } }, orderBy: { incidentNumber: 'desc' }, select: { incidentNumber: true } }).then((r: { incidentNumber: string } | null) => r?.incidentNumber)
        : prefix === 'DLV'
          ? await prisma.gateDelivery.findFirst({ where: { deliveryNumber: { startsWith: start } }, orderBy: { deliveryNumber: 'desc' }, select: { deliveryNumber: true } }).then((r: { deliveryNumber: string } | null) => r?.deliveryNumber)
        : prefix === 'RT'
          ? await prisma.roadTestPermit.findFirst({ where: { permitNumber: { startsWith: start } }, orderBy: { permitNumber: 'desc' }, select: { permitNumber: true } }).then((r: { permitNumber: string } | null) => r?.permitNumber)
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
  /** Group visits: total people (lead + members) and the members' names. */
  partySize?: number;
  memberNames?: string[];
  company?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
  vehicleType?: string;
  plates?: string[];
  purpose: string;
  hostUserId: string;
  expectedAt?: Date;
  expectedDurationMinutes: number;
  notes?: string;
};

const t = (v?: string) => v?.trim() || null;

/** People, organisation, purpose, host, stay — common to bookings and arrivals. */
function cleanParty(i: VisitInput) {
  if (!i.visitorName.trim()) throw new SecurityError("Enter the visitor's name.");
  const size = i.partySize ?? 1;
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new SecurityError('A group can have between 2 and 50 people.');
  const members = (i.memberNames ?? []).map((n) => n.trim());
  if (members.length !== size - 1 || members.some((n) => !n)) throw new SecurityError(`Enter a name for every person in the group — ${size} ${size === 1 ? 'name' : 'names'} in total.`);
  if (!i.purpose.trim()) throw new SecurityError('Enter the purpose of the visit.');
  if (!i.hostUserId) throw new SecurityError('Choose who they are visiting.');
  if (!Number.isInteger(i.expectedDurationMinutes) || i.expectedDurationMinutes < 5 || i.expectedDurationMinutes > 24 * 60) throw new SecurityError('Expected stay must be between 5 minutes and 24 hours.');
  return { visitorName: i.visitorName.trim(), partySize: size, memberNames: members, company: t(i.company), phone: t(i.phone), purpose: i.purpose.trim(), hostUserId: i.hostUserId, expectedDurationMinutes: i.expectedDurationMinutes, notes: t(i.notes) };
}

/** How they came and who they are — taken only when they are at the gate. */
function cleanArrival(i: { vehicleType?: string; plates?: string[]; idType?: string; idNumber?: string }) {
  if (!i.vehicleType || !VEHICLE_TYPES.includes(i.vehicleType as VehicleType)) throw new SecurityError('Choose how the visitor came — on foot or by which vehicle.');
  const plates = [...new Set((i.plates ?? []).map((p) => p.trim().toUpperCase()).filter(Boolean))];
  if (i.vehicleType !== 'ON_FOOT' && plates.length === 0) throw new SecurityError('Enter the plate number of the vehicle they came with.');
  if (!t(i.idType)) throw new SecurityError('Choose the kind of ID the visitor showed.');
  if (!t(i.idNumber)) throw new SecurityError('Enter the ID number.');
  return { vehicleType: i.vehicleType, vehiclePlate: i.vehicleType === 'ON_FOOT' ? null : plates.join(', '), idType: t(i.idType), idNumber: t(i.idNumber) };
}

async function activeHost(id: string) {
  const host = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, email: true, isActive: true } });
  if (!host?.isActive) throw new SecurityError('That host is not an active member of staff.');
  return host;
}

/** Book a visitor in advance. Anyone can book their own visitor (they are
 * the host); Security / Reception can book one for anybody. A booking is
 * only a booking: how they came and their ID are taken when they arrive. */
export async function preRegisterVisit(input: VisitInput): Promise<{ id: string; visitNumber: string }> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const data = cleanParty(input);
  if (data.hostUserId !== user.id && !roles.isFrontDesk) throw new SecurityError('You can only book your own visitors.');
  if (!input.expectedAt || Number.isNaN(new Date(input.expectedAt).getTime())) throw new SecurityError('Enter when the visitor is expected.');
  await activeHost(data.hostUserId);
  const visitNumber = await nextNumber('VIS');
  const visit = await prisma.visit.create({ data: { ...data, expectedAt: input.expectedAt, vehicleType: 'ON_FOOT', visitNumber, status: 'EXPECTED', branchId: await getWorkshopBranchId(), registeredById: user.id } });
  await writeAuditLog({ userId: user.id, action: 'visit.pre_registered', entityType: 'Visit', entityId: visit.id, metadata: { visitNumber, visitor: data.visitorName, people: data.partySize, expectedAt: input.expectedAt } });
  await emailGateAboutBooking('new', visit.id, user.id);
  return { id: visit.id, visitNumber };
}

/** Change a booking (before the visitor arrives). */
export async function updateBooking(visitId: string, input: VisitInput): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true, hostUserId: true, registeredById: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (v.status !== 'EXPECTED') throw new SecurityError('Only a booking that has not arrived can be changed.');
  if (!roles.isFrontDesk && v.hostUserId !== user.id && v.registeredById !== user.id) throw new SecurityError('Only the host, whoever booked it, Reception or Security can change it.');
  const data = cleanParty(input);
  if (data.hostUserId !== user.id && !roles.isFrontDesk && data.hostUserId !== v.hostUserId) throw new SecurityError('You can only book your own visitors.');
  if (!input.expectedAt || Number.isNaN(new Date(input.expectedAt).getTime())) throw new SecurityError('Enter when the visitor is expected.');
  await activeHost(data.hostUserId);
  await prisma.visit.update({ where: { id: visitId }, data: { ...data, expectedAt: input.expectedAt } });
  await writeAuditLog({ userId: user.id, action: 'visit.booking_changed', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, visitor: data.visitorName, people: data.partySize, expectedAt: input.expectedAt } });
  await emailGateAboutBooking('changed', visitId, user.id);
}

/** A visitor at the gate who was not booked: recorded complete, with a
 * pass, and on the premises from this moment. */
export async function recordArrival(input: VisitInput): Promise<{ id: string; visitNumber: string; passNumber: string }> {
  const r = await requireGate();
  const data = cleanParty(input);
  const arrival = cleanArrival(input);
  await activeHost(data.hostUserId);
  const [visitNumber, passNumber] = [await nextNumber('VIS'), await nextNumber('VP')];
  const visit = await prisma.visit.create({
    data: { ...data, ...arrival, expectedAt: null, visitNumber, passNumber, status: 'CHECKED_IN', isWalkIn: true, checkedInAt: new Date(), checkedInById: r.userId, branchId: await getWorkshopBranchId(), registeredById: r.userId },
  });
  await writeAuditLog({ userId: r.userId, action: 'visit.arrived', entityType: 'Visit', entityId: visit.id, metadata: { visitNumber, passNumber, visitor: data.visitorName, people: data.partySize, vehicle: arrival.vehiclePlate ?? 'On foot' } });
  return { id: visit.id, visitNumber, passNumber };
}

/** A booked visitor arrives: Security completes how they came and their ID,
 * and issues the pass. */
export async function checkInVisit(visitId: string, arrivalInput: { vehicleType?: string; plates?: string[]; idType?: string; idNumber?: string }): Promise<{ passNumber: string }> {
  const r = await requireGate();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (v.status !== 'EXPECTED') throw new SecurityError('Only an expected visitor can be checked in.');
  const arrival = cleanArrival(arrivalInput);
  const passNumber = await nextNumber('VP');
  await prisma.visit.update({ where: { id: visitId }, data: { ...arrival, status: 'CHECKED_IN', passNumber, checkedInAt: new Date(), checkedInById: r.userId } });
  await writeAuditLog({ userId: r.userId, action: 'visit.checked_in', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, passNumber, vehicle: arrival.vehiclePlate ?? 'On foot' } });
  return { passNumber };
}

/** Security and Reception hear about every booking: new, moved, cancelled. */
async function emailGateAboutBooking(kind: 'new' | 'changed' | 'cancelled', visitId: string, actorId: string, reason?: string) {
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { visitNumber: true, visitorName: true, memberNames: true, partySize: true, company: true, purpose: true, expectedAt: true, host: { select: { fullName: true } } } });
  if (!v) return;
  const who = `${[v.visitorName, ...v.memberNames].join(', ')}${v.company ? ` (${v.company})` : ''}`;
  const when = v.expectedAt ? new Date(v.expectedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const staff = await usersWithSlugs(['security-officer', 'chief-security-officer', 'receptionist']);
  await sendLogged('Visit', visitId, staff, kind === 'cancelled' ? `Visit cancelled — ${who}` : `${kind === 'new' ? 'Visitor booked' : 'Visit rescheduled'} — ${who}, ${when}`, kind === 'cancelled' ? 'A booked visit was cancelled — do not expect them' : kind === 'new' ? 'Expect a visitor' : 'A booked visit has moved', [who, ...(v.partySize > 1 ? [`${v.partySize} people`] : []), `Visiting: ${v.host.fullName}`, `Purpose: ${v.purpose}`, kind === 'cancelled' ? `Reason: ${reason ?? ''}` : `Expected: ${when}`, v.visitNumber], kind === 'cancelled' ? '/security/visitors' : `/security/visitors/${visitId}`, actorId);
}

/** Bookings whose day has passed without the visitor coming are removed —
 * no dead records. The removal is kept on the audit log. */
async function purgeStaleBookings(actorId: string | null) {
  const startOfToday = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) + 'T00:00:00+01:00');
  const stale = await prisma.visit.findMany({ where: { status: 'EXPECTED', expectedAt: { lt: startOfToday } }, select: { id: true, visitNumber: true, visitorName: true, expectedAt: true } });
  for (const v of stale) {
    await writeAuditLog({ userId: actorId, action: 'visit.booking_expired', entityType: 'Visit', entityId: v.id, metadata: { visitNumber: v.visitNumber, visitor: v.visitorName, expectedAt: v.expectedAt } });
    await prisma.visit.delete({ where: { id: v.id } });
  }
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
  // The visitors of an appointment have left — the appointment happened.
  const appt = await prisma.appointment.findFirst({ where: { visitId, status: 'SCHEDULED' }, select: { id: true, appointmentNumber: true } });
  if (appt) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: 'COMPLETED', completedAt: out } });
    await writeAuditLog({ userId: r.userId, action: 'appointment.completed', entityType: 'Appointment', entityId: appt.id, metadata: { appointmentNumber: appt.appointmentNumber, by: 'Visitors checked out at the gate' } });
  }
}

/** Cancel a booking: it is removed (the cancellation stays on the audit
 * log) — a visit that never happened leaves no dead record. */
export async function cancelVisit(visitId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { status: true, visitNumber: true, visitorName: true, hostUserId: true, registeredById: true } });
  if (!v) throw new SecurityError('Visit not found.');
  if (!roles.isFrontDesk && v.hostUserId !== user.id && v.registeredById !== user.id) throw new SecurityError('Only the host, whoever booked it, Reception or Security can cancel.');
  if (v.status !== 'EXPECTED') throw new SecurityError('Only a booking that has not arrived can be cancelled.');
  if (!reason.trim()) throw new SecurityError('Give a reason for cancelling.');
  await writeAuditLog({ userId: user.id, action: 'visit.cancelled', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, visitor: v.visitorName, reason: reason.trim() } });
  await emailGateAboutBooking('cancelled', visitId, user.id, reason.trim());
  await prisma.visit.delete({ where: { id: visitId } });
}

// ── Employee Exit Pass ────────────────────────────────────────────────

export type ExitPassInput = {
  reason: string;
  returning: boolean;
  expectedOutAt?: Date;
  /** Returning passes: how long they plan to be out (minutes). */
  expectedDurationMinutes?: number;
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
  if (out && Number.isNaN(out.getTime())) throw new SecurityError('Enter a valid time for leaving.');
  const minutes = input.expectedDurationMinutes;
  if (input.returning && (!Number.isInteger(minutes) || minutes! < 15 || minutes! > 600)) throw new SecurityError('Choose how long you will be out — between 15 minutes and 10 hours.');
  // Provisional return time; reset from the actual time out at the gate.
  const back = input.returning ? new Date((out ?? new Date()).getTime() + minutes! * 60000) : null;
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
      expectedOutAt: out, expectedReturnAt: back, expectedDurationMinutes: input.returning ? minutes! : null,
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
  await sendLogged('ExitPass', pass.id, approvers, `Exit pass ${passNumber} needs your ${requesterIsHead ? 'approval' : 'authorisation'}`, 'An exit pass needs your decision', [`${passNumber} — ${names.join(', ')}`, `Reason: ${reason}`, input.returning ? `Out for about ${durationText(minutes!)}` : 'Not returning today'], `/security/exit-passes/${pass.id}`, user.id);
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
  const p = await prisma.exitPass.findUnique({ where: { id: passId }, select: { status: true, passNumber: true, returning: true, expectedDurationMinutes: true } });
  if (!p) throw new SecurityError('Exit pass not found.');
  if (p.status !== 'APPROVED') throw new SecurityError('Only an approved exit pass can be used to leave — Security will not permit exit without approval.');
  const now = new Date();
  // Expected back = actual time out + how long they said they'd be.
  const expectedReturnAt = p.returning && p.expectedDurationMinutes ? new Date(now.getTime() + p.expectedDurationMinutes * 60000) : undefined;
  await prisma.exitPass.update({ where: { id: passId }, data: { status: p.returning ? 'OUT' : 'CLOSED', gateOutAt: now, gateOutById: r.userId, ...(expectedReturnAt ? { expectedReturnAt } : {}) } });
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
  const me = await requireUser();
  await purgeStaleBookings(me.id);
  const startOfDay = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) + 'T00:00:00+01:00');
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const visitSelect = { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, partySize: true, memberNames: true, company: true, purpose: true, vehicleType: true, vehiclePlate: true, expectedAt: true, expectedDurationMinutes: true, checkedInAt: true, receivedAt: true, isWalkIn: true, host: { select: { fullName: true } } } as const;
  const passSelect = { id: true, passNumber: true, status: true, reason: true, returning: true, expectedOutAt: true, expectedReturnAt: true, gateOutAt: true, people: { select: { name: true } } } as const;
  const [onPremises, expectedToday, passesReady, passesOut, vehicles, jobCardsIn, servicesIn, roadTestsOut, roadTestsReady] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN' }, orderBy: { checkedInAt: 'asc' }, select: visitSelect }),
    prisma.visit.findMany({ where: { status: 'EXPECTED', expectedAt: { gte: startOfDay, lt: endOfDay } }, orderBy: { expectedAt: 'asc' }, select: visitSelect }),
    prisma.exitPass.findMany({ where: { status: 'APPROVED' }, orderBy: { managerApprovedAt: 'asc' }, select: passSelect }),
    prisma.exitPass.findMany({ where: { status: 'OUT' }, orderBy: { expectedReturnAt: 'asc' }, select: passSelect }),
    listVehiclesClearedToLeave(),
    // Workshop vehicles physically inside: work not yet released.
    prisma.jobCard.count({ where: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } } }),
    prisma.vehicleService.count({ where: { status: { in: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'] } } }),
    prisma.roadTestPermit.findMany({ where: { status: 'OUT' }, orderBy: { gateOutAt: 'asc' }, select: RT_ROW }),
    prisma.roadTestPermit.findMany({ where: { status: 'APPROVED' }, orderBy: { managerApprovedAt: 'asc' }, select: RT_ROW }),
  ]);
  const [openIncidents, deliveriesOnSite] = await Promise.all([
    prisma.securityIncident.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    prisma.gateDelivery.findMany({ where: { status: { in: ['AT_GATE', 'RECEIVED'] } }, select: { vehiclePlate: true } }),
  ]);
  const deliveryVehicles = deliveriesOnSite.filter((d: { vehiclePlate: string | null }) => d.vehiclePlate).length;
  // A workshop vehicle out on a road test is not inside the compound.
  const workshopInside = Math.max(0, jobCardsIn + servicesIn - roadTestsOut.length);
  // People, not visits (a group of 5 is 5); vehicles, not visits (every plate).
  const plateCount = (v: { vehicleType: string; vehiclePlate: string | null }) => (v.vehicleType === 'ON_FOOT' ? 0 : Math.max(1, (v.vehiclePlate ?? '').split(',').filter((x) => x.trim()).length));
  const visitorVehicles = onPremises.reduce((n: number, v: (typeof onPremises)[number]) => n + plateCount(v), 0);
  const visitorPeople = onPremises.reduce((n: number, v: (typeof onPremises)[number]) => n + v.partySize, 0);
  const peopleOut = passesOut.reduce((s: number, p: (typeof passesOut)[number]) => s + p.people.length, 0);
  return {
    onPremises,
    atGateNotReceived: onPremises.filter((v: (typeof onPremises)[number]) => !v.receivedAt),
    expectedToday,
    passesReady,
    passesOut,
    vehicles,
    roadTestsOut,
    roadTestsReady,
    compound: {
      visitors: visitorPeople,
      visits: onPremises.length,
      peopleOut,
      visitorVehicles,
      workshopVehicles: workshopInside,
      awaitingExit: vehicles.length,
      onRoadTest: roadTestsOut.length,
      deliveriesOnSite: deliveriesOnSite.length,
      deliveryVehicles,
      openIncidents,
      vehiclesInside: visitorVehicles + workshopInside + vehicles.length + deliveryVehicles,
    },
  };
}

// ── Queries ───────────────────────────────────────────────────────────

export async function listVisits(q?: string) {
  const me = await requireUser();
  await purgeStaleBookings(me.id);
  const t = q?.trim();
  return prisma.visit.findMany({
    where: t ? { OR: [{ visitNumber: { contains: t, mode: 'insensitive' } }, { passNumber: { contains: t, mode: 'insensitive' } }, { visitorName: { contains: t, mode: 'insensitive' } }, { company: { contains: t, mode: 'insensitive' } }, { vehiclePlate: { contains: t, mode: 'insensitive' } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, partySize: true, memberNames: true, company: true, purpose: true, vehicleType: true, vehiclePlate: true, expectedAt: true, expectedDurationMinutes: true, checkedInAt: true, checkedOutAt: true, receivedAt: true, isWalkIn: true, host: { select: { fullName: true } } },
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
export async function getSecurityHistory(entityType: 'Visit' | 'ExitPass' | 'VehicleGateExit' | 'RoadTestPermit' | 'SecurityIncident' | 'GateDelivery', entityId: string) {
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
  const roles = await getSecurityRoles();
  const store = await isStore(user.id, roles.isMaster);
  const dayStart = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);
  const [newIncidents, atGateForStore, expectedDeliveries] = await Promise.all([
    roles.isCso || roles.isMaster ? prisma.securityIncident.findMany({ where: { status: 'OPEN' }, select: { id: true, incidentNumber: true, type: true, severity: true, createdAt: true } }) : Promise.resolve([]),
    store ? prisma.gateDelivery.findMany({ where: { status: 'AT_GATE' }, select: { id: true, deliveryNumber: true, supplierName: true, arrivedAt: true } }) : Promise.resolve([]),
    roles.isGate ? prisma.gateDelivery.findMany({ where: { status: 'EXPECTED', expectedAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } }, select: { id: true, deliveryNumber: true, supplierName: true, expectedAt: true } }) : Promise.resolve([]),
  ]);
  const [atReception, passes, tests] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN', hostUserId: user.id, receivedAt: { not: null } }, select: { id: true, visitorName: true, purpose: true, receivedAt: true } }),
    listExitPasses('to_decide'),
    listRoadTests('to_decide'),
  ]);
  return [
    ...atReception.map((v: (typeof atReception)[number]) => ({ id: `visit-${v.id}`, title: `Your visitor is at reception — ${v.visitorName}`, detail: v.purpose, url: `/security/visitors/${v.id}`, createdAt: v.receivedAt as Date })),
    ...newIncidents.map((i: { id: string; incidentNumber: string; type: string; severity: string; createdAt: Date }) => ({ id: `inc-${i.id}`, title: `Incident ${i.incidentNumber}: ${i.type}`, detail: `${i.severity.toLowerCase()} — needs review`, url: `/security/incidents/${i.id}`, createdAt: i.createdAt })),
    ...atGateForStore.map((d: { id: string; deliveryNumber: string; supplierName: string; arrivedAt: Date | null }) => ({ id: `dlv-${d.id}`, title: `Delivery at the gate — ${d.supplierName}`, detail: `${d.deliveryNumber} — please receive it`, url: `/security/deliveries/${d.id}`, createdAt: d.arrivedAt ?? new Date() })),
    ...expectedDeliveries.map((d: { id: string; deliveryNumber: string; supplierName: string; expectedAt: Date | null }) => ({ id: `dlvx-${d.id}`, title: `Delivery expected today — ${d.supplierName}`, detail: d.deliveryNumber, url: `/security/deliveries/${d.id}`, createdAt: d.expectedAt ?? new Date() })),
    ...tests.map((r: (typeof tests)[number]) => ({ id: `roadtest-${r.id}`, title: `Road test ${r.permitNumber} needs your approval`, detail: `${r.jobCard?.jobNumber ?? r.vehicleService?.serviceNumber ?? ''} · ${r.vehicle.plateNumber ?? ''} · driver ${r.driver.fullName}`, url: `/security/road-tests/${r.id}`, createdAt: r.createdAt })),
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

const VISIT_ROW = { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, partySize: true, memberNames: true, company: true, phone: true, purpose: true, vehicleType: true, vehiclePlate: true, expectedAt: true, expectedDurationMinutes: true, extendedMinutes: true, checkedInAt: true, receivedAt: true, isWalkIn: true, host: { select: { fullName: true } } } as const;
const PASS_ROW = { id: true, passNumber: true, status: true, reason: true, returning: true, expectedOutAt: true, expectedReturnAt: true, expectedDurationMinutes: true, gateOutAt: true, requestedBy: { select: { fullName: true } }, people: { select: { name: true, employeeId: true, department: true } } } as const;

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
  const [visits, passes, tests] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN' }, select: VISIT_ROW }),
    prisma.exitPass.findMany({ where: { status: 'OUT', returning: true }, select: PASS_ROW }),
    prisma.roadTestPermit.findMany({ where: { status: 'OUT' }, select: RT_ROW }),
  ]);
  return {
    roadTests: tests.map((r: (typeof tests)[number]) => ({ ...r, overdueMinutes: roadTestOverdueMinutes(r, now) })).filter((r: { overdueMinutes: number }) => r.overdueMinutes > 0).sort((a: { overdueMinutes: number }, b: { overdueMinutes: number }) => b.overdueMinutes - a.overdueMinutes),
    visits: visits.map((v: (typeof visits)[number]) => ({ ...v, overdueMinutes: visitOverdueMinutes(v, now) })).filter((v: { overdueMinutes: number }) => v.overdueMinutes > 0).sort((a: { overdueMinutes: number }, b: { overdueMinutes: number }) => b.overdueMinutes - a.overdueMinutes),
    passes: passes.map((p: (typeof passes)[number]) => ({ ...p, overdueMinutes: exitPassOverdueMinutes(p, now) })).filter((p: { overdueMinutes: number }) => p.overdueMinutes > 0).sort((a: { overdueMinutes: number }, b: { overdueMinutes: number }) => b.overdueMinutes - a.overdueMinutes),
  };
}

export type InsideVehicle = { kind: 'VISITOR' | 'JOB_CARD' | 'VEHICLE_SERVICE' | 'DELIVERY'; stage: 'VISITOR' | 'WORKSHOP' | 'CLEARED' | 'DELIVERY'; id: string; number: string; plate: string | null; description: string; who: string; since: Date | null; href: string };

/** Every vehicle inside the compound now: visitors' vehicles, workshop
 * vehicles still being worked on, and released vehicles not yet out. */
export async function listVehiclesInside(): Promise<InsideVehicle[]> {
  await requireUser();
  const outOnTest = new Set((await prisma.roadTestPermit.findMany({ where: { status: 'OUT' }, select: { vehicleId: true } })).map((r: { vehicleId: string }) => r.vehicleId));
  const [visits, jcs, vss, cleared] = await Promise.all([
    prisma.visit.findMany({ where: { status: 'CHECKED_IN', vehicleType: { not: 'ON_FOOT' } }, select: { id: true, passNumber: true, visitorName: true, vehicleType: true, vehiclePlate: true, checkedInAt: true } }),
    prisma.jobCard.findMany({ where: { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } }, select: { id: true, jobNumber: true, createdAt: true, vehicleId: true, vehicle: { select: { make: true, model: true, plateNumber: true } }, customer: { select: { fullName: true } } } }).then((r) => r.filter((x) => !outOnTest.has(x.vehicleId))),
    prisma.vehicleService.findMany({ where: { status: { in: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'] } }, select: { id: true, serviceNumber: true, createdAt: true, vehicleId: true, vehicle: { select: { make: true, model: true, plateNumber: true } }, customer: { select: { fullName: true } } } }).then((r) => r.filter((x) => !outOnTest.has(x.vehicleId))),
    listVehiclesClearedToLeave(),
  ]);
  const deliveries = await prisma.gateDelivery.findMany({ where: { status: { in: ['AT_GATE', 'RECEIVED'] }, vehiclePlate: { not: null } }, select: { id: true, deliveryNumber: true, supplierName: true, vehicleType: true, vehiclePlate: true, arrivedAt: true } });
  const car = (v: { make: string | null; model: string | null }) => [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
  return [
    ...visits.flatMap((v: (typeof visits)[number]) =>
      (v.vehiclePlate ?? '').split(',').map((x: string) => x.trim()).filter(Boolean).map((plate: string) => ({ kind: 'VISITOR' as const, stage: 'VISITOR' as const, id: v.id, number: v.passNumber ?? '', plate, description: v.vehicleType, who: v.visitorName, since: v.checkedInAt, href: `/security/visitors/${v.id}` })),
    ),
    ...jcs.map((j: (typeof jcs)[number]) => ({ kind: 'JOB_CARD' as const, stage: 'WORKSHOP' as const, id: j.id, number: j.jobNumber, plate: j.vehicle.plateNumber, description: car(j.vehicle), who: j.customer.fullName, since: j.createdAt, href: `/workshop/job-cards/${j.id}` })),
    ...vss.map((v: (typeof vss)[number]) => ({ kind: 'VEHICLE_SERVICE' as const, stage: 'WORKSHOP' as const, id: v.id, number: v.serviceNumber, plate: v.vehicle.plateNumber, description: car(v.vehicle), who: v.customer.fullName, since: v.createdAt, href: `/workshop/vehicle-service/${v.id}` })),
    ...deliveries.map((d: (typeof deliveries)[number]) => ({ kind: 'DELIVERY' as const, stage: 'DELIVERY' as const, id: d.id, number: d.deliveryNumber, plate: d.vehiclePlate, description: d.vehicleType ?? 'OTHER', who: d.supplierName, since: d.arrivedAt, href: `/security/deliveries/${d.id}` })),
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
export async function addSecurityFollowUp(entityType: 'Visit' | 'ExitPass' | 'RoadTestPermit' | 'SecurityIncident' | 'GateDelivery', id: string, note: string): Promise<void> {
  const r = await requireFrontDesk();
  if (!note.trim()) throw new SecurityError('Write the follow-up note.');
  const exists =
    entityType === 'Visit'
      ? await prisma.visit.findUnique({ where: { id }, select: { id: true } })
      : entityType === 'ExitPass'
        ? await prisma.exitPass.findUnique({ where: { id }, select: { id: true } })
        : entityType === 'RoadTestPermit'
          ? await prisma.roadTestPermit.findUnique({ where: { id }, select: { id: true } })
          : entityType === 'SecurityIncident'
            ? await prisma.securityIncident.findUnique({ where: { id }, select: { id: true } })
            : await prisma.gateDelivery.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new SecurityError('Record not found.');
  await writeAuditLog({ userId: r.userId, action: 'security.follow_up', entityType, entityId: id, metadata: { note: note.trim() } });
}

export type SecurityRecord = { type: 'VISIT' | 'EXIT_PASS' | 'VEHICLE_EXIT' | 'ROAD_TEST' | 'INCIDENT' | 'DELIVERY'; id: string; number: string; title: string; detail: string; status: string; at: Date; href: string };

/** The Security register: every visit, exit pass and vehicle exit, newest
 * first, searchable by any number, name or plate. */
export async function searchSecurityRecords(q?: string, type?: string): Promise<SecurityRecord[]> {
  await requireUser();
  const t = q?.trim();
  const want = (x: string) => !type || type === x;
  const [visits, passes, exits, tests] = await Promise.all([
    want('VISIT') ? listVisits(t) : Promise.resolve([]),
    want('EXIT_PASS') ? listExitPasses('all', t) : Promise.resolve([]),
    want('VEHICLE_EXIT') ? listVehicleExits(t) : Promise.resolve([]),
    want('ROAD_TEST') ? listRoadTests('all', t) : Promise.resolve([]),
  ]);
  const [incidents, deliveries] = await Promise.all([want('INCIDENT') ? listIncidents(t, 'all') : Promise.resolve({ rows: [] }), want('DELIVERY') ? listDeliveries(t, 'all') : Promise.resolve({ rows: [] })]);
  return [
    ...visits.map((v: Awaited<ReturnType<typeof listVisits>>[number]) => ({ type: 'VISIT' as const, id: v.id, number: [v.visitNumber, v.passNumber].filter(Boolean).join(' · '), title: v.visitorName, detail: `${v.company ? `${v.company} · ` : ''}${v.purpose} · visiting ${v.host.fullName}`, status: v.status, at: v.checkedInAt ?? v.expectedAt ?? new Date(0), href: `/security/visitors/${v.id}` })),
    ...passes.map((p: Awaited<ReturnType<typeof listExitPasses>>[number]) => ({ type: 'EXIT_PASS' as const, id: p.id, number: p.passNumber, title: p.people.map((x: { name: string }) => x.name).join(', '), detail: p.reason, status: p.status, at: p.createdAt, href: `/security/exit-passes/${p.id}` })),
    ...incidents.rows.map((r: { id: string; incidentNumber: string; type: string; location: string; status: string; occurredAt: Date; severity: string }) => ({ type: 'INCIDENT' as const, id: r.id, number: r.incidentNumber, title: r.type, detail: `${r.severity.toLowerCase()} · ${r.location}`, status: r.status, at: r.occurredAt, href: `/security/incidents/${r.id}` })),
    ...deliveries.rows.map((d: { id: string; deliveryNumber: string; supplierName: string; items: string; status: string; arrivedAt: Date | null; expectedAt: Date | null }) => ({ type: 'DELIVERY' as const, id: d.id, number: d.deliveryNumber, title: d.supplierName, detail: d.items, status: d.status, at: d.arrivedAt ?? d.expectedAt ?? new Date(0), href: `/security/deliveries/${d.id}` })),
    ...tests.map((r: Awaited<ReturnType<typeof listRoadTests>>[number]) => ({ type: 'ROAD_TEST' as const, id: r.id, number: r.permitNumber, title: `${[r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}${r.vehicle.plateNumber ? ` — ${r.vehicle.plateNumber}` : ''}`, detail: `${r.jobCard?.jobNumber ?? r.vehicleService?.serviceNumber ?? ''} · driver ${r.driver.fullName} · ${r.purpose}`, status: r.status, at: r.gateOutAt ?? r.createdAt, href: `/security/road-tests/${r.id}` })),
    ...exits.map((x: Awaited<ReturnType<typeof listVehicleExits>>[number]) => ({ type: 'VEHICLE_EXIT' as const, id: x.id, number: x.exitNumber, title: `${[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}${x.vehicle.plateNumber ? ` — ${x.vehicle.plateNumber}` : ''}`, detail: `${x.jobCard?.jobNumber ?? x.vehicleService?.serviceNumber ?? ''} · ${x.jobCard?.customer.fullName ?? x.vehicleService?.customer.fullName ?? ''}`, status: 'LEFT', at: x.exitedAt, href: `/security/vehicles/exits/${x.id}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

// ── Road Test Permits ─────────────────────────────────────────────────
//
// A workshop vehicle leaving for a road test: requested on its Job Card /
// Vehicle Service, approved by the Manager, and timed + odometer-read out
// and back in by Security. The vehicle's odometer is updated on return.

const JC_ACTIVE = ['CHECKED_IN', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'AWAITING_CUSTOMER_APPROVAL', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'];
const VS_ACTIVE = ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'];
const RT_OPEN: ('PENDING_MANAGER' | 'APPROVED' | 'OUT')[] = ['PENDING_MANAGER', 'APPROVED', 'OUT'];

export type RoadTestInput = { jobCardId?: string; vehicleServiceId?: string; driverId: string; purpose: string; route?: string; expectedDurationMinutes: number };

export async function requestRoadTest(input: RoadTestInput): Promise<{ id: string; permitNumber: string }> {
  const user = await requireUser();
  if (!input.jobCardId === !input.vehicleServiceId) throw new SecurityError('A road test belongs to one Job Card or one Vehicle Service.');
  if (!input.purpose.trim()) throw new SecurityError('Say what the road test is checking.');
  if (!input.driverId) throw new SecurityError('Choose who will drive.');
  if (!Number.isInteger(input.expectedDurationMinutes) || input.expectedDurationMinutes < 5 || input.expectedDurationMinutes > 480) throw new SecurityError('Expected duration must be between 5 minutes and 8 hours.');
  const rec = input.jobCardId
    ? await prisma.jobCard.findUnique({ where: { id: input.jobCardId }, select: { status: true, jobNumber: true, vehicleId: true } }).then((j: { status: string; jobNumber: string; vehicleId: string } | null) => j && { active: JC_ACTIVE.includes(j.status), number: j.jobNumber, vehicleId: j.vehicleId })
    : await prisma.vehicleService.findUnique({ where: { id: input.vehicleServiceId! }, select: { status: true, serviceNumber: true, vehicleId: true } }).then((v: { status: string; serviceNumber: string; vehicleId: string } | null) => v && { active: VS_ACTIVE.includes(v.status), number: v.serviceNumber, vehicleId: v.vehicleId });
  if (!rec) throw new SecurityError('Record not found.');
  if (!rec.active) throw new SecurityError('This vehicle is not in the workshop — a road test can only be requested while it is being worked on.');
  const open = await prisma.roadTestPermit.findFirst({ where: { vehicleId: rec.vehicleId, status: { in: RT_OPEN } }, select: { permitNumber: true } });
  if (open) throw new SecurityError(`This vehicle already has an open road test (${open.permitNumber}).`);
  const driver = await prisma.user.findUnique({ where: { id: input.driverId }, select: { isActive: true, fullName: true } });
  if (!driver?.isActive) throw new SecurityError('The driver must be an active member of staff.');
  const permitNumber = await nextNumber('RT');
  const permit = await prisma.roadTestPermit.create({
    data: {
      permitNumber, branchId: await getWorkshopBranchId(), jobCardId: input.jobCardId ?? null, vehicleServiceId: input.vehicleServiceId ?? null, vehicleId: rec.vehicleId,
      requestedById: user.id, driverId: input.driverId, purpose: input.purpose.trim(), route: input.route?.trim() || null, expectedDurationMinutes: input.expectedDurationMinutes,
    },
  });
  const meta = { permitNumber, number: rec.number, driver: driver.fullName };
  await writeAuditLog({ userId: user.id, action: 'road_test.requested', entityType: 'RoadTestPermit', entityId: permit.id, metadata: meta });
  await writeAuditLog({ userId: user.id, action: 'road_test.requested', entityType: input.jobCardId ? 'JobCard' : 'VehicleService', entityId: (input.jobCardId ?? input.vehicleServiceId)!, metadata: meta });
  await sendLogged('RoadTestPermit', permit.id, await managerApprovers(user.id), `Road test ${permitNumber} needs your approval`, 'A road test needs your approval', [`${permitNumber} — ${rec.number}`, `Driver: ${driver.fullName}`, `Checking: ${input.purpose.trim()}`, `Expected: ${durationText(input.expectedDurationMinutes)}`], `/security/road-tests/${permit.id}`, user.id);
  return { id: permit.id, permitNumber };
}

async function roadTestRecordAudit(p: { jobCardId: string | null; vehicleServiceId: string | null }, userId: string, action: string, metadata: Record<string, unknown>) {
  const entityType = p.jobCardId ? 'JobCard' : 'VehicleService';
  const entityId = p.jobCardId ?? p.vehicleServiceId;
  if (entityId) await writeAuditLog({ userId, action, entityType, entityId, metadata });
}

export async function decideRoadTest(id: string, approve: boolean, reason: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const p = await prisma.roadTestPermit.findUnique({ where: { id }, select: { status: true, permitNumber: true, requestedById: true, jobCardId: true, vehicleServiceId: true, requestedBy: { select: { id: true, fullName: true, email: true } } } });
  if (!p) throw new SecurityError('Road test not found.');
  if (p.status !== 'PENDING_MANAGER') throw new SecurityError('This road test is not waiting for a decision.');
  if (p.requestedById === user.id && !roles.isMaster) throw new SecurityError('You cannot approve your own road test.');
  if (!roles.isMaster && !(await managerApprovers(p.requestedById)).some((m) => m.id === user.id)) throw new SecurityError('Only the Manager can decide a road test.');
  if (!approve && !reason.trim()) throw new SecurityError('Give a reason for declining.');
  const now = new Date();
  await prisma.roadTestPermit.update({ where: { id }, data: approve ? { status: 'APPROVED', managerApprovedById: user.id, managerApprovedAt: now } : { status: 'DECLINED', declinedById: user.id, declinedAt: now, declineReason: reason.trim() } });
  const action = approve ? 'road_test.approved' : 'road_test.declined';
  const meta = { permitNumber: p.permitNumber, reason: reason.trim() || undefined };
  await writeAuditLog({ userId: user.id, action, entityType: 'RoadTestPermit', entityId: id, metadata: meta });
  await roadTestRecordAudit(p, user.id, action, meta);
  await sendLogged('RoadTestPermit', id, approve ? [p.requestedBy, ...(await gateStaff())] : [p.requestedBy], `Road test ${p.permitNumber} ${approve ? 'approved' : 'declined'}`, approve ? 'Road test approved' : 'Road test declined', approve ? [p.permitNumber, 'Security will record the time out and odometer at the gate.'] : [p.permitNumber, `Reason: ${reason.trim()}`], `/security/road-tests/${id}`, user.id);
}

export async function cancelRoadTest(id: string, reason: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const p = await prisma.roadTestPermit.findUnique({ where: { id }, select: { status: true, permitNumber: true, requestedById: true, jobCardId: true, vehicleServiceId: true } });
  if (!p) throw new SecurityError('Road test not found.');
  if (p.requestedById !== user.id && !roles.isManager && !roles.isMaster) throw new SecurityError('Only the requester or the Manager can cancel.');
  if (!['PENDING_MANAGER', 'APPROVED'].includes(p.status)) throw new SecurityError('A road test already out cannot be cancelled — record its return.');
  if (!reason.trim()) throw new SecurityError('Give a reason for cancelling.');
  await prisma.roadTestPermit.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
  const meta = { permitNumber: p.permitNumber, reason: reason.trim() };
  await writeAuditLog({ userId: user.id, action: 'road_test.cancelled', entityType: 'RoadTestPermit', entityId: id, metadata: meta });
  await roadTestRecordAudit(p, user.id, 'road_test.cancelled', meta);
}

/** Out through the gate — approved permits only, with the odometer. */
export async function roadTestGateOut(id: string, startOdometer: number): Promise<void> {
  const r = await requireGate();
  const p = await prisma.roadTestPermit.findUnique({ where: { id }, select: { status: true, permitNumber: true, jobCardId: true, vehicleServiceId: true, vehicle: { select: { mileage: true } } } });
  if (!p) throw new SecurityError('Road test not found.');
  if (p.status !== 'APPROVED') throw new SecurityError('Only an approved road test can go out — Security will not permit it without the Manager\'s approval.');
  if (!Number.isInteger(startOdometer) || startOdometer < 0) throw new SecurityError('Enter the odometer reading (km) as a whole number.');
  if (p.vehicle.mileage !== null && startOdometer < p.vehicle.mileage) throw new SecurityError(`That is below the vehicle's last recorded reading (${p.vehicle.mileage.toLocaleString('en-NG')} km) — check the odometer.`);
  await prisma.roadTestPermit.update({ where: { id }, data: { status: 'OUT', gateOutAt: new Date(), gateOutById: r.userId, startOdometer } });
  const meta = { permitNumber: p.permitNumber, odometer: startOdometer };
  await writeAuditLog({ userId: r.userId, action: 'road_test.gate_out', entityType: 'RoadTestPermit', entityId: id, metadata: meta });
  await roadTestRecordAudit(p, r.userId, 'road_test.gate_out', meta);
}

/** Back through the gate — end odometer (never below the start); the
 * vehicle's odometer is updated so every page stays in sync. */
export async function roadTestGateIn(id: string, endOdometer: number, notes: string): Promise<void> {
  const r = await requireGate();
  const p = await prisma.roadTestPermit.findUnique({ where: { id }, select: { status: true, permitNumber: true, startOdometer: true, gateOutAt: true, vehicleId: true, jobCardId: true, vehicleServiceId: true, vehicle: { select: { mileage: true } } } });
  if (!p) throw new SecurityError('Road test not found.');
  if (p.status !== 'OUT') throw new SecurityError('Only a vehicle out on a road test can be recorded back in.');
  if (!Number.isInteger(endOdometer) || endOdometer < 0) throw new SecurityError('Enter the odometer reading (km) as a whole number.');
  if (p.startOdometer !== null && endOdometer < p.startOdometer) throw new SecurityError(`The reading can't be lower than when it went out (${p.startOdometer.toLocaleString('en-NG')} km).`);
  const now = new Date();
  await prisma.roadTestPermit.update({ where: { id }, data: { status: 'RETURNED', gateInAt: now, gateInById: r.userId, endOdometer, returnNotes: notes.trim() || null } });
  if (p.vehicle.mileage === null || endOdometer > p.vehicle.mileage) await prisma.customerVehicle.update({ where: { id: p.vehicleId }, data: { mileage: endOdometer } });
  const meta = { permitNumber: p.permitNumber, odometer: endOdometer, distance: p.startOdometer !== null ? endOdometer - p.startOdometer : undefined, away: p.gateOutAt ? durationText((now.getTime() - new Date(p.gateOutAt).getTime()) / 60000) : undefined, notes: notes.trim() || undefined };
  await writeAuditLog({ userId: r.userId, action: 'road_test.gate_in', entityType: 'RoadTestPermit', entityId: id, metadata: meta });
  await roadTestRecordAudit(p, r.userId, 'road_test.gate_in', meta);
}

export async function extendRoadTest(id: string, extraMinutes: number, reason: string): Promise<void> {
  const r = await requireGate();
  if (!Number.isInteger(extraMinutes) || extraMinutes < 5 || extraMinutes > 240) throw new SecurityError('Choose how much more time — between 5 minutes and 4 hours.');
  if (!reason.trim()) throw new SecurityError('Give the reason for the extra time.');
  const p = await prisma.roadTestPermit.findUnique({ where: { id }, select: { status: true, permitNumber: true, expectedDurationMinutes: true } });
  if (!p) throw new SecurityError('Road test not found.');
  if (p.status !== 'OUT') throw new SecurityError('Only a vehicle out on a road test can be given more time.');
  await prisma.roadTestPermit.update({ where: { id }, data: { expectedDurationMinutes: p.expectedDurationMinutes + extraMinutes } });
  await writeAuditLog({ userId: r.userId, action: 'road_test.extended', entityType: 'RoadTestPermit', entityId: id, metadata: { permitNumber: p.permitNumber, extra: durationText(extraMinutes), reason: reason.trim() } });
}

const RT_ROW = {
  id: true, permitNumber: true, status: true, purpose: true, route: true, expectedDurationMinutes: true, gateOutAt: true, gateInAt: true, startOdometer: true, endOdometer: true, createdAt: true, requestedById: true,
  jobCard: { select: { id: true, jobNumber: true } }, vehicleService: { select: { id: true, serviceNumber: true } },
  vehicle: { select: { id: true, make: true, model: true, plateNumber: true } }, driver: { select: { fullName: true } }, requestedBy: { select: { fullName: true } },
} as const;

export async function listRoadTests(scope: 'to_decide' | 'approved' | 'out' | 'all', q?: string) {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const t = q?.trim();
  const status = scope === 'to_decide' ? 'PENDING_MANAGER' : scope === 'approved' ? 'APPROVED' : scope === 'out' ? 'OUT' : undefined;
  const rows = await prisma.roadTestPermit.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(scope === 'to_decide' ? { NOT: { requestedById: user.id } } : {}),
      ...(t ? { OR: [{ permitNumber: { contains: t, mode: 'insensitive' } }, { purpose: { contains: t, mode: 'insensitive' } }, { vehicle: { plateNumber: { contains: t, mode: 'insensitive' } } }, { jobCard: { jobNumber: { contains: t, mode: 'insensitive' } } }, { vehicleService: { serviceNumber: { contains: t, mode: 'insensitive' } } }, { driver: { fullName: { contains: t, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: RT_ROW,
  });
  return scope === 'to_decide' && !roles.isManager && !roles.isMaster ? [] : rows;
}

export async function listRoadTestsFor(opts: { jobCardId?: string; vehicleServiceId?: string }) {
  await requireUser();
  return prisma.roadTestPermit.findMany({ where: opts.jobCardId ? { jobCardId: opts.jobCardId } : { vehicleServiceId: opts.vehicleServiceId }, orderBy: { createdAt: 'desc' }, select: RT_ROW });
}

export async function getRoadTest(id: string) {
  await requireUser();
  return prisma.roadTestPermit.findUnique({
    where: { id },
    include: {
      branch: true,
      jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
      vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { fullName: true } } } },
      vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true, mileage: true } },
      requestedBy: { select: { id: true, fullName: true } }, driver: { select: { fullName: true, phone: true } },
      managerApprovedBy: { select: { fullName: true } }, declinedBy: { select: { fullName: true } }, gateOutBy: { select: { fullName: true } }, gateInBy: { select: { fullName: true } },
    },
  });
}

export async function canDecideRoadTest(id: string): Promise<boolean> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  const p = await prisma.roadTestPermit.findUnique({ where: { id }, select: { status: true, requestedById: true } });
  if (!p || p.status !== 'PENDING_MANAGER') return false;
  if (p.requestedById === user.id && !roles.isMaster) return false;
  return roles.isMaster || (await managerApprovers(p.requestedById)).some((m) => m.id === user.id);
}

/** An exit's whole story: its own trail, plus — from its Job Card /
 * Vehicle Service — the release email(s) to Security and the gate-exit
 * entries (older exits were only recorded there). */
export async function getVehicleExitHistory(exitId: string) {
  await requireUser();
  const x = await prisma.vehicleGateExit.findUnique({ where: { id: exitId }, select: { jobCardId: true, vehicleServiceId: true } });
  if (!x) return { entries: [], emails: [] };
  const recType = x.jobCardId ? 'JobCard' : 'VehicleService';
  const recId = (x.jobCardId ?? x.vehicleServiceId)!;
  const [entries, emails] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ entityType: 'VehicleGateExit', entityId: exitId }, { entityType: recType, entityId: recId, action: { in: ['vehicle.gate_exit', 'security.email_sent', 'security.email_failed'] } }] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, createdAt: true, metadata: true, userId: true, entityType: true },
    }),
    prisma.securityEmailLog.findMany({ where: { OR: [{ entityType: 'VehicleGateExit', entityId: exitId }, { entityType: recType, entityId: recId }] }, orderBy: { createdAt: 'desc' } }),
  ]);
  // The same gate exit is written on the exit AND the record — show it once.
  const seen = new Set<string>();
  const unique = entries.filter((e: (typeof entries)[number]) => {
    if (e.action !== 'vehicle.gate_exit') return true;
    const key = `${(e.metadata as { exitNumber?: string } | null)?.exitNumber ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ids = [...new Set(unique.map((e: { userId: string | null }) => e.userId).filter((v: string | null): v is string => Boolean(v)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return { entries: unique.map((e: (typeof unique)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null })), emails };
}

// ── Security incidents ────────────────────────────────────────────────

export type IncidentInput = { type: string; severity: string; occurredAt: Date; location: string; description: string; peopleInvolved?: string; vehiclePlate?: string; actionTaken?: string; relatedNumber?: string };
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Find the record an incident concerns from any gate number. */
async function resolveRelated(raw?: string): Promise<{ relatedType: string; relatedId: string; relatedNumber: string } | null> {
  const n = raw?.trim().toUpperCase();
  if (!n) return null;
  const hit =
    (await prisma.visit.findFirst({ where: { OR: [{ visitNumber: n }, { passNumber: n }] }, select: { id: true } }).then((r: { id: string } | null) => r && { relatedType: 'Visit', relatedId: r.id })) ??
    (await prisma.exitPass.findUnique({ where: { passNumber: n }, select: { id: true } }).then((r: { id: string } | null) => r && { relatedType: 'ExitPass', relatedId: r.id })) ??
    (await prisma.roadTestPermit.findUnique({ where: { permitNumber: n }, select: { id: true } }).then((r: { id: string } | null) => r && { relatedType: 'RoadTestPermit', relatedId: r.id })) ??
    (await prisma.vehicleGateExit.findUnique({ where: { exitNumber: n }, select: { id: true } }).then((r: { id: string } | null) => r && { relatedType: 'VehicleGateExit', relatedId: r.id })) ??
    (await prisma.gateDelivery.findUnique({ where: { deliveryNumber: n }, select: { id: true } }).then((r: { id: string } | null) => r && { relatedType: 'GateDelivery', relatedId: r.id }));
  if (!hit) throw new SecurityError(`No visit, pass, road test, vehicle exit or delivery numbered ${n} — check the number.`);
  return { ...hit, relatedNumber: n };
}

export async function reportIncident(input: IncidentInput): Promise<{ id: string; incidentNumber: string }> {
  const r = await requireFrontDesk();
  if (!(INCIDENT_TYPES as readonly string[]).includes(input.type)) throw new SecurityError('Choose what kind of incident it was.');
  if (!(SEVERITIES as readonly string[]).includes(input.severity)) throw new SecurityError('Choose how serious it is.');
  const when = new Date(input.occurredAt);
  if (Number.isNaN(when.getTime())) throw new SecurityError('Enter when it happened.');
  if (when.getTime() > Date.now() + 5 * 60000) throw new SecurityError('An incident cannot be in the future.');
  if (!input.location.trim()) throw new SecurityError('Enter where it happened.');
  if (input.description.trim().length < 10) throw new SecurityError('Describe what happened (at least a sentence).');
  const related = await resolveRelated(input.relatedNumber);
  const incidentNumber = await nextNumber('INC');
  const t2 = (v?: string) => v?.trim() || null;
  const inc = await prisma.securityIncident.create({
    data: {
      incidentNumber, branchId: await getWorkshopBranchId(), type: input.type, severity: input.severity as (typeof SEVERITIES)[number], occurredAt: when, location: input.location.trim(), description: input.description.trim(),
      peopleInvolved: t2(input.peopleInvolved), vehiclePlate: t2(input.vehiclePlate)?.toUpperCase() ?? null, actionTaken: t2(input.actionTaken), reportedById: r.userId, ...(related ?? {}),
    },
  });
  await writeAuditLog({ userId: r.userId, action: 'incident.reported', entityType: 'SecurityIncident', entityId: inc.id, metadata: { incidentNumber, type: input.type, severity: input.severity, related: related?.relatedNumber } });
  if (related) await writeAuditLog({ userId: r.userId, action: 'incident.linked', entityType: related.relatedType, entityId: related.relatedId, metadata: { incidentNumber, type: input.type } });
  const serious = input.severity === 'HIGH' || input.severity === 'CRITICAL';
  const chiefs = await usersWithSlugs(['chief-security-officer']);
  const recipients = [...(chiefs.length ? chiefs : await masterAdmins()), ...(serious ? await managerApprovers(null) : [])];
  await sendLogged('SecurityIncident', inc.id, recipients, `${serious ? `${input.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH'} — ` : ''}Security incident ${incidentNumber}: ${input.type}`, 'A security incident has been reported', [`${incidentNumber} — ${input.type} (${input.severity.toLowerCase()})`, `Where: ${input.location.trim()}`, `When: ${when.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}`, input.description.trim(), ...(input.actionTaken?.trim() ? [`Action taken: ${input.actionTaken.trim()}`] : [])], `/security/incidents/${inc.id}`, r.userId);
  return { id: inc.id, incidentNumber };
}

async function requireChief(): Promise<SecurityRoles> {
  const r = await getSecurityRoles();
  if (!r.isCso && !r.isMaster) throw new SecurityError('Only the Chief Security Officer can do this.');
  return r;
}

export async function assignIncident(id: string, assigneeId: string): Promise<void> {
  const r = await requireChief();
  const inc = await prisma.securityIncident.findUnique({ where: { id }, select: { status: true, incidentNumber: true, type: true } });
  if (!inc) throw new SecurityError('Incident not found.');
  if (inc.status === 'CLOSED') throw new SecurityError('This incident is closed — reopen it first.');
  const staff = await gateStaff();
  const who = staff.find((s) => s.id === assigneeId);
  if (!who) throw new SecurityError('Assign it to a Security Officer or the Chief Security Officer.');
  await prisma.securityIncident.update({ where: { id }, data: { assignedToId: assigneeId, status: 'UNDER_REVIEW' } });
  await writeAuditLog({ userId: r.userId, action: 'incident.assigned', entityType: 'SecurityIncident', entityId: id, metadata: { incidentNumber: inc.incidentNumber, to: who.fullName } });
  await sendLogged('SecurityIncident', id, [who], `Incident ${inc.incidentNumber} assigned to you`, 'An incident has been assigned to you', [`${inc.incidentNumber} — ${inc.type}`, 'Please follow it up and record your notes on the incident.'], `/security/incidents/${id}`, r.userId);
}

export async function closeIncident(id: string, resolution: string): Promise<void> {
  const r = await requireChief();
  if (resolution.trim().length < 5) throw new SecurityError('Write how the incident was resolved.');
  const inc = await prisma.securityIncident.findUnique({ where: { id }, select: { status: true, incidentNumber: true } });
  if (!inc) throw new SecurityError('Incident not found.');
  if (inc.status === 'CLOSED') throw new SecurityError('This incident is already closed.');
  await prisma.securityIncident.update({ where: { id }, data: { status: 'CLOSED', resolution: resolution.trim(), closedAt: new Date(), closedById: r.userId } });
  await writeAuditLog({ userId: r.userId, action: 'incident.closed', entityType: 'SecurityIncident', entityId: id, metadata: { incidentNumber: inc.incidentNumber, resolution: resolution.trim() } });
}

export async function reopenIncident(id: string, reason: string): Promise<void> {
  const r = await requireChief();
  if (!reason.trim()) throw new SecurityError('Give the reason for reopening.');
  const inc = await prisma.securityIncident.findUnique({ where: { id }, select: { status: true, incidentNumber: true } });
  if (!inc) throw new SecurityError('Incident not found.');
  if (inc.status !== 'CLOSED') throw new SecurityError('Only a closed incident can be reopened.');
  await prisma.securityIncident.update({ where: { id }, data: { status: 'UNDER_REVIEW', closedAt: null, closedById: null } });
  await writeAuditLog({ userId: r.userId, action: 'incident.reopened', entityType: 'SecurityIncident', entityId: id, metadata: { incidentNumber: inc.incidentNumber, reason: reason.trim() } });
}

const INCIDENT_TABS = ['open', 'under_review', 'closed', 'all'] as const;
export async function listIncidents(q?: string, tab?: string, severity?: string) {
  await requireUser();
  const t2 = q?.trim();
  const rows = await prisma.securityIncident.findMany({
    where: {
      ...(severity && (SEVERITIES as readonly string[]).includes(severity) ? { severity: severity as (typeof SEVERITIES)[number] } : {}),
      ...(t2 ? { OR: [{ incidentNumber: { contains: t2, mode: 'insensitive' } }, { type: { contains: t2, mode: 'insensitive' } }, { location: { contains: t2, mode: 'insensitive' } }, { description: { contains: t2, mode: 'insensitive' } }, { peopleInvolved: { contains: t2, mode: 'insensitive' } }, { vehiclePlate: { contains: t2, mode: 'insensitive' } }, { relatedNumber: { contains: t2, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take: 500,
    select: { id: true, incidentNumber: true, type: true, severity: true, status: true, occurredAt: true, location: true, relatedNumber: true, reportedBy: { select: { fullName: true } }, assignedTo: { select: { fullName: true } } },
  });
  const is: Record<(typeof INCIDENT_TABS)[number], (r: (typeof rows)[number]) => boolean> = { open: (r) => r.status === 'OPEN', under_review: (r) => r.status === 'UNDER_REVIEW', closed: (r) => r.status === 'CLOSED', all: () => true };
  const current = ((INCIDENT_TABS as readonly string[]).includes(tab ?? '') ? tab : 'open') as (typeof INCIDENT_TABS)[number];
  return { tab: current, counts: Object.fromEntries(INCIDENT_TABS.map((k) => [k, rows.filter(is[k]).length])) as Record<(typeof INCIDENT_TABS)[number], number>, rows: rows.filter(is[current]) };
}

export async function getIncident(id: string) {
  await requireUser();
  return prisma.securityIncident.findUnique({ where: { id }, include: { branch: true, reportedBy: { select: { fullName: true } }, assignedTo: { select: { id: true, fullName: true } }, closedBy: { select: { fullName: true } } } });
}

export async function listGateStaffOptions() {
  await requireUser();
  return gateStaff();
}

// ── Deliveries ────────────────────────────────────────────────────────

async function storeStaff(): Promise<Person[]> {
  const branchId = await getWorkshopBranchId();
  const [m, o] = await Promise.all([listEligibleStoreManagersForBranch(branchId), listEligibleStoreOfficersForBranch(branchId)]);
  const all = [...m.staff, ...o.staff] as Person[];
  return all.filter((p, i) => all.findIndex((x) => x.id === p.id) === i);
}
async function isStore(userId: string, isMaster: boolean) {
  return isMaster || (await storeStaff()).some((s) => s.id === userId);
}

export type DeliveryInput = { supplierName: string; reference?: string; items: string; expectedAt?: Date; driverName?: string; driverPhone?: string; vehicleType?: string; vehiclePlate?: string; notes?: string };

/** The Store (or Security) announces a delivery before it arrives. */
export async function expectDelivery(input: DeliveryInput): Promise<{ id: string; deliveryNumber: string }> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  if (!roles.isFrontDesk && !(await isStore(user.id, roles.isMaster))) throw new SecurityError('Only the Store or Security can announce a delivery.');
  if (!input.supplierName.trim()) throw new SecurityError('Enter the supplier.');
  if (!input.items.trim()) throw new SecurityError('Say what is being delivered.');
  if (!input.expectedAt || Number.isNaN(new Date(input.expectedAt).getTime())) throw new SecurityError('Enter when it is expected.');
  const deliveryNumber = await nextNumber('DLV');
  const d = await prisma.gateDelivery.create({ data: { deliveryNumber, branchId: await getWorkshopBranchId(), status: 'EXPECTED', supplierName: input.supplierName.trim(), reference: input.reference?.trim() || null, items: input.items.trim(), expectedAt: input.expectedAt, notes: input.notes?.trim() || null, registeredById: user.id } });
  await writeAuditLog({ userId: user.id, action: 'delivery.expected', entityType: 'GateDelivery', entityId: d.id, metadata: { deliveryNumber, supplier: input.supplierName.trim(), reference: input.reference?.trim() || undefined } });
  await sendLogged('GateDelivery', d.id, await gateStaff(), `Delivery expected — ${input.supplierName.trim()}`, 'Expect a delivery', [`${deliveryNumber} — ${input.supplierName.trim()}`, `Items: ${input.items.trim()}`, ...(input.reference?.trim() ? [`Reference: ${input.reference.trim()}`] : []), `Expected: ${new Date(input.expectedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}`], `/security/deliveries/${d.id}`, user.id);
  return { id: d.id, deliveryNumber };
}

function cleanArrivalDelivery(i: DeliveryInput) {
  if (!i.driverName?.trim()) throw new SecurityError("Enter the driver's name.");
  if (!i.vehicleType || !VEHICLE_TYPES.includes(i.vehicleType as VehicleType)) throw new SecurityError('Choose how the delivery came.');
  const plate = i.vehiclePlate?.trim().toUpperCase() || null;
  if (i.vehicleType !== 'ON_FOOT' && !plate) throw new SecurityError('Enter the plate number of the delivery vehicle.');
  return { driverName: i.driverName.trim(), driverPhone: i.driverPhone?.trim() || null, vehicleType: i.vehicleType, vehiclePlate: i.vehicleType === 'ON_FOOT' ? null : plate };
}

/** A delivery arrives at the gate — announced (id) or not. The Store is told. */
export async function recordDeliveryArrival(input: DeliveryInput, deliveryId?: string): Promise<{ id: string; deliveryNumber: string }> {
  const r = await requireGate();
  const arrival = cleanArrivalDelivery(input);
  let id: string, deliveryNumber: string, supplier: string, items: string, reference: string | null;
  if (deliveryId) {
    const d = await prisma.gateDelivery.findUnique({ where: { id: deliveryId }, select: { status: true, deliveryNumber: true, supplierName: true, items: true, reference: true } });
    if (!d) throw new SecurityError('Delivery not found.');
    if (d.status !== 'EXPECTED') throw new SecurityError('Only an expected delivery can be recorded as arriving.');
    await prisma.gateDelivery.update({ where: { id: deliveryId }, data: { ...arrival, status: 'AT_GATE', arrivedAt: new Date(), arrivedById: r.userId } });
    id = deliveryId; deliveryNumber = d.deliveryNumber; supplier = d.supplierName; items = d.items; reference = d.reference;
  } else {
    if (!input.supplierName.trim()) throw new SecurityError('Enter the supplier.');
    if (!input.items.trim()) throw new SecurityError('Say what is being delivered.');
    deliveryNumber = await nextNumber('DLV');
    const d = await prisma.gateDelivery.create({ data: { deliveryNumber, branchId: await getWorkshopBranchId(), status: 'AT_GATE', supplierName: input.supplierName.trim(), reference: input.reference?.trim() || null, items: input.items.trim(), notes: input.notes?.trim() || null, ...arrival, arrivedAt: new Date(), arrivedById: r.userId, registeredById: r.userId } });
    id = d.id; supplier = d.supplierName; items = d.items; reference = d.reference;
  }
  await writeAuditLog({ userId: r.userId, action: 'delivery.arrived', entityType: 'GateDelivery', entityId: id, metadata: { deliveryNumber, supplier, vehicle: arrival.vehiclePlate ?? 'On foot', driver: arrival.driverName } });
  await sendLogged('GateDelivery', id, await storeStaff(), `Delivery at the gate — ${supplier}`, 'A delivery is at the gate for the Store', [`${deliveryNumber} — ${supplier}`, `Items: ${items}`, ...(reference ? [`Reference: ${reference}`] : []), `Driver: ${arrival.driverName}${arrival.vehiclePlate ? ` · ${arrival.vehiclePlate}` : ''}`, 'Please receive it and record the goods receipt.'], `/security/deliveries/${id}`, r.userId);
  return { id, deliveryNumber };
}

/** The Store confirms it has received the goods (optionally its GRN). */
export async function confirmDeliveryReceived(id: string, note: string, goodsReceiptId?: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  if (!(await isStore(user.id, roles.isMaster))) throw new SecurityError('Only Store staff can confirm a delivery was received.');
  const d = await prisma.gateDelivery.findUnique({ where: { id }, select: { status: true, deliveryNumber: true } });
  if (!d) throw new SecurityError('Delivery not found.');
  if (d.status !== 'AT_GATE') throw new SecurityError('Only a delivery at the gate can be received.');
  let grn: { id: string; referenceNumber: string } | null = null;
  if (goodsReceiptId) {
    grn = await prisma.goodsReceipt.findUnique({ where: { id: goodsReceiptId }, select: { id: true, referenceNumber: true } });
    if (!grn) throw new SecurityError('That goods receipt was not found.');
  }
  await prisma.gateDelivery.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: new Date(), receivedById: user.id, receiptNote: note.trim() || null, goodsReceiptId: grn?.id ?? null } });
  await writeAuditLog({ userId: user.id, action: 'delivery.received', entityType: 'GateDelivery', entityId: id, metadata: { deliveryNumber: d.deliveryNumber, grn: grn?.referenceNumber, note: note.trim() || undefined } });
}

/** The delivery vehicle leaves. Turned away without receipt → a reason. */
export async function recordDeliveryLeft(id: string, reason: string): Promise<void> {
  const r = await requireGate();
  const d = await prisma.gateDelivery.findUnique({ where: { id }, select: { status: true, deliveryNumber: true } });
  if (!d) throw new SecurityError('Delivery not found.');
  if (d.status !== 'AT_GATE' && d.status !== 'RECEIVED') throw new SecurityError('Only a delivery on site can leave.');
  if (d.status === 'AT_GATE' && !reason.trim()) throw new SecurityError('The Store has not received it — give the reason it is leaving (e.g. turned away, wrong items).');
  await prisma.gateDelivery.update({ where: { id }, data: { status: 'LEFT', leftAt: new Date(), leftById: r.userId, ...(reason.trim() ? { notes: reason.trim() } : {}) } });
  await writeAuditLog({ userId: r.userId, action: 'delivery.left', entityType: 'GateDelivery', entityId: id, metadata: { deliveryNumber: d.deliveryNumber, received: d.status === 'RECEIVED', reason: reason.trim() || undefined } });
}

export async function cancelDelivery(id: string, reason: string): Promise<void> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  if (!roles.isFrontDesk && !(await isStore(user.id, roles.isMaster))) throw new SecurityError('Only the Store or Security can cancel a delivery.');
  if (!reason.trim()) throw new SecurityError('Give a reason for cancelling.');
  const d = await prisma.gateDelivery.findUnique({ where: { id }, select: { status: true, deliveryNumber: true, supplierName: true } });
  if (!d) throw new SecurityError('Delivery not found.');
  if (d.status !== 'EXPECTED') throw new SecurityError('Only an expected delivery can be cancelled.');
  await prisma.gateDelivery.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
  await writeAuditLog({ userId: user.id, action: 'delivery.cancelled', entityType: 'GateDelivery', entityId: id, metadata: { deliveryNumber: d.deliveryNumber, reason: reason.trim() } });
  await sendLogged('GateDelivery', id, await gateStaff(), `Delivery cancelled — ${d.supplierName}`, 'An expected delivery was cancelled', [`${d.deliveryNumber} — ${d.supplierName}`, `Reason: ${reason.trim()}`], `/security/deliveries/${id}`, user.id);
}

const DELIVERY_TABS = ['expected', 'at_gate', 'received', 'left', 'cancelled', 'all'] as const;
export async function listDeliveries(q?: string, tab?: string) {
  await requireUser();
  const t2 = q?.trim();
  const rows = await prisma.gateDelivery.findMany({
    where: t2 ? { OR: [{ deliveryNumber: { contains: t2, mode: 'insensitive' } }, { supplierName: { contains: t2, mode: 'insensitive' } }, { reference: { contains: t2, mode: 'insensitive' } }, { items: { contains: t2, mode: 'insensitive' } }, { vehiclePlate: { contains: t2, mode: 'insensitive' } }, { driverName: { contains: t2, mode: 'insensitive' } }] } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, deliveryNumber: true, status: true, supplierName: true, reference: true, items: true, expectedAt: true, arrivedAt: true, receivedAt: true, leftAt: true, vehiclePlate: true, driverName: true, goodsReceipt: { select: { id: true, referenceNumber: true } } },
  });
  const is: Record<(typeof DELIVERY_TABS)[number], (r: (typeof rows)[number]) => boolean> = { expected: (r) => r.status === 'EXPECTED', at_gate: (r) => r.status === 'AT_GATE', received: (r) => r.status === 'RECEIVED', left: (r) => r.status === 'LEFT', cancelled: (r) => r.status === 'CANCELLED', all: () => true };
  const current = ((DELIVERY_TABS as readonly string[]).includes(tab ?? '') ? tab : 'at_gate') as (typeof DELIVERY_TABS)[number];
  return { tab: current, counts: Object.fromEntries(DELIVERY_TABS.map((k) => [k, rows.filter(is[k]).length])) as Record<(typeof DELIVERY_TABS)[number], number>, rows: rows.filter(is[current]) };
}

export async function getDelivery(id: string) {
  await requireUser();
  return prisma.gateDelivery.findUnique({ where: { id }, include: { registeredBy: { select: { fullName: true } }, arrivedBy: { select: { fullName: true } }, receivedBy: { select: { fullName: true } }, leftBy: { select: { fullName: true } }, goodsReceipt: { select: { id: true, referenceNumber: true, supplierName: true, receivedAt: true } } } });
}

/** Can this person act for the Store? (for the delivery page) */
export async function canActForStore(): Promise<boolean> {
  const user = await requireUser();
  const roles = await getSecurityRoles();
  return isStore(user.id, roles.isMaster);
}

/** Recent goods receipts to link a received delivery to. */
export async function listRecentGoodsReceipts() {
  await requireUser();
  return prisma.goodsReceipt.findMany({ where: { receivedAt: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { receivedAt: 'desc' }, take: 50, select: { id: true, referenceNumber: true, supplierName: true, receivedAt: true } });
}
