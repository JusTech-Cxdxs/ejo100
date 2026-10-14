'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * Enyo, drawn: an original flat-vector character (warm brown skin, a bright
 * smile, a round face, dark shoulder-length hair or curls, small gold
 * earrings, optional round glasses, a JusTech-green top). Layered parts so
 * each mood moves only what it needs:
 *
 *   idle       breathing and an occasional blink
 *   wave       a hand raised, waving hello
 *   listening  leans in, brows up, a soft pulse ring
 *   thinking   eyes up to the side, three dots
 *   speaking   the mouth follows `level` (0..1), smoothed
 *   happy      smiling eyes, a bigger smile
 *
 * Pure SVG + CSS; no images or external files. With reduced motion every
 * animation stops and each mood is a still pose. Always decorative
 * (aria-hidden): the name is written next to it wherever it appears.
 */
export type EnyoMood = 'idle' | 'wave' | 'listening' | 'thinking' | 'speaking' | 'happy';

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

const SKIN = '#a66a44';
const SKIN_SHADE = '#8a5435';
const SKIN_DEEP = '#714127';
const HAIR = '#1d1311';
const HAIR_SHINE = '#3d2a24';
const LIPS = '#b4515c';
const MOUTH = '#5c1a24';
const TOP = '#22983f';
const TOP_SHADE = '#1a7c33';
const GOLD = '#e2b04a';
const GOLD_SHINE = '#f7dc8f';
const BROW = '#2a1915';
const EYE = '#24140f';

/** Styles shared by every avatar on the page (React hoists and de-duplicates this tag). */
const CSS = `
.enyo-av{--enyo-av-bg:#dcefe3;--enyo-av-ring:#22983f;display:inline-block;flex:none;line-height:0}
:root[data-theme='dark'] .enyo-av{--enyo-av-bg:#285a3e}
@media (prefers-color-scheme: dark){:root:not([data-theme='light']) .enyo-av{--enyo-av-bg:#285a3e}}
.enyo-av svg{display:block;overflow:visible}
.enyo-av g,.enyo-av path,.enyo-av circle,.enyo-av ellipse{transform-box:view-box}
.enyo-av .av-body{transform-origin:60px 112px;animation:enyo-av-breathe 4.8s ease-in-out infinite}
.enyo-av .av-head{transform-origin:60px 84px;transition:transform .5s cubic-bezier(.3,.7,.3,1)}
.enyo-av .av-eye{transform-origin:var(--ox) 50px;animation:enyo-av-blink 5.6s infinite}
.enyo-av .av-pupils{transition:transform .45s cubic-bezier(.3,.7,.3,1)}
.enyo-av .av-brows{transition:transform .35s ease}
.enyo-av .av-hand{transform-origin:97px 92px}
.enyo-av .av-ring{opacity:0}
.enyo-av .av-dots{opacity:0;transition:opacity .25s ease}
.enyo-av .av-dot{animation:enyo-av-dot 1.2s ease-in-out infinite}
.enyo-av .av-dot:nth-child(5){animation-delay:.18s}
.enyo-av .av-dot:nth-child(6){animation-delay:.36s}
.enyo-av[data-mood='wave'] .av-hand{animation:enyo-av-wave 1.5s ease-in-out infinite}
.enyo-av[data-mood='listening'] .av-head{transform:translate(-1.5px,1.5px) rotate(-5deg)}
.enyo-av[data-mood='listening'] .av-brows{transform:translateY(-1.8px)}
.enyo-av[data-mood='listening'] .av-ring{transform-origin:60px 62px;animation:enyo-av-pulse 1.8s ease-out infinite}
.enyo-av[data-mood='thinking'] .av-head{transform:rotate(3deg)}
.enyo-av[data-mood='thinking'] .av-pupils{transform:translate(-1.4px,-1.7px)}
.enyo-av[data-mood='thinking'] .av-brow-r{transform:translateY(-1.6px)}
.enyo-av[data-mood='thinking'] .av-dots{opacity:1}
.enyo-av[data-mood='thinking'] .av-eye{animation:none}
.enyo-av[data-mood='happy'] .av-head{transform:rotate(-2deg)}
@keyframes enyo-av-breathe{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-.9px) scaleY(1.008)}}
@keyframes enyo-av-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}
@keyframes enyo-av-wave{0%,100%{transform:rotate(-6deg)}25%{transform:rotate(14deg)}50%{transform:rotate(-8deg)}75%{transform:rotate(12deg)}}
@keyframes enyo-av-pulse{0%{transform:scale(.9);opacity:.75}100%{transform:scale(1.06);opacity:0}}
@keyframes enyo-av-dot{0%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-1.2px)}}
@media (prefers-reduced-motion: reduce){
.enyo-av *,.enyo-av{animation:none!important;transition:none!important}
.enyo-av[data-mood='wave'] .av-hand{transform:rotate(8deg)}
.enyo-av[data-mood='listening'] .av-ring{opacity:.55;transform:none}
.enyo-av .av-dot{opacity:1}
}
`;

