/** Units delivered against units contracted, as a bar with the percentage. */
export function DeliveryProgress({ progress, compact = false }: { progress: { ordered: number; delivered: number; percent: number }; compact?: boolean }) {
  const tone = progress.percent >= 100 ? 'var(--ejo-success)' : progress.percent > 0 ? 'var(--ejo-primary)' : 'var(--ejo-text-muted)';
  return (
    <div className={compact ? 'min-w-[120px]' : ''} aria-label={`Delivered ${progress.delivered} of ${progress.ordered} units`}>
      <div className="flex items-center justify-between text-xs text-[var(--ejo-text-muted)]">
        <span>{progress.delivered.toLocaleString('en-NG')} of {progress.ordered.toLocaleString('en-NG')} units</span>
        <span className="font-medium text-[var(--ejo-text)]">{progress.percent}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--ejo-bg)] ring-1 ring-[var(--ejo-border)]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${progress.percent}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}
