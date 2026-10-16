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

// Shared with the website and the customer portal (packages/enyo/src/ui/speechInput.ts).
export { joinSpoken, useSpeechInput, type VoiceFinish } from '@ejo/enyo/src/ui/speechInput';
import { speakable, speechChunks } from './voice-text';
export { speakable, speechChunks };

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
