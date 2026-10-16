import { NextResponse } from 'next/server';
import { currentAssist, getPrincipal, myOrganisationId } from '@/lib/authz/server';
import { AttachmentError, contentDisposition, fetchMyAttachment } from '@/lib/mail/attachments';
import { MailConnectError } from '@/lib/mail/transport';
import { logError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

/**
 * GET /api/mail/attachment/{messageId}/{index} — one attachment of the
 * signed-in person's own email, fetched from their mail server on demand.
 * Never during an assisted session. Pictures open in the browser; everything
 * else downloads (never runs as a page).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await ctx.params;
  try {
    const p = await getPrincipal().catch(() => null);
    if (!p?.userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401, headers: NO_STORE });
    if (await currentAssist().catch(() => null)) return NextResponse.json({ error: 'A person’s mail is only ever shown to them.' }, { status: 403, headers: NO_STORE });
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !/^\d{1,3}$/.test(index)) return NextResponse.json({ error: 'That attachment does not exist.' }, { status: 404, headers: NO_STORE });
    const file = await fetchMyAttachment({ userId: p.userId, organisationId: p.organisationId ?? (await myOrganisationId()), messageId: id, index: Number(index) });
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        ...NO_STORE,
        'Content-Type': file.type,
        'Content-Disposition': contentDisposition(file.name, file.inline),
        'Content-Length': String(file.content.length),
        // Even a picture or PDF shown here can run nothing and load nothing.
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof AttachmentError) return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
    if (err instanceof MailConnectError) return NextResponse.json({ error: err.message }, { status: 502, headers: NO_STORE });
    const ref = logError('mail.attachment', err);
    return NextResponse.json({ error: `The attachment could not be fetched. Reference ${ref}.` }, { status: 500, headers: NO_STORE });
  }
}
