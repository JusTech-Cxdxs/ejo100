import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getBuild } from '@/lib/actions/plant-line';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { StationWork } from '@/components/plant/StationWork';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { minutesBetween } from '@/lib/plant/line';

export const dynamic = 'force-dynamic';

/** One vehicle's build: its route station by station, the checks and their results, defects and rework, the gate, the audits. */
export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardPage('plant.view', `/plant/line/${id}`);
  const b = await getBuild(id);
  if (!b) notFound();
  const v = b.vehicle;
  const passed = b.stations.filter((s) => s.status === 'PASSED').length;
  const open = b.defects.filter((d) => d.status !== 'CLOSED').length;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="activity"
        back={{ href: '/plant/line', label: 'Back to the line' }}
        eyebrow={`${v.branch}${v.sapPlant ? ` · SAP plant ${v.sapPlant}` : ''}`}
        title={`Build · ${v.modelName}`}
        description={<><Link href={`/vehicles/${v.vin}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{v.vin}</Link>{v.engineNumber ? <> · engine <span className="font-mono">{v.engineNumber}</span></> : null} · {v.route}{v.lineStartedAt ? ` · on the line since ${formatDateTimeCompact(v.lineStartedAt)}` : ''}</>}
        actions={<span className="flex flex-wrap gap-2"><StatusChip tone={v.gatePassedAt ? 'success' : open ? 'warning' : 'info'}>{v.gatePassedAt ? 'Passed the gate' : v.stageWords}</StatusChip>{open ? <StatusChip tone="error">{open} open {open === 1 ? 'defect' : 'defects'}</StatusChip> : null}</span>}
      />
      {v.gatePassedAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/10 p-4 text-sm text-[var(--ejo-text)]">
          <span><b>Passed the final gate</b> {formatDateTimeCompact(v.gatePassedAt)}{v.lineStartedAt ? ` · ${minutesBetween(v.lineStartedAt, v.gatePassedAt)} minutes on the line` : ''}. Ready for PDI{b.audits.length ? ` · ${b.audits.length} QA ${b.audits.length === 1 ? 'audit' : 'audits'}` : ''}.</span>
          <Link href="/plant" className="font-medium text-[var(--ejo-primary)] hover:underline">Start its PDI →</Link>
        </div>
      ) : null}
      <SectionCard icon="clipboard" title={`${passed} of ${b.stations.length} stations passed`} description="Stations run in order. A failed check raises a defect; the station stays failed until the defect is reworked, verified and the check re-recorded.">
        <StationWork view={b} />
      </SectionCard>
      {b.audits.length ? (
        <SectionCard icon="badge" title="QA audits" flush>
          <ul className="divide-y divide-[var(--ejo-border)]">{b.audits.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"><span><Link href={`/plant/qa/${a.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{a.number}</Link> · {a.auditor} · {formatDateTimeCompact(a.startedAt)}</span><StatusChip tone={a.result === 'PASS' ? 'success' : a.result === 'FAIL' ? 'error' : 'info'}>{a.result ? `${a.result === 'PASS' ? 'Passed' : 'Failed'} · ${a.demerits} demerits` : 'In progress'}</StatusChip></li>)}</ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
