import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@ejo/database';
import { writeAuditLog } from '@/lib/workshop-core';
import { logError, withReference } from '@/lib/errors';
import { checkServiceRequest, NO_STORE, organisationBySlug } from '@/lib/enyo/ml/service';
import { parseUpload, UploadError } from '@/lib/enyo/ml/upload-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY = 4_400_000;

/**
 * POST /api/ml/models — the trainer hands in one trained model. It is stored
 * as CANDIDATE when it passed its gate (REJECTED otherwise, with the reasons)
 * and is NEVER used until a person chooses it (Settings → Enyo → Learning).
 * Machine-only: Bearer ML_SERVICE_TOKEN; 404 when that is not set up.
 */
export async function POST(request: Request) {
  const access = checkServiceRequest(request);
  if (access === 'off') return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  if (access === 'denied') return NextResponse.json({ error: 'Not authorised' }, { status: 401, headers: NO_STORE });
  if (access === 'limited') return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY) return NextResponse.json({ error: 'The upload is too large' }, { status: 413, headers: NO_STORE });
  // Read at most the limit, whatever the declared length (a chunked body has none).
  let text = '';
  let raw: unknown;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const r = reader ? await reader.read() : { done: true as const, value: undefined };
      if (r.done) break;
      size += r.value.byteLength;
      if (size > MAX_BODY) {
        await reader?.cancel().catch(() => undefined);
        return NextResponse.json({ error: 'The upload is too large' }, { status: 413, headers: NO_STORE });
      }
      chunks.push(r.value);
    }
    text = Buffer.concat(chunks).toString('utf8');
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'The upload must be JSON' }, { status: 400, headers: NO_STORE });
  }
  try {
    const up = parseUpload(raw, text.length);
    const org = await organisationBySlug(up.organisation);
    if (!org) return NextResponse.json({ error: 'Unknown or inactive organisation' }, { status: 404, headers: NO_STORE });
    const status = up.gate.passed ? 'CANDIDATE' : 'REJECTED';
    const row = await prisma.enyoModel.create({
      data: {
        organisationId: org.id, task: up.task, version: up.version, algorithm: up.algorithm, status,
        metrics: up.metrics as Prisma.InputJsonValue, baseline: up.baseline === null ? Prisma.DbNull : (up.baseline as Prisma.InputJsonValue),
        gate: up.gate as unknown as Prisma.InputJsonValue, artifact: up.artifact as unknown as Prisma.InputJsonValue, artifactBytes: up.artifactBytes,
        rows: up.rows, dataFrom: up.dataFrom, dataTo: up.dataTo, trainer: up.trainer, trainedAt: up.trainedAt,
      },
      select: { id: true },
    });
    await writeAuditLog({ userId: null, action: 'enyo.ml_model_uploaded', entityType: 'EnyoModel', entityId: row.id, organisationId: org.id, metadata: { task: up.task, version: up.version, status, rows: up.rows } });
    return NextResponse.json({ id: row.id, version: up.version, status }, { status: 201, headers: NO_STORE });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 422, headers: NO_STORE });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return NextResponse.json({ error: 'This model version was already uploaded' }, { status: 409, headers: NO_STORE });
    const ref = logError('enyo.ml_upload', err);
    return NextResponse.json({ error: withReference('The model could not be stored.', ref) }, { status: 500, headers: NO_STORE });
  }
}
