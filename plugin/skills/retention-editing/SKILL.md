---
name: retention-editing
description: Cut a video tight without making it feel chopped. Covers finding and removing pauses, false starts, retakes and filler, putting cuts on word boundaries, hiding jump cuts with punch-in zooms, and setting the pace for a short or a long-form video. Use when cutting clips for mockingbird's render, or when a video drags.
---

# Retention editing

Every cut is a small jolt of attention (an orienting response); pauses and
repeats are where viewers leave. But attention is limited. Fast cutting plus
dense or arousing content overloads it, and people remember less (Lang, "can
an edit be too much?"). So tighten until nothing drags, and stop there. A
punchy reaction can be cut harder than an explanation. See
[RESEARCH.md](../../docs/RESEARCH.md#attention-and-cutting).

## Tools

The scripts are in this skill's `scripts/` folder.

- `pauses.sh <video> [from] [to] [noise dB] [shortest pause]` prints each
  pause in the sound as `start end length`, in seconds of the source.
  Defaults: quieter than −35 dB for at least 0.25 s. In a noisy room, use −30.
- `clips.sh <from> <to> [min pause] [margin]` reads `pauses.sh`'s output and
  prints `render`'s `clips` as JSON: everything between pauses of at least
  `min` seconds, keeping `margin` seconds into each pause. A stretch too short
  to stand alone is joined to the next, pause and all, so no word is lost.
  `pauses.sh` exits non-zero if ffmpeg can't read the sound; don't run
  `clips.sh` on its output then.
- `transcribe` with `words: true` gives each word's start and end. Keep it to
  a few minutes per call.

Cut from both. Whisper's word times smear across silences (a word's end runs
into the pause after it), so pauses come from `pauses.sh`, and the words tell
you what's being said where.

## Settings

| | Short | Long-form |
|---|---|---|
| Pauses cut | over 0.25–0.3 s | over 0.5 s |
| Margin kept | 0.1 s | 0.2 s (auto-editor's default) |
| Punch-ins | `zoom` 1.1–1.2 on every other jump cut | the same, for a talking head |
| A visual change | every few seconds (a cut, a zoom, a caption page, b-roll) | between face and screen, every 20–60 s or at each new point |

```sh
scripts="<this skill's folder>/scripts"
"$scripts/pauses.sh" talk.mp4 120 165 | "$scripts/clips.sh" 120 165 0.3 0.1
```

## What to cut

- **Dead air**: the pauses above.
- **False starts and retakes**: the speaker starts a sentence, stops, starts
  again. Keep the last full take.
- **Filler**: Whisper often leaves "um" and "uh" out of the text. A gap between
  two words that `pauses.sh` doesn't call silence is usually one. Cut it if
  the clip either side is long enough to stand alone.
- **Repeats**: the same point made twice; keep the better one.
- **Wind-up**: "So, basically, what I wanted to say is". Start on the claim.

## Where to cut

- In: just before a word starts (its start minus 0.05–0.1 s), never inside a
  word.
- Out: just after a sentence's last word ends, plus the margin. Never on the
  first word of a new sentence, and never leaving a breath at the end.
- Clips shorter than about half a second feel like glitches; join them to a
  neighbour.

## Hiding jump cuts

Cutting a pause out of one continuous shot makes the head jump. Alternate
`zoom: 1` and `zoom: 1.15` on consecutive clips with the same `focus`, so each
cut reads as a deliberate punch-in. Save bigger zooms (1.4–1.6) for the one
line that matters most.

## Check

Render, then measure it with style-match's `measure.sh` (for cuts per minute)
and watch the result's first and last seconds and two cuts in the middle via
`frames`. If it feels breathless, put the 0.1 s back or keep a pause before
the key line.
