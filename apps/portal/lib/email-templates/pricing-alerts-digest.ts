import { renderEmailLayout, html, greeting, para, moneyTable, sectionTitle, link, plural } from './layout';

export type PricingAlertDigestItem = {
  partName: string;
  severity: 'CRITICAL_LOSS' | 'DEFICIT' | 'BOOST';
  newUnitCost: string;
  sellingPrice: string;
  actualMarginPercent: string;
  targetMarginPercent: string;
  partUrl: string;
};

export type PricingAlertsDigestEmailOptions = {
  recipientName: string;
  items: PricingAlertDigestItem[];
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

const GROUPS: { severity: PricingAlertDigestItem['severity']; label: string }[] = [
  { severity: 'CRITICAL_LOSS', label: 'Selling below cost' },
  { severity: 'DEFICIT', label: 'Below target margin' },
  { severity: 'BOOST', label: 'Above target margin' },
];

/** The daily summary of pricing alerts that are still open at a branch. */
export function renderPricingAlertsDigestEmail(o: PricingAlertsDigestEmailOptions): string {
  const critical = o.items.filter((i) => i.severity === 'CRITICAL_LOSS').length;
  const groups = GROUPS.map((g) => ({ ...g, items: o.items.filter((i) => i.severity === g.severity) })).filter((g) => g.items.length);
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${plural(o.items.length, 'pricing alert')} ${o.items.length === 1 ? 'is' : 'are'} still open at ${o.branchName || 'your branch'} today.${critical ? ` ${plural(critical, 'part is', 'parts are')} selling below cost.` : ''}`)}
    ${groups.map((g) => html`
      ${sectionTitle(`${g.label} (${g.items.length})`)}
      ${moneyTable(g.items.map((i) => ({
        label: link(i.partName, i.partUrl),
        meta: `Cost ${i.newUnitCost} · Price ${i.sellingPrice}`,
        amount: `${i.actualMarginPercent}% (target ${i.targetMarginPercent}%)`,
      })), [])}`)}
    ${para('This summary lists only alerts that are still open, not every alert raised.', 'small')}`;
  return renderEmailLayout({
    previewText: `${plural(o.items.length, 'pricing alert')} open at ${o.branchName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: critical ? { label: 'Selling below cost', tone: 'danger' } : { label: 'Daily summary', tone: 'warning' },
    heading: 'Open pricing alerts',
    bodyHtml,
    ctaLabel: 'Open Pricing Command Center',
    ctaUrl: o.dashboardUrl,
    audience: 'staff',
  });
}
