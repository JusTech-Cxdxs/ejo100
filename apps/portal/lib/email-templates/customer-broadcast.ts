import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerBroadcastEmailOptions = {
  customerName: string;
  title: string;
  message: string;
  /** e.g. "Announcement", "Greeting" — from the broadcast's category. */
  categoryLabel: string;
  portalUrl: string;
  logoUrl: string;
  companyName: string;
};

/** A message from the organisation to its customers (a customer broadcast). No staff names. */
export function renderCustomerBroadcastEmail(o: CustomerBroadcastEmailOptions): { subject: string; html: string } {
  const paragraphs = o.message.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.customerName)},</p>
    ${paragraphs.map((p) => `<p style="margin: 0 0 12px 0;">${escapeHtml(p)}</p>`).join('')}
    <p style="margin: 20px 0 0 0; font-size: 13px; color: #64748B;">You can also read this in your customer portal, with your vehicles and service history.</p>
  `;
  return {
    subject: `${o.companyName}: ${o.title}`,
    html: renderEmailLayout({
      previewText: o.title,
      companyName: o.companyName,
      orgContext: [o.companyName, o.categoryLabel],
      iconGlyph: '✉',
      heading: o.title,
      bodyHtml,
      ctaLabel: 'Open my customer portal',
      ctaUrl: o.portalUrl,
      footerNote: 'You receive this because you are a customer and chose to get updates by email. You can change this in your customer portal settings.',
      logoUrl: o.logoUrl,
    }),
  };
}
