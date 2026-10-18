"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPartTargetMarginSetEmail = renderPartTargetMarginSetEmail;
const layout_1 = require("./layout");
const pct = (v) => `${v.toFixed(1)}%`;
function renderPartTargetMarginSetEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`${o.setByName} set a new target ${o.enteredAs === 'MARGIN' ? 'margin' : 'markup'} of ${pct(o.enteredValue)} on ${o.partName}. Every goods receipt for this part is now compared against it.`)}
    ${(0, layout_1.details)([
        ['Part', o.partName],
        ['Previous target margin', o.previousTargetMarginPercent !== null ? pct(o.previousTargetMarginPercent) : 'Not set'],
        ['New target margin', pct(o.newTargetMarginPercent)],
        ['Same target as markup', pct(o.newTargetMarkupPercent)],
        ['Set by', o.setByName],
    ])}
    ${(0, layout_1.para)('Margin is profit as a share of the selling price; markup is profit as a share of cost. They describe the same profit.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: `Target margin for ${o.partName} is now ${pct(o.newTargetMarginPercent)}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: 'Pricing', tone: 'info' },
        heading: `Target pricing updated for ${o.partName}`,
        bodyHtml,
        ctaLabel: 'View part',
        ctaUrl: o.partUrl,
        audience: 'staff',
    });
}
