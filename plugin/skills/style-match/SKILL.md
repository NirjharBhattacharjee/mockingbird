---
name: style-match
description: Measure a video that already did well (its cuts per minute, seconds per shot, loudness, speaking pace, caption style) and set an edit to match it. Use when the user gives a reference video or says "make it like this", or to compare a render against a target.
---

# Style match

Measure, don't guess. A reference video that worked in the user's niche is a
better target than any general rule, as long as the numbers stay sensible for
the content. A calm explanation shouldn't copy a reaction channel's pace.

Only measure. Never copy the reference's footage, music, graphics or script.

## Measure

The script is in this skill's `scripts/` folder:

```sh
<this skill's folder>/scripts/measure.sh reference.mp4
```

prints the size, length, cuts and cuts per minute, seconds per shot,
integrated loudness and true peak, and when each cut happens. It finds cuts
with ffmpeg's scene detection (threshold 0.3; pass a second argument, lower to
catch more). A punch-in on the same shot often doesn't count as a cut, so
look at the stills too.

Then with mockingbird:

- **Speaking pace**: `transcribe` the reference; words divided by minutes of
  speech. Lecturers in the edX study averaged 156, and the fastest held
  viewers longest, likely because speed went with enthusiasm.
- **Look**: `frames` every 1–2 s over the first 15 s and two other stretches.
  Note words per caption, case, colour of the spoken word, caption height,
  title use, how often b-roll appears, whether there's music.
- **Hook**: what happens in its first 3 s (short) or 30 s (long-form).

## Match

| Reference shows | Set |
|---|---|
| Seconds per shot | how hard to cut pauses, and zoom on every jump cut or every other one (**retention-editing**) |
| Words per caption, case | `captions`' `perCue` and `upper` |
| Caption height | `captionsY` |
| B-roll every N seconds | `inserts` spacing (only where the speech supports it) |
| Loudness | nothing: mockingbird renders at −14 LUFS regardless |

Render, run `measure.sh` on your render, and compare. Within about 20% on
seconds per shot is close enough; the content decides the rest.
