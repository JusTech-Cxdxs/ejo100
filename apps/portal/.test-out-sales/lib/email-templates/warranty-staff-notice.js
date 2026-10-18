"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderWarrantyStaffNoticeEmail = renderWarrantyStaffNoticeEmail;
const layout_1 = require("./layout");
/**
 * The general staff notice: one heading, the facts as short lines, and a link
 * to the record. Used for warranty, security, scheduling and broadcast notices.
 * Staff only; never sent to customers.
 */
function renderWarrantyStaffNoticeEmail(o) {
    const lines = o.lines.map((l) => (l ?? '').trim()).filter(Boolean);
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${lines.map((l) => (0, layout_1.para)(l))}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: lines[0] ?? o.heading,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: o.statusLabel ? { label: o.statusLabel, tone: o.statusTone ?? 'info' } : undefined,
        heading: o.heading,
        bodyHtml,
        ctaLabel: o.actionLabel ?? 'Open in EJO 100',
        ctaUrl: o.actionUrl,
        audience: 'staff',
    });
}
