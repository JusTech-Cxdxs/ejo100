/**
 * Project rules (lib/projects-core.ts): the status machine, delivery progress,
 * what a deliverable may still take, milestone urgency and the "awarded this
 * year" figure. Plus source checks on the actions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canMoveProject, nextProjectStatuses, PROJECT_TRANSITIONS, PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_MOVE_LABEL, PROJECT_KIND_LABEL,
  deliveryProgress, deliveryAllowed, canAcceptDeliverable, milestoneState, awardedThisYear, MILESTONE_DUE_SOON_DAYS,
} from '../lib/projects-core';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.UTC(2026, 9, 18) + days * DAY);

test('TENDER → AWARDED → IN_PROGRESS → DELIVERED → ACCEPTED → CLOSED, or LOST before delivery starts', () => {
  const path = ['TENDER', 'AWARDED', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'CLOSED'] as const;
  for (let i = 0; i < path.length - 1; i++) assert.ok(canMoveProject(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`);
  assert.ok(canMoveProject('TENDER', 'LOST'));
  assert.ok(canMoveProject('AWARDED', 'LOST'));
  assert.ok(!canMoveProject('IN_PROGRESS', 'LOST'), 'a project being delivered is not lost');
  assert.ok(!canMoveProject('TENDER', 'IN_PROGRESS'), 'no skipping the award');
  assert.ok(!canMoveProject('DELIVERED', 'CLOSED'), 'acceptance comes before closing');
  assert.ok(!canMoveProject('ACCEPTED', 'IN_PROGRESS'), 'no going back');
  assert.deepEqual(nextProjectStatuses('CLOSED'), []);
  assert.deepEqual(nextProjectStatuses('LOST'), []);
  assert.deepEqual(nextProjectStatuses('TENDER'), ['AWARDED', 'LOST']);
  for (const s of PROJECT_STATUSES) {
    assert.ok(Array.isArray(PROJECT_TRANSITIONS[s]));
    assert.ok(PROJECT_STATUS_LABEL[s].length > 2 && PROJECT_MOVE_LABEL[s].length > 5);
  }
  assert.equal(Object.keys(PROJECT_KIND_LABEL).length, 4);
});

test('delivery progress: units delivered of units contracted, never over 100%', () => {
  assert.deepEqual(deliveryProgress([]), { ordered: 0, delivered: 0, accepted: 0, percent: 0 });
  assert.deepEqual(deliveryProgress([{ quantity: 100, deliveredQuantity: 40 }, { quantity: 50, deliveredQuantity: 50, acceptedAt: at(-1) }]), { ordered: 150, delivered: 90, accepted: 1, percent: 60 });
  assert.equal(deliveryProgress([{ quantity: 10, deliveredQuantity: 14 }]).percent, 100, 'over-delivery caps at the contracted quantity');
  assert.equal(deliveryProgress([{ quantity: 3, deliveredQuantity: 1 }]).percent, 33);
});

test('a deliverable takes at most what is outstanding, and is accepted only once fully delivered', () => {
  const row = { quantity: 10, deliveredQuantity: 7 };
  assert.ok(deliveryAllowed(row, 3).ok);
  assert.match(deliveryAllowed(row, 4).reason ?? '', /Only 3 units/);
  assert.match(deliveryAllowed({ quantity: 10, deliveredQuantity: 9 }, 2).reason ?? '', /Only 1 unit is/);
  assert.match(deliveryAllowed({ quantity: 10, deliveredQuantity: 10 }, 1).reason ?? '', /already been delivered/);
  assert.ok(!deliveryAllowed(row, 0).ok && !deliveryAllowed(row, 1.5).ok && !deliveryAllowed(row, -1).ok);
  assert.ok(!canAcceptDeliverable(row));
  assert.ok(canAcceptDeliverable({ quantity: 10, deliveredQuantity: 10 }));
  assert.ok(!canAcceptDeliverable({ quantity: 10, deliveredQuantity: 10, acceptedAt: at(0) }), 'not twice');
  assert.ok(!canAcceptDeliverable({ quantity: 0, deliveredQuantity: 0 }));
});

test('milestones: done, overdue, due soon (7 days), upcoming, undated', () => {
  const now = at(0);
  assert.equal(milestoneState({ dueDate: at(-3), completedAt: at(-1) }, now), 'DONE');
  assert.equal(milestoneState({ dueDate: at(-1), completedAt: null }, now), 'OVERDUE');
  assert.equal(milestoneState({ dueDate: at(MILESTONE_DUE_SOON_DAYS), completedAt: null }, now), 'DUE_SOON');
  assert.equal(milestoneState({ dueDate: at(MILESTONE_DUE_SOON_DAYS + 1), completedAt: null }, now), 'UPCOMING');
  assert.equal(milestoneState({ dueDate: null, completedAt: null }, now), 'UNDATED');
  assert.equal(milestoneState({ dueDate: at(-1).toISOString(), completedAt: null }, now), 'OVERDUE', 'string dates');
});

test('contract value awarded this year counts awarded-or-beyond projects by start date (else creation)', () => {
  const y0 = new Date('2026-01-01T00:00:00+01:00');
  const y1 = new Date('2027-01-01T00:00:00+01:00');
  const rows = [
    { status: 'AWARDED', contractValue: '1000000.50', startDate: new Date('2026-03-01'), createdAt: new Date('2025-12-01') },
    { status: 'TENDER', contractValue: 5000000, startDate: new Date('2026-03-01'), createdAt: new Date('2026-02-01') }, // not awarded
    { status: 'CLOSED', contractValue: 250, startDate: null, createdAt: new Date('2026-06-01') }, // by creation
    { status: 'IN_PROGRESS', contractValue: 99, startDate: new Date('2025-11-01'), createdAt: new Date('2025-10-01') }, // last year
    { status: 'LOST', contractValue: 777, startDate: new Date('2026-05-01'), createdAt: new Date('2026-05-01') },
  ];
  assert.equal(awardedThisYear(rows, y0, y1), 1000250.5);
});

test('the actions: organisation-fenced, compare-and-set on status and quantities, PRJ numbering, acceptance needs every deliverable', () => {
  const src = read('lib/actions/projects.ts');
  assert.match(src, /nextDocumentNumber\('PRJ'/);
  assert.match(src, /project\.updateMany\(\{ where: \{ id: projectId, status: project\.status as ProjectStatus \}, data: \{ status: target \} \}/);
  assert.match(src, /projectDeliverable\.updateMany\(\{ where: \{ id: deliverableId, deliveredQuantity: d\.deliveredQuantity \}/);
  assert.match(src, /projectMilestone\.updateMany\(\{ where: \{ id: milestoneId, completedAt: null \}/);
  assert.match(src, /projectDeliverable\.updateMany\(\{ where: \{ id: deliverableId, acceptedAt: null \}/);
  assert.match(src, /if \(target === 'ACCEPTED'\) \{[\s\S]{0,200}acceptedAt: null/);
  assert.doesNotMatch(src, /project\.update\(\{[^}]*data: \{[^}]*status/, 'no plain status update');
  for (const fn of ['createProject', 'addProjectMilestone', 'completeProjectMilestone', 'addProjectDeliverable', 'recordProjectDelivery', 'acceptProjectDeliverable', 'moveProjectStatus', 'updateProjectDetails']) {
    assert.match(src, new RegExp(`export async function ${fn}\\([\\s\\S]{0,700}authorize\\('projects\\.manage'`), `${fn} needs projects.manage`);
  }
  assert.match(src, /id: `project-milestone-\$\{m\.id\}`/);
  assert.match(src, /managerId: user\.id, status: \{ in: PROJECT_LIVE_STATUSES \}/, 'dashboard items are the manager\'s own live projects');
  const page = read('app/(app)/projects/[id]/page.tsx');
  for (const href of ['/sales/quotations/${q.id}', '/sales/orders/${o.id}', '/production/build-orders/${b.id}']) assert.ok(page.includes(href), href);
});
