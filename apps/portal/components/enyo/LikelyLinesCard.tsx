import { suggestionFor } from '@/lib/enyo/predict/suggest';
import type { SubjectKind } from '@/lib/enyo/predict/lines';
import type { LineType } from '@/lib/enyo/predict/lines-core';
import { logFailure } from '@/lib/log';
import { LikelyLinesPanel, type PanelLine } from './LikelyLinesPanel';

/**
 * "Likely lines from similar jobs" on the estimate (Suggest mode only).
 *
 * The page renders this only for the people who may add lines to the
 * estimate (its supervisor and technician), where the add-line form is.
 * In Shadow mode — and when predictions are off — it renders nothing.
 * A failure here never breaks the estimate: the card simply stays away.
 */
export async function LikelyLinesCard({
  kind,
  id,
  existing,
}: {
  kind: SubjectKind;
  id: string;
  /** The lines already on the estimate (to mark suggestions that are there). */
  existing: { type: string; description: string; partType?: { name: string } | null }[];
}) {
  let s: Awaited<ReturnType<typeof suggestionFor>> = null;
  try {
    s = await suggestionFor(
      { kind, id },
      existing.map((l) => ({ type: l.type as LineType, description: l.description, partTypeName: l.partType?.name ?? null })),
      { display: true },
    );
  } catch (err) {
    logFailure('Likely lines card could not be prepared', kind, id, err);
    return null;
  }
  if (!s) return null;

  const lines: PanelLine[] = s.lines.map((l) => ({
    key: l.key,
    type: l.type,
    label: l.label,
    categoryName: l.categoryName,
    support: l.support,
    of: l.of,
    confidence: l.confidence,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.amount,
    partTypeId: l.partTypeId,
    store: l.store,
    alreadyOnEstimate: l.alreadyOnEstimate,
  }));

  return (
    <LikelyLinesPanel
      predictionId={s.predictionId}
      displayName={s.settings.displayName}
      ok={s.ok}
      reason={s.reason}
      lines={lines}
      evidence={s.evidence.map((e) => ({ number: e.number, href: e.href, similarity: e.similarity, vehicle: e.vehicle, complaint: e.complaint, shared: e.shared }))}
      hiddenEvidence={s.hiddenEvidence}
    />
  );
}
