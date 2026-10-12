/**
 * The EJO mark, animated — the page-level loading indicator (content area
 * only; EjoLoader is the full-screen first-load takeover). Pure CSS
 * animation (globals.css: ejo-spin, ejo-glow, ejo-core), so the animation
 * library is never downloaded just to show a spinner on every page.
 */
export function EjoMarkSpinner({ size = 64 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} role="status" aria-label="Loading">
      <div className="ejo-glow absolute inset-0 rounded-full blur-xl" style={{ background: 'var(--ejo-accent)' }} />
      <div className="ejo-spin absolute inset-1 rounded-full border-2 border-dashed opacity-50" style={{ borderColor: 'var(--ejo-accent)' }} />
      <div className="relative z-10 flex items-center justify-center rounded-full bg-[var(--ejo-primary)]/10" style={{ width: size * 0.55, height: size * 0.55 }}>
        <svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" stroke="var(--ejo-accent)" strokeWidth="1.5" fill="var(--ejo-accent)" fillOpacity="0.15" />
          <circle className="ejo-core" cx="12" cy="12" r="3" fill="var(--ejo-accent)" />
        </svg>
      </div>
    </div>
  );
}
