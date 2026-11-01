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

export type EntityKey = 'customers' | 'vehicles' | 'suppliers' | 'parts' | 'stock' | 'invoices' | 'registers';

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
  /** Who may approve it (on top of the Data Exchange approval permission): the department that owns these records. */
  needs: 'crm.manage' | 'store.parts.manage' | 'workshop.close.approve';
  /** Loads into one branch (its catalogue / stock / sales), chosen when the import starts. */
  branch?: boolean;
  /** Read-only history (v-A3): shown and counted, never edited; undo voids it. */
  history?: boolean;
  /** Finance confirms the totals after loading (opening stock, invoice history). */
  financeSignOff?: boolean;
  /** Who approves, in words. */
  approver: string;
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
    approver: 'a Workshop manager, the Customer care lead or an administrator',
    matchOrder: ['SAP / old system number', 'email', 'phone'],
    fields: [
      { key: 'externalId', label: 'Customer number (SAP or old system)', help: 'The customer number in SAP (business partner / KUNNR) or your old system. Used to recognise the customer again in later files.', aliases: ['KUNNR', 'PARTNER', 'BU_PARTNER', 'SAP / old-system number', 'customer SAP number', 'customer number', 'customer no', 'customer id', 'customer code', 'account number', 'account no', 'debtor', 'debtor number', 'bp number', 'business partner'], example: '1000123' },
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
      { key: 'customerSince', label: 'Customer since', help: 'Optional: when they became a customer — SAP’s creation date of the business partner (ERDAT), e.g. 14.03.2019. Used for “customer since” and the analytics instead of the day of the import.', aliases: ['ERDAT', 'CRDAT', 'customer since', 'created on', 'creation date', 'date created', 'created', 'opened on', 'account opened', 'first purchase', 'since'], example: '14.03.2019' },
    ],
  },
  vehicles: {
    key: 'vehicles',
    label: 'Vehicles',
    noun: 'vehicle',
    plural: 'vehicles',
    description: 'Customers’ vehicles: chassis number (VIN), plate, engine number, make, model, year, mileage — each linked to its customer.',
    needs: 'crm.manage',
    approver: 'a Workshop manager, the Customer care lead or an administrator',
    matchOrder: ['SAP / old system number', 'chassis number (VIN)', 'plate'],
    after: 'customers',
    fields: [
      { key: 'customerExternalId', label: 'Customer number (SAP or old system)', help: 'Whose vehicle it is: the customer number from the customers file. Or give the customer’s email or phone instead.', aliases: ['KUNNR', 'customer SAP number', 'customer number', 'customer no', 'customer id', 'customer code', 'owner number', 'account number', 'bp number', 'business partner'], example: '1000123' },
      { key: 'customerEmail', label: 'Customer email', help: 'Alternative way to find the customer.', aliases: ['customer email', 'owner email', 'email'], example: '' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'owner phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'externalId', label: 'Vehicle number (SAP or old system)', help: 'Optional: the vehicle or equipment number in SAP (EQUNR) or your old system.', aliases: ['EQUNR', 'SAP / old-system number', 'equipment', 'equipment number', 'vehicle id', 'vehicle number', 'asset number', 'fleet number'], example: '' },
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
  suppliers: {
    key: 'suppliers',
    label: 'Suppliers',
    noun: 'supplier',
    plural: 'suppliers',
    description: 'The organisation’s suppliers (SAP vendors): names, vendor numbers, contacts. Shared by every branch; goods receipts link to them.',
    needs: 'store.parts.manage',
    approver: 'a Store manager or an administrator',
    matchOrder: ['SAP / old system number', 'name'],
    fields: [
      { key: 'externalId', label: 'Supplier number (SAP or old system)', help: 'The vendor number in SAP (LIFNR) or your old system.', aliases: ['LIFNR', 'supplier number (SAP)', 'SAP / old-system number', 'vendor', 'vendor number', 'vendor no', 'supplier number', 'supplier no', 'supplier code', 'creditor', 'creditor number'], example: '0000300045' },
      { key: 'name', label: 'Name', help: 'The supplier’s name.', aliases: ['NAME1', 'name', 'supplier', 'supplier name', 'vendor name', 'company'], example: 'Isuzu Motors Africa', required: true },
      { key: 'name2', label: 'Name, second line', help: 'Optional: added after the name (SAP NAME2).', aliases: ['NAME2', 'name 2'], example: '' },
      { key: 'contactName', label: 'Contact person', help: 'Optional.', aliases: ['contact', 'contact person', 'contact name', 'attention'], example: 'Sales desk' },
      { key: 'phone', label: 'Phone', help: 'Optional.', aliases: ['TELF1', 'phone', 'telephone', 'tel', 'mobile'], example: '+27 41 403 9111' },
      { key: 'email', label: 'Email', help: 'Optional.', aliases: ['SMTP_ADDR', 'email', 'e-mail'], example: 'orders@example.com' },
      { key: 'address', label: 'Address', help: 'Optional, one line.', aliases: ['STRAS', 'address', 'street'], example: 'Struandale, Port Elizabeth' },
      { key: 'city', label: 'City', help: 'Optional.', aliases: ['ORT01', 'city', 'town'], example: '' },
      { key: 'taxId', label: 'Tax ID', help: 'Optional (TIN / VAT number).', aliases: ['STCD1', 'STCEG', 'tin', 'tax id', 'vat'], example: '' },
    ],
  },
  parts: {
    key: 'parts',
    label: 'Parts',
    noun: 'part',
    plural: 'parts',
    description: 'The parts catalogue (SAP material master): part numbers, descriptions, units, material groups, tracking, prices, reorder levels — into one branch’s Store.',
    needs: 'store.parts.manage',
    approver: 'a Store manager or an administrator',
    branch: true,
    matchOrder: ['SAP / old system number', 'part number'],
    fields: [
      { key: 'partNumber', label: 'Part number', help: 'The part (material) number — SAP MATNR. Unique in the branch.', aliases: ['MATNR', 'material', 'material number', 'part number', 'part no', 'part code', 'item code', 'item number', 'sku', 'article number'], example: '8-98123456-0', required: true },
      { key: 'name', label: 'Description', help: 'What the part is called — SAP MAKTX.', aliases: ['MAKTX', 'material description', 'description', 'part name', 'name', 'item description', 'short text'], example: 'Brake pad set, front (NQR)', required: true },
      { key: 'category', label: 'Material group / category', help: 'Optional: the SAP material group (MATKL) or your own category.', aliases: ['MATKL', 'material group', 'category', 'product group', 'group'], example: 'BRAKES' },
      { key: 'baseUnit', label: 'Base unit', help: 'The unit stock is counted in — SAP MEINS (ST, EA, PC, L, KG…). Empty: Piece.', aliases: ['MEINS', 'base unit', 'unit', 'uom', 'unit of measure', 'bun'], example: 'ST' },
      { key: 'trackingType', label: 'Tracking', help: 'Quantity, Batch or Serial. SAP batch-managed (XCHPF = X) becomes Batch. Empty: Quantity.', aliases: ['tracking', 'tracking type', 'XCHPF', 'batch managed', 'SERNP', 'serial profile'], example: 'Quantity', choices: ['Quantity', 'Batch', 'Serial'] },
      { key: 'barcode', label: 'Barcode', help: 'Optional — SAP EAN11.', aliases: ['EAN11', 'barcode', 'ean', 'gtin', 'upc'], example: '' },
      { key: 'sellingPrice', label: 'Selling price (₦)', help: 'Optional: the price per base unit.', aliases: ['selling price', 'price', 'list price', 'sales price', 'retail price', 'KBETR', 'VKP'], example: '45000' },
      { key: 'reorderPoint', label: 'Reorder point', help: 'Optional — SAP MINBE.', aliases: ['MINBE', 'reorder point', 'reorder level', 'min stock', 'minimum stock'], example: '4' },
      { key: 'safetyStock', label: 'Safety stock', help: 'Optional — SAP EISBE.', aliases: ['EISBE', 'safety stock', 'buffer stock'], example: '2' },
      { key: 'altUnit', label: 'Alternative unit', help: 'Optional: a unit it also comes in (SAP MEINH), e.g. Carton, Drum.', aliases: ['MEINH', 'alternative unit', 'alt unit', 'pack unit', 'purchase unit'], example: '' },
      { key: 'altFactor', label: 'Base units in the alternative unit', help: 'How many base units one alternative unit holds (SAP UMREZ), e.g. 12.', aliases: ['UMREZ', 'conversion', 'conversion factor', 'pack size', 'units per pack'], example: '' },
      { key: 'externalId', label: 'Number in SAP or the old system', help: 'Optional, when it differs from the part number (e.g. the old material number BISMT). From SAP and left empty: the part number.', aliases: ['BISMT', 'SAP / old-system number', 'old material number', 'old part number', 'legacy number'], example: '' },
    ],
  },
  stock: {
    key: 'stock',
    label: 'Opening stock',
    noun: 'stock line',
    plural: 'stock lines',
    description: 'What each part of one branch’s Store holds at the cut-over, with its cost (SAP stock and valuation). Loaded as opening-balance goods receipts, so stock value, FIFO costs and the inventory analytics include it.',
    needs: 'store.parts.manage',
    approver: 'a Store manager or an administrator, then Finance confirms the totals',
    branch: true,
    financeSignOff: true,
    matchOrder: ['part number'],
    after: 'parts',
    fields: [
      { key: 'partNumber', label: 'Part number', help: 'The part (material) number — SAP MATNR. The part must be in the branch’s catalogue already.', aliases: ['MATNR', 'material', 'material number', 'part number', 'part no', 'item code', 'sku'], example: '8-98123456-0', required: true },
      { key: 'quantity', label: 'Quantity on hand', help: 'Unrestricted stock — SAP LABST — in the unit below.', aliases: ['LABST', 'unrestricted', 'unrestricted stock', 'quantity', 'qty', 'on hand', 'stock', 'quantity on hand', 'closing stock'], example: '12', required: true },
      { key: 'unit', label: 'Unit', help: 'Optional: the unit of the quantity (SAP MEINS). Empty: the part’s base unit.', aliases: ['MEINS', 'unit', 'uom', 'bun'], example: 'ST' },
      { key: 'totalValue', label: 'Stock value (₦)', help: 'The value of this stock — SAP SALK3. Give this or the unit cost.', aliases: ['SALK3', 'stock value', 'total value', 'value', 'valuation', 'amount'], example: '540000' },
      { key: 'unitCost', label: 'Unit cost (₦)', help: 'The cost of one unit — SAP moving average price VERPR (or standard price STPRS). Used when no stock value is given.', aliases: ['VERPR', 'STPRS', 'unit cost', 'cost price', 'cost', 'moving average price', 'standard price', 'price'], example: '45000' },
      { key: 'priceUnit', label: 'Price unit', help: 'SAP PEINH: the number of units the unit cost is for (a cost per 100 has 100 here). Empty: 1.', aliases: ['PEINH', 'price unit', 'per'], example: '' },
      { key: 'batch', label: 'Batch', help: 'SAP CHARG. Needed for batch-tracked parts.', aliases: ['CHARG', 'batch', 'batch number', 'lot', 'lot number'], example: '' },
      { key: 'serials', label: 'Serial numbers', help: 'For serial-tracked parts: one per unit, separated by commas or semicolons.', aliases: ['SERNR', 'serial', 'serials', 'serial numbers', 'serial number'], example: '' },
      { key: 'storageLocation', label: 'Storage location', help: 'Optional — SAP LGORT. Kept on the receipt’s notes.', aliases: ['LGORT', 'storage location', 'sloc', 'location', 'bin'], example: '0001' },
    ],
  },
  invoices: {
    key: 'invoices',
    label: 'Invoice history',
    noun: 'invoice',
    plural: 'invoices',
    description: 'Invoices from SAP before EJO 100 (billing documents or customer line items): date, number, customer, vehicle, amount. Read-only history that counts in each customer’s spend, last visit and the analytics.',
    needs: 'crm.manage',
    approver: 'a Workshop manager, the Customer care lead or an administrator, then Finance confirms the totals',
    branch: true,
    history: true,
    financeSignOff: true,
    matchOrder: ['invoice number'],
    after: 'customers',
    fields: [
      { key: 'invoiceNumber', label: 'Invoice number', help: 'The SAP billing document (VBELN) or accounting document (BELNR). Each invoice is loaded once.', aliases: ['VBELN', 'BELNR', 'invoice number (SAP)', 'invoice number', 'invoice no', 'invoice', 'billing document', 'document number', 'doc no', 'document no', 'reference'], example: '90001234', required: true },
      { key: 'invoiceDate', label: 'Invoice date', help: 'The billing date (SAP FKDAT) or posting date (BUDAT), e.g. 14.03.2023.', aliases: ['FKDAT', 'BUDAT', 'BLDAT', 'invoice date', 'billing date', 'posting date', 'document date', 'date'], example: '14.03.2023', required: true },
      { key: 'customerExternalId', label: 'Customer number (SAP)', help: 'The customer the invoice is for: SAP sold-to (KUNAG), payer (KUNRG) or customer (KUNNR). The customer must be imported first.', aliases: ['KUNAG', 'KUNRG', 'KUNNR', 'customer SAP number', 'customer number', 'customer no', 'customer', 'sold-to', 'sold to party', 'payer', 'account number', 'bp number'], example: '1000123' },
      { key: 'customerPhone', label: 'Customer phone', help: 'Alternative way to find the customer.', aliases: ['customer phone', 'phone', 'telephone', 'mobile'], example: '' },
      { key: 'amount', label: 'Amount (₦)', help: 'The invoice amount in naira: SAP net value (NETWR) — add the tax column below to make it gross — or the line item amount (DMBTR / WRBTR). Negative for a credit note (100- is understood).', aliases: ['NETWR', 'DMBTR', 'WRBTR', 'amount (incl. tax)', 'amount', 'total', 'invoice total', 'invoice amount', 'gross amount', 'net value', 'value'], example: '485000.00', required: true },
      { key: 'tax', label: 'Tax (₦)', help: 'Optional: the tax amount (SAP MWSBK), added to a net amount.', aliases: ['MWSBK', 'MWSTS', 'tax', 'tax amount', 'vat', 'vat amount'], example: '36375.00' },
      { key: 'currency', label: 'Currency', help: 'Optional: SAP WAERK. Only naira (NGN) is loaded.', aliases: ['WAERK', 'WAERS', 'currency', 'curr'], example: 'NGN' },
      { key: 'vin', label: 'Chassis number (VIN)', help: 'Optional: the vehicle the work was on. Links the invoice to the vehicle when it is in the system.', aliases: ['VHVIN', 'VIN', 'chassis', 'chassis number', 'chassis no', 'vehicle', 'frame number'], example: 'JAANLR85EL7100001' },
      { key: 'companyCode', label: 'Company code', help: 'Optional: SAP company code (BUKRS). SAP numbers documents per company code and fiscal year, so give these when the same number can appear twice.', aliases: ['BUKRS', 'company code', 'company', 'cocd'], example: '1000' },
      { key: 'fiscalYear', label: 'Fiscal year', help: 'Optional: SAP fiscal year (GJAHR). Empty: the year of the invoice date.', aliases: ['GJAHR', 'fiscal year', 'fy', 'year'], example: '2023' },
      { key: 'documentType', label: 'Document type', help: 'Optional: SAP billing type (FKART, e.g. F2 invoice, G2 credit) or document type (BLART).', aliases: ['FKART', 'BLART', 'document type', 'billing type', 'doc type', 'type'], example: 'F2' },
      { key: 'description', label: 'Description', help: 'Optional: what the invoice was for.', aliases: ['ARKTX', 'SGTXT', 'BKTXT', 'description', 'text', 'item text', 'narration', 'details'], example: 'Service 40,000 km and brake pads' },
    ],
  },
  registers: {
    key: 'registers',
    label: 'Production, QC and PDI registers',
    noun: 'register entry',
    plural: 'register entries',
    description: 'The plant’s existing Excel registers — production line, quality checks and pre-delivery inspections — one row per vehicle per check: VIN, model, date, result, inspector. Shown as read-only history on each vehicle.',
    needs: 'workshop.close.approve',
    approver: 'a Workshop manager or an administrator',
    history: true,
    matchOrder: ['register, chassis number, date and stage'],
    fields: [
      { key: 'vin', label: 'Chassis number (VIN)', help: 'The vehicle’s 17-character VIN.', aliases: ['VIN', 'VHVIN', 'chassis', 'chassis number', 'chassis no', 'frame number', 'vehicle'], example: 'JAANLR85EL7100001', required: true },
      { key: 'kind', label: 'Register', help: 'Production, QC or PDI. Leave the column out when the whole file is one register: choose it when importing.', aliases: ['register', 'kind', 'check type', 'inspection type', 'type', 'process'], example: 'PDI', choices: ['Production', 'QC', 'PDI'] },
      { key: 'eventDate', label: 'Date', help: 'When the check was done, e.g. 14.03.2024.', aliases: ['date', 'check date', 'inspection date', 'production date', 'pdi date', 'build date', 'date checked', 'date inspected'], example: '14.03.2024', required: true },
      { key: 'model', label: 'Model', help: 'Optional, e.g. NQR, NPR, QLR, QMR, S07.', aliases: ['model', 'vehicle model', 'model name', 'variant'], example: 'NQR' },
      { key: 'stage', label: 'Station / step', help: 'Optional: the line station, QC gate or PDI step, e.g. "Trim 2", "Final inspection", "Road test".', aliases: ['station', 'stage', 'step', 'gate', 'checkpoint', 'operation', 'line station', 'area'], example: 'Final inspection' },
      { key: 'result', label: 'Result', help: 'Pass, Fail or Rework (OK / NG are understood).', aliases: ['result', 'status', 'outcome', 'pass/fail', 'pass fail', 'ok/ng', 'decision'], example: 'Pass', choices: ['Pass', 'Fail', 'Rework'] },
      { key: 'inspector', label: 'Inspector', help: 'Optional: who did the check. Seen by staff only, never by customers.', aliases: ['inspector', 'inspected by', 'checked by', 'qc inspector', 'technician', 'operator', 'signed by'], example: 'A. Bello' },
      { key: 'reference', label: 'Reference', help: 'Optional: the register’s own number (sheet, report or job number).', aliases: ['reference', 'ref', 'report number', 'report no', 'sheet number', 'job number', 'document number'], example: 'PDI-2024-0311' },
      { key: 'notes', label: 'Notes', help: 'Optional: defects found, remarks.', aliases: ['notes', 'remarks', 'comments', 'defects', 'findings', 'observation'], example: 'Door seal replaced before release' },
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[];

/** SAP's unit codes (ISO and German) → the words the Store uses. Anything else is kept as written. */
const SAP_UNITS: Record<string, string> = {
  ST: 'Piece', PC: 'Piece', PCE: 'Piece', EA: 'Each', EACH: 'Each', PCS: 'Piece', NOS: 'Piece', NO: 'Piece',
  L: 'Litre', LTR: 'Litre', LT: 'Litre', ML: 'Millilitre', KG: 'Kilogram', G: 'Gram', M: 'Metre', MTR: 'Metre', CM: 'Centimetre', MM: 'Millimetre',
  SET: 'Set', ST2: 'Set', PAA: 'Pair', PR: 'Pair', PAIR: 'Pair', CAR: 'Carton', CTN: 'Carton', CT: 'Carton', BOX: 'Box', BX: 'Box', DR: 'Drum', DRM: 'Drum',
  KIT: 'Kit', ROL: 'Roll', RL: 'Roll', PAK: 'Pack', PAC: 'Pack', PK: 'Pack', CAN: 'Can', BOT: 'Bottle', BT: 'Bottle', TUB: 'Tube', GAL: 'Gallon',
};
export function unitWord(raw: string): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  return SAP_UNITS[v.toUpperCase()] ?? v.replace(/^./, (c) => c.toUpperCase());
}

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
  if (entity === 'stock' && mapping.totalValue == null && mapping.unitCost == null) out.push('Choose the column for the stock value or the unit cost: stock is valued at what it cost.');
  if (entity === 'invoices' && mapping.customerExternalId == null && mapping.customerPhone == null) out.push('Choose how to find each invoice’s customer: their SAP customer number or phone.');
  if (entity === 'vehicles') {
    if (mapping.customerExternalId == null && mapping.customerEmail == null && mapping.customerPhone == null) out.push('Choose how to find each vehicle’s customer: their customer number, email or phone.');
    if (mapping.chassisNumber == null && mapping.plateNumber == null) out.push('Choose the column for the chassis number (VIN) or the plate.');
  }
  return out;
}
