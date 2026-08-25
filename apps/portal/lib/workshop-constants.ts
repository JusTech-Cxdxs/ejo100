/**
 * Plain constants shared by Workshop UI and Server Actions — deliberately
 * NOT a 'use server' file, unlike workshop.ts. A 'use server' file may
 * only export async functions; this exact constant used to live in
 * workshop.ts and broke the build the moment it needed to be imported
 * by a page ("A 'use server' file can only export async functions,
 * found object" — an exported array is an object, not a function).
 * Anything that's plain data, not an action, belongs here instead.
 */

/** Common Internal Job descriptions shown as suggestions, not a
 * closed list — every one of these fields stays a free-text input with
 * a `<datalist>`, matching the same "suggest, don't restrict" pattern
 * already used for vehicle Make/Model. Kept here as the one place this
 * list is maintained, not duplicated between server validation (there
 * isn't any — free text is always allowed) and the UI. Named for
 * INTERNAL_JOB specifically, not LABOUR — the two are genuinely
 * separate types (LABOUR is the company's own general labour/time
 * charge; these are named services the workshop performs). */
export const COMMON_INTERNAL_JOB_DESCRIPTIONS = [
  'Wheel Alignment',
  'Wheel Balancing',
  'Body Job',
  'Painting',
  'Gas / AC Refill',
  'Engine Overhauling',
  'Battery Charging',
  'Injector Servicing (Diesel)',
];
