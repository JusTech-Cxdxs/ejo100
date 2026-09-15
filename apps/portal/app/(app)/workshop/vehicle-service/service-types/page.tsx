import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@ejo/database';
import { listServiceTypes } from '@/lib/actions/vehicle-service';
import { createServiceTypeFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';

/**
 * Real, configurable master data — never hardcoded service names, so
 * the business can add a new one (or retune an interval) without a
 * real code change, matching this module's own standing design
 * principle.
 */
export default async function ServiceTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { organisationId: true } })
    : null;
  const organisationId = user?.organisationId ?? null;
  const serviceTypes = organisationId ? await listServiceTypes(organisationId) : [];

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop/vehicle-service"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Vehicle Service
      </LoadingLink>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Service Types</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Real, configurable service items — engine oil, filters, brake work, and similar. A real interval (in
        kilometres, days, or both) is what drives the next-service calculation; leave both blank for a genuine
        one-off request with no real recurring due date.
      </p>

      {error ? (
        <div className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-4 py-2.5 text-sm text-[var(--ejo-error)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-x-auto">
          {serviceTypes.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">No Service Types yet — add the first one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Interval (km)</th>
                  <th className="px-4 py-3 font-medium">Interval (days)</th>
                </tr>
              </thead>
              <tbody>
                {serviceTypes.map((t: (typeof serviceTypes)[number]) => (
                  <tr key={t.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">{t.name}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{t.category}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text)]">{t.intervalKm ? `${t.intervalKm.toLocaleString('en-NG')} km` : '—'}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text)]">{t.intervalDays ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a Service Type</h2>
          <form action={createServiceTypeFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <input type="hidden" name="organisationId" value={organisationId ?? ''} />
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Name</label>
              <input name="name" required placeholder="e.g. Engine Oil" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Category</label>
              <input name="category" required placeholder="e.g. Filters, Brake & Safety, AC, Fluids" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Interval (km)</label>
                <input name="intervalKm" type="number" min="0" placeholder="e.g. 10000" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Interval (days)</label>
                <input name="intervalDays" type="number" min="0" placeholder="e.g. 180" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
            </div>
            <p className="text-[11px] text-[var(--ejo-text-muted)]">Both optional — leave blank for a genuine one-off with no real recurring due date.</p>
            <SubmitButton
              label="Add Service Type"
              pendingLabel="Adding…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
