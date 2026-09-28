/** Turn an internal audit code ("part.warranty_policy_set") into readable
 * words ("Part warranty policy set") — the fallback whenever a screen has
 * no hand-written label, so no dots or underscores ever reach users. */
export function humanizeAction(action: string): string {
  const words = action.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
