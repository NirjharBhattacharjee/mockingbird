/**
 * HDR pictures brought to SDR (#252). Phones record HDR by default (an
 * iPhone: HEVC, 10-bit, BT.2020, HLG), and encoded as 8-bit SDR without a
 * conversion they come out flat and grey. Homebrew's ffmpeg has neither
 * zscale nor libplacebo, so the conversion is a 3D LUT made here and applied
 * with lut3d, which every ffmpeg has.
 */
import { createHash } from "node:crypto";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quoted } from "./effects.ts";

/** An HDR transfer: hybrid log-gamma, or PQ (SMPTE ST 2084). */
export type Transfer = "hlg" | "pq";

/** The HDR transfer ffprobe's `color_transfer` names, or undefined for SDR. */
export function transferOf(trc = ""): Transfer | undefined {
  if (trc === "arib-std-b67") return "hlg";
  if (trc === "smpte2084") return "pq";
  return undefined;
}

/** HDR's reference white (BT.2408). */
const WHITE_NITS = 203;
/** Where reference white lands in SDR, as display light 0-1. */
export const WHITE = 0.56;
/** Below this display light the picture is left as it is; above it, highlights roll off. */
const KNEE = 0.5;

/** BT.2100 HLG's inverse OETF: the signal to scene light, 0-1. */
function hlgLight(v: number): number {
  const a = 0.17883277;
  const b = 1 - 4 * a;
  const c = 0.5 - a * Math.log(4 * a);
  return v <= 0.5 ? (v * v) / 3 : (Math.exp((v - c) / a) + b) / 12;
}

/** SMPTE ST 2084's EOTF: the signal to display light, in nits. */
function pqNits(v: number): number {
  const m1 = 2610 / 16384;
  const m2 = (2523 / 4096) * 128;
  const c1 = 3424 / 4096;
  const c2 = (2413 / 4096) * 32;
  const c3 = (2392 / 4096) * 32;
  const p = v ** (1 / m2);
  return 10000 * (Math.max(p - c1, 0) / (c2 - c3 * p)) ** (1 / m1);
}

/** Linear BT.2020 RGB to linear BT.709 RGB. */
const TO_709 = [
  [1.6605, -0.5876, -0.0728],
  [-0.1246, 1.1329, -0.0083],
  [-0.0182, -0.1006, 1.1187],
];

/** Light at or under the knee as it is; above, a curve that meets it smoothly and never passes 1. */
const rolloff = (y: number) => {
  if (y <= KNEE) return y;
  const x = (y - KNEE) / (1 - KNEE);
  return KNEE + (1 - KNEE) * (x / (1 + x));
};

/**
 * One HDR colour (signal values 0-1, BT.2020) as SDR BT.709 signal values:
 * to display light with SDR white at 1, into BT.709's primaries, the
 * brightness rolled off above the knee with its hue kept, out-of-gamut
 * colours pulled toward their grey rather than clipped, and encoded for a
 * BT.1886 display (gamma 2.4).
 */
export function toSdr([r, g, b]: number[], transfer: Transfer): number[] {
  let rgb: number[];
  if (transfer === "hlg") {
    // The OOTF for a 1000-nit display: system gamma 1.2 on the scene's brightness.
    const scene = [r, g, b].map((v) => hlgLight(v ?? 0));
    const [sr = 0, sg = 0, sb = 0] = scene;
    const ys = 0.2627 * sr + 0.678 * sg + 0.0593 * sb;
    const gain = ys > 0 ? ys ** 0.2 : 0;
    rgb = scene.map((e) => ((1000 * gain * e) / WHITE_NITS) * WHITE);
  } else {
    rgb = [r, g, b].map((v) => (pqNits(v ?? 0) / WHITE_NITS) * WHITE);
  }
  const lin = TO_709.map((row) => row.reduce((sum, k, i) => sum + k * (rgb[i] ?? 0), 0));
  const y = 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  const to = rolloff(y);
  const scaled = y > 0 ? lin.map((c) => (c * to) / y) : [0, 0, 0];
  // Pull every channel toward the grey of the same brightness just far enough to fit 0-1.
  const hi = Math.max(...scaled);
  const lo = Math.min(...scaled);
  const keep = Math.min(1, hi > 1 ? (1 - to) / (hi - to) : 1, lo < 0 ? to / (to - lo) : 1);
  return scaled.map((c) => Math.min(1, Math.max(0, to + (c - to) * keep)) ** (1 / 2.4));
}

/** The conversion as a .cube 3D LUT, `size` points a side, red changing fastest. */
export function cube(transfer: Transfer, size = 33): string {
  const lines = [`TITLE "mockingbird ${transfer} to SDR BT.709"`, `LUT_3D_SIZE ${size}`];
  const n = size - 1;
  for (let b = 0; b <= n; b++) {
    for (let g = 0; g <= n; g++) {
      for (let r = 0; r <= n; r++) {
        lines.push(
          toSdr([r / n, g / n, b / n], transfer)
            .map((v) => v.toFixed(6))
            .join(" "),
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Each LUT's text, made once a process: about 20 ms each. */
const cubes = new Map<Transfer, string>();

/**
 * The LUT's file, kept in the temp folder. It's named by what's in it, so a
 * change to the conversion makes a new file and an old one is never used.
 */
export function lutFile(transfer: Transfer, dir = tmpdir()): string {
  const text = cubes.get(transfer) ?? cube(transfer);
  cubes.set(transfer, text);
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const file = join(dir, `mockingbird-${transfer}-to-sdr-${hash}.cube`);
  if (!existsSync(file)) {
    // Its own temp name, so two renders making it at once don't write one file.
    const part = `${file}.${process.pid}-${Date.now()}.part`;
    writeFileSync(part, text);
    renameSync(part, file);
  }
  return file;
}

/**
 * The filters that bring an HDR picture to SDR: its BT.2020 YUV to RGB, the
 * LUT, back to BT.709 YUV, and the frames labelled BT.709 so every encode
 * after tags the file SDR.
 */
export function sdrFilters(lut: string): string {
  return [
    "scale=in_color_matrix=bt2020:in_range=tv",
    "format=gbrp16le",
    `lut3d=file=${quoted(lut)}:interp=trilinear`,
    "scale=out_color_matrix=bt709:out_range=tv",
    "format=yuv420p",
    "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
  ].join(",");
}

/** The filters for a picture with this transfer: the SDR conversion for HDR, nothing for SDR. */
export const toSdrFor = (transfer?: Transfer) =>
  transfer ? sdrFilters(lutFile(transfer)) : undefined;
