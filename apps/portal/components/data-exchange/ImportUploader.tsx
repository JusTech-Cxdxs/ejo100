'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appendImportRows, createImportJob, finishImportUpload } from '@/lib/actions/data-exchange';
import { fingerprint, readFileRows, sniffKind } from '@/lib/data-exchange/read-file';
import { Icon } from '@/components/ui';
import { BLOCK_BYTES, ROW_BYTES_MAX, rowBytes } from '@/lib/data-exchange/block-size';

type Phase = 'idle' | 'reading' | 'sending' | 'finishing' | 'error';

/** Rows are sent in blocks small enough for one request (at most ~700 KB as sent, and 5,000 rows: lib/data-exchange/block-size.ts). */
const BLOCK_ROWS = 5000;
/** The server keeps at most this many characters of a cell, so longer text is cut here before it is sent. */
const MAX_CELL = 2000;

/**
 * Tries a send again after a dropped connection or a busy server, for about
 * a minute and a quarter in all — longer than the flood limit's one-minute
 * window (middleware.ts), so a burst never ends an upload. Sending a block
 * twice is harmless: rows are kept by their row number.
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 40_000];
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
  }
  throw last;
}

/** At most one block every 0.6 s (100 a minute): inside the limit of 120 submissions a minute per person. */
const MIN_SEND_GAP_MS = 600;

/**
 * Choosing a file: read here, in the browser, and sent in blocks to the
 * staging area. Nothing in the live records changes at this step.
 */
