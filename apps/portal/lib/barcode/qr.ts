/**
 * QR codes, as a grid of dark modules: drawn as SVG (pages, labels) or as
 * rectangles in a PDF. Error correction M (15%): a label can be scuffed or
 * partly covered and still scan. Built on the `qrcode` package (MIT).
 */
import QRCode from 'qrcode';

/** Quiet zone each side, in modules (the standard asks for 4). */
export const QR_QUIET = 4;

export type QrMatrix = { size: number; dark: (row: number, col: number) => boolean; version: number };

export function qrMatrix(text: string): QrMatrix {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size } = q.modules;
  return { size, version: q.version, dark: (r, c) => Boolean(q.modules.get(r, c)) };
}

/** One SVG path of every dark module (quiet zone included in the view box): crisp at any size, small to send. */
export function qrSvgPath(text: string): { path: string; modules: number } {
  const m = qrMatrix(text);
  let d = '';
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) { c++; continue; }
      const start = c;
      while (c < m.size && m.dark(r, c)) c++;
      d += `M${start + QR_QUIET} ${r + QR_QUIET}h${c - start}v1h-${c - start}z`;
    }
  }
  return { path: d, modules: m.size + 2 * QR_QUIET };
}
