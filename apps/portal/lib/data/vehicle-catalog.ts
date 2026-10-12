/**
 * Make and model suggestions for vehicle registration, split by the
 * Workshop's Passenger and Commercial sections. Suggestions only: Make and
 * Model are free text (see VehicleMakeModelPicker).
 *
 * Models for SOUEAST, Isuzu (N/Q/F series) and Foton (Tunland/View/TM3)
 * come from the workshop. For other brands, common current models are listed.
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
 * Engine suggestions per make and model, only where the engine is known
 * (Foton Tunland/TM3, Isuzu N/Q series). The engine is the key for parts
 * fitment: different models can share one (Isuzu NPR and NQR both use the
 * 4HK1), and one model name can hide different engines (Tunland diesel vs
 * petrol). Engine stays free text.
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

/** Case-insensitive (Make is free text). Empty array for an unknown make. */
export function getModelsForMake(category: VehicleCategory, make: string): string[] {
  const entry = Object.entries(VEHICLE_CATALOG[category]).find(
    ([knownMake]) => knownMake.toLowerCase() === make.trim().toLowerCase(),
  );
  return entry?.[1] ?? [];
}

/** Case-insensitive; empty array when no suggestion is known. */
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
