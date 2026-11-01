'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, StatusChip } from '@/components/ui';
import { cancelKit, followUpKitIssue, holdKit, raiseKitIssue, rejectKit, releaseKit, setKitCases, setKitCheck, setKitSapNumbers, submitKit, type KitView } from '@/lib/actions/plant-kits';
import { ISSUE_KINDS, ISSUE_KIND_WORDS, ISSUE_STATUS_WORDS, kitBlockers, releaseVerdict, type CheckResult, type IssueKind } from '@/lib/plant/kits';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

type Check = KitView['checks'][number];
const btn = 'ejo-press inline-flex min-h-11 min-w-[4.5rem] items-center justify-center rounded-[var(--ejo-radius-md)] border px-3 text-sm font-semibold transition disabled:opacity-50';
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const WORDS: Record<CheckResult, string> = { OK: 'OK', NOT_OK: 'Not OK', NA: 'N/A' };
const TONE: Record<CheckResult, string> = {
  OK: 'border-[var(--ejo-success)] bg-[var(--ejo-success)] text-white',
  NOT_OK: 'border-[var(--ejo-error)] bg-[var(--ejo-error)] text-white',
  NA: 'border-[var(--ejo-text-muted)] bg-[var(--ejo-text-muted)] text-white',
};
type Res = { ok: boolean; error?: string };

/**
 * A kit on a tablet: every arrival check with one tap (saved at once; Not
 * OK with what is wrong), the cases counted, shortages and damage against
 * part and case numbers, then sent for release. A second person — never one
 * who checked it — releases it to the line, holds it or rejects it.
 */
