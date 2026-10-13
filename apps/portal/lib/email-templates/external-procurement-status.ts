import { renderEmailLayout, html, greeting, para, details, moneyTable, sectionTitle, callout, plural, formatNaira, type EmailTone } from './layout';

export type ExternalProcurementLineInfo = { description: string; quantity: number; unitOfMeasure: string | null; amount: number };

export type ExternalProcurementApprovalNeededEmailOptions = {
  recipientName: string;
  requestedByName: string;
  referenceNumber: string;
  jobNumber: string;
  customerName: string;
  lines: ExternalProcurementLineInfo[];
  estimatedAmount: number;
  approvalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderExternalProcurementApprovalNeededEmail(o: ExternalProcurementApprovalNeededEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.requestedByName} raised external procurement request ${o.referenceNumber} for Job Card ${o.jobNumber} (${o.customerName}). It needs your approval before it can go ahead.`)}
    ${sectionTitle(`${plural(o.lines.length, 'item')} requested`)}
    ${moneyTable(o.lines.map((l) => ({
      label: l.description,
      meta: l.unitOfMeasure ? plural(l.quantity, l.unitOfMeasure) : `Quantity ${l.quantity}`,
      amount: formatNaira(l.amount),
    })), [{ label: 'Total', amount: formatNaira(o.estimatedAmount), emphasis: true }])}
    ${details([
      ['Request', o.referenceNumber],
      ['Job Card', o.jobNumber],
      ['Requested by', o.requestedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} requested ${formatNaira(o.estimatedAmount)} for ${o.jobNumber}. Your approval is needed.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Approval needed', tone: 'warning' },
    heading: `Procurement request ${o.referenceNumber} needs your approval`,
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: o.approvalUrl,
    audience: 'staff',
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

export const EXTERNAL_PROCUREMENT_STATUS: Record<ExternalProcurementStatusEmailOptions['kind'], { label: string; heading: string; line: string; tone: EmailTone }> = {
  sent_to_manager: {
    label: 'With the manager',
    heading: 'Procurement request sent to the manager',
    line: 'passed Finance review and is now with the workshop manager for approval.',
    tone: 'info',
  },
  approved: {
    label: 'Approved',
    heading: 'Procurement request approved',
    line: 'was approved by the manager and is ready for Finance to pay out.',
    tone: 'success',
  },
  disbursed: {
    label: 'Funds paid out',
    heading: 'Procurement funds paid out',
    line: 'has been paid out by Finance. The cash advance is available.',
    tone: 'success',
  },
  rejected: {
    label: 'Rejected',
    heading: 'Procurement request rejected',
    line: 'was rejected.',
    tone: 'danger',
  },
};

export function renderExternalProcurementStatusEmail(o: ExternalProcurementStatusEmailOptions): string {
  const s = EXTERNAL_PROCUREMENT_STATUS[o.kind];
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`External procurement request ${o.referenceNumber} for Job Card ${o.jobNumber} (${o.customerName}) ${s.line}`)}
    ${o.kind === 'rejected' && o.rejectionReason?.trim() ? callout(o.rejectionReason.trim(), 'danger', 'Reason given') : ''}
    ${details([
      ['Request', o.referenceNumber],
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Amount', o.amount !== undefined ? formatNaira(o.amount) : null],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.referenceNumber} for ${o.jobNumber} ${s.line}`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: s.label, tone: s.tone },
    heading: `${s.heading}: ${o.referenceNumber}`,
    bodyHtml,
    ctaLabel: 'View request',
    ctaUrl: o.requestUrl,
    audience: 'staff',
  });
}
