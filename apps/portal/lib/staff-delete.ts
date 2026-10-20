/**
 * Deleting a staff account for good — for a test account or one created by
 * mistake, so its email can be used again. Allowed only when the person has
 * no work on record: every row that would lose "who did this" blocks it (a
 * real employee is switched off instead, and their history keeps its name).
 *
 * The check asks the database itself for every foreign key that points at
 * the users table, so a table added later is covered without anyone
 * remembering to list it here. Personal things go with the account: sign-in, sessions, roles,
 * employee profile, notification state, reminders they own, their Enyo
 * conversations and memory, their mailbox and writing samples, team
 * memberships. The audit log keeps its rows (it is the record), and the
 * deletion itself is written to it with the name and email.
 */
import { prisma } from '@ejo/database';

/** Tables whose rows go with the account (they cascade). */
const PERSONAL_TABLES = new Set(['sessions', 'accounts', 'user_roles', 'employee_profiles', 'notification_reads', 'notification_preferences']);
const SAFE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** Work tables that point at a person without a foreign key. */
const PLAIN_WORK: { model: string; field: string; label: string }[] = [
  { model: 'supportTicket', field: 'senderUserId', label: 'support requests sent' },
  { model: 'supportTicket', field: 'requesterUserId', label: 'support requests raised' },
  { model: 'supportReply', field: 'authorUserId', label: 'support replies' },
  { model: 'supportQueue', field: 'createdById', label: 'support teams set up' },
  { model: 'supportMailbox', field: 'createdById', label: 'support mailboxes set up' },
  { model: 'enyoLearnedAnswer', field: 'createdById', label: 'answers taught to Enyo' },
  { model: 'integrityAlert', field: 'subjectUserId', label: 'integrity alerts about them' },
  { model: 'publicProfile', field: 'createdById', label: 'published people' },
  { model: 'newsPost', field: 'createdById', label: 'news stories' },
];

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const label = (table: string, column: string) => `${table.replace(/_/g, ' ')} (${column.replace(/Id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()})`;

type Delegate = { count: (args: { where: Record<string, unknown> }) => Promise<number> };
const delegate = (model: string): Delegate | null => {
  const d = (prisma as unknown as Record<string, unknown>)[lcFirst(model)];
  return d && typeof (d as Delegate).count === 'function' ? (d as Delegate) : null;
};

/** What this person did that is on record (empty: the account can be deleted). */
export async function workOnRecord(userId: string): Promise<string[]> {
  const found: string[] = [];
  const checks: Promise<void>[] = [];
  // Every foreign key to users, from the database's own catalogue.
  const keys = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT kcu.table_name::text AS table_name, kcu.column_name::text AS column_name
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage ref ON ref.constraint_name = rc.unique_constraint_name AND ref.constraint_schema = rc.unique_constraint_schema
    WHERE ref.table_name = 'users' AND kcu.table_schema = current_schema()`;
  for (const k of keys) {
    if (PERSONAL_TABLES.has(k.table_name) || !SAFE.test(k.table_name) || !SAFE.test(k.column_name)) continue;
    checks.push(
      prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${k.table_name}" WHERE "${k.column_name}" = $1`, userId)
        .then((r) => { const n = Number(r[0]?.n ?? 0); if (n) found.push(`${n} ${label(k.table_name, k.column_name)}`); }),
    );
  }
  for (const w of PLAIN_WORK) {
    const d = delegate(w.model);
    if (d) checks.push(d.count({ where: { [w.field]: userId } }).then((n) => { if (n) found.push(`${n} ${w.label}`); }).catch(() => undefined));
  }
  // Reminders they set for someone else are work; their own are personal.
  checks.push(prisma.reminder.count({ where: { createdById: userId, ownerId: { not: userId } } }).then((n) => { if (n) found.push(`${n} reminders set for colleagues`); }));
  await Promise.all(checks);
  return found.sort();
}

/** Removes the account and everything personal to it, in one transaction. The caller has checked the rules. */
export async function deleteAccountAndPersonal(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.enyoConversation.deleteMany({ where: { userId } }); // messages cascade
    await tx.enyoMemory.deleteMany({ where: { userId } });
    await tx.reminder.deleteMany({ where: { ownerId: userId } });
    await tx.reminderDelegate.deleteMany({ where: { OR: [{ ownerId: userId }, { delegateId: userId }] } });
    await tx.mailStyleSample.deleteMany({ where: { userId } });
    await tx.mailAccount.deleteMany({ where: { userId } }); // its messages cascade
    await tx.supportQueueMember.deleteMany({ where: { userId } });
    // Sessions, sign-in, roles, employee profile and notification state cascade with the user.
    await tx.user.delete({ where: { id: userId } });
  });
}
