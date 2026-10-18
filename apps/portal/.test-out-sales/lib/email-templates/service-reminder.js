"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderServiceReminderEmail = renderServiceReminderEmail;
exports.serviceReminderSubject = serviceReminderSubject;
const layout_1 = require("./layout");
const ordinal_1 = require("../utils/ordinal");
/**
 * Four stages, the tone moving from a light reminder to a clear "due now".
 * Every stage says plainly that the due point is an estimate, and only shows
 * figures the system actually has.
 */
const STAGES = {
    1: {
        status: 'Service reminder',
        tone: 'info',
        heading: 'Your next service is coming up',
        subject: (v) => `Service reminder for your ${v}`,
        body: (v) => `We hope your ${v} is running well. Based on its service history, the next routine service is estimated below. If you have been driving more than usual, your odometer reading is the best guide.`,
    },
    2: {
        status: 'Service reminder',
        tone: 'info',
        heading: 'Your next service is getting close',
        subject: (v) => `Your ${v} is getting close to its next service`,
        body: (v) => `Your ${v} is getting close to its next routine service. The point shown below is an estimate, not a fixed appointment; how the vehicle is used can bring it forward or push it back.`,
    },
    3: {
        status: 'Service may be due',
        tone: 'warning',
        heading: 'Your vehicle may be due for a service',
        subject: (v) => `Your ${v} may be due for a service`,
        body: (v) => `Your ${v} may now be due for its routine service. Please check the odometer: if it has reached the mileage below, or the date has passed, it is a good time to book. Small issues are cheaper to fix early.`,
    },
    4: {
        status: 'Service due',
        tone: 'danger',
        heading: 'Your vehicle is due for a service',
        subject: (v) => `Your ${v} is due for a service`,
        body: (v) => `By our records, your ${v} has reached or passed its estimated service point. Actual use can move this earlier or later, so please check the odometer and book a routine service if the interval has been reached.`,
    },
};
function km(n) {
    return `${n.toLocaleString('en-NG')} km`;
}
function renderServiceReminderEmail(o) {
    const s = STAGES[o.stage];
    const vehicle = (0, layout_1.vehicleLabel)(o.vehicleDescription, o.plateNumber);
    const due = [o.estimatedDueOdometer !== null ? km(o.estimatedDueOdometer) : null, o.estimatedDueDate ? (0, layout_1.formatEmailDate)(o.estimatedDueDate) : null].filter(Boolean).join(' or ');
    const remaining = [o.kmRemaining !== null ? `about ${km(o.kmRemaining)}` : null, o.daysRemaining !== null ? (0, layout_1.plural)(o.daysRemaining, 'day') : null].filter(Boolean).join(' or ');
    const dueSub = o.isOverdue
        ? 'The estimated service point has been reached.'
        : remaining
            ? `${remaining} to go${o.estimatedDueOdometer !== null && o.estimatedDueDate ? ', whichever comes first' : ''}.`
            : undefined;
    const lastService = [o.lastServiceMileage !== null ? km(o.lastServiceMileage) : null, o.lastServiceDate ? (0, layout_1.formatEmailDate)(o.lastServiceDate) : null].filter(Boolean).join(' on ');
    const bodyHtml = (0, layout_1.html) `
    ${(0, layout_1.greeting)(o.customerName)}
    ${(0, layout_1.para)(s.body(vehicle))}
    ${due ? (0, layout_1.highlight)('Next routine service', due, dueSub, o.isOverdue ? 'danger' : o.stage >= 3 ? 'warning' : 'success') : ''}
    ${(0, layout_1.details)([
        ['Vehicle', vehicle],
        ['Recorded mileage', o.currentMileage !== null ? km(o.currentMileage) : null],
        ['Last service', lastService],
        ['Reminder', `${(0, ordinal_1.ordinal)(Math.max(1, o.reminderCount))} reminder for this service`],
    ])}
    ${(0, layout_1.callout)('Do not wait for the next service if something feels wrong: warning lights, unusual noises, changes in braking or steering, overheating, leaks or tyre problems. Contact us and we will help you decide what to do.', 'neutral', 'Between services')}
    ${(0, layout_1.para)('These dates and distances are estimates from the latest service information we hold. If the vehicle has been serviced elsewhere, let us know and we will update our records.', 'small')}`;
    return (0, layout_1.renderEmailLayout)({
        previewText: due ? `Next routine service for your ${vehicle}: ${due}.` : s.subject(vehicle),
        companyName: o.companyName,
        logoUrl: o.logoUrl,
        orgContext: [o.branchName],
        status: { label: s.status, tone: s.tone },
        heading: s.heading,
        bodyHtml,
        ctaLabel: 'View my vehicle',
        ctaUrl: o.vehicleUrl,
        audience: 'customer',
    });
}
function serviceReminderSubject(stage, vehicle) {
    return STAGES[stage].subject(vehicle?.trim() || 'vehicle');
}
