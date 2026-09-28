import { warrantyCoverage, type WarrantyCoverageState } from '@/lib/warranty-state';

/**
 * Warranty analytics — pure functions over plain rows, so every number on
 * the dashboard is reproducible and tested. Five levels:
 *   descriptive  — what happened
 *   diagnostic   — why (parts, providers, rejections, lateness, models)
 *   statistics   — distributions, turnaround, 12-month trend
 *   predictive   — what's coming (expiries, expected claims & cost, pipeline)
 *   prescriptive — what to do now, prioritised, each linked to its record
 */

export type AWarranty = {
  id: string;
  warrantyNumber: string;
  kind: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  startReading: number | null;
  distanceLimit: number | null;
  statusReason: string | null;
  issuedAt: Date;
  vehicleId: string | null;
  vehicleMileage: number | null;
  vehicleLabel: string | null;
  providerName: string;
};

export type AClaim = {
  id: string;
  claimNumber: string;
  status: string;
  remedy: string;
  providerId: string;
  providerName: string;
  causalPart: string;
  causalPartNumber: string | null;
  claimedAmount: number;
  approvedAmount: number | null;
  settledAmount: number | null;
  decisionNotes: string | null;
  deadlineAt: Date | null;
  createdAt: Date;
  reviewRequestedAt: Date | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  settledAt: Date | null;
  failureDate: Date;
  resubmissionCount: number;
  partReturnRequired: boolean;
  partReturnStatus: string | null;
  vehicleLabel: string | null;
  jobCardId: string | null;
};

export type AJobCard = { id: string; jobNumber: string; createdAt: Date; vehicleId: string | null; vehicleLabel: string | null };

export type AnalyticsInput = {
  warranties: AWarranty[];
  claims: AClaim[];
  recentJobCards: AJobCard[];
  reminderDueCount: number;
  now?: Date;
};

export type ActionItem = { priority: 1 | 2 | 3; title: string; detail: string; href: string };

