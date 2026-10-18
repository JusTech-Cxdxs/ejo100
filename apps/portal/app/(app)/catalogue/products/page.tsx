import { allows, guardAnyPage } from '@/lib/authz/server';
import { listProducts } from '@/lib/actions/catalogue';
import { FAMILIES, FAMILY_LABEL, SOURCE_LABEL, SUB_BRAND_LABEL, type ProductFamilyCode, type ProductSourceCode, type SubBrandCode } from '@/lib/catalogue-core';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { EmptyState, HeaderAction, PageHeader, ResponsiveTable, StatusChip } from '@/components/ui';
import { chipLink, tableHead, tableRow, tableWrap, td, th } from '@/components/production/styles';

/** The product list: family and sub-brand filters, search by name or SKU. */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; family?: string; subBrand?: string; source?: string; all?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['catalogue.view'], '/catalogue/products');
  const { q, family, subBrand, source, all, status, error } = await searchParams;
  const [rows, canManage] = await Promise.all([listProducts({ q, family, subBrand, includeInactive: all === '1' }), allows('catalogue.manage')]);
  const shown = source && ['ASSEMBLED', 'FINISHED_IMPORT', 'KIT'].includes(source) ? rows.filter((p: (typeof rows)[number]) => p.source === source) : rows;
  const link = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, family, subBrand, source, all, ...patch })) if (v) params.set(k, v);
    const s = params.toString();
    return `/catalogue/products${s ? `?${s}` : ''}`;
  };
  const chip = (active: boolean) => `${chipLink} ${active ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]'}`;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        icon="package"
        title="Products"
        back={{ href: '/catalogue', label: 'Back to Catalogue' }}
        description="Every model in the catalogue, with how many configurations it sells in."
        actions={canManage ? <HeaderAction href="/catalogue/products/new">New product</HeaderAction> : undefined}
      />
      {status === 'product_archived' ? <FormFeedbackBanner kind="success" message="Product archived — it no longer shows on new quotations or build orders." /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <LoadingLink href={link({ family: undefined })} className={chip(!family)} aria-current={!family ? 'true' : undefined}>All families</LoadingLink>
        {FAMILIES.map((f: ProductFamilyCode) => (
          <LoadingLink key={f} href={link({ family: f })} className={chip(family === f)} aria-current={family === f ? 'true' : undefined}>{FAMILY_LABEL[f]}</LoadingLink>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href={link({ subBrand: undefined })} className={chip(!subBrand)}>All sub-brands</LoadingLink>
        {(Object.keys(SUB_BRAND_LABEL) as SubBrandCode[]).map((s) => <LoadingLink key={s} href={link({ subBrand: s })} className={chip(subBrand === s)}>{SUB_BRAND_LABEL[s]}</LoadingLink>)}
        <span className="mx-1 self-center text-[var(--ejo-border)]">|</span>
        {(Object.keys(SOURCE_LABEL) as ProductSourceCode[]).map((s) => <LoadingLink key={s} href={link({ source: source === s ? undefined : s })} className={chip(source === s)}>{SOURCE_LABEL[s]}</LoadingLink>)}
        <LoadingLink href={link({ all: all === '1' ? undefined : '1' })} className={chip(all === '1')}>Include archived</LoadingLink>
      </div>

      <form className="mb-4 flex gap-2" action="/catalogue/products">
        {family ? <input type="hidden" name="family" value={family} /> : null}
        {subBrand ? <input type="hidden" name="subBrand" value={subBrand} /> : null}
        {source ? <input type="hidden" name="source" value={source} /> : null}
        {all ? <input type="hidden" name="all" value={all} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by name or SKU…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {shown.length === 0 ? (
        <div className={`${tableWrap} border-dashed`}>
          <EmptyState icon="package" title={rows.length === 0 && !q ? 'No products yet' : 'Nothing matches'} action={canManage && rows.length === 0 ? <LoadingLink href="/catalogue/products/new" className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">Add the first product</LoadingLink> : undefined}>
            {rows.length === 0 && !q ? 'Add a product, then its configurations and bill of materials.' : 'Try another family, sub-brand or search.'}
          </EmptyState>
        </div>
      ) : (
        <ResponsiveTable className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHead}>
                <th className={th}>Product</th>
                <th className={th}>Family</th>
                <th className={th}>Sub-brand</th>
                <th className={th}>Made or bought</th>
                <th className={th}>Configurations</th>
                <th className={th}>Warranty</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p: (typeof shown)[number]) => (
                <tr key={p.id} className={tableRow}>
                  <td className={td}>
                    <LoadingLink href={`/catalogue/products/${p.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.name}</LoadingLink>
                    <div className="font-mono text-xs text-[var(--ejo-text-muted)]">{p.sku}</div>
                  </td>
                  <td data-label="Family" className={td}>{FAMILY_LABEL[p.family as ProductFamilyCode]}</td>
                  <td data-label="Sub-brand" className={td}>{SUB_BRAND_LABEL[p.subBrand as SubBrandCode]}</td>
                  <td data-label="Made or bought" className={td}>{SOURCE_LABEL[p.source as ProductSourceCode]}</td>
                  <td data-label="Configurations" className={`${td} tabular-nums`}>{p._count.configurations}</td>
                  <td data-label="Warranty" className={td}>{p.defaultWarrantyMonths} months{p.serialised ? '' : ' · not serialised'}</td>
                  <td data-label="Status" className={td}><StatusChip status={p.isActive ? 'ACTIVE' : 'ARCHIVED'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
