/**
 * Code 128 (code set B), the barcode every handheld scanner reads. Pure.
 *
 * A VIN is upper-case letters and digits, all in code set B. The symbol is:
 * quiet zone, Start B, the characters, the modulo-103 check character, Stop,
 * quiet zone. Each character is 3 bars and 3 spaces, 11 modules wide (Stop:
 * 4 bars, 3 spaces, 13 modules).
 */

/** Widths (bar, space, bar, space, bar, space) of values 0–105; 106 is Stop. */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;
/** Quiet zone each side, in modules (the standard asks for at least 10). */
export const CODE128_QUIET = 10;

export type Code128 = {
  /** The values written: Start B, the characters, the check character, Stop. */
  values: number[];
  /** Alternating bar / space widths in modules, starting with a bar (no quiet zones). */
  widths: number[];
  /** Total width in modules, with both quiet zones. */
  modules: number;
};

/** Encodes printable ASCII (space to ~) in code set B. Throws on anything else. */
export function encodeCode128B(text: string): Code128 {
  if (!text) throw new Error('Nothing to encode.');
  const values = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`Code 128 B cannot hold "${ch}".`);
    values.push(c - 32);
  }
  let sum = START_B;
  for (let i = 1; i < values.length; i++) sum += values[i]! * i;
  values.push(sum % 103, STOP);
  const widths = values.flatMap((v) => [...CODE128_PATTERNS[v]!].map(Number));
  return { values, widths, modules: widths.reduce((a, b) => a + b, 0) + 2 * CODE128_QUIET };
}

/** Bars as [x, width] in modules from the left edge (quiet zone included): what an SVG or PDF draws. */
export function code128Bars(text: string): { bars: [number, number][]; modules: number } {
  const { widths, modules } = encodeCode128B(text);
  const bars: [number, number][] = [];
  let x = CODE128_QUIET;
  widths.forEach((w, i) => { if (i % 2 === 0) bars.push([x, w]); x += w; });
  return { bars, modules };
}
