"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAILURE_LABEL = exports.FAILURE_REASONS = exports.VERDICT_LABEL = exports.VERDICTS = exports.ENYO_REPLY_FILTERS = void 0;
exports.asVerdict = asVerdict;
exports.asFailureReason = asFailureReason;
exports.similarity = similarity;
exports.draftUse = draftUse;
exports.gapFix = gapFix;
exports.gapReport = gapReport;
exports.enyoMeasures = enyoMeasures;
/**
 * Keeping an eye on Enyo in the Support centre (pure, tested): what a
 * person's check of an Enyo reply records, how a draft fared when a colleague
 * answered, and the "why Enyo could not resolve it" report that turns
 * hand-overs and corrections into things to fix (an answer to approve, a
 * record Enyo could not see, a rule to change).
 */
const core_1 = require("./core");
const ai_core_1 = require("./ai-core");
/** The tabs of the Enyo replies page. */
exports.ENYO_REPLY_FILTERS = ['to_check', 'sent', 'drafts', 'checked', 'wrong'];
/** A person's verdict on an Enyo reply or draft. */
exports.VERDICTS = ['GOOD', 'FIXED', 'WRONG'];
exports.VERDICT_LABEL = {
    GOOD: 'Good', FIXED: 'Corrected', WRONG: 'Wrong',
    // Set automatically when a colleague answers after a draft.
    USED: 'Draft sent as written', EDITED: 'Draft edited before sending', IGNORED: 'Draft not used',
};
/** Why an Enyo reply was not right (or why it could not answer). */
exports.FAILURE_REASONS = ['knowledge_gap', 'wrong_facts', 'missing_records', 'wrong_link', 'should_hand_over', 'needless_hand_over', 'tone', 'language', 'policy', 'other'];
exports.FAILURE_LABEL = {
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
function asVerdict(v) {
    return typeof v === 'string' && exports.VERDICTS.includes(v) ? v : null;
}
function asFailureReason(v) {
    return typeof v === 'string' && exports.FAILURE_REASONS.includes(v) ? v : null;
}
const words = (t) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
/** Word overlap (Jaccard) between two texts, 0–1. */
function similarity(a, b) {
    const x = words(a);
    const y = words(b);
    if (!x.size && !y.size)
        return 1;
    let both = 0;
    for (const w of x)
        if (y.has(w))
            both += 1;
    return both / (x.size + y.size - both);
}
/** How a colleague used Enyo's draft. */
function draftUse(draft, sent, usedDraft) {
    const s = similarity(draft, sent);
    if (s >= 0.8)
        return 'USED';
    if (usedDraft || s >= 0.35)
        return 'EDITED';
    return 'IGNORED';
}
/** What to do about each kind of gap — so the report says how to make Enyo better, not just what went wrong. */
function gapFix(reason, topicLabel) {
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
function gapReport(rows, limit = 12) {
    const gaps = new Map();
    const human = new Map();
    for (const r of rows) {
        const topicLabel = r.topic ? ai_core_1.TOPIC_LABEL[(0, ai_core_1.asTopic)(r.topic)] : 'Not sorted';
        const reasons = [...String(r.handoverReason ?? '').split(','), r.reviewReason ?? ''].map((x) => x.trim()).filter(Boolean);
        for (const reason of new Set(reasons)) {
            if (NOT_GAPS.has(reason)) {
                human.set(reason, (human.get(reason) ?? 0) + 1);
                continue;
            }
            const key = `${r.topic ?? 'none'}:${reason}`;
            const g = gaps.get(key);
            if (g)
                g.count += 1;
            else {
                const { fix, href } = gapFix(reason, topicLabel);
                gaps.set(key, { key, topic: topicLabel, reason, reasonLabel: core_1.HANDOVER_REASON_LABEL[reason] ?? exports.FAILURE_LABEL[reason] ?? reason, count: 1, fix, href });
            }
        }
    }
    return {
        gaps: [...gaps.values()].sort((a, b) => b.count - a.count).slice(0, limit),
        rightlyHuman: [...human.entries()].map(([reason, count]) => ({ reason, label: core_1.HANDOVER_REASON_LABEL[reason] ?? reason, count })).sort((a, b) => b.count - a.count),
    };
}
/** Enyo's measures over a period. */
function enyoMeasures(r) {
    const ratio = (a, b) => (b ? Math.round((a / b) * 100) : null);
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
