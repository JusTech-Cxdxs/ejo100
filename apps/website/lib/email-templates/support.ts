import { renderEmailLayout, html, greeting, para, details, callout, strong } from './layout';

/**
 * Support hand-over emails sent by the website (Enyo hand-over, customer
 * replies). Built on the one branded layout; every value is escaped by
 * `html`. Message bodies are quoted, never trusted as markup.
 */

type Brand = { companyName: string; logoUrl: string };

const paragraphs = (text: string) => text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 12);

/** To the branch / front desk: a customer or visitor asked for a person. */
export function renderSupportTicketStaffEmail(o: Brand & {
  ticketNumber: string; channelLabel: string; branchName?: string | null; contactName: string; contactPhone?: string | null; contactEmail?: string | null;
  subject: string; summary: string; url: string;
}): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(null)}
    ${para(html`${strong(o.contactName)} asked to talk to a person through the ${o.channelLabel.toLowerCase()} chat. Enyo has opened ${strong(o.ticketNumber)} with the conversation attached.`)}
    ${details([
      ['Ticket', o.ticketNumber],
      ['From', o.contactName],
      ['Phone', o.contactPhone ?? ''],
      ['Email', o.contactEmail ?? ''],
      ['Where', o.channelLabel],
      ['Branch', o.branchName ?? ''],
      ['About', o.subject],
    ])}
    ${callout(paragraphs(o.summary).map((p) => html`<p style="margin: 0 0 6px 0;">${p}</p>`), 'info', 'Enyo’s summary')}
    ${para('Please reply from the support inbox so the answer reaches the customer and is kept with the ticket.', 'small')}`;
  return {
    subject: `New support request ${o.ticketNumber} from ${o.contactName}`,
    html: renderEmailLayout({
      previewText: `${o.contactName}: ${o.subject}`.slice(0, 140),
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.branchName, 'Customer care'],
      status: { label: 'Action needed', tone: 'warning' },
      heading: 'A customer asked for a person',
      bodyHtml,
      ctaLabel: 'Open the ticket',
      ctaUrl: o.url,
      audience: 'staff',
      reason: `You are receiving this because this address receives customer support requests for ${o.companyName}.`,
    }),
  };
}

/** To the signed-in customer: we have it, here is your reference. */
export function renderSupportTicketConfirmEmail(o: Brand & { fullName: string; ticketNumber: string; subject: string; url: string }): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.fullName)}
    ${para(html`Thank you for getting in touch. Our customer care team has your request and will reply as soon as they can. Your reference is ${strong(o.ticketNumber)}.`)}
    ${details([['Reference', o.ticketNumber], ['About', o.subject]])}
    ${para('You can read the reply and answer it under Help & support in your customer portal. We will also email you when there is a reply.', 'small')}`;
  return {
    subject: `We have your request (${o.ticketNumber})`,
    html: renderEmailLayout({
      previewText: `Your reference is ${o.ticketNumber}. Our team will reply soon.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: ['Customer care'],
      status: { label: 'Received', tone: 'success' },
      heading: 'We have your request',
      bodyHtml,
      ctaLabel: 'Open my support requests',
      ctaUrl: o.url,
      audience: 'customer',
    }),
  };
}

/** To the person handling the ticket (or the front desk): the customer answered. */
export function renderSupportCustomerReplyEmail(o: Brand & { recipientName?: string | null; ticketNumber: string; contactName: string; body: string; url: string }): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(html`${strong(o.contactName)} replied on ${strong(o.ticketNumber)}. The ticket is open again.`)}
    ${callout(paragraphs(o.body).map((p) => html`<p style="margin: 0 0 6px 0;">${p}</p>`), 'neutral', 'Their message')}`;
  return {
    subject: `${o.contactName} replied on ${o.ticketNumber}`,
    html: renderEmailLayout({
      previewText: o.body.slice(0, 140),
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: ['Customer care'],
      status: { label: 'Customer replied', tone: 'warning' },
      heading: 'The customer replied',
      bodyHtml,
      ctaLabel: 'Open the ticket',
      ctaUrl: o.url,
      audience: 'staff',
    }),
  };
}
