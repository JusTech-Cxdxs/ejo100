import { getBranches } from '@/lib/actions/branches';
import { LoadingLink } from '@/components/LoadingLink';

/**
 * Every real physical facility — each with its own real address and
 * hotlines, since a real Job Card letterhead shows the branch's own
 * contact details separately from the Organisation's general ones
 * (confirmed directly from a real printed Kewalram Job Card: VI's own
 * hotlines and Isolo Workshop's own hotlines are two genuinely
 * different blocks on the same document).
 */
export default async function BranchesPage() {
  const branches = await getBranches();

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Branches</h1>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        Every real physical facility this platform operates from, and the real address and hotlines each one prints
        on its own documents.
      </p>

      {branches.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">No branches yet.</p>
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
              <span className="text-xs font-medium text-[var(--ejo-primary)]">Edit</span>
            </LoadingLink>
          ))}
        </div>
      )}
    </div>
  );
}
