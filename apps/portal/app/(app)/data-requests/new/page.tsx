import { prisma } from '@ejo/database';
import { getPrincipal, guardPage, myOrganisationId } from '@/lib/authz/server';
import { lagosToday } from '@/lib/data-exchange/dates';
import { PageHeader, SectionCard } from '@/components/ui';
import { NewRequestForm } from '@/components/privacy/DataRequestActions';

export const dynamic = 'force-dynamic';

/** Record a customer's data request as received (from the list, or from the customer's page). */
export default async function NewDataRequestPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await guardPage('privacy.requests.manage', '/data-requests/new');
  const { customer: customerId } = await searchParams;
  let preset: { id: string; name: string } | null = null;
  if (customerId) {
    const p = await getPrincipal();
    const organisationId = p.organisationId ?? (await myOrganisationId());
    const c = organisationId ? await prisma.customer.findFirst({ where: { id: String(customerId).slice(0, 40), organisationId }, select: { id: true, fullName: true } }) : null;
    if (c) preset = { id: c.id, name: c.fullName };
  }
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="lock" back={{ href: '/data-requests', label: 'Back to data requests' }} title="Record a data request"
        description="Record it the day it arrives, whoever it came to. A colleague then confirms who is asking before anything is given or changed." />
      <SectionCard icon="file" title="The request">
        <NewRequestForm today={lagosToday()} customer={preset} />
      </SectionCard>
    </div>
  );
}
