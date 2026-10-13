import { renderEmailLayout, html, greeting, para, details, highlight, strong } from './layout';
import { ordinal } from '../utils/ordinal';

export type CustomerWarrantyExpiryEmailOptions = {
  customerName: string;
  warrantyNumber: string;
  subject: string;
  endsOn: string;
  distanceEnd: string | null;
  daysLeft: number;
  reminderNumber: number;
  isFinal: boolean;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCustomerWarrantyExpiryEmail(o: CustomerWarrantyExpiryEmailOptions): string {
  const days = `${o.daysLeft} ${o.daysLeft === 1 ? 'day' : 'days'} left`;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(html`Your warranty ${strong(o.warrantyNumber)} for ${o.subject} ends soon.`)}
    ${highlight('Warranty ends', o.endsOn, o.distanceEnd ? `or at ${o.distanceEnd}, whichever comes first. ${days}.` : `${days}.`, o.isFinal ? 'danger' : 'warning')}
    ${para(html`If you have noticed anything unusual, now is the time to have it looked at. We recommend a ${strong('final warranty check')} before the end date, so anything that qualifies can still be handled under the warranty.`)}
    ${details([
      ['Warranty', o.warrantyNumber],
      ['Covers', o.subject],
      ['Reminder', `${ordinal(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${para('A check does not by itself mean a repair will be covered; that depends on the warranty terms. Contact the branch to book a check.', 'small')}`;
  return renderEmailLayout({
    previewText: `Warranty ${o.warrantyNumber} ends on ${o.endsOn}. Book a final check before then.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: o.isFinal ? 'Ends in a few days' : 'Ending soon', tone: o.isFinal ? 'danger' : 'warning' },
    heading: o.isFinal ? 'Your warranty ends in a few days' : 'Your warranty ends soon',
    bodyHtml,
    audience: 'customer',
  });
}
