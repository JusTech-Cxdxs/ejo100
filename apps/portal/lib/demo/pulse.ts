/**
 * The daily demo pulse — a working day at Isolo, dated today (Lagos), added
 * at most once per Lagos day to the demo organisation, so the demo looks
 * alive whenever someone signs in (the workshop demo, lib/workshop/demo, is
 * the six months before):
 *
 *   Workshop   3 vehicles checked in this morning (1 on Saturday), two
 *              accepted by their supervisor; earlier pulse job cards move on
 *              one safe step a day — the technician accepts and writes the
 *              estimate, the supervisor approves it two days later — and wait
 *              there for the demo Manager's approval; one nobody moved for a
 *              week is cancelled (the customer did not come back)
 *   Services   one checked in today, one booked for the next working day; a
 *              booking whose day has come is checked in
 *   Security   two visitors expected today (one in by now), earlier ones
 *              signed out
 *   Schedule   the morning workshop meeting (weekdays)
 *   Support    two new requests from demo customers with Enyo's
 *              acknowledgement; yesterday's answered; a week-old one resolved
 *   Broadcast  on Mondays, "This week in the workshop" to Isolo (never emailed)
 *
 * Never money, stock, warranty or the plant: nothing here writes a payment,
 * a parts slip, a goods receipt or a claim, and nothing is ever emailed.
 *
 * Only for an organisation marked as a demo (organisations.isDemo) that has
 * its workshop demo loaded, and only while DEMO_DAILY_ACTIVITY is not "off".
 * Once a day: the run's first write, inside its one transaction, claims the
 * day's marker row in demo_records (model DemoPulse, "<org>:<YYYY-MM-DD>",
 * unique). A second run — another server at the same moment, or later the
 * same day — finds it taken and adds nothing; a failed run rolls the claim
 * back with everything else, so the next try runs again. A fresh demo load
 * claims its own day (today is already in the story).
 *
 * Every record it makes is listed in demo_records, so a reset removes it with
 * the rest of the demo. Called by the deploy (scripts/demo-ensure.ts), the
 * daily 07:00 UTC job (app/api/cron/pricing-alerts) and lazily after a
 * dashboard is shown (ensureDemoPulse: never blocks or fails the page).
 */
import { randomUUID } from 'node:crypto';
import { Prisma, prisma, setAuditActor } from '@ejo/database';
import { DEMO_CUSTOMERS, DEMO_STAFF } from './people';
import { COMMERCIAL_COMPLAINTS, JOB_LINES, PASSENGER_COMPLAINTS, SERVICE_TEXTS } from '../workshop/demo/catalogue';
import { Numbers, highestInUse } from '../workshop/demo/load';
import {
  PULSE_AGENT_REPLY, PULSE_AGE_OUT_DAYS, PULSE_AI_ACK, PULSE_JOB, PULSE_MODEL, PULSE_SERVICE, PULSE_TICKET, PULSE_TICKETS, PULSE_VISIT, PULSE_VISITORS,
  dayRandom, happenedAt, lagosAt, nextWorkingDay, pulseDay, pulseDayId, pulseEnabled,
} from './pulse-core';

type Tx = Prisma.TransactionClient;
export type PulseResult = { ran: boolean; reason: 'added' | 'already' | 'off' | 'not-demo' | 'not-loaded'; dayKey: string; counts: Record<string, number> };

const DAY = 86_400_000;
const staff = (prefix: string) => DEMO_STAFF.find((s) => s.email.startsWith(`${prefix}@`))!.email;
const OPEN_JOB = ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION'] as const;
const OPEN_SERVICE = ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'] as const;

/** Whether the pulse already ran (or the demo was loaded) on this Lagos day. */
export async function pulseRanOn(organisationId: string, dayKey: string): Promise<boolean> {
  return Boolean(await prisma.demoRecord.findUnique({ where: { model_recordId: { model: PULSE_MODEL, recordId: pulseDayId(organisationId, dayKey) } }, select: { id: true } }));
}

