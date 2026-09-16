export type InspectionTemplateItem = { name: string; appliesTo: 'BOTH' | 'PASSENGER' | 'COMMERCIAL' };
export type InspectionTemplateSection = { section: string; items: InspectionTemplateItem[] };

/**
 * The one real, shared checklist structure — filtered per vehicle by
 * getApplicableTemplate() below, never asked of the front desk.
 * Deliberately code-defined rather than a database catalogue: this
 * changes rarely, needs careful curation when it does, and a full
 * admin UI for it now would be premature — the same reasoning that
 * kept ServiceType itself from being expanded further this round.
 * Comprehensive on purpose, but grouped into real sections so no
 * screen ever shows more than one section's items at once.
 */
export const VEHICLE_INSPECTION_TEMPLATE: InspectionTemplateSection[] = [
  {
    section: 'Engine & Lubrication',
    items: [
      { name: 'Engine Oil', appliesTo: 'BOTH' },
      { name: 'Oil Filter', appliesTo: 'BOTH' },
      { name: 'Oil Leaks', appliesTo: 'BOTH' },
      { name: 'Drive Belt', appliesTo: 'BOTH' },
      { name: 'Engine Mounts', appliesTo: 'BOTH' },
      { name: 'Lubrication / Grease Points', appliesTo: 'BOTH' },
    ],
  },
  {
    section: 'Cooling System',
    items: [
      { name: 'Coolant Level', appliesTo: 'BOTH' },
      { name: 'Coolant Condition', appliesTo: 'BOTH' },
      { name: 'Radiator', appliesTo: 'BOTH' },
      { name: 'Cooling Hoses', appliesTo: 'BOTH' },
      { name: 'Cooling Fan', appliesTo: 'BOTH' },
    ],
  },
  {
    section: 'Fuel System',
    items: [
      { name: 'Fuel Filter', appliesTo: 'BOTH' },
      { name: 'Fuel Lines', appliesTo: 'BOTH' },
      { name: 'Fuel Leaks', appliesTo: 'BOTH' },
      { name: 'Water Separator', appliesTo: 'COMMERCIAL' },
    ],
  },
  {
    section: 'Air Intake',
    items: [
      { name: 'Air Filter', appliesTo: 'BOTH' },
      { name: 'Intake Hoses', appliesTo: 'BOTH' },
      { name: 'Turbocharger', appliesTo: 'COMMERCIAL' },
    ],
  },
  {
    section: 'Brakes',
    items: [
      { name: 'Brake Pedal', appliesTo: 'BOTH' },
      { name: 'Brake Fluid', appliesTo: 'BOTH' },
      { name: 'Brake Pads / Shoes', appliesTo: 'BOTH' },
      { name: 'Brake Discs / Drums', appliesTo: 'BOTH' },
      { name: 'Brake Lines', appliesTo: 'BOTH' },
      { name: 'Parking Brake', appliesTo: 'BOTH' },
      { name: 'Air Brake System', appliesTo: 'COMMERCIAL' },
      { name: 'Air Compressor / Air Dryer', appliesTo: 'COMMERCIAL' },
    ],
  },
  {
    section: 'Steering & Suspension',
    items: [
      { name: 'Steering System', appliesTo: 'BOTH' },
      { name: 'Tie Rods / Ball Joints', appliesTo: 'BOTH' },
      { name: 'Shocks / Struts', appliesTo: 'BOTH' },
      { name: 'Leaf Springs', appliesTo: 'COMMERCIAL' },
      { name: 'Kingpins', appliesTo: 'COMMERCIAL' },
    ],
  },
  {
    section: 'Tyres & Wheels',
    items: [
      { name: 'Tyre Condition', appliesTo: 'BOTH' },
      { name: 'Tyre Pressure', appliesTo: 'BOTH' },
      { name: 'Wheel Nuts', appliesTo: 'BOTH' },
      { name: 'Wheel Alignment', appliesTo: 'BOTH' },
      { name: 'Spare Tyre', appliesTo: 'BOTH' },
    ],
  },
  {
    section: 'Electrical',
    items: [
      { name: 'Battery', appliesTo: 'BOTH' },
      { name: 'Charging System', appliesTo: 'BOTH' },
      { name: 'Lights', appliesTo: 'BOTH' },
      { name: 'Trafficators / Indicators', appliesTo: 'BOTH' },
      { name: 'Horn', appliesTo: 'BOTH' },
      { name: 'Wiring', appliesTo: 'BOTH' },
    ],
  },
  {
    section: 'AC / HVAC',
    items: [
      { name: 'Cooling Performance', appliesTo: 'BOTH' },
      { name: 'AC Filter', appliesTo: 'BOTH' },
      { name: 'Refrigerant / Leak Check', appliesTo: 'BOTH' },
    ],
  },
  {
    section: 'Transmission & Drivetrain',
    items: [
      { name: 'Transmission Fluid', appliesTo: 'BOTH' },
      { name: 'Clutch', appliesTo: 'BOTH' },
      { name: 'Propeller Shaft', appliesTo: 'COMMERCIAL' },
      { name: 'Universal Joints', appliesTo: 'COMMERCIAL' },
      { name: 'Differential / Axles', appliesTo: 'COMMERCIAL' },
    ],
  },
  {
    section: 'Commercial / Heavy Duty',
    items: [
      { name: 'Chassis', appliesTo: 'COMMERCIAL' },
      { name: 'Fifth Wheel', appliesTo: 'COMMERCIAL' },
      { name: 'Air Tanks / Air Lines', appliesTo: 'COMMERCIAL' },
      { name: 'Hydraulic System', appliesTo: 'COMMERCIAL' },
    ],
  },
  {
    section: 'Diagnostics',
    items: [
      { name: 'Diagnostic Scan / DTCs', appliesTo: 'BOTH' },
      { name: 'Warning Lights', appliesTo: 'BOTH' },
      { name: 'Road Test', appliesTo: 'BOTH' },
    ],
  },
];

/** Filters the shared template down to what's real for one vehicle's
 * own registered type, dropping any section that ends up with no
 * applicable items rather than showing an empty section header. */
export function getApplicableTemplate(vehicleType: 'PASSENGER' | 'COMMERCIAL'): InspectionTemplateSection[] {
  return VEHICLE_INSPECTION_TEMPLATE.map((s) => ({
    section: s.section,
    items: s.items.filter((i) => i.appliesTo === 'BOTH' || i.appliesTo === vehicleType),
  })).filter((s) => s.items.length > 0);
}
