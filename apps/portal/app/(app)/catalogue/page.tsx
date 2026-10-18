import { allows, guardAnyPage } from '@/lib/authz/server';
import { getCatalogueSummary } from '@/lib/actions/catalogue';
import { FAMILIES, FAMILY_LABEL, type ProductFamilyCode } from '@/lib/catalogue-core';
import { LoadingLink } from '@/components/LoadingLink';
import { HeaderAction, NavCard, PageHeader, StatTile, type IconName } from '@/components/ui';

const SECTIONS: { name: string; href: string; desc: string; icon: IconName; needsManage?: boolean }[] = [
  { name: 'Products', href: '/catalogue/products', icon: 'package', desc: 'Every sellable model: SKU, family, sub-brand, specification, default warranty, and its configurations.' },
  { name: 'Software packages', href: '/catalogue/software', icon: 'layers', desc: 'The Windows image, Office, antivirus and the Zinox Care agent the line installs and the supervisor confirms.' },
  { name: 'Checklists', href: '/catalogue/checklists', icon: 'clipboard', desc: 'What the line supervisor checks and what QA tests, per product family.' },
  { name: 'New product', href: '/catalogue/products/new', icon: 'plus', desc: 'Add a model to the catalogue, then its configurations and bill of materials.', needsManage: true },
];

/** Catalogue home: products per family and the sections. */
export default async function CataloguePage() {
  await guardAnyPage(['catalogue.view'], '/catalogue');
  const [summary, canManage] = await Promise.all([getCatalogueSummary(), allows('catalogue.manage')]);
  const families = FAMILIES.filter((f: ProductFamilyCode) => (summary.families[f] ?? 0) > 0);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="package"
        eyebrow="Module · Catalogue"
        title="Catalogue"
        description="The products Zinox sells — assembled on the line from a bill of materials, or bought finished — with their configurations, software packages, checklists and default warranty."
        actions={canManage ? <HeaderAction href="/catalogue/products/new">New product</HeaderAction> : undefined}
      />

      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="package" label="Active products" value={summary.products} href="/catalogue/products" />
        <StatTile icon="wrench" label="Assembled here" value={summary.assembled} hint="Built from a bill of materials" href="/catalogue/products?source=ASSEMBLED" tone="info" />
        <StatTile icon="sliders" label="Configurations" value={summary.configurations} hint="Sellable variants" href="/catalogue/products" />
        <StatTile icon="layers" label="Software packages" value={summary.software} href="/catalogue/software" />
      </div>

      <section className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Products per family</h2>
        {families.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No products yet{canManage ? ' — add the first one.' : '.'}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {families.map((f: ProductFamilyCode) => (
              <LoadingLink key={f} href={`/catalogue/products?family=${f}`} className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]">
                {FAMILY_LABEL[f]} <span className="text-[var(--ejo-primary)]">{summary.families[f]}</span>
              </LoadingLink>
            ))}
          </div>
        )}
      </section>

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.filter((s) => !s.needsManage || canManage).map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} />
        ))}
      </div>
    </div>
  );
}
