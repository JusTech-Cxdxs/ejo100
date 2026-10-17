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
};

/**
 * Sends one email as multipart/alternative (HTML and plain text), so
 * text-only clients and spam filters both get a proper version.
 */
export async function sendEmail(to: string, subject: string, html: string, attachments?: EmailAttachment[], options: SendEmailOptions = {}) {
  const watch = observerCopies(to);
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

/**
 * While the platform is being tested and handed over, the platform owner gets
 * a blind copy of every email the portal sends — the real recipients (the
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
