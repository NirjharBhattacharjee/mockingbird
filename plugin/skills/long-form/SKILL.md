---
name: long-form
description: Edit a full-length horizontal video for YouTube, rendered on this Mac by mockingbird. Tightens pauses, false starts and tangents, plans the first minute, writes chapters and a captions file, and offers titles and thumbnail stills to test. Use when the user gives a recording (a talk, tutorial, vlog, podcast or screen recording) and wants a long-form edit rather than shorts.
---

# Long-form

A long-form edit keeps the whole story and removes everything that makes
people leave: dead air, false starts, repeats, tangents, a slow opening. It
doesn't reshape the video into something else. The evidence is in
[RESEARCH.md](../../docs/RESEARCH.md#long-form-explanation); the short version:
YouTube ranks on watch time and satisfaction, viewers decide in the first 30
seconds to a minute, explanations hold about six minutes before attention
needs a reason to stay, and music under explanation hurts.

The other skills apply here too: **hooks** (the first minute),
**retention-editing** (cutting and pace), **captions**, **motion-graphics**,
**style-match**. For shorts cut from this same video, use **viral-short**
after.

## Steps

1. **Read the video.** `transcribe` the whole file. `frames` every 30
   seconds, and look: is it a talking head, slides, a screen share with a
   webcam, more than one camera? Measure the source with style-match's
   `measure.sh`.
2. **Plan, and tell the user.** In a few lines: what the video promises (the
   title it deserves), the sections it actually has, what you'll cut, and how
   it'll open. If the recording has no structure (no clear point, the payoff
   never comes), say so, because editing can remove but can't add. Wait for a go-ahead
   unless the user said to just do it.
3. **Cut the dead air.** Over the whole file:

   ```sh
   scripts="<retention-editing skill folder>/scripts"
   "$scripts/pauses.sh" video.mp4 | "$scripts/clips.sh" 0 <length> 0.5 0.2
   ```

   That keeps everything but pauses over half a second, with 0.2 s either side
   (auto-editor's margin). It's gentler than a short's cut, because long-form
   needs room to breathe.
4. **Cut the rest by reading.** Go through the transcript and drop, by
   splitting or removing clips: false starts and retakes (keep the last good
   take), repeated points, tangents that don't pay off, "so, um, yeah" at the
   ends, housekeeping that can go in the description. Get word times with
   `transcribe` (`words: true`, a few minutes at a time) around each cut so it
   lands just before a word.
5. **Fix the opening.** Per **hooks**: the first 30 seconds confirm what the
   title and thumbnail promise; the first minute gives a reason to stay. Move
   any greeting, channel plug or sponsor after the hook. A cold open (a clip
   from later, 5–15 s, placed first) works when the video has a strong
   moment to preview. Plan a second hook around minute three: a turn, a
   question, the next promise.
6. **Frame.** Leave it at the source size (no `vertical`). For a talking head,
   punch in (`zoom` 1.1–1.2) on every other cut to hide jump cuts. For a
   screen recording, zoom in (`focus` on the area, `zoom` 1.5–2) when the
   speaker talks about something too small to read; the edX data says cutting
   between the face and the screen beats the screen alone.
7. **Captions file.** `captions` with the clips, `perCue: 8, lit: false`. Fix
   misheard names, then write it as `<name>.srt` beside the render for the
   user to upload to YouTube; uploaded captions beat YouTube's automatic ones
   on names. Draw them on the picture only if the user asks.
8. **Chapters.** The captions are timed to the finished video, so a section
   starts at the cue where its first sentence starts. YouTube needs the first
   at 00:00, at least three, and each at least 10 seconds. Name each one for
   what the viewer gets, not "Part 2".
9. **Render.** One `render` call, with b-roll where the speech names
   something visual. No music under explanation; music only on an intro, an
   outro or a montage, ducked. A long video takes a while (about a quarter of
   its length on an M3); in Claude Code, raise `MCP_TOOL_TIMEOUT` if it's cut
   off.
10. **Animate.** Per **motion-graphics**, from its explainer template: a
    chapter card where the topic changes sharply, a name the first time
    someone's named, `look` scenes that glide the camera to what the speaker
    points at on screen and optionally ring it, a checklist when the video works through
    a list, a pull quote for the line to remember. Run `motion` over the
    render; for a long video, try the script with `duration` on a short
    stretch first.
11. **Titles and thumbnails.** Three titles, each a different angle on the same
    true promise, and three thumbnail stills from `frames` (a clear face with
    an expression, the result or object itself, and one without a face).
    YouTube's Test & Compare runs up to three and keeps the one with the most
    watch time, so honest beats extreme. Write thumbnail text as three words
    or fewer; the user puts it on in their own tool.
12. **Review.** Hand the render to the **reviewer** agent. Fix and re-render.
13. **Report.** The paths (video, `.srt`), the length before and after, what
    you cut and why, the chapters, the titles and stills, and a description
    draft with the chapters in it.

## The bar

- The first 30 seconds deliver what the title promises, or show it's coming.
- No pause a viewer would notice, but speech still sounds like a person:
  sentences keep their ends, and the pause before a point stays.
- No retakes left in, no tangents that don't pay off.
- Chapters valid and named for the viewer.
- The `.srt` spelled right; names checked against `dictionary_list`.
- Music never under explanation; speech always clearly on top.
- −14 LUFS. mockingbird aims for it, but a quiet recording can land around
  −15 (mockingbird#127). Measure the render; if it's under −15, tell the user
  the number rather than re-rendering, which won't change it.
