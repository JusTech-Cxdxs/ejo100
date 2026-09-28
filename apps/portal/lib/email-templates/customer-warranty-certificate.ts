import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerWarrantyCertificateEmailOptions = {
  customerName: string;
  warrantyNumber: string;
  subject: string;
  providerName: string;
  validFrom: string;
  validUntil: string;
  covered: string[];
  notCovered: string[];
  conditions: string[];
  isSample: boolean;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

function list(title: string, items: string[]): string {
  if (items.length === 0) return '';
  return `<p style="margin: 14px 0 4px 0; font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(title)}</p>
  <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #0F172A;">${items.map((i) => `<li style="margin: 2px 0;">${escapeHtml(i)}</li>`).join('')}</ol>`;
}

/** The customer's warranty certificate by email — the number to quote,
 * what is covered and until when, and the conditions to keep. No staff
 * names (who sent it is on the internal audit trail). */
export function renderCustomerWarrantyCertificateEmail(o: CustomerWarrantyCertificateEmailOptions): string {
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.customerName)},</p>
    <p style="margin: 0 0 16px 0;">Here is your warranty certificate. Please keep this email and quote your warranty number whenever you contact us about it.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 12px 0; background-color: #F0FDF4; border: 2px solid #BBF7D0; border-radius: 12px;">
      <tr><td style="padding: 16px 18px;">
        <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #166534;">Warranty number</p>
        <p style="margin: 2px 0 10px 0; font-size: 24px; font-weight: 800; color: #166534;">${escapeHtml(o.warrantyNumber)}</p>
        <p style="margin: 0; font-size: 14px; color: #0F172A;"><strong>Covers:</strong> ${escapeHtml(o.subject)}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #0F172A;"><strong>Valid:</strong> ${escapeHtml(o.validFrom)} to ${escapeHtml(o.validUntil)}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #0F172A;"><strong>Provided by:</strong> ${escapeHtml(o.providerName)}</p>
      </td></tr>
    </table>
    ${list('What is covered', o.covered)}
    ${list('Not covered', o.notCovered)}
    ${list('To keep your warranty valid', o.conditions)}
    ${o.isSample ? '<p style="margin: 16px 0 0 0; font-size: 12px; color: #92400E;">These are sample terms for demonstration only.</p>' : ''}
  `;
  return renderEmailLayout({
    previewText: `Your warranty certificate ${o.warrantyNumber}.`,
    companyName: o.companyName,
    orgContext: [o.companyName, o.branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your warranty certificate',
    bodyHtml,
    logoUrl: o.logoUrl,
  });
}
