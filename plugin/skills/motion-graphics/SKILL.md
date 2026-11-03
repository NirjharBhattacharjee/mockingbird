---
name: motion-graphics
description: Animate a mockingbird edit with code so it looks professionally edited, not templated: kinetic titles, captions with a pill that follows the voice, a camera that jump-cuts, punches in and glides to what's being discussed, chapter cards, glass cards, checklists, counters, hand-drawn rings and arrows, light leaks, grain, and a sound on every beat. You write a short script against the kit (kit.ts) and mockingbird's `motion` tool draws it frame by frame on the Mac. Use whenever a short or long-form edit needs anything on screen to move.
---

# Motion graphics

Motion graphics here are code. A script's `draw(ctx, t, m)` draws one frame
with the Canvas 2D API, mockingbird's `motion` tool calls it for every frame
over the cut and saves an MP4, and **the kit** (`kit.ts`, beside this file)
does the design: what to draw, how it moves, how it sounds. The defaults
come from studying twenty professional videos frame by frame
([docs/STYLE-STUDY.md](../../docs/STYLE-STUDY.md)). They're meant to look
finished with no further prompting, so start from a template and change its
settings, not from a blank file.

## The workflow

1. **Cut first.** `render` makes the cut: clips, framing (`split` for a
   screen and a face), b-roll `inserts`, music. Leave out its `captions` and
   `texts`; the kit draws them.
2. **Caption it.** `captions` with the same clips and `perCue: 3` gives SRT
   timed to the cut with the spoken word `*marked*`. It's `motion`'s
   `captions`, and the scripts read it as `m.cues`.
3. **Copy a template** next to the video and replace `"KIT"` in its import
   with this skill's absolute path plus `/kit.ts`:
   - [templates/short.ts](./templates/short.ts) for 9:16. A slammed hook
     with an italic sub-line; a new framing every ~2.2 s on word starts so
     one take reads as an edit; punch-ins and a pop on your `KEYWORDS`; two
     or three big `CALLOUTS`; pill captions; a progress bar, a light leak,
     a vignette and grain.
   - [templates/explainer.ts](./templates/explainer.ts) for long-form and
     anything that explains. Its `SCENES` list is the whole edit: `intro`,
     `chapter`, `name`, `look` (the camera glides to a point, optionally
     ringing it and labelling it), `photo`, `quote`, `checklist`.
4. **Fill in the settings from the transcript.** Times are seconds into the
   cut. Pick the hook, the keywords, the callouts or the scenes. That's the
   creative work; the template does the rest.
5. **Check stills before the whole thing.** `motion` with `duration` set to
   a few seconds renders the start; for a moment in the middle, render
   that stretch. A 30 s 1080x1920 short at 60 fps takes about 90 s on an M3.
6. **Draw it**: `motion` with `script`, `path` (the cut), `captions`, and
   `fps` matching the cut (`ffprobe -v error -select_streams v:0
   -show_entries stream=r_frame_rate -of csv=p=0 <cut>`). The template's
   `audio` export adds the sound effects, mixed and ducked under speech.
7. **Review**: `frames` over the result, then the **reviewer** agent.

Without a video, `motion` with `size` and `duration` makes graphics on their
own: run the explainer template with no footage to make a title sequence or
a chapter card to `inserts` into a `render`.

## The kit

`const k = kit(ctx, t, m, THEMES.night)` at the top of `draw`, then call
what you need, back to front. Sizes are in units of 1/1080 of the short
side, so the same script works at 1080x1920 and 1920x1080. Every piece
takes `at` and usually `out` (seconds) and animates itself in and out.

| Layer | Calls |
|---|---|
| Atmosphere | `backdrop({ grid })` drifting gradient lights · `bokeh()` · `leak(at)` light leak · `flash(at)` · `scrim({ y })` dark band behind text · `vignette()` · `grain()` |
| Footage | `camera({ area, focus, cuts, framings, punches, shakes, moves })` returns `{ zoom, project(x, y) }` · `pip({ src, x, y, w, h })` webcam bubble |
| Type | `title({ lines, style: "rise" \| "slam" \| "blur", glow, gradient })` · `kicker()` · `counter()` · `typewriter()` · `captions({ y, size })` · `quote()` |
| Marks | `ring()` · `arrow()` · `highlight()` · `stroke(path, length, p)` · `reticle()` · `spotlight()` |
| Cards and structure | `glass({ inner })` · `lowerThird()` · `chapter()` · `checklist()` · `progress()` · `photo()` · `bars()` · `wipe(at)` |
| Helpers | `words(cues)` · `cutPoints(cues, every)` · `presence(t, at, out)` · `expo` · `hash(n)` · `sfx(name)` |

