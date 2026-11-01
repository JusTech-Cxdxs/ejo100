/**
 * Pre-delivery inspection: the checklists and the rules. Pure.
 *
 * Two families today, as assembled at the plant:
 *  • Isuzu N-series trucks — NQR, NPR, QLR, QMR (cab-chassis, diesel, manual);
 *  • Soueast S07 — the SUV (petrol, automatic, keyless, camera and sensors).
 * Each checklist is versioned: an inspection keeps the items it was started
 * with, so changing a checklist never rewrites a PDI already done.
 *
 * The rules, in one place (the screens, the server and the certificate use them):
 *  • every item answered — OK, Not OK (with what is wrong) or, where it
 *    applies, N/A;
 *  • the diagnostic scan done; any fault codes found must be cleared;
 *  • odometer, battery voltage and tyre pressures recorded;
 *  • any Not OK sends the vehicle to rework; reworked items are checked again;
 *  • a second person (never the inspector) approves; approval is the SAP QM
 *    usage decision: A (accepted) or R (rejected, back to rework).
 */

export type PdiFamily = 'isuzu-n' | 'soueast-s07';
export type PdiTemplateItem = { code: string; section: string; label: string; allowNa?: boolean };
export type PdiTemplate = { key: PdiFamily; version: number; name: string; models: string[]; items: PdiTemplateItem[] };

/** The models built at the plant, as the checklist and SAP know them. */
export const PLANT_MODELS: { code: string; make: string; name: string; family: PdiFamily }[] = [
  { code: 'NQR', make: 'Isuzu', name: 'Isuzu NQR (medium truck)', family: 'isuzu-n' },
  { code: 'NPR', make: 'Isuzu', name: 'Isuzu NPR (light truck)', family: 'isuzu-n' },
  { code: 'QLR', make: 'Isuzu', name: 'Isuzu QLR (light truck)', family: 'isuzu-n' },
  { code: 'QMR', make: 'Isuzu', name: 'Isuzu QMR (light truck)', family: 'isuzu-n' },
  { code: 'S07', make: 'Soueast', name: 'Soueast S07 (SUV)', family: 'soueast-s07' },
];
export const modelByCode = (code: string | null | undefined) => PLANT_MODELS.find((m) => m.code === String(code ?? '').toUpperCase()) ?? null;

const items = (section: string, prefix: string, list: (string | [string, true])[]): PdiTemplateItem[] =>
  list.map((x, i) => {
    const [label, allowNa] = Array.isArray(x) ? x : [x, false];
    return { code: `${prefix}${String(i + 1).padStart(2, '0')}`, section, label, ...(allowNa ? { allowNa: true } : {}) };
  });

