import { NextResponse } from 'next/server';
import { getHeadquarters } from '@/lib/actions/headquarters';
import { getPrincipal } from '@/lib/authz/server';
import { toCsv } from '@/lib/hq-core';
import { writeAuditLog } from '@/lib/workshop-core';

export const dynamic = 'force-dynamic';

/**
 * Headquarters, as a spreadsheet: one row per branch for the chosen period.
 * The same check as the page (analytics.business.view, the viewer's reach);
 * counts and totals only; formulas neutralised; every export recorded in the
 * audit trail; never cached.
 */
export async function GET(req: Request): Promise<Response> {
  const period = new URL(req.url).searchParams.get('period') ?? undefined;
  let hq;
  try {
    hq = await getHeadquarters(period);
  } catch {
    return new NextResponse('Not available.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const header = ['Branch', 'Health', 'Why', 'Staff', 'Jobs opened', 'Jobs finished', 'Collected (NGN, payments less refunds)', 'In the workshop now', 'Ready to collect', 'Decisions waiting', 'Oldest decision (hours)', 'Support open', 'Support past target', 'Median turnaround (hours)'];
  const rows = hq.branches.map((b) => [b.name, b.health.label, b.health.reasons.join('; '), b.staff, b.opened, b.finished, b.collected, b.inWorkshop, b.ready, b.waiting, b.oldestWaitingHours ?? '', b.supportOpen, b.supportLate, b.turnaroundHours ?? '']);
  rows.push(['All branches', '', '', hq.totals.staff, hq.totals.opened, hq.totals.finished, hq.totals.collected, hq.totals.inWorkshop, hq.totals.ready, hq.totals.waiting, '', hq.totals.supportOpen, hq.totals.supportLate, '']);
  const p = await getPrincipal();
  await writeAuditLog({ userId: p.userId, action: 'headquarters.exported', entityType: 'Report', entityId: `headquarters:${hq.period.key}`, metadata: { period: hq.period.label, branches: hq.branches.length } }).catch(() => undefined);
  const stamp = hq.asOf.toISOString().slice(0, 10);
  return new NextResponse(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="headquarters-${hq.period.key}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
