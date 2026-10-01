'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopBranchId } from './workshop';
import { sendLoggedEmail, type Recipient } from '@/lib/logged-email';
import { sendDueAppointmentReminders } from '@/lib/appointment-reminders';
import { computeSchedulingAnalytics } from '@/lib/scheduling-analytics';

class SchedulingError extends Error {}

const fmt = (d: Date) => new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const mins = (a: Date, b: Date) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

// ── Access ────────────────────────────────────────────────────────────

export type SchedulingAccess = {
  userId: string;
  isMaster: boolean;
  isAdmin: boolean;
  isCalendarUser: boolean;
  /** Calendars this person may book on (own, delegated, or all for admins). */
  owners: { id: string; fullName: string; mine: boolean }[];
  canUse: boolean;
};

/** Who may use Scheduling is the organisation's choice: "Calendar User"
 * keeps their own calendar; an official can let aides book for them;
 * "Scheduling Admin" manages rooms and aides and can book for anyone. */
export async function getSchedulingAccess(): Promise<SchedulingAccess> {
  const user = await requireUser();
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  const slugs = roles.map((r: { role: { slug: string } }) => r.role.slug);
  const isMaster = roles.some((r: { role: { isSuperAdmin: boolean } }) => r.role.isSuperAdmin);
  const isAdmin = isMaster || slugs.includes('scheduling-admin');
  const isCalendarUser = slugs.includes('calendar-user');
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, fullName: true } });
  let owners: { id: string; fullName: string; mine: boolean }[] = [];
  if (isAdmin) {
    const all = await prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { slug: 'calendar-user' } } } }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
    owners = all.map((u: { id: string; fullName: string }) => ({ ...u, mine: u.id === user.id }));
  } else {
    const delegated = await prisma.calendarDelegate.findMany({ where: { delegateId: user.id, owner: { isActive: true } }, select: { owner: { select: { id: true, fullName: true } } } });
    owners = delegated.map((d: { owner: { id: string; fullName: string } }) => ({ ...d.owner, mine: false }));
  }
  if ((isCalendarUser || isAdmin) && me && !owners.some((o) => o.id === me.id)) owners.unshift({ ...me, mine: true });
  return { userId: user.id, isMaster, isAdmin, isCalendarUser, owners, canUse: owners.length > 0 };
}

async function requireBookFor(ownerId: string): Promise<SchedulingAccess> {
  const a = await getSchedulingAccess();
  if (!a.owners.some((o) => o.id === ownerId)) throw new SchedulingError('You cannot book on that calendar — ask its owner to add you as an aide.');
  return a;
}

// ── Numbering ─────────────────────────────────────────────────────────

async function nextNumber(prefix: 'APT' | 'VIS'): Promise<string> {
  const start = `${prefix}-${new Date().getFullYear()}-`;
  const latest =
    prefix === 'APT'
      ? (await prisma.appointment.findFirst({ where: { appointmentNumber: { startsWith: start } }, orderBy: { appointmentNumber: 'desc' }, select: { appointmentNumber: true } }))?.appointmentNumber
      : (await prisma.visit.findFirst({ where: { visitNumber: { startsWith: start } }, orderBy: { visitNumber: 'desc' }, select: { visitNumber: true } }))?.visitNumber;
  const n = latest ? parseInt(latest.slice(start.length), 10) + 1 : 1;
  return `${start}${String(n).padStart(6, '0')}`;
}

// ── Appointments ──────────────────────────────────────────────────────

export type AppointmentInput = {
  ownerId: string;
  title: string;
  agenda?: string;
  startsAt: Date;
  endsAt: Date;
  roomId?: string;
  location?: string;
  participantIds: string[];
  /** External visitors — become a Security booking (same details as
   * "Book a visit for later"; the meeting's time and length are used). */
  visitors?: { names: string[]; organisation?: string; phone?: string; purpose: string };
};

