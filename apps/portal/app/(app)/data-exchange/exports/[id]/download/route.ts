import { claimPart, partStream } from '@/lib/exports/download-server';

export const dynamic = 'force-dynamic';
// A part stops at a clean row boundary after about 40 seconds (lib/exports/describe.ts); the rest is headroom to finish the file.
export const maxDuration = 60;

/**
 * An export's file (or its next part), built now for the person downloading
 * it: their organisation, branch and permissions. 24 hours, once per person,
 * one part at a time; every part in the audit trail; never cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const claim = await claimPart(id);
  if ('status' in claim) {
    return new Response(claim.message, { status: claim.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const { body, fileName, contentType } = await partStream(claim);
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Export-Part': String(claim.part),
    },
  });
}
