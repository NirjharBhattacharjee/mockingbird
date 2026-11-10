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
| `transcribe(project)` | The words in a project's cut, clip by clip, each line at its time in the finished video: the edit as text, to choose what `cut_words` cuts. See [Text-based editing](#text-based-editing). |
| `transcribe(path, from, to, words, model, language)` | An audio or video file (anything ffmpeg reads: m4a, mp3, wav, mp4, mov, mkv) as text, in lines timestamped `[mm:ss]`, with names fixed from your dictionary (a `heard => term` entry first, then anything that sounds like a term). Each call starts its own whisper-server, so two can run at once. The client's model does any cleanup or summarising. `from` and `to` (seconds) take one stretch of the file. `words: true` gives one line per word with its start and end, `[01:23.48-01:23.71] Catppuccin`, to cut a clip on; names are fixed one word at a time there, so a name misheard as two words stays as heard. `model` (a file in `models/`) and `language` (a Whisper code, or `auto`) pick the model and language for this call only; given neither, with the language on `auto` and a model mapped to a language (`models use --language`), it detects the language from the first speech and uses that model. The first line then names the language and model. |
| `audio_stats(path, from, to)` | What a file's sound measures, since the agent can't listen: see [Measuring sound](#measuring-sound). |
| `scenes(path, from, to, threshold)` | The shot changes in a video, from ffmpeg's `scdet` over frames shrunk to 180 lines: each one's `[mm:ss.cc]` time and how big a change it is (0 to 100), and cuts a minute and seconds a shot. `threshold` (default 10) is how big a change counts. It finds changes of shot, such as a cut to b-roll, a new slide or another camera, not jump cuts within one shot: in the first minute of the v2 edit, the two cuts that changed the framing scored 5.9 and 7.5, and eight jump cuts scored under 1 or not at all, below ordinary movement. Decoded with the hardware where there's a decoder: a minute of 4K HEVC phone video took 21.6 s, against 165.6 s in software; a 4-minute 1080p60 screen recording took 29.5 s. |
| `frames(path, every, from, to)` | Stills from a video, one every `every` seconds (default 60), saved to a temp folder; returns their paths with `[mm:ss]` times, so a client that reads images can see slides and screen shares, or where the speaker is before framing a clip. `from` and `to` (seconds) take one stretch. Each still is read by seeking to it, so a long 4K phone video takes seconds, not minutes. |
| `pauses(path, from, to, noise, shortest, minPause, margin)` | The pauses in a file's sound (ffmpeg's `silencedetect`, quieter than `noise` dB, default −35, for at least `shortest` s, default 0.25), one `start end length` line each, then `render`'s `clips` as JSON: what's between pauses of at least `minPause` s (default 0.4), `margin` s (default 0.15) kept into each, a stretch of 0.3 s or less joined to the next. |
| `measure(path)` | A finished video's picture size (WxH), length, integrated loudness and true peak; its cuts come from `scenes`. |
| `captions(path, clips, perCue, lit, upper, model, language)` | Word-by-word captions for the video `render` will make from `clips`, as SRT timed to the finished video: up to `perCue` words a cue (default 3), the word being said written `*like this*` (`lit`, default on), in capitals if `upper`. A new cue starts at each clip, after a sentence, after half a second's pause, or when its words span 1.2 seconds. Each clip is transcribed with two seconds either side, clips whose padded stretches overlap are transcribed together as one, and a word belongs to the clip its middle falls in. `model` and `language` work as in `transcribe`; detection listens to the first clip. |
| `edit(project, ops)` | Changes a project file, an edit kept between calls; see [Projects](#projects). Applies `ops` in order, all of them or none, saves the file, and returns an outline of the cut. Makes the file if it isn't there; with no ops it only reads it. |
| `render(project)` or `render(path, clips, …)` | Renders a project, or cuts `clips` out of one video and joins them, into one MP4 with ffmpeg; see [Render options](#render-options). Saves to `out`, or `<name>-render-N.mp4` beside the project (`<name>-short-N.mp4` beside the source), and never overwrites a file. |
| `motion(script, path, captions, size, duration, fps, out)` | Motion graphics written as code: an HTML page rendered in a pinned headless Chrome; see [Motion graphics](#motion-graphics). Saves to `out`, or `<name>-motion-N.mp4` beside the video or script, and never overwrites a file. |
| `music(script, duration, out, tempo, key, energy, seed)` | Background music written as code: a generator module played into Web Audio's `OfflineAudioContext` in the pinned headless Chrome, saved as a WAV at −14 LUFS for `render`'s `audio`; see [Music](#music). Never overwrites a file. |
| `guide(topic)` | A playbook for one job, from [`plugin/`](../plugin/README.md): `viral-short`, `long-form`, `hooks`, `retention-editing`, `captions`, `motion-graphics`, `music`, `style-match`, or `reviewer` (the checks a finished video has to pass). It starts with the folder holding the playbook's scripts, kit and templates. |
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
| `{op: "add", type: "clip", path, from, to, focus?, zoom?, speed?, moves?, transition?, index?}` | A clip on the main track, at `index` (default the end). See [Speed, moves and transitions](#speed-moves-and-transitions). |
| `{op: "add", type: "text" \| "insert" \| "audio", …}` | A text, picture or video, or sound, with the fields above. |
| `{op: "remove", id}` | Removes an item. A clip takes what's on it with it, and the cut closes up. |
| `{op: "split", id, at}` | Splits a clip in two at `at` seconds in its source. What starts on the second half moves to the new clip. |
| `{op: "trim", id, from?, to?}` | Changes a clip's source times. What's on it moves with the picture: trimming 2 s off the start moves its texts 2 s earlier, and drops any that were only on what's gone. |
| `{op: "move", id, index}` | Moves a clip to another place in the cut. |
| `{op: "cut_words", text, clip?, all?}` or `{op: "cut_words", from, to, clip?}` | Cuts words out of the cut by quoting them; see [Text-based editing](#text-based-editing). |
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

A project's captions come from the same word cache as text-based editing,
so a render only hears what no call has heard before.

### Speed, moves and transitions

A clip can also have:

- **`speed`**, 0.25 to 4: the picture and its sound faster or slower
  (`setpts`, and `atempo` for the sound, which keeps the pitch). The clip
  lasts its source stretch over its speed, and what's on it, the captions
  and the transcript are timed to that.
- **`moves`**, `[{at, focus?, zoom?, ease?}]`: the framing changes as the
  clip plays. Each move says where the focus and zoom are `at` seconds into
  the clip, eased from the move before it (`smooth`, the default, or
  `linear`), starting from the clip's own `focus` and `zoom`. A slow
  push-in, a move from one speaker to the other, a pull-out to reveal the
  screen. `split` and `trim` keep each half framed where it was.
- **`transition`**, `{type, duration}`: the clip comes in over the last
  `duration` seconds of the one before, with ffmpeg's `xfade` for the
  picture and `acrossfade` for the sound. The cut gets that much shorter,
  and everything after it moves up. Types: `fade`, `fadeblack`,
  `fadewhite`, `fadegrays`, `dissolve`, `wipeleft`/`right`/`up`/`down`,
  `slideleft`/`right`/`up`/`down`, `smoothleft`/`right`/`up`/`down`,
  `coverleft`/`right`, `revealleft`/`right`, `circleopen`, `circleclose`,
  `radial`, `zoomin`, `hblur`, `pixelize`.

A move is drawn with ffmpeg's `perspective` filter, which places the window
to a fraction of a pixel each frame. Filters that round the window to whole
pixels make a slow push stutter: on a 1x to 1.15x push over 4 s, the change
from one frame to the next measured 7.6 ± 3.9 with `scale` and `overlay` and
9.0 ± 2.7 with `zoompan`, against 3.4 ± 0.3 for a reference rendered at 4x
and scaled down. `perspective` measured 3.1 ± 0.06, as fast as the others.

A 15.5 s 1080x1920 project of the talk with a 3.5 s push from the whole
slide to the webcam in its corner, a dissolve to the 4K phone video, and a
fade through black to the talk at 1.25x, with captions, rendered in 15.6 s
on an M3 at −14.1 LUFS, exactly as long as its outline said.

Transitions work with up to 100 clips for now; longer edits render in
batches, and a transition can't cross one yet.

### Text-based editing

`transcribe` with a `project` gives the cut as text:

```
talk.json: the words in the cut (4:11.40)
c1  0:00.00  talk.mp4 0-251.4
    [0:12.36] So for our first prompt we gave Gemini 3 a very generic prompt which was generate a YouTube thumbnail for YouTube where a fox is
    [1:32.16] But we had to refine it so we used the same create framework in Gemini Pro, Gemini 3 Pro, with deep research and thinking enabled
```

and `cut_words` cuts by quoting it, the way an editor edits a document:

- `{op: "cut_words", text: "Gemini Pro,"}` cuts those words. Matching ignores
  case and punctuation. The words must be said once in the cut; if they're
  said more often, quote more of the sentence, give the `clip`, or add
  `all: true` to cut every time they're said (`{text: "like", all: true}`).
- `{op: "cut_words", from: "This is actually how most", to: "from AI models"}`
  cuts from the first words through the last, a sentence or a whole tangent,
  across as many clips as it spans.

Each cut is made by splitting, trimming or removing clips, so the project
stays plain clips; what's on a clip that's cut away goes with it, and the
outline lists what each cut took.

Where the cut lands matters more than the words: a cut through a word is
what makes an edit sound chopped. Whisper's own word times drift by up to
half a second over its 30-second window, so the words are placed again
before they're kept:

1. Whisper runs with DTW timestamps (`--dtw` with the model's preset, which
   needs flash attention off): a point inside each word from the model's
   attention, which doesn't drift.
2. ffmpeg's `silencedetect` measures the pauses (under −35 dB for 80 ms or
   more).
3. A word starts where the last pause before its point ends, and ends where
   the first pause after it starts.

A cut then runs from 0.2 s into the pause after the last word kept to 0.2 s
before the next word kept (less where the pause is shorter), moved into the
measured pause nearest each edge. On a recorded talk, Whisper's times put
"create" 0.5 s early, inside the pause before it; cutting "Gemini Pro," took
"framework in" with it until the words were placed by DTW and the pauses.
After, seven cuts (three phrases, a stray "I'm", every "like" and a
20-word sentence) all came out clean, checked by transcribing the render.

Each source is heard once and kept in `~/.mockingbird/cache/words/`, keyed by
the file's path, size and modified time, the model and the language, so a
changed file or another model is heard again. Only the stretches a project
uses are heard: a short from an hour-long podcast hears the minute it uses.
The first `transcribe` of a 4-minute talk took 37.0 s on an M3 (28.2 s
without DTW); after that, the transcript and every `cut_words` take no time,
and a render's captions don't run Whisper.

Whisper writes down what was meant more than what was said: it often
leaves out "um", stammers and repeated words ("create, create framework"
came out "create framework"). It can't cut what it didn't write, so pauses
and fillers are better cut from `pauses.sh` in the **retention-editing**
playbook.

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
as an image in the same pinned headless Chrome as `motion` (white bold
system font, a black outline under it, as HTML), and ffmpeg lays it over the
video, so this works with Homebrew's `ffmpeg`, which has no libass, and
looks the same on every OS. Emoji and non-Latin scripts come out as Chrome
draws them; a word too long for a line breaks between characters. Each
render starts Chrome once for all its captions, about 0.3 s. If the images
can't be drawn, or Chrome isn't pulled (`mockingbird models pull chrome`), `render` falls back to ffmpeg's `subtitles` filter
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
- **Fonts** come with Chrome (about 43 MB, [NOTICE.md](../NOTICE.md)), so
  text looks the same on every machine: a page can name `Inter`,
  `Charis SIL`, `JetBrains Mono`, `Noto Sans Bengali`, `Noto Sans
  Devanagari`, `Noto Sans Arabic`, `Noto Sans Hebrew`, `Noto Sans Thai`,
  `Noto Sans Tamil`, `Noto Sans SC`, `Noto Sans JP` and `Noto Sans KR` in
  CSS (the full names), and
  each loads the first time text needs it. Captions use Inter, then the Noto
  family for the script.
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
- It runs like a `motion` page: in Chrome, which can't reach the network,
  started under the OS sandbox where there is one.

The plugin's generators are in `plugin/skills/music/generators/`, with the
instruments they share in `lib.js`: `lofi.js`, `ambient.js`,
`corporate.js`, `cinematic.js` and `electronic.js`. Each reads `tempo`,
`key` and `energy`, and energy brings its layers in as it rises. Which one
suits which video, and how to draw the curve, is in `guide("music")`.

## Without MCP

An agent with a shell can run `mockingbird transcribe <file>` (with
`--words`, `--from` and `--to`, the same as the tool) and `mockingbird
dictionary`. The rest of the tools are MCP only for now.
