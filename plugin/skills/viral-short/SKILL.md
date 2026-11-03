---
name: viral-short
description: Turn a video into vertical shorts for YouTube Shorts, Instagram Reels and TikTok, rendered on this Mac by mockingbird. Use when the user gives a video (a talk, podcast, stream, screen recording or phone clip) and wants shorts, reels, TikToks or clips cut from it.
---

# Viral short

You pick the moments, cut them tight, hook the first second, caption every
word, frame the speaker, add only the graphics and sound that earn their place,
render, and have the result checked before calling it done. mockingbird's MCP
tools do the mechanics; this skill and the ones it names hold the judgement.

The other skills: **hooks** (the first seconds), **retention-editing** (cutting
pauses, punch-ins, pace), **captions**, **motion-graphics** (animated titles,
captions, zooms and sound), **style-match** (copy the pace of a video that already did well). Read
each when you reach its step. For a full-length 16:9 edit, use **long-form**
instead.

## Before you start

- Call `status`. If mockingbird's tools are missing, the user needs mockingbird
  v0.3.0 or newer (`brew install nirjharbhattacharjee/mockingbird/mockingbird`,
  then `mockingbird models pull`). If `render` doesn't list `focus`, `split`,
  `texts`, `inserts` and `audio`, mockingbird is older: tell the user to
  update (`brew upgrade mockingbird`) and stop. The `motion` tool is needed
  only for step 7; without it (an older mockingbird, or an Intel Mac), make
  a plain captioned short and say why it isn't animated.
- Use absolute paths. Renders land beside the source as `<name>-short-N.mp4`
  unless you pass `out`; mockingbird never overwrites a file.
- If the user gave a reference video they want to match, run **style-match**
  on it first.

## Steps

1. **Read the video.** `transcribe` the whole file for an outline. Call
   `frames` every 30 seconds (every 10 for anything under five minutes) and
   look at the stills: who's on screen, where, and whether there are slides or
   a screen share.
2. **Pick moments.** One to three moments of 15 to 60 seconds, each making
   sense to someone who hasn't seen the rest: one idea, a hook in its first
   sentence or one you can move there (**hooks**), and a finished last
   sentence. Prefer the moment with the clearest payoff over the most
   impressive-sounding one. Tell the user which moments and why, in a line
   each, before rendering, unless they already said what they want.
3. **Cut it tight.** Follow **retention-editing**: word times from
   `transcribe` with `words: true`, pauses from its `pauses.sh`, clips that
   start just before a word and end just after a sentence. A clip from later in
   the moment can go first as a cold open; `render` keeps clips in the order
   you list them.
4. **Caption.** `captions` with the same clips; fix every misheard name; see
   **captions** for placement.
5. **Frame.** `frames` with `from`/`to` over each moment, every second or two.
   Give each clip a `focus` on the speaker's face, or use `split` for a screen
   recording with a webcam (screen on top, webcam below, `captionsY: 0.5`).
   Punch in with `zoom` per **retention-editing**.
6. **Render the cut.** One `render` call per short, `vertical: true` (or
   `split`), with b-roll only where the speech names something worth seeing,
   music low and ducked, and a sound effect only on a beat that matters. For
   a plain captioned short, pass the captions here and stop. For anything
   that moves, leave captions and titles out and go on.
7. **Animate.** Per **motion-graphics**: a script from its short template
   (a hook that slams in, a new framing every couple of seconds, punch-ins
   and pops on the keywords, two or three callouts, pill captions, a sound
   on each beat), run with `motion` over the cut and the SRT from step 4.
8. **Review.** Hand the file to the **reviewer** agent with what the short
   is meant to be. Fix what it finds and render again (a new file each time);
   don't argue with a failed check.
9. **Report.** For each short: the path, length, what it covers, its hook,
   and what you'd test next.

## The bar

A short is done when all of these hold. "Sloppy" is almost always one of
them failing.

- Starts on speech or motion in the first frame. No "hey guys", no logo, no
  fade-in, no black frame.
- Never cut mid-word, never on a breath, never one word into a sentence.
- Ends on a finished sentence, ideally one that sends the viewer back to the
  start.
- One idea. If you need "and also", it's two shorts.
- Captions on every word, spelled right, never over the face, inside the safe
  area (below).
- The face, or the thing being talked about, fills the frame; nothing
  important cropped by the 9:16 cut.
- About −14 LUFS, speech always clearly over the music. mockingbird aims for
  −14; a very quiet recording can land near −15 (mockingbird#127), which the
  reviewer reports.
- One caption style, one accent colour, one font, the same position throughout.
- Everything that moves eases in and out; nothing just appears or vanishes.
- Nothing on screen the viewer has to read in under a second.

## Export specs

`render` makes H.264 MP4 at 1080x1920 with the sound at about −14 LUFS, which
Shorts, Reels and TikTok all take as is.

| | YouTube Shorts | Instagram Reels | TikTok |
|---|---|---|---|
| Longest | 3 minutes | 3 minutes | 10 minutes in the app |
| Aim for | 15–60 s | 15–60 s | 15–60 s |

Keep captions and text out of the edges the apps cover with their own buttons
and caption: roughly the bottom fifth, the top tenth, and a strip down the
right side. `captionsY` between 0.5 and 0.75 and titles around 0.2 stay clear.
