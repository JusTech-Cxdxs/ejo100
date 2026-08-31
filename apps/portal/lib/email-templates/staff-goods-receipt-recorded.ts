import { renderEmailLayout, escapeHtml } from './layout';

export type StaffGoodsReceiptRecordedEmailOptions = {
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

/**
 * Internal, staff-facing confirmation — not a customer email. Fires
 * once per goods receipt recorded, to the person who recorded it (a
 * genuine written record of what they just did, the same reasoning
 * every other "recorded" email in this project already follows — e.g.
 * payment-recorded going to Finance even though Finance is the one who
 * just acted) and their Store Manager, so stock arriving into the
 * store is never something a Manager only discovers by checking the
 * catalog themselves.
 */
export function renderStaffGoodsReceiptRecordedEmail(opts: StaffGoodsReceiptRecordedEmailOptions): string {
  const {
    recordedByName,
    referenceNumber,
    supplierName,
    partName,
    quantityLabel,
    quantityInBaseUnitLabel,
    batchNumber,
    serialNumbers,
    notes,
    dashboardUrl,
    logoUrl,
    companyName,
    branchName,
  } = opts;

  const detailRows: string[] = [
    `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Part</p>
     <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(partName)}</p>`,
    `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Quantity Received</p>
     <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(quantityLabel)} (${escapeHtml(quantityInBaseUnitLabel)} added to stock)</p>`,
    `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Supplier</p>
     <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(supplierName)}</p>`,
  ];
  if (batchNumber) {
    detailRows.push(
      `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Batch Number</p>
       <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(batchNumber)}</p>`,
    );
  }
  if (serialNumbers && serialNumbers.length > 0) {
    detailRows.push(
      `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Serial Numbers</p>
       <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(serialNumbers.join(', '))}</p>`,
    );
  }
  if (notes) {
    detailRows.push(
      `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Notes</p>
       <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(notes)}</p>`,
    );
  }

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(recordedByName)} recorded Goods Receipt ${escapeHtml(referenceNumber)}. Details below.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          ${detailRows.join('')}
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Goods receipt ${referenceNumber} recorded — ${partName}, ${quantityLabel}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Goods receipt recorded',
    bodyHtml,
    ctaLabel: 'View in Inventory',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
