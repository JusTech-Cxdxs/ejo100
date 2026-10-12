/** Calm skeleton while a portal page loads. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-36 rounded-[var(--ejo-radius-xl)] bg-[var(--ejo-surface)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-surface)]" />)}
      </div>
      <div className="h-64 rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-surface)]" />
    </div>
  );
}
