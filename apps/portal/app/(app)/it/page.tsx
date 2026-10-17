import { guardPage } from '@/lib/authz/server';
import { getItControlRoom } from '@/lib/actions/it';
import { LoadingLink } from '@/components/LoadingLink';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import { PageHeader, SectionCard, StatTile, StatusChip } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { PERMISSIONS, type PermissionKey } from '@/lib/authz/catalogue';
import { Suspense } from 'react';
import { ItTrendsSection, WebsiteSection } from '@/components/it/ItTrends';

export const metadata = { title: 'IT control room' };
export const dynamic = 'force-dynamic';

/** Seven days of sign-ins as paired bars (server-drawn), with the numbers for screen readers. */
function SignInBars({ days }: { days: { label: string; ok: number; failed: number }[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.ok, d.failed)));
  const W = 420, H = 120, slot = W / days.length, bw = Math.min(16, slot / 3);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="h-auto w-full" role="img" aria-label="Sign-ins and failed sign-ins per day, last seven days">
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--ejo-border)" />
        {days.map((d, i) => {
          const x = i * slot + slot / 2;
          const h1 = (d.ok / max) * (H - 8), h2 = (d.failed / max) * (H - 8);
          return (
            <g key={d.label}>
              <rect x={x - bw - 1} y={H - h1} width={bw} height={h1} rx="2" fill="var(--ejo-primary)"><title>{`${d.label}: ${d.ok} signed in`}</title></rect>
              <rect x={x + 1} y={H - h2} width={bw} height={h2} rx="2" fill="var(--ejo-error)" opacity="0.8"><title>{`${d.label}: ${d.failed} failed`}</title></rect>
              <text x={x} y={H + 14} textAnchor="middle" fontSize="10" fill="var(--ejo-text-muted)">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-[var(--ejo-text-muted)]"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--ejo-primary)]" />Signed in</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--ejo-error)]" />Failed</span></figcaption>
      <table className="sr-only"><caption>Sign-ins per day</caption><tbody>{days.map((d) => <tr key={d.label}><th>{d.label}</th><td>{d.ok} signed in</td><td>{d.failed} failed</td></tr>)}</tbody></table>
    </figure>
  );
}

/**
 * The IT control room: everything IT looks after, for the whole organisation
 * or the branch chosen in the branch bar — health checks, sign-ins and
 * sessions, people per branch, roles and access changes, refused attempts,
 * errors (with Enyo to explain any one), the Support centre, 14-day trends,
 * the public website's visitors and every scheduled job. Read-only; each section opens the page where it is managed.
 */
