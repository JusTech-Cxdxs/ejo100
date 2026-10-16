/**
 * The one email layout every message from EJO 100 is built on. The website
 * keeps a byte-for-byte copy (apps/website/lib/email-templates/layout.ts); a
 * unit test fails if the two drift apart.
 *
 * Email clients are not browsers, so the markup is deliberately old-fashioned:
 * nested tables, inline styles, a 600px column, a VML button for Outlook on
 * Windows, and no images that carry meaning (the organisation name is real
 * text, so it reads even when images are blocked). Dark mode and the small
 * entrance animation live in separate <style> blocks: a client that rejects
 * one block (Gmail drops a block it cannot parse) still keeps the others.
 *
 * Templates build their body with the `html` tagged template below, which
 * escapes every interpolated value unless it was produced by another helper
 * here. That makes it hard to put unescaped customer input into an email.
 */
import { PLATFORM } from '../brand';

/* ------------------------------------------------------------------ */
/* Safe HTML building                                                  */
/* ------------------------------------------------------------------ */

/** HTML that has already been escaped or built by a helper in this file. */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Trust a string as HTML. Only for markup written in code, never for data. */
export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type HtmlValue = SafeHtml | string | number | null | undefined | false | HtmlValue[];

function toHtml(value: HtmlValue): string {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  return escapeHtml(String(value));
}

/** Tagged template: interpolations are escaped unless they are SafeHtml. */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((v, i) => {
    out += toHtml(v) + (strings[i + 1] ?? '');
  });
  return new SafeHtml(out);
}

/* ------------------------------------------------------------------ */
/* Design tokens (the portal's own colours)                            */
/* ------------------------------------------------------------------ */

export const EMAIL_FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const C = {
  brand: '#22983f', // the logo green: wordmark rule and top bar
  button: '#15803d', // a shade darker than --ejo-primary so white text passes contrast
  link: '#15803d',
  page: '#f1f5f4',
  card: '#ffffff',
  surface: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
};

