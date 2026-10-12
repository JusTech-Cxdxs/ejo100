import { renderEmailLayout, html, greeting, para, details, list, sectionTitle, callout, plural, formatEmailDate, type EmailTone } from './layout';

type VehicleInfo = {
  make: string | null;
  model: string | null;
  year: number | null;
  engineType: string | null;
  chassisNumber: string | null;
  plateNumber: string | null;
};

export function vehicleSummaryLine(vehicle: VehicleInfo): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'No vehicle details on file';
}

export type PartRequestLineInfo = { partName: string; quantity: number; baseUnitOfMeasure: string };

export function partLines(lines: PartRequestLineInfo[]) {
  return list(lines.map((l) => `${l.partName}: ${plural(l.quantity, l.baseUnitOfMeasure)}`));
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

export function renderPartRequestApprovalNeededEmail(o: PartRequestApprovalNeededEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.requestedByName} raised store parts request ${o.referenceNumber} for Job Card ${o.jobNumber}. It needs your approval before Store can reserve the parts.`)}
    ${details([
      ['Request', o.referenceNumber],
      ['Job Card', `${o.jobNumber} (${o.customerName})`],
      ['Vehicle', vehicleSummaryLine(o.vehicle)],
      ['Plate', o.vehicle.plateNumber],
      ['VIN / chassis', o.vehicle.chassisNumber],
      ['Requested', `${formatEmailDate(o.requestedAt)} by ${o.requestedByName}`],
    ])}
    ${sectionTitle(`Parts requested (${o.lines.length})`)}
    ${partLines(o.lines)}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} requested ${plural(o.lines.length, 'part')} for ${o.jobNumber}. Your approval is needed.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Approval needed', tone: 'warning' },
    heading: `Parts request ${o.referenceNumber} needs your approval`,
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: o.approvalUrl,
    audience: 'staff',
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

export const PART_REQUEST_STATUS: Record<PartRequestStatusEmailOptions['kind'], { label: string; heading: string; line: string; tone: EmailTone }> = {
  hod_approved: {
    label: 'Approved by HOD',
    heading: 'Parts request approved by the HOD',
    line: 'was approved by the workshop HOD and is now with Store for approval and stock reservation.',
    tone: 'success',
  },
  store_approved: {
    label: 'Approved by Store',
    heading: 'Parts request approved by Store',
    line: 'was approved by Store. The stock is reserved and ready to be released.',
    tone: 'success',
  },
  released: {
    label: 'Released',
    heading: 'Parts released',
    line: 'has been released by Store. The parts are ready for collection.',
    tone: 'success',
  },
  rejected: {
    label: 'Rejected',
    heading: 'Parts request rejected',
    line: 'was rejected.',
    tone: 'danger',
  },
};

export function renderPartRequestStatusEmail(o: PartRequestStatusEmailOptions): string {
  const copy = PART_REQUEST_STATUS[o.kind];
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`Store parts request ${o.referenceNumber} for Job Card ${o.jobNumber} (${o.customerName}) ${copy.line}`)}
    ${o.kind === 'rejected' && o.rejectionReason?.trim() ? callout(o.rejectionReason.trim(), 'danger', 'Reason given') : ''}
    ${details([
      ['Request', o.referenceNumber],
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.referenceNumber} for ${o.jobNumber} ${copy.line}`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: copy.label, tone: copy.tone },
    heading: `${copy.heading}: ${o.referenceNumber}`,
    bodyHtml,
    ctaLabel: 'View request',
    ctaUrl: o.requestUrl,
    audience: 'staff',
  });
}
