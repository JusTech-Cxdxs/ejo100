/**
 * Data Exchange — checking one row of the plant's files (P8): shipments,
 * plant vehicles, kits (packing lists) and kit issues. Pure, like check.ts;
 * the server part (plant-server.ts) finds the plant, the shipment, the kit,
 * the vehicle, the route and the people.
 */
import { cellText, type Checked, type Issue } from './check';
import { lagosToday, parseDay } from './dates';
import type { Mapping } from './fields';
import { modelByCode, type PlantStage } from '../plant/pdi';
import { DEFAULT_KIT_TYPE, ISSUE_KINDS, KIT_TYPES, type IssueKind, type IssueStatus, type KitStatus, type KitType } from '../plant/kits';
import { isChassisLike, normaliseVin } from '../vin';

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}
const word = (raw: string) => raw.toLowerCase().replace(/[^a-z]/g, '');
const yes = (raw: string) => ['yes', 'y', 'true', 'x', '1', 'ja'].includes(word(raw) || raw.trim());

/** "2026-09-15 08:30", "15.09.2026 08:30", "15/09/2026" → { day, time } (Lagos); null when not a date. Time 09:00 when none. */
export function parseMoment(raw: string): { day: string; time: string } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = /^(.*?)[\sT]+(\d{1,2})[:.](\d{2})(?::\d{2})?\s*$/.exec(s);
  const day = parseDay(m ? m[1]! : s);
  if (!day) return null;
  if (!m) return { day, time: '09:00' };
  const h = Number(m[2]); const min = Number(m[3]);
  if (h > 23 || min > 59) return null;
  return { day, time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
}
/** The moment as a Date in Lagos time (UTC+1, no daylight saving). */
export const momentDate = (m: { day: string; time: string }) => new Date(`${m.day}T${m.time}:00.000+01:00`);

function vinOf(raw: string, field: string, fail: (f: string, m: string) => void): string | null {
  const vinKey = normaliseVin(raw);
  if (!raw) { fail(field, 'The chassis number (VIN) is required.'); return null; }
  if (!isChassisLike(raw)) { fail(field, `“${raw}” does not look like a chassis number.`); return null; }
  return vinKey;
}
function future(m: { day: string } | null, today: string, field: string, label: string, fail: (f: string, m: string) => void) {
  if (m && m.day > today) fail(field, `${label} ${m.day} is in the future.`);
}
function momentOf(cells: unknown[], mapping: Mapping, key: string, label: string, today: string, warn: (f: string, m: string) => void, fail: (f: string, m: string) => void, required = false) {
  const raw = get(cells, mapping, key);
  if (!raw) { if (required) fail(key, `${label} is required.`); return null; }
  const m = parseMoment(raw);
  if (!m) { (required ? fail : warn)(key, `${label} “${raw}” is not a date (write 15.09.2026 or 2026-09-15 08:30)${required ? '' : '; left out'}.`); return null; }
  future(m, today, key, label, fail);
  return m;
}

// ── Shipments ─────────────────────────────────────────────────────────

export type PlantShipmentValues = { shipmentRef: string; supplier: string; origin: string | null; billOfLading: string | null; vessel: string | null; containers: string[]; arrivedAt: { day: string; time: string }; sapPurchaseOrder: string | null; sapInboundDelivery: string | null; notes: string | null; branch: string | null };

