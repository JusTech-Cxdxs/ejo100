/**
 * Writes docs/KEWALRAM_DEMO.md from lib/demo/people.ts and lib/demo/tour.ts:
 *   npm run demo:tour-doc
 * tests/demo-tour.test.ts fails while the file is out of date.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderTourDoc } from '../lib/demo/tour-doc';

const path = join(__dirname, '..', '..', '..', 'docs', 'KEWALRAM_DEMO.md');
writeFileSync(path, renderTourDoc());
console.log(`Wrote ${path}`);
