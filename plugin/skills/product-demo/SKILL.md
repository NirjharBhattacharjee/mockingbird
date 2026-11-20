---
name: product-demo
description: Edit product demos, feature launches and short software walkthroughs from screen recordings, including silent footage. Start with the audience and visible result, select useful screen events, test a short sample, then cut and review the film. Use before viral-short or long-form for this kind of edit, regardless of aspect ratio.
---

# Product demo

A product demo helps a viewer understand what they can do. Start with that
result, then show enough real interaction to make it believable. Recording
order is evidence, not the required story order.

Use existing tools. This playbook adds editing decisions, not automatic
screen understanding, cursor tracking or new render options. The client
inspects frames and keeps the shot notes. Rendering stays local.

## 1. Write the brief

Use what the user already supplied. Ask only for missing information that
would change the edit. Do not repeat approval requests when the user has
already asked you to proceed.

Write these five lines before selecting shots:

- Audience and where they will watch.
- One thing they should understand, and one action they can take next.
- The visible result that supports that message.
- Length, aspect ratio, tone and any supplied visual reference.
- Available footage, narration and claims that still need evidence.

For example, for a fictional notes app:

> A 60-second landscape film for team leads. Show how someone finds a lost
> note without searching several folders. Open on the found note, then show
> the search and result. Calm, readable screen footage with short captions.
> End by inviting viewers to try search. No speed claim without measurements.

The public film does not need the editor's implementation details. Show a
terminal, model roster or file path only when it helps this audience. A
technical audience may need them.

## 2. Find the screen events

Call `status` and `measure` for the selected sources. Check whether they
have useful speech. Transcribe speech when it helps; do not transcribe
silent recordings or use silence removal to decide their cuts.

Use `scenes` and a sparse pass of `frames` to find promising stretches.
A small button click may not register as a scene change. Inspect likely
actions more closely, around every 1 to 2 seconds, including their
before and after states. Do not extract every frame of hours of footage.

Keep a local shot ledger beside the project:

| Shot | Source and in/out | Visible action and result | Purpose | Treatment |
|---|---|---|---|---|
| search | notes.mov, 12–18 s | Enter a phrase; the matching note appears | Show the action | Crop to search; result at normal speed |
| result | notes.mov, 18–21 s | Open the matching note | Prove the result | Leave enough time to read the title |

For each chosen shot, also record output times, crop, speed and any caption
or narration. Mark unreadable text, loading screens, private information and
missing evidence. Keep source files unchanged. Crop or redact private content
before export and check that it stays hidden throughout motion.

Reject a shot when it adds no new information. A screen full of fast text
can signal work, but it cannot explain that work.

## 3. Build the story cut

Choose a few beats with one visible point each. A useful starting order is
result, need, action, proof, invitation. Change it when the footage supports
a clearer story. A workflow film can include a problem and its correction.
Do not imply that a later check found an earlier bug.

Assign seconds to the beats so they fit the requested duration. Put source
shots under them before writing graphics. Preserve a few seconds for the
finished result. Do not give each internal process step equal screen time.

Use `edit` to make a project with the requested size and frame rate. For a
1920x1080 landscape film, set `size: "1920x1080"`. Use the requested dimensions
for other formats; do not use `vertical` or `split` for landscape footage.
Render a rough cut with `draft: true`, without decorative motion or music.
Check whether the pictures explain the change. If they do not, replace or
reorder shots before adding text.

## 4. Frame the action and control the pace

- Use `focus`, `zoom` and `moves` to bring the relevant control into view.
  Keep the click and its result together. Check legibility at the intended
  viewing size, not only on a large editing monitor.
- Cut waiting first. For a short passage of routine work, split the clip and
  set `speed` on each part. Projects support 0.25 to 4, not arbitrary 20x
  fast forward or a continuous speed curve. Return to normal speed before
  the action that proves the claim. Label sped-up work.
- Let the result settle. Start with about two seconds and adjust for what
  must be read. Prefer a stable source passage. A `frames` still used as an
  `insert` can cover an existing timeline interval; it does not extend the
  timeline or add a freeze clip. Record intentional holds in the ledger.
- Use motion to direct attention, not to make every shot move. Avoid zooms
  that turn interface text into blurred pixels.
- Keep callouts short and clear of the control, cursor and result. Narration
  subtitles and editorial callouts have different jobs; do not duplicate a
  paragraph in both.

## 5. Test the visual direction

Choose a style from the brief and product, not the nearest template. Record
typeface, text size, colors, spacing, box shape, border, fill, shadow and
motion. A plain label, underline or unboxed caption may be enough. Glass,
rounded cards, grain, gradients and constant camera drift are optional.

Use the motion-graphics playbook for precise callout positioning. Keep the
measured target rectangle separate from the label's design and position.
Check the target before choosing a larger decorative box around it.

Make a separate 10 to 15 second sample project using the strongest action
and result. Apply the intended framing, text, voice and sound. A half-size
draft helps with timing; use target resolution to judge small interface text.

Review the sample against the brief before extending the style. Present it
for feedback when the user wants a checkpoint. If they authorized the full
edit, continue after your review and state any assumption. Do not require a
new approval for every stage.

## 6. Match narration and picture

Write one short narration line per beat, with its output interval and the
shot that supports it. Speak about the result as it appears. Leave space for
the viewer to watch an interaction without another sentence competing for
attention. Use plain words appropriate to the audience.

Use supplied audio, a voiceover the user records, or concise on-screen text.
`mockingbird record` records a microphone on supported hosts; it does not
generate a voice. This workflow needs no external voice service or upload.
Music from a local file or the `music` playbook is optional.

Place audio in the project and check the mix in the rendered sample. Set
music volume deliberately. `duck` responds to the video's speech; do not
assume it detects a voiceover mixed as another added audio track. Use quieter
music or explicitly timed levels when necessary. Check with `audio_stats`
and listen when the client supports playback.

For every quantitative claim, keep its source and scope in the local notes.
Distinguish elapsed time from active work, estimates from charges, and
publication from later closeout. Label speed changes and placeholders.
Do not turn a successful test into a claim that a product has no bugs.

## 7. Review the whole film

Give the `reviewer` the product-demo brief, ledger, render and supporting
claim notes. Use its product-demo checks as well as the technical checks.
Watch the complete film with sound through supported playback when available.
Stills cannot establish pacing, smooth motion or intelligible narration.
If playback is unavailable, return a preview with those checks marked
unverified. Do not claim a full viewing or a creative pass.

For a revision such as "less technical", change the relevant beats and shots
first. For "hard to follow", check the action/result order and reading time.
Update the existing project and ledger, then render a new file. Review changed
joins and the whole final sequence. Deliver the preview or finished film,
editable project and a short account of what changed and what remains unchecked.
