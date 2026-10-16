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
| `transcribe(path)` | An audio or video file (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) as text, in lines timestamped `[mm:ss]`, with names fixed from your dictionary. Uses its own whisper-server, so dictation keeps working meanwhile. No cleanup model: the client's model does that better with a whole meeting. |
| `frames(path, every)` | Stills from a video, one every `every` seconds (default 60), saved to a temp folder; returns their paths with `[mm:ss]` times, so a client that reads images can see slides and screen shares. |
| `status` | Whether the background agent is running, which permissions it's missing, and whether macOS still has the Fn key. |
| `dictionary_list` | Your dictionary: the names, places and jargon mockingbird spells a particular way. |
| `dictionary_add(entry)` | Adds a word, like `mockingbird dictionary add`: `"Catppuccin"`, `"Catppuccin (a colour theme)"`, or `"cat puck => Catppuccin"`. Needs mockingbird running. |

Measured on an M3 MacBook Pro with the default `large-v3` model: a
27-minute recording took about 4½ minutes, including starting whisper-server.
Some clients cut a tool call off after a time limit; in Claude Code, raise it
with `MCP_TOOL_TIMEOUT` (milliseconds) if a long file stops partway.

## Without MCP

A client with a shell can already run `mockingbird transcribe <file>`, which
prints the cleaned-up text with no timestamps. The MCP server adds the
timestamps, the video stills and the dictionary, and works in clients that
have no shell.

## Not yet

Recording a meeting with mockingbird itself (Fn+R, #89), and capturing the
other side of a call (system audio, #90).
