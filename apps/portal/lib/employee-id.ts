/**
 * Employee IDs — short, memorable, and they say where the person belongs.
 *
 * Format:  ORG-BRANCH-NNNN   e.g.  KN-ISO-0007
 *   ORG     the organisation's initials (2–3 letters: "Kewalram Nigeria" → KN)
 *   BRANCH  the branch's code (its own short code when set, otherwise three
 *           letters from its name: "Isolo Branch" → ISO, "Victoria Island" → VI)
 *   NNNN    a running number within that branch prefix, never reused
 *
 * Common practice for staff numbers: a fixed company/location prefix plus a
 * sequential, zero-padded number; no personal data (no birth dates, no
 * initials of the person) so the ID never has to change and reveals nothing.
 * Issued by the server only — nobody types or chooses one.
 */
const FILLER = new Set(['branch', 'the', 'of', 'and', 'office', 'workshop', 'ltd', 'limited', 'plc', 'nigeria', 'group', 'hq', 'head']);

function lettersOf(v: string): string {
  return v.normalize('NFKD').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
}

/** "Kewalram Nigeria" → "KN"; one-word names give their first three letters. */
export function organisationCode(name: string): string {
  const words = lettersOf(name).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'EJO';
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w.charAt(0)).join('').toUpperCase();
}

/** The branch part: its own code when set ("KWL-WS" → "KWLWS" → first 4), otherwise from its name. */
export function branchCode(name: string, code?: string | null): string {
  const own = (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (own.length >= 2) return own.slice(0, 4);
  const words = lettersOf(name).split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
  const pick = meaningful.length ? meaningful : words;
  if (pick.length === 0) return 'BR';
  if (pick.length === 1) return pick[0]!.slice(0, 3).toUpperCase().padEnd(3, 'X');
  return pick.slice(0, 3).map((w) => w.charAt(0)).join('').toUpperCase();
}

export function employeeIdPrefix(organisationName: string, branchName: string, branchOwnCode?: string | null): string {
  return `${organisationCode(organisationName)}-${branchCode(branchName, branchOwnCode)}`;
}

export function formatEmployeeId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/** The running number at the end of an ID with this prefix (null when it is not one of ours). */
export function sequenceOf(prefix: string, employeeId: string): number | null {
  if (!employeeId.startsWith(`${prefix}-`)) return null;
  const rest = employeeId.slice(prefix.length + 1);
  return /^\d{1,9}$/.test(rest) ? Number(rest) : null;
}
