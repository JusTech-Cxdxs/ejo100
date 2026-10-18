"use strict";
/** What Enyo reads aloud, and in what pieces (pure, tested). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.speechChunks = speechChunks;
exports.speakable = speakable;
/**
 * Short pieces at sentence ends: some browsers stop a long utterance after
 * about 15 seconds, and short pieces let the voice breathe between sentences.
 */
function speechChunks(text, max = 220) {
    const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
    const out = [];
    let cur = '';
    for (const raw of sentences) {
        const sentence = raw.trim();
        if (!sentence)
            continue;
        if ((cur + ' ' + sentence).trim().length > max && cur) {
            out.push(cur.trim());
            cur = '';
        }
        if (sentence.length > max) {
            for (let i = 0; i < sentence.length; i += max)
                out.push(sentence.slice(i, i + max));
            continue;
        }
        cur = `${cur} ${sentence}`;
    }
    if (cur.trim())
        out.push(cur.trim());
    return out;
}
/** Words that read badly aloud: links, reference marks, symbols. */
function speakable(text) {
    return text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/₦\s?/g, 'naira ')
        .replace(/\b(JC|SV|EPR|PRS|GRN)-(\d{4})-0*(\d+)\b/g, '$1 $3')
        .replace(/[|*_#`>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2500);
}
