import { guardPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getBranch } from '@/lib/actions/branches';
import { updateBranchFormAction } from '@/lib/actions/branches-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';
import { LoadingLink } from '@/components/LoadingLink';
import { EditIcon } from '@/components/icons';
import { getBranchDepartments } from '@/lib/actions/structure';
import { DepartmentsPanel } from '@/components/DepartmentsPanel';
import { STRUCTURE_STATUS } from '@/lib/structure-messages';
import { BackLink, PageTitle } from '@/components/ui';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

/** A branch's printed details. Read-only until Edit is chosen, as on /organisation. */
export default async function BranchEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string; edit?: string }>;
}) {
  await guardPage('admin.structure.manage', '/branches');
  const { id } = await params;
  const { error, status, edit } = await searchParams;
  const branch = await getBranch(id);
  if (!branch) notFound();
  const departments = await getBranchDepartments(branch.id);
  const isEditing = edit === 'true';

  return (
    <div className="p-8">
      <BackLink href="/branches" label="Back to Branches" className="mb-4" />
      <PageTitle icon="branch" className="mb-1">{branch.name}</PageTitle>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        {branch.businessUnit.name} · {branch.city.name}, {branch.city.state.name}
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status && STRUCTURE_STATUS[status] ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message={STRUCTURE_STATUS[status]!} />
        </div>
      ) : null}

      {isEditing ? (
        <form action={updateBranchFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="branchId" value={branch.id} />

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Branch Name</label>
            <input
              name="name"
              defaultValue={branch.name}
              required
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Document Code</label>
            <input
              name="code"
              defaultValue={branch.code ?? ''}
              placeholder="e.g. KWL-WS — used in document numbering"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label htmlFor="branch-sap-plant" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">SAP plant code (WERKS)</label>
            <input
              id="branch-sap-plant"
              name="sapPlant"
              defaultValue={branch.sapPlant ?? ''}
              maxLength={4}
              placeholder="e.g. 1000 — when this branch is a plant or stock point in SAP"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 font-mono text-sm uppercase text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Address</label>
            <textarea id="branches-id-text-1"
              name="address"
              defaultValue={branch.address ?? ''}
              rows={2}
              placeholder="e.g. Plot 6, Block H, Abimbola Way, Isolo Industrial Estate, Lagos, Nigeria"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
            <RefineTextButton targetId="branches-id-text-1" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={branch.email ?? ''}
              placeholder="e.g. workshop@example.com"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</label>
            <HotlineListInput initialValues={branch.hotlines} />
          </div>
          <fieldset className="space-y-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
            <legend className="px-1 text-sm font-medium text-[var(--ejo-text)]">Bank account for customer payments</legend>
            <p className="text-xs text-[var(--ejo-text-muted)]">Printed on every estimate email, PDF and print-out from this branch. Fill in all three, or leave all three empty.</p>
            <div>
              <label htmlFor="bankName" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Bank name</label>
              <input id="bankName" name="bankName" defaultValue={branch.bankName ?? ''} placeholder="e.g. Zenith Bank" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label htmlFor="bankAccountName" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Account name</label>
              <input id="bankAccountName" name="bankAccountName" defaultValue={branch.bankAccountName ?? ''} placeholder="e.g. Example Holdings Ltd" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label htmlFor="bankAccountNumber" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Account number (10 digits)</label>
              <input id="bankAccountNumber" name="bankAccountNumber" defaultValue={branch.bankAccountNumber ?? ''} inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="0123456789" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
          </fieldset>

          <div className="flex gap-2">
            <SubmitButton
              label="Save Branch Details"
              pendingLabel="Saving…"
              className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
            <LoadingLink
              href={`/branches/${branch.id}`}
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
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Branch Name</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{branch.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Document Code</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{branch.code ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Address</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{branch.address ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Email</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{branch.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</dt>
              <dd className="mt-0.5 text-sm text-[var(--ejo-text)]">{branch.hotlines.length > 0 ? branch.hotlines.join(', ') : '—'}</dd>
            </div>
          </dl>

          <LoadingLink
            href={`/branches/${branch.id}?edit=true`}
            className="mt-6 inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            <EditIcon className="h-4 w-4" />
            Edit Details
          </LoadingLink>
        </div>
      )}

      <section className="mt-10 max-w-3xl" aria-labelledby="departments-heading">
        <h2 id="departments-heading" className="text-lg font-semibold text-[var(--ejo-text)]">Departments</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--ejo-text-muted)]">The departments of {branch.name} and the people in each. System departments carry the workflows and can be renamed, not switched off. People are placed in a department on the Users page.</p>
        <DepartmentsPanel branchId={branch.id} departments={departments} returnTo={`/branches/${branch.id}`} />
      </section>
    </div>
  );
}