export function checkPlantShipmentRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<PlantShipmentValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const shipmentRef = get(cells, mapping, 'shipmentRef').toUpperCase().slice(0, 40);
  if (!shipmentRef) fail('shipmentRef', 'The shipment reference is required (the kits file names the shipment by it).');
  const supplier = get(cells, mapping, 'supplier').slice(0, 120);
  if (!supplier) fail('supplier', 'Say who shipped the kits (the supplier).');
  const arrivedAt = momentOf(cells, mapping, 'arrivedAt', 'Arrived', today, warn, fail, true);
  const containers = [...new Set(get(cells, mapping, 'containers').toUpperCase().split(/[\s,;]+/).map((c) => c.replace(/[^A-Z0-9]/g, '')).filter((c) => c.length >= 4 && c.length <= 15))].slice(0, 50);
  const code = (k: string, n: number) => get(cells, mapping, k).toUpperCase().replace(/\s+/g, '').slice(0, n) || null;
  const failed = issues.some((i) => i.level === 'error');
  const billOfLading = code('billOfLading', 40);
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD', issues,
    keys: [shipmentRef ? `shp:${shipmentRef}` : '', billOfLading ? `bl:${billOfLading}` : ''].filter(Boolean),
    values: failed ? null : { shipmentRef, supplier, origin: get(cells, mapping, 'origin').slice(0, 80) || null, billOfLading, vessel: get(cells, mapping, 'vessel').slice(0, 80) || null, containers, arrivedAt: arrivedAt!, sapPurchaseOrder: code('sapPurchaseOrder', 20), sapInboundDelivery: code('sapInboundDelivery', 20), notes: get(cells, mapping, 'notes').slice(0, 1000) || null, branch: get(cells, mapping, 'branch').slice(0, 80) || null },
  };
}

// ── Plant vehicles ────────────────────────────────────────────────────

export const IMPORTED_PLANT_STAGES = ['LINE', 'QA', 'PDI', 'YARD'] as const;
export type ImportedPlantStage = (typeof IMPORTED_PLANT_STAGES)[number];

/** LINE, QA, PDI, YARD from EJO's codes or words; 'KIT' and 'SOLD' are told apart (refused with their reason); null when unknown. */
export function plantStage(raw: string): ImportedPlantStage | 'KIT' | 'SOLD' | null {
  const k = word(raw);
  if (/^line|ontheline|assembly|building|wip|inproduction/.test(k)) return 'LINE';
  if (/^qa|qualityaudit|audit/.test(k)) return 'QA';
  if (/^yard|intheyard|finished|ready|stock|pdipassed/.test(k)) return 'YARD';
  if (/^pdi|predelivery|waitingforpdi/.test(k)) return 'PDI';
  if (/^kit|kitarrival|arrived/.test(k)) return 'KIT';
  if (/^sold|delivered|customer/.test(k)) return 'SOLD';
  return null;
}

export type PlantVehicleValues = { vin: string; vinKey: string; make: string; modelCode: string; modelName: string | null; engineNumber: string | null; colour: string | null; modelYear: number | null; stage: ImportedPlantStage; currentStation: string | null; lineStartedAt: { day: string; time: string } | null; gatePassedAt: { day: string; time: string } | null; sapMaterial: string | null; sapProductionOrder: string | null; sapEquipment: string | null; branch: string | null };

