import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getImportJob } from '@/lib/actions/data-exchange';
import { ENTITIES } from '@/lib/data-exchange/fields';
import { importStatus } from '@/lib/data-exchange/status';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { ImportJobView } from '@/components/data-exchange/ImportJobView';
import { PageHeader, StatusChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ImportJobPage({ params }: { params: Promise<{ id: string }> }) {
  await guardAnyPage(['dataexchange.import.run', 'dataexchange.import.approve'], '/data-exchange/imports');
  const { id } = await params;
  const job = await getImportJob(id).catch(() => null);
  if (!job) notFound();
  const st = importStatus(job.status);
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="layers"
        back={{ href: '/data-exchange', label: 'Back to Data Exchange' }}
        title={`${job.number} · ${ENTITIES[job.entity].label}`}
        description={<>{job.fileName} · {job.fileRows.toLocaleString('en-NG')} rows · from {job.sourceSystem === 'SAP' ? 'SAP' : 'an old system or spreadsheet'} · started by {job.createdBy}, {formatDateTimeCompact(job.createdAt)}</>}
        actions={<StatusChip label={st.label} tone={st.tone} />}
      />
      <ImportJobView job={job} />
    </div>
  );
}
