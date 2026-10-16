import { NextRequest, NextResponse } from 'next/server';
import { setAuditActor } from '@ejo/database';
import { isCronRequest } from '@/lib/cron-auth';
import { recordJobRun } from '@/lib/job-runs';
import { logFailure } from '@/lib/log';
import { mailKey } from '@/lib/mail/config';
import { pollSupportMailboxes } from '@/lib/support/intake';
import { runSupportAutomations } from '@/lib/support/automations';
import { integrityScanDue, scanAllOrganisations } from '@/lib/integrity/scan';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * The Support centre's scheduled runs (Supabase scheduler, CRON_SECRET):
 *  - default: new mail to the support addresses, then targets, reminders,
 *    resolving, closing and surveys;
 *  - `?step=enyo`: Enyo reads new requests (triage, then an answer or a
 *    draft) with the whole run to itself, as many as fit.
 * Safe to call more often: every step is idempotent, a mailbox is read by one
 * run at a time, and a ticket is held by one run while Enyo reads it.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const enyo = request.nextUrl.searchParams.get('step') === 'enyo';
  setAuditActor(null, enyo ? 'cron:support-enyo' : 'cron:support');
  const started = Date.now();
  if (enyo) {
    const auto = await runSupportAutomations(55_000, 'enyo').catch((err) => { logFailure('Support Enyo run failed', err); return null; });
    await recordJobRun('support-enyo', { ...(auto ? { read: auto.read, aiAnswered: auto.aiAnswered, drafted: auto.drafted } : { failed: true }) });
    return NextResponse.json({ ok: true, automations: auto });
  }
  const intake = mailKey()
    ? await pollSupportMailboxes(25_000).catch((err) => { logFailure('Support intake failed', err); return null; })
    : null;
  const left = 54_000 - (Date.now() - started);
  const auto = left > 5_000 ? await runSupportAutomations(left, 'rest').catch((err) => { logFailure('Support automations failed', err); return null; }) : null;
  await recordJobRun('support', { ...(intake ?? {}), ...(auto ? { normalised: auto.normalised, warned: auto.warned, breached: auto.breached, nudged: auto.nudged, resolved: auto.resolved, closed: auto.closed, surveyed: auto.surveyed, assumed: auto.assumed } : {}) });
  // Once a day, in the quiet hours (1–5 am Lagos), the integrity watch's checks run with what is left of this run.
  let integrity: Awaited<ReturnType<typeof scanAllOrganisations>> | null = null;
  const remaining = 56_000 - (Date.now() - started);
  if (remaining > 20_000 && await integrityScanDue().catch(() => false)) {
    setAuditActor(null, 'cron:integrity');
    integrity = await scanAllOrganisations(remaining - 4_000).catch((err) => { logFailure('Integrity scan failed', err); return null; });
    if (integrity) await recordJobRun('integrity-scan', integrity);
  }
  return NextResponse.json({ ok: true, intake, automations: auto, integrity });
}
