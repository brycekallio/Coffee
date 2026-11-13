# Coffee demo: voiceover script

30 s teaser. Plain and specific: every line is something the demo screen shows.
**71 words** (target 70-80; about 2.5 words a second with room to breathe).

| # | Time (s) | On screen | Voiceover | Words |
|---|---|---|---|---|
| 1 | 0.3 – 5.0 | "12 coffee chats this semester." The demo's 12 sample names fade out | You had coffee with twelve people this semester. What did each one tell you? | 14 |
| 2 | 5.3 – 10.2 | Network page, punch in on the People list; cursor opens Priya Raman | Coffee keeps them in one place: where they work, and when you last met. | 14 |
| 3 | 10.5 – 14.9 | Priya's page; the meeting-notes panel comes forward and fills in | After each chat, log a few notes. Next time, they're right there. | 12 |
| 4 | 15.2 – 20.4 | "2 people are due a follow-up (30+ days since you met)" underlined; whip to Outreach, cursor clicks "Schedule follow-up" on Hannah Weiss and a calendar slot (Thu 19, 10:30) fills in (demo data only) | Thirty days without a chat, and Coffee flags them, so you can schedule a follow-up. | 15 |
| 5 | 20.7 – 25.0 | Applications table; the Saved row, then the Offer row light up | Track each application, from saved to offer, beside your contacts. | 10 |
| 6 | 25.6 – 28.8 | End card: Coffee? mark, tagline "Your network, in one place.", "Try the demo", coffee-app-network.netlify.app/demo | Try the demo. No sign-up needed. | 6 |

Read it at a normal talking pace. Line 6 lands while the mark and the button are on screen; leave the last
second quiet.

## Voiceover (dropped in 2026-11-12)

Bryce's ElevenLabs clone (voice `91jhZaqO949C1LvHzeUa`), model eleven_v4, one take of all six lines (flow
https://elevenlabs.io/app/flows/2odCpKPzDeFqpBwWgsf2, take 2 of 2, 24.2 s). `assets/voiceover.wav` is that take cut at the
line boundaries and each line placed at its scene start (0.3, 5.3, 10.5, 15.2, 20.7, 25.6 s), padded to 30 s. Caption
times come from the take's own word times mapped through that placement (`assets/transcript.json`), then
`node tools/gen-captions.mjs`. To redo: regenerate, cut and place the same way; no scene needed to move.
