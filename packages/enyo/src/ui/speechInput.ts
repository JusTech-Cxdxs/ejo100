'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice notes to Enyo — the same in the staff portal, the customer portal and
 * the public website. Speech to text with the browser's own Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition), Nigerian English first, then
 * British English. Nothing is uploaded by this code; when the browser has no
 * speech support, `supported` is false and the chat hides the microphone.
 */


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
