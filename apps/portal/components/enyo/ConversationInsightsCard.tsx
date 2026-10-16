import { getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { conversationInsights } from '@/lib/enyo/conversations';
import { SectionCard, BarRow, CHART } from '@/components/ui';

const CHANNEL: Record<string, string> = { STAFF: 'Staff (portal)', CUSTOMER: 'Customers (customer portal)', PUBLIC: 'Website visitors' };

/**
 * What Enyo learns from its conversations (last 30 days): use by channel and
 * by role, what people ask most, the tools it needed, ratings, and the gaps
 * to fill (answers rated unhelpful, chats that ended with "a person please").
 * Questions are shown with names and contact details removed.
 */
export async function ConversationInsightsCard() {
  const p = await getPrincipal();
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) return null;
  const s = await conversationInsights(organisationId, 30);
  const maxCh = Math.max(1, ...s.channels.map((c) => c.conversations));
  const maxRole = Math.max(1, ...s.roles.map((r) => r.conversations));
  const maxWord = Math.max(1, ...s.topWords.map((w) => w.count));
  const maxTool = Math.max(1, ...s.tools.map((t) => t.count));
  return (
    <div id="conversations" className="scroll-mt-24">
      <SectionCard icon="activity" title="What Enyo learns from its conversations" description="The last 30 days across staff, customer and website chats. Learned answers wait for your approval below; the training export holds only approved and helpful answers, with names and contact details removed."
        actions={<a href="/enyo/learning/conversations" className="inline-flex min-h-10 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]">Download training set (JSONL)</a>}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Conversations by channel</h3>
            <div className="space-y-2">{s.channels.length ? s.channels.map((c) => <BarRow key={c.channel} label={CHANNEL[c.channel] ?? c.channel} value={c.conversations} max={maxCh} note={`${c.conversations} chats · ${c.questions} questions · ${c.people} people`} labelWidth="12rem" />) : <p className="text-sm text-[var(--ejo-text-muted)]">No conversations yet.</p>}</div>
            {s.roles.length ? (
              <>
                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Staff chats by role</h3>
                <div className="space-y-2">{s.roles.map((r) => <BarRow key={r.role} label={r.role} value={r.conversations} max={maxRole} note={r.conversations} colour={CHART.neutral} labelWidth="12rem" />)}</div>
              </>
            ) : null}
            <p className="mt-4 text-sm text-[var(--ejo-text)]">Ratings: <strong>{s.ratings.helpful}</strong> helpful, <strong>{s.ratings.notHelpful}</strong> not helpful · <strong>{s.handovers}</strong> chats handed to a person · learned answers <strong>{s.learnedApproved}</strong> approved, <strong>{s.learnedPending}</strong> waiting.</p>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">What people ask about most</h3>
            <div className="flex flex-wrap gap-1.5">{s.topWords.map((w) => <span key={w.word} className="rounded-full bg-[var(--ejo-primary)]/10 px-2.5 py-1 text-xs text-[var(--ejo-primary)]" style={{ opacity: 0.55 + 0.45 * (w.count / maxWord) }}>{w.word} · {w.count}</span>)}</div>
            {s.tools.length ? (
              <>
                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">What Enyo had to look up</h3>
                <div className="space-y-2">{s.tools.map((t) => <BarRow key={t.tool} label={t.tool.replace(/_/g, ' ')} value={t.count} max={maxTool} note={t.count} colour={CHART.primarySoft} labelWidth="10rem" />)}</div>
              </>
            ) : null}
          </div>
        </div>
        {s.gaps.length ? (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Gaps to fill (write an answer, approve one, or add it to the guide)</h3>
            <ul className="divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
              {s.gaps.map((g, i) => <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0 flex-1 text-[var(--ejo-text)]">{g.question}</span><span className="text-xs text-[var(--ejo-text-muted)]">{CHANNEL[g.channel] ?? g.channel} · {g.why}</span></li>)}
            </ul>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
