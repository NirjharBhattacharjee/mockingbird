---
name: cocktail
description: Mix every edit style mockingbird knows into one video. For each moment in the transcript (the hook, a "most people" line, a list, a step, a number, the one word a line hangs on, a punch line, a screen, the call to action) pick the scene that suits it best from talking-tutorial, faceless-tutorial and motion-graphics, recolour them all to one look, and run them as passes over the cut. Use when the user wants the video "more interesting", wants several styles combined, or names no style and the video is a tutorial, explainer or talking head over 3 minutes.
---

# Cocktail

Each style playbook comes from one study and has its own templates. This
one decides, moment by moment, which of them to use, so a video gets the
best scene for each line rather than one style's scene for every line. It
adds no new scenes; it combines the ones already here:

| Template | Scenes | From |
|---|---|---|
| [tutorial.html](../talking-tutorial/tutorial.html) | two framings cut hard, keywords beside the face, card scenes, the face shrinking to a circle, the subscribe pill | **talking-tutorial** |
| [depth.html](../talking-tutorial/depth.html) | `wall` (the video as hundreds of tiles on a sphere), `cards` (cards flip up, one comes forward), `stage` (the video on a card that lays back, a number stands up) | **talking-tutorial** |
| [neon.html](../faceless-tutorial/neon.html) | `fly`, `chain`, `path`, `word`, `type`, `tint` | **faceless-tutorial** |
| [motion-graphics templates](../motion-graphics/templates/) | explainer cards, a custom three.js scene (`three.html`), the 86 styles | **motion-graphics** |

Run **long-form** for the cut, **look** for the vibe, and **color-grade**
before any of this, as always.

## 1. One world

The user's preference, and a rule here: one consistent world a video, never
cream cards in one scene and a neon grid in the next. Settle it with **look**
(offer three vibes), then set every template's settings block to it:

| | tutorial.html | depth.html | neon.html |
|---|---|---|---|
| Background | `THEME.bg` | `BG` (two colours) | `BG`, `GRID` |
| Text on the background | `THEME.ink` | `TEXT` | `INK` |
| Text on cards | `THEME.ink` | `INK` | (labels are white) |
| Accents | `THEME.accent`, `THEME.accent2` | `ACCENT`, `ACCENT2` | `NEON` |

Neon (glow and bloom) only reads on a dark world; on a light one, skip
`word`, `type` and `path`, or give them dark ink and no glow. Cream cards
read on either.

## 2. Map the moments

`transcribe` with `words: true`, read it once through, and mark each moment
below with its start word. Then pick a scene for each one from this table.
The first choice is the best match; use the second when the first was used
in the last 30 s.

| Moment in the words | First choice | Second choice | Why |
|---|---|---|---|
| The hook's proof (a number, a result) | `stage` with `count` | `fly` with a `push` into the number | the proof shows inside 0.5 s, framed as real |
| "Most people…", "everyone does…" | `wall` | `fly` | the crowd in one picture |
| A list said in one breath (3–7 things) | `path` | `chain` | each item lands on its own word |
| Things named that each have a picture | `chain` | `cards` | the camera tracks from one to the next |
| "The questions I get", a set of quotes | `cards` with `focus` | `chain` | one comes forward as it's read |
| A step's title | card scene (tutorial.html) | `word` | a pause in the energy before the step |
| The one word a sentence hangs on | `word` | keyword (tutorial.html) | 1–2 a minute at most |
| A phrase to keep on screen while they talk | keyword | `type` | the face stays |
| The punch line, a warning | `tint` | a hard cut to the tight framing | a jolt of colour |
| A tool or screen being shown | the face shrinking to a circle over it | `fly`, run over the screen recording | the screen fills the frame |
| A number in passing | a counter in a card scene | `stage` | |
| The call to action | the subscribe pill | | the last 30–90 s |

## 3. Budget the pace

- **First minute:** a scene or a framing change every 3–5 s. Open on the
  proof, with the first face shot by about 10 s.
- **Body:** one scene every 15–30 s, with a hard framing cut every 4–8 s
  between them, and a keyword every 20 s or so on face shots.
- **At most one real 3D scene a minute after the first minute** (`wall`,
  `cards`, `stage`, `fly`, `chain`, `path`, `word`). Each costs about three
  times a plain frame, and repeating them dulls them.
- **Never** the same scene twice in a row, and never two scenes within 2 s
  of each other.
- **Scene length:** each one runs 2–6 s and ends on a sentence end. `fly`
  and `word` end on a rush-through, so cut straight to the face after them.

## 4. Plan one timeline, then split it

Write every scene into one list first, in order with its `at` and `out`, and
check the budget against it. Then split it by template: tutorial.html's
`SCENES`, `KEYWORDS`, `SHRINKS`; depth.html's `SCENES`; neon.html's `SCENES`.
No two templates may have a scene at the same moment.

## 5. Run the passes

Each pass draws over the last one's output and leaves the picture alone
outside its own scenes:

1. `render` the cut, graded, and write the captions file (`.srt`). Don't
   burn captions into the picture: tutorial.html's tight framing would crop
   them, and the scenes cover them. The keywords stand in for captions.
2. `motion` with tutorial.html (`path`: the render, `captions`: the `.srt`,
   so the framing cuts land on sentence ends). It draws the framings, so it
   goes first.
3. `motion` with depth.html (`path`: pass 2's output).
4. `motion` with neon.html (`path`: pass 3's output).

Use the same `fps` for every pass. Try the first 60 s through all passes
before the whole video.

## 6. Source problems

Burned-in text, a logo or a watermark in the source is never covered by a
box. Cut it, crop past it with a framing, or put a full-frame scene (`word`,
`path`, `wall`, a card scene) over its whole stretch.

## The bar

- Every scene is on a word that means it: a list item on its word, within
  0.1 s.
- One world: the same background, ink and accents in every scene.
- The pace budget holds: run `scenes` on the final video and check the first
  minute against step 3.
- No glow blows out text; nothing appears without a sound under it.
- −14 LUFS after the last pass (`measure`), then the **reviewer** agent.
