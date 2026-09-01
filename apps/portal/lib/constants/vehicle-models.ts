/**
 * Kewalram's real vehicle makes/models — used to power a searchable
 * dropdown at vehicle registration, with a genuine "Other" fallback for
 * anything not yet listed here. Kept as a plain constant, not a database
 * table: this is UI-level guidance for consistent data entry, not an
 * entity with its own lifecycle — the real compatibility data lives in
 * PartFitment, keyed off whatever make/model/engine actually gets typed
 * or picked.
 *
 * Making vehicle make/model consistent, matchable data (rather than free
 * text typed five different ways) is exactly what the fitment-matching
 * system in store.ts (getFittingPartsForVehicle) needs to actually work.
 */

export type VehicleModelOption = {
  make: string;
  model: string;
  /** Real, known engine variants for this make/model — shown as a second
   * picker once make/model is chosen, since this is the genuine
   * compatibility key (confirmed via real research on Isuzu NPR/NQR/QMR/
   * QLR and Foton Tunland/TM3 — two different models can share an engine
   * and be fully interchangeable, or the same model name can hide a
   * different engine across a fuel/trim variant). Left empty when only
   * one engine variant is currently known for this model.
   */
  engineTypes?: string[];
};

export const KNOWN_VEHICLE_MODELS: VehicleModelOption[] = [
  { make: 'Foton', model: 'Tunland', engineTypes: ['2.0L Turbo Diesel', '2.4L Petrol'] },
  { make: 'Foton', model: 'TM3', engineTypes: ['1.5L Petrol'] },
  { make: 'Isuzu', model: 'NPR', engineTypes: ['4HK1 (5.2L Diesel)', '4JJ1/4JZ1 (3.0L Diesel)'] },
  { make: 'Isuzu', model: 'NQR', engineTypes: ['4HK1 (5.2L Diesel)'] },
  { make: 'Isuzu', model: 'QMR', engineTypes: ['4JB1-TC (2.8L Diesel)', '4JH1-TC (3.0L Diesel)'] },
  { make: 'Isuzu', model: 'QLR', engineTypes: ['4JB1-TC (2.8L Diesel)', '4JH1-TC (3.0L Diesel)'] },
];

/** The sentinel value the UI uses for "not in the known list" — vehicle
 * registration falls back to free-text make/model/engine entry when this
 * is picked, exactly as discussed: a fixed list for the common, real
 * cases, with a genuine escape hatch for everything else. */
export const OTHER_VEHICLE_MODEL_VALUE = '__other__';
