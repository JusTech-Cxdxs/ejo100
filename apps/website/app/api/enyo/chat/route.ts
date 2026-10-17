/**
 * Enyo on the website: the customer portal and the public site.
 *
 * POST { conversationId?, message, page? } → text/event-stream of EnyoEvent
 * (`conversation` first, then status / text / tool / sources / handover /
 * notice, then `done` or `error`). Short JSON { error, ref? } instead when the
 * request is refused before it starts (origin, size, limits, switched off).
 *
 * GET [?conversation=<id>] → { ready, mode, displayName, message?, messages? }
 * for the chat button (and to reopen the caller's own conversation).
 *
 * The SERVER decides who is asking: a valid, active customer session is the
 * CUSTOMER assistant (that customer's own records only); anyone else is the
 * PUBLIC assistant (organisation information and hand-over only), known by a
 * random `enyo_visitor` cookie.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma, setAuditActor } from '@ejo/database';
import { buildSystemPrompt, encodeEvent, lagosNow, routeModel, runAgent, SSE_HEADERS, trimHistory, webLookupEnabled, webLookupTool, type EnyoEvent } from '@ejo/enyo';
import { currentCustomer, type SignedInCustomer } from '@/lib/customer-portal/session';
import { clientIp } from '@/lib/customer-audit';
import { recordErrorEvent, newRef, redact } from '@/lib/error-events';
import { websiteBaseUrl } from '@/lib/site-urls';
import { firstName } from '@/lib/customer-portal/format';
import { notReadyMessage, siteOrganisation, websiteEnyoReady } from '@/lib/enyo/settings';
import { customerTools } from '@/lib/enyo/customer-tools';
import { publicTools, CONSENT_LINE } from '@/lib/enyo/public-tools';
import { customerCounts, history, ipHash, ownConversation, publicCounts, startConversation, storeAgentResult, storeUserMessage, visibleMessages } from '@/lib/enyo/conversation';
import { isPlainId, isVisitorKey, MESSAGE_MAX, newVisitorKey, originAllowed, rateVerdict, readLimits, VISITOR_COOKIE, VISITOR_COOKIE_DAYS } from '@/lib/enyo/rules';
import type { WebCtx, WebMode } from '@/lib/enyo/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'cache-control': 'private, no-store, max-age=0' };

type Who =
  | { mode: 'CUSTOMER'; customer: SignedInCustomer; organisationId: string }
  | { mode: 'PUBLIC'; customer: null; organisationId: string | null; visitorKey: string; newVisitor: boolean };

async function whoIsAsking(req: NextRequest): Promise<Who> {
  const customer = await currentCustomer().catch(() => null);
  if (customer) return { mode: 'CUSTOMER', customer, organisationId: customer.organisationId };
  const org = await siteOrganisation();
  // Data-journal rows written for a visitor (their support ticket) belong to the website's organisation.
  if (org) { try { setAuditActor(null, 'website', org.id); } catch { /* never blocks */ } }
  const cookie = req.cookies.get(VISITOR_COOKIE)?.value;
  const known = isVisitorKey(cookie);
  return { mode: 'PUBLIC', customer: null, organisationId: org?.id ?? null, visitorKey: known ? cookie! : newVisitorKey(), newVisitor: !known };
}

function json(body: Record<string, unknown>, status: number, who?: Who): NextResponse {
  const res = NextResponse.json(body, { status, headers: NO_STORE });
  if (who) setVisitorCookie(res, who);
  return res;
}

/** Sliding 90 days; httpOnly, same-site, Secure in production. Random, no personal data. */
function setVisitorCookie(res: NextResponse, who: Who): void {
  if (who.mode !== 'PUBLIC') return;
  res.cookies.set(VISITOR_COOKIE, who.visitorKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: VISITOR_COOKIE_DAYS * 86_400,
  });
}

function sameSite(req: NextRequest): boolean {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  return originAllowed(req.headers.get('origin'), [websiteBaseUrl(), host ? `${proto}://${host}` : null]);
}