function clean(i: AppointmentInput) {
  if (!i.title.trim()) throw new SchedulingError('Give the appointment a title.');
  const s = new Date(i.startsAt), e = new Date(i.endsAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new SchedulingError('Choose the date, start time and duration.');
  if (e.getTime() <= s.getTime()) throw new SchedulingError('The appointment must end after it starts.');
  if (mins(s, e) > 12 * 60) throw new SchedulingError('An appointment can last at most 12 hours.');
  if (!i.roomId && !i.location?.trim()) throw new SchedulingError('Choose a meeting room or say where it will hold.');
  const names = (i.visitors?.names ?? []).map((n) => n.trim()).filter(Boolean);
  if (i.visitors && (i.visitors.names.length === 0 || names.length !== i.visitors.names.length)) throw new SchedulingError('Enter a name for every visitor.');
  if (i.visitors && !i.visitors.purpose.trim()) throw new SchedulingError('Enter the purpose of the visit.');
  return {
    title: i.title.trim(), agenda: i.agenda?.trim() || null, startsAt: s, endsAt: e, roomId: i.roomId || null, location: i.roomId ? null : i.location!.trim(),
    participantIds: [...new Set(i.participantIds.filter((x) => x && x !== i.ownerId))],
    visitors: names.length ? cleanGroup(i.visitors!) : null,
  };
}

/** No double-booking: the room, and the official's own time. */
async function assertNoClash(ownerId: string, roomId: string | null, s: Date, e: Date, excludeId?: string) {
  const overlap = { status: 'SCHEDULED' as const, startsAt: { lt: e }, endsAt: { gt: s }, ...(excludeId ? { NOT: { id: excludeId } } : {}) };
  if (roomId) {
    const room = await prisma.meetingRoom.findUnique({ where: { id: roomId }, select: { name: true, isActive: true } });
    if (!room?.isActive) throw new SchedulingError('That meeting room is not available.');
    const clash = await prisma.appointment.findFirst({ where: { ...overlap, roomId }, select: { appointmentNumber: true, startsAt: true, endsAt: true, title: true } });
    if (clash) throw new SchedulingError(`${room.name} is already booked ${fmt(clash.startsAt)} – ${new Date(clash.endsAt).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })} (${clash.appointmentNumber}: ${clash.title}).`);
  }
  const busy = await prisma.appointment.findFirst({ where: { ...overlap, ownerId }, select: { appointmentNumber: true, startsAt: true, title: true } });
  if (busy) throw new SchedulingError(`The host already has ${busy.appointmentNumber} (${busy.title}) at ${fmt(busy.startsAt)}.`);
}

async function gateStaff(): Promise<Recipient[]> {
  return prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { slug: { in: ['security-officer', 'chief-security-officer', 'receptionist'] } } } } }, select: { fullName: true, email: true } });
}

/** Tell Security (and Reception) about an appointment's visitors. */
async function emailGate(kind: 'new' | 'changed' | 'cancelled', visitId: string, d: { title: string; startsAt: Date; endsAt: Date }, visitors: { names: string[]; organisation: string | null } | null, hostName: string, actorId: string) {
  const who = visitors ? `${visitors.names.join(', ')}${visitors.organisation ? ` (${visitors.organisation})` : ''}` : 'Visitors';
  const count = visitors?.names.length ?? 0;
  await sendLoggedEmail({
    entityType: 'Visit', entityId: visitId, recipients: await gateStaff(),
    subject: kind === 'cancelled' ? `Visit cancelled — ${who}` : `${kind === 'new' ? 'Visitor booked' : 'Visit rescheduled'} — ${who}, ${fmt(d.startsAt)}`,
    heading: kind === 'cancelled' ? 'A booked visit was cancelled — do not expect them' : kind === 'new' ? 'Expect a visitor' : 'A booked visit has moved',
    lines: [who, ...(count > 1 ? [`${count} people`] : []), `Visiting: ${hostName}`, kind === 'cancelled' ? 'The booking has been removed.' : `Expected: ${fmt(d.startsAt)}`, `Appointment: ${d.title}`],
    path: kind === 'cancelled' ? '/security/visitors' : `/security/visitors/${visitId}`, actorId,
  });
}

export type VisitorGroupInput = { names: string[]; organisation?: string; phone?: string; purpose: string };

function cleanGroup(g: VisitorGroupInput) {
  const names = g.names.map((n) => n.trim());
  if (names.length === 0 || names.some((n) => !n)) throw new SchedulingError('Enter a name for every visitor.');
  if (names.length > 50) throw new SchedulingError('A group can have at most 50 people.');
  if (!g.purpose.trim()) throw new SchedulingError('Enter the purpose of the visit.');
  return { names, organisation: g.organisation?.trim() || null, phone: g.phone?.trim() || null, purpose: g.purpose.trim() };
}

/** One visitor group → one Security booking (lead + others), at the
 * meeting's time and length, hosted by the meeting's host. */
async function createGroupBooking(appt: { id: string; title: string; startsAt: Date; endsAt: Date; ownerId: string }, g: ReturnType<typeof cleanGroup>, bookerId: string) {
  const [lead, ...members] = g.names;
  const visitNumber = await nextNumber('VIS');
  const v = await prisma.visit.create({
    data: { visitNumber, status: 'EXPECTED', vehicleType: 'ON_FOOT', branchId: await getWorkshopBranchId(), registeredById: bookerId, appointmentId: appt.id, visitorName: lead!, partySize: g.names.length, memberNames: members, company: g.organisation, phone: g.phone, purpose: g.purpose, hostUserId: appt.ownerId, expectedAt: appt.startsAt, expectedDurationMinutes: Math.max(5, mins(appt.startsAt, appt.endsAt)) },
  });
  const host = (await prisma.user.findUnique({ where: { id: appt.ownerId }, select: { fullName: true } }))?.fullName ?? '';
  await writeAuditLog({ userId: bookerId, action: 'visit.pre_registered', entityType: 'Visit', entityId: v.id, metadata: { visitNumber, visitor: lead, people: g.names.length, expectedAt: appt.startsAt } });
  await emailGate('new', v.id, appt, g, host, bookerId);
  return v;
}

