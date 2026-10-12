import nodemailer, { type Transporter } from 'nodemailer';
import { htmlToText } from './email-templates/layout';

/**
 * Outbound email for the website (customer portal "forgot password").
 * Mirrors apps/portal/lib/email.ts: the two apps are separate deployments
 * and never import from each other. Same environment names as the portal:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (or SMTP_PASS), SMTP_FROM.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

/** Sends one email as multipart/alternative (HTML and plain text). */
export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  if (!process.env.SMTP_HOST) {
    // Local preview builds have no mail server; a request must not fail over it.
    // eslint-disable-next-line no-console
    console.warn('Email not sent: SMTP_HOST is not set.');
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? 'Customer portal <no-reply@example.com>',
    to,
    subject,
    html,
    text: text ?? htmlToText(html),
  });
}

/** The website's own public address — absolute links in emails. */
export function websiteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}
