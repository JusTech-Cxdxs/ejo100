/**
 * The website contact form's rules (pure, tested): what a visitor may write,
 * which team the topic goes to, and the daily limit per address.
 */
export const TOPICS: Record<string, { label: string; tags: string[]; priority: 'NORMAL' | 'HIGH'; hint: string }> = {
  sales: { label: 'Buying a vehicle', tags: ['topic:sales'], priority: 'NORMAL', hint: 'Prices, test drives, fleet purchases' },
  service: { label: 'Service or repairs', tags: ['topic:vehicle'], priority: 'NORMAL', hint: 'Booking, an ongoing job, a technical question' },
  parts: { label: 'Parts and tyres', tags: ['topic:parts'], priority: 'NORMAL', hint: 'Availability, orders, fitting' },
  business: { label: 'Business or partnership', tags: ['topic:business'], priority: 'NORMAL', hint: 'Distribution, supply, investment' },
  referral: { label: 'A referral', tags: ['topic:sales', 'referral'], priority: 'NORMAL', hint: 'Someone who wants to buy; refer-and-earn partners' },
  careers: { label: 'Careers', tags: ['topic:careers'], priority: 'NORMAL', hint: 'Openings, internships, applications' },
  media: { label: 'Press and media', tags: ['topic:media'], priority: 'NORMAL', hint: 'Interviews, statements, pictures' },
  complaint: { label: 'A complaint', tags: ['complaint'], priority: 'HIGH', hint: 'Something went wrong — tell us' },
  other: { label: 'Something else', tags: [], priority: 'NORMAL', hint: '' },
};

export type ContactInput = { name?: unknown; email?: unknown; phone?: unknown; topic?: unknown; company?: unknown; message?: unknown; website?: unknown };
export type ContactValue = { name: string; email: string | null; phone: string | null; topic: keyof typeof TOPICS; company: string | null; message: string };

const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function checkContact(input: ContactInput): { ok: true; value: ContactValue } | { ok: false; message: string; field?: string } {
  // The honeypot: a field people never see; a bot fills it.
  if (typeof input.website === 'string' && input.website.trim()) return { ok: false, message: 'Thank you.' };
  const name = line(input.name, 100);
  const email = line(input.email, 160).toLowerCase();
  const phone = line(input.phone, 32);
  const company = line(input.company, 120);
  const topic = Object.hasOwn(TOPICS, String(input.topic)) ? (String(input.topic) as keyof typeof TOPICS) : null;
  const message = typeof input.message === 'string' ? input.message.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000) : '';
  if (name.length < 2) return { ok: false, message: 'Please tell us your name.', field: 'name' };
  if (!email && !phone) return { ok: false, message: 'Leave an email address or a phone number so we can reply.', field: 'email' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, message: 'That email address does not look right.', field: 'email' };
  if (phone && (!/^\+?[0-9][0-9 ()-]*$/.test(phone) || phone.replace(/\D/g, '').length < 7)) return { ok: false, message: 'That phone number does not look right.', field: 'phone' };
  if (!topic) return { ok: false, message: 'Choose what your message is about.', field: 'topic' };
  if (message.length < 12) return { ok: false, message: 'Tell us a little more — at least a sentence.', field: 'message' };
  return { ok: true, value: { name, email: email || null, phone: phone || null, topic, company: company || null, message } };
}

export const CONTACT_DAILY_LIMIT = 5;
