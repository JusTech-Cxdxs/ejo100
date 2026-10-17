/**
 * Realistic sample data for every email template, used by the preview tool
 * (scripts/email-previews.ts) and the unit test (tests/emails.test.ts).
 * With `hostile: true`, every free-text field carries markup, to prove the
 * templates escape what people type.
 */
import { renderPasswordResetEmail } from '../lib/email-templates/password-reset';
import { renderCustomerWelcomeEmail } from '../lib/email-templates/customer-welcome';
import { renderStaffAccessEmail } from '../lib/email-templates/staff-access';
import { renderSupportAssignedEmail, renderSupportLateEmail, renderSupportNobodyFreeEmail } from '../lib/email-templates/support-staff';
import { renderCustomerEstimateApprovedEmail } from '../lib/email-templates/customer-estimate-approved';
import { renderCustomerServiceEstimateApprovedEmail } from '../lib/email-templates/customer-service-estimate-approved';
import { renderJobCardDecisionEmail } from '../lib/email-templates/job-card-decision';
import { renderVehicleServiceDecisionEmail } from '../lib/email-templates/vehicle-service-decision';
import { renderWarrantyStaffNoticeEmail } from '../lib/email-templates/warranty-staff-notice';
import { renderCustomerBroadcastEmail } from '../lib/email-templates/customer-broadcast';
import { renderCustomerSupportReplyEmail } from '../lib/email-templates/customer-support-reply';
import { renderCustomerJobCardAcknowledgmentEmail } from '../lib/email-templates/customer-job-card-acknowledgment';
import { renderCustomerJobInProgressEmail } from '../lib/email-templates/customer-job-in-progress';
import { renderCustomerQualityCheckEmail } from '../lib/email-templates/customer-quality-check';
import { renderCustomerJobWorkUpdateEmail } from '../lib/email-templates/customer-job-work-update';
import { renderCustomerJobCompletedEmail } from '../lib/email-templates/customer-job-completed';
import { renderCustomerReadyForCollectionEmail } from '../lib/email-templates/customer-ready-for-collection';
import { renderCustomerVehicleCheckedOutEmail } from '../lib/email-templates/customer-vehicle-checked-out';
import { renderCustomerPaymentReceivedEmail } from '../lib/email-templates/customer-payment-received';
import { renderCustomerJobCardCancelledEmail } from '../lib/email-templates/customer-job-card-cancelled';
import { renderCustomerJobCardClosedEmail } from '../lib/email-templates/customer-job-card-closed';
import { renderCustomerApprovalReminderEmail } from '../lib/email-templates/customer-approval-reminder';
import { renderCustomerCollectionOverdueEmail } from '../lib/email-templates/customer-collection-overdue';
import { renderCustomerServiceCompletedEmail } from '../lib/email-templates/customer-service-completed';
import { renderCustomerServiceReadyForCollectionEmail } from '../lib/email-templates/customer-service-ready-for-collection';
import { renderCustomerServiceCheckedOutEmail } from '../lib/email-templates/customer-service-checked-out';
import { renderCustomerServicePaymentReceivedEmail } from '../lib/email-templates/customer-service-payment-received';
import { renderCustomerServiceCancelledEmail } from '../lib/email-templates/customer-service-cancelled';
import { renderCustomerServiceClosedEmail } from '../lib/email-templates/customer-service-closed';
import { renderCustomerServiceCollectionOverdueEmail } from '../lib/email-templates/customer-service-collection-overdue';
import { renderCustomerRefundReceiptEmail } from '../lib/email-templates/customer-refund-receipt';
import { renderCustomerWarrantyCertificateEmail } from '../lib/email-templates/customer-warranty-certificate';
import { renderCustomerWarrantyExpiryEmail } from '../lib/email-templates/customer-warranty-expiry';
import { renderServiceReminderEmail } from '../lib/email-templates/service-reminder';
import { renderSupervisorJobCardAssignedEmail } from '../lib/email-templates/supervisor-job-card-assigned';
import { renderTechnicianJobCardAssignedEmail } from '../lib/email-templates/technician-job-card-assigned';
import { renderTechnicianResponseEmail } from '../lib/email-templates/technician-response-notification';
import { renderSupervisorVehicleServiceAssignedEmail } from '../lib/email-templates/supervisor-vehicle-service-assigned';
import { renderTechnicianVehicleServiceAssignedEmail } from '../lib/email-templates/technician-vehicle-service-assigned';
import { renderTechnicianVehicleServiceResponseEmail } from '../lib/email-templates/technician-vehicle-service-response';
import { renderEstimateNudgeEmail } from '../lib/email-templates/estimate-nudge';
import { renderServiceEstimateNudgeEmail } from '../lib/email-templates/service-estimate-nudge';
import { renderEstimateSubmittedEmail } from '../lib/email-templates/estimate-submitted-for-validation';
import { renderServiceEstimateSubmittedEmail } from '../lib/email-templates/service-estimate-submitted';
import { renderEstimateReadyForManagerEmail } from '../lib/email-templates/estimate-ready-for-manager';
import { renderServiceEstimateReadyForManagerEmail } from '../lib/email-templates/service-estimate-ready-for-manager';
import { renderEstimateReadyForCustomerNotificationEmail } from '../lib/email-templates/estimate-ready-for-customer-notification';
import { renderServiceEstimateReadyForCustomerNotificationEmail } from '../lib/email-templates/service-estimate-ready-for-customer-notification';
import { renderPaymentRecordedUpdateEmail } from '../lib/email-templates/payment-recorded-update';
import { renderServicePaymentRecordedUpdateEmail } from '../lib/email-templates/service-payment-recorded-update';
import { renderPaymentCompletedInFullEmail } from '../lib/email-templates/payment-completed-in-full';
import { renderServicePaymentCompletedInFullEmail } from '../lib/email-templates/service-payment-completed-in-full';
import { renderPaymentRequirementMetEmail } from '../lib/email-templates/payment-requirement-met';
import { renderServicePaymentRequirementMetEmail } from '../lib/email-templates/service-payment-requirement-met';
import { renderCancellationRequestedEmail } from '../lib/email-templates/cancellation-requested';
import { renderServiceCancellationRequestedEmail } from '../lib/email-templates/service-cancellation-requested';
import { renderCancellationDeclinedEmail } from '../lib/email-templates/cancellation-declined';
import { renderServiceCancellationDeclinedEmail } from '../lib/email-templates/service-cancellation-declined';
import { renderJobCardCancelledStaffEmail } from '../lib/email-templates/job-card-cancelled-staff';
import { renderVehicleServiceCancelledStaffEmail } from '../lib/email-templates/vehicle-service-cancelled-staff';
import { renderCloseRequestedEmail } from '../lib/email-templates/close-requested';
import { renderServiceCloseRequestedEmail } from '../lib/email-templates/service-close-requested';
import { renderCloseRequestDeclinedEmail } from '../lib/email-templates/close-request-declined';
import { renderServiceCloseRequestDeclinedEmail } from '../lib/email-templates/service-close-request-declined';
import { renderJobCardClosedStaffEmail } from '../lib/email-templates/job-card-closed-staff';
import { renderVehicleServiceClosedStaffEmail } from '../lib/email-templates/vehicle-service-closed-staff';
import { renderVehicleCheckedOutStaffEmail } from '../lib/email-templates/vehicle-checked-out-staff';
import { renderVehicleServiceCheckedOutStaffEmail } from '../lib/email-templates/vehicle-service-checked-out-staff';
import { renderVehicleServiceEscalatedStaffEmail } from '../lib/email-templates/vehicle-service-escalated-staff';
import { renderPartRequestApprovalNeededEmail, renderPartRequestStatusEmail } from '../lib/email-templates/part-request-status';
import { renderServiceEstimatePartRequestApprovalNeededEmail, renderServiceEstimatePartRequestStatusEmail } from '../lib/email-templates/service-estimate-part-request-status';
import { renderExternalProcurementApprovalNeededEmail, renderExternalProcurementStatusEmail } from '../lib/email-templates/external-procurement-status';
import { renderStoreMatchingRequestedEmail, renderStoreMatchingStatusEmail } from '../lib/email-templates/store-matching-status';
import { renderServiceStoreMatchingRequestedEmail, renderServiceStoreMatchingStatusEmail } from '../lib/email-templates/service-store-matching-status';
import { renderStaffGoodsReceiptRecordedEmail } from '../lib/email-templates/staff-goods-receipt-recorded';
import { renderGoodsReceiptEditedEmail } from '../lib/email-templates/goods-receipt-edited';
import { renderPartSellingPriceSetEmail } from '../lib/email-templates/part-selling-price-set';
import { renderPartTargetMarginSetEmail } from '../lib/email-templates/part-target-margin-set';
import { renderPricingAlertRaisedEmail } from '../lib/email-templates/pricing-alert-raised';
import { renderPricingAlertsDigestEmail } from '../lib/email-templates/pricing-alerts-digest';

