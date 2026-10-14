/**
 * Enyo tools — reminders. Reading runs the normal, authorised readers as the
 * signed-in person; drafting only fills in /reminders/new (validated there
 * again) — the person presses Save. Server-only.
 */
import { draftResult, type StaffTool } from '../types';
import { getReminderFormOptions, listMyReminders } from '@/lib/actions/reminders';
import { globalSearch } from '@/lib/actions/search';
import {
  formatLagos, lagosLocalInput, parseLagosLocal, plural, reminderPrefillHref, REMINDER_RECORD_LABEL, validateReminder,
  type ReminderPrefill, type ReminderRecordType,
} from '@/lib/reminders-rules';
import { REFERENCE_TYPES } from '@/lib/search-plan';

const PAGE_RECORD: [RegExp, ReminderRecordType][] = [
  [/^\/workshop\/job-cards\/([A-Za-z0-9_-]{8,64})/, 'JobCard'],
  [/^\/workshop\/vehicle-service\/([A-Za-z0-9_-]{8,64})/, 'VehicleService'],
  [/^\/crm\/customers\/([A-Za-z0-9_-]{8,64})/, 'Customer'],
  [/^\/workshop\/vehicles\/([A-Za-z0-9_-]{8,64})/, 'CustomerVehicle'],
  [/^\/inventory\/parts\/([A-Za-z0-9_-]{8,64})/, 'Part'],
  [/^\/warranty\/claims\/([A-Za-z0-9_-]{8,64})/, 'WarrantyClaim'],
  [/^\/warranty\/(?!claims|policies|providers|analytics)([A-Za-z0-9_-]{8,64})/, 'Warranty'],
  [/^\/workshop\/parts-requests\/([A-Za-z0-9_-]{8,64})/, 'PartRequestSlip'],
  [/^\/workshop\/external-procurement\/([A-Za-z0-9_-]{8,64})/, 'ExternalProcurementRequest'],
  [/^\/schedule\/([A-Za-z0-9_-]{8,64})$/, 'Appointment'],
];

/** "JC-2026-000012" → the record, when the person can open it (the search applies their reach). */
async function recordFromReference(ref: string): Promise<{ type: ReminderRecordType; id: string } | null> {
  const value = ref.trim().toUpperCase();
  const prefix = value.split('-')[0];
  const t = REFERENCE_TYPES.find((x) => x.prefix === prefix);
  if (!t || !(['JobCard', 'VehicleService', 'PartRequestSlip', 'ExternalProcurementRequest', 'Warranty', 'WarrantyClaim', 'Appointment'] as string[]).includes(t.model)) return null;
  for (const g of await globalSearch(value)) {
    const hit = g.hits.find((h) => h.label === value);
    const id = hit?.href.split('?')[0]!.split('/').pop();
    if (hit && id) return { type: t.model as ReminderRecordType, id };
  }
  return null;
}