async function groupsOf(apptId: string) {
  return prisma.visit.findMany({ where: { appointmentId: apptId }, orderBy: { createdAt: 'asc' }, select: { id: true, visitNumber: true, status: true, visitorName: true, memberNames: true, partySize: true, company: true, phone: true, purpose: true } });
}

async function recipientsFor(apptId: string, excludeId: string): Promise<Recipient[]> {
  const a = await prisma.appointment.findUnique({ where: { id: apptId }, select: { owner: { select: { id: true, fullName: true, email: true } }, participants: { select: { user: { select: { id: true, fullName: true, email: true } } } } } });
  if (!a) return [];
  return [a.owner, ...a.participants.map((p: { user: { id: string; fullName: string; email: string } }) => p.user)].filter((u) => u.id !== excludeId);
}

function describe(d: { title: string; startsAt: Date; endsAt: Date; location: string | null }, room: string | null, ownerName: string, visitors: string[] | null) {
  return [
    `${d.title}`,
    `${fmt(d.startsAt)} – ${new Date(d.endsAt).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })}`,
    `Where: ${room ?? d.location ?? '—'}`,
    `Host: ${ownerName}`,
    ...(visitors?.length ? [`Visitors: ${visitors.join(', ')}`] : []),
  ];
}

export async function createAppointment(input: AppointmentInput): Promise<{ id: string; appointmentNumber: string }> {
  const a = await requireBookFor(input.ownerId);
  const d = clean(input);
  if (d.startsAt.getTime() < Date.now() - 5 * 60000) throw new SchedulingError('That time has already passed.');
  await assertNoClash(input.ownerId, d.roomId, d.startsAt, d.endsAt);
  const appointmentNumber = await nextNumber('APT');
  const appt = await prisma.appointment.create({
    data: { appointmentNumber, branchId: await getWorkshopBranchId(), title: d.title, agenda: d.agenda, ownerId: input.ownerId, createdById: a.userId, startsAt: d.startsAt, endsAt: d.endsAt, roomId: d.roomId, location: d.location, participants: { create: d.participantIds.map((userId) => ({ userId })) } },
    select: { id: true, owner: { select: { fullName: true } }, room: { select: { name: true } } },
  });
  if (d.visitors) await createGroupBooking({ id: appt.id, title: d.title, startsAt: d.startsAt, endsAt: d.endsAt, ownerId: input.ownerId }, d.visitors, a.userId);
  await writeAuditLog({ userId: a.userId, action: 'appointment.created', entityType: 'Appointment', entityId: appt.id, metadata: { appointmentNumber, title: d.title, startsAt: d.startsAt, onBehalfOf: input.ownerId !== a.userId ? appt.owner.fullName : undefined } });
  await sendLoggedEmail({ entityType: 'Appointment', entityId: appt.id, recipients: await recipientsFor(appt.id, a.userId), subject: `New appointment: ${d.title} — ${fmt(d.startsAt)}`, heading: 'You have a new appointment', lines: describe(d, appt.room?.name ?? null, appt.owner.fullName, d.visitors?.names ?? null), path: `/schedule/${appt.id}`, actorId: a.userId });
  return { id: appt.id, appointmentNumber };
}

async function loadForChange(id: string) {
  const user = await requireUser();
  const appt = await prisma.appointment.findUnique({ where: { id }, select: { id: true, status: true, appointmentNumber: true, ownerId: true, createdById: true, visitId: true, startsAt: true, endsAt: true, title: true } });
  if (!appt) throw new SchedulingError('Appointment not found.');
  const access = await getSchedulingAccess();
  const allowed = access.isAdmin || appt.ownerId === user.id || appt.createdById === user.id || access.owners.some((o) => o.id === appt.ownerId);
  if (!allowed) throw new SchedulingError('Only the host, whoever booked it, their aides or a Scheduling Admin can change it.');
  return { user, appt, access };
}

