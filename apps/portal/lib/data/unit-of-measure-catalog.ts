/**
 * Real Units of Measure for a Nigerian automobile parts and service
 * business — matching the terminology actually used at markets like
 * Alaba, Ladipo, and Nnewi, not a generic international list bolted
 * on. Grouped by what they're actually for, since that's how someone
 * picking a unit thinks about it: "this is a discrete part" vs. "this
 * is a fluid" vs. "this is hardware sold in bulk" vs. "this is labor,
 * not a physical thing at all."
 *
 * This is a suggestion list, never a restriction — every picker that
 * uses this also accepts free-text entry for anything not listed
 * here, since a real workshop will always run into something this
 * list didn't anticipate.
 */

export type UnitOfMeasureOption = {
  code: string;
  label: string;
  group: 'Parts & Components' | 'Fluids & Chemicals' | 'Hardware & Consumables' | 'Labor & Service';
};

export const UNIT_OF_MEASURE_OPTIONS: UnitOfMeasureOption[] = [
  // Parts & Components — discrete counts
  { code: 'PCS', label: 'Piece', group: 'Parts & Components' },
  { code: 'PR', label: 'Pair', group: 'Parts & Components' },
  { code: 'SET', label: 'Set', group: 'Parts & Components' },
  { code: 'ASSY', label: 'Assembly', group: 'Parts & Components' },

  // Fluids & Chemicals — liquids, by real container size or precise volume
  { code: 'L', label: 'Liter', group: 'Fluids & Chemicals' },
  { code: 'BTL', label: 'Bottle', group: 'Fluids & Chemicals' },
  { code: 'CAN', label: 'Can / Keg (4–5L)', group: 'Fluids & Chemicals' },
  { code: 'DRM', label: 'Drum (200L)', group: 'Fluids & Chemicals' },

  // Hardware & Consumables — bulk items, sold by roll, packet, or weight
  { code: 'PKT', label: 'Packet', group: 'Hardware & Consumables' },
  { code: 'ROL', label: 'Roll', group: 'Hardware & Consumables' },
  { code: 'CTN', label: 'Carton', group: 'Hardware & Consumables' },
  { code: 'KG', label: 'Kilogram', group: 'Hardware & Consumables' },

  // Labor & Service — intangible, workshop-side units
  { code: 'HR', label: 'Hour', group: 'Labor & Service' },
  { code: 'JOB', label: 'Job / Activity', group: 'Labor & Service' },
];

export function findUnitOfMeasureOption(code: string): UnitOfMeasureOption | undefined {
  return UNIT_OF_MEASURE_OPTIONS.find((u) => u.code.toLowerCase() === code.trim().toLowerCase());
}
