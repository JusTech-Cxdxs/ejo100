import { renderEmailLayout, html, greeting, para, details, sectionTitle, callout, plural, formatEmailDate } from './layout';
import { vehicleSummaryLine, partLines, PART_REQUEST_STATUS } from './part-request-status';

type VehicleInfo = {
  make: string | null;
  model: string | null;
  year: number | null;
  engineType: string | null;
  chassisNumber: string | null;
  plateNumber: string | null;
};

export type ServiceEstimatePartRequestLineInfo = { partName: string; quantity: number; baseUnitOfMeasure: string };

export type ServiceEstimatePartRequestApprovalNeededEmailOptions = {
  recipientName: string;
  requestedByName: string;
  referenceNumber: string;
  serviceNumber: string;
  customerName: string;
  vehicle: VehicleInfo;
  requestedAt: Date;
  lines: ServiceEstimatePartRequestLineInfo[];
  approvalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderServiceEstimatePartRequestApprovalNeededEmail(o: ServiceEstimatePartRequestApprovalNeededEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.requestedByName} raised store parts request ${o.referenceNumber} for Vehicle Service ${o.serviceNumber}. It needs your approval before Store can reserve the parts.`)}
    ${details([
      ['Request', o.referenceNumber],
      ['Vehicle Service', `${o.serviceNumber} (${o.customerName})`],
      ['Vehicle', vehicleSummaryLine(o.vehicle)],
      ['Plate', o.vehicle.plateNumber],
      ['VIN / chassis', o.vehicle.chassisNumber],
      ['Requested', `${formatEmailDate(o.requestedAt)} by ${o.requestedByName}`],
    ])}
    ${sectionTitle(`Parts requested (${o.lines.length})`)}
    ${partLines(o.lines)}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} requested ${plural(o.lines.length, 'part')} for ${o.serviceNumber}. Your approval is needed.`,
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

export type ServiceEstimatePartRequestStatusEmailOptions = {
  recipientName: string;
  kind: 'hod_approved' | 'store_approved' | 'released' | 'rejected';
  referenceNumber: string;
  serviceNumber: string;
  customerName: string;
  rejectionReason?: string;
  requestUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderServiceEstimatePartRequestStatusEmail(o: ServiceEstimatePartRequestStatusEmailOptions): string {
  const copy = PART_REQUEST_STATUS[o.kind];
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`Store parts request ${o.referenceNumber} for Vehicle Service ${o.serviceNumber} (${o.customerName}) ${copy.line}`)}
    ${o.kind === 'rejected' && o.rejectionReason?.trim() ? callout(o.rejectionReason.trim(), 'danger', 'Reason given') : ''}
    ${details([
      ['Request', o.referenceNumber],
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.referenceNumber} for ${o.serviceNumber} ${copy.line}`,
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
