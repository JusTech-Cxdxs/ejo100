import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServiceEstimateSubmittedEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  submittedByName: string;
  totalAmount: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderServiceEstimateSubmittedEmail(o: ServiceEstimateSubmittedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.submittedByName} has finished the estimate on Vehicle Service ${o.serviceNumber} for ${o.customerName} and sent it to you for approval.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Prepared by', o.submittedByName],
      ['Estimate total', o.totalAmount],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.submittedByName} sent you the estimate on ${o.serviceNumber} (${o.totalAmount}).`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Approval needed', tone: 'warning' },
    heading: `Estimate for ${o.serviceNumber} needs your approval`,
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
