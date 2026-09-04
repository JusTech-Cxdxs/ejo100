import { renderEmailLayout, escapeHtml } from './layout';

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

/**
 * Deliberately sent to every Store Officer/Manager, not just logged
 * quietly — a Goods Receipt is a real, permanent financial record,
 * and every edit to one should be genuinely visible to the whole
 * team, not something only discovered later by reading an audit
 * trail nobody thought to check.
 */
export function renderGoodsReceiptEditedEmail(opts: GoodsReceiptEditedEmailOptions): string {
  const { recipientName, editedByName, referenceNumber, changeSummary, goodsReceiptUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(editedByName)} just edited Goods Receipt ${escapeHtml(referenceNumber)}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">What changed</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(changeSummary)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `${editedByName} edited Goods Receipt ${referenceNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Goods Receipt edited',
    bodyHtml,
    ctaLabel: 'View Goods Receipts',
    ctaUrl: goodsReceiptUrl,
    logoUrl,
  });
}
