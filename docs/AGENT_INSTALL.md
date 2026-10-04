# Set up mockingbird with a coding agent

This page is written for an AI agent (Claude Code, Codex, Cursor, Gemini CLI,
or any agent that can run shell commands) that a person has asked to set up
mockingbird on their Mac. If you're that person, paste this into your agent:

```text
Set up mockingbird on this Mac by following
https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/docs/AGENT_INSTALL.md
```

mockingbird is local voice dictation: hold Fn, speak, let go, and the text is
typed where the cursor is. Everything runs on the Mac. The installer and the
model download are its only network use.

## Rules for the agent

- Run the steps in order. Each says how to tell whether it worked.
- Never use `sudo`. Nothing here needs it.
- Some steps only the person can do, marked **(person)**. macOS doesn't let
  any program grant itself the permissions mockingbird needs. Stop there, tell
  them exactly what to do, and wait for them to say they've done it.
- Don't change anything the person didn't ask for: not their shell profile,
  not system settings, not the code. Where a step offers a change, ask first.

## 1. Check the Mac

```sh
uname -sm
echo "ssh: ${SSH_CONNECTION:-no}"
command -v brew || ls /opt/homebrew/bin/brew
df -h "$HOME" | awk 'NR==2 {print "free:", $4}'
ls -l ~/.local/bin/mockingbird 2>/dev/null && ~/.local/bin/mockingbird status
```

- `uname -sm` must print `Darwin arm64`. Anything else isn't supported: tell
  the person mockingbird needs a Mac with Apple Silicon, and stop.
- `ssh:` must print `no`. Over SSH, `mockingbird start` can't reach the
  person's login session. Ask them to run you in a terminal on the Mac itself.
- The `brew` line must print a path. If only `/opt/homebrew/bin/brew` exists,
  Homebrew is installed but not on your PATH: start each command below with
  `eval "$(/opt/homebrew/bin/brew shellenv)" && `. If neither exists,
  **(person)** Homebrew's installer asks for their password, so ask them to
  install it from <https://brew.sh> and tell you when it's done, then check
  again.
- `free:` must be at least 6G (or 6Gi; Ti is plenty). If it's less, tell the person how much
  is free and that mockingbird needs about 6 GB, and stop.
- If the last command printed anything, mockingbird is already installed. If
  it shows `agent:  running`, go to step 5. Otherwise ask the person whether
  to update it with step 2 or just start it with step 3. Don't reinstall
  without asking: step 2 replaces `~/.local/bin/mockingbird`, including a link
  to their own copy of the code if that's what it is (`ls -l` shows the
  target). Permissions they've granted survive an update.

## 2. Install

The installer clones the code into `~/mockingbird`, installs Bun, whisper-cpp,
Ollama and ffmpeg with Homebrew, downloads the speech and cleanup models into
`~/.mockingbird`, and puts the `mockingbird` command in `~/.local/bin`. The
first run downloads about 4 GB, so it usually takes 5 to 20 minutes.

First download the installer, and check this command succeeds. If it prints
`curl: (...)`, nothing was installed: check the network and try again.

```sh
mkdir -p ~/.mockingbird && rm -f ~/.mockingbird/install.out
curl -fsSL https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/scripts/install.sh -o ~/.mockingbird/install.sh
```

It goes in the person's own folder rather than `/tmp`, where another account
on the Mac could swap the file before it runs.

Then run it in the background, so a time limit on your commands can't cut it
off. This returns at once:

```sh
nohup bash -c 'bash ~/.mockingbird/install.sh; echo "exit=$?"' > ~/.mockingbird/install.out 2>&1 &
```

Check on it every 30 to 60 seconds (wait between checks with your tool's own
wait or `sleep 30`):

```sh
tail -n 8 ~/.mockingbird/install.out
```

It has finished when the last line is `exit=` and a number. Before that it's
still working, even if a step has failed: it waits for every step to end.

