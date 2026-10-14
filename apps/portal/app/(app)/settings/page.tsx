import { jobStatuses } from '@/lib/job-runs';
import { allows, getPrincipal, guardPage } from '@/lib/authz/server';
import { LoadingLink } from '@/components/LoadingLink';
import { formatDateTime, formatRelative } from '@/lib/utils/format-date';
import Link from 'next/link';
import { decide } from '@/lib/authz/catalogue';
import { PageHeader } from '@/components/ui';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6';

const ago = (d: Date | null): string => (d ? formatRelative(d) : 'Never yet');

const LABEL: Record<string, string> = { remindersSent: 'reminders sent', broadcastEmailsSent: 'broadcast emails sent', digestsSent: 'digests sent', branchesWithOpenAlerts: 'branches with open alerts', emailsSent: 'emails sent', emailsFailed: 'emails failed', rolesChanged: 'roles changed', errorReferencesRemoved: 'old error references removed' };

/** Settings — the health of everything that runs on its own. */
export default async function SettingsPage() {
  await guardPage('admin.settings.manage', '/settings');
  const [{ jobs, emails7d }, p, canManageEnyo] = await Promise.all([jobStatuses(), getPrincipal(), allows('enyo.manage')]);
  return (
    <div className="p-8">
      <PageHeader
        icon="settings"
        title="Settings"
        description={<>What runs on its own, and whether it is working.</>}
      />

      {decide(p, 'enyo.manage').allowed ? (
        <section className={`${card} mt-8 flex flex-wrap items-center justify-between gap-4`}>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Enyo</h2>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">The assistant built into the portal: switch features on or off, choose how estimate predictions are used, and test the language model.</p>
          </div>
          <Link href="/settings/enyo" className="inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">Enyo settings</Link>
        </section>
      ) : null}

      <section className={`${card} mt-8`}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Scheduled jobs</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Each run is recorded. A run that sends nothing had nothing to send (for example, no appointments today).</p>
        <div className="mt-4 divide-y divide-[var(--ejo-border)]">
          {jobs.map((j) => {
            const stale = !j.lastRun || Date.now() - j.lastRun.getTime() > (j.key === 'appointment-reminders' ? 3600000 : 3 * 86400000);
            return (
              <div key={j.key} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-medium text-[var(--ejo-text)]">{j.name}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{j.does}</p>
                  <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Runs: {j.when}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stale ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'}`}>{stale ? 'Not running on time' : 'Running'}</span>
                  <p className="mt-1 text-xs text-[var(--ejo-text)]" title={j.lastRun ? formatDateTime(j.lastRun) : undefined}>Last run: {ago(j.lastRun)}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{j.runs7d} {j.runs7d === 1 ? 'run' : 'runs'} in 7 days</p>
                  {j.lastResult ? (
                    <p className="text-xs text-[var(--ejo-text-muted)]">
                      {Object.entries(j.lastResult).filter(([k]) => k !== 'upTo').map(([k, v]) => `${String(v)} ${LABEL[k] ?? k}`).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {canManageEnyo ? (
        <section className={`${card} mt-6`} aria-labelledby="settings-enyo-learning">
          <h2 id="settings-enyo-learning" className="text-sm font-semibold text-[var(--ejo-text)]">Enyo — learning</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">How well Enyo predicts estimate lines from similar past jobs, whether it is ready to suggest them, and the training data export.</p>
          <LoadingLink href="/enyo/learning" className="mt-3 inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)] sm:min-h-9">Open Enyo learning</LoadingLink>
        </section>
      ) : null}

      {p.isSuperAdmin ? (
        <section className={`${card} mt-6`}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Email delivery — last 7 days</h2>
          <p className="mt-3 text-sm text-[var(--ejo-text)]">
            {emails7d.sent} sent · <span className={emails7d.failed ? 'text-[var(--ejo-error)]' : ''}>{emails7d.failed} failed</span>
          </p>
          {emails7d.lastError ? <p className="mt-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)]/10 p-3 text-xs text-[var(--ejo-error)]">Last error: {emails7d.lastError}</p> : null}
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Failures usually mean the mail settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) are missing or wrong in Vercel.</p>
        </section>
      ) : null}
    </div>
  );
}
