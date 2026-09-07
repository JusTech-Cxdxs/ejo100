import { renderEmailLayout, escapeHtml } from './layout';
import { pluralize } from '@/lib/utils/pluralize';
import { formatDateOnly } from '@/lib/utils/format-date';

type VehicleInfo = {
  make: string | null;
  model: string | null;
  year: number | null;
  engineType: string | null;
  chassisNumber: string | null;
  plateNumber: string | null;
};

function vehicleSummaryLine(vehicle: VehicleInfo): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'No vehicle details on file';
}

function vehicleDetailRows(vehicle: VehicleInfo): string {
  const rows: string[] = [];
  if (vehicle.chassisNumber) rows.push(`<p style="margin: 0 0 4px 0; font-size: 13px; color: #64748B;">VIN/Chassis: ${escapeHtml(vehicle.chassisNumber)}</p>`);
  if (vehicle.plateNumber) rows.push(`<p style="margin: 0; font-size: 13px; color: #64748B;">Plate: ${escapeHtml(vehicle.plateNumber)}</p>`);
  return rows.join('');
}

export type PartRequestLineInfo = { partName: string; quantity: number; baseUnitOfMeasure: string };

function lineItemsList(lines: PartRequestLineInfo[]): string {
  return lines
    .map((l) => `<li style="margin-bottom: 4px;">${escapeHtml(l.partName)} — ${escapeHtml(pluralize(l.quantity, l.baseUnitOfMeasure))}</li>`)
    .join('');
}

export type PartRequestApprovalNeededEmailOptions = {
  recipientName: string;
  requestedByName: string;
  referenceNumber: string;
  jobNumber: string;
  customerName: string;
  vehicle: VehicleInfo;
  requestedAt: Date;
  lines: PartRequestLineInfo[];
  approvalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * To whoever's real turn it is to approve — the Workshop HOD/Manager
 * first, then Store — with the full real picture in one place: which
 * Job Card, which real vehicle, every real Part and quantity being
 * asked for, and how many parts that is in total. No need to open the
 * portal just to see what's actually being requested before deciding
 * — every real fact here was already decided back at estimate time,
 * this is purely a summary of it.
 */
export function renderPartRequestApprovalNeededEmail(opts: PartRequestApprovalNeededEmailOptions): string {
  const { recipientName, requestedByName, referenceNumber, jobNumber, customerName, vehicle, requestedAt, lines, approvalUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} raised Store Parts Request ${escapeHtml(referenceNumber)} for Job Card
      ${escapeHtml(jobNumber)} — your approval is needed before this can move forward.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 8px 0; font-size: 15px; color: #0F172A;">${escapeHtml(jobNumber)} — ${escapeHtml(customerName)}</p>
          <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748B;">${escapeHtml(vehicleSummaryLine(vehicle))}</p>
          ${vehicleDetailRows(vehicle)}
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748B;">${escapeHtml(pluralize(lines.length, 'Part'))} requested, on ${formatDateOnly(requestedAt)}:</p>
    <ul style="margin: 0 0 16px 0; padding-left: 20px;">${lineItemsList(lines)}</ul>
  `;

  return renderEmailLayout({
    previewText: `${requestedByName} raised ${referenceNumber} for ${jobNumber} — your approval is needed.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Parts request needs your approval',
    bodyHtml,
    ctaLabel: 'Review Request',
    ctaUrl: approvalUrl,
    logoUrl,
  });
}

export type PartRequestStatusEmailOptions = {
  recipientName: string;
  kind: 'hod_approved' | 'store_approved' | 'released' | 'rejected';
  referenceNumber: string;
  jobNumber: string;
  customerName: string;
  rejectionReason?: string;
  requestUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

const STATUS_COPY: Record<PartRequestStatusEmailOptions['kind'], { heading: string; line: string; tone: 'positive' | 'negative' | 'neutral' }> = {
  hod_approved: {
    heading: 'Parts request approved by HOD',
    line: 'has been approved by the Workshop HOD and is now with Store for their own approval and stock reservation.',
    tone: 'positive',
  },
  store_approved: {
    heading: 'Parts request approved by Store',
    line: 'has been approved by Store — the stock is now reserved and ready for release.',
    tone: 'positive',
  },
  released: {
    heading: 'Parts released',
    line: 'has been released by Store — the real physical parts are now available for collection.',
    tone: 'positive',
  },
  rejected: {
    heading: 'Parts request rejected',
    line: 'was rejected.',
    tone: 'negative',
  },
};

/**
 * One shared template, sent to both the Technician and the
 * Supervisor at every real stage this request moves through — the
 * Supervisor stays genuinely able to follow up because they hear
 * about it too, not just the Technician who happened to raise it.
 */
export function renderPartRequestStatusEmail(opts: PartRequestStatusEmailOptions): string {
  const { recipientName, kind, referenceNumber, jobNumber, customerName, rejectionReason, requestUrl, logoUrl, companyName, branchName, departmentName } = opts;
  const copy = STATUS_COPY[kind];

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Store Parts Request ${escapeHtml(referenceNumber)} for Job Card ${escapeHtml(jobNumber)} (${escapeHtml(customerName)}) ${copy.line}
    </p>
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
