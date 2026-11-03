# Style study: what professional edits do

Twenty videos, studied frame by frame on 2 November 2026, to set the
defaults for the motion-graphics kit
([skills/motion-graphics/kit.ts](../skills/motion-graphics/kit.ts)). I
wanted to know what separates these from a plain talking head with
captions, and how much of that a script can do by default.

Nothing from the videos is in this repository: no frames, no clips, only
the notes and numbers below.

## How

1. Downloaded each video's picture with `yt-dlp` (720p for 16:9, full
   height for 9:16; the first three or four minutes of long ones).
2. Counted hard cuts with ffmpeg's scene detector at 320 px wide:
   `scdet=threshold=10`. Average shot length (ASL) is the duration over
   cuts + 1. A pan, morph or animated camera move doesn't register, so
   "0 cuts" means a continuous camera, not a still one.
3. Watched each as a contact sheet (one frame a second for shorts, sixty
   evenly spaced for long-form), then took 8 to 12 fps strips of the
   moments that mattered (title reveals, a HUD lighting up, an end card)
   to time them frame by frame.

To repeat these numbers, run the same `scdet` filter. The `style-match`
skill's `scripts/measure.sh` uses ffmpeg's scene score instead
(`select='gt(scene,0.3)'`), which counts fewer cuts, so compare a reference
with itself through one method or the other, not across them.

## The numbers

| Video | Kind | Length (s) | Cuts | ASL (s) |
|---|---|---:|---:|---:|
| Varun Mayya, touchscreen MacBook | short, tech news | 47.0 | 37 | 1.24 |
| MrBeast, robot does my chores | short, challenge | 32.0 | 25 | 1.23 |
| Fireship, Linux tips | short, explainer | 45.8 | 26 | 1.69 |
| Fireship, Big O with cards | short, explainer | 59.0 | 29 | 1.97 |
| MrBeast, subscribers | short | 29.9 | 5 | 4.99 |
| Alex Hormozi, hire to replace you | short, talking head | 50.8 | 6 | 7.25 |
| Varun Mayya, GitHub repos | short, screen + face | 89.0 | 8 | 9.89 |
| Alex Hormozi, 10 rules | short, one take + whiteboard | 31.8 | 0 | 31.8 |
| Ali Abdaal, $2,000 question | short, one take | 57.0 | 1 | 28.5 |
| Ali Abdaal, holy trinity | short, one take | 12.8 | 1 | 6.4 |
| Johnny Harris, Djibouti mapped | long-form, maps | 180 | 67 | 2.65 |
| Apple, Mac mini | product film | 42.9 | 12 | 3.30 |
| Remotion, GitHub Unwrapped process | documentary | 180 | 38 | 4.62 |
| Kurzgesagt, the virus | animation | 150 | 24 | 6.00 |
| MKBHD, MacBook impressions | review | 180 | 25 | 6.92 |
| Ali Abdaal, 5 tips | long-form, talking head | 240 | 30 | 7.74 |
| Fireship, Docker in 100 s | explainer | 126.5 | 12 | 9.73 |
| Vox, the recession chart | data explainer, continuous camera | 232 | 1 | 116 |
| Linear, Introducing Linear Agent | launch film, continuous camera | 54.9 | 0 | 54.9 |
| Linear, Introducing Releases | launch film, continuous camera | 30.0 | 0 | 30.0 |

Two paces, then. Fast shorts change the picture every 1.2 to 2 seconds.
Talking-head channels hold 5 to 10 seconds a shot, and long-form explainers
sit at 2.5 to 7. The single-take shorts (Hormozi's whiteboard, Ali's) aren't
slow. Something on screen draws or moves the whole time.

## What each one does

