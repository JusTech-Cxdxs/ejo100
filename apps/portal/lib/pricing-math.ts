/**
 * Margin and Markup are both real, correct ways to describe the exact
 * same profit — they just measure it against a different real base:
 *
 *   Margin % = Profit ÷ Selling Price × 100  ("what share of the
 *              price the customer pays is profit")
 *   Markup % = Profit ÷ Cost × 100           ("how much was added on
 *              top of what it cost")
 *
 * The same real profit always produces a smaller Margin number than
 * Markup — never the other way around — since Selling Price is always
 * bigger than Cost for a genuinely profitable Part. Confirmed
 * directly this is a real, easy mistake to make: entering a real
 * Markup figure into a field that actually means Margin quietly asks
 * for a real, higher target than intended.
 *
 * Part.targetMarginPercent always stores the real Margin, regardless
 * of which one a Part's own PricingMethod is set to show — these
 * functions are the one real, single place that conversion happens,
 * so a UI displaying Markup and a server calculating a real price
 * can never quietly drift out of sync with each other.
 */

/** Real Markup equivalent to a given real Margin. Undefined at
 * margin=100 (division by zero — a Part can never be sold for
 * genuinely infinite markup), returns null rather than a real number
 * in that edge case. */
export function marginToMarkup(marginPercent: number): number | null {
  if (marginPercent >= 100) return null;
  return (marginPercent / (100 - marginPercent)) * 100;
}

/** Real Margin equivalent to a given real Markup. Always defined for
 * any real, non-negative Markup. */
export function markupToMargin(markupPercent: number): number {
  return (markupPercent / (100 + markupPercent)) * 100;
}

/** The real selling price needed to hold a given real Margin against
 * a given real cost. Undefined at margin=100, same reasoning as
 * marginToMarkup above. */
export function priceForTargetMargin(cost: number, marginPercent: number): number | null {
  if (marginPercent >= 100) return null;
  return cost / (1 - marginPercent / 100);
}

/** The real selling price needed to hold a given real Markup against
 * a given real cost. */
export function priceForTargetMarkup(cost: number, markupPercent: number): number {
  return cost * (1 + markupPercent / 100);
}

/** The real, actual Margin a given cost and selling price genuinely
 * produce right now. */
export function actualMargin(cost: number, sellingPrice: number): number | null {
  if (sellingPrice <= 0) return null;
  return ((sellingPrice - cost) / sellingPrice) * 100;
}

/** The real, actual Markup a given cost and selling price genuinely
 * produce right now. */
export function actualMarkup(cost: number, sellingPrice: number): number | null {
  if (cost <= 0) return null;
  return ((sellingPrice - cost) / cost) * 100;
}
