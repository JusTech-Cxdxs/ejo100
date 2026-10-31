'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { appendImportRows, createImportJob, finishImportUpload } from '@/lib/actions/data-exchange';
import { fingerprint, readFileRows, sniffKind } from '@/lib/data-exchange/read-file';
import { Icon } from '@/components/ui';

type Phase = 'idle' | 'reading' | 'sending' | 'finishing' | 'error';

/** Rows are sent in blocks small enough for one request (~600 KB of text, at most 5,000 rows). */
const BLOCK_CHARS = 600_000;
const BLOCK_ROWS = 5000;

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw last;
}

/**
 * Choosing a file: read here, in the browser, and sent in blocks to the
 * staging area. Nothing in the live records changes at this step.
 */
export function ImportUploader({ entity, entityLabel }: { entity: string; entityLabel: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'SAP' | 'LEGACY'>('SAP');
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
      if (!/\.(csv|txt|xlsx)$/i.test(file.name)) throw new Error('Choose a CSV file or an Excel workbook (.xlsx). Macro workbooks (.xlsm) and old .xls files are not accepted — save as .xlsx or CSV.');
      const kind = await sniffKind(file);
      if (kind === 'xls') throw new Error('This is an old Excel file (.xls). Open it in Excel and save it as .xlsx or CSV, then choose it again.');
      if (kind === 'unknown') throw new Error('Workbooks with macros are not accepted. Save it as a plain .xlsx or CSV, then choose it again.');
      setPhase('reading');
      const sha = await fingerprint(file);
      let jobId: string | null = null;
      let headers: string[] | null = null;
      let block: { rowNumber: number; cells: string[] }[] = [];
      let chars = 0;
      let count = 0;
      const flush = async () => {
        if (!block.length || !jobId) return;
        const send = block;
        const id = jobId;
        block = []; chars = 0;
        await withRetry(() => appendImportRows(id, send));
        count += send.length;
        setSent(count);
      };
      await readFileRows(file, kind, async (rows) => {
        for (const r of rows) {
          if (!headers) {
            headers = r.cells;
            const job = await createImportJob({ entity, fileName: file.name, fileSha256: sha, headers, fileRows: 0, sourceSystem: source });
            jobId = job.id;
            if (job.sameFileBefore) setNote(`The same file was imported before as ${job.sameFileBefore.number}. Records already in the system are recognised and not added twice.`);
            setPhase('sending');
            continue;
          }
          block.push(r);
          chars += r.cells.reduce((n, c) => n + c.length + 3, 8);
          if (chars >= BLOCK_CHARS || block.length >= BLOCK_ROWS) await flush();
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
