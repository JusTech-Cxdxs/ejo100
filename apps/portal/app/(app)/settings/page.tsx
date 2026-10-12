import { jobStatuses } from '@/lib/job-runs';
import { getPrincipal, guardPage } from '@/lib/authz/server';
import { formatDateTime } from '@/lib/utils/format-date';
import { PageHeader } from '@/components/ui';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6';

function ago(d: Date | null): string {
  if (!d) return 'Never yet';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(h / 24);
  return `${days} days ago`;
}

const LABEL: Record<string, string> = { remindersSent: 'reminders sent', broadcastEmailsSent: 'broadcast emails sent', digestsSent: 'digests sent', branchesWithOpenAlerts: 'branches with open alerts', emailsSent: 'emails sent', emailsFailed: 'emails failed', rolesChanged: 'roles changed' };

/** Settings — the health of everything that runs on its own. */
export default async function SettingsPage() {
  await guardPage('admin.settings.manage', '/settings');
  const [{ jobs, emails7d }, p] = await Promise.all([jobStatuses(), getPrincipal()]);
  return (
    <div className="p-8">
      <PageHeader
        icon="settings"
        title="Settings"
        description={<>What runs on its own, and whether it is working.</>}
      />

      <section className={`${card} mt-8`}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Scheduled jobs</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Each run is recorded. A job that sends nothing has simply found nothing to send (no appointments today, no open alerts).</p>
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
