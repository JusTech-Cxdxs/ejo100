import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerWarrantyExpiryEmailOptions = {
  customerName: string;
  warrantyNumber: string;
  subject: string;
  endsOn: string;
  distanceEnd: string | null;
  daysLeft: number;
  reminderNumber: number;
  isFinal: boolean;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

/** "Your warranty ends soon" — numbered, no staff names, and an honest
 * invitation to a final warranty health check while repairs are still
 * covered (the check itself doesn't guarantee coverage). */
export function renderCustomerWarrantyExpiryEmail(o: CustomerWarrantyExpiryEmailOptions): string {
  const bodyHtml = `
    <p style="margin: 0 0 14px 0; display: inline-block; padding: 4px 10px; border-radius: 999px; background-color: #EEF2FF; color: #3730A3; font-size: 12px; font-weight: bold;">This is our ${ordinal(o.reminderNumber)} reminder about this warranty</p>
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.customerName)},</p>
    <p style="margin: 0 0 16px 0;">Your warranty <strong>${escapeHtml(o.warrantyNumber)}</strong> for ${escapeHtml(o.subject)} is coming to an end.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 16px 0; background-color: ${o.isFinal ? '#FEF2F2' : '#FFFBEB'}; border: 2px solid ${o.isFinal ? '#FECACA' : '#FDE68A'}; border-radius: 12px;">
      <tr><td style="padding: 16px 18px;">
        <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569;">Warranty ends</p>
        <p style="margin: 2px 0 0 0; font-size: 24px; font-weight: 800; color: ${o.isFinal ? '#DC2626' : '#B45309'};">${escapeHtml(o.endsOn)}</p>
        ${o.distanceEnd ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;">or at ${escapeHtml(o.distanceEnd)}, whichever comes first</p>` : ''}
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #475569;">${o.daysLeft} ${o.daysLeft === 1 ? 'day' : 'days'} to go</p>
      </td></tr>
    </table>
    <p style="margin: 0 0 12px 0;">If you have noticed anything unusual, now is the time to have it checked — we recommend a <strong>final warranty health check</strong> before the warranty ends, so anything that qualifies can still be handled under warranty.</p>
    <p style="margin: 0; font-size: 12px; color: #64748B;">A health check does not by itself guarantee that a repair will be covered; coverage depends on the warranty terms.</p>
  `;
  return renderEmailLayout({
    previewText: `Your warranty ${o.warrantyNumber} ends on ${o.endsOn}.`,
    companyName: o.companyName,
    orgContext: [o.companyName, o.branchName],
    iconGlyph: '⏳',
    iconTone: 'neutral',
    heading: o.isFinal ? 'Your warranty ends in a few days' : 'Your warranty ends soon',
    bodyHtml,
    logoUrl: o.logoUrl,
  });
}
