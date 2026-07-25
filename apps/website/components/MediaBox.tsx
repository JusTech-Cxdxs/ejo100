import type { CSSProperties } from 'react';

const FALLBACK_GRADIENT =
  'radial-gradient(circle at 20% 20%, rgba(34,197,94,0.55), transparent 55%),' +
  'radial-gradient(circle at 80% 30%, rgba(21,128,61,0.5), transparent 50%),' +
  'radial-gradient(circle at 50% 90%, rgba(15,23,42,0.6), transparent 60%),' +
  'linear-gradient(135deg, #0f2417 0%, #143d24 50%, #0b1a11 100%)';

interface MediaBoxProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a real photo from `src` with the site's signature gradient
 * automatically showing through as a fallback for any image that hasn't
 * been uploaded yet. Works via CSS's multi-layer background-image: the
 * gradient is always painted; the photo layer sits on top and, if it
 * 404s, is simply transparent — so the gradient shows through with zero
 * "broken image" icons anywhere on the site. Once the real file exists
 * at `src`, it displays automatically — no code change required.
 */
export function MediaBox({ src, alt, className, style }: MediaBoxProps) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{
        backgroundImage: `url('${src}'), ${FALLBACK_GRADIENT}`,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center center, center center',
        backgroundRepeat: 'no-repeat, no-repeat',
        ...style,
      }}
    />
  );
}
