# ASCII only: Windows PowerShell 5.1 reads a file without a BOM as ANSI.
# Sets up mockingbird on Windows in one go: the tools (Git, ffmpeg, Bun), the
# code, whisper-server and the speech models. Safe to run again: anything
# already done is skipped, and an existing install is updated to the latest
# release. macOS and Linux use install.sh.
#
#   irm https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.ps1 | iex
#
# Or from a clone: .\scripts\install.ps1
#
# MOCKINGBIRD_DIR      where to clone the code (default ~\mockingbird; ignored
#                      when run from inside a clone)
# MOCKINGBIRD_HOME     where models\ goes (default ~\.mockingbird)
# MOCKINGBIRD_CHANNEL  "beta" to also install prereleases

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Invoke-WebRequest is many times slower drawing its bar.

function Fail($message) {
  Write-Host "`nerror: $message" -ForegroundColor Red
  exit 1
}
function Done($message) { Write-Host "    $([char]0x2713) $message" -ForegroundColor Green }
# A native command's failure doesn't stop a script by itself.
function Run {
  & $args[0] $args[1..($args.Count - 1)]
  if ($LASTEXITCODE -ne 0) { Fail "$($args -join ' ') failed (exit $LASTEXITCODE)." }
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
  Fail "mockingbird on Windows needs a 64-bit Intel or AMD processor, not $env:PROCESSOR_ARCHITECTURE."
}
$mbHome = if ($env:MOCKINGBIRD_HOME) { $env:MOCKINGBIRD_HOME } else { Join-Path $HOME ".mockingbird" }
New-Item -ItemType Directory -Force (Join-Path $mbHome "bin") | Out-Null

Write-Host "`n==> Installing mockingbird" -ForegroundColor Magenta

# Git and ffmpeg from winget, which checks each installer's hash.
foreach ($tool in @(@{ Name = "git"; Id = "Git.Git" }, @{ Name = "ffmpeg"; Id = "Gyan.FFmpeg" })) {
  if (-not (Get-Command $tool.Name -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Fail "mockingbird needs $($tool.Name). Install it (winget install $($tool.Id)), then run this again."
    }
    Run winget install --id $tool.Id --exact --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
  }
}

# Bun: its own release, pinned and checked. One already on the PATH is used as it is.
$bunVersion = "1.4.2"
$bunDir = Join-Path $mbHome "bin\bun-$bunVersion"
$bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $bun) {
  $bun = Join-Path $bunDir "bun.exe"
  if (-not (Test-Path $bun)) {
    $zip = Join-Path ([IO.Path]::GetTempPath()) "bun-windows-x64.zip"
    Invoke-WebRequest "https://github.com/oven-sh/bun/releases/download/bun-v$bunVersion/bun-windows-x64.zip" -OutFile $zip
    if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne "CE4C17497B2F29712A99D3D53F028DE28CD42E3BACB8589599E7F000E49B6405") {
      Remove-Item $zip
      Fail "bun-windows-x64.zip didn't match its pinned checksum. Run this again; if it keeps happening, please open an issue."
    }
    $unpacked = "$bunDir.part"
    Remove-Item -Recurse -Force $unpacked -ErrorAction SilentlyContinue
    Expand-Archive $zip $unpacked
    New-Item -ItemType Directory -Force $bunDir | Out-Null
    Move-Item -Force (Join-Path $unpacked "bun-windows-x64\bun.exe") $bun
    Remove-Item -Recurse -Force $unpacked, $zip
  }
}
Done "tools: Git, ffmpeg, Bun"

# The code: this clone as it is, or a clone at the latest release tag on main.
# Run as `irm | iex`, there's no script folder.
$here = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { "" }
$contributor = $here -and (Test-Path (Join-Path $here "package.json")) -and
  ((Get-Content (Join-Path $here "package.json") -Raw) -match '"name": "mockingbird"')
