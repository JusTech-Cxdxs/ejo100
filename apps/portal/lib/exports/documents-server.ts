/**
 * A4c2 — customer documents in bulk (server only): which documents a branch
 * has in a period, and one part of them drawn as PDFs into a zip with an
 * index. Drawn by the same builders as the copy emailed to the customer
 * (lib/pdf/document-props), from the records as they stand now.
 */
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@ejo/database';
import { EstimatePdf } from '../pdf/estimate-pdf';
import { InspectionPdf } from '../pdf/inspection-pdf';
import { inspectionPdfProps, jobEstimatePdfProps, letterhead, serviceEstimatePdfProps, type Bank, type Letterhead } from '../pdf/document-props';
import { bankDetailsFor } from '../workshop-core';
import { formatDateTime } from '../utils/format-date';
import { safeText } from './format';
import { documentFileName, DOCUMENTS_PER_ZIP, periodWindow, type DocumentKind } from './documents';

export type Scope = { organisationId: string; branchId: string; kind: DocumentKind; from: string; to: string };

/** The branch inside the organisation — every query below hangs on it. */
const inBranch = (s: Scope) => ({ branchId: s.branchId, branch: { businessUnit: { organisationId: s.organisationId } } });

export async function countDocuments(s: Scope): Promise<number> {
  const { start, end } = periodWindow(s.from, s.to);
  if (s.kind === 'JOB_ESTIMATE') return prisma.estimate.count({ where: { customerNotifiedAt: { gte: start, lt: end }, jobCard: inBranch(s) } });
  if (s.kind === 'SERVICE_ESTIMATE') return prisma.serviceEstimate.count({ where: { customerNotifiedAt: { gte: start, lt: end }, vehicleService: inBranch(s) } });
  return prisma.vehicleInspection.count({ where: { status: 'COMPLETED', completedAt: { gte: start, lt: end }, vehicleService: inBranch(s) } });
}

/** The portal's logo, fetched once for the whole zip (each document would otherwise fetch it again); the address itself when it cannot be read. */
async function logoOnce(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return url;
    const type = res.headers.get('content-type') ?? 'image/png';
    if (!type.startsWith('image/')) return url;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch { return url; }
}

type Made = { number: string; customer: string; dated: Date; file: string; pdf: Uint8Array };
const vehicle = { select: { make: true, model: true, year: true, plateNumber: true, chassisNumber: true } } as const;
const customer = { select: { fullName: true, address: true } } as const;

/**
 * One part (1-based) of the period's documents, oldest first: each drawn as
 * a PDF. The order is fixed (the date, then the record), so the parts never
 * overlap or miss one while nothing new is sent.
 */
