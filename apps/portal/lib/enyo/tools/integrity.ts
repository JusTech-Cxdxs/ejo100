/**
 * The integrity watch and the audit trail, as tools — read-only, and only
 * through the same authorised code as the pages: integrity.review for alerts
 * (never alerts about the person asking), audit.view for the trail. Not
 * during an assisted session (the colleague being helped is not a reviewer).
 */
import type { ToolResult } from '@ejo/enyo';
import { allows } from '@/lib/authz/server';
import { getIntegrityOverview } from '@/lib/actions/integrity';
import { getAuditLogPage } from '@/lib/actions/audit-logs';
import { NOT_PERMITTED, type StaffTool } from '../types';

const nothing = (message: string): ToolResult => ({ ok: false, message });

export const integrityTools: StaffTool[] = [
  {
    name: 'integrity_alerts',
    kind: 'read',
    status: 'Checking the integrity watch…',
    description: 'The integrity watch for a reviewer: open alerts about unusual or risky activity (same person asking and approving, refunds above what was paid, split purchases, repeat warranty claims, vehicles leaving with work open, out-of-hours money, password guessing, activity spikes, Speak up concerns) — counts, by check, and the newest. A flag is a reason to look, never proof: never call anyone dishonest. Use for "anything suspicious?", "fraud alerts", "integrity".',
    parameters: { type: 'object', properties: { severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] } }, additionalProperties: false },
    run: async (args, ctx) => {
      if (ctx.assisted) return nothing('The integrity watch is not available during an assisted session.');
      if (!(await allows('integrity.review'))) return NOT_PERMITTED;
      const o = await getIntegrityOverview({ status: 'open', severity: typeof args.severity === 'string' ? args.severity : undefined });
      return {
        ok: true,
        data: {
          counts: o.counts, byCheck: o.byRule, lastChecked: o.lastScan?.toISOString() ?? null,
          alerts: o.rows.slice(0, 12).map((a) => ({ title: a.title, check: a.ruleLabel, area: a.area, severity: a.severity, status: a.statusLabel, about: a.subject, lastSeen: a.lastSeenAt.toISOString(), link: `/integrity/${a.id}` })),
          note: 'Alerts are reasons to look, not findings. Reviewers decide on the Integrity watch page.',
        },
        sources: [{ label: 'Integrity watch', href: '/integrity' }],
      };
    },
  },
  {
    name: 'audit_trail',
    kind: 'read',
    status: 'Reading the audit trail…',
    description: 'The audit trail (who did what, when) for someone allowed to see it: search by a record number (JC-…, PRS-…, EP-…, RF-…), an action word ("refund", "approved"), and/or dates. Returns the latest entries with who, what and the record links. Use for "who approved EP-2026-000041?", "what happened to JC-…", "refunds recorded yesterday".',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', maxLength: 60, description: 'A record number or an action word.' },
        from: { type: 'string', maxLength: 10, description: 'YYYY-MM-DD (Lagos).' },
        to: { type: 'string', maxLength: 10, description: 'YYYY-MM-DD (Lagos).' },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      if (ctx.assisted) return nothing('The audit trail is not available during an assisted session.');
      if (!(await allows('audit.view'))) return NOT_PERMITTED;
      const page = await getAuditLogPage({ kind: 'business', q: typeof args.q === 'string' ? args.q.slice(0, 60) : undefined, from: typeof args.from === 'string' ? args.from : undefined, to: typeof args.to === 'string' ? args.to : undefined });
      return {
        ok: true,
        data: { entries: page.rows.slice(0, 25).map((r) => ({ at: r.at.toISOString(), who: r.who, what: r.title, detail: r.detail, records: r.records.map((x) => ({ label: x.label, link: x.url })) })), more: Boolean(page.nextCursor) },
        sources: [{ label: 'Audit logs', href: '/audit-logs' }],
      };
    },
  },
];
