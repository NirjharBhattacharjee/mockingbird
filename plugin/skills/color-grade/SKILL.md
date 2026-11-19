---
name: color-grade
description: Grade a video's colour by measuring it. Correct exposure, white balance and skin with `color`, match the shots so cuts don't jump, then add a look from five free LUTs (clean, punchy, warm-film, teal-orange, faded). Use on every edit before the final render, when the user asks for a look or a grade, or when the reviewer fails a video on colour.
---

# Colour grade

You can't judge colour from a few stills, so grade by numbers: `scopes`
reads the picture the way a colourist reads the scopes, `color` and `lut`
change it, and `scopes` on the render says whether it worked. Look at
`frames` last, to catch what the numbers miss.

An HDR source from a phone is brought to SDR before anything else
(MCP.md, HDR sources), so grade the picture `scopes` reports. Don't
correct the HDR conversion yourself.

## 1. Measure each shot

`scopes` with `from` and `to` on each clip's stretch of its source, and
`every: 0.2` for a clip under 3 s (the default reads one frame a second).
One number over a whole edit hides a dark shot between two bright ones. If the
edit crops (`vertical`, `zoom`), render it once ungraded and measure each
clip's span in that instead: a face that fills a 9:16 frame reads darker
than the wide shot it came from (0.36 against 0.48 on the #252 vlog).
Write down, per clip:

| Number | In range |
|---|---|
| mean luma | 0.40 to 0.60 for a face; a night scene or a moody piece can sit lower on purpose |
| 95th percentile | above 0.75, or the picture looks dull |
| 5th to 95th spread | 0.6 or more; under that it looks flat |
| crushed blacks, clipped whites | each under 1% |
| saturation | 0.15 to 0.35; under 0.08 looks washed out |
| skin | within 5° of the skin-tone line |

`skin` counts every skin-coloured pixel. With no face in the `frames`,
it's reading wood, sand or a brown sign, so ignore it for that shot. With
a face and a lot of brown behind it, the number mixes the two: treat it as
a rough guide, and judge the face in `frames`.

Low saturation can be the brief: black and white, night, or the `faded`
look. Then keep it, skip the saturation range here and in step 5, and
grade the rest as usual.

Slides, screen recordings and white product shots are mostly white on
purpose: clipped whites and low saturation there are the page, not a
fault, and there's often no skin to read. Grade the webcam or the face in them, if there is
one, and leave the screen's colours alone.

## 2. Correct

One `color` effect per clip, set from its numbers. Change one thing, render
a few seconds (`clips` with just that stretch, or a project's `preview`),
and measure again. These are steps that measured well, not formulas:

- **Exposure.** Mean luma low: `exposure` up in steps of 0.3 stops. Stop
  when clipped whites pass 1%. On a talking head darkened 1.5 stops, +1.7
  brought the mean from 0.16 back to 0.51 with nothing clipped.
- **Contrast.** Spread under 0.6: `contrast` 1.1 to 1.2. Crushed blacks
  over 1%: `gamma` 1.1 to 1.2 lifts them, or lower `contrast`.
- **White balance.** Skin more than 5° toward yellow: raise `temperature`,
  which cools the picture. More than 5° toward red: lower it, which warms
  it. Don't read it as the kelvin the shot was lit at: ffmpeg's filter
  turns grey blue at 8000 and orange at 3000. On the #252 vlog, 5000 K moved skin
  2.2° toward yellow and 8000 K moved it 2.7° toward red, about 1° per
  600 K.
- **Saturation.** Under 0.15: `saturation` 1.1 to 1.4, more the lower it
  is (1.8 took 0.08 to 0.19 on the vlog below). Raise exposure first,
  since a dark picture reads as less saturated.

## 3. Match the shots

Measure each corrected clip again. Next to each other, two shots of the
same scene (the same place and light, the same camera or a second angle on
it) should be within about 0.05 in mean luma, 0.03 in saturation and 3° in
skin. A cut to a different picture on purpose (a screen, slides, b-roll, a
card) keeps its own look. Past
that, the cut jumps. Move the odd one toward the others, not the others
toward it. Two cameras or two lighting setups usually need their own
`temperature`.

## 4. Add a look

One look for the whole video: the same `lut` on every clip, after `color`
in the same `effects` list. The files are in this playbook's folder, under
`luts/` (`guide` names the folder):

```json
{ "effects": [
  { "name": "color", "exposure": 0.3, "saturation": 1.2 },
  { "name": "lut", "file": "<folder>/luts/warm-film.cube" }
] }
```

Measured on a 6 s clip from the #252 vlog (iPhone HLG, a face in daylight;
before: luma 0.48, spread 0.10 to 0.93, saturation 0.14, skin 2.5°
toward yellow):

| Look | What it does | Luma, spread | Saturation | Skin | Suits |
|---|---|---|---|---|---|
| `clean` | a touch of contrast and colour | 0.47, 0.08 to 0.93 | 0.15 | 2.6° | talking head, interview, tutorial webcam |
| `punchy` | strong contrast and colour, no hue shift | 0.47, 0.06 to 0.94 | 0.18 | 2.5° | vlog, a short that has to pop |
| `warm-film` | softer contrast, lifted blacks, warm brights | 0.47, 0.11 to 0.91 | 0.14 | 4.1° | vlog, travel, lifestyle |
| `teal-orange` | teal shadows, orange brights | 0.47, 0.07 to 0.94 | 0.18 | 4.5° | cinematic, product film, trailer |
| `faded` | milky blacks, muted colour | 0.48, 0.16 to 0.86 | 0.10 | 2.5° | calm, nostalgic, a memory sequence |

The looks keep exposure and move skin by 2° at most, so correct first:
a look on a picture that's off makes it worse. `warm-film` and
`teal-orange` push skin toward yellow, so start them with skin at 1° or
less. `faded` takes saturation down by about a third, so it fails the
reviewer's 0.08 on a picture under 0.12; raise `saturation` in `color`
first. A `vignette` of 0.2 to 0.3 suits a face; leave it off screens and
slides.

Which look, by format (**brief** picks the format):

| Format | Look |
|---|---|
| Talking head, interview, podcast | `clean` |
| Screen tutorial, talk with slides | none on the screen; `clean` on the webcam if it's a separate clip |
| Vlog | `punchy` or `warm-film` |
| Product demo or launch | none or `clean` for the product's true colours; `teal-orange` for a cinematic launch film |
| News or commentary | `clean` |
| Anything the user calls calm, nostalgic or soft | `faded` |

If **style-match** measured a reference, its luma, spread and saturation
set the target instead of the table in step 1.

## 5. Render and check

The #252 vlog cut as a vertical short, three shots (a face to camera, a
sign, a bird in grass), `punchy`, in three rounds:

