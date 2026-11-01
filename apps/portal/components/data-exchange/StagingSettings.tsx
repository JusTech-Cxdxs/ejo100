'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setImportStagingDays } from '@/lib/actions/data-exchange';

/** Administrators: how many days a finished import keeps the staged copy of its file (0 = for ever). */
export function StagingSettings({ days }: { days: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(days));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null); setSaved(false);
        start(async () => {
          try { await setImportStagingDays(Number(value)); setSaved(true); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'It could not be saved.'); }
        });
      }}
    >
      <div>
        <label htmlFor="staging-days" className="text-xs font-medium text-[var(--ejo-text)]">Release a finished import’s file after (days)</label>
        <input id="staging-days" type="number" min={0} max={3650} step={1} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} disabled={pending}
          className="mt-1 block w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </div>
      <button type="submit" disabled={pending} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] disabled:opacity-50">Save</button>
      <p className="w-full text-xs text-[var(--ejo-text-muted)]">0 keeps every file for ever. Counted from when the import finished (or Finance confirmed its totals).</p>
      {saved ? <p role="status" className="w-full text-xs text-[var(--ejo-success)]">Saved.</p> : null}
      {error ? <p role="alert" className="w-full text-xs text-[var(--ejo-error)]">{error}</p> : null}
    </form>
  );
}
