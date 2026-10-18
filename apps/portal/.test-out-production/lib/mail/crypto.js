"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailCryptoError = void 0;
exports.readMailKey = readMailKey;
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
exports.secretAad = secretAad;
const node_crypto_1 = require("node:crypto");
/**
 * Mailbox passwords at rest: AES-256-GCM with a server key.
 *
 *   v1:<iv base64url>:<tag base64url>:<ciphertext base64url>
 *
 * The key is MAILBOX_ENCRYPTION_KEY — 32 random bytes, base64 — from the
 * server environment only. The version prefix lets a later key or algorithm
 * live alongside old rows. "Additional data" binds a secret to its owner and
 * address, so a stored secret copied onto another person's row fails to
 * decrypt. Nothing here logs; errors carry no key or text.
 *
 * Server-only. Relative imports only (unit-tested on its own).
 */
class MailCryptoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MailCryptoError';
    }
}
exports.MailCryptoError = MailCryptoError;
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** The key, or null when it is missing or not 32 bytes (the mail feature then shows "not set up"). */
function readMailKey(env = process.env) {
    const raw = (env.MAILBOX_ENCRYPTION_KEY ?? '').trim();
    if (!raw)
        return null;
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw))
        return null;
    const key = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return key.length === 32 ? key : null;
}
const b64 = (b) => b.toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');
function encryptSecret(plain, key, aad = '') {
    if (key.length !== 32)
        throw new MailCryptoError('The mailbox key is not set up correctly.');
    const iv = (0, node_crypto_1.randomBytes)(IV_BYTES);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    if (aad)
        cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${VERSION}:${b64(iv)}:${b64(cipher.getAuthTag())}:${b64(ct)}`;
}
function decryptSecret(blob, key, aad = '') {
    if (key.length !== 32)
        throw new MailCryptoError('The mailbox key is not set up correctly.');
    const parts = typeof blob === 'string' ? blob.split(':') : [];
    if (parts.length !== 4 || parts[0] !== VERSION)
        throw new MailCryptoError('The saved mailbox password is in an unknown format.');
    const [, ivS, tagS, ctS] = parts;
    const iv = unb64(ivS);
    const tag = unb64(tagS);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES)
        throw new MailCryptoError('The saved mailbox password is damaged.');
    try {
        const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
        if (aad)
            decipher.setAAD(Buffer.from(aad, 'utf8'));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(unb64(ctS)), decipher.final()]).toString('utf8');
    }
    catch {
        // Wrong key, changed text or another row's secret: never say which.
        throw new MailCryptoError('The saved mailbox password could not be read. Connect the mailbox again.');
    }
}
/** The additional data for one mailbox row. */
function secretAad(userId, address) {
    return `mailbox:${userId}:${address.trim().toLowerCase()}`;
}