export type EmailSample = {
  name: string;
  /** The exported render function this sample exercises. */
  template: string;
  audience: 'staff' | 'customer';
  /** The subject the call site uses (templates that build their own subject return it). */
  subject?: string;
  render: () => string | { subject: string; html: string };
};

export const SAMPLE_PORTAL = 'https://portal.example.com';
export const SAMPLE_WEBSITE = 'https://www.example.com';

export function emailSamples(opts: { hostile?: boolean } = {}): EmailSample[] {
  const x = (s: string) => (opts.hostile ? `${s} <script>alert("x")</script> & <b>bold</b>` : s);
  const org = x('Kewalram Chanrai Group');
  const branch = x('Isolo Branch');
  const dept = x('Workshop');
  const portalLogo = `${SAMPLE_PORTAL}/images/logo/email-logo.png`;
  const siteLogo = `${SAMPLE_WEBSITE}/images/logo/email-logo.png`;
  const customer = x('Adaeze Okafor');
  const staff = x('Tunde Bakare');
  const manager = x('Funmilayo Adeyemi');
  const supervisor = x('Ibrahim Musa');
  const technician = x('Chinedu Eze');
  const job = 'JC-2026-000123';
  const vs = 'VS-2026-000045';
  const vehicle = x('Toyota Hilux');
  const plate = 'KJA-219-XY';
  const jobUrl = `${SAMPLE_PORTAL}/workshop/job-cards/clx123`;
  const vsUrl = `${SAMPLE_PORTAL}/workshop/vehicle-service/clv456`;
  const jobDash = `${SAMPLE_WEBSITE}/customer-portal/dashboard/services/jc/clx123`;
  const vsDash = `${SAMPLE_WEBSITE}/customer-portal/dashboard/services/vs/clv456`;
  const contact = { address: x('12 Oshodi-Apapa Expressway, Isolo, Lagos'), phones: ['0201 234 5678', '0802 345 6789'], email: 'isolo@example.com' };
  const staffBase = { logoUrl: portalLogo, companyName: org, branchName: branch };
  const staffDept = { ...staffBase, departmentName: dept };
  const custBase = { logoUrl: siteLogo, companyName: org, branchName: branch };
  const estimateLines = [
    { description: x('Front brake pads (set)'), quantity: 1, unitOfMeasure: 'set', amount: '₦48,500.00' },
    { description: x('Engine oil 5W-30'), quantity: 6, unitOfMeasure: 'litre', amount: '₦39,000.00' },
    { description: x('Oil filter'), quantity: 1, unitOfMeasure: null, amount: 'Covered by warranty WTY-2026-000004' },
  ];
  const estimateMoney = {
    servicesSubtotal: '₦87,500.00', labourSubtotal: '₦25,000.00', sundrySubtotal: '₦3,500.00', totalAmount: '₦116,000.00',
    minimumDepositAmount: '₦81,200.00', depositPercent: 70,
    bankName: x('Example Bank Plc'), accountName: org, accountNumber: '0123456789',
  };
  const vehicleInfo = { make: 'Toyota', model: 'Hilux', year: 2019, engineType: '2.7L petrol', chassisNumber: 'AHTFR22G406012345', plateNumber: plate };
  const partLines = [
    { partName: x('Brake pad set, front'), quantity: 1, baseUnitOfMeasure: 'set' },
    { partName: x('Engine oil 5W-30'), quantity: 6, baseUnitOfMeasure: 'litre' },
  ];

  const s = (name: string, template: string, audience: 'staff' | 'customer', subject: string | undefined, render: EmailSample['render']): EmailSample => ({ name, template, audience, subject, render });

  return [
    // Accounts and security
    s('staff-password-reset', 'renderPasswordResetEmail', 'staff', undefined, () => renderPasswordResetEmail({ fullName: staff, email: 'tunde.bakare@example.com', url: `${SAMPLE_PORTAL}/reset-password?token=abc123`, companyName: org, logoUrl: portalLogo })),
    s('staff-welcome', 'renderStaffAccessEmail', 'staff', undefined, () => renderStaffAccessEmail({
      kind: 'welcome', fullName: staff, email: 'tunde.bakare@example.com', employeeId: 'KCG-00042', companyName: org, branchName: branch, departmentName: dept,
      roles: ['Technician'], isPlatformTeam: false,
      access: [
        { module: 'Workshop', lines: [{ key: 'workshop.jobcard.view' as never, label: x('See Job Cards'), where: 'on work assigned to you', added: false }, { key: 'workshop.estimate.edit' as never, label: 'Prepare estimates', where: 'on work assigned to you', added: false }] },
        { module: 'Security', lines: [{ key: 'security.exitpass.request' as never, label: 'Request exit passes', where: 'for yourself', added: true }] },
      ],
      setPasswordUrl: `${SAMPLE_PORTAL}/reset-password?token=welcome1`, setPasswordHours: 72, signInUrl: `${SAMPLE_PORTAL}/login`, logoUrl: portalLogo,
    })),
    s('staff-access-changed', 'renderStaffAccessEmail', 'staff', undefined, () => renderStaffAccessEmail({
      kind: 'updated', fullName: staff, email: 'tunde.bakare@example.com', employeeId: 'KCG-00042', companyName: org, branchName: branch, departmentName: null,
      roles: ['Technician', 'Store Officer'], isPlatformTeam: false,
      access: [{ module: 'Inventory', lines: [{ key: 'store.view' as never, label: 'See parts and stock', where: 'in your branch', added: false }] }],
      signInUrl: `${SAMPLE_PORTAL}/login`, logoUrl: portalLogo, changeNote: x('You were given the role Store Officer.'),
    })),
    s('customer-welcome', 'renderCustomerWelcomeEmail', 'customer', undefined, () => renderCustomerWelcomeEmail({ kind: 'welcome', customerName: customer, email: 'adaeze@example.com', setPasswordUrl: `${SAMPLE_WEBSITE}/customer-portal/reset-password?token=t0k3n`, setPasswordHours: 72, signInUrl: `${SAMPLE_WEBSITE}/customer-portal`, ...custBase, branchContact: contact })),
    s('customer-access-link', 'renderCustomerWelcomeEmail', 'customer', undefined, () => renderCustomerWelcomeEmail({ kind: 'access', customerName: customer, email: 'adaeze@example.com', setPasswordUrl: `${SAMPLE_WEBSITE}/customer-portal/reset-password?token=t0k3n`, setPasswordHours: 72, signInUrl: `${SAMPLE_WEBSITE}/customer-portal`, ...custBase, branchContact: contact })),
    s('staff-notice', 'renderWarrantyStaffNoticeEmail', 'staff', `Bank details changed for ${branch}`, () => renderWarrantyStaffNoticeEmail({ recipientName: manager, heading: x('Bank details changed for Isolo Branch'), lines: [x('Tunde Bakare changed the bank account customers are asked to pay into.'), 'Old account: Example Bank Plc, 0123456789', 'New account: Example Bank Plc, 9876543210', 'If you did not expect this change, check it straight away.'], actionUrl: `${SAMPLE_PORTAL}/settings/branches`, ...staffBase, statusLabel: 'Security', statusTone: 'warning' })),
    s('customer-broadcast', 'renderCustomerBroadcastEmail', 'customer', undefined, () => renderCustomerBroadcastEmail({ customerName: customer, title: x('Extended opening hours in December'), message: x('From 1 December our Isolo workshop opens from 7:30 am to 7:00 pm, Monday to Saturday.\nBook early to secure a slot before the holidays.'), categoryLabel: 'Announcement', portalUrl: `${SAMPLE_WEBSITE}/customer-portal`, logoUrl: siteLogo, companyName: org, preferencesUrl: `${SAMPLE_WEBSITE}/customer-portal/dashboard/profile` })),
    s('customer-support-reply', 'renderCustomerSupportReplyEmail', 'customer', 'Reply to your request SUP-2026-000014', () => renderCustomerSupportReplyEmail({ customerName: customer, ticketNumber: 'SUP-2026-000014', subject: x('When will my car be ready?'), reply: x('Thank you for waiting.\nThe part arrived this morning and your vehicle will be ready by Friday afternoon.'), statusLabel: 'Waiting for your reply', portalUrl: `${SAMPLE_WEBSITE}/customer-portal/dashboard/support`, logoUrl: siteLogo, companyName: org, branchName: branch })),

    // Customer: Job Card journey
    s('customer-checked-in', 'renderCustomerJobCardAcknowledgmentEmail', 'customer', `Your vehicle is checked in — Job Card ${job}`, () => renderCustomerJobCardAcknowledgmentEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, complaints: [x('Squealing noise when braking'), x('Engine warning light on')], dashboardUrl: jobDash, ...custBase, departmentName: dept })),
    s('customer-escalated-to-job-card', 'renderCustomerJobCardAcknowledgmentEmail', 'customer', `Your service continues as Job Card ${job}`, () => renderCustomerJobCardAcknowledgmentEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, complaints: [x('Oil leak found under the engine')], dashboardUrl: jobDash, ...custBase, departmentName: dept, escalatedFromServiceNumber: vs })),
    s('customer-estimate-ready', 'renderCustomerEstimateApprovedEmail', 'customer', `Estimate ready for ${job} — Toyota Hilux (${plate})`, () => renderCustomerEstimateApprovedEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, plateNumber: plate, lineItems: estimateLines, ...estimateMoney, paymentRemarkSuggestion: `${job} Toyota Hilux ${plate}`, dashboardUrl: jobDash, ...custBase })),
    s('customer-approval-reminder', 'renderCustomerApprovalReminderEmail', 'customer', `Reminder: your estimate is waiting — Job Card ${job}`, () => renderCustomerApprovalReminderEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, totalEstimate: '₦116,000.00', minimumDepositAmount: '₦81,200.00', depositPercent: 70, dueDate: 'Friday, 16 October 2026', reminderNumber: 2, dashboardUrl: jobDash, ...custBase })),
    s('customer-payment-received', 'renderCustomerPaymentReceivedEmail', 'customer', `Payment received — Job Card ${job}`, () => renderCustomerPaymentReceivedEmail({ customerName: customer, jobNumber: job, amountReceived: '₦81,200.00', totalPaidSoFar: '₦81,200.00', totalEstimate: '₦116,000.00', balanceRemaining: '₦34,800.00', dashboardUrl: jobDash, ...custBase })),
    s('customer-paid-in-full', 'renderCustomerPaymentReceivedEmail', 'customer', `Payment received — Job Card ${job}`, () => renderCustomerPaymentReceivedEmail({ customerName: customer, jobNumber: job, amountReceived: '₦34,800.00', totalPaidSoFar: '₦116,000.00', totalEstimate: '₦116,000.00', dashboardUrl: jobDash, ...custBase })),
    s('customer-work-started', 'renderCustomerJobInProgressEmail', 'customer', `Work on your vehicle has started — Job Card ${job}`, () => renderCustomerJobInProgressEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase })),
    s('customer-work-resumed', 'renderCustomerJobWorkUpdateEmail', 'customer', `Work on your vehicle has resumed — Job Card ${job}`, () => renderCustomerJobWorkUpdateEmail({ kind: 'RESUMED', customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase })),
    s('customer-rework', 'renderCustomerJobWorkUpdateEmail', 'customer', `An update on your vehicle — Job Card ${job}`, () => renderCustomerJobWorkUpdateEmail({ kind: 'REWORK', customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase })),
    s('customer-quality-check', 'renderCustomerQualityCheckEmail', 'customer', `Your vehicle is in final quality checks — Job Card ${job}`, () => renderCustomerQualityCheckEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase })),
    s('customer-inspection-passed', 'renderCustomerJobCompletedEmail', 'customer', `Your vehicle passed its quality inspection — Job Card ${job}`, () => renderCustomerJobCompletedEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase, afterRework: true })),
    s('customer-ready-for-collection', 'renderCustomerReadyForCollectionEmail', 'customer', `Your vehicle is ready for collection — Job Card ${job}`, () => renderCustomerReadyForCollectionEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dueDate: 'Tuesday, 20 October 2026', dashboardUrl: jobDash, ...custBase })),
    s('customer-collection-reminder', 'renderCustomerReadyForCollectionEmail', 'customer', `Reminder: your vehicle is ready for collection — Job Card ${job}`, () => renderCustomerReadyForCollectionEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dueDate: 'Tuesday, 20 October 2026', reminderNumber: 1, dashboardUrl: jobDash, ...custBase })),
    s('customer-collected', 'renderCustomerVehicleCheckedOutEmail', 'customer', `Your vehicle has been collected — Job Card ${job}`, () => renderCustomerVehicleCheckedOutEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, collectedByName: x('Emeka Okafor'), dashboardUrl: jobDash, ...custBase })),
    s('customer-job-cancelled', 'renderCustomerJobCardCancelledEmail', 'customer', `Your Job Card ${job} has been cancelled`, () => renderCustomerJobCardCancelledEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase })),
    s('customer-collection-overdue', 'renderCustomerCollectionOverdueEmail', 'customer', `Please collect your vehicle — Job Card ${job}`, () => renderCustomerCollectionOverdueEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, daysSinceCancellationLabel: '5 days', reminderNumber: 2, dashboardUrl: jobDash, ...custBase })),
    s('customer-job-closed', 'renderCustomerJobCardClosedEmail', 'customer', `Your Job Card ${job} is closed`, () => renderCustomerJobCardClosedEmail({ customerName: customer, jobNumber: job, vehicleDescription: vehicle, dashboardUrl: jobDash, ...custBase })),
    s('customer-refund-receipt', 'renderCustomerRefundReceiptEmail', 'customer', `Refund receipt RF-2026-000007 — Job Card ${job}`, () => renderCustomerRefundReceiptEmail({ customerName: customer, referenceNumber: 'RF-2026-000007', recordLabel: 'Job Card', recordNumber: job, vehicleDescription: vehicle, amount: '₦50,000.00', method: 'Bank transfer', paidToName: customer, totalRefunded: '₦50,000.00', remaining: '₦31,200.00', dashboardUrl: jobDash, ...custBase })),

    // Customer: Vehicle Service journey
    s('customer-service-estimate-ready', 'renderCustomerServiceEstimateApprovedEmail', 'customer', `Estimate ready for ${vs} — Toyota Hilux (${plate})`, () => renderCustomerServiceEstimateApprovedEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, plateNumber: plate, lineItems: estimateLines.slice(1), ...estimateMoney, servicesSubtotal: '₦39,000.00', sundrySubtotal: undefined, totalAmount: '₦64,000.00', minimumDepositAmount: '₦44,800.00', paymentRemarkSuggestion: `${vs} Toyota Hilux ${plate}`, dashboardUrl: vsDash, ...custBase })),
    s('customer-service-payment-received', 'renderCustomerServicePaymentReceivedEmail', 'customer', `Payment received — Vehicle Service ${vs}`, () => renderCustomerServicePaymentReceivedEmail({ customerName: customer, serviceNumber: vs, amountReceived: '₦44,800.00', totalPaidSoFar: '₦44,800.00', totalEstimate: '₦64,000.00', balanceRemaining: '₦19,200.00', serviceUrl: vsDash, ...custBase })),
    s('customer-service-completed', 'renderCustomerServiceCompletedEmail', 'customer', `Your vehicle service is complete — ${vs}`, () => renderCustomerServiceCompletedEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, nextServiceDueMileage: '95,000 km', nextServiceDueDate: '12 April 2027', dashboardUrl: vsDash, ...custBase })),
    s('customer-service-ready', 'renderCustomerServiceReadyForCollectionEmail', 'customer', `Your vehicle is ready for collection — ${vs}`, () => renderCustomerServiceReadyForCollectionEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, dueDate: 'Tuesday, 20 October 2026', dashboardUrl: vsDash, ...custBase })),
    s('customer-service-collected', 'renderCustomerServiceCheckedOutEmail', 'customer', `Your vehicle has been collected — ${vs}`, () => renderCustomerServiceCheckedOutEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, collectedByName: customer, dashboardUrl: vsDash, ...custBase })),
    s('customer-service-cancelled', 'renderCustomerServiceCancelledEmail', 'customer', `Your vehicle service ${vs} has been cancelled`, () => renderCustomerServiceCancelledEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, dashboardUrl: vsDash, ...custBase })),
    s('customer-service-collection-overdue', 'renderCustomerServiceCollectionOverdueEmail', 'customer', `Please collect your vehicle — ${vs}`, () => renderCustomerServiceCollectionOverdueEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, daysSinceCancellationLabel: '1 day', reminderNumber: 1, dashboardUrl: vsDash, ...custBase })),
    s('customer-service-closed', 'renderCustomerServiceClosedEmail', 'customer', `Your vehicle service ${vs} is closed`, () => renderCustomerServiceClosedEmail({ customerName: customer, serviceNumber: vs, vehicleDescription: vehicle, dashboardUrl: vsDash, ...custBase })),
    s('customer-service-reminder', 'renderServiceReminderEmail', 'customer', `Your Toyota Hilux (${plate}) is getting close to its next service`, () => renderServiceReminderEmail({ stage: 2, customerName: customer, vehicleDescription: vehicle, plateNumber: plate, currentMileage: 88250, lastServiceMileage: 85000, lastServiceDate: new Date('2026-04-12T09:00:00Z'), estimatedDueOdometer: 95000, estimatedDueDate: new Date('2026-11-12T09:00:00Z'), kmRemaining: 6750, daysRemaining: 31, isOverdue: false, reminderCount: 2, vehicleUrl: `${SAMPLE_WEBSITE}/customer-portal/dashboard`, ...custBase })),
    s('customer-service-overdue', 'renderServiceReminderEmail', 'customer', `Your Toyota Hilux (${plate}) is due for a service`, () => renderServiceReminderEmail({ stage: 4, customerName: customer, vehicleDescription: vehicle, plateNumber: plate, currentMileage: 96100, lastServiceMileage: 85000, lastServiceDate: new Date('2026-04-12T09:00:00Z'), estimatedDueOdometer: 95000, estimatedDueDate: new Date('2026-10-12T09:00:00Z'), kmRemaining: null, daysRemaining: null, isOverdue: true, reminderCount: 4, vehicleUrl: `${SAMPLE_WEBSITE}/customer-portal/dashboard`, ...custBase })),
    s('customer-warranty-certificate', 'renderCustomerWarrantyCertificateEmail', 'customer', 'Your warranty certificate WTY-2026-000004', () => renderCustomerWarrantyCertificateEmail({ customerName: customer, warrantyNumber: 'WTY-2026-000004', subject: x('Alternator (part no. 27060-0L020)'), providerName: x('Example Parts Ltd'), validFrom: '12 October 2026', validUntil: '12 October 2027', covered: [x('Manufacturing defects in the alternator')], notCovered: ['Damage from accidents, flooding or wrong fitting'], conditions: ['Keep this certificate', 'Have the vehicle serviced on time'], isSample: false, ...custBase })),
    s('customer-warranty-expiry', 'renderCustomerWarrantyExpiryEmail', 'customer', 'Your warranty WTY-2026-000004 ends on 12 October 2027', () => renderCustomerWarrantyExpiryEmail({ customerName: customer, warrantyNumber: 'WTY-2026-000004', subject: x('Alternator'), endsOn: '12 October 2027', distanceEnd: '120,000 km', daysLeft: 7, reminderNumber: 2, isFinal: true, ...custBase })),

    // Staff: Job Card
    s('staff-job-card-approved', 'renderJobCardDecisionEmail', 'staff', `Job Card ${job} approved`, () => renderJobCardDecisionEmail({ decision: 'APPROVED', recipientName: staff, jobNumber: job, customerName: customer, approverName: manager, jobCardUrl: jobUrl, ...staffDept })),
    s('staff-job-card-returned', 'renderJobCardDecisionEmail', 'staff', `Job Card ${job} returned for correction`, () => renderJobCardDecisionEmail({ decision: 'REJECTED', recipientName: staff, jobNumber: job, customerName: customer, approverName: manager, rejectionReason: x('The odometer reading does not match the photo. Please re-check it and attach a clear photo.'), notes: x('Customer is waiting at the front desk.'), jobCardUrl: jobUrl, ...staffDept })),
    s('staff-supervisor-assigned', 'renderSupervisorJobCardAssignedEmail', 'staff', `New Job Card ${job} assigned to you`, () => renderSupervisorJobCardAssignedEmail({ supervisorName: supervisor, jobNumber: job, customerName: customer, vehicleDescription: vehicle, complaints: [x('Squealing noise when braking'), x('Engine warning light on')], jobCardUrl: jobUrl, ...staffDept })),
    s('staff-technician-assigned', 'renderTechnicianJobCardAssignedEmail', 'staff', `You are assigned to Job Card ${job}`, () => renderTechnicianJobCardAssignedEmail({ technicianName: technician, jobNumber: job, customerName: customer, vehicleDescription: vehicle, complaints: [x('Squealing noise when braking')], supervisorName: supervisor, jobCardUrl: jobUrl, ...staffDept })),
    s('staff-technician-declined', 'renderTechnicianResponseEmail', 'staff', `Assignment declined on Job Card ${job}`, () => renderTechnicianResponseEmail({ response: 'REJECTED', supervisorName: supervisor, jobNumber: job, customerName: customer, technicianName: technician, rejectionReason: x('On leave from tomorrow.'), jobCardUrl: jobUrl, ...staffDept })),
    s('staff-technician-accepted', 'renderTechnicianResponseEmail', 'staff', `Assignment accepted on Job Card ${job}`, () => renderTechnicianResponseEmail({ response: 'ACCEPTED', supervisorName: supervisor, jobNumber: job, customerName: customer, technicianName: technician, jobCardUrl: jobUrl, ...staffDept })),
    s('staff-estimate-nudge', 'renderEstimateNudgeEmail', 'staff', `Please look at the estimate — Job Card ${job}`, () => renderEstimateNudgeEmail({ recipientName: supervisor, fromName: technician, fromRole: 'technician', jobNumber: job, customerName: customer, note: x('Labour hours look low for the brake job.'), jobCardUrl: jobUrl, ...staffDept })),
    s('staff-estimate-submitted', 'renderEstimateSubmittedEmail', 'staff', `Estimate for Job Card ${job} needs your validation`, () => renderEstimateSubmittedEmail({ supervisorName: supervisor, jobNumber: job, customerName: customer, submittedByName: technician, totalAmount: '₦116,000.00', jobCardUrl: jobUrl, ...staffDept })),
    s('staff-estimate-for-manager', 'renderEstimateReadyForManagerEmail', 'staff', `Estimate for Job Card ${job} needs your approval`, () => renderEstimateReadyForManagerEmail({ managerName: manager, jobNumber: job, customerName: customer, approvedByName: supervisor, totalAmount: '₦116,000.00', jobCardUrl: jobUrl, ...staffBase })),
    s('staff-estimate-ready-to-send', 'renderEstimateReadyForCustomerNotificationEmail', 'staff', `Estimate for Job Card ${job} approved by manager — ready to send`, () => renderEstimateReadyForCustomerNotificationEmail({ recipientName: staff, jobNumber: job, customerName: customer, approvedByManagerName: manager, totalAmount: '₦116,000.00', jobCardUrl: jobUrl, ...staffBase })),
    s('staff-payment-recorded', 'renderPaymentRecordedUpdateEmail', 'staff', `Payment recorded on Job Card ${job}`, () => renderPaymentRecordedUpdateEmail({ recipientName: manager, jobNumber: job, customerName: customer, amountReceived: '₦81,200.00', totalPaidSoFar: '₦81,200.00', totalEstimate: '₦116,000.00', balanceRemaining: '₦34,800.00', jobCardUrl: jobUrl, ...staffDept })),
    s('staff-deposit-paid', 'renderPaymentRequirementMetEmail', 'staff', `Deposit paid, work can start — Job Card ${job}`, () => renderPaymentRequirementMetEmail({ recipientName: supervisor, jobNumber: job, customerName: customer, totalPaidSoFar: '₦81,200.00', totalEstimate: '₦116,000.00', jobCardUrl: jobUrl, ...staffDept })),
    s('staff-paid-in-full', 'renderPaymentCompletedInFullEmail', 'staff', `Job Card ${job} paid in full`, () => renderPaymentCompletedInFullEmail({ recipientName: manager, jobNumber: job, customerName: customer, totalPaid: '₦116,000.00', jobCardUrl: jobUrl, ...staffDept })),
    s('staff-cancellation-requested', 'renderCancellationRequestedEmail', 'staff', `Cancellation request needs your decision — Job Card ${job}`, () => renderCancellationRequestedEmail({ managerName: manager, jobNumber: job, customerName: customer, requestedByName: staff, reason: x('Customer decided to repair the vehicle elsewhere.'), jobCardUrl: jobUrl, ...staffBase })),
    s('staff-cancellation-declined', 'renderCancellationDeclinedEmail', 'staff', `Cancellation request declined — Job Card ${job}`, () => renderCancellationDeclinedEmail({ recipientName: staff, jobNumber: job, customerName: customer, declinedByName: manager, decisionNotes: x('Parts are already ordered; call the customer first.'), jobCardUrl: jobUrl, ...staffBase })),
    s('staff-job-card-cancelled', 'renderJobCardCancelledStaffEmail', 'staff', `Job Card ${job} cancelled`, () => renderJobCardCancelledStaffEmail({ recipientName: technician, jobNumber: job, customerName: customer, approvedByName: manager, reason: x('Customer decided to repair the vehicle elsewhere.'), jobCardUrl: jobUrl, ...staffDept })),
    s('staff-close-requested', 'renderCloseRequestedEmail', 'staff', `Close request needs your decision — Job Card ${job}`, () => renderCloseRequestedEmail({ managerName: manager, jobNumber: job, customerName: customer, requestedByName: staff, jobCardUrl: jobUrl, ...staffBase })),
    s('staff-close-declined', 'renderCloseRequestDeclinedEmail', 'staff', `Close request declined — Job Card ${job}`, () => renderCloseRequestDeclinedEmail({ recipientName: staff, jobNumber: job, customerName: customer, declinedByName: manager, decisionNotes: x('A refund is still pending.'), jobCardUrl: jobUrl, ...staffBase })),
    s('staff-job-card-closed', 'renderJobCardClosedStaffEmail', 'staff', `Job Card ${job} closed`, () => renderJobCardClosedStaffEmail({ recipientName: staff, jobNumber: job, customerName: customer, closedByName: manager, jobCardUrl: jobUrl, ...staffDept })),
    s('staff-vehicle-checked-out', 'renderVehicleCheckedOutStaffEmail', 'staff', `Vehicle checked out — Job Card ${job}`, () => renderVehicleCheckedOutStaffEmail({ recipientName: manager, jobNumber: job, customerName: customer, collectedByName: x('Emeka Okafor'), jobCardUrl: jobUrl, ...staffDept })),

    // Staff: Vehicle Service
    s('staff-vs-approved', 'renderVehicleServiceDecisionEmail', 'staff', `Vehicle Service ${vs} approved`, () => renderVehicleServiceDecisionEmail({ decision: 'APPROVED', recipientName: staff, serviceNumber: vs, customerName: customer, approverName: supervisor, serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-returned', 'renderVehicleServiceDecisionEmail', 'staff', `Vehicle Service ${vs} returned for correction`, () => renderVehicleServiceDecisionEmail({ decision: 'REJECTED', recipientName: staff, serviceNumber: vs, customerName: customer, approverName: supervisor, rejectionReason: x('Mileage missing.'), serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-supervisor-assigned', 'renderSupervisorVehicleServiceAssignedEmail', 'staff', `New Vehicle Service ${vs} assigned to you`, () => renderSupervisorVehicleServiceAssignedEmail({ supervisorName: supervisor, serviceNumber: vs, customerName: customer, vehicleDescription: vehicle, reasons: [x('Routine 10,000 km service'), x('Check air conditioning')], serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-technician-assigned', 'renderTechnicianVehicleServiceAssignedEmail', 'staff', `You are assigned to Vehicle Service ${vs}`, () => renderTechnicianVehicleServiceAssignedEmail({ technicianName: technician, serviceNumber: vs, customerName: customer, vehicleDescription: vehicle, supervisorName: supervisor, serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-technician-response', 'renderTechnicianVehicleServiceResponseEmail', 'staff', `Assignment accepted on Vehicle Service ${vs}`, () => renderTechnicianVehicleServiceResponseEmail({ response: 'ACCEPTED', supervisorName: supervisor, serviceNumber: vs, customerName: customer, technicianName: technician, serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-estimate-nudge', 'renderServiceEstimateNudgeEmail', 'staff', `Please look at the estimate — Vehicle Service ${vs}`, () => renderServiceEstimateNudgeEmail({ recipientName: technician, fromName: supervisor, fromRole: 'supervisor', serviceNumber: vs, customerName: customer, vehicleServiceUrl: vsUrl, ...staffBase })),
    s('staff-vs-estimate-submitted', 'renderServiceEstimateSubmittedEmail', 'staff', `Estimate for Vehicle Service ${vs} needs your approval`, () => renderServiceEstimateSubmittedEmail({ recipientName: supervisor, serviceNumber: vs, customerName: customer, submittedByName: technician, totalAmount: '₦64,000.00', serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-estimate-for-manager', 'renderServiceEstimateReadyForManagerEmail', 'staff', `Estimate for Vehicle Service ${vs} needs your approval`, () => renderServiceEstimateReadyForManagerEmail({ managerName: manager, serviceNumber: vs, customerName: customer, approvedByName: supervisor, totalAmount: '₦64,000.00', vehicleServiceUrl: vsUrl, ...staffBase })),
    s('staff-vs-estimate-ready-to-send', 'renderServiceEstimateReadyForCustomerNotificationEmail', 'staff', `Estimate for Vehicle Service ${vs} approved by manager — ready to send`, () => renderServiceEstimateReadyForCustomerNotificationEmail({ recipientName: staff, serviceNumber: vs, customerName: customer, approvedByManagerName: manager, totalAmount: '₦64,000.00', vehicleServiceUrl: vsUrl, ...staffBase })),
    s('staff-vs-payment-recorded', 'renderServicePaymentRecordedUpdateEmail', 'staff', `Payment recorded on Vehicle Service ${vs}`, () => renderServicePaymentRecordedUpdateEmail({ recipientName: manager, serviceNumber: vs, customerName: customer, amountReceived: '₦44,800.00', totalPaidSoFar: '₦44,800.00', totalEstimate: '₦64,000.00', balanceRemaining: '₦19,200.00', serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-deposit-paid', 'renderServicePaymentRequirementMetEmail', 'staff', `Deposit paid, work can start — Vehicle Service ${vs}`, () => renderServicePaymentRequirementMetEmail({ recipientName: supervisor, serviceNumber: vs, customerName: customer, totalPaidSoFar: '₦44,800.00', totalEstimate: '₦64,000.00', serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-paid-in-full', 'renderServicePaymentCompletedInFullEmail', 'staff', `Vehicle Service ${vs} paid in full`, () => renderServicePaymentCompletedInFullEmail({ recipientName: manager, serviceNumber: vs, customerName: customer, totalPaid: '₦64,000.00', serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-cancellation-requested', 'renderServiceCancellationRequestedEmail', 'staff', `Cancellation request needs your decision — Vehicle Service ${vs}`, () => renderServiceCancellationRequestedEmail({ managerName: manager, serviceNumber: vs, customerName: customer, requestedByName: staff, reason: x('Customer asked to reschedule.'), serviceUrl: vsUrl, ...staffBase })),
    s('staff-vs-cancellation-declined', 'renderServiceCancellationDeclinedEmail', 'staff', `Cancellation request declined — Vehicle Service ${vs}`, () => renderServiceCancellationDeclinedEmail({ recipientName: staff, serviceNumber: vs, customerName: customer, declinedByName: manager, serviceUrl: vsUrl, ...staffBase })),
    s('staff-vs-cancelled', 'renderVehicleServiceCancelledStaffEmail', 'staff', `Vehicle Service ${vs} cancelled`, () => renderVehicleServiceCancelledStaffEmail({ recipientName: technician, serviceNumber: vs, customerName: customer, approvedByName: manager, reason: x('Customer asked to reschedule.'), serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-close-requested', 'renderServiceCloseRequestedEmail', 'staff', `Close request needs your decision — Vehicle Service ${vs}`, () => renderServiceCloseRequestedEmail({ managerName: manager, serviceNumber: vs, customerName: customer, requestedByName: staff, serviceUrl: vsUrl, ...staffBase })),
    s('staff-vs-close-declined', 'renderServiceCloseRequestDeclinedEmail', 'staff', `Close request declined — Vehicle Service ${vs}`, () => renderServiceCloseRequestDeclinedEmail({ recipientName: staff, serviceNumber: vs, customerName: customer, declinedByName: manager, serviceUrl: vsUrl, ...staffBase })),
    s('staff-vs-closed', 'renderVehicleServiceClosedStaffEmail', 'staff', `Vehicle Service ${vs} closed`, () => renderVehicleServiceClosedStaffEmail({ recipientName: staff, serviceNumber: vs, customerName: customer, closedByName: manager, serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-checked-out', 'renderVehicleServiceCheckedOutStaffEmail', 'staff', `Vehicle checked out — Vehicle Service ${vs}`, () => renderVehicleServiceCheckedOutStaffEmail({ recipientName: manager, serviceNumber: vs, customerName: customer, collectedByName: customer, serviceUrl: vsUrl, ...staffDept })),
    s('staff-vs-escalated', 'renderVehicleServiceEscalatedStaffEmail', 'staff', `Vehicle Service ${vs} moved to Job Card ${job}`, () => renderVehicleServiceEscalatedStaffEmail({ recipientName: manager, serviceNumber: vs, jobNumber: job, customerName: customer, escalatedByName: supervisor, jobCardUrl: jobUrl, ...staffBase })),

    // Staff: parts, procurement and Store
    s('staff-parts-approval', 'renderPartRequestApprovalNeededEmail', 'staff', 'Parts request needs your approval — SPR-2026-000031', () => renderPartRequestApprovalNeededEmail({ recipientName: manager, requestedByName: technician, referenceNumber: 'SPR-2026-000031', jobNumber: job, customerName: customer, vehicle: vehicleInfo, requestedAt: new Date('2026-10-12T13:05:00Z'), lines: partLines, approvalUrl: `${SAMPLE_PORTAL}/workshop/parts-requests/spr31`, ...staffDept })),
    s('staff-parts-status', 'renderPartRequestStatusEmail', 'staff', 'Parts request rejected — SPR-2026-000031', () => renderPartRequestStatusEmail({ recipientName: technician, kind: 'rejected', referenceNumber: 'SPR-2026-000031', jobNumber: job, customerName: customer, rejectionReason: x('Not in stock; raise an external request instead.'), requestUrl: `${SAMPLE_PORTAL}/workshop/parts-requests/spr31`, ...staffDept })),
    s('staff-vs-parts-approval', 'renderServiceEstimatePartRequestApprovalNeededEmail', 'staff', 'Parts request needs your approval — SPR-2026-000032', () => renderServiceEstimatePartRequestApprovalNeededEmail({ recipientName: manager, requestedByName: technician, referenceNumber: 'SPR-2026-000032', serviceNumber: vs, customerName: customer, vehicle: { ...vehicleInfo, chassisNumber: null }, requestedAt: new Date('2026-10-12T13:05:00Z'), lines: partLines.slice(0, 1), approvalUrl: `${SAMPLE_PORTAL}/workshop/parts-requests/spr32`, ...staffDept })),
    s('staff-vs-parts-status', 'renderServiceEstimatePartRequestStatusEmail', 'staff', 'Parts released — SPR-2026-000032', () => renderServiceEstimatePartRequestStatusEmail({ recipientName: technician, kind: 'released', referenceNumber: 'SPR-2026-000032', serviceNumber: vs, customerName: customer, requestUrl: `${SAMPLE_PORTAL}/workshop/parts-requests/spr32`, ...staffDept })),
    s('staff-procurement-approval', 'renderExternalProcurementApprovalNeededEmail', 'staff', 'Procurement request needs your approval — EPR-2026-000009', () => renderExternalProcurementApprovalNeededEmail({ recipientName: manager, requestedByName: supervisor, referenceNumber: 'EPR-2026-000009', jobNumber: job, customerName: customer, lines: [{ description: x('Alternator, rebuilt'), quantity: 1, unitOfMeasure: 'piece', amount: 85000 }, { description: 'Machining of brake discs', quantity: 2, unitOfMeasure: null, amount: 24000 }], estimatedAmount: 109000, approvalUrl: `${SAMPLE_PORTAL}/workshop/procurement/epr9`, ...staffDept })),
    s('staff-procurement-status', 'renderExternalProcurementStatusEmail', 'staff', 'Procurement funds paid out — EPR-2026-000009', () => renderExternalProcurementStatusEmail({ recipientName: supervisor, kind: 'disbursed', referenceNumber: 'EPR-2026-000009', jobNumber: job, customerName: customer, amount: 109000, requestUrl: `${SAMPLE_PORTAL}/workshop/procurement/epr9`, ...staffDept })),
    s('staff-store-matching-requested', 'renderStoreMatchingRequestedEmail', 'staff', `Please match parts — Job Card ${job}`, () => renderStoreMatchingRequestedEmail({ recipientName: x('Store team'), requestedByName: technician, jobNumber: job, customerName: customer, lines: [{ description: x('Front brake pads'), quantity: 1, unit: 'set' }, { description: x('Wiper blades'), quantity: 2, unit: null }], note: x('Customer prefers original parts.'), matchingUrl: `${SAMPLE_PORTAL}/inventory/matching`, ...staffDept })),
    s('staff-store-matching-status', 'renderStoreMatchingStatusEmail', 'staff', `Waiting for Store to match parts — Job Card ${job}`, () => renderStoreMatchingStatusEmail({ recipientName: supervisor, kind: 'awaiting', jobNumber: job, customerName: customer, jobCardUrl: jobUrl, ...staffDept })),
    s('staff-vs-store-matching-requested', 'renderServiceStoreMatchingRequestedEmail', 'staff', `Please match parts — Vehicle Service ${vs}`, () => renderServiceStoreMatchingRequestedEmail({ recipientName: x('Store team'), requestedByName: technician, serviceNumber: vs, customerName: customer, lines: [{ description: x('Oil filter'), quantity: 1, unit: 'piece' }], matchingUrl: `${SAMPLE_PORTAL}/inventory/matching`, ...staffBase })),
    s('staff-vs-store-matching-status', 'renderServiceStoreMatchingStatusEmail', 'staff', `Store matching complete — Vehicle Service ${vs}`, () => renderServiceStoreMatchingStatusEmail({ recipientName: supervisor, kind: 'complete', serviceNumber: vs, customerName: customer, vehicleServiceUrl: vsUrl, ...staffBase })),
    s('staff-goods-receipt', 'renderStaffGoodsReceiptRecordedEmail', 'staff', 'Goods receipt GRN-2026-000210 recorded — Brake pad set, front', () => renderStaffGoodsReceiptRecordedEmail({ recordedByName: x('Bola Ahmed'), referenceNumber: 'GRN-2026-000210', supplierName: x('Example Parts Ltd'), partName: x('Brake pad set, front'), quantityLabel: '2 boxes', quantityInBaseUnitLabel: '20 sets', batchNumber: 'B-7781', notes: x('One box slightly damaged; contents fine.'), dashboardUrl: `${SAMPLE_PORTAL}/inventory/parts/p1`, ...staffBase })),
    s('staff-goods-receipt-edited', 'renderGoodsReceiptEditedEmail', 'staff', 'Goods receipt edited — GRN-2026-000210', () => renderGoodsReceiptEditedEmail({ recipientName: manager, editedByName: x('Bola Ahmed'), referenceNumber: 'GRN-2026-000210', changeSummary: x('Unit cost changed from ₦4,200.00 to ₦4,500.00.'), goodsReceiptUrl: `${SAMPLE_PORTAL}/inventory/goods-receipts`, ...staffDept })),
    s('staff-selling-price', 'renderPartSellingPriceSetEmail', 'staff', 'Selling price updated — Brake pad set, front', () => renderPartSellingPriceSetEmail({ recipientName: manager, setByName: x('Bola Ahmed'), partName: x('Brake pad set, front'), baseUnitOfMeasure: 'set', previousSellingPrice: 6000, newSellingPrice: 5200, margin: { quantityInBaseUnit: 20, totalBulkCost: 90000, expectedRevenue: 104000, grossProfit: 14000, markupPercent: 15.6, marginPercent: 13.5 }, targetMarginPercent: 25, partUrl: `${SAMPLE_PORTAL}/inventory/parts/p1`, ...staffDept })),
    s('staff-target-margin', 'renderPartTargetMarginSetEmail', 'staff', 'Target pricing updated — Brake pad set, front', () => renderPartTargetMarginSetEmail({ recipientName: manager, setByName: x('Bola Ahmed'), partName: x('Brake pad set, front'), previousTargetMarginPercent: 20, newTargetMarginPercent: 25, newTargetMarkupPercent: 33.3, enteredAs: 'MARGIN', enteredValue: 25, partUrl: `${SAMPLE_PORTAL}/inventory/parts/p1`, ...staffBase })),
    s('staff-pricing-alert', 'renderPricingAlertRaisedEmail', 'staff', 'Pricing alert: selling below cost — Brake pad set, front', () => renderPricingAlertRaisedEmail({ recipientName: manager, partName: x('Brake pad set, front'), severity: 'CRITICAL_LOSS', goodsReceiptReference: 'GRN-2026-000210', previousUnitCost: '₦4,200.00', newUnitCost: '₦5,600.00', sellingPrice: '₦5,200.00', actualMarginPercent: '-7.7', targetMarginPercent: '25.0', recommendedPrice: '₦7,466.67', recommendedMarkupPercent: '33.3', alertUrl: `${SAMPLE_PORTAL}/inventory/pricing?alert=a1`, dashboardUrl: `${SAMPLE_PORTAL}/inventory/pricing`, ...staffBase })),
    s('staff-pricing-digest', 'renderPricingAlertsDigestEmail', 'staff', `3 open pricing alerts at ${branch}`, () => renderPricingAlertsDigestEmail({ recipientName: manager, items: [
      { partName: x('Brake pad set, front'), severity: 'CRITICAL_LOSS', newUnitCost: '₦5,600.00', sellingPrice: '₦5,200.00', actualMarginPercent: '-7.7', targetMarginPercent: '25.0', partUrl: `${SAMPLE_PORTAL}/inventory/parts/p1` },
      { partName: x('Engine oil 5W-30'), severity: 'DEFICIT', newUnitCost: '₦5,900.00', sellingPrice: '₦6,500.00', actualMarginPercent: '9.2', targetMarginPercent: '20.0', partUrl: `${SAMPLE_PORTAL}/inventory/parts/p2` },
      { partName: x('Oil filter'), severity: 'BOOST', newUnitCost: '₦1,800.00', sellingPrice: '₦3,500.00', actualMarginPercent: '48.6', targetMarginPercent: '30.0', partUrl: `${SAMPLE_PORTAL}/inventory/parts/p3` },
    ], dashboardUrl: `${SAMPLE_PORTAL}/inventory/pricing`, ...staffBase })),
    // Support centre: to colleagues
    s('staff-support-assigned', 'renderSupportAssignedEmail', 'staff', undefined, () => renderSupportAssignedEmail({ companyName: org, logoUrl: portalLogo, recipientName: staff, number: 'SUP-2026-000042', subject: x('My car is making a noise'), contactName: customer, teamName: x('Customer care'), priority: 'High', due: 'Mon 19 Oct 2026, 10:30', url: `${SAMPLE_PORTAL}/crm/support/t1`, channel: 'Website enquiry', by: manager })),
    s('staff-support-nobody-free', 'renderSupportNobodyFreeEmail', 'staff', undefined, () => renderSupportNobodyFreeEmail({ companyName: org, logoUrl: portalLogo, recipientName: manager, number: 'SUP-2026-000043', subject: x('Refund query'), contactName: customer, teamName: x('Customer care'), priority: 'Normal', due: null, url: `${SAMPLE_PORTAL}/crm/support/t2`, channel: 'Email', reason: 'everyone on the team is marked away' })),
    s('staff-support-late', 'renderSupportLateEmail', 'staff', undefined, () => renderSupportLateEmail({ companyName: org, logoUrl: portalLogo, recipientName: manager, number: 'SUP-2026-000044', subject: x('Warranty claim follow-up'), contactName: customer, teamName: x('Warranty'), priority: 'Urgent', due: 'Mon 19 Oct 2026, 09:00', url: `${SAMPLE_PORTAL}/crm/support/t3`, channel: 'Customer portal', owner: staff })),
  ];
}
