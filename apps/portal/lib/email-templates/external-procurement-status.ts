import { renderEmailLayout, escapeHtml } from './layout';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ExternalProcurementApprovalNeededEmailOptions = {
  recipientName: string;
  requestedByName: string;
  referenceNumber: string;
  jobNumber: string;
  customerName: string;
  description: string;
  estimatedAmount: number;
  approvalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent at each of this request's own two real approval gates — first
 * to Finance for their review, then to the Manager once Finance has
 * sent it forward — with the real Job Card and the real amount right
 * there, so approving or declining never requires opening the portal
 * just to see what's actually being asked for.
 */
export function renderExternalProcurementApprovalNeededEmail(opts: ExternalProcurementApprovalNeededEmailOptions): string {
  const { recipientName, requestedByName, referenceNumber, jobNumber, customerName, description, estimatedAmount, approvalUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} raised External Procurement Request ${escapeHtml(referenceNumber)} for Job Card
      ${escapeHtml(jobNumber)} — your approval is needed before this can move forward.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 8px 0; font-size: 15px; color: #0F172A;">${escapeHtml(jobNumber)} — ${escapeHtml(customerName)}</p>
          <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748B;">${escapeHtml(description)}</p>
          <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0F172A;">${formatNaira(estimatedAmount)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `${requestedByName} raised ${referenceNumber} for ${jobNumber} — your approval is needed.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Procurement request needs your approval',
    bodyHtml,
    ctaLabel: 'Review Request',
    ctaUrl: approvalUrl,
    logoUrl,
  });
}

export type ExternalProcurementStatusEmailOptions = {
  recipientName: string;
  kind: 'sent_to_manager' | 'approved' | 'disbursed' | 'rejected';
  referenceNumber: string;
  jobNumber: string;
  customerName: string;
  amount?: number;
  rejectionReason?: string;
  requestUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

const STATUS_COPY: Record<ExternalProcurementStatusEmailOptions['kind'], { heading: string; line: string; tone: 'positive' | 'negative' | 'neutral' }> = {
  sent_to_manager: {
    heading: 'Procurement request sent to Manager',
    line: 'has passed Finance review and is now with the Workshop Manager for approval.',
    tone: 'positive',
  },
  approved: {
    heading: 'Procurement request approved',
    line: 'has been approved by the Manager and is now ready for Finance to disburse.',
    tone: 'positive',
  },
  disbursed: {
    heading: 'Procurement funds disbursed',
    line: 'has been disbursed by Finance — the cash advance is now available.',
    tone: 'positive',
  },
  rejected: {
    heading: 'Procurement request rejected',
    line: 'was rejected.',
    tone: 'negative',
  },
};

/**
 * One shared template, sent to both the Technician and the
 * Supervisor at every real stage this request moves through — the
 * same reasoning already proven for the Store Parts chain: the
 * Supervisor's own genuine ability to follow up depends on actually
 * knowing what's happening, not just the Technician who raised it.
 */
export function renderExternalProcurementStatusEmail(opts: ExternalProcurementStatusEmailOptions): string {
  const { recipientName, kind, referenceNumber, jobNumber, customerName, amount, rejectionReason, requestUrl, logoUrl, companyName, branchName, departmentName } = opts;
  const copy = STATUS_COPY[kind];

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      External Procurement Request ${escapeHtml(referenceNumber)} for Job Card ${escapeHtml(jobNumber)}
      (${escapeHtml(customerName)}) ${copy.line}
    </p>
    ${
      amount !== undefined
        ? `<p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #0F172A;">${formatNaira(amount)}</p>`
        : ''
    }
    ${
      kind === 'rejected' && rejectionReason
        ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(rejectionReason)}</p>
        </td>
      </tr>
    </table>
    `
        : ''
    }
  `;

  return renderEmailLayout({
    previewText: `${referenceNumber} for ${jobNumber} ${copy.line}`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: kind === 'rejected' ? '\u2715' : '\u2713',
    iconTone: copy.tone,
    heading: copy.heading,
    bodyHtml,
    ctaLabel: 'View Request',
    ctaUrl: requestUrl,
    logoUrl,
  });
}
