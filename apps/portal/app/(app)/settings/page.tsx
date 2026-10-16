import Link from 'next/link';
import { jobStatuses } from '@/lib/job-runs';
import { schemaHealth } from '@/lib/schema-health';
import { getPrincipal, guardPage } from '@/lib/authz/server';
import { decide, type PermissionKey } from '@/lib/authz/catalogue';
import { formatDateTime, formatRelative } from '@/lib/utils/format-date';
import { Icon, PageHeader, type IconName } from '@/components/ui';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';

const LABEL: Record<string, string> = { remindersSent: 'reminders sent', broadcastEmailsSent: 'broadcast emails sent', digestsSent: 'digests sent', branchesWithOpenAlerts: 'branches with open alerts', emailsSent: 'emails sent', emailsFailed: 'emails failed', rolesChanged: 'roles changed', errorReferencesRemoved: 'old error references removed' };

type Area = { href: string; icon: IconName; title: string; text: string; needs: PermissionKey };
type Group = { id: string; title: string; text: string; areas: Area[] };

/** Every administration area, grouped the way people look for them. Each shows only to people who may open it. */
const GROUPS: Group[] = [
  {
    id: 'organisation', title: 'Organisation', text: 'Who you are and how you are organised.',
    areas: [
      { href: '/organisation', icon: 'building', title: 'Organisation profile', text: 'Name, logo, contacts, business units and the website ID.', needs: 'admin.organisation.manage' },
      { href: '/organisation/people', icon: 'users', title: 'People we publish', text: 'Leadership and heads of department Enyo can introduce (“who is …”).', needs: 'admin.organisation.manage' },
      { href: '/branches', icon: 'branch', title: 'Branches and departments', text: 'Locations, departments and teams.', needs: 'admin.structure.manage' },
      { href: '/structure', icon: 'sitemap', title: 'Structure', text: 'Reporting lines and who approves what.', needs: 'admin.structure.manage' },
    ],
  },
  {
    id: 'people', title: 'People and access', text: 'Who can sign in and what each person may see and do.',
    areas: [
      { href: '/users', icon: 'users', title: 'Users', text: 'Invite staff, reset access, assign roles and branches.', needs: 'admin.users.manage' },
      { href: '/roles', icon: 'shield', title: 'Roles', text: 'The roles people hold and what each covers.', needs: 'admin.roles.manage' },
      { href: '/permissions', icon: 'key', title: 'Permissions', text: 'Every permission, and which roles have it.', needs: 'admin.roles.manage' },
    ],
  },
  {
    id: 'enyo', title: 'Enyo (AI)', text: 'The assistant, what it learns from and the models it uses.',
    areas: [
      { href: '/settings/enyo', icon: 'sparkles', title: 'Enyo settings', text: 'Switch features on or off, the go-live learning day, and the language model test.', needs: 'enyo.manage' },
      { href: '/enyo/models', icon: 'layers', title: 'Models', text: 'Choose the trained models in use and how far each capability goes.', needs: 'enyo.manage' },
      { href: '/enyo/learning', icon: 'trend-up', title: 'Learning and training data', text: 'Accuracy, data quality and the training export.', needs: 'enyo.manage' },
    ],
  },
  {
    id: 'support', title: 'Customer support', text: 'The Support centre: teams and their email addresses, hours, targets and how Enyo answers.',
    areas: [
      { href: '/settings/support', icon: 'inbox', title: 'Support centre set-up', text: 'Teams (support@, warranty@, technical@ …), who works them, opening hours, targets and Enyo’s replies.', needs: 'support.manage' },
      { href: '/crm/support/analytics', icon: 'chart', title: 'Support numbers', text: 'First answer, targets met, Enyo’s share, satisfaction and topics.', needs: 'support.tickets.manage' },
    ],
  },
  {
    id: 'records', title: 'Records and compliance', text: 'What changed, who changed it, and what was removed.',
    areas: [
      { href: '/audit-logs', icon: 'history', title: 'Audit logs', text: 'Every change and sign-in, searchable.', needs: 'audit.view' },
      { href: '/audit-logs/errors', icon: 'alert', title: 'Error log', text: 'Every error reference people were shown, with what happened — for IT.', needs: 'audit.view' },
      { href: '/recycle-bin', icon: 'trash', title: 'Recycle bin', text: 'Restore removed records before they are deleted for good.', needs: 'admin.recycle_bin.manage' },
    ],
  },
];

