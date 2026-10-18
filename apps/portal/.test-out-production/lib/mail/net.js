"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrivateAddress = isPrivateAddress;
const node_net_1 = require("node:net");
/**
 * Addresses a mail connection must never go to: private networks, loopback,
 * link-local (cloud metadata), carrier-grade NAT, multicast and reserved.
 * Pure; relative imports only (unit-tested).
 */
const PRIVATE_V4 = [
    [0x0a000000, 8], [0xac100000, 12], [0xc0a80000, 16], [0x7f000000, 8], [0xa9fe0000, 16], [0x64400000, 10], [0x00000000, 8], [0xe0000000, 4], [0xf0000000, 4],
];
function v4ToInt(ip) {
    return ip.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0;
}
function isPrivateAddress(ip) {
    if ((0, node_net_1.isIP)(ip) === 4) {
        const n = v4ToInt(ip);
        return PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
    }
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::')
        return true;
    if (v.startsWith('::ffff:'))
        return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}
