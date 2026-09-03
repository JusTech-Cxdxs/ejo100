import { listPartCategories, listPartTypes, getStoreBranchId, searchPartCategoriesForSelect, listAllPartCategoriesForSelect } from '@/lib/actions/store';
import { createPartCategoryFormAction, createPartTypeFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SearchableSelect } from '@/components/SearchableSelect';

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
 * The real, two-level Part Category / Part Type hierarchy — Filter
 * containing Oil Filter/Fuel Filter, Fluid containing Coolant/Engine
 * Oil/Brake Fluid, and so on. This is what a technician actually
 * browses when adding a Store Part line to an estimate — never a
 * real, vehicle-specific catalog Part, and never a price. Store
 * builds this list once; technicians pick from it every time after.
 */
export default async function PartTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;
  const branchId = await getStoreBranchId();
  const [categories, types] = await Promise.all([listPartCategories(branchId), listPartTypes(branchId)]);

  const typesByCategory = new Map<string, typeof types>();
  for (const t of types) {
    const list = typesByCategory.get(t.categoryId) ?? [];
    list.push(t);
    typesByCategory.set(t.categoryId, list);
  }

  return (
    <div className="p-8">
      <LoadingLink href="/inventory" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Inventory
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Part Categories & Types</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        The generic classification a technician picks from when requesting a Store Part on an estimate — Store then
        matches each request to the real, vehicle-fitting catalog Part.
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'category_created' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Part Category created." />
        </div>
      ) : null}
      {status === 'type_created' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Part Type created." />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">No Part Categories yet — add the first one on the right.</p>
          ) : (
            categories.map((category: (typeof categories)[number]) => {
              const children = typesByCategory.get(category.id) ?? [];
              return (
                <div key={category.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
                  <div className="flex items-center gap-2">
                    {FOLDER_ICON}
                    <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{category.name}</h2>
                    {category.code ? (
                      <span className="rounded-full bg-[var(--ejo-primary)]/15 px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--ejo-primary)]">
                        {category.code}
                      </span>
                    ) : null}
                    <span className="ml-auto rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                      {children.length}
                    </span>
                  </div>
                  {children.length === 0 ? (
                    <p className="mt-2 pl-6 text-xs text-[var(--ejo-text-muted)]">No Part Types under this category yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 pl-6">
                      {children.map((type) => (
                        <li key={type.id} className="flex items-center gap-2 text-sm text-[var(--ejo-text)]">
                          {TAG_ICON}
                          {type.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="h-fit space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <div className="flex items-center gap-2">
              {FOLDER_ICON}
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add Category</h2>
            </div>
            <form action={createPartCategoryFormAction} className="mt-3 space-y-2">
              <FormPendingOverlay />
              <input type="hidden" name="branchId" value={branchId} />
              <input
                name="name"
                required
                placeholder="e.g. Filter, Fluid, Brakes"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
              <input
                name="code"
                required
                maxLength={6}
                placeholder="Short code, e.g. FIL"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm uppercase text-[var(--ejo-text)]"
              />
              <p className="text-[11px] text-[var(--ejo-text-muted)]">Becomes every Part Number&apos;s prefix under this category — e.g. FIL-001, FIL-002.</p>
              <SubmitButton
                label="Add Category"
                pendingLabel="Adding…"
                className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              />
            </form>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <div className="flex items-center gap-2">
              {TAG_ICON}
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add Type</h2>
            </div>
            {categories.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Add a Category first — every Part Type belongs to one.</p>
            ) : (
              <form action={createPartTypeFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="branchId" value={branchId} />
                <SearchableSelect
                  name="categoryId"
                  required
                  search={searchPartCategoriesForSelect.bind(null, branchId)}
                  loadDefaultOptions={listAllPartCategoriesForSelect.bind(null, branchId)}
                  defaultOptionsLabel="All Categories"
                  placeholder="Search Categories…"
                  emptyMessage="No Category matches."
                />
                <input
                  name="name"
                  required
                  placeholder="e.g. Oil Filter, Engine Oil"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Add Type"
                  pendingLabel="Adding…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                />
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
