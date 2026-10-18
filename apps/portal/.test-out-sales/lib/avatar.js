"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialsOf = initialsOf;
exports.colourOf = colourOf;
/** Initials and a stable colour for a person's avatar (pure — see components/Avatar.tsx). */
const PALETTE = ['#e10600', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#65a30d', '#b45309', '#0d9488'];
function initialsOf(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
}
function colourOf(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1)
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
}
