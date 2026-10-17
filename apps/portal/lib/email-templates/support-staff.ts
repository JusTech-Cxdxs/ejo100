import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

/**
 * Emails to colleagues from the Support centre: a request given to them, a
 * team with nobody free to take a new one, and a request past its target.
 * Only what the colleague needs to act — never the full message thread (it
 * stays in the portal, behind sign-in).
 */
type Base = { companyName: string; logoUrl: string; recipientName: string | null; number: string; subject: string; contactName: string; teamName: string; priority: string; due: string | null; url: string; channel: string };

const facts = (o: Base) => details([
  ['Reference', o.number], ['About', o.subject], ['From', o.contactName], ['How it came in', o.channel], ['Team', o.teamName], ['Priority', o.priority],
  ...(o.due ? [['First answer due', o.due] as [string, string]] : []),
]);

export function renderSupportAssignedEmail(o: Base & { by: string | null }): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(o.by ? `${o.by} gave you support request ${o.number}.` : `Support request ${o.number} is yours: you were the next free person on the ${o.teamName} team.`)}
    ${facts(o)}
    ${para('Open it to read the messages and Enyo’s summary, then answer the customer. Your reply is emailed to them and kept on the request.', 'small')}`;
  return {
    subject: `${o.number} is yours: ${o.subject}`.slice(0, 160),
    html: renderEmailLayout({ previewText: `${o.contactName}: ${o.subject}`, companyName: o.companyName, logoUrl: o.logoUrl, orgContext: [o.teamName], status: { label: o.priority === 'Urgent' || o.priority === 'High' ? `${o.priority} priority` : 'New for you', tone: o.priority === 'Urgent' ? 'danger' : o.priority === 'High' ? 'warning' : 'info' }, heading: `A support request for you`, bodyHtml, ctaLabel: 'Open the request', ctaUrl: o.url, audience: 'staff' }),
  };
}

export function renderSupportNobodyFreeEmail(o: Base & { reason: string }): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`Nobody on the ${o.teamName} team could take support request ${o.number}: ${o.reason}. It is waiting without an owner.`)}
    ${facts(o)}
    ${callout('Give it to a colleague (or take it yourself) so the customer is answered on time. You can add people to the team, or change how many open requests each takes, in Settings → Support centre → Teams.', 'warning', 'What to do')}`;
  return {
    subject: `Nobody free for ${o.number} (${o.teamName})`,
    html: renderEmailLayout({ previewText: `${o.number} is waiting without an owner.`, companyName: o.companyName, logoUrl: o.logoUrl, orgContext: [o.teamName], status: { label: 'Needs an owner', tone: 'warning' }, heading: 'A request needs an owner', bodyHtml, ctaLabel: 'Assign it', ctaUrl: o.url, audience: 'staff' }),
  };
}

export function renderSupportLateEmail(o: Base & { owner: string | null }): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`Support request ${o.number} has passed its first-answer target without a reply${o.owner ? ` (it is with ${o.owner})` : ' and has no owner'}.`)}
    ${facts(o)}
    ${para('Answer the customer now, or reassign it. Late requests show at the top of the Support centre.', 'small')}`;
  return {
    subject: `Late: ${o.number} has not been answered`,
    html: renderEmailLayout({ previewText: `${o.number} is past its target.`, companyName: o.companyName, logoUrl: o.logoUrl, orgContext: [o.teamName], status: { label: 'Past its target', tone: 'danger' }, heading: 'A request is late', bodyHtml, ctaLabel: 'Open the request', ctaUrl: o.url, audience: 'staff' }),
  };
}
