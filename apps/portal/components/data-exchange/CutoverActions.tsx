'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markCutoverStep, reopenCutover, signOffCutover } from '@/lib/actions/data-exchange-cutover';

const btn = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] disabled:opacity-50';
const input = 'mt-1 block w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) => {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) { then?.(); router.refresh(); } else setError(r.error);
      } catch { setError('It could not be saved. Try again.'); }
    });
  };
  return { error, pending, run };
}

/** "Not needed here", with its reason — or "Needed after all" for a step marked so. */
export function CutoverStepMark({ branchId, entity, label, notNeeded }: { branchId: string; entity: string; label: string; notNeeded: boolean }) {
  const { error, pending, run } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (notNeeded) {
    return (
      <div>
        <button type="button" className={btn} disabled={pending} onClick={() => run(() => markCutoverStep(branchId, entity, false))}>Needed after all</button>
        {error ? <p role="alert" className="mt-1 text-xs text-[var(--ejo-error)]">{error}</p> : null}
      </div>
    );
  }
  if (!open) return <button type="button" className={btn} onClick={() => setOpen(true)}>Not needed here</button>;
  const id = `why-${entity}`;
  return (
    <form className="w-full max-w-md" onSubmit={(e) => { e.preventDefault(); run(() => markCutoverStep(branchId, entity, true, reason), () => { setOpen(false); setReason(''); }); }}>
      <label htmlFor={id} className="text-xs font-medium text-[var(--ejo-text)]">Why does this branch have no {label.toLowerCase()}?</label>
      <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required disabled={pending} placeholder="e.g. No open warranty claims on the day" className={input} />
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className={btn}>Mark as not needed</button>
        <button type="button" disabled={pending} className={btn} onClick={() => setOpen(false)}>Keep it</button>
      </div>
      {error ? <p role="alert" className="mt-1 text-xs text-[var(--ejo-error)]">{error}</p> : null}
    </form>
  );
}

/** Sign the branch off as cut over (only when every step is settled), or reopen it with a reason. */
export function CutoverSignOff({ branchId, branchName, ready, signedOff }: { branchId: string; branchName: string; ready: boolean; signedOff: boolean }) {
  const { error, pending, run } = useAct();
  const [reason, setReason] = useState('');
  if (signedOff) {
    return (
      <form className="max-w-md" onSubmit={(e) => { e.preventDefault(); run(() => reopenCutover(branchId, reason), () => setReason('')); }}>
        <label htmlFor="reopen-why" className="text-xs font-medium text-[var(--ejo-text)]">Reopen the checklist (for a file that has to be loaded again)</label>
        <input id="reopen-why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required disabled={pending} placeholder="Why it is reopened" className={input} />
        <button type="submit" disabled={pending} className={`${btn} mt-2`}>Reopen</button>
        {error ? <p role="alert" className="mt-1 text-xs text-[var(--ejo-error)]">{error}</p> : null}
      </form>
    );
  }
  return (
    <div>
      <button type="button" disabled={pending || !ready} onClick={() => run(() => signOffCutover(branchId))}
        className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        Sign off {branchName} as cut over
      </button>
      {!ready ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Every step must be loaded (and confirmed by Finance, where it asks) or marked not needed first.</p> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-[var(--ejo-error)]">{error}</p> : null}
    </div>
  );
}
