import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@ejo/database';
import { listServiceTypes } from '@/lib/actions/vehicle-service';
import { createServiceTypeFormAction, updatePrimaryServiceIntervalFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { ServiceCategoryInput } from '@/components/ServiceCategoryInput';

const FOLDER_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--ejo-primary)]">
    <path
      d="M2.5 5.5A1.5 1.5 0 014 4h3.086a1.5 1.5 0 011.06.44l1.415 1.413a1.5 1.5 0 001.06.44H16a1.5 1.5 0 011.5 1.5v6.5a1.5 1.5 0 01-1.5 1.5H4a1.5 1.5 0 01-1.5-1.5v-9z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const TAG_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--ejo-text-muted)]">
    <path
      d="M10.5 3H4.5A1.5 1.5 0 003 4.5v6l7.086 7.086a1.5 1.5 0 002.121 0l4.379-4.379a1.5 1.5 0 000-2.121L10.5 3z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="7" r="1.25" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

/**
 * Every Service Type the workshop actually offers, grouped by
 * category — same visual pattern as Part Categories & Types. Also
 * where the organisation sets its own real Primary Service interval
 * — the one real policy every Vehicle Service's own next-service
 * prediction is anchored to, entirely separate from this catalogue
 * now.
 */
export default async function ServiceTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { organisationId: true } })
    : null;
  const organisationId = user?.organisationId ?? null;
  const [serviceTypes, organisation] = await Promise.all([
    organisationId ? listServiceTypes(organisationId) : Promise.resolve([]),
    organisationId
      ? prisma.organisation.findUnique({ where: { id: organisationId }, select: { primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } })
      : Promise.resolve(null),
  ]);

  const typesByCategory = new Map<string, typeof serviceTypes>();
  for (const t of serviceTypes) {
    const list = typesByCategory.get(t.category) ?? [];
    list.push(t);
    typesByCategory.set(t.category, list);
  }
  const categories = [...typesByCategory.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop/vehicle-service"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Vehicle Service
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Service Types</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Every job the workshop offers as part of a vehicle service — engine oil, filters, brake work, and so
        on. Staff pick from this list once they&apos;ve actually inspected a vehicle.
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'created' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Service Type added." />
        </div>
      ) : null}
      {status === 'interval_updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Primary Service interval updated." />
        </div>
      ) : null}

      <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/5 p-5">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Primary Service interval</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
          This is what decides when a vehicle is next due — usually the engine oil interval. When a
          technician confirms Primary Service was done on a visit, the vehicle&apos;s next-due mileage and
          date are calculated from this real interval, not from anything else performed that day.
        </p>
        <form action={updatePrimaryServiceIntervalFormAction} className="mt-3 flex flex-wrap items-end gap-2">
          <FormPendingOverlay />
          <input type="hidden" name="organisationId" value={organisationId ?? ''} />
          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Every (km)</label>
            <input
              name="primaryServiceIntervalKm"
              type="number"
              min="0"
              defaultValue={organisation?.primaryServiceIntervalKm ?? undefined}
              placeholder="e.g. 10000"
              className="w-40 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Every (days)</label>
            <input
              name="primaryServiceIntervalDays"
              type="number"
              min="0"
              defaultValue={organisation?.primaryServiceIntervalDays ?? undefined}
              placeholder="e.g. 180"
              className="w-40 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <SubmitButton
            label="Save interval"
            pendingLabel="Saving…"
            className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">No Service Types yet — add the first one on the right.</p>
          ) : (
            categories.map((category) => {
              const children = typesByCategory.get(category) ?? [];
              return (
                <div key={category} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
                  <div className="flex items-center gap-2">
                    {FOLDER_ICON}
                    <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{category}</h2>
                    <span className="ml-auto rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                      {children.length}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5 pl-6">
                    {children.map((t: (typeof serviceTypes)[number]) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm text-[var(--ejo-text)]">
                        {TAG_ICON}
                        {t.name}
                        <span className="text-xs text-[var(--ejo-text-muted)]">
                          {t.intervalKm ? `Every ${t.intervalKm.toLocaleString('en-NG')} km` : null}
                          {t.intervalKm && t.intervalDays ? ' or ' : null}
                          {t.intervalDays ? `every ${t.intervalDays} days` : null}
                          {!t.intervalKm && !t.intervalDays ? 'No fixed schedule' : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a Service Type</h2>
          <form action={createServiceTypeFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <input type="hidden" name="organisationId" value={organisationId ?? ''} />
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Name</label>
              <input name="name" required placeholder="e.g. Engine Oil Service" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Category</label>
              <ServiceCategoryInput name="category" categories={categories} required />
              <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Groups this Service Type on the list, the same way it&apos;s grouped here.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Every (km)</label>
                <input name="intervalKm" type="number" min="0" placeholder="e.g. 10000" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Every (days)</label>
                <input name="intervalDays" type="number" min="0" placeholder="e.g. 180" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
            </div>
            <p className="text-[11px] text-[var(--ejo-text-muted)]">
              Leave both blank if this is one-off or condition-based work, like an AC gas top-up or a brake
              adjustment. This interval is just for reference here — it&apos;s the Primary Service interval
              above that actually decides when a vehicle is next due.
            </p>
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
