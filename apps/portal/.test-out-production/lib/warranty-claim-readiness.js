"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEADLINE_WARNING_DAYS = exports.MIN_3C_LENGTH = void 0;
exports.claimReadiness = claimReadiness;
exports.MIN_3C_LENGTH = 15;
exports.DEADLINE_WARNING_DAYS = 5;
function fmt(d) {
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}
function claimReadiness(claim, warranty, now = new Date()) {
    const items = [];
    const add = (key, label, ok, blocking, hint) => items.push({ key, label, ok, blocking, hint });
    const long = (t) => t.trim().length >= exports.MIN_3C_LENGTH;
    add('complaint', 'Complaint — what the customer reported', long(claim.complaint), true, `Describe it in at least ${exports.MIN_3C_LENGTH} characters.`);
    add('cause', 'Cause — what the technician found (root cause)', long(claim.cause), true, `Describe the diagnosis in at least ${exports.MIN_3C_LENGTH} characters.`);
    add('correction', 'Correction — what was done to fix it', long(claim.correction), true, `Describe the repair in at least ${exports.MIN_3C_LENGTH} characters.`);
    add('causalPart', 'Causal part identified', claim.causalPart.trim().length > 0, true, 'Name the part that caused the failure.');
    add('causalPartNumber', 'Causal part number', Boolean(claim.causalPartNumber?.trim()), false, 'Providers usually expect the part number.');
    const failure = new Date(claim.failureDate);
    // Compared as Lagos calendar days: a failure dated today is never "in the
    // future", whatever hour the date was stored at (E2E-07).
    const lagosDay = (d) => new Date(d.getTime() + 3600000).toISOString().slice(0, 10);
    add('failureDate', 'Failure date is not in the future', lagosDay(failure) <= lagosDay(now), true);
    const statusOk = warranty.status === 'ACTIVE';
    add('warrantyActive', 'Warranty is active (verified, not suspended or void)', statusOk, true, `Warranty status: ${warranty.status.replace(/_/g, ' ').toLowerCase()}.`);
    const inDates = failure.getTime() >= new Date(warranty.startsAt).getTime() && failure.getTime() <= new Date(warranty.endsAt).getTime();
    add('withinDates', 'Failure happened inside the warranty period', inDates, true, `Covered ${fmt(new Date(warranty.startsAt))} – ${fmt(new Date(warranty.endsAt))}.`);
    const distanceEnd = warranty.startReading !== null && warranty.distanceLimit !== null ? warranty.startReading + warranty.distanceLimit : null;
    if (distanceEnd !== null) {
        add('readingRecorded', 'Odometer at failure recorded', claim.failureReading !== null, true, 'The warranty has a km limit, so the failure reading is required.');
        if (claim.failureReading !== null) {
            add('withinDistance', 'Failure happened inside the km limit', claim.failureReading <= distanceEnd, true, `Limit: ${distanceEnd.toLocaleString('en-NG')} km.`);
            add('readingSane', 'Odometer at failure is not below the reading at warranty start', warranty.startReading === null || claim.failureReading >= warranty.startReading, true);
        }
    }
    else {
        add('readingRecorded', 'Odometer at failure recorded', claim.failureReading !== null, false, 'Recommended even without a km limit.');
    }
    const amounts = [claim.labourAmount, claim.partsAmount, claim.otherAmount, claim.logisticsAmount ?? 0];
    add('amountsValid', 'Amounts are not negative', amounts.every((a) => Number.isFinite(a) && a >= 0), true);
    add('amountClaimed', 'An amount is being claimed', amounts.reduce((s, a) => s + (a > 0 ? a : 0), 0) > 0, true);
    if (warranty.coversLabour === false && claim.labourAmount > 0) {
        add('labourCovered', 'Policy does not cover labour — the labour amount will likely be rejected', false, false, 'Remove it, charge it to the customer, or treat it as goodwill.');
    }
    if (warranty.coversLogistics === false && (claim.logisticsAmount ?? 0) > 0) {
        add('logisticsCovered', 'Policy does not cover logistics — the freight amount will likely be rejected', false, false, 'Absorb it, or agree it with the provider first.');
    }
    if (warranty.coversParts === false && claim.partsAmount > 0) {
        add('partsCovered', 'Policy does not cover parts — the parts amount will likely be rejected', false, false, 'This policy covers labour only.');
    }
    add('linked', 'Linked to the Job Card / Vehicle Service that did the repair', Boolean(claim.jobCardId || claim.vehicleServiceId), false, 'The repair record is the claim’s evidence.');
    if (claim.deadlineAt) {
        const deadline = new Date(claim.deadlineAt);
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
        add('deadline', daysLeft < 0 ? `Submission deadline passed on ${fmt(deadline)} — expect rejection` : daysLeft <= exports.DEADLINE_WARNING_DAYS ? `Submission deadline is close — ${fmt(deadline)}` : `Within the submission deadline (${fmt(deadline)})`, daysLeft > exports.DEADLINE_WARNING_DAYS, false);
    }
    add('realTerms', 'Warranty uses real (not sample) terms', !warranty.isSamplePolicy, false, 'Sample terms are for demonstration only.');
    const blockers = items.filter((i) => !i.ok && i.blocking).length;
    const warnings = items.filter((i) => !i.ok && !i.blocking).length;
    const score = Math.round((items.filter((i) => i.ok).length / items.length) * 100);
    return { items, blockers, warnings, score, ready: blockers === 0 };
}
