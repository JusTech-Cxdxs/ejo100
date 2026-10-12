/**
 * "Powered by EJO 100" — the platform mark (the EJO hexagon, its core gently
 * pulsing, a dashed orbit turning slowly around it) beside the shimmering
 * credit. The same signature in the sidebar and on every sign-in page. Pure
 * CSS animation (globals.css), so it costs nothing to run, and it stops for
 * people who prefer reduced motion.
 */
export function PoweredByEjo({ tone = 'default', size = 'md' }: { tone?: 'default' | 'onDark'; size?: 'md' | 'lg' }) {
  const dark = tone === 'onDark';
  const px = size === 'lg' ? 30 : 22;
  return (
    <div className="flex items-center gap-2.5" aria-label="Powered by EJO 100 Enterprise Platform">
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
        <circle className="ejo-orbit" cx="12" cy="12" r="11" stroke="var(--ejo-accent)" strokeOpacity={dark ? 0.6 : 0.45} strokeWidth="1" strokeDasharray="3 3" />
        <path d="M12 4 L19 8 V16 L12 20 L5 16 V8 Z" stroke="var(--ejo-accent)" strokeWidth="1.5" fill="var(--ejo-accent)" fillOpacity="0.14" />
        <circle className="ejo-core" cx="12" cy="12" r="2.6" fill="var(--ejo-accent)" />
      </svg>
      <div className="leading-tight">
        <p className={`text-[10px] font-medium uppercase tracking-[0.14em] ${dark ? 'text-white/55' : 'text-[var(--ejo-text-muted)]'}`}>Powered by</p>
        <p className={`${dark ? 'ejo-shimmer' : 'ejo-shimmer-soft'} font-bold ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>EJO 100 Enterprise Platform</p>
      </div>
    </div>
  );
}
