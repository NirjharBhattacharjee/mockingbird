#!/bin/sh
# Regenerates bench/fixtures/*.wav with macOS text-to-speech (16 kHz mono PCM16).
set -eu

out="$(dirname "$0")/../bench/fixtures"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

make_fixture() {
  name="$1"
  text="$2"
  printf '%s\n' "$text" > "$out/$name.txt"
  say -o "$tmp/$name.aiff" "$text"
  afconvert -f WAVE -d LEI16@16000 -c 1 "$tmp/$name.aiff" "$out/$name.wav"
}

make_fixture hello "Um, so hello world, this is a test of the mockingbird dictation pipeline."
make_fixture short "Yes please."
