import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { lagosToday } from '@/lib/data-exchange/dates';
import { portalBaseUrl } from '@/lib/portal-url';
import { checkPeriod, isDocumentKind, partsOf, zipFileName } from '@/lib/exports/documents';
import { countDocuments, documentsZip } from '@/lib/exports/documents-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const refuse = (status: number, message: string) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * A4c2 — one zip of customer documents (PDFs and index.csv) for a workshop
 * and a period: ?kind=&branch=&from=&to=&part=. Drawn at download from the
 * records as they stand. For people who may export contact details and
 * payments, and may export at that branch; the branch found inside their
 * organisation; never during an assisted session; never cached. Each
 * download is in the audit trail with the documents' numbers and the zip's
 * SHA-256.
 */
export async function GET(req: Request): Promise<Response> {
  let p;
  try { p = await getPrincipal(); } catch { return refuse(401, 'Sign in first.'); }
  if (!(await allows('dataexchange.export.sensitive'))) return refuse(403, 'Customer documents are for the people who may export contact details and payments.');
  try { await refuseDuringAssist('documentsDownload'); } catch { return refuse(403, 'Not available during an assisted session.'); }
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  if (!isDocumentKind(kind)) return refuse(400, 'Choose the kind of document.');
  const period = checkPeriod(q.get('from'), q.get('to'), lagosToday());
  if (!period.ok) return refuse(400, period.error);
  const organisationId = p.organisationId ?? (await myOrganisationId());
  const branch = organisationId ? await prisma.branch.findFirst({ where: { id: String(q.get('branch') ?? '').slice(0, 40), type: 'WORKSHOP', businessUnit: { organisationId } }, select: { id: true, name: true } }) : null;
  if (!branch || !organisationId) return refuse(404, 'This workshop was not found.');
  if (!(await allows('dataexchange.export.run', { branchId: branch.id })) || !(await allows('dataexchange.export.sensitive', { branchId: branch.id }))) return refuse(403, 'You may not export customer documents from this workshop.');
  const scope = { organisationId, branchId: branch.id, kind, from: period.from, to: period.to };
  const parts = partsOf(await countDocuments(scope));
  const part = Number(q.get('part') ?? '1');
  if (!Number.isInteger(part) || part < 1 || part > parts) return refuse(400, `Choose a part from 1 to ${parts}.`);
  const zip = await documentsZip(scope, part, portalBaseUrl());
  if (!zip) return refuse(404, 'This workshop was not found.');
  if (!zip.numbers.length) return refuse(404, 'No documents in this period.');
  await prisma.auditLog.create({ data: { organisationId, userId: p.userId, action: 'data_exchange.documents_downloaded', entityType: 'Branch', entityId: branch.id, metadata: { kind, from: period.from, to: period.to, part, parts, count: zip.numbers.length, numbers: zip.numbers, checksum: zip.checksum, bytes: zip.bytes.byteLength } } });
  return new Response(Buffer.from(zip.bytes), { status: 200, headers: {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipFileName(kind, period.from, period.to, part, parts)}"`,
    'Content-Length': String(zip.bytes.byteLength),
    'X-Checksum-SHA256': zip.checksum,
    'X-Document-Count': String(zip.numbers.length),
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
