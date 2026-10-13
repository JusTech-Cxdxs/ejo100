/** The element that holds the working area of a signed-in page (not the menu,
 * header or ticker). Loading and saving overlays are placed inside it. */
export const CONTENT_AREA_ID = 'ejo-content';

/** The working area, or null outside the signed-in frame (sign-in pages). */
export function contentArea(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(CONTENT_AREA_ID);
}