const DAY = 86400000;
const OPEN = ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT'];
const DECIDED = ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'SETTLED'];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function sum(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}
export function mean(xs: number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null;
}
/** Linear-interpolated percentile (p in 0..100). */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = ((s.length - 1) * p) / 100;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}
export function stdDev(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
const days = (a: Date, b: Date) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
const rate = (num: number, den: number) => (den > 0 ? num / den : null);

export function computeWarrantyAnalytics(input: AnalyticsInput) {
  const now = input.now ?? new Date();
  const { warranties, claims } = input;
  const live = claims.filter((c) => c.status !== 'CANCELLED');
  const decided = claims.filter((c) => DECIDED.includes(c.status));
  const accepted = decided.filter((c) => c.status !== 'REJECTED');

  // ── Descriptive ────────────────────────────────────────────────────
  const coverage = warranties.map((w) => ({ w, cov: warrantyCoverage(w, w.vehicleMileage, now) }));
  const byState: Record<WarrantyCoverageState, number> = { COVERED: 0, EXPIRING_SOON: 0, EXPIRED: 0, PENDING_VERIFICATION: 0, SUSPENDED: 0, VOID: 0, TRANSFERRED: 0 };
  coverage.forEach(({ cov }) => (byState[cov.state] += 1));
  const covering = coverage.filter(({ cov }) => cov.state === 'COVERED' || cov.state === 'EXPIRING_SOON');
  const byStatus: Record<string, number> = {};
  claims.forEach((c) => (byStatus[c.status] = (byStatus[c.status] ?? 0) + 1));
  const claimed = sum(live.map((c) => c.claimedAmount));
  const approved = sum(decided.map((c) => c.approvedAmount ?? 0));
  const recovered = sum(claims.map((c) => c.settledAmount ?? 0));
  const decidedClaimed = sum(decided.map((c) => c.claimedAmount));
  const remedyMix = ['REIMBURSEMENT', 'REPLACEMENT', 'REPAIR'].map((r) => {
    const rows = live.filter((c) => c.remedy === r);
    return { remedy: r, count: rows.length, claimed: round2(sum(rows.map((c) => c.claimedAmount))), recovered: round2(sum(rows.map((c) => c.settledAmount ?? 0))) };
  });
  const descriptive = {
    warranties: warranties.length,
    covering: covering.length,
    byState,
    assetWarranties: warranties.filter((w) => w.kind === 'ASSET').length,
    partWarranties: warranties.filter((w) => w.kind === 'PART').length,
    claims: claims.length,
    byStatus,
    claimed: round2(claimed),
    approved: round2(approved),
    recovered: round2(recovered),
    /** Accepted (in full or part) ÷ decided. */
    approvalRate: rate(accepted.length, decided.length),
    /** Money approved ÷ money claimed, on decided claims. */
    valueApprovalRate: rate(approved, decidedClaimed),
    /** Money received ÷ money approved. */
    collectionRate: rate(recovered, approved),
    remedyMix,
  };

  // ── Diagnostic ─────────────────────────────────────────────────────
  const partMap = new Map<string, { part: string; claims: number; claimed: number; rejected: number; decided: number }>();
  live.forEach((c) => {
    const key = (c.causalPartNumber || c.causalPart).trim().toUpperCase();
    const row = partMap.get(key) ?? { part: c.causalPart + (c.causalPartNumber ? ` (${c.causalPartNumber})` : ''), claims: 0, claimed: 0, rejected: 0, decided: 0 };
    row.claims += 1;
    row.claimed += c.claimedAmount;
    if (DECIDED.includes(c.status)) row.decided += 1;
    if (c.status === 'REJECTED') row.rejected += 1;
    partMap.set(key, row);
  });
  const topParts = [...partMap.values()]
    .map((p) => ({ ...p, claimed: round2(p.claimed), rejectionRate: rate(p.rejected, p.decided) }))
    .sort((a, b) => b.claims - a.claims || b.claimed - a.claimed)
    .slice(0, 8);

  const provMap = new Map<string, { providerId: string; provider: string; claims: number; decided: number; accepted: number; claimed: number; recovered: number; decisionDays: number[] }>();
  live.forEach((c) => {
    const row = provMap.get(c.providerId) ?? { providerId: c.providerId, provider: c.providerName, claims: 0, decided: 0, accepted: 0, claimed: 0, recovered: 0, decisionDays: [] };
    row.claims += 1;
    row.claimed += c.claimedAmount;
    row.recovered += c.settledAmount ?? 0;
    if (DECIDED.includes(c.status)) {
      row.decided += 1;
      if (c.status !== 'REJECTED') row.accepted += 1;
      if (c.submittedAt && c.decidedAt) row.decisionDays.push(days(c.submittedAt, c.decidedAt));
    }
    provMap.set(c.providerId, row);
  });
  const providers = [...provMap.values()]
    .map((p) => ({ providerId: p.providerId, provider: p.provider, claims: p.claims, decided: p.decided, approvalRate: rate(p.accepted, p.decided), claimed: round2(p.claimed), recovered: round2(p.recovered), avgDecisionDays: mean(p.decisionDays) }))
    .sort((a, b) => b.claims - a.claims);

  const rejections = claims
    .filter((c) => c.status === 'REJECTED' && c.decisionNotes)
    .map((c) => ({ id: c.id, claimNumber: c.claimNumber, part: c.causalPart, reason: c.decisionNotes as string }))
    .slice(0, 10);

  const submitted = claims.filter((c) => c.submittedAt);
  const late = submitted.filter((c) => c.deadlineAt && new Date(c.submittedAt!).getTime() > new Date(c.deadlineAt).getTime());
  const lateDecided = late.filter((c) => DECIDED.includes(c.status));
  const onTimeDecided = submitted.filter((c) => !late.includes(c) && DECIDED.includes(c.status));
  const resubmitted = decided.filter((c) => c.resubmissionCount > 0);

  const modelMap = new Map<string, { model: string; warranties: number; claims: number }>();
  warranties.filter((w) => w.kind === 'ASSET' && w.vehicleLabel).forEach((w) => {
    const row = modelMap.get(w.vehicleLabel!) ?? { model: w.vehicleLabel!, warranties: 0, claims: 0 };
    row.warranties += 1;
    modelMap.set(w.vehicleLabel!, row);
  });
  live.forEach((c) => {
    if (c.vehicleLabel && modelMap.has(c.vehicleLabel)) modelMap.get(c.vehicleLabel)!.claims += 1;
  });
  const models = [...modelMap.values()].map((m) => ({ ...m, claimsPerWarranty: rate(m.claims, m.warranties) })).sort((a, b) => b.claims - a.claims).slice(0, 8);

  const diagnostic = {
    topParts,
    providers,
    rejections,
    late: { submitted: submitted.length, late: late.length, lateRejectionRate: rate(lateDecided.filter((c) => c.status === 'REJECTED').length, lateDecided.length), onTimeRejectionRate: rate(onTimeDecided.filter((c) => c.status === 'REJECTED').length, onTimeDecided.length) },
    resubmissions: { decided: resubmitted.length, successRate: rate(resubmitted.filter((c) => c.status !== 'REJECTED').length, resubmitted.length) },
    models,
  };

  // ── Statistics ─────────────────────────────────────────────────────
  const values = live.map((c) => c.claimedAmount).filter((v) => v > 0);
  const toSubmit = claims.filter((c) => c.submittedAt).map((c) => days(c.failureDate, c.submittedAt!));
  const toDecide = claims.filter((c) => c.submittedAt && c.decidedAt).map((c) => days(c.submittedAt!, c.decidedAt!));
  const toSettle = claims.filter((c) => c.decidedAt && c.settledAt).map((c) => days(c.decidedAt!, c.settledAt!));
  const months: { key: string; label: string; opened: number; claimed: number; recovered: number }[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit', timeZone: 'UTC' }), opened: 0, claimed: 0, recovered: 0 });
  }
  const mKey = (d: Date) => `${new Date(d).getUTCFullYear()}-${new Date(d).getUTCMonth()}`;
  live.forEach((c) => {
    const m = months.find((x) => x.key === mKey(c.createdAt));
    if (m) {
      m.opened += 1;
      m.claimed += c.claimedAmount;
    }
    if (c.settledAt) {
      const s = months.find((x) => x.key === mKey(c.settledAt!));
      if (s) s.recovered += c.settledAmount ?? 0;
    }
  });
  const statistics = {
    claimValue: { count: values.length, mean: mean(values), median: percentile(values, 50), p90: percentile(values, 90), stdDev: stdDev(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null },
    turnaround: {
      failureToSubmission: { mean: mean(toSubmit), median: percentile(toSubmit, 50) },
      submissionToDecision: { mean: mean(toDecide), median: percentile(toDecide, 50) },
      decisionToSettlement: { mean: mean(toSettle), median: percentile(toSettle, 50) },
    },
    trend: months.map((m) => ({ label: m.label, opened: m.opened, claimed: round2(m.claimed), recovered: round2(m.recovered) })),
  };

  // ── Predictive ─────────────────────────────────────────────────────
  const expiring = (d: number) => covering.filter(({ w }) => new Date(w.endsAt).getTime() - now.getTime() <= d * DAY).length;
  // Claim rate = claims opened in the last 12 months ÷ warranty-months of
  // cover in that period (each warranty counts the months it was active).
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const recentClaims = live.filter((c) => new Date(c.createdAt).getTime() >= yearAgo.getTime()).length;
  const warrantyMonths = sum(
    warranties
      .filter((w) => w.status !== 'PENDING_VERIFICATION')
      .map((w) => {
        const from = Math.max(new Date(w.startsAt).getTime(), yearAgo.getTime());
        const to = Math.min(new Date(w.endsAt).getTime(), now.getTime());
        return Math.max(0, (to - from) / (30.4375 * DAY));
      }),
  );
  const claimRatePerWarrantyMonth = rate(recentClaims, warrantyMonths);
  const expectedClaims90 = claimRatePerWarrantyMonth === null ? null : claimRatePerWarrantyMonth * covering.length * 3;
  const medianValue = percentile(values, 50);
  const expectedCost90 = expectedClaims90 !== null && medianValue !== null ? expectedClaims90 * medianValue : null;
  const inProgress = claims.filter((c) => [...OPEN, 'SUBMITTED'].includes(c.status));
  const pipelineValue = sum(inProgress.map((c) => c.claimedAmount));
  const awaitingMoney = sum(claims.filter((c) => c.status === 'ACCEPTED' || c.status === 'PARTIALLY_ACCEPTED').map((c) => c.approvedAmount ?? 0));
  const predictive = {
    expiring30: expiring(30),
    expiring60: expiring(60),
    expiring90: expiring(90),
    claimRatePerWarrantyMonth,
    expectedClaims90: expectedClaims90 === null ? null : round2(expectedClaims90),
    expectedCost90: expectedCost90 === null ? null : round2(expectedCost90),
    pipelineValue: round2(pipelineValue),
    // Money approved ÷ claimed already counts rejections as ₦0, so it alone
    // turns the open pipeline into an expected recovery.
    expectedPipelineRecovery: round2(pipelineValue * (descriptive.valueApprovalRate ?? 1)),
    awaitingMoney: round2(awaitingMoney),
    basis: { recentClaims, warrantyMonths: round2(warrantyMonths), activeWarranties: covering.length, medianValue, approvalRate: descriptive.approvalRate },
  };

  // ── Prescriptive ───────────────────────────────────────────────────
  const actions: ActionItem[] = [];
  const openClaims = claims.filter((c) => OPEN.includes(c.status));
  openClaims.filter((c) => c.deadlineAt && new Date(c.deadlineAt).getTime() < now.getTime()).forEach((c) =>
    actions.push({ priority: 1, title: `${c.claimNumber} is past its submission deadline`, detail: `${c.causalPart} — submit now with an explanation, or cancel it; late claims are usually rejected.`, href: `/warranty/claims/${c.id}` }),
  );
  openClaims
    .filter((c) => c.deadlineAt && new Date(c.deadlineAt).getTime() >= now.getTime() && new Date(c.deadlineAt).getTime() - now.getTime() <= 5 * DAY)
    .forEach((c) => actions.push({ priority: 1, title: `${c.claimNumber} deadline within 5 days`, detail: `${c.causalPart} — move it through approval and submit.`, href: `/warranty/claims/${c.id}` }));
  claims.filter((c) => c.status === 'APPROVED_TO_SUBMIT').forEach((c) =>
    actions.push({ priority: 1, title: `Submit ${c.claimNumber} to ${c.providerName}`, detail: 'Approved — print the claim pack, submit it and record the reference.', href: `/warranty/claims/${c.id}` }),
  );
  claims.filter((c) => c.partReturnRequired && c.partReturnStatus === 'AWAITING' && ['APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(c.status)).forEach((c) =>
    actions.push({ priority: 1, title: `Send the failed part for ${c.claimNumber}`, detail: `${c.providerName} needs it back — the claim can't close until it's sent.`, href: `/warranty/claims/${c.id}` }),
  );
  claims.filter((c) => (c.status === 'PENDING_HOD' || c.status === 'PENDING_MANAGER') && c.reviewRequestedAt && days(c.reviewRequestedAt, now) > 2).forEach((c) =>
    actions.push({ priority: 2, title: `${c.claimNumber} waiting for approval over 2 days`, detail: c.status === 'PENDING_HOD' ? 'Waiting on the Warranty HOD.' : 'Waiting on the Branch Manager.', href: `/warranty/claims/${c.id}` }),
  );
  claims.filter((c) => c.status === 'SUBMITTED' && c.submittedAt && days(c.submittedAt, now) > 30).forEach((c) =>
    actions.push({ priority: 2, title: `Chase ${c.providerName} for a decision on ${c.claimNumber}`, detail: `Submitted ${Math.floor(days(c.submittedAt!, now))} days ago with no decision.`, href: `/warranty/claims/${c.id}` }),
  );
  claims.filter((c) => (c.status === 'ACCEPTED' || c.status === 'PARTIALLY_ACCEPTED') && c.decidedAt && days(c.decidedAt, now) > 30).forEach((c) =>
    actions.push({ priority: 2, title: `Chase settlement of ${c.claimNumber}`, detail: `Accepted ${Math.floor(days(c.decidedAt!, now))} days ago — money, replacement or repair not yet received.`, href: `/warranty/claims/${c.id}` }),
  );
  coverage.filter(({ cov }) => cov.state === 'PENDING_VERIFICATION').forEach(({ w }) =>
    actions.push({ priority: 2, title: `Verify ${w.warrantyNumber}`, detail: 'Registered but not verified — it covers nothing until a Warranty HOD or Manager verifies it.', href: `/warranty/${w.id}` }),
  );
  if (input.reminderDueCount > 0) {
    actions.push({ priority: 2, title: `${input.reminderDueCount} expiry ${input.reminderDueCount === 1 ? 'reminder is' : 'reminders are'} due`, detail: 'Tell customers their warranty ends soon and offer a final health check.', href: '/warranty?filter=reminder' });
  }
  providers.filter((p) => p.decided >= 3 && p.approvalRate !== null && p.approvalRate < 0.5).forEach((p) =>
    actions.push({ priority: 3, title: `Low approval rate with ${p.provider} (${Math.round((p.approvalRate ?? 0) * 100)}%)`, detail: 'Review rejected claims for patterns (evidence, deadlines, coverage) before the next submission.', href: `/warranty/providers/${p.providerId}` }),
  );
  topParts.filter((p) => p.claims >= 3).forEach((p) =>
    actions.push({ priority: 3, title: `Repeat failures: ${p.part} (${p.claims} claims)`, detail: 'Possible quality issue — check the supplier and batch, and raise it with the provider.', href: `/warranty/claims?q=${encodeURIComponent(p.part.split(' (')[0]!)}` }),
  );

  // Warranty leakage: repairs on a vehicle while an ASSET warranty was
  // covering it, with no claim recorded against that Job Card.
  const claimedJobCards = new Set(claims.map((c) => c.jobCardId).filter(Boolean));
  const leakage = input.recentJobCards
    .filter((jc) => jc.vehicleId && !claimedJobCards.has(jc.id))
    .filter((jc) =>
      warranties.some(
        (w) => w.kind === 'ASSET' && w.vehicleId === jc.vehicleId && w.status === 'ACTIVE' && new Date(jc.createdAt).getTime() >= new Date(w.startsAt).getTime() && new Date(jc.createdAt).getTime() <= new Date(w.endsAt).getTime(),
      ),
    );
  leakage.slice(0, 10).forEach((jc) =>
    actions.push({ priority: 3, title: `Possible warranty leakage — ${jc.jobNumber}`, detail: `${jc.vehicleLabel ?? 'Vehicle'} was under an active vehicle warranty; no claim was made for this repair. Review whether any of it was claimable.`, href: `/workshop/job-cards/${jc.id}` }),
  );

  actions.sort((a, b) => a.priority - b.priority);
  const prescriptive = { actions, leakageCount: leakage.length };

  return { descriptive, diagnostic, statistics, predictive, prescriptive, generatedAt: now };
}

export type WarrantyAnalytics = ReturnType<typeof computeWarrantyAnalytics>;
