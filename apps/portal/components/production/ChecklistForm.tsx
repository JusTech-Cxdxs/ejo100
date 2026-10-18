import { input } from '@/components/production/styles';

/**
 * One checklist (line check or QA) as PASS / FAIL / NA radios per item, submitted
 * in one go. Each item travels as item_<i> + result_<i> (+ note_<i>), so the
 * server re-reads the template and refuses an unanswered item.
 */
export function ChecklistItems({ items, prefixId }: { items: string[]; prefixId: string }) {
  if (items.length === 0) return <p className="text-sm text-[var(--ejo-text-muted)]">No checklist items are set up for this family yet — the stage is recorded without a checklist.</p>;
  return (
    <ol className="divide-y divide-[var(--ejo-border)]">
      {items.map((item, i) => (
        <li key={item} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="hidden" name={`item_${i}`} value={item} />
          <div>
            <p className="text-sm text-[var(--ejo-text)]"><span className="mr-2 tabular-nums text-[var(--ejo-text-muted)]">{i + 1}.</span>{item}</p>
            <input name={`note_${i}`} placeholder="Note (optional)" className={`${input} mt-1 max-w-md py-1 text-xs`} maxLength={300} aria-label={`Note for ${item}`} />
          </div>
          <fieldset className="flex gap-1" aria-label={`Result for ${item}`}>
            {(['PASS', 'FAIL', 'NA'] as const).map((r) => (
              <label key={r} className="cursor-pointer rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/10 has-[:checked]:text-[var(--ejo-primary)]">
                <input type="radio" name={`result_${i}`} value={r} required className="sr-only" id={`${prefixId}-${i}-${r}`} />
                {r === 'NA' ? 'N/A' : r === 'PASS' ? 'Pass' : 'Fail'}
              </label>
            ))}
          </fieldset>
        </li>
      ))}
    </ol>
  );
}
