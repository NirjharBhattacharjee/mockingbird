#!/bin/sh
# Prints the pauses in a video's sound as "start end length" (seconds), one per line.
# usage: pauses.sh <video> [from] [to] [noise dB, default -35] [shortest pause, default 0.25]
# Exits non-zero, printing nothing, if ffmpeg can't read the sound.
set -eu
f=$1 from=${2:-0} to=${3:-} noise=${4:--35} min=${5:-0.25}
log=$(mktemp)
trap 'rm -f "$log"' EXIT
if ! ffmpeg -hide_banner -nostats -ss "$from" ${to:+-to "$to"} -i "$f" -vn \
  -af "silencedetect=noise=${noise}dB:d=$min" -f null - 2>"$log"; then
  echo "pauses.sh: ffmpeg couldn't read the sound in $f:" >&2
  tail -3 "$log" >&2
  exit 1
fi
awk -v off="$from" '
  /silence_start/ { s = $NF + off }
  /silence_end/   { printf "%.2f %.2f %.2f\n", s, $5 + off, $8 }' "$log"
