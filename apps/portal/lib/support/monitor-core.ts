/**
 * Keeping an eye on Enyo in the Support centre (pure, tested): what a
 * person's check of an Enyo reply records, how a draft fared when a colleague
 * answered, and the "why Enyo could not resolve it" report that turns
 * hand-overs and corrections into things to fix (an answer to approve, a
 * record Enyo could not see, a rule to change).
 */
import { HANDOVER_REASON_LABEL } from './core';
import { TOPIC_LABEL, asTopic } from './ai-core';

/** The tabs of the Enyo replies page. */
export const ENYO_REPLY_FILTERS = ['to_check', 'sent', 'drafts', 'checked', 'wrong'] as const;
export type EnyoReplyFilter = (typeof ENYO_REPLY_FILTERS)[number];

/** A person's verdict on an Enyo reply or draft. */
export const VERDICTS = ['GOOD', 'FIXED', 'WRONG'] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABEL: Record<string, string> = {
  GOOD: 'Good', FIXED: 'Corrected', WRONG: 'Wrong',
  // Set automatically when a colleague answers after a draft.
  USED: 'Draft sent as written', EDITED: 'Draft edited before sending', IGNORED: 'Draft not used',
};

/** Why an Enyo reply was not right (or why it could not answer). */
export const FAILURE_REASONS = ['knowledge_gap', 'wrong_facts', 'missing_records', 'wrong_link', 'should_hand_over', 'needless_hand_over', 'tone', 'language', 'policy', 'other'] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];
export const FAILURE_LABEL: Record<FailureReason, string> = {
  knowledge_gap: 'Nothing approved to answer from (a knowledge gap)',
  wrong_facts: 'Facts were wrong or made up',
  missing_records: 'It needed records it could not see',
  wrong_link: 'Wrong or missing link',
  should_hand_over: 'It should have handed over to a person',
  needless_hand_over: 'It handed over when it could have answered',
  tone: 'Tone or length was off',
  language: 'Wrong language',
  policy: 'Against our policy',
  other: 'Something else',
};

export function asVerdict(v: unknown): Verdict | null {
  return typeof v === 'string' && (VERDICTS as readonly string[]).includes(v) ? (v as Verdict) : null;
}
export function asFailureReason(v: unknown): FailureReason | null {
  return typeof v === 'string' && (FAILURE_REASONS as readonly string[]).includes(v) ? (v as FailureReason) : null;
}

const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));

/** Word overlap (Jaccard) between two texts, 0–1. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / (x.size + y.size - both);
}

/** How a colleague used Enyo's draft. */
export function draftUse(draft: string, sent: string, usedDraft: boolean): 'USED' | 'EDITED' | 'IGNORED' {
  const s = similarity(draft, sent);
  if (s >= 0.8) return 'USED';
  if (usedDraft || s >= 0.35) return 'EDITED';
  return 'IGNORED';
}

// ─────────────────────────────────────────────────────────── the gap report

export type GapRow = { topic: string | null; handoverReason: string | null; reviewReason?: string | null };
export type Gap = { key: string; topic: string; reason: string; reasonLabel: string; count: number; fix: string; href: string };

