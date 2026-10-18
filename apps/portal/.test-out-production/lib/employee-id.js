"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.organisationCode = organisationCode;
exports.branchCode = branchCode;
exports.employeeIdPrefix = employeeIdPrefix;
exports.formatEmployeeId = formatEmployeeId;
exports.sequenceOf = sequenceOf;
exports.uniqueBranchPrefixes = uniqueBranchPrefixes;
/**
 * Employee IDs — short, memorable, and they say where the person belongs.
 *
 * Format:  ORG-BRANCH-NNNN   e.g.  KN-ISO-0007
 *   ORG     the organisation's initials (2–3 letters: "Kewalram Nigeria" → KN)
 *   BRANCH  the branch's code (its own short code when set, otherwise three
 *           letters from its name: "Isolo Branch" → ISO, "Victoria Island" → VI)
 *   NNNN    a running number within that branch prefix, never reused
 *
 * Common practice for staff numbers: a fixed company/location prefix plus a
 * sequential, zero-padded number; no personal data (no birth dates, no
 * initials of the person) so the ID never has to change and reveals nothing.
 * Issued by the server only — nobody types or chooses one.
 */
const FILLER = new Set(['branch', 'the', 'of', 'and', 'office', 'workshop', 'ltd', 'limited', 'plc', 'nigeria', 'group', 'hq', 'head']);
function lettersOf(v) {
    return v.normalize('NFKD').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
}
/** "Kewalram Nigeria" → "KN"; one-word names give their first three letters. */
function organisationCode(name) {
    const words = lettersOf(name).split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return 'EJO';
    if (words.length === 1)
        return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map((w) => w.charAt(0)).join('').toUpperCase();
}
/** The branch part: its own code when set ("KWL-WS" → "KWLWS" → first 4), otherwise from its name. */
function branchCode(name, code) {
    const own = (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (own.length >= 2)
        return own.slice(0, 4);
    const words = lettersOf(name).split(/\s+/).filter(Boolean);
    const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
    const pick = meaningful.length ? meaningful : words;
    if (pick.length === 0)
        return 'BR';
    if (pick.length === 1)
        return pick[0].slice(0, 3).toUpperCase().padEnd(3, 'X');
    return pick.slice(0, 3).map((w) => w.charAt(0)).join('').toUpperCase();
}
function employeeIdPrefix(organisationName, branchName, branchOwnCode) {
    return `${organisationCode(organisationName)}-${branchCode(branchName, branchOwnCode)}`;
}
function formatEmployeeId(prefix, n) {
    return `${prefix}-${String(n).padStart(4, '0')}`;
}
/** The running number at the end of an ID with this prefix (null when it is not one of ours). */
function sequenceOf(prefix, employeeId) {
    if (!employeeId.startsWith(`${prefix}-`))
        return null;
    const rest = employeeId.slice(prefix.length + 1);
    return /^\d{1,9}$/.test(rest) ? Number(rest) : null;
}
/**
 * The prefix of every branch of one organisation, branches given oldest
 * first. Codes that would repeat get a digit (KN-ISO, KN-ISO2, KN-ISO3), so a
 * branch's prefix depends only on the branches created before it — adding a
 * branch never changes the prefix of an existing one.
 */
function uniqueBranchPrefixes(organisationName, branchesOldestFirst) {
    const org = organisationCode(organisationName);
    const used = new Set();
    const out = new Map();
    for (const b of branchesOldestFirst) {
        const base = branchCode(b.name, b.code);
        let code = base;
        for (let n = 2; used.has(code); n += 1)
            code = `${base}${n}`;
        used.add(code);
        out.set(b.id, `${org}-${code}`);
    }
    return out;
}
