"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_MARKERS = void 0;
exports.schemaVerdict = schemaVerdict;
/**
 * The schema versions this code expects (pure, tested), each with one column
 * that only exists from that version on. The deploy (Render: predeploy SQL →
 * prisma db push → postdeploy SQL) adds them; System health shows whether it
 * did, so a deploy that stopped half-way is seen at once, not through errors.
 */
exports.SCHEMA_MARKERS = [
    { version: 'v36', table: 'support_tickets', column: 'token', what: 'Support centre (requests, teams, targets)' },
    { version: 'v37', table: 'support_tickets', column: 'requesterUserId', what: 'Get help, Enyo reply checks, integrity watch' },
    { version: 'v38', table: 'public_profiles', column: 'name', what: 'People we publish, automatic public holidays' },
    { version: 'v38', table: 'support_settings', column: 'holidayCalendar', what: 'Automatic public holidays' },
    { version: 'v39', table: 'support_queues', column: 'ackMessage', what: "Each team's own automatic-reply text" },
    { version: 'v39', table: 'support_queue_members', column: 'isLead', what: 'Team leads (told when nobody is free or a request is late)' },
    { version: 'v40', table: 'site_visits', column: 'visitorHash', what: 'Website visitor report (visitors, pages, time on page)' },
];
function schemaVerdict(columns) {
    const expected = exports.SCHEMA_MARKERS[exports.SCHEMA_MARKERS.length - 1].version;
    const missing = exports.SCHEMA_MARKERS.filter((m) => !columns.has(`${m.table}.${m.column}`)).map((m) => ({ version: m.version, what: m.what, column: `${m.table}.${m.column}` }));
    const present = exports.SCHEMA_MARKERS.filter((m) => columns.has(`${m.table}.${m.column}`));
    const firstMissing = exports.SCHEMA_MARKERS.findIndex((m) => !columns.has(`${m.table}.${m.column}`));
    const at = firstMissing === -1 ? expected : firstMissing === 0 ? (present.length ? null : 'older than v36') : exports.SCHEMA_MARKERS[firstMissing - 1].version;
    return { state: missing.length ? 'behind' : 'current', expected, at, missing };
}
