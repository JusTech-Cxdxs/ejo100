/**
 * @ejo/utils
 * Small framework-agnostic helpers shared across apps.
 */

/** Turns "Isolo Branch" -> "isolo-branch" for slugs / routing / doc codes. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Builds a document reference number from a branch code, a template code,
 * and a running sequence — e.g. buildDocumentCode('KWL-WS', 'JOB', 45, 2026)
 * -> "KWL-WS-JOB-2026-00045". Central so every module numbers documents the
 * same way instead of each module inventing its own format.
 */
export function buildDocumentCode(
  branchCode: string,
  templateCode: string,
  sequence: number,
  year: number = new Date().getFullYear(),
): string {
  const padded = String(sequence).padStart(5, '0');
  return `${branchCode}-${templateCode}-${year}-${padded}`;
}

export function formatCurrency(amount: number, currency: string = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amount);
}
