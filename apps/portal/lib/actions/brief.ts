'use server';

import { asData, complete } from '@ejo/enyo';
import { myOrganisationId } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { enyoReady } from '@/lib/enyo/settings';
import { withinLimit } from '@/lib/mail/account';
import { logFailure } from '@/lib/log';
import { collectBrief } from '@/lib/brief/collect';
import { allowedLinks, briefCount, briefMessages, briefPeriod, onlyKnownLinks, plainBrief, type BriefData } from '@/lib/brief/core';
import { PLATFORM } from '@/lib/brand';

export type MyBrief = { text: string; data: BriefData; byEnyo: boolean; total: number };

/**
 * Enyo's brief for the signed-in person: what is waiting (decisions, steps,
 * support requests, reminders, appointments, jobs, their own mail, new
 * notifications), for now, today, since their last brief, this week or
 * chosen dates. Built from the same lists they see elsewhere, with their own
 * permissions; written up by the small model (links checked) or, without it,
 * as a plain list. Nothing is changed.
 */
export async function getMyBrief(input: { scope?: string; since?: string; from?: string; to?: string } = {}): Promise<MyBrief> {
  const user = await requireUser();
  const period = briefPeriod(input ?? {});
  const data = await collectBrief(period);
  // Even the plain list keeps only our own links.
  const plain = onlyKnownLinks(plainBrief(data), allowedLinks(data));
  const total = briefCount(data);
  if (!withinLimit(`brief:${user.id}`, 12, 10 * 60_000)) return { text: plain, data, byEnyo: false, total };
  const ready = await enyoReady(await myOrganisationId(), 'staffAssistant');
  if (!ready.ready || total === 0) return { text: plain, data, byEnyo: false, total };
  try {
    const res = await complete({ ...ready.config, timeoutMs: Math.min(ready.config.timeoutMs, 20_000) }, {
      model: ready.config.fastModel,
      messages: briefMessages(data, ready.settings.displayName || PLATFORM.assistant, asData),
      temperature: 0.3,
      maxTokens: 700,
    });
    const text = onlyKnownLinks(res.content.replace(/<\/?untrusted[^>]*>/gi, '').trim(), allowedLinks(data)).slice(0, 4000);
    return text.length > 20 ? { text, data, byEnyo: true, total } : { text: plain, data, byEnyo: false, total };
  } catch (err) {
    logFailure('Brief could not be written by Enyo', err);
    return { text: plain, data, byEnyo: false, total };
  }
}
