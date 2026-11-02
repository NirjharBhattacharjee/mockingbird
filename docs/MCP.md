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
| `frames(path, every, from, to)` | Stills from a video, one every `every` seconds (default 60), saved to a temp folder; returns their paths with `[mm:ss]` times, so a client that reads images can see slides and screen shares, or where the speaker is before framing a clip. `from` and `to` (seconds) take one stretch. Each still is read by seeking to it, so a long 4K phone video takes seconds, not minutes. |
| `captions(path, clips, perCue, lit, upper)` | Word-by-word captions for the video `render` will make from `clips`, as SRT timed to the finished video: up to `perCue` words a cue (default 3), the word being said written `*like this*` (`lit`, default on), in capitals if `upper`. A new cue starts at each clip, after a sentence, after half a second's pause, or when its words span 1.2 seconds. Each clip is transcribed with two seconds either side, and a word belongs to the clip its middle falls in. |
| `render(path, clips, …)` | Cuts `clips` out of a video and joins them into one MP4 with ffmpeg; see [Render options](#render-options). Saves to `out`, or `<name>-short-N.mp4` beside the source, and never overwrites a file. |
| `motion(script, path, captions, size, duration, fps, out)` | Motion graphics written as code, drawn on the Mac with Core Graphics: see [Motion graphics](#motion-graphics). Saves to `out`, or `<name>-motion-N.mp4` beside the video or script, and never overwrites a file. |
| `status` | Whether the background agent is running, which permissions it's missing, and whether macOS still has the Fn key. |
| `dictionary_list` | Your dictionary: the names, places and jargon mockingbird spells a particular way. |
| `dictionary_add(entry)` | Adds a word, like `mockingbird dictionary add`: `"Catppuccin"`, `"Catppuccin (a colour theme)"`, or `"cat puck => Catppuccin"`. Needs mockingbird running. |

Measured on an M3 MacBook Pro with the default `large-v3` model: a
27-minute recording took about 4½ minutes, including starting whisper-server.
Some clients cut a tool call off after a time limit; in Claude Code, raise it
with `MCP_TOOL_TIMEOUT` (milliseconds) if a long file stops partway.

## Render options

| Option | What it does |
|---|---|
| `clips` | `[{ from, to, focus, zoom }]`, in seconds, kept in order. `focus` is the point to keep in frame, `{ x, y }` from 0 to 1 of the source's width and height (default the middle). `zoom` punches in on it, 1 to 4 (default 1); 1.1 to 1.2 on every other jump cut hides the cut. |
| `vertical` | Crops each clip to 9:16 around its focus, at 1080x1920. |
| `split` | `{ top, bottom }`: two areas of the source, each `{ x, y, w, h }` from 0 to 1, each scaled to fill half of a 1080x1920 frame. This is for a screen recording with a webcam in a corner: the screen on top, the webcam below. Clips' focus and zoom don't apply. |
| `captions` | SRT text timed to the finished video (from `captions`, or written by the client), drawn onto the picture. A word written `*like this*` is drawn yellow. |
| `captionsY` | Where the middle of the captions sits, 0 to 1 of the height (default 0.7). Use 0.5 for a split, so they sit on the seam. |
| `texts` | `[{ text, from, to, y }]`: more text drawn the same way over a stretch of the finished video, such as a title for the first seconds. |
| `inserts` | `[{ path, from, to }]`: pictures or videos laid over the whole frame for a stretch of the finished video (b-roll) while the speech carries on. They sit under the captions and are scaled to fill. A video's own sound isn't used. |
| `audio` | `[{ path, at, volume, loop, duck }]`: sounds mixed under the speech from `at` seconds in. Music is `loop: true, duck: true` at about 0.15: it repeats to the end and drops while someone speaks (auto-editor's defaults: 85% down once the speech is above 4%, in 100 ms, back up in 500 ms). A sound effect is a path and an `at`. |

The sound always comes out at −14 LUFS, about the loudness Shorts, Reels and TikTok play at, so a quiet phone recording doesn't sound weak next to everything else in the feed.

## Making a short

The server also offers one prompt, `make_short`, which a client lists next to
its own commands (in Claude Code: `/mcp__mockingbird__make_short <path>`). It
tells the client's model how to use the tools together: read the transcript,
pick one to three moments of 15 to 60 seconds, get the word times around each,
cut on word boundaries, make word-by-word captions with `captions`, frame the
speaker with `frames`, and `render`.

For the editing itself (hooks, pacing, captions, b-roll, sound), the
[mockingbird-studio](https://github.com/NirjharBhattacharjee/mockingbird-studio)
plugin for Claude Code holds the know-how as skills and uses these tools.

mockingbird makes none of those choices. It transcribes and runs ffmpeg; which
moments are worth keeping, where to zoom, and what the captions say are up to
the client.

Captions are drawn onto the picture: white bold text with a black outline,
centred a little below the middle (or at `captionsY`), wrapped to fit, with
words marked `*like this*` in yellow. mockingbird draws each cue
as an image with macOS's own text engine (Core Text) and ffmpeg lays it over
the video, so this works with Homebrew's `ffmpeg`, which has no libass. Emoji
and non-Latin scripts come out as macOS draws them anywhere else. If the
images can't be drawn, `render` falls back to ffmpeg's `subtitles` filter
when your ffmpeg has libass (at `captionsY` too, and over any inserts), and otherwise to a subtitle track plus an `.srt`
beside the video, which an editor such as CapCut can burn in.

On an M3, `render` took 1.3 seconds, including starting the server, to make a
9.5-second 1080x1920 short from two clips of a 1080p video. A 10-second split
short from a 60 fps screen recording, with word-by-word captions, a title, a
picture insert, ducked music and a sound effect, took 2.8 seconds; 9 seconds
cut from a 4K HEVC phone video took 11.5. `captions` for five clips took about
5 seconds, most of it starting whisper-server.

## Motion graphics

`motion` runs a script the client writes and draws what it says, frame by
frame. It's mockingbird's answer to Remotion and HyperFrames, without a
browser: the script gets the browser's Canvas 2D API, which mockingbird
implements over macOS's own Core Graphics and Core Text, and ffmpeg encodes
the frames.

```ts
// title.ts
export default function draw(ctx, t, m) {
  const pop = m.spring(t, { from: 0.6, to: 1, start: 0.1 });
  ctx.translate(m.width / 2, 330);
  ctx.scale(pop, pop);
  ctx.fillStyle = "#FFD500";
  ctx.roundRect(-430, -95, 860, 190, 36);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.font = "900 92px SF Pro";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("3 MISTAKES", 0, 0);
}
```

- **The script** is one `.ts` or `.js` file, with no imports of its own. Its
  default export is called with the canvas context, the time `t` in seconds,
  and `m`. Each call runs it in a new process, so edit it and run `motion`
  again.
- **Over a video** (`path`, usually `render`'s output), each frame of the
  video is drawn first, its sound is kept, and the frame is also `m.video`:
  draw it again scaled and moved to zoom or pan. Without `path`, give `size`
  (default `1080x1920`) and `duration`; each frame starts transparent, which
  comes out black.
- **`m`** has `width`, `height`, `fps`, `duration`, `frame`, `video`,
  `cues` (from `captions`, as `{ start, end, text }` timed to the video),
  `image(path)` for a PNG, JPEG or HEIC (read once), and the timing helpers:
  `interpolate(t, [t0, t1, …], [v0, v1, …], easing)`, held at the ends;
  `spring(t, { from, to, start, stiffness, damping, mass })`, which
  overshoots a little and settles in about a second with the defaults; and
  `ease`: `linear`, `in`, `out`, `inOut`, `back`, and `bezier(x1, y1, x2, y2)`
  like CSS's `cubic-bezier`.
- **The canvas** has paths (`moveTo`, `lineTo`, curves, `arc`, `arcTo`,
  `ellipse`, `rect`, `roundRect`), `fill`, `stroke`, `clip`, `fillRect`,
  `strokeRect`, `clearRect`, linear and radial gradients, shadows,
  `globalAlpha`, `globalCompositeOperation`, `save`/`restore`, `translate`,
  `rotate`, `scale`, `transform`, `setTransform`, `setLineDash` and
  `lineDashOffset` (for lines that draw themselves on), `fillText`,
  `strokeText`, `measureText`, and `drawImage`. Fonts are written as in CSS,
  `"italic 900 96px Avenir Next"`; `SF Pro` and `system-ui` are the system
  font, at any weight. A family that isn't installed is an error when
  `ctx.font` is set, not a silent swap to Helvetica; list fallbacks as CSS
  does (`"40px SF Mono, Menlo"`) and the first installed one is used.
  `strokeText` with a gradient outlines the letters. There's no DOM or pixel
  access.
- **`Path2D`** is there as a global, as in a browser: build a path once and
  draw it with `ctx.fill(path, rule)`, `ctx.stroke(path)` or `ctx.clip(path)`,
  under whatever transform is current then. `new Path2D("M12 21.35 …")` takes
  SVG path data, so an icon's `d` from an SVG file draws as it is; `addPath`
  adds one path to another, with a transform.
- **`ctx.filter`** takes CSS filter functions, chained: `blur()`,
  `brightness()`, `contrast()`, `drop-shadow()`, `grayscale()`,
  `hue-rotate()`, `invert()`, `opacity()`, `saturate()` and `sepia()`, e.g.
  `"blur(12px) brightness(150%)"` for a glow behind a title. As in a browser,
  each thing drawn is filtered on its own, then the clip, shadow,
  `globalAlpha` and blend apply. `url()` isn't supported, since there's no SVG
  document. The pixel work runs in macOS's Accelerate framework (vImage).
- **Sound** comes from the script too:
  `export const audio = [{ path: "whoosh.wav", at: 1.2 }]` beside `draw`, with
  `volume`, `loop` and `duck` as `render`'s `audio` takes them, or
  `export function audio(m)` returning that list from `m`'s `width`,
  `height`, `fps`, `duration` and `cues`, to put a pop on every caption.
  Paths are from the script's folder. The sounds are mixed under the video's
  own sound, ducked under speech if asked, and the result comes out at
  −14 LUFS.
- **Errors** say when they happened: `draw failed at 2.40 s (frame 72): …`,
  and nothing is saved. `draw` must return before the next frame, so an
  `async` one is refused. `duration` is at most two hours.

It needs a Mac with Apple silicon. On an M3, 6 seconds of 1080x1920 over a
short, with a spring title, a zoom, captions that pop in and a progress bar,
took 3.8 seconds: about 47 frames a second, counting decoding, drawing and
encoding. Each call runs the script in its own process under macOS's sandbox
with the network denied, so it can read and write files but can't reach the
internet; see
[SECURITY_PRIVACY.md §6](./SECURITY_PRIVACY.md#6-process--trust-boundaries).

## Without MCP

A client with a shell can already run `mockingbird transcribe <file>`, which
prints the cleaned-up text with no timestamps. The MCP server adds the
timestamps, word times, the video stills, cutting and the dictionary, and
works in clients that have no shell.

## Recording a meeting

Press Fn+R (or run `mockingbird record`) to start, and again (or
`mockingbird record stop`) to stop. The recording is saved under
`~/.mockingbird/recordings/`; hand its path to `transcribe`. It has both
sides of a call when system audio starts, and only your microphone when it
doesn't: the log says `recording to … , with system audio` for the first.
