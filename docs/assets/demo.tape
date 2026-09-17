# Terminal demo shown in README.md. Render it from the repo root with
# `bun run demo` (Ollama must be running), which turns these frames into
# docs/assets/demo.gif.
#
# The "microphone" is bench/fixtures/hello.wav with 2s of silence around it, on
# a loop, fed in through MOCKINGBIRD_MIC_INPUT; everything else is the real
# command. Enter is pressed during the leading silence and again after the
# sentence, so the recording holds it whole.

Output .demo-frames/

Require bun
Require ffmpeg

Set Shell "bash"
Set Theme "Catppuccin Mocha"
Set FontSize 20
Set Width 1300
Set Height 460
Set TypingSpeed 45ms

Hide
Type "export PS1='\n\[\e[38;2;203;166;247m\]mockingbird\[\e[0m\] \[\e[38;2;166;227;161m\]❯\[\e[0m\] '"
Enter
Type "ffmpeg -loglevel error -y -i bench/fixtures/hello.wav -af adelay=delays=2000:all=1,apad=pad_dur=2 /tmp/mockingbird-demo.wav"
Enter
Type "export MOCKINGBIRD_MIC_INPUT='-re -stream_loop -1 -i /tmp/mockingbird-demo.wav'"
Enter
# Warm up whisper-server and Ollama off camera so the demo shows steady-state speed.
Type "bun run transcribe bench/fixtures/hello.wav >/dev/null 2>&1; clear"
Enter
Sleep 20s
Show

Type "bun run --silent listen"
Sleep 600ms
Enter
Wait+Screen@60s /ready/
Sleep 1.2s
Enter
Sleep 5.5s
Enter
Wait+Screen@60s /cleanup \d+ms/
Sleep 2.5s
Type "q"
Sleep 1.5s