async function drawPart(s: Scope, part: number, head: Letterhead, bank: Bank): Promise<Made[]> {
  const { start, end } = periodWindow(s.from, s.to);
  const page = { skip: (part - 1) * DOCUMENTS_PER_ZIP, take: DOCUMENTS_PER_ZIP };
  const out: Made[] = [];
  if (s.kind === 'JOB_ESTIMATE') {
    const rows = await prisma.estimate.findMany({
      where: { customerNotifiedAt: { gte: start, lt: end }, jobCard: inBranch(s) }, orderBy: [{ customerNotifiedAt: 'asc' }, { id: 'asc' }], ...page,
      select: { customerNotifiedAt: true, jobCard: { select: { jobNumber: true, customer, vehicle } }, lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true, billTo: true, coveringWarranty: { select: { warrantyNumber: true } } } } },
    });
    for (const e of rows) {
      const pdf = await renderToBuffer(EstimatePdf(jobEstimatePdfProps({ letterhead: head, bank, jobNumber: e.jobCard.jobNumber, customer: e.jobCard.customer, vehicle: e.jobCard.vehicle, lineItems: e.lineItems })));
      out.push({ number: e.jobCard.jobNumber, customer: e.jobCard.customer.fullName, dated: e.customerNotifiedAt!, file: documentFileName(s.kind, e.jobCard.jobNumber), pdf });
    }
  } else if (s.kind === 'SERVICE_ESTIMATE') {
    const rows = await prisma.serviceEstimate.findMany({
      where: { customerNotifiedAt: { gte: start, lt: end }, vehicleService: inBranch(s) }, orderBy: [{ customerNotifiedAt: 'asc' }, { id: 'asc' }], ...page,
      select: { customerNotifiedAt: true, vehicleService: { select: { serviceNumber: true, customer, vehicle } }, lineItems: { orderBy: { createdAt: 'asc' }, select: { type: true, description: true, quantity: true, amount: true, unitOfMeasure: true } } },
    });
    for (const e of rows) {
      const v = e.vehicleService;
      const pdf = await renderToBuffer(EstimatePdf(serviceEstimatePdfProps({ letterhead: head, bank, serviceNumber: v.serviceNumber, customer: v.customer, vehicle: v.vehicle, lineItems: e.lineItems })));
      out.push({ number: v.serviceNumber, customer: v.customer.fullName, dated: e.customerNotifiedAt!, file: documentFileName(s.kind, v.serviceNumber), pdf });
    }
  } else {
    const rows = await prisma.vehicleInspection.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: start, lt: end }, vehicleService: inBranch(s) }, orderBy: [{ completedAt: 'asc' }, { id: 'asc' }], ...page,
      select: { completedAt: true, inspectedBy: { select: { fullName: true } }, items: { select: { section: true, name: true, condition: true, severity: true, action: true } }, vehicleService: { select: { serviceNumber: true, customer, vehicle } } },
    });
    for (const i of rows) {
      const v = i.vehicleService;
      const pdf = await renderToBuffer(InspectionPdf(inspectionPdfProps({ letterhead: head, serviceNumber: v.serviceNumber, customerName: v.customer.fullName, vehicle: v.vehicle, inspectedByName: i.inspectedBy.fullName, completedOnLabel: formatDateTime(i.completedAt!), items: i.items })));
      out.push({ number: v.serviceNumber, customer: v.customer.fullName, dated: i.completedAt!, file: documentFileName(s.kind, v.serviceNumber), pdf });
    }
  }
  return out;
}

const cell = (v: string) => `"${safeText(v).replace(/"/g, '""')}"`;

/**
 * The zip of one part: each PDF, and index.csv (the file, its number, the
 * customer, the date) so the set can be checked against the records. Null
 * when the branch is not the organisation's; an empty list when the part has
 * nothing.
 */
export async function documentsZip(s: Scope, part: number, portalUrl: string): Promise<{ bytes: Uint8Array; checksum: string; numbers: string[] } | null> {
  const branch = await prisma.branch.findFirst({ where: { id: s.branchId, businessUnit: { organisationId: s.organisationId } }, select: { id: true, name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: true } } } });
  if (!branch) return null;
  const head = letterhead(branch.businessUnit.organisation, branch, portalUrl);
  head.logoUrl = await logoOnce(head.logoUrl);
  const made = await drawPart(s, part, head, await bankDetailsFor(branch.id));
  const madeAt = new Date();
  const files: Record<string, [Uint8Array, { mtime: Date }]> = {};
  const index = ['"File","Number","Customer","Date (UTC)"'];
  for (const m of made) {
    // Two documents of one number (never expected) keep both, the second marked.
    let name = m.file;
    for (let n = 2; files[name]; n++) name = m.file.replace(/\.pdf$/, `-${n}.pdf`);
    files[name] = [new Uint8Array(m.pdf), { mtime: madeAt }];
    index.push([name, m.number, m.customer, m.dated.toISOString()].map(cell).join(','));
  }
  files['index.csv'] = [strToU8(`\uFEFF${index.join('\r\n')}\r\n`), { mtime: madeAt }];
  // PDFs are already compressed: stored as they are.
  const bytes = zipSync(files, { level: 0 });
  return { bytes, checksum: createHash('sha256').update(bytes).digest('hex'), numbers: made.map((m) => m.number) };
}
