/**
 * Customers brought in from SAP or old spreadsheets may have no email
 * address (v-A0). They are full customer records, reached by phone; every
 * email to them is refused with this message, before anything is recorded
 * as sent, and never sent to a made-up address.
 */
export const NO_CUSTOMER_EMAIL = 'This customer has no email address on file. Add one on their customer page, or reach them by phone.';

/** True when there is a real address to write to. */
export function hasEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && email.trim().length > 0;
}
