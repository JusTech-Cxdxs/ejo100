import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadContact, loadServices, outstanding } from '@/lib/customer-portal/data';
import { fmtDate, naira } from '@/lib/customer-portal/format';
import { Card, EmptyState, PageHero, SectionTitle } from '@/components/customer/ui';
import { PayHow } from '@/components/customer/PayHow';
import { CountUp } from '@/components/customer/CountUp';
import { Icon } from '@/components/customer/Icon';

export const metadata = { title: 'Payments' };

const METHOD: Record<string, string> = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash' };

/** Every payment and refund across the customer's jobs, what is still owed, and how to pay. */
export default async function PaymentsPage() {
  const me = await requireCustomer();
  const [items, contact] = await Promise.all([loadServices(me.id), loadContact(me.id, me.organisationId)]);
  type Row = { id: string; at: Date; kind: 'payment' | 'refund'; amount: number; method: string; number: string; href: string; reference?: string };
  const rows: Row[] = [];
  for (const i of items) {
    for (const p of i.payments) rows.push({ id: p.id, at: p.recordedAt, kind: 'payment', amount: p.amount, method: p.method, number: i.number, href: i.href });
    for (const r of i.refunds) rows.push({ id: r.id, at: r.recordedAt, kind: 'refund', amount: r.amount, method: r.method, number: i.number, href: i.href, reference: r.reference });
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  const paid = rows.filter((r) => r.kind === 'payment').reduce((s, r) => s + r.amount, 0);
  const refunded = rows.filter((r) => r.kind === 'refund').reduce((s, r) => s + r.amount, 0);
  const owing = items.filter((i) => outstanding(i) > 0);
  const totalOwed = owing.reduce((s, i) => s + outstanding(i), 0);

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Payments" icon="wallet" title="Payments & balances" subtitle="Every payment and refund on your account, what’s still to pay on each visit, and how to pay." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Paid to date', value: paid, icon: 'checkCircle' as const, tone: 'text-[var(--ejo-success)]' },
          { label: 'Refunded to you', value: refunded, icon: 'refund' as const, tone: 'text-[var(--ejo-info)]' },
          { label: 'Still to pay', value: totalOwed, icon: 'wallet' as const, tone: totalOwed > 0 ? 'text-[#b45309] dark:text-[var(--ejo-warning)]' : 'text-[var(--ejo-success)]' },
        ].map((t, idx) => (
          <Card key={t.label} className="p-4" delay={idx * 50}>
            <div className="flex items-center justify-between"><p className="text-xs font-medium text-[var(--ejo-text-muted)]">{t.label}</p><span className={t.tone}><Icon name={t.icon} size={17} /></span></div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--ejo-text)]"><CountUp value={t.value} format="naira" /></p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionTitle icon="alert" title="Balances to pay" />
            {owing.length ? (
              <div className="space-y-3">
                {owing.map((i) => (
                  <Link key={i.id} href={i.href} className="ejo-rise ejo-lift flex items-center justify-between gap-3 rounded-[var(--ejo-radius-lg)] border border-l-4 border-[var(--ejo-border)] border-l-[var(--ejo-warning)] bg-[var(--ejo-bg)] p-4">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ejo-text)]">{i.number} · {i.vehicle.label}</span>
                      <span className="block text-xs text-[var(--ejo-text-muted)]">{i.awaitingApproval ? `Minimum deposit ${naira(i.money.depositDue ?? 0)} to approve` : `Paid ${naira(i.money.netPaid)} of ${naira(i.money.estimateTotal ?? 0)}`}</span>
                    </span>
                    <span className="shrink-0 text-right text-base font-bold text-[#b45309] dark:text-[var(--ejo-warning)]">{naira(outstanding(i))}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]"><Icon name="checkCircle" size={19} /></span>
                <p className="text-sm text-[var(--ejo-text)]">You’re fully paid up. Thank you!</p>
              </Card>
            )}
          </section>

          <section>
            <SectionTitle icon="receipt" title="Payment history" />
            {rows.length ? (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-[var(--ejo-border)]" data-testid="payment-history">
                  {rows.map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link href={r.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--ejo-bg)]">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${r.kind === 'payment' ? 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]' : 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)]'}`}><Icon name={r.kind === 'payment' ? 'wallet' : 'refund'} size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--ejo-text)]">{r.kind === 'payment' ? 'Payment' : `Refund ${r.reference}`} · {r.number}</span>
                          <span className="block text-xs text-[var(--ejo-text-muted)]">{fmtDate(r.at)} · {METHOD[r.method] ?? r.method}</span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold ${r.kind === 'payment' ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-info)]'}`}>{r.kind === 'refund' ? '−' : ''}{naira(r.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState icon="receipt" title="No payments yet" text="Payments appear here as soon as our cashier records them." />
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-4">
          <PayHow branchBank={contact?.bank} reference={owing[0] ? `${owing[0].number} — ${owing[0].vehicle.label}${owing[0].vehicle.plate ? ` — ${owing[0].vehicle.plate}` : ''}` : undefined} />
          {owing.length > 1 ? <p className="px-1 text-xs text-[var(--ejo-text-muted)]">Paying for more than one visit? Use each visit’s own number as the reference — open the visit to copy it.</p> : null}
        </aside>
      </div>
    </div>
  );
}
