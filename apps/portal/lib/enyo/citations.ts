/**
 * Removes the citation marks some models write into answers
 * ("【web_lookup†source】", "【3†L1-L4】", "[web_lookup]"): they mean nothing
 * to a reader, and the sources are shown under the answer. Safe on
 * half-finished (streaming) text: an unclosed 【… at the end stays hidden
 * until it closes. Browser-safe and pure; the engine does the same to the
 * saved answer (packages/enyo/src/guardrails.ts).
 */
export function stripCitationMarks(text: string): string {
  return String(text ?? '')
    // Only citation marks (a † or a tool name inside); 【…】 is also ordinary Chinese punctuation and stays.
    .replace(/\s?【[^】\n]{0,120}(?:†|web_lookup|organisation_info|guide_search)[^】\n]{0,120}】/g, '')
    .replace(/\s?【[^】\n]{0,60}(?:†|web_lookup|organisation_info|guide_search)[^】\n]{0,60}$/g, '')
    .replace(/\s?【(?:web|tool|source|wiki|organi)[a-z_]{0,30}$/g, '')
    .replace(/\s?\[(?:web_lookup|organisation_info|guide_search)[^\]\n]{0,60}\]/g, '');
}
