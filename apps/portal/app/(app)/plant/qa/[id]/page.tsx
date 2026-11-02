import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getAudit } from '@/lib/actions/plant-line';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { AuditSheet } from '@/components/plant/AuditSheet';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** One QA audit: findings by section with severity, the score, and the result. */
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardPage('plant.view', `/plant/qa/${id}`);
  const a = await getAudit(id);
  if (!a) notFound();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="badge" back={{ href: '/plant/qa', label: 'Back to QA audits' }} eyebrow={a.number} title={`QA audit · ${a.vehicle.modelCode}`} description={<><Link href={`/plant/line/${a.vehicle.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{a.vehicle.vin}</Link> · auditor {a.auditor} · started {formatDateTimeCompact(a.startedAt)}</>} actions={<StatusChip tone={a.result === 'PASS' ? 'success' : a.result === 'FAIL' ? 'error' : 'info'}>{a.result ? `${a.result === 'PASS' ? 'Passed' : 'Failed'} · ${a.demerits} demerits` : 'In progress'}</StatusChip>} />
      <SectionCard icon="clipboard" title="Findings" description="Walk the vehicle section by section. Each finding carries its severity: A (safety or function, 10 demerits), B (must be fixed, 5), C (cosmetic, 1). An A finding or 20 demerits fails the audit; a failed audit raises every finding as a defect and sends the vehicle back to the line.">
        <AuditSheet audit={a} />
      </SectionCard>
    </div>
  );
}