- **`exit=0`:** it worked. Each step has a line starting `✓`, then `All set.`
- **Any other number:** it failed. The output names the failed step and shows
  the end of its log. Every step's full log is in
  `~/.mockingbird/logs/install-<step>.log`. See
  [If something fails](#if-something-fails), then run step 2 again: finished
  steps are skipped.
- Run `grep -A1 'note:' ~/.mockingbird/install.out`. If it says
  `~/.local/bin` isn't on the PATH, tell the person.
  They should add the `export PATH=...` line it shows to their shell profile,
  or you can, if they say so. The steps below use the full path either way.

## 3. Start it

```sh
~/.local/bin/mockingbird start
```

This runs mockingbird in the background now and at every login, then waits up
to about 15 seconds for it to report what it can do. Running it again is safe:
it restarts mockingbird and reports again. It ends with one of:

| Output contains | Next |
|---|---|
| `Fn and typing are allowed. Hold Fn anywhere and speak.` | Step 5. It only says this when the microphone works too. |
| `The agent can't use ... yet` | Step 4. It has also opened System Settings at the first permission it names. |
| `The agent hasn't reported in yet` | Wait 10 seconds, then step 5. |

## 4. Permissions **(person)**

Tell the person, keeping only the bullets for the permissions `start` named.
If `start` also printed `couldn't rename the agent for System Settings`, the
program is listed as **bun** instead of **mockingbird**: say **bun** in the
message.

> In **System Settings → Privacy & Security**:
> - **Input Monitoring**: turn on **mockingbird**. If it isn't in the list,
>   click **+**, press **Cmd+Shift+G**, paste `~/.mockingbird/bin/mockingbird`,
>   and add it.
> - **Accessibility**: the same, in the Accessibility list.
> - **Microphone**: mockingbird has just asked for the microphone, so there
>   may be a macOS pop-up on screen. Click **Allow**. If there's no pop-up,
>   or you clicked Don't Allow earlier, turn **mockingbird** on in the
>   Microphone list instead.
>
> Tell me when that's done.

These go to `~/.mockingbird/bin/mockingbird`, the program that runs in the
background, not to the terminal or to your own app.

When they say it's done, run step 3 again. macOS only reads the permissions
when mockingbird starts, and `start` restarts it and reports what it now has.
(`status` suggests `mockingbird restart` for this. That works too, but only
`start` reports back.) If it still names a permission, go through this step
once more with just that one. If it's still missing after that, stop and tell
the person which one.

The microphone check is different: mockingbird listens for a moment at
startup and reports it missing if it heard pure silence. That's usually the
permission, but a muted input or no microphone at all looks the same. If the
person says **mockingbird** is already on in the Microphone list, don't ask
again. Ask them to check **System Settings → Sound → Input** instead: a
microphone is selected, and its level moves when they speak.

## 5. Check it

```sh
~/.local/bin/mockingbird status
grep "checks: Fn" ~/.mockingbird/logs/agent.log | tail -n 1
```

- `status` must show `agent:  running (pid ...)`. Anything else is in
  [If something fails](#if-something-fails).
- The log line is what the background program can do. Its time must be
  after the `start` you ran last; if it isn't, wait 10 seconds and look
  again. It must read `checks: Fn ok, typing ok, microphone ok`. `Fn MISSING` is Input
  Monitoring and `typing MISSING` is Accessibility: back to step 4 for that
  one. `microphone SILENT` means it heard only silence, which is the
  Microphone permission or the input itself; step 4 says how to tell.
- Ignore `status`'s `this terminal:` line. It's about your shell's
  permissions, which mockingbird doesn't use.
- If `start` or `status` printed a line starting `If tapping Fn opens the
  emoji picker` or `macOS opens`, tapping Fn may open the emoji picker or
  Apple's dictation instead of dictating. Ask the person whether to bind Fn to
  dictation only, which changes a system-wide keyboard setting. If they agree,
  run `~/.local/bin/mockingbird fn`. `mockingbird fn --undo` puts it back.
- Then step 6.

## 6. Hand it over **(person)**

You can't test dictation yourself: it needs a real Fn key and a voice. Tell
the person:

> Click into any app, hold **Fn**, say something, and let go. A rising
> *tink* means it's recording, a falling *pop* means it's transcribing, and
> the text is then typed where your cursor is. A low *basso* means it heard
> you but couldn't type. Tell me if that happens.

If they report a problem, run step 5 again and read
`tail -n 50 ~/.mockingbird/logs/agent.log`. The log records what happened,
never what they said.

## If something fails

| What you see | What to do |
|---|---|
| `mockingbird needs a Mac with Apple Silicon.` | Not supported. Stop. |
| `Homebrew is needed first` | See step 1's `brew` check. |
| `... has local changes, so it wasn't updated` | The person edited `~/mockingbird`. Ask before discarding anything. Never run `git checkout` or `git reset` there on your own. |
| `error: <step> failed` | Read `~/.mockingbird/logs/install-<step>.log`. For a network error, run step 2 again. |
| `curl: (...)` when starting step 2 | The installer didn't download, so nothing ran. Check the network, then step 2 again. |
| `command not found: mockingbird` | Use `~/.local/bin/mockingbird`. |
| `agent: crashed` or `exited` in `status` | Read `tail -n 50 ~/.mockingbird/logs/agent.log`, then step 3 again. |
| Fn does nothing | Step 5's log line names what's missing. |
| Text typed twice | Something else is also running `mockingbird listen`. Close it. |

To turn it off: `~/.local/bin/mockingbird stop`. It stays off, including
after a reboot, until the next `start`.

More detail for people: [the user guide](./README.md), especially
[Permissions](./README.md#permissions) and
[Troubleshooting](./README.md#troubleshooting).