export function ImportUploader({ entity, entityLabel, branches, needsBranch = false, needsDate = false, needsKind = false }: { entity: string; entityLabel: string; branches?: { id: string; name: string }[]; needsBranch?: boolean; needsDate?: boolean; needsKind?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'SAP' | 'LEGACY'>('SAP');
  const [branchId, setBranchId] = useState(branches && branches.length === 1 ? branches[0]!.id : '');
  const [registerKind, setRegisterKind] = useState('');
  const [asOf, setAsOf] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()));
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [read, setRead] = useState(0);
  const [sent, setSent] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const busy = phase === 'reading' || phase === 'sending' || phase === 'finishing';

  async function start(file: File) {
    setError(null); setNote(null); setRead(0); setSent(0); setFileName(file.name);
    try {
      if (needsBranch && !branchId) throw new Error(entity === 'invoices' ? 'Choose the branch whose sales these invoices were first.' : 'Choose the branch whose Store this file belongs to first.');
      if (!/\.(csv|txt|xlsx)$/i.test(file.name)) throw new Error('Choose a CSV file or an Excel workbook (.xlsx). Macro workbooks (.xlsm) and old .xls files are not accepted — save as .xlsx or CSV.');
      const kind = await sniffKind(file);
      if (kind === 'xls') throw new Error('This is an old Excel file (.xls). Open it in Excel and save it as .xlsx or CSV, then choose it again.');
      if (kind === 'unknown') throw new Error('Workbooks with macros are not accepted. Save it as a plain .xlsx or CSV, then choose it again.');
      setPhase('reading');
      const sha = await fingerprint(file);
      let jobId: string | null = null;
      let headers: string[] | null = null;
      let block: { rowNumber: number; cells: string[] }[] = [];
      let bytes = 0;
      let count = 0;
      let lastSend = 0;
      const flush = async () => {
        if (!block.length || !jobId) return;
        const send = block;
        const id = jobId;
        block = []; bytes = 0;
        const gap = MIN_SEND_GAP_MS - (Date.now() - lastSend);
        if (gap > 0) await new Promise((r) => setTimeout(r, gap));
        lastSend = Date.now();
        const res = await withRetry(() => appendImportRows(id, send));
        if (res.stop) throw new Error(res.stop);
        count += send.length;
        setSent(count);
      };
      await readFileRows(file, kind, async (rows) => {
        for (const r of rows) {
          if (!headers) {
            headers = r.cells;
            const job = await createImportJob({ entity, fileName: file.name, fileSha256: sha, headers, fileRows: 0, sourceSystem: source, ...(needsBranch ? { branchId } : {}), ...(needsDate ? { asOf } : {}), ...(needsKind && registerKind ? { defaultKind: registerKind } : {}) });
            jobId = job.id;
            if (job.sameFileBefore) setNote(`The same file was imported before as ${job.sameFileBefore.number}. Records already in the system are recognised and not added twice.`);
            setPhase('sending');
            continue;
          }
          const row = { rowNumber: r.rowNumber, cells: r.cells.map((c) => (c.length > MAX_CELL ? c.slice(0, MAX_CELL) : c)) };
          const size = rowBytes(row);
          if (size > ROW_BYTES_MAX) throw new Error(`Row ${r.rowNumber.toLocaleString('en-NG')} is too large to send (over ${Math.round(ROW_BYTES_MAX / 1000)} KB). Check that the file’s columns are split correctly.`);
          // A row that would take this block past the limit goes in the next one.
          if (block.length && bytes + size > BLOCK_BYTES) await flush();
          block.push(row);
          bytes += size;
          if (bytes >= BLOCK_BYTES || block.length >= BLOCK_ROWS) await flush();
        }
      }, (f) => setRead(f));
      await flush();
      if (!jobId) throw new Error('The file is empty: the first row must hold the column names.');
      if (!count) throw new Error('The file has column names but no rows under them.');
      setPhase('finishing');
      const id: string = jobId;
      await withRetry(() => finishImportUpload(id));
      router.push(`/data-exchange/imports/${id}`);
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'The file could not be read.');
    }
  }


  // A file chosen while the page was still arriving (before it could react) is picked up as soon as it can.
  useEffect(() => {
    const f = input.current?.files?.[0];
    if (f) { void start(f); input.current!.value = ''; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page is ready
  }, []);
  return (
    <div className="space-y-5">
      <fieldset disabled={busy} className="space-y-2">
        <legend className="text-sm font-medium text-[var(--ejo-text)]">Where is the file from?</legend>
        <div className="flex flex-wrap gap-3">
          {([['SAP', 'SAP (an export or extract)'], ['LEGACY', 'An old system or our own spreadsheet']] as const).map(([v, label]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-[var(--ejo-radius-md)] border px-3 py-2 text-sm ${source === v ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/5 text-[var(--ejo-text)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}>
              <input type="radio" name="source" value={v} checked={source === v} onChange={() => setSource(v)} className="accent-[var(--ejo-primary)]" />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs text-[var(--ejo-text-muted)]">The numbers in the file (SAP customer numbers and the like) are kept with each record under this source, so a later file is recognised.</p>
      </fieldset>

      {needsBranch || needsDate || needsKind ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {needsBranch ? (
            <div>
              <label htmlFor="import-branch" className="text-sm font-medium text-[var(--ejo-text)]">{entity === 'invoices' ? 'Branch (whose sales they were)' : 'Branch (its Store)'}</label>
              <select id="import-branch" value={branchId} disabled={busy} onChange={(e) => setBranchId(e.target.value)} className="mt-1 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                <option value="">Choose…</option>
                {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          ) : null}
          {needsDate ? (
            <div>
              <label htmlFor="import-asof" className="text-sm font-medium text-[var(--ejo-text)]">Counted on (the cut-over date)</label>
              <input id="import-asof" type="date" value={asOf} disabled={busy} max={new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())} onChange={(e) => setAsOf(e.target.value)} className="mt-1 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">The opening-balance receipts carry this date, so stock ageing starts from it.</p>
            </div>
          ) : null}
          {needsKind ? (
            <div>
              <label htmlFor="import-kind" className="text-sm font-medium text-[var(--ejo-text)]">Which register is this file?</label>
              <select id="import-kind" value={registerKind} disabled={busy} onChange={(e) => setRegisterKind(e.target.value)} className="mt-1 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                <option value="">It has a column for it</option>
                <option value="PRODUCTION">Production register</option>
                <option value="QC">QC register</option>
                <option value="PDI">PDI register</option>
              </select>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">For a file that is one register only. A “Register” column in the file wins.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !busy) void start(f); }}
        className="rounded-[var(--ejo-radius-lg)] border-2 border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-6 text-center"
      >
        <Icon name="file" size={28} />
        <p className="mt-2 text-sm font-medium text-[var(--ejo-text)]">Drop the {entityLabel.toLowerCase()} file here, or choose it</p>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">CSV or Excel (.xlsx), first sheet, column names in the first row. Up to a million rows. The file is read on this computer and sent in small blocks.</p>
        <input ref={input} type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" id="import-file" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void start(f); e.target.value = ''; }} />
        <label htmlFor="import-file" className={`mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white ${busy ? 'pointer-events-none opacity-60' : 'hover:opacity-90'}`}>
          <Icon name="plus" size={14} /> Choose file
        </label>
      </div>

      {fileName && phase !== 'idle' ? (
        <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4" aria-live="polite">
          <p className="truncate text-sm font-medium text-[var(--ejo-text)]">{fileName}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--ejo-border)]">
            <div className="h-full rounded-full bg-[var(--ejo-primary)] transition-[width] duration-300" style={{ width: `${Math.round(read * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
            {phase === 'reading' ? 'Reading the file…' : phase === 'sending' ? `Sending — ${sent.toLocaleString('en-NG')} rows so far (${Math.round(read * 100)}% of the file read)` : phase === 'finishing' ? `All ${sent.toLocaleString('en-NG')} rows received. Opening the column matching…` : phase === 'error' ? 'Stopped.' : ''}
          </p>
          {note ? <p className="mt-2 text-xs text-[var(--ejo-warning)]">{note}</p> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
    </div>
  );
}
