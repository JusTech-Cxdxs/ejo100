'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { EnyoAvatar } from '@ejo/enyo/src/ui/EnyoAvatar';
import { readEvents, type EnyoEvent } from '@ejo/enyo/src/protocol';
import { useChatViewport } from '@ejo/enyo/src/ui/useChatViewport';
import { joinSpoken, useSpeechInput } from '@ejo/enyo/src/ui/speechInput';
import { EnyoMarkdown } from './EnyoMarkdown';
import { usePathname } from 'next/navigation';
import { NUDGE_AFTER_MS, nudgeFor } from '@/lib/enyo/nudge';

/**
 * Enyo's chat on the website: a floating button that opens a chat panel.
 *  - variant "portal": the signed-in customer portal (the customer's own records);
 *  - variant "public": the public website (organisation information and hand-over).
 * The server decides which assistant answers from the session, never this
 * component. The button only appears when the assistant is switched on.
 *
 * Phones (360 px and up): the panel fills the screen; tablets and desktops:
 * a docked panel. Keyboard: Enter sends, Shift+Enter is a new line, Esc
 * closes and returns focus to the button. Streaming text is announced
 * politely to screen readers. Answers are rendered from a safe Markdown
 * subset — never as HTML.
 */

type Source = { label: string; href?: string };
type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  status?: string;
  sources?: Source[];
  notices?: string[];
  handover?: { ticketNumber: string; text: string };
  error?: { message: string; ref?: string };
};
type Status = { ready: boolean; displayName: string; message?: string; consentLine?: string; messages?: { id: string; role: 'user' | 'assistant'; text: string }[]; conversationId?: string };

const ENDPOINT = '/api/enyo/chat';
const MAX = 2000;

const SUGGESTIONS: Record<'portal' | 'public', string[]> = {
  portal: ['Where is my vehicle up to?', 'What do I still owe?', 'How do I pay?', 'I would like to talk to a person'],
  public: ['Where are your branches?', 'How do I book a service?', 'What does your organisation do?', 'I would like someone to call me'],
};

