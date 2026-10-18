"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shown = exports.runs = exports.capabilityOf = exports.CAPABILITIES = exports.LEVELS = void 0;
exports.readLevels = readLevels;
exports.LEVELS = ['OFF', 'SHADOW', 'ASSIST', 'PARTIAL', 'FULL'];
exports.CAPABILITIES = [
    { key: 'JOB_DURATION', label: 'Job time estimates', assist: 'Job Cards and Vehicle Services show when the vehicle is likely to be ready (a low–high range), once the estimate is approved.', levels: ['OFF', 'SHADOW', 'ASSIST'], initial: 'SHADOW' },
    { key: 'PRICE_ANOMALY', label: 'Unusual price warnings', assist: 'Estimates show a warning next to a typed-in price that is far from the usual for that work (a mistyped zero, for example). Nothing is changed.', levels: ['OFF', 'SHADOW', 'ASSIST'], initial: 'SHADOW' },
    { key: 'PARTS_DEMAND', label: 'Parts reorder suggestions', assist: 'Store staff see which parts are at or below a reorder point worked out from real use, and how many to order. They raise the order themselves.', levels: ['OFF', 'ASSIST'], initial: 'ASSIST' },
    { key: 'COMPLAINT_THEMES', label: 'Complaint themes', assist: 'Managers see what customers bring their vehicles in for most, month by month.', levels: ['OFF', 'ASSIST'], initial: 'ASSIST' },
];
const capabilityOf = (key) => exports.CAPABILITIES.find((c) => c.key === key);
exports.capabilityOf = capabilityOf;
/** The stored levels (EnyoSetting.capabilityLevels), each checked against what that capability allows. */
function readLevels(stored) {
    const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const out = {};
    for (const c of exports.CAPABILITIES) {
        const v = s[c.key];
        out[c.key] = typeof v === 'string' && c.levels.includes(v) ? v : c.initial;
    }
    return out;
}
/** Runs at all (measured or shown). */
const runs = (level) => level !== 'OFF';
exports.runs = runs;
/** Shown to people. */
const shown = (level) => level === 'ASSIST' || level === 'PARTIAL' || level === 'FULL';
exports.shown = shown;