async function failure(req: NextRequest, err: unknown, where: string): Promise<string> {
  const ref = newRef();
  const e = err as { name?: string; message?: string; stack?: string } | null;
  console.error(JSON.stringify({ level: 'error', app: 'website', ref, where, at: new Date().toISOString(), name: e?.name, message: redact(String(e?.message ?? err)), stack: e?.stack ? redact(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined }));
  await recordErrorEvent({ ref, err, routeType: 'route', headers: req.headers, method: req.method, path: new URL(req.url).pathname, route: where });
  return ref;
}

const PERSONAL_SUFFIX = ' If it keeps happening, quote this reference when you contact us.';

// ── GET: may the chat button show? ─────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const who = await whoIsAsking(req);
    const feature = who.mode === 'CUSTOMER' ? 'customerAssistant' : 'publicAssistant';
    const r = await websiteEnyoReady(who.organisationId, feature);
    const displayName = r.settings.displayName;
    if (!r.ready) return json({ ready: false, mode: who.mode, displayName, message: notReadyMessage(r.reason, who.mode) }, 200);
    const asked = req.nextUrl.searchParams.get('conversation');
    let messages: Awaited<ReturnType<typeof visibleMessages>> | undefined;
    if (isPlainId(asked) && who.organisationId && !(who.mode === 'PUBLIC' && who.newVisitor)) {
      const own = await ownConversation({ mode: who.mode, organisationId: who.organisationId, customerId: who.customer?.id ?? null, visitorKey: who.mode === 'PUBLIC' ? who.visitorKey : null }, asked);
      if (own) messages = await visibleMessages(own.id);
    }
    return json({ ready: true, mode: who.mode, displayName, consentLine: who.mode === 'PUBLIC' ? CONSENT_LINE : undefined, messages, conversationId: messages ? asked : undefined }, 200);
  } catch (err) {
    const ref = await failure(req, err, 'GET /api/enyo/chat');
    return json({ ready: false, mode: 'PUBLIC', displayName: 'Enyo', message: `The chat assistant is not available right now. Please try again later.${PERSONAL_SUFFIX}`, ref }, 200);
  }
}

// ── POST: one question, streamed answer ────────────────────────────────