**Varun Mayya** (1.24 s ASL). The face is on screen for maybe 15% of the
short; the rest is b-roll that matches each sentence. The title pairs a
heavy extended grotesk with a small italic serif ("*Apple's* Touch Screen
MacBook Pro"), builds line by line about 0.2 s apart, and stays up over the
first several cuts. Captions are small (two or three words, yellow on a
black chip) because the picture carries it. Screenshots get a highlight box
on the number that matters; quotes go on a card in italic serif.
Hand-drawn arrows point at things.

**MrBeast** (1.23 s). No captions at all. The device is a quest tracker:
four icons in a row at the bottom, each popping in about 0.2 s apart with
an overshoot and a white glow, then turning green as the chore gets done.
It stays on screen the whole short and is the reason to keep watching.

**Fireship** (1.7 to 2 s). Meme cutaways every second or two. One chart
keeps coming back, with an arrow moved to the new point each time: a
callback that ties the jokes to the lesson. Labels in a monospace face,
colour-coded by idea (green constant, yellow linear, pink quadratic).
Section titles sit on an animated background of falling digits.

**Alex Hormozi, 10 rules** (one take). Split screen: a whiteboard drawing
builds stroke by stroke on top, the face below. A persistent header ("10
RULES TO WIN IN BUSINESS") and a numbered sub-title that ticks over. The
captions sit on the seam as word chips: each word on its own dark box.

**Ali Abdaal** (7.7 s long-form). Alternates a wide shot and a tighter
punch-in on the same take, so jump cuts read as a second camera. B-roll
cutaways of what he's describing (a keyboard, a desk). Text is rare and
quiet.

**Johnny Harris** (2.65 s). Textured paper maps, lit with a vignette and a
soft spotlight on the point being discussed. Borders and routes draw
themselves on; flags pop in as round badges; handwritten italic labels.
The camera pushes and rotates through the map rather than cutting. News
clips come in with their own chyrons.

**Kurzgesagt**. Saturated gradient lighting, out-of-focus foreground
layers for depth, particles everywhere. Labels are small capsule tags
("40 Trillion Bacteria"). A HUD reticle locks onto a subject. Big titles
fly through the camera with motion blur. Numbers count up.

**Vox**. One continuous world the camera pans along: a timeline that
scrolls from 1979 to 2019, then a scene built beside it, so it almost
never cuts. Dashed lines draw on, a dashed circle marks the point, one red
accent and yellow annotations on a dark grey ground.

**Linear**. The interface tilted in perspective, drifting slowly, with
depth of field: sharp in the middle, blurred at the edges. Text types
itself into the input. On the end card the wordmark comes into focus from a
blur over about 0.75 s with a faint violet glow, then the tagline wipes on
left to right behind a soft edge in about 1 s, holds, and gives way to the
logo.

**Apple**. Soft grey studio gradient, one object, a lot of air. The end
card balances light type on either side of the product.

**MKBHD** and **Remotion's documentary**. Restraint. A lower third (a dark
translucent plate, the name bold, the role small and coloured), side-by-side
picture-in-picture for archive footage, shallow-focus b-roll. Graphics are
few and quiet; the camera work carries it.

## What they share

1. **Nothing is flat.** Depth from parallax, blur and vignettes; light from
   gradients, glows and bloom; texture from grain or paper. A plain colour
   behind text is the exception.
2. **The camera never stops.** A slow drift while a graphic holds, a push
   into what's being discussed, a pan along the world. Stillness is a
   choice, not the default.
3. **Reveals are staggered and soft.** Words arrive 50 to 200 ms apart.
   Titles come into focus or slam down from oversize. Lines draw
   themselves on. Numbers count up. Very little just appears.
4. **Structure that stays on screen.** A checklist, a numbered header, a
   progress bar, a chart that keeps coming back. It tells the viewer
   where they are and what's left.
5. **Typography mixes faces deliberately.** A heavy grotesk with an italic
   serif for the turn of phrase, two weights in one line, monospace for
   labels and numbers.
6. **Every beat has a sound.** Pops on pop-ins, whooshes on moves, ticks on
   counters, a hit under the hook.
7. **Hard cuts do the cutting.** Flashy transitions are rare. Pace comes
   from cuts plus movement inside the shot.

## What the kit does with it

| Finding | In the kit |
|---|---|
| Depth, light, texture | `backdrop` (drifting gradient lights, optional grid), `bokeh`, `vignette`, `grain`, `leak`, `glass` |
| The camera never stops | `camera`: a new framing at each cut, a slow drift, spring punch-ins, shakes, a zoom blur on each cut, and `moves` that glide to a point and back; `pip` keeps the webcam in frame |
| Shorts change picture every 1.2 to 2.5 s | `cutPoints(cues, every)` puts a new framing on a word start every couple of seconds |
| Staggered, soft reveals | `title` (rise, slam or blur, about 60 ms a word), `kicker` (types on), `counter`, `typewriter`, `stroke`, `ring`, `arrow`, `highlight` |
| Structure on screen | `checklist`, `progress`, `chapter`, `lowerThird` |
| Mixed type | lines are runs: `{ text, weight, italic, family, color }`; themes carry a display face, an italic serif (Charter) and a mono (Menlo) |
| Captions as part of the design | `captions`: groups pop in, a pill in the accent colour slides from word to word under the voice |
| A sound on every beat | seven sounds made for the kit (`sfx("pop")` and so on); the templates' `audio` exports put five of them on their beats, and `tick` and `riser` are there for counters and reveals |
| Five looks | `THEMES`: `night` (launch film), `punch` (shorts), `studio` (product), `neon` (Kurzgesagt), `paper` (maps) |

## What it doesn't do yet

- **B-roll video inside a graphic.** `m.image` takes stills. Cutting to
  b-roll video happens in `render`'s `inserts`; a video playing inside a
  card would need the motion engine to read a second video.
- **True perspective.** The canvas is 2D, so Linear's tilted interface is
  approximated with a skew (`photo` does this as a card turns in).
- **Depth of field.** There's no per-pixel blur by depth; `bokeh` and a
  blurred backdrop stand in.
