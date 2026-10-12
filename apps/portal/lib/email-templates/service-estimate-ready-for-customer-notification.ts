import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServiceEstimateReadyForCustomerNotificationEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  approvedByManagerName: string;
  totalAmount: string;
  vehicleServiceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderServiceEstimateReadyForCustomerNotificationEmail(o: ServiceEstimateReadyForCustomerNotificationEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.approvedByManagerName} approved the estimate on Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please give it a final check, then send it to the customer from the Vehicle Service.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Approved by', o.approvedByManagerName],
      ['Estimate total', o.totalAmount],
    ])}
    ${para('The customer receives the estimate, the deposit due and the payment details by email once you notify them.', 'small')}`;
  return renderEmailLayout({
    previewText: `The estimate on ${o.serviceNumber} is approved and ready to send to ${o.customerName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Ready for the customer', tone: 'success' },
    heading: `Estimate for ${o.serviceNumber} approved by the manager`,
    bodyHtml,
    ctaLabel: 'Review and notify customer',
    ctaUrl: o.vehicleServiceUrl,
    audience: 'staff',
  });
}
