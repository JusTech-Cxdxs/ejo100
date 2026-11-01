/**
 * Vehicle identification numbers. Pure.
 *
 * A VIN (ISO 3779) is 17 characters from 0–9 and A–Z without I, O and Q
 * (they read as 1 and 0). EJO keeps every chassis number it is given —
 * older and imported vehicles do not always have a 17-character VIN — and
 * matches them all the same way: upper case, without spaces or dashes.
 */

/** The VIN as EJO matches it: upper case, no spaces, dashes or dots. */
export function normaliseVin(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
}

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;
/** A full modern VIN: exactly 17 characters, never I, O or Q. */
export function isVin(raw: string | null | undefined): boolean {
  return VIN_CHARS.test(normaliseVin(raw));
}

/** What may name a vehicle: a chassis number of 6–25 letters and digits, with at least one digit (words never are). */
export function isChassisLike(raw: string | null | undefined): boolean {
  return /^(?=.*\d)[A-Z0-9]{6,25}$/.test(normaliseVin(raw));
}

const VALUE: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHT = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
/**
 * The check digit (position 9). Required in North America only, so EJO
 * never refuses a VIN for it — it is shown, as a hint that a VIN was typed
 * wrongly. Null when the VIN is not 17 characters.
 */
export function vinCheckDigitOk(raw: string | null | undefined): boolean | null {
  const v = normaliseVin(raw);
  if (!VIN_CHARS.test(v)) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i]!;
    sum += (/\d/.test(ch) ? Number(ch) : VALUE[ch]!) * WEIGHT[i]!;
  }
  const r = sum % 11;
  return v[8] === (r === 10 ? 'X' : String(r));
}

/**
 * What a scanner or a person typed, as a VIN: a bare VIN, or the address
 * printed in the vehicle's QR code (".../v/VIN"). Null when it is neither.
 */
export function vinFromScan(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  const m = /\/v\/([A-Za-z0-9\-\s]{6,30})\/?(?:[?#].*)?$/.exec(s);
  const v = normaliseVin(m ? decodeURIComponent(m[1]!) : s);
  return isChassisLike(v) ? v : null;
}

/** The address a vehicle's QR code opens: short, so the code stays small. */
export const vehicleScanPath = (vin: string) => `/v/${encodeURIComponent(normaliseVin(vin))}`;
/** The vehicle's own page. */
export const vehiclePagePath = (vin: string) => `/vehicles/${encodeURIComponent(normaliseVin(vin))}`;
