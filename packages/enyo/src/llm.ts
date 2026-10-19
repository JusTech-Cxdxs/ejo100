/**
 * A small client for any OpenAI-compatible chat endpoint, with tool calling
 * and streaming. No SDK: plain fetch, so it runs the same on Vercel, Render,
 * a company's own server or in tests.
 */
import type { LlmConfig } from './config';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ToolCall = { id: string; name: string; arguments: string };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

/** A tool as the model sees it: a name, what it does, and a JSON Schema for its input. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

export type CompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** Override the configured model (e.g. the fast model). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** For reasoning models: how much to think (default: low for short jobs, medium otherwise). */
  reasoning?: 'low' | 'medium' | 'high';
  signal?: AbortSignal;
};

export type Usage = { tokensIn: number; tokensOut: number };

export type Completion = { content: string; toolCalls: ToolCall[]; usage: Usage; model: string; finishReason: string };

export type LlmErrorKind = 'timeout' | 'rate_limited' | 'unavailable' | 'rejected' | 'auth' | 'not_found' | 'bad_response' | 'aborted';

/** What went wrong, in a form the app can turn into a calm message. Never carries the key or the prompt. */
export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    public readonly status?: number,
    /** The model server's own explanation (keys redacted, at most 240 characters) — for administrators and logs only. */
    public readonly detail?: string,
    /** The model server's error code, e.g. "invalid_api_key", "model_not_found", "tool_use_failed". */
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Anything that looks like a key or a bearer token, hidden. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(gsk|sk|sk-proj|sk-or|xai|pk|rk|key|AIza)[-_][A-Za-z0-9_\-]{8,}/g, '[key hidden]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [hidden]')
    .replace(/\b[A-Za-z0-9_\-]{40,}\b/g, '[hidden]');
}

/** The kind of failure for an HTTP status from the model server. */
export function kindForStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'rejected';
}

/** The model server's error body → a short, key-free explanation and code. */
export function readErrorBody(text: string): { detail?: string; code?: string } {
  let detail = text;
  let code: string | undefined;
  try {
    const j = JSON.parse(text) as { error?: { message?: unknown; code?: unknown; type?: unknown } | string; message?: unknown };
    const e = typeof j.error === 'object' && j.error ? j.error : undefined;
    detail = String(e?.message ?? (typeof j.error === 'string' ? j.error : j.message) ?? text);
    const c = e?.code ?? e?.type;
    code = typeof c === 'string' && /^[a-z0-9_.-]{1,60}$/i.test(c) ? c : undefined;
  } catch { /* not JSON: keep the text */ }
  const clean = redactSecrets(detail.replace(/\s+/g, ' ').trim()).slice(0, 240);
  return { ...(clean ? { detail: clean } : {}), ...(code ? { code } : {}) };
}

/**
 * How long the model server asked us to wait, in milliseconds: the Retry-After
 * header, or the "Please try again in 1m2.5s" / "in 750ms" that Groq and others
 * put in the message. Undefined when nothing was said.
 */
export function retryAfterMs(detail: string | undefined, header?: string | null): number | undefined {
  const h = Number(header);
  if (Number.isFinite(h) && h > 0) return Math.round(h * 1000);
  const m = /try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|h|m|s)\s*)+)/i.exec(detail ?? '');
  if (!m) return undefined;
  let ms = 0;
  for (const part of m[1]!.matchAll(/(\d+(?:\.\d+)?)\s*(h|ms|m|s)/gi)) {
    const n = Number(part[1]);
    const unit = part[2]!.toLowerCase();
    ms += unit === 'h' ? n * 3_600_000 : unit === 'm' ? n * 60_000 : unit === 's' ? n * 1000 : n;
  }
  return ms > 0 ? Math.round(ms) : undefined;
}

/** Friendly text for each failure, shown to people instead of library messages. */
export function llmErrorMessage(kind: LlmErrorKind): string {
  switch (kind) {
    case 'timeout': return 'I took too long to think about that. Please try again, or ask a shorter question.';
    case 'rate_limited': return "I'm handling a lot of questions right now. Please try again in a minute.";
    case 'unavailable': return "I can't reach my thinking engine just now. Please try again in a minute.";
    case 'rejected': return "I couldn't answer that one. Please rephrase it and try again.";
    case 'auth':
    case 'not_found': return "I'm not set up correctly at the moment. Please let an administrator know (Settings → Enyo → Test connection).";
    case 'aborted': return 'Stopped.';
    default: return 'Something went wrong on my side. Please try again.';
  }
}

