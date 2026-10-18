import { notFound } from 'next/navigation';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { getProduct, getProductAuditTrail, listWarrantyPolicyOptions } from '@/lib/actions/catalogue';
import { createConfigurationFormAction, setProductActiveFormAction, updateProductFormAction } from '@/lib/actions/catalogue-form-handlers';
import { FAMILY_LABEL, SOURCE_LABEL, specLines, SUB_BRAND_LABEL, type ProductFamilyCode, type ProductSourceCode, type SubBrandCode } from '@/lib/catalogue-core';
import { humanizeAction } from '@/lib/humanize-action';
import { formatDateTime } from '@/lib/utils/format-date';
import { ProductFields } from '@/components/catalogue/ProductFields';
import { LoadingLink } from '@/components/LoadingLink';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BackLink, PageTitle, RevealPanel, SectionCard, StatusChip } from '@/components/ui';
import { btn, btnLine, input, label } from '@/components/production/styles';

const BANNER: Record<string, string> = {
  product_created: 'Product added — now add its configurations and bill of materials.',
  product_updated: 'Product saved.',
  product_archived: 'Product archived.',
  product_restored: 'Product restored.',
  configuration_created: 'Configuration added.',
};

const ACTION_LABEL: Record<string, string> = {
  'product.created': 'Product added', 'product.updated': 'Product edited', 'product.archived': 'Product archived', 'product.restored': 'Product restored',
  'product_configuration.created': 'Configuration added', 'product_configuration.updated': 'Configuration edited', 'product_configuration.bom_line_set': 'BOM line set',
  'product_configuration.bom_line_removed': 'BOM line removed', 'product_configuration.package_set': 'Software package set', 'product_configuration.package_removed': 'Software package removed',
};

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardAnyPage(['catalogue.view'], '/catalogue/products/[id]');
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const [p, trail, canManage] = await Promise.all([getProduct(id), getProductAuditTrail(id), allows('catalogue.manage')]);
  if (!p) notFound();
  const editing = edit === '1' && canManage;
  const policies = editing ? await listWarrantyPolicyOptions() : [];
  const specs = Object.entries(p.specs);
  return (
    <div className="w-full p-4 sm:p-8">
      <BackLink href="/catalogue/products" label="Back to Products" />
      {status && BANNER[status] ? <FormFeedbackBanner kind="success" message={BANNER[status]} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="package">{p.name}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            <span className="font-mono">{p.sku}</span> · {FAMILY_LABEL[p.family as ProductFamilyCode]} · {SUB_BRAND_LABEL[p.subBrand as SubBrandCode]} · {SOURCE_LABEL[p.source as ProductSourceCode]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={p.isActive ? 'ACTIVE' : 'ARCHIVED'} className="px-3 py-1 text-sm" />
          {canManage && !editing ? <LoadingLink href={`/catalogue/products/${p.id}?edit=1`} className={btnLine}>Edit product</LoadingLink> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateProductFormAction} className="space-y-5 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-6">
              <FormPendingOverlay />
              <input type="hidden" name="productId" value={p.id} />
              <ProductFields
                policies={policies}
                defaults={{ sku: p.sku, name: p.name, family: p.family, subBrand: p.subBrand, source: p.source, description: p.description, baseUnitOfMeasure: p.baseUnitOfMeasure, serialised: p.serialised, defaultWarrantyMonths: p.defaultWarrantyMonths, warrantyPolicyId: p.warrantyPolicyId, specsText: specLines(p.specs), imageUrl: p.imageUrl }}
              />
              <div className="flex gap-2">
                <SubmitButton label="Save product" pendingLabel="Saving…" className={btn} />
                <LoadingLink href={`/catalogue/products/${p.id}`} className={btnLine}>Cancel</LoadingLink>
              </div>
            </form>
          ) : (
            <SectionCard icon="list" title="Specification" description={p.description ?? undefined}>
              {specs.length === 0 ? (
                <p className="text-sm text-[var(--ejo-text-muted)]">No headline specification yet.</p>
              ) : (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {specs.map(([k, v]) => (
                    <div key={k} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2"><dt className="text-xs text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-[var(--ejo-text)]">{v || '—'}</dd></div>
                  ))}
                </dl>
              )}
              <dl className="mt-4 grid gap-2 border-t border-[var(--ejo-border)] pt-4 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-[var(--ejo-text-muted)]">Unit of measure</dt><dd>{p.baseUnitOfMeasure}</dd></div>
                <div><dt className="text-xs text-[var(--ejo-text-muted)]">Serial tracking</dt><dd>{p.serialised ? 'Every unit has a serial' : 'Quantity-tracked'}</dd></div>
                <div><dt className="text-xs text-[var(--ejo-text-muted)]">Default warranty</dt><dd>{p.defaultWarrantyMonths} months{p.warrantyPolicy ? ` · ${p.warrantyPolicy.code} — ${p.warrantyPolicy.name}` : ' · no policy linked'}</dd></div>
              </dl>
            </SectionCard>
          )}

          <SectionCard icon="sliders" title="Configurations" description="The variants this product sells in, each with its own SKU suffix, bill of materials and software packages.">
            {p.configurations.length === 0 ? (
              <p className="text-sm text-[var(--ejo-text-muted)]">No configurations yet{canManage ? ' — add one below.' : '.'}</p>
            ) : (
              <ul className="divide-y divide-[var(--ejo-border)]">
                {p.configurations.map((c: (typeof p.configurations)[number]) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div>
                      <LoadingLink href={`/catalogue/products/${p.id}/configurations/${c.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{c.name}</LoadingLink>
                      <div className="font-mono text-xs text-[var(--ejo-text-muted)]">{p.sku}-{c.code}{c.isDefault ? ' · default' : ''}{!c.isActive ? ' · retired' : ''}</div>
                      <div className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                        {c.bomLines.length} BOM {c.bomLines.length === 1 ? 'line' : 'lines'} · {c.packages.length} software {c.packages.length === 1 ? 'package' : 'packages'} · {c._count.buildOrders} build {c._count.buildOrders === 1 ? 'order' : 'orders'} · {c._count.finishedUnits} finished {c._count.finishedUnits === 1 ? 'unit' : 'units'}
                      </div>
                      {c.packages.length ? <div className="mt-1 text-xs text-[var(--ejo-text)]">{c.packages.map((x: (typeof c.packages)[number]) => `${x.package.name}${x.package.version ? ` ${x.package.version}` : ''}${x.required ? '' : ' (optional)'}`).join(' · ')}</div> : null}
                    </div>
                    <StatusChip status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <RevealPanel label="Add a configuration" className="mt-4" open={Boolean(error && error.toLowerCase().includes('configuration'))}>
                <form action={createConfigurationFormAction} className="space-y-4">
                  <FormPendingOverlay />
                  <input type="hidden" name="productId" value={p.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="code">Code (SKU suffix)</label>
                      <input id="code" name="code" required placeholder="16GB-512" className={`${input} uppercase`} maxLength={20} />
                    </div>
                    <div>
                      <label className={label} htmlFor="cname">Name</label>
                      <input id="cname" name="name" required placeholder="16 GB / 512 GB, Windows 11 Pro" className={input} maxLength={120} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label} htmlFor="cspecs">What differs (one per line, “Name: value”)</label>
                      <textarea id="cspecs" name="specsText" rows={3} className={`${input} font-mono text-xs`} placeholder={'RAM: 16 GB\nStorage: 512 GB SSD\nOS: Windows 11 Pro'} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="isDefault" className="h-4 w-4" /> Default configuration</label>
                  </div>
                  <SubmitButton label="Add configuration" pendingLabel="Adding…" className={btn} />
                </form>
              </RevealPanel>
            ) : null}
          </SectionCard>

          {canManage ? (
            <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">{p.isActive ? 'Archive this product' : 'Restore this product'}</summary>
              <form action={setProductActiveFormAction} className="mt-3">
                <FormPendingOverlay />
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="active" value={p.isActive ? '0' : '1'} />
                <p className="mb-3 text-xs text-[var(--ejo-text-muted)]">{p.isActive ? 'An archived product stays on past records but is not offered on new quotations or build orders.' : 'The product will be offered again.'}</p>
                <SubmitButton label={p.isActive ? 'Archive product' : 'Restore product'} pendingLabel="Saving…" className={btnLine} />
              </form>
            </details>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">About</h2>
            <p className="mt-2 text-[var(--ejo-text-muted)]">Added by {p.createdBy.fullName} · {formatDateTime(p.createdAt)}</p>
            <p className="text-[var(--ejo-text-muted)]">Last change {formatDateTime(p.updatedAt)}</p>
          </div>
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">History</h2>
            <AuditTrail
              entries={trail.map((e: (typeof trail)[number]) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const detail = [typeof meta.part === 'string' ? meta.part : null, typeof meta.package === 'string' ? meta.package : null, typeof meta.name === 'string' && e.action !== 'product.created' ? meta.name : null].filter(Boolean).join(' · ');
                return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: detail || null, dateLabel: formatDateTime(e.createdAt) };
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