export type EmailTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<EmailTone, { bg: string; fg: string; dot: string; border: string }> = {
  success: { bg: '#dcfce7', fg: '#166534', dot: '#16a34a', border: '#bbf7d0' },
  warning: { bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b', border: '#fde68a' },
  danger: { bg: '#fee2e2', fg: '#991b1b', dot: '#dc2626', border: '#fecaca' },
  info: { bg: '#dbeafe', fg: '#1e40af', dot: '#2563eb', border: '#bfdbfe' },
  neutral: { bg: '#f1f5f9', fg: '#334155', dot: '#64748b', border: '#e2e8f0' },
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** ₦12,345.00 — the one money format used in every email. */
export function formatNaira(amount: number | string | { toString(): string }): string {
  const n = typeof amount === 'number' ? amount : Number(amount.toString());
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe < 0 ? '-' : '';
  return `${sign}₦${Math.abs(safe).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 12 October 2026 (Lagos time). */
export function formatEmailDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(date);
}

/** 12 October 2026 at 2:05 pm (Lagos time). */
export function formatEmailDateTime(date: Date): string {
  const time = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' }).format(date).replace(/\s+/g, ' ');
  return `${formatEmailDate(date)} at ${time}`;
}

/** "1 day", "3 days", "1,250 km" — never "1 days". */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count.toLocaleString('en-NG')} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** "Toyota Hilux (KJA-219-XY)" — tolerant of either part missing. */
export function vehicleLabel(description?: string | null, plate?: string | null): string {
  const d = (description ?? '').trim();
  const p = (plate ?? '').trim();
  if (d && p && !d.includes(p)) return `${d} (${p})`;
  return d || p || 'your vehicle';
}

/* ------------------------------------------------------------------ */
/* Body building blocks                                                */
/* ------------------------------------------------------------------ */

const P = `margin: 0 0 16px 0; font-family: ${EMAIL_FONT}; font-size: 15px; line-height: 1.6; color: ${C.body};`;

/** "Hello Ada," — or "Hello," when the name is missing. */
export function greeting(name?: string | null): SafeHtml {
  const n = (name ?? '').trim();
  return html`<p class="ejo-body" style="${raw(P)}">${n ? `Hello ${n},` : 'Hello,'}</p>`;
}

/** A body paragraph. Pass a string (escaped) or `html\`...\``. */
export function para(content: HtmlValue, variant: 'normal' | 'small' = 'normal'): SafeHtml {
  const style = variant === 'small'
    ? `margin: 0 0 14px 0; font-family: ${EMAIL_FONT}; font-size: 13px; line-height: 1.55; color: ${C.muted};`
    : P;
  return html`<p class="${variant === 'small' ? 'ejo-muted' : 'ejo-body'}" style="${raw(style)}">${content}</p>`;
}

/** Bold inline text. */
export function strong(content: HtmlValue): SafeHtml {
  return html`<strong class="ejo-strong" style="color: ${raw(C.text)}; font-weight: 700;">${content}</strong>`;
}

/** A small section title inside the body. */
export function sectionTitle(text: string): SafeHtml {
  return html`<p class="ejo-strong" style="margin: 26px 0 10px 0; font-family: ${raw(EMAIL_FONT)}; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${raw(C.text)};">${text}</p>`;
}

export type DetailRow = [label: string, value: HtmlValue] | null | undefined | false;

/** Label/value rows in a quiet bordered box. Rows with an empty value are skipped. */
export function details(rows: DetailRow[]): SafeHtml {
  const kept = rows.filter((r): r is [string, HtmlValue] => Boolean(r) && toHtml((r as [string, HtmlValue])[1]).trim() !== '');
  if (!kept.length) return raw('');
  const line = (i: number) => raw(i ? ` border-top: 1px solid ${C.border};` : '');
  const body = kept.map(([label, value], i) => html`
        <tr>
          <td class="ejo-muted ejo-rowline" data-t-after=": " valign="top" width="35%" style="padding: 11px 12px 11px 18px; font-family: ${raw(EMAIL_FONT)}; font-size: 13px; line-height: 1.45; color: ${raw(C.muted)};${line(i)}">${label}</td>
          <td class="ejo-strong ejo-rowline" valign="top" style="padding: 11px 18px 11px 0; font-family: ${raw(EMAIL_FONT)}; font-size: 14px; line-height: 1.45; font-weight: 600; color: ${raw(C.text)}; word-break: break-word;${line(i)}">${value}</td>
        </tr>`);
  return html`
    <table role="presentation" class="ejo-box" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 22px 0; border: 1px solid ${raw(C.border)}; border-radius: 10px; background-color: ${raw(C.surface)}; border-collapse: separate;">${body}
    </table>`;
}

export type MoneyLine = { label: HtmlValue; meta?: string | null; amount: string };
export type MoneyTotal = { label: string; amount: string; emphasis?: boolean };

function isMoney(text: string): boolean {
  return /^-?₦[\d,]+(\.\d+)?$/.test(text.trim());
}

/** Itemised amounts with totals (estimates, receipts). Amounts arrive formatted. */
export function moneyTable(lines: MoneyLine[], totals: MoneyTotal[]): SafeHtml {
  const line = (i: number) => raw(i ? ` border-top: 1px solid ${C.border};` : '');
  const lineRows = lines.map((l, i) => html`
        <tr>
          <td class="ejo-body ejo-rowline" data-t-after="  " valign="top" style="padding: 10px 12px 10px 18px; font-family: ${raw(EMAIL_FONT)}; font-size: 14px; line-height: 1.45; color: ${raw(C.body)};${line(i)}">${l.label}${l.meta ? html`<br /><span class="ejo-muted" style="font-size: 12px; color: ${raw(C.muted)};">${l.meta}</span>` : ''}</td>
          <td class="ejo-strong ejo-rowline" valign="top" align="right"${raw(isMoney(l.amount) ? '' : ' width="42%"')} style="padding: 10px 18px 10px 0; font-family: ${raw(EMAIL_FONT)}; font-size: 14px; line-height: 1.45; color: ${raw(C.text)};${raw(isMoney(l.amount) ? ' white-space: nowrap;' : ' font-weight: 400; font-size: 13px;')}${line(i)}">${l.amount}</td>
        </tr>`);
  const totalRows = totals.map((t, i) => {
    const top = i === 0 ? '12px' : '3px';
    const bottom = i === totals.length - 1 ? '14px' : '3px';
    const border = raw(i === 0 && lines.length ? ` border-top: 1px solid ${C.border};` : '');
    const size = t.emphasis ? '16px' : '13px';
    return html`
        <tr>
          <td class="${raw(t.emphasis ? 'ejo-strong' : 'ejo-muted')} ejo-rowline" data-t-after="  " style="padding: ${raw(top)} 12px ${raw(bottom)} 18px; font-family: ${raw(EMAIL_FONT)}; font-size: ${raw(size)}; font-weight: ${raw(t.emphasis ? '700' : '400')}; color: ${raw(t.emphasis ? C.text : C.muted)};${border}">${t.label}</td>
          <td class="ejo-strong ejo-rowline" align="right" style="padding: ${raw(top)} 18px ${raw(bottom)} 0; font-family: ${raw(EMAIL_FONT)}; font-size: ${raw(size)}; font-weight: 700; color: ${raw(C.text)}; white-space: nowrap;${border}">${t.amount}</td>
        </tr>`;
  });
  return html`
    <table role="presentation" class="ejo-box" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 22px 0; border: 1px solid ${raw(C.border)}; border-radius: 10px; background-color: ${raw(C.surface)}; border-collapse: separate;">${lineRows}${totalRows}
    </table>`;
}

/** A tinted note with a coloured edge, for what the reader must notice. */
export function callout(content: HtmlValue, tone: EmailTone = 'neutral', title?: string): SafeHtml {
  const t = TONES[tone];
  return html`
    <table role="presentation" class="ejo-callout ejo-callout-${raw(tone)}" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 22px 0; background-color: ${raw(t.bg)}; border-left: 4px solid ${raw(t.dot)}; border-radius: 8px;">
      <tr>
        <td class="ejo-callout-text" style="padding: 14px 18px; font-family: ${raw(EMAIL_FONT)}; font-size: 14px; line-height: 1.55; color: ${raw(t.fg)};">
          ${title ? html`<p style="margin: 0 0 4px 0; font-weight: 700;">${title}</p>` : ''}${content}
        </td>
      </tr>
    </table>`;
}

/** A large figure with a caption (a date, an amount) inside a tinted box. */
export function highlight(caption: string, value: HtmlValue, sub?: HtmlValue, tone: EmailTone = 'success'): SafeHtml {
  const t = TONES[tone];
  return html`
    <table role="presentation" class="ejo-callout ejo-callout-${raw(tone)}" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 22px 0; background-color: ${raw(t.bg)}; border: 1px solid ${raw(t.border)}; border-radius: 10px;">
      <tr>
        <td class="ejo-callout-text" style="padding: 16px 20px; font-family: ${raw(EMAIL_FONT)}; color: ${raw(t.fg)};">
          <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">${caption}</p>
          <p style="margin: 0; font-size: 24px; line-height: 1.25; font-weight: 800;">${value}</p>
          ${sub ? html`<p style="margin: 6px 0 0 0; font-size: 13px; line-height: 1.5;">${sub}</p>` : ''}
        </td>
      </tr>
    </table>`;
}

/** A bulleted (or numbered) list. Empty items are skipped. */
export function list(items: HtmlValue[], ordered = false): SafeHtml {
  const kept = items.filter((i) => toHtml(i).trim() !== '');
  if (!kept.length) return raw('');
  const tag = raw(ordered ? 'ol' : 'ul');
  return html`<${tag} class="ejo-body" style="margin: 0 0 18px 0; padding: 0 0 0 22px; font-family: ${raw(EMAIL_FONT)}; font-size: 14px; line-height: 1.6; color: ${raw(C.body)};">${kept.map((i) => html`<li style="margin: 0 0 6px 0;">${i}</li>`)}</${tag}>`;
}

/** An inline link. */
export function link(label: HtmlValue, url: string): SafeHtml {
  return html`<a href="${url}" class="ejo-link" style="color: ${raw(C.link)}; text-decoration: underline;">${label}</a>`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export type BranchContact = {
  address?: string | null;
  phones?: string[] | null;
  email?: string | null;
};

export type EmailLayoutOptions = {
  /** The line inbox lists show after the subject. */
  previewText: string;
  /** The organisation the email is from (header, footer). */
  companyName: string;
  /** Absolute URL of the logo image. */
  logoUrl: string;
  /** Where in the organisation the email comes from, e.g. [branch, department].
   * Blanks and entries equal to the organisation name are dropped. */
  orgContext?: (string | null | undefined)[];
  /** A small coloured label above the heading ("Approved", "Action needed"). */
  status?: { label: string; tone: EmailTone };
  heading: string;
  bodyHtml: SafeHtml | string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Print the button's address under it (security emails). */
  showLinkFallback?: boolean;
  /** Small print under the button, e.g. "This link works once." */
  footerNote?: string;
  /** Who the email is for; sets the default "why you received this" line. */
  audience?: 'staff' | 'customer';
  /** Replaces the default "why you received this" line. */
  reason?: string;
  /** The branch's public contact details, shown in the footer. */
  branchContact?: BranchContact;
};

/**
 * The vehicle brands the organisation represents, shown as a quiet line at the
 * foot of every email ("Authorised dealer · FOTON · ISUZU · SOUEAST"), in each
 * brand's colour, as text (no pictures to block or load). Set once per
 * installation: NEXT_PUBLIC_DEALER_BRANDS="FOTON:#111111,ISUZU:#E4002B,SOUEAST:#F39800".
 */
export function dealerBrands(value: string | undefined = process.env.NEXT_PUBLIC_DEALER_BRANDS): { name: string; color: string }[] {
  return String(value ?? '')
    .split(',')
    .map((part) => {
      const [rawName, rawColor] = part.split(':');
      const name = (rawName ?? '').replace(/[^\p{L}\p{N} .&'-]/gu, '').trim().slice(0, 24);
      const color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test((rawColor ?? '').trim()) ? (rawColor ?? '').trim() : C.body;
      return { name, color };
    })
    .filter((b) => b.name)
    .slice(0, 8);
}

function brandsLine(brands: { name: string; color: string }[]): SafeHtml | string {
  if (!brands.length) return '';
  return html`
              <p class="ejo-muted" style="margin: 12px 0 0 0; font-size: 10px; line-height: 1.6; letter-spacing: 0.14em; text-transform: uppercase; color: ${raw(C.faint)};">Authorised dealer${brands.map((b) => html` &nbsp;&middot;&nbsp; <span style="color: ${raw(b.color)}; font-weight: 800; letter-spacing: 0.16em;">${b.name}</span>`)}</p>`;
}

function displayName(companyName: string): string {
  const n = (companyName ?? '').trim();
  return n || PLATFORM.name;
}

function wordmark(name: string, logoUrl: string): SafeHtml {
  const words = name.split(/\s+/);
  const top = words[0] ?? name;
  const bottom = words.slice(1).join(' ');
  const logo = logoUrl
    ? html`<img src="${logoUrl}" alt="${name} logo" width="38" height="46" style="display: block; width: 38px; height: 46px; border: 0; outline: none; text-decoration: none; font-family: ${raw(EMAIL_FONT)}; font-size: 10px; color: ${raw(C.muted)};" />`
    : html`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="38" height="46" align="center" valign="middle" style="width: 38px; height: 46px; background-color: ${raw(C.brand)}; border-radius: 8px; font-family: ${raw(EMAIL_FONT)}; font-size: 20px; font-weight: 800; color: #ffffff;">${top.charAt(0).toUpperCase()}</td></tr></table>`;
  return html`
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding: 0 6px 0 0;">${logo}</td>
                  <td valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td colspan="2" class="ejo-strong" style="font-family: ${raw(EMAIL_FONT)}; font-size: 25px; line-height: 25px; font-weight: 800; letter-spacing: 0.01em; color: ${raw(C.text)}; white-space: nowrap; mso-line-height-rule: exactly;">${top}</td>
                      </tr>${bottom ? html`
                      <tr>
                        <td valign="middle" style="padding: 6px 6px 0 0;"><div class="ejo-rule" style="min-width: 12px; height: 0; border-top: 1.5px solid ${raw(C.brand)}; font-size: 0; line-height: 0; mso-line-height-rule: exactly;">&nbsp;</div></td>
                        <td valign="middle" width="1" class="ejo-muted" style="padding: 6px 0 0 0; font-family: ${raw(EMAIL_FONT)}; font-size: 11.5px; line-height: 12px; font-weight: 600; color: ${raw(C.muted)}; white-space: nowrap; mso-line-height-rule: exactly;">${bottom}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>`;
}

function button(label: string, url: string): SafeHtml {
  // Outlook on Windows renders with Word, which ignores padding on links: VML draws the button there.
  const width = Math.min(520, Math.max(200, Math.round(label.length * 8.6 + 72)));
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(url)}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="17%" stroke="f" fillcolor="${C.button}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->`;
  return html`
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="left" bgcolor="${raw(C.button)}" style="border-radius: 8px; background-color: ${raw(C.button)};">
                      ${raw(vml)}${raw('<!--[if !mso]><!-->')}<a href="${url}" data-t="button" class="ejo-btn" style="display: inline-block; padding: 13px 26px; border-radius: 8px; background-color: ${raw(C.button)}; font-family: ${raw(EMAIL_FONT)}; font-size: 15px; line-height: 20px; font-weight: 700; color: #ffffff; text-decoration: none; -webkit-text-size-adjust: none;">${label}&nbsp;&nbsp;&rarr;</a>${raw('<!--<![endif]-->')}
                    </td>
                  </tr>
                </table>`;
}

/** The main button, placed inside the body (when the action belongs mid-email). */
export function primaryButton(label: string, url: string): SafeHtml {
  return html`<div style="margin: 4px 0 22px 0;">${button(label, url)}</div>`;
}

const STYLE_BASE = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media only screen and (max-width: 620px) {
    .ejo-outer { padding: 12px 8px 28px 8px !important; }
    .ejo-px { padding-left: 22px !important; padding-right: 22px !important; }
    .ejo-h1 { font-size: 21px !important; line-height: 28px !important; }
    .ejo-stack { display: block !important; width: 100% !important; text-align: left !important; }
    .ejo-ctx { padding: 14px 0 0 0 !important; }
  }`;

const STYLE_DARK = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .ejo-page, .ejo-outer { background-color: #0b1220 !important; }
    .ejo-card, .ejo-head { background-color: #111a2e !important; border-color: #24324a !important; }
    .ejo-box { background-color: #0d1526 !important; border-color: #24324a !important; }
    .ejo-rowline, .ejo-note { border-color: #24324a !important; }
    .ejo-strong, .ejo-h1 { color: #f1f5f9 !important; }
    .ejo-body { color: #cbd5e1 !important; }
    .ejo-muted { color: #94a3b8 !important; }
    .ejo-link { color: #4ade80 !important; }
    .ejo-callout-success { background-color: #0f2e1d !important; border-color: #22c55e !important; }
    .ejo-callout-warning { background-color: #33240a !important; border-color: #f59e0b !important; }
    .ejo-callout-danger { background-color: #3a1214 !important; border-color: #ef4444 !important; }
    .ejo-callout-info { background-color: #10213f !important; border-color: #3b82f6 !important; }
    .ejo-callout-neutral { background-color: #172036 !important; border-color: #475569 !important; }
    .ejo-callout-success .ejo-callout-text { color: #bbf7d0 !important; }
    .ejo-callout-warning .ejo-callout-text { color: #fde68a !important; }
    .ejo-callout-danger .ejo-callout-text { color: #fecaca !important; }
    .ejo-callout-info .ejo-callout-text { color: #bfdbfe !important; }
    .ejo-callout-neutral .ejo-callout-text { color: #cbd5e1 !important; }
    .ejo-chip-success { background-color: #0f2e1d !important; color: #86efac !important; }
    .ejo-chip-warning { background-color: #33240a !important; color: #fcd34d !important; }
    .ejo-chip-danger { background-color: #3a1214 !important; color: #fca5a5 !important; }
    .ejo-chip-info { background-color: #10213f !important; color: #93c5fd !important; }
    .ejo-chip-neutral { background-color: #172036 !important; color: #cbd5e1 !important; }
  }`;

// Outlook.com's dark mode marks the body with data-ogsc / data-ogsb. Kept in
// its own block because some clients drop a whole block over attribute selectors.
const STYLE_OUTLOOK_DARK = `
  [data-ogsb] .ejo-page, [data-ogsb] .ejo-outer { background-color: #0b1220 !important; }
  [data-ogsb] .ejo-card, [data-ogsb] .ejo-head { background-color: #111a2e !important; }
  [data-ogsb] .ejo-box { background-color: #0d1526 !important; }
  [data-ogsc] .ejo-strong, [data-ogsc] .ejo-h1 { color: #f1f5f9 !important; }
  [data-ogsc] .ejo-body { color: #cbd5e1 !important; }
  [data-ogsc] .ejo-muted { color: #94a3b8 !important; }`;

// Apple Mail and iOS Mail run CSS animation; other clients show the same design
// standing still. Nothing here carries meaning, and it stays off for anyone who
// has asked for reduced motion.
const STYLE_MOTION = `
  @keyframes ejo-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes ejo-fade { from { opacity: 0.25; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ejo-sheen { from { background-position: 100% 0; } to { background-position: 0 0; } }
  @media (prefers-reduced-motion: no-preference) {
    .ejo-rule { transform-origin: left center; animation: ejo-draw 900ms cubic-bezier(0.2, 0.7, 0.2, 1) 200ms both; }
    .ejo-topbar { background-image: linear-gradient(90deg, #22983f 0%, #22983f 40%, #4ade80 50%, #22983f 60%, #22983f 100%); background-size: 250% 100%; animation: ejo-sheen 1600ms ease-out 300ms both; }
    .ejo-chip { animation: ejo-fade 600ms ease-out 350ms both; }
  }`;

/** Markers the plain-text converter uses to leave the visual header out. */
const T_SKIP = '<!--t:skip-->';
const T_END = '<!--/t:skip-->';

export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const name = displayName(opts.companyName);
  const context = (opts.orgContext ?? [])
    .map((x) => (x ?? '').trim())
    .filter((x, i, a) => x && x.toLowerCase() !== name.toLowerCase() && a.indexOf(x) === i);
  const reason = opts.reason
    ?? (opts.audience === 'customer'
      ? `You are receiving this because you are a customer of ${name}.`
      : opts.audience === 'staff'
        ? `You are receiving this because of your role at ${name}.`
        : `This email was sent by ${name}.`);
  const contact = opts.branchContact;
  const contactLine = contact
    ? [contact.address, (contact.phones ?? []).filter(Boolean).join(', '), contact.email].map((x) => (x ?? '').trim()).filter(Boolean)
    : [];
  const tone = opts.status ? TONES[opts.status.tone] : null;

  const chip = opts.status && tone
    ? html`
          <tr>
            <td class="ejo-px" style="padding: 30px 40px 0 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td class="ejo-chip ejo-chip-${raw(opts.status.tone)}" style="padding: 5px 12px 5px 10px; border-radius: 999px; background-color: ${raw(tone.bg)}; font-family: ${raw(EMAIL_FONT)}; font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: 0.02em; color: ${raw(tone.fg)}; white-space: nowrap;"><span style="color: ${raw(tone.dot)}; font-size: 11px;">&#9679;</span>&nbsp;&nbsp;${opts.status.label}</td>
              </tr></table>
            </td>
          </tr>`
    : '';

  const cta = opts.ctaLabel && opts.ctaUrl
    ? html`
          <tr>
            <td class="ejo-px" style="padding: 6px 40px ${raw(opts.showLinkFallback ? '10px' : '32px')} 40px;">${button(opts.ctaLabel, opts.ctaUrl)}
            </td>
          </tr>${opts.showLinkFallback ? html`${raw(T_SKIP)}
          <tr>
            <td class="ejo-px" style="padding: 6px 40px 30px 40px; font-family: ${raw(EMAIL_FONT)}; font-size: 12px; line-height: 1.55; color: ${raw(C.muted)};">
              <span class="ejo-muted">If the button does not work, copy this address into your browser:</span><br />
              <a href="${opts.ctaUrl}" class="ejo-link" style="color: ${raw(C.link)}; word-break: break-all;">${opts.ctaUrl}</a>
            </td>
          </tr>${raw(T_END)}` : ''}`
    : '';

  const note = opts.footerNote
    ? html`
          <tr>
            <td class="ejo-px" style="padding: 0 40px 30px 40px;">
              <p class="ejo-muted ejo-note" style="margin: 0; padding: 16px 0 0 0; border-top: 1px solid ${raw(C.border)}; font-family: ${raw(EMAIL_FONT)}; font-size: 12.5px; line-height: 1.55; color: ${raw(C.muted)};">${opts.footerNote}</p>
            </td>
          </tr>`
    : '';

  return html`<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${opts.heading}</title>
${raw('<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->')}
<style>${raw(STYLE_BASE)}
</style>
<style>${raw(STYLE_DARK)}
</style>
<style>${raw(STYLE_OUTLOOK_DARK)}
</style>
<style>${raw(STYLE_MOTION)}
</style>
</head>
<body class="ejo-page" style="margin: 0; padding: 0; background-color: ${raw(C.page)};">
  <div class="ejo-preheader" style="display: none; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all;">${opts.previewText}${raw('&#8199;&#847;'.repeat(60))}</div>
  <table role="presentation" class="ejo-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${raw(C.page)};">
    <tr>
      <td class="ejo-outer" align="center" style="padding: 32px 16px 40px 16px; background-color: ${raw(C.page)};">
        ${raw('<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->')}
        <table role="presentation" class="ejo-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: ${raw(C.card)}; border: 1px solid ${raw(C.border)}; border-radius: 14px; border-collapse: separate; overflow: hidden;">
          ${raw(T_SKIP)}
          <tr>
            <td class="ejo-topbar" height="4" style="height: 4px; line-height: 4px; font-size: 0; background-color: ${raw(C.brand)};">&nbsp;</td>
          </tr>
          <tr>
            <td class="ejo-head ejo-px" style="padding: 24px 40px 22px 40px; border-bottom: 1px solid ${raw(C.border)}; background-color: ${raw(C.card)};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="ejo-stack" valign="middle">${wordmark(name, opts.logoUrl)}
                  </td>${context.length ? html`
                  <td class="ejo-stack ejo-ctx" valign="middle" align="right" style="padding: 0 0 0 16px; text-align: right; font-family: ${raw(EMAIL_FONT)};">
                    <p class="ejo-strong" style="margin: 0; font-size: 13px; line-height: 18px; font-weight: 600; color: ${raw(C.text)};">${context[0]}</p>${context.length > 1 ? html`
                    <p class="ejo-muted" style="margin: 2px 0 0 0; font-size: 12px; line-height: 16px; color: ${raw(C.muted)};">${context.slice(1).join(' · ')}</p>` : ''}
                  </td>` : ''}
                </tr>
              </table>
            </td>
          </tr>
          ${raw(T_END)}${chip}
          <tr>
            <td class="ejo-px" style="padding: ${raw(opts.status ? '14px' : '32px')} 40px 6px 40px;">
              <h1 class="ejo-h1" style="margin: 0 0 18px 0; font-family: ${raw(EMAIL_FONT)}; font-size: 23px; line-height: 30px; font-weight: 700; letter-spacing: -0.01em; color: ${raw(C.text)};">${opts.heading}</h1>
              ${raw(String(opts.bodyHtml))}
            </td>
          </tr>${cta}${note}
        </table>
        ${raw('<!--[if mso]></td></tr></table><![endif]-->')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
          <tr>
            <td class="ejo-px" align="center" style="padding: 24px 40px 0 40px; font-family: ${raw(EMAIL_FONT)}; font-size: 12px; line-height: 1.6; color: ${raw(C.muted)};">
              <p class="ejo-body" style="margin: 0 0 2px 0; font-size: 13px; font-weight: 700; color: ${raw(C.body)};">${name}${context[0] ? html`<span class="ejo-muted" style="font-weight: 400; color: ${raw(C.muted)};"> &middot; ${context[0]}</span>` : ''}</p>${contactLine.length ? html`
              <p class="ejo-muted" style="margin: 0 0 2px 0; color: ${raw(C.muted)};">${contactLine.join(' · ')}</p>` : ''}
              <p class="ejo-muted" style="margin: 10px 0 0 0; color: ${raw(C.muted)};">${reason}</p>${brandsLine(dealerBrands())}
              <p class="ejo-muted" style="margin: 14px 0 0 0; font-size: 11px; letter-spacing: 0.04em; color: ${raw(C.faint)};">${PLATFORM.poweredBy}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.value;
}

/* ------------------------------------------------------------------ */
/* Plain-text alternative                                              */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–',
  rarr: '→', larr: '←', bull: '•', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', zwnj: '', times: '×',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * The plain-text part sent with every HTML email (multipart/alternative). It
 * helps deliverability and reads well in text-only clients. Built from the
 * same markup, so the two parts always say the same thing.
 */
export function htmlToText(input: string): string {
  let s = input;
  s = s.replace(/<head[\s\S]*?<\/head>/i, '');
  s = s.replace(/<!--t:skip-->[\s\S]*?<!--\/t:skip-->/g, '');
  s = s.replace(/<div class="ejo-preheader"[\s\S]*?<\/div>/i, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Source indentation between tags is not content.
  s = s.replace(/>\s*\n\s*</g, '><');
  s = s.replace(/<a\b[^>]*?href="([^"]*)"[^>]*?data-t="button"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) =>
    `\n${stripTags(label.replace(/&nbsp;|&rarr;/g, ' '))}:\n${decodeEntities(href)}\n`);
  s = s.replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
    const text = stripTags(label);
    const url = decodeEntities(href);
    const bare = url.replace(/^(https?:\/\/|mailto:|tel:)/, '');
    if (!text || text === url || text === bare) return url.replace(/^mailto:|^tel:/, '');
    return `${text} (${url})`;
  });
  s = s.replace(/<td\b[^>]*?data-t-after="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi, (_m, after: string, content: string) => `${content}${after}`);
  s = s.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t: string) => {
    const text = stripTags(t);
    return `\n${text}\n${'='.repeat(Math.min(60, text.length))}\n\n`;
  });
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/tr>/gi, '\n');
  s = s.replace(/<\/(p|div|table|ul|ol|h2|h3)>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[\u034f\u2007\u200c]/g, '');
  const lines = s.split('\n').map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim());
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
