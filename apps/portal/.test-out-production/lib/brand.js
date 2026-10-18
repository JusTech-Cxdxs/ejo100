"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGO = exports.PLATFORM = void 0;
exports.appShortName = appShortName;
/**
 * THE ONE PLACE for the platform's name and its "Powered by" line.
 *
 * Every screen, email, printed document, PDF, the installed app and Enyo's
 * own answers read these values. To rename the platform (EJO 100 → EJO 150)
 * change it here, then run `npm run brand:sync` — it copies this file to
 * apps/portal/lib/brand.ts and apps/website/lib/brand.ts (a unit test fails
 * if the copies differ).
 *
 * Naming: "EJO 100" is the product; "Enterprise Platform" is what it is (the
 * common term for an ERP suite — "OS" usually means device software); the
 * mark everywhere is the short "Powered by EJO 100".
 */
exports.PLATFORM = {
    /** The product, as people say it. */
    name: 'EJO 100',
    /** What it is. */
    descriptor: 'Enterprise Platform',
    /** Name and descriptor together (sign-in pages, About, document titles). */
    fullName: 'EJO 100 Enterprise Platform',
    /** The mark on every footer, email, print-out and PDF. */
    poweredBy: 'Powered by EJO 100',
    /** Who makes it. */
    maker: 'Just Technologies (JusTech)',
    makerShort: 'JusTech',
    developer: 'Enefola Justice Ojonuba',
    /** The AI built into it. */
    assistant: 'Enyo',
    assistantVersion: 'Enyo 1.0',
    website: 'https://justech-dev.vercel.app',
};
/**
 * The organisation's logo file (public/images/logo/logo.png) and how the
 * wordmark is set: Zinox's logo is a wide mark that already spells "Zinox",
 * so the lockup shows the logo with the rest of the name ("Technologies")
 * beneath it, after the brand rule — the same on screen and on paper.
 */
exports.LOGO = {
    width: 1727,
    height: 846,
    /** The logo already shows the first word of the organisation's name. */
    carriesFirstWord: true,
};
/** "Kewalram Chanrai Group" → "KCG": the installed app's home-screen name. */
function appShortName(organisationName, override) {
    const o = (override ?? '').trim();
    if (o)
        return o.slice(0, 12);
    const name = organisationName.trim();
    if (name.length <= 12)
        return name || exports.PLATFORM.name;
    const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|&)$/i.test(w)).map((w) => w[0].toUpperCase()).join('');
    return (initials.length >= 2 ? initials : name.split(/\s+/)[0] ?? name).slice(0, 12);
}
