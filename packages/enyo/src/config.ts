/**
 * Which language model Enyo talks to. Any OpenAI-compatible endpoint works:
 * a free hosted tier (Groq, OpenRouter, Google's OpenAI-compatible endpoint),
 * a model on the company's own server (Ollama, vLLM, LiteLLM), or a paid API.
 * The key is read from the server environment only; it never reaches a browser.
 */
export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  /** The model for conversations and tool use. */
  model: string;
  /** A smaller model for quick jobs (titles, email briefs, text refinement). Falls back to `model`. */
  fastModel: string;
  /** A short label shown on the Enyo settings page ("Groq", "Company server"). */
  providerLabel: string;
  timeoutMs: number;
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined): string => (v ?? '').trim();

/** Null when Enyo has no model configured: every Enyo feature then shows "not switched on yet". */
export function readLlmConfig(env: Env = process.env): LlmConfig | null {
  const baseUrl = clean(env.ENYO_LLM_BASE_URL).replace(/\/+$/, '');
  const model = clean(env.ENYO_LLM_MODEL);
  // A local model server (Ollama) needs no key; a hosted one does.
  const apiKey = clean(env.ENYO_LLM_API_KEY);
  if (!baseUrl || !model) return null;
  if (!/^https?:\/\//.test(baseUrl)) return null;
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(baseUrl);
  if (!apiKey && !local) return null;
  const timeout = Number(clean(env.ENYO_LLM_TIMEOUT_MS));
  return {
    baseUrl,
    apiKey,
    model,
    fastModel: clean(env.ENYO_LLM_FAST_MODEL) || model,
    providerLabel: clean(env.ENYO_LLM_PROVIDER_LABEL) || hostLabel(baseUrl),
    timeoutMs: Number.isFinite(timeout) && timeout >= 5_000 && timeout <= 120_000 ? timeout : 45_000,
  };
}

function hostLabel(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    if (host.includes('groq')) return 'Groq';
    if (host.includes('openrouter')) return 'OpenRouter';
    if (host.includes('googleapis')) return 'Google';
    if (host.includes('anthropic')) return 'Anthropic';
    if (host.includes('openai')) return 'OpenAI';
    if (host === 'localhost' || host === '127.0.0.1') return 'Local model server';
    return host;
  } catch {
    return 'Model server';
  }
}
