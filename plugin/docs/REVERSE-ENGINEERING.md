# Reverse engineering

Where the skills' default numbers come from. Instead of guessing what a
"good" caption size or pause length is, we read how tools that already work
do it, with [REA](https://github.com/morluto/rea), and wrote down the numbers.
We copied no code. mockingbird and this plugin implement everything
themselves, and the numbers below are facts about other programs, not their
expression.

## How

REA runs agents over a codebase and reports how it behaves. For example, on
a JavaScript app:

```sh
npx rea-agents analyze-javascript-application <repo>
```

REA needs Node 24.22.1 or newer. We ran it in a scratch folder, read its
reports, and checked each number against the source by hand.

## Remotion's TikTok template

[remotion-dev/template-tiktok](https://github.com/remotion-dev/template-tiktok):
the word-by-word caption style most short-form tools copy.

| What | Their value | What we use |
|---|---|---|
| A new caption page | every 1200 ms (`SWITCH_CAPTIONS_EVERY_MS`) | `captions` starts a cue when its words span 1.2 s, and at every clip, sentence end, or 0.5 s pause |
| Highlighted word | green `#39E508` | yellow, the colour Hormozi-style captions made familiar; one constant in mockingbird |
| Font size | up to 120 px, shrunk to fit 90% of the width | Core Text, wrapped to the frame's width |
| Outline | 20 px black stroke | black outline |
| Position | 350 px from the bottom of 1920 (about 0.82 of the height) | `captionsY` 0.7 by default, clear of the app buttons and caption that cover the bottom of the screen |
| Case | upper case | `upper: true` is an option, off by default |
| Entrance | spring pop: scale 0.8 → 1 and up 50 px | the kit's `captions`: each group rises 26 px and scales 0.9 → 1 in 0.22 s on an expo curve, and a pill in the accent colour slides from word to word, drawn by `motion` |

## auto-editor

[auto-editor](https://github.com/WyattBlue/auto-editor) (Unlicense): the
standard tool for cutting silence out of long recordings.

| What | Their default | What we use |
|---|---|---|
| Silence threshold | 4% of full volume | `pauses.sh` uses ffmpeg's `silencedetect` at −35 dB (about 1.8%); raise it toward −30 dB for a noisy room |
| Margin around speech | 0.2 s | `clips.sh` keeps 0.15 s by default; long-form uses 0.2 s |
| Music ducking | down 85% once the speech passes 4%, in 100 ms, back in 500 ms | `render`'s `duck` uses the same numbers, through ffmpeg's `sidechaincompress` |

## What it told us not to build

Remotion renders with Chromium because its captions animate. Nothing in its
template needs a browser: the spring pop (scale 0.8 → 1, up 50 px) is a
formula, and mockingbird's `motion` tool draws it with Core Graphics. The
motion-graphics kit's captions use an expo curve instead (a 0.22 s rise and a
0.9 → 1 scale); its other entrances, the slammed titles, punch-ins, counters
and checklist chips, use `m.spring`, the same damped spring Remotion uses.
Neither the plugin nor mockingbird depends on Remotion.
