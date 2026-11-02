'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loadPlantDemoNow, removePlantDemoNow } from '@/lib/actions/plant-demo';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const field = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const btn = 'ejo-press inline-flex min-h-11 items-center justify-center rounded-[var(--ejo-radius-md)] border px-4 text-sm font-semibold disabled:opacity-50';

/** An administrator's card: load six weeks of invented plant records (or take them out). Typed words confirm it. */
export function PlantDemoCard({ state }: { state: { vehicles: number; shipments: number; loadedAt: Date | null } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; summary: string } | { ok: false; error: string }>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: 'That did not work. Try again.' }));
    if (r.ok) { setMsg({ ok: true, text: r.summary }); setWords(''); router.refresh(); } else setMsg({ ok: false, text: r.error });
  });
  return (
    <section aria-labelledby="plant-demo" className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4" data-testid="plant-demo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="plant-demo" className="text-sm font-semibold text-[var(--ejo-text)]">Demo records</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">{state.vehicles ? `${state.vehicles} demo vehicles and ${state.shipments} demo shipments are in the plant${state.loadedAt ? `, loaded ${formatDateTimeCompact(state.loadedAt)}` : ''}.` : 'No demo records in the plant.'} Six invented weeks of kits, builds, defects, audits and PDIs, as of the moment they are loaded; marked EJO-DEMO and replaced each time. Nothing a person made is touched.</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>{open ? 'Close' : state.vehicles ? 'Reload or remove the demo' : 'Load the plant demo'}</button>
      </div>
      {open ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--ejo-text-muted)]">Type <b>load the demo</b> or <b>remove the demo</b><input value={words} onChange={(e) => setWords(e.target.value)} className={`${field} mt-1 block w-64`} autoComplete="off" /></label>
          <button type="button" disabled={pending || words.trim().toLowerCase() !== 'load the demo'} onClick={() => run(() => loadPlantDemoNow(words))} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white`}>{pending ? 'Working…' : 'Load the demo as of now'}</button>
          <button type="button" disabled={pending || words.trim().toLowerCase() !== 'remove the demo'} onClick={() => run(() => removePlantDemoNow(words))} className={`${btn} border-[var(--ejo-error)] text-[var(--ejo-error)]`}>Remove the demo</button>
        </div>
      ) : null}
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${msg.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{msg.text}</p> : null}
    </section>
  );
}
