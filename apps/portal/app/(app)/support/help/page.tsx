import Link from 'next/link';
import { listMyHelpRequests } from '@/lib/actions/help';
import { currentAssist } from '@/lib/authz/server';
import { PageHeader, SectionCard, EmptyState, StatusChip, type Tone } from '@/components/ui';
import { NewHelpForm } from '@/components/support/HelpForms';
import { formatRelative } from '@/lib/utils/format-date';

export const metadata = { title: 'Get help' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', ON_HOLD: 'neutral', RESOLVED: 'success', CLOSED: 'neutral' };

/**
 * Get help: a colleague asks their administrators (or the EJO platform team)
 * for help — access, how to do something, an error — and follows their own
 * requests. From an error screen the reference and page come along.
 */
export default async function GetHelpPage({ searchParams }: { searchParams: Promise<{ ref?: string; page?: string }> }) {
  const sp = await searchParams;
  if (await currentAssist()) {
    return (
      <div className="w-full max-w-3xl p-4 sm:p-8">
        <PageHeader icon="help" title="Get help" />
        <EmptyState icon="lock" title="Not during an assisted session">Requests for help are made by the person themselves. End the session first.</EmptyState>
      </div>
    );
  }
  const rows = await listMyHelpRequests();
  const ref = typeof sp.ref === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(sp.ref) ? sp.ref : null;
  const page = typeof sp.page === 'string' && /^\/[\w\-/[\]?=&.%]{0,200}$/.test(sp.page) ? sp.page : null;
  return (
    <div className="w-full max-w-5xl p-4 sm:p-8">
      <PageHeader icon="help" title="Get help" description="Ask your administrators — or the EJO platform team for a fault in the system — and follow your requests here. Enyo can answer straight away with the steps for your role; a person is one click away." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard icon="help" title="Ask for help">
          <NewHelpForm errorRef={ref} page={page} />
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
                    <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{r.number} · {r.to === 'platform' ? 'EJO platform team' : 'Our administrators'} · updated {formatRelative(r.updatedAt)}</span>
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
