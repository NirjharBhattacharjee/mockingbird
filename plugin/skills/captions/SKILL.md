---
name: captions
description: Make captions for a short or long-form video with mockingbird. Word-by-word captions drawn on a short with the spoken word highlighted, or an SRT file for a long YouTube video, with names spelled right and placed clear of faces and app buttons. Use whenever a render needs captions.
---

# Captions

Many people watch with the sound off, and a caption is also something moving
on screen every second. Always make them.

## Make them

Call `captions` with exactly the clips you'll pass to `render`. It transcribes
each clip and returns SRT timed to the finished video.

| | Short | Long-form |
|---|---|---|
| `perCue` | 2–3 (1 for a fast, punchy style) | 8 |
| `lit` | on: the spoken word comes out yellow | off |
| `upper` | your choice; capitals read louder | off |
| Delivered as | drawn on the picture (`render`'s `captions`) | `<name>.srt` beside the video, to upload to YouTube |
| `captionsY` | 0.65–0.7 under a face, 0.5 on a split's seam | if drawn: 0.85–0.9 |

## Fix them

The SRT is text; edit it before passing it on.

- **Names**: check every name, product and jargon word against
  `dictionary_list`. Fix the SRT, and offer to `dictionary_add` the right
  spelling so the next transcription gets it (`"bhattacharyaji => Bhattacharjee"`).
- **Marks**: with `lit`, the word being said is `*marked*`. You can move the
  mark to the word that matters most in each cue instead. Keep each cue's
  marks paired.
- Only change the text lines, never the numbers or the `-->` times.

## Place them

- Not over the face: look at `frames` across the clip, and move `captionsY`
  up or down so the captions sit below the chin or on the seam of a split.
- Not over what the video is about: in a screen recording, keep them off the
  part of the screen being discussed.
- Inside the safe area: platforms cover roughly the bottom fifth of a short
  with their own caption and buttons, and a strip down the right with icons.
  Don't go below `captionsY` 0.75 in a short.
- The same place for the whole video. Moving captions read as a mistake.

## When they can't be drawn

If mockingbird can't draw captions on this Mac, `render` says so and saves
them as a subtitle track plus an `.srt` beside the video. Tell the user; an
editor such as CapCut can burn them in.
