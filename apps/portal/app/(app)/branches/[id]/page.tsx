import { notFound } from 'next/navigation';
import { getBranch } from '@/lib/actions/branches';
import { updateBranchFormAction } from '@/lib/actions/branches-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';
import { LoadingLink } from '@/components/LoadingLink';
import { EditIcon } from '@/components/icons';

/**
 * A branch's own real, printed identity — the same view/edit toggle
 * pattern as /organisation: plain read-only detail view by default,
 * an explicit Edit action reveals the form, saving or cancelling
 * returns to the read-only view.
 */
export default async function BranchEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, status, edit } = await searchParams;
  const branch = await getBranch(id);
  if (!branch) notFound();
  const isEditing = edit === 'true';

  return (
    <div className="p-8">
      <LoadingLink href="/branches" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Branches
      </LoadingLink>
      <h1 className="mb-1 text-2xl font-bold text-[var(--ejo-text)]">{branch.name}</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        {branch.businessUnit.name} · {branch.city.name}, {branch.city.state.name}
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Branch details updated." />
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
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Address</label>
            <textarea
              name="address"
              defaultValue={branch.address ?? ''}
              rows={2}
              placeholder="e.g. Plot 6, Block H, Abimbola Way, Isolo Industrial Estate, Lagos, Nigeria"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={branch.email ?? ''}
              placeholder="e.g. isolo.workshop@kewalramnigeria.com"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</label>
            <HotlineListInput initialValues={branch.hotlines} />
          </div>

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
    </div>
  );
}
