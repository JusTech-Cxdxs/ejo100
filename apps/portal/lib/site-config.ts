/**
 * Names shown before anyone is signed in (sign-in pages, the password reset
 * email when the person has no organisation yet). Inside the app the
 * organisation's own record from the database is used instead.
 *
 * Set NEXT_PUBLIC_ORGANISATION_NAME per deployment; the default is the
 * product's own name so a fresh install never shows another company's.
 */
import { appShortName, PLATFORM } from './brand';
const organisationName = process.env.NEXT_PUBLIC_ORGANISATION_NAME?.trim() || PLATFORM.name;

export const portalConfig = {
  productName: PLATFORM.fullName,
  companyName: organisationName,
  organisationName,
  poweredBy: PLATFORM.poweredBy,
  /** The installed app's home-screen name: NEXT_PUBLIC_APP_SHORT_NAME, or the organisation's initials (KCG). */
  appShortName: appShortName(organisationName, process.env.NEXT_PUBLIC_APP_SHORT_NAME),
};
