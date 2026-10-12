'use client';

/**
 * A short, gentle two-note chime for NEW notifications — generated with the
 * Web Audio API (no sound file to download). Browsers only allow sound after
 * the person has interacted with the page, so the audio context is created
 * on the first tap / key press and the chime is simply skipped until then.
 * The customer can switch it off in Profile & settings (stored on this
 * device only).
 */
const KEY = 'ejo-cp-sound';
let ctx: AudioContext | null = null;
let unlockedListener = false;

export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('ejo-cp-sound', { detail: on }));
}

function audioCtor(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call once on mount: prepares audio on the first real interaction. */
export function primeSound(): void {
  if (unlockedListener || typeof window === 'undefined') return;
  unlockedListener = true;
  const unlock = () => {
    const Ctor = audioCtor();
    if (!Ctor) return;
    try {
      ctx = ctx ?? new Ctor();
      if (ctx.state === 'suspended') void ctx.resume();
    } catch { ctx = null; }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/** Plays the chime if allowed (setting on, audio unlocked). Never throws. */
export function playChime(force = false): void {
  try {
    if (!force && !soundEnabled()) return;
    if (!ctx) {
      if (!force) return;
      const Ctor = audioCtor();
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    // Two soft sine notes (E5 → A5) with a quick fade — a calm "ding-dong".
    [[659.25, 0], [880, 0.14]].forEach(([freq, start]) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq!;
      g.gain.setValueAtTime(0.0001, now + start!);
      g.gain.exponentialRampToValueAtTime(1, now + start! + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start! + 0.55);
      osc.connect(g);
      g.connect(master);
      osc.start(now + start!);
      osc.stop(now + start! + 0.6);
    });
  } catch {
    /* sound is a nicety — never an error */
  }
}
