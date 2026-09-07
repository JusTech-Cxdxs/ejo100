import { getCompany } from '@/lib/actions/company';
import { updateCompanyFormAction } from '@/lib/actions/company-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';

/**
 * The company's own real, printed identity — name, legal name,
 * hotlines, HQ address, PO Box, RC number. This is deliberately the one
 * real source every printable document in the system (Job Card,
 * Store Parts Request, External Procurement, Payment) pulls its
 * header from, so a real letterhead detail only ever needs to be
 * entered once, in one place, to be correct everywhere it's printed.
 */
export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const { error, status } = await searchParams;
  const company = await getCompany();

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Company</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        Company profile, legal name, and the real contact and registration details every printed document — Job
        Cards, Store Parts Requests, External Procurement, Payment receipts — carries in its own header.
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Company details updated." />
        </div>
      ) : null}

      {!company ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">No company record found yet.</p>
      ) : (
        <form action={updateCompanyFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="companyId" value={company.id} />

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Company Name</label>
            <input
              name="name"
              defaultValue={company.name}
              required
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Legal Name</label>
            <input
              name="legalName"
              defaultValue={company.legalName ?? ''}
              placeholder="e.g. Kewalram Nigeria Limited"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Website</label>
            <input
              name="website"
              defaultValue={company.website ?? ''}
              placeholder="e.g. www.kewalram.com"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</label>
            <HotlineListInput initialValues={company.hotlines} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">HQ Address</label>
            <input
              name="hqAddress"
              defaultValue={company.hqAddress ?? ''}
              placeholder="e.g. 1 Kewalram Way, Isolo, Lagos"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">PO Box</label>
              <input
                name="poBox"
                defaultValue={company.poBox ?? ''}
                placeholder="e.g. PO Box 1234"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">RC Number</label>
              <input
                name="rcNumber"
                defaultValue={company.rcNumber ?? ''}
                placeholder="e.g. RC 123456"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
          </div>

          <SubmitButton
            label="Save Company Details"
            pendingLabel="Saving…"
            className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      )}
    </div>
  );
}
