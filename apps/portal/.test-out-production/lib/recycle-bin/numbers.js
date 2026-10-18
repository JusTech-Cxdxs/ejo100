"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.highestSequence = highestSequence;
exports.highestBinnedReference = highestBinnedReference;
/**
 * Job Card and Vehicle Service numbers are never given out twice.
 *
 * A record in the Recycle bin (or one already removed for good) keeps its
 * number. Emails, notifications and audit entries that mention that number
 * must never open a different record, so the next number is worked out from
 * the highest one in use OR ever binned this year.
 */
const database_1 = require("@ejo/database");
/** Highest sequence after `prefix` among live and binned references (0 when none). */
function highestSequence(prefix, references) {
    let best = 0;
    for (const ref of references) {
        if (!ref || !ref.startsWith(prefix))
            continue;
        const n = parseInt(ref.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > best)
            best = n;
    }
    return best;
}
/** The highest number of this kind ever moved to the Recycle bin with this prefix. */
async function highestBinnedReference(entityType, prefix) {
    const item = await database_1.prisma.recycleBinItem.findFirst({
        where: { entityType, reference: { startsWith: prefix } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
    });
    return item?.reference ?? null;
}
