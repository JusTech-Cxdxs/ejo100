/**
 * Channel pricing — the pure rules: which price list applies to a customer,
 * which item on it prices a product (configuration first, then the product,
 * best quantity break), and what changed between two lists (for the daily
 * dealer price broadcast). No database or framework; relative imports only.
 */

export type Channel = 'RETAIL' | 'DEALER' | 'CORPORATE' | 'GOVERNMENT' | 'DISTRIBUTOR' | 'ONLINE' | 'PROJECT';
export type Tier = 'TIER_1' | 'TIER_2' | 'TIER_3';

/** The channel a quotation defaults to: the customer's dealer account's channel, otherwise retail. */
export function channelFor(dealer: { channel: Channel; tier?: Tier | null } | null | undefined): { channel: Channel; tier: Tier | null } {
  if (!dealer) return { channel: 'RETAIL', tier: null };
  return { channel: dealer.channel, tier: dealer.channel === 'DEALER' ? dealer.tier ?? null : null };
}

export type PriceItem = { productId: string; configurationId: string | null; unitPrice: number; minQuantity: number };

/**
 * The price for a product (and configuration) at a quantity: an item for the
 * exact configuration beats a product-wide one; among those, the highest
 * quantity break the quantity reaches. Null when the list does not price it.
 */
export function resolvePrice(items: PriceItem[], want: { productId: string; configurationId?: string | null; quantity?: number }): { unitPrice: number; item: PriceItem } | null {
  const qty = Math.max(1, Math.floor(Number(want.quantity) || 1));
  const mine = items.filter((i) => i.productId === want.productId && (Number(i.minQuantity) || 1) <= qty);
  const exact = want.configurationId ? mine.filter((i) => i.configurationId === want.configurationId) : [];
  const general = mine.filter((i) => !i.configurationId);
  const pool = exact.length ? exact : general;
  if (!pool.length) return null;
  const best = pool.slice().sort((a, b) => (Number(b.minQuantity) || 1) - (Number(a.minQuantity) || 1))[0]!;
  return { unitPrice: Number(best.unitPrice), item: best };
}

/** One list per channel and tier: the key two lists must share to replace each other. */
export function listKey(channel: Channel, tier: Tier | null | undefined): string {
  return channel === 'DEALER' && tier ? `${channel}:${tier}` : channel;
}

// ── Broadcast change summary ─────────────────────────────────────────────

export type PriceSnapshotLine = { key: string; label: string; unitPrice: number; minQuantity: number };

/** The key that identifies a priced thing across two lists. */
export function snapshotKey(i: { productId: string; configurationId: string | null; minQuantity: number }): string {
  return `${i.productId}|${i.configurationId ?? ''}|${Number(i.minQuantity) || 1}`;
}

export type PriceChange = { key: string; label: string; from: number | null; to: number | null; kind: 'ADDED' | 'REMOVED' | 'UP' | 'DOWN' };

export type ChangeSummary = { added: number; removed: number; up: number; down: number; unchanged: number; changes: PriceChange[]; summary: string };

/**
 * What changed between the last broadcast and today's: new lines, lines
 * taken off, prices up, prices down — and one plain sentence for the record.
 */
export function changeSummary(previous: PriceSnapshotLine[] | null | undefined, current: PriceSnapshotLine[]): ChangeSummary {
  const prev = new Map((previous ?? []).map((l) => [l.key, l]));
  const now = new Map(current.map((l) => [l.key, l]));
  const changes: PriceChange[] = [];
  let unchanged = 0;
  for (const line of current) {
    const before = prev.get(line.key);
    if (!before) { changes.push({ key: line.key, label: line.label, from: null, to: line.unitPrice, kind: 'ADDED' }); continue; }
    const a = Math.round(before.unitPrice * 100);
    const b = Math.round(line.unitPrice * 100);
    if (a === b) unchanged += 1;
    else changes.push({ key: line.key, label: line.label, from: before.unitPrice, to: line.unitPrice, kind: b > a ? 'UP' : 'DOWN' });
  }
  for (const line of previous ?? []) if (!now.has(line.key)) changes.push({ key: line.key, label: line.label, from: line.unitPrice, to: null, kind: 'REMOVED' });
  const count = (k: PriceChange['kind']) => changes.filter((c) => c.kind === k).length;
  const added = count('ADDED'), removed = count('REMOVED'), up = count('UP'), down = count('DOWN');
  const parts: string[] = [];
  if (!previous) parts.push(`First broadcast of this list: ${current.length} ${current.length === 1 ? 'price' : 'prices'}`);
  else {
    if (up) parts.push(`${up} ${up === 1 ? 'price' : 'prices'} up`);
    if (down) parts.push(`${down} ${down === 1 ? 'price' : 'prices'} down`);
    if (added) parts.push(`${added} new`);
    if (removed) parts.push(`${removed} removed`);
    if (!parts.length) parts.push(`No change — ${current.length} ${current.length === 1 ? 'price' : 'prices'} as before`);
  }
  return { added, removed, up, down, unchanged, changes, summary: parts.join(', ') };
}

/** The WhatsApp-ready text of today's prices (plain text, one line each). */
export function broadcastText(o: { companyName: string; listName: string; dateLabel: string; lines: PriceSnapshotLine[]; changes: PriceChange[] }): string {
  const money = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const out = [`${o.companyName} — ${o.listName} — ${o.dateLabel}`, ''];
  for (const l of o.lines) {
    const change = o.changes.find((c) => c.key === l.key);
    const mark = change?.kind === 'UP' ? ' (up)' : change?.kind === 'DOWN' ? ' (down)' : change?.kind === 'ADDED' ? ' (new)' : '';
    out.push(`${l.label}${l.minQuantity > 1 ? ` (from ${l.minQuantity})` : ''}: ${money(l.unitPrice)}${mark}`);
  }
  const removed = o.changes.filter((c) => c.kind === 'REMOVED');
  if (removed.length) { out.push('', 'No longer listed:'); for (const r of removed) out.push(`- ${r.label}`); }
  return out.join('\n');
}

/** Today in Lagos as YYYY-MM-DD — the day a broadcast belongs to. */
export function lagosDayOf(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

export const PRICE_LIST_STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Active', RETIRED: 'Retired' };
