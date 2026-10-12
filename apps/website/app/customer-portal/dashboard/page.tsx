import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadServices, loadVehicles, loadWarranties, nextServiceFor, outstanding } from '@/lib/customer-portal/data';
import { loadNotices } from '@/lib/customer-portal/notifications';
import { DAY_MS, firstName, fmtDate, naira, timeAgo, COLLECTION_FRIENDLY_NOTICE_DAYS } from '@/lib/customer-portal/format';
import { AttentionCard, Card, EmptyState, SectionTitle } from '@/components/customer/ui';
import { ServiceCard } from '@/components/customer/ServiceCard';
import { MonthlyBars } from '@/components/customer/Charts';
import { CountUp } from '@/components/customer/CountUp';
import { Icon, type IconName } from '@/components/customer/Icon';
import type { Tone } from '@/lib/customer-portal/status';

export const metadata = { title: 'Overview' };

type Attention = { key: string; icon: IconName; tone: Tone; title: string; text: string; href: string; cta: string; rank: number };

const LAGOS_MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'Africa/Lagos' });
const LAGOS_YM = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Africa/Lagos' }).format(d).slice(0, 7);

/**
 * Overview — what needs the customer's attention first, then their live
 * jobs with progress, a little analytics and the latest notifications.
 * Every figure comes from this customer's own records only.
 */
