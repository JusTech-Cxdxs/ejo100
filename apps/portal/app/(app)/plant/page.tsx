import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getPlantOverview, listPlantBranches } from '@/lib/actions/plant';
import { getKitOverview } from '@/lib/actions/plant-kits';
import { KitList } from '@/components/plant/KitList';
import { getPrincipal } from '@/lib/authz/server';
import { EmptyState, HeaderAction, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { StartPdi } from '@/components/plant/StartPdi';
import { ExportAction } from '@/components/ExportAction';
import { PDI_STATUS_WORDS, PLANT_STAGE_WORDS, type PdiStatus } from '@/lib/plant/pdi';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<PdiStatus, 'info' | 'warning' | 'success' | 'neutral' | 'brand'> = { IN_PROGRESS: 'info', REWORK: 'warning', SUBMITTED: 'brand', PASSED: 'success', CANCELLED: 'neutral' };

/** The assembly plant: vehicles by stage, a PDI started by scanning the label, and the PDI queue. */
export default async function PlantPage() {
  await guardPage('plant.view', '/plant');
  const [o, k, branches, me] = await Promise.all([getPlantOverview(), getKitOverview(), listPlantBranches(), getPrincipal()]);
  const waiting = o.queue.filter((q) => q.status === 'SUBMITTED');
  const working = o.queue.filter((q) => q.status !== 'SUBMITTED');
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="garage" title="Assembly plant" description="Vehicles from kit to yard: kits checked as they arrive and released to the line, and pre-delivery inspections. Scan a vehicle’s label to start or continue its PDI." actions={<span className="flex flex-wrap gap-2">{k.may.receive ? <HeaderAction href="/plant/shipments/new" icon="truck">Record a shipment</HeaderAction> : null}<Link href="/plant/kits" className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60">Kits</Link><Link href="/plant/vehicles" className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60">Vehicles in the plant</Link></span>} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Vehicles by stage">
        {o.stages.map((s) => (
          <li key={s.stage}><Link href={s.stage === 'KIT' ? '/plant/kits' : `/plant/vehicles?stage=${s.stage}`} className="block rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 hover:border-[var(--ejo-primary)]/50">
            <span className="block text-2xl font-bold tabular-nums text-[var(--ejo-text)]">{s.count}</span>
            <span className="block text-xs text-[var(--ejo-text-muted)]">{PLANT_STAGE_WORDS[s.stage]}</span>
          </Link></li>
        ))}
      </ul>
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard icon="boxes" title={`Kits waiting for release (${k.waiting.length})`} description={k.may.release ? 'Release to the line, hold or reject — never a kit you checked.' : 'The quality supervisor or plant manager releases these.'} flush
          actions={k.stoppingIssues ? <Link href="/plant/kits?status=issues" className="text-xs font-medium text-[var(--ejo-error)] hover:underline">{k.stoppingIssues} {k.stoppingIssues === 1 ? 'shortage stops' : 'shortages stop'} the line →</Link> : undefined}>
          <KitList rows={k.waiting} empty="No kit is waiting for release." />
        </SectionCard>
        <SectionCard icon="alert" title={`Kits on hold (${k.onHold.length})`} flush actions={<Link href="/plant/shipments" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Shipments →</Link>}>
          <KitList rows={k.onHold} empty="No kit is on hold." />
        </SectionCard>
      </div>
      {o.may.perform ? (
        <SectionCard icon="clipboard" title="Pre-delivery inspection" description="Isuzu NQR, NPR, QLR, QMR and the Soueast S07 — each with its own checklist.">
          <StartPdi branches={branches} defaultBranchId={me.branchId} canRegister={o.may.register} />
        </SectionCard>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard icon="check-circle" title={`Waiting for approval (${waiting.length})`} description={o.may.approve ? 'Approve, or reject back to rework — never one you inspected.' : 'A PDI supervisor or the plant manager approves these.'} flush>
          <Queue rows={waiting} empty="Nothing is waiting for approval." />
        </SectionCard>
        <SectionCard icon="wrench" title={`In progress and rework (${working.length})`} flush>
          <Queue rows={working} empty="No PDI is in progress." />
        </SectionCard>
      </div>
      <SectionCard icon="badge" title="Recently passed" flush actions={<ExportAction kind="plant-pdis" label="Export PDIs" />}>
        {o.passed.length === 0 ? <div className="p-4"><EmptyState compact icon="badge" title="No vehicle has passed its PDI yet." /></div> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {o.passed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span><Link href={`/plant/pdi/${p.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{p.number}</Link> · <Link href={`/vehicles/${p.vin}`} className="font-mono hover:underline">{p.vin}</Link> · {p.model}</span>
                <span className="text-xs tabular-nums text-[var(--ejo-text-muted)]">{formatDateTimeCompact(p.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Queue({ rows, empty }: { rows: Awaited<ReturnType<typeof getPlantOverview>>['queue']; empty: string }) {
  if (!rows.length) return <div className="p-4"><EmptyState compact icon="inbox" title={empty} /></div>;
  return (
    <ul className="divide-y divide-[var(--ejo-border)]">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
          <span className="min-w-0">
            <Link href={`/plant/pdi/${r.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</Link>
            {r.attempt > 1 ? <span className="ml-1 text-xs text-[var(--ejo-text-muted)]">attempt {r.attempt}</span> : null}
            <span className="block text-xs text-[var(--ejo-text-muted)]"><span className="font-mono">{r.vin}</span> · {r.model} · {r.inspector}</span>
          </span>
          <span className="flex flex-col items-end gap-1"><StatusChip tone={STATUS_TONE[r.status]}>{PDI_STATUS_WORDS[r.status]}</StatusChip><span className="text-xs tabular-nums text-[var(--ejo-text-muted)]">{formatDateTimeCompact(r.at)}</span></span>
        </li>
      ))}
    </ul>
  );
}
