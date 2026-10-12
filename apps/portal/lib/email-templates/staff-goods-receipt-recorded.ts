import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type StaffGoodsReceiptRecordedEmailOptions = {
  /** The person this copy is addressed to, when known. */
  recipientName?: string;
  recordedByName: string;
  referenceNumber: string;
  supplierName: string;
  partName: string;
  quantityLabel: string;
  quantityInBaseUnitLabel: string;
  batchNumber?: string;
  serialNumbers?: string[];
  notes?: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderStaffGoodsReceiptRecordedEmail(o: StaffGoodsReceiptRecordedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.recordedByName} recorded goods receipt ${o.referenceNumber}: ${o.quantityLabel} of ${o.partName} from ${o.supplierName}.`)}
    ${details([
      ['Goods receipt', o.referenceNumber],
      ['Part', o.partName],
      ['Quantity received', o.quantityLabel],
      ['Added to stock', o.quantityInBaseUnitLabel],
      ['Supplier', o.supplierName],
      ['Batch number', o.batchNumber],
      ['Serial numbers', o.serialNumbers?.length ? o.serialNumbers.join(', ') : null],
      ['Recorded by', o.recordedByName],
    ])}
    ${o.notes?.trim() ? callout(o.notes.trim(), 'neutral', 'Notes') : ''}`;
  return renderEmailLayout({
    previewText: `${o.referenceNumber}: ${o.quantityLabel} of ${o.partName} received from ${o.supplierName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Stock received', tone: 'success' },
    heading: `Goods receipt ${o.referenceNumber} recorded`,
    bodyHtml,
    ctaLabel: 'View in Inventory',
    ctaUrl: o.dashboardUrl,
    audience: 'staff',
  });
}
