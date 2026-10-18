/** A second freshly opened Job Card, so the approvals scene can be recorded again. */
import { test } from '@playwright/test';
import { signIn } from '../helpers';
import { openJobCard } from '../workflows';
import { PEOPLE } from '../people';
for (const p of PEOPLE) if (p.email === 'supervisor@e2e.test') (p as { name: string }).name = 'Samuel Okafor';
test('job card just opened (noise)', async ({ page }) => {
  await signIn(page, 'funmi.adeyemi@kewalram.com', 'E2e-Test-Pass-2026!');
  await openJobCard(page, { plate: 'ABC-221-EP', customer: 'Lanre Adewale', complaint: 'Knocking noise from the front suspension over bumps', mileage: 61200 });
});
