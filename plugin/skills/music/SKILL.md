---
name: music
description: Put background music under a mockingbird edit without licensing anything: pick a generator (lo-fi, ambient, upbeat corporate, cinematic, minimal electronic), draw its energy curve from the edit's sections, make the bed with the `music` tool and mix it under the speech with `render`. Use whenever an edit needs music, or the user asks for a track that builds, drops or matches a mood.
---

# Music

mockingbird's `music` tool plays a generator, a JavaScript module in
`generators/` beside this file, and saves a WAV. The generators build every
sound from oscillators, filters and noise, so there's nothing to license and
the same arguments make the same track. A different `seed` makes a
variation.

## Is music the right call?

Music under someone explaining something lowers what viewers remember
(Mayer's coherence principle, [RESEARCH.md](../../docs/RESEARCH.md)). Use it
where nobody is explaining: intros, b-roll, montages, transitions, outros,
and under talk only when it's low and ducked. A short made of one person
talking usually wants sound effects on the beats, not a bed.

## Pick a generator

| Generator | Sounds like | Use under | Tempo (default) | Key (default) |
|---|---|---|---|---|
| `lofi.js` | swung drums, warm electric piano, vinyl | devlogs, study and coding videos, casual talk | 70-90 (80) | A minor |
| `ambient.js` | slow pads, drone, bells, no drums | calm explainers, tutorials, reflective moments | 50-80 (60) | D major |
| `corporate.js` | bright chords, arpeggio, claps, four on the floor | product demos, launches, listicles | 105-128 (116) | C major |
| `cinematic.js` | string swells, low brass, big drums, risers | intros, trailers, reveals, a dramatic turn | 60-90 (72) | D minor |
| `electronic.js` | steady kick, sub bass, hats, filtered stabs | tech, fast-cut edits, montages | 115-128 (122) | F minor |

A minor key reads serious or moody; major reads bright. Match the tempo to
the cut: about one cut a beat or two feels intended.

## Draw the energy curve

`energy` is 0 to 1, or `[seconds, level]` points eased between. Each
generator brings in layers as it rises (the top comment of each file says at
which levels), so the curve is the arrangement. Work it out from the edit:

- **Under speech: 0.2 to 0.45.** Chords and a light beat, nothing that
  fights the voice.
- **Intros, b-roll, montages: 0.6 to 0.8.** The full groove.
- **A build into a reveal: rise to 0.9 over 4 to 8 s, ending on the cut.**
  The risers land on phrase starts.
- **Endings: fall to 0.3 over the last 5 to 10 s.** Every track also fades
  in over its first seconds and out over its last.

Example for a 60 s edit with a 6 s intro, talk, a montage at 40 s and an
outro:

```json
[[0, 0.7], [6, 0.3], [38, 0.3], [41, 0.85], [52, 0.85], [58, 0.3]]
```

## Make it and mix it

1. `music` with `script` (the generator's absolute path, this folder plus
   `/generators/lofi.js`), `duration` (the edit's length, or a little more),
   `out` (a `.wav` next to the edit), and `tempo`, `key`, `energy`, `seed`
   as you chose. It comes back at about −14 LUFS and says what it reached.
2. `render` with the bed in `audio`:
   `{ path, volume: 0.15, duck: true }` under talk (0.1 if the voice is
   quiet, 0.25 for a section with no speech). `duck` drops it while someone
   speaks and brings it back up in the gaps. Don't `loop` a bed made to the
   edit's length; the curve wouldn't line up.
3. Check it like any render: the **reviewer** measures loudness. Nobody can
   hear it but a person, so when the music matters, say which generator and
   curve you used and ask the user to listen before calling it done.

## When it fails

`music` says why: a generator that throws names its line, a key it can't
read says so, and a curve out of time order is refused before anything
runs. It needs the pinned Chrome (`mockingbird models pull chrome`); without
it, ask the user for a track to use instead.
