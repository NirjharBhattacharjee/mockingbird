#!/usr/bin/env bash
# Sets up mockingbird in one go: the tools (Bun, whisper-cpp, Ollama, ffmpeg),
# the code, the models, and Ollama with the cleanup model. Safe to run again:
# anything already done is skipped.
#
#   curl -fsSL https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/scripts/install.sh | bash
#
# Or from a clone: ./scripts/install.sh
#
# MOCKINGBIRD_DIR   where to clone the code (default ~/mockingbird; ignored
#                   when run from inside a clone)
# MOCKINGBIRD_HOME  where models/ goes (default ~/.mockingbird)

# Everything is inside main, so a download cut short by curl runs nothing.
main() {
  set -euo pipefail

  local repo_url="https://github.com/NirjharBhattacharjee/mockingbird.git"
  local models="${MOCKINGBIRD_HOME:-$HOME/.mockingbird}/models"
  local llm_url="${MOCKINGBIRD_LLM_URL:-http://127.0.0.1:11434}"
  local llm_model="${MOCKINGBIRD_LLM_MODEL:-qwen3:4b-instruct-2507-q4_K_M}"
  local new_terminal=0

  step() { printf '\n\033[1;35m==>\033[0m \033[1m%s\033[0m\n' "$1"; }
  skip() { printf '    %s\n' "$1"; }
  fail() {
    printf '\n\033[1;31merror:\033[0m %s\n' "$1" >&2
    exit 1
  }

  if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    fail "mockingbird needs a Mac with Apple Silicon."
  fi
  command -v brew >/dev/null 2>&1 || fail "Homebrew is needed first: see https://brew.sh, then run this again."

  step "1/5 Tools"
  if command -v bun >/dev/null 2>&1; then
    skip "bun is installed"
  else
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    new_terminal=1
  fi
  local formula
  for formula in whisper-cpp ollama ffmpeg; do
    if brew list --formula "$formula" >/dev/null 2>&1; then
      skip "$formula is installed"
    else
      brew install "$formula"
    fi
  done

  step "2/5 Code"
  local dir
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")/.." 2>/dev/null && pwd || true)"
  if [ -n "$here" ] && grep -q '"name": "mockingbird"' "$here/package.json" 2>/dev/null; then
    dir="$here"
    skip "using this clone: $dir"
  else
    dir="${MOCKINGBIRD_DIR:-$HOME/mockingbird}"
    if [ -d "$dir/.git" ]; then
      skip "already cloned: $dir"
    elif [ -e "$dir" ]; then
      fail "$dir already exists and isn't a clone of mockingbird. Set MOCKINGBIRD_DIR to use another folder."
    else
      git clone "$repo_url" "$dir"
    fi
  fi
  (cd "$dir" && bun install)

  step "3/5 Models"
  mkdir -p "$models"
  download() {
    if [ -s "$models/$1" ]; then
      skip "$1 is downloaded"
      return
    fi
    # Download to a temporary name first, so an interrupted download isn't mistaken for a model.
    curl -fL --progress-bar -o "$models/$1.part" "$2"
    mv "$models/$1.part" "$models/$1"
  }
  download ggml-base.en.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
  download silero_vad.onnx \
    https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx

  step "4/5 Ollama"
  ollama_up() { curl -fsS "$llm_url/api/version" >/dev/null 2>&1; }
  if ollama_up; then
    skip "Ollama is running"
  else
    # A Homebrew service keeps it running in the background, and after a restart.
    brew services start ollama
    local i
    for i in $(seq 1 30); do
      ollama_up && break
      sleep 1
    done
    ollama_up || fail "Ollama didn't start. Try \`ollama serve\` in another window, then run this again."
  fi

  step "5/5 Cleanup model"
  ollama pull "$llm_model"

  printf '\n\033[1;32mAll set.\033[0m Now run:\n\n'
  [ "$new_terminal" = 1 ] && printf '    # open a new terminal window first, so it finds bun\n'
  printf '    cd %s\n    bun run listen\n\n' "$dir"
}

main "$@"
