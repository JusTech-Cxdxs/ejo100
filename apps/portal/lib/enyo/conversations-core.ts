/** Pure helpers for learning from conversations (tested). */

/** "Hi Chinedu," / "Hello Ada!" / "Good morning, Mr Okafor." at the start of an answer: removed. */
export function withoutGreeting(text: string): string {
  return text.replace(/^\s*(hi|hello|hey|dear|good (morning|afternoon|evening))\b,?[^\n.!?,]{0,40}[,.!]\s*/i, '').trim();
}
