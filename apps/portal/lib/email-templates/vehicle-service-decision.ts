import { renderEmailLayout, escapeHtml } from './layout';

export type VehicleServiceDecisionEmailOptions = {
  decision: 'APPROVED' | 'REJECTED';
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  approverName: string;
  rejectionReason?: string;
  notes?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to whoever opened a Vehicle Service the moment their
 * supervisor approves or rejects it — one function, not two, same
 * real reasoning as Job Card's own decision email: only the heading,
 * icon, and body content genuinely differ between the two outcomes.
 */
export function renderVehicleServiceDecisionEmail(opts: VehicleServiceDecisionEmailOptions): string {
  const {
    decision,
    recipientName,
    serviceNumber,
    customerName,
    approverName,
    rejectionReason,
    notes,
    serviceUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const isApproved = decision === 'APPROVED';

  const detailsHtml = isApproved
    ? `
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Approved by</p>
      <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(approverName)}</p>
    `
    : `
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Rejected by</p>
      <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(approverName)}</p>
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
      <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(rejectionReason ?? '')}</p>
    `;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${isApproved
        ? `Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)} has been approved and can now proceed.`
        : `Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)} has been rejected.`}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          ${detailsHtml}
        </td>
      </tr>
    </table>

    ${notes?.trim() ? `<p style="margin: 0 0 16px 0;"><strong>Additional notes:</strong> ${escapeHtml(notes.trim())}</p>` : ''}
    ${!isApproved ? '<p style="margin: 0;">Please review the reason above and take the appropriate next step.</p>' : ''}
  `;

  return renderEmailLayout({
    previewText: isApproved
      ? `Vehicle Service ${serviceNumber} was approved.`
      : `Vehicle Service ${serviceNumber} was rejected.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: isApproved ? '✓' : '!',
    iconTone: isApproved ? 'positive' : 'negative',
    heading: isApproved ? 'Vehicle Service approved' : 'Vehicle Service rejected',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
