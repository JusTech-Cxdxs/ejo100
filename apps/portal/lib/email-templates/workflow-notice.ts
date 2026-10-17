import { renderEmailLayout, html, greeting, para, details, callout, type EmailTone } from './layout';

/**
 * One email shape for colleagues at a workflow step that is now theirs (or
 * whose outcome they asked for): what happened, the record's facts, what to
 * do next, and a button to the record. Only what the colleague needs to act —
 * the record itself stays in the portal, behind sign-in.
 */
export type WorkflowNoticeOptions = {
  companyName: string;
  logoUrl: string;
  recipientName: string | null;
  subject: string;
  heading: string;
  /** What happened, in one or two sentences. */
  intro: string;
  facts?: [string, string][];
  /** What the colleague should do next (omit for an outcome they only need to know). */
  next?: string;
  status: { label: string; tone: EmailTone };
  url: string;
  ctaLabel: string;
  orgContext?: (string | null | undefined)[];
};

export function renderWorkflowNoticeEmail(o: WorkflowNoticeOptions): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(o.intro)}
    ${details(o.facts ?? [])}
    ${o.next ? callout(o.next, o.status.tone === 'danger' ? 'warning' : o.status.tone, 'What to do') : ''}`;
  return {
    subject: o.subject.slice(0, 160),
    html: renderEmailLayout({ previewText: o.intro.slice(0, 120), companyName: o.companyName, logoUrl: o.logoUrl, orgContext: (o.orgContext ?? []).filter((x): x is string => Boolean(x)), status: o.status, heading: o.heading, bodyHtml, ctaLabel: o.ctaLabel, ctaUrl: o.url, audience: 'staff' }),
  };
}
