/**
 * A blinking dot beside "On hand" while stock sits at or below a level:
 * red at or below safety stock (urgent), amber at or below the reorder
 * point (time to reorder). It disappears on its own once stock rises
 * above the level.
 */
export function stockLevel(onHand: number, reorderPoint: number | null, safetyStock: number | null): 'SAFETY' | 'REORDER' | null {
  if (safetyStock !== null && safetyStock > 0 && onHand <= safetyStock) return 'SAFETY';
  if (reorderPoint !== null && reorderPoint > 0 && onHand <= reorderPoint) return 'REORDER';
  return null;
}

export function StockLevelDot({ level }: { level: 'SAFETY' | 'REORDER' | null }) {
  if (!level) return null;
  const colour = level === 'SAFETY' ? 'bg-[var(--ejo-error)]' : 'bg-[var(--ejo-warning)]';
  const title = level === 'SAFETY' ? 'At or below safety stock — restock urgently' : 'At or below the reorder point — time to reorder';
  return (
    <span className="relative ml-2 inline-flex h-2.5 w-2.5 align-middle" title={title} aria-label={title}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${colour}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colour}`} />
    </span>
  );
}
