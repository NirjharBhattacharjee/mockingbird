---
name: motion-graphics
description: Animate a mockingbird edit with code so it looks professionally edited, not templated: kinetic titles, captions with a pill that follows the voice, a camera that jump-cuts, punches in and glides to what's being discussed, chapter cards, glass cards, checklists, counters, hand-drawn rings and arrows, light leaks, grain, and a sound on every beat. You write a short HTML page that uses the kit (kit.js) and mockingbird's `motion` tool renders it frame by frame in a headless Chrome on the Mac. Use whenever a short or long-form edit needs anything on screen to move.
---

# Motion graphics

Motion graphics here are code. A page's `draw(ctx, t, m)` draws one frame
on a canvas with the Canvas 2D API, mockingbird's `motion` tool renders the
page in a headless Chrome for every frame of the cut and saves an MP4, and
**the kit** (`kit.js`, beside this file) does the design: what to draw, how
it moves, how it sounds. The defaults
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
   `captions`, and the pages read it as `m.cues`.
3. **Copy a template** next to the video. Leave its `from "KIT"` import as it
   is: `motion` swaps in this skill's `kit.js`.
   - [templates/short.html](./templates/short.html) for 9:16. A slammed hook
     with an italic sub-line; a new framing every ~2.2 s on word starts so
     one take reads as an edit; punch-ins and a pop on your `KEYWORDS`; two
     or three big `CALLOUTS`; pill captions; a progress bar, a light leak,
     a vignette and grain.
   - [templates/explainer.html](./templates/explainer.html) for long-form and
     anything that explains. Its `SCENES` list is the whole edit: `intro`,
     `chapter`, `name`, `look` (the camera glides to a point, optionally
     ringing it and labelling it), `photo`, `quote`, `checklist`.
   - [templates/styles.html](./templates/styles.html) for an explainer
     drawn from scratch in one of the [styles](#explainer-styles): set
     `STYLE` and write `SCENE`.
   - [templates/editor-reel.html](./templates/editor-reel.html) for a vlog
     or creator clip in the editor-reel look, 9:16 or 16:9: the footage in a
     torn-paper window on a paper board, a hook whose letters scatter in (a
     heavy sans against an italic serif), a new shot every ~1.2 s with a
     glitch, zoom blur or flash on each cut, stickers, marker scribbles and
     captions.
4. **Fill in the settings from the transcript.** Times are seconds into the
   cut. Pick the hook, the keywords, the callouts or the scenes. That's the
   creative work; the template does the rest.
5. **Check stills before the whole thing.** `motion` with `duration` set to
   a few seconds renders the start; for a moment in the middle, render
   that stretch. A 25 s 1080x1920 short at 60 fps takes about a minute on an M3.
6. **Draw it**: `motion` with `script` (the page), `path` (the cut), `captions`, and
   `fps` matching the cut (`ffprobe -v error -select_streams v:0
   -show_entries stream=r_frame_rate -of csv=p=0 <cut>`). The `audio`
   function the template hands to `page()` adds the sound effects on their
   beats, at their own volumes. Only sounds marked `duck: true`, like music,
   drop while someone speaks. The first `motion` call asks for Chrome if it isn't
   there: `mockingbird models pull chrome`.
7. **Review**: `frames` over the result, then the **reviewer** agent.

Without a video, `motion` with `size` and `duration` makes graphics on their
own: run the explainer template with no footage to make a title sequence or
a chapter card to `inserts` into a `render`.

## Explainer styles

For an explanation drawn from scratch rather than over footage (a diagram
that builds, a process, a number that matters), `styles/` holds dozens of
complete looks: whiteboard marker, comic halftone, chalkboard, blueprint,
watercolour, neon sign, pixel art, a CRT terminal, risograph, stained
glass and the rest. `STYLES` lists them by id, each with a name and a
family.

These are references. For a real edit, the **look** playbook (`guide("look")`)
has you invent a look for the video from them and get the user's approval
first. Use a named style as it is only when the user asks for it.

Every style draws the same pieces, so a scene written once renders in any
of them:

| | |
|---|---|
| `surface()` | the world: a board, paper, space, a screen |
| `title(text)` | the heading |
| `label(text, x, y)` | a short label |
| `node(x, y, r)` | a thing or a point |
| `box(x, y, w, h)` | a container |
| `link(x1, y1, x2, y2, { bend, head })` | a connection or an arrow |
| `store(x, y, w, h)` | where data lives |
| `stat(text, x, y, { count, sub })` | a big number, counting up |
| `mark("check" \| "cross", x, y)` | a tick or a cross |
| `finish()` | the last layer: grain, scanlines, the pen |

Each takes `{ at, dur, tone }`: when it arrives, how long its entrance
takes, and its tone (`ink`, `accent`, `good`, `bad`, `muted`), which the
style turns into its own colours. Positions are 0 to 1 of the frame.

Start from [templates/styles.html](./templates/styles.html): it imports
`page` from `"KIT"` and `style` from `"STYLES"` (motion fills both in),
draws one scene, and needs only `STYLE` and `SCENE` changed. Pick the
style from the subject and the audience, not at random: a whiteboard or
napkin sketch for a process, a blueprint or patent drawing for how a thing
is built, an editorial chart for numbers, a CRT terminal for code. Render
it with `size` and `duration` and `inserts` it into the edit.

## The kit

`const k = kit(ctx, t, m, THEMES.night)` at the top of `draw`, then call
what you need, back to front. Sizes are in units of 1/1080 of the short
side, so the same script works at 1080x1920 and 1920x1080. Every piece
takes `at` and usually `out` (seconds) and animates itself in and out.

| Layer | Calls |
|---|---|
| Atmosphere | `backdrop({ grid })` drifting gradient lights · `bokeh()` · `leak(at)` light leak · `flash(at)` · `scrim({ y })` dark band behind text · `vignette()` · `grain()` |
| Footage | `camera({ area, focus, cuts, framings, punches, shakes, moves, presets })` returns `{ zoom, project(x, y) }` · `pip({ src, x, y, w, h })` webcam bubble |
| Scene camera | `view({ moves, shakes, focus, aperture })` returns `cam`; draw each layer with `cam.layer(depth, () => …)` · `cam.project(x, y, depth)` |
| Light | `drop(distance)` a shadow away from the theme's `light` · `rim(x, y, w, h)` lit edge · `sweep(at)` a band of light crossing the frame |
| Editor reel | `tornFrame({ x, y, w, h, at })` paper with a torn window · `tape(x, y)` · `sticker({ text \| path, x, y, at })` · `scribble({ points, at, loop })` marker line or circle · `kinetic({ text, mode: "scatter" \| "type" \| "glitch", at })` · `glitch(at)` and `zoomBlur(at)` over everything drawn so far, for a cut · `paper()` the texture |
| Type | `title({ lines, style: "rise" \| "slam" \| "blur", glow, gradient })` · `kicker()` · `counter()` · `typewriter()` · `captions({ y, size })` · `quote()` |
| Marks | `ring()` · `arrow()` · `highlight()` · `stroke(path, length, p)` · `reticle()` · `spotlight()` |
| Cards and structure | `glass({ inner })` · `lowerThird()` · `chapter()` · `checklist()` · `progress()` · `photo()` · `bars()` · `wipe(at)` |
| Helpers | `words(cues)` · `cutPoints(cues, every)` · `presence(t, at, out)` · `expo` · `hash(n)` · `sfx(name)` |

**The camera** (`view`, and `camera`'s `presets` over footage) moves on
named presets, each `{ preset, at, dur, strength }`: `push-in` (a slow
dolly in), `dolly` (a sideways track), `crash-zoom` (fast, lands with a
bounce), `whip-pan`, `orbit`, `handheld` (drift for as long as `dur`, all
of it if not given) and `dolly-zoom` (the subject holds its size while the
background stretches away). Pick one or two a scene; don't write moves by
hand. Layers have a depth: 0 is the subject, 1 is far behind and moves half
as much, -0.3 is in front. That difference is the parallax. Draw the
backdrop at 1 or more, the subject at 0, a title or particles in front.
`aperture: 4` to 8 softens layers away from `focus`. `shakes: [{ at,
amount }]` are noise that dies away, for a hit. All of it is a function of
`t`, so frames repeat exactly.

```js
const cam = k.view({ moves: [{ preset: "push-in", at: 0, dur: 3 }, { preset: "handheld", at: 0, strength: 0.5 }], shakes: [{ at: 2.0 }], aperture: 6 });
cam.layer(1.5, () => k.backdrop({ grid: true }));
cam.layer(0, () => drawDiagram(k));
cam.layer(-0.25, () => k.title({ lines, at: 0.1 }));
```

**Motion blur**: `page(draw, { blur: true })` draws each frame four times
over half a frame and averages them, so moves, shakes and whip pans smear
as a camera's would. It costs about 4x the drawing: a 4 s explainer at 720p
went from 6 s to 30 s, a 6 s 9:16 short from 6 s to 30 s. Turn it on for
the final render, off while iterating.

A title's `lines` are runs, so one line can mix faces:
`[[{ text: "Read the " }, { text: "docs", italic: true, family: T.serif, color: T.accent }]]`.

**Themes**: `night` (a launch film: near black, violet and blue light),
`punch` (shorts: black and yellow), `studio` (Apple-style soft grey),
`neon` (Kurzgesagt purples), `paper` (warm map paper, red ink). Each has a
display face (SF Pro, as `system-ui`), an italic serif (Charter) and a mono
(Menlo). Chrome quietly uses the next family for a font that isn't
installed, so check a still and give a fallback (`"Didot, serif"`).
Charter, Iowan Old Style, Didot, Georgia, Avenir Next and Helvetica Neue
are on every Mac.

**Sounds**: `sfx("whoosh" | "pop" | "tick" | "impact" | "riser" |
"shimmer" | "click")`, made for the kit, free to use. Return them from the
page's `audio` function, `{ path, at, volume }`, on the beats the motion
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

- One page: a `<script type="module">` that imports kit.js by absolute path
  and ends with `page(draw, { audio })`. `page()` makes the canvas, draws the
  video's frame under each frame and calls `draw`. The page is loaded fresh
  for each `motion` call.
- Call `picture(path)` for every image at the top of the script, so the page
  waits for it to load; `photo({ path })` and the grain use it too.
- Everything is a function of `t`: no state between frames, no `Date`, no
  `Math.random()` (`hash(n)` is a fixed random). Work things out once from
  `m.cues` and cache them at module level, as the templates do with
  `plan`.
- Wrap each element in `k.layer(() => …)` so transforms and shadows don't
  leak. `k.ctx` and `k.m` are there for pieces you draw yourself, so a
  helper function only needs `k`; a `glass` card's `inner` draws in the
  card's own coordinates.
- `ctx.filter = "blur(…)"` blurs the whole frame and is slow (with motion
  blur, about 10x the whole render); for soft text the kit draws a shadow
  instead, and `view`'s `aperture` shrinks and enlarges the layer.
- No Tailwind or any other CSS framework in a motion page: canvas and
  hand-written CSS only. A framework from a CDN can't load anyway, since
  motion's Chrome has no network.
- The video is drawn under each frame. To zoom or pan, `camera` redraws it;
  for anything custom, `ctx.drawImage(m.video, sx, sy, sw, sh, dx, dy, dw, dh)`.

## 3D with three.js

For real depth (a camera flying through a scene, footage on a plane that
tilts in space, lit and shadowed objects, extruded shapes), a page can
import three.js `from "THREE"`. `motion` fills it in with the copy shipped
in `vendor/` (0.187.0), since pages have no network, and draws the page on
the Mac's GPU. Start from [templates/three.html](./templates/three.html).

- **Draw in `mockingbird.draw(t)` and work everything out from `t`.** Don't
  use three's `Clock`, `requestAnimationFrame` loops or `setTimeout`.
  Create the renderer with `preserveDrawingBuffer: true`.
- **Footage as a texture:** set `mockingbird.drawVideo = true`, then each
  frame put `m.video` on a `THREE.Texture` with `needsUpdate = true`. An
  ImageBitmap ignores `flipY`, so flip it with `repeat.set(1, -1)` and
  `offset.set(0, 1)`.
- **Light it like a film, as the template does.** `from "THREE_ADDONS"`
  gives `RoomEnvironment` (soft light from every side), `EffectComposer`,
  `RenderPass`, `UnrealBloomPass`, `BokehPass` (depth of field) and
  `OutputPass`. Use AgX tone mapping, one key light, and bloom on HDR values
  before `OutputPass` tone-maps them. Only something brighter than white
  should glow; footage on a screen goes on as an emissive map just under
  white. Other add-ons (text geometry, loaders) aren't shipped: build shapes
  from core geometry, or draw text on a canvas and use it as a texture.
- **Move the camera with the kit's presets**: `import { cameraAt } from
  "KIT"` and turn `cameraAt(t, { moves, shakes })` into a position, a field
  of view and a roll, as the template's `place(t)` does.
- **Speed:** on an M3, 10 s of a lit, shadowed 1080p scene with footage took
  33.4 s. The template's environment, bloom and depth of field took 4 s of
  720p from 5.9 s to 10.0 s. 3D costs about five times what a 2D page does, so use it for the
  moments that need depth.

## When it fails

`motion` reports `the page failed by 2.40 s (frame 72): …` and saves
nothing. Read the time, fix the page, and render that stretch again with
`duration` before doing the whole video. A script, image or stylesheet that
doesn't load fails the page as it loads. Without Chrome, finish with
`render`'s still `captions` and `texts`, and say so.
