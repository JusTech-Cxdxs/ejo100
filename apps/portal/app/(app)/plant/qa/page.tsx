import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listAudits } from '@/lib/actions/plant-line';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { StartAuditButton } from '@/components/plant/StartAuditButton';
import { ExportAction } from '@/components/ExportAction';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** The QA audit: finished vehicles not yet audited (the day's sample), and every audit with its score. */
export default async function QaPage() {
  await guardPage('plant.view', '/plant/qa');
  const q = await listAudits();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="badge" back={{ href: '/plant/line', label: 'Back to the line' }} title="QA audits" description="A sample of finished vehicles re-inspected and scored: 10 demerits for an A finding, 5 for a B, 1 for a C. An A finding or 20 demerits fails the audit and sends the vehicle back to the line." actions={<ExportAction kind="plant-qa-audits" label="Export audits" />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard icon="check-circle" title={`Passed the gate, not yet audited (${q.candidates.length})`} description={q.may.audit ? 'Pick the sample: a few a day, across models.' : undefined} flush>
          {q.candidates.length ? <ul className="divide-y divide-[var(--ejo-border)]">{q.candidates.map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"><span><Link href={`/plant/line/${v.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{v.vin}</Link> · {v.modelCode}{v.gatePassedAt ? <span className="text-xs text-[var(--ejo-text-muted)]"> · gate {formatDateTimeCompact(v.gatePassedAt)}</span> : null}</span>{q.may.audit ? <StartAuditButton vehicleId={v.id} /> : null}</li>)}</ul> : <div className="p-4"><EmptyState compact icon="inbox" title="Nothing waiting to be audited." /></div>}
        </SectionCard>
        <SectionCard icon="badge" title={`Audits (${q.audits.length})`} flush>
          {q.audits.length ? <ul className="divide-y divide-[var(--ejo-border)]">{q.audits.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm" data-audit={a.number}><span><Link href={`/plant/qa/${a.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{a.number}</Link> · <span className="font-mono">{a.vin}</span> · {a.modelCode} · {a.auditor} · {formatDateTimeCompact(a.startedAt)}</span><StatusChip tone={a.result === 'PASS' ? 'success' : a.result === 'FAIL' ? 'error' : 'info'}>{a.result ? `${a.result === 'PASS' ? 'Passed' : 'Failed'} · ${a.demerits} demerits` : 'In progress'}</StatusChip></li>)}</ul> : <div className="p-4"><EmptyState compact icon="badge" title="No audit yet." /></div>}
        </SectionCard>
      </div>
    </div>
  );
}
