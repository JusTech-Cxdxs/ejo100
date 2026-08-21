import Link from 'next/link';
import { listJobCards, listCustomers, listAllVehicles } from '@/lib/actions/workshop';
import { createJobCardFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  CHECKED_IN: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  IN_PROGRESS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  AWAITING_PARTS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  QUALITY_CHECK: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  READY_FOR_COLLECTION: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CLOSED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

export default async function WorkshopJobCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [jobCards, customers, vehicles] = await Promise.all([
    listJobCards(),
    listCustomers(),
    listAllVehicles(),
  ]);

  return (
    <div className="p-8">
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Job Cards</h1>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-hidden">
          {jobCards.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              No Job Cards yet. Open the first one using the form on the right.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Job #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Technician</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobCards.map((jc: (typeof jobCards)[number]) => (
                  <tr key={jc.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">
                      <Link href={`/workshop/job-cards/${jc.id}`} className="hover:underline">
                        {jc.jobNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{jc.customer.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {jc.vehicle.plateNumber || [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {jc.assignedTechnician?.fullName ?? 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[jc.status]}`}>
                        {STATUS_LABEL[jc.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Open Job Card</h2>
          {customers.length === 0 || vehicles.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
              A Job Card needs an existing customer and vehicle.{' '}
              <Link href="/workshop/customers" className="text-[var(--ejo-primary)] underline">Add a customer</Link>
              {' '}and{' '}
              <Link href="/workshop/vehicles" className="text-[var(--ejo-primary)] underline">register their vehicle</Link>
              {' '}first.
            </p>
          ) : (
            <form action={createJobCardFormAction} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer</label>
                <select
                  name="customerId"
                  required
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                >
                  {customers.map((c: (typeof customers)[number]) => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Vehicle</label>
                <select
                  name="vehicleId"
                  required
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                >
                  {vehicles.map((v: (typeof vehicles)[number]) => (
                    <option key={v.id} value={v.id}>
                      {(v.plateNumber || v.chassisNumber || v.id.slice(0, 6))} — {v.customer.fullName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
                  Every vehicle is listed with its owner — pick the one matching the customer selected above.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage at check-in (km)</label>
                <input name="mileageAtCheckIn" type="number" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Complaint / reason for visit</label>
                <textarea
                  name="complaint"
                  required
                  rows={3}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <SubmitButton
                label="Open Job Card"
                pendingLabel="Opening…"
                className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              />
            </form>
          )}
        </div>
      </div>

      <Link
        href="/workshop"
        className="mt-6 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </Link>
    </div>
  );
}
