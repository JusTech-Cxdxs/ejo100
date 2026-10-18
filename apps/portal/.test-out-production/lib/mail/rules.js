"use strict";
/**
 * Work mailbox — plain rules: providers, what a person may type when
 * connecting, and the compose page's pre-fill. No database, no network,
 * relative imports only (unit-tested on its own).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECIPIENTS = exports.BODY_MAX = exports.SUBJECT_MAX = exports.SMTP_PORTS = exports.IMAP_PORTS = exports.MAIL_PRESETS = void 0;
exports.isMicrosoftMailbox = isMicrosoftMailbox;
exports.isEmail = isEmail;
exports.isHostName = isHostName;
exports.validateConnect = validateConnect;
exports.securityFromFlag = securityFromFlag;
exports.parseAddressList = parseAddressList;
exports.parseComposePrefill = parseComposePrefill;
exports.composeHref = composeHref;
exports.replySubject = replySubject;
exports.quoteForReply = quoteForReply;
exports.MAIL_PRESETS = [
    {
        key: 'gmail', label: 'Gmail or Google Workspace', supported: true,
        imapHost: 'imap.gmail.com', imapPort: 993, imapSecurity: 'tls', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecurity: 'tls',
        help: 'Google asks for an app password, not your normal password. Turn on 2-Step Verification in your Google Account (Security), then create an app password (Security → App passwords) and paste the 16 letters here. In Gmail settings, make sure IMAP is on (Settings → Forwarding and POP/IMAP).',
    },
    {
        key: 'zoho', label: 'Zoho Mail', supported: true,
        imapHost: 'imap.zoho.com', imapPort: 993, imapSecurity: 'tls', smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecurity: 'tls',
        help: 'Turn on IMAP access in Zoho Mail (Settings → Mail accounts → IMAP). If your account uses two-factor sign-in, create an application-specific password and use it here. Accounts hosted in Europe or India use imap.zoho.eu / smtp.zoho.eu or imap.zoho.in / smtp.zoho.in.',
    },
    {
        key: 'custom', label: 'Company mail (cPanel) or another provider', supported: true,
        imapHost: '', imapPort: 993, imapSecurity: 'tls', smtpHost: '', smtpPort: 465, smtpSecurity: 'tls',
        help: 'Your IT team or mail host has these settings. On cPanel they are under Email Accounts → Connect Devices (usually mail.yourcompany.com, IMAP 993 and SMTP 465, both SSL/TLS).',
    },
    {
        key: 'microsoft', label: 'Microsoft 365, Outlook.com or Hotmail', supported: false,
        imapHost: 'outlook.office365.com', imapPort: 993, imapSecurity: 'tls', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecurity: 'starttls',
        help: 'Microsoft no longer accepts passwords from other apps for these mailboxes. They will connect with a "Sign in with Microsoft" button in a later version. Until then, keep using Outlook for this mailbox.',
    },
];
const MICROSOFT_DOMAINS = /@(outlook|hotmail|live|msn)\.[a-z.]+$/i;
const MICROSOFT_HOSTS = /(^|\.)(office365\.com|outlook\.com|office\.com|microsoft\.com|hotmail\.com|live\.com)$/i;
/** True when this mailbox needs Microsoft's own sign-in (not supported by password). */
function isMicrosoftMailbox(address, imapHost = '', smtpHost = '') {
    return MICROSOFT_DOMAINS.test(address.trim()) || MICROSOFT_HOSTS.test(imapHost.trim()) || MICROSOFT_HOSTS.test(smtpHost.trim());
}
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
function isEmail(v) {
    return typeof v === 'string' && v.length <= 254 && EMAIL.test(v);
}
const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
function isHostName(v) {
    return typeof v === 'string' && HOST.test(v);
}
/** Ports a mailbox may use (plus any port when test servers are allowed). */
exports.IMAP_PORTS = [993, 143];
exports.SMTP_PORTS = [465, 587, 25, 2525];
const one = (v, max) => (typeof v === 'string' ? v.replace(/[\r\n\t]/g, ' ').trim().slice(0, max) : '');
/**
 * What a person typed on the connect form → clean settings, or a plain
 * message saying what to fix. `allowInsecure` (test servers only) permits
 * unencrypted connections and any port.
 */
