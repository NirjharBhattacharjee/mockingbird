# Local voice auditions

Use `voice_list` with `language: "en"` and `accent: "AU"` to find installed
Australian English voices. Country and language come from macOS metadata.
An empty list means no installed match; Mockingbird does not download a voice.

Use `voice_audition` with an exact returned `voice`, the `text` to speak and a
new `.wav` output path. Optional `rate` is words per minute, from 80 to 350.
Make each audition separately, then listen before choosing a voice.

Speech uses macOS `say` and local ffmpeg. There is no account, cloud service,
credit charge or voice cloning. Other operating systems receive a scoped
unsupported-platform message. The other editing tools continue to work.

Voice metadata cannot prove perceived accent or suitability. Auditions are
48 kHz PCM WAV files. The output appears only after encoding succeeds with
audio. Source files and existing outputs are never overwritten.
