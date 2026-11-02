import { getPrincipal, guardPage } from '@/lib/authz/server';
import { listKitBranches } from '@/lib/actions/plant-kits';
import { PageHeader, SectionCard } from '@/components/ui';
import { ShipmentForm } from '@/components/plant/ShipmentForm';

export const dynamic = 'force-dynamic';

/** Record a shipment as it arrives, with its kits from the packing list. */
export default async function NewShipmentPage() {
  await guardPage('plant.kit.receive', '/plant/shipments/new');
  const [branches, me] = await Promise.all([listKitBranches(), getPrincipal()]);
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="truck" back={{ href: '/plant/shipments', label: 'Back to shipments' }} title="Record a shipment" description="The bill of lading, its containers and the SAP numbers it is received against — and its kits, one per vehicle, pasted from the packing list. Nothing is saved until every line is right." />
      <SectionCard icon="truck" title="Shipment and kits">
        <ShipmentForm branches={branches} defaultBranchId={me.branchId} />
      </SectionCard>
    </div>
  );
}
