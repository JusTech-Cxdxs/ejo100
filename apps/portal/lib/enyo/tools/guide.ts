/**
 * How-to guidance from the curated guide (lib/enyo/guide.ts). Only entries
 * whose page the person can open are returned — the same rule as the menu
 * and the page guards (decide() on the person's own principal).
 */
import { getPrincipal } from '@/lib/authz/server';
import { searchGuide } from '../guide';
import { ok } from '../tool-helpers';
import type { StaffTool } from '../types';

export const guideTools: StaffTool[] = [
  {
    name: 'guide_search',
    kind: 'read',
    status: 'Looking in the how-to guide…',
    description:
      'How to do something in the ERP ("how do I record a payment", "where do I register a vehicle"). Returns short numbered steps and the link to the page, only for pages this person can open. youCanDoThis=false means they can see the page but someone else carries the steps out (named in "who"). notYours lists matching topics that belong to other roles.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The question in the person\'s words, e.g. "record a payment".', minLength: 2, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      const principal = await getPrincipal();
      const { results, notYours } = searchGuide(String(args.query), principal);
      if (!results.length) {
        return ok({
          results: [],
          notYours,
          note: notYours.length
            ? 'These topics exist but belong to other roles; say who usually does them and that this person cannot open those pages.'
            : 'No guide entry matches. Say so, and suggest the closest menu area if you are sure of it.',
        });
      }
      return ok({ results, notYours }, results.map((r) => ({ label: r.title, href: r.href })));
    },
  },
];
