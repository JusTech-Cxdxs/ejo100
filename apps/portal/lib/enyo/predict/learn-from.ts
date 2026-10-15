import 'server-only';
/**
 * The organisation's "learn from" date (Settings → Enyo → Learning): records
 * opened before it are never learned from — not by the similar-jobs
 * suggestions, the training export, nor the trainer's datasets. Set it to
 * the go-live day so testing data stays out of every model.
 */
import { prisma } from '@ejo/database';

/** The later of `since` and the organisation's learn-from day (Lagos midnight). */
export async function learningSince(organisationId: string | null | undefined, since: Date): Promise<Date> {
  if (!organisationId) return since;
  const row = await prisma.enyoSetting.findUnique({ where: { organisationId }, select: { learnFrom: true } }).catch(() => null);
  if (!row?.learnFrom) return since;
  // Stored as a calendar day; the day starts at 00:00 in Lagos (UTC+1).
  const from = new Date(`${row.learnFrom.toISOString().slice(0, 10)}T00:00:00+01:00`);
  return from > since ? from : since;
}
