import { getOrganisation } from '@/lib/actions/organisation';
import { updateOrganisationFormAction } from '@/lib/actions/organisation-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';

/**
 * The organisation's own real, printed identity — name, legal name,
 * hotlines, HQ address, PO Box, RC number. This is deliberately the one
 * real source every printable document in the system (Job Card,
 * Store Parts Request, External Procurement, Payment) pulls its
 * header from, so a real letterhead detail only ever needs to be
 * entered once, in one place, to be correct everywhere it's printed.
 *
 * Renamed from Company to Organisation platform-wide — the same real
 * record, the same real fields, just the standard enterprise term
 * this project's own docs now use everywhere (matching the real
 * hierarchy: Organisation -> Business Unit -> Country -> State ->
 * City -> Branch).
 */
export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const { error, status } = await searchParams;
  const organisation = await getOrganisation();

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Organisation</h1>
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
      ) : (
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

          <SubmitButton
            label="Save Organisation Details"
            pendingLabel="Saving…"
            className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      )}
    </div>
  );
}
