/**
 * The imports a source filter points at, within one organisation (server only).
 */
import { prisma } from '@ejo/database';
import type { SourceFilter } from './source-filter';

export async function importIdsFor(organisationId: string | null | undefined, f: SourceFilter): Promise<{ bySource: string[] | null; byNumber: string[] | null }> {
  if (!organisationId) return { bySource: f.source === 'sap' || f.source === 'legacy' ? [] : null, byNumber: f.imp ? [] : null };
  const [bySource, byNumber] = await Promise.all([
    f.source === 'sap' || f.source === 'legacy'
      ? prisma.importJob.findMany({ where: { organisationId, sourceSystem: f.source === 'sap' ? 'SAP' : 'LEGACY' }, select: { id: true } }).then((r) => r.map((x) => x.id))
      : null,
    f.imp ? prisma.importJob.findMany({ where: { organisationId, number: f.imp }, select: { id: true } }).then((r) => r.map((x) => x.id)) : null,
  ]);
  return { bySource, byNumber };
}
