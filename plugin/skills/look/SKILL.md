---
name: look
description: Design a video's look before editing it, new for every video. Read the transcript, settle the mood with the user, write a style of your own for this video (palette, surface, type, how every graphic arrives), show it as a look board with mockingbird's `look` tool, and start the edit only once the user approves. Use at the start of any edit that will have graphics, titles or explainers, or when the user asks for a look, a style, a mood or a "vibe".
---

# Look

Every video gets a look of its own. Don't reach for a finished style and
call it done. Read what the video says, find the mood with the user, and
**invent** a look for it: its world, its colours, its type, its texture and,
most of all, how things move. The 86 styles in
`../motion-graphics/styles/` are references for feel and technique, the way
a designer keeps a moodboard. They aren't a menu. Two videos, or two runs on
the same video, should never come out looking the same unless the user asks
for that.

Editing waits for the look. Cuts, captions, b-roll and music all come after
the user says yes, and every graphic in the edit is drawn with the approved
look.

## 1. Read the video

`transcribe` the footage (or read `brief`'s notes, if it ran). Write down for
yourself:

- **What it's about**, in one line, and the two or three ideas a graphic
  will have to carry.
- **Its feeling.** Is it calm, urgent, playful, tender, defiant, nerdy,
  luxurious? Listen to the words and the pace, not only the topic. A talk
  about money can be anxious or triumphant.
- **Its world: ten concrete things.** List ten nouns you could draw, taken
  from the transcript and the frames: places, objects, animals, gestures,
  phrases ("a turkey", "a spider web", "the Stringybark Reserve sign",
  "smells like..."). A cooking video has steam, cutting boards and recipe
  cards; a video about the ocean has depth and light falling through water.
  Every look builds on at least two of them. They're what keeps a look from
  being a template.
- **Its key number or claim**, for the board's stat.

## 2. Settle the mood with the user

Unless the user already said, offer **three moods** the transcript supports,
each in one line that someone can picture, and say which one you'd choose:

> 1. **Late-night radio:** warm amber on near-black, soft grain, words that
>    glow up like a dial (I'd go with this one: it matches how quietly he talks)
> 2. **Field notebook:** pencil on cream paper, things sketched in, then inked
> 3. **Bold poster:** two flat colours, huge type that slams in on the beat

Go with what they pick. "Surprise me" means your choice, the boldest of the
three.

## 3. Invent three looks

Make **three looks that are deliberately different from each other**, all
for the vibe the user picked:

- **A: safe.** The vibe done well, the way a good designer would expect.
- **B: bold.** The same vibe pushed hard: bigger, louder, stranger motion.
- **C: strange.** A direction nobody would expect, that still fits the video.

Three forces you off your first idea: by the second look the obvious one is
taken. If B or C ends up close to A, start it again. The user picks one in
step 4, and only that one is refined.

Write each as a module next to the project (`look-a.ts`, `look-b.ts`,
`look-c.ts`). Its default export is
`{ id, name, category, make(ctx, t, m) }`, and `make` returns the pieces
every style draws, so any page or storyboard can use it:

| Piece | What it is in *this* look |
|---|---|
| `surface()` | the world everything sits on |
| `title(text, o)` | the heading |
| `label(text, x, y, o)` | a short label |
| `node(x, y, r, o)` | a thing or a point |
| `box(x, y, w, h, o)` | a container |
| `link(x1, y1, x2, y2, o)` | a connection, with or without a head |
| `store(x, y, w, h, o)` | where things are kept |
| `stat(text, x, y, o)` | a big number, counting with `count` |
| `mark("check" \| "cross", x, y, o)` | yes or no |
| `finish()` | drawn last: texture, light, grain |

The exact options for each are in `../motion-graphics/styles/look.ts`.
Every piece takes `at` (when it arrives, in seconds), `dur` and `tone`
(`ink`, `accent`, `good`, `bad`, `muted`), and draws nothing before `at`.

**Add whatever else the look needs.** The ten pieces are the minimum, not
the limit. Give it a `lowerThird(name, role)`, a `caption(words, lit)`, a
`transition(p)`, a motif that drifts behind everything, a particle system,
weather, a mascot, a camera that breathes. The pages you write for the edit
can call any method your look has.

Import whatever helps from `"STYLES"`: the helpers (`frame`, `progress`,
`spring`, `expo`, `curve`, `ellipse`, `trace`, `arrowhead`, `roughen`,
`counting`, `grain`, `vignette`, `hash`, `alpha`) and every style in
`STYLES`. You can draw one piece by borrowing another style's
(`STYLES["comic"].make(ctx, t, m).mark(...)`) and change the rest. `"KIT"`
gives the motion kit.

### Draw your constraint cards

Before writing each look, draw two cards from this deck and follow both.
They're meant to make you uncomfortable. Draw them this way, not by "picking
at random", which models do badly: let **W** be the number of words in the
transcript and **k** be 0, 1 or 2 for looks A, B and C. Your first card is
**(W + 9k) mod 24**, and your second is **(W + 9k + 13) mod 24**. If the
user sent a look back and you're making new ones, add the number of boards
already in the project folder to W.

| # | Card | # | Card |
|---|---|---|---|
| 0 | Only two colours, plus the footage | 12 | Everything is made of one material (paper, glass, thread, smoke) |
| 1 | Nothing is a rectangle | 13 | Type is the main image: huge, cropped, moving |
| 2 | The camera never stops moving | 14 | One of the ten things becomes the typeface or the shapes |
| 3 | Everything moves like liquid | 15 | Things arrive by being built, piece by piece |
| 4 | Every arrival lands on a hard snap with a jolt | 16 | Things arrive by being torn, cut or burnt open |
| 5 | Slow: nothing moves faster than a breath | 17 | Light is the medium: glows, beams, projections, shadows |
| 6 | Combine two style families that don't belong together | 18 | The footage is masked: seen through shapes, letters or holes |
| 7 | A texture covers everything (grain, paper, scanlines, halftone) | 19 | The footage is repeated: windows, grids or echoes of the same shot |
| 8 | Hand-made: every line wobbles, nothing is perfect | 20 | One loud colour on black and white |
| 9 | A character or mascot from the video reacts to what's said | 21 | Flat, no shadows, no gradients, no glow |
| 10 | Everything is a diagram: arrows, labels, measurements | 22 | Deep space: layers at different depths with parallax |
| 11 | Time made visible: trails, echoes, motion blur, ghosts | 23 | Break the grid: things overlap, bleed off the frame, sit at angles |

Say in one line, in your notes, how each look uses its two cards.

### Never

These are what every model reaches for first. None of them goes in a look
unless the user asks for it by name:

- glassmorphism cards, frosted panels
- purple-to-blue or navy-to-violet gradients as the background
- a centred title that fades in; anything that only fades in
- rounded boxes with soft drop shadows as the main shape
- neon on black, and "tech" grids or circuit lines, used as decoration
- floating particles or bokeh that mean nothing
- the footage sitting still in a box while graphics happen around it
- a generic diagram (nodes and links) standing in for the video's real subject

### Be as creative as you can

- **Start from the mood and the video's world, not from a style.** Then
  look through two or three references for techniques you can use. Read
  their code for *how* (how chalk dust is drawn, how a brush stroke tapers,
  how a stamp lands) and make something they don't do.
- **Make at least four decisions that none of the references made.** For
  example: a palette taken from something in the video, a surface no style
  has (wet asphalt, a lit aquarium, a receipt roll, a church window at
  dusk), a typeface stack chosen for the mood, entrances that tell the
  story (ideas grow like plants, numbers are poured, labels are typed by an
  unseen hand), and a texture over everything.
- **Motion is where a look lives.** Decide how each piece *arrives*, *sits*
  (does it breathe, bob or flicker?) and *leaves*. Use the video's tempo:
  slow, smooth easing for a reflective talk, and hard snaps with overshoot
  for a hype edit.
- **Let the topic leak in.** A video about coffee can have steam rising off
  its nodes. A video about space travel can have links that are orbits. A
  video about a breakup can have boxes whose ink runs.
- **Graphics live on the moving footage.** Run the footage full frame with a
  camera that moves (pushes, snap zooms, jolts on the beats) and put the
  graphics on top of it: masks it shows through, shapes that cut into it,
  elements tied to things in the shot so they move with them. Never park the
  footage still in a box.
- **Draw the real subject.** If the video has a turkey, draw a turkey, not a
  diagram of one. If it has a spider web, spin a web over the real one.
- **Surprise, then check.** Go further than feels safe in the first draft.
  Tone it down only if the board shows it hurts reading.

Each run, change the seed you hash with and choose again. If the project
already has a look the user didn't ask to keep, don't make the new one look
like it.

### What must hold

- **Text reads.** Labels at least 28 units, strong contrast against the
  surface (about 4.5:1), nothing important under a bright spot. Reading
  beats atmosphere.
- **It's fast and deterministic.** No `Math.random` (use `hash`), no network,
  no files to load, a frame in a few milliseconds. Cache expensive textures
  in an `OffscreenCanvas` on `globalThis`, keyed by size.
- **It works anywhere it's put.** Positions are 0 to 1 of the frame and sizes
  are units, so it draws right in 1920x1080 and 1080x1920.
- **Names are generic.** Draw no real logo, brand or product. Don't copy a
  reference's prose into comments.

## 4. Show it: three boards

Make a board for each of the three looks and show the user all three side by
side, saying in one line what each one is going for and which cards it drew.
Ask which one to take forward, or what to mix ("A's colours with C's
motion"). **Draw each board from the video itself**, not from a generic diagram. Write
a short page that imports your look `from "LOOK"` and shows what this video
is actually about: its subject (the turkey it's about, the product, the
speaker), its key line, over its own footage. Pass the page as `page` and a
few seconds of the footage as `path` (the page gets the frames as `m.video`,
with `mockingbird.drawVideo = true` or the kit's `page()`). A cooking video's
board shows the dish; a talk's board shows the speaker and their big number.

```json
{
  "file": "/path/to/project/look.ts",
  "page": "/path/to/project/board.html",
  "path": "/path/to/project/sample.mp4",
  "duration": 8
}
```

Without a `page`, `look` draws a generic storyboard (nodes, a box, a
number) of a `board` in the video's own words. That only shows the pieces
work; don't show it to the user as the look:

```json
{
  "file": "/path/to/project/look.ts",
  "board": {
    "title": "Why sleep makes you smarter",
    "points": ["Memories", "Deep sleep", "Recall"],
    "stat": { "value": 40, "unit": "%", "label": "better recall" }
  },
  "size": "1080x1920"
}
```

It builds the look (a mistake comes back with its line, so fix it and call
again), draws an 8.5 s storyboard in it and saves the clip and a sheet of
twelve stills. **Look at the stills yourself first.** Check that every
label reads, nothing overlaps, it matches the mood you promised and it's
different from the references you used. Fix what's wrong before showing it.
Then show the user the stills and the clip, say in a sentence what you went
for, and ask: go ahead, or what should change?

## 5. Revise until they say yes

Refine the look they picked (keep its file, or rename it `look.ts`). If the
project already has this look approved, clear that first, before changing
the file: `{ "op": "set", "look": { "file": "…", "mood": "…", "approved": false } }`.
The `look` tool rebuilds the module the edit imports, so an approval left in
place would cover a look the user hasn't seen. Take their words literally ("warmer", "less busy", "the title's too thin") and
change only that. Render the board again. If they don't like any of the three,
draw new cards and make three new looks; if the vibe itself was wrong, go back
to step 2 with three new moods.

When they approve, save it in the project:

```json
{ "op": "set", "look": { "file": "/path/to/project/look.ts", "mood": "late-night radio", "approved": true } }
```

The `edit` outline says `look look.ts (late-night radio), approved`.

## 6. Edit with it

Now follow `viral-short` or `long-form`. Every graphic you make for the edit
(titles, lower thirds, explainer scenes, chapter cards and overlays) is a
`motion` page that imports the built look, as `look`'s reply shows:

```js
import { page } from "KIT";
import look from "file:///path/to/project/look.look.js";

page((ctx, t, m) => {
  const l = look.make(ctx, t, m);
  l.surface();
  l.title("Deep sleep sorts the day", { at: 0.2 });
  l.finish();
});
```

Pick the music generator and caption settings to match the look's mood.

## Skipping the look

Ask every user, every video: the vibe question and the look board are not
optional, even when the brief already sounds detailed. A brief narrows the
vibe; it doesn't replace asking.

If the user says to skip it ("just cut it", "no graphics", "use the comic
style"), do that: use a named style straight from `"STYLES"` or no graphics
at all, and record it with `{ "op": "set", "look": { "skipped": true } }`.
`render` won't render a project with graphics until the look is approved or
skipped. Mention once that a look made for the video is an option, then
don't ask again.
