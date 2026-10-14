import { renderEmailLayout, html, greeting, para, callout, details } from './layout';

export type CustomerSupportReplyEmailOptions = {
  customerName: string;
  ticketNumber: string;
  subject: string;
  reply: string;
  /** "Resolved", "Waiting for your reply"… */
  statusLabel: string;
  /** The customer portal's Help & support page; omitted for website visitors without an account. */
  portalUrl?: string | null;
  logoUrl: string;
  companyName: string;
  branchName?: string | null;
};

/** Customer care answered a support request (hand-over from Enyo). No staff names. */
export function renderCustomerSupportReplyEmail(o: CustomerSupportReplyEmailOptions): { subject: string; html: string } {
  const paragraphs = o.reply.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Our customer care team has replied to your request ${o.ticketNumber}.`)}
    ${callout(paragraphs.map((p) => html`<p style="margin: 0 0 8px 0;">${p}</p>`), 'info', 'Their reply')}
    ${details([['Reference', o.ticketNumber], ['About', o.subject], ['Status', o.statusLabel]])}
    ${o.portalUrl
      ? para('You can answer from Help & support in your customer portal; your reply goes straight to the team.', 'small')
      : para(`To answer, reply to this email or call us and quote ${o.ticketNumber}.`, 'small')}`;
  return {
    subject: `Reply to your request ${o.ticketNumber}`,
    html: renderEmailLayout({
      previewText: paragraphs[0] ?? `Our team replied to ${o.ticketNumber}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.branchName, 'Customer care'],
      status: { label: o.statusLabel, tone: o.statusLabel === 'Resolved' ? 'success' : 'info' },
      heading: 'Our team replied',
      bodyHtml,
      ...(o.portalUrl ? { ctaLabel: 'Open Help & support', ctaUrl: o.portalUrl } : {}),
      audience: 'customer',
      reason: `You are receiving this because you asked ${o.companyName} for help.`,
    }),
  };
}
