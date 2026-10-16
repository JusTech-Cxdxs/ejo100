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

/** What happens to the words once the person finishes speaking. */
export type VoiceFinish = 'send' | 'text';

/** Joins spoken pieces with single spaces. */
export function joinSpoken(...parts: string[]): string {
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Speaking to Enyo, the way people expect from voice notes in chat apps:
 *  - start → listening, the words appear as they are heard;
 *  - pause → stops listening and keeps the words; resume adds to them;
 *  - finish('send') → sends what was said at once;
 *  - finish('text') → puts the words into the message box to read, edit or
 *    add to before sending;
 *  - cancel → throws the recording away.
 * If the browser stops listening on its own (silence, phone lock), the words
 * are kept as if paused: nothing is ever sent without the person choosing.
 */
export function useSpeechInput(onDone: (text: string, how: VoiceFinish) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Between "finish" and the browser handing back the last words. */
  const [processing, setProcessing] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const rec = useRef<Recognition | null>(null);
  /** Words from earlier pieces (before a pause). */
  const kept = useRef('');
  const finalText = useRef('');
  const interimText = useRef('');
  /** What the person chose when they stopped this piece (null: the browser stopped). */
  const ending = useRef<VoiceFinish | 'pause' | 'cancel' | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => { setSupported(Boolean(recognitionCtor())); }, []);
  useEffect(() => () => { const r = rec.current; if (r) { r.onend = null; r.onresult = null; r.onerror = null; r.abort(); } }, []);

  const reset = useCallback(() => {
    kept.current = '';
    finalText.current = '';
    interimText.current = '';
    ending.current = null;
    setInterim('');
    setPaused(false);
    setListening(false);
    setProcessing(false);
    setStartedAt(null);
  }, []);

  const begin = useCallback((lang: string) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finalText.current = '';
    interimText.current = '';
    ending.current = null;
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
      setInterim(joinSpoken(kept.current, fin, mid));
    };
    r.onerror = (e) => {
      if (e.error === 'language-not-supported' && lang !== 'en-GB') {
        r.onend = null;
        begin('en-GB');
        return;
      }
      // Silence after some words is not an error worth showing: the words are kept.
      if (e.error === 'no-speech' && kept.current) return;
      if (e.error !== 'aborted') setError(MIC_ERRORS[e.error] ?? 'The microphone stopped. Please try again or type your question.');
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      const how = ending.current;
      const text = joinSpoken(kept.current, finalText.current, interimText.current);
      if (how === 'cancel') { reset(); return; }
      if (how === 'send' || how === 'text') {
        reset();
        if (text) done.current(text, how);
        return;
      }
      // Paused by the person, or the browser stopped by itself: keep the words.
      kept.current = text;
      finalText.current = '';
      interimText.current = '';
      setInterim(text);
      setProcessing(false);
      if (text) setPaused(true); else reset();
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      setPaused(false);
    } catch {
      setListening(false);
      setError('The microphone could not start. Please try again.');
    }
  }, [reset]);

  const start = useCallback(() => {
    if (rec.current) return;
    setError(null);
    reset();
    setStartedAt(Date.now());
    begin('en-NG');
  }, [begin, reset]);

  /** Stops listening and keeps the words (resume adds to them). */
  const pause = useCallback(() => {
    if (!rec.current) return;
    ending.current = 'pause';
    rec.current.stop();
  }, []);

  /** Listens again, adding to the words kept so far. */
  const resume = useCallback(() => {
    if (rec.current) return;
    setError(null);
    begin('en-NG');
  }, [begin]);

  /** Finishes: send what was said, or put it in the message box to edit. */
  const finish = useCallback((how: VoiceFinish) => {
    if (rec.current) {
      ending.current = how;
      setProcessing(true);
      rec.current.stop();
      return;
    }
    const text = kept.current;
    reset();
    if (text) done.current(text, how);
  }, [reset]);

  /** Throws the recording away. */
  const cancel = useCallback(() => {
    const r = rec.current;
    if (r) { r.onend = null; r.onresult = null; r.onerror = null; rec.current = null; r.abort(); }
    reset();
  }, [reset]);

  /** Kept for callers that only stop and send. */
  const stop = useCallback(() => finish('send'), [finish]);

  return { supported, listening, paused, active: listening || paused || processing, processing, interim, startedAt, error, clearError: () => setError(null), start, pause, resume, finish, stop, cancel };
}

