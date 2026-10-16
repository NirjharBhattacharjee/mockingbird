# mockingbird for AI clients (MCP)

`mockingbird mcp` gives an AI client, such as Claude Code, Claude Desktop or
Cursor, mockingbird's local transcription and dictionary as tools. Ask your
client to "summarise this recording" or "turn this meeting into a spec", and it
transcribes the file with mockingbird on your Mac, then does the rest with its
own model.

## Where your text goes

mockingbird itself still calls no model in the cloud and opens no port. The
server talks to the client over stdin and stdout only, and it runs only while
the client has it open. **What a tool returns goes wherever that client sends
it.** If the client is a cloud model, the transcript goes to that model's
provider, the same as if you'd pasted it into a chat. A client backed by a
local model (Ollama, for example) keeps everything on the Mac.

Nothing is exposed until you register the server with a client.

## Register it

Claude Code:

```sh
claude mcp add mockingbird -- mockingbird mcp
```

Any other client takes the same command. In a JSON config (Claude Desktop's
`claude_desktop_config.json`, Cursor's `mcp.json`):

```json
{ "mcpServers": { "mockingbird": { "command": "mockingbird", "args": ["mcp"] } } }
```

If the client can't find `mockingbird`, give the full path. A JSON config
won't expand `~` or `$(...)`, so write it out: `/Users/<you>/.local/bin/mockingbird`
after the curl install, or `/opt/homebrew/bin/mockingbird` with Homebrew.
`command -v mockingbird` prints it.

## Tools

| Tool | What it does |
|---|---|
| `transcribe(path, from, to, words)` | An audio or video file (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) as text, in lines timestamped `[mm:ss]`, with names fixed from your dictionary. Uses its own whisper-server, so dictation keeps working meanwhile. No cleanup model: the client's model does that better with a whole meeting. `from` and `to` (seconds) take one stretch of the file. `words: true` gives one line per word with its start and end, `[01:23.48-01:23.71] Catppuccin`, to cut a clip on; names are fixed one word at a time there, so a name misheard as two words stays as heard. |
| `frames(path, every)` | Stills from a video, one every `every` seconds (default 60), saved to a temp folder; returns their paths with `[mm:ss]` times, so a client that reads images can see slides and screen shares. |
| `render(path, clips, vertical, captions, out)` | Cuts `clips` (`[{ from, to }]`, in seconds) out of a video and joins them into one MP4 with ffmpeg. `vertical` crops the middle of the frame to 9:16 at 1080x1920. `captions` is SRT text the client writes, timed to the finished video. Saves to `out`, or `<name>-short-N.mp4` beside the source, and never overwrites a file. |
| `status` | Whether the background agent is running, which permissions it's missing, and whether macOS still has the Fn key. |
| `dictionary_list` | Your dictionary: the names, places and jargon mockingbird spells a particular way. |
| `dictionary_add(entry)` | Adds a word, like `mockingbird dictionary add`: `"Catppuccin"`, `"Catppuccin (a colour theme)"`, or `"cat puck => Catppuccin"`. Needs mockingbird running. |

Measured on an M3 MacBook Pro with the default `large-v3` model: a
27-minute recording took about 4½ minutes, including starting whisper-server.
Some clients cut a tool call off after a time limit; in Claude Code, raise it
with `MCP_TOOL_TIMEOUT` (milliseconds) if a long file stops partway.

## Making a short

The server also offers one prompt, `make_short`, which a client lists next to
its own commands (in Claude Code: `/mcp__mockingbird__make_short <path>`). It
tells the client's model how to use the tools together: read the transcript,
pick one to three moments of 15 to 60 seconds, get the word times around each,
cut on word boundaries, write captions timed to the result, and `render`.

mockingbird makes none of those choices. It transcribes and runs ffmpeg; which
moments are worth keeping and what the captions say are up to the client.

Captions need an ffmpeg built with libass to be drawn onto the picture.
Homebrew's `ffmpeg` isn't, so with it `render` puts them in a subtitle track
instead and writes an `.srt` beside the video, which an editor such as CapCut
can burn in. `ffmpeg -filters | grep subtitles` shows whether yours can.

On an M3, `render` took 1.3 seconds, including starting the server, to make a
9.5-second 1080x1920 short from two clips of a 1080p video.

## Without MCP

A client with a shell can already run `mockingbird transcribe <file>`, which
prints the cleaned-up text with no timestamps. The MCP server adds the
timestamps, word times, the video stills, cutting and the dictionary, and
works in clients that have no shell.

## Recording a meeting

Press Fn+R (or run `mockingbird record`) to start, and again (or
`mockingbird record stop`) to stop. The recording has both sides of a call
and is saved under `~/.mockingbird/recordings/`; hand its path to
`transcribe`.