const storageKey = (variant: string) => `enyo:conversation:${variant}`;
function readStored(variant: string): string | null {
  try { return window.sessionStorage.getItem(storageKey(variant)); } catch { return null; }
}
function writeStored(variant: string, id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(storageKey(variant), id);
    else window.sessionStorage.removeItem(storageKey(variant));
  } catch { /* private mode: the conversation simply is not reopened */ }
}

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq += 1)}`;

function Glyph({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>
  );
}
const ICON = {
  close: 'M6 6l12 12M18 6 6 18',
  send: 'M5 12h13M13 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
  restart: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  pause: 'M9 6v12M15 6v12',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
};

/** "0:07" since the voice note started (ticks while listening). */
function Elapsed({ since, running }: { since: number | null; running: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);
  const s = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
  return <>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</>;
}

/** A voice note in progress: what was heard so far, with cancel, pause / carry on, edit as text, and send. */
function VoiceBar(p: { listening: boolean; paused: boolean; processing: boolean; words: string; startedAt: number | null; busy: boolean; onCancel: () => void; onPause: () => void; onResume: () => void; onEdit: () => void; onSend: () => void }) {
  const small = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40';
  return (
    <div role="group" aria-label="Voice note" className="mb-2 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-bg)] p-2" data-testid="enyo-voice-note">
      <p role="status" aria-live="polite" className="flex items-start gap-2 px-1.5 pb-1.5 text-sm text-[var(--ejo-text)]">
        <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${p.listening ? 'animate-pulse bg-[var(--ejo-error)] motion-reduce:animate-none' : 'bg-[var(--ejo-text-muted)]'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{p.processing ? 'Getting your words…' : p.listening ? 'Listening' : 'Paused'}</span>
          <span className="text-[var(--ejo-text-muted)]"> · <Elapsed since={p.startedAt} running={p.listening} /></span>
          <span className="mt-0.5 block max-h-24 overflow-y-auto break-words text-[var(--ejo-text-muted)]">{p.words || (p.listening ? 'Speak now…' : 'Nothing heard yet.')}</span>
        </span>
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={p.onCancel} aria-label="Cancel the voice note" title="Cancel" className={`${small} text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]`}><Glyph d={ICON.close} /></button>
        {p.listening ? (
          <button type="button" onClick={p.onPause} disabled={p.processing} aria-label="Pause" title="Pause — keep the words" className={`${small} text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]`}><Glyph d={ICON.pause} /></button>
        ) : (
          <button type="button" onClick={p.onResume} disabled={p.processing} aria-label="Carry on speaking" title="Carry on speaking" className={`${small} text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10`}><Glyph d={ICON.mic} /></button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={p.onEdit} disabled={p.processing} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10 disabled:opacity-40"><Glyph d={ICON.pencil} size={16} />Edit as text</button>
        <button type="button" onClick={p.onSend} disabled={p.processing || p.busy} aria-label="Send the voice note" title="Send now" className={`${small} bg-[var(--ejo-primary)] text-white hover:brightness-110`}><Glyph d={ICON.send} /></button>
      </div>
    </div>
  );
}

export function EnyoChat({ variant }: { variant: 'portal' | 'public' }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const name = status?.displayName || 'Enyo';
  // Phones: the chat fits the visible screen above the keyboard, header always in view.
  const viewportBox = useChatViewport(open);
  const pathname = usePathname();
  // After a while on a page without asking anything, Enyo offers one question (once per visit).
  const [nudge, setNudge] = useState<{ line: string; ask: string } | null>(null);
  const nudgeSeen = () => { try { return sessionStorage.getItem('enyo:nudged') === '1'; } catch { return true; } };
  const markNudged = () => { try { sessionStorage.setItem('enyo:nudged', '1'); } catch { /* private mode */ } };
  useEffect(() => {
    setNudge(null);
    if (variant !== 'public' || !status?.ready || open || messages.length || nudgeSeen()) return;
    const offer = nudgeFor(pathname);
    if (!offer) return;
    const t = setTimeout(() => { if (!nudgeSeen() && document.visibilityState === 'visible') { setNudge(offer); markNudged(); } }, NUDGE_AFTER_MS);
    return () => clearTimeout(t);
  }, [variant, status?.ready, open, messages.length, pathname]);

  // May the button show? (Also reopens this tab's conversation.)
  useEffect(() => {
    let alive = true;
    const stored = readStored(variant);
    fetch(`${ENDPOINT}${stored ? `?conversation=${encodeURIComponent(stored)}` : ''}`, { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json() as Promise<Status>)
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        if (s.ready && s.messages?.length && s.conversationId) {
          conversationId.current = s.conversationId;
          setMessages(s.messages.map((m) => ({ id: m.id, role: m.role, text: m.text })));
        } else if (stored) {
          writeStored(variant, null);
        }
      })
      .catch(() => { if (alive) setStatus({ ready: false, displayName: 'Enyo' }); });
    return () => { alive = false; };
  }, [variant]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus());
  }, []);

  // Focus the message box on open; Esc closes (useChatViewport locks the page behind on phones).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 30);
    const small = window.matchMedia('(max-width: 639px)').matches;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = panel.current;
      if (!el) return;
      if (e.key === 'Escape' && el.contains(document.activeElement)) { e.preventDefault(); close(); return; }
      // Full screen on phones: Tab stays inside the chat until it is closed.
      if (e.key !== 'Tab' || !small) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  // Keep the newest message in view while it streams (unless the person scrolled up to read).
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const patch = useCallback((id: string, f: (m: Msg) => Msg) => {
    setMessages((list) => list.map((m) => (m.id === id ? f(m) : m)));
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    if (text.length > MAX) return;
    const answerId = nextId();
    setMessages((list) => [...list, { id: nextId(), role: 'user', text }, { id: answerId, role: 'assistant', text: '', pending: true, status: 'Thinking…' }]);
    setDraft('');
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ conversationId: conversationId.current ?? undefined, message: text, page: window.location.pathname.slice(0, 120) }),
        signal: ctrl.signal,
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('text/event-stream') || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; ref?: string };
        patch(answerId, (m) => ({ ...m, pending: false, status: undefined, error: { message: body.error || 'I could not answer just now. Please try again in a moment.', ref: body.ref } }));
        return;
      }
      for await (const e of readEvents(res.body) as AsyncGenerator<EnyoEvent>) {
        switch (e.type) {
          case 'conversation':
            conversationId.current = e.id;
            writeStored(variant, e.id);
            break;
          case 'status': patch(answerId, (m) => ({ ...m, status: e.text })); break;
          case 'text': patch(answerId, (m) => ({ ...m, text: m.text + e.text, status: undefined })); break;
          case 'tool': patch(answerId, (m) => ({ ...m, status: m.text ? undefined : 'Putting the answer together…' })); break;
          case 'sources': patch(answerId, (m) => ({ ...m, sources: e.sources.filter((s) => !s.href || (s.href.startsWith('/') && !s.href.startsWith('//')) || /^https:\/\/[^\s]+$/i.test(s.href)) })); break;
          case 'notice': patch(answerId, (m) => ({ ...m, notices: [...(m.notices ?? []), e.text] })); break;
          case 'handover': patch(answerId, (m) => ({ ...m, handover: { ticketNumber: e.ticketNumber, text: e.text } })); break;
          case 'error': patch(answerId, (m) => ({ ...m, pending: false, status: undefined, error: { message: e.message, ref: e.ref } })); break;
          case 'done': patch(answerId, (m) => ({ ...m, pending: false, status: undefined })); break;
          default: break;
        }
      }
      patch(answerId, (m) => ({ ...m, pending: false, status: undefined }));
    } catch {
      patch(answerId, (m) => (ctrl.signal.aborted
        ? { ...m, pending: false, status: undefined, text: m.text || 'Stopped.' }
        : { ...m, pending: false, status: undefined, error: { message: 'The connection dropped. Please check your internet connection and try again.' } }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }, [busy, patch, variant]);

  // Voice notes (the browser's own speech recognition): send at once, or put the words in the box to edit.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const voice = useSpeechInput((heard, how) => {
    const words = joinSpoken(draftRef.current, heard).slice(0, MAX);
    if (how === 'send') { void send(words); return; }
    setDraft(words);
    requestAnimationFrame(() => input.current?.focus());
  });
  // Closing the chat throws an unfinished voice note away (nothing is sent).
  useEffect(() => { if (!open) voice.cancel(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(draft); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); }
  };
  const restart = () => {
    abort.current?.abort();
    conversationId.current = null;
    writeStored(variant, null);
    setMessages([]);
    input.current?.focus();
  };

  if (!status?.ready) return null;

  const lift = variant === 'portal' ? 'bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] lg:bottom-6' : 'bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:bottom-6';
  const over = draft.length > MAX;

  return (
    <>
      {!open && nudge ? (
        <div role="status" aria-live="polite" data-testid="enyo-nudge" className={`ejo-rise fixed right-[calc(env(safe-area-inset-right)+1rem)] z-[45] mb-16 w-[min(18rem,calc(100vw-2rem))] rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3 text-sm text-[var(--ejo-text)] shadow-xl sm:right-6 ${variant === 'portal' ? '' : 'bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:bottom-6'}`}>
          <p className="pr-6">{nudge.line}</p>
          <button type="button" aria-label="No thanks" onClick={() => setNudge(null)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]">×</button>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => { const ask = nudge.ask; setNudge(null); setOpen(true); void send(ask); }} className="min-h-9 rounded-full bg-[var(--ejo-primary)] px-3 text-xs font-semibold text-white hover:brightness-110">Yes, ask {name}</button>
            <button type="button" onClick={() => { setNudge(null); setOpen(true); }} className="min-h-9 rounded-full border border-[var(--ejo-border)] px-3 text-xs font-medium hover:bg-[var(--ejo-bg)]">Something else</button>
          </div>
        </div>
      ) : null}
      {!open ? (
        <button
          ref={button}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Chat with ${name}`}
          data-testid="enyo-chat-button"
          className={`ejo-rise fixed right-[calc(env(safe-area-inset-right)+1rem)] z-[45] flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-[var(--ejo-primary)] px-4 text-white shadow-lg shadow-[var(--ejo-primary)]/25 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ejo-primary)]/35 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:right-6 ${lift}`}
        >
          <span className="-ml-2 overflow-hidden rounded-full bg-white/95"><EnyoAvatar size={40} mood="idle" /></span>
          <span className="hidden text-sm font-semibold sm:inline">Ask {name}</span>
        </button>
      ) : null}

      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby="enyo-chat-title"
          data-testid="enyo-chat"
          style={viewportBox}
          className="ejo-pop fixed inset-0 z-[60] flex flex-col bg-[var(--ejo-bg)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100dvh-3rem))] sm:w-[400px] sm:overflow-hidden sm:rounded-[var(--ejo-radius-xl)] sm:border sm:border-[var(--ejo-border)] sm:pb-0 sm:pt-0 sm:shadow-2xl"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 sm:px-4">
            <EnyoAvatar size={40} mood={busy ? (messages.at(-1)?.text ? 'speaking' : 'thinking') : messages.length ? 'idle' : 'wave'} level={busy ? 0.55 : 0} />
            <div className="min-w-0 flex-1">
              <h2 id="enyo-chat-title" className="truncate text-sm font-semibold text-[var(--ejo-text)]">{name}</h2>
              <p className="truncate text-xs text-[var(--ejo-text-muted)]">{variant === 'portal' ? 'Your assistant for your vehicles and visits' : 'Questions about our organisation and services'}</p>
            </div>
            {messages.length ? (
              <button type="button" onClick={restart} aria-label="Start a new conversation" title="New conversation" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]">
                <Glyph d={ICON.restart} />
              </button>
            ) : null}
            <button type="button" onClick={close} aria-label="Close chat" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]">
              <Glyph d={ICON.close} />
            </button>
          </header>

          <div ref={log} role="log" aria-live="polite" aria-relevant="additions text" aria-label={`Conversation with ${name}`} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
            {messages.length === 0 ? (
              <div className="ejo-fade">
                <p className="text-sm text-[var(--ejo-text)]">Hello, I’m {name}. {variant === 'portal' ? 'Ask me about your vehicles, jobs, estimates, payments or warranties.' : 'Ask me about our branches, services and how to reach us.'}</p>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Suggestions">
                  {SUGGESTIONS[variant].map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => void send(s)} className="min-h-11 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3.5 py-2 text-left text-sm text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50">{s}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {messages.map((m) => (m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--ejo-primary)] px-3.5 py-2 text-sm text-white [overflow-wrap:anywhere]">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="max-w-[92%] text-sm leading-relaxed text-[var(--ejo-text)]" data-testid="enyo-answer" aria-busy={m.pending || undefined}>
                {m.text ? <EnyoMarkdown text={m.text} /> : null}
                {m.status ? (
                  <p className="mt-1 flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]" role="status">
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ejo-primary)] motion-safe:animate-pulse" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ejo-primary)] motion-safe:animate-pulse [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ejo-primary)] motion-safe:animate-pulse [animation-delay:300ms]" />
                    </span>
                    {m.status}
                  </p>
                ) : null}
                {m.handover ? (
                  <div className="mt-2 flex gap-2.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/[0.07] p-3" data-testid="enyo-handover">
                    <span className="mt-0.5 shrink-0 text-[var(--ejo-success)]"><Glyph d={ICON.person} size={17} /></span>
                    <p className="min-w-0">
                      <span className="block font-semibold">Passed to our team{m.handover.ticketNumber ? <> · <span className="whitespace-nowrap">{m.handover.ticketNumber}</span></> : null}</span>
                      <span className="block text-[var(--ejo-text-muted)]">{m.handover.text}</span>
                      {variant === 'portal' ? <a href="/customer-portal/dashboard/support" className="mt-1 inline-block font-medium text-[var(--ejo-primary)] underline underline-offset-2">See my support requests</a> : null}
                    </p>
                  </div>
                ) : null}
                {m.notices?.map((n) => <p key={n} className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/35 bg-[var(--ejo-warning)]/[0.08] px-3 py-2 text-xs">{n}</p>)}
                {m.error ? (
                  <p className="mt-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]" data-testid="enyo-error" role="alert">
                    {m.error.message}{m.error.ref ? <span className="mt-1 block text-xs text-[var(--ejo-text-muted)]">Reference {m.error.ref}</span> : null}
                  </p>
                ) : null}
                {m.sources?.length && !m.pending ? (
                  <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-[var(--ejo-text-muted)]">
                    <span>From:</span>
                    {m.sources.map((s) => (s.href ? (
                      <a key={`${s.label}${s.href}`} href={s.href} {...(s.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})} className="max-w-full truncate rounded-full border border-[var(--ejo-border)] px-2 py-0.5 hover:border-[var(--ejo-primary)]/50 hover:text-[var(--ejo-primary)]">{s.label}</a>
                    ) : <span key={s.label} className="rounded-full border border-[var(--ejo-border)] px-2 py-0.5">{s.label}</span>))}
                  </p>
                ) : null}
              </div>
            )))}
          </div>

          <form onSubmit={onSubmit} className="shrink-0 border-t border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 pb-3 pt-2.5 sm:px-4">
            {voice.active ? (
              <VoiceBar
                listening={voice.listening}
                paused={voice.paused}
                processing={voice.processing}
                words={voice.interim}
                startedAt={voice.startedAt}
                busy={busy}
                onCancel={voice.cancel}
                onPause={voice.pause}
                onResume={voice.resume}
                onEdit={() => voice.finish('text')}
                onSend={() => voice.finish('send')}
              />
            ) : null}
            {voice.error ? (
              <p role="alert" className="mb-2 flex items-start gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
                <span className="flex-1">{voice.error}</span>
                <button type="button" onClick={voice.clearError} className="font-medium text-[var(--ejo-primary)]">OK</button>
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <label htmlFor="enyo-message" className="sr-only">Your message</label>
              <textarea
                ref={input}
                id="enyo-message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={MAX + 200}
                placeholder={voice.active ? 'Type more if you like…' : `Message ${name}…`}
                aria-describedby="enyo-small-print"
                aria-invalid={over || undefined}
                className="max-h-36 min-h-11 flex-1 resize-none rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-base text-[var(--ejo-text)] placeholder:text-[var(--ejo-text-muted)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/25 sm:text-sm"
              />
              {voice.supported && !voice.active ? (
                <button
                  type="button"
                  onClick={() => voice.start()}
                  disabled={busy}
                  aria-label="Record a voice note"
                  title="Speak — then send, pause, or edit the words first"
                  data-testid="enyo-mic"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50 hover:text-[var(--ejo-primary)] disabled:opacity-40"
                >
                  <Glyph d={ICON.mic} />
                </button>
              ) : null}
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)]">
                  <Glyph d={ICON.stop} />
                </button>
              ) : (
                <button type="submit" aria-label="Send" disabled={!draft.trim() || over} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)] text-white disabled:opacity-40">
                  <Glyph d={ICON.send} />
                </button>
              )}
            </div>
            {draft.length > MAX - 200 ? <p className={`mt-1 text-right text-xs ${over ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`} aria-live="polite">{draft.length.toLocaleString('en-NG')} / {MAX.toLocaleString('en-NG')}</p> : null}
            <p id="enyo-small-print" className="mt-1.5 text-[11px] leading-snug text-[var(--ejo-text-muted)]">
              {name} can make mistakes. For anything important, check the page or ask our team.{variant === 'public' && status.consentLine ? ` ${status.consentLine}` : ''}
            </p>
          </form>
        </div>
      ) : null}
    </>
  );
}
