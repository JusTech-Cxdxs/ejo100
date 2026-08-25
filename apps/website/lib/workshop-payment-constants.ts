/**
 * Mirrors apps/portal/lib/workshop-constants.ts's COMPANY_BANK_DETAILS
 * and MINIMUM_DEPOSIT_FRACTION exactly — duplicated rather than
 * imported across apps because apps/portal and apps/website are
 * separate workspace packages with no existing cross-app import
 * pattern in this project (each app has always kept its own lib/
 * folder). If these values change, update both copies. Once a real
 * company-settings model exists, both should read from that instead.
 */

export const COMPANY_BANK_DETAILS = {
  bankName: 'Zenith Bank',
  accountName: 'Kewalram Nigeria',
  accountNumber: 'XXX',
};

export const MINIMUM_DEPOSIT_FRACTION = 0.7;