export function KitInspection({ view }: { view: KitView }) {
  const router = useRouter();
  const [checks, setChecks] = useState<Check[]>(view.checks);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cases, setCases] = useState(view.casesReceived?.toString() ?? '');
  const [notes, setNotes] = useState(view.notes ?? '');
  const [casesSaved, setCasesSaved] = useState(true);
  const [decisionNote, setDecisionNote] = useState('');
  const [cancelWhy, setCancelWhy] = useState('');
  const edit = view.may.edit;

  const sections = useMemo(() => {
    const m = new Map<string, Check[]>();
    for (const c of checks) m.set(c.section, [...(m.get(c.section) ?? []), c]);
    return [...m.entries()];
  }, [checks]);
  const answered = checks.filter((c) => c.result).length;
  const notOk = checks.filter((c) => c.result === 'NOT_OK').length;
  const blockers = edit ? kitBlockers(checks, view.casesExpected, cases === '' ? null : Number(cases)) : [];
  const verdict = releaseVerdict(view.issues, decisionNote);

  const answer = async (c: Check, result: CheckResult) => {
    const note = (drafts[c.code] ?? '').trim();
    if (result === 'NOT_OK' && !note) { setDrafts((d) => ({ ...d, [c.code]: d[c.code] ?? '' })); setError(`Say what is wrong with “${c.label}”, then press Not OK again.`); return; }
    setError(null); setSaving(c.code);
    const before = checks;
    setChecks((all) => all.map((x) => (x.code === c.code ? { ...x, result, note: result === 'NOT_OK' ? note : x.note } : x)));
    try {
      const r = await setKitCheck(view.id, c.code, result, note || undefined);
      if (!r.ok) { setChecks(before); setError(r.error); }
      else setDrafts((d) => { const n = { ...d }; delete n[c.code]; return n; });
    } catch { setChecks(before); setError('That was not saved. Check the connection and tap again.'); }
    setSaving(null);
  };

  const saveCases = async (): Promise<boolean> => {
    setError(null);
    const r = await setKitCases(view.id, { casesReceived: cases, notes }).catch(() => ({ ok: false as const, error: 'The cases were not saved. Try again.' }));
    if (!r.ok) setError(r.error); else setCasesSaved(true);
    return r.ok;
  };

  const act = (fn: () => Promise<Res>) => startTransition(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: 'That did not work. Try again.' }));
    if (!r.ok) setError(r.error ?? 'That did not work.'); else router.refresh();
  });

  return (
    <div className="space-y-6">
      {edit ? (
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--ejo-radius-lg)] sm:border">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--ejo-text)]">{answered} of {checks.length} checked{notOk ? <span className="text-[var(--ejo-error)]"> · {notOk} Not OK</span> : null}</div>
            <div className="mt-1 h-2 w-56 max-w-full overflow-hidden rounded-full bg-[var(--ejo-border)]" role="progressbar" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={answered} aria-label="Checks done"><div className="h-full bg-[var(--ejo-primary)]" style={{ width: `${(answered / Math.max(1, checks.length)) * 100}%` }} /></div>
          </div>
          <button type="button" disabled={pending || blockers.length > 0} onClick={() => act(async () => { if (!casesSaved && !(await saveCases())) return { ok: false, error: 'Save the cases first.' }; return submitKit(view.id); })} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] px-5 text-white`}>
            {view.status === 'ON_HOLD' ? 'Send for release again' : 'Send for release'}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/10 px-4 py-2 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {edit && blockers.length ? (
        <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-3 text-sm" aria-label="Still to do">
          <p className="font-medium text-[var(--ejo-text)]">Still to do before it can be sent for release:</p>
          <ul className="mt-1 list-disc pl-5 text-[var(--ejo-text-muted)]">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      ) : null}

      <section aria-labelledby="cases" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
        <h2 id="cases" className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Cases</h2>
        <fieldset disabled={!edit} className="grid gap-3 sm:grid-cols-3" onChange={() => setCasesSaved(false)}>
          <div className="text-sm"><span className="block text-xs text-[var(--ejo-text-muted)]">On the packing list</span><span className="font-semibold tabular-nums text-[var(--ejo-text)]">{view.casesExpected ?? 'Not given'}</span></div>
          <label className="text-xs text-[var(--ejo-text-muted)]">Cases that arrived<input inputMode="numeric" value={cases} onChange={(e) => setCases(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-xs text-[var(--ejo-text-muted)] sm:col-span-3">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} mt-1`} /></label>
          {edit ? <div><button type="button" onClick={() => void saveCases()} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>{casesSaved ? 'Saved' : 'Save the cases'}</button></div> : null}
        </fieldset>
      </section>

      {sections.map(([section, list]) => (
        <section key={section} aria-labelledby={`s-${section}`} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <h2 id={`s-${section}`} className="flex items-center justify-between border-b border-[var(--ejo-border)] px-4 py-3 text-sm font-semibold text-[var(--ejo-text)]">{section}<span className="text-xs font-normal text-[var(--ejo-text-muted)]">{list.filter((c) => c.result).length} / {list.length}</span></h2>
          <ul className="divide-y divide-[var(--ejo-border)]">
            {list.map((c) => (
              <li key={c.code} className="px-4 py-3" data-check={c.code}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 text-sm text-[var(--ejo-text)]">
                    {c.label}
                    {c.result === 'NOT_OK' && c.note ? <span className="block text-xs text-[var(--ejo-error)]">Not OK: {c.note}</span> : null}
                    {c.checkedBy && !edit ? <span className="block text-xs text-[var(--ejo-text-muted)]">{c.checkedBy}</span> : null}
                  </div>
                  {edit ? (
                    <div role="group" aria-label={c.label} className="flex gap-1.5">
                      {(['OK', 'NOT_OK', ...(c.allowNa ? ['NA'] : [])] as CheckResult[]).map((r) => (
                        <button key={r} type="button" aria-pressed={c.result === r} disabled={saving === c.code} onClick={() => answer(c, r)} className={`${btn} ${c.result === r ? TONE[r] : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)]'}`}>{WORDS[r]}</button>
                      ))}
                    </div>
                  ) : c.result ? <StatusChip tone={c.result === 'OK' ? 'success' : c.result === 'NOT_OK' ? 'error' : 'neutral'}>{WORDS[c.result]}</StatusChip> : <span className="text-xs text-[var(--ejo-text-muted)]">Not checked</span>}
                </div>
                {edit && (drafts[c.code] !== undefined || c.result === 'NOT_OK') ? (
                  <input aria-label={`What is wrong: ${c.label}`} value={drafts[c.code] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.code]: e.target.value }))} placeholder="What is wrong (then press Not OK)" className={`${field} mt-2`} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Issues view={view} act={act} pending={pending} />

      <SapNumbers view={view} act={act} pending={pending} />

      {view.status === 'SUBMITTED' || view.status === 'ON_HOLD' ? (
        <section aria-labelledby="decision" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-4">
          <h2 id="decision" className="text-sm font-semibold text-[var(--ejo-text)]">Release — the SAP usage decision</h2>
          {view.warnings.length ? <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ejo-warning-text)]">{view.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
          {view.may.decide || view.may.reject ? (
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-[var(--ejo-text-muted)]">Note (needed to release with open shortages, to hold, or to reject)<textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} className={`${field} mt-1`} /></label>
              {view.may.decide && !verdict.ok ? <p className="text-sm text-[var(--ejo-warning-text)]">{verdict.why}</p> : null}
              <div className="flex flex-wrap gap-2">
                {view.may.decide ? <button type="button" disabled={pending || !verdict.ok} onClick={() => act(() => releaseKit(view.id, decisionNote))} className={`${btn} border-[var(--ejo-success)] bg-[var(--ejo-success)] px-5 text-white`}><Icon name="check-circle" size={16} />&nbsp;{verdict.ok && verdict.withShortages ? 'Release with shortages (A)' : 'Release to the line (A)'}</button> : null}
                {view.may.decide ? <button type="button" disabled={pending} onClick={() => act(() => holdKit(view.id, decisionNote))} className={`${btn} border-[var(--ejo-warning)] text-[var(--ejo-warning-text)]`}>Hold</button> : null}
                {view.may.reject ? <button type="button" disabled={pending} onClick={() => act(() => rejectKit(view.id, decisionNote))} className={`${btn} border-[var(--ejo-error)] text-[var(--ejo-error)]`}>Reject (R)</button> : null}
              </div>
            </div>
          ) : <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{view.may.decideWhy ?? 'The quality supervisor or plant manager decides.'}</p>}
        </section>
      ) : null}

      {view.may.cancel ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--ejo-text-muted)]">Recorded by mistake? Cancel this kit</summary>
          <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Why it is cancelled" value={cancelWhy} onChange={(e) => setCancelWhy(e.target.value)} placeholder="Why" className={`${field} max-w-md`} /><button type="button" disabled={pending} onClick={() => act(() => cancelKit(view.id, cancelWhy))} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>Cancel the kit</button></div>
        </details>
      ) : null}
    </div>
  );
}

