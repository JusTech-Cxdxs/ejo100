"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPROVAL_AREAS = void 0;
exports.approvalArea = approvalArea;
exports.isApproval = isApproval;
const PREFIXES = [
    ['service-cancel-', 'Workshop'],
    ['service-close-', 'Workshop'],
    ['service-review-', 'Workshop'],
    ['cancel-', 'Workshop'],
    ['close-', 'Workshop'],
    ['review-', 'Workshop'],
    ['est-sub-', 'Workshop'],
    ['sest-sub-', 'Workshop'],
    ['est-mgr-', 'Workshop'],
    ['sest-mgr-', 'Workshop'],
    ['prs-hod-', 'Store'],
    ['prs-store-', 'Store'],
    ['epr-fin-', 'Money'],
    ['epr-mgr-', 'Money'],
    ['warranty-verify-', 'Warranty'],
    ['policy-delete-', 'Warranty'],
    ['provider-delete-', 'Warranty'],
    ['exitpass-', 'Security'],
    ['roadtest-', 'Security'],
    ['ctr-d-', 'Security'],
    // Zinox edition
    ['quote-discount-', 'Sales'],
    ['sales-return-', 'Sales'],
    ['credit-sale-', 'Sales'],
    ['payment-confirm-', 'Money'],
    ['requisition-approve-', 'Procurement'],
    ['po-approve-', 'Procurement'],
    ['build-release-', 'Production'],
    ['unit-qa-', 'Production'],
    ['rework-approve-', 'Production'],
    ['transfer-approve-', 'Warehouse'],
    ['adjustment-approve-', 'Warehouse'],
    ['service-claim-', 'Warranty'],
];
/** The area of an approval item, or null when the item is not a decision. */
function approvalArea(item) {
    // Warranty claims share one prefix for "approve", "submit" and "deadline close".
    if (item.id.startsWith('warranty-claim-'))
        return item.title.startsWith('Approve') ? 'Warranty' : null;
    for (const [prefix, area] of PREFIXES)
        if (item.id.startsWith(prefix))
            return area;
    return null;
}
function isApproval(item) {
    return approvalArea(item) !== null;
}
exports.APPROVAL_AREAS = ['Workshop', 'Store', 'Money', 'Warranty', 'Security', 'Sales', 'Procurement', 'Production', 'Warehouse'];
