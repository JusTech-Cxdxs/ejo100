import { notFound } from 'next/navigation';
import { listWarrantiesFor } from '@/lib/actions/warranty';
import { WarrantyList } from '@/components/WarrantyList';
import { getVehicle, getLastEditInfo, getVehicleAuditTrail, currentUserIsMasterAdmin } from '@/lib/actions/workshop';
import { getVehicleServiceHealth, getVehicleAnalytics } from '@/lib/actions/vehicle-service';
import { getVehicleReminderHistory } from '@/lib/actions/vehicle-service-reminders';
import { updateVehicleFormAction, deleteVehicleFormAction } from '@/lib/actions/workshop-form-handlers';
import { sendManualServiceReminderFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { VehicleMakeModelPicker } from '@/components/VehicleMakeModelPicker';
import { SegmentedCodeInput } from '@/components/SegmentedCodeInput';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { AuditTrail } from '@/components/AuditTrail';
import { VehicleMileageTrendChart } from '@/components/VehicleMileageTrendChart';
import { VehicleVisitHistoryChart } from '@/components/VehicleVisitHistoryChart';
import { VehicleFindingsBreakdownChart } from '@/components/VehicleFindingsBreakdownChart';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateTime, formatDateTimeCompact, formatDateOnly } from '@/lib/utils/format-date';

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'vehicle.created': 'Vehicle registered',
  'vehicle.updated': 'Vehicle details updated',
  'vehicle.deleted': 'Vehicle deleted',
  'vehicle.service_reminder_sent': 'Service reminder emailed to the customer',
};

const REMINDER_STAGE_LABEL: Record<number, string> = { 1: '1st — Friendly', 2: '2nd — Follow-up', 3: '3rd — Due', 4: 'Overdue' };

function formatAuditDetail(entry: { action: string; metadata: unknown }): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  if (entry.action === 'vehicle.service_reminder_sent' && typeof meta.stage === 'number') {
    return `${REMINDER_STAGE_LABEL[meta.stage] ?? `Stage ${meta.stage}`} reminder`;
  }
  if (typeof meta.plateNumber === 'string') return meta.plateNumber;
  return null;
}

/** Who sent a reminder, by name — matched to the audit entry written in
 * the same moment for the same vehicle and stage (never just "staff"). */
function reminderSender(
  sentAt: Date,
  stage: number,
  trail: { action: string; createdAt: Date; metadata: unknown; user: { fullName: string } | null }[],
): string | null {
  const match = trail.find(
    (e) =>
      e.action === 'vehicle.service_reminder_sent' &&
      (e.metadata as { stage?: number } | null)?.stage === stage &&
      Math.abs(new Date(e.createdAt).getTime() - new Date(sentAt).getTime()) < 2 * 60 * 1000,
  );
  return match?.user?.fullName ?? null;
}

/**
 * The vehicle's own real page — read-only by default, the same
 * standard view/edit toggle every other detail page in this project
 * uses, rather than opening straight into an editable form. Shows
 * real Service Health, this vehicle's own genuine mileage-interval
 * override (separate from the organisation's own default), and its
 * full real audit trail.
 */
