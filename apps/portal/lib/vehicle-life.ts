/**
 * A vehicle's life, stage by stage, from what EJO holds. Pure.
 *
 *   Kit arrival and QC → Assembly stations → Quality audit → PDI → Yard →
 *   Sale and warranty start
 *
 * Today the plant's stages arrive as register rows (Data Exchange: the
 * production, QC and PDI registers), each with the register's own stage
 * name; recording them on screen comes with the PDI and assembly modules.
 * This file decides, once, which stage a row belongs to, so the vehicle's
 * page, its traveller sheet and its PDI certificate always agree.
 */

export type LifeStageKey = 'kit' | 'station' | 'qa' | 'pdi' | 'yard' | 'sale';
export const LIFE_STAGES: { key: LifeStageKey; label: string; hint: string }[] = [
  { key: 'kit', label: 'Kit arrival and QC', hint: 'The kit received, its cases checked' },
  { key: 'station', label: 'Assembly stations', hint: 'Every station on the line' },
  { key: 'qa', label: 'Quality audit', hint: 'QA gates, road and water tests' },
  { key: 'pdi', label: 'Pre-delivery inspection', hint: 'PDI before the vehicle is sold' },
  { key: 'yard', label: 'Yard', hint: 'Waiting in the yard for sale' },
  { key: 'sale', label: 'Sale and warranty start', hint: 'Sold, handed over, warranty begins' },
];

/** Which stage a register row belongs to: by its stage name first (registers name them their own way), then by its register. */
export function lifeStageOf(kind: string, stage: string | null | undefined): LifeStageKey {
  const s = String(stage ?? '').toLowerCase();
  if (/\b(kit|ckd|skd|case|cases|crate|container|unpack|unpacking|incoming|inbound|arriv\w*|receiv\w*)\b/.test(s)) return 'kit';
  if (/\b(yard|parking|park|storage|holding|stockyard)\b/.test(s)) return 'yard';
  if (/\b(sale|sold|deliver\w*|handover|hand over|handed over)\b/.test(s)) return 'sale';
  const k = String(kind).toUpperCase();
  if (k === 'PDI' || /\bpdi\b|pre-?delivery/.test(s)) return 'pdi';
  if (k === 'QC') return 'qa';
  return 'station';
}

export type ResultTone = 'pass' | 'fail' | 'rework' | 'open' | 'other';
/** PASS / FAIL / REWORK / OPEN, or the register's own word ("OK", "NG", "Hold"…). */
export function resultTone(result: string | null | undefined): ResultTone | null {
  const r = String(result ?? '').trim().toUpperCase();
  if (!r) return null;
  if (/^(PASS|PASSED|OK|GOOD|ACCEPT|ACCEPTED|APPROVED|DONE|COMPLETE|COMPLETED|YES|Y)$/.test(r)) return 'pass';
  if (/^(FAIL|FAILED|NG|NOT ?OK|REJECT|REJECTED|NO|N)$/.test(r)) return 'fail';
  if (/^(REWORK|REPAIR|RECTIF\w*|FIX)$/.test(r)) return 'rework';
  if (/^(OPEN|PENDING|HOLD|ON HOLD|WAITING|IN PROGRESS)$/.test(r)) return 'open';
  return 'other';
}

export type LifeEntry = { id: string; date: string; stage: string | null; result: string | null; tone: ResultTone | null; reference: string | null; notes: string | null; inspector: string | null; source: 'register' | 'ejo'; href?: string };
export type LifeStage = { key: LifeStageKey; label: string; hint: string; entries: LifeEntry[]; state: 'none' | 'done' | 'issue' | 'open' };

/**
 * The stages with their entries, oldest first. A stage has an issue while
 * its latest entry for any check is a fail or rework not passed since; it is
 * open while that latest entry is open; done once something is recorded and
 * nothing is outstanding.
 */
export function buildLife(input: {
  records: { id: string; kind: string; date: string; stage: string | null; result: string | null; reference: string | null; notes: string | null; inspector: string | null }[];
  sale?: { date: string; label: string; href?: string } | null;
  warrantyStart?: { date: string; label: string; href?: string } | null;
}): LifeStage[] {
  const by = new Map<LifeStageKey, LifeEntry[]>(LIFE_STAGES.map((s) => [s.key, []]));
  for (const r of input.records) {
    by.get(lifeStageOf(r.kind, r.stage))!.push({ id: r.id, date: r.date, stage: r.stage, result: r.result, tone: resultTone(r.result), reference: r.reference, notes: r.notes, inspector: r.inspector, source: 'register' });
  }
  if (input.sale) by.get('sale')!.push({ id: 'sale', date: input.sale.date, stage: input.sale.label, result: null, tone: 'pass', reference: null, notes: null, inspector: null, source: 'ejo', href: input.sale.href });
  if (input.warrantyStart) by.get('sale')!.push({ id: 'warranty', date: input.warrantyStart.date, stage: input.warrantyStart.label, result: null, tone: 'pass', reference: null, notes: null, inspector: null, source: 'ejo', href: input.warrantyStart.href });
  return LIFE_STAGES.map((s) => {
    const entries = by.get(s.key)!.sort((a, b) => a.date.localeCompare(b.date));
    // The latest entry for each check (stage name) decides whether something is outstanding.
    const latest = new Map<string, LifeEntry>();
    for (const e of entries) latest.set((e.stage ?? '').toLowerCase(), e);
    const tones = [...latest.values()].map((e) => e.tone);
    const state: LifeStage['state'] = entries.length === 0 ? 'none' : tones.some((t) => t === 'fail' || t === 'rework') ? 'issue' : tones.some((t) => t === 'open') ? 'open' : 'done';
    return { ...s, entries, state };
  });
}

/** Where the vehicle is now: the furthest stage with something recorded. */
export function currentStage(stages: LifeStage[]): LifeStage | null {
  for (let i = stages.length - 1; i >= 0; i--) if (stages[i]!.entries.length) return stages[i]!;
  return null;
}

/** The PDI's verdict for the certificate: passed only when every check's latest result is a pass. */
export function pdiVerdict(stages: LifeStage[]): { state: 'passed' | 'not-passed' | 'not-recorded'; date: string | null; checks: LifeEntry[] } {
  const pdi = stages.find((s) => s.key === 'pdi')!;
  if (!pdi.entries.length) return { state: 'not-recorded', date: null, checks: [] };
  const latest = new Map<string, LifeEntry>();
  for (const e of pdi.entries) latest.set((e.stage ?? '').toLowerCase(), e);
  const checks = [...latest.values()];
  // Strict: a word EJO does not recognise as a pass ("see notes", blank) never certifies a vehicle.
  const passed = checks.every((c) => c.tone === 'pass');
  return { state: passed ? 'passed' : 'not-passed', date: checks.map((c) => c.date).sort().pop() ?? null, checks };
}
