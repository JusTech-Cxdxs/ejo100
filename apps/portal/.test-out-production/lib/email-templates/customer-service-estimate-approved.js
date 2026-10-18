"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCustomerServiceEstimateApprovedEmail = renderCustomerServiceEstimateApprovedEmail;
const customer_estimate_approved_1 = require("./customer-estimate-approved");
/** The Vehicle Service estimate as the customer sees it (same layout as the Job Card estimate). */
function renderCustomerServiceEstimateApprovedEmail(o) {
    const { serviceNumber, ...rest } = o;
    return (0, customer_estimate_approved_1.renderCustomerEstimate)({ ...rest, recordLabel: 'Vehicle Service', recordNumber: serviceNumber });
}
