/**
 * Links into the customer portal on the public website (pure). Every link a
 * customer gets — in an email, a support reply or from Enyo — is built here,
 * so it always lands on the exact page: the Job Card, the service visit, the
 * warranty, payments, the password pages. A customer who is signed out is
 * taken to sign-in first and then straight on to the page (website middleware).
 */

const id = (v: string) => encodeURIComponent(v);

export function customerLinks(site: string) {
  const base = `${site}/customer-portal`;
  return {
    signIn: base,
    forgotPassword: `${base}/forgot-password`,
    dashboard: `${base}/dashboard`,
    services: `${base}/dashboard/services`,
    jobCard: (jobCardId: string) => `${base}/dashboard/services/jc/${id(jobCardId)}`,
    service: (vehicleServiceId: string) => `${base}/dashboard/services/vs/${id(vehicleServiceId)}`,
    vehicles: `${base}/dashboard/vehicles`,
    vehicle: (vehicleId: string) => `${base}/dashboard/vehicles/${id(vehicleId)}`,
    warranties: `${base}/dashboard/warranties`,
    warranty: (warrantyId: string) => `${base}/dashboard/warranties/${id(warrantyId)}`,
    payments: `${base}/dashboard/payments`,
    profile: `${base}/dashboard/profile`,
    support: `${base}/dashboard/support`,
    notifications: `${base}/dashboard/notifications`,
    /** The public help pages (no sign-in). */
    help: `${site}/support`,
  };
}

/** The page for a Job Card ("JobCard") or a service visit ("VehicleService"). */
export function customerRecordUrl(site: string, entityType: 'JobCard' | 'VehicleService', recordId: string): string {
  const l = customerLinks(site);
  return entityType === 'JobCard' ? l.jobCard(recordId) : l.service(recordId);
}
