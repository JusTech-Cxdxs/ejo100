/**
 * Margin and markup describe the same profit against different bases:
 *
 *   Margin % = Profit ÷ Selling Price × 100
 *   Markup % = Profit ÷ Cost × 100
 *
 * For a profitable part, margin is always the smaller number, so entering a
 * markup figure where a margin is expected asks for a higher target than
 * intended.
 *
 * Part.targetMarginPercent always stores margin, whatever the part's
 * PricingMethod displays. All conversions go through these functions.
 */

/** Markup for a given margin. Null at margin = 100 (division by zero). */
export function marginToMarkup(marginPercent: number): number | null {
  if (marginPercent >= 100) return null;
  return (marginPercent / (100 - marginPercent)) * 100;
}

/** Margin for a given markup (any non-negative markup). */
export function markupToMargin(markupPercent: number): number {
  return (markupPercent / (100 + markupPercent)) * 100;
}

/** Selling price that gives `marginPercent` on `cost`. Null at margin = 100. */
export function priceForTargetMargin(cost: number, marginPercent: number): number | null {
  if (marginPercent >= 100) return null;
  return cost / (1 - marginPercent / 100);
}

/** Selling price that gives `markupPercent` on `cost`. */
export function priceForTargetMarkup(cost: number, markupPercent: number): number {
  return cost * (1 + markupPercent / 100);
}

/** Margin produced by a cost and selling price. */
export function actualMargin(cost: number, sellingPrice: number): number | null {
  if (sellingPrice <= 0) return null;
  return ((sellingPrice - cost) / sellingPrice) * 100;
}

/** Markup produced by a cost and selling price. */
export function actualMarkup(cost: number, sellingPrice: number): number | null {
  if (cost <= 0) return null;
  return ((sellingPrice - cost) / cost) * 100;
}

/** Margins closer than this (percentage points) count as equal; the
 * difference is kobo rounding. */
export const MARGIN_TOLERANCE_PP = 0.05;

/** The selling price that meets a target margin, rounded UP to the kobo so
 * the target is always met, never missed by rounding. */
export function roundedPriceForTargetMargin(cost: number, marginPercent: number): number | null {
  const raw = priceForTargetMargin(cost, marginPercent);
  return raw === null ? null : Math.ceil(raw * 100 - 1e-9) / 100;
}
