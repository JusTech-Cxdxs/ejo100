"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPartSellingPriceSetEmail = renderPartSellingPriceSetEmail;
const layout_1 = require("./layout");
const pct = (v) => (v !== null ? `${v.toFixed(1)}%` : 'Not available');
function renderPartSellingPriceSetEmail(o) {
    // Flag only a real shortfall: no target set is not a deficit.
    const belowTarget = o.targetMarginPercent !== null && o.margin?.marginPercent != null && o.margin.marginPercent < o.targetMarginPercent;
    const unit = o.baseUnitOfMeasure;
    const change = o.previousSellingPrice === null
        ? `set the selling price of ${o.partName} to ${(0, layout_1.formatNaira)(o.newSellingPrice)} per ${unit}`
        : `changed the selling price of ${o.partName} from ${(0, layout_1.formatNaira)(o.previousSellingPrice)} to ${(0, layout_1.formatNaira)(o.newSellingPrice)} per ${unit}`;
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.setByName} ${change}.`)}
    ${belowTarget ? (0, layout_1.callout)(`At this price the margin is ${pct(o.margin?.marginPercent ?? null)}, below the target of ${pct(o.targetMarginPercent)}.`, 'warning', 'Below target margin') : ''}
    ${(0, layout_1.details)([
        ['Part', o.partName],
        ['Previous price', o.previousSellingPrice !== null ? `${(0, layout_1.formatNaira)(o.previousSellingPrice)} per ${unit}` : 'Not set'],
        ['New price', `${(0, layout_1.formatNaira)(o.newSellingPrice)} per ${unit}`],
        ['Changed by', o.setByName],
    ])}
    ${o.margin ? (0, layout_1.html) `
      ${(0, layout_1.sectionTitle)('Expected profit on current stock')}
      ${(0, layout_1.details)([
        ['Cost of stock', (0, layout_1.formatNaira)(o.margin.totalBulkCost)],
        ['Expected revenue', (0, layout_1.formatNaira)(o.margin.expectedRevenue)],
        ['Expected gross profit', (0, layout_1.formatNaira)(o.margin.grossProfit)],
        ['Margin (of price)', pct(o.margin.marginPercent)],
        ['Markup (of cost)', pct(o.margin.markupPercent)],
        ['Target margin', o.targetMarginPercent !== null ? pct(o.targetMarginPercent) : null],
    ])}
      ${(0, layout_1.para)('A projection from the new selling price and the most recent delivery cost, not actual sales.', 'small')}` : ''}`;
    return (0, layout_1.renderEmailLayout)({
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
