import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadDevices, type DeviceItem } from '@/lib/customer-portal/zinox-data';
import { fmtDate } from '@/lib/customer-portal/format';
import { Badge, Card, EmptyState, PageHero, SectionTitle } from '@/components/customer/ui';
import { Meter } from '@/components/customer/Charts';
import { Icon } from '@/components/customer/Icon';
import { ActivateWarrantyForm, RegisterDeviceForm } from '@/components/customer/zinox/forms';
import type { Tone } from '@/lib/customer-portal/status';

export const metadata = { title: 'Devices' };

const COVER_TONE: Record<string, Tone> = { active: 'success', expiring: 'attention', expired: 'neutral', void: 'danger', pending: 'info', other: 'neutral', none: 'attention' };

function DeviceCard({ d, delay }: { d: DeviceItem; delay: number }) {
  const c = d.cover;
  const span = c.endsAt && c.daysLeft !== null ? Math.max(1, c.daysLeft) : null;
  return (
    <Card as="article" className="ejo-rise ejo-lift p-4 sm:p-5" delay={delay}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="package" size={19} /></span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-[var(--ejo-text)]">{d.product}{d.configuration ? <span className="font-normal text-[var(--ejo-text-muted)]"> · {d.configuration}</span> : null}</p>
          <p className="text-xs text-[var(--ejo-text-muted)]">Serial <span className="font-mono text-[var(--ejo-text)]">{d.serial}</span>{d.soldAt ? ` · bought ${fmtDate(d.soldAt)}` : ''}</p>
        </div>
        <Badge tone={COVER_TONE[c.state] ?? 'neutral'}>{c.label}</Badge>
      </div>
      {c.endsAt && (c.state === 'active' || c.state === 'expiring') ? (
        <div className="mt-3">
          <Meter value={span ?? 0} max={365} label={`Cover until ${fmtDate(c.endsAt)}${c.daysLeft !== null ? ` (${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left)` : ''}`} />
        </div>
      ) : c.endsAt ? <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Cover ended {fmtDate(c.endsAt)}.</p> : null}
      {d.openJob ? (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--ejo-text)]"><Icon name="wrench" size={13} /> At the Service Centre — <Link href="/customer-portal/dashboard/claims" className="font-medium text-[var(--ejo-primary)] hover:underline">{d.openJob.number}</Link></p>
      ) : null}
      {c.canActivate ? <div className="mt-3"><ActivateWarrantyForm unitId={d.id} product={d.product} /></div> : null}
      {c.warrantyId ? <p className="mt-3 text-xs"><Link href={`/customer-portal/dashboard/warranties/${c.warrantyId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">See the warranty terms</Link></p> : null}
    </Card>
  );
}

/** The customer's devices by serial, their warranty cover today, activation, and registering a device bought from a dealer. */
export default async function DevicesPage() {
  const me = await requireCustomer();
  const devices = await loadDevices(me.id);
  const toActivate = devices.filter((d) => d.cover.canActivate).length;
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Devices" icon="package" title="Your devices" subtitle="Every Zinox, iPower and iTEC product registered to you, by serial, with its warranty cover today. Activate a warranty the day you buy, and register devices you bought from a dealer." />
      {devices.length ? (
        <section>
          <SectionTitle icon="package" title={`Registered to you (${devices.length})`} action={toActivate ? <span className="text-xs text-[var(--ejo-text-muted)]">{toActivate} to activate</span> : undefined} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{devices.map((d, i) => <DeviceCard key={d.id} d={d} delay={Math.min(i, 8) * 40} />)}</div>
        </section>
      ) : (
        <EmptyState icon="package" title="No devices registered yet" text="Devices you buy from us appear here when they are delivered. Bought from a dealer? Register it below with your receipt." />
      )}
      <Card className="p-4 sm:p-6">
        <SectionTitle icon="plus" title="Register a device I bought from a dealer" />
        <p className="mb-4 text-sm text-[var(--ejo-text-muted)]">Enter the serial and where you bought it. Once registered, the warranty starts and you can report faults on it here.</p>
        <RegisterDeviceForm />
      </Card>
    </div>
  );
}
