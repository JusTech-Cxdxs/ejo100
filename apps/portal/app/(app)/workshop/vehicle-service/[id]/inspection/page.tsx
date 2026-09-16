import { notFound } from 'next/navigation';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import {
  startVehicleInspectionFormAction,
  saveInspectionSectionFormAction,
  completeVehicleInspectionFormAction,
} from '@/lib/actions/vehicle-inspection-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateTime } from '@/lib/utils/format-date';

const SEVERITY_LABEL: Record<string, string> = {
  GOOD: 'Good',
  ATTENTION: 'Attention',
  SERVICE_REQUIRED: 'Service Required',
  CRITICAL: 'Critical',
};
const SEVERITY_ICON: Record<string, string> = {
  GOOD: '🟢',
  ATTENTION: '🟡',
  SERVICE_REQUIRED: '🟠',
  CRITICAL: '🔴',
};

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

  const isCompleted = inspection?.status === 'COMPLETED';
  const readOnly = isCompleted;

  const bySection = new Map<string, NonNullable<typeof inspection>['items']>();
  if (inspection) {
    for (const item of inspection.items) {
      const list = bySection.get(item.section) ?? [];
      list.push(item);
      bySection.set(item.section, list);
    }
  }

  const summary: Record<'GOOD' | 'ATTENTION' | 'SERVICE_REQUIRED' | 'CRITICAL' | 'NOT_REVIEWED', number> = {
    GOOD: 0,
    ATTENTION: 0,
    SERVICE_REQUIRED: 0,
    CRITICAL: 0,
    NOT_REVIEWED: 0,
  };
  if (inspection) {
    for (const item of inspection.items) {
      const severity = item.severity as 'GOOD' | 'ATTENTION' | 'SERVICE_REQUIRED' | 'CRITICAL' | null;
      if (severity) summary[severity]++;
      else summary.NOT_REVIEWED++;
    }
  }

  return (
    <div className="p-8">
      <LoadingLink
        href={`/workshop/vehicle-service/${vehicleServiceId}`}
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to {service.serviceNumber}
      </LoadingLink>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicle Inspection</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {service.serviceNumber} — {[service.vehicle.year, service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
          </p>
        </div>
        {inspection ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isCompleted ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
            }`}
          >
            {isCompleted ? 'Completed' : 'In Progress'}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'section_saved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Section saved." />
        </div>
      ) : null}
      {status === 'completed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection completed." />
        </div>
      ) : null}

      {!inspection ? (
        <div className="max-w-md rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Start the inspection</h2>
          <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">
            Generates the checklist for this vehicle&apos;s own registered type — Passenger and Commercial
            vehicles get different sections.
          </p>
          <form action={startVehicleInspectionFormAction} className="mt-4">
            <FormPendingOverlay />
            <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
            <SubmitButton
              label="Start Inspection"
              pendingLabel="Starting…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {(['GOOD', 'ATTENTION', 'SERVICE_REQUIRED', 'CRITICAL'] as const).map((s) => (
              <span key={s} className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1 text-xs text-[var(--ejo-text)]">
                {SEVERITY_ICON[s]} {SEVERITY_LABEL[s]} — {summary[s]}
              </span>
            ))}
            {summary.NOT_REVIEWED > 0 ? (
              <span className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1 text-xs text-[var(--ejo-text-muted)]">
                ⚪ Not Reviewed — {summary.NOT_REVIEWED}
              </span>
            ) : null}
          </div>

          <div className="space-y-4">
            {[...bySection.entries()].map(([section, items]) => (
              <div key={section} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{section}</h2>
                {readOnly ? (
                  <ul className="mt-3 space-y-2">
                    {items.map((item: (typeof items)[number]) => (
                      <li key={item.id} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--ejo-text)]">{item.name}</span>
                          {item.severity ? (
                            <span className="text-xs">
                              {SEVERITY_ICON[item.severity]} {SEVERITY_LABEL[item.severity]}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--ejo-text-muted)]">Not reviewed</span>
                          )}
                        </div>
                        {item.condition || item.action || item.notes ? (
                          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                            {[item.condition, item.action, item.notes].filter(Boolean).join(' — ')}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <form action={saveInspectionSectionFormAction} className="mt-3 space-y-3">
                    <FormPendingOverlay />
                    <input type="hidden" name="inspectionId" value={inspection.id} />
                    <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
                    <input type="hidden" name="itemIds" value={items.map((i: (typeof items)[number]) => i.id).join(',')} />
                    {items.map((item: (typeof items)[number]) => (
                      <div key={item.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
                        <p className="mb-2 text-sm font-medium text-[var(--ejo-text)]">{item.name}</p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <input
                            name={`condition-${item.id}`}
                            defaultValue={item.condition ?? ''}
                            placeholder="Condition"
                            className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2.5 py-1.5 text-xs text-[var(--ejo-text)]"
                          />
                          <select
                            name={`severity-${item.id}`}
                            defaultValue={item.severity ?? ''}
                            className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2.5 py-1.5 text-xs text-[var(--ejo-text)]"
                          >
                            <option value="">Not reviewed</option>
                            <option value="GOOD">🟢 Good</option>
                            <option value="ATTENTION">🟡 Attention</option>
                            <option value="SERVICE_REQUIRED">🟠 Service Required</option>
                            <option value="CRITICAL">🔴 Critical</option>
                          </select>
                          <input
                            name={`action-${item.id}`}
                            defaultValue={item.action ?? ''}
                            placeholder="Action"
                            className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2.5 py-1.5 text-xs text-[var(--ejo-text)]"
                          />
                          <input
                            name={`notes-${item.id}`}
                            defaultValue={item.notes ?? ''}
                            placeholder="Notes"
                            className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2.5 py-1.5 text-xs text-[var(--ejo-text)]"
                          />
                        </div>
                      </div>
                    ))}
                    <SubmitButton
                      label={`Save ${section}`}
                      pendingLabel="Saving…"
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                    />
                  </form>
                )}
              </div>
            ))}
          </div>

          {isCompleted ? (
            <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5 text-sm text-[var(--ejo-text)]">
              Completed by {inspection.inspectedBy.fullName}
              {inspection.completedAt ? ` on ${formatDateTime(inspection.completedAt)}` : ''}.
              {inspection.notes ? <p className="mt-2 text-[var(--ejo-text-muted)]">{inspection.notes}</p> : null}
            </div>
          ) : (
            <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Complete this inspection</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Locks the checklist. Save every section that matters to this visit first — items left
                unreviewed just stay unreviewed, they don&apos;t block completion.
              </p>
              <form action={completeVehicleInspectionFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="inspectionId" value={inspection.id} />
                <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional overall notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Complete Inspection"
                  pendingLabel="Completing…"
                  className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
