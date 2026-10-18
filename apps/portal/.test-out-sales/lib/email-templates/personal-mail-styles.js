"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAIL_STYLE_LABEL = exports.MAIL_STYLES = void 0;
/** The styles a person can send an email in (browser-safe: no imports). */
exports.MAIL_STYLES = ['standard', 'action', 'urgent', 'info', 'plain'];
exports.MAIL_STYLE_LABEL = {
    standard: { label: 'Standard', help: 'The organisation letterhead, logo and footer.' },
    action: { label: 'Action needed', help: 'Letterhead with an amber "Action needed" label.' },
    urgent: { label: 'Urgent', help: 'Letterhead with a red "Urgent" label.' },
    info: { label: 'For information', help: 'Letterhead with a blue "For information" label.' },
    plain: { label: 'Plain text', help: 'Your text exactly as typed, no letterhead.' },
};
