import { NextResponse } from 'next/server';
import { allows, currentAssist, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { conversationTrainingSet } from '@/lib/enyo/conversations';
import { lagosDayKey } from '@/lib/utils/format-date';
import { logError, withReference } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * GET /enyo/learning/conversations — Enyo's conversation training set (JSONL,
 * chat fine-tuning format): approved answers and helpful-rated first answers
 * that read nobody's records, scrubbed of names and contact details, tagged
 * with channel and role. "Manage Enyo" only, never in an assisted session,
 * every export in the audit trail.
 */
export async function GET() {
  const allowed = await allows('enyo.manage').catch(() => false);
  if (!allowed) return NextResponse.json({ error: 'You do not have permission to export Enyo training data.' }, { status: 403, headers: NO_STORE });
  if (await currentAssist().catch(() => null)) return NextResponse.json({ error: 'This is not available during an assisted session.' }, { status: 403, headers: NO_STORE });
  try {
    const p = await getPrincipal();
    const organisationId = p.organisationId ?? (await myOrganisationId());
    if (!organisationId) return NextResponse.json({ error: 'No organisation to export.' }, { status: 400, headers: NO_STORE });
    const { rows, report } = await conversationTrainingSet(organisationId);
    await writeAuditLog({ userId: p.userId, action: 'enyo.conversation_training_exported', entityType: 'Organisation', entityId: organisationId, metadata: { rows: rows.length, ...report } });
    return new NextResponse(rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="enyo-conversations-${lagosDayKey(new Date())}.jsonl"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const ref = logError('enyo.conversation_export', err);
    return NextResponse.json({ error: withReference('The conversation training set could not be prepared.', ref) }, { status: 500, headers: NO_STORE });
  }
}
