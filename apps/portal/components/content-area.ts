/** The element that holds the working area of a signed-in page (not the menu,
 * header or ticker). Loading and saving overlays are placed inside it.
 * Marked with a data attribute rather than an id, so it never looks like a
 * card or anchor target to selectors that look for `div[id]`. */
export const CONTENT_AREA_ATTR = 'data-ejo-content';

/** The working area, or null outside the signed-in frame (sign-in pages). */
export function contentArea(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(`[${CONTENT_AREA_ATTR}]`);
}
