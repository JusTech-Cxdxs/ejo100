import { FAMILIES, FAMILY_LABEL, SOURCE_LABEL, SUB_BRAND_LABEL, type ProductFamilyCode } from '@/lib/catalogue-core';
import { input, label } from '@/components/production/styles';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

export type ProductDefaults = {
  sku?: string; name?: string; family?: string; subBrand?: string; source?: string; description?: string | null; baseUnitOfMeasure?: string;
  serialised?: boolean; defaultWarrantyMonths?: number; warrantyPolicyId?: string | null; specsText?: string; imageUrl?: string | null;
};

/** The product form's fields, shared by "New product" and the edit form on the product page. */
export function ProductFields({ defaults = {}, policies }: { defaults?: ProductDefaults; policies: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor="sku">SKU</label>
        <input id="sku" name="sku" required defaultValue={defaults.sku ?? ''} placeholder="ZNX-PP2" className={`${input} uppercase`} maxLength={40} />
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Capital letters, digits and dashes.</p>
      </div>
      <div>
        <label className={label} htmlFor="name">Product name</label>
        <input id="name" name="name" required defaultValue={defaults.name ?? ''} placeholder="Prestige Pro2" className={input} maxLength={120} />
      </div>
      <div>
        <label className={label} htmlFor="family">Family</label>
        <select id="family" name="family" required defaultValue={defaults.family ?? 'LAPTOP'} className={input}>
          {FAMILIES.map((f: ProductFamilyCode) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="subBrand">Sub-brand</label>
        <select id="subBrand" name="subBrand" required defaultValue={defaults.subBrand ?? 'ZINOX'} className={input}>
          {(Object.keys(SUB_BRAND_LABEL) as (keyof typeof SUB_BRAND_LABEL)[]).map((s) => <option key={s} value={s}>{SUB_BRAND_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="source">Made or bought</label>
        <select id="source" name="source" required defaultValue={defaults.source ?? 'ASSEMBLED'} className={input}>
          {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="baseUnitOfMeasure">Unit of measure</label>
        <input id="baseUnitOfMeasure" name="baseUnitOfMeasure" defaultValue={defaults.baseUnitOfMeasure ?? 'Each'} className={input} maxLength={30} />
      </div>
      <div>
        <label className={label} htmlFor="defaultWarrantyMonths">Default warranty (months)</label>
        <input id="defaultWarrantyMonths" name="defaultWarrantyMonths" type="number" min={0} max={120} defaultValue={defaults.defaultWarrantyMonths ?? 12} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="warrantyPolicyId">Default warranty policy</label>
        <select id="warrantyPolicyId" name="warrantyPolicyId" defaultValue={defaults.warrantyPolicyId ?? ''} className={input}>
          <option value="">None yet</option>
          {policies.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)] sm:col-span-2">
        <input type="checkbox" name="serialised" defaultChecked={defaults.serialised ?? true} className="h-4 w-4" />
        Serialised — every unit carries its own serial number (computers, tablets, inverters, generators, televisions)
      </label>
      <div className="sm:col-span-2">
        <div className="flex items-center justify-between"><label className={label} htmlFor="description">Description</label><RefineTextButton targetId="description" label="description" compact /></div>
        <textarea id="description" name="description" rows={3} defaultValue={defaults.description ?? ''} className={input} maxLength={2000} placeholder="What this product is and who it is for." />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="specsText">Headline specification (one per line, as “Name: value”)</label>
        <textarea id="specsText" name="specsText" rows={5} defaultValue={defaults.specsText ?? ''} className={`${input} font-mono text-xs`} placeholder={'Processor: Intel Core i5-1235U\nDisplay: 14.1" FHD touch\nKeyboard: Naira-sign layout'} />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="imageUrl">Image address (optional)</label>
        <input id="imageUrl" name="imageUrl" type="url" defaultValue={defaults.imageUrl ?? ''} className={input} placeholder="https://…" maxLength={500} />
      </div>
    </div>
  );
}
