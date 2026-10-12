import { renderEmailLayout, html, greeting, para, details, highlight, list, sectionTitle, callout } from './layout';

export type CustomerWarrantyCertificateEmailOptions = {
  customerName: string;
  warrantyNumber: string;
  subject: string;
  providerName: string;
  validFrom: string;
  validUntil: string;
  covered: string[];
  notCovered: string[];
  conditions: string[];
  isSample: boolean;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCustomerWarrantyCertificateEmail(o: CustomerWarrantyCertificateEmailOptions): string {
  const block = (title: string, items: string[]) => (items.length ? html`${sectionTitle(title)}${list(items)}` : '');
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para('Your warranty is now active. Please keep this email, and quote the warranty number whenever you contact us about it.')}
    ${highlight('Warranty number', o.warrantyNumber, undefined, 'success')}
    ${details([
      ['Covers', o.subject],
      ['Valid from', o.validFrom],
      ['Valid until', o.validUntil],
      ['Provided by', o.providerName],
    ])}
    ${block('What is covered', o.covered)}
    ${block('What is not covered', o.notCovered)}
    ${block('To keep your warranty valid', o.conditions)}
    ${o.isSample ? callout('These are sample terms for demonstration only.', 'warning') : ''}`;
  return renderEmailLayout({
    previewText: `Warranty ${o.warrantyNumber} for ${o.subject}, valid until ${o.validUntil}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Warranty active', tone: 'success' },
    heading: 'Your warranty certificate',
    bodyHtml,
    audience: 'customer',
  });
}
