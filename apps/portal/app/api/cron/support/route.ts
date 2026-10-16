import { NextRequest, NextResponse } from 'next/server';
import { setAuditActor } from '@ejo/database';
import { isCronRequest } from '@/lib/cron-auth';
import { recordJobRun } from '@/lib/job-runs';
import { logFailure } from '@/lib/log';
import { mailKey } from '@/lib/mail/config';
import { pollSupportMailboxes } from '@/lib/support/intake';
import { runSupportAutomations } from '@/lib/support/automations';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * The Support centre's run (every 2–5 minutes, Supabase scheduler; protected
 * by CRON_SECRET): new mail to the support addresses, then the automations
 * (Enyo's reading and answers, targets, reminders, closing, surveys) — each
 * within what is left of the time limit. Safe to call more often: every step
 * is idempotent and a mailbox is read by one run at a time.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  setAuditActor(null, 'cron:support');
  const started = Date.now();
  const intake = mailKey()
    ? await pollSupportMailboxes(20_000).catch((err) => { logFailure('Support intake failed', err); return null; })
    : null;
  const left = 52_000 - (Date.now() - started);
  const auto = left > 5_000 ? await runSupportAutomations(left).catch((err) => { logFailure('Support automations failed', err); return null; }) : null;
  await recordJobRun('support', { ...(intake ?? {}), ...(auto ?? {}) });
  return NextResponse.json({ ok: true, intake, automations: auto });
}
