/** Data Exchange — the downloadable templates for each kind of record. Pure. */
import { toCsv } from '../hq-core';
import { ENTITIES, type EntityKey } from './fields';
import type { SheetSpec } from './xlsx-writer';

/** The Excel template: a Data sheet (headers, one example row, dropdowns) and an Instructions sheet. */
export function templateSheets(entity: EntityKey, organisationName: string): SheetSpec[] {
  const def = ENTITIES[entity];
  const data: SheetSpec = {
    name: def.label,
    header: true,
    rows: [def.fields.map((f) => f.label), def.fields.map((f) => f.example)],
    widths: def.fields.map((f) => Math.max(f.label.length + 2, f.example.length + 2, 14)),
    lists: def.fields.map((f, column) => (f.choices ? { column, values: f.choices } : null)).filter((x): x is { column: number; values: string[] } => Boolean(x)),
  };
  const help: SheetSpec = {
    name: 'Instructions',
    header: true,
    widths: [34, 12, 70, 60],
    rows: [
      ['Column', 'Required', 'What to put in it', 'Also recognised as (SAP and other names)'],
      ...def.fields.map((f) => [f.label, f.required ? 'Yes' : '', f.help + (f.choices ? ` Choose: ${f.choices.join(' or ')}.` : ''), f.aliases.join(', ')]),
      [],
      [`How to bring ${def.plural} into ${organisationName}`],
      ['1. Fill one row per ' + def.noun + ' on the first sheet (delete the example row). Your own column names and order are fine: they are matched on upload, and SAP exports match themselves.'],
      ['2. In Data Exchange, choose the file. Nothing changes in the system until the file has been checked and a second person has approved it.'],
      ['3. Rows with a problem are listed and can be downloaded as a file to fix in Excel and upload again.'],
      [`4. ${def.label} are recognised by: ${def.matchOrder.join(', then ')}. A ${def.noun} already in the system is never duplicated or overwritten.`],
      ...(def.after ? [[`Load the ${ENTITIES[def.after].plural} file first: each ${def.noun} is linked to its ${ENTITIES[def.after].noun}.`]] : []),
      ['Save as .xlsx or CSV. Workbooks with macros (.xlsm) are not accepted.'],
    ],
  };
  return [data, help];
}

/** The CSV template: the headers and the example row. */
export function templateCsv(entity: EntityKey): string {
  const def = ENTITIES[entity];
  return toCsv(def.fields.map((f) => f.label), [def.fields.map((f) => f.example)]);
}
