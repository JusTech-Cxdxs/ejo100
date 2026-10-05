'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useChangePings } from '@/lib/hooks/use-change-pings';
import { getNotificationSummary, getNotificationPulse, markNotificationsRead, setNotificationsMuted, type NotificationSummary } from '@/lib/actions/notifications';

const PULSE_MS = 3000;
/** With instant push connected, the regular check is only a safety net. */
const PULSE_WHEN_PUSHED_MS = 30000;
/** On a push ping: refresh within ~1 s, at most once per 3 s (last ping always honoured). */
const PING_GAP_MS = 2000;
/** At most one full summary fetch (and page refresh) per 15 seconds. */
const MIN_LOAD_GAP_MS = 3000;
/** Open pages update themselves when anything changes — at most every 8 s. */
const PAGE_REFRESH_GAP_MS = 3000;
const RING_MS = 120000;
const EMPTY: NotificationSummary = { actions: [], unreadActivity: [], unreadBroadcasts: [], total: 0, signature: '', muted: false };

export type LiveMode = 'push' | 'polling' | 'offline';
/** Loading → Ready (with or without items) · Error (retrying) — never a false "caught up". */
export type LoadState = 'loading' | 'ready' | 'error';
type Ctx = { summary: NotificationSummary; loaded: boolean; state: LoadState; muted: boolean; toggleMute: () => void; markRead: (key: string) => Promise<void>; mode: LiveMode; lastSync: number };
const NotificationContext = createContext<Ctx>({ summary: EMPTY, loaded: false, state: 'loading', muted: false, toggleMute: () => undefined, markRead: async () => undefined, mode: 'polling', lastSync: 0 });
export const useNotifications = () => useContext(NotificationContext);

/**
 * Real notification sounds, made in the browser (no sound files to load):
 *  • message — a soft two-note "ding-dong" with a natural attack and fade;
 *  • ring    — a distinct three-note ring, played twice, for actions that
 *              need you (repeats every 2 minutes until done, unless muted).
 */
