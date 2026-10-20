'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getMyBrief, summariseMyBrief, type MyBrief } from '@/lib/actions/brief';
import { BRIEF_SCOPES, BRIEF_SCOPE_LABEL, orderedSections, partOfDay, type BriefScope, type BriefSection } from '@/lib/brief/core';
import { Icon, type IconName } from '@/components/ui';
import { createMouthDriver, speakable, useSpeechOutput } from './voice';
import { readPrefs } from './prefs';
import { EIcon } from './icons';

// Per person on this device (a shared workshop PC keeps each person's own).
const keys = (who: string) => ({ AUTO_KEY: `ejo:brief:${who}:auto`, PART_KEY: `ejo:brief:${who}:part`, LAST_KEY: `ejo:brief:${who}:last`, OPEN_KEY: `ejo:brief:${who}:open` });
const get = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } };

const ICON: Record<string, IconName> = {
  decisions: 'check-circle', steps: 'list', support: 'inbox', reminders: 'clock', appointments: 'calendar', jobs: 'wrench', waiting: 'arrow-right', mail: 'mail', activity: 'bell', broadcasts: 'megaphone',
};

/**
 * "Your brief" on the dashboard. Closed, it is one line: what is waiting, as
 * small counts (decisions, support, reminders…). Open, it shows Enyo's short
 * summary and every section with its items and links. The list arrives at
 * once (no AI); Enyo's few sentences follow. It briefs itself once each
 * morning, afternoon and evening (switch off below); open or closed and that
 * choice are remembered on this device for this person.
 */
