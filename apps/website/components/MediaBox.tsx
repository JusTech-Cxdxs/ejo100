import type { CSSProperties } from 'react';

const FALLBACK_GRADIENT =
  'radial-gradient(circle at 20% 20%, rgba(225,6,0,0.55), transparent 55%),' +
  'radial-gradient(circle at 80% 30%, rgba(180,0,0,0.5), transparent 50%),' +
  'radial-gradient(circle at 50% 90%, rgba(15,23,42,0.6), transparent 60%),' +
  'linear-gradient(135deg, #2a0606 0%, #4a0a0a 50%, #1a0404 100%)';

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
        backgroundImage: `url('${src}'), ${FALLBACK_GRADIENT}`,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center center, center center',
        backgroundRepeat: 'no-repeat, no-repeat',
        ...style,
      }}
    />
  );
}
