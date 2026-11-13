# Coffee demo: voiceover script

30 s teaser. Plain and specific: every line is something the demo screen shows.
**71 words** (target 70-80; about 2.5 words a second with room to breathe).

| # | Time (s) | On screen | Voiceover | Words |
|---|---|---|---|---|
| 1 | 0.3 – 5.0 | "12 coffee chats this semester." The demo's 12 sample names fade out | You had coffee with twelve people this semester. What did each one tell you? | 14 |
| 2 | 5.3 – 10.2 | Network page, punch in on the People list; cursor opens Priya Raman | Coffee keeps them in one place: where they work, and when you last met. | 14 |
| 3 | 10.5 – 14.9 | Priya's page; the meeting-notes panel comes forward and fills in | After each chat, log a few notes. Next time, they're right there. | 12 |
| 4 | 15.2 – 20.4 | "2 people are due a follow-up (30+ days since you met)" underlined; whip to Outreach | Thirty days without a chat, and Coffee flags them, so you can schedule a follow-up. | 15 |
| 5 | 20.7 – 25.0 | Applications table; the Saved row, then the Offer row light up | Track each application, from saved to offer, beside your contacts. | 10 |
| 6 | 25.6 – 28.8 | End card: Coffee? mark, "Try the demo", coffee-app-network.netlify.app/demo | Try the demo. No sign-up needed. | 6 |

Read it at a normal talking pace. Line 6 lands while the mark and the button are on screen; leave the last
second quiet.

## Dropping in the voiceover

The film currently plays a **silent timing track**, `assets/voiceover.wav` (30 s), mounted in `index.html`
as `<audio id="voiceover">` under the `VOICEOVER SLOT` comment. The captions are timed to the table above.

1. Record or generate the take in ElevenLabs with Bryce's cloned voice, reading the six lines above. Export
   WAV or MP3, about 30 s, starting about 0.3 s in.
2. Save it over `assets/voiceover.wav` (same name; if it is an MP3, change the `src` in `index.html`).
3. Re-time the captions to the real read:
   `npx hyperframes transcribe assets/voiceover.wav --model small.en --json`, copy each group's first-word
   start and last-word end into `captions.json`, then `node tools/gen-captions.mjs`.
4. If a line runs long, move the scene hosts in `index.html` (their `data-start`) rather than squeezing the read.
5. `npx hyperframes check`, then
   `npx hyperframes render -o renders/coffee-demo.mp4 --quality delivery`, and copy the file to
   `../public/media/coffee-demo.mp4` (and regenerate the GIF: see `REVIEW.md`).
