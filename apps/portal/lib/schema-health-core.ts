/**
 * The schema versions this code expects (pure, tested), each with one column
 * that only exists from that version on. The deploy (Render: predeploy SQL →
 * prisma db push → postdeploy SQL) adds them; System health shows whether it
 * did, so a deploy that stopped half-way is seen at once, not through errors.
 */
export const SCHEMA_MARKERS: { version: string; table: string; column: string; what: string }[] = [
  { version: 'v36', table: 'support_tickets', column: 'token', what: 'Support centre (requests, teams, targets)' },
  { version: 'v37', table: 'support_tickets', column: 'requesterUserId', what: 'Get help, Enyo reply checks, integrity watch' },
  { version: 'v38', table: 'public_profiles', column: 'name', what: 'People we publish, automatic public holidays' },
  { version: 'v38', table: 'support_settings', column: 'holidayCalendar', what: 'Automatic public holidays' },
  { version: 'v39', table: 'support_queues', column: 'ackMessage', what: "Each team's own automatic-reply text" },
  { version: 'v39', table: 'support_queue_members', column: 'isLead', what: 'Team leads (told when nobody is free or a request is late)' },
];

export type SchemaVerdict = { state: 'current' | 'behind' | 'unknown'; expected: string; at: string | null; missing: { version: string; what: string; column: string }[] };

export function schemaVerdict(columns: Set<string>): SchemaVerdict {
  const expected = SCHEMA_MARKERS[SCHEMA_MARKERS.length - 1]!.version;
  const missing = SCHEMA_MARKERS.filter((m) => !columns.has(`${m.table}.${m.column}`)).map((m) => ({ version: m.version, what: m.what, column: `${m.table}.${m.column}` }));
  const present = SCHEMA_MARKERS.filter((m) => columns.has(`${m.table}.${m.column}`));
  const firstMissing = SCHEMA_MARKERS.findIndex((m) => !columns.has(`${m.table}.${m.column}`));
  const at = firstMissing === -1 ? expected : firstMissing === 0 ? (present.length ? null : 'older than v36') : SCHEMA_MARKERS[firstMissing - 1]!.version;
  return { state: missing.length ? 'behind' : 'current', expected, at, missing };
}
