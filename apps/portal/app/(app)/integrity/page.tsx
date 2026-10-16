import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getIntegrityOverview } from '@/lib/actions/integrity';
import { runIntegrityScanAction } from '@/lib/actions/integrity-form-handlers';
import { PageHeader, SectionCard, EmptyState, StatTile } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { RULES, RULE_KEYS, SEVERITIES, type Severity } from '@/lib/integrity/core';
import { formatDateTime, formatRelative } from '@/lib/utils/format-date';

export const metadata = { title: 'Integrity watch' };
export const dynamic = 'force-dynamic';

const SEV: Record<Severity, string> = {
  HIGH: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)] ring-[var(--ejo-error)]/30',
  MEDIUM: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)] ring-[var(--ejo-warning)]/30',
  LOW: 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] ring-[var(--ejo-border)]',
};
const select = 'min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2.5 text-sm text-[var(--ejo-text)]';

/**
 * The integrity watch: unusual or risky activity the daily checks found —
 * money, parts and purchases, warranty, the gate, access and sign-ins — and
 * concerns colleagues raised (Speak up). A flag is a reason to look, never
 * proof. Alerts about you are shown to the other reviewers only.
 */
export default async function IntegrityPage({ searchParams }: { searchParams: Promise<{ status?: string; severity?: string; rule?: string; found?: string; new?: string; error?: string }> }) {
  await guardPage('integrity.review', '/integrity');
  const sp = await searchParams;
  const o = await getIntegrityOverview({ status: sp.status === 'scanned' ? undefined : sp.status, severity: sp.severity, rule: sp.rule });
  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader icon="shield" title="Integrity watch" eyebrow="Administration"
        description="Unusual or risky activity found by the daily checks, and concerns raised by colleagues. Each one is a reason to look — never proof. Nobody sees or decides an alert about themselves."
        actions={<form action={runIntegrityScanAction}><SubmitButton label="Run the checks now" pendingLabel="Checking…" className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 text-sm font-medium text-[var(--ejo-text)]" /></form>} />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {sp.status === 'scanned' ? <FormFeedbackBanner kind="success" message={`Checks done: ${Number(sp.found) || 0} finding${Number(sp.found) === 1 ? '' : 's'}, ${Number(sp.new) || 0} new.`} /> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="shield" label="New" value={o.counts.new} tone={o.counts.new ? 'warning' : 'brand'} href="/integrity?status=NEW" />
        <StatTile icon="clock" label="Being looked at" value={o.counts.reviewing} href="/integrity?status=REVIEWING" />
        <StatTile icon="shield" label="High, still open" value={o.counts.high} tone={o.counts.high ? 'error' : 'brand'} emphasis={o.counts.high > 0} href="/integrity?severity=HIGH" />
        <StatTile icon="history" label="Last checked" value={o.lastScan ? formatRelative(o.lastScan) : 'Daily'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <SectionCard icon="list" title="Alerts" description={`${o.rows.length} shown`}
          actions={(
            <form className="flex flex-wrap gap-2" action="/integrity">
              <label className="sr-only" htmlFor="f-status">Status</label>
              <select id="f-status" name="status" defaultValue={o.filter.status} className={select}>
                <option value="open">Open</option><option value="NEW">New</option><option value="REVIEWING">Being looked at</option><option value="CONFIRMED">Confirmed</option><option value="DISMISSED">Dismissed</option><option value="all">All</option>
              </select>
              <label className="sr-only" htmlFor="f-sev">Severity</label>
              <select id="f-sev" name="severity" defaultValue={o.filter.severity} className={select}>
                <option value="all">Any severity</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
              </select>
              <label className="sr-only" htmlFor="f-rule">Check</label>
              <select id="f-rule" name="rule" defaultValue={o.filter.rule} className={select}>
                <option value="all">Every check</option>{RULE_KEYS.map((k) => <option key={k} value={k}>{RULES[k].label}</option>)}
              </select>
              <button type="submit" className="min-h-10 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-medium text-white">Show</button>
            </form>
          )}>
          {o.rows.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {o.rows.map((a) => (
                <li key={a.id}>
                  <Link href={`/integrity/${a.id}`} className="flex min-h-11 flex-col gap-1 py-3 hover:bg-[var(--ejo-bg)] sm:px-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${SEV[a.severity]}`}>{a.severity}</span>
                      <span className="text-sm font-medium text-[var(--ejo-text)]">{a.title}</span>
                    </span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{a.area} · {a.ruleLabel}{a.subject ? ` · ${a.subject}` : ''} · {a.statusLabel} · {formatDateTime(a.lastSeenAt)}{a.seenCount > 1 ? ` · seen ${a.seenCount}×` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="shield" title="Nothing to look at">No alerts match. The checks run every day; you can also run them now.</EmptyState>}
        </SectionCard>
        <aside className="space-y-6">
          <SectionCard icon="chart" title="Open by check">
            {o.byRule.length ? (
              <ul className="space-y-1.5 text-sm">{o.byRule.map((r) => <li key={r.rule} className="flex justify-between gap-2"><Link href={`/integrity?rule=${r.rule}`} className="text-[var(--ejo-primary)] hover:underline">{r.label}</Link><span className="text-[var(--ejo-text-muted)]">{r.open}</span></li>)}</ul>
            ) : <p className="text-sm text-[var(--ejo-text-muted)]">Nothing open.</p>}
          </SectionCard>
          <SectionCard icon="help" title="What is checked">
            <ul className="space-y-2 text-xs leading-relaxed text-[var(--ejo-text-muted)]">{RULE_KEYS.map((k) => <li key={k}><span className="font-medium text-[var(--ejo-text)]">{RULES[k].label}.</span> {RULES[k].why}</li>)}</ul>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
