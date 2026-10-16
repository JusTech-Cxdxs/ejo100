import { renderEmailLayout, html, raw, para, callout, EMAIL_FONT, type BranchContact, type HtmlValue, type SafeHtml } from './layout';

/**
 * An email a member of staff writes in Mail, sent in the organisation's own
 * letterhead (logo, name, branch, footer) instead of as raw text. The person
 * chooses a style; "Plain" sends their text exactly as typed. Everything the
 * person typed is escaped (the `html` helper), links become safe links.
 */
import { MAIL_STYLES, MAIL_STYLE_LABEL, type MailStyle } from './personal-mail-styles';
import { PLATFORM } from '../brand';

export { MAIL_STYLES, MAIL_STYLE_LABEL, type MailStyle };

const STATUS: Partial<Record<MailStyle, { label: string; tone: 'warning' | 'danger' | 'info' }>> = {
  action: { label: 'Action needed', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
  info: { label: 'For information', tone: 'info' },
};

export type Sender = { name: string; role?: string | null; department?: string | null; branch?: string | null; phone?: string | null; email: string };

/** Where the person's own words end and the quoted original (reply / forward) begins. */
export function splitQuoted(body: string): { own: string; quoted: string } {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const at = lines.findIndex((l, i) => /^-{5,}\s*Forwarded message\s*-{5,}$/i.test(l.trim()) || (/^On .{4,200} wrote:$/.test(l.trim()) && (lines[i + 1] ?? '').startsWith('>')) || (l.startsWith('>') && lines.slice(i).every((x) => !x.trim() || x.startsWith('>'))));
  if (at < 0) return { own: body.trim(), quoted: '' };
  return { own: lines.slice(0, at).join('\n').trim(), quoted: lines.slice(at).join('\n').trim() };
}

/** Text with web addresses and email addresses as safe links; everything else escaped. */
export function linkify(text: string): SafeHtml {
  const parts: HtmlValue[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    parts.push(text.slice(last, i));
    const v = m[0];
    const href = v.includes('@') && !/^https?:/i.test(v) ? `mailto:${v}` : v;
    parts.push(html`<a href="${href}" style="color: #15803d; text-decoration: underline;">${v}</a>`);
    last = i + v.length;
  }
  parts.push(text.slice(last));
  return html`${parts}`;
}

function paragraphs(text: string): SafeHtml {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).slice(0, 200);
  return html`${blocks.map((b) => para(html`${b.split('\n').map((line, i) => html`${i ? raw('<br />') : ''}${linkify(line)}`)}`))}`;
}

function signature(s: Sender): SafeHtml {
  const second = [s.role, s.department].filter(Boolean).join(' · ');
  const lines = [second, s.branch, s.phone].filter((x): x is string => Boolean(x && x.trim()));
  return html`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 22px 0 4px 0;">
      <tr><td style="border-left: 3px solid #22983f; padding: 2px 0 2px 12px; font-family: ${raw(EMAIL_FONT)}; font-size: 13px; line-height: 1.55; color: #334155;">
        <strong class="ejo-strong" style="font-size: 14px; color: #0f172a;">${s.name}</strong>${lines.map((l) => html`<br /><span class="ejo-muted" style="color: #64748b;">${l}</span>`)}<br /><a href="mailto:${s.email}" style="color: #15803d; text-decoration: none;">${s.email}</a>
      </td></tr>
    </table>`;
}

function quotedBlock(quoted: string): SafeHtml {
  const text = quoted.split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n').slice(0, 20_000);
  return html`
    <div class="ejo-muted" style="margin: 26px 0 0 0; padding: 10px 0 0 14px; border-left: 2px solid #e2e8f0; font-family: ${raw(EMAIL_FONT)}; font-size: 12.5px; line-height: 1.5; color: #64748b; white-space: pre-wrap; word-break: break-word;">${text}</div>`;
}

/** The letterhead email (HTML). The plain-text part is the person's text as typed. */
export function renderPersonalMail(o: { subject: string; body: string; style: MailStyle; companyName: string; logoUrl: string; sender: Sender; branchContact?: BranchContact }): string {
  const { own, quoted } = splitQuoted(o.body);
  const status = STATUS[o.style];
  const bodyHtml = html`
    ${o.style === 'urgent' ? callout('Please give this your attention today.', 'danger') : ''}
    ${paragraphs(own)}
    ${signature(o.sender)}
    ${quoted ? quotedBlock(quoted) : ''}`;
  return renderEmailLayout({
    previewText: own.replace(/\s+/g, ' ').slice(0, 140),
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.sender.branch, o.sender.department],
    ...(status ? { status } : {}),
    heading: o.subject,
    bodyHtml,
    reason: `This email was sent by ${o.sender.name} of ${o.companyName.trim() || PLATFORM.name}.`,
    ...(o.branchContact ? { branchContact: o.branchContact } : {}),
  });
}
