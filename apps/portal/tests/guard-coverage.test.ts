/**
 * Every server action that CHANGES data must pass a permission check —
 * the catalogue (authorize / authorizeOn… / allows) or a workflow helper
 * that checks assignment and records refusals (refuse / require…). This
 * reads the source, so a new unguarded action fails CI before it ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'lib', 'actions');
const GUARDS = [
  'authorize', 'authorizeOn', 'allows(', 'refuse(', 'branchWithinReach', 'requireStoreStaff', 'requireEligible', 'requireJobCardApprover',
  'requireAssignedTechnician', 'requireEstimateContributor', 'requireJobCardCreatorOrSupervisor', 'requireMasterAdmin', 'requireAssignedVehicleServiceTechnician',
  'requireVehicleServiceStepRole', 'requireServiceEstimateContributor', 'requireWarrantyStaff', 'requireWarrantyApprover', 'requireStaff(', 'requireApprover(',
  'requireGate', 'requireFrontDesk', 'requireChief', 'requireBroadcaster', 'requireBookFor', 'loadForChange', 'loadForGroups', 'canDecide', 'isStore(',
  'currentUserIsMasterAdmin', 'isSuperAdmin', 'getWarrantyRoles', 'getSecurityRoles',
  // Support centre set-up (lib/actions/support-admin.ts): authorize('support.manage') + the person's own organisation.
  'supportOrg(',
  // Integrity watch (lib/actions/integrity.ts): authorize('integrity.review') + the reviewer's own organisation, never alerts about themselves.
  'integrityReviewer(',
  // People the organisation publishes (lib/actions/public-profiles.ts): authorize('admin.organisation.manage') + the person's own organisation.
  'profileOrg(',
];
/** Acting only on the person's OWN data (their read marks, their passes) — checked inside by user id. */
const SELF_SCOPED = new Set(['markNotificationsRead', 'markNotificationsUnread', 'markAllRead', 'setNotificationsMuted', 'cancelExitPass', 'createExitPass', 'getJobCardSourcingNeeds',
  // Enyo: the person's own conversations, ratings and remembered facts (by user id and organisation).
  'renameEnyoConversation', 'deleteEnyoConversation', 'rateEnyoMessage', 'deleteEnyoMemory',
  // Reminders (lib/actions/reminders.ts): the owner's own reminders (ownReminder: owner + organisation), and
  // for a colleague only with that colleague's own grant (mayCreateFor); delegates are the owner's own list.
  'createReminder', 'updateReminder', 'completeReminder', 'cancelReminder', 'snoozeReminder', 'grantReminderDelegate', 'withdrawReminderDelegate',
  // Work mailbox (lib/actions/mail.ts): only the signed-in person's own mailbox (myMailbox: user id + organisation),
  // refused during assisted sessions; no permission can open another person's mail.
  'connectMailbox', 'setMailConsent', 'disconnectMailbox', 'readMyMessage', 'setMyMessageFlags',
  // sendMyMail keeps the sender's OWN writing sample (by their user id), only with their mail consent.
  'sendMyMail',
  // Get help (lib/actions/help.ts): the signed-in person's own requests only (requesterUserId + organisation),
  // refused during assisted sessions.
  'openHelpRequest', 'replyToMyHelpRequest', 'answerMyHelpRequest',
  // Speak up (lib/actions/integrity.ts): anyone raises a concern as themselves (or anonymously) into their own organisation.
  'speakUp',
]);
const WRITE = /\b(?:prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

test('every data-changing server action is guarded', () => {
  const missing: string[] = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.ts') && !n.includes('form-handlers'))) {
    const src = readFileSync(join(DIR, f), 'utf8');
    if (!src.slice(0, 300).includes("'use server'")) continue;
    for (const part of src.split('\nexport async function ').slice(1)) {
      const name = part.slice(0, part.indexOf('('));
      const end = part.indexOf('\nexport ');
      const body = end === -1 ? part : part.slice(0, end);
      if (!WRITE.test(body) || SELF_SCOPED.has(name)) continue;
      if (!GUARDS.some((g) => body.includes(g))) missing.push(`${f}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], `Unguarded actions:\n${missing.join('\n')}`);
});

/** Reads of organisation-owned data must be fenced to the organisation. */
test('organisation-owned lists and lookups carry the organisation fence', () => {
  const must: Record<string, string[]> = {
    'workshop.ts': ['listCustomers', 'searchCustomers', 'listRecentCustomers', 'listVehiclesForCustomer', 'listAllVehicles', 'getVehicle', 'listTechnicianCandidates'],
    'warranty.ts': ['listWarrantyProviders', 'getWarrantyProvider', 'searchWarrantyProviderOptions', 'listWarrantyPolicies', 'getWarrantyPolicy', 'searchPartWarrantyPolicyOptions', 'listWarranties', 'listWarrantiesFor', 'getWarranty', 'getWarrantyDashboardItems', 'listWarrantyIdsWithReminderDue'],
    'warranty-claims.ts': ['listWarrantyClaims', 'getWarrantyClaim', 'getWarrantyClaimDashboardItems'],
    'audit-logs.ts': ['getAuditLogPage', 'listAuditUsers'],
    'security.ts': ['listActiveStaff', 'searchStaffOptions'],
    'crm.ts': ['getCrmHub', 'searchCrmCustomers', 'getCustomerNames', 'getCustomer360'],
    'error-log.ts': ['getErrorLogPage'],
  };
  const missing: string[] = [];
  for (const [f, fns] of Object.entries(must)) {
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const fn of fns) {
      const i = src.indexOf(`export async function ${fn}(`);
      if (i === -1) { missing.push(`${f}: ${fn} (not found)`); continue; }
      const end = src.indexOf('\nexport ', i + 10);
      const body = src.slice(i, end === -1 ? undefined : end);
      if (!/orgWhere\(|orgOwned\(/.test(body)) missing.push(`${f}: ${fn}`);
    }
  }
  assert.deepEqual(missing, [], `Not fenced to the organisation:\n${missing.join('\n')}`);
});
