/**
 * The standard, project-wide way to phrase any count-dependent noun —
 * "1 day" / "2 days", never the placeholder "day(s)" form. Applies
 * everywhere a count and a noun appear together: dashboard messages,
 * emails, audit entries, anywhere else added later.
 *
 * Irregular plurals (e.g. "child" → "children") aren't handled by the
 * default "+s" rule — pass the real plural explicitly when the noun
 * needs one.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}
