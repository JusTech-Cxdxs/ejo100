import { prisma } from '@ejo/database';

/** Retention: website page views are kept 13 months (a year to compare with), then removed by the daily job. */
export async function purgeOldSiteVisits(days = 400): Promise<number> {
  const res = await prisma.siteVisit.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return res.count;
}
