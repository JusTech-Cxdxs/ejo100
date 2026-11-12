/**
 * The contents of each customer PDF, as types (no JSX here, so plain modules
 * and the unit tests can use them). The documents themselves are drawn in
 * estimate-pdf.tsx and inspection-pdf.tsx.
 */

export type EstimatePdfLineItem = {
  description: string;
  quantity: number;
  unitLabel: string | null;
  amount: string;
};

export type EstimatePdfProps = {
  organisation: {
    name: string;
    legalName: string | null;
    hqAddress: string | null;
    poBox: string | null;
    rcNumber: string | null;
    hotlines: string[];
    website: string | null;
    email: string | null;
  };
  branch: {
    name: string;
    address: string | null;
    hotlines: string[];
    email: string | null;
  };
  logoUrl: string;
  jobNumber: string;
  customerName: string;
  customerAddress: string | null;
  vehicleDescription: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  lineItems: EstimatePdfLineItem[];
  servicesSubtotal: string | null;
  labourSubtotal: string | null;
  sundrySubtotal: string | null;
  totalAmount: string;
  minimumDepositAmount: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentRemarkSuggestion: string;
  /** Label above the reference number. Defaults to "JOB CARD"; Vehicle
   * Service passes "VEHICLE SERVICE". */
  referenceLabel?: string;
};

export type InspectionPdfItem = {
  section: string;
  name: string;
  condition: string | null;
  severity: string | null;
  action: string | null;
};

export type InspectionPdfProps = {
  organisation: {
    name: string;
    legalName: string | null;
    hqAddress: string | null;
    poBox: string | null;
    rcNumber: string | null;
    hotlines: string[];
    website: string | null;
    email: string | null;
  };
  branch: {
    name: string;
    address: string | null;
    hotlines: string[];
    email: string | null;
  };
  logoUrl: string;
  serviceNumber: string;
  customerName: string;
  vehicleDescription: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  inspectedByName: string;
  completedOnLabel: string;
  /** Reviewed items only: the customer copy never lists what wasn't checked
   * (same rule as the print page). */
  reviewedItems: InspectionPdfItem[];
};
