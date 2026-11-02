/**
 * How big one block of an uploaded file is on the wire.
 *
 * A block is sent as one server-action request, which Next.js refuses past
 * 1 MB (and the hosting plan past 4.5 MB). Counting characters is not enough:
 * a Soueast parts list with Chinese descriptions takes 3 bytes a character,
 * and quotes in a cell are escaped. So a row is measured as the UTF-8 bytes
 * of its JSON, and a block stops well below the limit.
 */

/** A block is sent once it reaches this many bytes (Next's server-action limit is 1 MB). */
export const BLOCK_BYTES = 700_000;
/** A single row past this cannot be sent at all. */
export const ROW_BYTES_MAX = 900_000;

/** UTF-8 bytes of a string as it appears inside JSON (quotes, backslashes and control characters escaped). */
export function jsonStringBytes(s: string): number {
  let n = 2; // the quotes
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === 0x22 || c === 0x5c) n += 2;
    else if (c < 0x20) n += 6; // \u00XX (\n and \t are 2, counted generously)
    else if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i += 1; } // a surrogate pair: one 4-byte character
    else n += 3;
  }
  return n;
}

/** Bytes of one row as sent: {"rowNumber":N,"cells":[...]} plus the comma between rows. */
export function rowBytes(row: { rowNumber: number; cells: string[] }): number {
  let n = 26 + String(row.rowNumber).length;
  for (const c of row.cells) n += jsonStringBytes(c) + 1;
  return n;
}
