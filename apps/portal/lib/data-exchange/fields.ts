/**
 * Data Exchange — what each kind of record looks like in a file. Pure (no
 * database, no framework; relative imports only), shared by the screens, the
 * server actions, the templates and the tests.
 *
 * Every field lists the column names it is recognised by: plain English as
 * people type them in Excel, and the SAP field names a standard SAP export
 * uses (KUNNR, NAME1, TELF1, SMTP_ADDR…), so an SAP extract maps itself.
 * Matching ignores case, spaces, dots, dashes and underscores.
 */

export type EntityKey = 'customers' | 'vehicles';

export type FieldDef = {
  key: string;
  label: string;
  /** What to put in the column (shown on the mapping screen and in the template). */
  help: string;
  /** Column names this field is recognised by (plain names and SAP field names). */
  aliases: string[];
  /** An example value for the template. */
  example: string;
  /** Required for every row; otherwise the row is rejected. */
  required?: boolean;
  /** A short list of accepted values (shown as a dropdown in the Excel template). */
  choices?: string[];
};

export type EntityDef = {
  key: EntityKey;
  label: string;
  /** "customer" / "vehicle", for sentences. */
  noun: string;
  plural: string;
  description: string;
  /** Who may run and approve it (on top of the Data Exchange permissions). */
  needs: 'crm.manage';
  /** In this order, a row is matched to an existing record. */
  matchOrder: string[];
  /** Load this before (e.g. customers before their vehicles). */
  after?: EntityKey;
  fields: FieldDef[];
};

