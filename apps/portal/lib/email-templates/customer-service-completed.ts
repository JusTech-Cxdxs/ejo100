import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerServiceCompletedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  /** e.g. "57,046 km" — omitted when no km interval is configured. */
  nextServiceDueMileage: string | null;
  /** e.g. "Monday, 22 March 2027" — omitted when no day interval is configured. */
  nextServiceDueDate: string | null;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Fires once, the moment a Vehicle Service genuinely transitions to
 * COMPLETED — the Vehicle Service equivalent of Job Card's own
 * "completed" email, but worded for routine servicing (there is no
 * separate quality-inspection stage here). Like Job Card's, it is
 * deliberately NOT the "come collect your vehicle" call — Ready for
 * Collection is its own, later step. What it adds is the one thing a
 * completed service now always establishes: when the vehicle is next
 * due, counted from this visit.
 */
export function renderCustomerServiceCompletedEmail(opts: CustomerServiceCompletedEmailOptions): string {
  const { customerName, serviceNumber, vehicleDescription, nextServiceDueMileage, nextServiceDueDate, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const dueParts = [nextServiceDueMileage ? `at ${escapeHtml(nextServiceDueMileage)}` : null, nextServiceDueDate ? `by ${escapeHtml(nextServiceDueDate)}` : null].filter(Boolean);
  const nextDueHtml =
    dueParts.length > 0
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #15803D;">Your next service is due</p>
          <p style="margin: 0; font-size: 18px; color: #0F172A; font-weight: bold;">${dueParts.join(' or ')}</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #166534;">Whichever comes first. We'll send you a friendly reminder as it approaches.</p>
        </td>
      </tr>
    </table>`
      : '';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Good news — the service on your ${escapeHtml(vehicleDescription)} (Vehicle Service ${escapeHtml(serviceNumber)}) is
      complete. We're finalizing everything now to prepare it for collection, and you'll hear from us again shortly
      with the details.
    </p>
    ${nextDueHtml}
  `;

  return renderEmailLayout({
    previewText: `Service complete — Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your service is complete',
    bodyHtml,
    ctaLabel: 'Track progress',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
