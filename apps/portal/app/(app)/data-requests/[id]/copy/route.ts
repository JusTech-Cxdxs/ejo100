import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { collectPack, PackTooLarge } from '@/lib/privacy/pack-server';
import { packFileName, packZip } from '@/lib/privacy/pack';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const refuse = (status: number, message: string) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * A4c1 — the copy of a customer's data for their request (a zip: README,
 * one CSV per kind of record, data.json), made from the live records at the
 * moment of download — nothing waits stored. Only for a request for a copy
 * whose requester's identity a colleague has confirmed, and until seven days
 * after it is answered; for the people who handle data requests; never during
 * an assisted session; never cached. Each download in the audit trail with
 * its SHA-256, which the request keeps (the copy given is identifiable).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  let p;
  try { p = await getPrincipal(); } catch { return refuse(401, 'Sign in first.'); }
  if (!(await allows('privacy.requests.manage'))) return refuse(403, 'Customers’ data requests are handled by the people your organisation names for them.');
  try { await refuseDuringAssist('dataRequestCopy'); } catch { return refuse(403, 'Not available during an assisted session.'); }
  const organisationId = p.organisationId ?? (await myOrganisationId());
  const r = organisationId ? await prisma.dataRequest.findFirst({ where: { id: String(id).slice(0, 40), organisationId } }) : null;
  if (!r || !organisationId) return refuse(404, 'This request was not found.');
  if (r.kind !== 'ACCESS') return refuse(409, 'This request does not ask for a copy of their data.');
  if (r.status === 'RECEIVED') return refuse(409, 'A colleague confirms who is asking before the copy is made.');
  if (r.status !== 'VERIFIED' && !(r.status === 'FULFILLED' && r.closedAt && Date.now() - +r.closedAt < 7 * 86_400_000)) return refuse(410, 'This request is closed: its copy is no longer given out.');
  let data;
  try { data = await collectPack(prisma, organisationId, r.customerId); } catch (e) {
    if (e instanceof PackTooLarge) return refuse(413, `This customer’s copy is too large to make here (${e.message}) Contact EJO support, quoting ${r.number}.`);
    throw e;
  }
  if (!data) return refuse(404, 'This customer is no longer in your organisation’s records.');
  const madeAt = new Date();
  const { bytes, checksum } = packZip({ number: r.number, organisation: data.organisation, customerName: data.customerName, madeAt, sections: data.sections });
  await prisma.$transaction([
    prisma.dataRequest.update({ where: { id: r.id }, data: { packAt: madeAt, packChecksum: checksum, packDownloads: { increment: 1 } } }),
    prisma.auditLog.create({ data: { organisationId, userId: p.userId, action: 'privacy.copy_downloaded', entityType: 'DataRequest', entityId: r.id, metadata: { number: r.number, checksum, bytes: bytes.byteLength, records: Object.fromEntries(data.sections.map((s) => [s.file, s.rows.length])) } } }),
  ]);
  return new Response(Buffer.from(bytes), { status: 200, headers: {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${packFileName(r.number, madeAt)}"`,
    'Content-Length': String(bytes.byteLength),
    'X-Checksum-SHA256': checksum,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
