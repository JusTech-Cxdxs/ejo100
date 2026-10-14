'use client';

import { useEffect, useId, useRef } from 'react';
import { f, mouthShape, SMILE, syllable, type MouthShape } from './avatar-mouth';

/**
 * Enyo, drawn: an original vector character — a fair, warm complexion, a soft
 * oval face, almond eyes with lashes and brown irises, full rose lips, dark
 * hair (straight or curls), small gold earrings, optional round glasses, a
 * JusTech-green top. Layered parts so each mood moves only what it needs:
 *
 *   idle       breathing, a slow sway, natural blinks, the eyes glance about;
 *              the lips are CLOSED in a soft smile
 *   wave       a hand raised, waving hello (lips closed, smiling)
 *   listening  leans in, brows up, a soft pulse ring
 *   thinking   eyes up to the side, lips pressed to one side, three dots
 *   speaking   the ONLY mood with an open mouth: lips part with each
 *              syllable following `level` (0..1), teeth and tongue show as
 *              the mouth opens, and close between syllables
 *   happy      smiling eyes, a wider closed smile
 *
 * Blinks come at natural, uneven intervals (sometimes a double blink), as an
 * eyelid closing from above. Pure SVG + CSS + a little timing; no images or
 * external files. With reduced motion every animation stops and each mood is
 * a still pose. Always decorative (aria-hidden): the name is written next to
 * it wherever it appears.
 */
export type { EnyoMood } from './avatar-mouth';
import type { EnyoMood } from './avatar-mouth';

export type EnyoAvatarProps = {
  mood: EnyoMood;
  /** Pixel size (32–160). */
  size?: number;
  /** Mouth openness while speaking, 0..1. Ignored in other moods. */
  level?: number;
  hair?: 'straight' | 'curly';
  glasses?: boolean;
  className?: string;
};

// A fair, warm complexion.
const SKIN = '#f3cba9';
const SKIN_SHADE = '#e2ad88';
const SKIN_DEEP = '#c98e6b';
const BLUSH = '#f0907f';
const HAIR = '#1f1512';
const HAIR_SHINE = '#4b342b';
const LIPS = '#cf6474';
const LIPS_UPPER = '#bb5163';
const LIP_LINE = '#8f3446';
const MOUTH = '#5e1f2c';
const TEETH = '#fffaf5';
const TONGUE = '#de7783';
const TOP = '#22983f';
const TOP_SHADE = '#1a7c33';
const GOLD = '#e2b04a';
const GOLD_SHINE = '#f7dc8f';
const BROW = '#3b241b';
const LASH = '#1b100c';
const IRIS = '#6b3f26';
const IRIS_RING = '#3e2215';
const PUPIL = '#170d09';

