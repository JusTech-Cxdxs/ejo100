/**
 * "1st" / "2nd" / "3rd" / "4th" — the standard, correct English
 * ordinal suffix for a positive integer. Used for "this is our 1st
 * reminder" / "this is our 2nd reminder" style language, so it never
 * has to be hand-written per call site.
 */
export function ordinal(n: number): string {
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
