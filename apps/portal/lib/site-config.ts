/**
 * Names shown before anyone is signed in (sign-in pages, the password reset
 * email when the person has no organisation yet). Inside the app the
 * organisation's own record from the database is used instead.
 *
 * Set NEXT_PUBLIC_ORGANISATION_NAME per deployment; the default is the
 * product's own name so a fresh install never shows another company's.
 */
const organisationName = process.env.NEXT_PUBLIC_ORGANISATION_NAME?.trim() || 'EJO 100';

export const portalConfig = {
  productName: 'EJO 100 Enterprise Platform',
  companyName: organisationName,
  organisationName,
  poweredBy: 'Powered by EJO 100 Enterprise Platform',
};
