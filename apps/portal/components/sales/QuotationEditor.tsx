'use client';

import { useMemo, useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { quotationTotals, discountApproval, discountLevelLabel, naira, OFFICER_DISCOUNT_LIMIT_PERCENT } from '@/lib/sales-core';

export type EditorLine = { key: string; product: string; label: string; unitPrice: string; quantity: string; discountPercent: string; notes: string };

const INPUT = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

const newLine = (): EditorLine => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, product: '', label: '', unitPrice: '', quantity: '1', discountPercent: '0', notes: '' });

/**
 * The lines of a quotation: product (and configuration) from the price list
 * of the customer's channel, the unit price prefilled from the list (the
 * officer may change it), quantity and discount %, with live totals (7.5% VAT)
 * and the discount approval the quotation will need. Submits the lines as
 * JSON in one hidden field; the server prices and validates them again.
 */
export function QuotationEditor({
  customerId: fixedCustomerId,
  customerLabel,
  initialLines,
  searchCustomers,
  loadRecentCustomers,
  searchProducts,
}: {
  /** Set when editing: the customer cannot change. */
  customerId?: string;
  customerLabel?: string;
  initialLines?: EditorLine[];
  searchCustomers?: (query: string) => Promise<SearchableOption[]>;
  loadRecentCustomers?: () => Promise<SearchableOption[]>;
  searchProducts: (customerId: string, query: string) => Promise<SearchableOption[]>;
}) {
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? '');
  const [lines, setLines] = useState<EditorLine[]>(initialLines?.length ? initialLines : [newLine()]);

  const numeric = useMemo(() => lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(String(l.unitPrice).replace(/,/g, '')) || 0, discountPercent: Number(l.discountPercent) || 0 })), [lines]);
  const totals = useMemo(() => quotationTotals(numeric), [numeric]);
  const approval = useMemo(() => discountApproval(numeric), [numeric]);
  const update = (key: string, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const chooseProduct = (key: string, value: string) => {
    const price = value.split('|')[2] ?? '';
    update(key, { product: value, ...(price ? { unitPrice: price } : {}) });
  };
  const chooseCustomer = (value: string) => {
    setCustomerId(value);
    // Prices depend on the customer's channel: start the lines again.
    setLines([newLine()]);
  };
  const payload = JSON.stringify(lines.filter((l) => l.product).map((l) => ({ product: l.product, unitPrice: l.unitPrice, quantity: l.quantity, discountPercent: l.discountPercent, notes: l.notes })));

  return (
    <div className="space-y-4">
      {fixedCustomerId ? (
        <input type="hidden" name="customerId" value={fixedCustomerId} />
      ) : (
        <div>
          <label htmlFor="quotation-customer" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer</label>
          <SearchableSelect id="quotation-customer" name="customerId" required placeholder="Search customers…" search={searchCustomers ?? (async () => [])} loadDefaultOptions={loadRecentCustomers} defaultOptionsLabel="Recent customers" onChange={chooseCustomer} defaultValue={fixedCustomerId} defaultLabel={customerLabel} />
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">The price list follows the customer&apos;s channel: a dealer gets their tier&apos;s dealer prices, everyone else the retail list.</p>
        </div>
      )}

      <input type="hidden" name="linesJson" value={payload} />
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={l.key} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3" data-line={i + 1}>
            <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
              <div>
                <label htmlFor={`line-product-${l.key}`} className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Product / configuration</label>
                {customerId ? (
                  <SearchableSelect key={`${customerId}-${l.key}`} id={`line-product-${l.key}`} name={`line_${i + 1}_product`} placeholder="Search products…" search={(q) => searchProducts(customerId, q)} loadDefaultOptions={() => searchProducts(customerId, '')} defaultOptionsLabel="Price list" onChange={(v) => chooseProduct(l.key, v)} defaultValue={l.product || undefined} defaultLabel={l.label || undefined} />
                ) : (
                  <input className={INPUT} disabled placeholder="Choose the customer first" aria-label="Product (choose the customer first)" />
                )}
              </div>
              <div>
                <label htmlFor={`line-price-${l.key}`} className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Unit price (₦)</label>
                <input id={`line-price-${l.key}`} name={`line_${i + 1}_unitPrice`} inputMode="decimal" className={INPUT} value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} placeholder="From the price list" />
              </div>
              <div>
                <label htmlFor={`line-qty-${l.key}`} className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Quantity</label>
                <input id={`line-qty-${l.key}`} name={`line_${i + 1}_quantity`} type="number" min={1} step={1} className={INPUT} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`line-disc-${l.key}`} className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Discount %</label>
                <input id={`line-disc-${l.key}`} name={`line_${i + 1}_discountPercent`} type="number" min={0} max={100} step={0.5} className={INPUT} value={l.discountPercent} onChange={(e) => update(l.key, { discountPercent: e.target.value })} />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" aria-label={`Remove line ${i + 1}`}>Remove</button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ejo-text-muted)]">
              <input name={`line_${i + 1}_notes`} className={`${INPUT} max-w-md`} value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} placeholder="Line note (software, branding, asset tags…)" aria-label={`Line ${i + 1} note`} />
              <span>Line total: <span className="font-medium text-[var(--ejo-text)]">{naira((numeric[i]?.quantity ?? 0) * (numeric[i]?.unitPrice ?? 0) * (1 - (numeric[i]?.discountPercent ?? 0) / 100))}</span></span>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)]">+ Add a line</button>

      <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm">
        <div className="grid gap-1 sm:grid-cols-2">
          <span className="text-[var(--ejo-text-muted)]">Goods</span><span className="sm:text-right">{naira(totals.subtotal)}</span>
          <span className="text-[var(--ejo-text-muted)]">Discounts</span><span className="sm:text-right">- {naira(totals.discountTotal)}</span>
          <span className="text-[var(--ejo-text-muted)]">VAT 7.5%</span><span className="sm:text-right">{naira(totals.taxTotal)}</span>
          <span className="font-semibold text-[var(--ejo-text)]">Total</span><span className="font-semibold text-[var(--ejo-text)] sm:text-right" data-testid="quotation-total">{naira(totals.total)}</span>
        </div>
        <p className={`mt-2 text-xs ${approval.needsApproval ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-text-muted)]'}`}>
          {approval.needsApproval ? `Discounts above ${OFFICER_DISCOUNT_LIMIT_PERCENT}% need the ${discountLevelLabel(approval.level)} before the quotation goes to the customer.` : `Within the officer's ${OFFICER_DISCOUNT_LIMIT_PERCENT}% discount limit — no approval needed.`}
        </p>
      </div>
    </div>
  );
}
