import { renderEmailLayout, html, greeting, para, type EmailTone } from './layout';

export type WarrantyStaffNoticeEmailOptions = {
  recipientName: string;
  heading: string;
  lines: string[];
  actionUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  /** The button label; defaults to "Open in EJO 100". */
  actionLabel?: string;
  /** A small label above the heading, e.g. "Appointment" or "Security". */
  statusLabel?: string;
  statusTone?: EmailTone;
};

/**
 * The general staff notice: one heading, the facts as short lines, and a link
 * to the record. Used for warranty, security, scheduling and broadcast notices.
 * Staff only; never sent to customers.
 */
export function renderWarrantyStaffNoticeEmail(o: WarrantyStaffNoticeEmailOptions): string {
  const lines = o.lines.map((l) => (l ?? '').trim()).filter(Boolean);
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${lines.map((l) => para(l))}`;
  return renderEmailLayout({
    previewText: lines[0] ?? o.heading,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: o.statusLabel ? { label: o.statusLabel, tone: o.statusTone ?? 'info' } : undefined,
    heading: o.heading,
    bodyHtml,
    ctaLabel: o.actionLabel ?? 'Open in EJO 100',
    ctaUrl: o.actionUrl,
    audience: 'staff',
  });
}
