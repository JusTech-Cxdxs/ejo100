import nodemailer from 'nodemailer';
import { htmlToText } from './email-templates/layout';

/**
 * The one outbound-email helper. SMTP settings come from the environment
 * (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD or SMTP_PASS, SMTP_FROM);
 * nothing is hard-coded.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS }
    : undefined,
});

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendEmailOptions = {
  /** Plain-text part. Derived from the HTML when omitted. */
  text?: string;
  /** Extra headers, e.g. List-Unsubscribe on announcement emails. */
  headers?: Record<string, string>;
  /** false: never copied to the observer (sign-in links, password and account emails). */
  observer?: boolean;
};

/**
 * Sends one email as multipart/alternative (HTML and plain text), so
 * text-only clients and spam filters both get a proper version.
 */
/** Raised when there is no address to send to: a customer brought in from SAP or an old spreadsheet without an email. */
export class NoEmailAddressError extends Error {
  constructor() {
    super('This customer has no email address on file. Add one on their customer page, or reach them by phone.');
    this.name = 'NoEmailAddressError';
  }
}

/**
 * Sends one email. A missing address (a customer with no email on file) is
 * refused with NoEmailAddressError rather than skipped, so every caller's
 * existing "could not be sent" path runs and nothing is recorded as sent.
 */
export async function sendEmail(to: string | null | undefined, subject: string, html: string, attachments?: EmailAttachment[], options: SendEmailOptions = {}) {
  if (!to || !to.trim()) throw new NoEmailAddressError();
  // The observer copy is for staff workflow mail only: never sign-in links or
  // account emails (observer: false), never mail to customers or outsiders.
  const watch = options.observer === false ? [] : await staffOnly(to).then((ok) => (ok ? observerCopies(to) : [])).catch(() => []);
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'EJO 100 <no-reply@example.com>',
    to,
    ...(watch.length ? { bcc: watch } : {}),
    subject,
    html,
    text: options.text ?? htmlToText(html),
    headers: options.headers,
    attachments,
  });
}

/** Every recipient is an active staff account (so the copy never carries a customer's mail). */
async function staffOnly(to: string): Promise<boolean> {
  const list = to.toLowerCase().split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!list.length) return false;
  const { prisma } = await import('@ejo/database');
  const n = await prisma.user.count({ where: { email: { in: list, mode: 'insensitive' }, isActive: true, accountType: 'EMPLOYEE' } });
  return n === list.length;
}

/**
 * While the platform is being tested and handed over, the platform owner gets
 * a blind copy of every staff workflow email the portal sends — the real recipients (the
 * people whose role the step needs) still get theirs, and never see the copy.
 * MAIL_OBSERVER_BCC: a comma-separated list of addresses, or "off" to stop
 * (set it to off at go-live). Unset: the platform owner (PLATFORM_OWNER_EMAIL).
 */
export function observerCopies(to: string, env: Record<string, string | undefined> = process.env): string[] {
  const raw = (env.MAIL_OBSERVER_BCC ?? '').trim();
  if (raw.toLowerCase() === 'off') return [];
  const list = (raw || env.PLATFORM_OWNER_EMAIL || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const already = to.toLowerCase().split(/[,;]/).map((x) => x.trim());
  return [...new Set(list)].filter((x) => !already.includes(x)).slice(0, 5);
}
