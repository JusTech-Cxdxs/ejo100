import { guardPage } from '@/lib/authz/server';
import type { ReactNode } from 'react';
import { getWarrantyAnalytics } from '@/lib/actions/warranty-analytics';
import { LoadingLink } from '@/components/LoadingLink';
import { CLAIM_STATUS_LABEL, REMEDY_LABEL } from '@/lib/warranty-claim-status';
import { WARRANTY_STATE_LABEL } from '@/lib/warranty-state';
import { formatDateTime } from '@/lib/utils/format-date';
import { PageHeader, StatTile, PriorityActions, BarRow, EmptyState, Icon, CHART, type IconName, type Tone } from '@/components/ui';

function naira(n: number | null): string {
  return n === null ? '—' : `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`;
}
function dayz(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)} ${Math.round(n * 10) === 10 ? 'day' : 'days'}`;
}

function Section({ title, subtitle, children, icon = 'chart' }: { title: string; subtitle: string; children: ReactNode; icon?: IconName }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-primary)]/15"><Icon name={icon} size={18} /></span>
        <div>
          <h2 className="text-lg font-semibold leading-tight text-[var(--ejo-text)]">{title}</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
const TONE_OF: Record<string, Tone> = { 'text-[var(--ejo-warning)]': 'warning', 'text-[var(--ejo-success)]': 'success', 'text-[var(--ejo-error)]': 'error' };
function Kpi({ label, value, hint, tone = 'text-[var(--ejo-text)]', icon = 'shield-check' }: { label: string; value: string; hint?: string; tone?: string; icon?: IconName }) {
  const t = TONE_OF[tone];
  return <StatTile icon={icon} label={label} value={value} hint={hint} tone={t ?? 'brand'} emphasis={Boolean(t)} />;
}
function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return <div className="space-y-2">{rows.map((r) => <BarRow key={r.label} label={r.label} value={r.value} max={max} note={r.note ?? r.value} labelWidth="11rem" />)}</div>;
}
/** A card title with its icon. */
function CardTitle({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={icon} size={15} /></span>{children}</p>;
}
const card = 'min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const th = 'px-3 py-2 text-left text-xs font-medium text-[var(--ejo-text-muted)]';
const td = 'px-3 py-2 text-sm text-[var(--ejo-text)]';

/**
 * Warranty analytics — descriptive (what happened), diagnostic (why),
 * statistics (distributions, turnaround, trend), predictive (what's
 * coming) and prescriptive (what to do now, linked to each record).
 */
export default async function WarrantyAnalyticsPage() {
  await guardPage('analytics.warranty.view', '/warranty/analytics');
  const a = await getWarrantyAnalytics();
  const d = a.descriptive;
  const g = a.diagnostic;
  const s = a.statistics;
  const p = a.predictive;
  const trendMax = Math.max(1, ...s.trend.map((t) => t.claimed), ...s.trend.map((t) => t.recovered));

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        back={{ href: '/warranty', label: 'Back to Warranty' }}
        icon="chart"
        eyebrow={<>Analytics · Warranty · calculated {formatDateTime(a.generatedAt)}</>}
        title="Warranty analytics"
        description={<>What happened, why, what the numbers look like, what is coming, and what to do about it — worked out live from every warranty
            and claim. Each figure says how it is calculated.</>}
      />

      <Section icon="bolt" title="What to do now" subtitle="Prescriptive — prioritised actions, each linked to its record. Priority 1 protects money at risk today.">
        {a.prescriptive.actions.length === 0 ? (
          <div className={card}><EmptyState compact icon="check-circle" title="Nothing needs attention right now." /></div>
        ) : (
          <>
            <PriorityActions actions={a.prescriptive.actions.slice(0, 30)} title="Prioritised" note={null} />
            {a.prescriptive.actions.length > 30 ? <p className="-mt-6 text-xs text-[var(--ejo-text-muted)]">+ {a.prescriptive.actions.length - 30} more.</p> : null}
          </>
        )}
        {a.prescriptive.leakageCount > 0 ? (
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
            Warranty leakage: {a.prescriptive.leakageCount} {a.prescriptive.leakageCount === 1 ? 'repair' : 'repairs'} in the last 180 days on vehicles under an active
            vehicle warranty had no claim — review whether any part of them was claimable.
          </p>
        ) : null}
      </Section>

      <Section icon="activity" title="Descriptive" subtitle="What has happened — coverage, claims and money.">
        <div className="ejo-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon="shield-check" label="Warranties covering now" value={String(d.covering)} hint={`of ${d.warranties} (${d.assetWarranties} vehicle, ${d.partWarranties} part)`} tone="text-[var(--ejo-success)]" />
          <Kpi icon="file" label="Claimed" value={naira(d.claimed)} hint={`${d.claims} ${d.claims === 1 ? 'claim' : 'claims'} (excl. cancelled)`} />
          <Kpi icon="check-circle" label="Approved by providers" value={naira(d.approved)} hint={`Value approval ${pct(d.valueApprovalRate)} of decided claims`} />
          <Kpi icon="money" label="Recovered" value={naira(d.recovered)} hint={`Cash + parts + repairs · collection ${pct(d.collectionRate)} of approved`} tone="text-[var(--ejo-success)]" />
          <Kpi icon="percent" label="Approval rate" value={pct(d.approvalRate)} hint="Accepted in full or part ÷ decided" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={card}>
            <CardTitle icon="shield-check">Warranties by coverage</CardTitle>
            <Bars rows={Object.entries(d.byState).map(([k, v]) => ({ label: WARRANTY_STATE_LABEL[k as keyof typeof WARRANTY_STATE_LABEL], value: v }))} />
          </div>
          <div className={card}>
            <CardTitle icon="list">Claims by stage</CardTitle>
            <Bars rows={Object.entries(d.byStatus).map(([k, v]) => ({ label: CLAIM_STATUS_LABEL[k] ?? k, value: v }))} />
          </div>
          <div className={card}>
            <CardTitle icon="handshake">How providers make it right</CardTitle>
            <table className="w-full">
              <thead><tr><th className={th}>Remedy</th><th className={`${th} text-right`}>Claims</th><th className={`${th} text-right`}>Recovered</th></tr></thead>
              <tbody>
                {d.remedyMix.map((r) => (
                  <tr key={r.remedy} className="border-t border-[var(--ejo-border)]"><td className={td}>{REMEDY_LABEL[r.remedy]}</td><td className={`${td} text-right`}>{r.count}</td><td className={`${td} text-right`}>{naira(r.recovered)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section icon="search" title="Diagnostic" subtitle="Why — which parts fail, which providers pay, what gets rejected, and whether timing matters.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <CardTitle icon="alert">Top failing parts</CardTitle>
            {g.topParts.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No claims yet.</p> : (
              <table className="w-full">
                <thead><tr><th className={th}>Part</th><th className={`${th} text-right`}>Claims</th><th className={`${th} text-right`}>Claimed</th><th className={`${th} text-right`}>Rejected</th></tr></thead>
                <tbody>{g.topParts.map((t) => <tr key={t.part} className="border-t border-[var(--ejo-border)]"><td className={td}>{t.part}</td><td className={`${td} text-right`}>{t.claims}</td><td className={`${td} text-right`}>{naira(t.claimed)}</td><td className={`${td} text-right`}>{pct(t.rejectionRate)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className={card}>
            <CardTitle icon="building">Provider performance</CardTitle>
            {g.providers.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No claims yet.</p> : (
              <table className="w-full">
                <thead><tr><th className={th}>Provider</th><th className={`${th} text-right`}>Claims</th><th className={`${th} text-right`}>Approval</th><th className={`${th} text-right`}>Avg decision</th><th className={`${th} text-right`}>Recovered</th></tr></thead>
                <tbody>
                  {g.providers.map((pr) => (
                    <tr key={pr.providerId} className="border-t border-[var(--ejo-border)]">
                      <td className={td}><LoadingLink href={`/warranty/providers/${pr.providerId}`} className="text-[var(--ejo-primary)] hover:underline">{pr.provider}</LoadingLink></td>
                      <td className={`${td} text-right`}>{pr.claims}</td><td className={`${td} text-right`}>{pct(pr.approvalRate)}</td><td className={`${td} text-right`}>{dayz(pr.avgDecisionDays)}</td><td className={`${td} text-right`}>{naira(pr.recovered)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className={card}>
            <CardTitle icon="clock">Timing and resubmissions</CardTitle>
            <ul className="space-y-1 text-sm text-[var(--ejo-text)]">
              <li>{g.late.late} of {g.late.submitted} submitted {g.late.submitted === 1 ? 'claim was' : 'claims were'} after the provider&apos;s deadline.</li>
              <li>Rejection rate — late: {pct(g.late.lateRejectionRate)} · on time: {pct(g.late.onTimeRejectionRate)}.</li>
              <li>Resubmitted claims decided: {g.resubmissions.decided} · success after resubmission: {pct(g.resubmissions.successRate)}.</li>
            </ul>
          </div>
          <div className={card}>
            <CardTitle icon="car">Claims by vehicle model</CardTitle>
            {g.models.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No vehicle warranties yet.</p> : (
              <table className="w-full">
                <thead><tr><th className={th}>Model</th><th className={`${th} text-right`}>Warranties</th><th className={`${th} text-right`}>Claims</th><th className={`${th} text-right`}>Per warranty</th></tr></thead>
                <tbody>{g.models.map((m) => <tr key={m.model} className="border-t border-[var(--ejo-border)]"><td className={td}>{m.model}</td><td className={`${td} text-right`}>{m.warranties}</td><td className={`${td} text-right`}>{m.claims}</td><td className={`${td} text-right`}>{m.claimsPerWarranty === null ? '—' : m.claimsPerWarranty.toFixed(2)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className={`${card} lg:col-span-2`}>
            <CardTitle icon="close">Why claims were rejected</CardTitle>
            {g.rejections.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No rejected claims.</p> : (
              <ul className="space-y-1 text-sm">
                {g.rejections.map((r) => (
                  <li key={r.id}><LoadingLink href={`/warranty/claims/${r.id}`} className="text-[var(--ejo-primary)] hover:underline">{r.claimNumber}</LoadingLink> — {r.part}: <span className="text-[var(--ejo-text-muted)]">{r.reason}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section icon="pie" title="Statistics" subtitle="Distributions and turnaround — the shape behind the totals.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={card}>
            <CardTitle icon="money">Claim value (₦)</CardTitle>
            <table className="w-full"><tbody>
              {([['Claims', String(s.claimValue.count)], ['Mean', naira(s.claimValue.mean)], ['Median', naira(s.claimValue.median)], ['90th percentile', naira(s.claimValue.p90)], ['Std. deviation', naira(s.claimValue.stdDev)], ['Smallest', naira(s.claimValue.min)], ['Largest', naira(s.claimValue.max)]] as const).map(([k, v]) => (
                <tr key={k} className="border-t border-[var(--ejo-border)]"><td className={td}>{k}</td><td className={`${td} text-right`}>{v}</td></tr>
              ))}
            </tbody></table>
          </div>
          <div className={card}>
            <CardTitle icon="gauge">Turnaround</CardTitle>
            <table className="w-full">
              <thead><tr><th className={th}>Stage</th><th className={`${th} text-right`}>Mean</th><th className={`${th} text-right`}>Median</th></tr></thead>
              <tbody>
                {([['Failure → submitted', s.turnaround.failureToSubmission], ['Submitted → decision', s.turnaround.submissionToDecision], ['Decision → settled', s.turnaround.decisionToSettlement]] as const).map(([k, v]) => (
                  <tr key={k} className="border-t border-[var(--ejo-border)]"><td className={td}>{k}</td><td className={`${td} text-right`}>{dayz(v.mean)}</td><td className={`${td} text-right`}>{dayz(v.median)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={card}>
            <CardTitle icon="bars">Last 12 months</CardTitle>
            <div className="flex h-32 items-end gap-1">
              {s.trend.map((t) => (
                <div key={t.label} className="flex flex-1 flex-col items-center gap-0.5" title={`${t.label}: ${t.opened} opened · claimed ${naira(t.claimed)} · recovered ${naira(t.recovered)}`}>
                  <div className="flex h-24 w-full items-end gap-px">
                    <div className="ejo-grow-up flex-1 rounded-t-sm" style={{ height: `${(t.claimed / trendMax) * 100}%`, background: CHART.primarySoft }} />
                    <div className="ejo-grow-up flex-1 rounded-t-sm" style={{ height: `${(t.recovered / trendMax) * 100}%`, background: CHART.primary }} />
                  </div>
                  <span className="text-[9px] text-[var(--ejo-text-muted)]">{t.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--ejo-text-muted)]">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART.primarySoft }} />Claimed (by month opened)</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART.primary }} />Recovered (by month settled)</span>
            </p>
          </div>
        </div>
      </Section>

      <Section icon="sparkles" title="Predictive" subtitle="What is coming — based on this organisation's own history (not guesses).">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon="clock" label="Expiring in 30 / 60 / 90 days" value={`${p.expiring30} / ${p.expiring60} / ${p.expiring90}`} hint="Warranties still covering that will end" tone="text-[var(--ejo-warning)]" />
          <Kpi icon="sparkles" label="Expected claims, next 90 days" value={p.expectedClaims90 === null ? '—' : p.expectedClaims90.toFixed(1)} hint={p.claimRatePerWarrantyMonth === null ? 'Not enough history yet' : `${(p.claimRatePerWarrantyMonth * 100).toFixed(2)} claims per 100 warranty-months × ${p.basis.activeWarranties} covering × 3 months`} />
          <Kpi icon="money" label="Expected claim cost, next 90 days" value={naira(p.expectedCost90)} hint="Expected claims × median claim value" />
          <Kpi icon="activity" label="In progress (not yet decided)" value={naira(p.pipelineValue)} hint={`Expected to be approved: ${naira(p.expectedPipelineRecovery)} (at the value-approval rate)`} />
          <Kpi label="Approved, awaiting settlement" value={naira(p.awaitingMoney)} hint="Money, replacements or repairs still to arrive"  icon="clock" />
        </div>
        <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]">
          Basis: {p.basis.recentClaims} {p.basis.recentClaims === 1 ? 'claim' : 'claims'} in the last 12 months over {p.basis.warrantyMonths.toLocaleString('en-NG')} warranty-months of cover. Forecasts sharpen as history grows.
        </p>
      </Section>
    </div>
  );
}
