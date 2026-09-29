/**
 * Who pays for each Job Card estimate line — ONE rule for every total the
 * customer is asked to pay (payment status, deposits, recording payments,
 * close requests, reminders, emails, the Job Card page and print). A line
 * with no bill-to (older data) is the customer's, exactly as before.
 */
export type BillTo = 'CUSTOMER' | 'WARRANTY' | 'GOODWILL' | 'INTERNAL';

export const BILL_TO_LABEL: Record<BillTo, string> = {
  CUSTOMER: 'Customer',
  WARRANTY: 'Warranty',
  GOODWILL: 'Goodwill',
  INTERNAL: 'Internal',
};

export function isCustomerLine(li: { billTo?: string | null }): boolean {
  return !li.billTo || li.billTo === 'CUSTOMER';
}

const amt = (li: { amount: unknown }) => (li.amount === null || li.amount === undefined ? 0 : Number(li.amount));

/** What the customer pays: customer lines only. */
export function customerTotal(lines: { amount: unknown; billTo?: string | null }[]): number {
  return Math.round(lines.filter(isCustomerLine).reduce((s, li) => s + amt(li), 0) * 100) / 100;
}

/** The whole estimate split by who pays. */
export function billingSplit(lines: { amount: unknown; billTo?: string | null }[]) {
  const by = (b: BillTo) => Math.round(lines.filter((li) => (li.billTo ?? 'CUSTOMER') === b).reduce((s, li) => s + amt(li), 0) * 100) / 100;
  const customer = customerTotal(lines);
  const warranty = by('WARRANTY');
  const goodwill = by('GOODWILL');
  const internal = by('INTERNAL');
  return { customer, warranty, goodwill, internal, covered: Math.round((warranty + goodwill + internal) * 100) / 100, total: Math.round((customer + warranty + goodwill + internal) * 100) / 100 };
}

/** Text shown in place of a price for a covered line. */
export function coveredLabel(billTo: string | null | undefined, warrantyNumber?: string | null): string {
  if (billTo === 'WARRANTY') return `Covered by warranty${warrantyNumber ? ` ${warrantyNumber}` : ''} — not charged`;
  if (billTo === 'GOODWILL') return 'Goodwill — not charged';
  if (billTo === 'INTERNAL') return 'Internal — not charged';
  return '';
}
