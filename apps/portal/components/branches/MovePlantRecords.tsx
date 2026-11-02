'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { movePlantRecords, type StrandedPlantRecords } from '@/lib/actions/branches';
import { BRANCH_TYPE_WORDS, isBranchType } from '@/lib/branch-types';

const field = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** Plant records on a branch that is not an assembly plant: moved, all together, to the plant they belong to. */
export function MovePlantRecords({ stranded }: { stranded: StrandedPlantRecords }) {
  const router = useRouter();
  const [to, setTo] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!stranded.branches.length) return null;
  return (
    <section aria-labelledby="stranded-plant" className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/50 bg-[var(--ejo-warning)]/10 p-5">
      <h2 id="stranded-plant" className="text-sm font-semibold text-[var(--ejo-text)]">Plant records on a branch that is not an assembly plant</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Kits, shipments, vehicles in the plant and PDIs recorded before this branch had a kind. The plant team cannot see them until they are on an assembly plant. Moving them changes nothing else; it is in the audit trail.</p>
      {!stranded.plants.length ? <p className="mt-3 text-sm text-[var(--ejo-text)]">There is no assembly plant yet: open one under <Link href="/structure" className="font-medium text-[var(--ejo-primary)] hover:underline">Organisation structure</Link> (kind: Assembly plant, with its SAP plant code), then come back here.</p> : null}
      <ul className="mt-3 space-y-3">
        {stranded.branches.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 text-sm" data-stranded={b.id}>
            <span className="text-[var(--ejo-text)]"><b>{b.name}</b> ({isBranchType(b.type) ? BRANCH_TYPE_WORDS[b.type].toLowerCase() : b.type}): {[b.kits ? `${b.kits} kits` : null, b.shipments ? `${b.shipments} shipments` : null, b.vehicles ? `${b.vehicles} vehicles` : null, b.pdis ? `${b.pdis} PDIs` : null].filter(Boolean).join(', ')}</span>
            {stranded.plants.length ? (
              <span className="flex flex-wrap items-center gap-2">
                <select aria-label={`Move the plant records of ${b.name} to`} value={to[b.id] ?? ''} onChange={(e) => setTo((t) => ({ ...t, [b.id]: e.target.value }))} className={field}>
                  <option value="">Move to…</option>
                  {stranded.plants.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sapPlant ? ` (SAP ${p.sapPlant})` : ''}</option>)}
                </select>
                <button type="button" disabled={pending || !to[b.id]} onClick={() => start(async () => {
                  setMsg(null);
                  const r = await movePlantRecords(b.id, to[b.id]!).catch(() => ({ ok: false as const, error: 'That did not work. Try again.' }));
                  if (!r.ok) setMsg({ ok: false, text: r.error });
                  else { setMsg({ ok: true, text: `Moved ${r.moved.kits} kits, ${r.moved.shipments} shipments, ${r.moved.vehicles} vehicles and ${r.moved.pdis} PDIs from ${b.name}.` }); router.refresh(); }
                })} className="ejo-press rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Move plant records</button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${msg.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{msg.text}</p> : null}
    </section>
  );
}
