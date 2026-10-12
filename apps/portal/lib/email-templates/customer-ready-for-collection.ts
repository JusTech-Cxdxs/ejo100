import { renderEmailLayout, html, greeting, para, details, highlight, callout } from './layout';
import { ordinal } from '../utils/ordinal';

export type CustomerReadyForCollectionEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dueDate: string;
  /** Set on reminders (1, 2, ...); omitted on the first notice. */
  reminderNumber?: number;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  afterRework?: boolean;
};

export function renderCustomerReadyForCollectionEmail(o: CustomerReadyForCollectionEmailOptions): string {
  const reminder = o.reminderNumber ? `${ordinal(o.reminderNumber)} reminder` : null;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`${reminder ? 'A reminder that your' : 'Your'} ${o.vehicleDescription} is ready for collection at ${o.branchName || 'the branch'}. You can collect it any time from now.`)}
    ${o.afterRework ? callout('The additional work we told you about is complete.', 'success') : ''}
    ${highlight('Please collect by', o.dueDate, 'Storage charges may apply if the vehicle stays with us after this date.', 'warning')}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Reminder', reminder],
    ])}
    ${para('Please make sure any balance is paid before collection, and bring a form of identification. If someone else is collecting for you, let the branch know beforehand.', 'small')}`;
  return renderEmailLayout({
    previewText: `Your ${o.vehicleDescription} is ready. Please collect it by ${o.dueDate}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Ready for collection', tone: 'success' },
    heading: 'Your vehicle is ready for collection',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