/** Mouth outline for an open, speaking mouth; `open` 0..1. */
function speakingMouth(open: number): string {
  const o = Math.max(0, Math.min(1, open));
  const w = 6.6 - o * 1.2; // half-width narrows slightly as it opens
  const top = 66 - o * 0.6;
  const bottom = 67.2 + o * 6.2;
  return `M${60 - w} ${top}Q60 ${top - 1.6} ${60 + w} ${top}Q${60 + w * 0.7} ${bottom} 60 ${bottom}Q${60 - w * 0.7} ${bottom} ${60 - w} ${top}Z`;
}

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

export function EnyoAvatar({ mood, size = 48, level = 0, hair = 'straight', glasses = false, className }: EnyoAvatarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clip = `enyo-clip-${uid}`;
  const px = Math.max(24, Math.min(200, Math.round(size)));
  const mouthRef = useRef<SVGPathElement>(null);
  const target = useRef(level);
  target.current = level;

  // Speaking: ease the mouth towards the latest level every frame (never jumpy).
  useEffect(() => {
    if (mood !== 'speaking') return;
    const el = mouthRef.current;
    if (!el) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      el.setAttribute('d', speakingMouth(0.35));
      return;
    }
    let current = 0.15;
    let raf = 0;
    const tick = () => {
      const goal = Math.max(0, Math.min(1, target.current));
      current += (goal - current) * 0.28;
      el.setAttribute('d', speakingMouth(current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mood]);

  const happy = mood === 'happy';
  const smileWide = mood === 'idle' || mood === 'wave' || happy;

  return (
    <span className={`enyo-av ${className ?? ''}`} data-mood={mood} aria-hidden="true" style={{ width: px, height: px }}>
      <style href="enyo-avatar" precedence="default">{CSS}</style>
      <svg width={px} height={px} viewBox="10 12 100 100" focusable="false" shapeRendering="geometricPrecision">
        <defs>
          <clipPath id={clip}><circle cx="60" cy="62" r="50" /></clipPath>
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

            {/* Neck and shoulders */}
            <path fill={TOP} d="M12 124C13.6 103.4 27.4 91.4 46.6 88.2L60 101.6L73.4 88.2C92.6 91.4 106.4 103.4 108 124Z" />
            <path fill={SKIN_SHADE} d="M47.2 88.1L60 100.9L72.8 88.1C70.4 87.4 68.6 86.6 68.5 85.6C66 89.2 62.8 90.6 60 90.6S54 89.2 51.5 85.6C51.4 86.6 49.6 87.4 47.2 88.1Z" />
            <path fill={TOP_SHADE} d="M46.6 88.2L60 101.6L73.4 88.2L76.2 88.8L60 105.2L43.8 88.8Z" />
            {/* A thin gold chain */}
            <path d="M51.2 88.6Q60 98.6 68.8 88.6" fill="none" stroke={GOLD} strokeWidth="1" strokeLinecap="round" opacity=".95" />
            <circle cx="60" cy="96" r="1.5" fill={GOLD} />

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
              <path fill={SKIN_DEEP} opacity=".55" d="M50.6 70C55 74.4 65 74.4 69.4 70V75.5C64.8 78.6 55.2 78.6 50.6 75.5Z" />
              {/* Ears and earrings */}
              <ellipse cx="37" cy="54" rx="3.6" ry="5" fill={SKIN_SHADE} />
              <ellipse cx="83" cy="54" rx="3.6" ry="5" fill={SKIN_SHADE} />
              <circle cx="37.2" cy="61.2" r="2.3" fill={GOLD} />
              <circle cx="82.8" cy="61.2" r="2.3" fill={GOLD} />
              <circle cx="36.6" cy="60.5" r=".75" fill={GOLD_SHINE} />
              <circle cx="82.2" cy="60.5" r=".75" fill={GOLD_SHINE} />

              {/* Face: round and full */}
              <path fill={SKIN} d="M60 26.5C74.6 26.5 84.2 37.4 84.2 52.2C84.2 67.4 73.8 77.2 60 77.2S35.8 67.4 35.8 52.2C35.8 37.4 45.4 26.5 60 26.5Z" />
              {/* Cheeks */}
              <ellipse cx="45.2" cy="61.6" rx="4.6" ry="2.8" fill="#d9725f" opacity={happy ? 0.5 : 0.32} />
              <ellipse cx="74.8" cy="61.6" rx="4.6" ry="2.8" fill="#d9725f" opacity={happy ? 0.5 : 0.32} />

              {/* Brows */}
              <g className="av-brows" fill="none" stroke={BROW} strokeWidth="2.3" strokeLinecap="round">
                <path className="av-brow-l" d="M43.4 43.4Q48.6 40 54.2 42.2" />
                <path className="av-brow-r" d="M65.8 42.2Q71.4 40 76.6 43.4" />
              </g>

              {/* Eyes */}
              {happy ? (
                <g fill="none" stroke={EYE} strokeWidth="2.2" strokeLinecap="round">
                  <path d="M45 51.6Q49 47 53 51.6" />
                  <path d="M67 51.6Q71 47 75 51.6" />
                </g>
              ) : (
                <>
                  <g className="av-eye" style={{ ['--ox' as string]: '49px' }}>
                    <ellipse cx="49" cy="50.6" rx="4.4" ry="3.6" fill="#fff" />
                    <g className="av-pupils">
                      <circle cx="49.3" cy="50.8" r="2.8" fill={EYE} />
                      <circle cx="50.4" cy="49.7" r=".95" fill="#fff" />
                    </g>
                    <path d="M44.2 50.2Q48.8 45.6 53.8 49.6L54.9 48.4" fill="none" stroke={EYE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                  <g className="av-eye" style={{ ['--ox' as string]: '71px' }}>
                    <ellipse cx="71" cy="50.6" rx="4.4" ry="3.6" fill="#fff" />
                    <g className="av-pupils">
                      <circle cx="71.3" cy="50.8" r="2.8" fill={EYE} />
                      <circle cx="72.4" cy="49.7" r=".95" fill="#fff" />
                    </g>
                    <path d="M75.8 50.2Q71.2 45.6 66.2 49.6L65.1 48.4" fill="none" stroke={EYE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                </>
              )}

              {/* Nose */}
              <path d="M57.2 58.8Q60 61.4 62.8 58.8" fill="none" stroke={SKIN_DEEP} strokeWidth="1.5" strokeLinecap="round" />
              <path d="M58.6 54.4Q58.2 56.8 57.6 57.8" fill="none" stroke={SKIN_SHADE} strokeWidth="1" strokeLinecap="round" opacity=".7" />

              {/* Mouth */}
              {mood === 'speaking' ? (
                <>
                  <path ref={mouthRef} d={speakingMouth(0.15)} fill={MOUTH} stroke={LIPS} strokeWidth="1.6" strokeLinejoin="round" />
                </>
              ) : smileWide ? (
                <g>
                  <path d={happy ? 'M50.6 64.2Q60 63 69.4 64.2Q67.6 74.6 60 74.6T50.6 64.2Z' : 'M51.6 64.6Q60 63.6 68.4 64.6Q66.8 72.6 60 72.6T51.6 64.6Z'} fill={MOUTH} />
                  <path d={happy ? 'M52.2 64.6Q60 63.8 67.8 64.6L67.2 66.8Q60 67.8 52.8 66.8Z' : 'M53 64.9Q60 64.1 67 64.9L66.5 66.7Q60 67.5 53.5 66.7Z'} fill="#fff" />
                  <path d={happy ? 'M50.6 64.2Q60 63 69.4 64.2Q67.6 74.6 60 74.6T50.6 64.2Z' : 'M51.6 64.6Q60 63.6 68.4 64.6Q66.8 72.6 60 72.6T51.6 64.6Z'} fill="none" stroke={LIPS} strokeWidth="1.7" strokeLinejoin="round" />
                </g>
              ) : mood === 'thinking' ? (
                <path d="M54.6 67.2Q60.6 68.6 65.8 65.2" fill="none" stroke={LIPS} strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M53.4 65.4Q60 70.4 66.6 65.4" fill="none" stroke={LIPS} strokeWidth="2.3" strokeLinecap="round" />
              )}

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
                  <path fill="none" stroke={HAIR_SHINE} strokeWidth="1.5" strokeLinecap="round" d="M55.4 27.4Q68.4 25.6 78.6 33.4" opacity=".95" />
                  <path fill="none" stroke={HAIR_SHINE} strokeWidth="1.1" strokeLinecap="round" d="M82.4 41.6Q85.4 47 85.4 52.6M38.6 37.6Q36.2 41.6 35.6 46" opacity=".75" />
                </g>
              )}

              {/* Round glasses (optional) */}
              {glasses ? (
                <g fill="none" stroke="#7a4a2c" strokeWidth="1.7">
                  <circle cx="49" cy="51" r="7.4" fill="#ffffff" fillOpacity=".08" />
                  <circle cx="71" cy="51" r="7.4" fill="#ffffff" fillOpacity=".08" />
                  <path d="M56.4 50.4Q60 48.6 63.6 50.4M41.6 50L36.6 48.4M78.4 50L83.4 48.4" strokeLinecap="round" />
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