/** For administrators (the connection test): what is wrong and what to change. Never includes the key. */
export function llmAdminMessage(err: LlmError): string {
  const why = err.detail ? ` The model server said: "${err.detail}"` : '';
  const status = err.status ? ` (HTTP ${err.status})` : '';
  switch (err.kind) {
    case 'auth': return `The model server refused the key${status}. Check ENYO_LLM_API_KEY: paste the key again with no quotes or spaces, make sure it has not been deleted or expired, then redeploy.${why}`;
    case 'not_found': return `The model or the address was not found${status}. Check ENYO_LLM_MODEL (the exact model id) and ENYO_LLM_BASE_URL (it ends in /v1 for most providers, without /chat/completions), then redeploy.${why}`;
    case 'rejected': return `The model server rejected the request${status}. The model id may not exist for this provider, or it does not accept one of the settings.${why}`;
    case 'rate_limited': return `The model server says too many requests${status}. Wait a minute and test again; on a free tier, check its limits.${why}`;
    case 'unavailable': return `The model server could not be reached or had an error${status}. Check ENYO_LLM_BASE_URL and that the provider is up.${why}`;
    case 'timeout': return 'The model server took too long to answer. Try again; if it keeps happening, choose a faster model or raise ENYO_LLM_TIMEOUT_MS.';
    case 'bad_response': return `The model server answered in an unexpected format. Check that ENYO_LLM_BASE_URL points at an OpenAI-compatible endpoint.${why}`;
    default: return llmErrorMessage(err.kind);
  }
}

type Fetch = typeof fetch;

function wireMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, name: m.name, content: m.content };
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

/**
 * Reasoning models (OpenAI's gpt-oss, served by Groq and others) think before
 * they answer, and the thinking counts against max_tokens. Short jobs (a
 * brief, a refined sentence, a connection test) ask for little thinking and
 * get extra room, so the answer is never cut to nothing; the reasoning text
 * itself is never returned. A server that refuses these settings gets the
 * request again without them (post()).
 */
export function isReasoningModel(model: string): boolean {
  return /(^|\/)gpt-oss|(^|\/)o[134](-|$)/i.test(model);
}

const REASONING_ROOM = 1024;

/** The request itself carries the reasoning settings (not merely a message mentioning them). */
function hasReasoningSettings(payload: string): boolean {
  try {
    const p = JSON.parse(payload) as Record<string, unknown>;
    return 'reasoning_effort' in p || 'include_reasoning' in p;
  } catch {
    return false;
  }
}

function body(config: LlmConfig, req: CompletionRequest, stream: boolean): string {
  const model = req.model ?? config.model;
  const reasoning = isReasoningModel(model);
  const effort = req.reasoning ?? (req.maxTokens !== undefined && req.maxTokens <= 1200 ? 'low' : 'medium');
  return JSON.stringify({
    model,
    messages: wireMessages(req.messages),
    ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
    temperature: req.temperature ?? 0.2,
    ...(req.maxTokens ? { max_tokens: reasoning ? req.maxTokens + REASONING_ROOM : req.maxTokens } : {}),
    ...(reasoning ? { reasoning_effort: effort, include_reasoning: false } : {}),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  });
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new LlmError('aborted', 'Aborted')); }, { once: true });
});

/** The longest the request waits for a per-minute budget to free before retrying. */
export const MAX_RETRY_WAIT_MS = 12_000;

