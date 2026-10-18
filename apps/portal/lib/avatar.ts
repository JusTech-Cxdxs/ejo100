/** Initials and a stable colour for a person's avatar (pure — see components/Avatar.tsx). */
const PALETTE = ['#e10600', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#65a30d', '#b45309', '#0d9488'];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

export function colourOf(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

