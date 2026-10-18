'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';

export type LineDraft = { key: string; kind: 'part' | 'product' | 'text'; partId?: string; partLabel?: string; productId?: string; productLabel?: string; description: string; quantity: string; unitCost: string };

const INPUT = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

let seq = 0;
export const newLine = (over: Partial<LineDraft> = {}): LineDraft => ({ key: `l${Date.now().toString(36)}${seq++}`, kind: 'part', description: '', quantity: '1', unitCost: '', ...over });

/**
 * The lines of a requisition or purchase order: each row is a part from the
 * components catalogue, a product from the product catalogue, or a free-text
 * item; with quantity and (estimated) unit cost. Rows submit as
 * line_<i>_kind / partId / productId / description / quantity / unitCost.
 */
export function LineItemsEditor({ initial, searchParts, searchProducts, costLabel = 'Unit cost', costRequired = false, currency = 'NGN' }: { initial?: LineDraft[]; searchParts: (q: string) => Promise<SearchableOption[]>; searchProducts: (q: string) => Promise<SearchableOption[]>; costLabel?: string; costRequired?: boolean; currency?: string }) {
  const [rows, setRows] = useState<LineDraft[]>(initial?.length ? initial : [newLine()]);
  const update = (key: string, patch: Partial<LineDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitCost) || 0), 0);

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.key} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3" data-line-row>
          <input type="hidden" name={`line_${i}_kind`} value={r.kind} />
          <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)_110px_150px_auto]">
            <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">
              Item
              <select className={`${INPUT} mt-1`} value={r.kind} onChange={(e) => update(r.key, { kind: e.target.value as LineDraft['kind'] })} aria-label={`Line ${i + 1} item kind`}>
                <option value="part">Part (component)</option>
                <option value="product">Product (finished)</option>
                <option value="text">Describe it</option>
              </select>
            </label>
            <div className="min-w-0">
              {r.kind === 'part' ? (
                <div>
                  <label htmlFor={`line-${i}-part`} className="block text-xs font-medium text-[var(--ejo-text-muted)]">Part</label>
                  <div className="mt-1"><SearchableSelect id={`line-${i}-part`} name={`line_${i}_partId`} search={searchParts} loadDefaultOptions={() => searchParts('')} defaultOptionsLabel="Parts" placeholder="Search parts…" minQueryLength={0} defaultValue={r.partId} defaultLabel={r.partLabel} required /></div>
                </div>
              ) : r.kind === 'product' ? (
                <div>
                  <label htmlFor={`line-${i}-product`} className="block text-xs font-medium text-[var(--ejo-text-muted)]">Product</label>
                  <div className="mt-1"><SearchableSelect id={`line-${i}-product`} name={`line_${i}_productId`} search={searchProducts} loadDefaultOptions={() => searchProducts('')} defaultOptionsLabel="Products" placeholder="Search products…" minQueryLength={0} defaultValue={r.productId} defaultLabel={r.productLabel} required /></div>
                </div>
              ) : (
                <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">
                  Description
                  <input name={`line_${i}_description`} className={`${INPUT} mt-1`} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="e.g. Pallet wrap, 500 mm × 300 m" required maxLength={300} />
                </label>
              )}
              {r.kind !== 'text' ? <input type="hidden" name={`line_${i}_description`} value={r.description} /> : null}
            </div>
            <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">
              Quantity
              <input name={`line_${i}_quantity`} type="number" min="0.001" step="any" inputMode="decimal" className={`${INPUT} mt-1`} value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} required />
            </label>
            <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">
              {costLabel} ({currency})
              <input name={`line_${i}_unitCost`} type="number" min="0" step="0.01" inputMode="decimal" className={`${INPUT} mt-1`} value={r.unitCost} onChange={(e) => update(r.key, { unitCost: e.target.value })} required={costRequired} placeholder="0.00" />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => remove(r.key)} disabled={rows.length === 1} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] disabled:opacity-40" aria-label={`Remove line ${i + 1}`}>Remove</button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setRows((rs) => [...rs, newLine()])} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">+ Add a line</button>
        <p className="text-sm text-[var(--ejo-text-muted)]">{rows.length} {rows.length === 1 ? 'line' : 'lines'} · total <span className="font-semibold text-[var(--ejo-text)]">{currency} {total.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
      </div>
    </div>
  );
}
