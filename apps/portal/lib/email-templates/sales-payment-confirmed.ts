import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';

export type SalesPaymentConfirmedEmailOptions = {
  customerName: string;
  orderNumber: string;
  amountConfirmed: string;
  method: string;
  reference?: string | null;
  totalPaidSoFar: string;
  orderTotal: string;
  /** Null or empty when the order is now paid in full. */
  balanceRemaining?: string | null;
  portalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName?: string | null;
};

/** Finance confirmed a payment: a receipt-style note, and what happens next. */
export function renderSalesPaymentConfirmedEmail(o: SalesPaymentConfirmedEmailOptions): { subject: string; html: string } {
  const paidInFull = !o.balanceRemaining;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Thank you. We have confirmed your payment towards sales order ${o.orderNumber}.`)}
    ${highlight('Payment confirmed', o.amountConfirmed, paidInFull ? 'This order is now paid in full and will be prepared for release.' : `Balance still due: ${o.balanceRemaining}`, 'success')}
    ${details([
      ['Sales order', o.orderNumber],
      ['Paid by', o.method],
      ['Reference', o.reference ?? null],
      ['Order total', o.orderTotal],
      ['Paid so far', o.totalPaidSoFar],
      ['Balance due', paidInFull ? 'None (paid in full)' : o.balanceRemaining ?? null],
    ])}
    ${para(paidInFull ? 'The warehouse will pick your units and you will hear from us when they are dispatched. Your tax invoice follows delivery.' : 'Your goods are released once the order is paid in full.', 'small')}`;
  return {
    subject: `Payment confirmed — ${o.orderNumber}`,
    html: renderEmailLayout({
      previewText: `Payment of ${o.amountConfirmed} confirmed for order ${o.orderNumber}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.branchName],
      status: { label: paidInFull ? 'Paid in full' : 'Payment confirmed', tone: 'success' },
      heading: 'Payment confirmed',
      bodyHtml,
      ctaLabel: 'View the order',
      ctaUrl: o.portalUrl,
      audience: 'customer',
    }),
  };
}
