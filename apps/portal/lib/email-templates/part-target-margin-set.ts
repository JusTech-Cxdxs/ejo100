import { renderEmailLayout, html, greeting, para, details } from './layout';

export type PartTargetMarginSetEmailOptions = {
  recipientName: string;
  setByName: string;
  partName: string;
  previousTargetMarginPercent: number | null;
  newTargetMarginPercent: number;
  newTargetMarkupPercent: number;
  enteredAs: 'MARGIN' | 'MARKUP';
  enteredValue: number;
  partUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

const pct = (v: number) => `${v.toFixed(1)}%`;

export function renderPartTargetMarginSetEmail(o: PartTargetMarginSetEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.setByName} set a new target ${o.enteredAs === 'MARGIN' ? 'margin' : 'markup'} of ${pct(o.enteredValue)} on ${o.partName}. Every goods receipt for this part is now compared against it.`)}
    ${details([
      ['Part', o.partName],
      ['Previous target margin', o.previousTargetMarginPercent !== null ? pct(o.previousTargetMarginPercent) : 'Not set'],
      ['New target margin', pct(o.newTargetMarginPercent)],
      ['Same target as markup', pct(o.newTargetMarkupPercent)],
      ['Set by', o.setByName],
    ])}
    ${para('Margin is profit as a share of the selling price; markup is profit as a share of cost. They describe the same profit.', 'small')}`;
  return renderEmailLayout({
    previewText: `Target margin for ${o.partName} is now ${pct(o.newTargetMarginPercent)}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Pricing', tone: 'info' },
    heading: `Target pricing updated for ${o.partName}`,
    bodyHtml,
    ctaLabel: 'View part',
    ctaUrl: o.partUrl,
    audience: 'staff',
  });
}
