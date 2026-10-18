# Product video pipeline

Everything that produced `EJO100-demo-desktop.mp4` (1920×1080) and
`EJO100-demo-mobile.mp4` (1080×1920): a real portal, real records, a
scripted narrator, branded cards, burned-in captions and a generated music bed.
Nothing here runs in CI (`*.demo.ts` is outside the e2e `testMatch`).

| Step | File | What it does |
| --- | --- | --- |
| 1 | `playwright.demo.config.ts`, `prep.demo.ts`, `prep2.demo.ts` | Fills the demo database through the real UI with the e2e helpers: Job Cards in three states, a visitor, a delivery, an exit pass, a meeting room and appointment, a support request. |
| 2 | `script.json` | The narration, one entry per scene (`dur` = seconds of voice). |
| 3 | Piper (`en-us-ryan-high`) | One WAV per scene: `piper --model en-us-ryan-high.onnx --sentence_silence 0.4 --length_scale 1.05`. |
| 4 | `cards.html`, `cards.mjs` | The intro card (the group's letterhead lockup: logo, wordmark, green rule, "Chanrai Group") and the outro (EJO 100 mark, JusTech). Rendered frame by frame through the Web Animations API, so every frame is exact. |
| 5 | `record.mjs` | Drives the running portal through each scene as the right person, with a visible cursor and a highlight ring. Every frame is a full-resolution CDP screenshot with its own duration (`--mobile` records at 360×640 CSS px, 3× = 1080×1920). |
| 6 | `demo-llm.mjs` | Stand-in model server so Enyo answers the question the video asks (a copy of `packages/enyo/testing/mock-llm.mjs` with scripted answers). |
| 7 | `assemble.py` | Fits each scene to its narration (freeze-frame tail), fades, captions (`.srt` also kept here), a synth pad ducked under the voice, the phone-in-bezel composite for the desktop cut, final H.264/AAC. |
| 8 | `shots.mjs` | Quick page screenshots per role, for planning scenes. |

Run order (portal built and started on :3001 with the seeded database; `JC1` = the in-progress Job Card id):

```sh
npx playwright test --config=e2e/demo-video/playwright.demo.config.ts        # data
node e2e/demo-video/demo-llm.mjs &                                           # Enyo's model
node e2e/demo-video/cards.mjs <work>/cards intro 8.5 landscape               # ×4: intro/outro × landscape/portrait
JC1=<id> node e2e/demo-video/record.mjs <work>/scenes 02-signin,…,13-leadership
JC1=<id> node e2e/demo-video/record.mjs <work>/scenes-mobile 02-signin,…,14-mobile --mobile
python3 e2e/demo-video/assemble.py <work> desktop && python3 e2e/demo-video/assemble.py <work> mobile
```

The demo accounts are the seeded e2e people renamed (`Funmi Adeyemi` = front desk, `Samuel Okafor` =
supervisor, …, all `firstname.lastname@kewalram.com`, password as in `e2e/people.ts`).
