/**
 * Kit arrival and quality control: the checklists and the rules. Pure.
 *
 * At an assembly plant, vehicles arrive as kits: a CKD kit (completely
 * knocked down: frame, cab panels, engine, axles and every part in cases)
 * or an SKD kit (semi knocked down: a painted body and major units, fewer
 * cases). A shipment (one bill of lading) brings many kits; each kit is one
 * vehicle, named on the supplier's packing list by its frame number (the
 * VIN), engine number and lot.
 *
 *   shipment arrives → each kit is opened and checked against the packing
 *   list (cases, seals, identity, body, major units, parts) → shortages,
 *   damage, wrong parts and excess are raised against case and part
 *   numbers → the inspector submits → a second person decides:
 *     • Release to the line (SAP usage decision A): with no line-stopping
 *       issue open. Open shortages that do not stop the line need a note
 *       (a concession): the kit goes "released with shortages";
 *     • Hold (quarantine; no usage decision yet): put right, then submit again;
 *     • Reject (R): the kit is not built; it goes back to the supplier.
 * Release creates the vehicle in the plant at stage LINE (lib/actions/plant-kits.ts).
 *
 * Each checklist is versioned: a kit keeps the items it started with.
 */

import { PLANT_MODELS, modelByCode, type PdiFamily } from './pdi';
import { isChassisLike, normaliseVin } from '../vin';

export type KitType = 'CKD' | 'SKD';
export const KIT_TYPES: KitType[] = ['CKD', 'SKD'];
export const KIT_TYPE_WORDS: Record<KitType, string> = { CKD: 'CKD (completely knocked down)', SKD: 'SKD (semi knocked down)' };
/** How each model arrives at the plant by default (the shipment form lets it be changed). */
export const DEFAULT_KIT_TYPE: Record<PdiFamily, KitType> = { 'isuzu-n': 'CKD', 'soueast-s07': 'SKD' };

export type KitCheckItem = { code: string; section: string; label: string; allowNa?: boolean };
export type KitTemplate = { key: PdiFamily; version: number; name: string; items: KitCheckItem[] };

const items = (section: string, prefix: string, list: (string | [string, true])[]): KitCheckItem[] =>
  list.map((x, i) => {
    const [label, allowNa] = Array.isArray(x) ? x : [x, false];
    return { code: `${prefix}${String(i + 1).padStart(2, '0')}`, section, label, ...(allowNa ? { allowNa: true } : {}) };
  });

const CASES = items('Cases and seals', 'CS', [
  ['Container seal intact and its number matches the shipping papers', true],
  'Case count matches the packing list',
  'Case markings carry this kit’s lot number',
  'No wet, stained or water-damaged cases',
  'No crushed, broken or opened cases',
  'Packing list for this kit present',
]);

export const KIT_TEMPLATES: Record<PdiFamily, KitTemplate> = {
  'isuzu-n': {
    key: 'isuzu-n', version: 1, name: 'Isuzu N-series truck kit (NQR, NPR, QLR, QMR)',
    items: [
      ...CASES,
      ...items('Identity', 'ID', ['Frame number stamped on the chassis matches the packing list', 'Engine number matches the packing list', 'Model and specification match the order (wheelbase, cab, GVW)']),
      ...items('Frame and chassis', 'FR', ['Frame rails straight, no bends or cracks', 'No rust on the frame or cross-members', 'Axles, springs and hubs present and undamaged', 'Fuel tank and brackets present and undamaged']),
      ...items('Cab', 'CB', ['Cab shell free of dents and creases', 'Paint or primer free of chips, scratches and rust', 'Windscreen and side glass free of cracks and chips', 'Doors, hinges and mirrors present']),
      ...items('Major units', 'MU', ['Engine and transmission present, no visible damage', 'Radiator, intercooler and hoses present and undamaged', 'Propeller shaft and exhaust present', 'Wiring harnesses present, connectors undamaged', 'Batteries present (stored to be charged)']),
      ...items('Wheels and parts', 'WP', ['Wheels and tyres: correct size and count, including the spare', 'Fastener and small-parts bags present and sealed', 'Interior trim, seats and instrument panel present', 'Tools, jack and documents pack present']),
    ],
  },
  'soueast-s07': {
    key: 'soueast-s07', version: 1, name: 'Soueast S07 SUV kit',
    items: [
      ...CASES,
      ...items('Identity', 'ID', ['VIN on the body matches the packing list', 'Engine number matches the packing list', 'Model, trim and colour match the order']),
      ...items('Painted body', 'BD', ['Body free of dents and creases', 'Paint free of chips, scratches, runs and rust', 'Glass free of cracks and chips', 'Doors, bonnet and tailgate fit and open', 'Protective film and covers in place']),
      ...items('Major units', 'MU', ['Engine and transmission present, no visible damage', 'Front and rear suspension modules present', 'Cooling module and hoses present and undamaged', 'Wiring harnesses present, connectors undamaged', 'Battery present (stored to be charged)']),
      ...items('Interior and parts', 'WP', ['Seats, trim and headlining present and undamaged', 'Instrument panel, infotainment unit and camera present', 'Wheels and tyres: correct size and count, including the spare', 'Fastener and small-parts bags present and sealed', 'Keys, documents pack and tools present']),
    ],
  },
};

