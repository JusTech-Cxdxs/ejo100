import { prisma } from '@ejo/database';
import { sendLoggedEmail } from '@/lib/logged-email';
import { lagosYmd } from '@/lib/nigeria-calendar';

/**
 * Appointment reminders — server-only (never a callable action). Used by
 * the cron endpoint and, as a safety net, whenever the dashboard or the
 * Scheduling pages are opened. Each reminder goes out ONCE (reminderSentAt)
 * and every email is logged.
 */
const time = (d: Date) => new Date(d).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });

export async function sendDueAppointmentReminders(now: Date = new Date()): Promise<number> {
  const due = await prisma.appointment.findMany({
    where: { status: 'SCHEDULED', reminderSentAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 65 * 60000) } },
    select: {
      id: true, title: true, startsAt: true, endsAt: true, location: true,
      room: { select: { name: true } }, owner: { select: { fullName: true, email: true } },
      participants: { select: { user: { select: { fullName: true, email: true } } } },
      visit: { select: { visitorName: true, partySize: true, company: true } },
    },
  });
  let sent = 0;
  for (const a of due) {
    // Claim it first so two runs never both send.
    const claimed = await prisma.appointment.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0) continue;
    const mins = Math.max(1, Math.round((new Date(a.startsAt).getTime() - now.getTime()) / 60000));
    await sendLoggedEmail({
      entityType: 'Appointment', entityId: a.id,
      recipients: [a.owner, ...a.participants.map((p: { user: { fullName: string; email: string } }) => p.user)],
      subject: `Reminder: ${a.title} at ${time(a.startsAt)}`,
      heading: `Your appointment starts in about ${mins} ${mins === 1 ? 'minute' : 'minutes'}`,
      lines: [a.title, `${time(a.startsAt)} – ${time(a.endsAt)}`, `Where: ${a.room?.name ?? a.location ?? '—'}`, `Host: ${a.owner.fullName}`, ...(a.visit ? [`Visitors: ${a.visit.visitorName}${a.visit.partySize > 1 ? ` + ${a.visit.partySize - 1}` : ''}${a.visit.company ? ` (${a.visit.company})` : ''}`] : [])],
      path: `/schedule/${a.id}`, actorId: null,
    });
    await prisma.auditLog.create({ data: { userId: null, action: 'appointment.reminder_sent', entityType: 'Appointment', entityId: a.id, metadata: { minutesBefore: mins } } });
    sent += 1;
  }
  return sent;
}

/** One email per person with their appointments today (host or taking part). */
export async function sendMorningDigest(now: Date = new Date()): Promise<number> {
  const day = lagosYmd(now);
  const start = new Date(`${day}T00:00:00+01:00`), end = new Date(`${day}T23:59:59+01:00`);
  const rows = await prisma.appointment.findMany({
    where: { status: 'SCHEDULED', startsAt: { gte: start, lte: end } },
    orderBy: { startsAt: 'asc' },
    select: { id: true, title: true, startsAt: true, location: true, room: { select: { name: true } }, owner: { select: { id: true, fullName: true, email: true } }, participants: { select: { user: { select: { id: true, fullName: true, email: true } } } } },
  });
  const byPerson = new Map<string, { person: { fullName: string; email: string }; lines: string[] }>();
  for (const a of rows) {
    const line = `${time(a.startsAt)} — ${a.title} (${a.room?.name ?? a.location ?? '—'})`;
    for (const p of [a.owner, ...a.participants.map((x: { user: { id: string; fullName: string; email: string } }) => x.user)]) {
      const e = byPerson.get(p.id) ?? { person: p, lines: [] };
      e.lines.push(line);
      byPerson.set(p.id, e);
    }
  }
  for (const [id, { person, lines }] of byPerson) {
    await sendLoggedEmail({ entityType: 'UserDigest', entityId: id, recipients: [person], subject: `Your appointments today — ${lines.length} ${lines.length === 1 ? 'appointment' : 'appointments'}`, heading: 'Your appointments today', lines, path: '/schedule/calendar', actorId: null });
  }
  return byPerson.size;
}
