# Screen recording inspection

These tools inspect a local recording so you can choose what to review or edit.
They use ffmpeg and ffprobe on the machine. `screen_privacy` also needs a
locally installed `tesseract` on `PATH`; the other tools work without it.
None of the tools downloads a model or sends media to a service. The MCP
client controls where it sends the results it receives. ffmpeg and ffprobe
accept local file and pipe protocols only. Playlist and manifest inputs are
rejected: supply one direct local media file.

## Coordinate contract

Inspection accepts video with square pixels and no rotation or other display
matrix transform. It rejects non-square pixels, rotation and unknown pixel
geometry. Normalize the file first, then inspect the normalized file. Use
rectangles only with that same file; do not apply them to the original or to
another render without a verified coordinate transform.

Every result includes `coordinateSpace`. Its `inputPath` is the supplied
absolute path; `reference` is `encoded_frame`, `units` is `pixels`, and
`origin` is `top-left`. It reports encoded and display dimensions separately,
the sample aspect ratio, and zero rotation. Accepted files have equal encoded
and display dimensions. The path is not a content fingerprint: replacing the
file invalidates the result. The tools do not normalize or rotate the input.

## Choose frames

Call `screen_frames` with an absolute `path`, a new absolute `outDir`, and
up to 48 `times` in seconds from the beginning of playback. For example:

```json
{"path":"/work/demo.mov","outDir":"/work/demo-frames","times":[0,12.5,28]}
```

Each PNG keeps the source's pixel dimensions. The result records the
`requested` playback time and the `selected` playback time of the frame
displayed then. It also gives `pts` in source seconds, `ptsTicks` as an
integer string, and `timeBase` as a fraction. Multiply the ticks by the
time base to recover the source presentation timestamp (PTS) without
rounding. `timeOriginFraction` is the source PTS that corresponds to
playback time zero. The tool selects the last frame whose PTS is at or before
the requested time, including a frame held across a long gap.

Frames without usable PTS, an unknown duration, or a request outside the
known video span produce an error. If an audio track is longer and the video
track has no duration, the last frame's reported duration limits the span.
If that duration is also missing, the span ends at the last frame PTS. The
output folder must not already exist. The PNG dimensions and coordinates
match the encoded pixels of the supplied file.

## Find changes

`screen_changes` accepts `path`, `from`, `to`, `every`, and `threshold`.
Times are playback seconds; `from` defaults to zero, `to` to the video end,
and `every` to five seconds. Each sampled picture is scaled to 160 by 90
pixels with its aspect ratio preserved. A score is the mean absolute RGB
pixel difference from the preceding sample, as a percentage of the maximum.
The default threshold is 5. A result gives the two sample times, selected
frame PTS, and score. It does not identify clicks or determine the exact
time of a change. Changes that appear and disappear between samples can be
missed.

## Scan for privacy candidates

`screen_privacy` accepts the same `path`, `from`, `to`, and `every`, plus an
optional `names` array of up to 20 strings. It runs tesseract on the
full-resolution selected frames. It looks for email addresses, common
absolute and relative file paths, and case-insensitive substrings matching
the supplied names. Each finding identifies the requested and selected
time, candidate types, and a rectangle enclosing the recognized text row.
Rectangles use the pixels in `coordinateSpace`: `x` and `y` start at the top
left, with width `w` and height `h`. OCR text itself is not returned. At most
1,000 findings are returned; `omittedFindings` reports additional matches.

This is a sampled search for candidates, not a privacy clearance. OCR can
miss visible text, file paths may not match these patterns, and arbitrary
names are not detected. The result includes each sampled instant and does
not imply that the intervals between them were inspected. Review the source
and mask any identified regions in a new render.

## Implementation boundary

`@mockingbird/video` owns source metadata, exact presentation timestamps,
frame selection, bounded subprocess execution, frame decoding, and the
encoded-pixel geometry check. The daemon owns inspection arguments, coverage,
OCR classification, contact sheets, and response formatting. The video
package does not import the daemon. Its geometry metadata describes encoded
dimensions, sample aspect ratio, and any reported rotation tag or display
matrix; it does not transform coordinates.

## Review a contact sheet and sound

`screen_watch` takes `path`, a new absolute PNG `out`, and the same time
range and interval. `columns` is a whole number from 1 to 6, default 4.
The sheet labels each picture with its requested playback time to the
nearest millisecond. The JSON result also records its selected frame PTS.
Each section runs from one sample to the next, or to `to` for the last.
For each section, ffmpeg measures integrated EBU R128 loudness in LUFS.
The result distinguishes `measured`, `silent`, `below_gate`, `no_samples`,
and `no_audio`. A sheet and sound measurements do not establish that anyone
watched or listened to the edit.

## Limits and file handling

Inputs must be local files accessible to the process. The video must be at
most 7,200 seconds, 40 megapixels, and 1,000,000 timestamped frames. The
change tool accepts at most 120 samples; the other tools accept at most 48.
Full-resolution extraction and OCR also accept at most 320 million source
pixels per call, counted across the requested samples.
Increase `every` or choose a shorter range when a sample limit is reached.
One call has a five-minute deadline, and each subprocess has a 90-second
limit. Long or complex footage can reach those limits. The tools return an
error instead of silently reducing coverage.

Outputs never replace an existing file or directory. Each call uses its own
temporary files, removes them when finished, and does not modify the source.
Concurrent calls for the same output cannot both publish it. ffmpeg,
ffprobe, OCR and generated images remain local; OCR depends on the installed
language data and may produce different results across installations.
