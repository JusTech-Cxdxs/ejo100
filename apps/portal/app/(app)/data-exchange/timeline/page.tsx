import Link from 'next/link';
import { guardAnyPage } from '@/lib/authz/server';
import { getDataExchangeTimeline, type ExchangeEvent } from '@/lib/actions/data-exchange';
import { ENTITIES } from '@/lib/data-exchange/fields';
import { EmptyState, PageHeader, SectionCard } from '@/components/ui';

export const dynamic = 'force-dynamic';

const KIND: Record<ExchangeEvent['kind'], { label: string; dot: string }> = {
  started: { label: 'Started', dot: 'bg-[var(--ejo-info)]' },
  loaded: { label: 'Loaded', dot: 'bg-[var(--ejo-success)]' },
  confirmed: { label: 'Totals confirmed (Finance)', dot: 'bg-[var(--ejo-primary)]' },
  undone: { label: 'Undone', dot: 'bg-[var(--ejo-warning)]' },
  released: { label: 'Staged file released', dot: 'bg-[var(--ejo-text-muted)]' },
  cancelled: { label: 'Cancelled', dot: 'bg-[var(--ejo-error)]' },
};
const lagosDay = (d: Date) => new Date(+d + 3_600_000).toISOString().slice(0, 10);
const time = (d: Date) => d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' });

/** Data Exchange, day by day: a month calendar of imports started, loaded, confirmed, undone and released; a day opens its list. */
export default async function DataExchangeTimelinePage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  await guardAnyPage(['dataexchange.import.run', 'dataexchange.import.approve'], '/data-exchange/timeline');
  const sp = await searchParams;
  const { month, events } = await getDataExchangeTimeline(sp.month);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const byDay = new Map<string, ExchangeEvent[]>();
  for (const e of events) byDay.set(lagosDay(e.at), [...(byDay.get(lagosDay(e.at)) ?? []), e]);
  const today = lagosDay(new Date());
  const chosen = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day.startsWith(month) ? sp.day : null;
  const list = chosen ? byDay.get(chosen) ?? [] : events;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="calendar" back={{ href: '/data-exchange', label: 'Back to Data Exchange' }} title="Data Exchange, day by day" description="Every import started, loaded, confirmed by Finance, undone or released, by day (Lagos time). Choose a day to see its list; each opens its import. Exports and the daily SAP files appear here too once they are in use." />
      <SectionCard icon="calendar" title={label} actions={<span className="flex gap-2 text-sm"><Link className="font-medium text-[var(--ejo-primary)] hover:underline" href={`/data-exchange/timeline?month=${prev}`}>← Previous</Link><Link className="font-medium text-[var(--ejo-primary)] hover:underline" href={`/data-exchange/timeline?month=${next}`}>Next →</Link></span>}>
        <div role="grid" aria-label={`Data Exchange activity, ${label}`} className="grid grid-cols-7 gap-1 text-center text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} role="columnheader" className="py-1 font-medium text-[var(--ejo-text-muted)]">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, i) => {
            const d = `${month}-${String(i + 1).padStart(2, '0')}`;
            const ev = byDay.get(d) ?? [];
            const kinds = [...new Set(ev.map((e) => e.kind))];
            return (
              <Link key={d} role="gridcell" href={`/data-exchange/timeline?month=${month}&day=${d}`} aria-label={`${i + 1} ${label}: ${ev.length} event${ev.length === 1 ? '' : 's'}`} aria-current={chosen === d ? 'date' : undefined}
                className={`flex min-h-14 flex-col items-center justify-start gap-1 rounded-[var(--ejo-radius-md)] border p-1 ${chosen === d ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/5' : 'border-[var(--ejo-border)] hover:bg-[var(--ejo-bg)]'} ${d === today ? 'font-semibold' : ''}`}>
                <span className="text-[var(--ejo-text)]">{i + 1}</span>
                {ev.length ? <span className="flex flex-wrap justify-center gap-0.5">{kinds.map((k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${KIND[k].dot}`} />)}</span> : null}
                {ev.length ? <span className="tabular-nums text-[10px] text-[var(--ejo-text-muted)]">{ev.length}</span> : null}
              </Link>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ejo-text-muted)]">{Object.entries(KIND).map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${v.dot}`} />{v.label}</li>)}</ul>
      </SectionCard>
      <SectionCard icon="history" title={chosen ? new Date(`${chosen}T12:00:00Z`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : `All of ${label}`} description={chosen ? undefined : 'Choose a day above to see only that day.'} flush>
        {list.length === 0 ? <div className="p-4"><EmptyState compact icon="inbox" title="Nothing happened in Data Exchange on this day." /></div> : (
          <ol className="divide-y divide-[var(--ejo-border)]">
            {list.map((e, i) => (
              <li key={`${e.importId}-${e.kind}-${i}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex min-w-0 items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND[e.kind].dot}`} />
                  <span className="min-w-0">
                    <span className="font-medium text-[var(--ejo-text)]">{KIND[e.kind].label}</span>{' · '}
                    <Link href={`/data-exchange/imports/${e.importId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{e.number}</Link>
                    <span className="block break-words text-xs text-[var(--ejo-text-muted)]">{ENTITIES[e.entity].label} · {e.fileName} · {e.rows.toLocaleString('en-NG')} rows{e.by ? ` · ${e.by}` : ''}</span>
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-xs text-[var(--ejo-text-muted)]">{chosen ? time(e.at) : `${lagosDay(e.at).slice(8)} · ${time(e.at)}`}</span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
