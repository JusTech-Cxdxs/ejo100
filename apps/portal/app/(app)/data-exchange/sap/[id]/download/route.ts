import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { fileCsv } from '@/lib/sap/postings-server';
import { checksumOf, postingFileName, type PostingKind } from '@/lib/sap/postings';

export const dynamic = 'force-dynamic';

const refuse = (status: number, message: string) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * A postings file for SAP (C1a), rebuilt from its lines: the same bytes every
 * time, so its SHA-256 always matches the one EJO shows (and sends, in
 * X-Checksum-SHA256). For someone who makes this branch's files (the
 * organisation's new customers: who exports personal data); every download in
 * the audit trail; never cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let p;
  try { p = await getPrincipal(); } catch { return refuse(401, 'Sign in first.'); }
  const organisationId = p.organisationId ?? (await myOrganisationId());
  const f = organisationId ? await prisma.sapPostingFile.findFirst({ where: { id: String(id).slice(0, 40), organisationId }, select: { id: true, number: true, kind: true, upTo: true, branchId: true, checksum: true, downloadedAt: true } }) : null;
  if (!f) return refuse(404, 'This file was not found.');
  const may = f.branchId ? await allows('dataexchange.export.run', { branchId: f.branchId }) : await allows('dataexchange.export.sensitive');
  if (!may) return refuse(403, 'You cannot download this file.');
  const csv = await fileCsv(f.id);
  const sum = checksumOf(csv);
  if (sum !== f.checksum) return refuse(409, 'This file no longer matches its checksum, so it is not given out. Tell your administrator.');
  await prisma.$transaction([
    prisma.sapPostingFile.updateMany({ where: { id: f.id, downloadedAt: null }, data: { downloadedAt: new Date() } }),
    prisma.auditLog.create({ data: { organisationId: organisationId!, userId: p.userId, action: 'sap.postings_downloaded', entityType: 'SapPostingFile', entityId: f.id, metadata: { number: f.number, kind: f.kind, checksum: sum, first: !f.downloadedAt } } }),
  ]);
  const name = postingFileName(f.kind as PostingKind, f.number, f.upTo.toISOString().slice(0, 10));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Checksum-SHA256': sum,
    },
  });
}
