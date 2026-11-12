import { NextRequest, NextResponse } from 'next/server';
import { setAuditActor } from '@ejo/database';
import { isCronRequest } from '@/lib/cron-auth';
import { recordJobRun } from '@/lib/job-runs';
import { runDueExportSchedules } from '@/lib/exports/schedule-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled exports due today (A4c3). The morning job
 * (/api/cron/pricing-alerts) runs the same function; this route is its own
 * address for the scheduler or a manual run. Requires
 * `Authorization: Bearer <CRON_SECRET>`. Safe to run twice: each schedule is
 * claimed before its export is made.
 */
export async function GET(request: NextRequest) {
  setAuditActor(null, 'cron:export-schedules');
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const run = await runDueExportSchedules();
  await recordJobRun('export-schedules', run);
  return NextResponse.json(run);
}
