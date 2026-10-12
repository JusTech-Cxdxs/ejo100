import { nairaShort } from '@/lib/customer-portal/format';

/**
 * Small, light charts drawn with plain CSS/SVG — no chart library. Green is
 * the primary series; values are also written as text for screen readers.
 */
export function MonthlyBars({ data, label }: { data: { month: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <figcaption className="sr-only">{label}: {data.map((d) => `${d.month} ${nairaShort(d.value)}`).join(', ')}</figcaption>
      <div className="flex h-36 items-end gap-2 sm:gap-3" aria-hidden="true">
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(6, Math.round((d.value / max) * 100)) : 3;
          const last = i === data.length - 1;
          return (
            <div key={d.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className={`text-[10px] font-medium ${d.value > 0 ? 'text-[var(--ejo-text-muted)]' : 'text-transparent'}`}>{nairaShort(d.value)}</span>
              <div
                className={`ejo-grow-y w-full max-w-[38px] rounded-t-md ${d.value > 0 ? (last ? 'bg-[var(--ejo-primary)]' : 'bg-[var(--ejo-primary)]/45') : 'bg-[var(--ejo-border)]'}`}
                style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }}
              />
              <span className="text-[11px] text-[var(--ejo-text-muted)]">{d.month}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/** A thin progress meter, e.g. "paid 70% of the estimate". */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ejo-border)]">
        <div className="ejo-grow-x h-full rounded-full bg-[var(--ejo-primary)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
