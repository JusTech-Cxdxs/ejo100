import { renderEmailLayout, html, greeting, para, details, callout, sectionTitle, formatNaira } from './layout';

export type PartSellingPriceSetEmailOptions = {
  recipientName: string;
  setByName: string;
  partName: string;
  baseUnitOfMeasure: string;
  previousSellingPrice: number | null;
  newSellingPrice: number;
  margin: {
    quantityInBaseUnit: number;
    totalBulkCost: number;
    expectedRevenue: number;
    grossProfit: number;
    markupPercent: number | null;
    marginPercent: number | null;
  } | null;
  targetMarginPercent: number | null;
  partUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

const pct = (v: number | null) => (v !== null ? `${v.toFixed(1)}%` : 'Not available');

export function renderPartSellingPriceSetEmail(o: PartSellingPriceSetEmailOptions): string {
  // Flag only a real shortfall: no target set is not a deficit.
  const belowTarget = o.targetMarginPercent !== null && o.margin?.marginPercent != null && o.margin.marginPercent < o.targetMarginPercent;
  const unit = o.baseUnitOfMeasure;
  const change = o.previousSellingPrice === null
    ? `set the selling price of ${o.partName} to ${formatNaira(o.newSellingPrice)} per ${unit}`
    : `changed the selling price of ${o.partName} from ${formatNaira(o.previousSellingPrice)} to ${formatNaira(o.newSellingPrice)} per ${unit}`;
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.setByName} ${change}.`)}
    ${belowTarget ? callout(`At this price the margin is ${pct(o.margin?.marginPercent ?? null)}, below the target of ${pct(o.targetMarginPercent)}.`, 'warning', 'Below target margin') : ''}
    ${details([
      ['Part', o.partName],
      ['Previous price', o.previousSellingPrice !== null ? `${formatNaira(o.previousSellingPrice)} per ${unit}` : 'Not set'],
      ['New price', `${formatNaira(o.newSellingPrice)} per ${unit}`],
      ['Changed by', o.setByName],
    ])}
    ${o.margin ? html`
      ${sectionTitle('Expected profit on current stock')}
      ${details([
        ['Cost of stock', formatNaira(o.margin.totalBulkCost)],
        ['Expected revenue', formatNaira(o.margin.expectedRevenue)],
        ['Expected gross profit', formatNaira(o.margin.grossProfit)],
        ['Margin (of price)', pct(o.margin.marginPercent)],
        ['Markup (of cost)', pct(o.margin.markupPercent)],
        ['Target margin', o.targetMarginPercent !== null ? pct(o.targetMarginPercent) : null],
      ])}
      ${para('A projection from the new selling price and the most recent delivery cost, not actual sales.', 'small')}` : ''}`;
  return renderEmailLayout({
    previewText: `${o.setByName} ${change}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: belowTarget ? { label: 'Below target', tone: 'warning' } : { label: 'Pricing', tone: 'info' },
    heading: `Selling price updated for ${o.partName}`,
    bodyHtml,
    ctaLabel: 'View part',
    ctaUrl: o.partUrl,
    audience: 'staff',
  });
}
