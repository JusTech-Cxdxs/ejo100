import { renderCustomerEstimate } from './customer-estimate-approved';

export type CustomerServiceEstimateApprovedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  plateNumber?: string | null;
  lineItems: { description: string; quantity: number; unitOfMeasure?: string | null; amount: string }[];
  servicesSubtotal?: string;
  labourSubtotal?: string;
  sundrySubtotal?: string;
  totalAmount: string;
  minimumDepositAmount: string;
  /** The deposit as a percentage of the total, e.g. 70. */
  depositPercent?: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentRemarkSuggestion: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The Vehicle Service estimate as the customer sees it (same layout as the Job Card estimate). */
export function renderCustomerServiceEstimateApprovedEmail(o: CustomerServiceEstimateApprovedEmailOptions): string {
  const { serviceNumber, ...rest } = o;
  return renderCustomerEstimate({ ...rest, recordLabel: 'Vehicle Service', recordNumber: serviceNumber });
}
