/**
 * Shared server pieces of Enyo's staff routes (server-only; never a
 * 'use server' file): the same-origin check, the per-person rate limit, the
 * person's context and the system prompt.
 */
import type { NextRequest } from 'next/server';
import { prisma } from '@ejo/database';
import { buildSystemPrompt, encodeEvent, lagosNow, SSE_HEADERS, type EnyoEvent } from '@ejo/enyo';
import { currentAssist, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/authz/catalogue';
import { portalBaseUrl } from '@/lib/portal-url';
import type { EnyoSettings } from './settings';
import type { StaffCtx } from './types';

export const MAX_MESSAGE_CHARS = 4000;

/** Requests from the portal's own pages only (CSRF): the Origin header must be this site. */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set<string>([request.nextUrl.origin]);
  try {
    const base = portalBaseUrl();
    if (base) allowed.add(new URL(base).origin);
  } catch { /* a malformed setting adds nothing */ }
  const host = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host && /^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) allowed.add(`${proto.split(',')[0]!.trim()}://${host}`);
  return allowed.has(origin);
}

/** Questions a person may ask per minute (ENYO_REQUESTS_PER_MINUTE, default 20). */
export function requestsPerMinute(): number {
  const n = Number(process.env.ENYO_REQUESTS_PER_MINUTE);
  return Number.isInteger(n) && n >= 1 && n <= 600 ? n : 20;
}

/**
 * Counted in the database (the person's own questions in the last minute), so
 * the limit holds across every server instance.
 */
export async function overRateLimit(userId: string): Promise<boolean> {
  const n = await prisma.enyoMessage.count({
    where: { role: 'USER', createdAt: { gte: new Date(Date.now() - 60_000) }, conversation: { userId, channel: 'STAFF' } },
  });
  return n >= requestsPerMinute();
}

/** A one-event SSE response (refusals before streaming starts), with the matching HTTP status. */
export function sseError(status: number, message: string, ref?: string): Response {
  const event: EnyoEvent = { type: 'error', message, ...(ref ? { ref } : {}) };
  return new Response(encodeEvent(event), { status, headers: { ...SSE_HEADERS, 'cache-control': 'no-store' } });
}

/** A portal path the person had open ("/workshop/job-cards/abc"), or undefined. */
export function cleanPage(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const path = v.split(/[?#]/)[0]!.slice(0, 200);
  return /^\/[A-Za-z0-9/_.-]*$/.test(path) ? path : undefined;
}

/** Who is asking: the acting person (the colleague, during an assisted session). */
export async function staffContext(page?: string): Promise<{ ctx: StaffCtx; organisationId: string | null; assistantName: string | null; assistStartedAt: Date | null }> {
  const principal = await getPrincipal();
  const [user, assist, organisationId] = await Promise.all([
    prisma.user.findUnique({ where: { id: principal.userId }, select: { fullName: true } }),
    currentAssist(),
    principal.organisationId ? Promise.resolve(principal.organisationId) : myOrganisationId(),
  ]);
  return {
    ctx: {
      userId: principal.userId,
      organisationId: organisationId ?? '',
      branchId: principal.branchId,
      roleSlugs: principal.roleSlugs,
      isSuperAdmin: principal.isSuperAdmin,
      name: user?.fullName ?? 'a member of staff',
      assisted: Boolean(assist),
      ...(page ? { page } : {}),
    },
    organisationId,
    assistantName: assist?.assistant.name ?? null,
    assistStartedAt: assist?.startedAt ?? null,
  };
}

/** "Technician: Does the work on …; Calendar User: …" */
export function roleDescription(roleSlugs: string[], isSuperAdmin: boolean): string {
  const parts = roleSlugs.filter((s) => ROLE_LABELS[s]).map((s) => `${ROLE_LABELS[s]}${ROLE_DESCRIPTIONS[s] ? ` — ${ROLE_DESCRIPTIONS[s]}` : ''}`);
  if (isSuperAdmin) parts.unshift('Platform administrator (JusTech) — can see every organisation');
  return parts.join('; ') || 'No role yet — can request their own exit passes';
}

export async function staffSystemPrompt(o: { ctx: StaffCtx; settings: EnyoSettings; organisationId: string | null; memory: string[]; assistantName: string | null }): Promise<string> {
  const org = o.organisationId ? await prisma.organisation.findUnique({ where: { id: o.organisationId }, select: { name: true } }).catch(() => null) : null;
  const organisationName = org?.name || process.env.NEXT_PUBLIC_ORGANISATION_NAME || 'the organisation';
  const firstName = o.ctx.name.split(/\s+/)[0] || o.ctx.name;
  const extra = [
    'Money is in Nigerian naira (₦). Dates and times are Lagos time.',
    'Every tool runs as this person: if a tool refuses, they lack that right — never suggest a way around it.',
    'Reference numbers look like JC-2026-000412 (Job Card), SV-… (Vehicle Service), PRS-, EPR-, GRN-, RF-, WR-, WC-, VIS-, EP-, VX-, RT-, INC-, DLV-, CTR-, APT-, BC-.',
    ...(o.ctx.page ? [`The person has this page open: ${o.ctx.page}. "This job", "this one" or "here" usually means the record on that page (its id is the last part of the path; the tools accept it).`] : []),
    ...(o.ctx.assisted ? [`${o.assistantName ?? 'A Branch Assistant'} is helping this person in an assisted session. Help as usual, for the person. Nothing is approved during an assisted session.`] : []),
  ];
  return buildSystemPrompt({
    assistantName: o.settings.displayName || 'Enyo',
    organisationName,
    channel: 'STAFF',
    personName: firstName,
    roleDescription: roleDescription(o.ctx.roleSlugs, o.ctx.isSuperAdmin),
    now: lagosNow(),
    memory: o.memory,
    extra,
  });
}

/** A short title from the first question ("Status of JC-2026-000412 for…"). */
export function titleFrom(message: string): string {
  const plain = message.replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\s+/g, ' ').trim() || message.replace(/\s+/g, ' ').trim();
  if (plain.length <= 60) return plain || 'New conversation';
  const cut = plain.slice(0, 60);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 30 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
