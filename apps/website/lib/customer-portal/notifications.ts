import { prisma } from '@ejo/database';
import { loadBroadcasts, loadServices, loadWarranties, type ServiceItem } from './data';
import { DAY_MS, naira } from './format';
import { WARRANTY_EXPIRY_NOTICE_DAYS, type Tone } from './status';

/**
 * The customer's notification feed — derived from the dates already on
 * their own records (estimate sent, work started, ready to collect, a
 * payment recorded…) plus live customer broadcasts. Nothing new is stored
 * except which items the customer has read (CustomerNotificationRead,
 * contract 5): keys `bc:<broadcastId>` and `<kind>:<recordId>:<event>`
 * with kind jc | vs | pay | wty.
 */

export type NoticeItem = {
  key: string;
  title: string;
  body: string;
  at: Date;
  href: string;
  icon: string;
  tone: Tone;
  read: boolean;
};

/** Only events from this window can be unread — older ones count as seen,
 * so a long-standing customer's first visit isn't a wall of "new". */
export const NOTICE_UNREAD_WINDOW_DAYS = 60;
/** How far back the feed reaches. */
export const NOTICE_FEED_DAYS = 365;
const FEED_LIMIT = 80;

function servicesEvents(items: ServiceItem[]): Omit<NoticeItem, 'read'>[] {
  const out: Omit<NoticeItem, 'read'>[] = [];
  for (const i of items) {
    const name = `${i.kind === 'jc' ? 'Job Card' : 'Service'} ${i.number}`;
    const car = i.vehicle.plate ? `${i.vehicle.label} (${i.vehicle.plate})` : i.vehicle.label;
    const add = (event: string, at: Date | null, title: string, body: string, icon: string, tone: Tone) => {
      if (at) out.push({ key: `${i.kind}:${i.id}:${event}`, title, body, at, href: i.href, icon, tone });
    };
    if (i.kind === 'jc') add('created', i.createdAt, `${name} opened`, `Your ${car} is checked in. We’ll keep you posted at every step.`, 'wrench', 'info');
    else add('booked', i.createdAt, `${name} booked`, `Your ${car} is booked in for a service.`, 'calendarCheck', 'info');
    if (i.kind === 'vs') add('checked_in', i.checkedInAt, `${name}: checked in`, `Your ${car} has arrived and is with our team.`, 'car', 'info');
    add('estimate', i.estimateNotifiedAt, `Your estimate for ${i.number} is ready`, i.money.estimateTotal !== null ? `Total ${naira(i.money.estimateTotal)} — minimum deposit ${naira(i.money.minDeposit ?? 0)}.` : 'Open it to see the details.', 'receipt', 'attention');
    add('started', i.workStartedAt, `Work started on ${i.number}`, `Our technicians are working on your ${car}.`, 'wrench', 'progress');
    add('completed', i.completedAt, `Work completed on ${i.number}`, 'All done — we’re getting it ready for you.', 'checkCircle', 'success');
    add('ready', i.readyAt, `${i.vehicle.label} is ready for collection`, `${name} is ready. Settle any balance and come and pick it up.`, 'parking', 'success');
    add('closed', i.closedAt, `${name} signed off`, 'Everything is settled and signed off.', 'checkCircle', 'success');
    add('collected', i.collectedAt, `${i.vehicle.label} collected`, `Thank you for choosing us! ${name} is complete.`, 'thumb', 'neutral');
    add('cancelled', i.cancelledAt, `${name} was cancelled`, i.money.netPaid > 0 ? 'Our team will talk to you about a refund of what you paid.' : 'This visit was cancelled.', 'ban', 'danger');
    if (i.linked?.relation === 'continued-as') add('escalated', i.escalatedAt, `${name} moved to a Job Card`, `It continues as ${i.linked.number} for a fuller repair.`, 'route', 'info');
    for (const p of i.payments) {
      out.push({ key: `pay:${p.id}:recorded`, title: `Payment received — ${naira(p.amount)}`, body: `Thank you! Recorded against ${i.number}.`, at: p.recordedAt, href: '/customer-portal/dashboard/payments', icon: 'wallet', tone: 'success' });
    }
    for (const r of i.refunds) {
      out.push({ key: `pay:${r.id}:refunded`, title: `Refund recorded — ${naira(r.amount)}`, body: `Reference ${r.reference} on ${i.number}.`, at: r.recordedAt, href: '/customer-portal/dashboard/payments', icon: 'refund', tone: 'info' });
    }
  }
  return out;
}

/** The whole feed, newest first, with read state. */
export async function loadNotices(customer: { id: string; organisationId: string }): Promise<NoticeItem[]> {
  const now = Date.now();
  const [items, warranties, broadcasts] = await Promise.all([
    loadServices(customer.id),
    loadWarranties(customer.id),
    loadBroadcasts(customer.id, customer.organisationId),
  ]);
  const events: Omit<NoticeItem, 'read'>[] = servicesEvents(items);
  for (const w of warranties) {
    const href = `/customer-portal/dashboard/warranties/${w.id}`;
    events.push({ key: `wty:${w.id}:issued`, title: `Warranty ${w.number} issued`, body: `${w.subject} is covered until ${w.endsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })}.`, at: w.issuedAt, href, icon: 'shield', tone: 'success' });
    if (w.state === 'expiring') {
      events.push({ key: `wty:${w.id}:expiring`, title: `Warranty ${w.number} ends soon`, body: `${w.subject} — cover ends ${w.endsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })}.`, at: new Date(Math.min(now, w.endsAt.getTime() - WARRANTY_EXPIRY_NOTICE_DAYS * DAY_MS)), href, icon: 'clock', tone: 'attention' });
    }
  }
  for (const b of broadcasts) {
    events.push({ key: `bc:${b.id}`, title: b.title, body: b.message, at: b.startsAt, href: '/customer-portal/dashboard/notifications', icon: 'megaphone', tone: b.category === 'URGENT' || b.category === 'SECURITY_ALERT' ? 'danger' : b.category === 'IMPORTANT' ? 'attention' : 'info' });
  }
  const recent = events
    .filter((e) => e.at.getTime() <= now + 60_000 && now - e.at.getTime() <= NOTICE_FEED_DAYS * DAY_MS)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, FEED_LIMIT);
  const candidateKeys = recent.filter((e) => now - e.at.getTime() <= NOTICE_UNREAD_WINDOW_DAYS * DAY_MS).map((e) => e.key);
  const reads = candidateKeys.length
    ? await prisma.customerNotificationRead.findMany({ where: { customerId: customer.id, key: { in: candidateKeys } }, select: { key: true } })
    : [];
  const readSet = new Set(reads.map((r) => r.key));
  const candidates = new Set(candidateKeys);
  return recent.map((e) => ({ ...e, read: !candidates.has(e.key) || readSet.has(e.key) }));
}

/** Keys the customer may mark read: only ones that are really in their own feed. */
export async function ownNoticeKeys(customer: { id: string; organisationId: string }): Promise<Set<string>> {
  const notices = await loadNotices(customer);
  return new Set(notices.filter((n) => !n.read).map((n) => n.key));
}