export default async function CustomerOverviewPage() {
  const me = await requireCustomer();
  const [items, vehicles, warranties, notices] = await Promise.all([
    loadServices(me.id),
    loadVehicles(me.id),
    loadWarranties(me.id),
    loadNotices(me),
  ]);
  const now = new Date();

  // ------------------------------------------------ Needs your attention
  const attention: Attention[] = [];
  for (const i of items) {
    const ref = `${i.number} · ${i.vehicle.label}${i.vehicle.plate ? ` (${i.vehicle.plate})` : ''}`;
    if (i.awaitingApproval) {
      attention.push({
        key: `${i.id}-approve`, rank: 1, icon: 'receipt', tone: 'attention', href: i.href, cta: 'Review estimate',
        title: 'Your estimate is ready for approval',
        text: `${ref}. Total ${naira(i.money.estimateTotal ?? 0)} — pay the minimum deposit of ${naira(i.money.depositDue ?? 0)} to approve${i.approvalDeadline ? ` by ${fmtDate(i.approvalDeadline)}` : ''}.`,
      });
    } else if (outstanding(i) > 0 && i.phase === 'active') {
      attention.push({
        key: `${i.id}-balance`, rank: 3, icon: 'wallet', tone: 'attention', href: i.href, cta: 'See how to pay',
        title: `Balance to pay: ${naira(outstanding(i))}`,
        text: `${ref}. You’ve paid ${naira(i.money.netPaid)} of ${naira(i.money.estimateTotal ?? 0)}.`,
      });
    }
    if (i.waitingForCollection) {
      const days = i.waitingDays ?? 0;
      const gentle = days >= COLLECTION_FRIENDLY_NOTICE_DAYS;
      attention.push({
        key: `${i.id}-ready`, rank: 2, icon: 'parking', tone: gentle ? 'attention' : 'success', href: i.href, cta: 'Collection details',
        title: days === 0 ? `${i.vehicle.label} is ready for collection` : `${i.vehicle.label} has been ready for ${days} day${days === 1 ? '' : 's'}`,
        text: gentle
          ? `${ref}. Please collect it${i.collectBy ? ` by ${fmtDate(i.collectBy)}` : ' soon'} — after that, storage charges may apply.${outstanding(i) > 0 ? ` Balance to settle: ${naira(outstanding(i))}.` : ''}`
          : `${ref}. Come and pick it up whenever suits you${i.collectBy ? ` — before ${fmtDate(i.collectBy)}` : ''}.${outstanding(i) > 0 ? ` Balance to settle: ${naira(outstanding(i))}.` : ''}`,
      });
    }
    if (i.phase === 'cancelled' && i.cancelledAt && now.getTime() - i.cancelledAt.getTime() < 45 * DAY_MS) {
      const refundOutstanding = i.money.paid > 0 && i.money.refunded < i.money.paid;
      attention.push({
        key: `${i.id}-cancelled`, rank: 4, icon: refundOutstanding ? 'refund' : 'ban', tone: 'danger', href: i.href, cta: 'View details',
        title: `${i.number} was cancelled`,
        text: refundOutstanding
          ? `You paid ${naira(i.money.paid)}${i.money.refunded > 0 ? ` and ${naira(i.money.refunded)} has been refunded so far` : ''}. Our team will contact you about your refund.`
          : i.money.refunded > 0 ? `Your refund of ${naira(i.money.refunded)} has been recorded.` : `${ref}.${i.inCustody ? ' Your vehicle is still with us — please arrange to collect it.' : ''}`,
      });
    }
  }
  for (const w of warranties) {
    if (w.state === 'expiring') {
      const days = Math.max(0, Math.ceil((w.endsAt.getTime() - now.getTime()) / DAY_MS));
      attention.push({
        key: `${w.id}-wty`, rank: 5, icon: 'shield', tone: 'info', href: `/customer-portal/dashboard/warranties/${w.id}`, cta: 'See cover',
        title: `Warranty ends in ${days} day${days === 1 ? '' : 's'}`,
        text: `${w.subject} (${w.number}) — cover ends ${fmtDate(w.endsAt)}.`,
      });
    }
  }
  for (const v of vehicles) {
    const next = nextServiceFor(v.id, items);
    if (next?.date) {
      const days = Math.ceil((next.date.getTime() - now.getTime()) / DAY_MS);
      if (days <= 30) {
        attention.push({
          key: `${v.id}-next`, rank: 6, icon: 'calendar', tone: days < 0 ? 'attention' : 'info', href: `/customer-portal/dashboard/vehicles/${v.id}`, cta: 'Vehicle details',
          title: days < 0 ? `${v.label} is due a service` : `Next service for ${v.label} in ${days} day${days === 1 ? '' : 's'}`,
          text: `Due ${fmtDate(next.date)}${next.odometer ? ` or at ${next.odometer.toLocaleString('en-NG')} km, whichever comes first` : ''}. Call your branch to book.`,
        });
      }
    }
  }
  for (const i of items.filter((x) => x.status === 'SCHEDULED')) {
    attention.push({ key: `${i.id}-booked`, rank: 7, icon: 'calendarCheck', tone: 'info', href: i.href, cta: 'View booking', title: `Service booked — ${i.number}`, text: `${i.vehicle.label}. We look forward to seeing you.` });
  }
  attention.sort((a, b) => a.rank - b.rank);

  // ------------------------------------------------ Analytics
  const year = new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Africa/Lagos' }).format(now);
  const inYear = (d: Date) => LAGOS_YM(d).startsWith(year);
  let spentThisYear = 0;
  const monthly = new Map<string, number>();
  for (const i of items) {
    for (const p of i.payments) {
      if (inYear(p.recordedAt)) spentThisYear += p.amount;
      monthly.set(LAGOS_YM(p.recordedAt), (monthly.get(LAGOS_YM(p.recordedAt)) ?? 0) + p.amount);
    }
    for (const r of i.refunds) {
      if (inYear(r.recordedAt)) spentThisYear -= r.amount;
      monthly.set(LAGOS_YM(r.recordedAt), (monthly.get(LAGOS_YM(r.recordedAt)) ?? 0) - r.amount);
    }
  }
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - k), 15));
    return { month: LAGOS_MONTH.format(d), value: Math.max(0, monthly.get(LAGOS_YM(d)) ?? 0) };
  });
  const visitsThisYear = items.filter((i) => inYear(i.createdAt) && i.status !== 'ESCALATED').length;
  const turnarounds = items.filter((i) => i.readyAt).map((i) => (i.readyAt!.getTime() - (i.checkedInAt ?? i.createdAt).getTime()) / DAY_MS).filter((d) => d >= 0);
  const avgTurnaround = turnarounds.length ? turnarounds.reduce((s, d) => s + d, 0) / turnarounds.length : null;
  const active = items.filter((i) => i.phase === 'active' && i.status !== 'SCHEDULED');
  const inCustody = items.filter((i) => i.inCustody && i.status !== 'SCHEDULED').length;
  const totalOwed = items.reduce((s, i) => s + outstanding(i), 0);

  const tiles: { label: string; value: number; format: 'naira' | 'number' | 'days'; suffix?: string; icon: IconName; hint: string }[] = [
    { label: `Spent in ${year}`, value: Math.max(0, spentThisYear), format: 'naira', icon: 'wallet', hint: 'Payments less refunds' },
    { label: `Visits in ${year}`, value: visitsThisYear, format: 'number', icon: 'wrench', hint: 'Job Cards and services' },
    { label: 'Vehicles', value: vehicles.length, format: 'number', icon: 'car', hint: inCustody ? `${inCustody} with us now` : 'None with us right now' },
    { label: 'Average turnaround', value: avgTurnaround ?? 0, format: 'days', suffix: avgTurnaround === null ? undefined : ' days', icon: 'clock', hint: avgTurnaround === null ? 'Shown after your first visit' : 'Check-in to ready' },
  ];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-6 sm:p-8" aria-labelledby="overview-title">
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
        <div className="ejo-orb-slow pointer-events-none absolute -bottom-28 left-10 h-56 w-56 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-primary)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-primary)]" />Your dashboard</p>
            <h1 id="overview-title" className="mt-2 text-2xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-3xl">Welcome back, {firstName(me.fullName)}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">
              {active.length
                ? `${active.length} visit${active.length === 1 ? ' is' : 's are'} in progress. ${attention.length ? `${attention.length} thing${attention.length === 1 ? '' : 's'} could use your attention.` : 'Nothing needs you right now — we’ll keep you posted.'}`
                : attention.length ? `${attention.length} thing${attention.length === 1 ? '' : 's'} could use your attention.` : 'Everything is up to date. We’ll let you know the moment anything changes.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/customer-portal/dashboard/services" className="inline-flex items-center gap-2 rounded-full bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"><Icon name="wrench" size={15} /> My services</Link>
            {totalOwed > 0 ? <Link href="/customer-portal/dashboard/payments" className="inline-flex items-center gap-2 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name="wallet" size={15} /> {naira(totalOwed)} to pay</Link> : null}
          </div>
        </div>
      </section>

      {/* Needs your attention */}
      <section aria-labelledby="attention-title">
        <SectionTitle id="attention-title" icon="alert" title="Needs your attention" />
        {attention.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {attention.slice(0, 8).map((a, idx) => <AttentionCard key={a.key} icon={a.icon} tone={a.tone} title={a.title} text={a.text} href={a.href} cta={a.cta} delay={idx * 50} />)}
          </div>
        ) : (
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]"><Icon name="checkCircle" size={19} /></span>
            <div>
              <p className="text-sm font-semibold text-[var(--ejo-text)]">You’re all set</p>
              <p className="text-sm text-[var(--ejo-text-muted)]">No approvals, payments or collections waiting on you.</p>
            </div>
          </Card>
        )}
      </section>

      {/* Live jobs */}
      <section aria-labelledby="live-title">
        <SectionTitle id="live-title" icon="route" title="In progress" action={<Link href="/customer-portal/dashboard/services" className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">All services</Link>} />
        {active.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {active.slice(0, 4).map((i, idx) => <ServiceCard key={i.id} item={i} delay={idx * 60} />)}
          </div>
        ) : (
          <EmptyState icon="car" title="Nothing in the workshop right now" text="When your vehicle is checked in, you’ll follow every step here — from inspection to collection." />
        )}
      </section>

      {/* Analytics */}
      <section aria-labelledby="stats-title">
        <SectionTitle id="stats-title" icon="chart" title="At a glance" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t, idx) => (
            <Card key={t.label} className="p-4" delay={idx * 50}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--ejo-text-muted)]">{t.label}</p>
                <span className="text-[var(--ejo-primary)]"><Icon name={t.icon} size={16} /></span>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-2xl">
                {t.format === 'days' && avgTurnaround === null ? '—' : <CountUp value={t.value} format={t.format} />}{t.suffix ?? ''}
              </p>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{t.hint}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-3 p-5" delay={200}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--ejo-text)]">Payments, last 6 months</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">Net of refunds</p>
          </div>
          <MonthlyBars data={months} label="Payments per month" />
        </Card>
      </section>

      {/* Latest notifications */}
      <section aria-labelledby="latest-title">
        <SectionTitle id="latest-title" icon="bell" title="Latest updates" action={<Link href="/customer-portal/dashboard/notifications" className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">See all</Link>} />
        {notices.length ? (
          <Card className="divide-y divide-[var(--ejo-border)] overflow-hidden">
            {notices.slice(0, 5).map((n) => (
              <Link key={n.key} href={n.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--ejo-bg)]">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={n.icon} size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${n.read ? 'text-[var(--ejo-text)]' : 'font-semibold text-[var(--ejo-text)]'}`}>{n.title}</span>
                  <span className="block truncate text-xs text-[var(--ejo-text-muted)]">{n.body}</span>
                </span>
                <span className="shrink-0 text-[11px] text-[var(--ejo-text-muted)]">{timeAgo(n.at, now)}</span>
              </Link>
            ))}
          </Card>
        ) : (
          <EmptyState icon="bell" title="No updates yet" text="Estimates, payments and progress on your vehicle will appear here." />
        )}
      </section>
    </div>
  );
}