export function checkPlantVehicleRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<PlantVehicleValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const vinRaw = get(cells, mapping, 'vin').toUpperCase();
  const vinKey = vinOf(vinRaw, 'vin', fail);
  const modelRaw = get(cells, mapping, 'modelCode').toUpperCase().replace(/\s+/g, '');
  const model = modelByCode(modelRaw) ?? modelByCode(modelRaw.slice(0, 3));
  if (!modelRaw) fail('modelCode', 'The model is required (NQR, NPR, QLR, QMR or S07).');
  else if (!model) fail('modelCode', `“${modelRaw}” is not a model the plant builds: NQR, NPR, QLR, QMR or S07.`);
  const stageRaw = get(cells, mapping, 'stage');
  const stage = plantStage(stageRaw);
  if (stage === 'KIT') fail('stage', 'A kit not yet released to the line is in the kits file: its vehicle is made when it is released.');
  else if (stage === 'SOLD') fail('stage', 'A sold vehicle is the customer’s: bring it in with the vehicles file (and its warranty), not the plant’s.');
  else if (!stage) fail('stage', `“${stageRaw}” is not a stage EJO knows: use LINE, QA, PDI or YARD.`);
  const lineStartedAt = momentOf(cells, mapping, 'lineStartedAt', 'Line started', today, warn, fail);
  const gatePassedAt = momentOf(cells, mapping, 'gatePassedAt', 'Gate passed', today, warn, fail);
  const past = stage === 'QA' || stage === 'PDI' || stage === 'YARD';
  if (past && !gatePassedAt) fail('gatePassedAt', 'Past the line, the day it passed the final quality gate is required (Gate passed).');
  if (stage === 'LINE' && gatePassedAt) warn('gatePassedAt', 'On the line, so not past the gate yet: Gate passed was left out.');
  if (lineStartedAt && gatePassedAt && momentDate(gatePassedAt) < momentDate(lineStartedAt)) fail('gatePassedAt', 'The gate is passed after the line started, not before.');
  const yearRaw = get(cells, mapping, 'modelYear');
  const modelYear = yearRaw ? Number(yearRaw) : null;
  if (yearRaw && (!Number.isInteger(modelYear) || modelYear! < 1990 || modelYear! > Number(today.slice(0, 4)) + 1)) warn('modelYear', `Model year “${yearRaw}” is not a year; left out.`);
  const code = (k: string, n: number) => get(cells, mapping, k).toUpperCase().replace(/\s+/g, '').slice(0, n) || null;
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD', issues,
    keys: vinKey ? [`vin:${vinKey}`] : [],
    values: failed ? null : {
      vin: vinRaw, vinKey: vinKey!, make: get(cells, mapping, 'make').slice(0, 40) || model!.make, modelCode: model!.code, modelName: get(cells, mapping, 'modelName').slice(0, 120) || model!.name,
      engineNumber: code('engineNumber', 40), colour: get(cells, mapping, 'colour').slice(0, 40) || null, modelYear: modelYear && Number.isInteger(modelYear) && modelYear >= 1990 && modelYear <= Number(today.slice(0, 4)) + 1 ? modelYear : null,
      stage: stage as ImportedPlantStage, currentStation: stage === 'LINE' ? code('currentStation', 12) : null, lineStartedAt, gatePassedAt: stage === 'LINE' ? null : gatePassedAt,
      sapMaterial: code('sapMaterial', 40), sapProductionOrder: code('sapProductionOrder', 20), sapEquipment: code('sapEquipment', 20), branch: get(cells, mapping, 'branch').slice(0, 80) || null,
    },
  };
}

// ── Kits ──────────────────────────────────────────────────────────────

export const IMPORTED_KIT_STATUSES: KitStatus[] = ['ARRIVED', 'INSPECTING', 'SUBMITTED', 'ON_HOLD', 'RELEASED', 'REJECTED'];
export function kitStatus(raw: string): KitStatus | 'CANCELLED' | null {
  const k = word(raw);
  if (!k || /^arrived|received|new|open/.test(k)) return 'ARRIVED';
  if (/inspect|checking|beingchecked/.test(k)) return 'INSPECTING';
  if (/submitted|waitingforrelease|awaitingrelease|checked/.test(k)) return 'SUBMITTED';
  if (/hold|quarantine|blocked/.test(k)) return 'ON_HOLD';
  if (/released|accepted|toline|online|built/.test(k)) return 'RELEASED';
  if (/reject|returned/.test(k)) return 'REJECTED';
  if (/cancel/.test(k)) return 'CANCELLED';
  return null;
}

export type PlantKitValues = { shipmentRef: string; vin: string; vinKey: string; engineNumber: string | null; modelCode: string; lotNumber: string | null; kitType: KitType; casesExpected: number | null; casesReceived: number | null; status: KitStatus; inspector: string | null; startedAt: { day: string; time: string } | null; submittedAt: { day: string; time: string } | null; decidedBy: string | null; decidedAt: { day: string; time: string } | null; sapUsageDecision: string | null; releasedWithShortages: boolean; sapInspectionLot: string | null; sapMaterialDocument: string | null; decisionNote: string | null; branch: string | null };

