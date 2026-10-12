import { renderEmailLayout, html, greeting, para } from './layout';

export type CustomerBroadcastEmailOptions = {
  customerName: string;
  title: string;
  message: string;
  /** e.g. "Announcement", "Greeting" — from the broadcast's category. */
  categoryLabel: string;
  portalUrl: string;
  logoUrl: string;
  companyName: string;
  /** The customer portal page where email preferences are changed. */
  preferencesUrl?: string;
};

/** A message from the organisation to its customers (a customer broadcast). No staff names. */
export function renderCustomerBroadcastEmail(o: CustomerBroadcastEmailOptions): { subject: string; html: string } {
  const paragraphs = o.message.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${paragraphs.map((p) => para(p))}
    ${para('You can also read this message in your customer portal.', 'small')}`;
  return {
    subject: `${o.title} | ${o.companyName}`,
    html: renderEmailLayout({
      previewText: paragraphs[0] ?? o.title,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.categoryLabel],
      status: { label: o.categoryLabel || 'Announcement', tone: 'success' },
      heading: o.title,
      bodyHtml,
      ctaLabel: 'Open my customer portal',
      ctaUrl: o.portalUrl,
      audience: 'customer',
      reason: o.preferencesUrl
        ? `You are receiving this because you chose to get announcements from ${o.companyName} by email. You can turn this off on your customer portal profile page: ${o.preferencesUrl.replace(/^https?:\/\//, '')}`
        : `You are receiving this because you chose to get announcements from ${o.companyName} by email. You can turn this off in your customer portal profile.`,
    }),
  };
}
