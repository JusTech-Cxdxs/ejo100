import { renderEmailLayout, html, greeting, para, details, list, sectionTitle, callout } from './layout';

export type CustomerJobCardAcknowledgmentEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  complaints: string[];
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
  /** Set when a routine Vehicle Service turned into this repair Job Card. */
  escalatedFromServiceNumber?: string;
};

/** The customer's confirmation that the vehicle has been checked in (or that a service became a repair job). */
export function renderCustomerJobCardAcknowledgmentEmail(o: CustomerJobCardAcknowledgmentEmailOptions): string {
  const team = o.departmentName ? `our ${o.departmentName} team` : 'our team';
  const escalated = Boolean(o.escalatedFromServiceNumber);
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${escalated
      ? para(`During the routine service on your ${o.vehicleDescription} (Vehicle Service ${o.escalatedFromServiceNumber}), we found work that goes beyond routine maintenance. Your visit now continues as repair Job Card ${o.jobNumber}.`)
      : para(`Thank you for bringing your ${o.vehicleDescription} to ${o.companyName}. We have checked it in at ${o.branchName || 'the branch'}, and ${team} will start the inspection shortly.`)}
    ${escalated ? callout(`Your vehicle stays with us. ${team.charAt(0).toUpperCase()}${team.slice(1)} will prepare an estimate, and no repair work goes ahead until you have approved it.`, 'info') : ''}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Branch', o.branchName],
    ])}
    ${sectionTitle('What you told us')}
    ${o.complaints.length ? list(o.complaints, true) : para('No specific concerns recorded.', 'small')}
    ${para('We will email you at each step: when the estimate is ready, when work starts and when your vehicle is ready to collect.', 'small')}`;
  return renderEmailLayout({
    previewText: escalated
      ? `Your service continues as repair Job Card ${o.jobNumber}. Nothing is done without your approval.`
      : `Your ${o.vehicleDescription} is checked in under Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: escalated ? { label: 'Update', tone: 'info' } : { label: 'Checked in', tone: 'success' },
    heading: escalated ? 'Your service now continues as a repair job' : 'We have received your vehicle',
    bodyHtml,
    ctaLabel: 'Follow progress',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
