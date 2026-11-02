'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAudit, type AuditView } from '@/lib/actions/plant-line';
import { SEVERITY_WORDS, auditScore, type AuditFinding, type Severity } from '@/lib/plant/line';
import { StatusChip } from '@/components/ui';

const field = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const btn = 'ejo-press inline-flex min-h-11 items-center justify-center rounded-[var(--ejo-radius-md)] border px-4 text-sm font-semibold disabled:opacity-50';

export function AuditSheet({ audit }: { audit: AuditView }) {
  const router = useRouter();
  const [findings, setFindings] = useState<AuditFinding[]>(audit.findings);
  const [section, setSection] = useState(audit.sections[0]!.code);
  const [severity, setSeverity] = useState<Severity>('C');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState(audit.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const score = useMemo(() => auditScore(findings), [findings]);
  const save = (finish: boolean) => start(async () => {
    setError(null);
    const r = await saveAudit(audit.id, findings, finish, notes).catch(() => ({ ok: false as const, error: 'That did not work. Try again.' }));
    if (!r.ok) setError(r.error); else router.refresh();
  });
  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/10 px-4 py-2 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--ejo-text)]">
        <span><b>{score.demerits}</b> demerits · {score.a} A · {score.b} B · {score.c} C</span>
        <StatusChip tone={score.result === 'PASS' ? 'success' : 'error'}>{score.result === 'PASS' ? 'Would pass' : 'Would fail'}</StatusChip>
      </div>
      {audit.sections.map((s) => {
        const mine = findings.map((f, i) => ({ f, i })).filter((x) => x.f.section === s.code);
        return (
          <section key={s.code} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
            <h3 className="flex items-center justify-between border-b border-[var(--ejo-border)] px-3 py-2 text-sm font-semibold text-[var(--ejo-text)]">{s.name}<span className="text-xs font-normal text-[var(--ejo-text-muted)]">{mine.length ? `${mine.length} ${mine.length === 1 ? 'finding' : 'findings'}` : 'Clean'}</span></h3>
            {mine.length ? <ul className="divide-y divide-[var(--ejo-border)]">{mine.map(({ f, i }) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span className="text-[var(--ejo-text)]"><b>{f.severity}</b> · {f.description}</span>{audit.may.edit ? <button type="button" onClick={() => setFindings((all) => all.filter((_, k) => k !== i))} className="text-xs text-[var(--ejo-error)] hover:underline">Remove</button> : null}</li>)}</ul> : null}
          </section>
        );
      })}
      {audit.may.edit ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-[var(--ejo-text-muted)]">Section<select value={section} onChange={(e) => setSection(e.target.value)} className={`${field} mt-1 w-full`}>{audit.sections.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)]">Severity<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className={`${field} mt-1 w-full`}>{(['A', 'B', 'C'] as Severity[]).map((x) => <option key={x} value={x}>{SEVERITY_WORDS[x]}</option>)}</select></label>
            <label className="text-xs text-[var(--ejo-text-muted)] sm:col-span-2">Finding<span className="mt-1 flex gap-2"><input value={description} onChange={(e) => setDescription(e.target.value)} className={`${field} flex-1`} /><button type="button" disabled={!description.trim()} onClick={() => { setFindings((all) => [...all, { section, severity, description: description.trim() }]); setDescription(''); }} className={`${btn} border-[var(--ejo-primary)] text-[var(--ejo-primary)]`}>Add</button></span></label>
          </div>
          <label className="block text-xs text-[var(--ejo-text-muted)]">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} mt-1 w-full`} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => save(false)} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>Save</button>
            <button type="button" disabled={pending} onClick={() => save(true)} className={`${btn} ${score.result === 'PASS' ? 'border-[var(--ejo-success)] bg-[var(--ejo-success)] text-white' : 'border-[var(--ejo-error)] bg-[var(--ejo-error)] text-white'}`}>{score.result === 'PASS' ? 'Finish: audit passed' : 'Finish: audit failed, back to the line'}</button>
          </div>
        </>
      ) : audit.notes ? <p className="text-sm text-[var(--ejo-text-muted)]">{audit.notes}</p> : null}
    </div>
  );
}
