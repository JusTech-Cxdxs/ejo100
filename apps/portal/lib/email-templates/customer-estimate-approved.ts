import { renderEmailLayout, html, greeting, para, details, moneyTable, highlight, sectionTitle, strong, vehicleLabel, type MoneyTotal } from './layout';
import { pluralizeWord } from '../utils/pluralize';

export type CustomerEstimateApprovedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  plateNumber?: string | null;
  lineItems: { description: string; quantity: number; unitOfMeasure?: string | null; amount: string }[];
  /** Parts and work of every kind in one figure. Omitted when zero. */
  servicesSubtotal?: string;
  labourSubtotal?: string;
  sundrySubtotal?: string;
  totalAmount: string;
  minimumDepositAmount: string;
  /** The deposit as a percentage of the total, e.g. 70. */
  depositPercent?: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** A payment reference that lets the cashier match the transfer to this Job Card. */
  paymentRemarkSuggestion: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The estimate as the customer sees it. Internal line types (store part,
 * external job and so on) never appear: lines are listed by description and
 * grouped into three plain subtotals. Payment is by bank transfer or at the
 * cashier, since no payment gateway is connected.
 */
export function renderCustomerEstimateApprovedEmail(o: CustomerEstimateApprovedEmailOptions): string {
  return renderCustomerEstimate({ ...o, recordLabel: 'Job Card', recordNumber: o.jobNumber });
}

/** Shared by the Job Card and Vehicle Service estimate emails. */
export function renderCustomerEstimate(o: Omit<CustomerEstimateApprovedEmailOptions, 'jobNumber'> & { recordLabel: string; recordNumber: string }): string {
  const vehicle = vehicleLabel(o.vehicleDescription, o.plateNumber);
  const totals: MoneyTotal[] = [
    o.servicesSubtotal ? { label: 'Parts and services', amount: o.servicesSubtotal } : null,
    o.labourSubtotal ? { label: 'Labour', amount: o.labourSubtotal } : null,
    o.sundrySubtotal ? { label: 'Sundries', amount: o.sundrySubtotal } : null,
    { label: 'Total', amount: o.totalAmount, emphasis: true },
  ].filter((t): t is MoneyTotal => Boolean(t));
  const depositCaption = o.depositPercent ? `Deposit to start work (${o.depositPercent}%)` : 'Deposit to start work';

  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(html`The estimate for your ${vehicle} is ready for you to review. Work starts as soon as we have received the deposit shown below.`)}
    ${details([
      [o.recordLabel, o.recordNumber],
      ['Vehicle', vehicle],
      ['Branch', o.branchName],
    ])}
    ${sectionTitle('Estimate')}
    ${o.lineItems.length
      ? moneyTable(o.lineItems.map((li) => ({
          label: li.description,
          meta: `Quantity ${li.quantity}${li.unitOfMeasure ? ` ${pluralizeWord(li.quantity, li.unitOfMeasure)}` : ''}`,
          amount: li.amount,
        })), totals)
      : moneyTable([], totals)}
    ${highlight(depositCaption, o.minimumDepositAmount, 'Pay this amount or more to start the work. The balance is due before collection.', 'warning')}
    ${sectionTitle('How to pay')}
    ${para(html`${strong('Bank transfer.')} Use the payment reference below so we can match your payment to this ${o.recordLabel}.`)}
    ${details([
      ['Bank', o.bankName],
      ['Account name', o.accountName],
      ['Account number', o.accountNumber],
      ['Payment reference', o.paymentRemarkSuggestion],
    ])}
    ${para(html`${strong('At the branch.')} Pay the cashier at ${o.branchName || 'the branch'}; they will record the payment while you wait.`)}
    ${para('Once a transfer is made, it can take a short while for the branch to confirm it. You will receive an email as soon as your payment is recorded.', 'small')}`;

  return renderEmailLayout({
    previewText: `Estimate total ${o.totalAmount}. Deposit of ${o.minimumDepositAmount} to start work on your ${vehicle}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Action needed', tone: 'warning' },
    heading: 'Your estimate is ready',
    bodyHtml,
    ctaLabel: 'View estimate',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
