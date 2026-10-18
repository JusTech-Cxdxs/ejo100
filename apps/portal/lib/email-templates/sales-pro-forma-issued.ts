import { renderEmailLayout, html, greeting, para, details, callout, moneyTable, type MoneyLine } from './layout';

export type SalesProFormaIssuedEmailOptions = {
  customerName: string;
  proFormaNumber: string;
  orderNumber: string;
  issuedOn: string;
  dueOn?: string | null;
  lines: { description: string; quantity: number; amount: string }[];
  subtotal: string;
  discountTotal?: string | null;
  taxTotal: string;
  total: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** The customer portal page for this order. */
  portalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName?: string | null;
};

/** The customer's pro-forma invoice: what to pay, where to pay it, and by when. */
export function renderSalesProFormaIssuedEmail(o: SalesProFormaIssuedEmailOptions): { subject: string; html: string } {
  const lines: MoneyLine[] = o.lines.map((l) => ({ label: l.description, meta: `${l.quantity} ${l.quantity === 1 ? 'unit' : 'units'}`, amount: l.amount }));
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Please find below pro-forma invoice ${o.proFormaNumber} for sales order ${o.orderNumber}. Your goods are released once Finance confirms the payment.`)}
    ${moneyTable(lines, [
      { label: 'Goods', amount: o.subtotal },
      ...(o.discountTotal ? [{ label: 'Discount', amount: `- ${o.discountTotal}` }] : []),
      { label: 'VAT (7.5%)', amount: o.taxTotal },
      { label: 'Amount to pay', amount: o.total, emphasis: true },
    ])}
    ${details([
      ['Pro-forma invoice', o.proFormaNumber],
      ['Sales order', o.orderNumber],
      ['Issued', o.issuedOn],
      ['Pay by', o.dueOn ?? null],
    ])}
    ${callout(html`Bank: ${o.bankName}<br />Account name: ${o.accountName}<br />Account number: ${o.accountNumber}<br />Reference: ${o.proFormaNumber}`, 'info', 'Where to pay')}
    ${para('Quote the pro-forma number as your payment reference, then upload or send us the proof of payment. Prices are valid until the pay-by date.', 'small')}`;
  return {
    subject: `Pro-forma invoice ${o.proFormaNumber} — ${o.total} to pay`,
    html: renderEmailLayout({
      previewText: `Pro-forma invoice ${o.proFormaNumber}: ${o.total} to pay for order ${o.orderNumber}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.branchName],
      status: { label: 'Awaiting payment', tone: 'warning' },
      heading: 'Your pro-forma invoice',
      bodyHtml,
      ctaLabel: 'View the order',
      ctaUrl: o.portalUrl,
      audience: 'customer',
    }),
  };
}
