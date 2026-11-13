# The mockingbird plugin

A Claude Code plugin that edits your videos into shorts for YouTube Shorts,
Instagram Reels and TikTok, and into long-form edits for YouTube. Give it a
recording; it picks the moments, cuts the pauses, opens on a hook, captions
every word, frames the speaker, and checks the result before handing it back.
The rendering happens on your Mac, with
[mockingbird](https://github.com/NirjharBhattacharjee/mockingbird).

```
> make two shorts from ~/Movies/talk.mp4
> edit ~/Movies/tutorial.mov for YouTube
> cut this like ~/Downloads/reference.mp4: ~/Movies/vlog.mov
```

## What you get

**Shorts**: 1080x1920 MP4s, 15–60 seconds each, with word-by-word captions
(the spoken word in yellow), the speaker kept in frame, punch-in zooms over
jump cuts, and optional b-roll, ducked music and sound effects. Anything
that moves is written as code: titles that spring in, captions that pop, zooms,
lower thirds, arrows that draw themselves on.
A screen recording with a webcam becomes screen on top, face below.

**Long-form**: the whole video with dead air, retakes and tangents cut, a
rebuilt opening, an `.srt` captions file for YouTube, chapters, three titles
and three thumbnail stills to A/B test, and a description draft.

Both come out at −14 LUFS, the loudness the platforms play at.

## Install

You need mockingbird installed on macOS, Linux or Windows. Its installers
are in [mockingbird's README](https://github.com/NirjharBhattacharjee/mockingbird#install):
`install.sh` for macOS and Linux, `install.ps1` for Windows. On an Apple
silicon Mac, Homebrew works too:

```sh
brew install nirjharbhattacharjee/mockingbird/mockingbird
mockingbird models pull         # the speech model, once
mockingbird models pull chrome  # the Chrome that motion and captions draw in
```

Then in Claude Code:

```
/plugin marketplace add NirjharBhattacharjee/mockingbird
/plugin install mockingbird@mockingbird
```

It was called mockingbird-studio and lived in its own repo until v0.4.2. If
you installed that one, remove it (`/plugin uninstall mockingbird-studio`)
so Claude doesn't load two copies of every skill.

Other agents (Codex, Cursor, Gemini CLI and the rest) don't need the plugin:
mockingbird's MCP server hands them the same playbooks through its `guide`
tool. See [mockingbird's MCP.md](../docs/MCP.md).

The plugin starts `mockingbird mcp` itself (`launch`, or `launch.cmd` on
Windows). Installed before mockingbird is, it offers Claude one tool, `install_mockingbird`, that says
how to install it. If you already added mockingbird with `claude mcp add` (or
`mockingbird setup` did), remove that one (`claude mcp remove mockingbird`)
so Claude doesn't see every tool twice.

## What's in it

| | |
|---|---|
| `viral-short` | The shorts workflow, and the bar a short has to clear |
| `long-form` | The long-form workflow: cut, opening, chapters, captions file, titles, thumbnails |
| `hooks` | The first seconds of a short, the first minute of a long video |
| `retention-editing` | Cutting pauses and retakes, where to cut, punch-ins, pace |
| `captions` | Word-by-word captions or an SRT, spelled right, placed clear of faces and buttons |
| `motion-graphics` | Animation as code for mockingbird's `motion` tool: a design kit, templates for shorts and explainers, and sound effects, set from a frame-by-frame study of twenty professional edits |
| `music` | Background music written as code: five generators, an energy curve drawn from the edit, mixed and ducked under the speech |
| `style-match` | Measure a video that worked and match its pace |
| `reviewer` agent | Checks every render: size, loudness, black frames, opening, captions, framing |

## Privacy

Your video is cut and rendered on your Mac and never uploaded. Claude reads
the transcript and the stills it looks at, which go to Anthropic like anything
else you show Claude. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Docs

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md): how the plugin and mockingbird
  split the work.
- [RESEARCH.md](./docs/RESEARCH.md): what the research says about hooks,
  cutting, captions and long-form attention, and how strong each piece is.
- [REVERSE-ENGINEERING.md](./docs/REVERSE-ENGINEERING.md): the numbers taken
  from Remotion's TikTok template and auto-editor.
- [STYLE-STUDY.md](./docs/STYLE-STUDY.md): twenty professional edits
  watched frame by frame and measured, and what the motion kit takes from
  them.

## Limits

- The Homebrew formula is for Apple silicon only; elsewhere, use the installers.
- Off Apple silicon, Whisper runs on the CPU, so the default model is the
  smaller `small` and transcription is slower.
- It edits what you recorded. It can move your best line to the front; it
  can't add a point you didn't make.
- Music, b-roll and sound effects are yours to supply, with the rights to
  use them.

## License

MIT
