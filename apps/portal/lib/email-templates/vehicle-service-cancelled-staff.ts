import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type VehicleServiceCancelledStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  approvedByName: string;
  reason: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderVehicleServiceCancelledStaffEmail(o: VehicleServiceCancelledStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.approvedByName} approved the cancellation of Vehicle Service ${o.serviceNumber} for ${o.customerName}. Stop any work on it; no further work is needed.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Approved by', o.approvedByName],
    ])}
    ${o.reason?.trim() ? callout(o.reason.trim(), 'neutral', 'Reason') : ''}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber} for ${o.customerName} is cancelled.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Cancelled', tone: 'danger' },
    heading: `Vehicle Service ${o.serviceNumber} cancelled`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
