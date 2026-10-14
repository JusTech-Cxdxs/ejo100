#!/usr/bin/env node
/**
 * A throw-away IMAP + SMTP server for the mailbox E2E tests (CI only).
 *
 *   IMAP  :3143  hoodiecrow-imap, one user (wura@mail.e2e.test / wura-mail-pass), plain connection
 *   SMTP  :3025  smtp-server; mail addressed to that user lands in its IMAP INBOX.
 *                Sending needs no login (like a receiving server); a login, when
 *                given, must be the user's.
 *
 * Start: node apps/portal/e2e/mail-test-server.cjs   (ports E2E_IMAP_PORT / E2E_SMTP_PORT)
 * Never used outside tests: no TLS, fixed credentials.
 */
const hoodiecrow = require('hoodiecrow-imap');
const { SMTPServer } = require('smtp-server');

const USER = process.env.E2E_MAIL_USER || 'wura@mail.e2e.test';
const PASS = process.env.E2E_MAIL_PASS || 'wura-mail-pass';
const IMAP_PORT = Number(process.env.E2E_IMAP_PORT || 3143);
const SMTP_PORT = Number(process.env.E2E_SMTP_PORT || 3025);

const imap = hoodiecrow({
  plugins: ['ID', 'SASL-IR', 'AUTH-PLAIN', 'NAMESPACE', 'IDLE', 'ENABLE', 'CONDSTORE', 'LITERALPLUS', 'UNSELECT', 'SPECIAL-USE'],
  users: { [USER]: { password: PASS } },
  storage: { INBOX: { messages: [] } },
});
imap.listen(IMAP_PORT, () => console.log(`test IMAP on :${IMAP_PORT} (${USER})`));

const smtp = new SMTPServer({
  authOptional: true,
  allowInsecureAuth: true,
  disabledCommands: ['STARTTLS'],
  onAuth(auth, _session, cb) {
    if (auth.username === USER && auth.password === PASS) cb(null, { user: USER });
    else cb(new Error('Invalid username or password'));
  },
  onData(stream, session, cb) {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const toUser = session.envelope.rcptTo.some((r) => r.address.toLowerCase() === USER);
      if (toUser) imap.appendMessage('INBOX', [], new Date(), raw);
      const subject = (/^Subject: (.*)$/m.exec(raw) || [])[1] || '';
      console.log(`SMTP ${session.user ? '(signed in) ' : ''}to ${session.envelope.rcptTo.map((r) => r.address).join(', ')}: ${subject}`);
      cb();
    });
  },
});
smtp.listen(SMTP_PORT, () => console.log(`test SMTP on :${SMTP_PORT}`));
