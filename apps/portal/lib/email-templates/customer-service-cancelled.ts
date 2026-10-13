import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerServiceCancelledEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCustomerServiceCancelledEmail(o: CustomerServiceCancelledEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`As requested, Vehicle Service ${o.serviceNumber} for your ${o.vehicleDescription} has been cancelled. No further work will be carried out under it.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Cancelled'],
    ])}
    ${para('If your vehicle is still with us, please arrange to collect it. If you paid anything towards this service, the branch will contact you about it. Whenever you need us again, we will be glad to help.')}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber} for your ${o.vehicleDescription} has been cancelled.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Cancelled', tone: 'neutral' },
    heading: 'Your vehicle service has been cancelled',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
