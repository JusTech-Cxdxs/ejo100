#!/usr/bin/env python3
"""Assembles the product video from the recorded scenes, the Ryan narration,
the branded cards, burned-in subtitles and a generated music bed.

  python3 assemble.py <work> <cut>      cut = desktop (1920x1080) | mobile (1080x1920)

<work> holds script.json (with per-scene voice durations), voice/, cards/,
scenes/ (desktop recordings) and scenes-mobile/ (phone recordings).
"""
import json, math, os, subprocess, sys, textwrap, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

work, cut = sys.argv[1], sys.argv[2]
MOBILE = cut == 'mobile'
W, H = (1080, 1920) if MOBILE else (1920, 1080)
FPS = 30
VOICE_IN = 0.6      # narration starts this long after the scene opens
TAIL = 0.9          # breathing room after the narration ends
FADE = 0.25
script = json.load(open(f'{work}/script.json'))
out_dir = f'{work}/build-{cut}'
os.makedirs(out_dir, exist_ok=True)

def run(args): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)
def probe(path): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode())

# ---- the phone-frame composite (desktop cut only): the phone recording inside a bezel on a branded slate
def phone_layer(path):
    img = Image.new('RGBA', (W, H), (15, 23, 42, 255))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    for r in range(520, 0, -8):
        a = int(70 * (1 - r / 520) ** 2); g.ellipse((1450 - r, 540 - r * 0.85, 1450 + r, 540 + r * 0.85), fill=(34, 197, 94, a))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    font = lambda s, w='Bold': ImageFont.truetype(f'/usr/share/fonts/opentype/inter/Inter-{w}.otf', s)
    d.text((160, 330), 'The same platform,', font=font(64), fill=(255, 255, 255, 255))
    d.text((160, 410), 'in your pocket.', font=font(64), fill=(34, 197, 94, 255))
    y = 530
    for line in ['Installs on any phone like an app', 'Same data, same permissions', 'Same letterhead on every print-out', 'Works for the gate, the floor and the road']:
        d.ellipse((164, y + 14, 180, y + 30), fill=(34, 197, 94, 255)); d.text((204, y), line, font=font(30, 'Medium'), fill=(203, 213, 225, 255)); y += 58
    d.text((160, 900), 'EJO 100 Enterprise Platform  ·  Powered by EJO 100', font=font(22, 'Medium'), fill=(100, 116, 139, 255))
    # bezel: outer rounded rect, transparent screen hole
    sx, sy, sw, sh = 1205, 100, 495, 880
    d.rounded_rectangle((sx - 16, sy - 16, sx + sw + 16, sy + sh + 16), radius=64, fill=(2, 6, 23, 255))
    hole = Image.new('L', (W, H), 0); ImageDraw.Draw(hole).rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=48, fill=255)
    alpha = img.getchannel('A'); alpha.paste(0, mask=hole); img.putalpha(alpha)
    img.save(path); return (sx, sy, sw, sh)

def source_for(s):
    if s.get('kind') == 'card':
        return f"{work}/cards/{'intro' if s['id'].endswith('intro') else 'outro'}-{'portrait' if MOBILE else 'landscape'}.mp4", None
    if MOBILE or s['id'] == '14-mobile':
        return f"{work}/scenes-mobile/{s['id']}.mp4", None if MOBILE else 'phone'
    return f"{work}/scenes/{s['id']}.mp4", None

