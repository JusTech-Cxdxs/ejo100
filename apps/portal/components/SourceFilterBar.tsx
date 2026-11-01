import { SOURCE_OPTIONS, SOURCE_PARAMS } from '@/lib/source-filter';

const field = 'mt-1 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/**
 * Where a list's records came from, and when: source, one import, the date
 * they entered EJO and (where the list has one) their original date in the
 * other system. A plain GET form: the list's other filters ride along as
 * hidden fields, and the address can be bookmarked or shared.
 */
export function SourceFilterBar({ action, values, keep = {}, original }: {
  action: string;
  values: Partial<Record<(typeof SOURCE_PARAMS)[number], string | undefined>>;
  /** The list's own filters (search, type…), kept when these are applied. */
  keep?: Record<string, string | undefined>;
  /** Label of the original date ("Customer since"), when the list has one. */
  original?: string;
}) {
  const active = SOURCE_PARAMS.some((k) => values[k]);
  const clear = new URLSearchParams(Object.entries(keep).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return (
    <details open={active} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-[var(--ejo-text)]">Where it came from, and when{active ? <span className="ml-2 rounded-full bg-[var(--ejo-primary)]/10 px-2 py-0.5 text-xs text-[var(--ejo-primary)]">filtered</span> : null}</summary>
      <form method="get" action={action} className="grid gap-3 border-t border-[var(--ejo-border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <div>
          <label htmlFor="sf-source" className="text-xs font-medium text-[var(--ejo-text)]">Source</label>
          <select id="sf-source" name="source" defaultValue={values.source ?? 'all'} className={field}>
            {SOURCE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sf-imp" className="text-xs font-medium text-[var(--ejo-text)]">Import number</label>
          <input id="sf-imp" name="imp" defaultValue={values.imp ?? ''} placeholder="IMP-2026-000012" className={field} />
        </div>
        <div>
          <label htmlFor="sf-entered-from" className="text-xs font-medium text-[var(--ejo-text)]">Entered EJO from</label>
          <input id="sf-entered-from" name="enteredFrom" type="date" defaultValue={values.enteredFrom ?? ''} className={field} />
        </div>
        <div>
          <label htmlFor="sf-entered-to" className="text-xs font-medium text-[var(--ejo-text)]">Entered EJO to</label>
          <input id="sf-entered-to" name="enteredTo" type="date" defaultValue={values.enteredTo ?? ''} className={field} />
        </div>
        {original ? (
          <>
            <div>
              <label htmlFor="sf-original-from" className="text-xs font-medium text-[var(--ejo-text)]">{original} from</label>
              <input id="sf-original-from" name="originalFrom" type="date" defaultValue={values.originalFrom ?? ''} className={field} />
            </div>
            <div>
              <label htmlFor="sf-original-to" className="text-xs font-medium text-[var(--ejo-text)]">{original} to</label>
              <input id="sf-original-to" name="originalTo" type="date" defaultValue={values.originalTo ?? ''} className={field} />
            </div>
          </>
        ) : null}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Apply</button>
          {active ? <a href={`${action}${clear ? `?${clear}` : ''}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Clear</a> : null}
          <p className="text-xs text-[var(--ejo-text-muted)]">Dates are Lagos days, both included.</p>
        </div>
      </form>
    </details>
  );
}
