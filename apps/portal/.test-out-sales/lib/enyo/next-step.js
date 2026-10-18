"use strict";
/**
 * "What happens next" for a Job Card or Vehicle Service, in one plain
 * sentence, worked out from the record's own state (the same order of steps
 * the pages enforce). Pure, so it is unit-tested.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.naira = void 0;
exports.nextStep = nextStep;
exports.paymentPosition = paymentPosition;
const r2 = (n) => Math.round(n * 100) / 100;
/** ₦12,500 / ₦12,500.50 */
const naira = (n) => `₦${r2(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
exports.naira = naira;
function nextStep(s) {
    const thing = s.kind === 'JC' ? 'Job Card' : 'Vehicle Service';
    const done = ['CHECKED_OUT', 'COLLECTED'];
    if (s.status === 'CANCELLED')
        return s.paid > 0.004 ? `Cancelled. ${(0, exports.naira)(s.paid)} has been paid, so Finance records a refund before the vehicle is handed back.` : 'Cancelled. The front desk hands the vehicle back.';
    if (done.includes(s.status))
        return 'Finished: the vehicle has left.';
    if (s.status === 'ESCALATED')
        return 'Handed over to a Job Card: the work continues there.';
    if (s.status === 'SCHEDULED')
        return 'Booked: the front desk checks the vehicle in when it arrives.';
    if (s.approvalStatus === 'PENDING')
        return `Waiting for the supervisor to approve the ${thing}.`;
    if (s.approvalStatus === 'REJECTED')
        return `The supervisor rejected the ${thing}; the front desk corrects it or opens a new one.`;
    if (s.status === 'CLOSED')
        return 'Closed by the Manager: the front desk checks the vehicle out to the person collecting it.';
    if (s.status === 'READY_FOR_COLLECTION') {
        const owed = r2(s.total - s.paid);
        return owed > 0.004 ? `Ready for collection. ${(0, exports.naira)(owed)} is still to be paid, then the close can be requested.` : 'Ready for collection and paid: the front desk or supervisor requests the close, and the Manager approves it.';
    }
    if (s.status === 'COMPLETED')
        return 'Work completed: the supervisor marks it ready for collection.';
    if (!s.hasTechnician)
        return 'The supervisor assigns a technician.';
    if (s.technicianAccepted === 'PENDING')
        return 'Waiting for the technician to accept the job.';
    if (!s.estimateStatus || s.estimateStatus === 'DRAFT')
        return 'The technician and supervisor prepare the estimate and submit it.';
    if (s.estimateStatus === 'SUBMITTED')
        return 'Waiting for the supervisor to approve the estimate.';
    if (s.estimateStatus === 'APPROVED')
        return 'Waiting for the Manager\'s final approval of the estimate.';
    if (s.estimateStatus === 'MANAGER_APPROVED' && !s.customerNotified)
        return 'The front desk sends the approved estimate to the customer ("Notify customer").';
    const deposit = r2(s.total * s.depositFraction);
    if (s.status === 'AWAITING_CUSTOMER_APPROVAL' && s.paid < deposit - 0.004)
        return `Waiting for the customer's deposit: ${(0, exports.naira)(deposit)} (${Math.round(s.depositFraction * 100)}% of ${(0, exports.naira)(s.total)}); ${(0, exports.naira)(s.paid)} paid so far.`;
    if (s.status === 'AWAITING_PARTS')
        return 'Waiting for parts (Store release or an outside purchase).';
    if (s.status === 'QUALITY_CHECK')
        return 'In quality check: the supervisor confirms the work.';
    return 'Work in progress with the technician.';
}
/** Payment position shown with a job, from the figures (never the status). */
function paymentPosition(total, paid, depositFraction) {
    const balance = Math.max(0, r2(total - paid));
    if (total <= 0)
        return { label: paid > 0 ? 'Paid (no priced estimate yet)' : 'No priced estimate yet', balance: 0 };
    if (paid <= 0)
        return { label: 'Awaiting payment', balance };
    if (paid >= total - 0.004)
        return { label: paid > total + 0.004 ? 'Overpaid' : 'Paid in full', balance };
    if (paid >= r2(total * depositFraction) - 0.004)
        return { label: 'Deposit met, balance pending', balance };
    return { label: 'Part paid, below the deposit', balance };
}
