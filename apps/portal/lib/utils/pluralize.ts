/**
 * The one way to phrase a count with its noun: "1 day" / "2 days",
 * "1 person" / "3 people", never "day(s)" or "1 jobs". Used by pages,
 * audit entries and dashboards alike.
 *
 * The plural follows English rules for the LAST word of the phrase
 * ("serial number" → "serial numbers", "entry" → "entries", "pass" →
 * "passes", "person" → "people") and keeps its letter case ("REF" →
 * "REFS", "Job Card" → "Job Cards"). Pass the plural yourself for anything
 * unusual; an explicit plural always wins.
 */
const IRREGULAR: Record<string, string> = {
  person: 'people', child: 'children', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', mouse: 'mice',
  // Same in the plural.
  staff: 'staff', equipment: 'equipment', information: 'information', feedback: 'feedback', series: 'series', sheep: 'sheep',
  km: 'km', kg: 'kg', min: 'min', h: 'h', ms: 'ms',
  // Units of measure typed on parts.
  each: 'each', ea: 'ea', pc: 'pcs', l: 'l', ml: 'ml', ltr: 'ltr', g: 'g', m: 'm', mm: 'mm', cm: 'cm', ft: 'ft',
  // Words ending in -o and -f that take -es / -ves.
  hero: 'heroes', potato: 'potatoes', tomato: 'tomatoes', echo: 'echoes', leaf: 'leaves', half: 'halves', shelf: 'shelves', life: 'lives', knife: 'knives', wife: 'wives',
};

function matchCase(word: string, model: string): string {
  if (model.length > 1 && model === model.toUpperCase() && /[A-Z]/.test(model)) return word.toUpperCase();
  if (model[0] && model[0] === model[0].toUpperCase() && /[A-Z]/.test(model[0])) return word.charAt(0).toUpperCase() + word.slice(1);
  return word;
}

/** The plural of a noun or noun phrase (only its last word changes). */
export function pluralOf(singular: string): string {
  const m = /^(.*?)([A-Za-z]+)$/.exec(singular);
  if (!m) return `${singular}s`;
  const head = m[1]!;
  const word = m[2]!;
  const lower = word.toLowerCase();
  let plural: string;
  if (IRREGULAR[lower] !== undefined) plural = IRREGULAR[lower]!;
  // Already plural ("Pcs", "Litres", "chassis"): left as it is. A singular in -ss/-us ("pass", "bus") still changes.
  else if (/[^su]s$/.test(lower)) plural = lower;
  else if (/[^aeiou]y$/.test(lower)) plural = `${lower.slice(0, -1)}ies`;
  else if (/(s|x|z|ch|sh)$/.test(lower)) plural = `${lower}es`;
  else plural = `${lower}s`;
  return head + matchCase(plural, word);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralizeWord(count, singular, plural)}`;
}

/** The word alone, no count: for a table whose Qty and Unit sit in separate columns. */
export function pluralizeWord(count: number, singular: string, plural?: string): string {
  // Only exactly one is singular: "0 jobs", "1 job", "1.5 days", "-1 days".
  return count === 1 ? singular : (plural ?? pluralOf(singular));
}
