export function PoweredByBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z"
          stroke="var(--ejo-accent)"
          strokeWidth="1.5"
          fill="rgba(34,197,94,0.15)"
        />
        <circle cx="12" cy="12" r="3" fill="var(--ejo-accent)" />
      </svg>
      <span className="ejo-shimmer text-xs font-semibold">Powered by EJO 100 Enterprise Platform</span>
    </div>
  );
}
