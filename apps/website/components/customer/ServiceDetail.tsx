import Link from 'next/link';
import type { ServiceItem } from '@/lib/customer-portal/data';
import { fmtDate, fmtDateTime, naira, COLLECTION_FRIENDLY_NOTICE_DAYS } from '@/lib/customer-portal/format';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-payment-constants';
import { Badge, BackLink, Card, KeyValue, Notice, SectionTitle, Stepper, Timeline, type TimelineEntry } from './ui';
import { PayHow, type BankDetails } from './PayHow';
import { Meter } from './Charts';
import { Icon } from './Icon';

export type EstimateLine = { id: string; type: string; description: string; quantity: number; amount: number | null; unit: string | null };
export type BranchInfo = { name: string; address: string | null; hotlines: string[]; email: string | null; bank: BankDetails };
export type LinkedWarranty = { id: string; number: string; subject: string; endsAt: Date; status: string };

const LINE_GROUP: Record<string, string> = {
  STORE_PART: 'Parts & services', EXTERNAL_PART: 'Parts & services', EXTERNAL_JOB: 'Parts & services', INTERNAL_JOB: 'Parts & services',
  LABOUR: 'Labour', SUNDRY: 'Sundry',
};

const METHOD: Record<string, string> = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash' };

function timelineFor(i: ServiceItem): TimelineEntry[] {
  const e: TimelineEntry[] = [];
  const current = (on: boolean): 'current' | undefined => (on ? 'current' : undefined);
  if (i.kind === 'vs') e.push({ label: 'Booked', at: i.createdAt, icon: 'calendarCheck', text: 'Your service was booked.' });
  e.push({ label: 'Checked in', at: i.kind === 'jc' ? i.createdAt : i.checkedInAt, icon: 'car', text: 'Your vehicle arrived at the workshop.' });
  if (i.estimateNotifiedAt) e.push({ label: 'Estimate sent to you', at: i.estimateNotifiedAt, icon: 'receipt', text: i.money.estimateTotal !== null ? `Total ${naira(i.money.estimateTotal)}.` : undefined, tone: current(i.awaitingApproval) });
  for (const p of i.payments) e.push({ label: `Payment received — ${naira(p.amount)}`, at: p.recordedAt, icon: 'wallet', text: METHOD[p.method] ?? undefined });
  if (i.phase === 'cancelled') {
    e.push({ label: 'Cancelled', at: i.cancelledAt, icon: 'ban', tone: 'danger', text: i.info.explain });
    for (const r of i.refunds) e.push({ label: `Refund recorded — ${naira(r.amount)}`, at: r.recordedAt, icon: 'refund', text: `Reference ${r.reference}` });
    return inTimeOrder(e);
  }
  if (i.linked?.relation === 'continued-as') {
    e.push({ label: `Moved to Job Card ${i.linked.number}`, at: i.escalatedAt, icon: 'route', text: 'We found something that needs a fuller repair, so the work continues on a Job Card.' });
    return inTimeOrder(e);
  }
  const working = i.status === 'IN_PROGRESS' || i.status === 'AWAITING_PARTS' || i.status === 'QUALITY_CHECK' || i.status === 'IN_SERVICE';
  e.push({ label: i.status === 'AWAITING_PARTS' ? 'Work started — now waiting for parts' : 'Work started', at: i.workStartedAt, icon: 'wrench', tone: current(working && !i.completedAt), text: i.status === 'AWAITING_PARTS' ? i.info.explain : undefined });
  e.push({ label: 'Work completed', at: i.completedAt, icon: 'checkCircle', tone: current(i.status === 'COMPLETED') });
  e.push({ label: 'Ready for collection', at: i.readyAt, icon: 'parking', tone: current(i.waitingForCollection && !i.closedAt) });
  if (i.closedAt) e.push({ label: 'Signed off', at: i.closedAt, icon: 'checkCircle', tone: current(i.waitingForCollection) });
  e.push({ label: 'Collected', at: i.collectedAt, icon: 'thumb' });
  for (const r of i.refunds) e.push({ label: `Refund recorded — ${naira(r.amount)}`, at: r.recordedAt, icon: 'refund', text: `Reference ${r.reference}` });
  return inTimeOrder(e);
}

