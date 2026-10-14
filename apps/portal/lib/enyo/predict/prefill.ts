/**
 * "Add" on a suggested line fills in the page's normal add-line form — it
 * never writes. The card and the form talk through one browser event; the
 * form validates and clips what it receives like any other input, and the
 * person still presses the form's own Add button.
 *
 * Browser-safe (no server imports).
 */
export const ESTIMATE_PREFILL_EVENT = 'ejo:estimate-line-prefill';

export type EstimateLinePrefill = {
  type: string;
  /** STORE_PART: this branch's Part Type id and its name (shown in the picker). */
  partTypeId?: string | null;
  partTypeLabel?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
};

const TYPES = new Set(['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY']);

/** Keeps only what the form accepts, within the form's own limits. */
export function cleanPrefill(raw: unknown, opts: { wholeQuantity: boolean }): EstimateLinePrefill | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = typeof r.type === 'string' && TYPES.has(r.type) ? r.type : null;
  if (!type) return null;
  // Printable text only (control characters become spaces), clipped like the form's own fields.
  const text = (v: unknown, max: number) => (typeof v === 'string' ? [...v].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('').trim().slice(0, max) : null);
  const qRaw = typeof r.quantity === 'number' && Number.isFinite(r.quantity) ? r.quantity : 1;
  const quantity = Math.min(9999, Math.max(opts.wholeQuantity ? 1 : 0.01, opts.wholeQuantity ? Math.round(qRaw) : Math.round(qRaw * 100) / 100));
  const price = typeof r.unitPrice === 'number' && Number.isFinite(r.unitPrice) && r.unitPrice >= 0 && r.unitPrice < 1e10 ? Math.round(r.unitPrice * 100) / 100 : null;
  const partTypeId = typeof r.partTypeId === 'string' && /^[a-z0-9]{8,40}$/i.test(r.partTypeId) ? r.partTypeId : null;
  if (type === 'STORE_PART' && !partTypeId) return null;
  return {
    type,
    partTypeId: type === 'STORE_PART' ? partTypeId : null,
    partTypeLabel: type === 'STORE_PART' ? text(r.partTypeLabel, 120) : null,
    description: type === 'STORE_PART' ? null : text(r.description, 200),
    quantity,
    unitPrice: type === 'STORE_PART' ? null : price,
  };
}

/** Asks the add-line form on this page to fill itself in. */
export function requestPrefill(detail: EstimateLinePrefill): void {
  window.dispatchEvent(new CustomEvent(ESTIMATE_PREFILL_EVENT, { detail }));
}
