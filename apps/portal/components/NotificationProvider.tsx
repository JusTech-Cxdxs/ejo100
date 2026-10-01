'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useChangePings } from '@/lib/hooks/use-change-pings';
import { getNotificationSummary, getNotificationPulse, markNotificationsRead, setNotificationsMuted, type NotificationSummary } from '@/lib/actions/notifications';

const PULSE_MS = 5000;
/** With instant push connected, the regular check is only a safety net. */
const PULSE_WHEN_PUSHED_MS = 30000;
/** On a push ping: refresh within ~1 s, at most once per 3 s (last ping always honoured). */
const PING_GAP_MS = 2000;
/** At most one full summary fetch (and page refresh) per 15 seconds. */
const MIN_LOAD_GAP_MS = 8000;
/** Open pages update themselves when anything changes — at most every 8 s. */
const PAGE_REFRESH_GAP_MS = 8000;
const RING_MS = 120000;
const EMPTY: NotificationSummary = { actions: [], unreadActivity: [], unreadBroadcasts: [], total: 0, signature: '', muted: false };

type Ctx = { summary: NotificationSummary; loaded: boolean; muted: boolean; toggleMute: () => void; markRead: (key: string) => Promise<void> };
const NotificationContext = createContext<Ctx>({ summary: EMPTY, loaded: false, muted: false, toggleMute: () => undefined, markRead: async () => undefined });
export const useNotifications = () => useContext(NotificationContext);

/**
 * Real notification sounds, made in the browser (no sound files to load):
 *  • message — a soft two-note "ding-dong" with a natural attack and fade;
 *  • ring    — a distinct three-note ring, played twice, for actions that
 *              need you (repeats every 2 minutes until done, unless muted).
 */
function playNote(ctx: AudioContext, freq: number, at: number, length: number, volume: number) {
  // Two layered oscillators (fundamental + soft octave) give a bell-like tone.
  for (const [mult, type, vol] of [[1, 'sine', 1], [2, 'triangle', 0.25]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume * vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + length + 0.02);
  }
}
function chime(ctx: AudioContext | null, urgent: boolean) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  if (!urgent) {
    playNote(ctx, 1046.5, t, 0.35, 0.22); // C6
    playNote(ctx, 784.0, t + 0.16, 0.55, 0.2); // G5
    return;
  }
  for (const rep of [0, 0.75]) {
    playNote(ctx, 880.0, t + rep, 0.22, 0.25); // A5
    playNote(ctx, 1108.7, t + rep + 0.16, 0.22, 0.25); // C#6
    playNote(ctx, 1318.5, t + rep + 0.32, 0.4, 0.25); // E6
  }
}

