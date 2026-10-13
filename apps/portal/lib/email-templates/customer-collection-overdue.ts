import { renderEmailLayout, html, greeting, para, details } from './layout';
import { ordinal } from '../utils/ordinal';

export type CustomerCollectionOverdueEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  /** e.g. "5 days" */
  daysSinceCancellationLabel: string;
  reminderNumber: number;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** A cancelled Job Card whose vehicle is still at the branch. */
export function renderCustomerCollectionOverdueEmail(o: CustomerCollectionOverdueEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Job Card ${o.jobNumber} for your ${o.vehicleDescription} was cancelled ${o.daysSinceCancellationLabel} ago, and the vehicle is still with us at ${o.branchName || 'the branch'}. Please arrange to collect it as soon as you can.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Cancelled', `${o.daysSinceCancellationLabel} ago`],
      ['Reminder', `${ordinal(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${para('If you need a different arrangement, please contact the branch and we will work it out with you.')}`;
  return renderEmailLayout({
    previewText: `Your ${o.vehicleDescription} is still at the branch. Please arrange collection.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Collection needed', tone: 'warning' },
    heading: 'Please collect your vehicle',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
