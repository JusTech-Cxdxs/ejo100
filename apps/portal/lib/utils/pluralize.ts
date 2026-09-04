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

/** The word alone, no count prefix — for the real cases where a count
 * and its unit already live in two separate places (a table's own
 * Qty and Unit columns, for instance) and gluing them back into one
 * "5 Liters" string would be wrong there. Same "+s" default rule as
 * pluralize() above; pass the real plural for anything irregular. */
export function pluralizeWord(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
