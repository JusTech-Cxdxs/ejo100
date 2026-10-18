import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type ServiceJobOpenedEmailOptions = {
  customerName: string;
  jobNumber: string;
  productName: string;
  serialNumber: string;
  fault: string;
  /** 'WARRANTY' | 'PAID' | 'GOODWILL' */
  kind: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

const KIND_TEXT: Record<string, string> = {
  WARRANTY: 'The unit is under warranty, so the repair is covered unless the fault turns out to be user damage.',
  PAID: 'The unit is out of warranty: we will send you a quotation once the fault has been diagnosed, and repair only when you have approved it.',
  GOODWILL: 'The repair is being done as a goodwill gesture at no cost to you.',
};

/** To the customer: their unit has been received at the Service Centre. */
export function renderServiceJobOpenedEmail(o: ServiceJobOpenedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`We have received your ${o.productName} (serial ${o.serialNumber}) at the ${o.branchName || 'Service Centre'} and opened service job ${o.jobNumber} for it.`)}
    ${details([
      ['Service job', o.jobNumber],
      ['Unit', o.productName],
      ['Serial', o.serialNumber],
      ['Reported fault', o.fault],
    ])}
    ${callout(KIND_TEXT[o.kind] ?? KIND_TEXT.PAID!, o.kind === 'WARRANTY' ? 'success' : 'info', 'What happens next')}
    ${para('A technician will diagnose the unit and we will keep you informed. Please keep this job number for any enquiry.', 'small')}`;
  return renderEmailLayout({
    previewText: `Service job ${o.jobNumber} opened for your ${o.productName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Service job opened', tone: 'info' },
    heading: 'Your unit is with our Service Centre',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
