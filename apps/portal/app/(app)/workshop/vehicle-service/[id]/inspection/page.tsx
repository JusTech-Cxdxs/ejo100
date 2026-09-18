import { notFound } from 'next/navigation';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import { InspectionWorkspace } from '@/components/InspectionWorkspace';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { getApplicableTemplate } from '@/lib/vehicle-inspection-template';

/**
 * Server-side data fetch only — everything interactive (the live
 * severity counter across every section, before anything is even
 * saved) lives in InspectionWorkspace, a real client component.
 */
export default async function VehicleInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id: vehicleServiceId } = await params;
  const { error, status } = await searchParams;
  const [service, inspection] = await Promise.all([
    getVehicleService(vehicleServiceId),
    getVehicleInspection(vehicleServiceId),
  ]);
  if (!service) notFound();

  const vehicleType = service.vehicle.vehicleType;
  const template = vehicleType ? getApplicableTemplate(vehicleType) : [];

  return (
    <div className="p-4 sm:p-8">
      <LoadingLink
        href={`/workshop/vehicle-service/${vehicleServiceId}`}
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to {service.serviceNumber}
      </LoadingLink>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'saved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Changes saved." />
        </div>
      ) : null}
      {status === 'completed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection completed." />
        </div>
      ) : null}
      {status === 'skipped' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection skipped and recorded." />
        </div>
      ) : null}
      {status === 'inspection_cancelled' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection cancelled — choose to start or skip again below." />
        </div>
      ) : null}

      {!vehicleType ? (
        <div className="max-w-md rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6 text-sm text-[var(--ejo-text)]">
          This vehicle has no Passenger/Commercial type on file yet — set it on the Vehicles page before
          starting an inspection.
        </div>
      ) : (
        <InspectionWorkspace
          vehicleServiceId={vehicleServiceId}
          vehicleId={service.vehicle.id}
          serviceNumber={service.serviceNumber}
          vehicleDescription={[service.vehicle.year, service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
          vehicleType={vehicleType}
          template={template}
          inspection={inspection}
        />
      )}
    </div>
  );
}
