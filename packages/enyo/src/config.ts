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
  /**
   * Models to try, in order, when the one asked for is out of its per-minute
   * or per-day budget. Free tiers (Groq) budget each model separately, so a
   * chain of models multiplies what Enyo can answer. ENYO_LLM_FALLBACK_MODELS
   * (comma-separated; "off" for none); Groq gets a sensible chain by default.
   */
  fallbackModels?: string[];
};

/** Groq's production chat models, strongest first (each has its own free-tier budget). */
export const GROQ_CHAIN = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];

/** The models to try after `primary`, in order, never repeating it. */
export function fallbacksFor(config: LlmConfig, primary: string): string[] {
  const list = config.fallbackModels ?? (/groq\.com/i.test(config.baseUrl) ? GROQ_CHAIN : []);
  return [...new Set(list.filter((m) => m && m !== primary))];
}

type Env = Record<string, string | undefined>;

/** Trimmed, and without quotes pasted around the value (a common copy-paste slip). */
const clean = (v: string | undefined): string => (v ?? '').trim().replace(/^(['"`])(.*)\1$/s, '$2').trim();

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
    ...readFallbacks(env.ENYO_LLM_FALLBACK_MODELS),
  };
}

function readFallbacks(raw: string | undefined): { fallbackModels?: string[] } {
  const v = clean(raw);
  if (!v) return {};
  if (/^(off|none|false|0)$/i.test(v)) return { fallbackModels: [] };
  return { fallbackModels: v.split(',').map((m) => m.trim()).filter((m) => /^[\w./:-]{1,120}$/.test(m)).slice(0, 6) };
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
    // Never show an internal host name to staff: set ENYO_LLM_PROVIDER_LABEL to name it.
    return 'Model server';
  } catch {
    return 'Model server';
  }
}
