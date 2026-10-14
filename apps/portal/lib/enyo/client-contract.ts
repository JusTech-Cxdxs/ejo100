/**
 * What the Enyo panel expects from the server (types only — safe in the
 * browser). The route handlers (app/api/enyo/*) and the server actions in
 * lib/actions/enyo.ts are owned by the engine workstream; the panel calls
 * them through components/enyo/api.ts, which checks the actions against
 * `EnyoActions` below at compile time once they are connected.
 */
import type { EnyoDraft } from '@ejo/enyo/src/protocol';

export type EnyoSource = { label: string; href?: string };

/** GET /api/enyo/status */
export type EnyoStatus = {
  ready: boolean;
  reason?: 'not_configured' | 'switched_off' | string;
  displayName: string;
  provider?: string;
};

/** POST /api/enyo/chat body. */
export type EnyoChatRequest = { conversationId?: string; message: string; page?: string };

/** POST /api/enyo/refine */
export type EnyoTone = 'polite' | 'formal' | 'short' | 'friendly';
export type EnyoRefineRequest = { text: string; tone?: EnyoTone };
export type EnyoRefineResponse = { text: string } | { error: string; ref?: string };

/** A plain result for actions that change something. */
export type EnyoActionResult = { ok: true } | { ok: false; error: string };

export type EnyoConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string | Date;
};

export type EnyoStoredMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'user' | 'assistant';
  content: string;
  createdAt?: string | Date;
  rating?: number | null;
  sources?: EnyoSource[];
  drafts?: EnyoDraft[];
};

export type EnyoConversationDetail = {
  id: string;
  title: string | null;
  messages: EnyoStoredMessage[];
};

export type EnyoMemoryFact = { id: string; fact: string; createdAt: string | Date };

export type EnyoAdminSettings = {
  enabled: boolean;
  staffAssistant: boolean;
  customerAssistant: boolean;
  publicAssistant: boolean;
  mailAi: boolean;
  predictionsMode: 'SHADOW' | 'SUGGEST' | 'OFF';
  displayName: string;
};

export type EnyoProviderInfo = { configured: boolean; label?: string; model?: string };

export type EnyoConnectionTest = { ok: true; latencyMs?: number; model?: string } | { ok: false; error?: string; message?: string; ref?: string };

/**
 * The server actions in lib/actions/enyo.ts, as the panel calls them.
 * The engine's real functions must be assignable to these. A change may
 * answer with { ok } or with nothing (void) and throw when refused; the
 * panel treats a throw as "did not work" and never shows its text.
 */
type Change = Promise<EnyoActionResult | void>;
export type EnyoActions = {
  listConversations: () => Promise<EnyoConversationSummary[]>;
  getConversation: (id: string) => Promise<EnyoConversationDetail | null>;
  renameConversation: (id: string, title: string) => Change;
  deleteConversation: (id: string) => Change;
  rateMessage: (messageId: string, rating: 1 | -1, note?: string) => Change;
  listMemories: () => Promise<EnyoMemoryFact[]>;
  deleteMemory: (id: string) => Change;
  saveEnyoSettings: (settings: EnyoAdminSettings) => Change;
  testEnyoConnection: () => Promise<EnyoConnectionTest>;
};
