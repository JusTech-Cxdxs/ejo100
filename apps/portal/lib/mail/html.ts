import sanitizeHtml from 'sanitize-html';

/**
 * An email's own layout, made safe to show (Mail's reading pane renders it
 * in a sandboxed frame with no scripts; lib/mail/html.ts is the only way in).
 *
 *  • Only presentational tags and attributes survive: no scripts, forms,
 *    frames, objects, event handlers, meta refreshes or base tags.
 *  • Links open in a new tab with no referrer; only http(s), mailto and tel.
 *  • Inline pictures (cid:) become data URIs from the email's own parts
 *    (images only, each ≤ 400 KB, all ≤ 1.5 MB).
 *  • Remote pictures are held back (data-remote-src) so opening an email
 *    never tells the sender it was read; the reader can choose to load them.
 *  • Style rules that load anything (@import, url(http…)) are removed.
 */

export type InlineImage = { cid: string; contentType: string; content: Buffer };

export const HTML_MAX = 1_500_000;
const IMAGE_MAX = 400_000;
/** Inline pictures, counted as the base64 text they become: well under HTML_MAX, so the words always fit. */
const IMAGES_TOTAL = 900_000;
const b64Length = (bytes: number) => Math.ceil(bytes / 3) * 4 + 40;

const TAGS = [
  'a', 'abbr', 'address', 'b', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's',
  'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'tt', 'u', 'ul', 'style',
];
// No `background` attribute: it would load a picture without asking.
const COMMON = ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'dir', 'lang', 'title', 'border'];

/** CSS that cannot fetch anything or escape its box. */
export function cleanCss(css: string): string {
  return css
    // A comment becomes a space (removing it could join "</sty" + "le>").
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // CSS escapes (\72 = "r") can spell url( or expression( past the rules below.
    .replace(/\\/g, '')
    .replace(/image-set\s*\(/gi, 'none(')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!data:image\/)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '')
    .replace(/behavior\s*:/gi, 'x-behavior:')
    .replace(/-moz-binding/gi, 'x-binding')
    .replace(/position\s*:\s*(fixed|sticky)/gi, 'position: static')
    // Never a tag inside CSS: "<" cannot close <style> or open anything.
    .replace(/</g, ' ');
}

/**
 * The cleaned layout, or null when the email has no HTML worth showing. A
 * layout that would not fit is tried again without its inline pictures, and
 * otherwise left to the plain text, so nothing is ever cut off.
 */
export function sanitizeMailHtml(input: string | null | undefined, inline: InlineImage[] = []): { html: string; remoteImages: number } | null {
  if (!input || !input.trim()) return null;
  const first = cleanOnce(input, inline);
  if (first && first.html.length <= HTML_MAX) return first;
  const lighter = inline.length ? cleanOnce(input, []) : null;
  return lighter && lighter.html.length <= HTML_MAX ? lighter : null;
}

/** The second, plain pass: whatever the first pass produced is parsed and filtered again. */
const FINAL: sanitizeHtml.IOptions = {
  allowedTags: TAGS,
  allowVulnerableTags: true,
  allowedAttributes: {
    '*': COMMON,
    a: [...COMMON, 'href', 'name', 'target', 'rel'],
    img: [...COMMON, 'src', 'alt', 'data-remote-src'],
    td: [...COMMON, 'colspan', 'rowspan', 'nowrap'],
    th: [...COMMON, 'colspan', 'rowspan', 'scope', 'nowrap'],
    table: [...COMMON, 'cellpadding', 'cellspacing', 'summary', 'role'],
    font: [...COMMON, 'face', 'size'],
    ol: [...COMMON, 'start', 'type'],
    col: [...COMMON, 'span'],
    colgroup: [...COMMON, 'span'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['data'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'noscript', 'textarea', 'option', 'title', 'head', 'iframe', 'object', 'embed', 'svg', 'math', 'template'],
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }) },
};

function cleanOnce(input: string, inline: InlineImage[]): { html: string; remoteImages: number } | null {
  let budget = IMAGES_TOTAL;
  const byCid = new Map<string, string>();
  for (const img of inline) {
    const size = b64Length(img.content.length);
    if (!/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(img.contentType) || img.content.length > IMAGE_MAX || size > budget) continue;
    budget -= size;
    byCid.set(img.cid.replace(/^<|>$/g, '').toLowerCase(), `data:${img.contentType.toLowerCase()};base64,${img.content.toString('base64')}`);
  }
  let remoteImages = 0;
  const out = sanitizeHtml(input.slice(0, HTML_MAX * 2), {
    allowedTags: TAGS,
    allowVulnerableTags: true, // <style> only; its text is cleaned below and the frame runs no scripts.
    allowedAttributes: {
      '*': COMMON,
      a: [...COMMON, 'href', 'name', 'target', 'rel'],
      img: [...COMMON, 'src', 'alt', 'data-remote-src'],
      td: [...COMMON, 'colspan', 'rowspan', 'nowrap'],
      th: [...COMMON, 'colspan', 'rowspan', 'scope', 'nowrap'],
      table: [...COMMON, 'cellpadding', 'cellspacing', 'summary', 'role'],
      font: [...COMMON, 'face', 'size'],
      ol: [...COMMON, 'start', 'type'],
      col: [...COMMON, 'span'],
      colgroup: [...COMMON, 'span'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['data', 'http', 'https', 'cid'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'noscript', 'textarea', 'option', 'title', 'head', 'iframe', 'object', 'embed', 'svg', 'math', 'template'],
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      img: (tagName, attribs) => {
        const src = (attribs.src ?? '').trim();
        const next: Record<string, string> = { ...attribs };
        delete next.src;
        // Only this cleaner decides which pictures wait for "Show pictures" — never the email.
        delete next['data-remote-src'];
        delete next.srcset;
        if (/^cid:/i.test(src)) {
          const data = byCid.get(src.slice(4).replace(/^<|>$/g, '').toLowerCase());
          if (data) next.src = data;
        } else if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(src) && src.length <= IMAGE_MAX * 1.4) {
          next.src = src;
        } else if (/^https?:\/\//i.test(src)) {
          // 1×1 trackers are dropped outright; real pictures wait for "Show images".
          const tiny = (attribs.width === '1' || attribs.width === '0') && (attribs.height === '1' || attribs.height === '0');
          if (!tiny) { next['data-remote-src'] = src; remoteImages += 1; }
        }
        return { tagName, attribs: next };
      },
    },
    allowedStyles: undefined,
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src && !frame.attribs['data-remote-src'],
  });
  // <style> blocks and inline style attributes: the same rules.
  const styled = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open: string, css: string, close: string) => `${open}${cleanCss(css)}${close}`).replace(/\sstyle="([^"]*)"/gi, (_, css: string) => ` style="${cleanCss(css).replace(/"/g, '&quot;')}"`);
  // Defence in depth: the edited result is cleaned once more as a whole.
  const html = sanitizeHtml(styled, FINAL);
  if (!html.replace(/<[^>]+>/g, '').trim() && !/<img\s/i.test(html)) return null;
  return { html, remoteImages };
}