export const remindersTools: StaffTool[] = [
  {
    name: 'my_reminders',
    kind: 'read',
    status: 'Checking your reminders…',
    description: "The person's own reminders: what is due now (or overdue) and what is coming up, with links. Use for \"what are my reminders\", \"what did I need to do today\".",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const { overdue, upcoming } = await listMyReminders();
      const row = (r: (typeof overdue)[number]) => ({
        title: r.title,
        due: `${formatLagos(r.dueAt)} (Lagos)`,
        ...(r.record ? { about: r.record.label, ...(r.record.url ? { aboutLink: r.record.url } : {}) } : {}),
        ...(r.setBy ? { setBy: r.setBy } : {}),
        link: `/reminders?focus=${r.id}#r-${r.id}`,
      });
      return {
        ok: true,
        data: {
          summary: `${plural(overdue.length, 'reminder')} due now, ${plural(upcoming.length, 'upcoming reminder')}.`,
          dueNow: overdue.slice(0, 15).map(row),
          upcoming: upcoming.slice(0, 15).map(row),
          page: '/reminders',
        },
        sources: [{ label: 'Reminders', href: '/reminders' }],
      };
    },
  },
  {
    name: 'draft_reminder',
    kind: 'draft',
    status: 'Preparing the reminder…',
    description: 'Prepare a reminder for the person (or for a colleague who has allowed them) — it opens the New reminder form filled in; the person checks it and presses Save. Nothing is saved by this tool. Work out the time yourself from what they said ("tomorrow at 10", "in 2 hours", "Friday morning" = 9:00) using today\'s date and time in Lagos, and pass it as an ISO date-time with the Lagos offset, e.g. 2026-10-15T10:00:00+01:00. Use for_person only when they ask to remind someone else (their name as they said it). Use reference for a record number they mention (JC-…, SV-…, WC-…), or about_this_page when they say "this job" / "this customer" while on that page.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What to remember, short and clear: "Call Mr Okafor about the estimate".', maxLength: 160, minLength: 2 },
        due_at: { type: 'string', format: 'date-time', description: 'When, as ISO date-time with the Lagos offset (+01:00). Must be in the future.' },
        notes: { type: 'string', description: 'Optional extra detail.', maxLength: 1000 },
        for_person: { type: 'string', description: 'Only to remind a colleague: their name.', maxLength: 120 },
        reference: { type: 'string', description: 'A record number the reminder is about, e.g. JC-2026-000012.', maxLength: 40 },
        about_this_page: { type: 'boolean', description: 'True when the reminder is about the record on the page the person has open.' },
      },
      required: ['title', 'due_at'],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const due = parseLagosLocal(String(args.due_at ?? ''));
      const v = validateReminder({ title: args.title, notes: args.notes, dueAt: due ?? 'invalid' });
      if (!v.ok) return { ok: false, message: `${v.message} Ask the person for a clear date and time.` };
      const prefill: ReminderPrefill = { title: v.value.title, dueAt: lagosLocalInput(v.value.dueAt), ...(v.value.notes ? { notes: v.value.notes } : {}) };
      const lines = [v.value.title, `When: ${formatLagos(v.value.dueAt)} (Lagos time)`];
      // For a colleague: only someone who has allowed this person.
      const forName = typeof args.for_person === 'string' ? args.for_person.trim() : '';
      if (forName) {
        const { me, owners } = await getReminderFormOptions();
        const want = forName.toLowerCase();
        if (!['me', 'myself', me.fullName.toLowerCase()].includes(want)) {
          const matches = owners.filter((o) => o.fullName.toLowerCase().includes(want) || want.includes(o.fullName.toLowerCase()));
          if (matches.length === 0) {
            return { ok: false, refused: true, message: `${forName} has not allowed this person to set reminders for them (or is not a colleague in their organisation). Explain that ${forName} can allow it on their own Reminders page under "Who may set reminders for me", and offer to set the reminder for the person themselves instead.` };
          }
          if (matches.length > 1) return { ok: false, message: `More than one colleague matches "${forName}": ${matches.map((m) => m.fullName).join(', ')}. Ask which one.` };
          prefill.forUserId = matches[0]!.id;
          lines.push(`For: ${matches[0]!.fullName}`);
        }
      }
      // What it is about: a reference number, or the record on the open page (the form checks reach again).
      let record: { type: ReminderRecordType; id: string } | null = null;
      if (typeof args.reference === 'string' && args.reference.trim()) {
        record = await recordFromReference(args.reference);
        if (!record) return { ok: false, message: `${args.reference} was not found among the records this person can open. Prepare the reminder without it, or ask them to check the number.` };
        lines.push(`About: ${args.reference.trim().toUpperCase()}`);
      } else if (args.about_this_page === true && ctx.page) {
        for (const [re, type] of PAGE_RECORD) {
          const m = re.exec(ctx.page);
          if (m) { record = { type, id: m[1]! }; lines.push(`About: this ${REMINDER_RECORD_LABEL[type]}`); break; }
        }
      }
      if (record) { prefill.recordType = record.type; prefill.recordId = record.id; }
      if (v.value.notes) lines.push(`Notes: ${v.value.notes.slice(0, 200)}`);
      const href = `${reminderPrefillHref(prefill)}${reminderPrefillHref(prefill).includes('?') ? '&' : '?'}source=enyo`;
      return draftResult({ kind: 'reminder', title: 'Reminder ready to save', lines, href, confirmLabel: 'Review and save' });
    },
  },
];
