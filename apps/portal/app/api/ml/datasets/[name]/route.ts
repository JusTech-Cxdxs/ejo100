import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { logError, withReference } from '@/lib/errors';
import { toJsonl } from '@/lib/enyo/predict/dataset-core';
import { checkServiceRequest, jobsDataset, NO_STORE, organisationBySlug, partsDataset } from '@/lib/enyo/ml/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/ml/datasets/jobs|parts?organisation=<slug> — the trainer's
 * de-identified history (lib/enyo/ml/service.ts). Machine-only: Bearer
 * ML_SERVICE_TOKEN; 404 when that is not set up. Every read is audited.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const access = checkServiceRequest(request);
  if (access === 'off') return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  if (access === 'denied') return NextResponse.json({ error: 'Not authorised' }, { status: 401, headers: NO_STORE });
  if (access === 'limited') return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } });
  const { name } = await params;
  if (name !== 'jobs' && name !== 'parts') return NextResponse.json({ error: 'Unknown dataset (jobs or parts)' }, { status: 404, headers: NO_STORE });
  const org = await organisationBySlug(new URL(request.url).searchParams.get('organisation'));
  if (!org) return NextResponse.json({ error: 'Unknown or inactive organisation' }, { status: 404, headers: NO_STORE });
  try {
    // The trainer reads tokens, never the free text: complaint_text stays in the portal.
    const body = name === 'jobs'
      ? toJsonl(await jobsDataset(org.id)).split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l) as Record<string, unknown>; delete r.complaint_text; return JSON.stringify(r); }).join('\n') + '\n'
      : (await partsDataset(org.id)).map((r) => JSON.stringify(r)).join('\n') + '\n';
    const rows = body.trim() ? body.trim().split('\n').length : 0;
    await writeAuditLog({ userId: null, action: 'enyo.ml_dataset_read', entityType: 'Organisation', entityId: org.id, organisationId: org.id, metadata: { dataset: name, rows } });
    return new NextResponse(body, { headers: { ...NO_STORE, 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  } catch (err) {
    const ref = logError('enyo.ml_dataset', err, { dataset: name });
    return NextResponse.json({ error: withReference('The dataset could not be prepared.', ref) }, { status: 500, headers: NO_STORE });
  }
}