export async function updateAppointment(id: string, input: AppointmentInput): Promise<void> {
  const { user, appt, access } = await loadForChange(id);
  if (appt.status !== 'SCHEDULED') throw new SchedulingError('Only a scheduled appointment can be changed.');
  if (!access.owners.some((o) => o.id === input.ownerId) && input.ownerId !== appt.ownerId) throw new SchedulingError('You cannot move it onto that calendar.');
  const d = clean(input);
  await assertNoClash(input.ownerId, d.roomId, d.startsAt, d.endsAt, id);
  await prisma.$transaction([
    prisma.appointmentParticipant.deleteMany({ where: { appointmentId: id } }),
    prisma.appointment.update({ where: { id }, data: { title: d.title, agenda: d.agenda, ownerId: input.ownerId, startsAt: d.startsAt, endsAt: d.endsAt, roomId: d.roomId, location: d.location, participants: { create: d.participantIds.map((userId) => ({ userId })) }, ...(+new Date(appt.startsAt) !== +d.startsAt ? { reminderSentAt: null } : {}) } }),
  ]);
  // Every group still expected moves with the meeting (time, length, host).
  const moved = +new Date(appt.startsAt) !== +d.startsAt || +new Date(appt.endsAt) !== +d.endsAt || appt.ownerId !== input.ownerId;
  if (moved) {
    const host = (await prisma.user.findUnique({ where: { id: input.ownerId }, select: { fullName: true } }))?.fullName ?? '';
    for (const g of (await groupsOf(id)).filter((x) => x.status === 'EXPECTED')) {
      await prisma.visit.update({ where: { id: g.id }, data: { expectedAt: d.startsAt, expectedDurationMinutes: Math.max(5, mins(d.startsAt, d.endsAt)), hostUserId: input.ownerId } });
      await writeAuditLog({ userId: user.id, action: 'visit.booking_changed', entityType: 'Visit', entityId: g.id, metadata: { visitNumber: g.visitNumber, visitor: g.visitorName, people: g.partySize, expectedAt: d.startsAt, reason: `Appointment ${appt.appointmentNumber} rescheduled` } });
      await emailGate('changed', g.id, d, { names: [g.visitorName, ...g.memberNames], organisation: g.company }, host, user.id);
    }
  }
  const fresh = await prisma.appointment.findUnique({ where: { id }, select: { owner: { select: { fullName: true } }, room: { select: { name: true } } } });
  await writeAuditLog({ userId: user.id, action: 'appointment.changed', entityType: 'Appointment', entityId: id, metadata: { appointmentNumber: appt.appointmentNumber, title: d.title, startsAt: d.startsAt } });
  await sendLoggedEmail({ entityType: 'Appointment', entityId: id, recipients: await recipientsFor(id, user.id), subject: `Appointment changed: ${d.title} — ${fmt(d.startsAt)}`, heading: 'An appointment has changed', lines: describe(d, fresh?.room?.name ?? null, fresh?.owner.fullName ?? '', null), path: `/schedule/${id}`, actorId: user.id });
}

export async function cancelAppointment(id: string, reason: string): Promise<void> {
  const { user, appt } = await loadForChange(id);
  if (appt.status !== 'SCHEDULED') throw new SchedulingError('Only a scheduled appointment can be cancelled.');
  if (!reason.trim()) throw new SchedulingError('Give a reason for cancelling.');
  const recipients = await recipientsFor(id, user.id);
  await prisma.appointment.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason.trim(), cancelledAt: new Date() } });
  // None of the visitor groups are expected any more — remove their bookings.
  const host = (await prisma.user.findUnique({ where: { id: appt.ownerId }, select: { fullName: true } }))?.fullName ?? '';
  for (const g of (await groupsOf(id)).filter((x) => x.status === 'EXPECTED')) {
    await writeAuditLog({ userId: user.id, action: 'visit.cancelled', entityType: 'Visit', entityId: g.id, metadata: { visitNumber: g.visitNumber, visitor: g.visitorName, reason: `Appointment ${appt.appointmentNumber} cancelled` } });
    await emailGate('cancelled', g.id, { title: appt.title, startsAt: appt.startsAt, endsAt: appt.endsAt }, { names: [g.visitorName, ...g.memberNames], organisation: g.company }, host, user.id);
    await prisma.visit.delete({ where: { id: g.id } });
  }
  await writeAuditLog({ userId: user.id, action: 'appointment.cancelled', entityType: 'Appointment', entityId: id, metadata: { appointmentNumber: appt.appointmentNumber, reason: reason.trim() } });
  await sendLoggedEmail({ entityType: 'Appointment', entityId: id, recipients, subject: `Cancelled: ${appt.title} — ${fmt(appt.startsAt)}`, heading: 'An appointment was cancelled', lines: [appt.title, fmt(appt.startsAt), `Reason: ${reason.trim()}`], path: `/schedule/${id}`, actorId: user.id });
}

