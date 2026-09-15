import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@ejo/database';
import { listVehicleServices, listServiceTypes } from '@/lib/actions/vehicle-service';
import { createVehicleServiceFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { CustomerVehiclePicker } from '@/components/CustomerVehiclePicker';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { ServiceComplaintListInput } from '@/components/ServiceComplaintListInput';
import { formatDateOnly } from '@/lib/utils/format-date';

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

/**
 * Phase 1 of Vehicle Service — a real, genuinely lighter workflow for
 * routine maintenance, deliberately separate from Job Card. Reuses
 * CustomerVehiclePicker directly (the same real component Job Card
 * creation already uses) rather than a second, competing
 * customer/vehicle selector — no duplicated identity data, matching
 * this module's own founding principle.
 */
export default async function VehicleServicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { branchId: true, organisationId: true } })
    : null;
  const branchId = user?.branchId ?? null;
  const [services, serviceTypes] = await Promise.all([
    branchId ? listVehicleServices(branchId) : Promise.resolve([]),
    user?.organisationId ? listServiceTypes(user.organisationId) : Promise.resolve([]),
  ]);

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </LoadingLink>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicle Service</h1>
        <LoadingLink
          href="/workshop/vehicle-service/service-types"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Manage Service Types
        </LoadingLink>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Routine maintenance and minor requests — oil, filters, brake adjustment, AC top-up. A genuinely
        separate, lighter workflow from Job Card; a real repair discovered along the way escalates into its
        own real Job Card instead of staying here.
      </p>

      {error ? (
        <div className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-4 py-2.5 text-sm text-[var(--ejo-error)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-x-auto">
          {services.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">No Vehicle Service records yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Service No.</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s: (typeof services)[number]) => (
                  <tr key={s.id} className="border-b border-[var(--ejo-border)] last:border-0 hover:bg-[var(--ejo-bg)]">
                    <td className="px-4 py-3">
                      <LoadingLink href={`/workshop/vehicle-service/${s.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {s.serviceNumber}
                      </LoadingLink>
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text)]">{s.customer.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {[s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || '—'}
                      {s.vehicle.plateNumber ? ` — ${s.vehicle.plateNumber}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{formatDateOnly(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Open a Vehicle Service</h2>
          <form action={createVehicleServiceFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <CustomerVehiclePicker />
            {serviceTypes.length > 0 ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Service Items</label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-2">
                  {serviceTypes.map((t: (typeof serviceTypes)[number]) => (
                    <label key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
                      <input type="checkbox" name="serviceTypeIds" value={t.id} className="rounded border-[var(--ejo-border)]" />
                      {t.name} <span className="text-[var(--ejo-text-muted)]">— {t.category}</span>
                      {t.isPrimary ? (
                        <span className="rounded-full bg-[var(--ejo-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ejo-primary)]">Primary</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
                No Service Types set up yet —{' '}
                <LoadingLink href="/workshop/vehicle-service/service-types" className="text-[var(--ejo-primary)] underline">
                  add some first
                </LoadingLink>
                .
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer&apos;s Requests</label>
              <ServiceComplaintListInput />
            </div>
            <SubmitButton
              label="Open Vehicle Service"
              pendingLabel="Opening…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
