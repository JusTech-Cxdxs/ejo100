'use client';

import { useEffect, useState } from 'react';
import type { EnyoMemoryFact } from '@/lib/enyo/client-contract';
import { formatDateOnly } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { forgetMemory, loadMemories } from './api';
import { EIcon } from './icons';

/** The facts Enyo keeps about the signed-in person; each can be deleted. */
export function EnyoMemoryList() {
  const [items, setItems] = useState<EnyoMemoryFact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadMemories().then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.items); else { setError(r.error); setItems([]); }
    });
    return () => { live = false; };
  }, []);

  async function remove(id: string) {
    setConfirming(null);
    const before = items;
    setItems((l) => l?.filter((m) => m.id !== id) ?? null);
    const r = await forgetMemory(id);
    if (r.ok) setNote('Deleted. Enyo will no longer use it.');
    else { setItems(before); setNote(r.error); }
  }

  if (items === null) return <p role="status" className="text-sm text-[var(--ejo-text-muted)]">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-[var(--ejo-text)]">{error}</p>;

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Enyo does not remember anything about you yet. If you tell it something worth keeping (for example, &ldquo;I look after the Lekki branch&rdquo;), it will appear here.</p>
      ) : (
        <>
          <p className="text-xs text-[var(--ejo-text-muted)]">{pluralize(items.length, 'fact')} kept.</p>
          <ul aria-label="What Enyo remembers" className="mt-3 divide-y divide-[var(--ejo-border)]">
            {items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-[var(--ejo-text)]">{m.fact}</p>
                  <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">Kept since {formatDateOnly(new Date(m.createdAt))}</p>
                </div>
                {confirming === m.id ? (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => remove(m.id)} className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-3 text-sm font-medium text-white">Delete</button>
                    <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm text-[var(--ejo-text)]">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(m.id)} aria-label={`Delete: ${m.fact.slice(0, 60)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] px-3 text-sm text-[var(--ejo-text-muted)] hover:bg-[color-mix(in_srgb,var(--ejo-error)_8%,transparent)] hover:text-[var(--ejo-error)]">
                    <EIcon name="trash" size={16} />Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {note ? <p role="status" className="mt-3 text-xs text-[var(--ejo-text-muted)]">{note}</p> : null}
    </div>
  );
}
