import { allows, firstReach, getPrincipal, guardAnyPage, myOrganisationId } from '@/lib/authz/server';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { learningData } from '@/lib/enyo/predict/learning';
import { MODEL_VERSION } from '@/lib/enyo/predict/lines';
import { PageHeader, SectionCard, StatTile, BarRow, EmptyState, Icon, CHART } from '@/components/ui';
import { LearningAccuracyChartLazy } from '@/components/enyo/LearningAccuracyChartLazy';
import { pluralize } from '@/lib/utils/pluralize';
import { Suspense } from 'react';
import { DataQualityCard } from '@/components/enyo/DataQualityCard';
import { LearnedAnswersCard } from '@/components/enyo/LearnedAnswersCard';
import { ConversationInsightsCard } from '@/components/enyo/ConversationInsightsCard';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const LEARNED_STATUS: Record<string, string> = { learned_approved: 'Approved. Enyo now follows that answer.', learned_removed: 'Removed. Enyo no longer uses that answer.' };

export const dynamic = 'force-dynamic';

const naira = (n: number | null) => (n === null ? '—' : `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);

const MODE_TEXT: Record<'SHADOW' | 'SUGGEST' | 'OFF', { label: string; tone: string; text: string }> = {
  SHADOW: { label: 'Shadow', tone: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]', text: 'Enyo predicts the lines of every new Job Card and Vehicle Service and checks itself against the approved estimate. Nobody sees the predictions yet.' },
  SUGGEST: { label: 'Suggest', tone: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]', text: 'Supervisors and technicians see "Likely lines from similar jobs" on the estimate. Pressing Add only fills in the form; people still check and save every line.' },
  OFF: { label: 'Off', tone: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]', text: 'Enyo makes no predictions. Nothing is measured and nothing is shown.' },
};

const STATUS_LABEL: [keyof Awaited<ReturnType<typeof learningData>>['counts'], string, string][] = [
  ['SHADOW', 'Measured only (shadow)', CHART.neutral],
  ['SHOWN', 'Shown as suggestions', CHART.primarySoft],
  ['DISMISSED', 'Hidden by people', CHART.warning],
  ['RESOLVED', 'Checked against the approved estimate', CHART.primary],
];

const TYPE_LABEL: Record<string, string> = { STORE_PART: 'Store Part', EXTERNAL_PART: 'External Part', EXTERNAL_JOB: 'External Job', INTERNAL_JOB: 'Internal Job', LABOUR: 'Labour', SUNDRY: 'Sundry' };

/**
 * Enyo's learning: how well it predicts estimate lines, week by week, and how
 * close it is to the point where an administrator might switch suggestions
 * on. For administrators (Enyo) and those who see Business Analytics, each
 * within their own reach.
 */
export default async function EnyoLearningPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? LEARNED_STATUS[sp.status] : undefined;
  const error = typeof sp.error === 'string' ? sp.error.slice(0, 300) : undefined;
  await guardAnyPage(['enyo.manage', 'analytics.business.view'], '/enyo/learning');
  const p = await getPrincipal();
  const orgId = p.organisationId ?? (await myOrganisationId());
  const reach = await firstReach(['enyo.manage', 'analytics.business.view']);
  const [settings, d, canManage, canSupport, canAnalytics] = await Promise.all([
    getEnyoSettings(orgId),
    learningData({ ...(p.isSuperAdmin ? (orgId ? { organisationId: orgId } : {}) : { organisationId: p.organisationId ?? '__no_organisation__' }), ...reach }),
    allows('enyo.manage'),
    allows('support.tickets.manage'),
    allows('analytics.business.view'),
  ]);
  // Everything Enyo learns from, one press away.
  const hub: { href: string; label: string; icon: 'sparkles' | 'check-circle' | 'activity' | 'inbox' | 'chart' | 'layers' }[] = [
    { href: '#predictions', label: 'Estimate predictions', icon: 'sparkles' },
    ...(canManage ? [{ href: '#data', label: 'Training data', icon: 'check-circle' as const }, { href: '#conversations', label: 'Conversations & learned answers', icon: 'activity' as const }] : []),
    ...(canSupport ? [{ href: '/crm/support/enyo', label: 'Enyo’s support replies', icon: 'inbox' as const }] : []),
    ...(canAnalytics ? [{ href: '/analytics/workflows', label: 'How work flows', icon: 'chart' as const }] : []),
    { href: '/enyo/models', label: 'Trained models', icon: 'layers' },
  ];
  const mode = MODE_TEXT[settings.predictionsMode];
  const pr = d.promotion;
  const maxStatus = Math.max(1, ...Object.values(d.counts));
  const keptMax = Math.max(1, d.summary.kept, d.summary.missed, d.summary.extra);
  const maxMissed = Math.max(1, ...d.summary.mostMissed.map((m) => m.count));
  const coverage = d.resolved ? d.resolvedWithLines / d.resolved : null;

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        icon="sparkles"
        eyebrow={`${settings.displayName} · Workshop intelligence`}
        title={`${settings.displayName} learning`}
        description={<>How well {settings.displayName} predicts estimate lines from similar past jobs, checked against what Managers finally approve. Model {MODEL_VERSION}.</>}
        back={{ href: '/analytics', label: 'Analytics' }}
        actions={
          canManage ? (
            <>
              <a href="/enyo/models" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-medium text-white hover:brightness-110 sm:min-h-9">
                <Icon name="layers" size={15} />Models
              </a>
              <a href="/enyo/learning/export?format=csv" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:min-h-9">
                <Icon name="file" size={15} />Training data (CSV)
              </a>
              <a href="/enyo/learning/export?format=jsonl" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:min-h-9">
                <Icon name="file" size={15} />Training data (JSONL)
              </a>
            </>
          ) : (
            <a href="/enyo/models" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:min-h-9">
              <Icon name="layers" size={15} />Models
            </a>
          )
        }
      />

      <nav aria-label="On this page and related" className="mb-6 flex flex-wrap gap-2">
        {hub.map((h) => (
          <a key={h.href} href={h.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm font-medium text-[var(--ejo-text)] shadow-sm transition hover:-translate-y-px hover:border-[var(--ejo-primary)]/50 hover:text-[var(--ejo-primary)]">
            <Icon name={h.icon} size={15} />{h.label}
          </a>
        ))}
      </nav>

      <div id="predictions" className="mb-6 grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard icon="sliders" title="How it learns" description="Step by step, and only as fast as it earns trust.">
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--ejo-text)]">
            Current mode: <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${mode.tone}`}>{mode.label}</span>
          </p>
          <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{mode.text}</p>
          <ol className="mt-4 space-y-3 text-sm text-[var(--ejo-text)]">
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-xs font-semibold text-[var(--ejo-primary)]">1</span><span><strong>Shadow.</strong> For each new job it finds the most similar finished jobs (same kind of complaint, then the same make and model) and notes the lines most of them needed. When the Manager approves the estimate, it checks how many of its lines were right (precision) and how many approved lines it found (recall).</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-xs font-semibold text-[var(--ejo-primary)]">2</span><span><strong>Suggest.</strong> Once it is accurate enough, an administrator can let supervisors and technicians see the suggestions. It still never writes an estimate; Store parts are always priced from today&rsquo;s Store price.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-xs font-semibold text-[var(--ejo-primary)]">3</span><span><strong>Trained models.</strong> The measured history becomes the training data for stronger models, which must beat the current one on the same jobs before they replace it.</span></li>
          </ol>
        </SectionCard>

        <SectionCard icon="trend-up" title="Ready for Suggest?" description={`The rule: at least ${pr.minResolved} checked predictions with average precision of ${Math.round(pr.minPrecision * 100)}% or more. An administrator decides.`}>
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-[var(--ejo-text)]">Checked predictions</span>
                <span className="font-semibold text-[var(--ejo-text)]">{pr.resolvedWithLines.toLocaleString('en-NG')} of {pr.minResolved}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--ejo-border)]" role="progressbar" aria-label="Checked predictions toward the rule" aria-valuemin={0} aria-valuemax={pr.minResolved} aria-valuenow={Math.min(pr.resolvedWithLines, pr.minResolved)}>
                <div className="h-full rounded-full bg-[var(--ejo-primary)] transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${Math.round(pr.progress * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-[var(--ejo-text)]">Average precision</span>
                <span className={`font-semibold ${pr.accurate ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text)]'}`}>{pct(pr.averagePrecision)} <span className="font-normal text-[var(--ejo-text-muted)]">(needs {Math.round(pr.minPrecision * 100)}%)</span></span>
              </div>
              <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--ejo-border)]" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--ejo-primary)]" style={{ width: `${Math.round((pr.averagePrecision ?? 0) * 100)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-[var(--ejo-text)]" style={{ left: `${Math.round(pr.minPrecision * 100)}%` }} />
              </div>
            </div>
            <p className={`rounded-[var(--ejo-radius-md)] p-3 text-sm ${pr.ready ? 'bg-[var(--ejo-success)]/10 text-[var(--ejo-success)]' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]'}`} role="status">
              {settings.predictionsMode === 'SUGGEST'
                ? 'Suggestions are already switched on. Keep an eye on precision week by week.'
                : pr.ready
                  ? 'The rule is met. An administrator can switch predictions to Suggest in Settings → Enyo.'
                  : !pr.enough
                    ? `Not yet: ${pluralize(Math.max(0, pr.minResolved - pr.resolvedWithLines), 'more checked prediction')} needed.`
                    : 'Not yet: precision is below the rule.'}
            </p>
          </div>
        </SectionCard>
      </div>

      {canManage && orgId ? (
        <div id="data" className="mb-6 scroll-mt-24">
          <Suspense fallback={<SectionCard icon="check-circle" title="Training data quality"><p role="status" className="text-sm text-[var(--ejo-text-muted)]">Checking the training data…</p></SectionCard>}>
            <DataQualityCard organisationId={orgId} branchIds={reach.branchId === undefined ? null : typeof reach.branchId === 'string' ? [reach.branchId] : reach.branchId.in} />
          </Suspense>
        </div>
      ) : null}

      {canManage ? (
        <div id="conversations" className="mb-6 scroll-mt-24">
          {error ? <div role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}
          {status ? <div role="status"><FormFeedbackBanner kind="success" message={status} /></div> : null}
          <Suspense fallback={<SectionCard icon="activity" title="What Enyo learns from its conversations"><p role="status" className="text-sm text-[var(--ejo-text-muted)]">Reading the conversations…</p></SectionCard>}>
            <div className="mb-6"><ConversationInsightsCard /></div>
          </Suspense>
          <Suspense fallback={<SectionCard icon="sparkles" title="What Enyo has learned"><p role="status" className="text-sm text-[var(--ejo-text-muted)]">Loading…</p></SectionCard>}>
            <LearnedAnswersCard />
          </Suspense>
        </div>
      ) : null}

      {d.total === 0 ? (
        <SectionCard icon="sparkles" title="Nothing measured yet">
          <EmptyState icon="sparkles" title="No predictions yet">
            {settings.predictionsMode === 'OFF'
              ? 'Predictions are switched off for this organisation.'
              : `${settings.displayName} starts predicting with the next Job Card or Vehicle Service opened. Accuracy appears here once Managers approve those estimates.`}
          </EmptyState>
        </SectionCard>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile icon="sparkles" label="Predictions made" value={d.total} hint={`${pluralize(d.byKind.JOB_CARD_LINES ?? 0, 'Job Card')} · ${pluralize(d.byKind.SERVICE_LINES ?? 0, 'service')}`} />
            <StatTile icon="check-circle" label="Checked" value={d.resolved} hint="Against the Manager-approved estimate" />
            <StatTile icon="percent" label="Precision" value={pct(d.averagePrecision)} hint="Suggested lines that were approved" />
            <StatTile icon="percent" label="Recall" value={pct(d.averageRecall)} hint="Approved lines that were suggested" />
            <StatTile icon="money" label="Labour error" value={naira(d.summary.labour.meanError)} hint={d.summary.labour.samples ? `Average, last 12 weeks (${pluralize(d.summary.labour.samples, 'job')})` : 'No labour compared yet'} />
            <StatTile icon="layers" label="Coverage" value={pct(coverage)} hint="Checked jobs it could suggest for" />
          </div>

          <SectionCard icon="chart" title="Accuracy by week" description="Last 12 weeks, by the week the estimate was approved. Precision and recall are averages over the jobs checked that week." className="mb-6">
            <LearningAccuracyChartLazy data={d.summary.weeks} />
            <details className="mt-3 text-xs text-[var(--ejo-text-muted)]">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-[var(--ejo-primary)] sm:min-h-8">Show the figures</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left">
                  <thead><tr className="border-b border-[var(--ejo-border)]"><th className="py-1.5 pr-3 font-medium">Week of</th><th className="py-1.5 pr-3 font-medium">Checked</th><th className="py-1.5 pr-3 font-medium">Precision</th><th className="py-1.5 pr-3 font-medium">Recall</th><th className="py-1.5 pr-3 font-medium">Lines kept</th><th className="py-1.5 pr-3 font-medium">Lines missed</th><th className="py-1.5 font-medium">Labour error</th></tr></thead>
                  <tbody>
                    {d.summary.weeks.map((w) => (
                      <tr key={w.start} className="border-b border-[var(--ejo-border)]/60 text-[var(--ejo-text)]">
                        <td className="py-1.5 pr-3">{w.label}</td><td className="py-1.5 pr-3">{w.resolved}</td><td className="py-1.5 pr-3">{w.precision === null ? '—' : `${w.precision}%`}</td><td className="py-1.5 pr-3">{w.recall === null ? '—' : `${w.recall}%`}</td><td className="py-1.5 pr-3">{w.kept}</td><td className="py-1.5 pr-3">{w.missed}</td><td className="py-1.5">{naira(w.labourError)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </SectionCard>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <SectionCard icon="check" title="Lines kept and missed" description="Last 12 weeks.">
              <div className="space-y-2">
                <BarRow label="Kept (suggested and approved)" value={d.summary.kept} max={keptMax} note={d.summary.kept.toLocaleString('en-NG')} labelWidth="11rem" />
                <BarRow label="Missed (approved, not suggested)" value={d.summary.missed} max={keptMax} note={d.summary.missed.toLocaleString('en-NG')} colour={CHART.warning} labelWidth="11rem" />
                <BarRow label="Extra (suggested, not approved)" value={d.summary.extra} max={keptMax} note={d.summary.extra.toLocaleString('en-NG')} colour={CHART.neutral} labelWidth="11rem" />
              </div>
            </SectionCard>
            <SectionCard icon="list" title="Predictions by status">
              <div className="space-y-2">
                {STATUS_LABEL.map(([k, label, colour]) => (
                  <BarRow key={k} label={label} value={d.counts[k]} max={maxStatus} note={d.counts[k].toLocaleString('en-NG')} colour={colour} labelWidth="11rem" />
                ))}
              </div>
            </SectionCard>
            <SectionCard icon="alert" title="Most-missed lines" description="Approved lines it did not suggest, last 12 weeks — where it has the most to learn.">
              {d.summary.mostMissed.length ? (
                <ol className="space-y-2">
                  {d.summary.mostMissed.map((m) => (
                    <li key={`${m.type}-${m.label}`}>
                      <BarRow label={<span title={TYPE_LABEL[m.type] ?? m.type}>{m.label}</span>} value={m.count} max={maxMissed} note={`${m.count}`} colour={CHART.warning} labelWidth="9rem" />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState compact icon="check-circle" title="Nothing missed yet">No checked prediction has missed a line in the last 12 weeks.</EmptyState>
              )}
            </SectionCard>
          </div>
        </>
      )}

      <p className="text-xs text-[var(--ejo-text-muted)]">
        Figures cover {p.isSuperAdmin || !reach.branchId || typeof reach.branchId === 'object' ? 'every branch you can see' : 'your branch'}. A job counts once its estimate has the Manager&rsquo;s final approval.
        {canManage ? ' The training data has no names, phone numbers, emails, plates or record numbers.' : ''}
      </p>
    </div>
  );
}