A title's `lines` are runs, so one line can mix faces:
`[[{ text: "Read the " }, { text: "docs", italic: true, family: T.serif, color: T.accent }]]`.

**Themes**: `night` (a launch film: near black, violet and blue light),
`punch` (shorts: black and yellow), `studio` (Apple-style soft grey),
`neon` (Kurzgesagt purples), `paper` (warm map paper, red ink). Each has a
display face (SF Pro), an italic serif (Charter) and a mono (Menlo). A font
that isn't installed is an error, so give a fallback (`"Didot, serif"`).
Charter, Iowan Old Style, Didot, Georgia, Avenir Next and Helvetica Neue
are on every Mac.

**Sounds**: `sfx("whoosh" | "pop" | "tick" | "impact" | "riser" |
"shimmer" | "click")`, made for the kit, free to use. Return them from the
script's `audio` export, `{ path, at, volume }`, on the beats the motion
lands on.

## What makes it look professional

These come from the style study; the templates already follow them.

- **Change the picture every 1.2 to 2.5 s in a short.** Cuts, a new
  framing, b-roll, a callout: something. `cutPoints` places framings on
  word starts; alternate framings 1.0 / 1.16 / 1.06 / 1.24 hide jump cuts.
- **Nothing flat.** Text sits on a scrim, a glass card or a backdrop, never
  bare on busy footage. Light comes from gradients; grain and a vignette
  finish every frame.
- **The camera never stops.** Every shot drifts in a few per cent. On a
  screen recording, `look` scenes (`camera`'s `moves`) glide to what's
  being described and back, and `pip` keeps the webcam in frame.
- **Reveal in a stagger.** Words about 60 ms apart; a list item at a time;
  rings and arrows drawn on in about 0.5 s. Things leave as deliberately
  as they come.
- **Structure that stays.** A progress bar, a checklist that ticks as each
  point is made, chapter cards with numbers. It tells the viewer how much
  is left.
- **One accent, one display face, one serif.** The serif italic is for the
  turn of phrase ("you will *not* learn"), not decoration.
- **A sound on every beat, nothing in between.** Music under explanation
  lowers recall (Mayer's coherence principle, [RESEARCH.md](../../docs/RESEARCH.md));
  effects on the beats are what make motion feel heavy.
- **Keep the apps' furniture clear** in a short: text between about 12%
  and 80% of the height and off the right-hand strip.
- **Restraint still wins.** One callout at a time, two or three a short.
  If it doesn't do a job (say the hook, show what's named, mark a turn, keep
  the eye moving), leave it out.

## Writing your own pieces

- One `draw` export; import the kit by absolute path. The script is loaded
  fresh for each `motion` call.
- Everything is a function of `t`: no state between frames, no `Date`, no
  `Math.random()` (`hash(n)` is a fixed random). Work things out once from
  `m.cues` and cache them at module level, as the templates do with
  `plan`.
- Wrap each element in `k.layer(() => …)` so transforms and shadows don't
  leak. `k.ctx` and `k.m` are there for pieces you draw yourself, so a
  helper function only needs `k`; a `glass` card's `inner` draws in the
  card's own coordinates.
- `ctx.filter = "blur(…)"` blurs the whole frame, about 6 ms each time; for
  soft text the kit draws a shadow instead (`title`'s blur costs 0.4 ms).
  A full-frame `backdrop` is about 35 ms; over footage the template's
  layers cost about 25 ms a frame.
- The video is drawn under each frame. To zoom or pan, `camera` redraws it;
  for anything custom, `ctx.drawImage(m.video, sx, sy, sw, sh, dx, dy, dw, dh)`.

## When it fails

`motion` reports `draw failed at 2.40 s (frame 72): …` and saves nothing.
Read the time, fix the script, and render that stretch again with
`duration` before doing the whole video. An unknown colour or font is an
error, not a silent fallback. It needs a Mac with Apple silicon; without
one, finish with `render`'s still `captions` and `texts`, and say so.
