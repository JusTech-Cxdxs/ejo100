import Link from 'next/link';

/**
 * Include, or leave out, the history brought in from SAP (invoices from
 * before EJO 100) in a dashboard's figures. `?history=exclude` leaves it out;
 * the page's other choices (period, filters) are kept.
 */
export function HistoryToggle({ path, params, include }: { path: string; params: Record<string, string | undefined>; include: boolean }) {
  const href = (on: boolean) => {
    const p = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]) && e[0] !== 'history' && e[0] !== 'page'));
    if (!on) p.set('history', 'exclude');
    const s = p.toString();
    return `${path}${s ? `?${s}` : ''}`;
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${include === on ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`;
  return (
    <nav aria-label="History from before EJO" className="inline-flex items-center gap-1 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-0.5">
      <Link href={href(true)} aria-current={include ? 'true' : undefined} className={pill(true)} prefetch={false}>With SAP history</Link>
      <Link href={href(false)} aria-current={!include ? 'true' : undefined} className={pill(false)} prefetch={false}>EJO only</Link>
    </nav>
  );
}
