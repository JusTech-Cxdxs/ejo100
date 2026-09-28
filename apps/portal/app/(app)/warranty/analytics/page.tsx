import type { ReactNode } from 'react';
import { getWarrantyAnalytics } from '@/lib/actions/warranty-analytics';
import { LoadingLink } from '@/components/LoadingLink';
import { CLAIM_STATUS_LABEL, REMEDY_LABEL } from '@/lib/warranty-claim-status';
import { WARRANTY_STATE_LABEL } from '@/lib/warranty-state';
import { formatDateTime } from '@/lib/utils/format-date';

function naira(n: number | null): string {
  return n === null ? '—' : `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function pct(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`;
}
function dayz(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)} ${Math.round(n * 10) === 10 ? 'day' : 'days'}`;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-[var(--ejo-text)]">{title}</h2>
      <p className="mb-4 text-xs text-[var(--ejo-text-muted)]">{subtitle}</p>
      {children}
    </section>
  );
}
function Kpi({ label, value, hint, tone = 'text-[var(--ejo-text)]' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
      <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{hint}</p> : null}
    </div>
  );
}
function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-44 shrink-0 truncate text-[var(--ejo-text)]" title={r.label}>{r.label}</span>
          <div className="h-3 flex-1 rounded bg-[var(--ejo-bg)]">
            <div className="h-3 rounded bg-[var(--ejo-primary)]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[var(--ejo-text-muted)]">{r.note ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}
const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const th = 'px-3 py-2 text-left text-xs font-medium text-[var(--ejo-text-muted)]';
const td = 'px-3 py-2 text-sm text-[var(--ejo-text)]';

/**
 * Warranty analytics — descriptive (what happened), diagnostic (why),
 * statistics (distributions, turnaround, trend), predictive (what's
 * coming) and prescriptive (what to do now, linked to each record).
 */
export default async function WarrantyAnalyticsPage() {
  const a = await getWarrantyAnalytics();
  const d = a.descriptive;
  const g = a.diagnostic;
  const s = a.statistics;
  const p = a.predictive;
  const trendMax = Math.max(1, ...s.trend.map((t) => t.claimed), ...s.trend.map((t) => t.recovered));

  return (
    <div className="p-8">
      <LoadingLink href="/warranty" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Warranty</LoadingLink>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Warranty analytics</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
            What happened, why, what the numbers look like, what is coming, and what to do about it — worked out live from every warranty
            and claim. Each figure says how it is calculated.
          </p>
        </div>
        <p className="text-xs text-[var(--ejo-text-muted)]">Calculated {formatDateTime(a.generatedAt)}</p>
      </div>

      <Section title="What to do now" subtitle="Prescriptive — prioritised actions, each linked to its record. Priority 1 protects money at risk today.">
        {a.prescriptive.actions.length === 0 ? (
          <p className={`${card} text-sm text-[var(--ejo-text-muted)]`}>Nothing needs attention right now.</p>
        ) : (
          <div className="space-y-2">
            {a.prescriptive.actions.slice(0, 30).map((act, i) => (
              <LoadingLink key={`${act.href}-${i}`} href={act.href} className={`flex items-start gap-3 ${card} hover:border-[var(--ejo-primary)]`}>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${act.priority === 1 ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : act.priority === 2 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'}`}>
                  P{act.priority}
                </span>
                <span>
                  <span className="block text-sm font-medium text-[var(--ejo-text)]">{act.title}</span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{act.detail}</span>
                </span>
              </LoadingLink>
            ))}
            {a.prescriptive.actions.length > 30 ? <p className="text-xs text-[var(--ejo-text-muted)]">+ {a.prescriptive.actions.length - 30} more.</p> : null}
          </div>
        )}
        {a.prescriptive.leakageCount > 0 ? (
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
            Warranty leakage: {a.prescriptive.leakageCount} {a.prescriptive.leakageCount === 1 ? 'repair' : 'repairs'} in the last 180 days on vehicles under an active
            vehicle warranty had no claim — review whether any part of them was claimable.
          </p>
        ) : null}
      </Section>

      <Section title="Descriptive" subtitle="What has happened — coverage, claims and money.">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Warranties covering now" value={String(d.covering)} hint={`of ${d.warranties} (${d.assetWarranties} vehicle, ${d.partWarranties} part)`} tone="text-[var(--ejo-success)]" />
          <Kpi label="Claimed" value={naira(d.claimed)} hint={`${d.claims} ${d.claims === 1 ? 'claim' : 'claims'} (excl. cancelled)`} />
          <Kpi label="Approved by providers" value={naira(d.approved)} hint={`Value approval ${pct(d.valueApprovalRate)} of decided claims`} />
          <Kpi label="Recovered" value={naira(d.recovered)} hint={`Cash + parts + repairs · collection ${pct(d.collectionRate)} of approved`} tone="text-[var(--ejo-success)]" />
          <Kpi label="Approval rate" value={pct(d.approvalRate)} hint="Accepted in full or part ÷ decided" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Warranties by coverage</p>
            <Bars rows={Object.entries(d.byState).map(([k, v]) => ({ label: WARRANTY_STATE_LABEL[k as keyof typeof WARRANTY_STATE_LABEL], value: v }))} />
          </div>
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Claims by stage</p>
            <Bars rows={Object.entries(d.byStatus).map(([k, v]) => ({ label: CLAIM_STATUS_LABEL[k] ?? k, value: v }))} />
          </div>
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">How providers make it right</p>
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

      <Section title="Diagnostic" subtitle="Why — which parts fail, which providers pay, what gets rejected, and whether timing matters.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Top failing parts</p>
            {g.topParts.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No claims yet.</p> : (
              <table className="w-full">
                <thead><tr><th className={th}>Part</th><th className={`${th} text-right`}>Claims</th><th className={`${th} text-right`}>Claimed</th><th className={`${th} text-right`}>Rejected</th></tr></thead>
                <tbody>{g.topParts.map((t) => <tr key={t.part} className="border-t border-[var(--ejo-border)]"><td className={td}>{t.part}</td><td className={`${td} text-right`}>{t.claims}</td><td className={`${td} text-right`}>{naira(t.claimed)}</td><td className={`${td} text-right`}>{pct(t.rejectionRate)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className={card}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Provider performance</p>
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
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Timing and resubmissions</p>
            <ul className="space-y-1 text-sm text-[var(--ejo-text)]">
              <li>{g.late.late} of {g.late.submitted} submitted {g.late.submitted === 1 ? 'claim was' : 'claims were'} after the provider&apos;s deadline.</li>
              <li>Rejection rate — late: {pct(g.late.lateRejectionRate)} · on time: {pct(g.late.onTimeRejectionRate)}.</li>
              <li>Resubmitted claims decided: {g.resubmissions.decided} · success after resubmission: {pct(g.resubmissions.successRate)}.</li>
            </ul>
          </div>
          <div className={card}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Claims by vehicle model</p>
            {g.models.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No vehicle warranties yet.</p> : (
              <table className="w-full">
                <thead><tr><th className={th}>Model</th><th className={`${th} text-right`}>Warranties</th><th className={`${th} text-right`}>Claims</th><th className={`${th} text-right`}>Per warranty</th></tr></thead>
                <tbody>{g.models.map((m) => <tr key={m.model} className="border-t border-[var(--ejo-border)]"><td className={td}>{m.model}</td><td className={`${td} text-right`}>{m.warranties}</td><td className={`${td} text-right`}>{m.claims}</td><td className={`${td} text-right`}>{m.claimsPerWarranty === null ? '—' : m.claimsPerWarranty.toFixed(2)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className={`${card} lg:col-span-2`}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Why claims were rejected</p>
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

      <Section title="Statistics" subtitle="Distributions and turnaround — the shape behind the totals.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={card}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Claim value (₦)</p>
            <table className="w-full"><tbody>
              {([['Claims', String(s.claimValue.count)], ['Mean', naira(s.claimValue.mean)], ['Median', naira(s.claimValue.median)], ['90th percentile', naira(s.claimValue.p90)], ['Std. deviation', naira(s.claimValue.stdDev)], ['Smallest', naira(s.claimValue.min)], ['Largest', naira(s.claimValue.max)]] as const).map(([k, v]) => (
                <tr key={k} className="border-t border-[var(--ejo-border)]"><td className={td}>{k}</td><td className={`${td} text-right`}>{v}</td></tr>
              ))}
            </tbody></table>
          </div>
          <div className={card}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Turnaround</p>
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
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Last 12 months</p>
            <div className="flex h-32 items-end gap-1">
              {s.trend.map((t) => (
                <div key={t.label} className="flex flex-1 flex-col items-center gap-0.5" title={`${t.label}: ${t.opened} opened · claimed ${naira(t.claimed)} · recovered ${naira(t.recovered)}`}>
                  <div className="flex h-24 w-full items-end gap-px">
                    <div className="flex-1 rounded-t bg-[var(--ejo-primary)]/70" style={{ height: `${(t.claimed / trendMax) * 100}%` }} />
                    <div className="flex-1 rounded-t bg-[var(--ejo-success)]/80" style={{ height: `${(t.recovered / trendMax) * 100}%` }} />
                  </div>
                  <span className="text-[9px] text-[var(--ejo-text-muted)]">{t.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Blue: claimed (by month opened) · Green: recovered (by month settled).</p>
          </div>
        </div>
      </Section>

      <Section title="Predictive" subtitle="What is coming — based on this organisation's own history (not guesses).">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Expiring in 30 / 60 / 90 days" value={`${p.expiring30} / ${p.expiring60} / ${p.expiring90}`} hint="Warranties still covering that will end" tone="text-[var(--ejo-warning)]" />
          <Kpi label="Expected claims, next 90 days" value={p.expectedClaims90 === null ? '—' : p.expectedClaims90.toFixed(1)} hint={p.claimRatePerWarrantyMonth === null ? 'Not enough history yet' : `${(p.claimRatePerWarrantyMonth * 100).toFixed(2)} claims per 100 warranty-months × ${p.basis.activeWarranties} covering × 3 months`} />
          <Kpi label="Expected claim cost, next 90 days" value={naira(p.expectedCost90)} hint="Expected claims × median claim value" />
          <Kpi label="In progress (not yet decided)" value={naira(p.pipelineValue)} hint={`Expected to be approved: ${naira(p.expectedPipelineRecovery)} (at the value-approval rate)`} />
          <Kpi label="Approved, awaiting settlement" value={naira(p.awaitingMoney)} hint="Money, replacements or repairs still to arrive" tone="text-[var(--ejo-info)]" />
        </div>
        <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]">
          Basis: {p.basis.recentClaims} {p.basis.recentClaims === 1 ? 'claim' : 'claims'} in the last 12 months over {p.basis.warrantyMonths.toLocaleString('en-NG')} warranty-months of cover. Forecasts sharpen as history grows.
        </p>
      </Section>
    </div>
  );
}