| Round | Settings | Clip 1 (face) | Clip 2 | Clip 3 |
|---|---|---|---|---|
| ungraded | none | luma 0.36, saturation 0.11 | 0.50, 0.17 | 0.45, 0.08 |
| 1 | clip 1 exposure +0.3, saturation 1.3; clip 3 saturation 1.8 | 0.42, 0.19, **6% clipped** | 0.49, 0.22 | 0.43, 0.19 |
| 2 | clip 1 gamma 1.15 for the exposure | 0.39, 0.18 | 0.49, 0.22 | 0.43, 0.19 |
| 3 | clip 1 gamma 1.25; clip 2 exposure -0.2 to match | 0.43, 0.18, skin 2.7° | 0.43, 0.20 | 0.43, 0.19 |


Render, then `scopes` on the render over each clip's span in the finished
video, and `frames` to look. Done when every clip is in step 1's ranges
(or the reference's, or the brief's low saturation) and matches the shots
of its scene as in step 3. If a number
is still out after three rounds, say which one and why (a scene shot
against the sun can't be fixed without clipping), and move on.

## Making the looks

`looks.ts` writes the `.cube` files: `bun plugin/skills/color-grade/looks.ts`.
They're ours and MIT. Change a look there, regenerate, and re-measure the
table above.
