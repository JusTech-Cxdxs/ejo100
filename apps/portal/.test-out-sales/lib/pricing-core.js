"use strict";
/**
 * Channel pricing — the pure rules: which price list applies to a customer,
 * which item on it prices a product (configuration first, then the product,
 * best quantity break), and what changed between two lists (for the daily
 * dealer price broadcast). No database or framework; relative imports only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRICE_LIST_STATUS_LABEL = void 0;
exports.channelFor = channelFor;
exports.resolvePrice = resolvePrice;
exports.listKey = listKey;
exports.snapshotKey = snapshotKey;
exports.changeSummary = changeSummary;
exports.broadcastText = broadcastText;
exports.lagosDayOf = lagosDayOf;
/** The channel a quotation defaults to: the customer's dealer account's channel, otherwise retail. */
function channelFor(dealer) {
    if (!dealer)
        return { channel: 'RETAIL', tier: null };
    return { channel: dealer.channel, tier: dealer.channel === 'DEALER' ? dealer.tier ?? null : null };
}
/**
 * The price for a product (and configuration) at a quantity: an item for the
 * exact configuration beats a product-wide one; among those, the highest
 * quantity break the quantity reaches. Null when the list does not price it.
 */
function resolvePrice(items, want) {
    const qty = Math.max(1, Math.floor(Number(want.quantity) || 1));
    const mine = items.filter((i) => i.productId === want.productId && (Number(i.minQuantity) || 1) <= qty);
    const exact = want.configurationId ? mine.filter((i) => i.configurationId === want.configurationId) : [];
    const general = mine.filter((i) => !i.configurationId);
    const pool = exact.length ? exact : general;
    if (!pool.length)
        return null;
    const best = pool.slice().sort((a, b) => (Number(b.minQuantity) || 1) - (Number(a.minQuantity) || 1))[0];
    return { unitPrice: Number(best.unitPrice), item: best };
}
/** One list per channel and tier: the key two lists must share to replace each other. */
function listKey(channel, tier) {
    return channel === 'DEALER' && tier ? `${channel}:${tier}` : channel;
}
/** The key that identifies a priced thing across two lists. */
function snapshotKey(i) {
    return `${i.productId}|${i.configurationId ?? ''}|${Number(i.minQuantity) || 1}`;
}
/**
 * What changed between the last broadcast and today's: new lines, lines
 * taken off, prices up, prices down — and one plain sentence for the record.
 */
function changeSummary(previous, current) {
    const prev = new Map((previous ?? []).map((l) => [l.key, l]));
    const now = new Map(current.map((l) => [l.key, l]));
    const changes = [];
    let unchanged = 0;
    for (const line of current) {
        const before = prev.get(line.key);
        if (!before) {
            changes.push({ key: line.key, label: line.label, from: null, to: line.unitPrice, kind: 'ADDED' });
            continue;
        }
        const a = Math.round(before.unitPrice * 100);
        const b = Math.round(line.unitPrice * 100);
        if (a === b)
            unchanged += 1;
        else
            changes.push({ key: line.key, label: line.label, from: before.unitPrice, to: line.unitPrice, kind: b > a ? 'UP' : 'DOWN' });
    }
    for (const line of previous ?? [])
        if (!now.has(line.key))
            changes.push({ key: line.key, label: line.label, from: line.unitPrice, to: null, kind: 'REMOVED' });
    const count = (k) => changes.filter((c) => c.kind === k).length;
    const added = count('ADDED'), removed = count('REMOVED'), up = count('UP'), down = count('DOWN');
    const parts = [];
    if (!previous)
        parts.push(`First broadcast of this list: ${current.length} ${current.length === 1 ? 'price' : 'prices'}`);
    else {
        if (up)
            parts.push(`${up} ${up === 1 ? 'price' : 'prices'} up`);
        if (down)
            parts.push(`${down} ${down === 1 ? 'price' : 'prices'} down`);
        if (added)
            parts.push(`${added} new`);
        if (removed)
            parts.push(`${removed} removed`);
        if (!parts.length)
            parts.push(`No change — ${current.length} ${current.length === 1 ? 'price' : 'prices'} as before`);
    }
    return { added, removed, up, down, unchanged, changes, summary: parts.join(', ') };
}
/** The WhatsApp-ready text of today's prices (plain text, one line each). */
function broadcastText(o) {
    const money = (n) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const out = [`${o.companyName} — ${o.listName} — ${o.dateLabel}`, ''];
    for (const l of o.lines) {
        const change = o.changes.find((c) => c.key === l.key);
        const mark = change?.kind === 'UP' ? ' (up)' : change?.kind === 'DOWN' ? ' (down)' : change?.kind === 'ADDED' ? ' (new)' : '';
        out.push(`${l.label}${l.minQuantity > 1 ? ` (from ${l.minQuantity})` : ''}: ${money(l.unitPrice)}${mark}`);
    }
    const removed = o.changes.filter((c) => c.kind === 'REMOVED');
    if (removed.length) {
        out.push('', 'No longer listed:');
        for (const r of removed)
            out.push(`- ${r.label}`);
    }
    return out.join('\n');
}
/** Today in Lagos as YYYY-MM-DD — the day a broadcast belongs to. */
function lagosDayOf(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}
exports.PRICE_LIST_STATUS_LABEL = { DRAFT: 'Draft', ACTIVE: 'Active', RETIRED: 'Retired' };
