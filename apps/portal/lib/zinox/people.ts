import 'server-only';
import { prisma } from '@ejo/database';

/**
 * Names for the actor stamps the Zinox records keep as plain user ids
 * (who checked, tested, confirmed, dispatched …). One query for a page.
 */
export async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (wanted.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, fullName: true } });
  return new Map(rows.map((r) => [r.id, r.fullName]));
}

export const nameOf = (names: Map<string, string>, id: string | null | undefined): string | null => (id ? names.get(id) ?? null : null);
