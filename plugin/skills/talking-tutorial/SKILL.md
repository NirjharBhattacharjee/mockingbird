---
name: talking-tutorial
description: Edit a long talking-head tutorial (8 to 30 minutes, someone on a couch or at a desk teaching a tool or a method) in the style of popular creator tutorials. Two framings cut hard every 4 to 8 s, keywords typed on beside the face, card scenes in a warm cream world, the face shrinking to a circle over screens, a proof-first hook and numbered steps. Use with long-form when the user wants a tutorial that looks edited, not just tightened.
---

# Talking tutorial

This playbook comes from a frame-by-frame study (#296) of ten popular
long-form tutorials, 8 to 28 minutes each, from one creator who teaches AI
tools from a couch. Only the numbers below came out of that study. None of
the creator's footage, music, graphics or branding is used.

Run **long-form** for the cut itself: pauses, retakes, chapters, the
captions file. This playbook sets how the result looks and moves. Run
**look** first as always: offer this look as one of the three vibes, show
the board, and wait for a yes.

## The numbers

| | What the study measured |
|---|---|
| Pace | 8–14 cuts a minute by scene detection, which also counts changes inside screens and cards; a shot lasts 2.5–6 s (median) |
| Runtime mix | face 33–62%, card scenes 30–40%, screen recordings 3–22%, b-roll 5–12% |
| Cameras | two or three: a wide (face 15–22% of frame height) and a tight three-quarter angle (face 45–55%), switched by hard cut every 4–8 s. No animated punch-ins and no zoom ramps |
| Room | warm, low-key light, one orange lamp in frame |
| Keywords | about one every 20 s: a small white sans line over a big italic serif keyword in a warm accent, placed in the empty space opposite the face. Typed on at 1–2 characters a frame, held 1.5–2 s, then cut off. These replace full captions |
| Card scenes | 5–25 s each, about one every 15–20 s. A serif title typed in at top centre, white rounded cards with a soft shadow that pop in from 0.9 scale (about 0.3 s, ease-out), 0.1–0.2 s apart, dotted lines drawing between them, numbers rolling up over about 1 s |
| Screens | the full-frame face shrinks into a rounded rectangle, then a circle at the bottom right, 14–17% of frame width, in 11–14 frames |
| Transitions | hard cut by default; a 2–3 frame white tint into a white card; an 8–10 frame fade into a coloured card |
| Hook | opens on proof (a view count, a follower count, revenue) in a graphic within 0.5 s. The first face cut lands at 8–10 s, the first screen recording at 1:10–2:20 |
| Structure | a 60–140 s intro that promises a number of steps, then numbered chapters, each with a title card and an example or a scoreboard. The call to action comes in the last 30–90 s: a subscribe pill a cursor clicks, then a comment prompt |
| Sound | −14 to −15 LUFS. No music under the teaching |

Every video in the study had its own graphic world (cream cards, white meme
cards, a blue-sky desktop, a hand-made collage, a doodled mascot on paper),
but each one built its cards the same way. Keep the card construction and
invent the world per video with **look**.

## Depth

A second pass through the same videos looked only for 3D. It's rare and it
sits where most people are still watching: 7 of the 10 videos put their one
real 3D move in the first 10 s or at the first card scene, and each one lasts
3–9 s. Through the body, depth comes from cheaper things: cards at a small
fixed tilt, cards that stack, and a sharp panel over the face blurred behind.
[depth.html](./depth.html) builds the first three below in three.js (a real
camera, shadows and depth of field), so run the **motion-graphics** 3D notes
first.

| Scene | What the study measured |
|---|---|
| `wall` | hundreds of 16:9 tiles with a 2–3 px glowing accent rim on the inside of a sphere, so rows bow at the edges. Three framings cut hard (close and rolled about 4°, wider at 20%, the whole bowl at 55%) with a slow push of about 9% a second. Exit over 18 frames: tiles turn to the accent at random, then fall back in depth into the cream world. 4–6 s, the first shot of the video, the "everyone does this" beat |
| `cards` | after 8 empty frames, cards flip up from edge-on (about 80° to flat in 7 frames), a new one every 4 frames, each at its own roll of 2–4°. After a 1.2 s hold one card comes forward to about 2.2x in 10 frames, expo out, while the rest step back, spread out and go out of focus; it holds 1–2.5 s, then the next one comes forward. The end of the hook, "the questions I get" |
| `stage` | the video on a card that swings up off the floor over 1.5 s while the camera pushes in, lays back about 20° over 0.8 s, and a number stands up on its far edge, rolling up over about 1.1 s, ease-out. The opening shot, or a step card |
| Card tilt | every card in a scene held at a 3–5° roll and an 8–15° yaw, never animated. `cards` does it; for a 2D scene in tutorial.html keep the cards flat |
| Blurred face | a prompt box or clip card sharp over the face blurred 12–20 px and darkened 10–20%, 20–40 times a video. Neither template draws it yet. In 2D, draw the face onto a scratch canvas at 1/8 size and back up at full size, then darken it 15% under the panel. A `ctx.filter` blur over the whole frame costs about 10x the render |

Use one or two 3D scenes a video, timed to the words they show: the wall on
a "most people" line, the card focus on each item as it's said. Render
depth.html over tutorial.html's output (or over the cut, if that's all you
need), with the same `fps`. A 3D scene costs about five times a 2D one;
between scenes the page only draws the video.

## Steps

1. **Cut.** Follow **long-form** steps 1–5. Aim for the pace above. Under
   8 cuts a minute reads as unedited in this style.
2. **The second camera.** With two real angles, cut between them every
   4–8 s on a sentence end. With one camera, the template's `FRAMINGS`
   makes a tight crop of the wide. Keep the crop at 1.35 or less on 1080p
   footage, because it softens past that. Set `FACE` from a `frames`
   still: the crop centres on it and the keywords go opposite it.
3. **Hook.** Find the strongest proof in the transcript (a number, a
   result, before and after) and open on it as a card scene with a rolling
   counter, 4–10 s long, before the first face shot. Move the greeting after
   it and put the name in as a keyword at the bottom left ("Hey!" over the
   name).
4. **Steps.** Name the number of steps in the intro. Give each step a card
   scene: the step's title, and its parts or its result as cards.
5. **Keywords.** Pick the phrase that matters from about every 20 s of the
   face shots: 1–3 words for the big italic line and 1–3 words for the
   small line above it. Never while a card scene is on.
6. **Screens.** Where the speaker shows a tool, `SHRINKS` puts the face in
   the circle over a still of the screen (its `path`, a PNG or JPEG from
   `frames`) or over a card scene. A video file won't load as `path`; for a
   moving screen recording, put it in the cut as b-roll with `render` and skip
   the circle there.
7. **Draw it.** Copy [tutorial.html](./tutorial.html) next to the cut,
   fill in its settings block, and run `motion` with `script`, `path` (the
   render), `captions` and `fps` matching the cut. For a long video, try a
   60 s stretch first.
8. **Depth.** Pick the one or two moments from **Depth** above, fill in
   [depth.html](./depth.html)'s `SCENES`, and run `motion` again with the
   step 7 render as `path`.
9. **Review.** `frames` over every card scene and shrink, `measure` the
   loudness, then the **reviewer** agent. Check the pace with `scenes`
   against the numbers above.

## The bar

- A hard cut between framings at least every 8 s on the face shots.
- No keyword over the face, and none during a card scene.
- Cards pop and settle within 0.3 s; nothing fades in slowly.
- The first graphic within 0.5 s, the first face shot by about 10 s.
- The circle never covers what the screen recording is showing; move it if it does.
