import { buildTrainingSet } from '@/lib/enyo/predict/dataset';
import { SectionCard } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';

const REASONS: [keyof import('@/lib/enyo/predict/dataset-core').QualityReport['dropped'], string][] = [
  ['test_or_junk_text', 'Test or placeholder text ("test", "asdf", "hello")'],
  ['no_complaint', 'No complaint written'],
  ['impossible_line', 'A line with an impossible quantity or price, or no lines'],
  ['duplicate', 'The same job saved twice'],
];

/**
 * What the models would learn from right now: finished jobs examined, kept,
 * and left out (with why), plus the organisation's learn-from day. Shown to
 * Enyo managers on the learning page, streamed in after the page.
 */
export async function DataQualityCard({ organisationId, branchIds }: { organisationId: string; branchIds: string[] | null }) {
  const { report, learnFrom } = await buildTrainingSet({ organisationId, branchIds });
  const left = report.examined - report.kept;
  const share = report.examined ? Math.round((report.kept / report.examined) * 100) : null;
  return (
    <SectionCard icon="check-circle" title="Training data quality" description="What the models learn from. Rows that would teach the wrong thing are left out automatically.">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-[var(--ejo-text-muted)]">Finished jobs examined</dt><dd className="mt-0.5 text-lg font-semibold text-[var(--ejo-text)]">{report.examined.toLocaleString('en-NG')}</dd></div>
        <div><dt className="text-xs text-[var(--ejo-text-muted)]">Used for learning</dt><dd className="mt-0.5 text-lg font-semibold text-[var(--ejo-success)]">{report.kept.toLocaleString('en-NG')}{share !== null ? <span className="ml-1 text-xs font-normal text-[var(--ejo-text-muted)]">({share}%)</span> : null}</dd></div>
        <div><dt className="text-xs text-[var(--ejo-text-muted)]">Left out</dt><dd className="mt-0.5 text-lg font-semibold text-[var(--ejo-text)]">{left.toLocaleString('en-NG')}</dd></div>
      </dl>
      {left > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm">
          {REASONS.filter(([k]) => report.dropped[k] > 0).map(([k, label]) => (
            <li key={k} className="flex items-baseline justify-between gap-3"><span className="text-[var(--ejo-text)]">{label}</span><span className="font-medium tabular-nums text-[var(--ejo-text)]">{report.dropped[k].toLocaleString('en-NG')}</span></li>
          ))}
        </ul>
      ) : null}
      {report.blanked.turnaround_too_short > 0 ? (
        <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{report.blanked.turnaround_too_short.toLocaleString('en-NG')} job times under 30 minutes were ignored for job-time learning (the rest of each job was kept).</p>
      ) : null}
      <p className="mt-4 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">
        {learnFrom
          ? <>Learning only from records opened on or after <strong>{formatDateOnly(learnFrom)}</strong>. Change it in <a href="/settings/enyo" className="font-medium text-[var(--ejo-primary)] underline underline-offset-2">Settings → Enyo</a>.</>
          : <>Learning from all history. When you start using the portal for real, set the go-live day in <a href="/settings/enyo" className="font-medium text-[var(--ejo-primary)] underline underline-offset-2">Settings → Enyo</a> so test data is never learned from.</>}
      </p>
    </SectionCard>
  );
}
