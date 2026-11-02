'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, StatusChip } from '@/components/ui';
import { finishStation, passGate, raiseDefect, recordCheck, reworkDefect, startAudit, verifyDefect, type BuildView } from '@/lib/actions/plant-line';
import { DEFECT_STATUS_WORDS, SEVERITY_SHORT, SEVERITY_WORDS, STATION_KIND_WORDS, VISIT_STATUS_WORDS, type Severity } from '@/lib/plant/line';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

type Station = BuildView['stations'][number];
type Res = { ok: boolean; error?: string };
const btn = 'ejo-press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--ejo-radius-md)] border px-3 text-sm font-semibold transition disabled:opacity-50';
const field = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const STATUS_TONE: Record<Station['status'], 'neutral' | 'info' | 'brand' | 'error' | 'success'> = { PENDING: 'neutral', IN_PROGRESS: 'info', DONE: 'brand', FAILED: 'error', PASSED: 'success' };

/**
 * A vehicle's build on a tablet at the station: each check recorded with one
 * tap (or one measurement, judged against its limits at once), the station
 * finished when every check is in; a failed check needs its defect raised;
 * defects are reworked by the line and verified by quality; the final gate
 * is passed by quality, never by whoever recorded its checks.
 */
export function StationWork({ view }: { view: BuildView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(view.vehicle.currentStation);
  const act = (fn: () => Promise<Res>) => start(async () => {
    setError(null);
    const r = await fn().catch(() => ({ ok: false, error: 'That did not work. Try again.' }));
    if (!r.ok) setError(r.error ?? 'That did not work.'); else router.refresh();
  });
  const current = view.stations.find((s) => s.code === view.vehicle.currentStation);
  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/10 px-4 py-2 text-sm text-[var(--ejo-error)]">{error}</p> : null}

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Stations">
        {view.stations.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(open === s.code ? null : s.code)} aria-expanded={open === s.code} className={`flex w-full items-center justify-between gap-2 rounded-[var(--ejo-radius-md)] border px-3 py-2 text-left text-sm ${s.code === current?.code ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`} data-station={s.code}>
              <span className="min-w-0"><span className="font-mono text-xs text-[var(--ejo-text-muted)]">{s.code}</span> <span className="font-medium text-[var(--ejo-text)]">{s.name}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{STATION_KIND_WORDS[s.kind]} · {s.minutes !== null ? `${s.minutes} of ${s.standardMinutes} min` : `${s.standardMinutes} min standard`}{s.defects ? ` · ${s.defects} ${s.defects === 1 ? 'defect' : 'defects'}` : ''}</span></span>
              <StatusChip tone={STATUS_TONE[s.status]}>{VISIT_STATUS_WORDS[s.status]}</StatusChip>
            </button>
          </li>
        ))}
      </ol>

      {view.stations.filter((s) => s.code === open).map((s) => (
        <section key={s.id} aria-labelledby={`st-${s.code}`} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <h2 id={`st-${s.code}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ejo-border)] px-4 py-3 text-sm font-semibold text-[var(--ejo-text)]">
            <span>{s.code} · {s.name}</span>
            <span className="text-xs font-normal text-[var(--ejo-text-muted)]">{s.operator ? `${s.operator} · ` : ''}{s.startedAt ? `started ${formatDateTimeCompact(s.startedAt)}` : 'not started'}{s.passedBy ? ` · passed by ${s.passedBy}` : ''}</span>
          </h2>
          <ul className="divide-y divide-[var(--ejo-border)]">
            {s.checks.map((c) => {
              const r = s.results.find((x) => x.code === c.code);
              const editable = view.may.operate && s.status !== 'PASSED' && s.status !== 'DONE';
              return (
                <li key={c.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm" data-check={c.code}>
                  <span className="min-w-0 flex-1 text-[var(--ejo-text)]">
                    <span className="font-mono text-xs text-[var(--ejo-text-muted)]">{c.code}</span> {c.label}
                    {c.type === 'MEASURE' ? <span className="block text-xs text-[var(--ejo-text-muted)]">Limits {c.min}–{c.max} {c.unit}</span> : null}
                    {r ? <span className={`block text-xs ${r.pass ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{r.pass ? 'Pass' : 'Fail'}{r.value !== null && r.value !== undefined ? ` · ${r.value} ${c.unit ?? ''}` : ''}{r.note ? ` · ${r.note}` : ''}</span> : null}
                  </span>
                  {editable ? (
                    c.type === 'MEASURE' ? (
                      <span className="flex items-center gap-2">
                        <input aria-label={`${c.label} (${c.unit})`} inputMode="decimal" value={values[c.code] ?? (r?.value?.toString() ?? '')} onChange={(e) => setValues((v) => ({ ...v, [c.code]: e.target.value }))} className={`${field} w-28`} />
                        <button type="button" disabled={pending} onClick={() => act(() => recordCheck(view.vehicle.id, s.code, c.code, { value: values[c.code] ?? r?.value ?? '' }))} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>Record</button>
                      </span>
                    ) : (
                      <span role="group" aria-label={c.label} className="flex gap-1.5">
                        <button type="button" aria-pressed={r?.pass === true} disabled={pending} onClick={() => act(() => recordCheck(view.vehicle.id, s.code, c.code, { pass: true }))} className={`${btn} ${r?.pass === true ? 'border-[var(--ejo-success)] bg-[var(--ejo-success)] text-white' : 'border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Pass</button>
                        <button type="button" aria-pressed={r?.pass === false} disabled={pending} onClick={() => act(() => recordCheck(view.vehicle.id, s.code, c.code, { pass: false }))} className={`${btn} ${r?.pass === false ? 'border-[var(--ejo-error)] bg-[var(--ejo-error)] text-white' : 'border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Fail</button>
                      </span>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ejo-border)] px-4 py-3">
            <span className="text-xs text-[var(--ejo-text-muted)]">{s.blockers.length ? s.blockers.join(' ') : s.status === 'FAILED' ? 'Failed: rework the defects, have them verified, re-record the failed checks, then finish.' : s.status === 'DONE' ? 'Recorded. Waiting for quality to pass the gate.' : ''}</span>
            {view.may.operate && ['IN_PROGRESS', 'FAILED'].includes(s.status) ? <button type="button" disabled={pending || s.blockers.length > 0} onClick={() => act(() => finishStation(view.vehicle.id, s.code))} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] px-5 text-white`}><Icon name="check" size={15} />{s.kind === 'GATE' ? 'Finish the gate checks' : 'Finish the station'}</button> : null}
          </div>
          {s.kind === 'GATE' && s.status !== 'PASSED' ? (
            <div className="border-t border-[var(--ejo-primary)]/40 px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--ejo-text)]">The quality gate</h3>
              {view.gate.why.length ? <ul className="mt-1 list-disc pl-5 text-sm text-[var(--ejo-warning-text)]">{view.gate.why.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="mt-1 text-sm text-[var(--ejo-success)]">Every station passed, no open A or B defect, every gate check passed.</p>}
              {view.gate.mayPass ? <button type="button" disabled={pending} onClick={() => act(() => passGate(view.vehicle.id))} className={`${btn} mt-3 border-[var(--ejo-success)] bg-[var(--ejo-success)] px-5 text-white`}><Icon name="check-circle" size={16} />Pass the gate: ready for PDI</button> : view.gate.why_not ? <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{view.gate.why_not}</p> : null}
            </div>
          ) : null}
        </section>
      ))}

      <Defects view={view} act={act} pending={pending} />

      {view.vehicle.gatePassedAt && view.may.audit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-sm">
          <span className="text-[var(--ejo-text)]">Passed the gate {formatDateTimeCompact(view.vehicle.gatePassedAt)}. {view.audits.length ? `${view.audits.length} QA ${view.audits.length === 1 ? 'audit' : 'audits'}.` : 'Not audited.'}</span>
          <button type="button" disabled={pending} onClick={() => start(async () => { const r = await startAudit(view.vehicle.id); if (r.ok) router.push(`/plant/qa/${r.id}`); else setError(r.error); })} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>QA audit this vehicle</button>
        </div>
      ) : null}
    </div>
  );
}

function Defects({ view, act, pending }: { view: BuildView; act: (fn: () => Promise<Res>) => void; pending: boolean }) {
  const [stationCode, setStation] = useState(view.vehicle.currentStation ?? '');
  const [location, setLocation] = useState(view.catalogue.locations[0]!.code);
  const [type, setType] = useState(view.catalogue.types[0]!.code);
  const [cause, setCause] = useState(view.catalogue.causes[0]!.code);
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const open = view.defects.filter((d) => d.status !== 'CLOSED').length;
  return (
    <section aria-labelledby="defects" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <h2 id="defects" className="flex items-center justify-between border-b border-[var(--ejo-border)] px-4 py-3 text-sm font-semibold text-[var(--ejo-text)]">Defects<span className="text-xs font-normal text-[var(--ejo-text-muted)]">{open} open of {view.defects.length}</span></h2>
      {view.defects.length ? (
        <ul className="divide-y divide-[var(--ejo-border)]">
          {view.defects.map((d) => (
            <li key={d.id} className="space-y-2 px-4 py-3 text-sm" data-defect={d.number}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0 text-[var(--ejo-text)]">
                  <span className="font-mono font-medium">{d.number}</span>{d.stationCode ? <> · <span className="font-mono text-xs">{d.stationCode}</span></> : null} · {d.words} · {d.description}
                  <span className="block text-xs text-[var(--ejo-text-muted)]">Raised by {d.raisedBy} {formatDateTimeCompact(d.raisedAt)}{d.reworkNote ? ` · reworked: ${d.reworkNote}${d.reworkedBy ? ` (${d.reworkedBy})` : ''}` : ''}{d.verifiedBy ? ` · verified by ${d.verifiedBy}` : ''}{d.verifyNote && d.status === 'OPEN' ? ` · sent back: ${d.verifyNote}` : ''}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusChip tone={d.severity === 'A' ? 'error' : d.severity === 'B' ? 'warning' : 'neutral'}>{SEVERITY_SHORT[d.severity]}</StatusChip>
                  <StatusChip tone={d.status === 'CLOSED' ? 'success' : d.status === 'REWORKED' ? 'info' : 'warning'}>{DEFECT_STATUS_WORDS[d.status]}</StatusChip>
                </span>
              </div>
              {d.status === 'OPEN' && view.may.operate ? (
                <div className="flex flex-wrap gap-2">
                  <input aria-label={`What was done to put right ${d.number}`} value={notes[d.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="What was done to put it right" className={`${field} max-w-sm flex-1`} />
                  <button type="button" disabled={pending} onClick={() => act(() => reworkDefect(d.id, notes[d.id] ?? ''))} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>Reworked</button>
                </div>
              ) : null}
              {d.status === 'REWORKED' && view.may.gate ? (
                <div className="flex flex-wrap gap-2">
                  <input aria-label={`Verification note for ${d.number}`} value={notes[d.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="Note (needed to send it back)" className={`${field} max-w-sm flex-1`} />
                  <button type="button" disabled={pending} onClick={() => act(() => verifyDefect(d.id, 'close', notes[d.id]))} className={`${btn} border-[var(--ejo-success)] text-[var(--ejo-success)]`}>Verified: close</button>
                  <button type="button" disabled={pending} onClick={() => act(() => verifyDefect(d.id, 'reopen', notes[d.id]))} className={`${btn} border-[var(--ejo-error)] text-[var(--ejo-error)]`}>Still wrong</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-3 text-sm text-[var(--ejo-text-muted)]">None raised.</p>}
      {view.may.operate ? (
        <details className="border-t border-[var(--ejo-border)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-primary)]">Raise a defect</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[var(--ejo-text-muted)]">Station<select value={stationCode} onChange={(e) => setStation(e.target.value)} className={`${field} mt-1 w-full`}><option value="">Not at a station</option>{view.stations.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Where<select value={location} onChange={(e) => setLocation(e.target.value)} className={`${field} mt-1 w-full`}>{view.catalogue.locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">What<select value={type} onChange={(e) => setType(e.target.value)} className={`${field} mt-1 w-full`}>{view.catalogue.types.map((t) => <option key={t.code} value={t.code}>{t.name} (usually {t.defaultSeverity})</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Cause<select value={cause} onChange={(e) => setCause(e.target.value)} className={`${field} mt-1 w-full`}>{view.catalogue.causes.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Severity<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')} className={`${field} mt-1 w-full`}><option value="">As usual for this kind</option>{(['A', 'B', 'C'] as Severity[]).map((x) => <option key={x} value={x}>{SEVERITY_WORDS[x]}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)] lg:col-span-3">Describe it<input value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} mt-1 w-full`} /></label>
            <div><button type="button" disabled={pending} onClick={() => act(async () => { const r = await raiseDefect(view.vehicle.id, { stationCode, location, type, cause, severity: severity || undefined, description }); if (r.ok) setDescription(''); return r; })} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white`}>Raise it</button></div>
          </div>
        </details>
      ) : null}
    </section>
  );
}
