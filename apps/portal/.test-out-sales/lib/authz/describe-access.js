"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plainLabel = plainLabel;
exports.describeAccess = describeAccess;
exports.roleLabel = roleLabel;
const catalogue_1 = require("./catalogue");
const WHERE = {
    ALL: 'across the whole organisation',
    BRANCH: 'in your branch',
    DEPARTMENT: 'in your department',
    ASSIGNED: 'on work assigned to you',
    OWN: 'for yourself',
};
/** The catalogue label in plain words for the person themselves: the scope
 * hint after " — " and role hints in brackets are dropped (the scope is
 * stated separately, from what the person actually holds). */
function plainLabel(label) {
    return label.split(' — ')[0].replace(/\s*\([^)]*\)\s*$/, '').replace(/\bfor themselves\b/, 'for yourself').trim();
}
function describeAccess(p) {
    if (p.isSuperAdmin)
        return [{ module: 'Platform', lines: [] }];
    const byModule = new Map();
    for (const key of Object.keys(catalogue_1.PERMISSIONS)) {
        const scope = (0, catalogue_1.scopeFor)(p, key);
        if (!scope)
            continue;
        const fromRoles = p.roleSlugs.some((s) => catalogue_1.ROLE_GRANTS[s]?.[key]);
        const added = !fromRoles && Boolean(p.extraGrants?.[key]);
        const { module, label } = catalogue_1.PERMISSIONS[key];
        const list = byModule.get(module) ?? [];
        const plain = plainLabel(label);
        list.push({ key, label: plain, where: /for yourself$/.test(plain) ? '' : WHERE[scope], added });
        byModule.set(module, list);
    }
    return [...byModule.entries()].map(([module, lines]) => ({ module, lines }));
}
function roleLabel(slug, name) {
    return catalogue_1.ROLE_LABELS[slug] ?? name;
}