export const kitTemplateFor = (modelCode: string | null | undefined): KitTemplate | null => {
  const m = modelByCode(modelCode);
  return m ? KIT_TEMPLATES[m.family] : null;
};

// ── Statuses ────────────────────────────────────────────────────────────

export type KitStatus = 'ARRIVED' | 'INSPECTING' | 'SUBMITTED' | 'ON_HOLD' | 'RELEASED' | 'REJECTED' | 'CANCELLED';
export const KIT_STATUS_WORDS: Record<KitStatus, string> = {
  ARRIVED: 'Arrived',
  INSPECTING: 'Being inspected',
  SUBMITTED: 'Waiting for release',
  ON_HOLD: 'On hold',
  RELEASED: 'Released to the line',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
/** While these, the inspector may record checks, cases and issues. */
export const KIT_EDITABLE: KitStatus[] = ['ARRIVED', 'INSPECTING', 'ON_HOLD'];
/** Kits still at arrival (the plant's KIT stage). */
export const KIT_OPEN: KitStatus[] = ['ARRIVED', 'INSPECTING', 'SUBMITTED', 'ON_HOLD'];

export type CheckResult = 'OK' | 'NOT_OK' | 'NA';
export const isCheckResult = (r: unknown): r is CheckResult => r === 'OK' || r === 'NOT_OK' || r === 'NA';

// ── Issues: shortages, damage, wrong parts, excess ──────────────────────

export type IssueKind = 'SHORTAGE' | 'DAMAGE' | 'WRONG_PART' | 'EXCESS';
export const ISSUE_KINDS: IssueKind[] = ['SHORTAGE', 'DAMAGE', 'WRONG_PART', 'EXCESS'];
export const ISSUE_KIND_WORDS: Record<IssueKind, string> = { SHORTAGE: 'Shortage', DAMAGE: 'Damaged', WRONG_PART: 'Wrong part', EXCESS: 'Excess' };
export type IssueStatus = 'OPEN' | 'CLAIMED' | 'RESOLVED';
export const ISSUE_STATUS_WORDS: Record<IssueStatus, string> = { OPEN: 'Open', CLAIMED: 'Claimed from the supplier', RESOLVED: 'Resolved' };
/** Not yet put right: still counts against the kit. */
export const ISSUE_UNRESOLVED: IssueStatus[] = ['OPEN', 'CLAIMED'];

export type KitCheckState = { code: string; label: string; section: string; allowNa: boolean; result: CheckResult | null; note: string | null };
export type KitIssueState = { kind: IssueKind; status: IssueStatus; stopsLine: boolean; description: string; partNumber: string | null; quantity: number };

/** What still stands between this kit and being sent for release (plain words, one per problem). */
export function kitBlockers(checks: KitCheckState[], casesExpected: number | null, casesReceived: number | null): string[] {
  const out: string[] = [];
  const unanswered = checks.filter((c) => !c.result);
  if (unanswered.length) out.push(`${unanswered.length} ${unanswered.length === 1 ? 'check is' : 'checks are'} not done yet.`);
  const naWrong = checks.filter((c) => c.result === 'NA' && !c.allowNa);
  if (naWrong.length) out.push(`N/A is not allowed for: ${naWrong.map((c) => c.label).join('; ')}.`);
  const noNote = checks.filter((c) => c.result === 'NOT_OK' && !(c.note ?? '').trim());
  if (noNote.length) out.push(`Say what is wrong for: ${noNote.map((c) => c.label).join('; ')}.`);
  if (casesReceived === null) out.push('Record how many cases arrived for this kit.');
  if (casesExpected !== null && casesReceived !== null && casesReceived !== casesExpected) {
    const cs = checks.find((c) => c.label.startsWith('Case count'));
    if (cs?.result === 'OK') out.push(`${casesReceived} of ${casesExpected} cases arrived, but “Case count matches the packing list” is marked OK.`);
  }
  return out;
}

/** Notes for the person deciding (not blockers). */
export function kitWarnings(checks: KitCheckState[], issues: KitIssueState[], casesExpected: number | null, casesReceived: number | null): string[] {
  const out: string[] = [];
  if (casesExpected !== null && casesReceived !== null && casesReceived < casesExpected) out.push(`${casesExpected - casesReceived} of ${casesExpected} cases did not arrive.`);
  if (casesExpected !== null && casesReceived !== null && casesReceived > casesExpected) out.push(`${casesReceived - casesExpected} more cases arrived than the packing list shows.`);
  const notOk = checks.filter((c) => c.result === 'NOT_OK');
  if (notOk.length && !issues.length) out.push(`${notOk.length} ${notOk.length === 1 ? 'check is' : 'checks are'} Not OK, but no shortage or damage was raised.`);
  return out;
}

export type KitDecision = 'RELEASE' | 'HOLD' | 'REJECT';

/**
 * Whether the kit may be released now, and how: clean, or with shortages
 * (a concession, which needs a note). Never while a line-stopping issue is open.
 */
export function releaseVerdict(issues: KitIssueState[], note: string | null | undefined): { ok: true; withShortages: boolean } | { ok: false; why: string } {
  const open = issues.filter((i) => ISSUE_UNRESOLVED.includes(i.status));
  const stopping = open.filter((i) => i.stopsLine);
  if (stopping.length) {
    return { ok: false, why: `${stopping.length === 1 ? 'An issue that stops the line is' : `${stopping.length} issues that stop the line are`} still open (${stopping.map((i) => i.partNumber ?? i.description).slice(0, 3).join('; ')}). Put it right, or hold the kit.` };
  }
  if (open.length && !(note ?? '').trim()) {
    return { ok: false, why: `${open.length} ${open.length === 1 ? 'shortage or damage is' : 'shortages or damages are'} still open. Say why the kit can go to the line anyway (a concession), or hold it.` };
  }
  return { ok: true, withShortages: open.length > 0 };
}

// ── The shipment form: kits typed or pasted, one per line ───────────────

export type KitLine = { line: number; vin: string; engineNumber: string | null; modelCode: string; lotNumber: string | null; kitType: KitType; casesExpected: number | null };

/**
 * Kits as pasted from the packing list, one per line: VIN, engine number,
 * model, lot, cases — separated by commas, semicolons or tabs (Excel).
 * A header line is skipped. Returns the kits and, per bad line, why.
 */
export function parseKitLines(raw: string | null | undefined, defaults: { modelCode?: string | null; kitType?: KitType | null } = {}): { kits: KitLine[]; problems: string[] } {
  const kits: KitLine[] = [];
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const lines = String(raw ?? '').split(/\r?\n/);
  lines.forEach((text, i) => {
    const line = i + 1;
    if (!text.trim()) return;
    const cells = text.split(/\t|;|,/).map((c) => c.trim());
    if (i === 0 && /vin|frame|chassis/i.test(cells[0] ?? '') && !isChassisLike(cells[0])) return; // a header
    const vin = normaliseVin(cells[0]);
    if (!isChassisLike(vin)) { problems.push(`Line ${line}: “${cells[0] ?? ''}” is not a VIN or frame number.`); return; }
    if (seen.has(vin)) { problems.push(`Line ${line}: ${vin} is already on line ${seen.get(vin)}.`); return; }
    const model = modelByCode(cells[2] || defaults.modelCode);
    if (!model) { problems.push(`Line ${line}: choose the model (${PLANT_MODELS.map((m) => m.code).join(', ')}).`); return; }
    const casesText = (cells[4] ?? '').replace(/[^\d]/g, '');
    const cases = casesText ? Number(casesText) : null;
    if (cases !== null && (cases < 1 || cases > 500)) { problems.push(`Line ${line}: ${cases} cases is not a likely number for one kit.`); return; }
    const engine = (cells[1] ?? '').toUpperCase().replace(/[^A-Z0-9\-/.]/g, '').slice(0, 40) || null;
    const lot = (cells[3] ?? '').toUpperCase().replace(/[^A-Z0-9\-/.]/g, '').slice(0, 40) || null;
    seen.set(vin, line);
    kits.push({ line, vin, engineNumber: engine, modelCode: model.code, lotNumber: lot, kitType: defaults.kitType ?? DEFAULT_KIT_TYPE[model.family], casesExpected: cases });
  });
  if (kits.length > 200) problems.push(`A shipment holds at most 200 kits here; this has ${kits.length}. Split it.`);
  return { kits: kits.slice(0, 200), problems };
}

/** SAP's view of a kit decision, for the SAP team's file (docs/SAP_INTEGRATION.md). */
export const KIT_SAP = {
  goodsReceiptMovement: '101',
  usageDecision: { RELEASE: 'A', REJECT: 'R' } as Record<Exclude<KitDecision, 'HOLD'>, 'A' | 'R'>,
} as const;
