/**
 * Checking a person the organisation publishes (pure, tested): a name and a
 * title are required; the profile link must be a public https page (LinkedIn
 * or the organisation's own site, for example); no contact details are
 * allowed in the biography (no phone numbers or email addresses), because the
 * website's assistant reads it out to anyone.
 */
export type ProfileInput = { name?: unknown; title?: unknown; area?: unknown; bio?: unknown; profileUrl?: unknown; isPublic?: unknown };
export type ProfileValue = { name: string; title: string; area: string | null; bio: string | null; profileUrl: string | null; isPublic: boolean };

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function checkProfile(input: ProfileInput): { ok: true; value: ProfileValue } | { ok: false; message: string } {
  const name = clean(input.name, 100);
  const title = clean(input.title, 120);
  const area = clean(input.area, 120);
  const bio = typeof input.bio === 'string' ? input.bio.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200) : '';
  const url = clean(input.profileUrl, 300);
  if (name.length < 2) return { ok: false, message: 'Enter the person’s full name.' };
  if (title.length < 2) return { ok: false, message: 'Enter their title, for example “Director, Automobile Division”.' };
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bio) || /(?:\+?\d[\s.-]?){7,}/.test(bio)) {
    return { ok: false, message: 'Please leave phone numbers and email addresses out of the biography — the website’s assistant can read it to anyone.' };
  }
  let profileUrl: string | null = null;
  if (url) {
    let u: URL;
    try { u = new URL(url); } catch { return { ok: false, message: 'The profile link must be a full web address starting with https://' }; }
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return { ok: false, message: 'The profile link must be a public https:// page.' };
    profileUrl = u.toString();
  }
  return { ok: true, value: { name, title, area: area || null, bio: bio || null, profileUrl, isPublic: input.isPublic === true || input.isPublic === 'on' || input.isPublic === 'true' } };
}
