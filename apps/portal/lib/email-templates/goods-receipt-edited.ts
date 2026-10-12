import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type GoodsReceiptEditedEmailOptions = {
  recipientName: string;
  editedByName: string;
  referenceNumber: string;
  changeSummary: string;
  goodsReceiptUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderGoodsReceiptEditedEmail(o: GoodsReceiptEditedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.editedByName} edited goods receipt ${o.referenceNumber}. Stock and costs have been updated to match.`)}
    ${callout(o.changeSummary, 'warning', 'What changed')}
    ${details([
      ['Goods receipt', o.referenceNumber],
      ['Edited by', o.editedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.editedByName} edited goods receipt ${o.referenceNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Edited', tone: 'warning' },
    heading: `Goods receipt ${o.referenceNumber} edited`,
    bodyHtml,
    ctaLabel: 'View goods receipts',
    ctaUrl: o.goodsReceiptUrl,
    audience: 'staff',
  });
}
