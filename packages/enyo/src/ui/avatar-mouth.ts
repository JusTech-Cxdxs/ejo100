/**
 * Enyo's lips, as geometry (no React, so it can be unit-tested): closed in
 * every mood but speaking, parting with each syllable while speaking.
 */
export type EnyoMood = 'idle' | 'wave' | 'listening' | 'thinking' | 'speaking' | 'happy';

/** How much each mood smiles with closed lips (0 = neutral, 1 = a wide smile). */
export const SMILE: Record<EnyoMood, number> = { idle: 0.55, wave: 0.75, listening: 0.3, thinking: 0.05, speaking: 0.35, happy: 1 };

export type MouthShape = { upper: string; inner: string; lower: string; teethH: number; tongueY: number; tongueRx: number; tongueRy: number; shineY: number; open: number };

export const f = (n: number) => +n.toFixed(2);

/**
 * The lips for an openness (0 closed .. 1 wide) and a smile (0..1). Closed,
 * the lips meet along one line; open, the lower lip and jaw drop and the
 * inside of the mouth shows. Exported for the unit test.
 */
export function mouthShape(openIn: number, smileIn: number): MouthShape {
  const open = Math.max(0, Math.min(1, openIn));
  const smile = Math.max(0, Math.min(1, smileIn));
  const w = 6.4 + smile * 0.9 - open * 0.7; // half-width
  const L = 60 - w;
  const R = 60 + w;
  const cy = 66 - smile * 0.95 + open * 0.15; // the corners lift as she smiles
  const gap = open * 5.4;
  const lineMid = cy + 0.35 + smile * 0.55; // the lip line dips in the middle: a smile
  const ctl = (mid: number) => f(2 * mid - cy); // quadratic control for a curve through `mid`
  // A rounder (U-shaped) cubic through `mid`, from the right corner back to the left.
  const cub = (mid: number, l = L, r = R) => { const c = f((mid - 0.25 * cy) / 0.75); return `C${f(r - (r - l) * 0.22)} ${c} ${f(l + (r - l) * 0.22)} ${c} ${f(l)} ${f(cy)}`; };
  const innerMid = lineMid + gap;
  const lowerMid = innerMid + 2.9 - smile * 0.25 - open * 0.4;
  const upper = `M${f(L)} ${f(cy)}C${f(60 - w * 0.72)} ${f(cy - 1.75)} ${f(60 - w * 0.34)} ${f(cy - 2.05 + smile * 0.2)} 59.3 ${f(cy - 1.45 + smile * 0.15)}Q60 ${f(cy - 1.05 + smile * 0.15)} 60.7 ${f(cy - 1.45 + smile * 0.15)}C${f(60 + w * 0.34)} ${f(cy - 2.05 + smile * 0.2)} ${f(60 + w * 0.72)} ${f(cy - 1.75)} ${f(R)} ${f(cy)}Q60 ${ctl(lineMid)} ${f(L)} ${f(cy)}Z`;
  const inner = `M${f(L)} ${f(cy)}Q60 ${ctl(lineMid)} ${f(R)} ${f(cy)}${cub(innerMid)}Z`;
  // The lower lip: its top edge is the mouth's lower edge (reversed), its bottom a fuller curve.
  const innerC = f((innerMid - 0.25 * cy) / 0.75);
  const lower = `M${f(L)} ${f(cy)}C${f(L + (R - L) * 0.22)} ${innerC} ${f(R - (R - L) * 0.22)} ${innerC} ${f(R)} ${f(cy)}${cub(lowerMid)}Z`;
  return {
    upper,
    inner,
    lower,
    teethH: open < 0.12 ? 0 : f(Math.max(0, lineMid - 62) + Math.min(1.5, 0.4 + gap * 0.3)),
    tongueY: f(innerMid - 0.6),
    tongueRx: f(open < 0.25 ? 0 : 1.6 + open * 2),
    tongueRy: f(open < 0.25 ? 0 : 0.6 + open * 0.9),
    shineY: f((innerMid + lowerMid) / 2 + 0.1),
    open,
  };
}

/** A natural syllable rhythm (0..1) so even a steady level opens and closes the lips. */
export function syllable(t: number): number {
  const a = Math.sin(t * 2 * Math.PI * 3.9);
  const b = Math.sin(t * 2 * Math.PI * 6.3 + 1.3);
  return Math.max(0, Math.min(1, 0.5 + 0.38 * a + 0.24 * b));
}
