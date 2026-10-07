/**
 * A person's avatar: their initials on a colour picked from their name (the
 * same person always gets the same colour), with an optional activity dot.
 * No uploaded photos in version 1 — nothing to store, nothing to moderate.
 */
import { initialsOf, colourOf } from '@/lib/avatar';

export function Avatar({ name, size = 40, active }: { name: string; size?: number; active?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white"
        style={{ background: colourOf(name.trim().toLowerCase()), fontSize: Math.max(10, Math.round(size * 0.38)) }}
        aria-hidden="true"
      >
        {initialsOf(name)}
      </span>
      {active === undefined ? null : (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[var(--ejo-bg)] ${active ? 'bg-[var(--ejo-success)]' : 'bg-[var(--ejo-text-muted)]'}`}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
          title={active ? 'Active' : 'Switched off'}
        />
      )}
    </span>
  );
}
