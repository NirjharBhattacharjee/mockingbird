# Research

What the skills are based on, and how far to trust each piece. Most of what
circulates about "going viral" is marketing copy repeating other marketing
copy, so every claim here carries a grade:

- **Strong**: peer-reviewed and replicated, or the platform's own documentation
  of how its product works.
- **Moderate**: one large study, or a platform engineering paper that may be
  out of date.
- **Weak**: industry figures, leaked documents, creator lore. Fine as a
  starting point, never as a rule.

## What the platforms reward

**YouTube ranks on watch time and satisfaction, not clicks.** *(Strong for what
YouTube says it does; the weights aren't public.)* YouTube's 2016 RecSys paper
describes a ranking model trained to predict expected watch time instead of
click-through rate, because ranking on clicks promotes videos people click and
then abandon ([Covington, Adams & Sargin 2016][covington]). YouTube's VP of
Engineering later listed the signals as clicks, watch time, survey responses
("only videos that you rate highly with four or five stars are counted as
valued watchtime"), shares, likes and dislikes ([Goodrow 2021][goodrow]).
For an edit, that means a misleading hook can win the click and still
lose the video, because the watch time it buys is short.

**YouTube's own A/B test picks by watch time.** *(Strong.)* Test & Compare
takes up to three titles and thumbnails and keeps the one with the highest
watch time, not the highest click-through ([YouTube Help][abtest]). So the
long-form skill gives three title and thumbnail options to test, each
honestly matched to what the video delivers.

**YouTube marks how many people are still watching at 30 seconds.** *(Moderate:
the report is official; the 30-second definition comes from coverage of it.)*
YouTube Studio's "key moments for audience retention" report has an Intro
moment, described as the share of viewers still watching after the first 30
seconds ([YouTube Help][keymoments], [Tubefilter][keymoments-tf]).

**Chapters have rules.** *(Strong.)* The first timestamp is 00:00, there are at
least three in ascending order, and each chapter is at least 10 seconds
([YouTube Help][chapters]).

**Loudness.** *(Moderate.)* YouTube turns loud uploads down to about −14 LUFS;
the figure comes from measurements, not a published spec. mockingbird renders
everything at −14 LUFS, so a quiet phone recording isn't turned down and isn't
weak next to everything else.

## Attention and cutting

**A cut grabs attention, and too many cuts cost memory.** *(Strong.)* Cuts and
other structural changes in video set off an orienting response, an automatic
turn of attention toward the change. Under Lang's limited-capacity model,
viewers have a fixed amount of processing to spend; editing pace raises arousal
and attention, but fast pacing combined with arousing content overloads that
capacity and recall drops ([Lang 2000][lc4mp]; [Lang et al. 2000][edits], "When
an edit is an edit can an edit be too much?"). The skills treat cut rate as a
dial. Cut fast enough to keep a change on screen and slow enough that the point lands.
A dense explanation gets fewer cuts than a reaction clip.

**Films have been cut faster for decades.** *(Strong for the trend.)* Across 150
popular Hollywood films from 1935 to 2005, the average shot shortened from
about 8–10 seconds in the 1960s to about 3–4 seconds by 2005, and shot lengths
in newer films vary in a 1/f pattern that matches how attention fluctuates
([Cutting, DeLong & Nothelfer 2010][cutting]). That's a baseline for what
audiences are used to, not a target for a talking head.

**Curiosity is a gap between what you know and what you want to know.**
*(Strong for the theory; moderate for its effect on viewing.)* Loewenstein's
information-gap account says curiosity rises when a person becomes aware of a
specific gap in what they know ([Loewenstein 1994][loewenstein]); curiosity
also improves memory for the answer ([Kang et al. 2009][kang]). A hook opens a
gap the video then closes: a result shown before how it was done, a question
the speaker answers later. The gap has to be small and specific; a vague
"you won't believe this" isn't one.

**Unfinished tasks being remembered better (the Zeigarnik effect)** *(Weak.)* is
often cited for cliffhangers and open loops. Replications are mixed, so the
skills don't lean on it.

## Long-form explanation

The best large dataset on what keeps people watching an explanation is from
online courses: 6.9 million viewing sessions across four edX courses
([Guo, Kim & Rubin 2014][guo]). *(Moderate: very large, but one platform,
math-and-science courses, and learners who chose to be there.)*

- **People stop at about six minutes.** Median engagement time was at most six
  minutes whatever the video's length; past nine minutes, viewers usually
  watched less than half. For long-form, that argues for chapters and a reason
  to keep watching every few minutes, not for cutting every video to six
  minutes.
- **Cutting between the speaker's face and the slides beats slides alone.**
  Their recommendation: record the speaker and insert them into the
  presentation at opportune times. For a screen recording with a webcam,
  that's the split layout or alternating full-screen face and screen.
- **Informal and close beats a studio.** A speaker at a desk making eye contact
  held viewers far longer than one lecturing from a podium in a TV studio.
- **Faster speech held more viewers.** Speaking rate ran from 48 to 254 words a
  minute (mean 156); the fastest speakers held the most, likely because speed
  went with enthusiasm. edX's editors cut "umm", "uhh", filler and pauses in
  post-production, and the paper recommends it.
- **Tutorials are skimmed and re-watched; lectures are watched through.** For a
  how-to, signposts and chapters matter more than length.
- **Planning beat everything.** Lectures recorded with the online format in mind
  held viewers longer than lectures chopped up afterwards. An editor can't add
  structure the recording lacks; the long-form skill says so when a recording
  has none.

**Background music under explanation hurts.** *(Strong.)* Adding background
music or sound effects to a narrated lesson lowered both recall and transfer
([Moreno & Mayer 2000][moreno]); Mayer's later reviews call this the coherence
principle, with a median effect size around d = 0.97. The skills keep music
out from under explanation in long-form and well down under speech in shorts,
where the content is lighter.

## Creator and industry claims

All *weak*: useful as defaults to test, not as truths.

- **The first minute.** MrBeast's production handbook, leaked in 2024, says the
  first minute is where viewers are most likely to leave, names minute three as
  a point to re-engage viewers, and says click-through rate, average view
  duration and average view percentage decide everything
  ([coverage][mrbeast]). The long-form skill plans a hook in the first minute
  and a second reason to stay around minute three.
- **"65% of people who watch the first three seconds watch at least ten"**
  comes from Meta's marketing material and is repeated everywhere without
  the underlying data.
- **"85% of video is watched without sound"** traces back to a 2016 Digiday
  report about Facebook video. The exact number is stale, but captions cost
  nothing, so the skills always make them.
- **Faces and emotion in thumbnails.** The analyses that exist are vendor
  studies with mixed results (one large one found thumbnails with and without
  faces did about the same) ([Search Engine Journal][faces]). The long-form
  skill offers thumbnail stills with a clear face *and* without, to test.
- **Word-by-word captions with the spoken word highlighted** (the style
  popularised by Alex Hormozi's clips) are a convention, not a finding.
  mockingbird's defaults come from Remotion's TikTok template instead; see
  [REVERSE-ENGINEERING.md](./REVERSE-ENGINEERING.md).

[covington]: https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/
[goodrow]: https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/
[abtest]: https://support.google.com/youtube/answer/16391400
[keymoments]: https://support.google.com/youtube/answer/9314415
[keymoments-tf]: https://www.tubefilter.com/?p=151429
[chapters]: https://support.google.com/youtube/answer/9884579
[lc4mp]: https://doi.org/10.1111/j.1460-2466.2000.tb02833.x
[edits]: https://doi.org/10.1207/s15506878jobem4401_7
[cutting]: https://doi.org/10.1177/0956797610361679
[loewenstein]: https://doi.org/10.1037/0033-2909.116.1.75
[kang]: https://doi.org/10.1111/j.1467-9280.2009.02402.x
[guo]: https://doi.org/10.1145/2556325.2566239
[moreno]: https://doi.org/10.1037/0022-0663.92.1.117
[mrbeast]: https://gigazine.net/gsc_news/en/20240917-mrbeast-youtube-production
[faces]: https://searchenginejournal.com/do-faces-help-youtube-thumbnails
