/**
 * Plain constants shared by Workshop UI and Server Actions — deliberately
 * NOT a 'use server' file, unlike workshop.ts. A 'use server' file may
 * only export async functions; this exact constant used to live in
 * workshop.ts and broke the build the moment it needed to be imported
 * by a page ("A 'use server' file can only export async functions,
 * found object" — an exported array is an object, not a function).
 * Anything that's plain data, not an action, belongs here instead.
 */

/** Common description suggestions for the estimate line-item description
 * field, shared across every type (Internal Job, Labour, etc.) since
 * the datalist can't dynamically swap based on which type is currently
 * selected without client JS — not a closed list, every field stays
 * free-text with a `<datalist>`, matching the same "suggest, don't
 * restrict" pattern already used for vehicle Make/Model. Kept here as
 * the one place this list is maintained, not duplicated between server
 * validation (there isn't any — free text is always allowed) and the
 * UI. The Labour entries are directly evidenced, not guessed — an
 * actual Kewalram paper estimate shows "Labour for Service" and
 * "Labour for Brake" as real, separate line items. */
export const COMMON_ESTIMATE_LINE_DESCRIPTIONS = [
  'Wheel Alignment',
  'Wheel Balancing',
  'Body Job',
  'Painting',
  'Gas / AC Refill',
  'Engine Overhauling',
  'Battery Charging',
  'Injector Servicing (Diesel)',
  'Labour for Service',
  'Labour for Brake',
];

/** Company bank details shown to customers for the deposit payment —
 * a real placeholder, not a guessed value: the account number is
 * deliberately "XXX" until the real one is supplied. No company-wide
 * settings model exists yet to store this properly (same standing gap
 * as the Users/Roles admin pages elsewhere in this project); once one
 * does, this moves there instead of living as a hardcoded constant.
 * Kept in one place so it's trivial to update everywhere it's used
 * once the real account number is known. */
export const COMPANY_BANK_DETAILS = {
  bankName: 'Zenith Bank',
  accountName: 'Kewalram Nigeria',
  accountNumber: 'XXX',
};

/** The minimum deposit required before work begins, as a fraction of
 * the total estimate — kept as one named constant so the 70% figure
 * (and the exact amount computed from it) is never duplicated or
 * allowed to drift between the email and the dashboard. */
export const MINIMUM_DEPOSIT_FRACTION = 0.7;
