import { FormJumpLink } from '@/components/ui/FormJumpLink';
import { SOURCE_PARAMS } from '@/lib/source-filter';
import { SourceFilterBar } from '@/components/SourceFilterBar';
import { BinnedNotice } from '@/components/RecycleBinPanel';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { listPartsPage, getStoreBranchId, listAllPartTypesForSelect, searchPartTypesForSelect } from '@/lib/actions/store';
import { durationLabel, durationShort } from '@/lib/warranty-state';
import { StockLevelDot, stockLevel } from '@/components/StockLevelDot';
import { PartWarrantyChoice } from '@/components/PartWarrantyChoice';
import { listWarrantyPolicies, searchPartWarrantyPolicyOptions, loadPartWarrantyPolicyOptions } from '@/lib/actions/warranty';
import { coverageLabel, REMEDY_LABEL } from '@/lib/warranty-claim-status';
import { createPartFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SearchableSelect } from '@/components/SearchableSelect';
import { UnitOfMeasureInput } from '@/components/UnitOfMeasureInput';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { EmptyState, PageHeader } from '@/components/ui';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

const TRACKING_TYPE_LABEL: Record<string, string> = {
  QUANTITY: 'Quantity',
  BATCH: 'Batch',
  SERIALIZED: 'Serialized',
};

/**
 * Parts catalogue: every stocked item with its tracking type (Quantity,
 * Batch, Serialized) and stock on hand. A part can have one alternative unit
 * with a conversion factor (e.g. a drum of oil in litres).
 */