if ($contributor) {
  $dir = $here
  Done "code: this clone as it is, $dir"
} else {
  $dir = if ($env:MOCKINGBIRD_DIR) { $env:MOCKINGBIRD_DIR } else { Join-Path $HOME "mockingbird" }
  if (-not (Test-Path (Join-Path $dir ".git"))) {
    if (Test-Path $dir) { Fail "$dir already exists and isn't a clone of mockingbird. Set MOCKINGBIRD_DIR to use another folder." }
    Run git clone --quiet https://github.com/NirjharBhattacharjee/mockingbird.git $dir
  }
  if (git -C $dir status --porcelain --untracked-files=no) {
    Fail "$dir has local changes, so it wasn't updated. Commit or discard them, then run this again."
  }
  Run git -C $dir fetch --quiet --tags origin
  # The newest tag on main; one with a "-" is a prerelease, skipped unless asked for.
  $tag = git -C $dir -c versionsort.suffix=- tag --list "v*.*.*" --sort=-v:refname |
    Where-Object { ($env:MOCKINGBIRD_CHANNEL -eq "beta" -or $_ -notmatch "-") } |
    Where-Object { git -C $dir merge-base --is-ancestor "$_^{commit}" origin/main; $LASTEXITCODE -eq 0 } |
    Select-Object -First 1
  if ($tag) {
    Run git -C $dir -c advice.detachedHead=false checkout --quiet $tag
  } else {
    Run git -C $dir checkout --quiet main
    Run git -C $dir merge --quiet --ff-only origin/main
  }
  Done "code: $(git -C $dir describe --tags --always)"
}

Push-Location $dir
try {
  if ($contributor) { Run $bun install } else { Run $bun install --frozen-lockfile }
  Done "dependencies"
  # The models, and whisper-server: pinned and sha256-checked (apps/daemon/src/models.ts).
  Run $bun apps/daemon/src/cli.ts models pull
  Done "models and whisper-server"
} finally {
  Pop-Location
}

# The Go command, inside the clone so it finds the engine, for the release
# the clone is on and checked against its checksums.txt; built with Go when
# there's no release for it.
$cli = Join-Path $dir "apps\cli\mockingbird.exe"
Remove-Item -Force $cli -ErrorAction SilentlyContinue
# Windows PowerShell turns a native command's stderr into an error under "Stop".
$tag = try { git -C $dir describe --tags --exact-match 2>$null } catch { $null }
if ($tag) {
  $asset = "mockingbird-windows-x64.exe"
  $url = "https://github.com/NirjharBhattacharjee/mockingbird/releases/download/$tag"
  $sums = Join-Path ([IO.Path]::GetTempPath()) "mockingbird-checksums.txt"
  try {
    Invoke-WebRequest "$url/$asset" -OutFile "$cli.part"
    Invoke-WebRequest "$url/checksums.txt" -OutFile $sums
    $want = (Select-String -Path $sums -Pattern " $([regex]::Escape($asset))$").Line -split "\s+" | Select-Object -First 1
    if ($want -and (Get-FileHash "$cli.part" -Algorithm SHA256).Hash -eq $want.ToUpper()) { Move-Item "$cli.part" $cli }
  } catch {
    # No asset for this release: the fallbacks below.
  } finally {
    Remove-Item -Force "$cli.part", $sums -ErrorAction SilentlyContinue
  }
}
if (-not (Test-Path $cli) -and (Get-Command go -ErrorAction SilentlyContinue)) {
  Push-Location (Join-Path $dir "apps\cli")
  try { go build -o $cli . } finally { Pop-Location }
}

# `mockingbird` on the PATH: a shim in ~\.mockingbird\bin that puts Bun on
# the PATH and runs the command, or the TypeScript CLI without one.
$binDir = Join-Path $mbHome "bin"
$run = if (Test-Path $cli) { "`"$cli`" %*" } else { "`"$bun`" `"$dir\apps\daemon\src\cli.ts`" %*" }
Set-Content -Encoding ASCII (Join-Path $binDir "mockingbird.cmd") @"
@echo off
rem Written by scripts\install.ps1. Run it again after moving the clone.
set "PATH=$(Split-Path -Parent $bun);%PATH%"
$run
"@
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not (($userPath -split ";") -contains $binDir)) {
  [Environment]::SetEnvironmentVariable("Path", "$binDir;$userPath", "User")
  Done "PATH: added $binDir"
}
$env:Path = "$binDir;$env:Path"
Done "command: $(if (Test-Path $cli) { & $cli --version } else { 'the TypeScript one, no prebuilt command for this version' })"

Write-Host "`nAll set. mockingbird is installed.`n" -ForegroundColor Green
Write-Host "Give it to your AI agent. For Claude Code:`n"
Write-Host "    claude mcp add mockingbird -- mockingbird mcp`n"
Write-Host "Other agents: docs/AGENT_INSTALL.md. ``mockingbird status`` checks the install."
Write-Host "Open a new terminal for ``mockingbird`` to be on the PATH. To update later, run the install command again.`n"
