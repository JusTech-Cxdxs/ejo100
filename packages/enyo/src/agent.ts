/**
 * The agent loop: ask the model, run the tools it asks for (as the person),
 * feed the results back, until it answers. Bounded in steps, tool calls and
 * time, and every figure in the final answer is checked against the tool results.
 */
import type { LlmConfig } from './config';
import { LlmError, llmErrorMessage, stream, type ChatMessage, type ToolCall, type Usage } from './llm';
import { clip, stripCitationMarks, ungroundedFigures } from './guardrails';
import { parseArgs, toolSpec, validateArgs, type Source, type Tool, type ToolResult } from './tools';
import type { EnyoDraft, EnyoEvent } from './protocol';

export type ToolRun = { name: string; args: Record<string, unknown>; ok: boolean; refused: boolean; ms: number };

export type AgentResult = {
  answer: string;
  /** The assistant and tool messages to store after the user's message. */
  transcript: ChatMessage[];
  toolRuns: ToolRun[];
  sources: Source[];
  drafts: EnyoDraft[];
  usage: Usage;
  model: string;
  /** Money figures in the answer that no tool returned. */
  unverified: number[];
  /** `detail` / `status` come from the model server: for the error log, never for the person. */
  error?: { kind: string; message: string; detail?: string; status?: number; code?: string };
};