export const ENTITIES: Record<EntityKey, EntityDef> = {
  customers: {
    key: 'customers',
    label: 'Customers',
    noun: 'customer',
    plural: 'customers',
    description: 'People and organisations you serve: names, phone numbers, emails, addresses, SAP customer numbers.',
    needs: 'crm.manage',
    matchOrder: ['SAP / old system number', 'email', 'phone'],
    fields: [
      { key: 'externalId', label: 'Customer number (SAP or old system)', help: 'The customer number in SAP (business partner / KUNNR) or your old system. Used to recognise the customer again in later files.', aliases: ['KUNNR', 'PARTNER', 'BU_PARTNER', 'customer number', 'customer no', 'customer id', 'customer code', 'account number', 'account no', 'debtor', 'debtor number', 'bp number', 'business partner'], example: '1000123' },
      { key: 'fullName', label: 'Name', help: 'The person’s full name, or the organisation’s name.', aliases: ['NAME1', 'NAME_ORG1', 'name', 'full name', 'customer name', 'customer', 'client name', 'client'], example: 'Ada Okafor', required: true },
      { key: 'name2', label: 'Name, second line', help: 'Optional: added after the name (SAP NAME2, e.g. a branch or "Attn" line).', aliases: ['NAME2', 'NAME_ORG2', 'name 2', 'second name', 'name line 2'], example: '' },
      { key: 'customerType', label: 'Type', help: 'Individual or Organisation. Left empty: Organisation when a company name is given, otherwise Individual.', aliases: ['customer type', 'type', 'category', 'customer category', 'BPKIND', 'KTOKD'], example: 'Individual', choices: ['Individual', 'Organisation'] },
      { key: 'companyName', label: 'Company name', help: 'For organisations: the registered company name, if different from the name.', aliases: ['company', 'company name', 'organisation', 'organization', 'organisation name', 'business name', 'employer'], example: '' },
      { key: 'email', label: 'Email', help: 'Optional. Only the customer’s own address: it is how they sign in to the customer portal. Leave empty if there is none — never a made-up one.', aliases: ['SMTP_ADDR', 'email', 'e-mail', 'email address', 'mail', 'e mail'], example: 'ada.okafor@example.ng' },
      { key: 'phone', label: 'Phone', help: 'The main number, e.g. 0803 123 4567 or +234 803 123 4567.', aliases: ['TELF1', 'TEL_NUMBER', 'phone', 'phone number', 'telephone', 'tel', 'mobile', 'mobile number', 'gsm', 'cell', 'contact number'], example: '0803 123 4567' },
      { key: 'altPhone', label: 'Second phone', help: 'Optional second number.', aliases: ['TELF2', 'MOB_NUMBER', 'second phone', 'alt phone', 'alternative phone', 'phone 2', 'mobile 2', 'other phone'], example: '' },
      { key: 'address', label: 'Address', help: 'Street and area, one line (e.g. "Plot 3, Cheesebrough"). Long addresses are kept in full as an extra address.', aliases: ['STRAS', 'STREET', 'address', 'address line 1', 'street', 'street address', 'address 1'], example: 'Plot 3, Cheesebrough Road' },
      { key: 'city', label: 'City', help: 'Optional.', aliases: ['ORT01', 'CITY1', 'city', 'town'], example: 'Lagos' },
      { key: 'state', label: 'State', help: 'Optional.', aliases: ['REGIO', 'REGION', 'state', 'region', 'province'], example: 'Lagos' },
      { key: 'taxId', label: 'Tax ID', help: 'Optional, for organisations (TIN / VAT number).', aliases: ['STCD1', 'STCEG', 'TAXNUM', 'tin', 'tax id', 'tax number', 'vat', 'vat number'], example: '' },
      { key: 'tags', label: 'Tags', help: 'Optional labels separated by commas, e.g. "Fleet, VIP".', aliases: ['tags', 'labels', 'group', 'segment', 'customer group', 'KDGRP'], example: 'Fleet' },
    ],
  },
  vehicles: {
    key: 'vehicles',
    label: 'Vehicles',
    noun: 'vehicle',
    plural: 'vehicles',
    description: 'Customers’ vehicles: chassis number (VIN), plate, engine number, make, model, year, mileage — each linked to its customer.',
    needs: 'crm.manage',
    matchOrder: ['SAP / old system number', 'chassis number (VIN)', 'plate'],
    after: 'customers',
    fields: [
      { key: 'customerExternalId', label: 'Customer number (SAP or old system)', help: 'Whose vehicle it is: the customer number from the customers file. Or give the customer’s email or phone instead.', aliases: ['KUNNR', 'customer number', 'customer no', 'customer id', 'customer code', 'owner number', 'account number', 'bp number', 'business partner'], example: '1000123' },
      { key: 'customerEmail', label: 'Customer email', help: 'Alternative way to find the customer.', aliases: ['customer email', 'owner email', 'email'], example: '' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'owner phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'externalId', label: 'Vehicle number (SAP or old system)', help: 'Optional: the vehicle or equipment number in SAP (EQUNR) or your old system.', aliases: ['EQUNR', 'equipment', 'equipment number', 'vehicle id', 'vehicle number', 'asset number', 'fleet number'], example: '' },
      { key: 'chassisNumber', label: 'Chassis number (VIN)', help: 'The 17-character VIN. A chassis number or a plate is needed for every vehicle.', aliases: ['VIN', 'VHVIN', 'FIN', 'chassis', 'chassis number', 'chassis no', 'vin number', 'frame number'], example: 'JAANLR85EL7100001' },
      { key: 'plateNumber', label: 'Plate number', help: 'The registration plate, e.g. LND 123 AB.', aliases: ['plate', 'plate number', 'plate no', 'registration', 'registration number', 'reg no', 'reg number', 'LICENSE_NUM', 'LICNUM', 'number plate'], example: 'LND 123 AB' },
      { key: 'engineNumber', label: 'Engine number', help: 'Optional.', aliases: ['engine number', 'engine no', 'ENGINE_NO', 'motor number'], example: '4JJ1-123456' },
      { key: 'engineType', label: 'Engine type', help: 'Optional, e.g. 4JJ1, 1.5T petrol.', aliases: ['engine type', 'engine', 'engine model'], example: '4JJ1' },
      { key: 'make', label: 'Make', help: 'e.g. Isuzu, Soueast, Mitsubishi, Foton.', aliases: ['make', 'brand', 'manufacturer', 'MAKE', 'vehicle make'], example: 'Isuzu' },
      { key: 'model', label: 'Model', help: 'e.g. NQR, NPR, QLR, QMR, S07.', aliases: ['model', 'MODEL', 'vehicle model', 'model name', 'model description'], example: 'NQR' },
      { key: 'year', label: 'Year', help: 'Year of manufacture, e.g. 2024.', aliases: ['year', 'model year', 'MODEL_YEAR', 'year of manufacture', 'yom', 'manufacture year'], example: '2024' },
      { key: 'vehicleType', label: 'Passenger or Commercial', help: 'Passenger (cars, SUVs) or Commercial (trucks, buses, vans). Left empty: worked out from the model where it is obvious, otherwise left blank.', aliases: ['vehicle type', 'category', 'vehicle category', 'type', 'segment'], example: 'Commercial', choices: ['Passenger', 'Commercial'] },
      { key: 'mileage', label: 'Mileage (km)', help: 'Last known odometer reading in kilometres.', aliases: ['mileage', 'odometer', 'km', 'kilometres', 'kilometers', 'odometer reading', 'last mileage'], example: '45200' },
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[];

export function isEntityKey(x: unknown): x is EntityKey {
  return typeof x === 'string' && x in ENTITIES;
}

/** "Customer No.", "customer_no", "CUSTOMER-NO" → "customerno". */
export function headerKey(h: string): string {
  return String(h ?? '').toLowerCase().replace(/[\s._\-/\\()#:]+/g, '').replace(/[^a-z0-9]/g, '');
}

export type Mapping = Record<string, number | null>;

/**
 * Which column feeds which field, from the headers alone: an exact field key
 * or label first, then any alias. Each column is used once (first match
 * wins, in the field order above), so "phone" goes to the main phone and
 * not also to the second phone.
 */
export function autoMap(entity: EntityKey, headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const used = new Set<number>();
  const out: Mapping = {};
  for (const f of ENTITIES[entity].fields) {
    const wanted = [f.key, f.label, ...f.aliases].map(headerKey);
    let idx: number | null = null;
    for (const w of wanted) {
      const i = keys.findIndex((k, j) => k === w && !used.has(j));
      if (i >= 0) { idx = i; break; }
    }
    if (idx !== null) used.add(idx);
    out[f.key] = idx;
  }
  return out;
}

/** A saved profile maps by header NAME; turn it into column positions for this file's headers. */
export function mappingFromProfile(entity: EntityKey, profile: Record<string, string>, headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const out: Mapping = {};
  for (const f of ENTITIES[entity].fields) {
    const name = profile[f.key];
    const i = name ? keys.indexOf(headerKey(name)) : -1;
    out[f.key] = i >= 0 ? i : null;
  }
  return out;
}

/** The mapping as header names, for saving as a profile. */
export function profileFromMapping(mapping: Mapping, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, i] of Object.entries(mapping)) if (typeof i === 'number' && headers[i] !== undefined) out[k] = headers[i]!;
  return out;
}

/** A mapping sent from the browser, checked: known fields only, each pointing at a real column, each column used once. */
export function cleanMapping(entity: EntityKey, raw: unknown, columnCount: number): Mapping {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Mapping = {};
  const used = new Set<number>();
  for (const f of ENTITIES[entity].fields) {
    const v = src[f.key];
    const i = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    if (Number.isInteger(i) && i >= 0 && i < columnCount && !used.has(i)) { out[f.key] = i; used.add(i); } else out[f.key] = null;
  }
  return out;
}

/** What is missing before checking can start (a required field, or no way to find a vehicle's customer). */
export function mappingProblems(entity: EntityKey, mapping: Mapping): string[] {
  const out: string[] = [];
  for (const f of ENTITIES[entity].fields) if (f.required && mapping[f.key] == null) out.push(`Choose the column for “${f.label}”.`);
  if (entity === 'vehicles') {
    if (mapping.customerExternalId == null && mapping.customerEmail == null && mapping.customerPhone == null) out.push('Choose how to find each vehicle’s customer: their customer number, email or phone.');
    if (mapping.chassisNumber == null && mapping.plateNumber == null) out.push('Choose the column for the chassis number (VIN) or the plate.');
  }
  return out;
}
