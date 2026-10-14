/**
 * Mailbox passwords at rest (lib/mail/crypto.ts): AES-256-GCM, versioned,
 * bound to the owner and address. Pure: no database, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, MailCryptoError, readMailKey, secretAad } from '../lib/mail/crypto';

const key = randomBytes(32);

test('round trip, with a fresh IV every time', () => {
  const aad = secretAad('user-1', 'Ada@Example.com');
  const a = encryptSecret('app-password 1234 abcd', key, aad);
  const b = encryptSecret('app-password 1234 abcd', key, aad);
  assert.match(a, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b, 'same password, different ciphertext');
  assert.equal(decryptSecret(a, key, aad), 'app-password 1234 abcd');
  assert.equal(decryptSecret(b, key, secretAad('user-1', ' ada@example.com ')), 'app-password 1234 abcd', 'the address is normalised');
  assert.ok(!a.includes('app-password'), 'never stored in clear');
  assert.equal(decryptSecret(encryptSecret('ñ€ unicode ✓', key), key), 'ñ€ unicode ✓');
});

test('tampering is detected (ciphertext, tag, iv, version)', () => {
  const blob = encryptSecret('secret', key, 'aad');
  const [v, iv, tag, ct] = blob.split(':') as [string, string, string, string];
  const flip = (s: string) => { const b = Buffer.from(s, 'base64url'); b[0] = b[0]! ^ 1; return b.toString('base64url'); };
  assert.throws(() => decryptSecret(`${v}:${iv}:${tag}:${flip(ct)}`, key, 'aad'), MailCryptoError);
  assert.throws(() => decryptSecret(`${v}:${iv}:${flip(tag)}:${ct}`, key, 'aad'), MailCryptoError);
  assert.throws(() => decryptSecret(`${v}:${flip(iv)}:${tag}:${ct}`, key, 'aad'), MailCryptoError);
  assert.throws(() => decryptSecret(`v2:${iv}:${tag}:${ct}`, key, 'aad'), MailCryptoError);
  assert.throws(() => decryptSecret('not-a-secret', key, 'aad'), MailCryptoError);
});

test('a wrong key, or another person\'s row, cannot read it', () => {
  const blob = encryptSecret('secret', key, secretAad('user-1', 'a@x.com'));
  assert.throws(() => decryptSecret(blob, randomBytes(32), secretAad('user-1', 'a@x.com')), MailCryptoError);
  assert.throws(() => decryptSecret(blob, key, secretAad('user-2', 'a@x.com')), MailCryptoError, 'copied onto another person');
  assert.throws(() => decryptSecret(blob, key, secretAad('user-1', 'b@x.com')), MailCryptoError, 'another address');
  // The error says nothing about the key or the text.
  try { decryptSecret(blob, randomBytes(32), 'x'); } catch (e) { assert.doesNotMatch(String((e as Error).message), /secret|key=|[A-Za-z0-9+/]{30,}/); }
});

test('the key must be 32 bytes of base64; otherwise mail is "not set up"', () => {
  assert.equal(readMailKey({}), null);
  assert.equal(readMailKey({ MAILBOX_ENCRYPTION_KEY: '' }), null);
  assert.equal(readMailKey({ MAILBOX_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }), null, '16 bytes is too short');
  assert.equal(readMailKey({ MAILBOX_ENCRYPTION_KEY: 'not base64 !!' }), null);
  const k = readMailKey({ MAILBOX_ENCRYPTION_KEY: 'ZTJlLW9ubHktbWFpbGJveC1rZXktMzItYnl0ZXMhISE=' });
  assert.equal(k?.length, 32, 'the CI test key is valid');
  assert.throws(() => encryptSecret('x', Buffer.alloc(16)), MailCryptoError);
});
