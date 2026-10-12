export type InspectionTemplateItem = {
  name: string;
  appliesTo: 'BOTH' | 'PASSENGER' | 'COMMERCIAL';
  conditionOptions: string[];
  actionOptions: string[];
};
export type InspectionTemplateSection = { section: string; items: InspectionTemplateItem[] };

/**
 * Suggestion sets per item type; items share a set only when the
 * vocabulary is the same (e.g. every fluid level: Normal/Low/Overfilled...).
 * They feed a <datalist>, so the technician can still type anything.
 */
const FLUID_CONDITION = ['Normal', 'Low', 'Overfilled', 'Dirty', 'Contaminated', 'Due for Replacement', 'Leak Suspected'];
const FLUID_ACTION = ['No Action', 'Top Up', 'Replace', 'Flush & Replace', 'Inspect Leak', 'Further Diagnosis'];

const FILTER_CONDITION = ['Clean', 'Dusty', 'Dirty', 'Damaged', 'Restricted', 'Contaminated', 'Due'];
const FILTER_ACTION = ['No Action', 'Clean/Blow and Reinstall', 'Replace'];

const LEAK_CONDITION = ['None Detected', 'Minor Seepage', 'Active Leak', 'Severe Leak'];
const LEAK_ACTION = ['No Action', 'Monitor', 'Inspect Further', 'Repair', 'Replace Seal/Gasket'];

const WEAR_CONDITION = ['Good', 'Worn', 'Nearing Limit', 'Damaged', 'Seized', 'Noisy'];
const WEAR_ACTION = ['No Action', 'Adjust', 'Lubricate', 'Repair', 'Replace', 'Further Diagnosis'];

const ELECTRICAL_CONDITION = ['Good', 'Weak', 'Corroded Terminals', 'Not Working', 'Intermittent'];
const ELECTRICAL_ACTION = ['No Action', 'Clean Terminals', 'Tighten Connection', 'Repair', 'Replace', 'Further Diagnosis'];

const TYRE_CONDITION = ['Good Tread', 'Worn Tread', 'Uneven Wear', 'Damaged Sidewall', 'Puncture', 'Below Legal Limit'];
const TYRE_ACTION = ['No Action', 'Rotate', 'Balance', 'Align', 'Repair Puncture', 'Replace'];

const PRESSURE_CONDITION = ['Correct', 'Low', 'High'];
const PRESSURE_ACTION = ['No Action', 'Adjust to Spec', 'Further Diagnosis'];

const LUBRICATION_CONDITION = ['Well Lubricated', 'Dry', 'Seized'];
const LUBRICATION_ACTION = ['No Action', 'Lubricate'];

const DIAGNOSTIC_CONDITION = ['No Fault Found', 'Fault Code Present', 'Warning Light On', 'Intermittent Fault'];
const DIAGNOSTIC_ACTION = ['No Action', 'Clear Code & Monitor', 'Further Diagnosis Required', 'Recommend Repair'];

const AC_CONDITION = ['Cooling Well', 'Weak Cooling', 'Not Cooling', 'Refrigerant Low', 'Unusual Noise'];
const AC_ACTION = ['No Action', 'Recharge Refrigerant', 'Leak Test', 'Repair', 'Further Diagnosis'];

const GENERAL_CONDITION = ['Good', 'Loose', 'Noisy', 'Damaged', 'Not Functioning'];
const GENERAL_ACTION = ['No Action', 'Tighten/Adjust', 'Repair', 'Replace', 'Further Diagnosis'];

const SAFETY_ACTION = ['No Action', 'Adjust', 'Repair', 'Replace', 'Recommend Further Diagnosis', 'Escalate to Job Card'];

function item(
  name: string,
  conditionOptions: string[],
  actionOptions: string[],
  appliesTo: InspectionTemplateItem['appliesTo'] = 'BOTH',
): InspectionTemplateItem {
  return { name, appliesTo, conditionOptions, actionOptions };
}

/**
 * The shared checklist, filtered per vehicle type by getApplicableTemplate().
 * Defined in code rather than the database: it changes rarely and needs
 * careful curation when it does.
 *
 * Ordered by workshop priority, not alphabetically: Engine & Lubrication
 * first (Engine Oil first within it), and within each section the most
 * commonly changed and safety-critical items first.
 */
