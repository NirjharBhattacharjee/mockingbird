# mockingbird for AI clients (MCP)

`mockingbird mcp` gives an AI agent, such as Claude Code, Codex, Cursor or
Gemini CLI, mockingbird's video editing tools: transcription with word times,
stills, word-by-word captions, cutting and framing, motion graphics, and a
dictionary of names. Ask your agent to "cut three shorts from this talk", and
it reads the footage with these tools on your computer, decides the edit with
its own model, and renders it here.

## Where your text goes

mockingbird itself still calls no model in the cloud and opens no port. The
server talks to the client over stdin and stdout only, and it runs only while
the client has it open. **What a tool returns goes wherever that client sends
it.** If the client is a cloud model, the transcript goes to that model's
provider, the same as if you'd pasted it into a chat. A client backed by a
local model (Ollama, for example) keeps everything on the Mac.

Nothing is exposed until you register the server with a client.

## Register it

`mockingbird setup` does this for Claude Code, Cursor, Codex, Gemini CLI and
VS Code, after asking. By hand, Claude Code:

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
| `transcribe(path, from, to, words, model, language)` | An audio or video file (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) as text, in lines timestamped `[mm:ss]`, with names fixed from your dictionary (a `heard => term` entry first, then anything that sounds like a term). Each call starts its own whisper-server, so two can run at once. The client's model does any cleanup or summarising. `from` and `to` (seconds) take one stretch of the file. `words: true` gives one line per word with its start and end, `[01:23.48-01:23.71] Catppuccin`, to cut a clip on; names are fixed one word at a time there, so a name misheard as two words stays as heard. `model` (a file in `models/`) and `language` (a Whisper code, or `auto`) pick the model and language for this call only; given neither, with the language on `auto` and a model mapped to a language (`models use --language`), it detects the language from the first speech and uses that model. The first line then names the language and model. |
| `transcribe(path, from, to, words)` | An audio or video file (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) as text, in lines timestamped `[mm:ss]`, with names fixed from your dictionary (a `heard => term` entry first, then anything that sounds like a term). Each call starts its own whisper-server, so two can run at once. The client's model does any cleanup or summarising. `from` and `to` (seconds) take one stretch of the file. `words: true` gives one line per word with its start and end, `[01:23.48-01:23.71] Catppuccin`, to cut a clip on; names are fixed one word at a time there, so a name misheard as two words stays as heard. |
| `audio_stats(path, from, to)` | What a file's sound measures, since the agent can't listen: see [Measuring sound](#measuring-sound). |
| `frames(path, every, from, to)` | Stills from a video, one every `every` seconds (default 60), saved to a temp folder; returns their paths with `[mm:ss]` times, so a client that reads images can see slides and screen shares, or where the speaker is before framing a clip. `from` and `to` (seconds) take one stretch. Each still is read by seeking to it, so a long 4K phone video takes seconds, not minutes. |
| `captions(path, clips, perCue, lit, upper, model, language)` | Word-by-word captions for the video `render` will make from `clips`, as SRT timed to the finished video: up to `perCue` words a cue (default 3), the word being said written `*like this*` (`lit`, default on), in capitals if `upper`. A new cue starts at each clip, after a sentence, after half a second's pause, or when its words span 1.2 seconds. Each clip is transcribed with two seconds either side, clips whose padded stretches overlap are transcribed together as one, and a word belongs to the clip its middle falls in. `model` and `language` work as in `transcribe`; detection listens to the first clip. |
| `edit(project, ops)` | Changes a project file, an edit kept between calls; see [Projects](#projects). Applies `ops` in order, all of them or none, saves the file, and returns an outline of the cut. Makes the file if it isn't there; with no ops it only reads it. |
| `render(project)` or `render(path, clips, …)` | Renders a project, or cuts `clips` out of one video and joins them, into one MP4 with ffmpeg; see [Render options](#render-options). Saves to `out`, or `<name>-render-N.mp4` beside the project (`<name>-short-N.mp4` beside the source), and never overwrites a file. |
| `motion(script, path, captions, size, duration, fps, out)` | Motion graphics written as code, drawn on the Mac with Core Graphics: see [Motion graphics](#motion-graphics). Saves to `out`, or `<name>-motion-N.mp4` beside the video or script, and never overwrites a file. |
| `captions(path, clips, perCue, lit, upper)` | Word-by-word captions for the video `render` will make from `clips`, as SRT timed to the finished video: up to `perCue` words a cue (default 3), the word being said written `*like this*` (`lit`, default on), in capitals if `upper`. A new cue starts at each clip, after a sentence, after half a second's pause, or when its words span 1.2 seconds. Each clip is transcribed with two seconds either side, clips whose padded stretches overlap are transcribed together as one, and a word belongs to the clip its middle falls in. |
| `render(path, clips, …)` | Cuts `clips` out of a video and joins them into one MP4 with ffmpeg; see [Render options](#render-options). Saves to `out`, or `<name>-short-N.mp4` beside the source, and never overwrites a file. |
| `motion(script, path, captions, size, duration, fps, out)` | Motion graphics written as code: an HTML page rendered in a pinned headless Chrome; see [Motion graphics](#motion-graphics). Saves to `out`, or `<name>-motion-N.mp4` beside the video or script, and never overwrites a file. |
| `motion(script, path, captions, size, duration, fps, out)` | Motion graphics written as code: an HTML page rendered in a pinned headless Chrome, or a canvas script drawn with Core Graphics; see [Motion graphics](#motion-graphics). Saves to `out`, or `<name>-motion-N.mp4` beside the video or script, and never overwrites a file. |
| `music(script, duration, out, tempo, key, energy, seed)` | Background music written as code: a generator module played into Web Audio's `OfflineAudioContext` in the pinned headless Chrome, saved as a WAV at −14 LUFS for `render`'s `audio`; see [Music](#music). Never overwrites a file. |
| `guide(topic)` | A playbook for one job, from [`plugin/`](../plugin/README.md): `viral-short`, `long-form`, `hooks`, `retention-editing`, `captions`, `motion-graphics`, `style-match`, or `reviewer` (the checks a finished video has to pass). It starts with the folder holding the playbook's scripts, kit and templates. |
| `status` | Whether mockingbird is ready: the transcription model in use, the speech detection model, ffmpeg, whisper-server, the Chrome that `motion` renders HTML in, and how many words the dictionary has. |
| `dictionary_list` | Your dictionary: the names, places and jargon mockingbird spells a particular way. |
| `dictionary_add(entry)` | Adds a word, like `mockingbird dictionary add`: `"Catppuccin"`, `"Catppuccin (a colour theme)"`, or `"cat puck => Catppuccin"`. |

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

The sound comes out at −14 LUFS (within about half a dB), the loudness Shorts, Reels, TikTok and YouTube play at, with peaks under −1.5 dBTP, so a quiet phone recording doesn't sound weak next to everything else in the feed. The sound is measured, measured again through the peak limiter, and the gain corrected once; a single pass of ffmpeg's `loudnorm` fell 1 to 2 dB short on quiet recordings with loud peaks (#127). The gain stops at +30 dB, so a recording quieter than −44 LUFS comes out under −14, and silence is left as it is.

## Projects

A project file (`project.json`) holds one edit, so it isn't re-sent on every
call and changing the cut doesn't break the timing of what's laid over it
(#148). The agent changes it with `edit`, or by hand: it's plain JSON.

```json
{
  "version": 1,
  "size": "1080x1920",
  "fps": 30,
  "captions": { "perCue": 3 },
  "clips": [
    { "id": "c1", "path": "talk.mp4", "from": 22, "to": 26 },
    { "id": "c2", "path": "IMG_5921.MOV", "from": 63, "to": 69, "zoom": 1.1 }
  ],
  "texts": [{ "id": "t1", "text": "The *phone* clip", "clip": "c2", "from": 0.2, "to": 2, "y": 0.2 }],
  "inserts": [],
  "audio": [
    { "id": "a1", "path": "whoosh.wav", "clip": "c2", "at": 0, "volume": 0.8 },
    { "id": "a2", "path": "music.m4a", "at": 0, "volume": 0.15, "loop": true, "duck": true }
  ]
}
```

- **`clips`** is the main track: the clips play in order with no gaps. A
  clip's `from`/`to` are seconds in its own source, as `transcribe` gives
  them, and each clip can come from a different file. Every clip is cropped
  to the project's shape around its `focus`, punched in by its `zoom`,
  scaled to `size` and set to `fps` (defaults: the first clip's source), so
  a 16:9 talk and a portrait phone clip join in one 1080x1920 video. A
  source with no sound plays silence.
- **`texts`, `inserts` and `audio`** take the options `render`'s do. With
  `clip`, their times are seconds from that clip's start in the finished
  video, so they move with it when clips before it change; without, from
  the start of the video. One can run past the end of its clip, over the
  clips after it, like a title held across a jump cut; a `split` leaves an
  item that crosses it on the first half, still running on.
- **`captions`** makes word-by-word captions for the cut as it is when it's
  rendered, as the `captions` tool does: `perCue`, `lit`, `upper`, and `y`
  (where their middle sits). Leave it out, or `null`, for none.
- **`split`** is `render`'s split; its clips are brought to the first
  clip's size first. A split always comes out 1080x1920, so `size` is that
  or left out.
- Paths are absolute, or relative to the project file's folder.

`edit`'s ops:

| Op | What it does |
|---|---|
| `{op: "add", type: "clip", path, from, to, focus?, zoom?, index?}` | A clip on the main track, at `index` (default the end). |
| `{op: "add", type: "text" \| "insert" \| "audio", …}` | A text, picture or video, or sound, with the fields above. |
| `{op: "remove", id}` | Removes an item. A clip takes what's on it with it, and the cut closes up. |
| `{op: "split", id, at}` | Splits a clip in two at `at` seconds in its source. What starts on the second half moves to the new clip. |
| `{op: "trim", id, from?, to?}` | Changes a clip's source times. What's on it moves with the picture: trimming 2 s off the start moves its texts 2 s earlier, and drops any that were only on what's gone. |
| `{op: "move", id, index}` | Moves a clip to another place in the cut. |
| `{op: "set", id?, …fields}` | Sets fields of an item (`null` clears one), or without `id` the project's `size`, `fps`, `split` and `captions`. Unlike `trim`, setting a clip's `from`/`to` leaves what's on it where it is. |

New items get ids like `c1`, `t1`, `b1` and `a1` unless given one. A field
the project doesn't have is an error, not ignored, so a misspelling is
caught. The outline `edit` returns lists each clip at its place in the
finished video, with what's on it under it:

```
two.json: 1080x1920, 30 fps, 0:15.50, captions on (3 a cue)
c4  0:00.00-0:04.00  talk.mp4 22-26
c2  0:04.00-0:10.00  IMG_5921.MOV 63-69  zoom 1.1
    t1  0:04.20-0:06.00  text "The *phone* clip" y 0.2
    a1  0:04.00  audio whoosh.wav volume 0.8
c3  0:10.00-0:15.50  talk.mp4 40-45.5
    t2  0:10.00-0:11.50  text "Back to the *talk*" y 0.2
a2  0:00.00  audio music.m4a volume 0.15 loop duck
```

A project renders to the same video the same edit gives as `render`'s
parameters: on a 17.5 s vertical edit of three clips with a title and
ducked music, every frame matched and both came out at the same loudness.
A 15.5 s project joining a 1080p60 screen recording and a 4K HEVC portrait
phone video, with captions, rendered in 17.3 s on an M3, most of it hearing
the clips for the captions; the phone video is 5 GB.

## Making a short

The server also offers one prompt, `make_short`, which a client lists next to
its own commands (in Claude Code: `/mcp__mockingbird__make_short <path>`). It
tells the client's model how to use the tools together: read the transcript,
pick one to three moments of 15 to 60 seconds, get the word times around each,
cut on word boundaries, make word-by-word captions with `captions`, frame the
speaker with `frames`, and `render`.

For the editing itself (hooks, pacing, captions, b-roll, sound), call
`guide`. The server's instructions, sent when a client connects, tell its
model which topic fits which job. Claude Code can load the same playbooks as
skills by installing the plugin in [`plugin/`](../plugin/README.md); then it
doesn't need `guide`.

mockingbird makes none of those choices. It transcribes and runs ffmpeg; which
moments are worth keeping, where to zoom, and what the captions say are up to
the client.

Captions are drawn onto the picture: white bold text with a black outline,
centred a little below the middle (or at `captionsY`), wrapped to fit, with
words marked `*like this*` in yellow. In a tall video the text is 7.5% of
the width, as Shorts captions are; in a wide one it's 5% of the height and
wraps at 60% of the width, as subtitles do, clear of a webcam in a corner. mockingbird draws each cue
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

## Measuring sound

`audio_stats` gives an agent numbers in place of listening. On a file, or
one stretch of it with `from` and `to`, it reports:

- **Loudness** from ffmpeg's `ebur128`: integrated LUFS (platforms play
  everything at about −14), loudness range, true peak (above −1 dBTP a
  platform's encoder may clip it) and sample peak (at full scale, it's
  clipped).
- **Noise floor**, the level of the quietest tenth of 400 ms windows. Under
  −60 dBFS is clean; hiss, hum and room tone raise it.
- **Speech and the rest**, with Silero finding the speech (its padded
  segments merged, so no sample counts twice): how much of it is
  speech and at what level, the level between phrases and how far under the
  voice that is, and how much of the energy between phrases is in 1 to
  4 kHz, the band speech needs. Music under speech usually sits 18 to 24 dB
  under the voice. Between phrases is where music isn't ducked, so the real
  gap under words is at least this big. Without the VAD model this part is
  left out.
- **The beat**: tempo, how far apart beats are and where the first one is,
  when there's a steady one, from the autocorrelation of onset strength.
  Speech over music hides its beat, so measure the music file itself. One
  tempo for the whole track: a track that speeds up or slows down gets the
  average.
- **Sections**, where the level changes by 4 dB or more for at least 4
  seconds on both sides: music dropping out, a chorus starting. In a file
  that's mostly speech the level follows the speaker, so they're left out
  there; measure the music file.

On a 13.5 s file of speech with a 96 BPM kick mixed 20 dB under it, it
reported 19.1 dB under the voice; on the kick alone, 96.0 BPM and clipping.

## Motion graphics

`motion` renders motion graphics the client writes as code, frame by frame,
and ffmpeg encodes the frames. It's mockingbird's answer to Remotion and
HyperFrames. `script` is an HTML page, rendered in a pinned headless Chrome.
(Until #169, `motion` also drew `.ts`/`.js` canvas scripts with Core
Graphics; a canvas script becomes a page with a `<canvas>`, and the
motion-graphics kit's `page()` does that wrapping.)

### HTML pages

```html
<!-- title.html -->
<style>
  body { margin: 0; font-family: system-ui; }
  .title {
    position: absolute; left: 140px; top: 235px; width: 800px; height: 190px;
    display: grid; place-items: center; border-radius: 36px;
    background: #FFD500; color: #111; font-weight: 900; font-size: 92px;
    animation: pop 0.9s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }
</style>
<div class="title">3 MISTAKES</div>
<script>mockingbird.audio = [{ path: "whoosh.wav", at: 0.1 }];</script>
```

- **Chrome** is chrome-headless-shell, one pinned version, so a page renders
  the same on every Mac. `mockingbird models pull chrome` downloads it
  (about 100 MB) into `~/.mockingbird/bin/` and checks its sha256;
  `MOCKINGBIRD_CHROME=/path` uses another build instead. Without either,
  `motion` says so and does nothing.
- **The page** is the size of the video, with a transparent background.
  Anything Chrome draws works: CSS, SVG, gradients, blend modes, filters,
  fonts installed on the Mac or loaded with `@font-face`, images by relative
  path. Without `path`, a transparent page comes out over black; with
  `path`, it's laid over each frame of that video, whose sound is kept.
- **Time.** For the frame at `t` seconds, mockingbird sets every CSS
  animation, transition and Web Animation to `t`, runs the
  `requestAnimationFrame` callbacks with `performance.now()` and
  `Date.now()` frozen at `t`, and calls `mockingbird.draw(t, m)` if the page
  set one, waiting for it if it returns a promise. Animations in the
  stylesheet start at 0, so `animation-delay` times them; one that starts
  later, say when `draw` adds a class, runs from the frame it started on.
  `setTimeout` runs in real time, so nothing should be timed with it.
  `Math.random` is seeded, so a page renders the same every time.
- **Drawing the video.** With `path`, a page that sets
  `mockingbird.drawVideo = true` as it loads isn't laid over the video:
  it gets each of the video's frames as `m.video`, an `ImageBitmap`, before
  `draw` runs, and draws the whole picture itself. Several tabs draw at
  once, and each also steps through the frames other tabs capture, so its
  page sees every time; on those steps `m.video` is a blank picture, so no draw sees a
  frame ahead of its own. That's how a page zooms,
  shakes or cuts between framings of the video, puts it in a
  picture-in-picture, or blurs it behind a glass card:
  `ctx.drawImage(m.video, …)` on a `<canvas>`. ffmpeg decodes the frames
  and hands them over as JPEGs (quality 2). On an M3, 150 frames at
  1080x1920 took 2.8 to 2.9 s this way against 2.0 s laid over the video.
  A `<video>` element seeking frame by frame took about 290 ms a frame, so
  the engine doesn't use one.
- **`mockingbird`** is a global set before the page's own scripts run, and
  `draw`'s `m`: `width`, `height`, `fps`, `duration`, `frame`, `video` (with
  `drawVideo`) and `cues` (from
  `captions`, as `{ start, end, text }`). A page can build its captions from
  `cues` as it loads.
- **Sound:** `mockingbird.audio = [{ path, at, volume, loop, duck }]`, paths
  from the page's folder, mixed in as `render`'s `audio` is: from `at`
  seconds, at `volume`, repeated with `loop`, dropped while the video's
  speech plays with `duck`, and the whole sound brought to −14 LUFS.
- **Errors** say when they happened: `the page failed by 2.40 s (frame 72):
  …`, or that it failed while loading, and nothing is saved. An uncaught
  error or rejected promise fails the render, and so does a script, image
  or stylesheet that doesn't load (`couldn't load file:///…/logo.png`).
  Pages can share code with `<script type="module">` and relative imports.
- **Speed.** Several tabs capture frames at once, one per core up to 8. On
  an 8-core M3, 5 seconds of a title over a 1080x1920 video at 30 fps took
  2.2 to 2.6 seconds, with the sound mixed and levelled. The whole motion
  pass of a 6:28 1080p30 long-form edit took 542 s, against 777.5 s on the
  Canvas engine this replaced. The first render after a pull is slower
  (5.7 s) while macOS checks the new Chrome.
- **No network.** Chrome runs in a process under macOS's sandbox with the
  network denied, so a page can't fetch anything from the internet. Chrome's own
  sandbox can't run inside that one, so it's off.

### Canvas scripts

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

## Music

`music` makes background music from code, so there are no samples to
license. `script` is a generator, a JavaScript module:

```js
// drone.js
export default function (ctx, { duration, tempo = 80, key, energy, seed }) {
  const o = ctx.createOscillator();
  o.frequency.value = 110;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.3, 2);
  o.connect(g).connect(ctx.destination);
  o.start(0);
}
```

- **`ctx`** is an `OfflineAudioContext`, stereo at 48 kHz, as long as
  `duration`. The generator schedules its sound on it (oscillators, filters,
  gains, buffers it fills, convolvers, compressors) and returns, or resolves
  once it has; Chrome then renders the whole track at once. 60 s of the
  plugin's lo-fi generator takes about 6 s, most of it starting Chrome and
  levelling.
- **The second argument** has `duration`, `sampleRate`, `seed`, and the
  `tempo`, `key` and `energy` the call gave, for the generator to read.
  `energy` is 0 to 1, or a curve of `[seconds, level]` points, so the music
  can build and drop with the edit's sections.
- **The same arguments make the same track.** `Math.random` is seeded from
  `seed` (default 1), so a generator can use it freely, and another seed
  makes a variation. Not the same bytes, though: Chrome adds up a node's
  inputs in an order that changes between runs, so the float rounding
  differs in the last bits (at most about 6e-8 before levelling, a few steps
  of 32768 in the WAV), never audibly.
- **The WAV** is 16-bit stereo at 48 kHz, brought to −14 LUFS with its peaks
  held under −1.5 dBTP, like everything mockingbird makes. Under speech,
  give it to `render` as `{ path, volume: 0.15, loop: true, duck: true }`.
- It runs like a `motion` page: in Chrome, started from a process under
  macOS's sandbox with the network denied.

The plugin's generators are in `plugin/skills/music/generators/`, with the
instruments they share in `lib.js`. Today that's `lofi.js`: swung drums,
electric-piano seventh chords, a bass, tape flutter and vinyl crackle;
energy adds the drums at 0.25, the snare and bass at 0.45, and a melody
at 0.7.

## Without MCP

An agent with a shell can run `mockingbird transcribe <file>` (with
`--words`, `--from` and `--to`, the same as the tool) and `mockingbird
dictionary`. The rest of the tools are MCP only for now.
