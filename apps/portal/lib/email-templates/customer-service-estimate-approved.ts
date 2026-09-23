import { renderEmailLayout, escapeHtml } from './layout';
import { pluralizeWord } from '@/lib/utils/pluralize';

export type CustomerServiceEstimateApprovedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  lineItems: { description: string; quantity: number; unitOfMeasure?: string | null; amount: string }[];
  /** Store Part + Internal Job combined into one figure — Vehicle
   * Service's own equivalent of Job Card's "Parts & Services". Omit
   * (undefined) when zero. */
  servicesSubtotal?: string;
  labourSubtotal?: string;
  sundrySubtotal?: string;
  totalAmount: string;
  minimumDepositAmount: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** Short suggested bank-transfer reference so the payment can be
   * matched back to this Vehicle Service. */
  paymentRemarkSuggestion: string;
  /** Customer portal link that lands directly on this Vehicle Service's
   * own card — never the staff portal. */
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The real Vehicle Service equivalent of Job Card's own
 * renderCustomerEstimateApprovedEmail — same layout, same three plain
 * customer-facing subtotals (never the internal type per line), same
 * minimum-deposit box, same two payment options and payment reference,
 * same singular/plural unit logic. Vehicle Service now has its own real
 * payment flow (70% deposit moves it into service), so the customer
 * genuinely needs the same payment instructions Job Card gives.
 */
export function renderCustomerServiceEstimateApprovedEmail(opts: CustomerServiceEstimateApprovedEmailOptions): string {
  const {
    customerName,
    serviceNumber,
    vehicleDescription,
    lineItems,
    servicesSubtotal,
    labourSubtotal,
    sundrySubtotal,
    totalAmount,
    minimumDepositAmount,
    bankName,
    accountName,
    accountNumber,
    paymentRemarkSuggestion,
    dashboardUrl,
    logoUrl,
    companyName,
    branchName,
  } = opts;

  const lineItemsHtml = lineItems.length > 0
    ? `<ol style="margin: 0; padding-left: 20px;">${lineItems
        .map((li) => `<li style="margin-bottom: 4px;">${escapeHtml(li.description)} (x${li.quantity}${li.unitOfMeasure ? ` ${escapeHtml(pluralizeWord(li.quantity, li.unitOfMeasure))}` : ''}) — ${escapeHtml(li.amount)}</li>`)
        .join('')}</ol>`
    : '<p style="margin: 0; color: #64748B;">No items recorded.</p>';

  const subtotalRows = [
    servicesSubtotal ? `<tr><td style="padding: 2px 0; color: #64748B; font-size: 13px;">Parts &amp; Services</td><td style="padding: 2px 0; text-align: right; color: #0F172A; font-size: 13px;">${escapeHtml(servicesSubtotal)}</td></tr>` : '',
    labourSubtotal ? `<tr><td style="padding: 2px 0; color: #64748B; font-size: 13px;">Labour</td><td style="padding: 2px 0; text-align: right; color: #0F172A; font-size: 13px;">${escapeHtml(labourSubtotal)}</td></tr>` : '',
    sundrySubtotal ? `<tr><td style="padding: 2px 0; color: #64748B; font-size: 13px;">Sundry</td><td style="padding: 2px 0; text-align: right; color: #0F172A; font-size: 13px;">${escapeHtml(sundrySubtotal)}</td></tr>` : '',
  ].join('');

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      The estimate for your vehicle's service has been approved. Please review it below — a deposit is required
      before work can begin.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
          <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Estimate</p>
          <div style="font-size: 14px; color: #0F172A; margin-bottom: 16px;">${lineItemsHtml}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #E2E8F0; padding-top: 8px;">
            ${subtotalRows}
            <tr>
              <td style="padding-top: 8px; font-size: 16px; font-weight: bold; color: #0F172A;">Total Estimate</td>
              <td style="padding-top: 8px; text-align: right; font-size: 16px; font-weight: bold; color: #0F172A;">${escapeHtml(totalAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #B45309;">Minimum deposit required (70%)</p>
          <p style="margin: 0; font-size: 20px; color: #0F172A; font-weight: bold;">${escapeHtml(minimumDepositAmount)}</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #78350F;">Work begins once this deposit is received and confirmed.</p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #0F172A;">How to pay</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #0F172A;">Option 1 — Bank transfer</p>
          <p style="margin: 0; font-size: 13px; color: #0F172A;">Bank: ${escapeHtml(bankName)}</p>
          <p style="margin: 0; font-size: 13px; color: #0F172A;">Account Name: ${escapeHtml(accountName)}</p>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #0F172A;">Account Number: ${escapeHtml(accountNumber)}</p>
          <p style="margin: 0; font-size: 12px; color: #64748B;">Please use this reference so we can match your payment: <strong>${escapeHtml(paymentRemarkSuggestion)}</strong></p>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748B;">After transferring, reply to this email or use your dashboard to send your payment proof.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 20px 16px 20px;">
          <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: bold; color: #0F172A;">Option 2 — Pay in person</p>
          <p style="margin: 0; font-size: 13px; color: #0F172A;">Pay the cashier at our ${escapeHtml(branchName)} office; they'll confirm your payment on our system.</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Your estimate for Vehicle Service ${serviceNumber} has been approved — deposit ${minimumDepositAmount} required to begin.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your estimate has been approved',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