/** Dated events in time order; steps without a date yet keep their natural order at the end. */
function inTimeOrder(e: TimelineEntry[]): TimelineEntry[] {
  return e
    .map((x, idx) => ({ x, idx }))
    .sort((a, b) => (a.x.at ? a.x.at.getTime() : Number.MAX_SAFE_INTEGER) - (b.x.at ? b.x.at.getTime() : Number.MAX_SAFE_INTEGER) || a.idx - b.idx)
    .map(({ x }) => x);
}

/**
 * The full, customer-friendly picture of one Job Card or Vehicle Service:
 * status with a plain explanation, progress, timeline, what was reported,
 * the estimate (once sent to the customer), payments and balance, how to
 * pay, collection details and who to call.
 */
export function ServiceDetail({ item, complaints, lines, branch, mileage, warranties }: {
  item: ServiceItem;
  complaints: string[];
  lines: EstimateLine[] | null;
  branch: BranchInfo | null;
  mileage: number | null;
  warranties: LinkedWarranty[];
}) {
  const m = item.money;
  const owe = item.phase === 'cancelled' || item.status === 'ESCALATED' ? 0 : (m.balance ?? 0);
  const reference = `${item.number} — ${item.vehicle.label}${item.vehicle.plate ? ` — ${item.vehicle.plate}` : ''}`;
  const groups = new Map<string, number>();
  for (const l of lines ?? []) groups.set(LINE_GROUP[l.type] ?? 'Other', (groups.get(LINE_GROUP[l.type] ?? 'Other') ?? 0) + (l.amount ?? 0));
  const waiting = item.waitingDays ?? 0;

  return (
    <div className="space-y-6">
      <BackLink href="/customer-portal/dashboard/services">All services</BackLink>

      {/* Header */}
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-5 sm:p-8">
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-primary)]">{item.kind === 'jc' ? 'Job Card' : 'Vehicle service'}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-3xl">{item.number}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--ejo-text-muted)]"><Icon name="car" size={15} />{item.vehicle.label}{item.vehicle.plate ? ` · ${item.vehicle.plate}` : ''}</p>
          </div>
          <Badge tone={item.info.tone}>{item.info.label}</Badge>
        </div>
        <p className="relative mt-4 max-w-2xl text-sm leading-relaxed text-[var(--ejo-text)]">{item.info.explain}</p>
        {item.phase === 'active' ? <div className="relative mt-6"><Stepper steps={item.steps} current={item.step} /></div> : null}
      </section>

      {/* What needs doing now */}
      {item.awaitingApproval ? (
        <Notice tone="attention" icon="receipt">
          <strong>Your approval is needed.</strong> Pay the minimum deposit of <strong>{naira(m.depositDue ?? 0)}</strong> ({Math.round(MINIMUM_DEPOSIT_FRACTION * 100)}% of the estimate){item.approvalDeadline ? <> by <strong>{fmtDate(item.approvalDeadline)}</strong></> : null} and we’ll start straight away. Details on how to pay are below.
        </Notice>
      ) : null}
      {item.waitingForCollection ? (
        <Notice tone={waiting >= COLLECTION_FRIENDLY_NOTICE_DAYS ? 'attention' : 'success'} icon="parking">
          <strong>{waiting === 0 ? 'Ready for collection today.' : `Ready for collection for ${waiting} day${waiting === 1 ? '' : 's'}.`}</strong>{' '}
          {item.collectBy ? <>Please collect by <strong>{fmtDate(item.collectBy)}</strong>{waiting >= COLLECTION_FRIENDLY_NOTICE_DAYS ? ' — after that, storage charges may apply.' : '.'}</> : null}
          {owe > 0 ? <> Please settle the balance of <strong>{naira(owe)}</strong> before collection.</> : null}
        </Notice>
      ) : null}
      {item.phase === 'cancelled' ? (
        <Notice tone="danger" icon="ban">
          <strong>This visit was cancelled{item.cancelledAt ? ` on ${fmtDate(item.cancelledAt)}` : ''}.</strong>{' '}
          {m.paid > 0
            ? m.refunded >= m.paid ? <>Your refund of {naira(m.refunded)} has been recorded.</> : <>You paid {naira(m.paid)}{m.refunded > 0 ? <> and {naira(m.refunded)} has been refunded so far</> : null}. Our team will contact you about the refund.</>
            : 'No payment was taken.'}
          {item.inCustody ? ' Your vehicle is still with us — please arrange to collect it.' : ''}
        </Notice>
      ) : null}
      {item.linked ? (
        <Notice tone="info" icon="route">
          {item.linked.relation === 'continued-as' ? <>This service continues as <Link className="font-semibold text-[var(--ejo-primary)] underline" href={`/customer-portal/dashboard/services/jc/${item.linked.id}`}>Job Card {item.linked.number}</Link> — all work, payments and collection happen there.</>
            : <>This Job Card started as <Link className="font-semibold text-[var(--ejo-primary)] underline" href={`/customer-portal/dashboard/services/vs/${item.linked.id}`}>service {item.linked.number}</Link>.</>}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Timeline */}
          <Card className="p-5 sm:p-6">
            <SectionTitle icon="route" title="Timeline" />
            <div className="pl-3"><Timeline entries={timelineFor(item)} /></div>
          </Card>

          {/* What you told us */}
          <Card className="p-5 sm:p-6" delay={60}>
            <SectionTitle icon="chat" title="What you asked us to look at" />
            {complaints.length ? (
              <ol className="space-y-2">
                {complaints.map((c, i) => (
                  <li key={i} className="flex gap-3 text-sm text-[var(--ejo-text)]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-xs font-semibold text-[var(--ejo-primary)]">{i + 1}</span>
                    <span className="pt-0.5">{c}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-[var(--ejo-text-muted)]">Nothing recorded yet.</p>}
          </Card>

          {/* Estimate */}
          <Card className="p-5 sm:p-6" delay={120}>
            <SectionTitle icon="receipt" title="Estimate" />
            {lines && m.estimateTotal !== null ? (
              <div data-testid="customer-estimate">
                <ul className="divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)]">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block text-[var(--ejo-text)]">{l.description}</span>
                        <span className="text-xs text-[var(--ejo-text-muted)]">{LINE_GROUP[l.type] ?? 'Other'} · Qty {l.quantity}{l.unit ? ` ${l.unit}` : ''}</span>
                      </span>
                      <span className="shrink-0 font-medium text-[var(--ejo-text)]">{l.amount !== null ? naira(l.amount) : '—'}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-1 text-sm">
                  {[...groups.entries()].map(([g, v]) => (
                    <div key={g} className="flex justify-between text-[var(--ejo-text-muted)]"><dt>{g}</dt><dd>{naira(v)}</dd></div>
                  ))}
                  <div className="flex justify-between border-t border-[var(--ejo-border)] pt-2 text-base font-bold text-[var(--ejo-text)]"><dt>Total estimate</dt><dd>{naira(m.estimateTotal)}</dd></div>
                </dl>
                {item.kind === 'jc' ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Only the items you pay for are shown. Anything covered by a warranty or by us is not included.</p> : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--ejo-text-muted)]">{item.phase === 'cancelled' ? 'No estimate was sent for this visit.' : 'Your estimate will appear here as soon as it’s ready — we’ll let you know.'}</p>
            )}
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          {/* Money */}
          <Card className="p-5" delay={80}>
            <SectionTitle icon="wallet" title="Payments" />
            {m.estimateTotal !== null ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-[var(--ejo-text-muted)]">Paid so far</span>
                  <span className="text-lg font-bold text-[var(--ejo-text)]">{naira(m.netPaid)}</span>
                </div>
                <div className="mt-2"><Meter value={m.netPaid} max={m.estimateTotal} label="Share of the estimate paid" /></div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Estimate</dt><dd className="text-[var(--ejo-text)]">{naira(m.estimateTotal)}</dd></div>
                  {item.phase === 'active' && (m.depositDue ?? 0) > 0 ? <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Minimum deposit ({Math.round(MINIMUM_DEPOSIT_FRACTION * 100)}%)</dt><dd className="text-[var(--ejo-text)]">{naira(m.minDeposit ?? 0)}</dd></div> : null}
                  {m.refunded > 0 ? <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Refunded</dt><dd className="text-[var(--ejo-text)]">{naira(m.refunded)}</dd></div> : null}
                  <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1.5 font-semibold"><dt className="text-[var(--ejo-text)]">Balance</dt><dd className={owe > 0 ? 'text-[#b45309] dark:text-[var(--ejo-warning)]' : 'text-[var(--ejo-success)]'}>{owe > 0 ? naira(owe) : 'Nothing to pay'}</dd></div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-[var(--ejo-text-muted)]">{m.netPaid > 0 ? `You’ve paid ${naira(m.netPaid)}.` : 'Nothing to pay yet.'}</p>
            )}
            {item.payments.length || item.refunds.length ? (
              <ul className="mt-4 space-y-2 border-t border-[var(--ejo-border)] pt-3">
                {item.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-[var(--ejo-text)]"><span className="text-[var(--ejo-success)]"><Icon name="checkCircle" size={15} /></span>{METHOD[p.method] ?? p.method}</span>
                    <span className="text-right"><span className="block font-medium text-[var(--ejo-text)]">{naira(p.amount)}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{fmtDateTime(p.recordedAt)}</span></span>
                  </li>
                ))}
                {item.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-[var(--ejo-text)]"><span className="text-[var(--ejo-info)]"><Icon name="refund" size={15} /></span>Refund {r.reference}</span>
                    <span className="text-right"><span className="block font-medium text-[var(--ejo-text)]">−{naira(r.amount)}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{fmtDateTime(r.recordedAt)}</span></span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {owe > 0 && item.phase === 'active' ? <PayHow branchBank={branch?.bank} reference={reference} /> : null}

          {/* Details */}
          <Card className="p-5" delay={140}>
            <SectionTitle icon="info" title="Details" />
            <dl className="grid grid-cols-2 gap-4">
              <KeyValue label="Opened">{fmtDate(item.createdAt)}</KeyValue>
              <KeyValue label="Branch">{item.branchName ?? '—'}</KeyValue>
              {mileage ? <KeyValue label={item.kind === 'jc' ? 'Mileage at check-in' : 'Odometer'}>{mileage.toLocaleString('en-NG')} km</KeyValue> : null}
              {item.nextServiceDueDate || item.nextServiceDueOdometer ? (
                <KeyValue label="Next service due">{[item.nextServiceDueDate ? fmtDate(item.nextServiceDueDate) : null, item.nextServiceDueOdometer ? `${item.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null].filter(Boolean).join(' or ')}</KeyValue>
              ) : null}
            </dl>
            {warranties.length ? (
              <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
                <p className="text-xs font-medium text-[var(--ejo-text-muted)]">Warranties from this visit</p>
                <ul className="mt-2 space-y-1.5">
                  {warranties.map((w) => (
                    <li key={w.id}><Link href={`/customer-portal/dashboard/warranties/${w.id}`} className="flex items-center justify-between gap-2 text-sm text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]"><span className="flex min-w-0 items-center gap-2"><span className="text-[var(--ejo-primary)]"><Icon name="shield" size={14} /></span><span className="truncate">{w.subject}</span></span><span className="shrink-0 text-xs text-[var(--ejo-text-muted)]">to {fmtDate(w.endsAt)}</span></Link></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {branch ? <BranchCard branch={branch} /> : null}
        </aside>
      </div>
    </div>
  );
}

export function BranchCard({ branch }: { branch: Pick<BranchInfo, 'name' | 'address' | 'hotlines' | 'email'> }) {
  return (
    <Card className="p-5" delay={200}>
      <SectionTitle icon="building" title="Your branch" />
      <p className="text-sm font-semibold text-[var(--ejo-text)]">{branch.name}</p>
      {branch.address ? <p className="mt-1 flex gap-2 text-sm text-[var(--ejo-text-muted)]"><span className="mt-0.5 shrink-0"><Icon name="pin" size={14} /></span>{branch.address}</p> : null}
      <ul className="mt-3 space-y-2">
        {branch.hotlines.map((h) => (
          <li key={h}><a href={`tel:${h.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-sm font-medium text-[var(--ejo-primary)] hover:underline"><Icon name="phone" size={14} />{h}</a></li>
        ))}
        {branch.email ? <li><a href={`mailto:${branch.email}`} className="flex items-center gap-2 break-all text-sm font-medium text-[var(--ejo-primary)] hover:underline"><Icon name="mail" size={14} />{branch.email}</a></li> : null}
      </ul>
      {!branch.hotlines.length && !branch.email ? <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">See Help & support for how to reach us.</p> : null}
    </Card>
  );
}
