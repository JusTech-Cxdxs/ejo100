import type { DurationPrediction } from '@/lib/enyo/ml/models';
import type { PriceCheck } from '@/lib/enyo/ml/runtime-core';
import { formatDateTime } from '@/lib/utils/format-date';
import { Icon } from '@/components/ui';

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const at = (openedAt: string, hours: number) => new Date(new Date(openedAt).getTime() + hours * 3_600_000);

/**
 * "Likely ready" from Enyo's job time model (Assist level): a range, the most
 * likely time, and that it is an estimate. Hidden once the vehicle is ready.
 */
export function ReadyEstimate({ prediction, name }: { prediction: DurationPrediction; name: string }) {
  const lo = at(prediction.openedAt, prediction.p10);
  const mid = at(prediction.openedAt, prediction.p50);
  const hi = at(prediction.openedAt, prediction.p90);
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/20 bg-[var(--ejo-primary)]/5 px-3 py-2.5 text-sm" role="note">
      <span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="clock" size={16} /></span>
      <span className="text-[var(--ejo-text)]">
        <strong>Likely ready around {formatDateTime(mid)}</strong>
        <span className="block text-xs text-[var(--ejo-text-muted)]">
          Between {formatDateTime(lo)} and {formatDateTime(hi)} — {name}&rsquo;s estimate from similar finished jobs. Not a promise; confirm with the workshop before telling the customer.
        </span>
      </span>
    </div>
  );
}

/** Under a typed-in line whose price is far from the usual for that work. Nothing is changed. */
export function UnusualPrice({ check }: { check: PriceCheck }) {
  const higher = check.priceRatio >= 1;
  return (
    <div className="mt-0.5 text-[11px] font-medium text-[var(--ejo-warning-text)]" role="note">
      Unusual price: {higher ? `${check.priceRatio.toFixed(1)}× the usual` : `about ${Math.round(check.priceRatio * 100)}% of the usual`} ({naira(check.typicalPrice)} is typical for this work). Please check it.
    </div>
  );
}
