/**
 * Who Enyo is talking to on the website. Decided by the SERVER from the
 * session (never by the browser): CUSTOMER = a valid, active customer
 * session; PUBLIC = anyone else, known only by a random visitor cookie.
 */
import type { EnyoEvent, LlmConfig, Tool } from '@ejo/enyo';
import type { SignedInCustomer } from '@/lib/customer-portal/session';

export type WebMode = 'CUSTOMER' | 'PUBLIC';

export type WebCtx = {
  mode: WebMode;
  organisationId: string;
  organisationName: string;
  conversationId: string;
  /** Set in CUSTOMER mode only — every customer tool reads with this id. */
  customer: SignedInCustomer | null;
  /** Set in PUBLIC mode only. */
  visitorKey: string | null;
  config: LlmConfig;
  /** For the hand-over tool's `handover` event. */
  emit: (e: EnyoEvent) => void;
};

export type WebTool = Tool<WebCtx>;