/** POST with a timeout and up to three retries on 429 / 5xx / network errors. */
async function post(config: LlmConfig, firstPayload: string, signal: AbortSignal | undefined, fetchImpl: Fetch): Promise<Response> {
  let lastError: LlmError = new LlmError('unavailable', 'No attempt made');
  let payload = firstPayload;
  let toolRetry = false;
  let giveUp = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal?.aborted) throw new LlmError('aborted', 'Aborted');
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), config.timeoutMs);
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
        body: payload,
        signal: timeout.signal,
      });
      if (res.ok) return res;
      const { detail, code } = readErrorBody((await res.text().catch(() => '')).slice(0, 4000));
      const kind = kindForStatus(res.status);
      lastError = new LlmError(kind, `Model server answered ${res.status}`, res.status, detail, code);
      // Some servers do not accept stream_options: send the request again without it.
      if (kind === 'rejected' && payload.includes('"stream_options"') && /stream_options/i.test(detail ?? '')) {
        const p = JSON.parse(payload) as Record<string, unknown>;
        delete p.stream_options;
        payload = JSON.stringify(p);
        continue;
      }
      // A server that does not know the reasoning settings: send it again without them.
      if (kind === 'rejected' && /reasoning/i.test(detail ?? '') && hasReasoningSettings(payload)) {
        const p = JSON.parse(payload) as Record<string, unknown>;
        delete p.reasoning_effort;
        delete p.include_reasoning;
        payload = JSON.stringify(p);
        continue;
      }
      // A model sometimes writes a malformed tool call (Groq: "tool_use_failed"): one more try.
      if (kind === 'rejected' && code === 'tool_use_failed' && !toolRetry) {
        toolRetry = true;
        continue;
      }
      const retryable = kind === 'rate_limited' || kind === 'unavailable';
      if (!retryable) throw lastError;
      // Wait as long as the server asked, when that is short enough to be worth it (a per-minute
      // token budget usually frees in seconds); a long wait is reported at once instead.
      const asked = retryAfterMs(detail, res.headers.get('retry-after'));
      if (asked !== undefined && asked > MAX_RETRY_WAIT_MS) { giveUp = true; throw lastError; }
      await sleep(asked !== undefined ? Math.max(asked + 250, 500) : 600 * (attempt + 1), signal);
    } catch (err) {
      if (err instanceof LlmError) {
        if (giveUp || err.kind === 'rejected' || err.kind === 'auth' || err.kind === 'not_found' || err.kind === 'aborted') throw err;
        lastError = err;
      } else if (signal?.aborted) {
        throw new LlmError('aborted', 'Aborted');
      } else if (timeout.signal.aborted) {
        throw new LlmError('timeout', 'The model took too long');
      } else {
        lastError = new LlmError('unavailable', 'Could not reach the model server');
        await sleep(600 * (attempt + 1), signal).catch(() => undefined);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError;
}

type WireToolCall = { id?: string; index?: number; function?: { name?: string; arguments?: string } };

function readUsage(u: unknown): Usage {
  const x = (u ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return { tokensIn: x.prompt_tokens ?? 0, tokensOut: x.completion_tokens ?? 0 };
}

/** One request, whole answer. */
export async function complete(config: LlmConfig, req: CompletionRequest, fetchImpl: Fetch = fetch): Promise<Completion> {
  const res = await post(config, body(config, req, false), req.signal, fetchImpl);
  let json: { choices?: { message?: { content?: string | null; tool_calls?: WireToolCall[] }; finish_reason?: string }[]; usage?: unknown; model?: string };
  try {
    json = await res.json();
  } catch {
    throw new LlmError('bad_response', 'The model server sent something that is not JSON');
  }
  const choice = json.choices?.[0];
  if (!choice?.message) throw new LlmError('bad_response', 'The model server sent no answer');
  const toolCalls = (choice.message.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${i}`, name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}' })).filter((c) => c.name);
  return { content: choice.message.content ?? '', toolCalls, usage: readUsage(json.usage), model: json.model ?? req.model ?? config.model, finishReason: choice.finish_reason ?? 'stop' };
}

export type StreamPiece = { type: 'text'; text: string } | { type: 'done'; completion: Completion };

/**
 * Streams one request. Text arrives piece by piece; tool calls are assembled
 * and returned with the final `done` piece.
 */
export async function* stream(config: LlmConfig, req: CompletionRequest, fetchImpl: Fetch = fetch): AsyncGenerator<StreamPiece> {
  const res = await post(config, body(config, req, true), req.signal, fetchImpl);
  if (!res.body) throw new LlmError('bad_response', 'The model server sent no stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage: Usage = { tokensIn: 0, tokensOut: 0 };
  let finishReason = 'stop';
  let model = req.model ?? config.model;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const idle = () => new LlmError('timeout', 'The model stopped sending');
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(idle()), config.timeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let json: { choices?: { delta?: { content?: string | null; tool_calls?: WireToolCall[] }; finish_reason?: string | null }[]; usage?: unknown; model?: string };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.model) model = json.model;
        if (json.usage) usage = readUsage(json.usage);
        const choice = json.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const text = choice.delta?.content;
        if (text) {
          content += text;
          yield { type: 'text', text };
        }
        for (const d of choice.delta?.tool_calls ?? []) {
          const i = d.index ?? 0;
          const cur = calls.get(i) ?? { id: '', name: '', arguments: '' };
          if (d.id) cur.id = d.id;
          if (d.function?.name) cur.name += d.function.name;
          if (d.function?.arguments) cur.arguments += d.function.arguments;
          calls.set(i, cur);
        }
      }
    }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (req.signal?.aborted) throw new LlmError('aborted', 'Aborted');
    throw new LlmError('unavailable', 'The stream from the model server broke off');
  } finally {
    reader.releaseLock?.();
  }
  const toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments || '{}' })).filter((c) => c.name);
  yield { type: 'done', completion: { content, toolCalls, usage, model, finishReason } };
}
