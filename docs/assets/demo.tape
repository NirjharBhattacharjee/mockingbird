# Terminal demo shown in README.md. Render it from the repo root with
# `bun run demo` (Ollama must be running), which turns these frames into
# docs/assets/demo.gif.

Output .demo-frames/

Require bun

Set Shell "bash"
Set Theme "Catppuccin Mocha"
Set FontSize 20
Set Width 1300
Set Height 560
Set TypingSpeed 45ms

Hide
Type "export PS1='\n\[\e[38;2;203;166;247m\]mockingbird\[\e[0m\] \[\e[38;2;166;227;161m\]❯\[\e[0m\] '"
Enter
# Warm up whisper-server and Ollama off camera so the demo shows steady-state speed.
Type "bun run transcribe bench/fixtures/hello.wav >/dev/null 2>&1; clear"
Enter
Sleep 20s
Show

Type "bun run --silent transcribe bench/fixtures/hello.wav"
Sleep 600ms
Enter
Wait+Screen@60s /cleanup \d+ms/
Sleep 2.5s

Type "bun run --silent transcribe bench/fixtures/short.wav"
Sleep 600ms
Enter
Wait+Screen@60s /cleanup skipped/
Sleep 4s