/** Shortages, damage, wrong parts and excess: raised against part and case, followed to the supplier claim and resolution. */
function Issues({ view, act, pending }: { view: KitView; act: (fn: () => Promise<Res>) => void; pending: boolean }) {
  const [kind, setKind] = useState<IssueKind>('SHORTAGE');
  const [partNumber, setPart] = useState('');
  const [description, setDescription] = useState('');
  const [caseNumber, setCase] = useState('');
  const [quantity, setQty] = useState('1');
  const [stopsLine, setStops] = useState(false);
  const [follow, setFollow] = useState<Record<string, string>>({});
  const open = view.issues.filter((i) => i.status !== 'RESOLVED').length;
  return (
    <section aria-labelledby="issues" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <h2 id="issues" className="flex items-center justify-between border-b border-[var(--ejo-border)] px-4 py-3 text-sm font-semibold text-[var(--ejo-text)]">Shortages and damage<span className="text-xs font-normal text-[var(--ejo-text-muted)]">{open} open of {view.issues.length}</span></h2>
      {view.issues.length ? (
        <ul className="divide-y divide-[var(--ejo-border)]">
          {view.issues.map((i) => (
            <li key={i.id} className="space-y-2 px-4 py-3 text-sm" data-issue={i.partNumber ?? i.description}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 text-[var(--ejo-text)]">
                  <b>{ISSUE_KIND_WORDS[i.kind]}</b>{i.partNumber ? <> · <span className="font-mono">{i.partNumber}</span></> : null} · {i.description} · ×{i.quantity}{i.caseNumber ? <> · case <span className="font-mono">{i.caseNumber}</span></> : null}
                  <span className="block text-xs text-[var(--ejo-text-muted)]">Raised by {i.raisedBy} {formatDateTimeCompact(i.raisedAt)}{i.claimReference ? ` · claim ${i.claimReference}` : ''}{i.resolution ? ` · ${i.resolution}${i.resolvedBy ? ` (${i.resolvedBy})` : ''}` : ''}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {i.stopsLine && i.status !== 'RESOLVED' ? <StatusChip tone="error">Stops the line</StatusChip> : null}
                  <StatusChip tone={i.status === 'RESOLVED' ? 'success' : i.status === 'CLAIMED' ? 'info' : 'warning'}>{ISSUE_STATUS_WORDS[i.status]}</StatusChip>
                </span>
              </div>
              {view.may.followUp && i.status !== 'RESOLVED' ? (
                <div className="flex flex-wrap gap-2">
                  <input aria-label={`Claim reference or how it was put right: ${i.partNumber ?? i.description}`} value={follow[i.id] ?? ''} onChange={(e) => setFollow((f) => ({ ...f, [i.id]: e.target.value }))} placeholder={i.status === 'OPEN' ? 'Claim reference, or how it was put right' : 'How it was put right'} className={`${field} max-w-sm`} />
                  {i.status === 'OPEN' ? <button type="button" disabled={pending} onClick={() => act(() => followUpKitIssue(i.id, { action: 'claim', claimReference: follow[i.id] }))} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>Claimed</button> : null}
                  <button type="button" disabled={pending} onClick={() => act(() => followUpKitIssue(i.id, { action: 'resolve', resolution: follow[i.id] }))} className={`${btn} border-[var(--ejo-success)] text-[var(--ejo-success)]`}>Resolved</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-3 text-sm text-[var(--ejo-text-muted)]">None raised.</p>}
      {view.may.raise ? (
        <details className="border-t border-[var(--ejo-border)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-primary)]">Raise a shortage or damage</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[var(--ejo-text-muted)]">Kind<select value={kind} onChange={(e) => setKind(e.target.value as IssueKind)} className={`${field} mt-1`}>{ISSUE_KINDS.map((k) => <option key={k} value={k}>{ISSUE_KIND_WORDS[k]}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Part number<input value={partNumber} onChange={(e) => setPart(e.target.value)} className={`${field} mt-1 font-mono uppercase`} /></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Case<input value={caseNumber} onChange={(e) => setCase(e.target.value)} className={`${field} mt-1 font-mono uppercase`} /></label>
            <label className="text-xs text-[var(--ejo-text-muted)] sm:col-span-2">What the part is, or what is wrong<input value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Quantity<input inputMode="numeric" value={quantity} onChange={(e) => setQty(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)] sm:col-span-2"><input type="checkbox" checked={stopsLine} onChange={(e) => setStops(e.target.checked)} className="h-5 w-5" />It stops the line (the vehicle cannot be built without it)</label>
            <div><button type="button" disabled={pending} onClick={() => act(async () => { const r = await raiseKitIssue(view.id, { kind, partNumber, description, caseNumber, quantity, stopsLine }); if (r.ok) { setPart(''); setDescription(''); setCase(''); setQty('1'); setStops(false); } return r; })} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white`}>Raise it</button></div>
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** The numbers SAP gives the kit's receipt: the inspection lot and the goods receipt's material document. */
function SapNumbers({ view, act, pending }: { view: KitView; act: (fn: () => Promise<Res>) => void; pending: boolean }) {
  const [lot, setLot] = useState(view.sapInspectionLot ?? '');
  const [doc, setDoc] = useState(view.sapMaterialDocument ?? '');
  const rows = [['Purchase order (EBELN)', view.shipment.sapPurchaseOrder], ['Inbound delivery (VBELN)', view.shipment.sapInboundDelivery], ['Plant (WERKS)', view.sapPlant], ['Usage decision', view.sapUsageDecision]] as const;
  return (
    <section aria-labelledby="sap" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
      <h2 id="sap" className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">SAP</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        {rows.map(([l, v]) => <div key={l}><dt className="text-xs text-[var(--ejo-text-muted)]">{l}</dt><dd className="font-mono font-medium text-[var(--ejo-text)]">{v ?? '—'}</dd></div>)}
      </dl>
      {view.may.sap ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-[var(--ejo-text-muted)]">Inspection lot (PRUEFLOS)<input value={lot} onChange={(e) => setLot(e.target.value)} className={`${field} mt-1 font-mono`} /></label>
          <label className="text-xs text-[var(--ejo-text-muted)]">Goods receipt material document (MBLNR)<input value={doc} onChange={(e) => setDoc(e.target.value)} className={`${field} mt-1 font-mono`} /></label>
          <div className="self-end"><button type="button" disabled={pending} onClick={() => act(() => setKitSapNumbers(view.id, { sapInspectionLot: lot, sapMaterialDocument: doc }))} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>Save the SAP numbers</button></div>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-4"><div><dt className="text-xs text-[var(--ejo-text-muted)]">Inspection lot</dt><dd className="font-mono">{view.sapInspectionLot ?? '—'}</dd></div><div><dt className="text-xs text-[var(--ejo-text-muted)]">Material document</dt><dd className="font-mono">{view.sapMaterialDocument ?? '—'}</dd></div></dl>
      )}
    </section>
  );
}
