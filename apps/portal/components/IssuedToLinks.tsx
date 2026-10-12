import { LoadingLink } from '@/components/LoadingLink';
import { CustomerLink } from '@/components/CustomerLink';

type Slip = {
  id: string;
  referenceNumber: string;
  jobCard: { id: string; jobNumber: string; customer: { id?: string; fullName: string } } | null;
  vehicleService: { id: string; serviceNumber: string; customer: { id?: string; fullName: string } } | null;
};

/**
 * Where a unit of stock went — each number opens its own record: the
 * Parts Request (PRS), and the Job Card or Vehicle Service it was issued
 * to. Used on every tracking type's "sold to" trail so they all behave
 * the same.
 */
export function IssuedToLinks({ slip, showCustomer = false, canSeeCustomers = false }: { slip: Slip; showCustomer?: boolean; canSeeCustomers?: boolean }) {
  const owner = slip.jobCard?.customer ?? slip.vehicleService?.customer ?? null;
  const customer = owner?.fullName ?? null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 text-xs">
      <LoadingLink href={`/workshop/parts-requests/${slip.id}`} className="text-[var(--ejo-primary)] hover:underline" title="Open the Parts Request">
        {slip.referenceNumber}
      </LoadingLink>
      <span className="text-[var(--ejo-text-muted)]">·</span>
      {slip.jobCard ? (
        <LoadingLink href={`/workshop/job-cards/${slip.jobCard.id}`} className="text-[var(--ejo-primary)] hover:underline" title="Open the Job Card">
          {slip.jobCard.jobNumber}
        </LoadingLink>
      ) : slip.vehicleService ? (
        <LoadingLink href={`/workshop/vehicle-service/${slip.vehicleService.id}`} className="text-[var(--ejo-primary)] hover:underline" title="Open the Vehicle Service">
          {slip.vehicleService.serviceNumber}
        </LoadingLink>
      ) : (
        <span className="text-[var(--ejo-text-muted)]">—</span>
      )}
      {showCustomer && customer ? <span className="block w-full text-[11px] text-[var(--ejo-text-muted)]"><CustomerLink id={owner?.id} name={customer} canView={canSeeCustomers} /></span> : null}
    </span>
  );
}