export function checkPlantKitRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<PlantKitValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const shipmentRef = get(cells, mapping, 'shipmentRef').toUpperCase().slice(0, 40);
  if (!shipmentRef) fail('shipmentRef', 'Which shipment did it come on? Give its reference or its SHP number.');
  const vinRaw = get(cells, mapping, 'vin').toUpperCase();
  const vinKey = vinOf(vinRaw, 'vin', fail);
  const modelRaw = get(cells, mapping, 'modelCode').toUpperCase().replace(/\s+/g, '');
  const model = modelByCode(modelRaw) ?? modelByCode(modelRaw.slice(0, 3));
  if (!model) fail('modelCode', modelRaw ? `“${modelRaw}” is not a model the plant builds: NQR, NPR, QLR, QMR or S07.` : 'The model is required (NQR, NPR, QLR, QMR or S07).');
  const typeRaw = get(cells, mapping, 'kitType').toUpperCase().replace(/[^A-Z]/g, '');
  let kitType: KitType = model ? DEFAULT_KIT_TYPE[model.family] : 'CKD';
  if (KIT_TYPES.includes(typeRaw as KitType)) kitType = typeRaw as KitType;
  else if (typeRaw) warn('kitType', `“${typeRaw}” is not CKD or SKD; the model’s usual (${kitType}) is used.`);
  const int = (k: string, label: string) => {
    const raw = get(cells, mapping, k);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 500) { warn(k, `${label} “${raw}” is not a number of cases; left out.`); return null; }
    return n;
  };
  const casesExpected = int('casesExpected', 'Cases expected');
  const casesReceived = int('casesReceived', 'Cases received');
  const statusRaw = get(cells, mapping, 'status');
  const status = kitStatus(statusRaw);
  if (status === 'CANCELLED') fail('status', 'A cancelled kit never came: leave it out.');
  else if (!status) fail('status', `“${statusRaw}” is not a kit status EJO knows: ARRIVED, INSPECTING, SUBMITTED, ON_HOLD, RELEASED or REJECTED.`);
  const startedAt = momentOf(cells, mapping, 'startedAt', 'Started', today, warn, fail);
  const submittedAt = momentOf(cells, mapping, 'submittedAt', 'Submitted', today, warn, fail);
  const decidedAt = momentOf(cells, mapping, 'decidedAt', 'Decided', today, warn, fail);
  const decided = status === 'RELEASED' || status === 'REJECTED' || status === 'ON_HOLD';
  if (decided && !decidedAt) warn('decidedAt', 'No decision date: the submission (or the shipment’s arrival) is used.');
  const decisionNote = get(cells, mapping, 'decisionNote').slice(0, 1000) || null;
  if ((status === 'ON_HOLD' || status === 'REJECTED') && !decisionNote) warn('decisionNote', `${status === 'ON_HOLD' ? 'On hold' : 'Rejected'} with no reason given: the note reads “Decided before EJO.”`);
  const udRaw = get(cells, mapping, 'sapUsageDecision').toUpperCase().slice(0, 4);
  const code = (k: string, n: number) => get(cells, mapping, k).toUpperCase().replace(/\s+/g, '').slice(0, n) || null;
  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD', issues,
    keys: vinKey ? [`vin:${vinKey}`] : [],
    values: failed ? null : {
      shipmentRef, vin: vinRaw, vinKey: vinKey!, engineNumber: code('engineNumber', 40), modelCode: model!.code, lotNumber: code('lotNumber', 40), kitType, casesExpected, casesReceived, status: status as KitStatus,
      inspector: get(cells, mapping, 'inspector').slice(0, 80) || null, startedAt, submittedAt, decidedBy: get(cells, mapping, 'decidedBy').slice(0, 80) || null, decidedAt,
      sapUsageDecision: udRaw || (status === 'RELEASED' ? 'A' : status === 'REJECTED' ? 'R' : null), releasedWithShortages: status === 'RELEASED' && yes(get(cells, mapping, 'releasedWithShortages')),
      sapInspectionLot: code('sapInspectionLot', 20), sapMaterialDocument: code('sapMaterialDocument', 20), decisionNote, branch: get(cells, mapping, 'branch').slice(0, 80) || null,
    },
  };
}

