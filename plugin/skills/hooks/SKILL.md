---
name: hooks
description: Find and build the opening of a short (the first one to three seconds) or a long-form video (the first 30 seconds to a minute) from footage the user already has. Use when choosing which moment to open on, rewriting an opening, adding a cold open or a hook title, or when a video loses viewers at the start.
---

# Hooks

A hook opens a gap the viewer wants closed, and closes it later in the same
video. It works because curiosity rises when someone notices a specific gap in
what they know (Loewenstein), and a change on screen pulls attention by
reflex (Lang). It fails when the gap is vague or never closes: YouTube ranks on
watch time and satisfaction, so a hook that wins the click and then
disappoints loses the video. See [RESEARCH.md](../../docs/RESEARCH.md).

You're editing footage, not writing a script, so the hook has to come from
something the speaker already said or showed.

## Find one in the transcript

Read the transcript for lines that work alone and make someone want the next
line. Strong ones, roughly in order:

1. **The result first.** The number, the before/after, the thing finished:
   "This took me from 200 to 20,000 users." Then the video is how.
2. **A claim against the grain.** "Most people learn this backwards."
3. **A specific question the video answers.** "Why does every AI thumbnail
   look the same?" Vague ones ("Want to know a secret?") don't count.
4. **The peak of a story**, then back to how it started.
5. **A mistake or a warning.** "Don't do this if you use X."

Write down three candidates with timestamps, pick the strongest, and say why
in one line.

## Build it

- **It's already the first line**: start the clip on its first word. Cut the
  greeting, the name, "so today".
- **It's later in the video**: a cold open. Put a clip of that line (2–8 s
  in a short, 5–15 s in long-form) first, then the start of the story.
  `render` keeps clips in the order you list them. The cold-open line must
  not repeat word for word when the video reaches it; trim it there or start
  just after it.
- **The speech has no hook at all**: a hook title, ideally one that slams in
  on a hit (`HOOK` in the **motion-graphics** short template), or `render`'s `texts` over the first two
  to three seconds, six words or fewer, at `y` 0.2 in a short. State the
  promise the video keeps, not clickbait it doesn't.
- **The first frame is static** (a slide, someone settling in): start a beat
  later, or open on the most visual moment, or punch in (`zoom` 1.2) so the
  first cut is a change.

## Shorts: the first one to three seconds

- Speech or motion in frame one; the hook said within about a second.
- On-screen text that says the hook, for viewers with the sound off.
- No logo, no intro card, no "hey guys", no fade-in.

## Long-form: the first 30 seconds, then the first minute

- The first 30 seconds confirm what the title and thumbnail promised, so the
  viewer knows they clicked the right thing. YouTube Studio reports how many
  are still watching at 30 seconds.
- By the first minute, give a reason to stay for the rest: what they'll be
  able to do, or the question still open.
- Housekeeping (subscribe, sponsor, "before we start") goes after the hook,
  or out.
- Around minute three, a second hook: a turn, the next question, a preview
  of the best part. MrBeast's production notes single that point out; it's
  creator lore, but cheap to do.

## Check

Watch (or read) only the first three seconds of a short, or the first 30 of a
long video, as a stranger. Do you know what you'll get, and do you want it? If
not, try the next candidate.
