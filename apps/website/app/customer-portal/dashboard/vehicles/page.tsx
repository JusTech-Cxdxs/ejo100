import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadServices, loadVehicles, nextServiceFor } from '@/lib/customer-portal/data';
import { fmtDate } from '@/lib/customer-portal/format';
import { Badge, EmptyState, PageHero } from '@/components/customer/ui';
import { Icon } from '@/components/customer/Icon';

export const metadata = { title: 'My vehicles' };

/** Each of the customer's vehicles: is it with us now, last visit, next service. */
export default async function VehiclesPage() {
  const me = await requireCustomer();
  const [vehicles, items] = await Promise.all([loadVehicles(me.id), loadServices(me.id)]);
  return (
    <div className="space-y-6">
      <PageHero eyebrow="My vehicles" icon="car" title="Your vehicles" subtitle="Everything we look after for you — where each one is right now, its last visit and when its next service is due." />
      {vehicles.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((v, idx) => {
            const visits = items.filter((i) => i.vehicle.id === v.id && i.status !== 'ESCALATED');
            const custody = visits.find((i) => i.inCustody && i.status !== 'SCHEDULED');
            const last = visits[0];
            const next = nextServiceFor(v.id, items);
            return (
              <Link key={v.id} href={`/customer-portal/dashboard/vehicles/${v.id}`} className="ejo-rise ejo-lift group flex flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-5 hover:border-[var(--ejo-primary)]/40" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="car" size={24} /></span>
                  {custody ? <Badge tone="progress"><Icon name="parking" size={12} /> With us now</Badge> : <Badge tone="neutral">With you</Badge>}
                </div>
                <p className="mt-4 text-base font-semibold text-[var(--ejo-text)]">{v.label}</p>
                {v.plate ? <p className="mt-1 inline-flex w-fit rounded-md border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-[var(--ejo-text)]">{v.plate}</p> : <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">No plate on file</p>}
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-[var(--ejo-text-muted)]">Mileage</dt><dd className="font-medium text-[var(--ejo-text)]">{v.mileage ? `${v.mileage.toLocaleString('en-NG')} km` : '—'}</dd></div>
                  <div><dt className="text-xs text-[var(--ejo-text-muted)]">Visits</dt><dd className="font-medium text-[var(--ejo-text)]">{visits.length}</dd></div>
                  <div><dt className="text-xs text-[var(--ejo-text-muted)]">Last visit</dt><dd className="font-medium text-[var(--ejo-text)]">{last ? fmtDate(last.createdAt) : '—'}</dd></div>
                  <div><dt className="text-xs text-[var(--ejo-text-muted)]">Next service</dt><dd className="font-medium text-[var(--ejo-text)]">{next?.date ? fmtDate(next.date) : next?.odometer ? `${next.odometer.toLocaleString('en-NG')} km` : '—'}</dd></div>
                </dl>
                {custody ? <p className="mt-4 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)]/[0.07] px-3 py-2 text-xs text-[var(--ejo-text)]"><strong>{custody.number}:</strong> {custody.info.label}</p> : null}
                <p className="mt-auto pt-4 text-sm font-medium text-[var(--ejo-primary)]">History & warranties <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span></p>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="car" title="No vehicles yet" text="Our front desk registers your vehicle the first time you bring it in. It will appear here straight after." />
      )}
    </div>
  );
}
