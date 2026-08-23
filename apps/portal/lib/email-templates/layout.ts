/**
 * Reusable branded email layout — every future EJO 100 workflow email
 * (Job Card created, Estimate ready, Parts ready, Vehicle ready, etc.)
 * should be built by passing content into this, not by writing a new
 * standalone HTML email from scratch. Keeps every email visually
 * consistent and means brand changes happen in one place.
 *
 * Follows standard HTML-email conventions rather than modern CSS, since
 * most email clients (especially Outlook) don't support flexbox/grid or
 * external stylesheets: table-based layout, all styles inline, a fixed
 * 600px content width, and an explicit `alt` on every image.
 *
 * Icon badges use a plain colored circle + a single Unicode character
 * (✓, !, etc.), not SVG or emoji — SVG has patchy support across email
 * clients (especially Outlook, which renders using Word's engine), and
 * emoji render inconsistently across platforms/fonts in a way that can
 * look unprofessional. A basic Unicode glyph in a styled circle is
 * simple, universally supported, and looks intentional everywhere.
 */

const BRAND = {
  primary: '#16A34A',
  primaryDark: '#15803D',
  primarySoft: '#DCFCE7',
  // Negative/neutral icon tones, added so a rejection or an
  // attention-needed notification can visually read as such rather
  // than every email showing the same green circle regardless of what
  // it's actually about. Reuses this project's own existing
  // --ejo-error/--ejo-warning hex values from the portal UI, not new
  // colors invented for email — one consistent palette across every
  // surface, not two.
  negative: '#DC2626',
  negativeDark: '#B91C1C',
  negativeSoft: '#FEE2E2',
  neutral: '#F59E0B',
  neutralDark: '#B45309',
  neutralSoft: '#FEF3C7',
  dark: '#0F172A',
  darkSoft: '#1E293B',
  textMuted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  poweredBy: 'Powered by EJO 100 Enterprise Platform',
};

/** Which of the three tones an icon badge renders in — governs both
 * the badge's own colors and, deliberately, nothing else in the
 * layout, since the tone should read from that one small element, not
 * tint the whole email. Defaults to 'positive' (the layout's original,
 * only appearance before tones existed), so any call site that hasn't
 * been updated to pick a tone explicitly keeps looking exactly as it
 * did before this was added. */
type IconTone = 'positive' | 'negative' | 'neutral';

const ICON_TONE_COLORS: Record<IconTone, { soft: string; dark: string }> = {
  positive: { soft: BRAND.primarySoft, dark: BRAND.primaryDark },
  negative: { soft: BRAND.negativeSoft, dark: BRAND.negativeDark },
  neutral: { soft: BRAND.neutralSoft, dark: BRAND.neutralDark },
};

export type EmailLayoutOptions = {
  previewText: string; // hidden preheader text shown in inbox lists (Gmail/Outlook)
  companyName: string; // written out prominently in the header, not just carried in the logo's alt text
  /** Dynamic organizational context for the specific event this email
   * is about — e.g. ["Kewalram Nigeria", "Isolo Branch", "Workshop"].
   * The layout doesn't know or assume any fixed hierarchy; the caller
   * supplies exactly the pieces that are relevant, in order. Omit for
   * emails that aren't tied to a specific branch/department. */
  orgContext?: string[];
  /** A single Unicode character shown in a small colored badge above
   * the heading — e.g. "✓" for a completed/ready event, "!" for one
   * needing attention. Omit for a plainer heading with no badge. */
  iconGlyph?: string;
  /** The badge's color — 'positive' (green) for approvals/acceptances,
   * 'negative' (red) for rejections, 'neutral' (amber) for
   * needs-your-attention notifications that aren't inherently bad news
   * (a new assignment, for instance). Only meaningful alongside
   * iconGlyph; ignored otherwise. Defaults to 'positive'. */
  iconTone?: IconTone;
  heading: string;
  bodyHtml: string; // pre-built inner HTML — paragraphs, lists, etc.
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string; // small print under the main footer, e.g. security notices
  logoUrl: string; // absolute URL — email clients cannot load relative/local paths
};

export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const {
    previewText,
    companyName,
    orgContext,
    iconGlyph,
    iconTone = 'positive',
    heading,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    footerNote,
    logoUrl,
  } = opts;

  const contextLine = orgContext && orgContext.length > 0
    ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #94A3B8; font-family: Arial, Helvetica, sans-serif;">${orgContext.map(escapeHtml).join(' &middot; ')}</p>`
    : '';

  const toneColors = ICON_TONE_COLORS[iconTone];
  const iconBadge = iconGlyph
    ? `
    <tr>
      <td align="center" style="padding: 32px 40px 0 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td width="48" height="48" align="center" valign="middle" style="width: 48px; height: 48px; border-radius: 24px; background-color: ${toneColors.soft};">
              <span style="font-size: 22px; font-weight: bold; color: ${toneColors.dark}; font-family: Arial, Helvetica, sans-serif; line-height: 48px;">${escapeHtml(iconGlyph)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : '';

  const ctaBlock = ctaLabel && ctaUrl
    ? `
    <tr>
      <td align="center" style="padding: 8px 40px 32px 40px;">
        <a href="${ctaUrl}" style="background-color: ${BRAND.primary}; color: #ffffff; text-decoration: none; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; padding: 14px 32px; border-radius: 8px; display: inline-block;">
          ${escapeHtml(ctaLabel)}
        </a>
      </td>
    </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: Arial, Helvetica, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(previewText)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.surface}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid ${BRAND.border};">

          <tr>
            <td style="background-color: ${BRAND.dark}; padding: 28px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle" width="44">
                    <img src="${logoUrl}" alt="${escapeHtml(companyName)}" height="36" style="display: block; height: 36px; width: auto;" />
                  </td>
                  <td valign="middle" style="padding-left: 14px;">
                    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #ffffff; font-family: Arial, Helvetica, sans-serif;">${escapeHtml(companyName)}</p>
                    ${contextLine}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${iconBadge}

          <tr>
            <td style="padding: ${iconGlyph ? '20px' : '40px'} 40px 8px 40px;">
              <h1 style="margin: 0 0 24px 0; font-size: 22px; line-height: 1.3; color: ${BRAND.dark}; font-family: Arial, Helvetica, sans-serif; text-align: ${iconGlyph ? 'center' : 'left'};">
                ${escapeHtml(heading)}
              </h1>
              <div style="font-size: 15px; line-height: 1.6; color: #334155; font-family: Arial, Helvetica, sans-serif;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          ${ctaBlock}

          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid ${BRAND.border};" align="center">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: ${BRAND.textMuted}; font-family: Arial, Helvetica, sans-serif;">
                ${escapeHtml(companyName)}
              </p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8; font-family: Arial, Helvetica, sans-serif;">
                ${BRAND.poweredBy}
              </p>
              ${footerNote ? `<p style="margin: 16px 0 0 0; font-size: 11px; color: #94A3B8; font-family: Arial, Helvetica, sans-serif;">${escapeHtml(footerNote)}</p>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Shared HTML-escaping — every dynamic string passed into the layout
 * (company name, org context, heading, footer note, preview text) now
 * goes through this, not just the values individual templates happened
 * to escape themselves. A branch or department name is real,
 * user-entered data too, just like a customer's name — it deserves the
 * same protection against breaking the email's markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
