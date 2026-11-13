# SPEC: Coffee, 30-second teaser

GOAL: a student who has done a few coffee chats recognises the problem (forgotten details, no follow-up) and
opens the public demo.
OUTPUT: HyperFrames, 1920x1080, 30 fps, 30.0 s. Voice is the clock (silent slot until Bryce's take exists).

STORYLINE (picked, non-interactive run): **"What did each one tell you?"** The 12 people from the demo account
appear and fade like memory does, then Coffee walks through where those details live: the Network list, one
person's meeting notes, the 30-day follow-up flag, the applications table, the end card.
Not built: a "Monday morning" day-in-the-life cut, and a stats-led cut (no real usage numbers to show).

LOOK (Coffee's own tokens, `src/index.css`):
- Ground `--color-depth-0` #081418; card `--color-depth-1` #0B1F2A; one accent `--color-glow` #00E5FF.
- Inter (the app's font). Title 88 px / 700 / -3%; captions 46 px / 600 on an #081418 86% pill.
- Every product screen is a real capture of `/demo` (sample data from `src/demo/sampleData.ts`, nothing real),
  3200x1800, shown at 1920x1080 so 1.6x punch-ins stay sharp. The meeting-notes card is rebuilt at 1.6x with
  the demo's own note text, word for word. The end-card mark is the app's own cup SVG (`Logo.tsx`).

MOTION: arrivals `expo.out`, camera `power2.inOut` 0.55-0.6 s, exits `power3.in` 0.2-0.3 s.
Seams: blur swap (hook to Network), zoom through Priya's row (Network to contact), whip (contact to
follow-up, and inside follow-up to Outreach), dip cut (to Applications), blur swap (to end card).

SOUND: no music (no music source on this machine). Effects only: click on the cursor click, soft keys under the
notes, pops on the two table highlights, a low riser into the end card.

BANNED: invented screens or data, real users' data, signing in, hype words, logo docked in a corner,
titles that move after landing, click rings.
