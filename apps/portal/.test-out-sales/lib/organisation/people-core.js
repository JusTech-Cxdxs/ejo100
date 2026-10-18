"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkProfile = checkProfile;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
function checkProfile(input) {
    const name = clean(input.name, 100);
    const title = clean(input.title, 120);
    const area = clean(input.area, 120);
    const bio = typeof input.bio === 'string' ? input.bio.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200) : '';
    const url = clean(input.profileUrl, 300);
    if (name.length < 2)
        return { ok: false, message: 'Enter the person’s full name.' };
    if (title.length < 2)
        return { ok: false, message: 'Enter their title, for example “Director, Automobile Division”.' };
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bio) || /(?:\+?\d[\s.-]?){7,}/.test(bio)) {
        return { ok: false, message: 'Please leave phone numbers and email addresses out of the biography — the website’s assistant can read it to anyone.' };
    }
    let profileUrl = null;
    if (url) {
        let u;
        try {
            u = new URL(url);
        }
        catch {
            return { ok: false, message: 'The profile link must be a full web address starting with https://' };
        }
        if (u.protocol !== 'https:' || !u.hostname.includes('.'))
            return { ok: false, message: 'The profile link must be a public https:// page.' };
        profileUrl = u.toString();
    }
    return { ok: true, value: { name, title, area: area || null, bio: bio || null, profileUrl, isPublic: input.isPublic === true || input.isPublic === 'on' || input.isPublic === 'true' } };
}
