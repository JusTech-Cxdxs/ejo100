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
 * A photo from `src` over the site gradient (two background-image layers).
 * If the photo is missing, the gradient shows instead of a broken image.
 */
export function MediaBox({ src, alt, className, style }: MediaBoxProps) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{
        // The address is quoted into CSS: encode it, so a quote or semicolon in a path can never add a declaration.
        backgroundImage: `url("${encodeURI(src).replace(/["\\]/g, '')}"), ${FALLBACK_GRADIENT}`,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center center, center center',
        backgroundRepeat: 'no-repeat, no-repeat',
        ...style,
      }}
    />
  );
}
