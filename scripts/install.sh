#!/usr/bin/env bash
# Sets up mockingbird in one go: the tools (Bun, whisper-cpp, Ollama, ffmpeg),
# the code, the models, and Ollama with the cleanup model. Safe to run again:
# anything already done is skipped, and an existing install is updated to the
# latest release.
#
#   curl -fsSL https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.sh | bash
#
# That URL is this file as attached to the latest release, so a change merged
# to main reaches users only when it's released.
#
# Or from a clone: ./scripts/install.sh
#
# MOCKINGBIRD_DIR   where to clone the code (default ~/mockingbird; ignored
#                   when run from inside a clone)
# MOCKINGBIRD_HOME  where models/ goes (default ~/.mockingbird)
# MOCKINGBIRD_LLM_URL  the Ollama server to check and pull the model into
#                      (default http://127.0.0.1:11434)
# MOCKINGBIRD_LLM_MODEL  the cleanup model to pull
# MOCKINGBIRD_CHANNEL  "beta" to also install prereleases (tags like
#                      v1.2.0-rc.1); anything else installs releases only

# Everything is inside main, so a download cut short by curl runs nothing.
main() {
  set -euo pipefail

  local repo_url="https://github.com/NirjharBhattacharjee/mockingbird.git"

  fail() {
    printf '\n\033[1;31merror:\033[0m %s\n' "$1" >&2
    exit 1
  }

  if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    fail "mockingbird needs a Mac with Apple Silicon."
  fi
  local brew_bin=/opt/homebrew/bin/brew
  # Homebrew's own installer, after asking. Its prompts (the Mac password,
  # "Press RETURN") read the keyboard: under `curl | bash` this script is on
  # stdin. With no terminal to ask on, the error below stands.
  install_brew() {
    (: </dev/tty) 2>/dev/null || return 0
    id -Gn | grep -qw admin ||
      fail "Homebrew needs an administrator account, and $(id -un) isn't one. Ask an administrator to install it (https://brew.sh), then run this again."
    printf "mockingbird needs Homebrew, which isn't installed.\n"
    printf "Install it now? It asks for your Mac password, and on a new Mac it also\n"
    printf "installs Apple's command line tools (about 5-15 minutes). [Y/n] "
    local answer
    read -r answer </dev/tty || answer=n
    case "$answer" in [nN]*) return 0 ;; esac
    # Downloaded first: a failed download would hand bash an empty script,
    # which "succeeds".
    local brew_script
    brew_script="$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" ||
      fail "Couldn't download Homebrew's installer. Check the connection, then run this again."
    /bin/bash -c "$brew_script" </dev/tty ||
      fail "Homebrew's installer stopped; its output is above. Run this again to retry."
    # Homebrew ends by asking the user to add this to .zprofile, in ZDOTDIR
    # if zsh has one.
    if [ "$(basename "${SHELL:-}")" = zsh ]; then
      local zprofile
      zprofile="$(zsh -c 'printf %s "${ZDOTDIR:-$HOME}"' 2>/dev/null)/.zprofile" || zprofile="$HOME/.zprofile"
      grep -qF 'brew shellenv' "$zprofile" 2>/dev/null ||
        printf '\n# Added by the mockingbird installer\neval "$(%s shellenv)"\n' "$brew_bin" >>"$zprofile"
    fi
  }
  if ! command -v brew >/dev/null 2>&1 && [ ! -x "$brew_bin" ]; then
    install_brew
  fi
  # Homebrew's installer leaves adding itself to PATH to the user, so a
  # Homebrew that's installed can still be missing from this shell.
  if ! command -v brew >/dev/null 2>&1 && [ -x "$brew_bin" ]; then
    eval "$("$brew_bin" shellenv)"
  fi
  command -v brew >/dev/null 2>&1 || fail "Homebrew is needed first: see https://brew.sh, then run this again."

  # Everything a step prints goes to its own log, not the terminal: steps run
  # side by side, and one shared log could push a failed step's reason out of
  # view. On a failure the end of that step's log is shown.
  local log_dir="${MOCKINGBIRD_HOME:-$HOME/.mockingbird}/logs"
  mkdir -p "$log_dir"
  # `models pull` keeps its download progress here, one line, while it runs.
  local progress="$log_dir/install-progress"
  rm -f "$log_dir"/install-*.log "$progress"
  local STEP
  quietly() { "$@" >>"$log_dir/install-$STEP.log" 2>&1 </dev/null; }
  done_() { printf '    \033[1;32m✓\033[0m %s\n' "$1"; }
  report() {
    local name
    for name in "$@"; do
      printf '\n\033[1;31merror:\033[0m %s failed. The end of %s:\n\n' "$name" "$log_dir/install-$name.log" >&2
      tail -n 20 "$log_dir/install-$name.log" >&2
    done
    exit 1
  }

  # Waits for every step running in the background, showing the download
  # progress, or else a clock, so a long step doesn't look stuck. All of them
  # finish before any failure is reported, so nothing is left writing files
  # behind a retry. Arguments are name/pid pairs.
  await() {
    local start=$SECONDS line
    if [ -t 1 ]; then
      while [ -n "$(jobs -r)" ]; do
        line="$(cat "$progress" 2>/dev/null)" || line=""
        if [ -n "$line" ]; then
          printf '\r\033[K    %s' "$line"
        else
          printf '\r\033[K    %s… %dm%02ds ' "$WORKING" $(((SECONDS - start) / 60)) $(((SECONDS - start) % 60))
        fi
        sleep 1
      done
      printf '\r\033[K'
    fi
    local failed=()
    while [ $# -gt 0 ]; do
      wait "$2" || failed+=("$1")
      shift 2
    done
    if [ ${#failed[@]} -gt 0 ]; then
      report "${failed[@]}"
    fi
  }

  # Moves a clone to the newest release tag, or to the latest main while there
  # are no releases yet. A clone with local edits is left alone, not overwritten.
  to_latest() {
    local d="$1" tag
    if [ -n "$(git -C "$d" status --porcelain --untracked-files=no)" ]; then
      fail "$d has local changes, so it wasn't updated. Commit or discard them, then run this again."
    fi
    git -C "$d" fetch --quiet --tags origin
    # Only tags on main: the release workflow refuses any other, so a tag
    # pushed on a branch was never released or checked. A tag with a "-" is a
    # prerelease, skipped unless asked for; versionsort.suffix sorts
    # v1.2.0-rc.1 below v1.2.0, so beta moves on to the release once it's out.
    tag=""
    local t
    for t in $(git -C "$d" -c versionsort.suffix=- tag --list 'v*.*.*' --sort=-v:refname); do
      case "$t" in *-*) [ "${MOCKINGBIRD_CHANNEL:-}" = beta ] || continue ;; esac
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

  # The Go command for the release a clone is on, from that release's assets
  # and checked against its checksums.txt. A clone that isn't on a release
  # tag builds it instead, if Go is installed.
  get_cli() {
    local d="$1" out="$2" tag tmp
    local asset="mockingbird-darwin-arm64"
    tag="$(git -C "$d" describe --tags --exact-match 2>/dev/null)" || tag=""
    if [ -n "$tag" ]; then
      local url="https://github.com/NirjharBhattacharjee/mockingbird/releases/download/$tag"
      tmp="$(mktemp -d)"
      if curl -fsL -o "$tmp/$asset" "$url/$asset" &&
        curl -fsL -o "$tmp/checksums.txt" "$url/checksums.txt" &&
        (cd "$tmp" && grep " $asset\$" checksums.txt | shasum -a 256 -c - >/dev/null); then
        chmod +x "$tmp/$asset"
        mv "$tmp/$asset" "$out"
      fi
      rm -rf "$tmp"
      [ -x "$out" ] && return 0
    fi
    command -v go >/dev/null 2>&1 && [ -d "$d/apps/cli" ] && (cd "$d/apps/cli" && go build -o "$out" .)
  }


  # Whatever of Bun, whisper-cpp, Ollama and ffmpeg is missing, in one brew
  # call. Homebrew checks each download against its formula's sha256, and a
  # tool already on the PATH (say, bun from bun.sh) is used as it is.
  tools() {
    local missing=() formula
    for formula in bun whisper-cpp ollama ffmpeg; do
      command -v "$formula" >/dev/null 2>&1 || brew list --formula "$formula" >/dev/null 2>&1 || missing+=("$formula")
    done
    if [ ${#missing[@]} -gt 0 ]; then
      quietly brew install "${missing[@]}"
    fi
  }

  local dir here before=""
  # Frozen, so bun.lock is never rewritten in a clone this script manages: a
  # changed lockfile would count as a local edit and block the next update.
  local lockfile="--frozen-lockfile"
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")/.." 2>/dev/null && pwd || true)"
  if [ -n "$here" ] && grep -q '"name": "mockingbird"' "$here/package.json" 2>/dev/null; then
    # A contributor's clone: whatever is checked out is what they want to run.
    dir="$here"
    lockfile=""
  else
    dir="${MOCKINGBIRD_DIR:-$HOME/mockingbird}"
    if [ -d "$dir/.git" ] && grep -q '"name": "mockingbird"' "$dir/package.json" 2>/dev/null; then
      before="$(version "$dir")"
    elif [ -e "$dir" ]; then
      fail "$dir already exists and isn't a clone of mockingbird. Set MOCKINGBIRD_DIR to use another folder."
    fi
  fi
  # The code at the latest release: a fresh clone, an update, or a
  # contributor's clone left as it is.
  get_code() {
    if [ "$dir" = "$here" ]; then
      return
    fi
    if [ -z "$before" ]; then
      quietly git clone "$repo_url" "$dir"
    fi
    quietly to_latest "$dir"
  }

  # A first install downloads about 3.6 GB of models, and the tools and code
  # take about 1 GB more. Checked before anything is downloaded, so a full disk
  # fails now with the number, not partway through a model. An update already
  # has the models, so it isn't held to this.
  local models_dir="${MOCKINGBIRD_HOME:-$HOME/.mockingbird}/models" first=""
  if [ ! -f "$models_dir/ggml-large-v3-q5_0.bin" ]; then
    first=1
    local free_gb
    free_gb=$(($(df -Pk "$HOME" | awk 'NR==2 {print $4}') / 1024 / 1024))
    if [ "$free_gb" -lt 5 ]; then
      fail "mockingbird needs about 5 GB free, and this Mac has ${free_gb} GB. Free up some space, then run this again."
    fi
  fi

  printf '\n\033[1;35m==>\033[0m \033[1mInstalling mockingbird\033[0m (details in %s)\n' "$log_dir/install-*.log"
  if [ -n "$first" ]; then
    printf '    This takes about 10 minutes, most of it downloading 3.6 GB of models.\n'
  fi

  # The tools and the code don't need each other, so they come down together.
  WORKING="tools and code"
  (STEP=tools && tools) &
  local tools_pid=$!
  (STEP=code && get_code) &
  local code_pid=$!
  await tools "$tools_pid" code "$code_pid"
  done_ "tools: Bun, whisper-cpp, Ollama, ffmpeg"
  if [ "$dir" = "$here" ]; then
    done_ "code: this clone as it is, $dir"
  elif [ -z "$before" ]; then
    done_ "code: $(version "$dir")"
  elif [ "$before" = "$(version "$dir")" ]; then
    done_ "code: $before, already up to date"
  else
    done_ "code: updated $before -> $(version "$dir")"
  fi

  WORKING="dependencies"
  (STEP=dependencies && cd "$dir" && quietly bun install $lockfile) &
  await dependencies $!
  done_ "dependencies"

  # The models (pinned and sha256-checked; see apps/daemon/src/models.ts,
  # which downloads Whisper and the cleanup model side by side) and the
  # command, again together. Anything already downloaded is skipped.
  local cli="$dir/apps/cli/mockingbird"
  rm -f "$cli"
  WORKING="models and command"
  (STEP=models && cd "$dir" && export MOCKINGBIRD_PROGRESS="$progress" &&
    quietly bun apps/daemon/src/cli.ts models pull) &
  local models_pid=$!
  (STEP=command && quietly get_cli "$dir" "$cli" || true) &
  local cli_pid=$!
  await models "$models_pid" command "$cli_pid"
  done_ "models"

  # The command is the Go binary from apps/cli, for the release this clone is
  # on. It holds no macOS permissions. The agent's runner in ~/.mockingbird/bin
  # does, so replacing the command on an update drops no Fn or typing grant.
  # Without a binary, the shim runs the engine's TypeScript CLI, as before.
  local bin_dir="$HOME/.local/bin"
  local shim="$bin_dir/mockingbird"
  local bun_bin run
  bun_bin="$(command -v bun)"
  if [ -x "$cli" ]; then
    run="exec \"$cli\""
    done_ "command: $("$cli" --version)"
  else
    run="exec \"$bun_bin\" \"$dir/apps/daemon/src/cli.ts\""
    done_ "command: the TypeScript one, no prebuilt command for this version"
  fi
  mkdir -p "$bin_dir"
  # A link left by a manual install would otherwise carry this write into
  # the binary it points at, and the shim would exec itself.
  rm -f "$shim"
  cat >"$shim" <<SHIM
#!/bin/sh
# Written by scripts/install.sh. Re-run it after moving the clone.
# The Go command finds bun on the PATH.
export PATH="$(dirname "$bun_bin"):\$PATH"
$run "\$@"
SHIM
  chmod +x "$shim"
  # A new Mac doesn't have ~/.local/bin on the PATH, so the install adds it to
  # the login shell's profile, once. This terminal keeps its old PATH, so the
  # last lines give the command's full path.
  local cmd="mockingbird" profile="" in_profile=""
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *)
      cmd="~/.local/bin/mockingbird"
      case "$(basename "${SHELL:-}")" in
        # zsh itself says where its files are: ZDOTDIR may be set in ~/.zshenv.
        zsh)
          local zdot
          zdot="$(zsh -c 'printf %s "${ZDOTDIR:-$HOME}"' 2>/dev/null)" || zdot=""
          [ -n "$zdot" ] && profile="$zdot/.zshrc"
          ;;
        # A login bash reads only the first of these that exists, so creating
        # ~/.bash_profile would hide an existing ~/.profile.
        bash)
          for profile in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
            [ -e "$profile" ] && break
          done
          [ -e "$profile" ] || profile="$HOME/.bash_profile"
          ;;
      esac
      if [ -n "$profile" ] && grep -qF '.local/bin' "$profile" 2>/dev/null; then
        in_profile=1
      elif [ -n "$profile" ] && printf '\n# Added by the mockingbird installer\nexport PATH="$HOME/.local/bin:$PATH"\n' 2>/dev/null >>"$profile"; then
        in_profile=1
        done_ "PATH: added ~/.local/bin in $profile"
      else
        printf '    \033[1;33mnote:\033[0m %s is not on your PATH. Add it to your shell profile:\n      export PATH="%s:$PATH"\n' "$bin_dir" "$bin_dir"
      fi
      ;;
  esac

  # An agent that's running is still on the old code, so restart it. One that
  # was stopped stays stopped.
  if launchctl print "gui/$(id -u)/com.mockingbird.agent" 2>/dev/null | grep -q 'state = running'; then
    STEP=restart
    quietly "$shim" restart || report restart
    done_ "restarted the running agent"
    printf '\n\033[1;32mAll set.\033[0m mockingbird is running %s.\n\n' "$(version "$dir")"
    return
  fi

  # A first install goes straight into `mockingbird setup`, which starts the
  # agent and walks through the permissions, Fn and a test dictation (#54).
  # First means the agent was never set up: `start` writes its plist and only
  # uninstall removes it, so an update of an agent the user stopped stays
  # stopped. Setup also needs the Go command and a terminal; under
  # `curl | bash` stdin is this script, so it reads the keyboard from
  # /dev/tty. Anything else (output to a file, as for a coding agent, or no Go
  # command) gets the steps below.
  local plist="$HOME/Library/LaunchAgents/com.mockingbird.agent.plist"
  if [ ! -e "$plist" ] && [ -x "$cli" ] && [ -t 1 ] && (: </dev/tty) 2>/dev/null; then
    printf '\n\033[1;32mInstalled.\033[0m Next, the permissions, the Fn key and a test dictation.\n'
    # Quitting setup early is fine and exits 0; only a setup that couldn't run fails.
    if ! "$shim" setup </dev/tty; then
      printf '\n\033[1;33mnote:\033[0m setup stopped with an error. mockingbird is installed;\n'
      printf 'run `%s setup` to try again, or `%s start` to skip it.\n' "$cmd" "$cmd"
    else
      printf '\nLater: `%s setup` goes through this again,\n' "$cmd"
      printf 'and `%s` on its own lists every command.\n' "$cmd"
    fi
    if [ -n "$in_profile" ]; then
      printf 'In a new terminal window, plain `mockingbird` works too.\n'
    fi
    printf 'To update, run the install command again.\n\n'
    return
  fi

  printf '\n\033[1;32mAll set.\033[0m Now run:\n\n'
  printf '    %s start\n\n' "$cmd"
  printf 'That runs it in the background, now and at every login. macOS will ask\n'
  printf 'for permission the first time; `%s status` says what is missing.\n' "$cmd"
  if [ -n "$in_profile" ]; then
    printf 'In a new terminal window, plain `mockingbird` works too.\n'
  fi
  printf 'To update later, run the install command again.\n\n'
}

main "$@"
