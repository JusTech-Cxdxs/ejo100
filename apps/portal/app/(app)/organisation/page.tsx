import { getOrganisation } from '@/lib/actions/organisation';
import { updateOrganisationFormAction } from '@/lib/actions/organisation-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';
import { LoadingLink } from '@/components/LoadingLink';
import { EditIcon, BuildingIcon } from '@/components/icons';

/**
 * The organisation's own real, printed identity — name, legal name,
 * hotlines, HQ address, PO Box, RC number, email. This is deliberately
 * the one real source every printable document in the system pulls
 * its header from, so a real letterhead detail only ever needs to be
 * entered once, in one place, to be correct everywhere it's printed.
 *
 * Standard view/edit toggle: plain read-only detail view by default,
 * an explicit Edit action reveals the form (`?edit=true`), and saving
 * or cancelling returns to the read-only view — the same real pattern
 * already proven on the Job Card status form, so a field is never
 * sitting open and editable by accident.
 */
export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; edit?: string }> }) {
  const { error, status, edit } = await searchParams;
  const organisation = await getOrganisation();
  const isEditing = edit === 'true';

  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-2">
        <BuildingIcon className="h-6 w-6 text-[var(--ejo-primary)]" />
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Organisation</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        Organisation profile, legal name, and the real contact and registration details every printed document — Job
        Cards, Store Parts Requests, External Procurement, Payment receipts — carries in its own header.
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Organisation details updated." />
        </div>
      ) : null}

      {!organisation ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">No organisation record found yet.</p>
      ) : isEditing ? (
        <form action={updateOrganisationFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="organisationId" value={organisation.id} />

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Organisation Name</label>
            <input
              name="name"
              defaultValue={organisation.name}
              required
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Legal Name</label>
            <input
              name="legalName"
              defaultValue={organisation.legalName ?? ''}
              placeholder="e.g. Kewalram Nigeria Limited"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Website</label>
              <input
                name="website"
                defaultValue={organisation.website ?? ''}
                placeholder="e.g. www.kewalram.com"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={organisation.email ?? ''}
                placeholder="e.g. info@kewalramnigeria.com"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</label>
            <HotlineListInput initialValues={organisation.hotlines} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">HQ Address</label>
            <input
              name="hqAddress"
              defaultValue={organisation.hqAddress ?? ''}
              placeholder="e.g. 1 Kewalram Way, Isolo, Lagos"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">PO Box</label>
              <input
                name="poBox"
                defaultValue={organisation.poBox ?? ''}
                placeholder="e.g. PO Box 1234"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">RC Number</label>
              <input
                name="rcNumber"
                defaultValue={organisation.rcNumber ?? ''}
                placeholder="e.g. RC 123456"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <SubmitButton
              label="Save Organisation Details"
              pendingLabel="Saving…"
              className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
            <LoadingLink
              href="/organisation"
              className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
            >
              Cancel
            </LoadingLink>
          </div>
        </form>
      ) : (
        <div className="max-w-xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Organisation Name</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Legal Name</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.legalName ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Website</dt>
                <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.website ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Email</dt>
                <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.email ?? '—'}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.hotlines.length > 0 ? organisation.hotlines.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">HQ Address</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.hqAddress ?? '—'}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">PO Box</dt>
                <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.poBox ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">RC Number</dt>
                <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{organisation.rcNumber ?? '—'}</dd>
              </div>
            </div>
          </dl>

          <LoadingLink
            href="/organisation?edit=true"
            className="mt-6 inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            <EditIcon className="h-4 w-4" />
            Edit Details
          </LoadingLink>
        </div>
      )}
    </div>
  );
}
