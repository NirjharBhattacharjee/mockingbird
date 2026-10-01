#!/usr/bin/env bash
# Sets up mockingbird in one go: the tools (Bun, whisper-cpp, Ollama, ffmpeg),
# the code, the models, and Ollama with the cleanup model. Safe to run again:
# anything already done is skipped, and an existing install is updated to the
# latest release.
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
# MOCKINGBIRD_LLM_MODEL  the cleanup model to pull

# Everything is inside main, so a download cut short by curl runs nothing.
main() {
  set -euo pipefail

  local repo_url="https://github.com/NirjharBhattacharjee/mockingbird.git"

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

  step "1/4 Tools"
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

  # Moves a clone to the newest release tag, or to the latest main while there
  # are no releases yet. A clone with local edits is left alone, not overwritten.
  to_latest() {
    local d="$1" tag
    if [ -n "$(git -C "$d" status --porcelain --untracked-files=no)" ]; then
      fail "$d has local changes, so it wasn't updated. Commit or discard them, then run this again."
    fi
    git -C "$d" fetch --quiet --tags origin
    # Only tags on main: the release workflow refuses any other, so a tag
    # pushed on a branch was never released or checked.
    tag=""
    local t
    for t in $(git -C "$d" tag --list 'v*.*.*' --sort=-v:refname); do
      if git -C "$d" merge-base --is-ancestor "$t^{commit}" origin/main 2>/dev/null; then
        tag="$t"
        break
      fi
    done
    if [ -n "$tag" ]; then
      git -C "$d" -c advice.detachedHead=false checkout --quiet "$tag"
    else
      git -C "$d" checkout --quiet main
      git -C "$d" merge --quiet --ff-only origin/main
    fi
  }
  version() { git -C "$1" describe --tags --always 2>/dev/null || echo unknown; }

  step "2/4 Code"
  local dir
  local here
  local before=""
  # Frozen, so bun.lock is never rewritten in a clone this script manages: a
  # changed lockfile would count as a local edit and block the next update.
  local lockfile="--frozen-lockfile"
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")/.." 2>/dev/null && pwd || true)"
  if [ -n "$here" ] && grep -q '"name": "mockingbird"' "$here/package.json" 2>/dev/null; then
    # A contributor's clone: whatever is checked out is what they want to run.
    dir="$here"
    lockfile=""
    skip "using this clone as it is: $dir"
  else
    dir="${MOCKINGBIRD_DIR:-$HOME/mockingbird}"
    if [ -d "$dir/.git" ] && grep -q '"name": "mockingbird"' "$dir/package.json" 2>/dev/null; then
      before="$(version "$dir")"
      to_latest "$dir"
      if [ "$before" = "$(version "$dir")" ]; then
        skip "already up to date: $before"
      else
        skip "updated $before -> $(version "$dir")"
      fi
    elif [ -e "$dir" ]; then
      fail "$dir already exists and isn't a clone of mockingbird. Set MOCKINGBIRD_DIR to use another folder."
    else
      git clone "$repo_url" "$dir"
      to_latest "$dir"
      skip "installed $(version "$dir")"
    fi
  fi
  (cd "$dir" && bun install $lockfile)

  step "3/4 Models"
  # Pinned to fixed versions and checked against their sha256; see
  # apps/daemon/src/models.ts. Anything already downloaded is skipped.
  (cd "$dir" && bun apps/daemon/src/cli.ts models pull)

  step "4/4 Command"
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

  # An agent that's running is still on the old code, so restart it. One that
  # was stopped stays stopped.
  if launchctl print "gui/$(id -u)/com.mockingbird.agent" 2>/dev/null | grep -q 'state = running'; then
    "$shim" restart
    printf '\n\033[1;32mAll set.\033[0m mockingbird is running %s.\n\n' "$(version "$dir")"
    return
  fi

  printf '\n\033[1;32mAll set.\033[0m Now run:\n\n'
  printf '    mockingbird start\n\n'
  printf 'That runs it in the background, now and at every login. macOS will ask\n'
  printf 'for permission the first time; `mockingbird status` says what is missing.\n'
  printf 'To update later, run the install command again.\n\n'
}

main "$@"