export const VEHICLE_INSPECTION_TEMPLATE: InspectionTemplateSection[] = [
  {
    section: 'Engine & Lubrication',
    items: [
      item('Engine Oil', FLUID_CONDITION, FLUID_ACTION),
      item('Oil Filter', FILTER_CONDITION, FILTER_ACTION),
      item('Oil Leaks', LEAK_CONDITION, LEAK_ACTION),
      item('Drive Belt', WEAR_CONDITION, WEAR_ACTION),
      item('Engine Mounts', WEAR_CONDITION, WEAR_ACTION),
      item('Lubrication / Grease Points', LUBRICATION_CONDITION, LUBRICATION_ACTION),
    ],
  },
  {
    section: 'Brakes',
    items: [
      item('Brake Pads / Shoes', WEAR_CONDITION, SAFETY_ACTION),
      item('Brake Fluid', FLUID_CONDITION, FLUID_ACTION),
      item('Brake Pedal', GENERAL_CONDITION, SAFETY_ACTION),
      item('Brake Discs / Drums', WEAR_CONDITION, SAFETY_ACTION),
      item('Brake Lines', LEAK_CONDITION, SAFETY_ACTION),
      item('Parking Brake', GENERAL_CONDITION, SAFETY_ACTION),
      item('Air Brake System', GENERAL_CONDITION, SAFETY_ACTION, 'COMMERCIAL'),
      item('Air Compressor / Air Dryer', GENERAL_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
    ],
  },
  {
    section: 'Cooling System',
    items: [
      item('Coolant Level', FLUID_CONDITION, FLUID_ACTION),
      item('Coolant Condition', FLUID_CONDITION, FLUID_ACTION),
      item('Radiator', LEAK_CONDITION, GENERAL_ACTION),
      item('Cooling Hoses', WEAR_CONDITION, GENERAL_ACTION),
      item('Cooling Fan', GENERAL_CONDITION, GENERAL_ACTION),
    ],
  },
  {
    section: 'Fuel System',
    items: [
      item('Fuel Filter', FILTER_CONDITION, FILTER_ACTION),
      item('Fuel Lines', LEAK_CONDITION, GENERAL_ACTION),
      item('Fuel Leaks', LEAK_CONDITION, LEAK_ACTION),
      item('Water Separator', GENERAL_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
    ],
  },
  {
    section: 'Air Intake',
    items: [
      item('Air Filter', FILTER_CONDITION, FILTER_ACTION),
      item('Intake Hoses', WEAR_CONDITION, GENERAL_ACTION),
      item('Turbocharger', GENERAL_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
    ],
  },
  {
    section: 'Tyres & Wheels',
    items: [
      item('Tyre Condition', TYRE_CONDITION, TYRE_ACTION),
      item('Tyre Pressure', PRESSURE_CONDITION, PRESSURE_ACTION),
      item('Wheel Nuts', GENERAL_CONDITION, GENERAL_ACTION),
      item('Wheel Alignment', GENERAL_CONDITION, TYRE_ACTION),
      item('Spare Tyre', TYRE_CONDITION, TYRE_ACTION),
    ],
  },
  {
    section: 'Steering & Suspension',
    items: [
      item('Steering System', GENERAL_CONDITION, SAFETY_ACTION),
      item('Tie Rods / Ball Joints', WEAR_CONDITION, SAFETY_ACTION),
      item('Shocks / Struts', WEAR_CONDITION, GENERAL_ACTION),
      item('Leaf Springs', WEAR_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
      item('Kingpins', WEAR_CONDITION, LUBRICATION_ACTION, 'COMMERCIAL'),
    ],
  },
  {
    section: 'Electrical',
    items: [
      item('Battery', ELECTRICAL_CONDITION, ELECTRICAL_ACTION),
      item('Charging System', ELECTRICAL_CONDITION, ELECTRICAL_ACTION),
      item('Lights', ELECTRICAL_CONDITION, ELECTRICAL_ACTION),
      item('Trafficators / Indicators', ELECTRICAL_CONDITION, ELECTRICAL_ACTION),
      item('Horn', ELECTRICAL_CONDITION, ELECTRICAL_ACTION),
      item('Wiring', ELECTRICAL_CONDITION, ELECTRICAL_ACTION),
    ],
  },
  {
    section: 'AC / HVAC',
    items: [
      item('Cooling Performance', AC_CONDITION, AC_ACTION),
      item('AC Filter', FILTER_CONDITION, FILTER_ACTION),
      item('Refrigerant / Leak Check', AC_CONDITION, AC_ACTION),
    ],
  },
  {
    section: 'Transmission & Drivetrain',
    items: [
      item('Transmission Fluid', FLUID_CONDITION, FLUID_ACTION),
      item('Clutch', WEAR_CONDITION, SAFETY_ACTION),
      item('Propeller Shaft', WEAR_CONDITION, LUBRICATION_ACTION, 'COMMERCIAL'),
      item('Universal Joints', WEAR_CONDITION, LUBRICATION_ACTION, 'COMMERCIAL'),
      item('Differential / Axles', FLUID_CONDITION, FLUID_ACTION, 'COMMERCIAL'),
    ],
  },
  {
    section: 'Commercial / Heavy Duty',
    items: [
      item('Chassis', GENERAL_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
      item('Fifth Wheel', WEAR_CONDITION, LUBRICATION_ACTION, 'COMMERCIAL'),
      item('Air Tanks / Air Lines', GENERAL_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
      item('Hydraulic System', LEAK_CONDITION, GENERAL_ACTION, 'COMMERCIAL'),
    ],
  },
  {
    section: 'Diagnostics',
    items: [
      item('Diagnostic Scan / DTCs', DIAGNOSTIC_CONDITION, DIAGNOSTIC_ACTION),
      item('Warning Lights', DIAGNOSTIC_CONDITION, DIAGNOSTIC_ACTION),
      item('Road Test', GENERAL_CONDITION, DIAGNOSTIC_ACTION),
    ],
  },
];

/** The template for one vehicle type, dropping sections left with no items. */
export function getApplicableTemplate(vehicleType: 'PASSENGER' | 'COMMERCIAL'): InspectionTemplateSection[] {
  return VEHICLE_INSPECTION_TEMPLATE.map((s) => ({
    section: s.section,
    items: s.items.filter((i) => i.appliesTo === 'BOTH' || i.appliesTo === vehicleType),
  })).filter((s) => s.items.length > 0);
}

/** Item name → its condition and action suggestions, built once. */
export const INSPECTION_ITEM_OPTIONS: Record<string, { conditionOptions: string[]; actionOptions: string[] }> = Object.fromEntries(
  VEHICLE_INSPECTION_TEMPLATE.flatMap((s) => s.items.map((i) => [i.name, { conditionOptions: i.conditionOptions, actionOptions: i.actionOptions }])),
);
