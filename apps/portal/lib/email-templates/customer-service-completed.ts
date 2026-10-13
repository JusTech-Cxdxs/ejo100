import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';

export type CustomerServiceCompletedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  nextServiceDueMileage: string | null;
  nextServiceDueDate: string | null;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The routine service is done; collection details follow in a separate email. */
export function renderCustomerServiceCompletedEmail(o: CustomerServiceCompletedEmailOptions): string {
  const due = [o.nextServiceDueMileage ? `at ${o.nextServiceDueMileage}` : null, o.nextServiceDueDate ? `by ${o.nextServiceDueDate}` : null].filter(Boolean).join(' or ');
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`The service on your ${o.vehicleDescription} is complete. We are preparing it for collection and will email you shortly with the collection details.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Service complete'],
    ])}
    ${due ? highlight('Next service due', due, o.nextServiceDueMileage && o.nextServiceDueDate ? 'Whichever comes first. We will remind you as it gets close.' : 'We will remind you as it gets close.', 'success') : ''}`;
  return renderEmailLayout({
    previewText: `The service on your ${o.vehicleDescription} is complete.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Service complete', tone: 'success' },
    heading: 'Your vehicle service is complete',
    bodyHtml,
    ctaLabel: 'Follow progress',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
