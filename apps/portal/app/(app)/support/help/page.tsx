import Link from 'next/link';
import { listMyHelpRequests } from '@/lib/actions/help';
import { currentAssist, getPrincipal } from '@/lib/authz/server';
import { guideFor } from '@/lib/help/features';
import { GuideBrowser } from '@/components/support/GuideBrowser';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import { PageHeader, SectionCard, EmptyState, StatusChip, type Tone } from '@/components/ui';
import { NewHelpForm } from '@/components/support/HelpForms';
import { formatRelative } from '@/lib/utils/format-date';

export const metadata = { title: 'Get help' };
export const dynamic = 'force-dynamic';

const TEAM: Record<string, string> = { portal: 'Our administrators', fault: 'EJO platform team', complaint: 'Customer care', hr: 'HR & people' };
const TONE: Record<string, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', ON_HOLD: 'neutral', RESOLVED: 'success', CLOSED: 'neutral' };

/**
 * Get help: a colleague asks their administrators (or the EJO platform team)
 * for help — access, how to do something, an error — and follows their own
 * requests. From an error screen the reference and page come along.
 */
export default async function GetHelpPage({ searchParams }: { searchParams: Promise<{ ref?: string; page?: string; subject?: string }> }) {
  const sp = await searchParams;
  if (await currentAssist()) {
    return (
      <div className="w-full max-w-3xl p-4 sm:p-8">
        <PageHeader icon="help" title="Get help" />
        <EmptyState icon="lock" title="Not during an assisted session">Requests for help are made by the person themselves. End the session first.</EmptyState>
      </div>
    );
  }
  const [rows, principal] = await Promise.all([listMyHelpRequests(), getPrincipal()]);
  const groups = guideFor(principal);
  // A question someone typed elsewhere ("Ask Enyo" when Enyo is off) arrives as the subject — their own words, nothing guessed.
  const subject = typeof sp.subject === 'string' ? sp.subject.replace(/\s+/g, ' ').trim().slice(0, 150) : '';
  const ref = typeof sp.ref === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(sp.ref) ? sp.ref : null;
  const page = typeof sp.page === 'string' && /^\/[\w\-/[\]?=&.%]{0,200}$/.test(sp.page) ? sp.page : null;
  return (
    <div className="w-full max-w-5xl p-4 sm:p-8">
      <PageHeader icon="help" title="Help centre" description="Find the steps for your role, ask Enyo, or ask a person — your administrators, Customer care, HR or the EJO platform team — and follow every request here."
        actions={<><Link href="/support/features" className="inline-flex min-h-9 items-center rounded-full border border-[var(--ejo-border)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50">What I can do here</Link><AskEnyoButton question="" label="Ask Enyo" /></>} />
      <SectionCard icon="search" title="Find the answer yourself" description="The how-to guide for your role. Type what you want to do." className="mb-6">
        <GuideBrowser groups={groups} compact />
        <p className="mt-3 text-xs text-[var(--ejo-text-muted)]"><Link href="/support/features" className="font-medium text-[var(--ejo-primary)] hover:underline">See everything you can do here →</Link></p>
      </SectionCard>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard icon="help" title="Ask a person">
          <NewHelpForm errorRef={ref} page={page} subject={subject} />
        </SectionCard>
        <SectionCard icon="list" title="My requests" description={rows.length ? `${rows.length} request${rows.length === 1 ? '' : 's'}` : undefined}>
          {rows.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {rows.map((r) => (
                <li key={r.id} className="py-3">
                  <Link href={`/support/help/${r.id}`} className="block min-h-11 rounded-[var(--ejo-radius-md)] hover:bg-[var(--ejo-bg)]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[var(--ejo-text)]">{r.subject}</span>
                      <StatusChip tone={TONE[r.status] ?? 'neutral'} label={r.statusLabel} />
                      {r.answered ? <span className="text-xs text-[var(--ejo-success)]">Answered</span> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{r.number} · {TEAM[r.about]} · updated {formatRelative(r.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="help" title="No requests yet" compact>When you ask for help, it appears here with every answer.</EmptyState>}
        </SectionCard>
      </div>
      <p className="mt-6 text-sm text-[var(--ejo-text-muted)]">Seen something that looks wrong — money, parts, access? <Link href="/support/speak-up" className="font-medium text-[var(--ejo-primary)] underline">Speak up</Link> (you can stay anonymous).</p>
    </div>
  );
}
