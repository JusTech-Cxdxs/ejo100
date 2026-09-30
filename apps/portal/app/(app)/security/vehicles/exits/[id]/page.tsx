import { notFound } from 'next/navigation';
import { getVehicleGateExit, getSecurityHistory } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PrintMenu } from '@/components/print/PrintMenu';
import { formatDateTime } from '@/lib/utils/format-date';

export default async function VehicleExitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const { id } = await params;
  const { status } = await searchParams;
  const [x, history] = await Promise.all([getVehicleGateExit(id), getSecurityHistory('VehicleGateExit', id)]);
  if (!x) notFound();
  const rec = x.jobCard ? { number: x.jobCard.jobNumber, href: `/workshop/job-cards/${x.jobCardId}`, released: x.jobCard.checkedOutAt, customer: x.jobCard.customer.fullName } : x.vehicleService ? { number: x.vehicleService.serviceNumber, href: `/workshop/vehicle-service/${x.vehicleServiceId}`, released: x.vehicleService.collectedAt, customer: x.vehicleService.customer.fullName } : null;
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => <div className="flex justify-between gap-3 py-1.5 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right font-medium text-[var(--ejo-text)]">{val || '—'}</dd></div>;
  return (
    <div className="p-8">
      <LoadingLink href="/security/vehicles/exits" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Exit history</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{x.exitNumber}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Vehicle left the gate {formatDateTime(x.exitedAt)}</p>
        </div>
        <PrintMenu orgHref={`/print/vehicle-exit/${x.id}`} clientHref={`/print/vehicle-exit/${x.id}?variant=client`} clientLabel="Customer Copy" />
      </div>
      <SecurityNav active="/security/vehicles" />
      {status === 'vehicle_out' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Exit recorded — print the gate pass (Customer copy for the collector, Organisation copy for the gate file)." /></div> : null}
      <dl className="mb-6 max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <Row k="Vehicle" val={[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} />
        <Row k="Plate" val={x.vehicle.plateNumber} />
        <Row k="VIN" val={x.vehicle.chassisNumber} />
        <Row k="Record" val={rec?.number} />
        <Row k="Customer" val={rec?.customer} />
        <Row k="Released by the Workshop" val={rec?.released ? formatDateTime(rec.released) : null} />
        <Row k="Collected by" val={x.driverName} />
        <Row k="Confirmed at the gate by" val={x.exitedBy.fullName} />
        <Row k="Notes" val={x.notes} />
        <p className="mt-2 flex flex-wrap gap-4 text-xs">
          {rec ? <LoadingLink href={rec.href} className="text-[var(--ejo-primary)] hover:underline">Open {rec.number} →</LoadingLink> : null}
          <LoadingLink href={`/workshop/vehicles/${x.vehicleId}/edit`} className="text-[var(--ejo-primary)] hover:underline">Open the vehicle →</LoadingLink>
        </p>
      </dl>
      <SecurityHistory history={history} />
    </div>
  );
}
