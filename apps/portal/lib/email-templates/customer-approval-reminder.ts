import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';
import { ordinal } from '../utils/ordinal';

export type CustomerApprovalReminderEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  totalEstimate: string;
  minimumDepositAmount: string;
  /** The deposit as a percentage of the total, e.g. 70. */
  depositPercent?: number;
  dueDate: string;
  reminderNumber: number;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The estimate was sent but no deposit has arrived yet. */
export function renderCustomerApprovalReminderEmail(o: CustomerApprovalReminderEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`The estimate for your ${o.vehicleDescription} is still waiting for your go-ahead. Work starts as soon as the deposit is received, so paying early means your vehicle is ready sooner.`)}
    ${highlight('Please pay by', o.dueDate, 'If something is holding you up, contact the branch and we will work it out with you.', 'warning')}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Estimate total', o.totalEstimate],
      [o.depositPercent ? `Deposit to start (${o.depositPercent}%)` : 'Deposit to start', o.minimumDepositAmount],
      ['Reminder', `${ordinal(Math.max(1, o.reminderNumber))} reminder`],
    ])}
    ${para('The bank details and payment reference are in the estimate email we sent you, and in your customer portal.', 'small')}`;
  return renderEmailLayout({
    previewText: `Your estimate for Job Card ${o.jobNumber} is waiting. Please pay the deposit by ${o.dueDate}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Action needed', tone: 'warning' },
    heading: 'Your estimate is waiting for you',
    bodyHtml,
    ctaLabel: 'View estimate',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
