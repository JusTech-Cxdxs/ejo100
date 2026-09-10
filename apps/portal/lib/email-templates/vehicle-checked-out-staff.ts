import { renderEmailLayout, escapeHtml } from './layout';

export type VehicleCheckedOutStaffEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  collectedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to every real staff party on a Job Card the moment its status
 * genuinely transitions to CHECKED_OUT — the real, physical moment
 * the vehicle leaves, per the schema's own comments. Same broadcast
 * pattern already used for cancellation approval and Job Card
 * closure: creator, supervisor, assigned technician, and every
 * eligible branch Manager, one send each.
 */
export function renderVehicleCheckedOutStaffEmail(opts: VehicleCheckedOutStaffEmailOptions): string {
  const { recipientName, jobNumber, customerName, collectedByName, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      The vehicle on Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} has now been checked out.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Collected By</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(collectedByName)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Job Card ${jobNumber} — vehicle checked out, collected by ${collectedByName}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Vehicle checked out',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
