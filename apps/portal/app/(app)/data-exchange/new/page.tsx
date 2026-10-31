import { redirect } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { ENTITIES, isEntityKey } from '@/lib/data-exchange/fields';
import { ImportUploader } from '@/components/data-exchange/ImportUploader';
import { PageHeader, SectionCard } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Step 1: choose the file. It is read in the browser and staged; nothing live changes. */
export default async function NewImportPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await guardAnyPage(['dataexchange.import.run'], '/data-exchange/new');
  const { entity } = await searchParams;
  if (!isEntityKey(entity)) redirect('/data-exchange');
  const def = ENTITIES[entity];
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="layers" back={{ href: '/data-exchange', label: 'Back to Data Exchange' }} title={`Import ${def.plural}`} description={def.description} />
      <SectionCard icon="file" title="Choose the file" description={`Nothing changes in the system until the file has been checked and approved.${def.after ? ` Load the ${ENTITIES[def.after].plural} file first: each ${def.noun} is linked to its ${ENTITIES[def.after].noun}.` : ''}`}>
        <ImportUploader entity={entity} entityLabel={def.label} />
        <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">No file yet? <a className="font-medium text-[var(--ejo-primary)] hover:underline" href={`/data-exchange/templates/${entity}`}>Download the Excel template</a> — it explains every column. SAP exports can be used as they are.</p>
      </SectionCard>
    </div>
  );
}
