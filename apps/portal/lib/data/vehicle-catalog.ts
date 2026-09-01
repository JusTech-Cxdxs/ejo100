/**
 * Kewalram's real make/model suggestions for vehicle registration —
 * split by the Workshop's two operational sections (Passenger vs
 * Commercial), as described directly. Purely a suggestion source: Make
 * and Model remain plain free-text fields in the database and the form
 * (see VehicleMakeModelPicker), so anything outside this list can always
 * be typed manually — these lists make the common case faster, they
 * never restrict the uncommon one.
 *
 * A handful of models per brand came directly as given (SOUEAST,
 * Isuzu's N/Q/F-series codes, Foton's Tunland/View/TM3 lineup). Where a
 * brand was named but its specific models weren't ("suggestions is it
 * Wrangler or so"), well-known, common models for that brand were used
 * instead of inventing anything obscure or uncertain.
 */

export type VehicleCategory = 'PASSENGER' | 'COMMERCIAL';

export const VEHICLE_CATALOG: Record<VehicleCategory, Record<string, string[]>> = {
  PASSENGER: {
    SOUEAST: ['SO5', 'SO6', 'SO7', 'SO9'],
    Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade'],
    Dodge: ['Journey', 'Charger', 'Caravan', 'Nitro'],
    Chevrolet: ['Aveo', 'Cruze', 'Captiva', 'Spark', 'Trailblazer'],
    Mitsubishi: ['Pajero', 'Outlander', 'ASX', 'L200'],
    Fiat: ['Punto', 'Linea', 'Doblo', 'Panda'],
    Chery: ['Tiggo 2', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'QQ'],
  },
  COMMERCIAL: {
    Isuzu: ['NQR', 'NPR', 'QMR', 'QLR', 'FVR'],
    Foton: ['Tunland Luxury', 'Tunland Premium', 'View CS', 'View CS2', 'TM3'],
    Mitsubishi: ['Canter'],
  },
};

/**
 * Real, known engine-type suggestions per Make+Model — filled in only
 * where the actual engine spec is genuinely known and confirmed (Foton
 * Tunland/TM3, Isuzu N-series/Q-series), since this is precisely the
 * real compatibility key parts fitment is built around: two different
 * models can share an engine and be fully interchangeable (Isuzu NPR
 * and NQR both on the 4HK1), while the same-looking model name across a
 * fuel/trim variant can hide a genuinely different engine (Foton
 * Tunland's Turbo Diesel vs. Petrol variants) — the model name alone is
 * never enough to know what a part actually fits. Left empty for every
 * other Make/Model, same reasoning as the rest of this catalog: a
 * suggestion where one's confidently known, never a restriction where
 * it isn't — Engine remains a plain free-text field regardless.
 */
export const ENGINE_TYPE_CATALOG: Record<VehicleCategory, Record<string, Record<string, string[]>>> = {
  PASSENGER: {},
  COMMERCIAL: {
    Isuzu: {
      NPR: ['4HK1 (5.2L Diesel)', '4JJ1/4JZ1 (3.0L Diesel)'],
      NQR: ['4HK1 (5.2L Diesel)'],
      QMR: ['4JB1-TC (2.8L Diesel)', '4JH1-TC (3.0L Diesel)'],
      QLR: ['4JB1-TC (2.8L Diesel)', '4JH1-TC (3.0L Diesel)'],
    },
    Foton: {
      'Tunland Luxury': ['2.0L Turbo Diesel', '2.4L Petrol'],
      'Tunland Premium': ['2.0L Turbo Diesel', '2.4L Petrol'],
      TM3: ['1.5L Petrol'],
    },
  },
};

export function getMakesForCategory(category: VehicleCategory): string[] {
  return Object.keys(VEHICLE_CATALOG[category]);
}

/** Case-insensitive lookup — the Make field is free text, so what's
 * typed won't always match the catalog's exact casing. Returns an empty
 * array (no suggestions, but the field stays fully free-text) if the
 * typed make isn't a recognized one. */
export function getModelsForMake(category: VehicleCategory, make: string): string[] {
  const entry = Object.entries(VEHICLE_CATALOG[category]).find(
    ([knownMake]) => knownMake.toLowerCase() === make.trim().toLowerCase(),
  );
  return entry?.[1] ?? [];
}

/** Same case-insensitive, empty-array-when-unknown behavior as
 * getModelsForMake — Engine stays free text regardless of whether a
 * suggestion is found for the given Make+Model. */
export function getEngineTypesForModel(category: VehicleCategory, make: string, model: string): string[] {
  const makeEntry = Object.entries(ENGINE_TYPE_CATALOG[category]).find(
    ([knownMake]) => knownMake.toLowerCase() === make.trim().toLowerCase(),
  );
  if (!makeEntry) return [];
  const modelEntry = Object.entries(makeEntry[1]).find(
    ([knownModel]) => knownModel.toLowerCase() === model.trim().toLowerCase(),
  );
  return modelEntry?.[1] ?? [];
}