export const PDI_TEMPLATES: Record<PdiFamily, PdiTemplate> = {
  'isuzu-n': {
    key: 'isuzu-n', version: 1, name: 'Isuzu N-series truck PDI', models: ['NQR', 'NPR', 'QLR', 'QMR'],
    items: [
      ...items('Identity and documents', 'ID', ['VIN on the chassis matches the label and the build papers', 'Engine number matches the build papers', "Owner's manual, service booklet and warranty card present", 'Two keys present and working', 'Jack, wheel brace and tool kit present', 'Spare wheel fitted and secured']),
      ...items('Cab and exterior', 'EX', ['Paint and cab panels free of damage', 'Windscreen and glass free of chips and cracks', 'Mirrors fitted, adjusted, glass intact', 'Doors, locks, hinges and seals', 'Cab tilt mechanism and safety lock', 'Wipers and washers', 'Badges, decals and reflectors fitted', 'Chassis frame and cross-members free of damage']),
      ...items('Engine and fluids', 'EN', ['Engine oil level', 'Coolant level and mix', 'Brake fluid level', 'Clutch fluid level', 'Power steering fluid level', 'Windscreen washer fluid', 'Drive belts and tension', 'No oil, fuel or coolant leaks', 'Battery terminals tight and clean', 'Air filter and intake secure']),
      ...items('Chassis and running gear', 'CH', ['Tyre condition (including inner duals)', 'Wheel nuts torqued to specification', 'Spring U-bolts and hangers torqued', 'Propeller shaft and centre bearing', 'Axle and differential: no leaks, oil level', 'Brake pipes and hoses', 'Fuel tank, straps and lines', 'Exhaust and mountings', 'Parking brake holds']),
      ...items('Electrical', 'EL', ['Headlamps, high and low beam', 'Indicators and hazard lamps', 'Tail, brake and reverse lamps', 'Side marker and clearance lamps', 'Horn', 'Instrument cluster: no warning lamps', 'Odometer and tachograph working', ['Air conditioning', true], ['Radio', true], 'Reverse buzzer']),
      ...items('Road test', 'RT', ['Engine starts and idles smoothly', 'Clutch and gear change', 'Steering: free play, no pull', 'Service brake and exhaust brake', 'No abnormal noise or vibration', 'Speedometer reads correctly', 'No leaks after the road test']),
      ...items('Handover readiness', 'HO', ['Cab interior clean, seats and belts', 'Protective covers and transport film removed', 'Fuel level for delivery', 'Final wash']),
    ],
  },
  'soueast-s07': {
    key: 'soueast-s07', version: 1, name: 'Soueast S07 SUV PDI', models: ['S07'],
    items: [
      ...items('Identity and documents', 'ID', ['VIN on the body matches the label and the build papers', 'Engine number matches the build papers', "Owner's manual, service booklet and warranty card present", 'Two smart keys present and working', 'Jack, tools and warning triangle present', 'Spare wheel or repair kit present']),
      ...items('Body and exterior', 'EX', ['Paint and panels free of damage', 'Panel gaps even', 'Windscreen and glass free of chips', ['Sunroof opens, closes and seals', true], 'Mirrors: power adjust and fold', 'Lamps and lenses intact', 'Wheels and tyres free of damage', 'Wipers and washers']),
      ...items('Engine and fluids', 'EN', ['Engine oil level', 'Coolant level', 'Brake fluid level', 'Washer fluid', 'Battery terminals and state', 'Drive belt', 'No leaks in the engine bay']),
      ...items('Underbody', 'UB', ['Tyre pressures to the door-jamb placard', 'Wheel nuts torqued', 'Suspension and steering joints', 'Brake pipes and hoses', 'Exhaust and heat shields', 'Transmission: no leaks']),
      ...items('Electrical and comfort', 'EL', ['Headlamps and daytime running lamps', 'Indicators and hazards', 'Tail, brake and reverse lamps', 'Horn', 'All power windows, including one-touch', 'Central locking and keyless entry', 'Push-button start', 'Instrument cluster: no warning lamps', 'Infotainment, Bluetooth and speakers', 'Reversing camera and parking sensors', 'Climate control and air conditioning', 'Tyre pressure monitoring', 'Interior lamps and power outlets']),
      ...items('Interior and safety', 'IN', ['Seats adjust and lock', 'Seat belts latch and retract', 'Airbag warning lamp goes out', 'Trim, carpets and headlining clean and fitted', 'Child-seat anchors present']),
      ...items('Road test', 'RT', ['Starts and idles smoothly', 'Transmission shifts smoothly in all modes', 'Steering centred, no pull', 'Brakes and ABS', 'Cruise control', 'No abnormal noise or vibration', 'No leaks after the road test']),
      ...items('Handover readiness', 'HO', ['Protective films and covers removed', 'Interior and exterior clean', 'Fuel level for delivery', 'Clock, language and radio presets set']),
    ],
  },
};

export const templateFor = (modelCode: string | null | undefined): PdiTemplate | null => {
  const m = modelByCode(modelCode);
  return m ? PDI_TEMPLATES[m.family] : null;
};

// ── Results and the verdict ─────────────────────────────────────────────

export type PdiResult = 'OK' | 'NOT_OK' | 'NA';
export const PDI_RESULTS: PdiResult[] = ['OK', 'NOT_OK', 'NA'];
export const isPdiResult = (r: unknown): r is PdiResult => PDI_RESULTS.includes(r as PdiResult);
export const RESULT_WORDS: Record<PdiResult, string> = { OK: 'OK', NOT_OK: 'Not OK', NA: 'N/A' };

export type PdiStatus = 'IN_PROGRESS' | 'REWORK' | 'SUBMITTED' | 'PASSED' | 'CANCELLED';
export const PDI_STATUS_WORDS: Record<PdiStatus, string> = {
  IN_PROGRESS: 'In progress',
  REWORK: 'Rework',
  SUBMITTED: 'Waiting for approval',
  PASSED: 'Passed',
  CANCELLED: 'Cancelled',
};
/** While these, the inspector may still change answers. */
export const EDITABLE: PdiStatus[] = ['IN_PROGRESS', 'REWORK'];

export type PdiItemState = { code: string; label: string; section: string; allowNa: boolean; result: PdiResult | null; defect: string | null; reworkedAt: Date | string | null };
export type PdiReadings = { odometerKm: number | null; batteryVolts: number | null; tyreFrontPsi: number | null; tyreRearPsi: number | null; faultScanDone: boolean; faultCodes: string[]; faultCodesCleared: boolean };

