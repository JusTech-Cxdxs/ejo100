import { renderEmailLayout, escapeHtml } from './layout';
import { ordinal } from '../utils/ordinal';

export type CustomerApprovalReminderEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  totalEstimate: string;
  minimumDepositAmount: string;
  dueDate: string;
  /** Which reminder this is (1 for the first, 2 for the second, and
   * so on) — computed by the caller from the real audit trail, never
   * guessed. Shown plainly so the customer knows this isn't the first
   * time we've reached out. */
  reminderNumber: number;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * "Action required" — a genuine nudge partway through the approval
 * window (APPROVAL_REMINDER_WORKING_DAYS), not a last-minute warning.
 * Deliberately does NOT threaten automatic cancellation — there isn't
 * one. Past the deadline, a member of staff reviews the situation and
 * decides, the same as any other cancellation; this email states that
 * honestly rather than warning of an automatic action that won't
 * actually happen.
 */
export function renderCustomerApprovalReminderEmail(opts: CustomerApprovalReminderEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, totalEstimate, minimumDepositAmount, dueDate, reminderNumber, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      This is our ${escapeHtml(ordinal(reminderNumber))} reminder that the estimate for your
      ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) is still awaiting your approval.
      You're welcome to make payment any time from now — there's no need to wait, and doing so lets us begin
      work sooner.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #B45309;">Please Pay On or Before</p>
          <p style="margin: 0; font-size: 18px; color: #0F172A; font-weight: bold;">${escapeHtml(dueDate)}</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #78350F;">
            If we don't hear from you or receive payment around this date, please reach out to us — if there's
            a genuine reason for the delay, we're happy to work with you.
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Estimate</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalEstimate)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Minimum Deposit (70%)</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(minimumDepositAmount)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Action required — Job Card ${jobNumber} is awaiting your approval, please pay on or before ${dueDate}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Action required — estimate awaiting approval',
    bodyHtml,
    ctaLabel: 'View and pay',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