export default async function ItControlRoomPage() {
  await guardPage('audit.view', '/it');
  const it = await getItControlRoom();
  const p = it.pulse;
  const health = [
    { ok: p.schema.state === 'current', label: p.schema.state === 'current' ? `Database up to date (${p.schema.expected})` : p.schema.state === 'behind' ? `Database behind: needs ${p.schema.expected}` : 'Database version not checked', href: '/settings#health' },
    { ok: p.jobs.late === 0, label: p.jobs.late ? `${pluralize(p.jobs.late, 'scheduled job')} not on time` : `All ${p.jobs.total} scheduled jobs on time`, href: '/settings#health' },
    { ok: p.enyo.ready, label: p.enyo.ready ? 'Enyo (AI) on and connected' : 'Enyo (AI) off or not connected', href: '/settings/enyo' },
    { ok: p.mailboxes.problems === 0, label: p.mailboxes.total ? (p.mailboxes.problems ? `${pluralize(p.mailboxes.problems, 'support mailbox')} cannot be read` : `${pluralize(p.mailboxes.total, 'support mailbox')} reading`) : 'No support mailboxes connected', href: '/settings/support/teams' },
    { ok: p.people.accountsUnderAttack === 0, label: p.people.accountsUnderAttack ? `${pluralize(p.people.accountsUnderAttack, 'account')} with 5+ failed sign-ins today` : 'No account targeted by password guessing today', href: '/audit-logs' },
  ];
  const healthy = health.filter((h) => h.ok).length;
  const permLabel = (k: string) => (k in PERMISSIONS ? PERMISSIONS[k as PermissionKey].label : k);

  return (
    <div className="w-full max-w-[90rem] space-y-6 p-4 sm:p-8" data-testid="it-control-room">
      <PageHeader
        hero
        icon="shield"
        eyebrow={it.lensBranch ? `${it.lensBranch}: people, errors, refused attempts and support · the rest organisation-wide` : 'Whole organisation'}
        title="IT control room"
        description={`Systems, people, access, errors and support — as of ${formatDateTime(it.asOf)}. Read-only: each section opens the page where it is managed.`}
        actions={<AskEnyoButton variant="solid" send speak icon="speaker" label="Brief me on IT" question={`Give me a spoken IT briefing${it.lensBranch ? ` for ${it.lensBranch}` : ''}: health checks, sign-ins and failed sign-ins, accounts never used, access changes, refused attempts, the latest errors grouped by cause (use explain_error), the Support centre and scheduled jobs. End with the three things IT should do first.`} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon="activity" label="Health checks passing" value={`${healthy}/${health.length}`} tone={healthy === health.length ? 'brand' : 'warning'} href="/settings#health" />
        <StatTile icon="users" label="Active accounts" value={p.people.active} hint={`${p.people.switchedOff} switched off`} href="/users" />
        <StatTile icon="key" label="Signed in now" value={it.signIns.sessionsActive} hint="Sessions not yet expired" />
        <StatTile icon="lock" label="Failed sign-ins (24 h)" value={p.people.failed24h} tone={p.people.accountsUnderAttack ? 'error' : p.people.failed24h ? 'warning' : 'brand'} href="/audit-logs" />
        <StatTile icon="alert" label="Errors (7 days)" value={p.errors.last7d} hint={`${p.errors.last24h} today`} tone={p.errors.last24h ? 'warning' : 'brand'} href="/audit-logs/errors" />
        <StatTile icon="shield" label="Refused access (24 h)" value={p.access.deniedAttempts24h} hint={`${pluralize(p.access.roleChanges7d + p.access.permissionChanges7d, 'access change')} in 7 days`} href="/audit-logs" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard icon="activity" title="Health checks">
          <ul className="space-y-2">
            {health.map((h) => (
              <li key={h.label}><LoadingLink href={h.href} className="flex items-center gap-2.5 text-sm text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]"><span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.ok ? 'bg-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]'}`} />{h.label}</LoadingLink></li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard icon="key" title="Sign-ins, last seven days" description={`Last seen: ${it.signIns.lastSeen.d1} today · ${it.signIns.lastSeen.d7} this week · ${it.signIns.lastSeen.d30} this month · ${it.signIns.lastSeen.older} longer ago · ${it.signIns.lastSeen.never} never`}>
          <SignInBars days={it.signIns.days} />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard icon="branch" title="People per branch" flush actions={<LoadingLink href="/users" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Users →</LoadingLink>}>
          <table className="w-full text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--ejo-text-muted)]"><th className="px-4 py-2 font-semibold">Branch</th><th className="px-3 py-2 text-right font-semibold">People</th><th className="px-3 py-2 text-right font-semibold">Active 7 d</th><th className="px-4 py-2 text-right font-semibold">Never</th></tr></thead>
            <tbody>{it.branches.map((b) => <tr key={b.id} className="border-t border-[var(--ejo-border)]"><td className="px-4 py-2 font-medium">{b.name}</td><td className="px-3 py-2 text-right tabular-nums">{b.people}</td><td className="px-3 py-2 text-right tabular-nums">{b.active7d}</td><td className={`px-4 py-2 text-right tabular-nums ${b.neverSignedIn ? 'text-[var(--ejo-warning-text)]' : ''}`}>{b.neverSignedIn}</td></tr>)}</tbody>
          </table>
        </SectionCard>
        <SectionCard icon="shield" title="Roles in use" actions={<LoadingLink href="/roles" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Roles →</LoadingLink>}>
          <ul className="space-y-1.5 text-sm">
            {it.roles.filter((r) => r.people > 0).slice(0, 12).map((r) => {
              const max = Math.max(1, ...it.roles.map((x) => x.people));
              return <li key={r.name} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{r.name}</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--ejo-bg)]"><span className="block h-full rounded-full bg-[var(--ejo-primary)]" style={{ width: `${Math.round((r.people / max) * 100)}%` }} /></span><span className="w-6 text-right tabular-nums">{r.people}</span></li>;
            })}
            {it.roles.every((r) => r.people === 0) ? <li className="text-[var(--ejo-text-muted)]">Nobody holds a role yet.</li> : null}
          </ul>
        </SectionCard>
        <SectionCard icon="lock" title="Refused attempts, 7 days" description="What people tried without the permission">
          {it.denied.length ? <ul className="space-y-1.5 text-sm">{it.denied.map((d) => <li key={d.permission} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{permLabel(d.permission)}</span><span className="font-semibold tabular-nums">{d.count}</span></li>)}</ul> : <p className="text-sm text-[var(--ejo-success)]">Nothing refused.</p>}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard icon="alert" title="Errors" description="The references people were shown, newest first. Enyo explains any one in plain words." flush
          actions={<LoadingLink href="/audit-logs/errors" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Error log →</LoadingLink>}>
          {it.errors.byKind.length ? <p className="flex flex-wrap gap-1.5 border-b border-[var(--ejo-border)] px-4 py-2.5">{it.errors.byKind.map((k) => <StatusChip key={k.kind} tone="neutral" label={`${k.label} · ${k.count}`} />)}</p> : null}
          {it.errors.latest.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {it.errors.latest.map((e) => (
                <li key={e.ref + e.at.toISOString()} className="flex flex-wrap items-start gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2"><span className="font-mono text-xs font-semibold">{e.ref}</span><span className="text-xs text-[var(--ejo-text-muted)]">{e.kind} · {formatRelative(e.at)}{e.path ? ` · ${e.path}` : ''}</span></p>
                    <p className="truncate text-xs text-[var(--ejo-text-muted)]">{e.message}</p>
                  </div>
                  <AskEnyoButton send question={`Explain error ${e.ref} in plain words: what happened, the likely cause, whether any data could be affected, and what IT should check next.`} label="Explain" />
                </li>
              ))}
            </ul>
          ) : <p className="p-4 text-sm text-[var(--ejo-success)]">No errors recorded.</p>}
          {it.errors.byRoute.length ? <p className="border-t border-[var(--ejo-border)] px-4 py-2.5 text-xs text-[var(--ejo-text-muted)]">Most affected pages (7 days): {it.errors.byRoute.map((r) => `${r.route} (${r.count})`).join(' · ')}</p> : null}
        </SectionCard>
        <div className="space-y-6">
          <SectionCard icon="history" title="Access changes" description="Roles given and removed, permissions changed, accounts added and switched off" actions={<LoadingLink href="/audit-logs" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Audit trail →</LoadingLink>}>
            {it.accessChanges.length ? <ul className="space-y-2 text-sm">{it.accessChanges.map((c, i) => <li key={i}><p className="font-medium">{c.action}{c.detail ? <span className="font-normal text-[var(--ejo-text-muted)]"> · {c.detail}</span> : null}</p><p className="text-xs text-[var(--ejo-text-muted)]">by {c.by} · {formatRelative(c.at)}</p></li>)}</ul> : <p className="text-sm text-[var(--ejo-text-muted)]">No access changes yet.</p>}
          </SectionCard>
          <SectionCard icon="inbox" title="Support centre" actions={<LoadingLink href="/settings/support" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Set-up →</LoadingLink>}>
            {it.support.length ? <ul className="space-y-1.5 text-sm">{it.support.map((q) => <li key={q.name} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{q.name}</span><span className="tabular-nums">{q.open} open</span>{q.late ? <span className="font-semibold text-[var(--ejo-error)]">{q.late} late</span> : null}{q.unassigned ? <span className="text-[var(--ejo-warning-text)]">{q.unassigned} without owner</span> : null}</li>)}</ul> : <p className="text-sm text-[var(--ejo-text-muted)]">No support teams yet.</p>}
          </SectionCard>
        </div>
      </div>

      {/* Streamed in: the rest of the room never waits for the 14-day trends or the website report. */}
      <Suspense fallback={<SectionCard icon="chart" title="Trends, last 14 days"><p className="text-sm text-[var(--ejo-text-muted)]">Loading the trends…</p></SectionCard>}><ItTrendsSection /></Suspense>
      <Suspense fallback={<SectionCard icon="globe" title="Website visitors"><p className="text-sm text-[var(--ejo-text-muted)]">Loading the website report…</p></SectionCard>}><WebsiteSection /></Suspense>

      <SectionCard icon="clock" title="Scheduled jobs" description="Every background job, when it last ran, and runs in the last seven days" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--ejo-text-muted)]"><th className="px-4 py-2 font-semibold">Job</th><th className="px-3 py-2 font-semibold">When</th><th className="px-3 py-2 font-semibold">Last run</th><th className="px-3 py-2 text-right font-semibold">Runs 7 d</th><th className="px-4 py-2 font-semibold">Status</th></tr></thead>
            <tbody>{it.jobs.map((j) => <tr key={j.key} className="border-t border-[var(--ejo-border)]"><td className="px-4 py-2 font-medium">{j.name}</td><td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{j.when}</td><td className="px-3 py-2 text-xs">{j.lastRun ? formatRelative(j.lastRun) : 'Never'}</td><td className="px-3 py-2 text-right tabular-nums">{j.runs7d}</td><td className="px-4 py-2"><StatusChip tone={j.late ? 'warning' : 'success'} label={j.late ? 'Not on time' : 'On time'} /></td></tr>)}</tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
