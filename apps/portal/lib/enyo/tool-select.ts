/**
 * Which of Enyo's tools to offer the model for one question (pure, tested).
 *
 * Every tool's name, description and input schema is sent with every request,
 * and with forty tools that alone is ~6,000 tokens — more than a free model
 * tier allows per minute, so a simple "hi" was refused ("too many questions").
 * Offering only the tools a question can need keeps each request small and
 * fast; the core set (the guide, my work, records search, the organisation,
 * the staff directory) is always there, and anything unclear gets the
 * broader everyday set.
 */
type Group = { test: RegExp; tools: string[] };

export const CORE_TOOLS = ['guide_search', 'my_work', 'search_records', 'organisation_info', 'staff_directory'];

const GROUPS: Group[] = [
  { test: /\b(JC|SV|EPR|PRS|GRN|RF|WR|WC|VIS|EP|VX|RT|INC|DLV|CTR|APT|BC)-\d|job ?card|vehicle|plate|customer|client|car\b|service|estimate|history|ready|collect/i, tools: ['job_card_details', 'vehicle_service_details', 'customer_profile', 'vehicle_history', 'likely_ready_time'] },
  { test: /brief|today|attention|overview|summary|summari[sz]e|what('?s| is) (on|waiting|left|happening)|to.?do|left to|pending|waiting|status|update|how (is|are) (it|things|we|the)|work (i have|left)/i, tools: ['daily_brief', 'my_pending', 'branch_briefing'] },
  { test: /revenue|takings|profit|sales|money|naira|₦|margin|business|performance|leaderboard|best (tech|person)|compare|branch|month|week|quarter|year|figures|numbers|kpi/i, tools: ['business_summary', 'technician_leaderboard', 'branch_briefing'] },
  { test: /part|stock|inventory|reorder|store|price|goods receipt|supplier/i, tools: ['part_lookup', 'stock_alerts', 'inventory_overview', 'parts_to_reorder'] },
  { test: /warrant|claim|cover(ed)?|due for (a )?service|service due|next service|goodwill/i, tools: ['warranty_watch', 'service_due'] },
  { test: /schedule|calendar|meeting|appointment|book(ing)?|diary/i, tools: ['my_schedule'] },
  { test: /remind/i, tools: ['my_reminders', 'draft_reminder'] },
  { test: /\bmail|e-?mail|inbox|reply to|write (a|to)|draft (a )?(reply|message)/i, tools: ['mail_overview', 'mail_search', 'my_writing_examples', 'draft_mail_reply'] },
  { test: /remember|forget|my name is|call me|note that/i, tools: ['remember_fact', 'forget_fact'] },
  { test: /likely|similar|diagnos|complaint|fault|noise|symptom|what (parts|lines)/i, tools: ['similar_past_jobs', 'likely_estimate_lines', 'complaint_themes'] },
  { test: /open (a )?(new )?job ?card|new job ?card|create (a )?job|draft (a )?job/i, tools: ['draft_job_card'] },
  { test: /support|ticket|SUP-|complain|customer care|help request|hand.?over/i, tools: ['support_overview', 'support_request', 'support_numbers'] },
  { test: /audit|integrity|who (changed|did|approved|deleted|edited)|trail|alert|suspicious|fraud/i, tools: ['integrity_alerts', 'audit_trail'] },
  { test: /error|ref(erence)?\b|\bbug|crash|fail|broken|not working|\bIT\b|sign.?in|log.?in|password|security|visitor|website|traffic|page views?/i, tools: ['explain_error', 'website_traffic', 'my_security'] },
  { test: /who('?s| is| are)|staff|employee|colleague|manager|supervisor|technician|\bhod\b|head of|director|executive|role|team|people|department|works? (in|at)/i, tools: ['staff_directory', 'organisation_info'] },
  { test: /\bmy (recent|last) (activity|actions)|what did i (do|change)/i, tools: ['my_recent_activity'] },
  { test: /\b(website|store|shop|price list|catalogue|offers?|promo|promotion|discount|financing|keystone|refer(ral)?|earn|commission|news|press|story|stories|announcement|soueast|s0[5-9]|tunland|view c2|d-?max|mu-?x|npr|nqr|qlr|qmr|bridgestone|firestone|tyres?)\b/i, tools: ['website_content'] },
];

/** The everyday set when nothing in particular matched. */
const BROAD = ['daily_brief', 'my_pending', 'job_card_details', 'customer_profile', 'my_schedule', 'support_overview'];

/** General knowledge from the web: questions about the world, not the records. */
const WEB = /\bwho (is|was)\b|what (is|are|was) (a|an|the)\b|\bnews\b|\bweather\b|\bdefin(e|ition)\b|\bmeaning of\b|\bhistory of\b|\bwhere is\b|\bcountry\b|\bcompany\b|linkedin/i;

/**
 * The tool names for this question (and the previous one, so a follow-up such
 * as "and last month?" keeps its tools). At most `max`.
 */
export function selectToolNames(message: string, previous = '', max = 16): { names: string[]; web: boolean } {
  const text = `${previous}\n${message}`;
  const picked = new Set<string>(CORE_TOOLS);
  let matched = false;
  for (const g of GROUPS) {
    if (g.test.test(message) || (previous && g.test.test(previous))) { matched = true; for (const t of g.tools) picked.add(t); }
  }
  if (!matched) for (const t of BROAD) picked.add(t);
  return { names: [...picked].slice(0, max), web: WEB.test(text) };
}

/** A smaller set for the second attempt when the model server says the request is too large or too frequent. */
export function slimToolNames(message: string): string[] {
  const { names } = selectToolNames(message, '', 9);
  return names;
}
