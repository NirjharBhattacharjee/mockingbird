# A camera over screen footage

For sparse or variable-rate recordings, first use `screen_normalize` with
`path` and a new `out` MP4. It decodes from the beginning and rebuilds the
frame timeline before trimming. Optional `from` and `to` are source seconds;
`speed` is 0.25 to 64 and `fps` is 1 to 120. Sound follows the same interval
and speed. Decoding from the beginning costs more than a keyframe seek but
retains screen states held across the requested start. The output cannot exceed
7,200 seconds, including slow motion. Keep the original.
Normalization produces square pixels with rotation applied. Inspect and mark
that normalized file. `screen_render` rejects rotated or non-square-pixel
sources so an inspection rectangle cannot silently target different pixels.

`screen_render` uses the existing local HTML motion renderer. It requires
`path` and a new `out` filename. `fps` defaults to 30; `duration` optionally
limits the source interval. The output keeps the source size and sound.

`camera` is an ordered list of `{at, x, y, zoom}` keyframes. Times are seconds;
x and y are source pixels at the centre of the view. Zoom 1 fits the source.
Positions interpolate with `easing: "smooth"` or `"linear"`; zoom interpolates
in log space. Before and after the keys, the camera holds the nearest key.

`overlays` contains timed `{kind, from, to, x, y, w, h}` rectangles for `box`,
`spotlight`, `blur` and `mask`. They share the footage's camera transform.
`click` needs a source point and a time interval. It marks a supplied event;
the tool does not detect clicks. These marks do not track controls that move
inside the recording. Split intervals and measure again after scrolling.

Use opaque `mask` rectangles for privacy. Blur reduces detail but does not
guarantee removal. Redactions never fade at interval boundaries. Include all
times when sensitive data is visible, check the output, and retain the source.

For `text`, x and y are output pixels. Supply literal `text`, optional `size`
and `color` as #RRGGBB. Newlines are supported. The browser draws text without
ffmpeg's drawtext filter. Text stays fixed while the camera moves. Make space
for it in the frame; it is not an automatic caption layout engine.
