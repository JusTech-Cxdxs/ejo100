/**
 * Original line-art silhouettes for the store: an SUV, a pickup, a light
 * truck, a minibus, a tyre and a parts box, drawn here (no manufacturer
 * pictures), on a tinted ground. The real photographs come from the
 * organisation's own media when the store goes live.
 */
export type ArtKind = 'suv' | 'pickup' | 'truck' | 'minibus' | 'tyre' | 'part' | 'battery' | 'oil';

const TINT: Record<string, [string, string]> = {
  SOUEAST: ['#0b2416', '#22983f'], Isuzu: ['#1a1f2b', '#c0392b'], Foton: ['#0f1f2e', '#2f6e8a'], Bridgestone: ['#1a1a1a', '#555'], Firestone: ['#2a0a0a', '#b3261e'], Bosch: ['#1a1a1a', '#c0392b'], Genuine: ['#0b2416', '#3f6b52'],
};

function Body({ kind }: { kind: ArtKind }) {
  const s = { fill: 'none', stroke: 'white', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'suv': return (<g {...s}><path d="M40 118h240l14-10v-26l-22-8-42-36H98l-40 34-18 8v30z" /><path d="M98 38l-26 32h150l-34-32z" fill="rgba(255,255,255,0.12)" /><path d="M140 70V40M60 118v12h22v-12M238 118v12h22v-12" /><circle cx="86" cy="118" r="20" fill="#0b0b0b" /><circle cx="86" cy="118" r="9" /><circle cx="250" cy="118" r="20" fill="#0b0b0b" /><circle cx="250" cy="118" r="9" /><path d="M40 96h18M276 96h16" /></g>);
    case 'pickup': return (<g {...s}><path d="M32 118h258v-30h-82V54l-18-16H98l-36 36H40l-8 14z" /><path d="M98 38l-28 36h78V38z" fill="rgba(255,255,255,0.12)" /><path d="M208 88V58M148 74V40" /><circle cx="84" cy="118" r="20" fill="#0b0b0b" /><circle cx="84" cy="118" r="9" /><circle cx="236" cy="118" r="20" fill="#0b0b0b" /><circle cx="236" cy="118" r="9" /></g>);
    case 'truck': return (<g {...s}><path d="M30 118h260V48H176l-10-14H112l-16 14H56L30 84z" /><path d="M56 48h60v36H38z" fill="rgba(255,255,255,0.12)" /><path d="M116 48v70M176 48v70" /><circle cx="78" cy="118" r="20" fill="#0b0b0b" /><circle cx="78" cy="118" r="9" /><circle cx="214" cy="118" r="20" fill="#0b0b0b" /><circle cx="214" cy="118" r="9" /><circle cx="258" cy="118" r="20" fill="#0b0b0b" /><circle cx="258" cy="118" r="9" /></g>);
    case 'minibus': return (<g {...s}><path d="M36 118h256V60l-18-24H78L36 76z" /><path d="M80 40L46 76h64V40zM120 40v36h50V40zM180 40v36h50V40zM240 40l24 36h-24z" fill="rgba(255,255,255,0.12)" /><path d="M120 118V76M180 118V76" /><circle cx="84" cy="118" r="20" fill="#0b0b0b" /><circle cx="84" cy="118" r="9" /><circle cx="244" cy="118" r="20" fill="#0b0b0b" /><circle cx="244" cy="118" r="9" /></g>);
    case 'tyre': return (<g {...s}><circle cx="160" cy="84" r="58" fill="#0b0b0b" /><circle cx="160" cy="84" r="58" /><circle cx="160" cy="84" r="34" fill="rgba(255,255,255,0.1)" /><circle cx="160" cy="84" r="10" /><path d="M160 26v18M160 124v18M102 84h18M200 84h18M119 43l12 12M189 113l12 12M201 43l-12 12M131 113l-12 12" /></g>);
    case 'part': return (<g {...s}><path d="M80 60l80-30 80 30v70l-80 30-80-30z" /><path d="M80 60l80 30 80-30M160 90v70" /><path d="M120 45l80 30" strokeDasharray="4 8" /></g>);
    case 'battery': return (<g {...s}><rect x="70" y="56" width="180" height="96" rx="8" /><path d="M100 56V40h30v16M190 56V40h30v16M100 100h28M192 100h28M206 86v28" /><rect x="70" y="56" width="180" height="20" fill="rgba(255,255,255,0.12)" /></g>);
    case 'oil': return (<g {...s}><path d="M120 150h80V72l16-14V40h-28l-10 10h-48l-10-10h-28v18l16 14z" /><path d="M136 96h48M136 116h48" /><rect x="112" y="40" width="96" height="12" fill="rgba(255,255,255,0.12)" /></g>);
  }
}

import { useId } from 'react';

export function VehicleArt({ kind, brand, className = '', label }: { kind: ArtKind; brand: string; className?: string; label?: string }) {
  const [a, b] = TINT[brand] ?? TINT.Genuine!;
  const id = useId();
  return (
    <svg viewBox="0 0 320 180" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${id})`} />
      <ellipse cx="160" cy="146" rx="120" ry="10" fill="rgba(0,0,0,0.25)" />
      <Body kind={kind} />
    </svg>
  );
}