/** Adds today's working day to one demo organisation, once per Lagos day. Throws only on a database failure (then nothing is left half-written). */
export async function runDemoPulse(organisationId: string, now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<PulseResult> {
  const day = pulseDay(now);
  const result = (reason: PulseResult['reason'], counts: Record<string, number> = {}): PulseResult => ({ ran: reason === 'added', reason, dayKey: day.dayKey, counts });
  if (!pulseEnabled(env)) return result('off');
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { isDemo: true } });
  if (!org?.isDemo) return result('not-demo');
  if (await pulseRanOn(organisationId, day.dayKey)) return result('already');
  if (!(await prisma.demoRecord.count({ where: { organisationId, model: 'JobCard' } }))) return result('not-loaded');
  const branches = await prisma.branch.findMany({ where: { businessUnit: { organisationId } }, orderBy: { createdAt: 'asc' }, select: { id: true, code: true, type: true, departments: { select: { id: true, slug: true } } } });
  const isolo = branches.find((b) => b.code === 'KWL-WS') ?? branches.find((b) => b.type === 'WORKSHOP');
  if (!isolo) return result('not-loaded');
  const people = new Map((await prisma.user.findMany({ where: { organisationId, email: { in: DEMO_STAFF.map((s) => s.email) } }, select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  const by = (email: string) => { const id = people.get(email); if (!id) throw new Error(`Demo pulse: no demo person ${email}`); return id; };
  const dept = (slug: string) => isolo.departments.find((d) => d.slug === slug)?.id ?? null;
  setAuditActor(null, 'demo:pulse', organisationId);

  // What is free to come in today: demo vehicles with no open job card or service.
  const vehicles = await prisma.customerVehicle.findMany({
    where: { externalSource: 'EJO-DEMO', customer: { organisationId, isActive: true }, jobCards: { none: { status: { in: [...OPEN_JOB] } } }, vehicleServices: { none: { status: { in: [...OPEN_SERVICE] } } } },
    orderBy: { id: 'asc' }, select: { id: true, customerId: true, vehicleType: true, mileage: true },
  });
  const rnd = dayRandom(day.dayKey, organisationId);
  const take = <T,>(xs: T[], n: number): T[] => { const pool = [...xs]; const out: T[] = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!); return out; };
  const chosen = take(vehicles, day.jobCards + day.servicesToday + day.servicesBooked);
  const numbers = new Numbers(highestInUse);
  const counts: Record<string, number> = {};
  const add = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n; };
  const frontdesk = by(staff('frontdesk'));
  const manager = by(staff('manager'));
  const care = by(staff('care'));

  // Numbers are worked out before the transaction (reads only); the writes are all in it.
  const jobPlans = await Promise.all(chosen.slice(0, day.jobCards).map(async (v, i) => ({ v, at: happenedAt(day.dayKey, now, i, day.jobCards), number: '' })));
  for (const p of jobPlans) p.number = await numbers.take('JC', p.at);
  const servicePlans: { v: (typeof chosen)[number]; at: Date; booked: boolean; number: string }[] = [];
  for (const [i, v] of chosen.slice(day.jobCards).entries()) {
    const booked = i >= day.servicesToday;
    const at = booked ? lagosAt(nextWorkingDay(day.dayKey), 8 + (i % 3), 30) : happenedAt(day.dayKey, now, i, day.servicesToday + 1);
    servicePlans.push({ v, at, booked, number: await numbers.take('SV', booked ? now : at) });
  }
  const visitorPlans = await Promise.all(PULSE_VISITORS.slice(0, day.visitors).map(async (t, i) => {
    const expectedAt = lagosAt(day.dayKey, t.hh, t.mm);
    const checkedIn = expectedAt.getTime() + 5 * 60_000 <= now.getTime();
    return { t, i, expectedAt, checkedIn };
  }));
  const visitNumbers: { visit: string; pass: string | null }[] = [];
  for (const v of visitorPlans) visitNumbers.push({ visit: await numbers.take('VIS', now), pass: v.checkedIn ? await numbers.take('VP', now) : null });
  const ticketCustomers = await prisma.customer.findMany({ where: { organisationId, externalSource: 'EJO-DEMO', isActive: true }, orderBy: { id: 'asc' }, select: { id: true, fullName: true, email: true, phone: true } });
  const ticketPlans: { c: (typeof ticketCustomers)[number]; t: (typeof PULSE_TICKETS)[number]; at: Date; number: string }[] = [];
  for (let i = 0; i < day.tickets; i += 1) {
    const portal = DEMO_CUSTOMERS[Math.floor(rnd() * DEMO_CUSTOMERS.length)]!;
    const c = (i === 0 ? ticketCustomers.find((x) => x.email === portal.email) : null) ?? take(ticketCustomers, 1)[0];
    if (!c) continue;
    const at = happenedAt(day.dayKey, now, i, day.tickets);
    ticketPlans.push({ c, t: PULSE_TICKETS[Math.floor(rnd() * PULSE_TICKETS.length)]!, at, number: await numbers.take('SUP', at) });
  }
  const meetingNumber = day.meeting ? await numbers.take('APT', now) : null;
  const broadcastNumber = day.broadcast ? await numbers.take('BC', now) : null;
  const queue = await prisma.supportQueue.findFirst({ where: { organisationId, isDefault: true }, select: { id: true } }) ?? await prisma.supportQueue.findFirst({ where: { organisationId }, select: { id: true } });
  const room = await prisma.meetingRoom.findFirst({ where: { branchId: isolo.id, isActive: true }, orderBy: { name: 'asc' }, select: { id: true } });

  // Earlier pulse records to move on (the ones the pulse itself made, before today).
  const earlier = async (model: string) => (await prisma.demoRecord.findMany({ where: { organisationId, model }, select: { recordId: true } })).map((r) => r.recordId);
  const todayStart = lagosAt(day.dayKey, 0);
  const [oldJobIds, oldServiceIds, oldVisitIds, oldTicketIds] = await Promise.all([earlier(PULSE_JOB), earlier(PULSE_SERVICE), earlier(PULSE_VISIT), earlier(PULSE_TICKET)]);
  const [oldJobs, oldServices, oldVisits, oldTickets] = await Promise.all([
    prisma.jobCard.findMany({ where: { id: { in: oldJobIds }, createdAt: { lt: todayStart }, status: 'CHECKED_IN' }, select: { id: true, createdAt: true, technicianAcceptanceStatus: true, assignedTechnicianId: true, supervisorId: true, departmentId: true, mileageAtCheckIn: true, vehicle: { select: { vehicleType: true } }, estimate: { select: { id: true, status: true } } } }),
    prisma.vehicleService.findMany({ where: { id: { in: oldServiceIds }, status: { in: ['SCHEDULED', 'CHECKED_IN'] } }, select: { id: true, status: true, createdAt: true, checkedInAt: true } }),
    prisma.visit.findMany({ where: { id: { in: oldVisitIds }, expectedAt: { lt: todayStart }, status: { in: ['EXPECTED', 'CHECKED_IN'] } }, select: { id: true, status: true, expectedAt: true, checkedInAt: true, expectedDurationMinutes: true, passNumber: true } }),
    prisma.supportTicket.findMany({ where: { id: { in: oldTicketIds }, createdAt: { lt: todayStart }, status: { in: ['OPEN', 'WAITING_ON_CUSTOMER'] } }, select: { id: true, status: true, createdAt: true, firstResponseAt: true } }),
  ]);
  const passNumbers = new Map<string, string>();
  for (const v of oldVisits) if (!v.passNumber) passNumbers.set(v.id, await numbers.take('VP', v.expectedAt!));

  const registry: { model: string; recordId: string }[] = [];
  const reg = (model: string, id: string) => { registry.push({ model, recordId: id }); return id; };
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const audit = (userId: string, action: string, entityType: string, entityId: string, at: Date, metadata?: Record<string, unknown>) => audits.push({ id: reg('AuditLog', randomUUID()), organisationId, userId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue | undefined, createdAt: at });

  try {
    await prisma.$transaction(async (tx: Tx) => {
      // The claim first: a second run finds the row taken (unique) and stops here.
      await tx.demoRecord.create({ data: { organisationId, model: PULSE_MODEL, recordId: pulseDayId(organisationId, day.dayKey) } });

      // ── Today's check-ins ──
      for (const [i, p] of jobPlans.entries()) {
        const commercial = p.v.vehicleType === 'COMMERCIAL';
        const service = rnd() < 0.35;
        const row = (commercial ? COMMERCIAL_COMPLAINTS : PASSENGER_COMPLAINTS)[Math.floor(rnd() * 10)]!;
        const complaint = service ? SERVICE_TEXTS[Math.floor(rnd() * SERVICE_TEXTS.length)]! : row[0];
        const sup = by(staff(commercial ? 'supervisor.commercial' : 'supervisor.passenger'));
        const tech = by(staff(commercial ? 'tech.commercial' : 'tech.passenger'));
        const accepted = i < 2 && p.at.getTime() + 40 * 60_000 <= now.getTime();
        const id = reg('JobCard', randomUUID());
        await tx.jobCard.create({ data: {
          id, jobNumber: p.number, branchId: isolo.id, customerId: p.v.customerId, vehicleId: p.v.id, departmentId: dept(commercial ? 'workshop-commercial' : 'workshop-passenger'), complaint, mileageAtCheckIn: (p.v.mileage ?? 0) + 400 + Math.floor(rnd() * 2_000),
          assignedTechnicianId: tech, technicianAcceptanceStatus: 'PENDING', supervisorId: sup, createdById: frontdesk, status: 'CHECKED_IN', notes: service ? null : `Customer reports: ${row[0].toLowerCase()}.`,
          approvalStatus: accepted ? 'APPROVED' : 'PENDING', approvedById: accepted ? sup : null, approvedAt: accepted ? new Date(p.at.getTime() + 35 * 60_000) : null, createdAt: p.at,
          complaints: { create: [{ id: reg('JobCardComplaint', randomUUID()), sequenceNumber: 1, description: complaint, createdAt: p.at }] },
        } });
        registry.push({ model: PULSE_JOB, recordId: id });
        audit(frontdesk, 'job_card.created', 'JobCard', id, p.at, { jobNumber: p.number });
        if (accepted) audit(sup, 'job_card.approved', 'JobCard', id, new Date(p.at.getTime() + 35 * 60_000), { jobNumber: p.number });
        add('jobCards');
      }
      for (const p of servicePlans) {
        const commercial = p.v.vehicleType === 'COMMERCIAL';
        const id = reg('VehicleService', randomUUID());
        const text = SERVICE_TEXTS[Math.floor(rnd() * SERVICE_TEXTS.length)]!;
        await tx.vehicleService.create({ data: {
          id, serviceNumber: p.number, branchId: isolo.id, customerId: p.v.customerId, vehicleId: p.v.id, status: p.booked ? 'SCHEDULED' : 'CHECKED_IN', odometerAtService: (p.v.mileage ?? 0) + 500, customerComplaint: text,
          assignedTechnicianId: by(staff(commercial ? 'tech.commercial' : 'tech.passenger')), technicianAcceptanceStatus: 'PENDING', departmentId: dept(commercial ? 'workshop-commercial' : 'workshop-passenger'), supervisorId: by(staff(commercial ? 'supervisor.commercial' : 'supervisor.passenger')),
          approvalStatus: 'APPROVED', approvedById: by(staff(commercial ? 'supervisor.commercial' : 'supervisor.passenger')), approvedAt: p.booked ? now : p.at, createdById: frontdesk, createdAt: p.booked ? p.at : p.at, checkedInAt: p.booked ? null : p.at,
          complaints: { create: [{ id: reg('VehicleServiceComplaint', randomUUID()), sequenceNumber: 1, description: text, createdAt: p.at }] },
        } });
        registry.push({ model: PULSE_SERVICE, recordId: id });
        audit(frontdesk, 'vehicle_service.created', 'VehicleService', id, p.booked ? now : p.at, { serviceNumber: p.number });
        add(p.booked ? 'servicesBooked' : 'servicesToday');
      }

      // ── Earlier pulse job cards move on one safe step ──
      for (const j of oldJobs) {
        const ageDays = (now.getTime() - j.createdAt.getTime()) / DAY;
        const at = happenedAt(day.dayKey, now, 0, 3);
        if (ageDays >= PULSE_AGE_OUT_DAYS && (!j.estimate || ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(j.estimate.status))) {
          await tx.cancellationRequest.create({ data: { id: reg('CancellationRequest', randomUUID()), jobCardId: j.id, reason: 'The customer did not come back to approve the work within the week.', requestedById: frontdesk, requestedAt: at, status: 'APPROVED', decidedById: manager, decidedAt: new Date(at.getTime() + 20 * 60_000), decisionNotes: 'Closed off; the customer can book again.', createdAt: at } });
          await tx.jobCard.update({ where: { id: j.id }, data: { status: 'CANCELLED' } });
          audit(frontdesk, 'cancellation.requested', 'JobCard', j.id, at); audit(manager, 'cancellation.approved', 'JobCard', j.id, new Date(at.getTime() + 20 * 60_000));
          add('cancelled');
          continue;
        }
        if (j.technicianAcceptanceStatus !== 'ACCEPTED' && j.assignedTechnicianId) {
          const kind = j.vehicle.vehicleType === 'COMMERCIAL' ? COMMERCIAL_COMPLAINTS[Math.floor(rnd() * 10)]! : PASSENGER_COMPLAINTS[Math.floor(rnd() * 10)]!;
          const lines = JOB_LINES[kind[2]] ?? JOB_LINES.service!;
          const estimateId = reg('Estimate', randomUUID());
          await tx.jobCard.update({ where: { id: j.id }, data: { technicianAcceptanceStatus: 'ACCEPTED', technicianRespondedAt: at, diagnosis: kind[1], approvalStatus: 'APPROVED', approvedById: j.supervisorId, approvedAt: j.createdAt } });
          await tx.estimate.create({ data: {
            id: estimateId, jobCardId: j.id, status: 'SUBMITTED', submittedAt: new Date(at.getTime() + 60 * 60_000), createdById: j.assignedTechnicianId, createdAt: at,
            lineItems: { create: lines.map((l) => ({ id: reg('EstimateLineItem', randomUUID()), type: l.type, description: l.description, quantity: l.qty ?? 1, unitPrice: l.price, amount: (l.qty ?? 1) * l.price, enteredById: j.assignedTechnicianId!, createdAt: at })) },
          } });
          audit(j.assignedTechnicianId, 'assignment.accepted', 'JobCard', j.id, at); audit(j.assignedTechnicianId, 'estimate.submitted', 'JobCard', j.id, new Date(at.getTime() + 60 * 60_000));
          add('estimatesWritten');
        } else if (j.estimate?.status === 'SUBMITTED' && ageDays >= 2 && j.supervisorId) {
          await tx.estimate.update({ where: { id: j.estimate.id }, data: { status: 'APPROVED', approvedAt: at, approvedById: j.supervisorId } });
          audit(j.supervisorId, 'estimate.approved', 'JobCard', j.id, at);
          add('estimatesApproved');
        }
      }
      // ── Services: a booking whose day has come is checked in; one nobody moved for a week is cancelled ──
      for (const s of oldServices) {
        if (s.status === 'SCHEDULED' && s.createdAt <= now) { await tx.vehicleService.update({ where: { id: s.id }, data: { status: 'CHECKED_IN', checkedInAt: s.createdAt } }); add('servicesCheckedIn'); continue; }
        if (s.status === 'CHECKED_IN' && s.checkedInAt && (now.getTime() - s.checkedInAt.getTime()) / DAY >= PULSE_AGE_OUT_DAYS) {
          const at = happenedAt(day.dayKey, now, 1, 3);
          await tx.vehicleServiceCancellationRequest.create({ data: { id: reg('VehicleServiceCancellationRequest', randomUUID()), vehicleServiceId: s.id, reason: 'The customer asked to rebook the service.', requestedById: frontdesk, requestedAt: at, status: 'APPROVED', decidedById: manager, decidedAt: new Date(at.getTime() + 15 * 60_000), createdAt: at } });
          await tx.vehicleService.update({ where: { id: s.id }, data: { status: 'CANCELLED', cancelledAt: new Date(at.getTime() + 15 * 60_000) } });
          add('servicesCancelled');
        }
      }

      // ── Security ──
      const gate = by(staff('gate'));
      for (const [k, p] of visitorPlans.entries()) {
        const id = reg('Visit', randomUUID());
        const host = by(staff(p.i === 0 ? 'supervisor.commercial' : 'manager'));
        await tx.visit.create({ data: {
          id, visitNumber: visitNumbers[k]!.visit, passNumber: visitNumbers[k]!.pass, branchId: isolo.id, status: p.checkedIn ? 'CHECKED_IN' : 'EXPECTED', visitorName: p.t.name, company: p.t.company || null, phone: `0800 000 07${String(10 + p.i)}`,
          vehicleType: p.t.vehicle, vehiclePlate: p.t.vehicle === 'ON_FOOT' ? null : `LND ${700 + p.i} DM`, purpose: p.t.purpose, hostUserId: host, expectedAt: p.expectedAt, expectedDurationMinutes: p.t.minutes, registeredById: frontdesk,
          receivedAt: p.checkedIn ? new Date(p.expectedAt.getTime() + 5 * 60_000) : null, receivedById: p.checkedIn ? gate : null, checkedInAt: p.checkedIn ? new Date(p.expectedAt.getTime() + 5 * 60_000) : null, checkedInById: p.checkedIn ? gate : null, createdAt: new Date(Math.min(now.getTime(), p.expectedAt.getTime()) - 3 * 3_600_000),
        } });
        registry.push({ model: PULSE_VISIT, recordId: id });
        add('visitors');
      }
      for (const v of oldVisits) {
        const inAt = v.checkedInAt ?? new Date(v.expectedAt!.getTime() + 5 * 60_000);
        await tx.visit.update({ where: { id: v.id }, data: { status: 'CHECKED_OUT', passNumber: v.passNumber ?? passNumbers.get(v.id) ?? null, receivedAt: inAt, receivedById: gate, checkedInAt: inAt, checkedInById: gate, checkedOutAt: new Date(inAt.getTime() + v.expectedDurationMinutes * 60_000), checkedOutById: gate } });
        add('visitorsOut');
      }

      // ── Schedule ──
      if (meetingNumber) {
        const startsAt = lagosAt(day.dayKey, 8, 15); const endsAt = lagosAt(day.dayKey, 8, 45);
        const id = reg('Appointment', randomUUID());
        await tx.appointment.create({ data: {
          id, appointmentNumber: meetingNumber, branchId: isolo.id, status: endsAt <= now ? 'COMPLETED' : 'SCHEDULED', title: 'Morning workshop meeting', agenda: 'Yesterday’s carry-overs, today’s check-ins, parts waiting, approvals.', ownerId: manager, createdById: manager, startsAt, endsAt,
          roomId: room?.id ?? null, location: room ? null : 'Workshop office', completedAt: endsAt <= now ? endsAt : null, createdAt: new Date(startsAt.getTime() - DAY),
          participants: { create: ['supervisor.passenger', 'supervisor.commercial', 'store.manager', 'frontdesk'].map((k) => ({ id: reg('AppointmentParticipant', randomUUID()), userId: by(staff(k)) })) },
        } });
        add('meetings');
      }

      // ── Support ──
      for (const p of ticketPlans) {
        const id = reg('SupportTicket', randomUUID());
        const portal = Boolean(p.c.email);
        await tx.supportTicket.create({ data: {
          id, organisationId, branchId: isolo.id, number: p.number, channel: portal ? 'CUSTOMER_PORTAL' : 'WEBSITE', customerId: p.c.id, contactName: p.c.fullName, contactPhone: p.c.phone, contactEmail: p.c.email, subject: p.t.subject, summary: p.t.summary,
          status: 'OPEN', priority: p.t.priority, queueId: queue?.id ?? null, senderKind: portal ? 'customer' : 'public', lastCustomerAt: p.at, dueFirstResponseAt: new Date(p.at.getTime() + 4 * 3_600_000), dueResolutionAt: new Date(p.at.getTime() + 48 * 3_600_000), tags: ['demo'], createdAt: p.at,
          replies: { create: [{ id: reg('SupportReply', randomUUID()), body: PULSE_AI_ACK, kind: 'AI', aiDrafted: true, createdAt: new Date(p.at.getTime() + 60_000) }] },
        } });
        registry.push({ model: PULSE_TICKET, recordId: id });
        add('tickets');
      }
      for (const t of oldTickets) {
        const at = happenedAt(day.dayKey, now, 2, 3);
        if ((now.getTime() - t.createdAt.getTime()) / DAY >= PULSE_AGE_OUT_DAYS) { await tx.supportTicket.update({ where: { id: t.id }, data: { status: 'RESOLVED', resolvedAt: at } }); add('ticketsResolved'); continue; }
        if (t.status === 'OPEN' && !t.firstResponseAt) {
          await tx.supportReply.create({ data: { id: reg('SupportReply', randomUUID()), ticketId: t.id, authorUserId: care, body: PULSE_AGENT_REPLY, kind: 'AGENT', createdAt: at } });
          await tx.supportTicket.update({ where: { id: t.id }, data: { status: 'WAITING_ON_CUSTOMER', firstResponseAt: at, lastAgentAt: at, assignedToId: care, pendingSince: at } });
          add('ticketsAnswered');
        }
      }

      // ── Monday's notice (never emailed) ──
      if (broadcastNumber) {
        const open = await tx.jobCard.count({ where: { branchId: isolo.id, status: { in: [...OPEN_JOB] } } });
        await tx.broadcast.create({ data: {
          id: reg('Broadcast', randomUUID()), broadcastNumber, organisationId, category: 'ANNOUNCEMENT', title: 'This week in the workshop', message: `${open} job cards are open at Isolo this Monday. Supervisors: clear the estimates waiting for approval before Wednesday; front desk: confirm this week’s service bookings with the customers.`,
          audience: 'BRANCH', audienceIds: [isolo.id], startsAt: lagosAt(day.dayKey, 7, 30), endsAt: lagosAt(nextWorkingDay(nextWorkingDay(nextWorkingDay(nextWorkingDay(day.dayKey)))), 18), sendEmail: false, createdById: by(staff('isolo.admin')), createdAt: lagosAt(day.dayKey, 7, 30),
        } });
        add('broadcasts');
      }

      audit(by(staff('admin')), 'demo.pulse', 'Organisation', organisationId, now, { day: day.dayKey, counts });
      if (audits.length) await tx.auditLog.createMany({ data: audits });
      await tx.demoRecord.createMany({ data: registry.map((x) => ({ organisationId, model: x.model, recordId: x.recordId })) });
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (e) {
    // Someone else claimed today first (unique marker): that run added the day.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return result('already');
    throw e;
  }
  return result('added', counts);
}

/** Every demo organisation's day (the daily job and the deploy). */
export async function runDemoPulseForAll(now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<PulseResult[]> {
  if (!pulseEnabled(env)) return [];
  const orgs = await prisma.organisation.findMany({ where: { isDemo: true }, select: { id: true } });
  const out: PulseResult[] = [];
  for (const o of orgs) out.push(await runDemoPulse(o.id, now, env));
  return out;
}

/** After a dashboard is shown: today's day, if it is not there yet. Never throws (the page must not care). */
export async function ensureDemoPulse(organisationId: string | null | undefined): Promise<void> {
  if (!organisationId || !pulseEnabled()) return;
  try {
    const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { isDemo: true } });
    if (!org?.isDemo) return;
    await runDemoPulse(organisationId);
  } catch (e) {
    console.error('Demo pulse failed (the page was not affected):', e instanceof Error ? e.message : e);
  }
}