/** One loud master chain: a compressor makes it loud without distortion. */
let master: AudioNode | null = null;
function out(ctx: AudioContext): AudioNode {
  if (master) return master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.2;
  const gain = ctx.createGain();
  gain.gain.value = 1.6;
  comp.connect(gain).connect(ctx.destination);
  master = comp;
  return master;
}
function playNote(ctx: AudioContext, freq: number, at: number, length: number, volume: number) {
  // Layered tones (fundamental, octave and a bright square edge) — bell-like and clearly audible.
  for (const [mult, type, vol] of [[1, 'sine', 1], [2, 'triangle', 0.45], [1, 'square', 0.12]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume * vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    o.connect(g).connect(out(ctx));
    o.start(at);
    o.stop(at + length + 0.02);
  }
}
function chime(ctx: AudioContext | null, urgent: boolean) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  if (!urgent) {
    playNote(ctx, 1046.5, t, 0.3, 0.9); // C6
    playNote(ctx, 1318.5, t + 0.13, 0.3, 0.9); // E6
    playNote(ctx, 1568.0, t + 0.26, 0.6, 0.9); // G6
    return;
  }
  for (const rep of [0, 0.7, 1.4]) {
    playNote(ctx, 880.0, t + rep, 0.2, 1); // A5
    playNote(ctx, 1108.7, t + rep + 0.15, 0.2, 1); // C#6
    playNote(ctx, 1318.5, t + rep + 0.3, 0.35, 1); // E6
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
export function NotificationProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  // Last known notifications for THIS user in this tab — shown instantly on every
  // page / reload, then refreshed in the background (stale-while-revalidate).
  const cacheKey = userId ? `ejo.notifications.v1.${userId}` : null;
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const pulse = useRef<string | null>(null);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState(0);
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

  const [state, setState] = useState<LoadState>('loading');
  const apply = useCallback((next: NotificationSummary) => {
    const first = sig.current === null;
    // Only something that concerns THIS person chimes and refreshes the page.
    const mine = !first && next.signature !== sig.current;
    if (mine && next.total > 0 && !mutedRef.current) chime(audio.current, next.actions.length > 0);
    sig.current = next.signature;
    setSummary(next);
    if (first) setMuted(next.muted);
    setLoaded(true);
    setState('ready');
    if (cacheKey) { try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* storage full or blocked */ } }
    if (mine) refreshPageSoon();
  }, [refreshPageSoon, cacheKey]);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    const next = await getNotificationSummary().catch(() => null);
    if (!next) { if (sig.current === null) setState('error'); return; }
    apply(next);
  }, [apply]);

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState === 'hidden') return;
    busy.current = true;
    try {
      const p = await getNotificationPulse().catch(() => '');
      if (!p) { setOnline(false); return; }
      setOnline(true);
      setLastSync(Date.now());
      if (pulse.current === null) pulse.current = p;
      else if (p && p !== pulse.current && Date.now() - lastLoad.current >= MIN_LOAD_GAP_MS) {
        // (Within 15 seconds of the last fetch the change is left for the
        // next check, so a busy day never floods the server.)
        pulse.current = p;
        refreshPageSoon();
        await load();
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
      if (document.visibilityState !== 'hidden') { refreshPageSoon(); void load(); setLastSync(Date.now()); }
    }, wait);
  }, [load, refreshPageSoon]);
  const pushed = useChangePings(onPing);
  useEffect(() => {
    const on = () => { setOnline(true); void check(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  });
  const mode: LiveMode = !online ? 'offline' : pushed ? 'push' : 'polling';

  useEffect(() => () => { if (pingTimer.current) clearTimeout(pingTimer.current); }, []);

  // First load: last known state instantly, then fresh data; then realtime /
  // checks take over. Notifications never sit on the page request.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Instantly: the last known state for this user (no chime, no flicker).
      if (cacheKey) {
        try {
          const raw = sessionStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw) as NotificationSummary;
            sig.current = cached.signature;
            setSummary(cached);
            setMuted(cached.muted);
            setLoaded(true);
            setState('ready');
          }
        } catch { /* ignore a damaged cache */ }
      }
      // 2. Then fresh data (cheap when nothing changed — the server caches it).
      await load();
      if (cancelled) return;
      if (!cancelled) await check();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While in the error state, retry every few seconds until it loads.
  useEffect(() => {
    if (state !== 'error') return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [state, load]);

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

  // Count in the browser tab — "(3) Dashboard" — like WhatsApp.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, '');
      const n = summary.total;
      const want = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const t = setInterval(apply, 1000); // pages change their own title on navigation
    return () => clearInterval(t);
  }, [summary.total]);

  // Desktop alerts when the portal is in a background tab (permission asked once).
  const seenAlert = useRef<string | null>(null);
  useEffect(() => {
    const ask = () => { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined); };
    window.addEventListener('pointerdown', ask, { once: true });
    return () => window.removeEventListener('pointerdown', ask);
  }, []);
  useEffect(() => {
    const top = summary.actions[0] ?? summary.unreadBroadcasts[0] ?? summary.unreadActivity[0];
    if (!top || !loaded) return;
    const key = 'id' in top ? String(top.id) : '';
    if (seenAlert.current === null) { seenAlert.current = key; return; }
    if (key === seenAlert.current) return;
    seenAlert.current = key;
    if (document.visibilityState === 'visible' || mutedRef.current || !('Notification' in window) || Notification.permission !== 'granted') return;
    const title = 'title' in top ? String(top.title) : 'EJO 100';
    const url = 'url' in top ? String((top as { url: string }).url) : '/notifications?tab=broadcasts';
    try {
      const n = new Notification(title, { body: summary.total > 1 ? `${summary.total} things need your attention` : 'Needs your attention', tag: 'ejo100', icon: '/images/logo/logo.png' });
      n.onclick = () => { window.focus(); router.push(url); n.close(); };
    } catch {
      // some browsers only allow this from a service worker — the tab count still shows
    }
  }, [summary, loaded, router]);

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

  return <NotificationContext.Provider value={{ summary, loaded, state, muted, toggleMute, markRead, mode, lastSync }}>{children}</NotificationContext.Provider>;
}
