import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadServices, loadWarranties, nextServiceFor } from '@/lib/customer-portal/data';
import { DAY_MS, fmtDate, vehicleLabel } from '@/lib/customer-portal/format';
import { WARRANTY_STATE_INFO } from '@/lib/customer-portal/status';
import { BackLink, Badge, Card, EmptyState, KeyValue, Notice, SectionTitle } from '@/components/customer/ui';
import { ServiceCard } from '@/components/customer/ServiceCard';
import { Icon } from '@/components/customer/Icon';
import Link from 'next/link';

export const metadata = { title: 'Vehicle' };

/** One vehicle — only if it belongs to the signed-in customer. */
export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCustomer();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const v = await prisma.customerVehicle.findFirst({
    where: { id, customerId: me.id },
    select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, engineType: true, mileage: true, vehicleType: true, createdAt: true },
  });
  if (!v) notFound();
  const [items, warranties] = await Promise.all([loadServices(me.id), loadWarranties(me.id)]);
  const history = items.filter((i) => i.vehicle.id === v.id);
  const mine = warranties.filter((w) => w.vehicle?.id === v.id);
  const next = nextServiceFor(v.id, items);
  const custody = history.find((i) => i.inCustody && i.status !== 'SCHEDULED');
  const overdue = next?.date ? next.date.getTime() < Date.now() : false;
  const soon = next?.date ? !overdue && next.date.getTime() - Date.now() < 30 * DAY_MS : false;

  return (
    <div className="space-y-6">
      <BackLink href="/customer-portal/dashboard/vehicles">My vehicles</BackLink>
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-5 sm:p-8">
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ejo-bg)] text-[var(--ejo-primary)] shadow-sm ring-1 ring-[var(--ejo-border)]"><Icon name="car" size={28} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ejo-text)] sm:text-3xl">{vehicleLabel(v)}</h1>
            {v.plateNumber ? <p className="mt-1 inline-flex rounded-md border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-[var(--ejo-text)]">{v.plateNumber}</p> : null}
          </div>
          {custody ? <Badge tone="progress">With us now</Badge> : <Badge tone="neutral">With you</Badge>}
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyValue label="Mileage">{v.mileage ? `${v.mileage.toLocaleString('en-NG')} km` : '—'}</KeyValue>
          <KeyValue label="Type">{v.vehicleType === 'COMMERCIAL' ? 'Commercial' : v.vehicleType === 'PASSENGER' ? 'Passenger' : '—'}</KeyValue>
          <KeyValue label="VIN / chassis">{v.chassisNumber ?? '—'}</KeyValue>
          <KeyValue label="With us since">{fmtDate(v.createdAt)}</KeyValue>
        </dl>
      </section>

      {custody ? (
        <Notice tone="info" icon="parking"><strong>{custody.number}</strong> — {custody.info.label}. {custody.info.explain} <Link className="font-semibold text-[var(--ejo-primary)] underline" href={custody.href}>Follow it</Link></Notice>
      ) : null}

      <Card className="p-5">
        <SectionTitle icon="calendar" title="Next service" />
        {next ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--ejo-text)]">
              Due <strong>{next.date ? fmtDate(next.date) : '—'}</strong>{next.odometer ? <> or at <strong>{next.odometer.toLocaleString('en-NG')} km</strong></> : null}, whichever comes first.
            </p>
            {overdue ? <Badge tone="attention">Due now</Badge> : soon ? <Badge tone="info">Coming up</Badge> : null}
            <p className="w-full text-xs text-[var(--ejo-text-muted)]">Based on {next.from.number}. Call your branch to book — we’ll also remind you.</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--ejo-text-muted)]">We’ll show the next service date after this vehicle’s first routine service with us.</p>
        )}
      </Card>

      <section>
        <SectionTitle icon="shield" title="Warranties" />
        {mine.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {mine.map((w) => (
              <Link key={w.id} href={`/customer-portal/dashboard/warranties/${w.id}`} className="ejo-lift flex items-start justify-between gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--ejo-text)]">{w.subject}</span><span className="text-xs text-[var(--ejo-text-muted)]">{w.number} · until {fmtDate(w.endsAt)}</span></span>
                <Badge tone={WARRANTY_STATE_INFO[w.state].tone}>{WARRANTY_STATE_INFO[w.state].label}</Badge>
              </Link>
            ))}
          </div>
        ) : <EmptyState icon="shield" title="No warranties on this vehicle" text="Warranties on new parts or work appear here when they’re issued." />}
      </section>

      <section>
        <SectionTitle icon="wrench" title="Service history" />
        {history.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{history.map((i, idx) => <ServiceCard key={i.id} item={i} delay={Math.min(idx, 8) * 40} />)}</div>
        ) : <EmptyState icon="wrench" title="No visits yet" text="This vehicle’s Job Cards and services will appear here." />}
      </section>
    </div>
  );
}
