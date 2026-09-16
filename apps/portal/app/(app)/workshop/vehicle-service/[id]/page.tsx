import { notFound } from 'next/navigation';
import {
  getVehicleService,
  listServiceTypes,
  getVehicleServiceAuditTrail,
} from '@/lib/actions/vehicle-service';
import { listTechnicianCandidates, currentUserIsMasterAdmin, currentUserId } from '@/lib/actions/workshop';
import {
  updateVehicleServiceStatusFormAction,
  escalateVehicleServiceFormAction,
  addServiceItemsFormAction,
  approveVehicleServiceFormAction,
  rejectVehicleServiceFormAction,
  assignTechnicianToVehicleServiceFormAction,
  deleteVehicleServiceFormAction,
} from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SupervisorPicker } from '@/components/SupervisorPicker';
import { AuditTrail } from '@/components/AuditTrail';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
};
const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  CHECKED_IN: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  IN_SERVICE: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  COLLECTED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  SCHEDULED: { status: 'CHECKED_IN', label: 'Check In Vehicle' },
  CHECKED_IN: { status: 'IN_SERVICE', label: 'Start Service' },
  IN_SERVICE: { status: 'COMPLETED', label: 'Complete Service' },
  COMPLETED: { status: 'COLLECTED', label: 'Mark Collected' },
  COLLECTED: null,
  CANCELLED: null,
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'vehicle_service.created': 'Vehicle Service opened',
  'vehicle_service.approved': 'Vehicle Service approved',
  'vehicle_service.rejected': 'Vehicle Service rejected',
  'vehicle_service.status_updated': 'Status updated',
  'vehicle_service.technician_assigned': 'Technician assigned',
  'vehicle_service.items_added': 'Service items added',
  'vehicle_service.escalated_to_job_card': 'Escalated to Job Card',
};

function formatAuditDetail(entry: { action: string; metadata: unknown }): string | null {
  const meta = entry.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  switch (entry.action) {
    case 'vehicle_service.rejected':
      return typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null;
    case 'vehicle_service.status_updated':
      return typeof meta.from === 'string' && typeof meta.to === 'string' ? `${meta.from} → ${meta.to}` : null;
    case 'vehicle_service.technician_assigned':
      return typeof meta.technicianName === 'string' ? meta.technicianName : null;
    case 'vehicle_service.items_added':
      return typeof meta.count === 'number' ? `${meta.count} item${meta.count === 1 ? '' : 's'}` : null;
    default:
      return null;
  }
}