/** Styles shared by every avatar on the page (React hoists and de-duplicates this tag). */
const CSS = `
.enyo-av{--enyo-av-bg:#dcefe3;--enyo-av-ring:#22983f;display:inline-block;flex:none;line-height:0}
:root[data-theme='dark'] .enyo-av{--enyo-av-bg:#285a3e}
@media (prefers-color-scheme: dark){:root:not([data-theme='light']) .enyo-av{--enyo-av-bg:#285a3e}}
.enyo-av svg{display:block;overflow:visible}
.enyo-av g,.enyo-av path,.enyo-av circle,.enyo-av ellipse,.enyo-av rect{transform-box:view-box}
.enyo-av .av-body{transform-origin:60px 112px;animation:enyo-av-breathe 4.8s ease-in-out infinite}
.enyo-av .av-head{transform-origin:60px 84px;transition:transform .5s cubic-bezier(.3,.7,.3,1)}
.enyo-av .av-lid{transform-origin:var(--ox) 46px;transform:scaleY(0);transition:transform 75ms ease-in}
.enyo-av[data-blink='1'] .av-lid{transform:scaleY(1);transition-duration:60ms}
.enyo-av .av-pupils{transition:transform .45s cubic-bezier(.3,.7,.3,1)}
.enyo-av .av-brows{transition:transform .35s ease}
.enyo-av .av-lips{transform-origin:60px 66px;transition:transform .4s ease}
.enyo-av .av-hand{transform-origin:97px 92px}
.enyo-av .av-ring{opacity:0}
.enyo-av .av-dots{opacity:0;transition:opacity .25s ease}
.enyo-av .av-dot{animation:enyo-av-dot 1.2s ease-in-out infinite}
.enyo-av .av-dot:nth-child(5){animation-delay:.18s}
.enyo-av .av-dot:nth-child(6){animation-delay:.36s}
.enyo-av[data-mood='idle'] .av-head{animation:enyo-av-sway 9s ease-in-out infinite}
.enyo-av[data-mood='speaking'] .av-head{animation:enyo-av-nod 2.8s ease-in-out infinite}
.enyo-av[data-look='l']:is([data-mood='idle'],[data-mood='wave'],[data-mood='speaking'],[data-mood='happy']) .av-pupils{transform:translateX(-1.1px)}
.enyo-av[data-look='r']:is([data-mood='idle'],[data-mood='wave'],[data-mood='speaking'],[data-mood='happy']) .av-pupils{transform:translateX(1.1px)}
.enyo-av[data-look='d']:is([data-mood='idle'],[data-mood='wave'],[data-mood='speaking'],[data-mood='happy']) .av-pupils{transform:translate(-.3px,.7px)}
.enyo-av[data-mood='wave'] .av-hand{animation:enyo-av-wave 1.5s ease-in-out infinite}
.enyo-av[data-mood='listening'] .av-head{transform:translate(-1.5px,1.5px) rotate(-5deg)}
.enyo-av[data-mood='listening'] .av-brows{transform:translateY(-1.8px)}
.enyo-av[data-mood='listening'] .av-ring{transform-origin:60px 62px;animation:enyo-av-pulse 1.8s ease-out infinite}
.enyo-av[data-mood='thinking'] .av-head{transform:rotate(3deg)}
.enyo-av[data-mood='thinking'] .av-pupils{transform:translate(-1.4px,-1.7px)}
.enyo-av[data-mood='thinking'] .av-brow-r{transform:translateY(-1.6px)}
.enyo-av[data-mood='thinking'] .av-lips{transform:translateX(1.1px) scaleX(.86)}
.enyo-av[data-mood='thinking'] .av-dots{opacity:1}
.enyo-av[data-mood='happy'] .av-head{transform:rotate(-2deg)}
@keyframes enyo-av-breathe{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-.9px) scaleY(1.008)}}
@keyframes enyo-av-sway{0%,100%{transform:rotate(-.9deg)}50%{transform:rotate(1.1deg) translateY(-.2px)}}
@keyframes enyo-av-nod{0%,100%{transform:rotate(0)}30%{transform:rotate(.8deg) translateY(.35px)}65%{transform:rotate(-.6deg)}}
@keyframes enyo-av-wave{0%,100%{transform:rotate(-6deg)}25%{transform:rotate(14deg)}50%{transform:rotate(-8deg)}75%{transform:rotate(12deg)}}
@keyframes enyo-av-pulse{0%{transform:scale(.9);opacity:.75}100%{transform:scale(1.06);opacity:0}}
@keyframes enyo-av-dot{0%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-1.2px)}}
@media (prefers-reduced-motion: reduce){
.enyo-av *,.enyo-av{animation:none!important;transition:none!important}
.enyo-av .av-lid{transform:scaleY(0)!important}
.enyo-av[data-mood='wave'] .av-hand{transform:rotate(8deg)}
.enyo-av[data-mood='listening'] .av-ring{opacity:.55;transform:none}
.enyo-av .av-dot{opacity:1}
}
`;

// ------------------------------------------------------------------ eyes

