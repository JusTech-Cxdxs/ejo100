import { notFound } from 'next/navigation';
import { getBranch } from '@/lib/actions/branches';
import { updateBranchFormAction } from '@/lib/actions/branches-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HotlineListInput } from '@/components/HotlineListInput';
import { LoadingLink } from '@/components/LoadingLink';

export default async function BranchEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, status } = await searchParams;
  const branch = await getBranch(id);
  if (!branch) notFound();

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
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Hotlines</label>
          <HotlineListInput initialValues={branch.hotlines} />
        </div>

        <SubmitButton
          label="Save Branch Details"
          pendingLabel="Saving…"
          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        />
      </form>
    </div>
  );
}