export function EnyoBriefCard({ userKey }: { userKey: string }) {
  const { AUTO_KEY, PART_KEY, LAST_KEY, OPEN_KEY } = useMemo(() => keys(userKey), [userKey]);
  const [scope, setScope] = useState<BriefScope>('now');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<MyBrief | null>(null);
  const [summary, setSummary] = useState<{ text: string; byEnyo: boolean } | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(true);
  const [open, setOpen] = useState(false);
  const mouth = useMemo(() => createMouthDriver(), []);
  const voice = useSpeechOutput(mouth, typeof window === 'undefined' ? '' : readPrefs().voice);
  const started = useRef(false);
  const runId = useRef(0);

  const run = useCallback(async (s: BriefScope, range?: { from: string; to: string }) => {
    const id = ++runId.current;
    setBusy(true);
    setError('');
    setSummary(null);
    voice.cancel();
    const input = { scope: s, since: get(LAST_KEY) ?? undefined, ...(range ? { from: range.from, to: range.to } : {}) };
    try {
      const r = await getMyBrief(input);
      if (id !== runId.current) return;
      setBrief(r);
      setBusy(false);
      set(LAST_KEY, new Date().toISOString());
      set(PART_KEY, partOfDay());
      if (r.total) {
        setWriting(true);
        const sum = await summariseMyBrief(input).catch(() => ({ text: r.summary, byEnyo: false }));
        if (id === runId.current) setSummary(sum);
      } else setSummary({ text: r.summary, byEnyo: false });
    } catch {
      if (id === runId.current) setError('Enyo could not put your brief together just now. Please try again.');
    } finally {
      if (id === runId.current) { setBusy(false); setWriting(false); }
    }
  }, [voice, LAST_KEY, PART_KEY]);

  // Once each morning, afternoon and evening: a brief since the last one.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const on = get(AUTO_KEY) !== 'off';
    setAuto(on);
    setOpen(get(OPEN_KEY) === 'open');
    if (on && get(PART_KEY) !== partOfDay()) void run(get(LAST_KEY) ? 'since_last' : 'now');
  }, [run, AUTO_KEY, PART_KEY, LAST_KEY, OPEN_KEY]);

  const toggleAuto = (v: boolean) => { setAuto(v); set(AUTO_KEY, v ? 'on' : 'off'); };
  const toggleOpen = () => setOpen((o) => { set(OPEN_KEY, o ? 'closed' : 'open'); return !o; });
  const go = () => { if (!open) toggleOpen(); void run(scope, scope === 'custom' ? { from, to } : undefined); };
  const sections = brief ? orderedSections(brief.data) : [];
  const needs = sections.filter((s) => s.key !== 'activity');
  const overdue = needs.reduce((n, s) => n + (s.overdue ?? 0), 0);
  const control = 'min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2.5 text-sm text-[var(--ejo-text)]';

  return (
    <section aria-labelledby="enyo-brief" className="relative mb-6 overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[color-mix(in_srgb,var(--ejo-primary)_22%,var(--ejo-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ejo-primary)_9%,var(--ejo-surface))_0%,var(--ejo-surface)_55%,color-mix(in_srgb,var(--ejo-accent,var(--ejo-primary))_6%,var(--ejo-surface))_100%)] shadow-sm">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--ejo-primary)]/10 blur-3xl" />
      {/* The header row: always visible, opens and closes the card. */}
      <div className="relative flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <button type="button" onClick={toggleOpen} aria-expanded={open} aria-controls="enyo-brief-body" className="flex min-h-11 min-w-0 flex-[1_1_16rem] items-center gap-3 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ejo-primary)] text-white shadow-sm"><EIcon name="wand" size={18} /></span>
          <span className="min-w-0">
            <span id="enyo-brief" className="block text-sm font-semibold text-[var(--ejo-text)]">Your brief from Enyo</span>
            <span className="block truncate text-xs text-[var(--ejo-text-muted)]">
              {busy ? 'Looking through your work…' : brief ? brief.headline : 'What is waiting for you — decisions, support, reminders, appointments, mail.'}
            </span>
          </span>
          {brief && overdue ? <span className="ml-auto shrink-0 rounded-full bg-[var(--ejo-error)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--ejo-error)]">{overdue} overdue</span> : null}
          <span className={`shrink-0 text-[var(--ejo-text-muted)] transition-transform ${open ? 'rotate-180' : ''} ${brief && overdue ? '' : 'ml-auto'}`} aria-hidden="true"><Icon name="chevron-down" size={18} /></span>
        </button>
        {/* Never squeezes the title: below ~32rem of room the choice and the button take their own full-width line. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label htmlFor="brief-scope" className="sr-only">What to brief</label>
          <select id="brief-scope" value={scope} onChange={(e) => setScope(e.target.value as BriefScope)} className={`${control} min-w-0 flex-1 sm:flex-none`}>
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
          <button type="button" onClick={go} disabled={busy || (scope === 'custom' && (!from || !to))} className="min-h-10 shrink-0 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60">
            {busy ? 'Briefing…' : brief ? 'Refresh' : 'Brief me'}
          </button>
        </div>
      </div>

      {/* Counts at a glance (also when closed). */}
      {brief && needs.length ? (
        <div className="relative flex flex-wrap gap-2 px-4 pb-3 sm:px-5">
          {needs.slice(0, 6).map((s) => (
            <Link key={s.key} href={s.href} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:-translate-y-px ${s.overdue ? 'border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/8 text-[var(--ejo-error)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)]'}`}>
              <Icon name={ICON[s.key] ?? 'list'} size={14} /> <span className="font-semibold">{s.countLabel ?? s.count}</span> {s.title.toLowerCase()}
            </Link>
          ))}
        </div>
      ) : null}

      <div id="enyo-brief-body" hidden={!open} className="relative border-t border-[var(--ejo-border)] px-4 py-4 sm:px-5" aria-live="polite" aria-busy={busy || writing}>
        {error ? <p className="text-sm text-[var(--ejo-error)]">{error}</p> : null}
        {!brief && !busy && !error ? <p className="text-sm text-[var(--ejo-text-muted)]">Press <strong>Brief me</strong>: Enyo puts together what is waiting for you, with a link to each — approvals, support requests, reminders, appointments, jobs and your mail.</p> : null}
        {busy && !brief ? <BriefSkeleton /> : null}
        {brief ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-surface)]/80 p-3 ring-1 ring-[var(--ejo-border)]">
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--ejo-text)]">
                {summary ? summary.text : <span className="inline-flex items-center gap-2 text-[var(--ejo-text-muted)]"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--ejo-primary)]" />Enyo is writing your summary…</span>}
              </p>
              {summary && voice.supported ? (
                <button type="button" onClick={() => (voice.speaking ? voice.cancel() : voice.speak(speakable(`${summary.text} ${brief.headline}`)))} aria-pressed={voice.speaking}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">
                  <EIcon name={voice.speaking ? 'speaker-off' : 'speaker'} size={14} />{voice.speaking ? 'Stop' : 'Listen'}
                </button>
              ) : null}
            </div>
            {sections.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sections.map((s) => <SectionTile key={s.key} s={s} />)}
              </div>
            ) : null}
            {summary && !summary.byEnyo && brief.total ? <p className="text-[11px] text-[var(--ejo-text-muted)]">Summary without Enyo’s write-up (Enyo is off or busy). Everything is listed above.</p> : null}
          </div>
        ) : null}
        <label className="mt-4 flex min-h-10 items-center gap-2 text-xs text-[var(--ejo-text-muted)]">
          <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="h-4 w-4 accent-[var(--ejo-primary)]" />
          Brief me automatically each morning, afternoon and evening when I open the dashboard
        </label>
      </div>
    </section>
  );
}

function SectionTile({ s }: { s: BriefSection }) {
  const info = s.key === 'activity';
  return (
    <div className={`rounded-[var(--ejo-radius-lg)] border bg-[var(--ejo-surface)] p-3 ${s.overdue ? 'border-[var(--ejo-error)]/30' : 'border-[var(--ejo-border)]'}`}>
      <p className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--ejo-text)]">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${info ? 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]' : 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'}`}><Icon name={ICON[s.key] ?? 'list'} size={14} /></span>
          <span className="truncate">{s.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {s.overdue ? <span className="rounded-full bg-[var(--ejo-error)]/12 px-1.5 text-[10px] font-semibold text-[var(--ejo-error)]">{s.overdue} overdue</span> : null}
          <span className="text-sm font-bold text-[var(--ejo-text)]">{s.countLabel ?? s.count}</span>
        </span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {s.items.slice(0, info ? 3 : 4).map((i, n) => (
          <li key={`${s.key}-${n}`} className="text-xs leading-snug">
            <Link href={i.href} className={`font-medium hover:underline ${i.overdue ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text)]'}`}>{i.title}</Link>
            {i.detail || i.when ? <span className="block truncate text-[var(--ejo-text-muted)]">{[i.detail, i.when].filter(Boolean).join(' · ')}</span> : null}
          </li>
        ))}
      </ul>
      {s.count > (info ? 3 : 4) ? <Link href={s.href} className="mt-2 inline-flex min-h-8 items-center text-xs font-medium text-[var(--ejo-primary)] hover:underline">See all {s.countLabel ?? s.count} →</Link> : null}
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((k) => <div key={k} className="h-28 animate-pulse rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-bg)]" />)}
    </div>
  );
}
