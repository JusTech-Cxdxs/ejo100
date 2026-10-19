import type { NextRequest } from 'next/server';
import { prisma, type Prisma } from '@ejo/database';
import { clip, encodeEvent, lagosNow, redactForLog, routeModel, runAgent, SSE_HEADERS, trimHistory, type ChatMessage, type EnyoEvent } from '@ejo/enyo';
import { briefing, isBriefingRequest } from '@/lib/enyo/briefing';
import { briefingSystemPrompt } from '@/lib/enyo/briefing-core';
import { requireUser } from '@/lib/actions/workshop';
import { enyoReady } from '@/lib/enyo/settings';
import { staffToolsFor } from '@/lib/enyo/tools';
import { cleanPage, MAX_MESSAGE_CHARS, overRateLimit, roleDescription, sameOrigin, sseError, staffContext, staffSystemPrompt, titleFrom } from '@/lib/enyo/server';
import { logError } from '@/lib/errors';
import { findLearned, noteLearnedUse } from '@/lib/enyo/learned';
import { workProfile } from '@/lib/enyo/work-profile';
import { canReuse, reuseAllowed } from '@/lib/enyo/learned-core';
import { tokenise } from '@/lib/enyo/predict/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ID = /^[a-z0-9]{20,40}$/;
const SOMETHING_WRONG = 'Something went wrong on my side. Please try again, and if it keeps happening, quote reference';

/**
 * POST /api/enyo/chat — the staff assistant.
 * Body: { conversationId?: string, message: string, page?: string }.
 * Answers with Server-Sent Events (EnyoEvent): `conversation` first, then
 * status / text / tool / sources / draft / notice, then `done` or `error`.
 *
 * Runs as the signed-in person (the colleague, during an assisted session):
 * every tool calls the module's own authorised code, so Enyo sees exactly
 * what the person can see. Refusals before streaming starts are one `error`
 * event with the matching HTTP status (401 JSON when not signed in).
 */
