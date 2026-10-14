/**
 * Every staff tool Enyo may use. All of them are offered to the model for
 * every person: each tool refuses on its own (NOT_PERMITTED-style) when the
 * person lacks the right, so a technician asking for profit gets a kind
 * refusal while Finance gets the figure. A tool never widens access — it runs
 * the module's own authorised code as the signed-in person.
 *
 * Other workstreams add their own `tools/<area>.ts` files; the lead adds
 * their imports here at merge.
 */
import type { StaffTool } from '../types';
import { guideTools } from './guide';
import { workTools } from './work';
import { recordTools } from './records';
import { storeTools } from './store';
import { businessTools } from './business';
import { aftercareTools } from './aftercare';
import { personalTools } from './personal';
import { draftTools } from './drafts';

export function staffTools(): StaffTool[] {
  return [
    ...guideTools,
    ...workTools,
    ...recordTools,
    ...storeTools,
    ...businessTools,
    ...aftercareTools,
    ...personalTools,
    ...draftTools,
  ];
}
