import { prisma } from '@ejo/database';
import { allows, firstReach, orgWhere, reachWhere } from '@/lib/authz/server';
import { getAppointment } from '@/lib/actions/scheduling';
import { resolveRecords } from '@/lib/record-resolver';
import { sendLoggedEmail } from '@/lib/logged-email';
import { logFailure } from '@/lib/log';
import { formatLagos, type ReminderRecordType } from '@/lib/reminders-rules';

/**
 * Reminders — server-only helpers (never callable from a browser): delivery
 * by the 10-minute job, the retention clean-up, and "may this person open the
 * record a reminder points at?".
 */

/**
 * Due reminders go out once: each is claimed with one conditional update
 * (PENDING → SENT), so two instances of the job can never both send it. A
 * delivered reminder shows in the person's bell (My work) until they mark it
 * done or snooze it; with "also email me" it is emailed in the branded layout.
 */
export async function deliverDueReminders(now: Date = new Date(), max = 200): Promise<{ delivered: number; emailed: number }> {
  const due = await prisma.reminder.findMany({
    where: { status: 'PENDING', dueAt: { lte: now } },
    orderBy: { dueAt: 'asc' },
    take: max,
    select: { id: true, organisationId: true, ownerId: true, createdById: true, title: true, notes: true, dueAt: true, recordRef: true, recordType: true, recordId: true, viaEmail: true },
  });
  let delivered = 0;
  let emailed = 0;
  for (const r of due) {
    const claimed = await prisma.reminder.updateMany({ where: { id: r.id, status: 'PENDING', dueAt: { lte: now } }, data: { status: 'SENT', sentAt: now } });
    if (claimed.count === 0) continue;
    delivered += 1;
    // A quiet entry (not shown as activity) — it also tells open pages and bells that something changed.
    await prisma.auditLog.create({ data: { userId: null, organisationId: r.organisationId, action: 'reminder.sent', entityType: 'Reminder', entityId: r.id, metadata: { viaEmail: r.viaEmail } } }).catch(() => undefined);
    if (!r.viaEmail) continue;
    try {
      const people = await prisma.user.findMany({ where: { id: { in: [r.ownerId, r.createdById] } }, select: { id: true, fullName: true, email: true, isActive: true } });
      const owner = people.find((p: { id: string }) => p.id === r.ownerId);
      if (!owner?.isActive || !owner.email) continue;
      const setter = r.createdById !== r.ownerId ? people.find((p: { id: string }) => p.id === r.createdById) : null;
      await sendLoggedEmail({
        entityType: 'Reminder',
        entityId: r.id,
        recipients: [{ fullName: owner.fullName, email: owner.email }],
        subject: `Reminder: ${r.title}`.slice(0, 180),
        heading: 'Your reminder',
        lines: [
          r.title,
          `Due ${formatLagos(r.dueAt)} (Lagos time)`,
          ...(r.recordRef ? [`About: ${r.recordRef}`] : []),
          ...(r.notes ? [r.notes.slice(0, 1000)] : []),
          ...(setter ? [`Set for you by ${setter.fullName}.`] : []),
          'Open your reminders to mark it done or snooze it.',
        ],
        path: `/reminders?focus=${r.id}`,
        actorId: null,
      });
      emailed += 1;
    } catch (err) {
      logFailure('Reminder email failed', err);
    }
  }
  return { delivered, emailed };
}

/** Retention (data inventory): done or cancelled reminders are kept 12 months. */
export async function purgeOldReminders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 365 * 86_400_000);
  const r = await prisma.reminder.deleteMany({ where: { status: { in: ['DONE', 'CANCELLED'] }, updatedAt: { lt: cutoff } } });
  return r.count;
}

/**
 * Whether the signed-in person may open this record — the same reach as its
 * page, checked quietly (no "access denied" entry: this only decides whether
 * a link is shown or a record may be attached).
 */
export async function recordVisibleToMe(type: ReminderRecordType, id: string): Promise<boolean> {
  try {
    switch (type) {
      case 'JobCard': {
        const j = await prisma.jobCard.findUnique({ where: { id }, select: { branchId: true } });
        return Boolean(j) && allows('workshop.job_card.view', { branchId: j!.branchId });
      }
      case 'VehicleService': {
        const v = await prisma.vehicleService.findUnique({ where: { id }, select: { branchId: true } });
        return Boolean(v) && allows('workshop.job_card.view', { branchId: v!.branchId });
      }
      case 'Customer':
        return ((await allows('crm.view')) || (await allows('workshop.view'))) && Boolean(await prisma.customer.findFirst({ where: { id, ...(await orgWhere()) }, select: { id: true } }));
      case 'CustomerVehicle':
        return (await allows('workshop.view')) && Boolean(await prisma.customerVehicle.findFirst({ where: { id, customer: await orgWhere() }, select: { id: true } }));
      case 'Part':
        return (await allows('store.view')) && Boolean(await prisma.part.findFirst({ where: { id, ...(await reachWhere('store.view', { lens: false })) }, select: { id: true } }));
      case 'Warranty':
        return (await allows('warranty.view')) && Boolean(await prisma.warranty.findFirst({ where: { id, customer: await orgWhere() }, select: { id: true } }));
      case 'WarrantyClaim':
        return (await allows('warranty.view')) && Boolean(await prisma.warrantyClaim.findFirst({ where: { id, customer: await orgWhere() }, select: { id: true } }));
      case 'PartRequestSlip':
        return Boolean(await prisma.partRequestSlip.findFirst({ where: { id, ...(await firstReach(['workshop.job_card.view', 'store.view'])) }, select: { id: true } }));
      case 'ExternalProcurementRequest':
        return Boolean(await prisma.externalProcurementRequest.findFirst({ where: { id, ...(await firstReach(['workshop.job_card.view', 'store.view', 'procurement.epr.review'])) }, select: { id: true } }));
      case 'Appointment':
        return Boolean(await getAppointment(id));
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/** Label and page for each (type, id) the person may open; others are left out. */
export async function recordLinks(pairs: { type: ReminderRecordType; id: string }[]): Promise<Map<string, { label: string; url: string }>> {
  const unique = pairs.filter((p, i, a) => a.findIndex((x) => x.type === p.type && x.id === p.id) === i).slice(0, 100);
  const visible = (await Promise.all(unique.map(async (p) => ((await recordVisibleToMe(p.type, p.id)) ? p : null)))).filter((p): p is { type: ReminderRecordType; id: string } => Boolean(p));
  const resolved = await resolveRecords(visible);
  const out = new Map<string, { label: string; url: string }>();
  for (const p of visible) {
    const r = resolved.get(`${p.type}:${p.id}`);
    if (r) out.set(`${p.type}:${p.id}`, { label: r.label, url: r.url });
  }
  return out;
}
