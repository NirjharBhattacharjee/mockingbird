<h3 align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
  🐦 mockingbird
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/misc/transparent.png" height="30" width="0px"/>
</h3>

<p align="center">
  Local voice dictation for macOS. Free forever, and your voice never leaves your Mac.
</p>

<p align="center">
  <a href="https://github.com/NirjharBhattacharjee/mockingbird/stargazers"><img src="https://img.shields.io/github/stars/NirjharBhattacharjee/mockingbird?style=for-the-badge&logo=starship&color=cba6f7&logoColor=cdd6f4&labelColor=313244" alt="stars"></a>
  <a href="https://github.com/NirjharBhattacharjee/mockingbird/commits/main"><img src="https://img.shields.io/github/last-commit/NirjharBhattacharjee/mockingbird?style=for-the-badge&logo=git&color=a6e3a1&logoColor=cdd6f4&labelColor=313244" alt="last commit"></a>
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon-89b4fa?style=for-the-badge&logo=apple&logoColor=cdd6f4&labelColor=313244" alt="macOS on Apple Silicon">
  <img src="https://img.shields.io/badge/runs-100%25%20local-fab387?style=for-the-badge&logo=lock&logoColor=cdd6f4&labelColor=313244" alt="runs 100% local">
  <img src="https://img.shields.io/badge/built%20with-Bun-f5e0dc?style=for-the-badge&logo=bun&logoColor=cdd6f4&labelColor=313244" alt="built with Bun">
  <img src="https://img.shields.io/badge/price-free%20forever-f38ba8?style=for-the-badge&logo=githubsponsors&logoColor=cdd6f4&labelColor=313244" alt="free forever">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-94e2d5?style=for-the-badge&logo=opensourceinitiative&logoColor=cdd6f4&labelColor=313244" alt="MIT license"></a>
</p>

<p align="center">
  <img src="docs/assets/demo.gif" alt="Illustration: running mockingbird start once, after which the terminal is no longer needed; then holding Fn in a chat app, speaking, and letting go types the cleaned-up sentence into the message box" width="100%">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/palette/macchiato.png" width="400" alt="">
</p>

Speak, and get clean text back. Everything runs on your Mac: no account, no
cloud, no usage limits. A free, open-source alternative to Wispr Flow
([why](docs/PHILOSOPHY.md)).

> [!NOTE]
> **Early days.** `mockingbird start` once, then hold `Fn` anywhere, speak,
> and the text is typed into whatever app you're in — no terminal open, and it
> comes back at every login. History, custom vocabulary and the dashboard are
> still to come.

## 🚀 Install

You need a Mac with Apple Silicon, [Homebrew](https://brew.sh), and about 5 GB
of free space.

```sh
curl -fsSL https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/scripts/install.sh | bash
```

It's safe to run again. Prefer to do it by hand? See
[manual install](docs/README.md#manual-install).

## 🎤 Use it

```sh
mockingbird start
```

Click into any app, hold **Fn**, speak, and let go. Your words are typed where
the cursor is. It keeps running in the background and comes back at every
login.

The first time, macOS asks for three permissions (Input Monitoring,
Accessibility, Microphone). Grant them to **mockingbird**, then run
`mockingbird restart`. `mockingbird status` shows what's still missing.

## ⌨️ Commands

| Command | Does |
|---|---|
| `mockingbird start` | Run in the background, now and at every login |
| `mockingbird stop` | Stop, and stay stopped across reboots |
| `mockingbird restart` | Restart (do this after granting a permission) |
| `mockingbird status` | Whether it's running, and which permissions it has |
| `mockingbird listen` | Dictate live in a terminal, with a level meter |
| `mockingbird transcribe <file>` | Turn a recording (mp3, m4a, wav…) into text |
| `mockingbird type --check` | Check typing permission and the app in front |

| Key | Does |
|---|---|
| **Fn** (hold) | Record while held |
| **Fn** (double-tap) | Record hands-free until you press **Fn** again |

A rising **tink** means it's recording, a falling **pop** means it's
transcribing, and a low **basso** means it couldn't type the text.

Something not working? See [troubleshooting](docs/README.md#troubleshooting).

## 📚 More

The [user guide](docs/README.md) covers every option, permissions in detail,
troubleshooting, privacy, the roadmap, and development. Contributions are
welcome: start with [CONTRIBUTING.md](CONTRIBUTING.md).
[MIT](LICENSE) licensed.

<p align="center">
  <img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" alt="">
</p>

<p align="center">
  Theme colors from <a href="https://github.com/catppuccin/catppuccin">Catppuccin</a>.
</p>
