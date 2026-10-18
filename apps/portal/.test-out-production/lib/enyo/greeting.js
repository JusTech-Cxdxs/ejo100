"use strict";
/**
 * Small pure helpers for the Enyo panel: the daily greeting, starter
 * questions by role, and the person's first name. No browser or server APIs,
 * so they are unit-tested directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lagosHour = lagosHour;
exports.lagosDay = lagosDay;
exports.firstName = firstName;
exports.greetingText = greetingText;
exports.starterPrompts = starterPrompts;
/** The hour (0–23) in Lagos for a moment. */
function lagosHour(at) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hourCycle: 'h23' }).format(at));
    return Number.isFinite(h) ? h % 24 : at.getUTCHours();
}
/** The Lagos calendar day as YYYY-MM-DD (the greeting is shown once per day). */
function lagosDay(at) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
function firstName(fullName) {
    const first = fullName.trim().split(/\s+/)[0] ?? '';
    return first.length > 24 ? first.slice(0, 24) : first;
}
function partOfDay(hour) {
    if (hour < 12)
        return 'Good morning';
    if (hour < 17)
        return 'Good afternoon';
    return 'Good evening';
}
/**
 * "Good morning, Ada. 3 approvals are waiting." — `approvals` null means the
 * count is not known (then the greeting says nothing about approvals).
 */
function greetingText(opts) {
    const hello = opts.name ? `${partOfDay(opts.hour)}, ${opts.name}.` : `${partOfDay(opts.hour)}.`;
    if (opts.approvals === null)
        return `${hello} Ask me anything about your work.`;
    if (opts.approvals === 0)
        return `${hello} Nothing is waiting for your approval.`;
    if (opts.approvals === 1)
        return `${hello} 1 approval is waiting.`;
    return `${hello} ${opts.approvals} approvals are waiting.`;
}
/**
 * Questions that fit the page the person has open: a record page gets
 * questions about that record ("this Job Card"), a list page questions about
 * the list. Every one is something Enyo's tools can actually answer.
 */
const PAGE_PROMPTS = [
    [/^\/workshop\/job-cards\/[^/]+$/, ['Summarise this Job Card and what happens next', 'Are the parts on this job in stock?', 'When is this vehicle likely to be ready?']],
    [/^\/workshop\/vehicle-service\/[^/]+$/, ['Summarise this service and what happens next', 'Are the parts on this service in stock?', 'When is this vehicle likely to be ready?']],
    [/^\/workshop/, ['Which jobs are waiting on approval or parts?', 'How do I open a Job Card?']],
    [/^\/inventory\/reorder/, ['Which parts should we reorder first, and why?', 'Explain how the reorder quantity is worked out']],
    [/^\/inventory/, ['Which parts are out of stock or below their reorder point?', 'Is a brake pad set in stock at my branch?']],
    [/^\/(analytics|dashboard)/, ['How is this month going compared with last month?', 'Brief me on my day']],
    [/^\/mail/, ['Anything important in my email?', 'Which emails still need a reply from me?']],
    [/^\/reminders/, ['What is due for me this week?', 'Remind me tomorrow at 9 am to follow up on approvals']],
    [/^\/approvals/, ['Which approvals have waited longest?', 'How do I approve or return a request?']],
    [/^\/(crm|support)/, ['How do I log a customer complaint?', 'Which customers are due a service soon?']],
    [/^\/warranty/, ['Which warranty claims need attention?', 'How do I raise a warranty claim?']],
    [/^\/security/, ['Which visitors are expected today?', 'How do I check a visitor in?']],
    [/^\/(users|roles|permissions|settings|organisation|branches|structure)/, ['How do I add a user and give them a role?', 'What can each role see and do?']],
    [/^\/enyo/, ['How do Enyo\'s models learn, and who decides what is used?', 'What does Shadow mode mean?']],
];
/** By role, for the dashboard and pages without their own questions. */
function rolePrompts(roleName) {
    const r = roleName.toLowerCase();
    const out = [];
    if (/store|inventory|parts|procure/.test(r))
        out.push('Which parts are out of stock or below their reorder point?', 'What should we reorder this week?');
    if (/workshop|front ?desk|reception|supervisor|technician|service|department head|branch/.test(r))
        out.push('Which jobs are waiting on approval or parts?', 'How do I open a Job Card?');
    if (/finance|account|cashier/.test(r))
        out.push("Today's takings", 'How is this month going compared with last month?');
    if (/manager|admin|director|owner/.test(r))
        out.push('How is this month going compared with last month?', 'What do customers come in for most?');
    if (/security|gate/.test(r))
        out.push('Which visitors are expected today?');
    return out;
}
/**
 * Up to four starter questions for the person's role and the page they are
 * on: always "What's waiting for me?" first, then the page's questions, then
 * the role's, then a guided tour of their role.
 */
function starterPrompts(roleName, page = '') {
    const path = page.split(/[?#]/)[0] ?? '';
    const fromPage = path === '/dashboard' || path === '/' ? [] : (PAGE_PROMPTS.find(([re]) => re.test(path))?.[1] ?? []);
    const all = ["What's waiting for me?", ...fromPage, ...rolePrompts(roleName), 'Walk me through what my role does here, step by step'];
    return [...new Set(all)].slice(0, 4);
}
