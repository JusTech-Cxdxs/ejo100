import type { ReactNode } from 'react';

let seq = 0;

/**
 * A security list table. On a desktop: fixed layout, wrapping cells, clear
 * column headers (never scrolls sideways). On a phone: each row becomes a
 * card, every value labelled with its column name.
 */
export function SecurityTable({ headers, children, empty, widths }: { headers: string[]; children: ReactNode; empty: string | null; widths?: string[] }) {
  const cls = `sec-t${(seq = (seq + 1) % 100000)}`;
  const esc = (h: string) => h.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const css = `@media (max-width: 767px) {
  .${cls} thead { display: none; }
  .${cls}, .${cls} tbody, .${cls} tr, .${cls} td { display: block; width: 100%; }
  .${cls} tr { padding: 10px 12px; }
  .${cls} td { padding: 3px 0 !important; }
  .${cls} td:empty { display: none; }
${headers.map((h, i) => (h ? `  .${cls} td:nth-child(${i + 1})::before { content: "${esc(h)}"; display: block; font-size: 10px; font-weight: 600; color: var(--ejo-text-muted); text-transform: uppercase; letter-spacing: .04em; }` : '')).filter(Boolean).join('\n')}
}`;
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      {empty ? (
        <p className="p-6 text-sm text-[var(--ejo-text-muted)]">{empty}</p>
      ) : (
        <>
          <style>{css}</style>
          <table className={`${cls} w-full table-fixed text-sm`}>
            {widths ? <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup> : null}
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs font-semibold text-[var(--ejo-text-muted)]">
                {headers.map((h, i) => <th key={`${h}-${i}`} className="px-3 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ejo-border)] [&_td]:break-words [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top">{children}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
