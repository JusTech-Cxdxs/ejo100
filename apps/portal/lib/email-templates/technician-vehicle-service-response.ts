import { renderEmailLayout, escapeHtml } from './layout';

export type TechnicianVehicleServiceResponseEmailOptions = {
  response: 'ACCEPTED' | 'REJECTED';
  supervisorName: string;
  serviceNumber: string;
  customerName: string;
  technicianName: string;
  rejectionReason?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to the supervisor the moment an assigned Vehicle Service
 * technician accepts or rejects the work — same real "one function,
 * two branches" shape as Job Card's own technician-response-
 * notification.ts, applied to this different real record type.
 */
export function renderTechnicianVehicleServiceResponseEmail(opts: TechnicianVehicleServiceResponseEmailOptions): string {
  const {
    response,
    supervisorName,
    serviceNumber,
    customerName,
    technicianName,
    rejectionReason,
    serviceUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const isAccepted = response === 'ACCEPTED';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(supervisorName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${isAccepted
        ? `${escapeHtml(technicianName)} has accepted the assignment on Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)} and can begin work.`
        : `${escapeHtml(technicianName)} has rejected the assignment on Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)} — it will need to be reassigned.`}
    </p>

    ${!isAccepted && rejectionReason?.trim()
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(rejectionReason.trim())}</p>
        </td>
      </tr>
    </table>
    `
      : ''}
  `;

  return renderEmailLayout({
    previewText: isAccepted
      ? `${technicianName} accepted the assignment on Vehicle Service ${serviceNumber}.`
      : `${technicianName} rejected the assignment on Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: isAccepted ? '✓' : '!',
    iconTone: isAccepted ? 'positive' : 'negative',
    heading: isAccepted ? 'Assignment accepted' : 'Assignment rejected',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
