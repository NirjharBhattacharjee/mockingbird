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
   the circle over the screen recording (its `path`) or over a card scene.
7. **Draw it.** Copy [tutorial.html](./tutorial.html) next to the cut,
   fill in its settings block, and run `motion` with `script`, `path` (the
   render), `captions` and `fps` matching the cut. For a long video, try a
   60 s stretch first.
8. **Review.** `frames` over every card scene and shrink, `measure` the
   loudness, then the **reviewer** agent. Check the pace with `scenes`
   against the numbers above.

## The bar

- A hard cut between framings at least every 8 s on the face shots.
- No keyword over the face, and none during a card scene.
- Cards pop and settle within 0.3 s; nothing fades in slowly.
- The first graphic within 0.5 s, the first face shot by about 10 s.
- The circle never covers what the screen recording is showing; move it if it does.
