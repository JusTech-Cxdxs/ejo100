"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Mailbox passwords at rest (lib/mail/crypto.ts): AES-256-GCM, versioned,
 * bound to the owner and address. Pure: no database, no network.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const crypto_1 = require("../lib/mail/crypto");
const key = (0, node_crypto_1.randomBytes)(32);
(0, node_test_1.test)('round trip, with a fresh IV every time', () => {
    const aad = (0, crypto_1.secretAad)('user-1', 'Ada@Example.com');
    const a = (0, crypto_1.encryptSecret)('app-password 1234 abcd', key, aad);
    const b = (0, crypto_1.encryptSecret)('app-password 1234 abcd', key, aad);
    strict_1.default.match(a, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    strict_1.default.notEqual(a, b, 'same password, different ciphertext');
    strict_1.default.equal((0, crypto_1.decryptSecret)(a, key, aad), 'app-password 1234 abcd');
    strict_1.default.equal((0, crypto_1.decryptSecret)(b, key, (0, crypto_1.secretAad)('user-1', ' ada@example.com ')), 'app-password 1234 abcd', 'the address is normalised');
    strict_1.default.ok(!a.includes('app-password'), 'never stored in clear');
    strict_1.default.equal((0, crypto_1.decryptSecret)((0, crypto_1.encryptSecret)('ñ€ unicode ✓', key), key), 'ñ€ unicode ✓');
});
(0, node_test_1.test)('tampering is detected (ciphertext, tag, iv, version)', () => {
    const blob = (0, crypto_1.encryptSecret)('secret', key, 'aad');
    const [v, iv, tag, ct] = blob.split(':');
    const flip = (s) => { const b = Buffer.from(s, 'base64url'); b[0] = b[0] ^ 1; return b.toString('base64url'); };
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(`${v}:${iv}:${tag}:${flip(ct)}`, key, 'aad'), crypto_1.MailCryptoError);
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(`${v}:${iv}:${flip(tag)}:${ct}`, key, 'aad'), crypto_1.MailCryptoError);
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(`${v}:${flip(iv)}:${tag}:${ct}`, key, 'aad'), crypto_1.MailCryptoError);
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(`v2:${iv}:${tag}:${ct}`, key, 'aad'), crypto_1.MailCryptoError);
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)('not-a-secret', key, 'aad'), crypto_1.MailCryptoError);
});
(0, node_test_1.test)('a wrong key, or another person\'s row, cannot read it', () => {
    const blob = (0, crypto_1.encryptSecret)('secret', key, (0, crypto_1.secretAad)('user-1', 'a@x.com'));
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(blob, (0, node_crypto_1.randomBytes)(32), (0, crypto_1.secretAad)('user-1', 'a@x.com')), crypto_1.MailCryptoError);
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(blob, key, (0, crypto_1.secretAad)('user-2', 'a@x.com')), crypto_1.MailCryptoError, 'copied onto another person');
    strict_1.default.throws(() => (0, crypto_1.decryptSecret)(blob, key, (0, crypto_1.secretAad)('user-1', 'b@x.com')), crypto_1.MailCryptoError, 'another address');
    // The error says nothing about the key or the text.
    try {
        (0, crypto_1.decryptSecret)(blob, (0, node_crypto_1.randomBytes)(32), 'x');
    }
    catch (e) {
        strict_1.default.doesNotMatch(String(e.message), /secret|key=|[A-Za-z0-9+/]{30,}/);
    }
});
(0, node_test_1.test)('the key must be 32 bytes of base64; otherwise mail is "not set up"', () => {
    strict_1.default.equal((0, crypto_1.readMailKey)({}), null);
    strict_1.default.equal((0, crypto_1.readMailKey)({ MAILBOX_ENCRYPTION_KEY: '' }), null);
    strict_1.default.equal((0, crypto_1.readMailKey)({ MAILBOX_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }), null, '16 bytes is too short');
    strict_1.default.equal((0, crypto_1.readMailKey)({ MAILBOX_ENCRYPTION_KEY: 'not base64 !!' }), null);
    const k = (0, crypto_1.readMailKey)({ MAILBOX_ENCRYPTION_KEY: 'ZTJlLW9ubHktbWFpbGJveC1rZXktMzItYnl0ZXMhISE=' });
    strict_1.default.equal(k?.length, 32, 'the CI test key is valid');
    strict_1.default.throws(() => (0, crypto_1.encryptSecret)('x', Buffer.alloc(16)), crypto_1.MailCryptoError);
});
