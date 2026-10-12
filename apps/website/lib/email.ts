import { siteConfig } from './site-config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email for the website (customer portal "forgot password").
 * A copy of apps/portal/lib/email.ts — the two apps are separate
 * deployments and never import across each other. Same env names as the
 * portal: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (fallback
 * SMTP_PASS), SMTP_FROM. No credentials are ever hard-coded.
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

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.SMTP_HOST) {
    // Not configured (local preview builds): never crash a request over it.
    // eslint-disable-next-line no-console
    console.warn('Email not sent: SMTP_HOST is not set.');
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || `${siteConfig.organisationName} <no-reply@example.com>`,
    to,
    subject,
    html,
  });
}

/** The website's own public address — absolute links in emails (lib/site-urls.ts). */
export { websiteBaseUrl } from './site-urls';
