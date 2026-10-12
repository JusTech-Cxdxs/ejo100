/**
 * Unit of measure suggestions for a Nigerian parts and service business,
 * using the terms used at markets like Alaba, Ladipo and Nnewi, grouped by
 * use (parts, fluids, hardware, labour).
 *
 * Suggestions only: every picker also accepts free text.
 */

export type UnitOfMeasureOption = {
  code: string;
  label: string;
  // Shown in the suggestion only, never stored. Putting details like "(205L)"
  // in `label` would save them as part of the unit.
  hint?: string;
  group: 'Parts & Components' | 'Fluids & Chemicals' | 'Hardware & Consumables' | 'Labor & Service';
};

export const UNIT_OF_MEASURE_OPTIONS: UnitOfMeasureOption[] = [
  // Parts & Components — discrete counts
  { code: 'PCS', label: 'Piece', group: 'Parts & Components' },
  { code: 'PR', label: 'Pair', group: 'Parts & Components' },
  { code: 'SET', label: 'Set', group: 'Parts & Components' },
  { code: 'ASSY', label: 'Assembly', group: 'Parts & Components' },

  // Fluids & Chemicals — liquids, by container size or volume
  { code: 'L', label: 'Liter', group: 'Fluids & Chemicals' },
  { code: 'BTL', label: 'Bottle', group: 'Fluids & Chemicals' },
  { code: 'CAN', label: 'Can', hint: 'Keg, 4–5L', group: 'Fluids & Chemicals' },
  { code: 'DRM', label: 'Drum', hint: '205L', group: 'Fluids & Chemicals' },

  // Hardware & Consumables — bulk items, sold by roll, packet, or weight
  { code: 'PKT', label: 'Packet', group: 'Hardware & Consumables' },
  { code: 'ROL', label: 'Roll', group: 'Hardware & Consumables' },
  { code: 'CTN', label: 'Carton', group: 'Hardware & Consumables' },
  { code: 'KG', label: 'Kilogram', group: 'Hardware & Consumables' },

  // Labor & Service — intangible, workshop-side units
  { code: 'HR', label: 'Hour', group: 'Labor & Service' },
  // Several mechanics on one job: 2 mechanics for 4 hours is 8 man-hours.
  { code: 'MHR', label: 'Man-Hour', group: 'Labor & Service' },
  { code: 'JOB', label: 'Job', hint: 'Activity', group: 'Labor & Service' },
  // Standard unit for Sundry: small consumables (rags, grease, solvent) not
  // worth counting per repair. Common in ERPs (SAP, Oracle, Odoo, QuickBooks).
  { code: 'LOT', label: 'Lot', group: 'Labor & Service' },
];

export function findUnitOfMeasureOption(code: string): UnitOfMeasureOption | undefined {
  return UNIT_OF_MEASURE_OPTIONS.find((u) => u.code.toLowerCase() === code.trim().toLowerCase());
}
