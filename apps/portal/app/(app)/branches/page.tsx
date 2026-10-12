import { guardPage } from '@/lib/authz/server';
import { getBranches } from '@/lib/actions/branches';
import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, HeaderAction, PageHeader } from '@/components/ui';

/**
 * Branches, each with its own address and hotlines: printed documents show
 * the branch contact block alongside the organisation's.
 */
export default async function BranchesPage() {
  await guardPage('admin.structure.manage', '/branches');
  const branches = await getBranches();

  return (
    <div className="p-8">
      <PageHeader
        icon="branch"
        title="Branches"
        description="Each branch's address and hotlines, as printed on its documents."
        actions={<HeaderAction href="/structure" icon="sitemap" variant="secondary">Organisation structure · open a branch →</HeaderAction>}
      />

      {branches.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="branch" title="No branches yet." /></div>
      ) : (
        <div className="max-w-3xl space-y-2">
          {branches.map((branch: (typeof branches)[number]) => (
            <LoadingLink
              key={branch.id}
              href={`/branches/${branch.id}`}
              className="flex items-center justify-between rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-5 py-4 hover:bg-[var(--ejo-bg)]"
            >
              <div>
                <p className="text-sm font-medium text-[var(--ejo-text)]">{branch.name}</p>
                <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">
                  {branch.businessUnit.name} · {branch.city.name}, {branch.city.state.name}
                </p>
              </div>
              <span className="text-xs font-medium text-[var(--ejo-primary)]">View / Edit</span>
            </LoadingLink>
          ))}
        </div>
      )}
    </div>
  );
}
