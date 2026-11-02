import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getKit } from '@/lib/actions/plant-kits';
import { Icon, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { KitInspection } from '@/components/plant/KitInspection';
import { KIT_STATUS_WORDS, KIT_TYPE_WORDS } from '@/lib/plant/kits';
import { formatDateOnly, formatDateTimeCompact } from '@/lib/utils/format-date';
import { KIT_TONE } from '@/components/plant/KitList';

export const dynamic = 'force-dynamic';

/** One kit: what the packing list says, its arrival checks, shortages and damage, and the release. */
export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardPage('plant.view', `/plant/kits/${id}`);
  const k = await getKit(id);
  if (!k) notFound();
  const facts = [['Engine number', k.engineNumber], ['Model', k.modelName], ['Kit type', KIT_TYPE_WORDS[k.kitType]], ['Lot', k.lotNumber], ['Plant', k.branch], ['Arrived', formatDateOnly(k.shipment.arrivedAt)], ['Bill of lading', k.shipment.billOfLading], ['Checklist', k.templateName]] as const;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="boxes"
        back={{ href: '/plant/kits', label: 'Back to kits' }}
        eyebrow={k.number}
        title={`Kit · ${k.modelName}`}
        description={<><Link href={`/vehicles/${k.vin}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{k.vin}</Link> · shipment <Link href={`/plant/shipments/${k.shipment.id}`} className="font-mono text-[var(--ejo-primary)] hover:underline">{k.shipment.number}</Link> from {k.shipment.supplier}{k.inspector ? ` · inspector ${k.inspector}` : ''}</>}
        actions={<StatusChip tone={KIT_TONE[k.status]}>{KIT_STATUS_WORDS[k.status]}</StatusChip>}
      />
      {k.status === 'RELEASED' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/10 p-4 text-sm">
          <span className="text-[var(--ejo-text)]"><b>{k.decision.withShortages ? 'Released to the line with shortages.' : 'Released to the line.'}</b> By {k.decision.by} {k.decision.at ? formatDateTimeCompact(k.decision.at) : ''} — SAP usage decision A.{k.decision.note ? ` ${k.decision.note}` : ''}</span>
          {k.vehicle ? <Link href={`/vehicles/${k.vehicle.vin}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 font-medium text-[var(--ejo-text)]"><Icon name="car" size={15} />The vehicle · {k.vehicle.stageWords}</Link> : null}
        </div>
      ) : null}
      {k.status === 'ON_HOLD' ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-4 py-2 text-sm text-[var(--ejo-warning-text)]">On hold by {k.decision.by}: {k.decision.note}. Put it right, then send it for release again.</p> : null}
      {k.status === 'REJECTED' ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/10 px-4 py-2 text-sm text-[var(--ejo-error)]">Rejected by {k.decision.by} (SAP usage decision R): {k.decision.note}. This kit is not built.</p> : null}
      {k.status === 'CANCELLED' ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text-muted)]">Cancelled: {k.decision.note}</p> : null}
      <SectionCard icon="clipboard" title="From the packing list">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pb-4 text-sm sm:grid-cols-4">
          {facts.map(([l, v]) => <div key={l}><dt className="text-xs text-[var(--ejo-text-muted)]">{l}</dt><dd className="break-words font-medium text-[var(--ejo-text)]">{v ?? '—'}</dd></div>)}
        </dl>
      </SectionCard>
      <KitInspection view={k} />
    </div>
  );
}
