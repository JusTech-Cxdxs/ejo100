'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EnyoDraft } from '@ejo/enyo/src/protocol';
import type { EnyoSource } from '@/lib/enyo/client-contract';
import { plainText, safeHref } from '@/lib/enyo/markdown';
import { EnyoMarkdown } from './Markdown';
import { EIcon } from './icons';
import { rateAnswer } from './api';

/** One line of the conversation as the panel shows it. */
export type Turn = {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  state: 'waiting' | 'streaming' | 'done' | 'stopped' | 'error';
  status?: string;
  sources: EnyoSource[];
  drafts: EnyoDraft[];
  notices: string[];
  refused: boolean;
  error?: { message: string; ref?: string };
  messageId?: string;
  rating?: 1 | -1;
};

const iconBtn = 'inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--ejo-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--ejo-text)_6%,transparent)] hover:text-[var(--ejo-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ejo-primary)] disabled:opacity-40';

export function UserTurn({ turn }: { turn: Turn }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-md bg-[color-mix(in_srgb,var(--ejo-primary)_12%,var(--ejo-bg))] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--ejo-text)] [overflow-wrap:anywhere]">
        <span className="sr-only">You said: </span>{turn.text}
      </p>
    </div>
  );
}

function Sources({ sources, onNavigate }: { sources: EnyoSource[]; onNavigate?: () => void }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-[var(--ejo-text-muted)]">Where this came from</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {sources.slice(0, 8).map((s, i) => {
          const safe = s.href ? safeHref(s.href) : null;
          const chip = 'inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1 text-xs text-[var(--ejo-text)]';
          return (
            <li key={`${s.label}-${i}`} className="max-w-full">
              {safe?.internal ? (
                <Link href={safe.href} onClick={onNavigate} className={`${chip} hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]`}>
                  <EIcon name="link" size={13} /><span className="truncate">{s.label}</span>
                </Link>
              ) : safe ? (
                <a href={safe.href} target="_blank" rel="noopener noreferrer nofollow" className={`${chip} hover:border-[var(--ejo-primary)]`}>
                  <EIcon name="link" size={13} /><span className="truncate">{s.label}</span>
                </a>
              ) : (
                <span className={chip}><span className="truncate">{s.label}</span></span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Something Enyo prepared. Confirming opens the normal page, pre-filled; nothing is saved from here. */
export function DraftCard({ draft, onNavigate }: { draft: EnyoDraft; onNavigate?: () => void }) {
  const safe = draft.href ? safeHref(draft.href) : null;
  return (
    <section aria-label={`Prepared: ${draft.title}`} className="mt-3 rounded-[var(--ejo-radius-lg)] border border-[color-mix(in_srgb,var(--ejo-primary)_35%,var(--ejo-border))] bg-[color-mix(in_srgb,var(--ejo-primary)_5%,var(--ejo-bg))] p-4">
      <p className="text-sm font-semibold text-[var(--ejo-text)]">{draft.title}</p>
      {draft.lines.length ? (
        <ul className="mt-2 space-y-1 text-sm text-[var(--ejo-text)]">
          {draft.lines.slice(0, 12).map((l, i) => (
            <li key={i} className="flex gap-2 break-words [overflow-wrap:anywhere]"><span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--ejo-primary)]" />{l}</li>
          ))}
        </ul>
      ) : null}
      {safe ? (
        <>
          {safe.internal ? (
            <Link href={safe.href} onClick={onNavigate} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-medium text-white hover:brightness-110">
              {draft.confirmLabel}<EIcon name="arrow" size={15} />
            </Link>
          ) : (
            <a href={safe.href} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-medium text-white">{draft.confirmLabel}</a>
          )}
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">This opens the page with the details filled in. Nothing is saved until you confirm there.</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Nothing has been saved.</p>
      )}
    </section>
  );
}

function Rating({ turn, onRated }: { turn: Turn; onRated: (r: 1 | -1 | undefined) => void }) {
  const [noteFor, setNoteFor] = useState<1 | -1 | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = turn.messageId;
  if (!id) return null;

  async function rate(r: 1 | -1) {
    if (busy || !id) return;
    const before = turn.rating;
    onRated(r);
    setBusy(true);
    setMsg(null);
    const res = await rateAnswer(id, r);
    setBusy(false);
    if (!res.ok) { onRated(before); setMsg(res.error); return; }
    setNoteFor(r);
  }
  async function sendNote() {
    if (!id || noteFor === null) return;
    const text = note.trim().slice(0, 500);
    if (!text) { setNoteFor(null); return; }
    setBusy(true);
    const res = await rateAnswer(id, noteFor, text);
    setBusy(false);
    setNoteFor(null);
    setNote('');
    setMsg(res.ok ? 'Thank you. Your note was sent.' : res.error);
  }

  return (
    <>
      <button type="button" className={`${iconBtn} ${turn.rating === 1 ? 'text-[var(--ejo-primary)]' : ''}`} aria-label="Helpful" aria-pressed={turn.rating === 1} disabled={busy} onClick={() => rate(1)}>
        <EIcon name="thumb-up" size={17} />
      </button>
      <button type="button" className={`${iconBtn} ${turn.rating === -1 ? 'text-[var(--ejo-error)]' : ''}`} aria-label="Not helpful" aria-pressed={turn.rating === -1} disabled={busy} onClick={() => rate(-1)}>
        <EIcon name="thumb-down" size={17} />
      </button>
      {noteFor !== null ? (
        <form className="mt-1 flex w-full flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void sendNote(); }}>
          <label className="sr-only" htmlFor={`note-${turn.key}`}>A note about this answer (optional)</label>
          <input id={`note-${turn.key}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={noteFor === 1 ? 'What helped? (optional)' : 'What was wrong? (optional)'} className="min-h-11 min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]" />
          <button type="submit" disabled={busy} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]">Send note</button>
          <button type="button" onClick={() => setNoteFor(null)} className="min-h-11 px-2 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Skip</button>
        </form>
      ) : null}
      {msg ? <p role="status" className="w-full text-xs text-[var(--ejo-text-muted)]">{msg}</p> : null}
    </>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(false), 2000); return () => window.clearTimeout(t); }, [copied]);
  return (
    <button
      type="button"
      className={iconBtn}
      aria-label={copied ? 'Copied' : 'Copy answer'}
      onClick={async () => { try { await navigator.clipboard.writeText(plainText(text)); setCopied(true); } catch { /* clipboard blocked: nothing to do */ } }}
    >
      <EIcon name={copied ? 'check' : 'copy'} size={17} />
    </button>
  );
}

function ErrorBox({ error }: { error: { message: string; ref?: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="alert" className="mt-2 rounded-[var(--ejo-radius-md)] border border-[color-mix(in_srgb,var(--ejo-error)_35%,transparent)] bg-[color-mix(in_srgb,var(--ejo-error)_7%,var(--ejo-bg))] p-3 text-sm text-[var(--ejo-text)]">
      <p className="flex gap-2"><EIcon name="alert" size={17} className="mt-0.5 shrink-0 text-[var(--ejo-error)]" />{error.message}</p>
      {error.ref ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 pl-6 text-xs text-[var(--ejo-text-muted)]">
          Reference <span className="font-mono text-[var(--ejo-text)]">{error.ref}</span>
          <button type="button" className="min-h-8 rounded px-1.5 font-medium text-[var(--ejo-primary)] hover:underline" onClick={async () => { try { await navigator.clipboard.writeText(error.ref!); setCopied(true); } catch { /* ignore */ } }}>
            {copied ? 'Copied' : 'Copy reference'}
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function AssistantTurn({ turn, last, onRated, onNavigate, onListen, speaking }: { turn: Turn; last: boolean; onRated: (r: 1 | -1 | undefined) => void; onNavigate?: () => void; onListen?: () => void; speaking?: boolean }) {
  const live = turn.state === 'waiting' || turn.state === 'streaming';
  return (
    <div className="text-sm leading-relaxed text-[var(--ejo-text)]">
      {turn.state === 'waiting' && !turn.text ? (
        <p className="flex items-center gap-2 text-[var(--ejo-text-muted)]">
          <span className="enyo-typing" aria-hidden="true"><i /><i /><i /></span>
          <span className="ejo-shimmer-soft">{turn.status || 'Thinking'}</span>
        </p>
      ) : null}
      {/* Streamed text: read out politely once the answer is complete. */}
      <div aria-live={last ? 'polite' : undefined} aria-busy={live || undefined} aria-atomic="false">
        {turn.text ? <EnyoMarkdown text={turn.text} onNavigate={onNavigate} /> : null}
      </div>
      {turn.state === 'streaming' && turn.status ? <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">{turn.status}</p> : null}
      {turn.refused ? (
        <p className="mt-2 flex gap-2 rounded-[var(--ejo-radius-md)] bg-[color-mix(in_srgb,var(--ejo-text)_5%,transparent)] p-2.5 text-xs text-[var(--ejo-text-muted)]">
          <EIcon name="lock" size={15} className="mt-px shrink-0" />Part of this is outside what your role can see, so it was left out.
        </p>
      ) : null}
      {turn.notices.map((n, i) => (
        <p key={i} className="mt-2 rounded-[var(--ejo-radius-md)] border-l-[3px] border-[var(--ejo-warning)] bg-[color-mix(in_srgb,var(--ejo-warning)_9%,var(--ejo-bg))] px-3 py-2 text-xs text-[var(--ejo-text)]">{n}</p>
      ))}
      {turn.drafts.map((d, i) => <DraftCard key={i} draft={d} onNavigate={onNavigate} />)}
      <Sources sources={turn.sources} onNavigate={onNavigate} />
      {turn.error ? <ErrorBox error={turn.error} /> : null}
      {turn.state === 'stopped' ? <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">Stopped.</p> : null}
      {turn.state === 'done' && turn.text ? (
        <div className="-ml-2.5 mt-1 flex flex-wrap items-center">
          <CopyAnswer text={turn.text} />
          {onListen ? (
            <button type="button" className={iconBtn} aria-label={speaking ? 'Stop reading' : 'Listen'} title={speaking ? 'Stop reading' : 'Listen'} onClick={onListen}>
              <EIcon name={speaking ? 'speaker-off' : 'speaker'} size={17} />
            </button>
          ) : null}
          <Rating turn={turn} onRated={onRated} />
        </div>
      ) : null}
    </div>
  );
}
