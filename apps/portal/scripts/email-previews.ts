/**
 * Renders every email template with sample data to .email-previews/ (gitignored):
 * one .html and one .txt per email, plus index.html linking them all.
 *
 *   cd apps/portal && npx tsx scripts/email-previews.ts
 *
 * Logo URLs point at the local copy so the previews work offline.
 */
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { emailSamples, SAMPLE_PORTAL, SAMPLE_WEBSITE, type EmailSample } from '../tests/email-fixtures';
import { htmlToText, escapeHtml } from '../lib/email-templates/layout';
import { renderCustomerPasswordResetEmail } from '../../website/lib/email-templates/customer-password-reset';

const out = join(__dirname, '..', '.email-previews');
mkdirSync(out, { recursive: true });
copyFileSync(join(__dirname, '..', 'public', 'images', 'logo', 'email-logo.png'), join(out, 'email-logo.png'));

const samples: EmailSample[] = [
  ...emailSamples(),
  {
    name: 'customer-password-reset',
    template: 'website: renderCustomerPasswordResetEmail',
    audience: 'customer',
    render: () => renderCustomerPasswordResetEmail({ fullName: 'Adaeze Okafor', email: 'adaeze@example.com', url: `${SAMPLE_WEBSITE}/customer-portal/reset-password?token=abc`, expiresInMinutes: 60, companyName: 'Kewalram Chanrai Group', logoUrl: `${SAMPLE_WEBSITE}/images/logo/email-logo.png` }),
  },
];

const rows: string[] = [];
for (const s of samples) {
  const r = s.render();
  const html = typeof r === 'string' ? r : r.html;
  const subject = typeof r === 'string' ? (s.subject ?? '(subject set at the call site)') : r.subject;
  const local = html.split(`${SAMPLE_PORTAL}/images/logo/email-logo.png`).join('email-logo.png').split(`${SAMPLE_WEBSITE}/images/logo/email-logo.png`).join('email-logo.png');
  writeFileSync(join(out, `${s.name}.html`), local);
  writeFileSync(join(out, `${s.name}.txt`), `Subject: ${subject}\n\n${htmlToText(html)}`);
  rows.push(`<tr><td><a href="${s.name}.html">${s.name}</a></td><td>${s.audience}</td><td>${escapeHtml(subject)}</td><td><a href="${s.name}.txt">text</a></td></tr>`);
}
writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><style>body{font:14px system-ui;margin:24px}td{padding:4px 10px;border-bottom:1px solid #ddd}</style><h1>Email previews (${samples.length})</h1><table>${rows.join('')}</table>`);
console.log(`Wrote ${samples.length} previews to ${out}`);