// ------------------------------------------------------------ text to speech

const FEMALE = /female|woman|ezinne|libby|sonia|maisie|hazel|susan|serena|kate|moira|tessa|fiona|karen|samantha|victoria|zira|aria|jenny|emma|ava|allison|joanna|salli|kendra|kimberly|amy|olivia|natasha|mia|michelle|ana\b|clara|leah|nancy|google uk english female|google us english/i;
const MALE = /\bmale\b|abeo|ryan|george|daniel|thomas|guy|david|mark|james|fred|alex|oliver|arthur|aaron|brian|christopher|eric|roger|steffan|william|liam/i;

/** English voices the device offers, best first (gentle female, natural, Nigerian, British). */
export function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    const lang = v.lang.replace('_', '-').toLowerCase();
    if (lang === 'en-ng') s += 40; else if (lang === 'en-gb') s += 30; else if (lang === 'en-us') s += 20; else s += 10;
    if (FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ''))) s += 35;
    if (MALE.test(v.name) && !/female/i.test(v.name)) s -= 40;
    // Neural ("Natural", "Online") voices sound far softer than the old robotic ones.
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 25;
    if (v.localService) s += 2;
    return s;
  };
  return [...english].sort((a, b) => score(b) - score(a));
}

/** The most natural female English voice the device offers (Nigerian, then British, then American). */
export function pickVoice(voices: SpeechSynthesisVoice[], preferred?: string): SpeechSynthesisVoice | null {
  if (preferred) {
    const chosen = voices.find((v) => v.name === preferred);
    if (chosen) return chosen;
  }
  return rankVoices(voices)[0] ?? null;
}

/**
 * Short pieces at sentence ends: some browsers stop a long utterance after
 * about 15 seconds, and short pieces let the voice breathe between sentences.
 */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if ((cur + ' ' + sentence).trim().length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (sentence.length > max) {
      for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max));
      continue;
    }
    cur = `${cur} ${sentence}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Words that read badly aloud: links, reference marks, symbols. */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/₦\s?/g, 'naira ')
    .replace(/\b(JC|SV|EPR|PRS|GRN)-(\d{4})-0*(\d+)\b/g, '$1 $3')
    .replace(/[|*_#`>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);
}

export function useSpeechOutput(mouth: MouthDriver, preferredVoice?: string) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const preferred = useRef(preferredVoice);
  preferred.current = preferredVoice;
  const flutter = useRef<number | null>(null);
  const run = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(rankVoices(all));
      voice.current = pickVoice(all, preferred.current);
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    voice.current = pickVoice(window.speechSynthesis.getVoices(), preferredVoice);
  }, [preferredVoice]);

  const stopFlutter = () => {
    if (flutter.current !== null) window.clearInterval(flutter.current);
    flutter.current = null;
  };

  const cancel = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    run.current += 1;
    window.speechSynthesis.cancel();
    stopFlutter();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const pieces = speechChunks(speakable(text));
    if (!pieces.length) return;
    window.speechSynthesis.cancel();
    const mine = (run.current += 1);
    pieces.forEach((piece, idx) => {
      const u = new SpeechSynthesisUtterance(piece);
      if (voice.current) { u.voice = voice.current; u.lang = voice.current.lang; } else u.lang = 'en-GB';
      // A little slower and a little higher: a gentle, warm voice rather than a brisk one.
      u.rate = 0.95;
      u.pitch = 1.12;
      u.volume = 1;
      u.onstart = () => {
        if (run.current !== mine) return;
        setSpeaking(true);
        stopFlutter();
        // Not every voice reports word boundaries: keep the mouth moving gently anyway.
        flutter.current = window.setInterval(() => mouth.kick(0.45), 180);
      };
      u.onboundary = () => mouth.kick(0.95);
      const finish = () => { if (run.current === mine && idx === pieces.length - 1) { stopFlutter(); setSpeaking(false); } };
      u.onend = finish;
      u.onerror = () => { if (run.current === mine) { stopFlutter(); setSpeaking(false); } };
      window.speechSynthesis.speak(u);
    });
  }, [mouth]);

  return { supported, speaking, speak, cancel, voices };
}
