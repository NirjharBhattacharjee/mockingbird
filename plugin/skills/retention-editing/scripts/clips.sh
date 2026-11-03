#!/bin/sh
# Turns pauses.sh's output (on stdin) into render's clips: the stretches between
# pauses at least <min> seconds long, each kept <margin> seconds into the pause either side.
# usage: pauses.sh <video> | clips.sh <from> <to> [min, default 0.4] [margin, default 0.15]
set -eu
awk -v from="$1" -v to="$2" -v min="${3:-0.4}" -v m="${4:-0.15}" '
  # A stretch too short to stand alone (a word before a pause) is joined to the
  # next one rather than dropped, so no speech is lost.
  function keep(a, b) {
    if (pending != "") a = pending
    if (b - a > 0.3) { printf "%s{\"from\":%.2f,\"to\":%.2f}", sep, a, b; sep = ","; pending = "" }
    else pending = a
  }
  # ffmpeg sometimes reports one pause as two that touch; join them.
  { if (n && $1 - e[n] < 0.05) e[n] = $2; else { n++; s[n] = $1; e[n] = $2 } }
  END {
    printf "["; at = from; pending = ""
    for (i = 1; i <= n; i++) if (e[i] - s[i] >= min) { keep(at, s[i] + m); at = e[i] - m }
    # The last stretch has no next one to join, so it is kept whatever its length.
    if (pending != "") at = pending
    if (to - at > 0) printf "%s{\"from\":%.2f,\"to\":%.2f}", sep, at, to
    print "]"
  }'
