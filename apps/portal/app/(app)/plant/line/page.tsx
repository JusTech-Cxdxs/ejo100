import Link from 'next/link';
import { allows, guardPage } from '@/lib/authz/server';
import { getLineBoard } from '@/lib/actions/plant-line';
import { getPlantReach } from '@/lib/actions/plant';
import { PlantReachNotice } from '@/components/plant/PlantReachNotice';
import { StartBuildButton } from '@/components/plant/StartBuildButton';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { ExportAction } from '@/components/ExportAction';
import { STATION_KIND_WORDS, VISIT_STATUS_WORDS } from '@/lib/plant/line';
import { LiveRefresh } from '@/components/LiveRefresh';

export const dynamic = 'force-dynamic';

const nf = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-NG'));

/** The line board: every VIN at its station, live, with its defects and time there; the plant's figures. */
export default async function LinePage() {
  await guardPage('plant.view', '/plant/line');
  const [b, reach, canStructure] = await Promise.all([getLineBoard(), getPlantReach(), allows('admin.structure.manage')]);
  const f = b.figures;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <LiveRefresh seconds={30} />
      <PageHeader icon="activity" back={{ href: '/plant', label: 'Back to the plant' }} eyebrow={b.plant?.name} title="The line" description="Every vehicle at its station, with its defects and how long it has been there. Tap a vehicle to work its station." actions={<span className="flex flex-wrap gap-2">{b.may.manage ? <Link href="/plant/routes" className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60">Routes</Link> : null}<Link href="/plant/qa" className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60">QA audits</Link><ExportAction kind="plant-stations" label="Export stations" /><ExportAction kind="plant-defects" label="Export defects" /></span>} />
      {reach.reason !== 'ok' ? <PlantReachNotice reach={reach} canManageStructure={canStructure} /> : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Line figures">
            {([['On the line', nf(f.onLine), null], ['In rework', nf(f.inRework), f.inRework ? 'warning' : null], ['Passed the gate today', nf(f.passedToday), null], ['First-time-through (30 days)', f.ftt === null ? '—' : `${f.ftt}%`, null], ['Defects per unit (30 days)', f.dpu === null ? '—' : String(f.dpu), null], ['A-defects open', nf(f.openA), f.openA ? 'error' : null]] as const).map(([l, v, tone]) => (
              <li key={l} className={`rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] p-4 ${tone === 'error' ? 'border-[var(--ejo-error)]/50' : tone === 'warning' ? 'border-[var(--ejo-warning)]/50' : 'border-[var(--ejo-border)]'}`}>
                <span className="block text-2xl font-bold tabular-nums text-[var(--ejo-text)]">{v}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{l}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Stations">
            {b.stations.map((s) => (
              <section key={s.code} aria-labelledby={`col-${s.code}`} className="w-60 shrink-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]" data-column={s.code}>
                <h2 id={`col-${s.code}`} className="border-b border-[var(--ejo-border)] px-3 py-2 text-sm font-semibold text-[var(--ejo-text)]"><span className="font-mono text-xs text-[var(--ejo-text-muted)]">{s.code}</span> {s.name}<span className="block text-xs font-normal text-[var(--ejo-text-muted)]">{STATION_KIND_WORDS[s.kind]} · {s.standardMinutes} min{s.median !== null ? ` · median ${s.median}` : ''}{s.median !== null && s.median > s.standardMinutes ? ' · slow' : ''}</span></h2>
                <ul className="min-h-16 space-y-2 p-2">
                  {s.vehicles.map((v) => (
                    <li key={v.id}><Link href={`/plant/line/${v.id}`} className={`block rounded-[var(--ejo-radius-md)] border p-2 text-sm hover:border-[var(--ejo-primary)]/60 ${v.aDefects ? 'border-[var(--ejo-error)]/60 bg-[var(--ejo-error)]/5' : v.status === 'FAILED' ? 'border-[var(--ejo-warning)]/60 bg-[var(--ejo-warning)]/10' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)]'}`} data-vin={v.vin}>
                      <span className="block font-mono text-xs font-medium text-[var(--ejo-text)]">{v.vin}</span>
                      <span className="block text-xs text-[var(--ejo-text-muted)]">{v.modelCode} · {v.status ? VISIT_STATUS_WORDS[v.status] : ''} · {v.minutesHere ?? 0} min{v.openDefects ? ` · ${v.openDefects} open ${v.openDefects === 1 ? 'defect' : 'defects'}${v.aDefects ? ` (${v.aDefects} A)` : ''}` : ''}</span>
                    </Link></li>
                  ))}
                  {!s.vehicles.length ? <li className="px-2 py-3 text-center text-xs text-[var(--ejo-text-muted)]">Empty</li> : null}
                </ul>
              </section>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard icon="check-circle" title={`Passed the gate, ready for PDI (${b.readyForPdi.length})`} flush>
              {b.readyForPdi.length ? <ul className="divide-y divide-[var(--ejo-border)]">{b.readyForPdi.map((v) => <li key={v.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><Link href={`/plant/line/${v.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{v.vin}</Link><span className="text-xs text-[var(--ejo-text-muted)]">{v.modelCode}{v.openDefects ? ` · ${v.openDefects} open` : ''}</span></li>)}</ul> : <div className="p-4"><EmptyState compact icon="inbox" title="No vehicle is waiting for PDI." /></div>}
            </SectionCard>
            <SectionCard icon="boxes" title={`Released from their kit, not started on the line (${b.unstarted.length})`} description={b.may.operate ? 'Start the build: the live route becomes its stations.' : undefined} flush>
              {b.unstarted.length ? <ul className="divide-y divide-[var(--ejo-border)]">{b.unstarted.map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"><span><span className="font-mono font-medium text-[var(--ejo-text)]">{v.vin}</span> · {v.modelCode}</span>{b.may.operate ? <StartBuildButton vehicleId={v.id} /> : null}</li>)}</ul> : <div className="p-4"><EmptyState compact icon="inbox" title="Every vehicle on the line has its stations." /></div>}
            </SectionCard>
          </div>
          {f.topDefects.length ? <SectionCard icon="alert" title="Top defects (30 days)" flush><ul className="divide-y divide-[var(--ejo-border)]">{f.topDefects.map((d) => <li key={d.words} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-[var(--ejo-text)]">{d.words}</span><StatusChip tone="neutral">{d.count}</StatusChip></li>)}</ul></SectionCard> : null}
        </>
      )}
    </div>
  );
}
