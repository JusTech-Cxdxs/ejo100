/**
 * FIFO stock layers for QUANTITY-tracked Parts.
 *
 * A BATCH part's deliveries live in PartBatch rows and a SERIALIZED
 * part's in PartSerial rows — both already link every unit back to the
 * Goods Receipt it arrived on. A QUANTITY part has neither: its stock is
 * one running total. This module gives it the same traceability by
 * treating every Goods Receipt line for the Part as a FIFO layer, exactly
 * the way a batch is one.
 *
 * Pure and deterministic (no database access) so the very same logic is
 * used at release time — to decide which delivery a release draws from —
 * and everywhere the result is displayed, so the numbers can never drift
 * apart. Stock only ever enters through a Goods Receipt and a receipt's
 * quantity can't be edited afterwards, so replaying receipts and releases
 * in time order reproduces every layer's history exactly.
 *
 * Releases made before per-delivery tracking existed carry no
 * goodsReceiptLineId; they are attributed oldest-first, and only against
 * deliveries that had actually arrived by the time of that release.
 */

export type QuantityLayerInput = {
  /** GoodsReceiptLine id. */
  id: string;
  receivedAt: Date;
  /** Quantity received, in the Part's base unit. */
  quantity: number;
};

export type QuantityConsumptionInput = {
  id: string;
  consumedAt: Date;
  /** Quantity taken, in the Part's base unit. */
  quantity: number;
  /** The delivery this release was recorded against, when known. */
  goodsReceiptLineId: string | null;
};

export type QuantityLayerState = { received: number; taken: number; remaining: number };

export type QuantityAllocation = { goodsReceiptLineId: string | null; quantity: number };

export type QuantityFifoResult = {
  /** Every layer, keyed by GoodsReceiptLine id. */
  layers: Map<string, QuantityLayerState>;
  /** Every consumption, keyed by its own id → which deliveries it drew from. A
   * null goodsReceiptLineId means no delivery could account for it. */
  allocations: Map<string, QuantityAllocation[]>;
  /** The layer FIFO would draw from next — "Active / Selling Now". */
  activeLayerId: string | null;
};

const EPSILON = 1e-9;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function byTimeThenId<T extends { id: string }>(time: (x: T) => number) {
  return (a: T, b: T) => time(a) - time(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function replayQuantityFifo(layersIn: QuantityLayerInput[], consumptionsIn: QuantityConsumptionInput[]): QuantityFifoResult {
  const layers = [...layersIn].sort(byTimeThenId((l) => new Date(l.receivedAt).getTime()));
  const consumptions = [...consumptionsIn].sort(byTimeThenId((c) => new Date(c.consumedAt).getTime()));

  const state = new Map<string, QuantityLayerState>();
  for (const l of layers) state.set(l.id, { received: round4(l.quantity), taken: 0, remaining: round4(l.quantity) });

  const allocations = new Map<string, QuantityAllocation[]>();
  for (const c of consumptions) {
    const parts: QuantityAllocation[] = [];
    const layer = c.goodsReceiptLineId ? state.get(c.goodsReceiptLineId) : undefined;
    if (layer) {
      // Recorded against a specific delivery — honoured exactly as recorded.
      layer.taken = round4(layer.taken + c.quantity);
      layer.remaining = round4(layer.received - layer.taken);
      parts.push({ goodsReceiptLineId: c.goodsReceiptLineId, quantity: round4(c.quantity) });
    } else {
      // Older release with no recorded delivery — oldest-first, only from
      // deliveries that had already arrived when it happened.
      let left = c.quantity;
      const consumedAt = new Date(c.consumedAt).getTime();
      for (const l of layers) {
        if (left <= EPSILON) break;
        if (new Date(l.receivedAt).getTime() > consumedAt) break;
        const s = state.get(l.id)!;
        if (s.remaining <= EPSILON) continue;
        const take = Math.min(left, s.remaining);
        s.taken = round4(s.taken + take);
        s.remaining = round4(s.received - s.taken);
        parts.push({ goodsReceiptLineId: l.id, quantity: round4(take) });
        left -= take;
      }
      if (left > EPSILON) parts.push({ goodsReceiptLineId: null, quantity: round4(left) });
    }
    allocations.set(c.id, parts);
  }

  const activeLayerId = layers.find((l) => (state.get(l.id)?.remaining ?? 0) > EPSILON)?.id ?? null;
  return { layers: state, allocations, activeLayerId };
}

/**
 * Splits a NEW release of `quantity` across the layers FIFO-first, using
 * each layer's current remaining stock. Anything the layers can't cover
 * comes back with a null goodsReceiptLineId.
 */
export function planQuantityRelease(
  layersIn: QuantityLayerInput[],
  current: Map<string, QuantityLayerState>,
  quantity: number,
): QuantityAllocation[] {
  const layers = [...layersIn].sort(byTimeThenId((l) => new Date(l.receivedAt).getTime()));
  const plan: QuantityAllocation[] = [];
  let left = quantity;
  for (const l of layers) {
    if (left <= EPSILON) break;
    const remaining = current.get(l.id)?.remaining ?? 0;
    if (remaining <= EPSILON) continue;
    const take = Math.min(left, remaining);
    plan.push({ goodsReceiptLineId: l.id, quantity: round4(take) });
    left -= take;
  }
  if (left > EPSILON) plan.push({ goodsReceiptLineId: null, quantity: round4(left) });
  return plan;
}
