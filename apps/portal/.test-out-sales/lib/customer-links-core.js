"use strict";
/**
 * Links into the customer portal on the public website (pure). Every link a
 * customer gets — in an email, a support reply or from Enyo — is built here,
 * so it always lands on the exact page: the Job Card, the service visit, the
 * warranty, payments, the password pages. A customer who is signed out is
 * taken to sign-in first and then straight on to the page (website middleware).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerLinks = customerLinks;
exports.customerRecordUrl = customerRecordUrl;
const id = (v) => encodeURIComponent(v);
function customerLinks(site) {
    const base = `${site}/customer-portal`;
    return {
        signIn: base,
        forgotPassword: `${base}/forgot-password`,
        dashboard: `${base}/dashboard`,
        services: `${base}/dashboard/services`,
        jobCard: (jobCardId) => `${base}/dashboard/services/jc/${id(jobCardId)}`,
        service: (vehicleServiceId) => `${base}/dashboard/services/vs/${id(vehicleServiceId)}`,
        vehicles: `${base}/dashboard/vehicles`,
        vehicle: (vehicleId) => `${base}/dashboard/vehicles/${id(vehicleId)}`,
        warranties: `${base}/dashboard/warranties`,
        warranty: (warrantyId) => `${base}/dashboard/warranties/${id(warrantyId)}`,
        payments: `${base}/dashboard/payments`,
        profile: `${base}/dashboard/profile`,
        support: `${base}/dashboard/support`,
        notifications: `${base}/dashboard/notifications`,
        /** The public help pages (no sign-in). */
        help: `${site}/support`,
    };
}
/** The page for a Job Card ("JobCard") or a service visit ("VehicleService"). */
function customerRecordUrl(site, entityType, recordId) {
    const l = customerLinks(site);
    return entityType === 'JobCard' ? l.jobCard(recordId) : l.service(recordId);
}
