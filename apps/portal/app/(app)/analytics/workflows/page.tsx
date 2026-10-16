import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getWorkflowInsights } from '@/lib/actions/workflow-insights';
import { PageHeader, SectionCard, EmptyState, StatTile } from '@/components/ui';

export const metadata = { title: 'How work flows' };
export const dynamic = 'force-dynamic';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const hours = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`);
const READY: Record<string, string> = { suggest: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]', guide: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]', watch: 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]', too_few: 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]' };
const READY_LABEL: Record<string, string> = { suggest: 'Enyo could prepare these', guide: 'Enyo could check them first', watch: 'Enyo is watching', too_few: 'Still learning' };

/**
 * How work flows: each approval step — how many, how often sent back and
 * why, how long they wait, who decides — and where Enyo could help. Enyo
 * learns from these decisions; a person always decides.
 */
export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await guardPage('analytics.business.view', '/analytics/workflows');
  const sp = await searchParams;
  const w = await getWorkflowInsights({ days: Number(sp.days) || 90 });
  const sentBack = w.steps.reduce((a, s) => a + s.rejected, 0);
  const auc = typeof w.model?.metrics.auc === 'number' ? w.model.metrics.auc : null;
  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader icon="chart" title="How work flows" back={{ href: '/analytics', label: 'Analytics' }} eyebrow="Analytics"
        description="Every approval step of every workflow: how many decisions, how often things are sent back and why, how long they wait and who decides — and where Enyo could help. Enyo learns from these decisions; a person always decides." />
      <nav aria-label="Period" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[30, 90, 180, 365].map((d) => <Link key={d} href={`/analytics/workflows?days=${d}`} aria-current={w.days === d ? 'page' : undefined} className={`min-h-10 rounded-full px-3 py-2 ${w.days === d ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Last {d} days</Link>)}
      </nav>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="check-circle" label="Decisions" value={w.total} />
        <StatTile icon="restore" label="Sent back or refused" value={w.total ? `${Math.round((sentBack / w.total) * 100)}%` : '—'} />
        <StatTile icon="sparkles" label="Steps Enyo could prepare" value={w.steps.filter((s) => s.readiness.level === 'suggest').length} />
        <StatTile icon="sparkles" label="Decision model" value={w.model ? (auc !== null ? `AUC ${auc.toFixed(2)}` : w.model.status.toLowerCase()) : 'Not trained'} href="/enyo/models" />
      </div>
      {w.steps.length ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {w.steps.map((s) => (
            <SectionCard key={s.step} icon="list" title={`${s.workflow}: ${s.label}`} description={`${s.total} decision${s.total === 1 ? '' : 's'} · ${pct(s.rejectionRate)} sent back · usually ${hours(s.medianWaitH)} (slowest tenth ${hours(s.p90WaitH)})`}>
              <p className={`rounded-[var(--ejo-radius-md)] px-3 py-2 text-xs leading-relaxed ${READY[s.readiness.level]}`}><span className="font-semibold">{READY_LABEL[s.readiness.level]}.</span> {s.readiness.text}</p>
              {s.reasons.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-[var(--ejo-text)]">Why they are sent back</p>
                  <ul className="mt-1 space-y-1 text-sm">{s.reasons.map((r) => <li key={r.reason} className="flex justify-between gap-3"><span className="text-[var(--ejo-text)]">{r.reason}</span><span className="shrink-0 text-[var(--ejo-text-muted)]">{r.count}</span></li>)}</ul>
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-[var(--ejo-text)]">Who decides</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--ejo-text-muted)]">{s.byDecider.map((r) => <li key={r.role}>{r.role}: {r.count} ({pct(r.rejectionRate)} sent back)</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--ejo-text)]">Who asks</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--ejo-text-muted)]">{s.byRequester.map((r) => <li key={r.role}>{r.role}: {r.count} ({pct(r.rejectionRate)} sent back)</li>)}</ul>
                </div>
              </div>
              <p className="mt-3 text-xs"><Link href={s.href} className="font-medium text-[var(--ejo-primary)] hover:underline">Open the list →</Link></p>
            </SectionCard>
          ))}
        </div>
      ) : <EmptyState icon="chart" title="No decisions in this period">Approvals and send-backs appear here as people decide them.</EmptyState>}
    </div>
  );
}
