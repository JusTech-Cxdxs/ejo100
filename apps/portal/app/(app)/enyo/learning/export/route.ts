import { NextResponse } from 'next/server';
import { allows, currentAssist, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { buildTrainingRows } from '@/lib/enyo/predict/dataset';
import { toCsv, toJsonl } from '@/lib/enyo/predict/dataset-core';
import { lagosDayKey } from '@/lib/utils/format-date';
import { logError, withReference } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * GET /enyo/learning/export?format=csv|jsonl — the training set for the
 * Python ML phase (docs/AI_READINESS.md, "Training data"). Administrators
 * with "Manage Enyo" only, never during an assisted session; every export is
 * in the audit trail. No personal data is in it (lib/enyo/predict/dataset*).
 */
export async function GET(request: Request) {
  // Signed in, allowed, and acting for themselves — or refused, with nothing else said.
  const allowed = await allows('enyo.manage').catch(() => false);
  if (!allowed) return NextResponse.json({ error: 'You do not have permission to export Enyo training data.' }, { status: 403, headers: NO_STORE });
  if (await currentAssist().catch(() => null)) return NextResponse.json({ error: 'This is not available during an assisted session.' }, { status: 403, headers: NO_STORE });

  const format = new URL(request.url).searchParams.get('format') === 'jsonl' ? 'jsonl' : 'csv';
  try {
    const p = await getPrincipal();
    const organisationId = p.organisationId ?? (await myOrganisationId());
    if (!organisationId) return NextResponse.json({ error: 'No organisation to export.' }, { status: 400, headers: NO_STORE });
    const reach = await reachWhere('enyo.manage');
    const b = reach.branchId;
    const branchIds = b === undefined ? null : typeof b === 'string' ? [b] : b.in;
    const rows = await buildTrainingRows({ organisationId, branchIds });
    await writeAuditLog({ userId: p.userId, action: 'enyo.training_data_exported', entityType: 'Organisation', entityId: organisationId, metadata: { format, rows: rows.length } });
    const body = format === 'jsonl' ? toJsonl(rows) : toCsv(rows);
    return new NextResponse(body, {
      headers: {
        ...NO_STORE,
        'Content-Type': format === 'jsonl' ? 'application/x-ndjson; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="enyo-training-${lagosDayKey(new Date())}.${format}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const ref = logError('enyo.training_export', err);
    return NextResponse.json({ error: withReference('The training data could not be prepared.', ref) }, { status: 500, headers: NO_STORE });
  }
}
