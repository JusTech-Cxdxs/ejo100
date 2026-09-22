import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceEstimateNudgeEmailOptions = {
  recipientName: string;
  fromName: string;
  fromRole: 'supervisor' | 'technician';
  serviceNumber: string;
  customerName: string;
  note?: string;
  vehicleServiceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The real Vehicle Service equivalent of Job Card's own
 * estimate-nudge.ts — same real lightweight, repeatable "please take
 * a look" between supervisor and technician while the estimate is
 * still Draft, carrying no status change of its own. One shared
 * template for both directions, same as Job Card's own.
 */
export function renderServiceEstimateNudgeEmail(opts: ServiceEstimateNudgeEmailOptions): string {
  const { recipientName, fromName, fromRole, serviceNumber, customerName, note, vehicleServiceUrl, logoUrl, companyName, branchName } = opts;

  const ask = fromRole === 'supervisor'
    ? 'review the estimate and add or confirm your pricing on the parts/work you sourced'
    : 'check the estimate — review the pricing and figures entered so far';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(fromName)} is asking you to ${ask} on Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}.
    </p>
    ${note?.trim()
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Note</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(note.trim())}</p>
        </td>
      </tr>
    </table>
    `
      : ''}
  `;

  return renderEmailLayout({
    previewText: `${fromName} is asking you to check the estimate on Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'A note on this estimate',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: vehicleServiceUrl,
    logoUrl,
  });
}
