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
