'use client';

interface EjoSpinnerProps {
  size?: number;
}

/**
 * Compact inline spinner for buttons and small loading states — the same
 * EJO diamond mark and accent colour as EjoLoader.tsx's full-screen
 * version, just small enough to sit inside a button next to text.
 */
export function EjoSpinner({ size = 16 }: EjoSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