/** Almond eye outline. `o` = the outer corner's side (-1 left eye, +1 right eye). */
function eyePath(cx: number, o: number): string {
  return `M${cx + 5.2 * o} 50.5C${cx + 3.5 * o} 46.9 ${cx - 2.7 * o} 46 ${cx - 5.2 * o} 50.9C${cx - 3.1 * o} 54.1 ${cx + 2.7 * o} 54.4 ${cx + 5.2 * o} 50.5Z`;
}
function upperLine(cx: number, o: number): string {
  return `M${cx + 6.2 * o} 49.4Q${cx + 5.7 * o} 50.1 ${cx + 5.2 * o} 50.5C${cx + 3.5 * o} 46.9 ${cx - 2.7 * o} 46 ${cx - 5.2 * o} 50.9`;
}
function lowerLine(cx: number, o: number): string {
  return `M${cx + 5.2 * o} 50.5C${cx + 2.7 * o} 54.4 ${cx - 3.1 * o} 54.1 ${cx - 5.2 * o} 50.9`;
}
function lashes(cx: number, o: number): string {
  return `M${cx + 4.1 * o} 48.2Q${cx + 5 * o} 47.6 ${cx + 5.5 * o} 46.6M${cx + 2.6 * o} 47.2Q${cx + 3.3 * o} 46.4 ${cx + 3.6 * o} 45.4`;
}
function crease(cx: number, o: number): string {
  return `M${cx + 5 * o} 46.9Q${cx} 43.3 ${cx - 4.7 * o} 46.5`;
}

// ------------------------------------------------------------------ hair (curls)