export async function setAppointmentOutcome(id: string, outcome: 'COMPLETED' | 'NO_SHOW'): Promise<void> {
  const { user, appt } = await loadForChange(id);
  if (appt.status !== 'SCHEDULED') throw new SchedulingError('This appointment is already closed.');
  if (new Date(appt.startsAt).getTime() > Date.now()) throw new SchedulingError('It has not started yet.');
  await prisma.appointment.update({ where: { id }, data: { status: outcome, completedAt: outcome === 'COMPLETED' ? new Date() : null } });
  await writeAuditLog({ userId: user.id, action: outcome === 'COMPLETED' ? 'appointment.completed' : 'appointment.no_show', entityType: 'Appointment', entityId: id, metadata: { appointmentNumber: appt.appointmentNumber } });
}

// ── Queries ───────────────────────────────────────────────────────────

const APPT_ROW = {
  id: true, appointmentNumber: true, status: true, title: true, startsAt: true, endsAt: true, location: true, ownerId: true,
  owner: { select: { fullName: true } }, createdBy: { select: { fullName: true } }, room: { select: { name: true } },
  visits: { select: { id: true, visitNumber: true, status: true, visitorName: true, partySize: true, company: true } },
  participants: { select: { user: { select: { id: true, fullName: true } } } },
} as const;

/** Appointments between two dates on the calendars this person may see
 * (their own, delegated, all for admins) plus any they take part in. */
export async function listCalendar(from: Date, to: Date, ownerId?: string) {
  const access = await getSchedulingAccess();
  const ids = access.owners.map((o) => o.id);
  const scope = ownerId && ids.includes(ownerId) ? [ownerId] : ids;
  return prisma.appointment.findMany({
    where: { startsAt: { gte: from, lt: to }, OR: [{ ownerId: { in: scope } }, ...(ownerId ? [] : [{ participants: { some: { userId: access.userId } } }])] },
    orderBy: { startsAt: 'asc' },
    select: APPT_ROW,
  });
}

export async function getAppointment(id: string) {
  const access = await getSchedulingAccess();
  const a = await prisma.appointment.findUnique({ where: { id }, include: { owner: { select: { id: true, fullName: true } }, createdBy: { select: { fullName: true } }, room: true, visits: { orderBy: { createdAt: 'asc' }, select: { id: true, visitNumber: true, passNumber: true, status: true, visitorName: true, partySize: true, memberNames: true, company: true, phone: true, purpose: true, checkedInAt: true, checkedOutAt: true } }, participants: { select: { user: { select: { id: true, fullName: true } } } } } });
  if (!a) return null;
  const visible = access.isAdmin || access.owners.some((o) => o.id === a.ownerId) || a.createdById === access.userId || a.participants.some((p: { user: { id: string } }) => p.user.id === access.userId);
  return visible ? a : null;
}

export async function getAppointmentHistory(id: string) {
  await requireUser();
  const [entries, emails] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType: 'Appointment', entityId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } }),
    prisma.securityEmailLog.findMany({ where: { entityType: 'Appointment', entityId: id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((v: string | null): v is string => Boolean(v)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return { entries: entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null })), emails };
}

// ── Rooms ─────────────────────────────────────────────────────────────

export async function listRooms(includeInactive = false) {
  await requireUser();
  return prisma.meetingRoom.findMany({ where: includeInactive ? undefined : { isActive: true }, orderBy: { name: 'asc' } });
}

export async function saveRoom(input: { id?: string; name: string; location?: string; capacity?: number | null }): Promise<void> {
  const a = await getSchedulingAccess();
  if (!a.isAdmin) throw new SchedulingError('Only a Scheduling Admin can manage meeting rooms.');
  const name = input.name.trim();
  if (!name) throw new SchedulingError('Give the room a name.');
  if (input.capacity !== undefined && input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 1)) throw new SchedulingError('Capacity must be a whole number of people.');
  const branchId = await getWorkshopBranchId();
  const dup = await prisma.meetingRoom.findFirst({ where: { branchId, name: { equals: name, mode: 'insensitive' }, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { id: true } });
  if (dup) throw new SchedulingError('There is already a room with that name.');
  const data = { name, location: input.location?.trim() || null, capacity: input.capacity ?? null };
  const room = input.id ? await prisma.meetingRoom.update({ where: { id: input.id }, data }) : await prisma.meetingRoom.create({ data: { ...data, branchId } });
  await writeAuditLog({ userId: a.userId, action: input.id ? 'meeting_room.updated' : 'meeting_room.created', entityType: 'MeetingRoom', entityId: room.id, metadata: { name } });
}

export async function setRoomActive(id: string, active: boolean): Promise<void> {
  const a = await getSchedulingAccess();
  if (!a.isAdmin) throw new SchedulingError('Only a Scheduling Admin can manage meeting rooms.');
  const room = await prisma.meetingRoom.update({ where: { id }, data: { isActive: active } });
  await writeAuditLog({ userId: a.userId, action: active ? 'meeting_room.reopened' : 'meeting_room.closed', entityType: 'MeetingRoom', entityId: id, metadata: { name: room.name } });
}

