import { guardPage } from '@/lib/authz/server';
import { getTeamPerformance } from '@/lib/actions/team';
import { HQ_PERIODS } from '@/lib/hq-core';
import { RATING_LABEL, STANDARDS } from '@/lib/team-core';
import { HqTabs } from '@/components/HqTabs';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, SectionCard, StatTile, StatusChip } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

export const metadata = { title: 'Team performance' };
export const dynamic = 'force-dynamic';

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const hrs = (h: number | null) => (h === null ? '—' : h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} d`);
const TONE = { strong: 'success', steady: 'brand', attention: 'warning', quiet: 'neutral' } as const;

/**
 * Team performance: for each person who handled a step in the period — jobs
 * finished, estimates checked and approved, parts and outside purchases
 * approved, released and paid — how many, how fast (median hours from the
 * moment it reached them), the share within the standard, the money involved,
 * rework, and jobs open now. Read-only; within the viewer's reach.
 */
export default async function TeamPerformancePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await guardPage('analytics.business.view', '/headquarters/team');
  const sp = await searchParams;
  const t = await getTeamPerformance(sp.period);
  const link = (k: string) => (k === 'this_month' ? '/headquarters/team' : `/headquarters/team?period=${k}`);
  return (
    <div className="w-full max-w-[90rem] space-y-6 p-4 sm:p-8" data-testid="team-performance">
      <PageHeader icon="users" title="Team performance" eyebrow="Headquarters"
        description={`${t.branchLabel} · ${t.period.label} · as of ${formatDateTime(t.asOf)}. How each person handles the steps that wait on them — by time and by money.`} />
      <HqTabs active="/headquarters/team" period={t.period.key} />
      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {HQ_PERIODS.map((p) => <LoadingLink key={p.key} href={link(p.key)} aria-current={t.period.key === p.key ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${t.period.key === p.key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}>{p.label}</LoadingLink>)}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="users" label="People who handled work" value={t.totals.people} />
        <StatTile icon="check-circle" label="Steps handled" value={t.totals.handled} />
        <StatTile icon="clock" label="Within the standard" value={t.totals.withinPct === null ? '—' : `${t.totals.withinPct}%`} tone={t.totals.withinPct !== null && t.totals.withinPct < 70 ? 'warning' : 'brand'} />
        <StatTile icon="alert" label="Needs attention" value={t.totals.attention} hint={`${t.totals.strong} strong`} tone={t.totals.attention ? 'warning' : 'brand'} />
      </div>

      <SectionCard icon="users" title="Everyone, most work first" description="Open a person to see each kind of step. Times run from when the step reached them to when they did it." flush>
        {t.people.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <caption className="sr-only">Team performance, {t.period.label}</caption>
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-[11px] uppercase tracking-wide text-[var(--ejo-text-muted)]">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Person</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Handled</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Median time</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Within standard</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Value</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Rework</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Open now</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Rating</th>
                </tr>
              </thead>
              <tbody>
                {t.people.map((r) => (
                  <tr key={r.userId} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <details>
                        <summary className="cursor-pointer list-none">
                          <span className="block font-medium text-[var(--ejo-text)]">{r.name}</span>
                          <span className="block text-xs text-[var(--ejo-text-muted)]">{r.roles}{r.branch ? ` · ${r.branch}` : ''}</span>
                        </summary>
                        {r.steps.length ? (
                          <ul className="mt-2 space-y-1 text-xs text-[var(--ejo-text-muted)]">
                            {r.steps.map((s) => <li key={s.kind}><span className="text-[var(--ejo-text)]">{s.label}</span>: {s.count} · median {hrs(s.medianHours)} · {s.withinPct === null ? 'no timing' : `${s.withinPct}% within ${s.standardHours} h`}</li>)}
                          </ul>
                        ) : <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Nothing handled in this period.</p>}
                      </details>
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums">{r.handled}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{hrs(r.medianHours)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${r.withinPct !== null && r.withinPct < 60 ? 'font-semibold text-[var(--ejo-warning-text)]' : ''}`}>{r.withinPct === null ? '—' : `${r.withinPct}%`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.value ? naira(r.value) : '—'}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${r.rework ? 'font-semibold text-[var(--ejo-error)]' : ''}`}>{r.rework || '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.openNow || '—'}</td>
                    <td className="px-4 py-3"><StatusChip tone={TONE[r.rating]} label={RATING_LABEL[r.rating]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-4 text-sm text-[var(--ejo-text-muted)]">Nobody handled a step in this period yet.</p>}
      </SectionCard>

      <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-[var(--ejo-text)]">The standards and how the rating works</summary>
        <ul className="mt-2 grid gap-1 text-[var(--ejo-text-muted)] sm:grid-cols-2">
          {Object.values(STANDARDS).map((s) => <li key={s.label}>{s.label}: within <b>{s.hours} hours</b></li>)}
        </ul>
        <p className="mt-2 text-[var(--ejo-text-muted)]"><b>Value</b>: for technicians, the estimate of each job they finished; for Finance, the cash paid out. <b>Rework</b>: finished jobs sent back from quality check in the period. <b>Needs attention</b>: under 60% within the standard (three or more steps) or rework on more than a fifth of finished jobs. <b>Strong</b>: 90% or more within the standard on five or more steps. {pluralize(t.people.length, 'person', 'people')} listed; names and roles only.</p>
      </details>
    </div>
  );
}
