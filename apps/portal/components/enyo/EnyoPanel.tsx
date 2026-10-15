'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { EnyoStatus } from '@/lib/enyo/client-contract';
import { firstName, greetingText, lagosDay, lagosHour, starterPrompts } from '@/lib/enyo/greeting';
import { plainText } from '@/lib/enyo/markdown';
import { isApproval } from '@/lib/approvals';
import { useNotifications } from '@/components/NotificationProvider';
import { EnyoAvatar, type EnyoMood } from './EnyoAvatar';
import { AssistantTurn, UserTurn, type Turn } from './EnyoMessages';
import { EnyoHistory } from './EnyoHistory';
import { EIcon } from './icons';
import { getEnyoStatus, loadConversation, streamChat } from './api';
import { DEFAULT_PREFS, readPrefs, writePrefs, type EnyoPrefs } from './prefs';
import { createMouthDriver, useSpeechInput, useSpeechOutput, type MouthDriver } from './voice';
import { useChatViewport } from '@ejo/enyo/src/ui/useChatViewport';

/**
 * Enyo in the staff portal: a floating launcher (bottom-right) and a chat
 * sheet — a right-hand panel on desktops, full screen on phones. Mounted once
 * in the signed-in layout, so a chat carries on across page changes.
 * Shown only when the status route says Enyo is ready; administrators see a
 * quiet "not switched on yet" panel instead, with a link to the settings.
 *
 * Keyboard: Ctrl/Cmd+J opens and closes, Esc closes, Tab stays inside.
 */
const MAX_LEN = 4000;

const iconBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--ejo-text)_7%,transparent)] hover:text-[var(--ejo-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ejo-primary)]';

/** Animation and layout rules the utilities cannot express (React hoists this tag once). */
const PANEL_CSS = `
.enyo-sheet{animation:enyo-sheet-in .28s cubic-bezier(.2,.8,.2,1)}
.enyo-scrim{animation:ejo-fade .2s ease}
.enyo-bubble{animation:enyo-bubble-in .45s cubic-bezier(.2,.9,.3,1.2)}
.enyo-launcher{transition:transform .2s ease, box-shadow .2s ease}
.enyo-launcher:hover{transform:translateY(-2px)}
.enyo-typing{display:inline-flex;gap:3px}
.enyo-typing i{width:5px;height:5px;border-radius:50%;background:var(--ejo-primary);animation:enyo-type 1.1s ease-in-out infinite}
.enyo-typing i:nth-child(2){animation-delay:.15s}.enyo-typing i:nth-child(3){animation-delay:.3s}
.enyo-mic-on{box-shadow:0 0 0 0 color-mix(in srgb,var(--ejo-error) 45%,transparent);animation:enyo-mic 1.4s ease-out infinite}
@keyframes enyo-sheet-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@media (max-width:639px){@keyframes enyo-sheet-in{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}}
@keyframes enyo-bubble-in{from{transform:translateY(8px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes enyo-type{0%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@keyframes enyo-mic{to{box-shadow:0 0 0 10px transparent}}
@media (prefers-reduced-motion: reduce){.enyo-sheet,.enyo-scrim,.enyo-bubble,.enyo-typing i,.enyo-mic-on{animation:none}.enyo-launcher{transition:none}.enyo-launcher:hover{transform:none}}
`;

/** Keeps the page's last line clear of the launcher. */
const LAUNCHER_ROOM = '@media screen{#main{padding-bottom:calc(5.25rem + env(safe-area-inset-bottom))}}';

/** The avatar, with the mouth following the voice or the stream while speaking. */
function LiveAvatar({ mood, size, mouth, hair, glasses }: { mood: EnyoMood; size: number; mouth: MouthDriver; hair: EnyoPrefs['hair']; glasses: boolean }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (mood !== 'speaking') { setLevel(0); return; }
    const t = window.setInterval(() => setLevel(mouth.level()), 50);
    return () => window.clearInterval(t);
  }, [mood, mouth]);
  return <EnyoAvatar mood={mood} size={size} level={level} hair={hair} glasses={glasses} />;
}

