import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadWarranties, type WarrantyItem } from '@/lib/customer-portal/data';
import { fmtDate } from '@/lib/customer-portal/format';
import { WARRANTY_STATE_INFO, type WarrantyState } from '@/lib/customer-portal/status';
import { Badge, EmptyState, PageHero, SectionTitle } from '@/components/customer/ui';
import { Meter } from '@/components/customer/Charts';
import { Icon } from '@/components/customer/Icon';

export const metadata = { title: 'Warranties' };

const GROUPS: { key: WarrantyState[]; title: string; icon: 'shield' | 'clock' | 'calendar' | 'ban' }[] = [
  { key: ['expiring'], title: 'Expiring soon', icon: 'clock' },
  { key: ['active', 'pending'], title: 'Active', icon: 'shield' },
  { key: ['expired', 'other'], title: 'Expired', icon: 'calendar' },
  { key: ['void'], title: 'Void', icon: 'ban' },
];

function WarrantyCard({ w, delay }: { w: WarrantyItem; delay: number }) {
  const span = w.endsAt.getTime() - w.startsAt.getTime();
  const used = Math.min(span, Math.max(0, Date.now() - w.startsAt.getTime()));
  const info = WARRANTY_STATE_INFO[w.state];
  return (
    <Link href={`/customer-portal/dashboard/warranties/${w.id}`} className="ejo-rise ejo-lift block rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4 hover:border-[var(--ejo-primary)]/40 sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="shield" size={19} /></span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--ejo-text)]">{w.subject}</p>
          <p className="text-xs text-[var(--ejo-text-muted)]">{w.number} · {w.kind === 'PART' ? 'Part warranty' : 'Vehicle warranty'}{w.vehicle?.plate ? <> · <span className="whitespace-nowrap">{w.vehicle.plate}</span></> : null}</p>
        </div>
        <Badge tone={info.tone}>{info.label}</Badge>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-[var(--ejo-text)]">{w.coverage}</p>
      {w.state === 'active' || w.state === 'expiring' ? <div className="mt-3"><Meter value={span - used} max={span} label="Cover remaining" /></div> : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ejo-text-muted)]">
        <span className="inline-flex items-center gap-1"><Icon name="calendar" size={13} /> {fmtDate(w.startsAt)} – {fmtDate(w.endsAt)}</span>
        {w.distanceLimit ? <span className="inline-flex items-center gap-1"><Icon name="gauge" size={13} /> Up to {w.distanceLimit.toLocaleString('en-NG')} km</span> : null}
        {w.claims.length ? <span className="inline-flex items-center gap-1"><Icon name="receipt" size={13} /> {w.claims.length} claim{w.claims.length === 1 ? '' : 's'}</span> : null}
      </div>
    </Link>
  );
}

/** The customer's warranties, grouped: expiring soon, active, expired, void. */
export default async function WarrantiesPage() {
  const me = await requireCustomer();
  const warranties = await loadWarranties(me.id);
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Warranties" icon="shield" title="What’s covered" subtitle="Warranties on your vehicles and the parts we fitted — how long each lasts, what it covers and any claims." />
      {warranties.length ? (
        GROUPS.map((g) => {
          const list = warranties.filter((w) => g.key.includes(w.state));
          if (!list.length) return null;
          return (
            <section key={g.title}>
              <SectionTitle icon={g.icon} title={`${g.title} (${list.length})`} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{list.map((w, idx) => <WarrantyCard key={w.id} w={w} delay={Math.min(idx, 8) * 40} />)}</div>
            </section>
          );
        })
      ) : (
        <EmptyState icon="shield" title="No warranties yet" text="When we fit a part or carry out work that comes with a warranty, it appears here with its cover and dates." />
      )}
    </div>
  );
}
