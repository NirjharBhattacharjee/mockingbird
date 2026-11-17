---
name: brief
description: Work out what a video is before editing it, from its transcript, a few frames and its cut count. Decides the format (talking head, podcast, screen tutorial, talk, product demo, vlog, commentary), what the speaker is trying to do, what to deliver (shorts, a long-form edit or both), and which playbooks and settings follow. Use first whenever the user hands over a video without saying what kind of edit they want, or says "edit this" or "make something from this".
---

# Brief

Before cutting anything, read the footage and decide what it is. The user
shouldn't have to say "this is a podcast, make it two-speaker shorts with
lo-fi under it". The recording says that itself. This skill turns it into a
short brief and hands over to the playbook that does the edit.

If the user already said what they want ("three Reels", "a YouTube edit"),
keep that as the deliverable and still use steps 1 to 3 for everything else.

## 1. Read the video

Three cheap reads, all with mockingbird's tools:

- `transcribe` the whole file. This is the main evidence.
- `frames` with `every: 30` (every 10 for anything under five minutes). Look
  at who's on screen and how many people, whether it's a face, slides, a
  screen, a product or a place, and whether the camera moves.
- `scenes` over the whole file. Divide the cuts by the length in minutes. Raw
  footage has almost none. Ten or more a minute means it's already edited.

Note the length, and whether the picture is vertical (the frames show it).

## 2. Read the transcript for these signals

| Signal in the transcript | Points to |
|---|---|
| One voice, "I", talking straight to "you" | talking head |
| Questions and answers taking turns, "thanks for having me", names said to each other, laughter at someone else's line | interview or podcast |
| Instructions: "click", "open", "type", "run", file names, commands, menu names | screen tutorial |
| "Today I'll talk about", "next slide", an audience laughing or clapping, Q&A at the end | talk or lecture |
| "Introducing", features one after another, a price, "available now", a call to action | product demo or launch |
| Places, times, "we just got here", past tense storytelling, background noise changing | vlog |
| Dates, sources ("according to"), opinions on something that happened, "breaking" | news or commentary |
| "Number one", "tip", "the first mistake", a count that goes up | listicle (any of the above, told as a list) |

Then check it against the frames, which settle what the words can't: two faces
side by side means a podcast even if one person talks most; a screen in most
stills means a tutorial even if the speaker never says "click". Whisper
doesn't separate voices, so count speakers from turn-taking and the frames,
not from the transcript's lines.

Also read off:

- **Intent.** What the speaker wants the viewer to do or take away: learn how
  to do something (teach), buy or sign up (sell), laugh or feel something
  (entertain), know what happened (inform), or remember an event (document).
  The ending usually says it: a call to action is selling, a recap is
  teaching.
- **Audience.** Jargon nobody explains means experts; definitions and
  analogies mean beginners. Note the language, and any names Whisper got
  wrong, for **captions**.
- **Energy.** Words per minute: count the transcript's words over the length.
  Above about 170 is fast and suits fast cuts; below about 130 is calm and
  suits a slower pace and quieter graphics.
- **Moments.** Mark the two or three lines that would stop a scroll on their
  own: a surprising number, a strong opinion, a punchline, a before-and-after.
  These are the short candidates and the long-form hook.

## 3. Decide the deliverable, if the user didn't

| The footage | Make |
|---|---|
| Already vertical | shorts |
| Under 3 minutes, one point | one short (vertical) |
| 3 to 8 minutes | shorts, and offer a tightened 16:9 version |
| Over 8 minutes with a beginning, middle and end | a long-form edit, and offer shorts from its best moments |
| Over 8 minutes of conversation with no single arc (a podcast, a stream) | shorts from the best moments; offer a long-form edit with chapters |
| Already edited (10+ cuts a minute) | shorts that reuse its cuts; don't re-cut it as long-form |

## 4. Route to the playbooks

The edit itself follows **viral-short** or **long-form**. The row below sets
what they leave open. Pace numbers come from
[STYLE-STUDY.md](../../docs/STYLE-STUDY.md).

| Format | Framing | Pace (seconds per shot) | Graphics and captions | Music (`music`) |
|---|---|---|---|---|
| Talking head | `focus` on the face; punch-ins every 5 to 10 s on a wide/tight alternation (**retention-editing**) | short 2 to 5, long-form 5 to 10 | captions word by word; a hook title; b-roll `inserts` for what's described | none under long-form explanation; a quiet `lofi.js` or `ambient.js` under a short |
| Interview or podcast | `focus` on whoever is talking, switched at each turn; both faces for a reaction | short 2 to 4 | captions; a lower third naming each person at first appearance | none, or `lofi.js` very low |
| Screen tutorial | `split` (screen on top, webcam below, `captionsY: 0.5`) for a short; zoom into the part of the screen being used | short 2 to 5, long-form 6 to 10 | highlight boxes and arrows on what's clicked; a checklist of steps (**motion-graphics**) | `ambient.js` or none |
| Talk or lecture | `focus` on the speaker; cut to the slide when it carries the point | short 3 to 6 | captions; the slide's key line as a title | none |
| Product demo or launch | the product large, slow drift; theme `studio` or `night` | 2 to 4 | a kinetic title per feature; an end card with the call to action | `corporate.js` or `cinematic.js`, building to the reveal |
| Vlog | keep the camera's own movement; hard cuts on action | 1.5 to 3 | sparse captions; place names as kickers | `lofi.js` or `electronic.js` |
| News or commentary | face plus screenshots of the source as `inserts`; highlight the number that matters | 1.2 to 2.5 | title pairing a heavy face with an italic serif; quotes on a card | `electronic.js` low, or none |
| Listicle (any format) | as its format | as its format | a numbered header that ticks over and stays on screen | as its format |

Keep the intent in view while editing: teaching keeps every step even if it's
slow; selling ends on the call to action; entertainment can drop context to
get to the laugh faster; documenting keeps things in the order they happened.

If a format skill exists for the format (they're being added one at a time,
see `guide` for the current list), use it in place of this row.

## 5. Tell the user, then go

Before the edit, say the brief in a few lines:

```
It's a two-person podcast (42 min), mostly about hiring, aimed at founders.
Plan: 3 vertical shorts from 12:40, 27:15 and 35:02, speaker-switched framing,
word captions, no music. I can also make a chaptered long-form edit.
```

Then start the edit without waiting, unless the deliverable was a guess
between two rows of step 3, or the user asked to approve plans first. In those
cases ask one question and wait. If the brief turns out wrong partway (the
"podcast" is one person reading both parts), say so and re-route instead of
finishing the wrong edit.

Every finished video still goes through the **reviewer**.
