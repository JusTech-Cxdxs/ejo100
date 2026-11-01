'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, StatusChip } from '@/components/ui';
import { approvePdi, cancelPdi, rejectPdi, setPdiItem, setPdiReadings, submitPdi, type PdiView } from '@/lib/actions/plant';
import { pdiBlockers, RESULT_WORDS, type PdiResult } from '@/lib/plant/pdi';

type Item = PdiView['items'][number];
const btn = 'ejo-press inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-[var(--ejo-radius-md)] border px-3 text-sm font-semibold transition disabled:opacity-50';
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const TONE: Record<PdiResult, string> = {
  OK: 'border-[var(--ejo-success)] bg-[var(--ejo-success)] text-white',
  NOT_OK: 'border-[var(--ejo-error)] bg-[var(--ejo-error)] text-white',
  NA: 'border-[var(--ejo-text-muted)] bg-[var(--ejo-text-muted)] text-white',
};

/**
 * The PDI on a tablet: every item answered with one tap (saved at once),
 * Not OK with what is wrong; readings, the diagnostic scan and fault codes;
 * then send it on. In rework, each Not OK item is put right and checked
 * again. The approver (never the inspector) accepts or rejects it.
 */
export function PdiChecklist({ view }: { view: PdiView }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(view.items);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [readings, setReadings] = useState({
    odometerKm: view.readings.odometerKm?.toString() ?? '', batteryVolts: view.readings.batteryVolts?.toString() ?? '',
    tyreFrontPsi: view.readings.tyreFrontPsi?.toString() ?? '', tyreRearPsi: view.readings.tyreRearPsi?.toString() ?? '',
    faultScanDone: view.readings.faultScanDone, faultCodes: view.readings.faultCodes.join(', '), faultCodesCleared: view.readings.faultCodesCleared, notes: view.notes ?? '',
  });
  const [readingsSaved, setReadingsSaved] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rejectWhy, setRejectWhy] = useState('');
  const [rejectItems, setRejectItems] = useState<string[]>([]);
  const [cancelWhy, setCancelWhy] = useState('');
  const edit = view.may.edit;
  const rework = view.status === 'REWORK';

  const sections = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) m.set(it.section, [...(m.get(it.section) ?? []), it]);
    return [...m.entries()];
  }, [items]);
  const answered = items.filter((i) => i.result).length;
  const notOk = items.filter((i) => i.result === 'NOT_OK').length;
  const blockers = edit ? pdiBlockers(items, {
    odometerKm: readings.odometerKm === '' ? null : Number(readings.odometerKm), batteryVolts: readings.batteryVolts === '' ? null : Number(readings.batteryVolts),
    tyreFrontPsi: readings.tyreFrontPsi === '' ? null : Number(readings.tyreFrontPsi), tyreRearPsi: readings.tyreRearPsi === '' ? null : Number(readings.tyreRearPsi),
    faultScanDone: readings.faultScanDone, faultCodes: readings.faultCodes.split(/[\s,;]+/).filter(Boolean), faultCodesCleared: readings.faultCodesCleared,
  }) : [];

  const answer = async (it: Item, result: PdiResult) => {
    const note = (drafts[it.code] ?? '').trim();
    if (result === 'NOT_OK' && !note) { setDrafts((d) => ({ ...d, [it.code]: d[it.code] ?? '' })); setError(`Say what is wrong with “${it.label}”, then press Not OK again.`); return; }
    if (rework && it.result === 'NOT_OK' && result === 'OK' && !note) { setError(`Say what was done to put right “${it.label}”, then press Rechecked OK.`); return; }
    setError(null); setSaving(it.code);
    const before = items;
    setItems((all) => all.map((x) => (x.code === it.code ? { ...x, result, defect: result === 'NOT_OK' ? note : x.defect, ...(rework && x.result === 'NOT_OK' && result === 'OK' ? { reworkNote: note, reworkedAt: new Date() } : {}) } : x)));
    try {
      const r = await setPdiItem(view.id, it.code, result, note || undefined);
      if (!r.ok) { setItems(before); setError(r.error); }
      else setDrafts((d) => { const n = { ...d }; delete n[it.code]; return n; });
    } catch { setItems(before); setError('That was not saved. Check the connection and tap again.'); }
    setSaving(null);
  };

  const saveReadings = async () => {
    setError(null);
    const r = await setPdiReadings(view.id, { ...readings }).catch(() => ({ ok: false as const, error: 'The readings were not saved. Try again.' }));
    if (!r.ok) setError(r.error); else setReadingsSaved(true);
    return r.ok;
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: 'That did not work. Try again.' }));
    if (!r.ok) setError(r.error ?? 'That did not work.'); else router.refresh();
  });

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--ejo-radius-lg)] sm:border">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--ejo-text)]">{answered} of {items.length} checked{notOk ? <span className="text-[var(--ejo-error)]"> · {notOk} Not OK</span> : null}</div>
          <div className="mt-1 h-2 w-56 max-w-full overflow-hidden rounded-full bg-[var(--ejo-border)]" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answered} aria-label="Items checked"><div className="h-full bg-[var(--ejo-primary)]" style={{ width: `${(answered / Math.max(1, items.length)) * 100}%` }} /></div>
        </div>
        {edit ? (
          <button type="button" disabled={pending || blockers.length > 0} onClick={() => act(async () => { if (!readingsSaved && !(await saveReadings())) return { ok: false, error: 'Save the readings first.' }; return submitPdi(view.id); })} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] px-5 text-white`}>
            {notOk ? 'Send to rework' : rework ? 'Send for approval again' : 'Send for approval'}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/10 px-4 py-2 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {edit && blockers.length ? (
        <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-3 text-sm" aria-label="Still to do">
          <p className="font-medium text-[var(--ejo-text)]">Still to do before it can be sent on:</p>
          <ul className="mt-1 list-disc pl-5 text-[var(--ejo-text-muted)]">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      ) : null}

      {sections.map(([section, list]) => (
        <section key={section} aria-labelledby={`s-${section}`} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <h2 id={`s-${section}`} className="flex items-center justify-between border-b border-[var(--ejo-border)] px-4 py-3 text-sm font-semibold text-[var(--ejo-text)]">{section}<span className="text-xs font-normal text-[var(--ejo-text-muted)]">{list.filter((i) => i.result).length} / {list.length}</span></h2>
          <ul className="divide-y divide-[var(--ejo-border)]">
            {list.map((it) => {
              const fixing = rework && it.result === 'NOT_OK';
              return (
                <li key={it.code} className="px-4 py-3" data-item={it.code}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 text-sm text-[var(--ejo-text)]">
                      {it.label}
                      {it.result === 'NOT_OK' && it.defect ? <span className="block text-xs text-[var(--ejo-error)]">Not OK: {it.defect}</span> : null}
                      {it.reworkedAt ? <span className="block text-xs text-[var(--ejo-success)]">Put right: {it.reworkNote}</span> : null}
                    </div>
                    {edit ? (
                      fixing ? (
                        <button type="button" disabled={saving === it.code} onClick={() => answer(it, 'OK')} className={`${btn} border-[var(--ejo-success)] text-[var(--ejo-success)]`}>Rechecked OK</button>
                      ) : (
                        <div role="group" aria-label={it.label} className="flex gap-1.5">
                          {(['OK', 'NOT_OK', ...(it.allowNa ? ['NA'] : [])] as PdiResult[]).map((r) => (
                            <button key={r} type="button" aria-pressed={it.result === r} disabled={saving === it.code} onClick={() => answer(it, r)} className={`${btn} ${it.result === r ? TONE[r] : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)]'}`}>{RESULT_WORDS[r]}</button>
                          ))}
                        </div>
                      )
                    ) : it.result ? <StatusChip tone={it.result === 'OK' ? 'success' : it.result === 'NOT_OK' ? 'error' : 'neutral'}>{RESULT_WORDS[it.result]}</StatusChip> : <span className="text-xs text-[var(--ejo-text-muted)]">Not checked</span>}
                  </div>
                  {edit && (fixing || drafts[it.code] !== undefined || it.result === 'NOT_OK') ? (
                    <input aria-label={fixing ? `What was done to put right: ${it.label}` : `What is wrong: ${it.label}`} value={drafts[it.code] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [it.code]: e.target.value }))} placeholder={fixing ? 'What was done to put it right' : 'What is wrong (then press Not OK)'} className={`${field} mt-2`} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section aria-labelledby="readings" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
        <h2 id="readings" className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Readings and diagnostic scan</h2>
        <fieldset disabled={!edit} className="space-y-3" onChange={() => setReadingsSaved(false)}>
          <div className="grid gap-3 sm:grid-cols-4">
            {([['odometerKm', 'Odometer (km)'], ['batteryVolts', 'Battery (V)'], ['tyreFrontPsi', 'Tyres front (psi)'], ['tyreRearPsi', 'Tyres rear (psi)']] as const).map(([k, l]) => (
              <label key={k} className="text-xs text-[var(--ejo-text-muted)]">{l}<input inputMode="decimal" value={readings[k]} onChange={(e) => setReadings((r) => ({ ...r, [k]: e.target.value }))} className={`${field} mt-1`} /></label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" checked={readings.faultScanDone} onChange={(e) => setReadings((r) => ({ ...r, faultScanDone: e.target.checked }))} className="h-5 w-5" />Diagnostic scan done</label>
          {readings.faultScanDone ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--ejo-text-muted)]">Fault codes found (blank if none)<input value={readings.faultCodes} onChange={(e) => setReadings((r) => ({ ...r, faultCodes: e.target.value }))} placeholder="e.g. P0401, U0100" className={`${field} mt-1 font-mono uppercase`} /></label>
              <label className="flex items-center gap-2 self-end text-sm text-[var(--ejo-text)]"><input type="checkbox" checked={readings.faultCodesCleared} onChange={(e) => setReadings((r) => ({ ...r, faultCodesCleared: e.target.checked }))} className="h-5 w-5" />Cause fixed and codes cleared</label>
            </div>
          ) : null}
          <label className="block text-xs text-[var(--ejo-text-muted)]">Notes<textarea value={readings.notes} onChange={(e) => setReadings((r) => ({ ...r, notes: e.target.value }))} rows={2} className={`${field} mt-1`} /></label>
          {edit ? <button type="button" onClick={() => void saveReadings()} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>{readingsSaved ? 'Saved' : 'Save the readings'}</button> : null}
        </fieldset>
      </section>

      {view.status === 'SUBMITTED' ? (
        <section aria-labelledby="decision" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-4">
          <h2 id="decision" className="text-sm font-semibold text-[var(--ejo-text)]">Approval — the SAP usage decision</h2>
          {view.warnings.length ? <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ejo-warning-text)]">{view.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
          {view.may.approve ? (
            <div className="mt-3 space-y-3">
              <button type="button" disabled={pending} onClick={() => act(() => approvePdi(view.id))} className={`${btn} border-[var(--ejo-success)] bg-[var(--ejo-success)] px-5 text-white`}><Icon name="check-circle" size={16} />&nbsp;Accept (A) — PDI passed</button>
              <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">Reject back to rework (R)</summary>
                <label className="mt-2 block text-xs text-[var(--ejo-text-muted)]">What needs putting right<textarea value={rejectWhy} onChange={(e) => setRejectWhy(e.target.value)} rows={2} className={`${field} mt-1`} /></label>
                <fieldset className="mt-2 max-h-64 overflow-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-2">
                  <legend className="px-1 text-xs text-[var(--ejo-text-muted)]">Items to put right</legend>
                  {items.map((it) => (
                    <label key={it.code} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={rejectItems.includes(it.code)} onChange={(e) => setRejectItems((s) => (e.target.checked ? [...s, it.code] : s.filter((c) => c !== it.code)))} />{it.section}: {it.label}</label>
                  ))}
                </fieldset>
                <button type="button" disabled={pending} onClick={() => act(() => rejectPdi(view.id, rejectWhy, rejectItems))} className={`${btn} mt-2 border-[var(--ejo-error)] text-[var(--ejo-error)]`}>Reject (R)</button>
              </details>
            </div>
          ) : <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{view.may.approveWhy}</p>}
        </section>
      ) : null}

      {view.may.cancel ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--ejo-text-muted)]">Started by mistake? Cancel this PDI</summary>
          <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Why it is cancelled" value={cancelWhy} onChange={(e) => setCancelWhy(e.target.value)} placeholder="Why" className={`${field} max-w-md`} /><button type="button" disabled={pending} onClick={() => act(() => cancelPdi(view.id, cancelWhy))} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>Cancel the PDI</button></div>
        </details>
      ) : null}
    </div>
  );
}