export type AgentOptions<Ctx> = {
  config: LlmConfig;
  system: string;
  /** Earlier turns (already trimmed to a budget) and the new user message last. */
  messages: ChatMessage[];
  tools: Tool<Ctx>[];
  ctx: Ctx;
  emit: (e: EnyoEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  maxToolCalls?: number;
  /** How much of each tool result the model sees. */
  maxToolChars?: number;
  /** Total time for the whole answer, all steps included (default 55 s, under a 60 s function limit). */
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
};

const isDraft = (d: unknown): d is { draft: EnyoDraft } => !!d && typeof d === 'object' && 'draft' in (d as Record<string, unknown>);

export async function runAgent<Ctx>(o: AgentOptions<Ctx>): Promise<AgentResult> {
  const maxSteps = o.maxSteps ?? 6;
  const maxToolCalls = o.maxToolCalls ?? 10;
  const maxToolChars = o.maxToolChars ?? 8000;
  const byName = new Map(o.tools.map((t) => [t.name, t]));
  const specs = o.tools.map(toolSpec);
  const convo: ChatMessage[] = [{ role: 'system', content: o.system }, ...o.messages];
  const transcript: ChatMessage[] = [];
  const toolRuns: ToolRun[] = [];
  const evidence: unknown[] = [];
  const sources: Source[] = [];
  const drafts: EnyoDraft[] = [];
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };
  let model = o.config.model;
  let answer = '';
  let calls = 0;
  const deadlineAt = Date.now() + (o.deadlineMs ?? 55_000);
  const deadline = AbortSignal.timeout(o.deadlineMs ?? 55_000);
  const signal = o.signal ? AbortSignal.any([o.signal, deadline]) : deadline;
  const outOfTime = () => deadline.aborted && !o.signal?.aborted;

  for (let step = 0; step < maxSteps; step += 1) {
    // The last step offers no tools, so the model must answer with what it has.
    const lastStep = step === maxSteps - 1 || calls >= maxToolCalls;
    let text = '';
    let toolCalls: ToolCall[] = [];
    try {
      for await (const piece of stream(o.config, { messages: convo, tools: lastStep ? undefined : specs, signal }, o.fetchImpl)) {
        if (piece.type === 'text') {
          text += piece.text;
          o.emit({ type: 'text', text: piece.text });
        } else {
          toolCalls = piece.completion.toolCalls;
          usage.tokensIn += piece.completion.usage.tokensIn;
          usage.tokensOut += piece.completion.usage.tokensOut;
          model = piece.completion.model;
        }
      }
    } catch (err) {
      const kind = outOfTime() ? 'timeout' : err instanceof LlmError ? err.kind : 'bad_response';
      const message = llmErrorMessage(kind as never);
      const extra = err instanceof LlmError ? { ...(err.detail ? { detail: err.detail } : {}), ...(err.status ? { status: err.status } : {}), ...(err.code ? { code: err.code } : {}) } : {};
      return { answer: stripCitationMarks(answer + text), transcript, toolRuns, sources, drafts, usage, model, unverified: [], error: { kind, message, ...extra } };
    }

    if (!toolCalls.length) {
      answer += text;
      transcript.push({ role: 'assistant', content: text });
      break;
    }

    // Text before a tool call ("Let me check…") stays part of the answer.
    answer += text ? `${text}\n\n` : '';
    if (text) o.emit({ type: 'text', text: '\n\n' });
    const assistantTurn: ChatMessage = { role: 'assistant', content: text, toolCalls };
    convo.push(assistantTurn);
    transcript.push(assistantTurn);

    for (const call of toolCalls) {
      if (signal.aborted) {
        const kind = outOfTime() ? 'timeout' : 'aborted';
        return { answer: stripCitationMarks(answer), transcript, toolRuns, sources, drafts, usage, model, unverified: [], error: { kind, message: llmErrorMessage(kind) } };
      }
      calls += 1;
      const tool = byName.get(call.name);
      let result: ToolResult;
      let args: Record<string, unknown> = {};
      const started = Date.now();
      if (!tool) {
        result = { ok: false, message: `There is no tool called "${call.name}".` };
      } else if (calls > maxToolCalls) {
        result = { ok: false, message: 'Too many lookups for one question. Answer with what you have.' };
      } else {
        const parsed = validateArgs(tool.parameters, parseArgs(call.arguments));
        if (!parsed.ok) {
          result = { ok: false, message: `Invalid arguments: ${parsed.message}` };
        } else {
          args = parsed.args;
          o.emit({ type: 'status', text: tool.status });
          try {
            // A slow lookup never runs past the deadline: the model answers with what it has.
            let timer: ReturnType<typeof setTimeout> | undefined;
            const slow = { ok: false as const, message: 'That lookup took too long. Answer with what you have and say what could not be checked.' };
            result = await Promise.race([
              tool.run(args, o.ctx),
              new Promise<ToolResult>((resolve) => {
                // At most 20 s per lookup, and always leaving ~8 s for the model to answer.
                timer = setTimeout(() => resolve(slow), Math.max(2_000, Math.min(20_000, deadlineAt - Date.now() - 8_000)));
                signal.addEventListener('abort', () => resolve(slow), { once: true });
              }),
            ]).finally(() => clearTimeout(timer));
          } catch {
            // Tool code throws only on unexpected failures; the details stay in the server log.
            result = { ok: false, message: 'That lookup failed. Tell the person it could not be checked right now.' };
          }
        }
      }
      const refused = !result.ok && !!result.refused;
      toolRuns.push({ name: call.name, args, ok: result.ok, refused, ms: Date.now() - started });
      o.emit({ type: 'tool', name: call.name, ok: result.ok, ...(refused ? { refused: true } : {}) });
      if (result.ok) {
        evidence.push(result.data);
        for (const s of result.sources ?? []) if (!sources.some((x) => x.label === s.label && x.href === s.href)) sources.push(s);
        if (isDraft(result.data)) {
          drafts.push(result.data.draft);
          o.emit({ type: 'draft', draft: result.data.draft });
        }
      }
      const content = result.ok
        ? clip(JSON.stringify(result.data), maxToolChars)
        : JSON.stringify({ error: result.message, ...(refused ? { refused: true } : {}) });
      const toolTurn: ChatMessage = { role: 'tool', toolCallId: call.id, name: call.name, content };
      convo.push(toolTurn);
      transcript.push(toolTurn);
    }
  }

  answer = stripCitationMarks(answer);
  if (sources.length) o.emit({ type: 'sources', sources });
  const unverified = ungroundedFigures(answer, evidence);
  if (unverified.length) {
    o.emit({ type: 'notice', text: "I couldn't match one or more amounts in this answer to the records. Please check them on the page before relying on them." });
  }
  return { answer, transcript, toolRuns, sources, drafts, usage, model, unverified };
}
