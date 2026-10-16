'use server';

import { asData, complete } from '@ejo/enyo';
import { myOrganisationId } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { enyoReady } from '@/lib/enyo/settings';
import { withinLimit } from '@/lib/mail/account';
import { logFailure } from '@/lib/log';
import { collectBrief } from '@/lib/brief/collect';
import { briefCount, briefHeadline, briefPeriod, cleanSummary, plainSummary, summaryMessages, type BriefData } from '@/lib/brief/core';
import { PLATFORM } from '@/lib/brand';

export type MyBrief = { data: BriefData; total: number; headline: string; summary: string };

/**
 * Enyo's brief for the signed-in person: what is waiting (decisions, steps,
 * support requests, reminders, appointments, jobs, their own mail, new
 * notifications), for now, today, since their last brief, this week or
 * chosen dates. Built from the same lists they see elsewhere, with their own
 * permissions. Fast: no model here — the card shows it at once and asks for
 * Enyo's short summary separately (summariseMyBrief). Nothing is changed.
 */
export async function getMyBrief(input: { scope?: string; since?: string; from?: string; to?: string } = {}): Promise<MyBrief> {
  await requireUser();
  const data = await collectBrief(briefPeriod(input ?? {}));
  return { data, total: briefCount(data), headline: briefHeadline(data), summary: plainSummary(data) };
}

const summaries = new Map<string, { at: number; text: string }>();

/** Enyo's two or three sentences on a brief (fast model, plain text, cached 10 minutes for the same counts). */
export async function summariseMyBrief(input: { scope?: string; since?: string; from?: string; to?: string } = {}): Promise<{ text: string; byEnyo: boolean }> {
  const user = await requireUser();
  const data = await collectBrief(briefPeriod(input ?? {}));
  const plain = plainSummary(data);
  if (briefCount(data) === 0) return { text: plain, byEnyo: false };
  const key = `${user.id}:${data.periodLabel}:${data.sections.map((s) => `${s.key}${s.count}/${s.overdue ?? 0}`).join(',')}`;
  const hit = summaries.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { text: hit.text, byEnyo: true };
  if (!withinLimit(`brief:${user.id}`, 12, 10 * 60_000)) return { text: plain, byEnyo: false };
  const ready = await enyoReady(await myOrganisationId(), 'staffAssistant');
  if (!ready.ready) return { text: plain, byEnyo: false };
  try {
    const res = await complete({ ...ready.config, timeoutMs: Math.min(ready.config.timeoutMs, 15_000) }, {
      model: ready.config.fastModel,
      messages: summaryMessages(data, ready.settings.displayName || PLATFORM.assistant, asData),
      temperature: 0.3,
      maxTokens: 220,
    });
    const text = cleanSummary(res.content);
    if (text.length < 20) return { text: plain, byEnyo: false };
    if (summaries.size > 500) summaries.clear();
    summaries.set(key, { at: Date.now(), text });
    return { text, byEnyo: true };
  } catch (err) {
    logFailure('Brief summary could not be written by Enyo', err);
    return { text: plain, byEnyo: false };
  }
}
