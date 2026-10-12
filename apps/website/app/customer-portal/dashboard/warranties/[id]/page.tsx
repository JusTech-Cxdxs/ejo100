import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadWarranties } from '@/lib/customer-portal/data';
import { DAY_MS, fmtDate } from '@/lib/customer-portal/format';
import { CLAIM_STATUS, CUSTOMER_RESOLUTION, WARRANTY_STATE_INFO } from '@/lib/customer-portal/status';
import { BackLink, Badge, Card, KeyValue, Notice, SectionTitle } from '@/components/customer/ui';
import { Meter } from '@/components/customer/Charts';
import { Icon } from '@/components/customer/Icon';

export const metadata = { title: 'Warranty' };

/** One warranty — from the customer's own list only (anyone else's is "not found"). */
export default async function WarrantyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCustomer();
  const { id } = await params;
  const w = (await loadWarranties(me.id)).find((x) => x.id === id);
  if (!w) notFound();
  const info = WARRANTY_STATE_INFO[w.state];
  const span = w.endsAt.getTime() - w.startsAt.getTime();
  const left = Math.max(0, w.endsAt.getTime() - Date.now());
  const daysLeft = Math.ceil(left / DAY_MS);
  return (
    <div className="space-y-6">
      <BackLink href="/customer-portal/dashboard/warranties">All warranties</BackLink>
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-5 sm:p-8">
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-primary)]">{w.kind === 'PART' ? 'Part warranty' : 'Vehicle warranty'} · {w.number}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-3xl">{w.subject}</h1>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{w.policyName} · provided by {w.providerName}</p>
          </div>
          <Badge tone={info.tone}>{info.label}</Badge>
        </div>
        {w.state === 'active' || w.state === 'expiring' ? (
          <div className="relative mt-6 max-w-md">
            <div className="mb-1.5 flex justify-between text-xs text-[var(--ejo-text-muted)]"><span>{fmtDate(w.startsAt)}</span><span className="font-semibold text-[var(--ejo-text)]">{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span><span>{fmtDate(w.endsAt)}</span></div>
            <Meter value={left} max={span} label="Cover remaining" />
          </div>
        ) : null}
      </section>

      {w.state === 'expiring' ? <Notice tone="attention" icon="clock">This warranty ends on <strong>{fmtDate(w.endsAt)}</strong>. If anything covered isn’t right, contact your branch before then.</Notice> : null}
      {w.state === 'void' ? <Notice tone="danger" icon="ban">This warranty is no longer valid. Your branch can explain why and what your options are.</Notice> : null}
      {w.state === 'pending' ? <Notice tone="info" icon="info">We’re verifying this warranty with the provider. It will show as active once confirmed.</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <SectionTitle icon="shield" title="What’s covered" />
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--ejo-text)]">{w.coverage}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={w.coversParts ? 'success' : 'neutral'}><Icon name={w.coversParts ? 'check' : 'close'} size={12} /> Parts</Badge>
              <Badge tone={w.coversLabour ? 'success' : 'neutral'}><Icon name={w.coversLabour ? 'check' : 'close'} size={12} /> Labour</Badge>
            </div>
            {w.exclusions ? (<><p className="mt-5 text-sm font-semibold text-[var(--ejo-text)]">Not covered</p><p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--ejo-text-muted)]">{w.exclusions}</p></>) : null}
            {w.conditions ? (<><p className="mt-5 text-sm font-semibold text-[var(--ejo-text)]">Conditions</p><p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--ejo-text-muted)]">{w.conditions}</p></>) : null}
          </Card>

          <Card className="p-5 sm:p-6" delay={60}>
            <SectionTitle icon="receipt" title="Claims" />
            {w.claims.length ? (
              <ul className="space-y-3">
                {w.claims.map((c) => {
                  const s = CLAIM_STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const, explain: '' };
                  return (
                    <li key={c.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--ejo-text)]">{c.number}</p>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-[var(--ejo-text)]">{c.complaint}</p>
                      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{s.explain} Reported {fmtDate(c.failureDate)}.{c.settledAt ? ` Settled ${fmtDate(c.settledAt)}.` : c.decidedAt ? ` Decided ${fmtDate(c.decidedAt)}.` : ''}</p>
                      {c.resolution ? <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ejo-text)]"><span className="text-[var(--ejo-primary)]"><Icon name="checkCircle" size={13} /></span>Outcome for you: {CUSTOMER_RESOLUTION[c.resolution] ?? c.resolution}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[var(--ejo-text-muted)]">No claims on this warranty. If something covered goes wrong, contact your branch and we’ll handle the claim for you.</p>
            )}
          </Card>
        </div>
        <aside className="min-w-0">
          <Card className="p-5" delay={100}>
            <SectionTitle icon="info" title="Details" />
            <dl className="grid grid-cols-2 gap-4">
              <KeyValue label="Starts">{fmtDate(w.startsAt)}</KeyValue>
              <KeyValue label="Ends">{fmtDate(w.endsAt)}</KeyValue>
              {w.distanceLimit ? <KeyValue label="Distance limit">{w.distanceLimit.toLocaleString('en-NG')} km{w.startReading ? ` (from ${w.startReading.toLocaleString('en-NG')} km)` : ''}</KeyValue> : null}
              <KeyValue label="Issued">{fmtDate(w.issuedAt)}</KeyValue>
              {w.vehicle ? <KeyValue label="Vehicle"><Link className="text-[var(--ejo-primary)] hover:underline" href={`/customer-portal/dashboard/vehicles/${w.vehicle.id}`}>{w.vehicle.label}{w.vehicle.plate ? ` · ${w.vehicle.plate}` : ''}</Link></KeyValue> : null}
              {w.source ? <KeyValue label="From visit"><Link className="text-[var(--ejo-primary)] hover:underline" href={`/customer-portal/dashboard/services/${w.source.kind}/${w.source.id}`}>{w.source.number}</Link></KeyValue> : null}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
