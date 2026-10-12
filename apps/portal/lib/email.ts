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
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'EJO 100 <no-reply@example.com>',
    to,
    subject,
    html,
    text: options.text ?? htmlToText(html),
    headers: options.headers,
    attachments,
  });
}