// ── Aides (delegates) ─────────────────────────────────────────────────

export async function listDelegations() {
  const a = await getSchedulingAccess();
  return prisma.calendarDelegate.findMany({
    where: a.isAdmin ? undefined : { OR: [{ ownerId: a.userId }, { delegateId: a.userId }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true, owner: { select: { id: true, fullName: true } }, delegate: { select: { id: true, fullName: true } }, createdBy: { select: { fullName: true } }, createdAt: true },
  });
}

/** Let an aide book on an official's calendar. The official may add their
 * own aides; a Scheduling Admin may add any. */
export async function addDelegate(ownerId: string, delegateId: string): Promise<void> {
  const a = await getSchedulingAccess();
  if (!ownerId || !delegateId) throw new SchedulingError('Choose the official and the aide.');
  if (ownerId === delegateId) throw new SchedulingError('Someone cannot be their own aide.');
  if (!a.isAdmin && !(a.isCalendarUser && ownerId === a.userId)) throw new SchedulingError('Only the official or a Scheduling Admin can add aides.');
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { fullName: true, isActive: true, roles: { select: { role: { select: { slug: true } } } } } });
  if (!owner?.isActive || !owner.roles.some((r: { role: { slug: string } }) => r.role.slug === 'calendar-user')) throw new SchedulingError('The official must be an active Calendar User.');
  const aide = await prisma.user.findUnique({ where: { id: delegateId }, select: { fullName: true, email: true, isActive: true } });
  if (!aide?.isActive) throw new SchedulingError('The aide must be an active member of staff.');
  const exists = await prisma.calendarDelegate.findUnique({ where: { ownerId_delegateId: { ownerId, delegateId } }, select: { id: true } });
  if (exists) throw new SchedulingError(`${aide.fullName} can already book for ${owner.fullName}.`);
  const d = await prisma.calendarDelegate.create({ data: { ownerId, delegateId, createdById: a.userId } });
  await writeAuditLog({ userId: a.userId, action: 'calendar_delegate.added', entityType: 'CalendarDelegate', entityId: d.id, metadata: { owner: owner.fullName, aide: aide.fullName } });
  await sendLoggedEmail({ entityType: 'CalendarDelegate', entityId: d.id, recipients: [aide], subject: `You can now book appointments for ${owner.fullName}`, heading: 'You have been added as an aide', lines: [`You can now book, change and cancel appointments on ${owner.fullName}'s calendar.`], path: '/schedule', actorId: a.userId });
}

export async function removeDelegate(id: string): Promise<void> {
  const a = await getSchedulingAccess();
  const d = await prisma.calendarDelegate.findUnique({ where: { id }, select: { ownerId: true, owner: { select: { fullName: true } }, delegate: { select: { fullName: true } } } });
  if (!d) throw new SchedulingError('Not found.');
  if (!a.isAdmin && d.ownerId !== a.userId) throw new SchedulingError('Only the official or a Scheduling Admin can remove aides.');
  await prisma.calendarDelegate.delete({ where: { id } });
  await writeAuditLog({ userId: a.userId, action: 'calendar_delegate.removed', entityType: 'CalendarDelegate', entityId: id, metadata: { owner: d.owner.fullName, aide: d.delegate.fullName } });
}

/** Dashboard reminders: this person's appointments today (host or
 * participant), still to happen. */
export async function getSchedulingDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const user = await requireUser();
  await sendDueAppointmentReminders().catch((err) => console.error('Reminder safety net failed', err));
  const now = new Date();
  const end = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) + 'T23:59:59+01:00');
  const cancelled = await prisma.appointment.findMany({
    where: { status: 'CANCELLED', cancelledAt: { gte: new Date(now.getTime() - 86400000) }, OR: [{ ownerId: user.id }, { participants: { some: { userId: user.id } } }] },
    select: { id: true, title: true, startsAt: true, cancelReason: true, cancelledAt: true },
  });
  const rows = await prisma.appointment.findMany({
    where: { status: 'SCHEDULED', endsAt: { gt: now }, startsAt: { lte: end }, OR: [{ ownerId: user.id }, { participants: { some: { userId: user.id } } }] },
    orderBy: { startsAt: 'asc' },
    select: { id: true, title: true, startsAt: true, location: true, room: { select: { name: true } } },
  });
  return [
    ...rows.map((r: (typeof rows)[number]) => ({ id: `appt-${r.id}`, title: `Today ${new Date(r.startsAt).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' })} — ${r.title}`, detail: r.room?.name ?? r.location ?? '', url: `/schedule/${r.id}`, createdAt: r.startsAt })),
    ...cancelled.map((c: (typeof cancelled)[number]) => ({ id: `appt-x-${c.id}`, title: `Cancelled: ${c.title} (${fmt(c.startsAt)})`, detail: c.cancelReason ?? '', url: `/schedule/${c.id}`, createdAt: c.cancelledAt as Date })),
  ];
}