/** Settings — one place for every administration area, then the health of what runs on its own. */
export default async function SettingsPage() {
  await guardPage('admin.settings.manage', '/settings');
  const [{ jobs, emails7d }, p, schema] = await Promise.all([jobStatuses(), getPrincipal(), schemaHealth()]);
  const groups = GROUPS.map((g) => ({ ...g, areas: g.areas.filter((a) => decide(p, a.needs).allowed) })).filter((g) => g.areas.length);
  const late = jobs.filter((j) => !j.lastRun || Date.now() - j.lastRun.getTime() > (j.key === 'appointment-reminders' || j.key.startsWith('support') ? 3_600_000 : 3 * 86_400_000));

  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader icon="settings" title="Settings" description="Every administration area in one place, and whether the automatic jobs are running." />

      <nav aria-label="Settings areas" className="mt-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {[...groups.map((g) => ({ id: g.id, title: g.title })), { id: 'health', title: 'System health' }].map((g) => (
          <a key={g.id} href={`#${g.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)] sm:min-h-9">{g.title}</a>
        ))}
      </nav>

      <div className="mt-6 space-y-8">
        {groups.map((g) => (
          <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-24">
            <h2 id={`${g.id}-title`} className="text-base font-semibold text-[var(--ejo-text)]">{g.title}</h2>
            <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">{g.text}</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.areas.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className={`${card} group flex h-full items-start gap-3 p-4 transition-colors hover:border-[color-mix(in_srgb,var(--ejo-primary)_50%,var(--ejo-border))]`}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={a.icon} size={19} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--ejo-text)]">{a.title}<Icon name="chevron-right" size={16} className="shrink-0 text-[var(--ejo-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ejo-primary)]" /></span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--ejo-text-muted)]">{a.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section id="health" aria-labelledby="health-title" className="scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="health-title" className="text-base font-semibold text-[var(--ejo-text)]">System health</h2>
              <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">The jobs that run on their own. A run that sends nothing had nothing to send.</p>
            </div>
            <span role="status" className={`rounded-full px-3 py-1 text-xs font-semibold ${late.length ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text,var(--ejo-warning))]' : 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]'}`}>
              {late.length ? `${late.length} of ${jobs.length} not running on time` : `All ${jobs.length} running`}
            </span>
          </div>

          <div className={`${card} mt-3 flex flex-wrap items-start gap-3 p-4 sm:p-5`} data-testid="schema-health">
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${schema.state === 'current' ? 'bg-[var(--ejo-success)]' : schema.state === 'behind' ? 'bg-[var(--ejo-error)]' : 'bg-[var(--ejo-warning)]'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--ejo-text)]">Database {schema.state === 'current' ? `up to date (${schema.expected})` : schema.state === 'behind' ? `behind: at ${schema.at ?? 'an older version'}, this release needs ${schema.expected}` : 'version could not be checked'}</p>
              {schema.state === 'behind' ? (
                <>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--ejo-text-muted)]">{schema.missing.map((m) => <li key={m.column}>{m.version}: {m.what}</li>)}</ul>
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Redeploy the API service on Render (its build adds the missing tables and columns — the log ends with “[db-push] Done.”). Until then those features cannot save.</p>
                </>
              ) : <p className="text-xs text-[var(--ejo-text-muted)]">Checked against the database&apos;s own catalogue just now.</p>}
            </div>
          </div>

          <div className={`${card} mt-3 divide-y divide-[var(--ejo-border)]`}>
            {jobs.map((j) => {
              const stale = late.includes(j);
              const result = j.lastResult ? Object.entries(j.lastResult).filter(([k]) => k !== 'upTo').map(([k, v]) => `${String(v)} ${LABEL[k] ?? k}`).join(' · ') : '';
              return (
                <details key={j.key} className="group px-4 py-3 sm:px-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${stale ? 'bg-[var(--ejo-warning)]' : 'bg-[var(--ejo-success)]'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--ejo-text)]">{j.name}</span>
                      <span className="block text-xs text-[var(--ejo-text-muted)]" title={j.lastRun ? formatDateTime(j.lastRun) : undefined}>{stale ? 'Not running on time' : 'Running'} · last run {j.lastRun ? formatRelative(j.lastRun) : 'never yet'}</span>
                    </span>
                    <Icon name="chevron-down" size={16} className="shrink-0 text-[var(--ejo-text-muted)] transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 space-y-1 pl-5 text-xs text-[var(--ejo-text-muted)]">
                    <p>{j.does}</p>
                    <p>Runs: {j.when} · {j.runs7d} {j.runs7d === 1 ? 'run' : 'runs'} in 7 days</p>
                    {result ? <p>Last result: {result}</p> : null}
                  </div>
                </details>
              );
            })}
          </div>

          {p.isSuperAdmin ? (
            <div className={`${card} mt-4 p-4 sm:p-5`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name="mail" size={16} />Email delivery — last 7 days</h3>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">
                {emails7d.sent} sent · <span className={emails7d.failed ? 'text-[var(--ejo-error)]' : ''}>{emails7d.failed} failed</span>
              </p>
              {emails7d.lastError ? <p className="mt-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)]/10 p-3 text-xs text-[var(--ejo-error)]">Last error: {emails7d.lastError}</p> : null}
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Failures usually mean the mail settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) are missing or wrong in Vercel.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
