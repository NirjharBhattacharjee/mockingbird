/**
 * Renders docs/assets/demo.gif, the illustration at the top of README.md:
 * `mockingbird start` once, the terminal goes away, and from then on holding
 * Fn in any app types what you said where the cursor is.
 *
 * The terminal fading out is the point of the picture — dictation doesn't need
 * one open, and nothing is printed there. It is drawn frame by frame
 * (SVG → PNG → GIF) rather than screen-recorded, so anyone can re-render it,
 * and the lines it shows are the ones the commands really print.
 * Needs rsvg-convert (`brew install librsvg`) and ffmpeg.
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FRAMES = join(ROOT, ".demo-frames");
const OUT = join(ROOT, "docs/assets/demo.gif");

const FPS = 15;
const W = 1000;
const H = 604;

// Catppuccin Mocha.
const C = {
  crust: "#11111b",
  mantle: "#181825",
  base: "#1e1e2e",
  surface0: "#313244",
  surface1: "#45475a",
  overlay0: "#6c7086",
  overlay1: "#7f849c",
  subtext0: "#a6adc8",
  subtext1: "#bac2de",
  text: "#cdd6f4",
  mauve: "#cba6f7",
  red: "#f38ba8",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  peach: "#fab387",
};

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "Menlo, monospace";

const SPOKEN = "um the demo is ready uh let's ship it on friday".split(" ");
const TYPED = "The demo is ready, let's ship it on Friday.";

// Timeline, in seconds.
const TYPE_CMD_FROM = 0.4;
const TYPE_CMD_TO = 1.5;
const STARTED = 1.9; // the agent reports back
const FADE_FROM = 3.0; // the terminal is no longer needed
const FADE_TO = 3.8;
const PRESS = 4.4;
const WORDS_FROM = 4.8;
const WORDS_TO = 7.4;
const RELEASE = 7.8;
const DONE = 8.7; // transcribed and cleaned up
const TYPED_BY = 9.0; // typing sends chunks 4ms apart, so it's nearly instant
const END = 12;

const COMMAND = "mockingbird start";

type Phase = "starting" | "idle" | "recording" | "transcribing" | "done";

function phaseAt(t: number): Phase {
  if (t < FADE_TO) return "starting";
  if (t < PRESS) return "idle";
  if (t < RELEASE) return "recording";
  if (t < DONE) return "transcribing";
  return "done";
}

/** 1 while the terminal matters, 0 once it doesn't. */
function terminalOpacity(t: number): number {
  if (t < FADE_FROM) return 1;
  if (t > FADE_TO) return 0.16;
  return 1 - 0.84 * ((t - FADE_FROM) / (FADE_TO - FADE_FROM));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function trafficLights(x: number, y: number): string {
  return [C.red, C.yellow, C.green]
    .map((fill, i) => `<circle cx="${x + i * 20}" cy="${y}" r="6" fill="${fill}"/>`)
    .join("");
}

function fnKey(pressed: boolean): string {
  const x = 40;
  const y = 22 + (pressed ? 3 : 0);
  const face = pressed ? C.mauve : C.surface0;
  const ink = pressed ? C.crust : C.text;
  const depth = pressed ? 1 : 4;
  return `
    <rect x="${x}" y="${y + depth}" width="58" height="46" rx="9" fill="${C.crust}"/>
    <rect x="${x}" y="${y}" width="58" height="46" rx="9" fill="${face}" stroke="${pressed ? C.mauve : C.surface1}"/>
    <text x="${x + 46}" y="${y + 19}" font-family="${SANS}" font-size="14" fill="${ink}" text-anchor="end">fn</text>
    <g stroke="${ink}" stroke-width="1.3" fill="none">
      <circle cx="${x + 16}" cy="${y + 31}" r="7"/>
      <ellipse cx="${x + 16}" cy="${y + 31}" rx="3" ry="7"/>
      <line x1="${x + 9}" y1="${y + 31}" x2="${x + 23}" y2="${y + 31}"/>
    </g>`;
}

function caption(t: number, phase: Phase): string {
  const x = 118;
  const y = 52;
  const font = `font-family="${SANS}" font-size="19"`;
  switch (phase) {
    case "starting":
      return t < STARTED
        ? `<text x="${x}" y="${y}" ${font} fill="${C.subtext0}">Turn it on once…</text>`
        : `<text x="${x}" y="${y}" ${font} fill="${C.subtext0}">…and it's there from every login. <tspan fill="${C.text}">Close the terminal.</tspan></text>`;
    case "idle":
      return `<text x="${x}" y="${y}" ${font} fill="${C.subtext0}">Hold <tspan fill="${C.text}" font-weight="bold">fn</tspan> in any app and speak</text>`;
    case "recording": {
      const span = (WORDS_TO - WORDS_FROM) / (SPOKEN.length - 1);
      const heard = SPOKEN.filter((_, i) => t >= WORDS_FROM + i * span).join(" ");
      const dot = Math.floor(t * 3) % 2 === 0 ? 1 : 0.35;
      return `
        <circle cx="${x + 6}" cy="${y - 6}" r="6" fill="${C.red}" opacity="${dot}"/>
        <text x="${x + 22}" y="${y}" ${font} font-style="italic" fill="${C.text}">${heard ? `“${esc(heard)}”` : ""}</text>`;
    }
    case "transcribing":
      return `<text x="${x}" y="${y}" ${font} fill="${C.subtext0}">Let go · cleaning it up, on your Mac…</text>`;
    case "done":
      return `
        <path d="M${x} ${y - 7} l6 6 l11 -12" stroke="${C.green}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="${x + 26}" y="${y}" ${font} fill="${C.text}">Typed where your cursor is<tspan fill="${C.subtext0}">&#160;— and nowhere else</tspan></text>`;
  }
}

function message(
  y: number,
  initial: string,
  color: string,
  name: string,
  time: string,
  body: string,
) {
  const x = 234;
  return `
    <circle cx="${x + 16}" cy="${y + 16}" r="16" fill="${color}"/>
    <text x="${x + 16}" y="${y + 21}" font-family="${SANS}" font-size="15" font-weight="bold" fill="${C.crust}" text-anchor="middle">${initial}</text>
    <text x="${x + 44}" y="${y + 11}" font-family="${SANS}" font-size="14"><tspan font-weight="bold" fill="${C.text}">${name}</tspan><tspan dx="8" font-size="12" fill="${C.overlay0}">${time}</tspan></text>
    <text x="${x + 44}" y="${y + 31}" font-family="${SANS}" font-size="15" fill="${C.subtext1}">${esc(body)}</text>`;
}

function chatWindow(t: number, phase: Phase): string {
  const x = 40;
  const y = 92;
  const w = 920;
  const h = 320;
  const typedChars =
    t < DONE ? 0 : Math.round(TYPED.length * Math.min(1, (t - DONE) / (TYPED_BY - DONE)));
  const typed = TYPED.slice(0, typedChars);
  const busy = phase === "recording" || phase === "transcribing" || t < TYPED_BY;
  const caretOn = busy || Math.floor(t * 2) % 2 === 0;
  const caret = `<tspan fill="${C.mauve}" opacity="${caretOn ? 1 : 0}" dx="1">|</tspan>`;
  const composer = typed
    ? `<tspan fill="${C.text}">${esc(typed)}</tspan>${caret}`
    : `${caret}<tspan fill="${C.overlay0}" dx="4">Message #launch</tspan>`;
  const channel = (cy: number, label: string, active = false) => `
    ${active ? `<rect x="${x + 10}" y="${cy - 18}" width="150" height="26" rx="6" fill="${C.surface0}"/>` : ""}
    <text x="${x + 22}" y="${cy}" font-family="${SANS}" font-size="14" fill="${active ? C.text : C.overlay1}" ${active ? `font-weight="bold"` : ""}># ${label}</text>`;

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.base}" stroke="${C.surface0}"/>
    <path d="M${x} ${y + 34} V${y + 12} a12 12 0 0 1 12 -12 H${x + w - 12} a12 12 0 0 1 12 12 V${y + 34} Z" fill="${C.mantle}"/>
    ${trafficLights(x + 20, y + 17)}
    <text x="${x + w / 2}" y="${y + 22}" font-family="${SANS}" font-size="13" fill="${C.subtext0}" text-anchor="middle">Team chat</text>
    <path d="M${x} ${y + 34} H${x + 170} V${y + h} H${x + 12} a12 12 0 0 1 -12 -12 Z" fill="${C.mantle}"/>
    <text x="${x + 22}" y="${y + 66}" font-family="${SANS}" font-size="11" font-weight="bold" letter-spacing="1" fill="${C.overlay0}">CHANNELS</text>
    ${channel(y + 96, "general")}
    ${channel(y + 124, "launch", true)}
    ${channel(y + 152, "design")}
    <text x="${x + 194}" y="${y + 64}" font-family="${SANS}" font-size="16" font-weight="bold" fill="${C.text}"># launch</text>
    <line x1="${x + 170}" y1="${y + 80}" x2="${x + w}" y2="${y + 80}" stroke="${C.surface0}"/>
    ${message(y + 98, "S", C.teal, "Sam", "10:42", "Is the demo build ready for Friday?")}
    ${message(y + 152, "A", C.peach, "Alex", "10:44", "QA signed off this morning.")}
    <rect x="${x + 194}" y="${y + 246}" width="${w - 218}" height="50" rx="9" fill="${C.mantle}" stroke="${phase === "done" ? C.mauve : C.surface1}"/>
    <text x="${x + 212}" y="${y + 276}" font-family="${SANS}" font-size="15">${composer}</text>`;
}

/** A short sound plays when recording starts and stops; show it happening. */
function cueBadge(t: number): string {
  const at = [PRESS, RELEASE].find((moment) => t >= moment && t < moment + 0.7);
  if (at === undefined) return "";
  const age = (t - at) / 0.7;
  // Clear of the fn key, which turns mauve when pressed and would hide it.
  const x = 104;
  const y = 30 - age * 12;
  return `
    <g opacity="${(1 - age).toFixed(2)}" transform="translate(${x} ${y})">
      <text font-family="${SANS}" font-size="20" fill="${C.mauve}">♪</text>
    </g>`;
}

function terminal(t: number): string {
  const x = 40;
  const y = 428;
  const w = 920;
  const h = 132;
  const opacity = terminalOpacity(t);

  const typed = Math.round(
    COMMAND.length * Math.max(0, Math.min(1, (t - TYPE_CMD_FROM) / (TYPE_CMD_TO - TYPE_CMD_FROM))),
  );
  const caret =
    t < TYPE_CMD_TO && Math.floor(t * 2.5) % 2 === 0 ? `<tspan fill="${C.mauve}">|</tspan>` : "";
  const lines = [
    `<tspan fill="${C.mauve}">~</tspan> <tspan fill="${C.green}">❯</tspan> ${esc(COMMAND.slice(0, typed))}${caret}`,
    ...(t >= STARTED
      ? [
          `<tspan fill="${C.subtext0}">mockingbird is running, and will start again at every login.</tspan>`,
          `<tspan fill="${C.overlay0}">Logs: ~/.mockingbird/logs/agent.log</tspan>`,
        ]
      : []),
  ];
  const text = lines
    .map(
      (line, i) =>
        `<text x="${x + 18}" y="${y + 56 + i * 22}" font-family="${MONO}" font-size="14" fill="${C.text}" xml:space="preserve">${line}</text>`,
    )
    .join("");

  // Once it has faded, say why it's still on screen at all.
  const note =
    t > FADE_TO
      ? `<text x="${x + w / 2}" y="${y + h + 26}" font-family="${SANS}" font-size="14" fill="${C.overlay0}" text-anchor="middle">no terminal needed · nothing printed here</text>`
      : "";

  return `
    <g opacity="${opacity.toFixed(2)}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.base}" stroke="${C.surface0}"/>
      <path d="M${x} ${y + 30} V${y + 12} a12 12 0 0 1 12 -12 H${x + w - 12} a12 12 0 0 1 12 12 V${y + 30} Z" fill="${C.mantle}"/>
      ${trafficLights(x + 20, y + 15)}
      <text x="${x + w / 2}" y="${y + 20}" font-family="${SANS}" font-size="12" fill="${C.subtext0}" text-anchor="middle">Terminal</text>
      ${text}
    </g>
    ${note}`;
}

function frame(t: number): string {
  const phase = phaseAt(t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.crust}"/>
    ${fnKey(phase === "recording")}
    ${caption(t, phase)}
    ${chatWindow(t, phase)}
    ${cueBadge(t)}
    ${terminal(t)}
  </svg>`;
}

async function run(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "inherit" });
  if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed`);
}

await rm(FRAMES, { recursive: true, force: true });
await mkdir(FRAMES);
try {
  const count = Math.round(END * FPS);
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const name = join(FRAMES, `frame-${String(i).padStart(4, "0")}`);
    await Bun.write(`${name}.svg`, frame(i / FPS));
    // Rendered at 2x and scaled down by ffmpeg, for smoother text.
    jobs.push(run(["rsvg-convert", "-z", "2", "-o", `${name}.png`, `${name}.svg`]));
  }
  await Promise.all(jobs);

  await run([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(FPS),
    "-i",
    join(FRAMES, "frame-%04d.png"),
    "-filter_complex",
    `scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    OUT,
  ]);
  console.log(`wrote docs/assets/demo.gif (${Math.round(Bun.file(OUT).size / 1024)} KB)`);
} finally {
  await rm(FRAMES, { recursive: true, force: true });
}
