#!/bin/sh
# Renders docs/assets/demo.gif from docs/assets/demo.tape.
# vhs 0.12 silently fails to assemble a GIF with ffmpeg 9, so the tape only
# writes frames (to .demo-frames/) and ffmpeg builds the GIF here.
set -eu

cd "$(dirname "$0")/.."
frames=.demo-frames
rm -rf "$frames"
trap 'rm -rf "$frames"' EXIT

vhs docs/assets/demo.tape

# 1e1e2e is Catppuccin Mocha "base", the same color as the terminal background.
ffmpeg -y -loglevel error \
  -framerate 50 -i "$frames/frame-text-%05d.png" \
  -framerate 50 -i "$frames/frame-cursor-%05d.png" \
  -filter_complex "[0][1]overlay,fps=12,scale=960:-1:flags=lanczos,pad=iw+40:ih+40:20:20:color=0x1e1e2e,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  docs/assets/demo.gif

echo "wrote docs/assets/demo.gif ($(du -h docs/assets/demo.gif | cut -f1))"