/** What to do about each kind of gap — so the report says how to make Enyo better, not just what went wrong. */
export function gapFix(reason: string, topicLabel: string): { fix: string; href: string } {
  switch (reason) {
    case 'no_knowledge':
    case 'knowledge_gap':
    case 'low_confidence':
      return { fix: `Write and approve an answer for "${topicLabel}" questions — resolve one of these requests with a clear reply, then approve it on the Enyo learning page.`, href: '/enyo/learning' };
    case 'needs_records':
    case 'missing_records':
      return { fix: 'These needed the customer’s own records. Enyo can use them only when the sender is proven: ask customers to write from the address on file, or through the customer portal.', href: '/settings/support' };
    case 'unverified_sender':
      return { fix: 'The sender’s address could not be proven, so Enyo would not discuss their records. Encourage customers to use the customer portal or the email address on file.', href: '/crm/customers' };
    case 'triage_failed':
      return { fix: 'Enyo could not read these. Check that Enyo is switched on and its AI connection works.', href: '/settings/enyo' };
    case 'unknown_contacts':
    case 'wrong_link':
      return { fix: 'Enyo’s reply named a link, phone or email that is not in our details. Check the organisation’s contact details and branches are complete.', href: '/organisation' };
    case 'access_off':
    case 'deactivated':
    case 'no_account':
      return { fix: 'Only a person can decide on access. Answer these yourselves; consider a standard reply for paused accounts.', href: '/crm/support?filter=open' };
    case 'wrong_facts':
    case 'policy':
      return { fix: 'Enyo said something wrong. Check which approved answer it used and correct or remove it.', href: '/enyo/learning' };
    case 'needless_hand_over':
      return { fix: 'Enyo handed over questions it could have answered. If they keep coming, approve answers for them, or set the queue to answer by itself.', href: '/settings/support' };
    default:
      return { fix: 'Read a few of these requests to see what they have in common.', href: '/crm/support/enyo' };
  }
}

/** Reasons that are the customer's situation, not something to fix in Enyo. */
const NOT_GAPS = new Set(['customer_asked', 'legal', 'money', 'safety', 'complaint', 'negative_mood', 'urgent', 'repeat_contact', 'automated_sender', 'chat_handover', 'queue_off', 'staff_help']);

/**
 * Hand-overs and corrections grouped by topic and reason, biggest first, each
 * with what to do about it. Situations that rightly need a person (money,
 * safety, complaints, the customer asked) are counted apart, not as gaps.
 */
export function gapReport(rows: GapRow[], limit = 12): { gaps: Gap[]; rightlyHuman: { reason: string; label: string; count: number }[] } {
  const gaps = new Map<string, Gap>();
  const human = new Map<string, number>();
  for (const r of rows) {
    const topicLabel = r.topic ? TOPIC_LABEL[asTopic(r.topic)] : 'Not sorted';
    const reasons = [...String(r.handoverReason ?? '').split(','), r.reviewReason ?? ''].map((x) => x.trim()).filter(Boolean);
    for (const reason of new Set(reasons)) {
      if (NOT_GAPS.has(reason)) { human.set(reason, (human.get(reason) ?? 0) + 1); continue; }
      const key = `${r.topic ?? 'none'}:${reason}`;
      const g = gaps.get(key);
      if (g) g.count += 1;
      else {
        const { fix, href } = gapFix(reason, topicLabel);
        gaps.set(key, { key, topic: topicLabel, reason, reasonLabel: HANDOVER_REASON_LABEL[reason] ?? (FAILURE_LABEL as Record<string, string>)[reason] ?? reason, count: 1, fix, href });
      }
    }
  }
  return {
    gaps: [...gaps.values()].sort((a, b) => b.count - a.count).slice(0, limit),
    rightlyHuman: [...human.entries()].map(([reason, count]) => ({ reason, label: HANDOVER_REASON_LABEL[reason] ?? reason, count })).sort((a, b) => b.count - a.count),
  };
}

/** Enyo's measures over a period. */
export function enyoMeasures(r: { answered: number; drafted: number; reviewed: number; good: number; fixed: number; wrong: number; used: number; edited: number; ignored: number; confirmed: number; escalated: number }) {
  const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return {
    answered: r.answered,
    drafted: r.drafted,
    reviewedShare: ratio(r.reviewed, r.answered),
    accuracy: ratio(r.good, r.good + r.fixed + r.wrong),
    draftAcceptance: ratio(r.used + r.edited, r.used + r.edited + r.ignored),
    sentAsWritten: ratio(r.used, r.used + r.edited + r.ignored),
    confirmedByCustomer: ratio(r.confirmed, r.answered),
    escalatedAfterAnswer: ratio(r.escalated, r.answered),
  };
}
