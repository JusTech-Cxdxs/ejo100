import type { ReactNode } from 'react';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FilterSelect } from '@/components/FilterSelect';
import { PageHeader, SubNav, type IconName } from '@/components/ui';
import { AI_MODES, AI_MODE_LABEL, DEFAULT_TARGETS, PRIORITIES, PRIORITY_LABEL, QUEUE_KINDS, QUEUE_KIND_LABEL, type Targets } from '@/lib/support/core';

/**
 * Pieces shared by the Support centre set-up pages: each part is its own page
 * (overview, teams, one team, hours and holidays, Enyo, follow-ups), with the
 * same tabs on top so an administrator always sees where they are.
 */

export const SUPPORT_TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/settings/support', label: 'Overview', icon: 'info' },
  { href: '/settings/support/teams', label: 'Teams & addresses', icon: 'users' },
  { href: '/settings/support/hours', label: 'Hours & holidays', icon: 'clock' },
  { href: '/settings/support/enyo', label: 'Enyo’s part', icon: 'sparkles' },
  { href: '/settings/support/follow-ups', label: 'Follow-ups', icon: 'bell' },
];

export const input = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
export const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
export const btn = 'min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-medium text-white hover:brightness-110';
export const btn2 = 'min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50';

const STATUS: Record<string, string> = {
  queue_saved: 'Team saved.', members_saved: 'Saved who works this team.', mailbox_connected: 'Mailbox connected. New mail to it becomes support requests within a few minutes.',
  mailbox_pause: 'Mailbox paused: it is not read or sent from until you resume it.', mailbox_resume: 'Mailbox resumed.', mailbox_remove: 'Mailbox removed and its stored password deleted.',
  hours_saved: 'Opening hours saved.', holidays_saved: 'Holidays saved.', enyo_saved: 'Enyo’s rules saved.', followups_saved: 'Follow-up rules saved.',
};

/** The page frame: title, the set-up tabs, and the result of the last save. */
export function SupportSetupFrame({ active, title, description, icon, sp, children }: { active: string; title: string; description: ReactNode; icon: IconName; sp: { status?: string; error?: string }; children: ReactNode }) {
  return (
    <div className="w-full max-w-6xl space-y-6 p-4 pb-28 sm:p-8 sm:pb-28">
      <PageHeader icon={icon} eyebrow="Settings · Support centre" title={title} back={{ href: '/settings#support', label: 'Settings' }} description={description} />
      <SubNav tabs={SUPPORT_TABS} active={active} label="Support centre set-up" />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {sp.status && STATUS[sp.status] ? <FormFeedbackBanner kind="success" message={STATUS[sp.status]!} /> : null}
      {children}
    </div>
  );
}

