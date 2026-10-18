"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOMER_PORTAL_FEATURES = void 0;
exports.renderCustomerWelcomeEmail = renderCustomerWelcomeEmail;
const layout_1 = require("./layout");
/** What a customer can do in the portal — kept true to what the portal offers. */
exports.CUSTOMER_PORTAL_FEATURES = [
    'Follow each visit as it moves from check-in to estimate, work and collection.',
    'See your estimates, what you have paid and what is still due.',
    'Keep track of your vehicles, their service history and when the next service is due.',
    'See your warranties and what they cover.',
    'Read messages from the branch and keep your contact details up to date.',
];
/**
 * The customer's welcome / portal-access email: a "Set my password" button
 * (a one-time link, never a password), what the portal is for, and how to
 * reach the branch. No staff names.
 */
function renderCustomerWelcomeEmail(o) {
    const welcome = o.kind === 'welcome';
    const expiry = (0, layout_1.plural)(o.setPasswordHours, 'hour');
    const subject = welcome
        ? `Welcome to ${o.companyName}: set up your customer portal account`
        : `Your link to set your customer portal password`;
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${welcome
        ? (0, layout_1.para)((0, layout_1.html) `Thank you for choosing ${o.companyName}${o.branchName ? (0, layout_1.html) `, ${o.branchName}` : ''}. We have opened a customer portal account for you, so you can follow the work on your vehicle online.`)
        : (0, layout_1.para)((0, layout_1.html) `Here is a new link to set the password for your ${o.companyName} customer portal account. Any earlier link no longer works.`)}
    ${(0, layout_1.details)([
        ['Sign-in email', o.email],
        ['Customer portal', (0, layout_1.link)(o.signInUrl.replace(/^https?:\/\//, ''), o.signInUrl)],
        ['Link expires', `${expiry} after this email was sent`],
    ])}
    ${(0, layout_1.sectionTitle)('How to sign in')}
    ${(0, layout_1.list)([
        (0, layout_1.html) `Press ${(0, layout_1.strong)('Set my password')} and choose a password of at least 8 characters.`,
        (0, layout_1.html) `Sign in to the customer portal with ${(0, layout_1.strong)(o.email)} and that password.`,
    ], true)}
    ${(0, layout_1.primaryButton)('Set my password', o.setPasswordUrl)}
    ${(0, layout_1.para)((0, layout_1.html) `If the link has expired, use ${(0, layout_1.strong)('Forgot password')} on the customer portal sign-in page, or ask the branch to send a new one.`, 'small')}
    ${welcome ? (0, layout_1.html) `${(0, layout_1.sectionTitle)('What you can do in the portal')}${(0, layout_1.list)(exports.CUSTOMER_PORTAL_FEATURES)}` : ''}`;
    const html_ = (0, layout_1.renderEmailLayout)({
        previewText: welcome
            ? `Your ${o.companyName} customer portal account is ready. Set your password to sign in.`
            : `Set your customer portal password. The link expires in ${expiry}.`,
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: welcome ? { label: 'Account ready', tone: 'success' } : { label: 'Security', tone: 'info' },
        heading: welcome ? 'Your customer portal account is ready' : 'Set your password',
        bodyHtml,
        footerNote: `If you were not expecting this email, you can ignore it; nothing happens until a password is set. ${o.companyName} staff will never ask for your password.`,
        audience: 'customer',
        branchContact: o.branchContact,
    });
    return { subject, html: html_ };
}