/** Curls, as rings of overlapping circles (generated once). */
function curlRing(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n: number, r: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const t = from + ((to - from) * i) / (n - 1);
    const a = (t * Math.PI) / 180;
    out.push([+(cx + rx * Math.cos(a)).toFixed(2), +(cy + ry * Math.sin(a)).toFixed(2), +(r * (0.86 + 0.14 * Math.sin(i * 2.3))).toFixed(2)]);
  }
  return out;
}
// Back of the curls: a halo around the head, falling past the shoulders.
const CURLS_BACK: [number, number, number][] = [
  ...curlRing(60, 51.5, 30.5, 29, 190, 350, 13, 7.8),
  ...curlRing(60, 64, 33, 30, -10, 60, 6, 7.6),
  ...curlRing(60, 64, 33, 30, 120, 190, 6, 7.6),
  [27, 92, 7], [93, 92, 7], [31, 99, 6], [89, 99, 6],
];
// Front curls along the hairline (a soft side part).
const CURLS_FRONT: [number, number, number][] = [
  [38, 40, 6.2], [43, 33, 6.6], [50, 28.5, 6.4], [58, 27, 6], [66, 27.6, 6.2], [73, 30.5, 6.4], [79, 35.5, 6.2], [83, 42, 5.6],
  [35.5, 48, 5.2], [85, 49, 5],
];

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function EnyoAvatar({ mood, size = 48, level = 0, hair = 'straight', glasses = false, className }: EnyoAvatarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clip = `enyo-clip-${uid}`;
  const px = Math.max(24, Math.min(200, Math.round(size)));
  const rootRef = useRef<HTMLSpanElement>(null);
  const upperRef = useRef<SVGPathElement>(null);
  const innerRef = useRef<SVGPathElement>(null);
  const innerClipRef = useRef<SVGPathElement>(null);
  const lowerRef = useRef<SVGPathElement>(null);
  const teethRef = useRef<SVGRectElement>(null);
  const tongueRef = useRef<SVGEllipseElement>(null);
  const shineRef = useRef<SVGEllipseElement>(null);
  const target = useRef(level);
  target.current = level;

  // Blinks at natural, uneven intervals (now and then a double blink), and
  // the eyes glance about now and then. Per avatar; nothing when motion is reduced.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion()) return;
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const blink = (then: () => void) => {
      el.dataset.blink = '1';
      later(() => { delete el.dataset.blink; then(); }, 130 + Math.random() * 50);
    };
    const nextBlink = () => later(() => blink(() => (Math.random() < 0.18 ? later(() => blink(nextBlink), 170) : nextBlink())), 2200 + Math.random() * 4300);
    const looks = ['', '', 'l', 'r', 'd'];
    const nextLook = () => later(() => {
      const pick = looks[Math.floor(Math.random() * looks.length)] ?? '';
      if (pick) el.dataset.look = pick; else delete el.dataset.look;
      nextLook();
    }, 2600 + Math.random() * 4200);
    nextBlink();
    nextLook();
    return () => { for (const t of timers) window.clearTimeout(t); delete el.dataset.blink; delete el.dataset.look; };
  }, []);

  // The mouth: closed in every mood but speaking. While speaking, the lips
  // follow `level` with a syllable rhythm and ease every frame (never jumpy).
  useEffect(() => {
    const apply = (m: MouthShape) => {
      upperRef.current?.setAttribute('d', m.upper);
      innerRef.current?.setAttribute('d', m.inner);
      innerClipRef.current?.setAttribute('d', m.inner);
      lowerRef.current?.setAttribute('d', m.lower);
      teethRef.current?.setAttribute('height', String(m.teethH));
      tongueRef.current?.setAttribute('cy', String(m.tongueY));
      tongueRef.current?.setAttribute('rx', String(m.tongueRx));
      tongueRef.current?.setAttribute('ry', String(m.tongueRy));
      shineRef.current?.setAttribute('cy', String(m.shineY));
      innerRef.current?.setAttribute('opacity', m.open > 0.02 ? '1' : '0');
    };
    const smile = SMILE[mood];
    if (mood !== 'speaking') { apply(mouthShape(0, smile)); return; }
    if (reducedMotion()) { apply(mouthShape(0.3, smile)); return; }
    let current = 0;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const lvl = Math.max(0, Math.min(1, target.current));
      const goal = lvl < 0.04 ? 0 : lvl * (0.06 + 0.94 * syllable((now - start) / 1000)); // the lips nearly meet between syllables
      current += (goal - current) * 0.32;
      apply(mouthShape(current, smile));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mood]);

  const happy = mood === 'happy';
  const rest = mouthShape(0, SMILE[mood]);

  const eye = (cx: number, o: number, id: string) => (
    <g key={id}>
      <path d={crease(cx, o)} fill="none" stroke={SKIN_DEEP} strokeWidth=".6" strokeLinecap="round" opacity=".4" />
      <path d={eyePath(cx, o)} fill="#fffdfb" />
      <clipPath id={id}><path d={eyePath(cx, o)} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <g className="av-pupils">
          <circle cx={cx} cy="50.5" r="3.2" fill={IRIS} stroke={IRIS_RING} strokeWidth=".55" />
          <circle cx={cx} cy="50.5" r="1.5" fill={PUPIL} />
          <circle cx={cx + 1.15} cy="49.6" r=".95" fill="#fff" />
          <circle cx={cx - 0.95} cy="51.9" r=".42" fill="#fff" opacity=".75" />
        </g>
        {/* the upper lid's soft shadow on the eye */}
        <path d={`M${cx - 6} 46H${cx + 6}V48.6Q${cx} 47.2 ${cx - 6} 48.6Z`} fill={SKIN_DEEP} opacity=".18" />
      </g>
      <path d={lowerLine(cx, o)} fill="none" stroke={LASH} strokeWidth=".6" strokeLinecap="round" opacity=".35" />
      <path d={upperLine(cx, o)} fill="none" stroke={LASH} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d={lashes(cx, o)} fill="none" stroke={LASH} strokeWidth=".6" strokeLinecap="round" />
      {/* The eyelid that closes from above for a blink */}
      <g className="av-lid" style={{ ['--ox' as string]: `${cx}px` }}>
        <path d={eyePath(cx, o)} fill={SKIN} stroke={SKIN} strokeWidth=".5" />
        <path d={lowerLine(cx, o)} fill="none" stroke={LASH} strokeWidth="1.3" strokeLinecap="round" />
        <path d={`M${cx + 4 * o} 52.2L${cx + 4.8 * o} 53.3M${cx + 2.6 * o} 52.9L${cx + 3 * o} 54.1`} fill="none" stroke={LASH} strokeWidth=".6" strokeLinecap="round" />
      </g>
    </g>
  );

  return (
    <span ref={rootRef} className={`enyo-av ${className ?? ''}`} data-mood={mood} aria-hidden="true" style={{ width: px, height: px }}>
      <style href="enyo-avatar" precedence="default">{CSS}</style>
      <svg width={px} height={px} viewBox="10 12 100 100" focusable="false" shapeRendering="geometricPrecision">
        <defs>
          <clipPath id={clip}><circle cx="60" cy="62" r="50" /></clipPath>
          <clipPath id={`${clip}-mouth`}><path ref={innerClipRef} d={rest.inner} /></clipPath>
          <radialGradient id={`${clip}-face`} cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#f8d7ba" />
            <stop offset="72%" stopColor={SKIN} />
            <stop offset="100%" stopColor={SKIN_SHADE} />
          </radialGradient>
        </defs>
        <circle className="av-ring" cx="60" cy="62" r="48.5" fill="none" stroke="var(--enyo-av-ring)" strokeWidth="3" />
        <g clipPath={`url(#${clip})`}>
          <circle cx="60" cy="62" r="50" fill="var(--enyo-av-bg)" />
          <g className="av-body">
            {/* Hair behind the head and shoulders */}
            <g className="av-head-back av-head">
              {hair === 'curly' ? (
                <g fill={HAIR}>
                  <path d="M60 24C40 24 30 38 31 56C31.6 70 29 84 25 96L50.6 98V62H69.4V98L95 96C91 84 88.4 70 89 56C90 38 80 24 60 24Z" />
                  {CURLS_BACK.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
                  <g fill="none" stroke={HAIR_SHINE} strokeWidth="1" strokeLinecap="round" opacity=".8">
                    {CURLS_BACK.filter((_, i) => i % 2 === 0).map(([x, y, r], i) => <path key={i} d={`M${x - r * 0.5} ${y + r * 0.1}a${r * 0.55} ${r * 0.55} 0 0 1 ${r * 0.9} ${-r * 0.3}`} />)}
                  </g>
                </g>
              ) : (
                <path fill={HAIR} d="M60 18C36 18 27 35 28.5 56C29.5 69 27 79 24 86C22.5 90 25 94.5 29.5 94C35 93.6 38.5 96.5 43.5 94.5C47 93 50.6 90 50.6 86L50.6 64H69.4L69.4 86C69.4 90 73 93 76.5 94.5C81.5 96.5 85 93.6 90.5 94C95 94.5 97.5 90 96 86C93 79 90.5 69 91.5 56C93 35 84 18 60 18Z" />
              )}
            </g>

            {/* Neck and shoulders: the green top */}
            <path fill={TOP} d="M12 124C13.6 103.4 27.4 91.4 46.6 88.2L60 101.6L73.4 88.2C92.6 91.4 106.4 103.4 108 124Z" />
            <path fill={SKIN_SHADE} d="M47.2 88.1L60 100.9L72.8 88.1C70.4 87.4 68.6 86.6 68.5 85.6C66 89.2 62.8 90.6 60 90.6S54 89.2 51.5 85.6C51.4 86.6 49.6 87.4 47.2 88.1Z" />
            <path fill={TOP_SHADE} d="M46.6 88.2L60 101.6L73.4 88.2L76.2 88.8L60 105.2L43.8 88.8Z" />
            <path fill="none" stroke="#3fb35c" strokeWidth=".8" strokeLinecap="round" opacity=".55" d="M30 104Q36 98 44 95.4M90 104Q84 98 76 95.4" />
            {/* A thin gold chain */}
            <path d="M51.2 88.6Q60 98.6 68.8 88.6" fill="none" stroke={GOLD} strokeWidth="1" strokeLinecap="round" opacity=".95" />
            <circle cx="60" cy="96" r="1.5" fill={GOLD} />
            <circle cx="59.6" cy="95.6" r=".5" fill={GOLD_SHINE} />

            {/* The waving hand (shown for "wave") */}
            {mood === 'wave' ? (
              <g className="av-hand">
                <path fill={TOP} d="M88.4 116L91.6 93.6C92 90.6 94.6 88.6 97.6 88.8C100.6 89 102.8 91.6 102.4 94.6L100.4 116Z" />
                <g fill={SKIN}>
                  <rect x="91.6" y="66.6" width="3.8" height="13" rx="1.9" transform="rotate(-12 93.5 79)" />
                  <rect x="95.6" y="64.2" width="3.9" height="14.6" rx="1.95" transform="rotate(-4 97.5 79)" />
                  <rect x="99.8" y="64.8" width="3.9" height="14.2" rx="1.95" transform="rotate(5 101.7 79)" />
                  <rect x="103.6" y="67.6" width="3.6" height="12" rx="1.8" transform="rotate(14 105.4 79)" />
                  <path d="M92.4 87.2C89.4 85.6 86.8 83 85.8 80.4C85.2 78.8 86.6 77.4 88.1 78.2C89.9 79.2 91.6 81 92.8 82.2Z" />
                  <path d="M91.2 76.6H106.2C107 76.6 107.6 77.3 107.5 78.1L106.6 85.4C106 89.6 102.4 92.4 98.4 92.2C94.6 92 91.6 89 91.2 85.2Z" />
                </g>
                <path fill="none" stroke={SKIN_SHADE} strokeWidth=".8" strokeLinecap="round" d="M95.8 85.6Q99.4 87.6 103 85.4" opacity=".8" />
              </g>
            ) : null}

            {/* The head */}
            <g className="av-head">
              {/* Neck (moves with the head so a tilt never shows a gap) */}
              <path fill={SKIN_SHADE} d="M50.6 66H69.4V86C69.4 90 64.8 92.6 60 92.6S50.6 90 50.6 86Z" />
              <path fill={SKIN_DEEP} opacity=".45" d="M50.6 70C55 74.4 65 74.4 69.4 70V75.5C64.8 78.6 55.2 78.6 50.6 75.5Z" />
              {/* Ears and earrings */}
              <ellipse cx="37" cy="54" rx="3.5" ry="5" fill={SKIN_SHADE} />
              <ellipse cx="83" cy="54" rx="3.5" ry="5" fill={SKIN_SHADE} />
              <circle cx="37.2" cy="61.2" r="2.3" fill={GOLD} />
              <circle cx="82.8" cy="61.2" r="2.3" fill={GOLD} />
              <circle cx="36.6" cy="60.5" r=".75" fill={GOLD_SHINE} />
              <circle cx="82.2" cy="60.5" r=".75" fill={GOLD_SHINE} />

              {/* Face: a soft oval with a gentle chin */}
              <path fill={`url(#${clip}-face)`} d="M60 26.5C74.6 26.5 84.2 37.2 84.2 51.8C84.2 66.4 73.6 77.8 60 77.8S35.8 66.4 35.8 51.8C35.8 37.2 45.4 26.5 60 26.5Z" />
              {/* Cheeks */}
              <ellipse cx="45.4" cy="60.6" rx="4.8" ry="2.9" fill={BLUSH} opacity={happy ? 0.42 : 0.28} />
              <ellipse cx="74.6" cy="60.6" rx="4.8" ry="2.9" fill={BLUSH} opacity={happy ? 0.42 : 0.28} />

              {/* Brows: thin and arched */}
              <g className="av-brows" fill="none" stroke={BROW} strokeWidth="1.75" strokeLinecap="round">
                <path className="av-brow-l" d="M43.2 43.8Q47.6 39.8 54.4 41.9" />
                <path className="av-brow-r" d="M65.6 41.9Q72.4 39.8 76.8 43.8" />
              </g>

              {/* Eyes */}
              {happy ? (
                <g fill="none" stroke={LASH} strokeLinecap="round">
                  <path d="M44.6 51.4Q49 46.8 53.6 51.2" strokeWidth="1.9" />
                  <path d="M66.4 51.2Q71 46.8 75.4 51.4" strokeWidth="1.9" />
                  <path d="M44.6 51.4L43.4 50.4M75.4 51.4L76.6 50.4" strokeWidth="1" />
                </g>
              ) : (
                <>
                  {eye(49, -1, `${clip}-el`)}
                  {eye(71, 1, `${clip}-er`)}
                </>
              )}

              {/* Nose: small and refined */}
              <path d="M58.9 54.2Q58.6 57 57.9 58.2" fill="none" stroke={SKIN_DEEP} strokeWidth=".8" strokeLinecap="round" opacity=".45" />
              <path d="M57.6 59.4Q58.6 60.6 60 60.3Q61.4 60.6 62.4 59.4" fill="none" stroke={SKIN_DEEP} strokeWidth="1.15" strokeLinecap="round" />
              <ellipse cx="60.5" cy="56.6" rx=".55" ry="1.3" fill="#fff" opacity=".2" />

              {/* Mouth: closed lips; they part only while speaking */}
              <g className="av-lips">
                <path ref={innerRef} d={rest.inner} fill={MOUTH} opacity="0" />
                <g clipPath={`url(#${clip}-mouth)`}>
                  <rect ref={teethRef} x="52" y="62" width="16" height={rest.teethH} rx="1" fill={TEETH} />
                  <ellipse ref={tongueRef} cx="60" cy={rest.tongueY} rx={rest.tongueRx} ry={rest.tongueRy} fill={TONGUE} />
                </g>
                <path ref={lowerRef} d={rest.lower} fill={LIPS} />
                <path ref={upperRef} d={rest.upper} fill={LIPS_UPPER} />
                <ellipse ref={shineRef} cx="61.4" cy={rest.shineY} rx="1.7" ry=".5" fill="#fff" opacity=".35" />
                <path d={`M${f(60 - 6.4 - SMILE[mood] * 0.9 - 0.4)} ${f(66 - SMILE[mood] * 1.05)}l.5 .25M${f(60 + 6.4 + SMILE[mood] * 0.9 + 0.4)} ${f(66 - SMILE[mood] * 1.05)}l-.5 .25`} fill="none" stroke={LIP_LINE} strokeWidth=".7" strokeLinecap="round" opacity={mood === 'speaking' ? 0 : 0.6} />
              </g>

              {/* Front hair */}
              {hair === 'curly' ? (
                <g fill={HAIR}>
                  {CURLS_FRONT.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
                  <g fill="none" stroke={HAIR_SHINE} strokeWidth="1.1" strokeLinecap="round">
                    {CURLS_FRONT.slice(0, 8).map(([x, y, r], i) => <path key={i} d={`M${x - r * 0.45} ${y - r * 0.1}a${r * 0.5} ${r * 0.5} 0 0 1 ${r * 0.8} ${-r * 0.2}`} />)}
                  </g>
                </g>
              ) : (
                <g>
                  <path fill={HAIR} d="M50 24.5C40 26 34 34 34 46C34 50 34.5 53 35.3 56C36.4 47 39.5 40 45 35.5C47.5 33.5 49.5 30 50 26.5Z" />
                  <path fill={HAIR} d="M48.6 25.2C62 21.6 80.4 26 85.8 42C87.2 47 86.8 53 85.4 58.4C83.6 50.4 80.6 44.2 75.4 40.6C65.6 41.6 56 36.4 50.6 30.4Z" />
                  <path fill="none" stroke={HAIR_SHINE} strokeWidth="1.5" strokeLinecap="round" d="M55.4 27.4Q68.4 25.6 78.6 33.4" opacity=".55" />
                  <path fill="none" stroke={HAIR_SHINE} strokeWidth="1.1" strokeLinecap="round" d="M82.4 41.6Q85.4 47 85.4 52.6M38.6 37.6Q36.2 41.6 35.6 46" opacity=".4" />
                </g>
              )}

              {/* Round glasses (optional) */}
              {glasses ? (
                <g fill="none" stroke="#7a4a2c" strokeWidth="1.6">
                  <circle cx="49" cy="51" r="7.6" fill="#ffffff" fillOpacity=".08" />
                  <circle cx="71" cy="51" r="7.6" fill="#ffffff" fillOpacity=".08" />
                  <path d="M56.6 50.4Q60 48.6 63.4 50.4M41.4 50L36.6 48.4M78.6 50L83.4 48.4" strokeLinecap="round" />
                </g>
              ) : null}
            </g>
          </g>
        </g>
        {/* Thinking: three dots in a small bubble (top-right corner, outside the circle) */}
        <g className="av-dots">
          <circle cx="84.6" cy="29.6" r="1.5" fill="#fff" stroke="#cfe3d6" strokeWidth=".5" />
          <circle cx="88.4" cy="25.4" r="2.1" fill="#fff" stroke="#cfe3d6" strokeWidth=".5" />
          <rect x="88.5" y="12.5" width="21" height="11.5" rx="5.75" fill="#fff" stroke="#cfe3d6" strokeWidth=".5" />
          <circle className="av-dot" cx="93.6" cy="18.25" r="1.7" fill={TOP} />
          <circle className="av-dot" cx="99" cy="18.25" r="1.7" fill={TOP} />
          <circle className="av-dot" cx="104.4" cy="18.25" r="1.7" fill={TOP} />
        </g>
      </svg>
    </span>
  );
}
