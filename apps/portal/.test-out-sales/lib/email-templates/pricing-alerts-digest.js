"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPricingAlertsDigestEmail = renderPricingAlertsDigestEmail;
const layout_1 = require("./layout");
const GROUPS = [
    { severity: 'CRITICAL_LOSS', label: 'Selling below cost' },
    { severity: 'DEFICIT', label: 'Below target margin' },
    { severity: 'BOOST', label: 'Above target margin' },
];
/** The daily summary of pricing alerts that are still open at a branch. */
function renderPricingAlertsDigestEmail(o) {
    const critical = o.items.filter((i) => i.severity === 'CRITICAL_LOSS').length;
    const groups = GROUPS.map((g) => ({ ...g, items: o.items.filter((i) => i.severity === g.severity) })).filter((g) => g.items.length);
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${(0, layout_1.plural)(o.items.length, 'pricing alert')} ${o.items.length === 1 ? 'is' : 'are'} still open at ${o.branchName || 'your branch'} today.${critical ? ` ${(0, layout_1.plural)(critical, 'part is', 'parts are')} selling below cost.` : ''}`)}
    ${groups.map((g) => (0, layout_1.html) `
      ${(0, layout_1.sectionTitle)(`${g.label} (${g.items.length})`)}
      ${(0, layout_1.moneyTable)(g.items.map((i) => ({
        label: (0, layout_1.link)(i.partName, i.partUrl),
        meta: `Cost ${i.newUnitCost} · Price ${i.sellingPrice}`,
        amount: `${i.actualMarginPercent}% (target ${i.targetMarginPercent}%)`,
    })), [])}`)}
    ${(0, layout_1.para)('This summary lists only alerts that are still open, not every alert raised.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `${(0, layout_1.plural)(o.items.length, 'pricing alert')} open at ${o.branchName}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: critical ? { label: 'Selling below cost', tone: 'danger' } : { label: 'Daily summary', tone: 'warning' },
        heading: 'Open pricing alerts',
        bodyHtml,
        ctaLabel: 'Open Pricing Command Center',
        ctaUrl: o.dashboardUrl,
        audience: 'staff',
    });
}
