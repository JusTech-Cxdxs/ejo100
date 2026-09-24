import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobWorkUpdateEmailOptions = {
  /** RESUMED — parts arrived and work carried on. REWORK — sent back
   * for further work after checks (e.g. a failed road test). */
  kind: 'RESUMED' | 'REWORK';
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * A work update that is honest about what actually happened, instead of
 * re-sending the "work has started" email as if nothing had come before.
 * The rework wording is deliberately customer-safe: it never exposes an
 * internal technician note, never alarms, and never promises a date.
 */
export function renderCustomerJobWorkUpdateEmail(opts: CustomerJobWorkUpdateEmailOptions): string {
  const { kind, customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;
  const vehicle = `your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)})`;
  const body =
    kind === 'RESUMED'
      ? `<p style="margin: 0 0 16px 0;">Good news — the parts we were waiting for have arrived, and work on ${vehicle} has resumed.</p>
         <p style="margin: 0;">We'll keep you updated as it progresses. There's nothing you need to do for now.</p>`
      : `<p style="margin: 0 0 16px 0;">During our final checks on ${vehicle}, we found something we want to put right before we hand it back to you, so our team has taken it back into the workshop.</p>
         <p style="margin: 0 0 16px 0;">This is part of making sure the work is done properly — there's nothing you need to do. We'll let you know as soon as it's ready.</p>`;
  return renderEmailLayout({
    previewText: kind === 'RESUMED' ? `Work has resumed — Job Card ${jobNumber}.` : `A quick update on your vehicle — Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: kind === 'RESUMED' ? '↻' : 'ℹ',
    iconTone: 'neutral',
    heading: kind === 'RESUMED' ? 'Work has resumed' : 'A quick update on your vehicle',
    bodyHtml: `<p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>${body}`,
    ctaLabel: 'Track progress',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
