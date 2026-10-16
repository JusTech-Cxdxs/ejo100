import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import type { MailSecurity } from './rules';
import { isPrivateAddress } from './net';
import { mailAllowInsecure } from './config';
import { PLATFORM } from '@/lib/brand';

/**
 * Connections to a person's own mail servers (IMAP to read, SMTP to send).
 * Server-only.
 *
 * Safety: the server name is resolved once and the connection goes to that
 * address (the certificate is still checked against the name), and private,
 * loopback and cloud-metadata addresses are refused — a mailbox form must
 * never become a way to probe the company's internal network. Every step has
 * a time limit. Error text from the libraries never reaches a person: it is
 * turned into a plain message here.
 */

export type ServerSettings = { host: string; port: number; security: MailSecurity; username: string; password: string };

export class MailConnectError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'network' | 'tls' | 'timeout' | 'refused' | 'other') {
    super(message);
    this.name = 'MailConnectError';
  }
}

/** The address to connect to, after the safety check. */
async function resolveSafely(host: string): Promise<string> {
  if (mailAllowInsecure()) return host;
  let addrs: { address: string }[];
  try {
    addrs = isIP(host) ? [{ address: host }] : await withTimeout(lookup(host, { all: true }), 5_000, 'lookup');
  } catch (err) {
    if (err instanceof MailConnectError) throw new MailConnectError(`The server name ${host} could not be looked up in time. Check the spelling and try again.`, 'timeout');
    throw new MailConnectError(`The server name ${host} could not be found. Check the spelling.`, 'network');
  }
  if (!addrs.length) throw new MailConnectError(`The server name ${host} could not be found. Check the spelling.`, 'network');
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new MailConnectError(`${host} is not a public mail server. Use the server name your mail provider gives you.`, 'refused');
  return addrs[0]!.address;
}

export async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new MailConnectError(`timeout:${what}`, 'timeout')), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Library errors → one plain sentence (never the library's own text). */
export function friendlyMailError(err: unknown, server: { host: string; port: number }, which: 'incoming' | 'outgoing'): MailConnectError {
  if (err instanceof MailConnectError && !err.message.startsWith('timeout:')) return err;
  const e = (err ?? {}) as { code?: string; authenticationFailed?: boolean; serverResponseCode?: string; responseCode?: number; tlsFailed?: boolean; message?: string; kind?: string };
  const code = String(e.code ?? '');
  const msg = String(e.message ?? '');
  const name = `${which === 'incoming' ? 'The incoming (IMAP) server' : 'The outgoing (SMTP) server'} ${server.host}`;
  if (e.authenticationFailed || e.serverResponseCode === 'AUTHENTICATIONFAILED' || code === 'EAUTH' || e.responseCode === 535 || /auth(entication)? (failed|unsuccessful)|invalid credentials|username and password not accepted/i.test(msg)) {
    return new MailConnectError(`${name} did not accept the username or password. Check them — Gmail and Zoho need an app password, not your normal password.`, 'auth');
  }
  if (e.kind === 'timeout' || /TIMEOUT|ETIMEDOUT|ETIMEOUT/i.test(code) || /timed? ?out/i.test(msg)) {
    return new MailConnectError(`${name} did not answer in time. Check the server name and port, then try again.`, 'timeout');
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new MailConnectError(`The server name ${server.host} could not be found. Check the spelling.`, 'network');
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return new MailConnectError(`${name} refused the connection on port ${server.port}. Check the port and the security setting.`, 'network');
  }
  if (e.tlsFailed || /CERT|SSL|TLS|self[- ]signed|wrong version number|ERR_TLS/i.test(`${code} ${msg}`)) {
    return new MailConnectError(`A secure connection to ${server.host} could not be made. Check the security setting (SSL/TLS or STARTTLS) and the port.`, 'tls');
  }
  return new MailConnectError(`Could not connect to ${name.replace(/^The /, 'the ')}. Check the settings and try again.`, 'other');
}

/** A connected, signed-in IMAP client. The caller must `logout()` (or `close()`). */
export async function openImap(s: ServerSettings, timeoutMs = 20_000): Promise<ImapFlow> {
  const insecure = mailAllowInsecure();
  const address = await resolveSafely(s.host);
  const client = new ImapFlow({
    host: address,
    servername: isIP(s.host) ? undefined : s.host,
    port: s.port,
    secure: s.security === 'tls',
    doSTARTTLS: s.security === 'starttls' ? true : s.security === 'none' ? false : undefined,
    auth: { user: s.username, pass: s.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 30_000,
    tls: { servername: isIP(s.host) ? undefined : s.host, rejectUnauthorized: !insecure, minVersion: 'TLSv1.2' },
    clientInfo: { name: PLATFORM.name, vendor: PLATFORM.makerShort },
  });
  // A dropped connection later on must never crash the server process.
  client.on('error', () => undefined);
  try {
    await withTimeout(client.connect(), timeoutMs, 'imap');
    return client;
  } catch (err) {
    try { client.close(); } catch { /* already closed */ }
    throw friendlyMailError(err, s, 'incoming');
  }
}

export async function closeImap(client: ImapFlow): Promise<void> {
  try {
    await withTimeout(client.logout(), 5_000, 'logout');
  } catch {
    try { client.close(); } catch { /* already closed */ }
  }
}

/** An SMTP transport for one mailbox (connects on use). */
export async function smtpTransport(s: ServerSettings) {
  const insecure = mailAllowInsecure();
  const address = await resolveSafely(s.host);
  return nodemailer.createTransport({
    host: address,
    port: s.port,
    secure: s.security === 'tls',
    requireTLS: s.security === 'starttls',
    ignoreTLS: s.security === 'none',
    auth: { user: s.username, pass: s.password },
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
    tls: { servername: isIP(s.host) ? undefined : s.host, rejectUnauthorized: !insecure, minVersion: 'TLSv1.2' },
  });
}

/** Sign in to both servers (nothing is read or sent). Throws MailConnectError with a plain message. */
export async function testMailbox(imap: ServerSettings, smtp: ServerSettings): Promise<void> {
  const client = await openImap(imap, 20_000);
  try {
    // Opening the inbox proves the account can actually be read.
    await withTimeout(client.mailboxOpen('INBOX', { readOnly: true }), 10_000, 'imap');
  } catch (err) {
    throw friendlyMailError(err, imap, 'incoming');
  } finally {
    await closeImap(client);
  }
  let transport: Awaited<ReturnType<typeof smtpTransport>> | null = null;
  try {
    transport = await smtpTransport(smtp);
    await withTimeout(transport.verify(), 20_000, 'smtp');
  } catch (err) {
    throw friendlyMailError(err, smtp, 'outgoing');
  } finally {
    transport?.close();
  }
}
