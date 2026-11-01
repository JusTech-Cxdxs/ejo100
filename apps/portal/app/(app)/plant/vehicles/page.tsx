import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listPlantVehicles } from '@/lib/actions/plant';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { ExportAction } from '@/components/ExportAction';
import { PDI_STATUS_WORDS, PLANT_STAGES, PLANT_STAGE_WORDS, type PlantStage } from '@/lib/plant/pdi';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** Every vehicle in the plant: its stage, latest PDI and SAP numbers. Search by VIN, model, engine number, production order or equipment number. */
export default async function PlantVehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  await guardPage('plant.view', '/plant/vehicles');
  const sp = await searchParams;
  const stage = PLANT_STAGES.includes(sp.stage as PlantStage) ? (sp.stage as PlantStage) : undefined;
  const rows = await listPlantVehicles(sp.q, stage);
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="garage" back={{ href: '/plant', label: 'Back to the plant' }} title="Vehicles in the plant" description="From kit arrival to sale, with the numbers SAP knows them by." actions={<ExportAction kind="plant-vehicles" params={sp} />} />
      <form className="flex flex-wrap gap-2" action="/plant/vehicles">
        {stage ? <input type="hidden" name="stage" value={stage} /> : null}
        <LiveSearchInput name="q" defaultValue={sp.q ?? ''} placeholder="VIN, model, engine number, production order, equipment…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </form>
      <nav aria-label="Stage" className="flex flex-wrap gap-2 text-xs">
        <Link href={`/plant/vehicles${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ''}`} aria-current={!stage ? 'page' : undefined} className={`rounded-full px-3 py-1 font-medium ${!stage ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Every stage</Link>
        {PLANT_STAGES.map((s) => <Link key={s} href={s === 'KIT' ? '/plant/kits' : `/plant/vehicles?stage=${s}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`} aria-current={stage === s ? 'page' : undefined} className={`rounded-full px-3 py-1 font-medium ${stage === s ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{PLANT_STAGE_WORDS[s]}</Link>)}
      </nav>
      <SectionCard icon="car" title={`${rows.length} ${rows.length === 1 ? 'vehicle' : 'vehicles'}`} flush>
        {rows.length === 0 ? <div className="p-4"><EmptyState compact icon="garage" title="No vehicle matches.">Vehicles join the plant when their kit is released to the line, or when their PDI starts. Kits still at arrival are under Kits.</EmptyState></div> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <Link href={`/vehicles/${r.vin}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.vin}</Link> · {r.model}{r.colour ? ` · ${r.colour}` : ''}
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{[r.engineNumber ? `engine ${r.engineNumber}` : null, r.sapProductionOrder ? `order ${r.sapProductionOrder}` : null, r.sapEquipment ? `equipment ${r.sapEquipment}` : null, r.branch, `since ${formatDateOnly(r.createdAt)}`].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <StatusChip tone={r.stage === 'YARD' || r.stage === 'SOLD' ? 'success' : 'info'}>{PLANT_STAGE_WORDS[r.stage]}</StatusChip>
                  {r.lastPdi ? <Link href={`/plant/pdi/${r.lastPdi.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">{r.lastPdi.number} · {PDI_STATUS_WORDS[r.lastPdi.status]}</Link> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
