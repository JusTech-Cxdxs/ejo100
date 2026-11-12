import { guardPage } from '@/lib/authz/server';
import { getDocumentBranches } from '@/lib/actions/documents';
import { EmptyState, PageHeader, SectionCard } from '@/components/ui';
import { DocumentsForm } from '@/components/data-exchange/DocumentsForm';

export const dynamic = 'force-dynamic';

/** A4c2 — customer documents in bulk: estimates sent and inspection reports, as zips of PDFs, for a workshop and a period. */
export default async function DocumentsPage() {
  await guardPage('dataexchange.export.sensitive', '/data-exchange/documents');
  const { branches, today } = await getDocumentBranches();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="download" back={{ href: '/data-exchange', label: 'Back to Data Exchange' }} title="Documents in bulk"
        description="The PDFs customers are sent — the estimate for a Job Card or a Vehicle Service, and the inspection report — for one workshop and a period, as zips. For the auditors, a dispute, or the files. Each is drawn at download by the same code as the copy emailed to the customer, from the record as it stands now: an estimate changed since it was sent shows as it is today." />
      <SectionCard icon="file" title="Which documents">
        {branches.length === 0 ? <EmptyState compact icon="inbox" title="No workshop you may export from." /> : <DocumentsForm branches={branches} today={today} monthStart={`${today.slice(0, 8)}01`} />}
      </SectionCard>
    </div>
  );
}
