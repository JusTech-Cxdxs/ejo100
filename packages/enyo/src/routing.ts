import type { LlmConfig } from './config';

/**
 * Which model answers a turn, to keep cost down without losing quality:
 *  - "fast" (ENYO_LLM_FAST_MODEL) for small talk, thanks and greetings, and
 *    for short "how do I…" questions the guide answers;
 *  - "main" (ENYO_LLM_MODEL) for everything that reads records, adds up,
 *    compares or reasons over several steps, and whenever in doubt.
 * ENYO_LLM_ROUTING=off sends everything to the main model.
 */
export type Route = { model: string; tier: 'fast' | 'main'; reason: string };

const SMALL_TALK = /^(hi+|hello+|hey+|hiya|good (morning|afternoon|evening|night)|morning|afternoon|evening|thanks?( you)?( so much)?|thank u|ok(ay)?|alright|cool|great|nice|bye|goodbye|see you|how are you( doing)?|how('?s| is) (it going|your day)|who are you|what('?s| is) your name|what can you do|are you there|lol|haha|wow)\b[\s!.,?🙂😊😀👍]*$/i;
const GUIDE = /^(how (do|can|should) (i|we)|where (do|can) i|how to|what are the steps|walk me through|show me how|teach me|explain how)\b/i;
const NEEDS_RECORDS = /\b(JC|SV|EPR|PRS|GRN|RF|WR|WC|VIS|EP|VX|RT|INC|DLV|CTR|APT|BC)-\d|\b(how (much|many)|count|total|revenue|takings|profit|margin|owe[sd]?|balance|stock|price|cost|report|compare|analy[sz]e|forecast|summar(y|ise|ize)|waiting|pending|overdue|late|which (customer|client|job|vehicle|invoice|estimate|part|technician)s?|assigned|plate number|reg(istration)? number|this|that|it|my|mine|me|our)\b/i;

export function routeModel(message: string, config: LlmConfig, env: Record<string, string | undefined> = process.env): Route {
  const main: Route = { model: config.model, tier: 'main', reason: 'default' };
  if ((env.ENYO_LLM_ROUTING ?? '').trim().toLowerCase() === 'off' || !config.fastModel || config.fastModel === config.model) return main;
  const m = message.trim();
  if (NEEDS_RECORDS.test(m)) return { ...main, reason: 'records or figures' };
  if (m.length <= 120 && SMALL_TALK.test(m)) return { model: config.fastModel, tier: 'fast', reason: 'small talk' };
  if (m.length <= 200 && GUIDE.test(m)) return { model: config.fastModel, tier: 'fast', reason: 'how-to' };
  return main;
}
