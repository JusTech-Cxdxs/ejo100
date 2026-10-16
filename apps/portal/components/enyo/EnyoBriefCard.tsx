'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getMyBrief, type MyBrief } from '@/lib/actions/brief';
import { BRIEF_SCOPES, BRIEF_SCOPE_LABEL, partOfDay, type BriefScope } from '@/lib/brief/core';
import { EnyoMarkdown } from './Markdown';
import { createMouthDriver, speakable, useSpeechOutput } from './voice';
import { readPrefs } from './prefs';
import { EIcon } from './icons';

// Per person on this device (a shared workshop PC keeps each person's own).
const keys = (who: string) => ({ AUTO_KEY: `ejo:brief:${who}:auto`, PART_KEY: `ejo:brief:${who}:part`, LAST_KEY: `ejo:brief:${who}:last` });
const get = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } };

/**
 * "Brief me" on the dashboard: Enyo tells the person what is waiting —
 * decisions, steps, support requests, reminders, appointments, jobs, their
 * own mail and new notifications — for now, today, since their last brief,
 * this week or chosen dates, with a link to each. They can listen to it. By
 * default it briefs itself once each morning, afternoon and evening when the
 * dashboard opens (switch off below; remembered on this device).
 */
export function EnyoBriefCard({ userKey }: { userKey: string }) {
  const { AUTO_KEY, PART_KEY, LAST_KEY } = useMemo(() => keys(userKey), [userKey]);
  const [scope, setScope] = useState<BriefScope>('now');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<MyBrief | null>(null);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(true);
  const [open, setOpen] = useState(false);
  const mouth = useMemo(() => createMouthDriver(), []);
  const voice = useSpeechOutput(mouth, typeof window === 'undefined' ? '' : readPrefs().voice);
  const started = useRef(false);

  const run = useCallback(async (s: BriefScope, range?: { from: string; to: string }) => {
    setBusy(true);
    setError('');
    voice.cancel();
    try {
      const r = await getMyBrief({ scope: s, since: get(LAST_KEY) ?? undefined, ...(range ? { from: range.from, to: range.to } : {}) });
      setBrief(r);
      set(LAST_KEY, new Date().toISOString());
      set(PART_KEY, partOfDay());
    } catch {
      setError('Enyo could not put your brief together just now. Please try again.');
    }
    setBusy(false);
  }, [voice, LAST_KEY, PART_KEY]);

  // Once each morning, afternoon and evening: a brief since the last one.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const on = get(AUTO_KEY) !== 'off';
    setAuto(on);
    if (on && get(PART_KEY) !== partOfDay()) void run(get(LAST_KEY) ? 'since_last' : 'now');
  }, [run, AUTO_KEY, PART_KEY, LAST_KEY]);

  const toggleAuto = (v: boolean) => { setAuto(v); set(AUTO_KEY, v ? 'on' : 'off'); };
  const go = () => void run(scope, scope === 'custom' ? { from, to } : undefined);
  const control = 'min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2.5 text-sm text-[var(--ejo-text)]';

  return (
    <section aria-labelledby="enyo-brief" className="mb-6 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[color-mix(in_srgb,var(--ejo-primary)_25%,var(--ejo-border))] bg-[color-mix(in_srgb,var(--ejo-primary)_4%,var(--ejo-surface))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ejo-border)] px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ejo-primary)]/12 text-[var(--ejo-primary)]"><EIcon name="wand" size={16} /></span>
        <h2 id="enyo-brief" className="mr-auto text-sm font-semibold text-[var(--ejo-text)]">Your brief</h2>
        <label htmlFor="brief-scope" className="sr-only">What to brief</label>
        <select id="brief-scope" value={scope} onChange={(e) => setScope(e.target.value as BriefScope)} className={control}>
          {BRIEF_SCOPES.map((s) => <option key={s} value={s}>{BRIEF_SCOPE_LABEL[s]}</option>)}
        </select>
        {scope === 'custom' ? (
          <>
            <label className="sr-only" htmlFor="brief-from">From</label>
            <input id="brief-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={control} />
            <label className="sr-only" htmlFor="brief-to">To</label>
            <input id="brief-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={control} />
          </>
        ) : null}
        <button type="button" onClick={go} disabled={busy || (scope === 'custom' && (!from || !to))} className="min-h-10 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {busy ? 'Putting it together…' : 'Brief me'}
        </button>
        {brief && voice.supported ? (
          <button type="button" onClick={() => (voice.speaking ? voice.cancel() : voice.speak(speakable(brief.text)))} aria-pressed={voice.speaking}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">
            <EIcon name={voice.speaking ? 'speaker-off' : 'speaker'} size={16} />{voice.speaking ? 'Stop' : 'Listen'}
          </button>
        ) : null}
      </div>
      <div className="px-4 py-3 text-sm leading-relaxed text-[var(--ejo-text)]" role="status" aria-live="polite">
        {error ? <p className="text-[var(--ejo-error)]">{error}</p> : null}
        {!brief && !busy && !error ? <p className="text-[var(--ejo-text-muted)]">Ask Enyo what is waiting for you — approvals, steps, support requests, reminders, appointments, jobs, your mail and new notifications — with a link to each.</p> : null}
        {busy && !brief ? <p className="text-[var(--ejo-text-muted)]">Enyo is looking through your work…</p> : null}
        {brief ? (
          <>
            <EnyoMarkdown text={brief.text} />
            {brief.total ? (
              <details className="mt-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
                <summary className="flex min-h-10 cursor-pointer items-center text-xs font-medium text-[var(--ejo-primary)]">Everything in this brief ({brief.total})</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {brief.data.sections.filter((s) => s.count > 0).map((s) => (
                    <div key={s.key} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
                      <p className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--ejo-text)]">
                        <span>{s.title}{s.overdue ? <span className="ml-1.5 rounded-full bg-[var(--ejo-warning)]/15 px-1.5 text-[10px] text-[var(--ejo-warning-text)]">{s.overdue} overdue</span> : null}</span>
                        <Link href={s.href} className="font-medium text-[var(--ejo-primary)] hover:underline">{s.count} →</Link>
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {s.items.slice(0, 5).map((i, n) => (
                          <li key={`${s.key}-${n}`} className="text-xs">
                            <Link href={i.href} className={`hover:underline ${i.overdue ? 'font-medium text-[var(--ejo-warning-text)]' : 'text-[var(--ejo-text)]'}`}>{i.title}</Link>
                            {i.when ? <span className="text-[var(--ejo-text-muted)]"> · {i.when}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {!brief.byEnyo && brief.total ? <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Listed without Enyo’s write-up (Enyo is off or busy).</p> : null}
          </>
        ) : null}
      </div>
      <label className="flex min-h-10 items-center gap-2 border-t border-[var(--ejo-border)] px-4 text-xs text-[var(--ejo-text-muted)]">
        <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="h-4 w-4 accent-[var(--ejo-primary)]" />
        Brief me automatically each morning, afternoon and evening when I open the dashboard
      </label>
    </section>
  );
}
