'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveImport, cancelImport, checkImportBatch, loadImportBatch, pauseImport, resumeImport, saveImportMapping, sendImportBack, submitImportForApproval, undoImportBatch,
  type ImportJobDetail,
} from '@/lib/actions/data-exchange';
import { ENTITIES, mappingFromProfile, type Mapping } from '@/lib/data-exchange/fields';
import { IMPORT_STEPS, importStatus } from '@/lib/data-exchange/status';
import { Icon, SectionCard, StatusChip } from '@/components/ui';

const nf = (n: number) => n.toLocaleString('en-NG');
const btn = 'inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] px-4 py-2 text-sm font-medium disabled:opacity-50';
const primary = `${btn} bg-[var(--ejo-primary)] text-white hover:opacity-90`;
const secondary = `${btn} border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]`;
const danger = `${btn} border border-[var(--ejo-error)]/40 text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5`;

function Steps({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Import steps">
      {IMPORT_STEPS.map((s, i) => {
        const n = i + 1;
        const state = step > n ? 'done' : step === n ? 'now' : 'later';
        return (
          <li key={s} className={`flex items-center gap-2 rounded-[var(--ejo-radius-md)] border px-2 py-1.5 text-xs ${state === 'now' ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/5 font-medium text-[var(--ejo-text)]' : state === 'done' ? 'border-[var(--ejo-border)] text-[var(--ejo-success)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${state === 'done' ? 'bg-[var(--ejo-success)] text-white' : state === 'now' ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-border)] text-[var(--ejo-text-muted)]'}`}>{state === 'done' ? <Icon name="check" size={11} /> : n}</span>
            <span className="truncate">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Tile({ label, value, tone = 'text-[var(--ejo-text)]', hint }: { label: string; value: number; tone?: string; hint?: string }) {
  return (
    <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
      <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{nf(value)}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[var(--ejo-text-muted)]">{hint}</p> : null}
    </div>
  );
}

function Bar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div aria-live="polite">
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--ejo-border)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--ejo-primary)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{label}</p>
    </div>
  );
}

/** Runs a batch step again and again while the page is open (stops on done, error, pause or leaving). */
function useLoop() {
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  return useCallback(async <T,>(step: () => Promise<T>, done: (r: T) => boolean, onEach: (r: T) => void) => {
    for (;;) {
      if (!alive.current) return null;
      const r = await step();
      onEach(r);
      if (done(r)) return r;
    }
  }, []);
}

export function ImportJobView({ job }: { job: ImportJobDetail }) {
  const router = useRouter();
  const loop = useLoop();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [showMapping, setShowMapping] = useState(job.status === 'UPLOADED');
  const [blockers, setBlockers] = useState<{ label: string; href: string; why: string }[]>([]);
  const def = ENTITIES[job.entity];
  const st = importStatus(job.status);
  const isCreator = job.me.id === job.createdById;
  const mayApprove = job.me.canApprove && (!isCreator || job.me.isMaster);
  const mayLoad = isCreator ? job.me.canRun : job.me.canApprove;
  const startedAt = useRef<number>(Date.now());

  const act = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try { await fn(); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.'); }
    });
  };

  const runCheck = useCallback(async () => {
    setError(null);
    try {
      await loop(() => checkImportBatch(job.id), (r) => r.done, (r) => setProgress({ done: r.checked, total: r.total, label: `Checked ${nf(r.checked)} of ${nf(r.total)} rows…` }));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Checking stopped. Try again.'); }
  }, [job.id, loop, router]);

  const runLoad = useCallback(async () => {
    setError(null);
    startedAt.current = Date.now();
    let first: number | null = null;
    try {
      await loop(() => loadImportBatch(job.id), (r) => r.done || r.status === 'PAUSED', (r) => {
        if (first === null) first = r.loaded;
        const secs = (Date.now() - startedAt.current) / 1000;
        const rate = secs > 1 ? (r.loaded - first) / secs : 0;
        const eta = rate > 0 ? Math.max(0, Math.round((r.total - r.loaded) / rate)) : null;
        setProgress({ done: r.loaded, total: r.total, label: `Loaded ${nf(r.loaded)} of ${nf(r.total)} rows${rate > 0 ? ` · ${nf(Math.round(rate))} rows a second` : ''}${eta !== null && eta > 0 ? ` · about ${eta > 90 ? `${Math.round(eta / 60)} minutes` : `${eta} seconds`} left` : ''}` });
      });
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Loading stopped. Press Resume.'); router.refresh(); }
  }, [job.id, loop, router]);

  const runUndo = useCallback(async () => {
    setError(null);
    try {
      const total = job.createdRows + job.updatedRows;
      const r = await loop(() => undoImportBatch(job.id), (x) => x.done || x.blockers.length > 0, (x) => { if (x.left >= 0) setProgress({ done: total - x.left, total, label: `Undoing — ${nf(Math.max(0, total - x.left))} of ${nf(total)} rows…` }); });
      if (r && r.blockers.length) { setBlockers(r.blockers); setProgress(null); return; }
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Undo stopped. Try again.'); }
  }, [job.createdRows, job.updatedRows, job.id, loop, router]);

  // A step that was running when the page was left carries on when it is opened again.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (job.status === 'VALIDATING') void runCheck();
    if (job.status === 'LOADING' && mayLoad) void runLoad();
    if (job.status === 'UNDOING' && job.me.canApprove) void runUndo();
  }, [job.status, mayLoad, job.me.canApprove, runCheck, runLoad, runUndo]);

  return (
    <div className="space-y-6">
      <Steps step={st.step} />
      {job.error ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 p-3 text-sm text-[var(--ejo-text)]">{job.error}</p> : null}
      {job.sameFileBefore ? <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-3 text-sm text-[var(--ejo-text)]">The same file was imported before as <a className="font-medium text-[var(--ejo-primary)] hover:underline" href={`/data-exchange/imports/${job.sameFileBefore.id}`}>{job.sameFileBefore.number}</a>. Records already in the system are recognised and are not added twice.</p> : null}
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {progress ? <SectionCard icon="activity" title="In progress" description="You can leave this page: the step carries on when you open it again."><Bar {...progress} /></SectionCard> : null}

      {job.status === 'UPLOADING' ? (
        <SectionCard icon="alert" tone="warning" title="The upload did not finish" description="The browser was closed or the connection dropped while the file was being sent.">
          <p className="text-sm text-[var(--ejo-text-muted)]">Start a new import with the same file. Rows that already arrived are not counted twice.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/data-exchange/new?entity=${job.entity}`} className={primary}><Icon name="plus" size={14} /> Choose the file again</a>
            <button type="button" className={danger} disabled={pending} onClick={() => act(() => cancelImport(job.id))}>Cancel this import</button>
          </div>
        </SectionCard>
      ) : null}

      {(['UPLOADED', 'VALIDATED'].includes(job.status) && job.me.canRun && (showMapping || job.status === 'UPLOADED')) ? (
        <MappingEditor job={job} onSaved={() => { setShowMapping(false); void runCheck(); }} />
      ) : null}

      {['VALIDATED', 'AWAITING_APPROVAL', 'APPROVED', 'LOADING', 'PAUSED', 'COMPLETED', 'UNDOING', 'UNDONE'].includes(job.status) ? (
        <SectionCard icon="check" title="What the check found" description={`${nf(job.fileRows)} rows in the file · ${job.matchMode === 'FILL_BLANKS' ? 'existing records get only their empty fields filled' : 'existing records are left as they are'} · nothing is ever overwritten`}
          actions={<>
            {job.rejectedRows + job.duplicateRows > 0 ? <a className={secondary} href={`/data-exchange/imports/${job.id}/rows?kind=rejects`}><Icon name="download" size={14} /> Rejected rows (to fix in Excel)</a> : null}
            {job.possible.length ? <a className={secondary} href={`/data-exchange/imports/${job.id}/rows?kind=possible`}><Icon name="download" size={14} /> Possible duplicates</a> : null}
          </>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile label="Ready to load" value={job.goodRows} tone="text-[var(--ejo-success)]" />
            <Tile label="Ready, with a note" value={job.warningRows} tone="text-[var(--ejo-warning)]" hint="Load without the value noted" />
            <Tile label="Rejected" value={job.rejectedRows} tone="text-[var(--ejo-error)]" />
            <Tile label="Duplicates in the file" value={job.duplicateRows} hint="Only the first copy loads" />
            <Tile label={`Already a ${def.noun}`} value={job.matchedRows} hint="Recognised, not duplicated" />
          </div>
          {job.problems.length ? (
            <details className="mt-4" open={job.status === 'VALIDATED'}>
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">Rows with a problem or a note (first {job.problems.length})</summary>
              <ul className="mt-2 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                {job.problems.map((p) => (
                  <li key={p.rowNumber} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:gap-4">
                    <span className="shrink-0 font-medium tabular-nums text-[var(--ejo-text)]">Row {nf(p.rowNumber)}</span>
                    <span className="min-w-0 space-y-0.5">{p.issues.map((i, k) => <span key={k} className={`block ${i.level === 'error' ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>{i.message}</span>)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {job.possible.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">Possible duplicates — same phone as an existing {def.noun} ({job.possibleDuplicates === 'ADD' ? 'they will be added as new' : 'they are not added; follow them up'})</summary>
              <ul className="mt-2 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                {job.possible.map((p) => (
                  <li key={p.rowNumber} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span className="min-w-0 truncate text-[var(--ejo-text)]">Row {nf(p.rowNumber)}: {p.cells.filter(Boolean).slice(0, 4).join(' · ')}</span>
                    {p.matchedId ? <a href={`/crm/customers/${p.matchedId}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Open the existing {def.noun}</a> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {job.status === 'VALIDATED' && job.me.canRun ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={pending || job.goodRows + job.warningRows === 0} onClick={() => act(() => submitImportForApproval(job.id))}><Icon name="check" size={14} /> Send for approval ({nf(job.goodRows + job.warningRows)} to load)</button>
              <button type="button" className={secondary} disabled={pending} onClick={() => setShowMapping(true)}>Change the columns</button>
              <button type="button" className={danger} disabled={pending} onClick={() => act(() => cancelImport(job.id))}>Cancel this import</button>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {job.status === 'AWAITING_APPROVAL' ? (
        <SectionCard icon="badge" tone="warning" title="Approval" description={`Sent by ${job.createdBy}. Nothing has been loaded yet.`}>
          {mayApprove ? <ApprovePanel job={job} pending={pending} act={act} /> : (
            <p className="text-sm text-[var(--ejo-text-muted)]">{isCreator ? 'Another manager or administrator must approve it: the person who prepared an import cannot approve it.' : 'Waiting for a manager or administrator to approve it.'}</p>
          )}
          {isCreator && job.me.canRun ? <button type="button" className={`${danger} mt-3`} disabled={pending} onClick={() => act(() => cancelImport(job.id))}>Cancel this import</button> : null}
        </SectionCard>
      ) : null}

      {['APPROVED', 'LOADING', 'PAUSED'].includes(job.status) ? (
        <SectionCard icon="rocket" title="Load" description={`Approved by ${job.approvedBy ?? 'a manager'}. Rows load in batches; each batch is all or nothing, and a row is never loaded twice.`}>
          {!progress ? <Bar done={job.createdRows + job.updatedRows + job.skippedRows} total={job.goodRows + job.warningRows} label={`${nf(job.createdRows + job.updatedRows + job.skippedRows)} of ${nf(job.goodRows + job.warningRows)} rows loaded`} /> : null}
          {mayLoad ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {job.status === 'APPROVED' ? <button type="button" className={primary} disabled={pending} onClick={() => void runLoad()}><Icon name="rocket" size={14} /> Start loading</button> : null}
              {job.status === 'LOADING' ? <button type="button" className={secondary} disabled={pending} onClick={() => act(() => pauseImport(job.id))}>Pause</button> : null}
              {job.status === 'PAUSED' ? <button type="button" className={primary} disabled={pending} onClick={() => act(async () => { await resumeImport(job.id); })}>Resume</button> : null}
              {job.status === 'APPROVED' && mayApprove ? <SendBack job={job} pending={pending} act={act} /> : null}
            </div>
          ) : <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">The person who prepared it, or an approver, loads it.</p>}
        </SectionCard>
      ) : null}

      {['COMPLETED', 'UNDOING', 'UNDONE'].includes(job.status) ? (
        <SectionCard icon="receipt" tone={job.status === 'UNDONE' ? 'neutral' : 'success'} title={job.status === 'UNDONE' ? 'Undone' : 'Report'} description={job.completedAt ? `Loaded ${new Date(job.completedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })}${job.approvedBy ? ` · approved by ${job.approvedBy}` : ''}` : undefined}
          actions={<>
            <a className={secondary} href={`/data-exchange/imports/${job.id}/rows?kind=all`}><Icon name="download" size={14} /> Every row and its outcome</a>
            <button type="button" className={secondary} onClick={() => window.print()}><Icon name="printer" size={14} /> Print</button>
          </>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={`${def.label} added`} value={job.createdRows} tone="text-[var(--ejo-success)]" />
            <Tile label="Existing ones filled in" value={job.updatedRows} />
            <Tile label="Not added" value={job.skippedRows} hint="Already there, or a possible duplicate" />
            <Tile label="Rejected in the check" value={job.rejectedRows + job.duplicateRows} tone="text-[var(--ejo-error)]" />
          </div>
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{nf(job.fileRows)} rows in the file = {nf(job.createdRows)} added + {nf(job.updatedRows)} filled in + {nf(job.skippedRows)} not added + {nf(job.rejectedRows + job.duplicateRows)} rejected{job.fileRows - (job.createdRows + job.updatedRows + job.skippedRows + job.rejectedRows + job.duplicateRows) !== 0 && job.status === 'COMPLETED' ? ' (check the totals)' : '.'}</p>
          {job.status === 'COMPLETED' && job.me.canApprove ? (
            <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
              <p className="text-sm text-[var(--ejo-text-muted)]">Undo removes the {def.plural} this import added and empties only the fields it filled in. It is refused while any work has been recorded on them since.</p>
              <button type="button" className={`${danger} mt-3`} disabled={pending} onClick={() => { if (window.confirm(`Undo ${job.number}? This removes the ${nf(job.createdRows)} ${def.plural} it added.`)) void runUndo(); }}><Icon name="restore" size={14} /> Undo this import</button>
              {blockers.length ? (
                <div className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 p-3 text-sm">
                  <p className="font-medium text-[var(--ejo-text)]">It cannot be undone: work has been recorded on these since.</p>
                  <ul className="mt-2 space-y-1">{blockers.map((b) => <li key={b.href + b.label}><a href={b.href} className="text-[var(--ejo-primary)] hover:underline">{b.label}</a> <span className="text-[var(--ejo-text-muted)]">— {b.why}</span></li>)}</ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {job.status === 'CANCELLED' ? <p className="text-sm text-[var(--ejo-text-muted)]">This import was cancelled. Nothing from it was loaded.</p> : null}
      <p className="sr-only"><StatusChip label={st.label} tone={st.tone} /></p>
    </div>
  );
}

function ApprovePanel({ job, pending, act }: { job: ImportJobDetail; pending: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const def = ENTITIES[job.entity];
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--ejo-text)]">
        Approving loads <strong>{nf(job.goodRows + job.warningRows)}</strong> rows into {def.plural}: new ones are added{job.matchMode === 'FILL_BLANKS' ? ', and existing ones get only their empty fields filled' : ', existing ones are left as they are'}. Rejected and duplicate rows ({nf(job.rejectedRows + job.duplicateRows)}) are not loaded. It can be undone afterwards while no work has been recorded on what it added.
      </p>
      {job.me.id === job.createdById ? <p className="text-xs text-[var(--ejo-warning)]">You prepared this import. As the platform administrator you may approve it while nobody else holds the role; this is recorded.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={pending} onClick={() => act(() => approveImport(job.id))}><Icon name="check" size={14} /> Approve</button>
        <SendBack job={job} pending={pending} act={act} />
      </div>
    </div>
  );
}

function SendBack({ job, pending, act }: { job: ImportJobDetail; pending: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  if (!open) return <button type="button" className={secondary} disabled={pending} onClick={() => setOpen(true)}>Send back</button>;
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="send-back">What needs changing</label>
      <input id="send-back" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} placeholder="What needs changing (the person who prepared it sees this)" className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      <button type="button" className={secondary} disabled={pending || why.trim().length < 5} onClick={() => act(() => sendImportBack(job.id, why))}>Send back</button>
    </div>
  );
}

function MappingEditor({ job, onSaved }: { job: ImportJobDetail; onSaved: () => void }) {
  const def = ENTITIES[job.entity];
  const [mapping, setMapping] = useState<Mapping>(() => job.mapping ?? {});
  const [matchMode, setMatchMode] = useState(job.matchMode);
  const [possible, setPossible] = useState(job.possibleDuplicates);
  const [profileName, setProfileName] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sample = job.preview[0]?.cells ?? [];
  const used = useMemo(() => new Map(Object.entries(mapping).filter(([, v]) => v !== null).map(([k, v]) => [v as number, k])), [mapping]);
  const unmatched = job.headers.filter((_, i) => !used.has(i));

  const save = () => {
    setError(null); setProblems([]);
    startTransition(async () => {
      try {
        const r = await saveImportMapping(job.id, { mapping, matchMode, sourceSystem: job.sourceSystem, possibleDuplicates: possible, saveAsProfile: profileName });
        if (r.problems.length) { setProblems(r.problems); return; }
        onSaved();
      } catch (err) { setError(err instanceof Error ? err.message : 'The columns could not be saved.'); }
    });
  };

  return (
    <SectionCard icon="match" title="Match the columns" description={`Which column of ${job.fileName} feeds each field. Columns were matched by their names (SAP field names included); check them, then check the file.`}
      actions={job.profiles.length ? (
        <label className="flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]">Use a saved matching
          <select className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" defaultValue="" onChange={(e) => { const p = job.profiles.find((x) => x.id === e.target.value); if (p) setMapping(mappingFromProfile(job.entity, p.mapping, job.headers)); }}>
            <option value="">Choose…</option>
            {job.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : null}>
      <div className="divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
        {def.fields.map((f) => {
          const idx = mapping[f.key];
          const example = typeof idx === 'number' ? sample[idx] : '';
          return (
            <div key={f.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
              <div className="min-w-0">
                <label htmlFor={`map-${f.key}`} className="text-sm font-medium text-[var(--ejo-text)]">{f.label}{f.required ? <span className="text-[var(--ejo-error)]"> *</span> : null}</label>
                <p className="text-xs text-[var(--ejo-text-muted)]">{f.help}</p>
              </div>
              <div className="min-w-0">
                <select id={`map-${f.key}`} value={typeof idx === 'number' ? String(idx) : ''} onChange={(e) => setMapping((m) => {
                  const next = { ...m };
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  // A column feeds one field: taking it here frees it elsewhere.
                  if (v !== null) for (const k of Object.keys(next)) if (next[k] === v) next[k] = null;
                  next[f.key] = v;
                  return next;
                })} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                  <option value="">Not in this file</option>
                  {job.headers.map((h, i) => <option key={i} value={i}>{h}{used.has(i) && used.get(i) !== f.key ? ' (used for another field)' : ''}</option>)}
                </select>
                {example ? <p className="mt-1 truncate text-xs text-[var(--ejo-text-muted)]">First row: <span className="text-[var(--ejo-text)]">{example}</span></p> : null}
              </div>
            </div>
          );
        })}
      </div>
      {unmatched.length ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Columns not used (kept in the rejects file, not loaded): {unmatched.slice(0, 20).join(', ')}{unmatched.length > 20 ? ` and ${unmatched.length - 20} more` : ''}.</p> : null}

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium text-[var(--ejo-text)]">When a {def.noun} is already in the system</legend>
        {([['ADD_ONLY', `Leave it as it is (add only new ${def.plural})`], ['FILL_BLANKS', 'Fill in only its empty fields (nothing is overwritten)']] as const).map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="radio" name="matchMode" checked={matchMode === v} onChange={() => setMatchMode(v)} className="accent-[var(--ejo-primary)]" />{label}</label>
        ))}
      </fieldset>
      {job.entity === 'customers' ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium text-[var(--ejo-text)]">A row that may be an existing customer (same phone, no matching number or email)</legend>
          {([['SKIP', 'Do not add it; list it for follow-up (recommended)'], ['ADD', 'Add it as a new customer']] as const).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="radio" name="possible" checked={possible === v} onChange={() => setPossible(v)} className="accent-[var(--ejo-primary)]" />{label}</label>
          ))}
        </fieldset>
      ) : null}
      <div className="mt-4">
        <label htmlFor="profile-name" className="text-sm font-medium text-[var(--ejo-text)]">Save this matching for next time <span className="font-normal text-[var(--ejo-text-muted)]">(optional)</span></label>
        <input id="profile-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} maxLength={80} placeholder="e.g. SAP customer master" className="mt-1 w-full max-w-sm rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </div>
      {problems.length ? <ul role="alert" className="mt-3 list-disc pl-5 text-sm text-[var(--ejo-error)]">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      <button type="button" className={`${primary} mt-4`} disabled={pending} onClick={save}><Icon name="check" size={14} /> Save and check the file</button>
      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Checking changes nothing in the system: it reads every row and reports what would happen.</p>
    </SectionCard>
  );
}
