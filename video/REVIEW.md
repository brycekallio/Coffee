# REVIEW: Coffee demo teaser

**Delivered:** `renders/coffee-demo.mp4` (gitignored), 30.0 s, 1920x1080, 30 fps, 6.6 MB, copied to
`public/media/coffee-demo.mp4` (served at https://coffee-app-network.netlify.app/media/coffee-demo.mp4 once
deployed). Poster `public/media/coffee-demo-poster.jpg`. README GIF `docs/coffee-demo.gif` (5.4-13.8 s,
960 px, 10 fps, 2.1 MB).

Regenerate the GIF after a re-render:
`ffmpeg -ss 5.4 -t 8.4 -i renders/coffee-demo.mp4 -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 ../docs/coffee-demo.gif`

## Checked

- `check`: ok, 0 errors. Frames looked at from snapshots and from the rendered MP4 (0, 2, 4, 6, 8, 9.2,
  10.6, 12.5, 14.2, 15.8, 16.5, 17.5, 19.5, 22, 23.8, 26.8, 29.5 s).
- Loudness -21.5 LUFS integrated with effects only; the voiceover will set the real level.

## Warnings kept on purpose

- `text_below_floor` on the Outreach calendar popover: slot times are 24 px on screen (day names and the Scheduled line are larger); they are secondary data, the caption carries the line.
- `line_unread` on the meeting note: it is product text being typed, skimmed, not read; the caption carries
  the line.
- `overlapping_gsap_tweens` on `.ec-path`: two tweens on different paths of the cup; the linter groups them.

## Weakest shot

Outreach (17.6-20.6 s) acts on the real product (re-shot 2026-11-12 after the button shipped, PR #13): the cursor
clicks the real "Schedule follow-up" button on Hannah Weiss's card, the real slot picker opens, and Thu 19, 10:30 is
picked. Three real /demo captures (`outreach.jpg`, `outreach-open.jpg`, `outreach-picked.jpg`), cut on the clicks; nothing
drawn. The demo is read-only and not connected to Google, so the picker truthfully offers "Connect Google Calendar" and
"Just remind me"; the scene ends on the pick, not on a fake confirmation. `contacts.jpg` re-shot too: the demo now has
3 people due (Hannah's 45-day-old "Leeds finance night" meeting).
End card tagline is "Your network, in one place." Voiceover: Bryce's cloned voice, see SCRIPT.md.