// ── Overview (the Scheduling dashboard) and the register ──────────────

/** Everything the Scheduling dashboard shows, for the calendars this
 * person can see; the room grid covers every room. */
export async function getSchedulingOverview(gridDate?: string) {
  const access = await getSchedulingAccess();
  await sendDueAppointmentReminders().catch((err) => console.error('Reminder safety net failed', err));
  const ids = access.owners.map((o) => o.id);
  const since = new Date(Date.now() - 95 * 86400000);
  const until = new Date(Date.now() + 60 * 86400000);
  const [appts, rooms] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: since, lte: until }, OR: [{ ownerId: { in: ids } }, { participants: { some: { userId: access.userId } } }, ...(access.isAdmin ? [{}] : [])] },
      select: { id: true, appointmentNumber: true, title: true, status: true, startsAt: true, endsAt: true, roomId: true, location: true, ownerId: true, room: { select: { name: true } }, owner: { select: { fullName: true } }, visits: { select: { partySize: true } } },
    }),
    prisma.meetingRoom.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, capacity: true, isActive: true } }),
  ]);
  // The room grid must see every booking of every room, not only my calendars.
  const roomBookings = await prisma.appointment.findMany({
    where: { roomId: { not: null }, status: { not: 'CANCELLED' }, startsAt: { gte: new Date(Date.now() - 2 * 86400000), lte: until } },
    select: { id: true, appointmentNumber: true, title: true, status: true, startsAt: true, endsAt: true, roomId: true, location: true, ownerId: true, room: { select: { name: true } }, owner: { select: { fullName: true } }, visits: { select: { partySize: true } } },
  });
  const map = (a: (typeof appts)[number]) => ({ id: a.id, number: a.appointmentNumber, title: a.title, status: a.status, startsAt: a.startsAt, endsAt: a.endsAt, roomId: a.roomId, roomName: a.room?.name ?? null, location: a.location, ownerId: a.ownerId, ownerName: a.owner.fullName, visitors: a.visits.reduce((n: number, v: { partySize: number }) => n + v.partySize, 0) });
  const mine = appts.map(map);
  const seen = new Set(mine.map((a) => a.id));
  const all = [...mine, ...roomBookings.map(map).filter((a) => !seen.has(a.id))];
  const a = computeSchedulingAnalytics({ appts: all, rooms, gridDate });
  // Glance / stats are about MY calendars; the grid is about every room.
  const b = computeSchedulingAnalytics({ appts: mine, rooms, gridDate });
  return { ...b, grid: a.grid, access };
}

const REGISTER_SHOW = ['upcoming', 'today', 'awaiting', 'completed', 'no_show', 'cancelled', 'all'] as const;
export type RegisterShow = (typeof REGISTER_SHOW)[number];

/** The appointments register: searchable, with a count for every tab. */
export async function listAppointments(q?: string, show?: string) {
  const access = await getSchedulingAccess();
  const t = q?.trim();
  const now = new Date();
  const dayStart = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const rows = await prisma.appointment.findMany({
    where: {
      OR: [{ ownerId: { in: access.owners.map((o) => o.id) } }, { participants: { some: { userId: access.userId } } }, ...(access.isAdmin ? [{}] : [])],
      ...(t ? { AND: [{ OR: [{ appointmentNumber: { contains: t, mode: 'insensitive' as const } }, { title: { contains: t, mode: 'insensitive' as const } }, { location: { contains: t, mode: 'insensitive' as const } }, { owner: { fullName: { contains: t, mode: 'insensitive' as const } } }, { room: { name: { contains: t, mode: 'insensitive' as const } } }, { visits: { some: { visitorName: { contains: t, mode: 'insensitive' as const } } } }, { visits: { some: { company: { contains: t, mode: 'insensitive' as const } } } }] }] } : {}),
    },
    orderBy: { startsAt: 'desc' },
    take: 500,
    select: APPT_ROW,
  });
  const is = {
    upcoming: (a: (typeof rows)[number]) => a.status === 'SCHEDULED' && +a.endsAt > +now,
    today: (a: (typeof rows)[number]) => a.status !== 'CANCELLED' && +a.startsAt >= +dayStart && +a.startsAt < +dayEnd,
    awaiting: (a: (typeof rows)[number]) => a.status === 'SCHEDULED' && +a.endsAt <= +now,
    completed: (a: (typeof rows)[number]) => a.status === 'COMPLETED',
    no_show: (a: (typeof rows)[number]) => a.status === 'NO_SHOW',
    cancelled: (a: (typeof rows)[number]) => a.status === 'CANCELLED',
    all: () => true,
  } as const;
  const tab: RegisterShow = (REGISTER_SHOW as readonly string[]).includes(show ?? '') ? (show as RegisterShow) : 'upcoming';
  const counts = Object.fromEntries(REGISTER_SHOW.map((k) => [k, rows.filter(is[k]).length])) as Record<RegisterShow, number>;
  const list = rows.filter(is[tab]);
  if (tab === 'upcoming' || tab === 'today') list.sort((x, y) => +x.startsAt - +y.startsAt);
  return { tab, counts, rows: list };
}

