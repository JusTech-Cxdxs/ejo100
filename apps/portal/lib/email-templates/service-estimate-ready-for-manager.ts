import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServiceEstimateReadyForManagerEmailOptions = {
  managerName: string;
  serviceNumber: string;
  customerName: string;
  approvedByName: string;
  totalAmount: string;
  vehicleServiceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The supervisor validated the estimate; the manager approves it before the customer sees it. */
export function renderServiceEstimateReadyForManagerEmail(o: ServiceEstimateReadyForManagerEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.managerName)}
    ${para(`${o.approvedByName} has validated the estimate on Vehicle Service ${o.serviceNumber} for ${o.customerName}. It needs your approval before the customer can be told.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Validated by', o.approvedByName],
      ['Estimate total', o.totalAmount],
    ])}`;
  return renderEmailLayout({
    previewText: `Estimate of ${o.totalAmount} on Vehicle Service ${o.serviceNumber} is waiting for your approval.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Approval needed', tone: 'warning' },
    heading: `Estimate for ${o.serviceNumber} needs your approval`,
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: o.vehicleServiceUrl,
    audience: 'staff',
  });
}