/**
 * One shared live source for the bell, the marquee and every page:
 *  • the page renders first — notifications load just after, never blocking;
 *  • every 5 seconds (visible tab only) and on returning to the tab it asks
 *    the tiny "has anything changed?" question;
 *  • only when something changed does it fetch the full summary, chime and
 *    refresh the page's data — so dashboards and lists stay current without
 *    reloading, at almost no cost when nothing is happening.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const pulse = useRef<string | null>(null);
  const sig = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const busy = useRef(false);
  const lastLoad = useRef(0);
  const refreshWaiting = useRef(false);

  /** Typing in a field? Then a page refresh waits until the field is left. */
  const typing = () => {
    const el = document.activeElement as HTMLElement | null;
    return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
  };
  const refreshPage = useCallback(() => {
    if (typing()) { refreshWaiting.current = true; return; }
    refreshWaiting.current = false;
    router.refresh();
  }, [router]);
  // Live pages: whenever anything changes, the page you are looking at updates
  // itself (at most every 8 s; the last change is always applied; never while
  // you are typing — refreshPage waits for you to leave the field).
  const lastPageRefresh = useRef(0);
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPageSoon = useCallback(() => {
    if (pageTimer.current) return;
    const wait = Math.max(0, PAGE_REFRESH_GAP_MS - (Date.now() - lastPageRefresh.current));
    pageTimer.current = setTimeout(() => {
      pageTimer.current = null;
      if (document.visibilityState === 'hidden') return;
      lastPageRefresh.current = Date.now();
      refreshPage();
    }, wait);
  }, [refreshPage]);
  useEffect(() => () => { if (pageTimer.current) clearTimeout(pageTimer.current); }, []);

  useEffect(() => {
    const onLeaveField = () => { if (refreshWaiting.current) setTimeout(() => { if (!typing()) refreshPage(); }, 300); };
    document.addEventListener('focusout', onLeaveField);
    return () => document.removeEventListener('focusout', onLeaveField);
  }, [refreshPage]);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    const next = await getNotificationSummary().catch(() => null);
    if (!next) return;
    const first = sig.current === null;
    // Only something that concerns THIS person chimes and refreshes the page.
    const mine = !first && next.signature !== sig.current;
    if (mine && next.total > 0 && !mutedRef.current) chime(audio.current, next.actions.length > 0);
    sig.current = next.signature;
    setSummary(next);
    if (first) setMuted(next.muted);
    setLoaded(true);
    if (mine) refreshPageSoon();
  }, [refreshPageSoon]);

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState === 'hidden') return;
    busy.current = true;
    try {
      const p = await getNotificationPulse();
      if (pulse.current === null) pulse.current = p;
      else if (p && p !== pulse.current && Date.now() - lastLoad.current >= MIN_LOAD_GAP_MS) {
        // (Within 15 seconds of the last fetch the change is left for the
        // next check, so a busy day never floods the server.)
        pulse.current = p;
        await load();
        refreshPageSoon();
      }
    } finally {
      busy.current = false;
    }
  }, [load, refreshPageSoon]);

  // Instant push: a ping means "something changed" — refresh now (coalesced).
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPing = useCallback(() => {
    if (pingTimer.current) return;
    const wait = Math.max(300, PING_GAP_MS - (Date.now() - lastLoad.current));
    pingTimer.current = setTimeout(() => {
      pingTimer.current = null;
      if (document.visibilityState !== 'hidden') { void load(); refreshPageSoon(); }
    }, wait);
  }, [load, refreshPageSoon]);
  const pushed = useChangePings(onPing);

  useEffect(() => () => { if (pingTimer.current) clearTimeout(pingTimer.current); }, []);

  useEffect(() => {
    void load().then(() => check());
  }, [load, check]);

  useEffect(() => {
    const t = setInterval(() => void check(), pushed ? PULSE_WHEN_PUSHED_MS : PULSE_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [check, pushed]);

  // Browsers allow sound only after the first tap / click.
  useEffect(() => {
    const unlock = () => {
      if (!audio.current) {
        const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (C) audio.current = new C();
      }
      void audio.current?.resume();
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Actions waiting → ring again every 2 minutes until done (unless muted).
  useEffect(() => {
    if (summary.actions.length === 0 || muted) return;
    const t = setInterval(() => chime(audio.current, true), RING_MS);
    return () => clearInterval(t);
  }, [summary.actions.length, muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      void setNotificationsMuted(!m).catch(() => undefined);
      return !m;
    });
  }, []);

  const markRead = useCallback(async (key: string) => {
    setSummary((s) => {
      const unreadActivity = s.unreadActivity.filter((a) => a.key !== key);
      const unreadBroadcasts = s.unreadBroadcasts.filter((b) => b.key !== key);
      return { ...s, unreadActivity, unreadBroadcasts, total: s.actions.length + unreadActivity.length + unreadBroadcasts.length };
    });
    await markNotificationsRead([key]).catch(() => undefined);
  }, []);

  return <NotificationContext.Provider value={{ summary, loaded, muted, toggleMute, markRead }}>{children}</NotificationContext.Provider>;
}
