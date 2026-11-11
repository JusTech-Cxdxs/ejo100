'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { answerSapPostings, makeSapPostingFile, sendPostingAgain } from '@/lib/actions/sap-postings';
import { readFileRows, sniffKind } from '@/lib/data-exchange/read-file';

const btn = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] disabled:opacity-50';
const primary = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50';
const field = 'mt-1 block w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** Make the next file of one kind, up to a day (yesterday by default). */
export function MakePostingFile({ scope, kinds, today, yesterday }: { scope: string; kinds: { kind: string; label: string }[]; today: string; yesterday: string }) {
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0]?.kind ?? '');
  const [upTo, setUpTo] = useState(yesterday);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap items-end gap-3" data-testid="make-posting-file" data-scope={scope} onSubmit={(e) => {
      e.preventDefault();
      setNote(null);
      start(async () => {
        try {
          const r = await makeSapPostingFile(scope, kind, upTo);
          if (!r.ok) { setNote({ ok: false, text: r.error }); return; }
          if (r.fileId) { router.push(`/data-exchange/sap/${r.fileId}`); return; }
          setNote({ ok: true, text: r.message });
          router.refresh();
        } catch { setNote({ ok: false, text: 'The file could not be made. Try again.' }); }
      });
    }}>
      <label className="min-w-[10rem] text-xs font-medium text-[var(--ejo-text)]">Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field} disabled={pending} aria-label="Kind of posting">
          {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--ejo-text)]">Up to and including
        <input type="date" value={upTo} max={today} onChange={(e) => setUpTo(e.target.value)} className={field} disabled={pending} required aria-label="Up to and including" />
      </label>
      <button type="submit" disabled={pending || !kind} className={primary}>{pending ? 'Making the file…' : 'Make the file for SAP'}</button>
      {note ? <p role={note.ok ? 'status' : 'alert'} className={`w-full text-xs ${note.ok ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-error)]'}`}>{note.text}</p> : null}
    </form>
  );
}

/** SAP's return file (CSV or Excel): read here, sent 1,000 lines at a time, each line set once. */
export function AnswerUpload({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const read = async (file: File) => {
    setBusy(true); setResult(null); setProgress(0);
    const kind = await sniffKind(file);
    if (kind !== 'csv' && kind !== 'xlsx') { setBusy(false); setResult({ ok: false, lines: ['Choose SAP’s return file as CSV or Excel (.xlsx).'] }); return; }
    let header: string[] | null = null;
    const tot = { posted: 0, rejected: 0, same: 0, notInFile: 0, customersNumbered: 0 };
    const notes: string[] = [];
    let failed: string | null = null;
    let queue: { rowNumber: number; cells: string[] }[] = [];
    const send = async () => {
      if (!queue.length || !header || failed) return;
      const batch = queue; queue = [];
      const r = await answerSapPostings(fileId, header, batch);
      if (!r.ok) { failed = r.error; return; }
      tot.posted += r.posted; tot.rejected += r.rejected; tot.same += r.same; tot.notInFile += r.notInFile; tot.customersNumbered += r.customersNumbered;
      notes.push(...r.conflicts, ...r.problems);
    };
    try {
      await readFileRows(file, kind, async (rows) => {
        for (const r of rows) {
          if (!header) { header = r.cells; continue; }
          queue.push(r);
          if (queue.length >= 1000) await send();
        }
      }, setProgress);
      await send();
    } catch { failed = 'The file could not be read.'; }
    setBusy(false);
    if (failed) { setResult({ ok: false, lines: [failed] }); return; }
    setResult({ ok: true, lines: [
      `${tot.posted.toLocaleString('en-NG')} posted · ${tot.rejected.toLocaleString('en-NG')} rejected${tot.same ? ` · ${tot.same.toLocaleString('en-NG')} already recorded` : ''}${tot.notInFile ? ` · ${tot.notInFile.toLocaleString('en-NG')} not lines of this file (left out)` : ''}${tot.customersNumbered ? ` · ${tot.customersNumbered.toLocaleString('en-NG')} customers given their SAP number` : ''}.`,
      ...notes.slice(0, 50),
    ] });
    router.refresh();
  };
  return (
    <div data-testid="answer-upload">
      <label htmlFor="sap-answers" className="text-xs font-medium text-[var(--ejo-text)]">SAP’s return file (CSV or Excel): ZZ_EJO_LINE, STATUS (S posted, E rejected), the document number (BELNR, MBLNR, VBELN or KUNNR) and MESSAGE</label>
      <input id="sap-answers" type="file" accept=".csv,.txt,.xlsx" disabled={busy} className="mt-1 block w-full text-sm text-[var(--ejo-text)]" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
      {busy ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]" role="status">Reading… {Math.round(progress * 100)}%</p> : null}
      {result ? <ul role={result.ok ? 'status' : 'alert'} className={`mt-2 space-y-0.5 text-xs ${result.ok ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-error)]'}`}>{result.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
    </div>
  );
}

/** A rejected posting, once fixed: into the next file. */
export function SendAgain({ lineId }: { lineId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <button type="button" className={btn} disabled={pending} onClick={() => start(async () => { const r = await sendPostingAgain(lineId).catch(() => ({ ok: false as const, error: 'Try again.' })); if (r.ok) router.refresh(); else setError(r.error); })}>Send again</button>
      {error ? <span role="alert" className="ml-2 text-xs text-[var(--ejo-error)]">{error}</span> : null}
    </span>
  );
}
