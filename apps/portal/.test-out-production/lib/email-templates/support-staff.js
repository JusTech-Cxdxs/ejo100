"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSupportAssignedEmail = renderSupportAssignedEmail;
exports.renderSupportNobodyFreeEmail = renderSupportNobodyFreeEmail;
exports.renderSupportLateEmail = renderSupportLateEmail;
const layout_1 = require("./layout");
const facts = (o) => (0, layout_1.details)([
    ['Reference', o.number], ['About', o.subject], ['From', o.contactName], ['How it came in', o.channel], ['Team', o.teamName], ['Priority', o.priority],
    ...(o.due ? [['First answer due', o.due]] : []),
]);
function renderSupportAssignedEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(o.by ? `${o.by} gave you support request ${o.number}.` : `Support request ${o.number} is yours: you were the next free person on the ${o.teamName} team.`)}
    ${facts(o)}
    ${(0, layout_1.para)('Open it to read the messages and Enyo’s summary, then answer the customer. Your reply is emailed to them and kept on the request.', 'small')}`;
    return {
        subject: `${o.number} is yours: ${o.subject}`.slice(0, 160),
        html: (0, layout_1.renderEmailLayout)({ previewText: `${o.contactName}: ${o.subject}`, companyName: o.companyName, logoUrl: o.logoUrl, orgContext: [o.teamName], status: { label: o.priority === 'Urgent' || o.priority === 'High' ? `${o.priority} priority` : 'New for you', tone: o.priority === 'Urgent' ? 'danger' : o.priority === 'High' ? 'warning' : 'info' }, heading: `A support request for you`, bodyHtml, ctaLabel: 'Open the request', ctaUrl: o.url, audience: 'staff' }),
    };
}
function renderSupportNobodyFreeEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Nobody on the ${o.teamName} team could take support request ${o.number}: ${o.reason}. It is waiting without an owner.`)}
    ${facts(o)}
    ${(0, layout_1.callout)('Give it to a colleague (or take it yourself) so the customer is answered on time. You can add people to the team, or change how many open requests each takes, in Settings → Support centre → Teams.', 'warning', 'What to do')}`;
    return {
        subject: `Nobody free for ${o.number} (${o.teamName})`,
        html: (0, layout_1.renderEmailLayout)({ previewText: `${o.number} is waiting without an owner.`, companyName: o.companyName, logoUrl: o.logoUrl, orgContext: [o.teamName], status: { label: 'Needs an owner', tone: 'warning' }, heading: 'A request needs an owner', bodyHtml, ctaLabel: 'Assign it', ctaUrl: o.url, audience: 'staff' }),
    };
}
function renderSupportLateEmail(o) {
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.recipientName)}
    ${(0, layout_1.para)(`Support request ${o.number} has passed its first-answer target without a reply${o.owner ? ` (it is with ${o.owner})` : ' and has no owner'}.`)}
    ${facts(o)}
    ${(0, layout_1.para)('Answer the customer now, or reassign it. Late requests show at the top of the Support centre.', 'small')}`;
    return {
        subject: `Late: ${o.number} has not been answered`,
        html: (0, layout_1.renderEmailLayout)({ previewText: `${o.number} is past its target.`, companyName: o.companyName, logoUrl: o.logoUrl, orgContext: [o.teamName], status: { label: 'Past its target', tone: 'danger' }, heading: 'A request is late', bodyHtml, ctaLabel: 'Open the request', ctaUrl: o.url, audience: 'staff' }),
    };
}