export async function POST(req: NextRequest) {
  if (!sameSite(req)) return json({ error: 'This request did not come from our website.' }, 403);

  let body: { conversationId?: unknown; message?: unknown; page?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MESSAGE_MAX * 4 + 2000) return json({ error: `Please keep your message under ${MESSAGE_MAX.toLocaleString('en-NG')} characters.` }, 413);
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({ error: 'That message could not be read. Please try again.' }, 400);
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ error: 'Please type a question first.' }, 400);
  if (message.length > MESSAGE_MAX) return json({ error: `Please keep your message under ${MESSAGE_MAX.toLocaleString('en-NG')} characters.` }, 413);
  const page = typeof body.page === 'string' && /^\/[A-Za-z0-9/_-]{0,120}$/.test(body.page) ? body.page : null;

  let who: Who;
  try {
    who = await whoIsAsking(req);
  } catch (err) {
    const ref = await failure(req, err, 'POST /api/enyo/chat (who)');
    return json({ error: `Something went wrong on our side. Please try again.${PERSONAL_SUFFIX}`, ref }, 500);
  }
  const mode: WebMode = who.mode;
  const organisationId = who.organisationId;

  try {
    const ready = await websiteEnyoReady(organisationId, mode === 'CUSTOMER' ? 'customerAssistant' : 'publicAssistant');
    if (!ready.ready || !organisationId) {
      return json({ error: notReadyMessage(ready.ready ? 'switched_off' : ready.reason, mode), notReady: true }, 503, who);
    }

    const limits = readLimits();
    const hashedIp = mode === 'PUBLIC' ? ipHash(clientIp(req.headers)) : null;
    const limited = who.mode === 'CUSTOMER'
      ? rateVerdict('CUSTOMER', await customerCounts(organisationId, who.customer.id), limits)
      : rateVerdict('PUBLIC', await publicCounts(who.visitorKey, hashedIp), limits);
    if (limited) return json({ error: limited, limited: true }, 429, who);

    const owner = { mode, organisationId, customerId: who.customer?.id ?? null, visitorKey: who.mode === 'PUBLIC' ? who.visitorKey : null };
    const requested = isPlainId(body.conversationId) ? body.conversationId : null;
    const conversation = (await ownConversation(owner, requested)) ?? (await startConversation(owner, message));
    await storeUserMessage(conversation.id, message, hashedIp);
    const turns = trimHistory(await history(conversation.id), 12_000, 16);

    const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true } });
    const organisationName = org?.name ?? 'the organisation';
    const extra = [
      'Figures: quote the "text" form of an amount exactly as the tool gives it (for example ₦12,500.00).',
      'Links: tool results give paths such as /customer-portal/dashboard/services/jc/…; link to them with Markdown. Never link anywhere else.',
      ...(mode === 'PUBLIC'
        ? [`Before using the handover tool, collect the visitor's name and a phone number or email, then say: "${CONSENT_LINE}" and ask if that is fine.`]
        : ['A job number the tools do not find is simply "not found on your account". Never suggest it belongs to someone else.']),
      ...(page ? [`The person is on the page ${page}.`] : []),
    ];
    const system = buildSystemPrompt({
      assistantName: ready.settings.displayName,
      organisationName,
      channel: mode,
      personName: who.customer ? firstName(who.customer.fullName) : undefined,
      now: lagosNow(),
      extra,
    });

    const encoder = new TextEncoder();
    const started = Date.now();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (e: EnyoEvent) => {
          if (!open) return;
          try { controller.enqueue(encoder.encode(encodeEvent(e))); } catch { open = false; }
        };
        try {
          emit({ type: 'conversation', id: conversation.id });
          const ctx: WebCtx = {
            mode, organisationId, organisationName, conversationId: conversation.id,
            customer: who.customer, visitorKey: who.mode === 'PUBLIC' ? who.visitorKey : null,
            config: ready.config, emit,
          };
          const result = await runAgent<WebCtx>({
            // Cost: greetings and short how-to on the fast model; the rest on the main one.
            config: { ...ready.config, model: routeModel(message, ready.config).model },
            system,
            messages: turns,
            tools: [...(mode === 'CUSTOMER' ? customerTools : publicTools), ...(webLookupEnabled() ? [webLookupTool<WebCtx>()] : [])],
            ctx,
            emit,
            signal: req.signal,
            maxSteps: 5,
            maxToolCalls: 6,
            maxToolChars: 6000,
            // Too big or too frequent for the model's per-minute budget: once more with the last turns only, on the fast model.
            retrySmaller: { tools: (mode === 'CUSTOMER' ? customerTools : publicTools).slice(0, 6), model: ready.config.fastModel, keepMessages: 4 },
          });
          const messageId = await storeAgentResult(conversation.id, result, Date.now() - started);
          if (result.error) {
            emit({ type: 'error', message: result.error.message });
            // The model server's own reason, for administrators only.
            if (result.error.kind === 'auth' || result.error.kind === 'not_found' || result.error.kind === 'rejected') console.error(JSON.stringify({ level: 'error', where: 'enyo.model', kind: result.error.kind, status: result.error.status, code: result.error.code, detail: result.error.detail }));
          }
          else emit({ type: 'done', messageId });
        } catch (err) {
          const ref = await failure(req, err, 'POST /api/enyo/chat (stream)');
          emit({ type: 'error', message: 'Something went wrong on my side. Please try again.', ref });
        } finally {
          open = false;
          try { controller.close(); } catch { /* already closed by the browser */ }
        }
      },
    });
    const res = new NextResponse(stream, { status: 200, headers: { ...SSE_HEADERS, 'cache-control': 'private, no-store, no-transform' } });
    setVisitorCookie(res, who);
    return res;
  } catch (err) {
    const ref = await failure(req, err, 'POST /api/enyo/chat');
    return json({ error: `Something went wrong on our side. Please try again.${PERSONAL_SUFFIX}`, ref }, 500, who);
  }
}