// ── Kit issues ────────────────────────────────────────────────────────

export type PlantKitIssueValues = { kitVinKey: string; kind: IssueKind; partNumber: string | null; description: string; caseNumber: string | null; quantity: number; stopsLine: boolean; status: IssueStatus; claimReference: string | null; resolution: string | null; raisedBy: string | null; raisedAt: { day: string; time: string } | null; branch: string | null };

export function checkPlantKitIssueRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<PlantKitIssueValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });
  const kitVinKey = vinOf(get(cells, mapping, 'kitVin').toUpperCase(), 'kitVin', fail);
  const kindRaw = get(cells, mapping, 'kind').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');
  const kind = (ISSUE_KINDS as string[]).includes(kindRaw) ? (kindRaw as IssueKind) : /SHORT|MISSING/.test(kindRaw) ? 'SHORTAGE' : /DAMAGE|BROKEN|DENT/.test(kindRaw) ? 'DAMAGE' : /WRONG/.test(kindRaw) ? 'WRONG_PART' : /EXCESS|EXTRA|SURPLUS/.test(kindRaw) ? 'EXCESS' : null;
  if (!kind) fail('kind', `“${get(cells, mapping, 'kind')}” is not a kind EJO knows: Shortage, Damage, Wrong part or Excess.`);
  const description = get(cells, mapping, 'description').slice(0, 500);
  if (!description) fail('description', 'Say what is wrong (the description is required).');
  const qRaw = get(cells, mapping, 'quantity');
  let quantity = qRaw ? Number(qRaw) : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) { warn('quantity', `Quantity “${qRaw}” is not a whole number; 1 is used.`); quantity = 1; }
  const sRaw = word(get(cells, mapping, 'status'));
  const status: IssueStatus | null = !sRaw || /open|new|raised/.test(sRaw) ? 'OPEN' : /claim/.test(sRaw) ? 'CLAIMED' : /resolv|closed|done|fixed/.test(sRaw) ? 'RESOLVED' : null;
  if (!status) fail('status', `“${get(cells, mapping, 'status')}” is not OPEN, CLAIMED or RESOLVED.`);
  const resolution = get(cells, mapping, 'resolution').slice(0, 500) || null;
  if (status === 'RESOLVED' && !resolution) warn('resolution', 'Resolved with no resolution written: it reads “Resolved before EJO.”');
  const claimReference = get(cells, mapping, 'claimReference').slice(0, 60) || null;
  if (status === 'CLAIMED' && !claimReference) warn('claimReference', 'Claimed from the supplier with no claim reference: add it in EJO when you have it.');
  const raisedAt = momentOf(cells, mapping, 'raisedAt', 'Raised', today, warn, fail);
  const failed = issues.some((i) => i.level === 'error');
  const partNumber = get(cells, mapping, 'partNumber').toUpperCase().slice(0, 60) || null;
  const caseNumber = get(cells, mapping, 'caseNumber').toUpperCase().slice(0, 20) || null;
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD', issues,
    keys: kitVinKey && kind ? [`issue:${kitVinKey}|${kind}|${partNumber ?? ''}|${caseNumber ?? ''}|${description.toLowerCase().slice(0, 60)}`] : [],
    values: failed ? null : { kitVinKey: kitVinKey!, kind: kind!, partNumber, description, caseNumber, quantity, stopsLine: yes(get(cells, mapping, 'stopsLine')), status: status!, claimReference, resolution, raisedBy: get(cells, mapping, 'raisedBy').slice(0, 80) || null, raisedAt, branch: get(cells, mapping, 'branch').slice(0, 80) || null },
  };
}

export type { PlantStage };
