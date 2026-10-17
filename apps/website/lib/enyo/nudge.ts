/**
 * The question Enyo offers a visitor who has spent a while on a page without
 * asking anything (pure, tested): one gentle line and the question it sends
 * if they say yes. Once per visit, never on the customer portal, never while
 * the chat is open.
 */
export const NUDGE_AFTER_MS = 40_000;

const PAGES: { test: RegExp; line: string; ask: string }[] = [
  { test: /^\/services/, line: 'Looking for a particular service? I can tell you what it covers and how to book it.', ask: 'Which services do you offer, and how do I book one?' },
  { test: /^\/products/, line: 'Comparing products? I can help you find the right one.', ask: 'Can you help me choose the right product?' },
  { test: /^\/contact/, line: 'Want someone from the team to call you back?', ask: 'I would like someone to call me' },
  { test: /^\/support/, line: 'Need help with something? I can answer now or pass you to the team.', ask: 'I need help with something' },
  { test: /^\/careers/, line: 'Interested in working with us? I can tell you about open roles.', ask: 'What jobs are open, and how do I apply?' },
  { test: /^\/businesses/, line: 'Want a quick summary of our businesses?', ask: 'What businesses are in the group?' },
  { test: /^\/investors/, line: 'Looking for investor information? I can point you to it.', ask: 'Where can I find investor information?' },
  { test: /^\/(about|sustainability)/, line: 'Curious about who we are? Ask me anything.', ask: 'Tell me about the organisation in a few lines' },
  { test: /^\/news/, line: 'Want the latest news in a few lines?', ask: 'What is the latest news?' },
  { test: /^\/$/, line: 'Hi! Can I help you find something?', ask: 'What can you help me with?' },
];

export function nudgeFor(path: string | null | undefined): { line: string; ask: string } | null {
  if (!path || /^\/(customer-portal|privacy|terms|api)(\/|$)/.test(path)) return null;
  const hit = PAGES.find((p) => p.test.test(path));
  return hit ? { line: hit.line, ask: hit.ask } : { line: 'Can I help you find something on this page?', ask: 'Can you help me find what I am looking for?' };
}
