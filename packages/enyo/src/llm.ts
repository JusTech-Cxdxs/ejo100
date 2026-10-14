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
  signal?: AbortSignal;
};

export type Usage = { tokensIn: number; tokensOut: number };

export type Completion = { content: string; toolCalls: ToolCall[]; usage: Usage; model: string; finishReason: string };

export type LlmErrorKind = 'timeout' | 'rate_limited' | 'unavailable' | 'rejected' | 'bad_response' | 'aborted';

/** What went wrong, in a form the app can turn into a calm message. Never carries the key or the prompt. */
export class LlmError extends Error {
  constructor(public readonly kind: LlmErrorKind, message: string, public readonly status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Friendly text for each failure, shown to people instead of library messages. */
export function llmErrorMessage(kind: LlmErrorKind): string {
  switch (kind) {
    case 'timeout': return 'I took too long to think about that. Please try again, or ask a shorter question.';
    case 'rate_limited': return "I'm handling a lot of questions right now. Please try again in a minute.";
    case 'unavailable': return "I can't reach my thinking engine just now. Please try again in a minute.";
    case 'rejected': return "I couldn't answer that one. Please rephrase it and try again.";
    case 'aborted': return 'Stopped.';
    default: return 'Something went wrong on my side. Please try again.';
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

function body(config: LlmConfig, req: CompletionRequest, stream: boolean): string {
  return JSON.stringify({
    model: req.model ?? config.model,
    messages: wireMessages(req.messages),
    ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
    temperature: req.temperature ?? 0.2,
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  });
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new LlmError('aborted', 'Aborted')); }, { once: true });
});

/** POST with a timeout and up to two retries on 429 / 5xx / network errors. */
async function post(config: LlmConfig, payload: string, signal: AbortSignal | undefined, fetchImpl: Fetch): Promise<Response> {
  let lastError: LlmError = new LlmError('unavailable', 'No attempt made');
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new LlmError(res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'unavailable' : 'rejected', `Model server answered ${res.status}`, res.status);
      await res.body?.cancel().catch(() => undefined);
      if (!retryable) throw lastError;
      const after = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 5_000) : 600 * (attempt + 1), signal);
    } catch (err) {
      if (err instanceof LlmError) {
        if (err.kind === 'rejected' || err.kind === 'aborted') throw err;
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
