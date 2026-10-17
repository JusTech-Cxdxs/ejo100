/**
 * Every staff tool Enyo may use. All of them are offered to the model for
 * every person: each tool refuses on its own (NOT_PERMITTED-style) when the
 * person lacks the right, so a technician asking for profit gets a kind
 * refusal while Finance gets the figure. A tool never widens access — it runs
 * the module's own authorised code as the signed-in person.
 *
 * Each area keeps its tools in its own `tools/<area>.ts` file; every file in
 * this folder must be imported here (a unit test checks it).
 *
 * General knowledge comes from the shared web look-up (Wikipedia, plus a
 * general search engine when a key is set; read only, nothing from the
 * records is sent); ENYO_WEB_LOOKUP=off removes it.
 */
import { webLookupEnabled, webLookupTool } from '@ejo/enyo';
import type { StaffCtx, StaffTool } from '../types';
import { selectToolNames, slimToolNames } from '../tool-select';
import { guideTools } from './guide';
import { workTools } from './work';
import { recordTools } from './records';
import { storeTools } from './store';
import { businessTools } from './business';
import { aftercareTools } from './aftercare';
import { personalTools } from './personal';
import { draftTools } from './drafts';
import { remindersTools } from './reminders';
import { mailTools } from './mail';
import { workshopTools } from './workshop';
import { learningTools } from './learning';
import { supportTools } from './support';
import { integrityTools } from './integrity';
import { organisationTools } from './organisation';
import { leadershipTools } from './leadership';
import { peopleTools } from './people';

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
    ...remindersTools,
    ...mailTools,
    ...workshopTools,
    ...learningTools,
    ...supportTools,
    ...integrityTools,
    ...organisationTools,
    ...leadershipTools,
    ...peopleTools,
    ...(webLookupEnabled() ? [webLookupTool<StaffCtx>()] : []),
  ];
}

/**
 * The tools offered for one question: the ones it can need (see
 * tool-select.ts), so each request stays small enough for the model server's
 * per-minute budget. `slim` is the smaller set for a second try.
 */
export function staffToolsFor(message: string, previous = ''): { tools: StaffTool[]; slim: StaffTool[] } {
  const all = staffTools();
  const { names, web } = selectToolNames(message, previous);
  const pick = (ns: string[]) => all.filter((t) => ns.includes(t.name));
  const webTool = web ? all.filter((t) => !names.includes(t.name) && /web/i.test(t.name)) : [];
  return { tools: [...pick(names), ...webTool], slim: pick(slimToolNames(message)) };
}
