import { guardPage } from '@/lib/authz/server';
import { getOrganisation } from '@/lib/actions/organisation';
import { updateOrganisationFormAction } from '@/lib/actions/organisation-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';
import { LoadingLink } from '@/components/LoadingLink';
import { EditIcon, BuildingIcon } from '@/components/icons';
import { EmptyState, PageTitle } from '@/components/ui';

/**
 * The organisation's printed identity (name, legal name, hotlines, address,
 * RC number, email). Every printed document takes its header from here.
 * Read-only by default; `?edit=true` shows the form.
 */
export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; edit?: string }> }) {
  await guardPage('admin.organisation.manage', '/organisation');
  const { error, status, edit } = await searchParams;
  const organisation = await getOrganisation();
  const isEditing = edit === 'true';

  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-2">
        <BuildingIcon className="h-6 w-6 text-[var(--ejo-primary)]" />
        <PageTitle icon="building">Organisation</PageTitle>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        The organisation&apos;s name, legal name, contact and registration details. These appear in the header of
        every printed document (Job Cards, parts requests, external procurement, receipts).
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
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="building" title="No organisation record found yet." /></div>
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
              placeholder="e.g. Example Holdings Limited"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Website</label>
              <input
                name="website"
                defaultValue={organisation.website ?? ''}
                placeholder="e.g. www.example.com"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={organisation.email ?? ''}
                placeholder="e.g. info@example.com"
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
              placeholder="e.g. 12 Example Road, Ikeja, Lagos"
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
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Organisation ID for the website</dt>
              <dd className="mt-0.5 font-mono text-sm text-[var(--ejo-text)]">{organisation.slug}</dd>
              <dd className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">The value for WEBSITE_ORGANISATION_SLUG in the website&apos;s hosting settings.</dd>
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