function validateConnect(raw, opts = {}) {
    const address = one(raw.address, 254).toLowerCase();
    if (!isEmail(address))
        return { ok: false, message: 'Enter your work email address, like name@company.com.' };
    const displayName = one(raw.displayName, 120);
    const imapHost = one(raw.imapHost, 253).toLowerCase();
    const smtpHost = one(raw.smtpHost, 253).toLowerCase();
    if (isMicrosoftMailbox(address, imapHost, smtpHost))
        return { ok: false, message: exports.MAIL_PRESETS.find((p) => p.key === 'microsoft').help };
    if (!isHostName(imapHost))
        return { ok: false, message: 'Enter the incoming (IMAP) server, like imap.gmail.com.' };
    if (!isHostName(smtpHost))
        return { ok: false, message: 'Enter the outgoing (SMTP) server, like smtp.gmail.com.' };
    const imapPort = Number(raw.imapPort);
    const smtpPort = Number(raw.smtpPort);
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535)
        return { ok: false, message: 'The incoming server port must be a number, usually 993.' };
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
        return { ok: false, message: 'The outgoing server port must be a number, usually 465 or 587.' };
    if (!opts.allowInsecure && !exports.IMAP_PORTS.includes(imapPort))
        return { ok: false, message: 'The incoming server port must be 993 (or 143 with STARTTLS).' };
    if (!opts.allowInsecure && !exports.SMTP_PORTS.includes(smtpPort))
        return { ok: false, message: 'The outgoing server port must be 465, 587, 25 or 2525.' };
    const sec = (v) => (v === 'tls' || v === 'starttls' || (v === 'none' && opts.allowInsecure) ? v : null);
    const imapSecurity = sec(raw.imapSecurity);
    const smtpSecurity = sec(raw.smtpSecurity);
    if (!imapSecurity || !smtpSecurity)
        return { ok: false, message: 'Choose how each server is secured: SSL/TLS or STARTTLS.' };
    const username = one(raw.username, 254) || address;
    const password = typeof raw.password === 'string' ? raw.password.replace(/[\r\n]/g, '') : '';
    if (!password)
        return { ok: false, message: 'Enter the mailbox password (or the app password).' };
    if (password.length > 512)
        return { ok: false, message: 'That password is too long.' };
    return { ok: true, value: { address, displayName, imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, username, password } };
}
/**
 * How the stored flag maps to a connection: `secure` = SSL/TLS from the first
 * byte. Not secure = STARTTLS, required — except on test servers, where it
 * means a plain connection.
 */
function securityFromFlag(secure, allowInsecure) {
    return secure ? 'tls' : allowInsecure ? 'none' : 'starttls';
}
// ── Compose pre-fill ───────────────────────────────────────────────────
exports.SUBJECT_MAX = 300;
exports.BODY_MAX = 20_000;
exports.MAX_RECIPIENTS = 20;
/** "a@x.com, B <b@y.com>; c@z.com" → valid addresses (lower-case, unique), at most MAX_RECIPIENTS. Invalid ones are reported. */
function parseAddressList(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return { valid: [], invalid: [] };
    const valid = [];
    const invalid = [];
    for (const piece of raw.slice(0, 5000).split(/[,;\n]+/)) {
        const p = piece.trim();
        if (!p)
            continue;
        const angle = /<([^<>]+)>\s*$/.exec(p);
        const addr = (angle ? angle[1] : p).trim().toLowerCase();
        if (isEmail(addr)) {
            if (!valid.includes(addr))
                valid.push(addr);
        }
        else
            invalid.push(p.slice(0, 80));
    }
    return { valid: valid.slice(0, exports.MAX_RECIPIENTS), invalid };
}
const MESSAGE_ID = /^[A-Za-z0-9_-]{8,64}$/;
/**
 * `/mail/compose?to=…&cc=…&subject=…&body=…&inReplyTo=<message id>` — every
 * value checked and clipped; invalid addresses dropped; nothing is sent until
 * the person presses Send. `inReplyTo` / `forward` name one of the person's
 * OWN stored messages (checked again on the server when sending).
 */
function parseComposePrefill(params) {
    const get = (k) => {
        const v = params[k];
        return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
    };
    const to = parseAddressList(get('to')).valid.join(', ');
    const cc = parseAddressList(get('cc')).valid.join(', ');
    // eslint-disable-next-line no-control-regex
    const subject = get('subject').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, exports.SUBJECT_MAX);
    // eslint-disable-next-line no-control-regex
    const body = get('body').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, exports.BODY_MAX);
    const out = { to, cc, subject, body };
    const reply = get('inReplyTo');
    const fwd = get('forward');
    if (MESSAGE_ID.test(reply)) {
        out.inReplyTo = reply;
        if (get('all') === '1')
            out.replyAll = true;
    }
    else if (MESSAGE_ID.test(fwd))
        out.forwardOf = fwd;
    return out;
}
function composeHref(p) {
    const q = new URLSearchParams();
    if (p.to)
        q.set('to', p.to);
    if (p.cc)
        q.set('cc', p.cc);
    if (p.subject)
        q.set('subject', p.subject);
    if (p.body)
        q.set('body', p.body.slice(0, 4000));
    if (p.inReplyTo)
        q.set('inReplyTo', p.inReplyTo);
    if (p.inReplyTo && p.replyAll)
        q.set('all', '1');
    if (p.forwardOf && !p.inReplyTo)
        q.set('forward', p.forwardOf);
    const s = q.toString();
    return `/mail/compose${s ? `?${s}` : ''}`;
}
/** "Re: Re: Hello" → "Re: Hello"; "Fwd: x" for forwards. */
function replySubject(subject, kind) {
    const base = subject.replace(/^\s*((re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, '').trim();
    return `${kind === 'reply' ? 'Re' : 'Fwd'}: ${base}`.slice(0, exports.SUBJECT_MAX);
}
/** The original quoted under a reply: "On Thu 15 Oct, Ada wrote:" then "> " lines. */
function quoteForReply(original, max = 6000) {
    const who = original.fromName ? `${original.fromName} <${original.fromAddress}>` : original.fromAddress;
    const lines = original.body.slice(0, max).split('\n').map((l) => `> ${l}`);
    return `\n\nOn ${original.when}, ${who} wrote:\n${lines.join('\n')}`;
}
