---
name: faceless-tutorial
description: Edit a tutorial or explainer (5 to 12 minutes, a narrator walking through tools, screens and results, with or without a face cam) in the style of popular "how I made this with AI" channels. A dark grid world with real neon glow, screens that fly in as 3D cards, items as a neon staircase or a row of cards the camera tracks along, big letters flying in from behind the camera, duotone flashes on key lines, a picture change every 1 to 3 s in the hook. Use with long-form, or with talking-tutorial for a talking head that needs more energy.
---

# Faceless tutorial

This playbook comes from a frame-by-frame study (#298) of the ten most-viewed
videos, 5 to 12 minutes each, from one faceless AI-tutorial channel. Only the
mechanics below came out of that study. None of the channel's footage, music,
graphics or branding is used.

Run **long-form** for the cut itself, and **look** first as always: offer
this as one of the three vibes, show the board, and wait for a yes. It also
fits over a talking head cut with **talking-tutorial** when the speaker never
shows a screen: the scenes give the picture something to change to.

## The numbers

| | What the study measured |
|---|---|
| Pace | 7–19 cuts a minute by scene detection, median 13; a shot lasts 1.1–5 s (median). The first minute is the busiest: 16–21 picture changes in 8 of the 10 |
| Picture | dark: near-black (#0B0C10) with a faint grid and a heavy vignette behind every graphic. Colour comes only from neon: red to yellow, green, cyan, violet |
| Screens | never flat. A screen recording sits on a rounded card with a thin glowing white rim, tilted 10–25° in yaw, on the dark grid, drifting slowly. It arrives by flying in from deep behind (small and turned 40–50° to settled in about 0.7 s, ease out), then the camera pushes into the detail being talked about with the rest out of focus |
| Lists | items come one per spoken word, never all at once: a neon line that draws node to node with a numbered star popping at each, or cards in a row with an italic serif label and a pill, joined by a thin line, the camera tracking from one to the next |
| Big words | 1–2 words a minute fill the frame: italic heavy sans letters in a colour gradient, flying in from behind the camera one after another (about 35 ms apart, 0.45 s each, with motion trails), then the camera rushes through them into the next shot |
| Typed words | a word typed on in rainbow neon over the screen dimmed to about 40%, flickering for the first few frames like a sign catching |
| Flashes | on a key line the face or screen goes one colour for 1–1.5 s (red, green, yellow, cyan; a duotone, highlights tinted, shadows near black) with a punch-in of about 6% and a bold glowing caption at the lower third |
| Transitions | a zoom through the subject (camera rushes into the card or the letters, 0.2–0.25 s, ease in), a 2–4 frame colour flash, or a whip with motion blur. A plain cut only between two face shots |
| Face | when there's a face cam, a square picture-in-picture at the bottom right over screens, and full frame between graphics |
| Hook | opens on proof (a views or earnings number) shown extremely close, then pulls out fast to the tilted screen it's on. Something changes on screen every 1–3 s for the first minute |
| Sound | a whoosh on every camera move and transition, a pop on every item, a riser into a big word with an impact as it lands |

## Scenes

[neon.html](./neon.html) draws all six in three.js over a cut, with a real
camera, bloom on everything that glows, and depth of field. Run the
**motion-graphics** 3D notes first.

| Scene | Use it for | What it does |
|---|---|---|
| `fly` | "most people", a screen, a result | the video on a glowing card flies in from 14 units back, turning from 50° to 12°, drifts, pushes into `push` (a spot as 0–1 of the frame), then the camera rushes through it |
| `chain` | 3–6 things named in a row | a card per item, each a crop of the video with an italic label, popping up as it's said; the camera glides to each one, the line to it drawing on |
| `path` | steps, a process, a list of 3–7 | a neon staircase drawing itself to each node as the item is said, a numbered star springing up there, the camera drifting so it turns in depth |
| `word` | the one word the line hangs on | letters fly in from behind the camera in a gradient with trails, then the camera rushes through them |
| `type` | a phrase while the face or screen stays on | rainbow neon letters typed over the video, dimmed |
| `tint` | the punch line | the video as a duotone with a bold glowing caption, punched in |

## Steps

1. **Cut.** Follow **long-form** steps 1–5. Keep shots under 3 s through the
   first minute.
2. **Find the words.** `transcribe` with `words: true`. Mark every list
   (each item's start is its `at`), the strongest single word in each 20–40
   s, and the punch lines.
3. **Place the scenes.** One scene every 5–10 s in the first minute, then
   one every 15–30 s. Never two of the same type in a row. Each scene ends
   on a sentence end; `fly` and `word` end with their rush-through, so cut
   straight to the face after them.
4. **Draw it.** Copy [neon.html](./neon.html) next to the cut, fill in
   `SCENES`, and run `motion` with `script`, `path` (the cut) and `fps`
   matching it. A scene costs about three times a plain frame; try the first
   20 s first.
5. **Review.** `frames` at the middle of every scene, `measure` the loudness,
   then the **reviewer** agent.

## The bar

- Every list item appears on its own word, within 0.1 s.
- No text blown out by the glow: if a label reads as a white smear, keep its
  colour under 0.8 so the bloom skips it.
- No scene longer than 6 s, and the face back between scenes.
- Nothing appears without a sound under it.
