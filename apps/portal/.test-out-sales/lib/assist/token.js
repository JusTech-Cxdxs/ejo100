"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSIST_COOKIE = void 0;
exports.sessionBinding = sessionBinding;
exports.signAssistToken = signAssistToken;
exports.signedAssistId = signedAssistId;
exports.verifyAssistToken = verifyAssistToken;
const node_crypto_1 = require("node:crypto");
/** Server-only: signing and checking the assisted-session cookie. */
exports.ASSIST_COOKIE = 'ejo-assist';
// ── The cookie ──────────────────────────────────────────────────────────
// "v1.<assist session id>.<binding>.<signature>". The binding is a short hash
// of the assistant's own sign-in session, so the cookie is useless after they
// sign out, and useless to anyone without that sign-in as well.
const b64url = (buf) => buf.toString('base64url');
function sessionBinding(authSessionId) {
    return b64url((0, node_crypto_1.createHash)('sha256').update(`assist-binding:${authSessionId}`).digest().subarray(0, 16));
}
// A key of its own, derived from the auth secret, so this signature can never
// be confused with anything else signed with BETTER_AUTH_SECRET.
function signature(payload, secret) {
    const key = (0, node_crypto_1.createHmac)('sha256', secret).update('ejo-assist-cookie-v1').digest();
    return b64url((0, node_crypto_1.createHmac)('sha256', key).update(payload).digest());
}
function signAssistToken(assistSessionId, authSessionId, secret) {
    if (!secret || secret.length < 16)
        throw new Error('Assisted sessions need BETTER_AUTH_SECRET to be set.');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(assistSessionId))
        throw new Error('Invalid session id.');
    const payload = `v1.${assistSessionId}.${sessionBinding(authSessionId)}`;
    return `${payload}.${signature(payload, secret)}`;
}
/** The id inside a cookie we signed, whatever sign-in it was bound to (null when forged). */
function signedAssistId(token, secret) {
    if (!token || !secret || secret.length < 16 || token.length > 300)
        return null;
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1')
        return null;
    const [, id, binding, sig] = parts;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
        return null;
    const expected = Buffer.from(signature(`v1.${id}.${binding}`, secret));
    const given = Buffer.from(sig);
    return expected.length === given.length && (0, node_crypto_1.timingSafeEqual)(expected, given) ? id : null;
}
/** The assist session id, when the cookie is genuine and belongs to this sign-in; otherwise null. */
function verifyAssistToken(token, authSessionId, secret) {
    const id = signedAssistId(token, secret);
    if (!id || !authSessionId)
        return null;
    // Signed by us, but for a different sign-in (signed out and back in, or copied to another browser).
    const want = Buffer.from(sessionBinding(authSessionId));
    const have = Buffer.from(token.split('.')[2]);
    if (want.length !== have.length || !(0, node_crypto_1.timingSafeEqual)(want, have))
        return null;
    return id;
}
