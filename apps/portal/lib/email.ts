import nodemailer from 'nodemailer';

/**
 * Single outbound-email helper used by Better Auth's callbacks (password
 * reset, email verification) in lib/auth.ts. Reads SMTP settings from
 * env (see .env.example) — no credentials are ever hardcoded.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

export async function sendEmail(to: string, subject: string, html: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'EJO 100 Platform <no-reply@example.com>',
    to,
    subject,
    html,
  });
}
