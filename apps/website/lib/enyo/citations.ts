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
    .replace(/\s?【[^】\n]{0,120}】/g, '')
    .replace(/\s?【[^】\n]{0,120}$/g, '')
    .replace(/\s?\[(?:web_lookup|organisation_info|guide_search)[^\]\n]{0,60}\]/g, '');
}
