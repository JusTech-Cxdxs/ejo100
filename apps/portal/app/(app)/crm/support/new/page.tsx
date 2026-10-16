import { prisma } from '@ejo/database';
import { guardPage, myOrganisationId } from '@/lib/authz/server';
import { PageHeader } from '@/components/ui';
import { NewSupportForm } from '@/components/support/NewSupportForm';

export const metadata = { title: 'New support request' };
export const dynamic = 'force-dynamic';

/** A colleague logs a call, a walk-in or a message as a support request. */
export default async function NewSupportRequestPage() {
  await guardPage('support.tickets.manage', '/crm/support/new');
  const organisationId = await myOrganisationId();
  const queues = organisationId ? await prisma.supportQueue.findMany({ where: { organisationId, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true } }) : [];
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="plus" title="New support request" back={{ href: '/crm/support', label: 'Support centre' }}
        description="For a phone call, a walk-in or a WhatsApp message: it gets a number, a team, a target and an owner like an email. The customer is not emailed until someone replies." />
      <NewSupportForm queues={queues} />
    </div>
  );
}
