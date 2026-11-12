'use server';

/**
 * A4c2 — customer documents in bulk: the estimates customers were sent and
 * the inspection reports, for one branch and a period, as zips of PDFs.
 * They carry names, addresses and amounts, so they need both
 * `dataexchange.export.sensitive` and `dataexchange.export.run` at the
 * branch; the branch is found inside the person's organisation. The zip
 * itself is made by the download route.
 */
import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { lagosToday } from '@/lib/data-exchange/dates';
import { checkPeriod, isDocumentKind, partsOf, type DocumentKind } from '@/lib/exports/documents';
import { countDocuments } from '@/lib/exports/documents-server';

/** The person, allowed to take customer documents out at all; their organisation. */
async function documentsDesk(where: string) {
  const p = await getPrincipal();
  await authorize('dataexchange.export.sensitive', undefined, where, 'Customer documents carry names, addresses and amounts: they are for the people who may export contact details and payments.');
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new Error('Your account is not placed in an organisation yet.');
  return { userId: p.userId, organisationId };
}

/** Both rights at that workshop: to export there, and to export contact details and payments there. */
const mayTakeDocuments = async (branchId: string) => (await allows('dataexchange.export.run', { branchId })) && (await allows('dataexchange.export.sensitive', { branchId }));

/** A workshop of the person's organisation where they may export, or null. */
async function documentBranchOf(organisationId: string, branchId: string) {
  const b = await prisma.branch.findFirst({ where: { id: String(branchId).slice(0, 40), type: 'WORKSHOP', businessUnit: { organisationId } }, select: { id: true, name: true } });
  return b && (await mayTakeDocuments(b.id)) ? b : null;
}

export async function getDocumentBranches(): Promise<{ branches: { id: string; name: string }[]; today: string }> {
  const { organisationId } = await documentsDesk('/data-exchange/documents');
  const all = await prisma.branch.findMany({ where: { type: 'WORKSHOP', businessUnit: { organisationId } }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const branches: { id: string; name: string }[] = [];
  for (const b of all) if (await mayTakeDocuments(b.id)) branches.push(b);
  return { branches, today: lagosToday() };
}

export type DocumentsFound = { ok: true; kind: DocumentKind; branchId: string; branchName: string; from: string; to: string; count: number; parts: number } | { ok: false; error: string };

/** How many documents the period holds, and in how many zips. */
export async function findDocuments(input: { kind: string; branchId: string; from: string; to: string }): Promise<DocumentsFound> {
  const { organisationId } = await documentsDesk('/data-exchange/documents');
  if (!isDocumentKind(input.kind)) return { ok: false, error: 'Choose the kind of document.' };
  const period = checkPeriod(input.from, input.to, lagosToday());
  if (!period.ok) return period;
  const branch = await documentBranchOf(organisationId, input.branchId);
  if (!branch) return { ok: false, error: 'Choose a workshop you may export from.' };
  const count = await countDocuments({ organisationId, branchId: branch.id, kind: input.kind, from: period.from, to: period.to });
  return { ok: true, kind: input.kind, branchId: branch.id, branchName: branch.name, from: period.from, to: period.to, count, parts: partsOf(count) };
}
