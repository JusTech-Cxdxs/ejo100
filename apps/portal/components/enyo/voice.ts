'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice for the Enyo panel, using only what the browser has built in:
 *  - speech to text (Web Speech API: SpeechRecognition / webkitSpeechRecognition),
 *    push-to-talk, Nigerian English first, then British English;
 *  - reading answers aloud (speechSynthesis) with a natural female English voice
 *    when the device has one.
 * Nothing here loads anything from another site. When the browser has no
 * speech support, `supported` is false and the panel hides the buttons.
 */

// ------------------------------------------------------------ mouth movement

/** Drives the avatar's mouth: every word spoken (or chunk streamed) gives it a little push. */
export type MouthDriver = { kick: (strength?: number) => void; level: () => number };

export function createMouthDriver(): MouthDriver {
  let energy = 0;
  let at = 0;
  return {
    kick(strength = 0.8) {
      const now = performance.now();
      energy = Math.min(1, Math.max(energy * Math.exp(-(now - at) / 260), strength));
      at = now;
    },
    level() {
      const now = performance.now();
      const e = energy * Math.exp(-(now - at) / 260);
      if (e < 0.02) return 0;
      // Syllable-like flutter on top of the decaying push.
      const flutter = 0.55 + 0.45 * Math.abs(Math.sin(now / 70) * Math.cos(now / 173));
      return Math.min(1, e * flutter);
    },
  };
}

// ------------------------------------------------------------ speech to text

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC_ERRORS: Record<string, string> = {
  'not-allowed': 'The microphone is blocked for this site. Allow it in the browser settings to talk to Enyo.',
  'service-not-allowed': 'The microphone is blocked for this site. Allow it in the browser settings to talk to Enyo.',
  'audio-capture': 'No microphone was found on this device.',
  'no-speech': 'I did not hear anything. Press the microphone and try again.',
  network: 'Speech recognition needs an internet connection. Please type your question instead.',
};

export function useSpeechInput(onDone: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef('');
  const interimText = useRef('');
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => { setSupported(Boolean(recognitionCtor())); }, []);
  useEffect(() => () => rec.current?.abort(), []);

  const begin = useCallback((lang: string) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let fin = '';
      let mid = '';
      for (let i = 0; i < e.results.length; i += 1) {
        const res = e.results[i]!;
        const t = res[0]?.transcript ?? '';
        if (res.isFinal) fin += t; else mid += t;
      }
      finalText.current = fin;
      interimText.current = mid;
      setInterim(`${fin}${mid}`.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'language-not-supported' && lang !== 'en-GB') {
        r.onend = null;
        begin('en-GB');
        return;
      }
      if (e.error !== 'aborted') setError(MIC_ERRORS[e.error] ?? 'The microphone stopped. Please try again or type your question.');
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      const text = `${finalText.current}${interimText.current}`.replace(/\s+/g, ' ').trim();
      setInterim('');
      if (text) done.current(text);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
      setError('The microphone could not start. Please try again.');
    }
  }, []);

  const start = useCallback(() => {
    if (rec.current) return;
    setError(null);
    finalText.current = '';
    interimText.current = '';
    setInterim('');
    begin('en-NG');
  }, [begin]);

  /** Stops listening; what was heard is sent (onDone) when the browser finishes. */
  const stop = useCallback(() => { rec.current?.stop(); }, []);
  /** Stops without sending. */
  const cancel = useCallback(() => {
    finalText.current = '';
    interimText.current = '';
    rec.current?.abort();
  }, []);

  return { supported, listening, interim, error, clearError: () => setError(null), start, stop, cancel };
}

// ------------------------------------------------------------ text to speech

const FEMALE = /female|woman|ezinne|libby|sonia|maisie|hazel|susan|serena|kate|moira|tessa|fiona|karen|samantha|victoria|zira|aria|jenny|emma|ava|allison|joanna|salli|kendra|kimberly|amy|olivia|natasha|mia|google uk english female|google us english/i;
const MALE = /\bmale\b|abeo|ryan|george|daniel|thomas|guy|david|mark|james|fred|alex|oliver|arthur|aaron/i;

/** The most natural female English voice the device offers (Nigerian, then British, then American). */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  if (!english.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    const lang = v.lang.replace('_', '-').toLowerCase();
    if (lang === 'en-ng') s += 40; else if (lang === 'en-gb') s += 30; else if (lang === 'en-us') s += 20; else s += 10;
    if (FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ''))) s += 25;
    if (MALE.test(v.name) && !/female/i.test(v.name)) s -= 30;
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 8;
    if (v.localService) s += 2;
    return s;
  };
  return [...english].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function useSpeechOutput(mouth: MouthDriver) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const flutter = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);
    const load = () => { voice.current = pickVoice(window.speechSynthesis.getVoices()); };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stopFlutter = () => {
    if (flutter.current !== null) window.clearInterval(flutter.current);
    flutter.current = null;
  };

  const cancel = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    stopFlutter();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const clean = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    if (voice.current) { u.voice = voice.current; u.lang = voice.current.lang; } else u.lang = 'en-GB';
    u.rate = 1;
    u.pitch = 1.05;
    u.onstart = () => {
      setSpeaking(true);
      stopFlutter();
      // Not every voice reports word boundaries: keep the mouth moving gently anyway.
      flutter.current = window.setInterval(() => mouth.kick(0.45), 180);
    };
    u.onboundary = () => mouth.kick(0.95);
    u.onend = () => { stopFlutter(); setSpeaking(false); };
    u.onerror = () => { stopFlutter(); setSpeaking(false); };
    window.speechSynthesis.speak(u);
  }, [mouth]);

  return { supported, speaking, speak, cancel };
}
