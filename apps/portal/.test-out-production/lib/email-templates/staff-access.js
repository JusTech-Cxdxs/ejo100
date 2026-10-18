"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_RULES = void 0;
exports.renderStaffAccessEmail = renderStaffAccessEmail;
const layout_1 = require("./layout");
/** The house rules every member of staff is told (kept true to what the platform enforces). */
exports.STAFF_RULES = [
    'Your account is personal. Never share your password or let anyone else work under your name. Nobody from IT or administration will ever ask for it.',
    'Everything you do in the platform is recorded in the audit trail with your name and the time.',
    'You can see and do only what your roles allow, mostly for your own branch. If you need more access, ask your administrator; never use a colleague\'s account.',
    'Use the proper steps: approvals, cancellations, refunds and stock movements each have their own step, so the history stays complete.',
    'Sign out when you leave a shared computer.',
    'Forgot your password? Use "Forgot password" on the sign-in page to get a new link.',
    'If your account is switched off, you are signed out everywhere at once. Any change to your roles or permissions is emailed to you.',
];
function accessBlock(o) {
    if (o.isPlatformTeam)
        return (0, layout_1.para)('As a member of the platform team you can see and do everything, across every organisation.');
    const groups = o.access.filter((g) => g.lines.length);
    if (!groups.length)
        return (0, layout_1.para)('For now you can request your own exit passes. Your administrator will give you a role for your work.');
    return groups.map((g) => (0, layout_1.html) `
    <p class="ejo-strong" style="margin: 16px 0 6px 0; font-family: ${(0, layout_1.raw)(layout_1.EMAIL_FONT)}; font-size: 13px; font-weight: 700; color: #b40000;">${g.module}</p>
    ${(0, layout_1.list)(g.lines.map((l) => (0, layout_1.html) `${l.label}${l.where ? (0, layout_1.html) ` <span class="ejo-muted" style="color: #64748b;">(${l.where})</span>` : ''}${l.added ? (0, layout_1.html) ` <span style="color: #b45309; font-size: 12px;">added by your administrator</span>` : ''}`))}`);
}
function renderStaffAccessEmail(o) {
    const welcome = o.kind === 'welcome';
    const hours = o.setPasswordHours ?? 72;
    const roleText = o.isPlatformTeam
        ? 'Platform team (Master Administrator)'
        : o.roles.length ? o.roles.join(', ') : 'None yet. Your administrator will give you one.';
    const subject = welcome
        ? `Welcome to EJO 100: your ${o.companyName} account`
        : 'Your EJO 100 roles and permissions have changed';
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.fullName)}
    ${welcome
        ? (0, layout_1.para)(`An account has been created for you on EJO 100, the system ${o.companyName} uses to run its daily work.`)
        : (0, layout_1.para)(`${o.changeNote ? `${o.changeNote} ` : ''}Here is what your account can do from now on.`)}
    ${(0, layout_1.details)([
        ['Employee ID', o.employeeId ?? 'Not issued yet'],
        [o.roles.length > 1 ? 'Roles' : 'Role', roleText],
        ['Organisation', o.companyName],
        ['Branch', o.branchName ?? 'Organisation-wide'],
        ['Department', o.departmentName],
        ['Sign-in email', o.email],
    ])}
    ${welcome && o.setPasswordUrl ? (0, layout_1.html) `
      ${(0, layout_1.sectionTitle)('How to sign in')}
      ${(0, layout_1.list)([
        (0, layout_1.html) `Press ${(0, layout_1.strong)('Set my password')} and choose a password of at least 8 characters. The link works once and expires in ${(0, layout_1.plural)(hours, 'hour')}.`,
        (0, layout_1.html) `Go to ${(0, layout_1.link)(o.signInUrl.replace(/^https?:\/\//, ''), o.signInUrl)}.`,
        (0, layout_1.html) `Sign in with your work email ${(0, layout_1.strong)(o.email)} and the password you chose.`,
    ], true)}
      ${(0, layout_1.primaryButton)('Set my password', o.setPasswordUrl)}
      ${(0, layout_1.para)('If the link has expired, use "Forgot password" on the sign-in page to get a new one.', 'small')}` : ''}
    ${(0, layout_1.sectionTitle)('What you can do')}
    ${(0, layout_1.para)('This is exactly what your account allows today. If it changes, you will get a new email.', 'small')}
    ${accessBlock(o)}
    ${(0, layout_1.sectionTitle)('The rules')}
    ${(0, layout_1.list)(exports.STAFF_RULES)}`;
    const html_ = (0, layout_1.renderEmailLayout)({
        previewText: welcome
            ? `Your employee ID${o.employeeId ? ` ${o.employeeId}` : ''}, your role and how to sign in.`
            : 'Your roles and permissions have changed. Here is what you can do now.',
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName, o.departmentName],
        status: welcome ? { label: 'New account', tone: 'success' } : { label: 'Access changed', tone: 'info' },
        heading: welcome ? `Welcome to ${o.companyName}` : 'Your access has changed',
        bodyHtml,
        ctaLabel: welcome ? undefined : 'Open EJO 100',
        ctaUrl: welcome ? undefined : o.signInUrl,
        footerNote: welcome
            ? 'If you were not expecting this email, you can ignore it; nothing happens until a password is set.'
            : 'If you did not expect this change, tell your administrator straight away.',
        audience: 'staff',
    });
    return { subject, html: html_ };
}