export default async function VehicleServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [service, isMasterAdmin, viewerId] = await Promise.all([
    getVehicleService(id),
    currentUserIsMasterAdmin(),
    currentUserId(),
  ]);
  if (!service) notFound();

  const isApprover = isMasterAdmin || service.supervisor?.id === viewerId;
  const nextAction = NEXT_ACTION[service.status];
  const canCancel = service.status === 'SCHEDULED' || service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE';
  const canEscalate = !service.escalatedToJobCard && service.status !== 'COLLECTED' && service.status !== 'CANCELLED';
  const canAddItems = service.status !== 'COLLECTED' && service.status !== 'CANCELLED';
  const [serviceTypes, technicians, auditTrail] = await Promise.all([
    canAddItems ? listServiceTypes(service.branch.businessUnit.organisationId) : Promise.resolve([]),
    listTechnicianCandidates(),
    getVehicleServiceAuditTrail(id),
  ]);
  const existingItemIds = new Set(service.items.map((item: (typeof service.items)[number]) => item.serviceTypeId));
  const availableServiceTypes = serviceTypes.filter((t: (typeof serviceTypes)[number]) => !existingItemIds.has(t.id));

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop/vehicle-service"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Vehicle Service
      </LoadingLink>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{service.serviceNumber}</h1>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[service.status]}`}>
            {STATUS_LABEL[service.status]}
          </span>
        </div>
      </div>

      {service.escalatedToJobCard ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-4 text-sm">
          A repair beyond routine maintenance was found — this visit was sent to{' '}
          <LoadingLink href={`/workshop/job-cards/${service.escalatedToJobCard.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
            Job Card {service.escalatedToJobCard.jobNumber}
          </LoadingLink>
          , which now handles the repair.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer &amp; Vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.customer.fullName}
                  {service.customer.customerType === 'ORGANIZATION' ? (
                    <span className="ml-2 rounded-full bg-[var(--ejo-info)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-info)]">
                      Organization
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                      Individual
                    </span>
                  )}
                </dd>
              </div>
              {service.customer.address ? (
                <div>
                  <dt className="text-[var(--ejo-text-muted)]">Address</dt>
                  <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.customer.address}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Contact</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.customer.phone || service.customer.email}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Vehicle</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {[service.vehicle.year, service.vehicle.make, service.vehicle.model, service.vehicle.engineType].filter(Boolean).join(' ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Plate</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.vehicle.plateNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Chassis / VIN</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium text-[var(--ejo-text)]">{service.vehicle.chassisNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Mileage at check-in</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.odometerAtService != null ? `${service.odometerAtService.toLocaleString('en-NG')} km` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Workshop department</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.department?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Supervisor</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {service.supervisor?.fullName ?? 'Unassigned'}
                  {service.supervisor ? (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        service.approvalStatus === 'APPROVED'
                          ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'
                          : service.approvalStatus === 'REJECTED'
                            ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]'
                            : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
                      }`}
                    >
                      {service.approvalStatus === 'APPROVED' ? 'Approved' : service.approvalStatus === 'REJECTED' ? 'Rejected' : 'Awaiting approval'}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Assigned technician</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.assignedTechnician?.fullName ?? 'Unassigned'}</dd>
              </div>
            </dl>
            {service.complaints.length > 0 ? (
              <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <p className="text-xs text-[var(--ejo-text-muted)]">Customer&apos;s Requests</p>
                <div className="mt-1 space-y-1">
                  {service.complaints.map((c: (typeof service.complaints)[number]) => (
                    <p key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                      <span className="text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span> {c.description}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Service Items</h2>
            {service.items.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No service items recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {service.items.map((item: (typeof service.items)[number]) => (
                  <li key={item.id} className="flex items-center justify-between rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2">
                    <span className="text-[var(--ejo-text)]">{item.serviceType.name}</span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{item.serviceType.category}</span>
                  </li>
                ))}
              </ul>
            )}
            {canAddItems && availableServiceTypes.length > 0 ? (
              <form action={addServiceItemsFormAction} className="mt-4 border-t border-[var(--ejo-border)] pt-4">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">
                  Add work found after inspecting the vehicle
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-2">
                  {availableServiceTypes.map((t: (typeof availableServiceTypes)[number]) => (
                    <label key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
                      <input type="checkbox" name="serviceTypeIds" value={t.id} className="rounded border-[var(--ejo-border)]" />
                      {t.name} <span className="text-[var(--ejo-text-muted)]">— {t.category}</span>
                      {t.isPrimary ? (
                        <span className="rounded-full bg-[var(--ejo-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ejo-primary)]">
                          Primary anchor
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
                <SubmitButton
                  label="Add to this Service"
                  pendingLabel="Adding…"
                  className="mt-2 w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                />
              </form>
            ) : null}
            {canAddItems && availableServiceTypes.length === 0 && serviceTypes.length === 0 ? (
              <p className="mt-4 border-t border-[var(--ejo-border)] pt-4 text-xs text-[var(--ejo-text-muted)]">
                No Service Types set up yet —{' '}
                <LoadingLink href="/workshop/vehicle-service/service-types" className="text-[var(--ejo-primary)] underline">
                  add some first
                </LoadingLink>
                .
              </p>
            ) : null}
          </div>

          {(service.nextServiceDueOdometer || service.nextServiceDueDate) ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next Service Due</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">
                {service.nextServiceDueOdometer ? `${service.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null}
                {service.nextServiceDueOdometer && service.nextServiceDueDate ? ' or ' : null}
                {service.nextServiceDueDate ? formatDateOnly(service.nextServiceDueDate) : null}
                {' — whichever comes first.'}
              </p>
            </div>
          ) : null}

          {service.technicianNotes ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Technician Notes</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">{service.technicianNotes}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pb-6">
          {isApprover && service.approvalStatus === 'PENDING' ? (
            <div id="review-approval" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Review this Vehicle Service</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Approve to confirm this Vehicle Service can proceed, or reject it back to {service.createdBy.fullName}{' '}
                with a reason — a rejection doesn&apos;t have to mean something was wrong; availability or workload
                are valid reasons too.
              </p>
              <form action={approveVehicleServiceFormAction} className="mt-4 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Approve"
                  pendingLabel="Approving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
              <form action={rejectVehicleServiceFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <input
                  name="reason"
                  required
                  placeholder="Reason for rejection (required)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional additional notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Reject"
                  pendingLabel="Rejecting…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}

          {nextAction ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{nextAction.label}</h2>
              <form action={updateVehicleServiceStatusFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="newStatus" value={nextAction.status} />
                {nextAction.status === 'CHECKED_IN' ? (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Odometer (km)</label>
                    <input
                      name="odometerAtService"
                      type="number"
                      min="0"
                      defaultValue={service.odometerAtService ?? undefined}
                      placeholder={service.vehicle.mileage ? String(service.vehicle.mileage) : 'e.g. 52430'}
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                ) : null}
                {nextAction.status === 'COMPLETED' ? (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Technician Notes</label>
                    <textarea
                      name="technicianNotes"
                      rows={3}
                      placeholder="What was actually done…"
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                ) : null}
                <SubmitButton
                  label={nextAction.label}
                  pendingLabel="Saving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ) : null}

          {service.approvalStatus === 'APPROVED' && service.status !== 'COLLECTED' && service.status !== 'CANCELLED' ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Assign technician</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Currently: {service.assignedTechnician?.fullName ?? 'Unassigned'}
              </p>
              <form action={assignTechnicianToVehicleServiceFormAction} className="mt-4 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <select
                  name="technicianId"
                  defaultValue={service.assignedTechnician?.id ?? ''}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                >
                  <option value="">— Unassigned —</option>
                  {technicians.map((t: (typeof technicians)[number]) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                      {t.roles.length > 0 ? ` (${t.roles.map((r: (typeof t.roles)[number]) => r.role.name).join(', ')})` : ''}
                    </option>
                  ))}
                </select>
                <SubmitButton
                  label="Assign"
                  pendingLabel="Assigning…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                />
              </form>
            </div>
          ) : null}

          {canEscalate ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Found a Repair Job?</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                If the vehicle needs more than routine maintenance, send it to Job Card so the repair gets
                handled properly.
              </p>
              <form action={escalateVehicleServiceFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <SupervisorPicker vehicleType={service.vehicle.vehicleType} />
                <textarea
                  name="additionalComplaint"
                  rows={2}
                  placeholder="What did the technician actually find…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Escalate to Job Card"
                  pendingLabel="Escalating…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ) : null}

          {canCancel ? (
            <form action={updateVehicleServiceStatusFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="serviceId" value={service.id} />
              <input type="hidden" name="newStatus" value="CANCELLED" />
              <button type="submit" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]">
                Cancel this Vehicle Service
              </button>
            </form>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Opened</dt>
                <dd className="text-[var(--ejo-text)]">{formatDateTime(service.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Opened By</dt>
                <dd className="text-[var(--ejo-text)]">{service.createdBy.fullName}</dd>
              </div>
            </dl>
          </div>

          {isMasterAdmin ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Danger zone</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Permanently deletes this Vehicle Service and its requests. This cannot be undone.
              </p>
              <form action={deleteVehicleServiceFormAction} className="mt-4">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Delete Vehicle Service ${service.serviceNumber}? This permanently removes it and its requests. This cannot be undone.`}
                  label="Delete this Vehicle Service"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
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
  );
}
