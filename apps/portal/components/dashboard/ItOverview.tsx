import { getItPulse } from '@/lib/actions/leadership';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon, SectionCard, StatTile } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * The IT overview on the dashboard: people and sign-ins, errors, access
 * changes, scheduled jobs, the database version, Enyo and the support
 * mailboxes — each opening the page where it is dealt with. For IT and
 * administrators (audit.view and admin.users.manage), their organisation.
 */
export async function ItOverview() {
  const p = await getItPulse();
  const health = [
    { ok: p.schema.state === 'current', label: p.schema.state === 'current' ? `Database up to date (${p.schema.expected})` : p.schema.state === 'behind' ? `Database behind: needs ${p.schema.expected}` : 'Database version not checked', href: '/settings#health' },
    { ok: p.jobs.late === 0, label: p.jobs.late ? `${pluralize(p.jobs.late, 'scheduled job')} not on time` : `All ${p.jobs.total} scheduled jobs on time`, href: '/settings#health' },
    { ok: p.enyo.ready, label: p.enyo.ready ? 'Enyo (AI) is on and connected' : 'Enyo (AI) is off or not connected', href: '/settings/enyo' },
    { ok: p.mailboxes.problems === 0, label: p.mailboxes.total ? (p.mailboxes.problems ? `${pluralize(p.mailboxes.problems, 'support mailbox')} cannot be read` : `${pluralize(p.mailboxes.total, 'support mailbox')} reading`) : 'No support mailboxes connected', href: '/settings/support/teams' },
  ];
  return (
    <section aria-labelledby="it-title" className="mb-6 space-y-4" data-testid="it-overview">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="it-title" className="flex items-center gap-2 text-base font-semibold text-[var(--ejo-text)]"><Icon name="shield" size={18} />Systems and access</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">As of {formatDateTime(p.asOf)}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <LoadingLink href="/settings#health" className="font-medium text-[var(--ejo-primary)] hover:underline">System health →</LoadingLink>
          <LoadingLink href="/audit-logs" className="font-medium text-[var(--ejo-primary)] hover:underline">Audit trail →</LoadingLink>
        </div>
      </div>

      <div className="ejo-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon="users" label="Active accounts" value={p.people.active} hint={`${p.people.switchedOff} switched off`} href="/users" />
        <StatTile icon="user-plus" label="Never signed in" value={p.people.neverSignedIn} hint="Resend their welcome" tone={p.people.neverSignedIn ? 'warning' : 'brand'} href="/users" />
        <StatTile icon="key" label="Sign-ins (24 h)" value={p.people.signedIn24h} href="/audit-logs" />
        <StatTile icon="lock" label="Failed sign-ins (24 h)" value={p.people.failed24h} hint={p.people.accountsUnderAttack ? `${pluralize(p.people.accountsUnderAttack, 'account')} with 5 or more` : 'No account targeted'} tone={p.people.accountsUnderAttack ? 'error' : p.people.failed24h ? 'warning' : 'brand'} emphasis={p.people.accountsUnderAttack > 0} href="/audit-logs" />
        <StatTile icon="alert" label="Errors (24 h)" value={p.errors.last24h} hint={`${p.errors.last7d} in 7 days`} tone={p.errors.last24h ? 'warning' : 'brand'} href="/audit-logs/errors" />
        <StatTile icon="shield" label="Refused access (24 h)" value={p.access.deniedAttempts24h} hint={`${pluralize(p.access.roleChanges7d, 'role change')}, ${pluralize(p.access.permissionChanges7d, 'permission change')} in 7 days`} href="/audit-logs" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard icon="activity" title="Health checks">
          <ul className="space-y-2">
            {health.map((h) => (
              <li key={h.label}>
                <LoadingLink href={h.href} className="flex items-center gap-2.5 text-sm text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.ok ? 'bg-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]'}`} />{h.label}
                </LoadingLink>
              </li>
            ))}
          </ul>
          {p.jobs.names.length ? <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Not on time: {p.jobs.names.join(', ')}.</p> : null}
        </SectionCard>
        <SectionCard icon="alert" title="Latest errors" description="The reference people were shown, newest first" actions={<LoadingLink href="/audit-logs/errors" className="font-medium text-[var(--ejo-primary)] hover:underline">Error log →</LoadingLink>}>
          {p.errors.latest.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {p.errors.latest.map((e) => (
                <li key={e.ref + e.at.toISOString()} className="py-2 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2"><span className="font-mono text-xs font-semibold text-[var(--ejo-text)]">{e.ref}</span><span className="text-xs text-[var(--ejo-text-muted)]">{formatRelative(e.at)}{e.path ? ` · ${e.path}` : ''}</span></p>
                  <p className="truncate text-xs text-[var(--ejo-text-muted)]">{e.message}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--ejo-success)]">No errors recorded.</p>}
        </SectionCard>
      </div>
    </section>
  );
}