function userKey(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

let turnSeq = 0;
const newKey = () => `t${Date.now().toString(36)}${(turnSeq += 1)}`;

export function EnyoPanel({ userId, userName, roleName, canManage }: { userId: string; userName: string; roleName: string; canManage: boolean }) {
  const pathname = usePathname();
  const { summary, loaded } = useNotifications();
  const approvals = loaded ? summary.actions.filter(isApproval).length : null;

  const [status, setStatus] = useState<EnyoStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [menu, setMenu] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [prefs, setPrefs] = useState<EnyoPrefs>(DEFAULT_PREFS);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [wave, setWave] = useState(false);
  const [happy, setHappy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const openedOnce = useRef(false);
  const mouth = useMemo(() => createMouthDriver(), []);
  const [voicePref, setVoicePref] = useState('');
  const voiceOut = useSpeechOutput(mouth, voicePref);
  const cancelSpeech = voiceOut.cancel;
  const speakAloud = voiceOut.speak;
  const prefsRef = useRef<EnyoPrefs>(DEFAULT_PREFS);
  const refocusLauncher = useRef(false);
  const name = status?.displayName || 'Enyo';
  const ready = status?.ready === true;
  const busy = turns.some((t) => t.state === 'waiting' || t.state === 'streaming');
  // Phones: the chat fits the visible screen above the keyboard, header always in view.
  const viewportBox = useChatViewport(open);

  // ------------------------------------------------------------ status, prefs
  useEffect(() => {
    let live = true;
    void getEnyoStatus().then((s) => { if (live) setStatus(s); });
    const initial = readPrefs();
    prefsRef.current = initial;
    setPrefs(initial);
    setVoicePref(initial.voice);
    return () => { live = false; };
  }, []);

  const updatePrefs = useCallback((patch: Partial<EnyoPrefs>) => {
    setPrefs((p) => { const next = { ...p, ...patch }; writePrefs(next); prefsRef.current = next; return next; });
    if (patch.voice !== undefined) setVoicePref(patch.voice);
  }, []);

  // ------------------------------------------------------------ greeting (once a day)
  useEffect(() => {
    if (!ready || !prefs.greeting || open || greeting) return;
    // Automated browsers (tests) are not greeted unless they ask to be.
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    const key = userKey(userId);
    const today = lagosDay(new Date());
    const stored = readPrefs();
    if (stored.greeted[key] === today) return;
    // Wait briefly for the approvals count; greet without it if it is slow.
    const wait = window.setTimeout(() => {
      const text = greetingText({ name: firstName(userName), hour: lagosHour(new Date()), approvals });
      setGreeting(text);
      setWave(true);
      updatePrefs({ greeted: { ...stored.greeted, [key]: today } });
    }, loaded ? 900 : 3500);
    return () => window.clearTimeout(wait);
  }, [ready, prefs.greeting, open, greeting, userId, userName, approvals, loaded, updatePrefs]);

  useEffect(() => {
    if (!wave) return;
    const t = window.setTimeout(() => setWave(false), 3200);
    return () => window.clearTimeout(t);
  }, [wave]);
  useEffect(() => {
    if (!greeting) return;
    const t = window.setTimeout(() => setGreeting(null), 20_000);
    return () => window.clearTimeout(t);
  }, [greeting]);
  useEffect(() => {
    if (!happy) return;
    const t = window.setTimeout(() => setHappy(false), 2200);
    return () => window.clearTimeout(t);
  }, [happy]);

  // ------------------------------------------------------------ open / close
  const openPanel = useCallback(() => {
    setGreeting(null);
    setOpen(true);
    if (!openedOnce.current) { openedOnce.current = true; setWave(true); }
  }, []);
  const closePanel = useCallback(() => {
    refocusLauncher.current = true;
    setOpen(false);
    setMenu(false);
    cancelSpeech();
  }, [cancelSpeech]);

  const visible = ready || (status !== null && canManage);

  // Ctrl/Cmd+J toggles from anywhere on the page.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (open) closePanel(); else openPanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, open, openPanel, closePanel]);

  // Inside the sheet: Esc closes (the menu first), Tab stays inside; focus returns to the launcher.
  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []).filter((n) => n.offsetParent !== null || n === document.activeElement);
    window.setTimeout(() => (inputRef.current ?? focusables()[0])?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menuRef.current) { setMenu(false); return; }
        closePanel();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (!el?.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closePanel]);

  // Closed with the keyboard or the close button: focus goes back to the launcher.
  useEffect(() => {
    if (open || !refocusLauncher.current) return;
    refocusLauncher.current = false;
    launcherRef.current?.focus();
  }, [open]);

  // The menu closes on an outside click.
  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-enyo-menu-button]')) setMenu(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [menu]);

  // Keep the newest line in view while an answer streams (unless the person scrolled up).
  const stick = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // A link inside an answer: on phones the sheet covers the page, so it closes.
  const onNavigate = useCallback(() => {
    if (window.matchMedia('(max-width: 639px)').matches) setOpen(false);
  }, []);

  // ------------------------------------------------------------ asking
  const patchTurn = useCallback((key: string, fn: (t: Turn) => Turn) => {
    setTurns((list) => list.map((t) => (t.key === key ? fn(t) : t)));
  }, []);

  const ask = useCallback(async (raw: string) => {
    const message = raw.replace(/\s+$/g, '').trim().slice(0, MAX_LEN);
    if (!message || busy || !ready) return;
    cancelSpeech();
    setView('chat');
    setInput('');
    stick.current = true;
    const key = newKey();
    setTurns((list) => [
      ...list,
      { key: newKey(), role: 'user', text: message, state: 'done', sources: [], drafts: [], notices: [], refused: false },
      { key, role: 'assistant', text: '', state: 'waiting', sources: [], drafts: [], notices: [], refused: false },
    ]);
    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;
    let answer = '';
    try {
      for await (const ev of streamChat({ conversationId: conversationId ?? undefined, message, page: pathname ?? undefined }, controller.signal)) {
        switch (ev.type) {
          case 'conversation': setConversationId(ev.id); break;
          case 'status': patchTurn(key, (t) => ({ ...t, status: ev.text.slice(0, 120) })); break;
          case 'text':
            answer += ev.text;
            mouth.kick(0.7);
            patchTurn(key, (t) => ({ ...t, text: t.text + ev.text, state: 'streaming', status: undefined }));
            break;
          case 'tool': if (ev.refused) patchTurn(key, (t) => ({ ...t, refused: true })); break;
          case 'sources':
            patchTurn(key, (t) => {
              const seen = new Set(t.sources.map((s) => `${s.label}|${s.href ?? ''}`));
              return { ...t, sources: [...t.sources, ...ev.sources.filter((s) => s && typeof s.label === 'string' && !seen.has(`${s.label}|${s.href ?? ''}`))] };
            });
            break;
          case 'draft': patchTurn(key, (t) => ({ ...t, drafts: [...t.drafts, ev.draft] })); break;
          case 'notice': patchTurn(key, (t) => ({ ...t, notices: [...t.notices, ev.text] })); break;
          case 'handover': patchTurn(key, (t) => ({ ...t, notices: [...t.notices, ev.text] })); break;
          case 'done':
            finished = true;
            patchTurn(key, (t) => ({ ...t, state: 'done', status: undefined, messageId: ev.messageId }));
            break;
          case 'error':
            finished = true;
            patchTurn(key, (t) => ({ ...t, state: 'error', status: undefined, error: { message: ev.message, ref: ev.ref } }));
            break;
        }
      }
    } finally {
      abortRef.current = null;
      if (controller.signal.aborted) patchTurn(key, (t) => ({ ...t, state: 'stopped', status: undefined }));
      else if (!finished) patchTurn(key, (t) => ({ ...t, state: t.text ? 'done' : 'error', status: undefined, error: t.text ? undefined : { message: 'No answer came back. Please ask again.' } }));
    }
    if (finished && !controller.signal.aborted && answer && prefsRef.current.speak) speakAloud(plainText(answer));
  }, [busy, ready, conversationId, pathname, patchTurn, mouth, cancelSpeech, speakAloud]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const voiceIn = useSpeechInput((heard) => { void ask(heard); });

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    cancelSpeech();
    setTurns([]);
    setConversationId(null);
    setView('chat');
    setMenu(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [cancelSpeech]);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    // Straight to the chat view with a loading state: never a frozen list.
    setView('chat');
    setTurns([]);
    setLoadingChat(true);
    const c = await loadConversation(id);
    setLoadingChat(false);
    if (!c) { setView('chat'); setTurns([{ key: newKey(), role: 'assistant', text: '', state: 'error', sources: [], drafts: [], notices: [], refused: false, error: { message: 'That chat could not be opened. It may have been deleted.' } }]); return; }
    setConversationId(c.id);
    setTurns(c.messages.map((m) => {
      const role = String(m.role).toLowerCase() === 'user' ? 'user' as const : 'assistant' as const;
      return { key: newKey(), role, text: m.content, state: 'done' as const, sources: m.sources ?? [], drafts: m.drafts ?? [], notices: [], refused: false, messageId: role === 'assistant' ? m.id : undefined, rating: m.rating === 1 ? 1 as const : m.rating === -1 ? -1 as const : undefined };
    }));
    setView('chat');
    stick.current = true;
  }, []);

  // ------------------------------------------------------------ mood
  const streaming = turns.some((t) => t.state === 'streaming');
  const waiting = turns.some((t) => t.state === 'waiting');
  const mood: EnyoMood = voiceIn.listening ? 'listening'
    : voiceOut.speaking ? 'speaking'
      : waiting ? 'thinking'
        : streaming ? 'speaking'
          : happy ? 'happy'
            : wave ? 'wave'
              : 'idle';

  const headerLine = voiceIn.processing ? 'Getting your words…' : voiceIn.listening ? 'Listening…'
    : voiceOut.speaking ? 'Speaking'
      : waiting ? (turns.find((t) => t.state === 'waiting')?.status || 'Thinking…')
        : streaming ? 'Answering…'
          : ready ? 'Here to help' : 'Not switched on yet';

  if (!visible) return null;

  const onComposerKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(input);
    }
  };

  const first = firstName(userName);
  const starters = starterPrompts(roleName, pathname ?? '');

  return (
    <>
      <style href="enyo-panel" precedence="default">{PANEL_CSS}</style>
      <style href="enyo-launcher-room" precedence="default">{LAUNCHER_ROOM}</style>

      {/* The launcher, and the once-a-day greeting above it. */}
      {!open ? (
        <div className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] print:hidden right-[calc(1rem+env(safe-area-inset-right))] z-[45] flex flex-col items-end gap-3">
          {greeting ? (
            <div role="status" className="enyo-bubble pointer-events-auto relative w-[min(19rem,calc(100vw-2rem))] rounded-[var(--ejo-radius-lg)] rounded-br-md border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-1 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)]">
              <button type="button" onClick={openPanel} className="block w-full rounded-[calc(var(--ejo-radius-lg)-4px)] py-2.5 pl-3 pr-10 text-left text-sm leading-snug text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
                {greeting}
                <span className="mt-1 block text-xs font-medium text-[var(--ejo-primary)]">Ask {name}</span>
              </button>
              <button type="button" onClick={() => setGreeting(null)} aria-label="Dismiss greeting" className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]">
                <EIcon name="close" size={15} />
              </button>
            </div>
          ) : null}
          <button
            ref={launcherRef}
            type="button"
            onClick={openPanel}
            aria-label={`Open ${name}`}
            aria-keyshortcuts="Control+J Meta+J"
            aria-haspopup="dialog"
            title={`${name} (Ctrl+J)`}
            data-enyo-launcher=""
            className={`enyo-launcher pointer-events-auto relative inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--ejo-bg)] bg-[var(--ejo-bg)] shadow-[0_10px_28px_-10px_rgba(22,163,74,0.55),0_2px_6px_rgba(15,23,42,0.18)] ring-2 ring-[color-mix(in_srgb,var(--ejo-primary)_55%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ejo-primary)] ${ready ? '' : 'opacity-70 grayscale-[0.6]'}`}
          >
            <EnyoAvatar mood={wave ? 'wave' : 'idle'} size={50} hair={prefs.hair} glasses={prefs.glasses} />
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[55] print:hidden" style={viewportBox} data-testid="enyo-sheet-box">
          <div className="enyo-scrim absolute inset-0 bg-slate-950/40 sm:bg-slate-950/15" onClick={closePanel} aria-hidden="true" />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={name}
            className="enyo-sheet absolute inset-0 flex flex-col bg-[var(--ejo-bg)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l sm:border-[var(--ejo-border)] sm:shadow-[-24px_0_60px_-30px_rgba(15,23,42,0.45)]"
          >
            {/* Header */}
            <div className="relative flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--ejo-border)] bg-[color-mix(in_srgb,var(--ejo-bg)_92%,var(--ejo-primary))] pl-3 pr-1.5">
              {view === 'history' ? (
                <button type="button" className={iconBtn} aria-label="Back to the chat" onClick={() => setView('chat')}><EIcon name="back" size={20} /></button>
              ) : (
                <LiveAvatar mood={mood} size={42} mouth={mouth} hair={prefs.hair} glasses={prefs.glasses} />
              )}
              <div className="min-w-0 flex-1">
                <h2 id="enyo-title" className="truncate text-[15px] font-semibold leading-tight text-[var(--ejo-text)]">{view === 'history' ? 'Your chats' : name}</h2>
                {view === 'chat' ? <p className="truncate text-xs text-[var(--ejo-text-muted)]" aria-hidden="true">{headerLine}</p> : null}
              </div>
              {ready && view === 'chat' && voiceOut.supported ? (
                <button
                  type="button"
                  className={`${iconBtn} ${prefs.speak ? 'text-[var(--ejo-primary)]' : ''}`}
                  aria-pressed={prefs.speak}
                  aria-label={prefs.speak ? `${name} reads answers aloud (on)` : `Read answers aloud (off)`}
                  title={prefs.speak ? 'Reading answers aloud — press to turn off' : 'Read answers aloud'}
                  onClick={() => { const on = !prefs.speak; updatePrefs({ speak: on }); if (!on) cancelSpeech(); }}
                >
                  <EIcon name={prefs.speak ? 'speaker' : 'speaker-off'} size={19} />
                </button>
              ) : null}
              {ready && view === 'chat' ? (
                <>
                  <button type="button" className={iconBtn} aria-label="Past chats" onClick={() => { setMenu(false); setView('history'); }}><EIcon name="history" size={19} /></button>
                  <button type="button" className={iconBtn} aria-label="New chat" onClick={newChat}><EIcon name="plus" size={20} /></button>
                </>
              ) : null}
              <button type="button" data-enyo-menu-button="" className={iconBtn} aria-label={`${name} options`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><EIcon name="more" size={20} /></button>
              <button type="button" className={iconBtn} aria-label={`Close ${name}`} onClick={closePanel}><EIcon name="close" size={19} /></button>

              {menu ? (
                <div ref={menuRef} role="menu" aria-label={`${name} options`} className="ejo-pop absolute right-2 top-[calc(100%+6px)] z-10 w-[min(17rem,calc(100vw-1rem))] overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-1.5 shadow-xl">
                  {voiceOut.supported && ready ? (
                    <MenuToggle label="Speak answers aloud" on={prefs.speak} onChange={(v) => { updatePrefs({ speak: v }); if (!v) cancelSpeech(); }} />
                  ) : null}
                  {voiceOut.supported && ready && voiceOut.voices.length ? (
                    <div className="px-4 py-2" role="none">
                      <label htmlFor="enyo-voice" className="text-xs font-medium text-[var(--ejo-text-muted)]">Voice</label>
                      <div className="mt-1 flex gap-2">
                        <select id="enyo-voice" value={prefs.voice} onChange={(e) => updatePrefs({ voice: e.target.value })} className="min-h-11 min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-2 text-sm text-[var(--ejo-text)]">
                          <option value="">Gentle (chosen for you)</option>
                          {voiceOut.voices.slice(0, 15).map((v) => <option key={v.name} value={v.name}>{v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*-\s*English.*$/, '')} ({v.lang})</option>)}
                        </select>
                        <button type="button" onClick={() => speakAloud(`Hello${first ? `, ${first}` : ''}. I'm ${name}. This is how I sound.`)} className="min-h-11 shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]">Try</button>
                      </div>
                    </div>
                  ) : null}
                  <MenuToggle label="Daily greeting" on={prefs.greeting} onChange={(v) => updatePrefs({ greeting: v })} />
                  <MenuToggle label="Curly hair" on={prefs.hair === 'curly'} onChange={(v) => updatePrefs({ hair: v ? 'curly' : 'straight' })} />
                  <MenuToggle label="Glasses" on={prefs.glasses} onChange={(v) => updatePrefs({ glasses: v })} />
                  <div className="my-1.5 border-t border-[var(--ejo-border)]" role="none" />
                  <Link role="menuitem" href="/profile/enyo" onClick={() => { setMenu(false); onNavigate(); }} className="flex min-h-11 items-center gap-3 px-4 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"><EIcon name="brain" size={17} className="text-[var(--ejo-text-muted)]" />What {name} remembers</Link>
                  {canManage ? (
                    <Link role="menuitem" href="/settings/enyo" onClick={() => { setMenu(false); onNavigate(); }} className="flex min-h-11 items-center gap-3 px-4 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"><EIcon name="settings" size={17} className="text-[var(--ejo-text-muted)]" />{name} settings</Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Body */}
            <div
              ref={scrollRef}
              onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
              className="ejo-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              {!ready ? (
                <NotReady name={name} reason={status?.reason} canManage={canManage} />
              ) : view === 'history' ? (
                <EnyoHistory currentId={conversationId} onOpen={(id) => void openConversation(id)} onDeleted={(id) => { if (id === conversationId) newChat(); }} />
              ) : loadingChat ? (
                <div role="status" aria-live="polite" className="space-y-5 px-4 py-5">
                  <p className="flex items-center gap-2 text-sm text-[var(--ejo-text-muted)]"><span className="enyo-typing" aria-hidden="true"><i /><i /><i /></span>Opening the chat…</p>
                  {[70, 88, 54].map((w, k) => (
                    <div key={k} className={`flex ${k % 2 ? '' : 'justify-end'}`} aria-hidden="true">
                      <div className="h-10 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--ejo-text)_7%,transparent)] motion-reduce:animate-none" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              ) : turns.length === 0 ? (
                <div className="flex min-h-full flex-col px-5 pb-5 pt-8">
                  <div className="flex flex-col items-center text-center">
                    <LiveAvatar mood={mood === 'idle' ? 'idle' : mood} size={104} mouth={mouth} hair={prefs.hair} glasses={prefs.glasses} />
                    <p className="mt-4 text-lg font-semibold text-[var(--ejo-text)]">{first ? `Hello, ${first}. How can I help?` : 'Hello. How can I help?'}</p>
                    <p className="mt-1.5 max-w-[30ch] text-sm text-[var(--ejo-text-muted)]">I can look things up and explain how the portal works. I only see what your role can see.</p>
                  </div>
                  <div className="mt-auto pt-8">
                    <p id="enyo-starters" className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">Try asking</p>
                    <ul aria-labelledby="enyo-starters" className="grid gap-2">
                      {starters.map((s) => (
                        <li key={s}>
                          <button type="button" onClick={() => void ask(s)} className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3.5 py-2 text-left text-sm text-[var(--ejo-text)] transition-colors hover:border-[color-mix(in_srgb,var(--ejo-primary)_50%,var(--ejo-border))]">
                            {s}<EIcon name="arrow" size={15} className="shrink-0 text-[var(--ejo-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ejo-primary)]" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <ol aria-label="Conversation" className="space-y-5 px-4 py-5">
                  {turns.map((t, i) => (
                    <li key={t.key}>
                      {t.role === 'user' ? <UserTurn turn={t} /> : (
                        <AssistantTurn
                          turn={t}
                          last={i === turns.length - 1}
                          onNavigate={onNavigate}
                          onRated={(r) => { patchTurn(t.key, (x) => ({ ...x, rating: r })); if (r === 1) setHappy(true); }}
                          onListen={voiceOut.supported ? () => (voiceOut.speaking ? cancelSpeech() : speakAloud(plainText(t.text))) : undefined}
                          speaking={voiceOut.speaking}
                        />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Composer */}
            {ready && view === 'chat' ? (
              <div className="shrink-0 border-t border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 pb-3 pt-2.5">
                {voiceIn.processing ? (
                  <p role="status" className="mb-2 flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                    <span className="enyo-typing" aria-hidden="true"><i /><i /><i /></span>Getting your words…
                  </p>
                ) : voiceIn.listening ? (
                  <p role="status" className="mb-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                    <span className="font-medium text-[var(--ejo-error)]">Listening</span>{voiceIn.interim ? <span className="text-[var(--ejo-text-muted)]"> · {voiceIn.interim}</span> : <span className="text-[var(--ejo-text-muted)]"> · speak now, then press the microphone again to send</span>}
                  </p>
                ) : null}
                {voiceIn.error ? (
                  <p role="alert" className="mb-2 flex items-start gap-2 rounded-[var(--ejo-radius-md)] bg-[color-mix(in_srgb,var(--ejo-warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--ejo-text)]">
                    <span className="flex-1">{voiceIn.error}</span>
                    <button type="button" onClick={voiceIn.clearError} className="font-medium text-[var(--ejo-primary)]">OK</button>
                  </p>
                ) : null}
                <form
                  onSubmit={(e) => { e.preventDefault(); void ask(input); }}
                  className="flex items-end gap-1.5 rounded-[22px] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 pl-3.5 focus-within:border-[color-mix(in_srgb,var(--ejo-primary)_60%,var(--ejo-border))]"
                >
                  <label htmlFor="enyo-input" className="sr-only">Ask {name}</label>
                  <textarea
                    id="enyo-input"
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, MAX_LEN))}
                    onKeyDown={onComposerKey}
                    rows={1}
                    maxLength={MAX_LEN}
                    placeholder={voiceIn.listening ? '' : `Ask ${name}…`}
                    className="max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 text-[var(--ejo-text)] outline-none [field-sizing:content] placeholder:text-[var(--ejo-text-muted)] sm:text-sm"
                  />
                  {voiceIn.supported ? (
                    <button
                      type="button"
                      onClick={() => (voiceIn.listening ? voiceIn.stop() : (cancelSpeech(), voiceIn.start()))}
                      disabled={busy}
                      aria-pressed={voiceIn.listening}
                      aria-label={voiceIn.listening ? 'Stop and send' : 'Speak your question'}
                      className={`${iconBtn} ${voiceIn.listening ? 'enyo-mic-on bg-[var(--ejo-error)] text-white hover:bg-[var(--ejo-error)] hover:text-white' : ''} disabled:opacity-40`}
                    >
                      <EIcon name="mic" size={19} />
                    </button>
                  ) : null}
                  {busy ? (
                    <button type="button" onClick={stop} aria-label="Stop" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-text)] text-[var(--ejo-bg)] hover:opacity-90">
                      <EIcon name="stop" size={17} />
                    </button>
                  ) : (
                    <button type="submit" aria-label="Send" disabled={!input.trim()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)] text-white transition-opacity hover:brightness-110 disabled:opacity-35">
                      <EIcon name="send" size={19} strokeWidth={2.1} />
                    </button>
                  )}
                </form>
                <p className="mt-1.5 px-2 text-[11px] text-[var(--ejo-text-muted)]">
                  {input.length > MAX_LEN - 500 ? `${MAX_LEN - input.length} characters left. ` : ''}Check important figures before you act on them.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function MenuToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">
      {label}
      <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--ejo-primary)]' : 'bg-[color-mix(in_srgb,var(--ejo-text-muted)_40%,transparent)]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function NotReady({ name, reason, canManage }: { name: string; reason?: string; canManage: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <EnyoAvatar mood="idle" size={96} />
      <p className="mt-4 text-base font-semibold text-[var(--ejo-text)]">{name} isn&apos;t switched on yet</p>
      <p className="mt-1.5 max-w-[34ch] text-sm text-[var(--ejo-text-muted)]">
        {reason === 'not_configured'
          ? 'No language model is set up on the server yet. Your IT team adds it in the hosting settings (the ENYO_LLM values).'
          : reason === 'switched_off'
            ? `${name} has been switched off for your organisation. You can switch it on in the settings.`
            : `${name} could not be reached just now. Please try again later.`}
      </p>
      {canManage ? (
        <Link href="/settings/enyo" className="mt-5 inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">
          Open {name} settings
        </Link>
      ) : null}
    </div>
  );
}
