import { guardPage } from '@/lib/authz/server';
import { getSupportSetup } from '@/lib/actions/support-admin';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon, SectionCard, StatusChip } from '@/components/ui';
import { AI_MODE_LABEL, HANDOVER_REASON_LABEL, QUEUE_KIND_LABEL } from '@/lib/support/core';
import { SupportSetupFrame } from './shared';

export const metadata = { title: 'Support centre set-up' };
export const dynamic = 'force-dynamic';

/** Why a request goes to a person: situations that always need one, and times Enyo could not answer. */
const ALWAYS_A_PERSON = ['customer_asked', 'complaint', 'negative_mood', 'money', 'legal', 'safety', 'urgent', 'repeat_contact', 'access_off', 'deactivated', 'no_account', 'staff_help'] as const;
const ENYO_COULD_NOT = ['no_knowledge', 'low_confidence', 'needs_records', 'unverified_sender', 'unknown_contacts', 'triage_failed', 'automated_sender', 'queue_off', 'chat_handover'] as const;

/**
 * Support centre set-up — the overview: who does what (people and Enyo),
 * which requests always go to a person and why, and the state of every team.
 * Each part is set on its own page (the tabs).
 */
export default async function SupportSetupOverview({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('support.manage', '/settings/support');
  const sp = await searchParams;
  const s = await getSupportSetup();
  const active = s.queues.filter((q) => q.active);
  const addresses = s.queues.reduce((n, q) => n + q.mailboxes.length, 0);
  const problems = s.queues.flatMap((q) => q.mailboxes.filter((m) => m.status !== 'ACTIVE' && m.status !== 'PAUSED').map((m) => ({ q, m })));
  const unstaffed = active.filter((q) => !q.members.length);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <SupportSetupFrame active="/settings/support" icon="inbox" title="Support centre set-up" sp={sp}
      description="Requests from customers and colleagues — by email, the website, the customer portal and Get help — land in one place, get a SUP number, a team, a target and an owner. This page shows who does what; each part is set on its own tab.">

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: '/settings/support/teams', icon: 'users' as const, title: plural(active.length, 'active team', 'active teams'), text: `${plural(addresses, 'address', 'addresses')} connected` },
          { href: '/settings/support/hours', icon: 'clock' as const, title: 'Hours & holidays', text: s.settings.holidayCalendar ? 'Nigerian public holidays: automatic' : 'Public holidays: not used' },
          { href: '/settings/support/enyo', icon: 'sparkles' as const, title: `Enyo answers when ≥ ${Math.round(s.settings.aiThreshold * 100)}% sure`, text: `${active.filter((q) => q.aiMode === 'AUTO').length} of ${active.length} teams let Enyo answer` },
          { href: '/settings/support/follow-ups', icon: 'bell' as const, title: `Reminder after ${s.settings.nudgeAfterHours} h`, text: `Resolved after ${s.settings.autoResolveDays} days without reply` },
        ].map((c) => (
          <LoadingLink key={c.href} href={c.href} className="group rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 hover:border-[var(--ejo-primary)]/50">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={c.icon} size={17} /></span>
            <p className="mt-3 text-sm font-semibold text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">{c.title}</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">{c.text}</p>
          </LoadingLink>
        ))}
      </div>

      {problems.length || unstaffed.length || !s.mailReady ? (
        <SectionCard icon="alert" tone="warning" title="Needs attention">
          <ul className="space-y-2 text-sm text-[var(--ejo-text)]">
            {!s.mailReady ? <li>Email is not set up for this installation yet (MAILBOX_ENCRYPTION_KEY in the hosting settings), so support addresses cannot be connected. Website, customer-portal and Get help requests work already.</li> : null}
            {problems.map(({ q, m }) => <li key={m.id}><LoadingLink href={`/settings/support/teams/${q.id}#addresses`} className="font-medium text-[var(--ejo-primary)] hover:underline">{m.address}</LoadingLink> ({q.name}) cannot be read: {m.lastError ?? 'check the password'}.</li>)}
            {unstaffed.map((q) => <li key={q.id}><LoadingLink href={`/settings/support/teams/${q.id}#people`} className="font-medium text-[var(--ejo-primary)] hover:underline">{q.name}</LoadingLink> has nobody working it: requests wait unassigned.</li>)}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon="user" title="What people do" description="Customer care and the other support teams">
          <ul className="space-y-2 text-sm text-[var(--ejo-text)]">
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-success)]" />Own every request: each one is given to the least busy colleague on its team (not those marked away), and shows on the <LoadingLink href="/crm/support" className="font-medium text-[var(--ejo-primary)] hover:underline">Support centre</LoadingLink> with its target time.</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-success)]" />Answer anything about money, complaints, safety, the law, or a person&apos;s own records and access — Enyo never does.</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-success)]" />Check, change and send Enyo&apos;s drafts; check Enyo&apos;s own replies on <LoadingLink href="/crm/support/enyo" className="font-medium text-[var(--ejo-primary)] hover:underline">Enyo&apos;s replies</LoadingLink>.</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-success)]" />Approve good answers on <LoadingLink href="/enyo/learning" className="font-medium text-[var(--ejo-primary)] hover:underline">Enyo learning</LoadingLink> — only approved answers are reused.</li>
          </ul>
        </SectionCard>
        <SectionCard icon="sparkles" title="What Enyo does" description="The AI assistant — never the decision-maker">
          <ul className="space-y-2 text-sm text-[var(--ejo-text)]">
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-primary)]" />Reads every request: topic, urgency, mood, a short summary for the colleague, and who is writing (customer or colleague, proven or not).</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-primary)]" />Drafts a reply for the colleague in teams set to “{AI_MODE_LABEL.SUGGEST.label}”.</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-primary)]" />In teams set to “{AI_MODE_LABEL.AUTO.label}”, answers general questions itself — only when it is at least {Math.round(s.settings.aiThreshold * 100)}% sure, from approved answers, labelled as the AI, with “Solved” and “Talk to a person” buttons.</li>
            <li className="flex gap-2"><Icon name="close" size={15} className="mt-0.5 shrink-0 text-[var(--ejo-error)]" />Never approves, refunds, promises, or changes anyone&apos;s access, and never discusses someone&apos;s records unless they are proven to be that person.</li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard icon="handshake" title="When a request goes to a person, and why" description="Every hand-over records its reason; the Support centre and Enyo’s replies page show it on the request.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Always a person (by design)</p>
            <ul className="space-y-1.5 text-sm text-[var(--ejo-text)]">{ALWAYS_A_PERSON.map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-warning)]" />{HANDOVER_REASON_LABEL[r]}</li>)}</ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Enyo could not answer (things to improve)</p>
            <ul className="space-y-1.5 text-sm text-[var(--ejo-text)]">{ENYO_COULD_NOT.map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-info)]" />{HANDOVER_REASON_LABEL[r]}</li>)}</ul>
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">The <LoadingLink href="/crm/support/enyo" className="font-medium text-[var(--ejo-primary)] hover:underline">Enyo&apos;s replies</LoadingLink> page groups these and says what to fix (an answer to approve, a missing contact detail, a rule).</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon="users" title="Teams" description="Each team has its own addresses, people, targets and Enyo setting." actions={<LoadingLink href="/settings/support/teams#new-queue" className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-xs font-medium text-white"><Icon name="plus" size={14} />Add a team</LoadingLink>} flush>
        {s.queues.length ? (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {s.queues.map((q) => (
              <li key={q.id}>
                <LoadingLink href={`/settings/support/teams/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--ejo-bg)] sm:px-5">
                  <span className="font-medium text-[var(--ejo-text)]">{q.name}</span>
                  <StatusChip tone={q.active ? 'success' : 'neutral'} label={q.active ? 'Active' : 'Switched off'} />
                  {q.isDefault ? <StatusChip tone="info" label="Default" /> : null}
                  <span className="text-xs text-[var(--ejo-text-muted)]">{QUEUE_KIND_LABEL[q.kind]} · {AI_MODE_LABEL[q.aiMode].label} · {plural(q.members.length, 'colleague', 'colleagues')} · {plural(q.mailboxes.length, 'address', 'addresses')}</span>
                </LoadingLink>
              </li>
            ))}
          </ul>
        ) : <p className="p-4 text-sm text-[var(--ejo-text-muted)]">No team yet. The first request creates “General support”; add teams such as Customer care &amp; complaints, Warranty, Technical and Staff help.</p>}
      </SectionCard>
    </SupportSetupFrame>
  );
}