export async function POST(request: NextRequest) {
  // Everything — the set-up reads, the model, the tools — must finish (and say so) inside the function's limit.
  const requestStarted = Date.now();
  if (!sameOrigin(request)) return Response.json({ error: 'This request must come from the portal itself.' }, { status: 403 });
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  let body: { conversationId?: unknown; message?: unknown; page?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_MESSAGE_CHARS * 4 + 2000) return sseError(413, `Please keep your message under ${MAX_MESSAGE_CHARS.toLocaleString('en-NG')} characters.`);
    body = JSON.parse(raw);
  } catch {
    return sseError(400, 'I could not read that message. Please try again.');
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return sseError(400, 'Type a question first.');
  if (message.length > MAX_MESSAGE_CHARS) return sseError(413, `Please keep your message under ${MAX_MESSAGE_CHARS.toLocaleString('en-NG')} characters. You could split it into two questions.`);
  const conversationId = typeof body.conversationId === 'string' && ID.test(body.conversationId) ? body.conversationId : null;
  if (body.conversationId !== undefined && body.conversationId !== null && body.conversationId !== '' && !conversationId) return sseError(404, 'That conversation is not available. Start a new one.');

  try {
    const { ctx, organisationId, assistantName, assistStartedAt: assistStart } = await staffContext(cleanPage(body.page));
    ctx.question = message;
    if (!organisationId) return sseError(403, 'Your account is not placed in an organisation yet, so I cannot help here. Please ask an administrator.');
    const ready = await enyoReady(organisationId, 'staffAssistant');
    if (!ready.ready) {
      return sseError(503, ready.reason === 'not_configured'
        ? 'I am not switched on for this installation yet. JusTech sets me up; please check back later.'
        : 'I am switched off for your organisation at the moment. An administrator can switch me on in Settings.');
    }
    if (await overRateLimit(userId)) return sseError(429, 'You are asking faster than I can keep up. Please wait a minute and try again.');

    // The conversation: the person's own (during an assisted session, one started in it).
    let convo = conversationId
      ? await prisma.enyoConversation.findFirst({
          where: { id: conversationId, userId, organisationId, channel: 'STAFF', archivedAt: null, ...(assistStart ? { createdAt: { gte: assistStart } } : {}) },
          select: { id: true, title: true },
        })
      : null;
    if (conversationId && !convo) return sseError(404, 'That conversation is not available. Start a new one.');

    const history: ChatMessage[] = convo
      ? (await prisma.enyoMessage.findMany({ where: { conversationId: convo.id, role: { in: ['USER', 'ASSISTANT'] } }, orderBy: { createdAt: 'desc' }, take: 40, select: { role: true, content: true } }))
          .reverse()
          .filter((m) => m.content.trim())
          .map((m) => (m.role === 'USER' ? { role: 'user' as const, content: m.content } : { role: 'assistant' as const, content: m.content }))
      : [];
    if (!convo) convo = await prisma.enyoConversation.create({ data: { organisationId, channel: 'STAFF', userId, title: titleFrom(message) }, select: { id: true, title: true } });
    const conversation = convo;
    await prisma.enyoMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: message } });

    const memory = ctx.assisted ? [] : (await prisma.enyoMemory.findMany({ where: { userId, organisationId }, orderBy: { createdAt: 'asc' }, take: 50, select: { fact: true } })).map((m) => m.fact);
    // What colleagues found helpful for this kind of question (organisation's own).
    const learned = await findLearned(organisationId, ['STAFF', 'SUPPORT'], message, 2).catch(() => []);
    const reuse = canReuse(learned[0], tokenise(message)) && reuseAllowed({ question: message, historyLength: history.length, assisted: Boolean(ctx.assisted), page: ctx.page }) ? learned[0]! : null;
    // How this person works here (their own actions), so answers fit their job — never during an assisted session.
    const profile = ctx.assisted ? null : await workProfile(userId, organisationId);
    const system = await staffSystemPrompt({ ctx, settings: ready.settings, organisationId, memory, assistantName, examples: learned.map((l) => ({ question: l.question, answer: l.answer })), workProfile: profile });
    const turns: ChatMessage[] = [...trimHistory(history, 8_000, 12), { role: 'user', content: message }];
    // Cost: small talk and short how-to go to the fast model; records and figures to the main one.
    const route = routeModel(message, ready.config);

    const encoder = new TextEncoder();
    const started = Date.now();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (e: EnyoEvent) => {
          if (!open) return;
          try { controller.enqueue(encoder.encode(encodeEvent(e))); } catch { open = false; }
        };
        const finish = () => { if (open) { open = false; try { controller.close(); } catch { /* already closed */ } } };
        emit({ type: 'conversation', id: conversation.id });
        // Practically the same question as one colleagues found answered well: that answer, at once, no model call.
        if (reuse) {
          try {
            const text = `${reuse.answer}\n\n_This is an answer colleagues found helpful for the same question. Ask me again in other words if you need something different._`;
            emit({ type: 'text', text });
            const saved = await prisma.enyoMessage.create({ data: { conversationId: conversation.id, role: 'ASSISTANT', content: text, model: 'learned', latencyMs: Date.now() - started, citations: { sources: [], learnedFrom: reuse.id } as Prisma.InputJsonValue }, select: { id: true } });
            await noteLearnedUse(reuse.id);
            await prisma.enyoConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }).catch(() => undefined);
            emit({ type: 'done', messageId: saved.id });
          } catch (err) {
            const ref = logError('enyo.chat', err, { conversationId: conversation.id });
            emit({ type: 'error', message: `${SOMETHING_WRONG} ${ref}.`, ref });
          } finally {
            finish();
          }
          return;
        }
        // "Brief me": the figures gathered in code as this person, one small model request to write them up,
        // and a hand-written briefing when the model is refused or away (lib/enyo/briefing.ts).
        if (isBriefingRequest(message)) {
          try {
            const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true } }).catch(() => null);
            const result = await briefing({
              ctx, config: ready.config, model: ready.config.model, message, emit, signal: request.signal,
              system: briefingSystemPrompt({ assistantName: ready.settings.displayName || 'Enyo', organisationName: org?.name || process.env.NEXT_PUBLIC_ORGANISATION_NAME || 'the organisation', personName: ctx.name.split(/\s+/)[0] || ctx.name, roleDescription: roleDescription(ctx.roleSlugs, ctx.isSuperAdmin), now: lagosNow(), branch: null }),
            });
            if (result.toolRuns.length) await prisma.enyoMessage.createMany({ data: result.toolRuns.map((t) => ({ conversationId: conversation.id, role: 'TOOL' as const, toolName: t.name, content: JSON.stringify({ ok: t.ok, ...(t.refused ? { refused: true } : {}) }) })) });
            const saved = await prisma.enyoMessage.create({
              data: { conversationId: conversation.id, role: 'ASSISTANT', content: result.answer, citations: { sources: result.sources } as Prisma.InputJsonValue, model: result.model, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, latencyMs: Date.now() - started },
              select: { id: true },
            });
            if (result.sources.length) emit({ type: 'sources', sources: result.sources });
            await prisma.enyoConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }).catch(() => undefined);
            emit({ type: 'done', messageId: saved.id });
          } catch (err) {
            const ref = logError('enyo.briefing', err, { conversationId: conversation.id });
            emit({ type: 'error', message: `${SOMETHING_WRONG} ${ref}.`, ref });
          } finally {
            finish();
          }
          return;
        }
        try {
          // Only the tools this question can need (each request stays small for the model's per-minute budget);
          // too big or too frequent anyway → once more with fewer tools, fewer turns and the fast model.
          const previous = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
          const offer = staffToolsFor(message, previous);
          const result = await runAgent({
            config: { ...ready.config, model: route.model }, system, messages: turns, tools: offer.tools, ctx, emit, signal: request.signal,
            deadlineMs: Math.max(8_000, 52_000 - (Date.now() - requestStarted)), maxToolChars: 6000,
            retrySmaller: { tools: offer.slim, model: ready.config.fastModel && ready.config.fastModel !== route.model ? ready.config.fastModel : undefined, keepMessages: 4 },
          });
          // Keep what was said: which tools ran and how they ended, and the answer.
          // Tool RESULTS are not kept: they can hold email text or records whose own
          // retention and consent rules (mail: 90 days, withdrawn consent) must win.
          const rows: Prisma.EnyoMessageCreateManyInput[] = [];
          let run = 0;
          for (const m of result.transcript) {
            if (m.role === 'assistant' && m.toolCalls?.length) {
              rows.push({ conversationId: conversation.id, role: 'ASSISTANT', content: '', toolCalls: m.toolCalls.map((c) => ({ name: c.name, arguments: clip(redactForLog(c.arguments), 500) })) });
            } else if (m.role === 'tool') {
              const outcome = result.toolRuns[run];
              run += 1;
              rows.push({ conversationId: conversation.id, role: 'TOOL', toolName: m.name, content: JSON.stringify({ ok: outcome?.ok ?? false, ...(outcome?.refused ? { refused: true } : {}) }) });
            }
          }
          if (rows.length) await prisma.enyoMessage.createMany({ data: rows });
          let messageId: string | null = null;
          if (result.answer.trim()) {
            const saved = await prisma.enyoMessage.create({
              data: {
                conversationId: conversation.id, role: 'ASSISTANT', content: result.answer,
                citations: { sources: result.sources, ...(result.drafts.length ? { drafts: result.drafts } : {}), ...(result.unverified.length ? { unverified: result.unverified } : {}) } as Prisma.InputJsonValue,
                model: result.model, tokensIn: result.usage.tokensIn, tokensOut: result.usage.tokensOut, latencyMs: Date.now() - started,
              },
              select: { id: true },
            });
            messageId = saved.id;
          }
          await prisma.enyoConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }).catch(() => undefined);
          if (result.error) {
            if (result.error.kind !== 'aborted') emit({ type: 'error', message: result.error.message });
            // The model server's own reason goes to the error log for administrators (never to the person).
            if (result.error.kind === 'auth' || result.error.kind === 'not_found' || result.error.kind === 'rejected') logError('enyo.model', new Error(`${result.error.kind} ${result.error.status ?? ''} ${result.error.code ?? ''} ${result.error.detail ?? ''}`.trim()));
          } else {
            emit({ type: 'done', messageId: messageId ?? '' });
          }
        } catch (err) {
          const ref = logError('enyo.chat', err, { conversationId: conversation.id });
          emit({ type: 'error', message: `${SOMETHING_WRONG} ${ref}.`, ref });
        } finally {
          finish();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    const ref = logError('enyo.chat', err);
    return sseError(500, `${SOMETHING_WRONG} ${ref}.`, ref);
  }
}