/** Save bar at the end of a form: in the flow of the page (never floating over other content). */
export function SaveRow({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--ejo-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
      {note ? <p className="text-xs text-[var(--ejo-text-muted)]">{note}</p> : <span />}
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function TargetsFields({ t }: { t: Targets }) {
  return (
    <fieldset className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
      <legend className="px-1 text-xs font-medium text-[var(--ejo-text-muted)]">Targets (first answer in minutes, solution in hours; urgent counts every hour, the rest opening hours only)</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PRIORITIES.map((p) => (
          <div key={p} className="min-w-0 space-y-1.5">
            <p className="text-xs font-semibold text-[var(--ejo-text)]">{PRIORITY_LABEL[p]}</p>
            <label className="block text-[11px] text-[var(--ejo-text-muted)]">First answer (min)<input name={`${p}_first`} type="number" min={5} max={86400} defaultValue={t[p].first} className={input} /></label>
            <label className="block text-[11px] text-[var(--ejo-text-muted)]">Solved within (h)<input name={`${p}_resolve`} type="number" min={1} max={1440} step="0.5" defaultValue={Math.round((t[p].resolve / 60) * 10) / 10} className={input} /></label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export type QueueForForm = { id: string; name: string; kind: string; description: string | null; branchId: string | null; aiMode: string; autoAcknowledge: boolean; isDefault: boolean; active: boolean; signature: string | null; ackMessage?: string | null; targets: Targets };

export function QueueFields({ q, branches }: { q?: QueueForForm; branches: { id: string; name: string }[] }) {
  const k = q?.id ?? 'new';
  return (
    <>
      {q ? <input type="hidden" name="id" value={q.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor={`qn-${k}`}>Team name</label><input id={`qn-${k}`} name="name" required maxLength={60} defaultValue={q?.name ?? ''} className={input} autoComplete="off" /></div>
        <div><span className={label}>What it handles</span>
          <FilterSelect name="kind" required large ariaLabel="What the team handles" placeholder="Search kinds of request…" defaultValue={q?.kind ?? 'general'} options={QUEUE_KINDS.map((x) => ({ value: x, label: QUEUE_KIND_LABEL[x] }))} /></div>
        <div><span className={label}>Branch</span>
          <FilterSelect name="branchId" large ariaLabel="Branch" placeholder="Search branches (empty: the whole organisation)…" defaultValue={q?.branchId ?? undefined} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Leave empty for the whole organisation.</p></div>
        <div><span className={label}>How Enyo helps</span>
          <FilterSelect name="aiMode" required large ariaLabel="How Enyo helps" placeholder="Search…" defaultValue={q?.aiMode ?? 'SUGGEST'} options={AI_MODES.map((m) => ({ value: m, label: AI_MODE_LABEL[m].label }))} /></div>
      </div>
      <ul className="space-y-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-xs text-[var(--ejo-text-muted)]">{AI_MODES.map((m) => <li key={m}><span className="font-medium text-[var(--ejo-text)]">{AI_MODE_LABEL[m].label}:</span> {AI_MODE_LABEL[m].help}</li>)}</ul>
      <div><label className={label} htmlFor={`qd-${k}`}>Description (optional)</label><input id={`qd-${k}`} name="description" maxLength={300} defaultValue={q?.description ?? ''} className={input} /></div>
      <div><label className={label} htmlFor={`qs-${k}`}>Signature under replies (optional)</label><textarea id={`qs-${k}`} name="signature" rows={2} maxLength={300} defaultValue={q?.signature ?? ''} className={input} /></div>
      <div>
        <label className={label} htmlFor={`qack-${k}`}>Automatic reply: the team’s own words (optional)</label>
        <textarea id={`qack-${k}`} name="ackMessage" rows={3} maxLength={600} defaultValue={q?.ackMessage ?? ''} className={input} />
        <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Sent to everyone who emails this team, above the reference number and when to expect an answer — for example opening times, what to include (plate number, photos) or an emergency line. Plain words only.</p>
      </div>
      <TargetsFields t={q?.targets ?? DEFAULT_TARGETS} />
      <div className="flex flex-col gap-2 text-sm text-[var(--ejo-text)]">
        <label className="inline-flex min-h-10 items-start gap-2"><input type="checkbox" name="autoAcknowledge" defaultChecked={q?.autoAcknowledge ?? true} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ejo-primary)]" />Send an acknowledgement with the reference and when to expect an answer</label>
        <label className="inline-flex min-h-10 items-start gap-2"><input type="checkbox" name="isDefault" defaultChecked={q?.isDefault ?? false} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ejo-primary)]" />Default team (chat hand-overs and anything not sorted)</label>
        {q ? (
          <div className="max-w-xs"><span className={label}>Status</span><FilterSelect name="active" large ariaLabel="Team status" placeholder="Search…" defaultValue={q.active ? 'on' : 'off'} options={[{ value: 'on', label: 'Active' }, { value: 'off', label: 'Switched off' }]} /></div>
        ) : null}
      </div>
    </>
  );
}

/** Targets as a small read-only table (first answer and solved within, per priority). */
export function TargetsView({ t }: { t: Targets }) {
  const show = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);
  return (
    <table className="w-full text-left text-sm">
      <thead><tr className="text-xs text-[var(--ejo-text-muted)]"><th className="py-1 font-medium">Priority</th><th className="py-1 font-medium">First answer</th><th className="py-1 font-medium">Solved within</th></tr></thead>
      <tbody>{PRIORITIES.map((p) => <tr key={p} className="border-t border-[var(--ejo-border)]"><td className="py-1.5 font-medium text-[var(--ejo-text)]">{PRIORITY_LABEL[p]}</td><td className="py-1.5 text-[var(--ejo-text)]">{show(t[p].first)}</td><td className="py-1.5 text-[var(--ejo-text)]">{show(t[p].resolve)}</td></tr>)}</tbody>
    </table>
  );
}
