import { renderEmailLayout, escapeHtml } from './layout';

export type WarrantyStaffNoticeEmailOptions = {
  recipientName: string;
  heading: string;
  lines: string[];
  actionUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Internal warranty notices to staff (verifications, policy edits,
 * deletion approvals) — one clear heading, the facts as short lines, and
 * a link straight to the record. Staff-only; never sent to customers.
 */
export function renderWarrantyStaffNoticeEmail(opts: WarrantyStaffNoticeEmailOptions): string {
  const { recipientName, heading, lines, actionUrl, logoUrl, companyName, branchName } = opts;
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    ${lines.map((l) => `<p style="margin: 0 0 8px 0;">${escapeHtml(l)}</p>`).join('')}
  `;
  return renderEmailLayout({
    previewText: heading,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '⛨',
    iconTone: 'neutral',
    heading,
    bodyHtml,
    ctaLabel: 'Open in EJO 100',
    ctaUrl: actionUrl,
    logoUrl,
  });
}