export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; edit?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, edit, status } = await searchParams;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();
  const vehicleWarranties = await listWarrantiesFor({ vehicleId: id });
  const [lastEdit, auditTrail, isMasterAdmin, serviceHealth, analytics, reminderHistory] = await Promise.all([
    getLastEditInfo('CustomerVehicle', id, 'vehicle.updated'),
    getVehicleAuditTrail(id),
    currentUserIsMasterAdmin(),
    getVehicleServiceHealth(id),
    getVehicleAnalytics(id),
    getVehicleReminderHistory(id),
  ]);
  const isEditing = edit === 'true';

  return (
    <div className="p-8">
      <LoadingLink href="/workshop/vehicles" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Vehicles
      </LoadingLink>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-[var(--ejo-text)]">
            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
          </h1>
          <p className="text-sm text-[var(--ejo-text-muted)]">
            {vehicle.plateNumber || vehicle.chassisNumber} — owned by {vehicle.customer.fullName}
          </p>
        </div>
        {!isEditing ? (
          <LoadingLink
            href={`/workshop/vehicles/${id}/edit?edit=true`}
            className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Edit
          </LoadingLink>
        ) : null}
      </div>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'reminder_sent' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Service reminder sent to the customer." />
        </div>
      ) : null}
      {status === 'vehicle_updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Vehicle updated." />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {isEditing ? (
          <form action={updateVehicleFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <FormPendingOverlay />
            <input type="hidden" name="id" value={vehicle.id} />

            <VehicleMakeModelPicker
              defaultCategory={vehicle.vehicleType ?? undefined}
              defaultMake={vehicle.make ?? undefined}
              defaultModel={vehicle.model ?? undefined}
              defaultEngineType={vehicle.engineType ?? undefined}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                  Year <span className="text-[var(--ejo-error)]">*</span>
                </label>
                <input
                  name="year"
                  type="number"
                  required
                  defaultValue={vehicle.year ?? undefined}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Current Mileage (km)</label>
                <input
                  name="mileage"
                  type="number"
                  defaultValue={vehicle.mileage ?? undefined}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                Plate number <span className="text-[var(--ejo-error)]">*</span>{' '}
                <span className="text-[var(--ejo-text-muted)] font-normal">(AAA 000 AA)</span>
              </label>
              <SegmentedCodeInput name="plateNumber" length={8} groups={[3, 3, 2]} defaultValue={vehicle.plateNumber ?? ''} placeholder="LAGXXXAA" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                Chassis / VIN <span className="text-[var(--ejo-error)]">*</span>{' '}
                <span className="text-[var(--ejo-text-muted)] font-normal">(17 characters)</span>
              </label>
              <SegmentedCodeInput name="chassisNumber" length={17} groups={[9, 8]} defaultValue={vehicle.chassisNumber ?? ''} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Engine number</label>
              <input
                name="engineNumber"
                defaultValue={vehicle.engineNumber ?? ''}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>

            <div className="border-t border-[var(--ejo-border)] pt-4">
              <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">This vehicle&apos;s own service interval</p>
              <p className="mb-3 text-[11px] text-[var(--ejo-text-muted)]">
                Leave both blank to use the workshop&apos;s own default interval. Only set these if this
                particular vehicle&apos;s manufacturer manual actually calls for something different.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Every (km)</label>
                  <input
                    name="serviceIntervalKm"
                    type="number"
                    min="0"
                    defaultValue={vehicle.serviceIntervalKm ?? undefined}
                    placeholder="e.g. 10000"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Every (days)</label>
                  <input
                    name="serviceIntervalDays"
                    type="number"
                    min="0"
                    defaultValue={vehicle.serviceIntervalDays ?? undefined}
                    placeholder="e.g. 180"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <SubmitButton
                label="Save Changes"
                pendingLabel="Saving…"
                className="flex-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              />
              <LoadingLink
                href={`/workshop/vehicles/${id}/edit`}
                className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
              >
                Cancel
              </LoadingLink>
            </div>
          </form>
        ) : (
          <div className="max-w-xl space-y-6">
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle Details</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Type</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.vehicleType === 'COMMERCIAL' ? 'Commercial' : vehicle.vehicleType === 'PASSENGER' ? 'Passenger' : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Year</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.year ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Make</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.make ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Model</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.model ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Plate Number</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.plateNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Chassis / VIN</dt>
                  <dd className="font-mono text-xs text-[var(--ejo-text)]">{vehicle.chassisNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Engine Number</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.engineNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Engine Type</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.engineType ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Current Mileage</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.mileage != null ? `${vehicle.mileage.toLocaleString('en-NG')} km` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Owner</dt>
                  <dd className="text-[var(--ejo-text)]">{vehicle.customer.fullName}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <dt className="text-xs text-[var(--ejo-text-muted)]">Service Interval</dt>
                <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">
                  {vehicle.serviceIntervalKm || vehicle.serviceIntervalDays ? (
                    <>
                      {vehicle.serviceIntervalKm ? `${vehicle.serviceIntervalKm.toLocaleString('en-NG')} km` : null}
                      {vehicle.serviceIntervalKm && vehicle.serviceIntervalDays ? ' or ' : null}
                      {vehicle.serviceIntervalDays ? pluralize(vehicle.serviceIntervalDays, 'day') : null}
                      <span className="ml-1 text-xs text-[var(--ejo-text-muted)]">(this vehicle&apos;s own)</span>
                    </>
                  ) : (
                    <span className="text-[var(--ejo-text-muted)]">Using the workshop&apos;s default interval</span>
                  )}
                </dd>
              </div>
            </div>

            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit Trail</h2>
              {auditTrail.length === 0 ? (
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No recorded activity yet.</p>
              ) : (
                <AuditTrail
                  entries={auditTrail.map((entry: (typeof auditTrail)[number]) => ({
                    id: entry.id,
                    actionLabel: AUDIT_ACTION_LABEL[entry.action] ?? entry.action,
                    userName: entry.user?.fullName ?? null,
                    detail: formatAuditDetail(entry),
                    dateLabel: formatDateTime(entry.createdAt),
                  }))}
                />
              )}
            </div>
          </div>
        )}

        <div className="h-fit space-y-4 lg:sticky lg:top-6">
          <div className="space-y-2">
            <WarrantyList warranties={vehicleWarranties} title="Warranties" emptyText="No warranties recorded for this vehicle." />
            <LoadingLink href={`/warranty/register?vehicleId=${vehicle.id}`} className="inline-block text-xs text-[var(--ejo-primary)] hover:underline">
              Register a vehicle warranty →
            </LoadingLink>
          </div>
          {serviceHealth ? (
            <div
              className={`rounded-[var(--ejo-radius-lg)] border p-5 ${
                serviceHealth.status === 'OVERDUE'
                  ? 'border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5'
                  : serviceHealth.status === 'DUE_SOON'
                    ? 'border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5'
                    : 'border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5'
              }`}
            >
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Service Health</h2>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--ejo-text)]">
                <span>{serviceHealth.status === 'OVERDUE' ? '🔴' : serviceHealth.status === 'DUE_SOON' ? '🟡' : '🟢'}</span>
                {serviceHealth.status === 'OVERDUE' ? 'Overdue' : serviceHealth.status === 'DUE_SOON' ? 'Due Soon' : 'Up to Date'}
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                {serviceHealth.primaryServiceMileage != null ? (
                  <div>
                    <dt className="text-[var(--ejo-text-muted)]">Last Service</dt>
                    <dd className="text-[var(--ejo-text)]">
                      {serviceHealth.primaryServiceMileage.toLocaleString('en-NG')} km
                      {serviceHealth.primaryServiceDate ? ` — ${formatDateOnly(serviceHealth.primaryServiceDate)}` : ''}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Next Service Due</dt>
                  <dd className="text-[var(--ejo-text)]">
                    {serviceHealth.nextServiceDueOdometer ? `${serviceHealth.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null}
                    {serviceHealth.nextServiceDueOdometer && serviceHealth.nextServiceDueDate ? ' or ' : null}
                    {serviceHealth.nextServiceDueDate ? formatDateOnly(serviceHealth.nextServiceDueDate) : null}
                  </dd>
                </div>
              </dl>
              {serviceHealth.kmRemaining !== null || serviceHealth.daysRemaining !== null ? (
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                  {[
                    serviceHealth.kmRemaining !== null
                      ? serviceHealth.kmRemaining <= 0
                        ? `${Math.abs(serviceHealth.kmRemaining).toLocaleString('en-NG')} km over`
                        : `${serviceHealth.kmRemaining.toLocaleString('en-NG')} km left`
                      : null,
                    serviceHealth.daysRemaining !== null
                      ? serviceHealth.daysRemaining <= 0
                        ? `${Math.abs(serviceHealth.daysRemaining)} day${Math.abs(serviceHealth.daysRemaining) === 1 ? '' : 's'} over`
                        : `${serviceHealth.daysRemaining} day${serviceHealth.daysRemaining === 1 ? '' : 's'} left`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  — whichever comes first.
                </p>
              ) : null}
              {serviceHealth.inWorkshop ? (
                <p className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                  In the workshop now on{' '}
                  <LoadingLink
                    href={serviceHealth.inWorkshop.kind === 'JOB_CARD' ? `/workshop/job-cards/${serviceHealth.inWorkshop.id}` : `/workshop/vehicle-service/${serviceHealth.inWorkshop.id}`}
                    className="font-medium text-[var(--ejo-primary)] hover:underline"
                  >
                    {serviceHealth.inWorkshop.number}
                  </LoadingLink>{' '}
                  — service reminders are held while it&apos;s here.
                </p>
              ) : null}
              {serviceHealth.attendedAt ? (
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Attended to on {formatDateOnly(serviceHealth.attendedAt)} — no further reminders for this prediction.</p>
              ) : null}
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                Reminders this cycle: {serviceHealth.remindersSentThisCycle}
                {serviceHealth.lastReminderAt ? ` — last ${formatDateTime(serviceHealth.lastReminderAt)}` : ''}
                {serviceHealth.reminderDue
                  ? ` · Due now: ${serviceHealth.reminderDue.stage === 4 ? 'Overdue reminder' : `reminder ${serviceHealth.reminderDue.stage}`}`
                  : serviceHealth.nextReminderFrom
                    ? ` · Next from ${formatDateOnly(serviceHealth.nextReminderFrom)}`
                    : ''}
              </p>
              {serviceHealth.reminderDue ? (
                <form action={sendManualServiceReminderFormAction} className="mt-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="vehicleId" value={vehicle.id} />
                  <input type="hidden" name="returnTo" value={`/workshop/vehicles/${vehicle.id}/edit`} />
                  <SubmitButton
                    label="Send service reminder"
                    pendingLabel="Sending…"
                    className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                  />
                </form>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <LoadingLink href={`/workshop/vehicle-service/${serviceHealth.serviceId}`} className="text-[var(--ejo-primary)] hover:underline">
                  View {serviceHealth.serviceNumber}
                </LoadingLink>
                {serviceHealth.viaJobCard ? (
                  <LoadingLink href={`/workshop/job-cards/${serviceHealth.viaJobCard.id}`} className="text-[var(--ejo-primary)] hover:underline">
                    Serviced on {serviceHealth.viaJobCard.jobNumber}
                  </LoadingLink>
                ) : null}
                {!serviceHealth.inWorkshop ? (
                  <LoadingLink href={`/workshop/vehicle-service/book?vehicleId=${vehicle.id}`} className="text-[var(--ejo-primary)] hover:underline">
                    Book in for service
                  </LoadingLink>
                ) : null}
                <LoadingLink href="/workshop/service-tracker" className="text-[var(--ejo-primary)] hover:underline">
                  Service Tracker
                </LoadingLink>
              </div>
            </div>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">History</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Registered</dt>
              <dd className="text-[var(--ejo-text)]">
                {formatDateTimeCompact(vehicle.createdAt)}
                {vehicle.createdBy ? <><br />by {vehicle.createdBy.fullName}</> : null}
              </dd>
            </div>
            {lastEdit ? (
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Last Edited</dt>
                <dd className="text-[var(--ejo-text)]">
                  {formatDateTimeCompact(lastEdit.at)}
                  <br />by {lastEdit.userName}
                </dd>
              </div>
            ) : (
              <p className="text-xs text-[var(--ejo-text-muted)]">Not edited since registration.</p>
            )}
          </dl>
          </div>

          {isMasterAdmin ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Danger zone</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Permanently deletes this vehicle and every Job Card for it. This cannot be undone.
              </p>
              <form action={deleteVehicleFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="vehicleId" value={vehicle.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Delete ${vehicle.plateNumber || vehicle.chassisNumber || 'this vehicle'}? This permanently removes it and every Job Card for it. This cannot be undone.`}
                  label="Delete this vehicle"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicle Analytics</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">MILEAGE OVER TIME</h3>
            {analytics.mileageTimeline.length > 0 ? (
              <VehicleMileageTrendChart
                data={analytics.mileageTimeline.map((p) => ({
                  label: p.label,
                  mileage: p.mileage,
                  dateLabel: `${formatDateOnly(p.date)} — ${p.source === 'JOB_CARD' ? 'Job Card' : 'Vehicle Service'}`,
                  source: p.source,
                }))}
                predictedMileage={serviceHealth?.nextServiceDueOdometer ?? undefined}
                predictedLabel="Next Due"
              />
            ) : (
              <p className="py-8 text-center text-xs text-[var(--ejo-text-muted)]">No recorded odometer readings yet.</p>
            )}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">VISIT HISTORY</h3>
            {analytics.visitHistory.length > 0 ? (
              <VehicleVisitHistoryChart data={analytics.visitHistory} />
            ) : (
              <p className="py-8 text-center text-xs text-[var(--ejo-text-muted)]">No visits recorded yet.</p>
            )}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">INSPECTION FINDINGS</h3>
            {analytics.latestInspection ? (
              <>
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                  Current condition — latest inspection ({analytics.latestInspection.serviceNumber}
                  {analytics.latestInspection.completedAt ? `, ${formatDateOnly(analytics.latestInspection.completedAt)}` : ''}). It stays here as the vehicle&apos;s record after the service is completed.
                </p>
                <VehicleFindingsBreakdownChart data={analytics.latestInspection.breakdown} />
                <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                  All inspections to date: {analytics.findingsBreakdown.critical} critical · {analytics.findingsBreakdown.serviceRequired} service required ·{' '}
                  {analytics.findingsBreakdown.attention} attention · {analytics.findingsBreakdown.good} good
                </p>
              </>
            ) : (
              <VehicleFindingsBreakdownChart data={analytics.findingsBreakdown} />
            )}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">SUMMARY</h3>
            {(() => {
              const naira = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
              return (
                <>
                  <dl className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs text-[var(--ejo-text-muted)]">Total Visits</dt>
                      <dd className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{analytics.totalVisits}</dd>
                      <dd className="text-xs text-[var(--ejo-text-muted)]">
                        {analytics.jobCardVisits} Job Card · {analytics.serviceVisits} Vehicle Service
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--ejo-text-muted)]">Total Approved Value</dt>
                      <dd className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{naira(analytics.totalSpend)}</dd>
                    </div>
                  </dl>
                  <table className="mt-4 w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                        <th className="pb-1.5" />
                        <th className="pb-1.5 text-right">Approved</th>
                        <th className="pb-1.5 text-right">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[var(--ejo-border)]">
                        <td className="py-1.5 text-[var(--ejo-text)]">Job Cards (repairs)</td>
                        <td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(analytics.approvedJobCard)}</td>
                        <td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(analytics.paidJobCard)}</td>
                      </tr>
                      <tr className="border-b border-[var(--ejo-border)]">
                        <td className="py-1.5 text-[var(--ejo-text)]">Vehicle Services (routine)</td>
                        <td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(analytics.approvedService)}</td>
                        <td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(analytics.paidService)}</td>
                      </tr>
                      <tr className="font-semibold">
                        <td className="py-1.5 text-[var(--ejo-text)]">Total</td>
                        <td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(analytics.totalSpend)}</td>
                        <td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(analytics.totalPaid)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className={`mt-3 text-xs font-medium ${analytics.outstanding > 0 ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-success)]'}`}>
                    {analytics.outstanding > 0 ? `Outstanding: ${naira(analytics.outstanding)}` : 'Nothing outstanding.'}
                  </p>
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                    Approved = estimates with the Manager&apos;s final approval. Paid = payments actually recorded. Real figures, never a projection.
                  </p>
                </>
              );
            })()}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 lg:col-span-2">
            <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">REMINDER HISTORY</h3>
            {reminderHistory.length > 0 ? (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="pb-2">Sent</th>
                    <th className="pb-2">Reminder</th>
                    <th className="pb-2">Sent by</th>
                    <th className="pb-2">Estimated Due</th>
                    <th className="pb-2">Odometer at Send</th>
                  </tr>
                </thead>
                <tbody>
                  {reminderHistory.map((r: (typeof reminderHistory)[number]) => (
                    <tr key={r.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="py-2 text-[var(--ejo-text)]">{formatDateTime(r.sentAt)}</td>
                      <td className="py-2 text-[var(--ejo-text)]">
                        {REMINDER_STAGE_LABEL[r.reminderNumber] ?? `Stage ${r.reminderNumber}`}
                      </td>
                      <td className="py-2 text-[var(--ejo-text-muted)]">
                        {reminderSender(r.sentAt, r.reminderNumber, auditTrail) ?? (r.trigger === 'MANUAL' ? 'Not recorded (sent before sender tracking)' : 'System (automatic, before reminders became manual)')}
                      </td>
                      <td className="py-2 text-[var(--ejo-text-muted)]">
                        {r.estimatedDueOdometer ? `${r.estimatedDueOdometer.toLocaleString('en-NG')} km` : null}
                        {r.estimatedDueOdometer && r.estimatedDueDate ? ' / ' : null}
                        {r.estimatedDueDate ? formatDateOnly(r.estimatedDueDate) : null}
                      </td>
                      <td className="py-2 text-[var(--ejo-text-muted)]">{r.recordedOdometerAtSend ? `${r.recordedOdometerAtSend.toLocaleString('en-NG')} km` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">No reminders have been sent for this vehicle yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
