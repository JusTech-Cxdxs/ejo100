/**
 * The streaming protocol between Enyo's server routes and the chat panels
 * (staff portal, customer portal, website). Server-Sent Events over a POST
 * response; one JSON object per event. Safe to import in the browser.
 */
import type { Source } from './tools';

export type EnyoEvent =
  /** A new or existing conversation id, sent first. */
  | { type: 'conversation'; id: string }
  /** What Enyo is doing ("Checking the parts list…"). */
  | { type: 'status'; text: string }
  /** A piece of the answer. */
  | { type: 'text'; text: string }
  /** A tool finished; refused = the person isn't allowed. Never carries data. */
  | { type: 'tool'; name: string; ok: boolean; refused?: boolean }
  /** Where the answer came from. */
  | { type: 'sources'; sources: Source[] }
  /** Something prepared for the person to confirm (a reminder, an email reply, a pre-filled form). */
  | { type: 'draft'; draft: EnyoDraft }
  /** A caution shown under the answer (e.g. a figure that could not be checked). */
  | { type: 'notice'; text: string }
  /** Handed to a person (customer and website assistants). */
  | { type: 'handover'; ticketNumber: string; text: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string; ref?: string };

/** A prepared action. Nothing happens until the person presses the confirm button, which runs the normal action. */
export type EnyoDraft = {
  kind: string;
  title: string;
  /** Plain-language lines describing what will happen. */
  lines: string[];
  /** Where confirming leads: a pre-filled page, or an action endpoint the panel calls. */
  href?: string;
  confirmLabel: string;
  payload?: Record<string, unknown>;
};

export const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
};

export function encodeEvent(e: EnyoEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`;
}

/** Reads events from a fetch() response body. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<EnyoEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            yield JSON.parse(line.slice(5).trim()) as EnyoEvent;
          } catch {
            // A broken event is skipped, never shown.
          }
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}