// ── Visitor groups on an appointment ──────────────────────────────────

async function loadForGroups(apptId: string) {
  const { user, appt } = await loadForChange(apptId);
  if (appt.status !== 'SCHEDULED') throw new SchedulingError('Visitors can only be changed on a scheduled appointment.');
  if (new Date(appt.endsAt).getTime() <= Date.now()) throw new SchedulingError('This appointment has already ended.');
  return { user, appt };
}

/** Add another visitor group (e.g. "2 people from Soueast China"). */
export async function addVisitorGroup(apptId: string, input: VisitorGroupInput): Promise<void> {
  const { user, appt } = await loadForGroups(apptId);
  const g = cleanGroup(input);
  const v = await createGroupBooking({ id: appt.id, title: appt.title, startsAt: appt.startsAt, endsAt: appt.endsAt, ownerId: appt.ownerId }, g, user.id);
  await writeAuditLog({ userId: user.id, action: 'appointment.visitors_added', entityType: 'Appointment', entityId: apptId, metadata: { appointmentNumber: appt.appointmentNumber, visitNumber: v.visitNumber, visitors: g.names.join(', '), organisation: g.organisation ?? undefined } });
}

export async function updateVisitorGroup(visitId: string, input: VisitorGroupInput): Promise<void> {
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { appointmentId: true, status: true, visitNumber: true } });
  if (!v?.appointmentId) throw new SchedulingError('That visitor group is not on an appointment.');
  if (v.status !== 'EXPECTED') throw new SchedulingError('They have already arrived — the booking can no longer be changed.');
  const { user, appt } = await loadForGroups(v.appointmentId);
  const g = cleanGroup(input);
  const [lead, ...members] = g.names;
  await prisma.visit.update({ where: { id: visitId }, data: { visitorName: lead!, partySize: g.names.length, memberNames: members, company: g.organisation, phone: g.phone, purpose: g.purpose } });
  const host = (await prisma.user.findUnique({ where: { id: appt.ownerId }, select: { fullName: true } }))?.fullName ?? '';
  await writeAuditLog({ userId: user.id, action: 'visit.booking_changed', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, visitor: lead, people: g.names.length } });
  await writeAuditLog({ userId: user.id, action: 'appointment.visitors_changed', entityType: 'Appointment', entityId: appt.id, metadata: { appointmentNumber: appt.appointmentNumber, visitNumber: v.visitNumber, visitors: g.names.join(', ') } });
  await emailGate('changed', visitId, appt, g, host, user.id);
}

export async function removeVisitorGroup(visitId: string, reason: string): Promise<void> {
  const v = await prisma.visit.findUnique({ where: { id: visitId }, select: { appointmentId: true, status: true, visitNumber: true, visitorName: true, memberNames: true, company: true } });
  if (!v?.appointmentId) throw new SchedulingError('That visitor group is not on an appointment.');
  if (v.status !== 'EXPECTED') throw new SchedulingError('They have already arrived — check them out at the gate instead.');
  if (!reason.trim()) throw new SchedulingError('Give a reason for removing them.');
  const { user, appt } = await loadForGroups(v.appointmentId);
  const host = (await prisma.user.findUnique({ where: { id: appt.ownerId }, select: { fullName: true } }))?.fullName ?? '';
  await writeAuditLog({ userId: user.id, action: 'visit.cancelled', entityType: 'Visit', entityId: visitId, metadata: { visitNumber: v.visitNumber, visitor: v.visitorName, reason: reason.trim() } });
  await writeAuditLog({ userId: user.id, action: 'appointment.visitors_removed', entityType: 'Appointment', entityId: appt.id, metadata: { appointmentNumber: appt.appointmentNumber, visitNumber: v.visitNumber, visitors: [v.visitorName, ...v.memberNames].join(', '), reason: reason.trim() } });
  await emailGate('cancelled', visitId, appt, { names: [v.visitorName, ...v.memberNames], organisation: v.company }, host, user.id);
  await prisma.visit.delete({ where: { id: visitId } });
}
