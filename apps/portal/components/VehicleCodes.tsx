import { code128Bars } from '@/lib/barcode/code128';
import { qrSvgPath } from '@/lib/barcode/qr';

/**
 * A vehicle's two codes, drawn as SVG (sharp on screen and in print at any
 * size): the QR code opens the vehicle's page from a phone; the Code 128
 * barcode holds the VIN itself, for handheld scanners. Black on white, with
 * their quiet zones, whatever the page's theme.
 */
export function QrCode({ value, size, label }: { value: string; size: string; label: string }) {
  const { path, modules } = qrSvgPath(value);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${modules} ${modules}`} width={size} height={size} shapeRendering="crispEdges" style={{ display: 'block', background: '#fff' }}>
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/**
 * `width` for print (millimetres: bars at least 0.24 mm), or `moduleSize`
 * for screens: whole pixels per bar unit, so every bar edge is sharp and a
 * scanner can read it off a monitor (shrinks only where the screen is narrower).
 */
export function Code128({ value, width, moduleSize, height, label, showText = true }: { value: string; width?: string; moduleSize?: number; height: string; label: string; showText?: boolean }) {
  const { bars, modules } = code128Bars(value);
  const w = moduleSize ? `${modules * moduleSize}px` : width ?? '100%';
  return (
    <figure style={{ margin: 0, display: 'inline-block', background: '#fff', maxWidth: '100%' }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${modules} 40`} width={w} height={height} style={{ display: 'block', maxWidth: '100%' }} preserveAspectRatio="none" shapeRendering="crispEdges">
        <rect width={modules} height={40} fill="#fff" />
        {bars.map(([x, w]) => <rect key={x} x={x} y={0} width={w} height={40} fill="#000" />)}
      </svg>
      {showText ? <figcaption style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '0.8em', letterSpacing: '0.12em', textAlign: 'center', color: '#000' }}>{value}</figcaption> : null}
    </figure>
  );
}
