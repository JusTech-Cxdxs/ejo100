import 'server-only';
/**
 * The Support centre's fence, server side: ticketReachWhere (organisation and
 * branch reach) plus v37's privacy rule for colleagues' own help requests
 * (support-rules staffHelpFence): only the queue's members and support
 * managers see them.
 */
import { prisma } from '@ejo/database';
import { allows } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { staffHelpFence } from '@/lib/support-rules';

export async function fenceStaffHelp<T extends Record<string, unknown>>(reach: T): Promise<T | { AND: Record<string, unknown>[] }> {
  const canManage = await allows('support.manage').catch(() => false);
  if (canManage) return reach;
  const me = await requireUser();
  const queues = (await prisma.supportQueueMember.findMany({ where: { userId: me.id }, select: { queueId: true } }).catch(() => [])).map((q) => q.queueId);
  const fence = staffHelpFence(false, queues);
  return fence ? { AND: [reach, fence] } : reach;
}