/** A vehicle fresh off the line has very few kilometres: more than this asks for an explanation. */
export const PDI_MAX_ODOMETER_KM = 50;

/** What still stands between this PDI and being sent for approval (plain words, one per problem). */
export function pdiBlockers(items: PdiItemState[], r: PdiReadings): string[] {
  const out: string[] = [];
  const unanswered = items.filter((i) => !i.result);
  if (unanswered.length) out.push(`${unanswered.length} ${unanswered.length === 1 ? 'item is' : 'items are'} not checked yet.`);
  const naWrong = items.filter((i) => i.result === 'NA' && !i.allowNa);
  if (naWrong.length) out.push(`N/A is not allowed for: ${naWrong.map((i) => i.label).join('; ')}.`);
  const noDefect = items.filter((i) => i.result === 'NOT_OK' && !(i.defect ?? '').trim());
  if (noDefect.length) out.push(`Say what is wrong for: ${noDefect.map((i) => i.label).join('; ')}.`);
  if (!r.faultScanDone) out.push('Run the diagnostic scan and record the fault codes (or none).');
  if (r.faultScanDone && r.faultCodes.length && !r.faultCodesCleared) out.push('Fault codes were found: clear them (after fixing the cause) before the PDI can pass.');
  if (r.odometerKm === null) out.push('Record the odometer reading.');
  if (r.batteryVolts === null) out.push('Record the battery voltage.');
  if (r.tyreFrontPsi === null || r.tyreRearPsi === null) out.push('Record the tyre pressures (front and rear).');
  return out;
}

/** Items that failed and are not yet put right (reworked and checked OK again). */
export function openDefects(items: PdiItemState[]): PdiItemState[] {
  return items.filter((i) => i.result === 'NOT_OK');
}

/** Where a submitted PDI goes: rework while any item is Not OK, otherwise to approval. */
export function afterSubmit(items: PdiItemState[]): Extract<PdiStatus, 'REWORK' | 'SUBMITTED'> {
  return openDefects(items).length ? 'REWORK' : 'SUBMITTED';
}

/** The approver's decision, as SAP QM records it: A — accepted; R — rejected (back to rework). */
export type UsageDecision = 'A' | 'R';
export const USAGE_DECISION_WORDS: Record<UsageDecision, string> = { A: 'Accepted (A)', R: 'Rejected (R)' };

/** Readings that deserve a second look (not blockers): shown to the approver. */
export function pdiWarnings(r: PdiReadings, family: PdiFamily | null): string[] {
  const out: string[] = [];
  if (r.odometerKm !== null && r.odometerKm > PDI_MAX_ODOMETER_KM) out.push(`The odometer reads ${r.odometerKm} km: more than ${PDI_MAX_ODOMETER_KM} km for a new vehicle.`);
  if (r.batteryVolts !== null && (r.batteryVolts < 12.4 || r.batteryVolts > 13.0)) out.push(`Battery at ${r.batteryVolts} V (a rested, charged battery reads 12.4–13.0 V).`);
  const [lo, hi] = family === 'soueast-s07' ? [30, 42] : [50, 110];
  for (const [label, v] of [['Front', r.tyreFrontPsi], ['Rear', r.tyreRearPsi]] as const) {
    if (v !== null && (v < lo || v > hi)) out.push(`${label} tyre pressure ${v} psi is outside ${lo}–${hi} psi.`);
  }
  if (r.faultCodes.length) out.push(`Fault codes found and cleared: ${r.faultCodes.join(', ')}.`);
  return out;
}

/** Fault codes as typed: "P0420, u0100  P0171" → ["P0420", "U0100", "P0171"] (OBD-II and maker codes; anything else dropped). */
export function parseFaultCodes(raw: string | null | undefined): string[] {
  const out = String(raw ?? '').toUpperCase().split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^[PCBU][0-9A-F]{4}(-[0-9A-F]{2})?$|^[0-9]{2,6}$/.test(s));
  return [...new Set(out)].slice(0, 50);
}

export const PLANT_STAGES = ['KIT', 'LINE', 'QA', 'PDI', 'YARD', 'SOLD'] as const;
export type PlantStage = (typeof PLANT_STAGES)[number];
export const PLANT_STAGE_WORDS: Record<PlantStage, string> = { KIT: 'Kit arrival', LINE: 'On the line', QA: 'Quality audit', PDI: 'Pre-delivery inspection', YARD: 'In the yard', SOLD: 'Sold' };
