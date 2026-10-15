/**
 * Enyo's tools for a website visitor nobody knows. Only public organisation
 * information (from the database and the site's own configuration) and the
 * hand-over to a person. No customer record is reachable from here.
 */
import { loadCompanyInfo } from './company';
import { openHandover } from './handover';
import { checkHandoverContact } from './rules';
import type { WebTool } from './types';

/** Shown to the visitor before they share contact details (the widget shows the same line). */
export const CONSENT_LINE = 'We use your name and phone number or email only to reply to this request, and keep it with the conversation.';

const companyInfo: WebTool = {
  name: 'organisation_info',
  description: 'The organisation\'s public information: organisation name, branches with addresses, phone numbers and emails, opening hours if listed, the businesses and services described on the website, and how to book. The only source for answers to visitors.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  kind: 'read',
  status: 'Looking up our details…',
  async run(_args, ctx) {
    const info = await loadCompanyInfo(ctx.organisationId);
    return { ok: true, data: info, sources: [{ label: 'Contact us', href: '/contact' }] };
  },
};

const requestHandover: WebTool = {
  name: 'request_handover',
  description: `Asks the organisation's customer care team to contact the visitor. Needs the visitor's name AND a phone number or email, and their agreement: before calling, tell them "${CONSENT_LINE}" and ask if that is fine; set consent to true only when they agree.`,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The visitor\'s name.', maxLength: 80 },
      phone: { type: 'string', description: 'Phone number to call back. Phone or email is required.', maxLength: 30 },
      email: { type: 'string', description: 'Email address to reply to. Phone or email is required.', maxLength: 120 },
      topic: { type: 'string', description: 'In a few words, what they need.', maxLength: 160 },
      consent: { type: 'boolean', description: 'True only when the visitor agreed to their details being used to reply.' },
    },
    required: ['name', 'consent'],
    additionalProperties: false,
  },
  kind: 'read',
  status: 'Passing this to our team…',
  async run(args, ctx) {
    if (args.consent !== true) return { ok: false, message: `The visitor has not agreed yet. Tell them: "${CONSENT_LINE}" and ask if that is fine.` };
    const checked = checkHandoverContact({ name: args.name, phone: args.phone, email: args.email });
    if (!checked.ok) return { ok: false, message: checked.message };
    const r = await openHandover(ctx, checked.contact, String(args.topic ?? ''));
    const how = checked.contact.phone && checked.contact.email ? 'call or email you' : checked.contact.phone ? 'call you' : 'email you';
    const text = r.existing
      ? `Our team already has your request as ${r.ticketNumber}. They will ${how} soon.`
      : `Thank you. I have passed this to our customer care team as ${r.ticketNumber}. They will ${how} soon.`;
    ctx.emit({ type: 'handover', ticketNumber: r.ticketNumber, text });
    return { ok: true, data: { ticket: r.ticketNumber, alreadyOpen: r.existing, tellTheVisitor: text } };
  },
};

export const publicTools: WebTool[] = [companyInfo, requestHandover];