clips, timeline, t = [], [], 0.0
for s in script:
    src, mode = source_for(s)
    vdur, voice = probe(src), f"{work}/voice/{s['id']}.wav"
    is_card = s.get('kind') == 'card'
    T = vdur if is_card else max(vdur + 0.3, VOICE_IN + s['dur'] + TAIL)
    clip = f"{out_dir}/{s['id']}.mp4"
    vf = []
    if mode == 'phone':
        layer = f'{out_dir}/phone-layer.png'; sx, sy, sw, sh = phone_layer(layer)
        inputs = ['-i', src, '-i', layer, '-i', voice]
        vchain = (f"[0:v]scale={sw}:{sh},tpad=stop_mode=clone:stop_duration={T:.3f},trim=0:{T:.3f},setpts=PTS-STARTPTS[p];"
                  f"color=c=#0F172A:s={W}x{H}:r={FPS}:d={T:.3f}[bg];[bg][p]overlay={sx}:{sy}[v0];[v0][1:v]overlay=0:0,fade=t=in:d={FADE},fade=t=out:st={T-FADE:.3f}:d={FADE},format=yuv420p[v]")
        achain = f"[2:a]adelay={int(VOICE_IN*1000)}|{int(VOICE_IN*1000)},apad,atrim=0:{T:.3f},asetpts=PTS-STARTPTS[a]"
    else:
        inputs = ['-i', src, '-i', voice]
        fades = f"fade=t=in:d={FADE}," if not (is_card and s['id'].endswith('intro')) else ''
        fades += f"fade=t=out:st={T-FADE:.3f}:d={FADE}" if not (is_card and s['id'].endswith('outro')) else f"fade=t=out:st={T-0.8:.3f}:d=0.8"
        vchain = f"[0:v]tpad=stop_mode=clone:stop_duration={T:.3f},trim=0:{T:.3f},setpts=PTS-STARTPTS,{fades},format=yuv420p[v]"
        achain = f"[1:a]adelay={int(VOICE_IN*1000)}|{int(VOICE_IN*1000)},apad,atrim=0:{T:.3f},asetpts=PTS-STARTPTS[a]"
    run([*inputs, '-filter_complex', f"{vchain};{achain}", '-map', '[v]', '-map', '[a]', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', clip])
    clips.append(clip); timeline.append((s, t, T)); t += T
    print(f"{s['id']:14s} video {vdur:5.1f}s  voice {s['dur']:5.1f}s  -> {T:5.1f}s")
total = t
print(f'total {total/60:.1f} min')

# ---- subtitles (SRT): caption chunks timed by character count across the narration
maxc = 28 if MOBILE else 42
import re
def caption_text(t): return t.replace('EJO one hundred', 'EJO 100').replace('one hundred', '100')
def chunks(text):
    """Caption blocks of at most two lines, broken at sentence ends first, then at commas/colons, then by words."""
    text = caption_text(text)
    units = [u.strip() for u in re.split(r'(?<=[.?!])\s+', text) if u.strip()]
    out = []
    for u in units:
        parts = [u]
        if len(u) > maxc * 2:
            parts = [p.strip() for p in re.split(r'(?<=[,;:])\s+', u) if p.strip()]
            merged = []
            for p in parts:
                if merged and len(merged[-1]) + 1 + len(p) <= maxc * 2: merged[-1] += ' ' + p
                else: merged.append(p)
            parts = merged
        for p in parts:
            lines = textwrap.wrap(p, maxc)
            for i in range(0, len(lines), 2): out.append('\n'.join(lines[i:i + 2]))
    return out
def ts(x): h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60; return f"{h:02d}:{m:02d}:{s:06.3f}".replace('.', ',')
srt, n = [], 1
for s, start, T in timeline:
    cs = chunks(s['text']); total_chars = sum(len(c) for c in cs); at = start + VOICE_IN
    for c in cs:
        d = s['dur'] * len(c) / total_chars
        srt.append(f"{n}\n{ts(at + 0.05)} --> {ts(at + d - 0.08)}\n{c}\n"); n += 1; at += d
open(f'{out_dir}/subtitles.srt', 'w').write('\n'.join(srt))

# ---- music bed: a soft synth pad (generated, royalty-free by construction)
sr = 48000
def pad(seconds):
    chords = [[261.63, 329.63, 392.0, 493.88], [220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 261.63, 329.63], [196.0, 246.94, 293.66, 392.0]]  # Cmaj7 Am7 Fmaj7 G
    seg, n = 8.0, int(seconds * sr); out = np.zeros(n); tt = np.arange(n) / sr
    for i, f0s in enumerate(chords * int(math.ceil(seconds / seg / len(chords)))):
        a, b = i * seg, (i + 1) * seg
        if a >= seconds: break
        env = np.clip(np.minimum((tt - a + 1.5) / 1.5, (b + 1.5 - tt) / 1.5), 0, 1) ** 2  # overlapping swells
        for k, f in enumerate(f0s):
            ph = np.random.rand() * 6.28
            out += env * (0.5 / (k + 1)) * (np.sin(2 * np.pi * f * tt + ph) + 0.28 * np.sin(4 * np.pi * f * tt + ph) + 0.1 * np.sin(6 * np.pi * f * tt))
        out += env * 0.45 * np.sin(2 * np.pi * (f0s[0] / 2) * tt)
    out *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * tt)           # slow shimmer
    # a touch of room: three short feedback delays
    for dly, g in ((0.173, 0.28), (0.311, 0.2), (0.457, 0.14)):
        k = int(dly * sr); out[k:] += g * out[:-k]
    out /= np.max(np.abs(out)) + 1e-9
    fade = np.ones(n); fi, fo = int(2 * sr), int(4 * sr); fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
    return (out * fade * 0.9)
music = pad(total + 1)
with wave.open(f'{out_dir}/music.wav', 'wb') as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr); wf.writeframes((music * 32767).astype(np.int16).tobytes())

# ---- concat, then the final pass: subtitles burned in, music ducked under the voice
open(f'{out_dir}/concat.txt', 'w').write(''.join(f"file '{c}'\n" for c in clips))
run(['-f', 'concat', '-safe', '0', '-i', f'{out_dir}/concat.txt', '-c', 'copy', f'{out_dir}/concat.mp4'])
font_size = 11 if MOBILE else 12
style = (f"FontName=Inter,FontSize={font_size},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&HAA0F172A,BackColour=&H80000000,"
         f"BorderStyle=1,Outline=2.4,Shadow=0.9,MarginV={34 if MOBILE else 28},MarginL=40,MarginR=40,Alignment=2")
final = f"{work}/EJO100-demo-{cut}.mp4"
run(['-i', f'{out_dir}/concat.mp4', '-i', f'{out_dir}/music.wav', '-filter_complex',
     f"[0:a]asplit=2[vo][key];[1:a]volume=0.16[m];[m][key]sidechaincompress=threshold=0.015:ratio=5:attack=40:release=700:makeup=1[md];"
     f"[vo][md]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a];"
     f"[0:v]subtitles={out_dir}/subtitles.srt:force_style='{style}'[v]",
     '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final])
print('wrote', final, f'{probe(final):.1f}s')
