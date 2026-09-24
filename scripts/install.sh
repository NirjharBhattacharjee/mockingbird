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
# MOCKINGBIRD_LLM_URL  the Ollama server to check and pull the model into
#                      (default http://127.0.0.1:11434)

# Everything is inside main, so a download cut short by curl runs nothing.
main() {
  set -euo pipefail

  local repo_url="https://github.com/NirjharBhattacharjee/mockingbird.git"
  local models="${MOCKINGBIRD_HOME:-$HOME/.mockingbird}/models"
  local llm_url="${MOCKINGBIRD_LLM_URL:-http://127.0.0.1:11434}"
  local llm_model="${MOCKINGBIRD_LLM_MODEL:-qwen3:4b-instruct-2507-q4_K_M}"

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
  # All from Homebrew, which checks each download against its formula's sha256.
  # A tool already on the PATH (say, bun from bun.sh) is used as it is.
  local formula
  for formula in bun whisper-cpp ollama ffmpeg; do
    if command -v "$formula" >/dev/null 2>&1 || brew list --formula "$formula" >/dev/null 2>&1; then
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
    if [ -d "$dir/.git" ] && grep -q '"name": "mockingbird"' "$dir/package.json" 2>/dev/null; then
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
  # Pinned to a fixed version and checked against its sha256, so a changed,
  # truncated or corrupt file is downloaded again rather than loaded.
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
  download() {
    if [ -f "$models/$1" ] && [ "$(sha256 "$models/$1")" = "$3" ]; then
      skip "$1 is downloaded"
      return
    fi
    # Download to a temporary name first, so an interrupted download isn't mistaken for a model.
    curl -fL --progress-bar -o "$models/$1.part" "$2"
    if [ "$(sha256 "$models/$1.part")" != "$3" ]; then
      rm -f "$models/$1.part"
      fail "$1 didn't match its expected checksum. Run this again; if it keeps happening, please open an issue."
    fi
    mv "$models/$1.part" "$models/$1"
  }
  download ggml-large-v3-q5_0.bin \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-q5_0.bin \
    d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1
  download silero_vad.onnx \
    https://github.com/snakers4/silero-vad/raw/v6.2.2/src/silero_vad/data/silero_vad.onnx \
    1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3

  step "4/5 Cleanup model"
  # `bun run listen` starts Ollama by itself when it isn't running, so it's only
  # needed here for the download: start it just for that, then stop it again.
  ollama_up() { curl -fsS --max-time 2 "$llm_url/api/version" >/dev/null 2>&1; }
  local serve_pid=""
  if ! ollama_up; then
    local host="${llm_url#*://}"
    host="${host%%/*}"
    # Like `bun run listen`, only start a server on this Mac: anything else would
    # put Ollama on the network. A remote one has to be running already.
    if ! [[ "$host" =~ ^(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?$ ]]; then
      fail "No Ollama answers at $llm_url, and only one on 127.0.0.1, localhost or [::1] is started from here. Start it there, then run this again."
    fi
    OLLAMA_HOST="$host" ollama serve >/dev/null 2>&1 &
    serve_pid=$!
    trap "kill $serve_pid 2>/dev/null" EXIT
    local i
    for i in $(seq 1 30); do
      ollama_up && break
      sleep 1
    done
    ollama_up || fail "Ollama didn't start at $llm_url. Try \`ollama serve\` in another window, then run this again."
  fi
  # The ollama CLI finds its server through OLLAMA_HOST, so point it at the one mockingbird uses.
  OLLAMA_HOST="$llm_url" ollama pull "$llm_model"
  if [ -n "$serve_pid" ]; then
    kill "$serve_pid" 2>/dev/null || true
    wait "$serve_pid" 2>/dev/null || true
    trap - EXIT
  fi

  step "5/5 Command"
  # A shim rather than a compiled binary: macOS records the Fn and typing
  # permissions against the binary that asks for them, and rebuilding a
  # compiled one changes its signature, which silently drops those grants.
  local bin_dir="$HOME/.local/bin"
  local shim="$bin_dir/mockingbird"
  local bun_bin
  bun_bin="$(command -v bun)"
  mkdir -p "$bin_dir"
  cat > "$shim" <<SHIM
#!/bin/sh
# Written by scripts/install.sh. Re-run it after moving the clone.
exec "$bun_bin" "$dir/apps/daemon/src/cli.ts" "\$@"
SHIM
  chmod +x "$shim"
  skip "installed $shim"
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) printf '    \033[1;33mnote:\033[0m %s is not on your PATH. Add it to your shell profile:\n      export PATH="%s:$PATH"\n' "$bin_dir" "$bin_dir" ;;
  esac

  printf '\n\033[1;32mAll set.\033[0m Now run:\n\n'
  printf '    mockingbird start\n\n'
  printf 'That runs it in the background, now and at every login. macOS will ask\n'
  printf 'for permission the first time; `mockingbird status` says what is missing.\n\n'
}

main "$@"
