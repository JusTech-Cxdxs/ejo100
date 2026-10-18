// Renders the branded intro/outro cards frame by frame (Web Animations API
// driven, so every frame is exact) and encodes them with ffmpeg.
// node cards.mjs <outDir> <intro|outro> <seconds> <landscape|portrait>
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [,, outDir, which, secondsArg, orient = 'landscape'] = process.argv;
const seconds = Number(secondsArg);
const FPS = 30;
const size = orient === 'portrait' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const html = fs.readFileSync(new URL('./cards.html', import.meta.url), 'utf8')
  .replace('src="LOGO"', `src="data:image/png;base64,${fs.readFileSync(new URL('../../public/images/logo/logo.png', import.meta.url)).toString('base64')}"`);
fs.mkdirSync(outDir, { recursive: true });
const frames = path.join(outDir, `${which}-${orient}-frames`);
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate((w) => {
  document.getElementById('intro').style.display = w === 'intro' ? 'flex' : 'none';
  document.getElementById('outro').style.display = w === 'outro' ? 'flex' : 'none';
}, which);
await page.evaluate(() => document.fonts.ready);
const n = Math.round(seconds * FPS);
const cdp = await page.context().newCDPSession(page);
for (let i = 0; i < n; i++) {
  const t = (i / FPS) * 1000;
  await page.evaluate((ms) => { for (const a of document.getAnimations()) a.currentTime = ms; }, t);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(frames, `f${String(i).padStart(5, '0')}.png`), Buffer.from(data, 'base64'));
}
await browser.close();
const out = path.join(outDir, `${which}-${orient}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.png'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
fs.rmSync(frames, { recursive: true, force: true });
console.log('wrote', out, n, 'frames');
