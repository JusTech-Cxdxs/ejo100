import 'server-only';
import { prisma } from '@ejo/database';
import { SCHEMA_MARKERS, schemaVerdict, type SchemaVerdict } from './schema-health-core';

/**
 * Is the production database on the schema this code expects? Reads the
 * database's own catalogue (information_schema) for one marker column per
 * schema version, newest last. Answers only names (never data), and never
 * throws: a database that cannot be read reports "unknown".
 */
export async function schemaHealth(): Promise<SchemaVerdict> {
  try {
    const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${[...new Set(SCHEMA_MARKERS.map((m) => m.table))]})`;
    return schemaVerdict(new Set(rows.map((r) => `${r.table_name}.${r.column_name}`)));
  } catch {
    return { state: 'unknown', expected: SCHEMA_MARKERS[SCHEMA_MARKERS.length - 1]!.version, at: null, missing: [] };
  }
}
