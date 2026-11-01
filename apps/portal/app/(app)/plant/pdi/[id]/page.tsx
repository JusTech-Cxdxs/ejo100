import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getPdi } from '@/lib/actions/plant';
import { PageHeader, SectionCard, StatusChip, Icon } from '@/components/ui';
import { PdiChecklist } from '@/components/plant/PdiChecklist';
import { PDI_STATUS_WORDS, USAGE_DECISION_WORDS, type UsageDecision } from '@/lib/plant/pdi';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

const TONE = { IN_PROGRESS: 'info', REWORK: 'warning', SUBMITTED: 'brand', PASSED: 'success', CANCELLED: 'neutral' } as const;

/** One pre-delivery inspection: the vehicle, its checklist, readings and fault codes, rework and the approval. */
export default async function PdiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardPage('plant.view', `/plant/pdi/${id}`);
  const v = await getPdi(id);
  if (!v) notFound();
  const sap = [['Plant (WERKS)', v.vehicle.sapPlant], ['Material (MATNR)', v.vehicle.sapMaterial], ['Production order (AUFNR)', v.vehicle.sapProductionOrder], ['Equipment (EQUNR)', v.vehicle.sapEquipment]] as const;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="clipboard"
        back={{ href: '/plant', label: 'Back to the plant' }}
        eyebrow={`${v.number}${v.attempt > 1 ? ` · attempt ${v.attempt}` : ''}`}
        title={`PDI · ${v.vehicle.model}`}
        description={<><Link href={`/vehicles/${v.vehicle.vin}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{v.vehicle.vin}</Link> · {v.templateName} · inspector {v.inspector} · started {formatDateTimeCompact(v.startedAt)}</>}
        actions={<StatusChip tone={TONE[v.status]}>{PDI_STATUS_WORDS[v.status]}</StatusChip>}
      />
      {v.status === 'PASSED' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/10 p-4 text-sm">
          <span className="text-[var(--ejo-text)]"><b>Passed.</b> Approved by {v.decision.by} {v.decision.at ? formatDateTimeCompact(v.decision.at) : ''} — SAP usage decision {USAGE_DECISION_WORDS[(v.decision.usage ?? 'A') as UsageDecision]}. The vehicle is in the yard.</span>
          <span className="flex flex-wrap gap-2">
            <a href={`/print/pdi-certificate/${v.vehicle.vin}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 font-medium text-[var(--ejo-text)]"><Icon name="printer" size={15} />PDI certificate</a>
            <Link href={`/vehicles/${v.vehicle.vin}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 font-medium text-[var(--ejo-text)]"><Icon name="car" size={15} />Vehicle page and label</Link>
          </span>
        </div>
      ) : null}
      {v.status === 'REWORK' && v.decision.note ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-4 py-2 text-sm text-[var(--ejo-warning-text)]">Rejected by {v.decision.by}: {v.decision.note}</p> : null}
      {v.status === 'CANCELLED' ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text-muted)]">Cancelled: {v.decision.note}</p> : null}
      <SectionCard icon="car" title="The vehicle">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Engine number</dt><dd className="font-mono font-medium text-[var(--ejo-text)]">{v.vehicle.engineNumber ?? '—'}</dd></div>
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Colour</dt><dd className="font-medium text-[var(--ejo-text)]">{v.vehicle.colour ?? '—'}</dd></div>
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Plant</dt><dd className="font-medium text-[var(--ejo-text)]">{v.vehicle.branch}</dd></div>
          {sap.map(([l, val]) => <div key={l}><dt className="text-xs text-[var(--ejo-text-muted)]">{l}</dt><dd className="font-mono font-medium text-[var(--ejo-text)]">{val ?? '—'}</dd></div>)}
        </dl>
      </SectionCard>
      <PdiChecklist view={v} />
    </div>
  );
}
