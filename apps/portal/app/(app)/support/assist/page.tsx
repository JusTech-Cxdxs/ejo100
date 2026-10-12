import { redirect } from 'next/navigation';
import { decide } from '@/lib/authz/catalogue';
import { currentAssist, getSignedInPrincipal } from '@/lib/authz/server';
import { listAssistSessionHistory, searchAssistableColleagues } from '@/lib/actions/assist';
import { assistMinutes } from '@/lib/assist/rules';
import { writeAuditLog } from '@/lib/workshop-core';
import { AssistConsentForm } from '@/components/AssistConsentForm';
import { AssistSessionList } from '@/components/AssistSessionList';
import { AuthNotice } from '@/components/AuthNotice';
import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, Icon, PageHeader, SectionCard } from '@/components/ui';

export const metadata = { title: 'Assist a colleague' };

/**
 * Assist a colleague: a Branch Assistant finds a colleague who is not at ease
 * with computers, the colleague types their own password as consent, and the
 * assistant works on their behalf for a short, recorded session.
 * User administrators see the history of every session in their reach.
 */
export default async function AssistPage({ searchParams }: { searchParams: Promise<{ q?: string; colleague?: string; ended?: string }> }) {
  const sp = await searchParams;
  // Always the person who signed in, never the colleague being helped.
  const p = await getSignedInPrincipal();
  // The platform team reviews sessions but never runs one (see assistRefusal).
  const canAssist = !p.isSuperAdmin && decide(p, 'support.assist').allowed;
  const canReview = decide(p, 'admin.users.manage').allowed;
  if (!canAssist && !canReview) {
    await writeAuditLog({ userId: p.userId, action: 'access.denied', entityType: 'Access', entityId: '/support/assist', metadata: { permission: 'support.assist', reason: 'No role grants this permission' } });
    redirect(`/access-denied?area=${encodeURIComponent('Help colleagues with their tasks (assisted session)')}`);
  }
  const assist = await currentAssist();
  const minutes = assistMinutes(process.env.ASSIST_SESSION_MINUTES);
  const q = (sp.q ?? '').slice(0, 80);
  const colleagues = canAssist && !assist ? await searchAssistableColleagues(q) : [];
  const chosen = sp.colleague ? colleagues.find((c) => c.id === sp.colleague) ?? null : null;
  const history = await listAssistSessionHistory();

  return (
    <div className="w-full max-w-5xl p-4 sm:p-8">
      <PageHeader
        icon="user-plus"
        title={canAssist ? 'Assist a colleague' : 'Assisted sessions'}
        description={canAssist
          ? 'Work on a colleague’s behalf while they sit with you: accept their Job Card, write the estimate together. They type their own password to agree, and everything you do is recorded for them, with your name beside it.'
          : 'Every time a Branch Assistant worked on a colleague’s behalf: who, for whom, when, for how long, and how many actions were recorded.'}
      />

      {sp.ended ? <div className="mb-5"><AuthNotice kind="success">The assisted session has ended. You are working as yourself again.</AuthNotice></div> : null}

      {canAssist && assist ? (
        <SectionCard icon="user-plus" tone="warning" title={`You are helping ${assist.subject.name}`} description="End this session before helping someone else. The End session button is in the bar at the top of every page.">
          <p className="text-sm text-[var(--ejo-text)]">Go to the <LoadingLink href="/dashboard" className="font-medium text-[var(--ejo-primary)] hover:underline">dashboard</LoadingLink> to continue with {assist.subject.name.split(/\s+/)[0]}&apos;s work.</p>
        </SectionCard>
      ) : null}

      {canAssist && !assist ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <SectionCard icon="search" title="Find the colleague" description="Only people in your branch whose work involves no approvals, money or administration are listed.">
            <form method="get" className="flex gap-2" role="search">
              <label htmlFor="assist-q" className="sr-only">Search colleagues</label>
              <input id="assist-q" name="q" defaultValue={q} placeholder="Name, employee ID or email" className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)] outline-none focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20" />
              <button type="submit" className="shrink-0 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-95">Search</button>
            </form>
            {colleagues.length === 0 ? (
              <EmptyState compact icon="users" title={q ? 'No one matches that search' : 'No colleagues to assist'}>
                {q ? 'Try part of the name or the employee ID.' : 'Nobody in your branch can be assisted right now.'}
              </EmptyState>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--ejo-border)]" aria-label="Colleagues you can assist">
                {colleagues.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ejo-text)]">{c.name}</p>
                      <p className="truncate text-xs text-[var(--ejo-text-muted)]">{[c.roleLabel, c.department, c.employeeId].filter(Boolean).join(' · ')}</p>
                    </div>
                    <LoadingLink
                      href={`/support/assist?${new URLSearchParams({ ...(q ? { q } : {}), colleague: c.id }).toString()}`}
                      aria-label={`Help ${c.name}`}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${chosen?.id === c.id ? 'bg-[var(--ejo-primary)] text-white ring-[var(--ejo-primary)]' : 'text-[var(--ejo-primary)] ring-[var(--ejo-primary)]/30 hover:bg-[var(--ejo-primary)]/10'}`}
                    >
                      Help <Icon name="arrow-right" size={13} />
                    </LoadingLink>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon="lock" title={chosen ? `Start helping ${chosen.name}` : 'Their consent'} description={chosen ? `${chosen.roleLabel}${chosen.department ? ` · ${chosen.department}` : ''}` : 'Choose a colleague first.'}>
            {chosen ? (
              <AssistConsentForm colleagueId={chosen.id} colleagueName={chosen.name} minutes={minutes} />
            ) : sp.colleague ? (
              <AuthNotice kind="error">This colleague is not someone you can assist. Managers and anyone who approves, handles money or administers the system must sign in themselves.</AuthNotice>
            ) : (
              <ul className="space-y-2 text-sm text-[var(--ejo-text)]">
                <li className="flex gap-2"><Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-[var(--ejo-primary)]" />The colleague sits with you and types their own password.</li>
                <li className="flex gap-2"><Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-[var(--ejo-primary)]" />You can do only what they can do. Their password, profile and settings stay closed.</li>
                <li className="flex gap-2"><Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-[var(--ejo-primary)]" />Every action is recorded as theirs, with your name beside it, and they are told when you finish.</li>
              </ul>
            )}
          </SectionCard>
        </div>
      ) : null}

      <SectionCard className="mt-6" icon="history" title={history.title} description="Most recent first. Actions recorded counts the changes made on the colleague’s behalf.">
        {history.rows.length === 0 ? (
          <EmptyState compact icon="history" title="No assisted sessions yet" />
        ) : (
          <AssistSessionList rows={history.rows} show={canReview ? 'both' : 'assistant'} />
        )}
      </SectionCard>
    </div>
  );
}
