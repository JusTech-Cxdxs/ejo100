/**
 * "Powered by EJO 100" — the platform mark (the EJO hexagon, its core gently
 * pulsing, an orbit turning slowly around it) beside the shimmering credit,
 * the same signature as the sign-in page. Pure CSS animation (globals.css),
 * so it costs nothing to run and stops for people who prefer reduced motion.
 */
export function PoweredByEjo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="Powered by EJO 100 Enterprise Platform">
      <svg width={compact ? 18 : 22} height={compact ? 18 : 22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="ejo-orbit" cx="12" cy="12" r="11" stroke="var(--ejo-primary)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M12 4 L19 8 V16 L12 20 L5 16 V8 Z" stroke="var(--ejo-primary)" strokeWidth="1.5" fill="var(--ejo-primary)" fillOpacity="0.12" />
        <circle className="ejo-core" cx="12" cy="12" r="2.6" fill="var(--ejo-primary)" />
      </svg>
      <div className="leading-tight">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ejo-text-muted)]">Powered by</p>
        <p className="ejo-shimmer-soft text-xs font-bold">EJO 100 Enterprise Platform</p>
      </div>
    </div>
  );
}