export default async function InventoryPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; q?: string; binned?: string; page?: string } & Partial<Record<(typeof SOURCE_PARAMS)[number], string>>>;
}) {
  await guardAnyPage(['store.view'], '/inventory');
  const sp = await searchParams;
  const { error, status, q, binned, page } = sp;
  const origin = Object.fromEntries(SOURCE_PARAMS.map((k) => [k, sp[k]]).filter((e) => e[1])) as Record<string, string>;
  const branchId = await getStoreBranchId();
  const [paged, partPolicies, canManage] = await Promise.all([listPartsPage(branchId, q, Number(page) || 1, origin), listWarrantyPolicies('PART', { state: 'active' }), allows('store.parts.manage', { branchId })]);
  const parts = paged.parts;
  const pageHref = (n: number) => `/inventory/parts?${new URLSearchParams({ ...(q ? { q } : {}), ...origin, page: String(n) }).toString()}`;

  return (
    <div className="p-8">
      <PageHeader
        icon="package"
        back={{ href: "/inventory", label: "Back to Inventory" }}
        title="Parts Catalog"
        description={<><OrgTrail area="Store" /></>}
      />

      {error ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      <BinnedNotice reference={binned} />
      {status === 'part_created' ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="success" message="Part added to the catalog." />
        </div>
      ) : null}

      <form className="mb-8 flex gap-2" action="/inventory/parts">
        <LiveSearchInput
          type="search" name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name, part number, or category…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
        {q ? (
          <LoadingLink
            href="/inventory/parts"
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>
      <div className="mb-8 -mt-4"><SourceFilterBar action="/inventory/parts" values={sp} keep={{ q }} /></div>

      {canManage ? <FormJumpLink target="add-part">New Part</FormJumpLink> : null}
      <div className={canManage ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]' : 'grid gap-6'}>
        <div>
          {parts.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="package" title="No parts in the catalog yet." /></div>
          ) : (
            <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Part No.</th>
                    <th className="px-4 py-2">Tracking</th>
                    <th className="px-4 py-2">Warranty</th>
                    <th className="px-4 py-2">Unit</th>
                    <th className="px-4 py-2">
                      On Hand
                      <span className="block whitespace-nowrap text-[10px] font-normal normal-case leading-tight text-[var(--ejo-text-muted)]">
                        (<span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ejo-warning)] align-middle" /> reorder{' '}
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ejo-error)] align-middle" /> safety)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part: (typeof parts)[number]) => (
                    <tr key={part.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2">
                        <LoadingLink href={`/inventory/parts/${part.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                          {part.name}
                        </LoadingLink>
                        {part.category ? <p className="text-xs text-[var(--ejo-text-muted)]">{part.category}</p> : null}
                      </td>
                      <td data-label="Part No." className="px-4 py-2 text-[var(--ejo-text-muted)]">{part.partNumber ?? '—'}</td>
                      <td data-label="Tracking" className="px-4 py-2 text-[var(--ejo-text)]">{TRACKING_TYPE_LABEL[part.trackingType] ?? part.trackingType}</td>
                      <td data-label="Warranty" className="px-4 py-2 text-xs">
                        {part.warrantyPolicyId ? (
                          <LoadingLink href={`/warranty/policies/${part.warrantyPolicyId}`} className="rounded-full bg-[var(--ejo-success)]/15 px-2 py-0.5 font-medium text-[var(--ejo-success)] hover:underline">
                            {(() => {
                              const pol = partPolicies.find((x: (typeof partPolicies)[number]) => x.id === part.warrantyPolicyId);
                              return pol ? `${durationShort(pol)}${pol.distanceLimit ? ` / ${pol.distanceLimit.toLocaleString('en-NG')} km` : ''}` : 'Warranty';
                            })()}
                          </LoadingLink>
                        ) : (
                          <span className="text-[var(--ejo-text-muted)]">None</span>
                        )}
                      </td>
                      <td data-label="Unit" className="px-4 py-2 text-[var(--ejo-text-muted)]">{part.baseUnitOfMeasure}</td>
                      <td data-label="On hand" className="px-4 py-2 font-medium text-[var(--ejo-text)]">
                        {part.stock ? Number(part.stock.quantityOnHand).toLocaleString('en-NG', { maximumFractionDigits: 3 }) : '0'}
                        <StockLevelDot
                          level={stockLevel(
                            Number(part.stock?.quantityOnHand ?? 0),
                            part.reorderPoint === null ? null : Number(part.reorderPoint),
                            part.safetyStock === null ? null : Number(part.safetyStock),
                          )}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
          {paged.total > 0 ? (
            <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--ejo-text-muted)]">
              <span>Showing {((paged.page - 1) * 50 + 1).toLocaleString('en-NG')}–{Math.min(paged.page * 50, paged.total).toLocaleString('en-NG')} of {paged.total.toLocaleString('en-NG')} parts{q ? ` matching “${q}”` : ''}</span>
              {paged.pages > 1 ? (
                <span className="flex items-center gap-2">
                  {paged.page > 1 ? <LoadingLink href={pageHref(paged.page - 1)} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Previous</LoadingLink> : null}
                  <span>Page {paged.page.toLocaleString('en-NG')} of {paged.pages.toLocaleString('en-NG')}</span>
                  {paged.page < paged.pages ? <LoadingLink href={pageHref(paged.page + 1)} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Next</LoadingLink> : null}
                </span>
              ) : null}
            </nav>
          ) : null}
        </div>

        {canManage ? (
        <div id="add-part" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 xl:sticky xl:top-6 scroll-mt-20">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a Part</h2>
          <form action={createPartFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <input type="hidden" name="branchId" value={branchId} />
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Name</label>
              <input
                name="name"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Part Type</label>
              <SearchableSelect
                name="partTypeId"
                required
                search={searchPartTypesForSelect.bind(null, branchId)}
                loadDefaultOptions={listAllPartTypesForSelect.bind(null, branchId)}
                defaultOptionsLabel="All Part Types"
                placeholder="Search Part Types…"
                emptyMessage="No Part Type matches — add one under Part Categories & Types first."
              />
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                The category and part number are set from this.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Description</label>
              <textarea id="inventory-parts-text-1"
                name="description"
                rows={2}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
              <RefineTextButton targetId="inventory-parts-text-1" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Tracking Type</label>
              <select
                name="trackingType"
                required
                defaultValue=""
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                <option value="" disabled>Choose how this part is tracked…</option>
                <option value="QUANTITY">Quantity — a running total (e.g. brake pads, filters)</option>
                <option value="BATCH">Batch — grouped by delivery (e.g. engine oil, coolant)</option>
                <option value="SERIALIZED">Serialized — every unit has its own ID (e.g. tyres, rims)</option>
              </select>
            </div>
            <PartWarrantyChoice
              search={searchPartWarrantyPolicyOptions}
              loadDefaultOptions={loadPartWarrantyPolicyOptions}
              policies={partPolicies.map((p: (typeof partPolicies)[number]) => ({
                id: p.id, name: p.name, code: p.code, term: durationLabel(p), km: p.distanceLimit, covers: coverageLabel(p).toLowerCase(),
                remedy: (REMEDY_LABEL[p.defaultRemedy] ?? p.defaultRemedy).toLowerCase(), provider: p.provider.name, isSample: p.isSample,
              }))}
            />
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Base Unit of Measure</label>
              <UnitOfMeasureInput name="baseUnitOfMeasure" required />
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Stock is always tracked in this unit, no matter what unit a delivery arrives in.
              </p>
            </div>
            <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
              <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text)]">
                Alternative unit (optional) — e.g. a Drum or Case
              </summary>
              <div className="mt-3 space-y-2">
                <UnitOfMeasureInput name="altUnitName" placeholder="e.g. Drum, Carton, Can…" />
                <input
                  name="altUnitFactor"
                  type="number"
                  step="0.0001"
                  placeholder="Conversion factor, e.g. 200 (1 Drum = 200 Liters)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
            </details>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Reorder Point</label>
                <input
                  name="reorderPoint"
                  type="number"
                  step="0.001"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Safety Stock</label>
                <input
                  name="safetyStock"
                  type="number"
                  step="0.001"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
            </div>
            <SubmitButton
              label="Add Part"
              pendingLabel="Adding…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
        ) : null}
      </div>
    </div>
  );
}
