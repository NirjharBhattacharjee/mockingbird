import {
  accessSync,
  closeSync,
  constants,
  createReadStream,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ASR_MODEL_SETTING,
  CPU_ASR_MODEL,
  DEFAULT_ASR_MODEL,
  englishOnly,
  findAsrModel,
  findWhisperServer,
  isWhisperFile,
  languageModels,
  MAC_ASR_MODEL,
  mockingbirdHome,
  pinnedWhisper,
  savedModelFor,
  spokenLanguage,
  WHISPER_BUILD,
  WHISPER_LANGUAGES,
  wontStart,
} from "./runtime.ts";
import { withStore } from "./transcript/dictionary.ts";

/** `name` is what the progress line calls it; `bytes` is its size, shown before a download. */
export type ModelFile = { name: string; file: string; url: string; sha256: string; bytes?: number };

/**
 * What `mockingbird models pull` downloads. Each one is pinned to a fixed
 * version and checked against its sha256, so a changed, truncated or corrupt
 * file is downloaded again rather than loaded.
 */
const WHISPER_PINS: ModelFile[] = [
  {
    name: "Whisper",
    file: MAC_ASR_MODEL,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-q5_0.bin",
    sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
    bytes: 1_081_140_203,
  },
  {
    name: "Whisper",
    file: CPU_ASR_MODEL,
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin",
    sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    bytes: 190_085_487,
  },
];

export const MODEL_FILES: ModelFile[] = [
  WHISPER_PINS.find((m) => m.file === DEFAULT_ASR_MODEL) as ModelFile,
  {
    name: "VAD",
    file: "silero_vad.onnx",
    url: "https://github.com/snakers4/silero-vad/raw/v6.2.2/src/silero_vad/data/silero_vad.onnx",
    sha256: "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3",
    bytes: 2_327_524,
  },
];

/**
 * MODNet (Apache-2.0), the portrait matting model subject masks run (#260):
 * `models pull modnet` fetches it, never a plain pull, since only a subject
 * mask needs it. The fp32 export from Xenova/modnet, at a pinned commit.
 */
export const MODNET_FILE: ModelFile = {
  name: "MODNet",
  file: "modnet.onnx",
  url: "https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx",
  sha256: "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9",
  bytes: 25_888_640,
};

export async function sha256Of(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of createReadStream(path)) hasher.update(chunk as Buffer);
  return hasher.digest("hex");
}

export type PullFileDeps = {
  fetch?: typeof fetch;
  log?: (message: string) => void;
  /** Bytes written so far, and the size the server gave (0 if it gave none). */
  onProgress?: (done: number, total: number) => void;
  /** How a retry waits; Bun.sleep, injected in tests. */
  wait?: (ms: number) => Promise<void>;
};

/** A failed download that trying again won't fix: a 4xx, or the wrong bytes. */
class FinalError extends Error {}

const TRIES = 3;

/**
 * Downloads one model into `dir`, unless a file with the right checksum is
 * already there. Returns whether it downloaded anything. A 5xx, a 429, a
 * timeout or a dropped connection is tried again (#214), continuing from what
 * arrived; a 404 or a checksum mismatch isn't.
 */
export async function pullFile(
  model: ModelFile,
  dir: string,
  deps: PullFileDeps = {},
): Promise<boolean> {
  const { log = () => {}, wait = Bun.sleep } = deps;
  for (let attempt = 1; ; attempt++) {
    try {
      return await pullOnce(model, dir, deps);
    } catch (error) {
      if (error instanceof FinalError || attempt === TRIES) throw error;
      const seconds = 2 * attempt;
      log(
        `${error instanceof Error ? error.message : String(error)}; trying again in ${seconds} s`,
      );
      await wait(seconds * 1000);
    }
  }
}

async function pullOnce(
  model: ModelFile,
  dir: string,
  { fetch: get = fetch, log = () => {}, onProgress = () => {} }: PullFileDeps,
): Promise<boolean> {
  const path = join(dir, model.file);
  mkdirSync(dir, { recursive: true });
  // A temporary name first, so an interrupted download isn't mistaken for a
  // model. What an interrupted one left behind is kept and continued: on a slow
  // connection, starting a 1 GB file over is what makes an install take an hour.
  // Named for the checksum it's heading for, so a partial of another
  // version of the file is never continued into this one.
  const part = `${path}.${model.sha256.slice(0, 12)}.part`;
  // A partial an older pull left, named without a checksum or for another
  // version, can't be continued into this one: it's 1 GB of nothing kept.
  // Cleared even when the model is already here.
  for (const old of readdirSync(dir)) {
    const stale =
      old === `${model.file}.part` || /^[0-9a-f]{12}\.part$/.test(old.slice(model.file.length + 1));
    if (old.startsWith(`${model.file}.`) && stale && join(dir, old) !== part) {
      rmSync(join(dir, old), { force: true });
      log(`removed ${old}, a partial download of another version`);
    }
  }
  if (existsSync(path) && (await sha256Of(path)) === model.sha256) {
    log(`${model.file} is downloaded`);
    return false;
  }
  const have = existsSync(part) ? statSync(part).size : 0;
  if (have > 0 && (await sha256Of(part)) === model.sha256) {
    renameSync(part, path);
    return true;
  }
  log(
    `downloading ${model.file}${have ? `, continuing from ${size(have, 0)}` : ""}\n  from ${model.url}`,
  );
  let response = await get(model.url, have ? { headers: { range: `bytes=${have}-` } } : {});
  if (response.status === 416) {
    // The part is as long as the file or longer, and wrong, or the checksum
    // above would have matched. Kept, it would fail every pull from now on.
    rmSync(part, { force: true });
    response = await get(model.url, {});
  }
  if (!response.ok || !response.body) {
    const message = `couldn't download ${model.file}: HTTP ${response.status}`;
    // A 5xx, 429 (too many requests) or 408 (timed out) can pass; another 4xx won't.
    const passing = response.status >= 500 || response.status === 429 || response.status === 408;
    throw passing ? new Error(message) : new FinalError(message);
  }
  // 206 is the rest of the file; a server that ignores the range sends all of it.
  const from = response.status === 206 ? have : 0;
  const total = from + (Number(response.headers.get("content-length")) || 0);
  const fd = openSync(part, from ? "a" : "w");
  let done = from;
  try {
    for await (const chunk of response.body) {
      writeSync(fd, chunk);
      done += chunk.byteLength;
      onProgress(done, total === from ? 0 : total);
    }
  } finally {
    closeSync(fd);
  }
  if ((await sha256Of(part)) !== model.sha256) {
    rmSync(part, { force: true });
    throw new FinalError(
      `${model.file} didn't match its expected checksum. Run this again; if it keeps happening, please open an issue.`,
    );
  }
  renameSync(part, path);
  return true;
}

export type PullDeps = PullFileDeps & {
  home?: string;
  /** Injected in tests; the pinned list otherwise. */
  files?: ModelFile[];
  /** The fonts `models pull chrome` downloads; injected in tests. */
  fonts?: ModelFile[];
  /** Their licence files; injected in tests. */
  licences?: ModelFile[];
  modelsDir?: string;
  /** Gets the line from progressLine, at most every quarter second. */
  progress?: (line: string) => void;
};

type Download = { name: string; done: number; total: number };

const bar = (fraction: number) => {
  const full = Math.round(Math.min(1, fraction) * 8);
  return "█".repeat(full) + "░".repeat(8 - full);
};

const size = (done: number, total: number) => {
  if (!total) return `${Math.round(done / 1e6)} MB`;
  return total >= 1e8
    ? `${(done / 1e9).toFixed(1)}/${(total / 1e9).toFixed(1)} GB`
    : `${Math.round(done / 1e6)}/${Math.round(total / 1e6)} MB`;
};

/**
 * One line for the downloads still running, short enough for an 80-column
 * terminal: `Whisper ███░░░░░ 0.4/1.1 GB`.
 * Empty once they've all finished.
 */
export function progressLine(downloads: Download[]): string {
  return downloads
    .filter((d) => !d.total || d.done < d.total)
    .map((d) => `${d.name} ${d.total ? `${bar(d.done / d.total)} ` : ""}${size(d.done, d.total)}`)
    .join("   ");
}

/**
 * The only network calls mockingbird makes (ARCHITECTURE.md §9) are this,
 * the Whisper and VAD models, and pullChrome (Chrome and its fonts). Each runs when the user asks
 * for it and says where each download comes from.
 */
export async function pullModels(deps: PullDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  await pullFiles(deps.files ?? MODEL_FILES, deps.modelsDir ?? join(home, "models"), deps);
  log("All models are downloaded.");
  return 0;
}

async function pullFiles(files: ModelFile[], dir: string, deps: PullDeps) {
  const log = deps.log ?? ((m: string) => console.error(m));
  let shown = 0;
  for (const model of files) {
    const progress = (done: number, total: number) => {
      if (Date.now() - shown < 250) return;
      shown = Date.now();
      deps.progress?.(progressLine([{ name: model.name, done, total }]));
    };
    try {
      await pullFile(model, dir, {
        fetch: deps.fetch,
        log,
        onProgress: progress,
        wait: deps.wait,
      });
    } finally {
      // A pull that has ended leaves the line straight away, so the last
      // thing shown is never a stale byte count.
      deps.progress?.("");
    }
  }
}

/**
 * The headless Chrome that `motion` renders HTML pages in. One version,
 * checked against its sha256, so a page renders the same on every machine.
 * Chrome for Testing publishes no checksums; these are of the zips as
 * downloaded on 2026-11-04.
 */
export const CHROME_VERSION = "156.0.8078.80";
const CHROME_BUILDS: Record<string, { platform: string; sha256: string }> = {
  "darwin-arm64": {
    platform: "mac-arm64",
    sha256: "ea615baa2e9caf0d02d1898a6562b5f8fa9c35239707dae0f592178df5b986ac",
  },
  "darwin-x64": {
    platform: "mac-x64",
    sha256: "535d417d9034cbd11e7dacd1a71aa3d6e1b525e6d5dcd2671eb2532f01481228",
  },
  // Downloaded on 2026-11-05 (#157). Chrome for Testing has no Linux arm64 build.
  "linux-x64": {
    platform: "linux64",
    sha256: "547dcd374e02961bf998f6046a267644f8502225c36bb78ca307dab32a0b3eb4",
  },
  "win32-x64": {
    platform: "win64",
    sha256: "10a77466005e7f64e00f1a75fd1ea81f4a38a60093c65fea6895843b26e60a9a",
  },
};

/**
 * The pinned Chrome for this computer: its zip, the folder it unpacks to in
 * `~/.mockingbird/bin`, and the program in it. None for a platform that has
 * no pin yet.
 */
export function pinnedChrome(
  home = mockingbirdHome(),
  system = `${process.platform}-${process.arch}`,
) {
  const build = CHROME_BUILDS[system];
  if (!build) return undefined;
  const name = `chrome-headless-shell-${build.platform}`;
  const dir = join(home, "bin", `chrome-headless-shell-${CHROME_VERSION}`);
  const zip: ModelFile = {
    name: "Chrome",
    file: `${name}-${CHROME_VERSION}.zip`,
    url: `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${build.platform}/${name}.zip`,
    sha256: build.sha256,
  };
  const exe = system.startsWith("win32") ? ".exe" : "";
  return { zip, dir, program: join(dir, name, `chrome-headless-shell${exe}`) };
}

/** Whether `path` is a file this process may run. */
function runnable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The fonts every page the engine renders can use, so a render looks the
 * same on every machine (#156): Inter, Charis SIL and JetBrains Mono for the
 * motion kit, Noto for scripts the system may not have, and the faces the
 * motion styles and caption presets name (#276). All SIL Open
 * Font License 1.1 (NOTICE.md), from google/fonts at one commit, checked
 * against their sha256. `models pull chrome` downloads them with Chrome.
 */
export const FONTS_COMMIT = "023eedd8780dd254e5905901473ed55e5475ee73";
const FONTS = [
  {
    dir: "inter",
    file: "Inter[opsz,wght].ttf",
    family: "Inter",
    weight: "100 900",
    style: "normal",
    sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
  },
  {
    dir: "inter",
    file: "Inter-Italic[opsz,wght].ttf",
    family: "Inter",
    weight: "100 900",
    style: "italic",
    sha256: "acd98e64795781b2058f07b18475e0ecee2a0fe2b42a49e2f9e37d0d6bf66ce6",
  },
  {
    dir: "charissil",
    file: "CharisSIL-Regular.ttf",
    family: "Charis SIL",
    weight: "400",
    style: "normal",
    sha256: "346337374aa347d64ee015b26d441f1970d8631914e2f3941b00e1c4761e28c5",
  },
  {
    dir: "charissil",
    file: "CharisSIL-Italic.ttf",
    family: "Charis SIL",
    weight: "400",
    style: "italic",
    sha256: "e776e2961117b39cf924c0139de01748a77b2fcb99c437b2c77bdd9401606c13",
  },
  {
    dir: "charissil",
    file: "CharisSIL-Bold.ttf",
    family: "Charis SIL",
    weight: "700",
    style: "normal",
    sha256: "68460d2b76c8f781b49f9168f2c7dc3c9f7b788a3a1b8f267c5fa6bb47d5c64d",
  },
  {
    dir: "charissil",
    file: "CharisSIL-BoldItalic.ttf",
    family: "Charis SIL",
    weight: "700",
    style: "italic",
    sha256: "acdf6dc54c0ee5e03cae3398f64133c335084cd1ecab655f2a8636c5d56acedb",
  },
  {
    dir: "jetbrainsmono",
    file: "JetBrainsMono[wght].ttf",
    family: "JetBrains Mono",
    weight: "100 900",
    style: "normal",
    sha256: "48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda",
  },
  {
    dir: "notosansbengali",
    file: "NotoSansBengali[wdth,wght].ttf",
    family: "Noto Sans Bengali",
    weight: "100 900",
    style: "normal",
    sha256: "dcd42978094e584a849c84a51450eeac40c8826057d566ea6d4b9627a403a05a",
  },
  {
    dir: "notosansdevanagari",
    file: "NotoSansDevanagari[wdth,wght].ttf",
    family: "Noto Sans Devanagari",
    weight: "100 900",
    style: "normal",
    sha256: "14ec4af41f27482216d1c2229f417ff9b1425e1babb014e57d1d40d03229853e",
  },
  {
    dir: "notosansarabic",
    file: "NotoSansArabic[wdth,wght].ttf",
    family: "Noto Sans Arabic",
    weight: "100 900",
    style: "normal",
    sha256: "63111b5b2e074dd48cc67692e0a2726d86ee94c1c37fe8598257b7b4e87e869e",
  },
  {
    dir: "notosanshebrew",
    file: "NotoSansHebrew[wdth,wght].ttf",
    family: "Noto Sans Hebrew",
    weight: "100 900",
    style: "normal",
    sha256: "7ef36a2c3593758cdb622e1bdef4f84523e92fbc3ccc667438dd80ff54c2de88",
  },
  {
    dir: "notosansthai",
    file: "NotoSansThai[wdth,wght].ttf",
    family: "Noto Sans Thai",
    weight: "100 900",
    style: "normal",
    sha256: "5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8",
  },
  {
    dir: "notosanstamil",
    file: "NotoSansTamil[wdth,wght].ttf",
    family: "Noto Sans Tamil",
    weight: "100 900",
    style: "normal",
    sha256: "aa3a9b321f4b0bb2c40203ffbde9af89713227866e0e13f76e5b9eeea727cf88",
  },
  {
    dir: "notosansjp",
    file: "NotoSansJP[wght].ttf",
    family: "Noto Sans JP",
    weight: "100 900",
    style: "normal",
    sha256: "c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f",
  },
  {
    dir: "notosanssc",
    file: "NotoSansSC[wght].ttf",
    family: "Noto Sans SC",
    weight: "100 900",
    style: "normal",
    sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da",
  },
  {
    dir: "notosanskr",
    file: "NotoSansKR[wght].ttf",
    family: "Noto Sans KR",
    weight: "100 900",
    style: "normal",
    sha256: "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252",
  },
  // The display, hand and typewriter faces the motion styles name (#276).
  // Each covers every weight, or two files split it, so Chrome never fakes a
  // bold: a style asking for Anton at 900 gets Anton's one weight.
  {
    dir: "anton",
    file: "Anton-Regular.ttf",
    family: "Anton",
    weight: "1 1000",
    style: "normal",
    sha256: "a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab",
  },
  {
    dir: "bebasneue",
    file: "BebasNeue-Regular.ttf",
    family: "Bebas Neue",
    weight: "1 1000",
    style: "normal",
    sha256: "08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73",
  },
  {
    dir: "oswald",
    file: "Oswald[wght].ttf",
    family: "Oswald",
    weight: "1 1000",
    style: "normal",
    sha256: "5b38c246e255a12f5712d640d56bcced0472466fc68983d2d0410ec0457c2817",
  },
  {
    dir: "archivoblack",
    file: "ArchivoBlack-Regular.ttf",
    family: "Archivo Black",
    weight: "1 1000",
    style: "normal",
    sha256: "dd9a89a019b4849f66ab75455fe7bdf931311042cbb0f0f97acc061539703180",
  },
  {
    dir: "playfairdisplay",
    file: "PlayfairDisplay[wght].ttf",
    family: "Playfair Display",
    weight: "1 1000",
    style: "normal",
    sha256: "c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6",
  },
  {
    dir: "playfairdisplay",
    file: "PlayfairDisplay-Italic[wght].ttf",
    family: "Playfair Display",
    weight: "1 1000",
    style: "italic",
    sha256: "a5e26dc5e2e77fb2803a0bf02fd4f81ee136ec8dea863ccdb0c59a263b21378b",
  },
  {
    dir: "spacegrotesk",
    file: "SpaceGrotesk[wght].ttf",
    family: "Space Grotesk",
    weight: "1 1000",
    style: "normal",
    sha256: "acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72",
  },
  {
    dir: "montserrat",
    file: "Montserrat[wght].ttf",
    family: "Montserrat",
    weight: "1 1000",
    style: "normal",
    sha256: "0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7",
  },
  {
    dir: "bangers",
    file: "Bangers-Regular.ttf",
    family: "Bangers",
    weight: "1 1000",
    style: "normal",
    sha256: "4160a7311de9342674cce9160cde9fcbb30f48190397d86ff1b70b455af65824",
  },
  {
    dir: "nunito",
    file: "Nunito[wght].ttf",
    family: "Nunito",
    weight: "1 1000",
    style: "normal",
    sha256: "bb55a5ca5c2042335b3991af27c4d0705d0ef41cac6164ac737fd8f2a1e85207",
  },
  {
    dir: "cormorantgaramond",
    file: "CormorantGaramond[wght].ttf",
    family: "Cormorant Garamond",
    weight: "1 1000",
    style: "normal",
    sha256: "b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0",
  },
  {
    dir: "cormorantgaramond",
    file: "CormorantGaramond-Italic[wght].ttf",
    family: "Cormorant Garamond",
    weight: "1 1000",
    style: "italic",
    sha256: "0f48ea6abb2084537854f7174c470991a463b13036309e3b50a81511611c530d",
  },
  {
    dir: "fraunces",
    file: "Fraunces[SOFT,WONK,opsz,wght].ttf",
    family: "Fraunces",
    weight: "1 1000",
    style: "normal",
    sha256: "177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb",
  },
  {
    dir: "fraunces",
    file: "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf",
    family: "Fraunces",
    weight: "1 1000",
    style: "italic",
    sha256: "b24448c43702fac4ee856781d461a0dfba8d8e594b6e8e190234b75fed2c0e01",
  },
  {
    dir: "caveat",
    file: "Caveat[wght].ttf",
    family: "Caveat",
    weight: "1 1000",
    style: "normal",
    sha256: "0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988",
  },
  {
    dir: "kalam",
    file: "Kalam-Bold.ttf",
    family: "Kalam",
    weight: "1 1000",
    style: "normal",
    sha256: "2f6576601db015d4f6c08678120277fc8510b98c06e932ce7a6a9cbff4cbdded",
  },
  {
    dir: "vt323",
    file: "VT323-Regular.ttf",
    family: "VT323",
    weight: "1 1000",
    style: "normal",
    sha256: "cf4de751ada78ceac033dbe16a687742939995b77bc2a052ae17a4957958594d",
  },
  {
    dir: "spacemono",
    file: "SpaceMono-Regular.ttf",
    family: "Space Mono",
    weight: "1 599",
    style: "normal",
    sha256: "95837e182baeeada83368f7748db28357f0a1b75c6b84ff7065b5edf933c8e18",
  },
  {
    dir: "spacemono",
    file: "SpaceMono-Bold.ttf",
    family: "Space Mono",
    weight: "600 1000",
    style: "normal",
    sha256: "405e73d41afb7e5906efce206a326af5c956f38e255f35421c260e861e599c59",
  },
  {
    dir: "silkscreen",
    file: "Silkscreen-Regular.ttf",
    family: "Silkscreen",
    weight: "1 599",
    style: "normal",
    sha256: "c845473330b94c2079ce9af01c51ac8ba2d99c24f4d14c039843bbb8e642ebd8",
  },
  {
    dir: "silkscreen",
    file: "Silkscreen-Bold.ttf",
    family: "Silkscreen",
    weight: "600 1000",
    style: "normal",
    sha256: "768476aa712d4f5c3e18d3bce80f980a8bd3f72b7094d22ec5e768df3acfed61",
  },
  {
    dir: "courierprime",
    file: "CourierPrime-Regular.ttf",
    family: "Courier Prime",
    weight: "1 599",
    style: "normal",
    sha256: "72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af",
  },
  {
    dir: "courierprime",
    file: "CourierPrime-Bold.ttf",
    family: "Courier Prime",
    weight: "600 1000",
    style: "normal",
    sha256: "ff1f38786c849d1c41fa8e447960abdb2bd75fdfb0cfcdeb524fad65a5af3638",
  },
  {
    dir: "comicneue",
    file: "ComicNeue-Regular.ttf",
    family: "Comic Neue",
    weight: "1 599",
    style: "normal",
    sha256: "a0ee5a37c8b27c4db0700137d928598b1e23b0089e1546a8961909176b779360",
  },
  {
    dir: "comicneue",
    file: "ComicNeue-Bold.ttf",
    family: "Comic Neue",
    weight: "600 1000",
    style: "normal",
    sha256: "3e7e5fccfd7e0788f317b43312151c1bd5cf058c9697a8d83eac3939050bd61e",
  },
  {
    dir: "arvo",
    file: "Arvo-Regular.ttf",
    family: "Arvo",
    weight: "1 599",
    style: "normal",
    sha256: "f41bd41471ec2db7140351bdde614da5341524503598ff7fe79f3c89c13b605e",
  },
  {
    dir: "arvo",
    file: "Arvo-Bold.ttf",
    family: "Arvo",
    weight: "600 1000",
    style: "normal",
    sha256: "6239b2edee762db0ab99343137c9ba15ae81fc843da2e76a0a395781748cc21f",
  },
] as const;

/**
 * Colour emoji, last in every stack (#276): Noto's COLRv1 build (5 MB, OFL),
 * from googlefonts/noto-emoji since google/fonts only has the 25 MB one with
 * bitmaps too. Vector, so it stays sharp at hook sizes.
 */
export const EMOJI_COMMIT = "99701e07d3d1fe1bdbcdb14964547f0fd592966f";
const EMOJI = {
  file: "Noto-COLRv1.ttf",
  family: "Noto Color Emoji",
  weight: "1 1000",
  style: "normal",
  sha256: "b8e25ea68db82f9e4d0aee921f4420be2be39887bd5c893a2ad98710531f9d0c",
  url: `https://raw.githubusercontent.com/googlefonts/noto-emoji/${EMOJI_COMMIT}/2D/fonts/Noto-COLRv1.ttf`,
} as const;

/** The pinned fonts as downloads: about 57 MB, most of it Chinese, Japanese and Korean. */
export const FONT_FILES: ModelFile[] = [
  ...FONTS.map((f) => ({
    name: f.family,
    file: f.file,
    url: `https://raw.githubusercontent.com/google/fonts/${FONTS_COMMIT}/ofl/${f.dir}/${encodeURIComponent(f.file)}`,
    sha256: f.sha256,
  })),
  { name: EMOJI.family, file: EMOJI.file, url: EMOJI.url, sha256: EMOJI.sha256 },
];

/**
 * Each family's licence, which names its copyright holders: OFL 1.1 asks
 * for the copyright notice and the licence text with every copy (OFL FAQ
 * 1.20). `models pull chrome` puts them in `fonts/licences/`, one per family.
 */
const LICENCE_SHA256: Record<string, string> = {
  anton: "ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4",
  archivoblack: "3173acd82f8c6159b5b1037b539fcbd4edff68e65c2ea8b9412b5a5ca97b08ff",
  arvo: "359671bf16c00cae69cb66d041296b2adc7a4becd73a463cb8c5e101d97c7986",
  bangers: "630dd5a307c0657b094d324e069b390edf90182fe5003639e06c02a0e5769af7",
  bebasneue: "72082f6cb4d04be2ecf7cc7d9e1e7d73787f0af8a5a278a47cade70c16b78341",
  caveat: "1f9d81d094273d82f3898a1ee8b598a717d050ecbf5ff7bede105b704880157b",
  charissil: "0acda775b4dedaf980821f590206a692779ee495170018ee2b9caf1c50fc136a",
  comicneue: "7c38a22e5878e60fe423360553e63dd7be23d29f1f60336034935dbfc96e8320",
  cormorantgaramond: "60700d351cac4650c51f3f9db318d2a420f8b45052dba2715eb5fec41f0f6956",
  courierprime: "9a755af092b494944c99f471be6fddd19b006a448fefdc4717e4ee0aa09a97b0",
  fraunces: "bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b",
  inter: "5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57",
  jetbrainsmono: "b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d",
  kalam: "f62ef357d3a1c3d27edd35a6e1ba350e8a8d13499797964eeadefbf0b3b15d1f",
  montserrat: "8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e",
  notosansarabic: "07fc70bfeb985cc1a87a8587d0a0c80bab11c86c9dc3fd95b6f0cb332f983e96",
  notosansbengali: "754f0e221aa7d5a915489f3bf1f20fe53ddc35ab2834a4d91656d78f9622de70",
  notosansdevanagari: "a216f6f8d85c7228093e0ee5e258d9d377e6671f68acb4db1930b29583d0f331",
  notosanshebrew: "9b9fe028b5ba74d231659a1bbaf0ed09b11e759d1ca6a070999e16d151616b47",
  notosansjp: "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9",
  notosanskr: "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9",
  notosanssc: "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9",
  notosanstamil: "f8ff8ce7d0a81bf8d5e121c635ef027250c531f2fd37d5988b8dd6e45f19d7f1",
  notosansthai: "2e98fd23a52d253db8612cd5942c8f2ff4111b21d2367050fdca91d8ccc374a0",
  nunito: "580df76c95a1ec5ab878ceb25bb3d85c6a076804e9c970c8c6972aea775fdf65",
  oswald: "0fd731a904b729a4e02eaf5e8ebd06783edd9abe400e8882760160230675b652",
  playfairdisplay: "566be814f8e96e93dfa16101331557eb6b5467e9e03f627c0910fe93ca12300e",
  silkscreen: "86c5e9c9382cdcc5948704fdfe60f2aa164a719746931219a42736ecd9cefbd3",
  spacegrotesk: "564ce565c371c5e5bbf286006565a7c9aa55a9f56e7ca58d56e05d649dd61a72",
  spacemono: "8e4ee42b2553e1e01504e61cb0d46d148cd8c9e5eacaa3622a7df2d4f2955b9f",
  vt323: "27d9af34210253e7ca1251fbace86c6f65b40031d6ce1a75493a1b2093631298",
};
export const FONT_LICENCES: ModelFile[] = [
  ...Object.entries(LICENCE_SHA256).map(([dir, sha256]) => ({
    name: `${dir} licence`,
    file: `${dir}.txt`,
    url: `https://raw.githubusercontent.com/google/fonts/${FONTS_COMMIT}/ofl/${dir}/OFL.txt`,
    sha256,
  })),
  {
    name: "Noto Color Emoji licence",
    file: "notocoloremoji.txt",
    url: `https://raw.githubusercontent.com/googlefonts/noto-emoji/${EMOJI_COMMIT}/2D/fonts/LICENSE`,
    sha256: "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2",
  },
];

export type FontFaceFile = { family: string; url: string; weight: string; style: string };

/** The pinned fonts that aren't downloaded yet, by family. */
export function missingFonts(home = mockingbirdHome()): string[] {
  return FONT_FILES.filter((f) => !existsSync(join(home, "fonts", f.file))).map((f) => f.name);
}

/**
 * The pinned fonts that are downloaded, and the user's own, as file URLs for
 * pages to load. A user font is any font file in `fonts/user/`, used by its
 * file name: `Brand Sans.ttf` is the family "Brand Sans", `Brand Sans
 * Italic.otf` its italic (#276). As many as you like, free.
 */
export function fontFaces(home = mockingbirdHome()): FontFaceFile[] {
  const dir = join(home, "fonts");
  const pinned = [...FONTS, EMOJI]
    .filter((f) => existsSync(join(dir, f.file)))
    .map((f) => ({
      family: f.family,
      url: pathToFileURL(join(dir, f.file)).href,
      weight: f.weight,
      style: f.style,
    }));
  return [...pinned, ...userFonts(join(dir, "user"))];
}

/** The font files in `dir`, each a family named after its file. */
export function userFonts(dir: string): FontFaceFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))
    .sort()
    .map((f) => {
      const name = f.replace(/\.[^.]+$/, "");
      const italic = / italic$/i.test(name);
      return {
        family: italic ? name.replace(/ italic$/i, "") : name,
        url: pathToFileURL(join(dir, f)).href,
        weight: "1 1000",
        style: italic ? "italic" : "normal",
      };
    });
}

/** The Chrome to render in: MOCKINGBIRD_CHROME, or the pinned one once it's pulled. */
export function findChrome(env = process.env, home = mockingbirdHome(env)): string | undefined {
  if (env.MOCKINGBIRD_CHROME)
    return runnable(env.MOCKINGBIRD_CHROME) ? env.MOCKINGBIRD_CHROME : undefined;
  const program = pinnedChrome(home)?.program;
  return program && existsSync(program) ? program : undefined;
}

/**
 * `mockingbird models pull chrome`: downloads the pinned Chrome, unpacks it
 * into `~/.mockingbird/bin`, and removes any other version found there.
 */
export async function pullChrome(deps: PullDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  const pin = pinnedChrome(home);
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  // One pull at a time: two would share the download and the unpacking folder.
  const lock = join(bin, ".chrome-pull.lock");
  const holder = takeLock(lock);
  if (holder) {
    log(`Another \`mockingbird models pull chrome\` (pid ${holder}) is running; wait for it.`);
    return 1;
  }
  try {
    if (pin) await installChrome(pin, bin, deps);
    // The fonts even with no pin, for a MOCKINGBIRD_CHROME to use.
    await pullFiles(deps.fonts ?? FONT_FILES, join(home, "fonts"), deps);
    // Their licences beside them; not when a test passes its own fonts. A
    // licence that won't download is said, not a failed pull: the fonts work.
    await pullFiles(
      deps.licences ?? (deps.fonts ? [] : FONT_LICENCES),
      join(home, "fonts", "licences"),
      deps,
    ).catch((error) => {
      (deps.log ?? console.error)(
        `The fonts' licences didn't download (${error instanceof Error ? error.message : error}); run \`mockingbird models pull chrome\` again for them.`,
      );
    });
  } finally {
    rmSync(lock, { force: true });
  }
  if (!pin) {
    log(
      `The fonts are downloaded, but there's no pinned Chrome for ${process.platform}-${process.arch} yet: set MOCKINGBIRD_CHROME to one that runs here.`,
    );
    return 1;
  }
  log(`Chrome ${CHROME_VERSION} and its fonts are downloaded.`);
  return 0;
}

/**
 * Takes the lock file at `lock` for this process, or returns the pid of the
 * running one that holds it. The pid is written before the lock appears (a
 * hard link fails if the name is taken), so it's never seen empty. A lock
 * whose process has gone is taken over.
 * ponytail: two pulls taking over the same stale lock at once can both win.
 */
function takeLock(lock: string): number | undefined {
  const mine = `${lock}.${process.pid}`;
  writeFileSync(mine, String(process.pid));
  try {
    for (;;) {
      try {
        linkSync(mine, lock);
        return undefined;
      } catch (error) {
        // Taken: see who by. Anything else (a read-only folder, say) won't change by trying again.
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      let holder = 0;
      try {
        holder = Number(readFileSync(lock, "utf8"));
      } catch {
        continue; // released meanwhile: try again
      }
      if (alive(holder)) return holder;
      rmSync(lock, { force: true });
    }
  } finally {
    rmSync(mine, { force: true });
  }
}

/** Whether a process with this pid is running. */
function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it's there, run by someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function installChrome(
  pin: NonNullable<ReturnType<typeof pinnedChrome>>,
  bin: string,
  deps: PullDeps,
) {
  if (!existsSync(pin.program)) {
    await pullFiles([pin.zip], bin, deps);
    const zip = join(bin, pin.zip.file);
    // Unpacked beside the target and renamed into place, so a half-unpacked Chrome is never found.
    const unpacking = `${pin.dir}.part`;
    rmSync(unpacking, { recursive: true, force: true });
    mkdirSync(unpacking, { recursive: true });
    unpack(zip, unpacking);
    rmSync(pin.dir, { recursive: true, force: true });
    renameSync(unpacking, pin.dir);
    rmSync(zip, { force: true });
  }
  for (const old of readdirSync(bin)) {
    if (old.startsWith("chrome-headless-shell-") && join(bin, old) !== pin.dir) {
      rmSync(join(bin, old), { recursive: true, force: true });
    }
  }
}

/**
 * Unpacks `archive` (a .zip, or a .tar.gz) into `into`, which is beside it and
 * exists. Windows has no unzip, and its own tar.exe reads zips, but not Git
 * Bash's GNU tar, often first on the PATH, which takes "D:" for a remote host.
 * tar.exe also can't open a path with non-ASCII letters in it, as a user
 * folder can have, so it runs in the folder with names that are ASCII.
 */
function unpack(archive: string, into: string) {
  const win = process.platform === "win32";
  const argv = win
    ? [
        join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"),
        ...["-xf", basename(archive), "-C", basename(into)],
      ]
    : archive.endsWith(".zip")
      ? ["unzip", "-q", archive, "-d", into]
      : ["tar", "-xf", archive, "-C", into];
  const r = Bun.spawnSync(argv, { stderr: "pipe", cwd: win ? dirname(archive) : undefined });
  if (r.exitCode !== 0) {
    rmSync(into, { recursive: true, force: true });
    throw new Error(`couldn't unpack ${archive}: ${r.stderr.toString().trim()}`);
  }
}

/**
 * `mockingbird models pull` on Linux and Windows also downloads whisper-server
 * and unpacks it into `~/.mockingbird/bin`. Returns 0 where there's no pin
 * (macOS: Homebrew's).
 */
export async function pullWhisper(
  deps: PullDeps & { force?: boolean; starts?: typeof wontStart } = {},
): Promise<number> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const home = deps.home ?? mockingbirdHome();
  const pin = pinnedWhisper(home);
  if (!pin) return 0;
  // A plain `models pull` keeps one that's there; `models pull whisper-server`
  // unpacks it again, to repair a damaged one.
  if (existsSync(pin.program) && !deps.force) {
    log(`whisper-server ${WHISPER_BUILD} is downloaded`);
    return 0;
  }
  // The override always wins, so the pin would never run: where whisper.cpp's
  // build can't (glibc 2.28-2.33), every pull would fetch it again for nothing.
  const override = process.env.MOCKINGBIRD_WHISPER_SERVER;
  if (override && !deps.force) {
    log(`whisper-server: using ${override} (MOCKINGBIRD_WHISPER_SERVER), not downloading one`);
    return 0;
  }
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  // One pull at a time: two would share the download and the unpacking folder.
  const lock = join(bin, ".whisper-pull.lock");
  const holder = takeLock(lock);
  if (holder) {
    log(`Another \`mockingbird models pull\` (pid ${holder}) is running; wait for it.`);
    return 1;
  }
  try {
    await pullFiles([pin.archive], bin, deps);
    const archive = join(bin, pin.archive.file);
    // Unpacked beside the target and renamed into place, so a half-unpacked one
    // is never found.
    const unpacking = `${pin.dir}.part`;
    rmSync(unpacking, { recursive: true, force: true });
    mkdirSync(unpacking, { recursive: true });
    unpack(archive, unpacking);
    rmSync(archive, { force: true });
    // whisper.cpp's Ubuntu build needs a newer glibc than Bun does: on glibc
    // 2.28-2.33 it unpacks but can't load (#223). It's tried where it was
    // unpacked, so one that can't run is never where transcribe looks, and a
    // working one there before (or on the PATH) stays the one used.
    const starts = deps.starts ?? wontStart;
    const why = await starts(join(unpacking, relative(pin.dir, pin.program)));
    if (why) {
      rmSync(unpacking, { recursive: true, force: true });
      const other = findWhisperServer(process.env, home);
      if (other && !(await starts(other))) {
        log(
          `whisper.cpp's whisper-server ${WHISPER_BUILD} doesn't run here (${why}); using ${other}.`,
        );
        return 0;
      }
      log(
        `whisper.cpp's whisper-server ${WHISPER_BUILD} doesn't run on this computer: ${why}\n` +
          "Install one built for it (`brew install whisper-cpp`, or build whisper.cpp from source) " +
          "and put it on your PATH, or set MOCKINGBIRD_WHISPER_SERVER to it, then run this again.",
      );
      return 1;
    }
    // The one there stays until the new one is in place.
    const old = `${pin.dir}.old`;
    rmSync(old, { recursive: true, force: true });
    if (existsSync(pin.dir)) renameSync(pin.dir, old);
    try {
      renameSync(unpacking, pin.dir);
    } catch (error) {
      if (existsSync(old)) renameSync(old, pin.dir);
      throw error;
    }
    rmSync(old, { recursive: true, force: true });
  } finally {
    rmSync(lock, { force: true });
  }
  log(`whisper-server ${WHISPER_BUILD} is downloaded.`);
  return 0;
}

export type ModelsDeps = {
  home?: string;
  /** Where the Whisper files are; `~/.mockingbird/models` by default. */
  modelsDir?: string;
  out?: (line: string) => void;
  log?: (message: string) => void;
  env?: Record<string, string | undefined>;
};

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** `ggml-large-v3-turbo-q8_0.bin` → `large-v3-turbo Q8_0`. */
export function speechName(file: string): string {
  return file
    .replace(/^ggml-/, "")
    .replace(/\.bin$/, "")
    .replace(/-(q\d\w*|f16)$/i, (_, quant: string) => ` ${quant.toUpperCase()}`);
}

export type SpeechModel = {
  name: string;
  file: string;
  size: number;
  inUse: boolean;
  isDefault: boolean;
};

/**
 * The Whisper files in models/, largest first. The one in use is what
 * transcription picks: the environment, then the saved choice, then the
 * default.
 */
export function listModels(deps: ModelsDeps = {}): SpeechModel[] {
  const env = deps.env ?? process.env;
  const home = deps.home ?? mockingbirdHome(env);
  const dir = deps.modelsDir ?? join(home, "models");
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(isWhisperFile);
  } catch {
    // No models folder yet: `mockingbird models pull` makes it.
  }
  let inUse: string | undefined;
  try {
    const saved = savedModelFor(spokenLanguage(env), home, dir);
    inUse = basename(findAsrModel(dir, env.MOCKINGBIRD_ASR_MODEL, () => {}, saved));
  } catch {
    // None installed: nothing is in use.
  }
  // A ".en" model only knows English, so it's no choice in another language,
  // unless it's the one in use: that is what the startup warning is about.
  if (spokenLanguage(env) !== "en")
    files = files.filter((file) => !englishOnly(file) || file === inUse);
  // An entry that can't be read (a broken link, a file deleted meanwhile) is
  // left out rather than failing the whole list.
  return files
    .flatMap((file) => {
      try {
        return [{ file, size: statSync(join(dir, file)).size }];
      } catch {
        return [];
      }
    })
    .map(({ file, size }) => ({
      name: speechName(file),
      file,
      size,
      inUse: file === inUse,
      isDefault: file === DEFAULT_ASR_MODEL,
    }))
    .sort((a, b) => b.size - a.size);
}

const USAGE =
  "usage: mockingbird models | models use <file> [--language <code>] | models use --default [--language <code>]\n" +
  "       models pull [<name or URL> [--sha256 <hex>] [--as <ggml-name.bin>]] | models pull chrome | models pull modnet";

/** Where `models pull <name>` finds an official model: whisper.cpp's own Hugging Face repo. */
const OFFICIAL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

/**
 * A model to download, from a name (`large-v3-turbo`, `ggml-small.bin`) or
 * an https URL, with the sha256 it must match (#143). Hugging Face gives a
 * file's sha256 and the commit it's at in its headers, so a name or a
 * Hugging Face URL needs nothing else, and the download is pinned to that
 * commit. Any other URL needs `sha256`.
 */
export async function resolveModel(
  spec: string,
  { sha256, as, fetch: get = fetch }: { sha256?: string; as?: string; fetch?: typeof fetch } = {},
): Promise<ModelFile & { bytes?: number }> {
  const url = /^https?:\/\//.test(spec)
    ? // A Hugging Face page link (/blob/) is the viewer; /resolve/ is the file.
      spec.replace(/^(https:\/\/(?:huggingface\.co|hf\.co)\/[^/]+\/[^/]+)\/blob\//, "$1/resolve/")
    : `${OFFICIAL}ggml-${spec.replace(/^ggml-/, "").replace(/\.bin$/, "")}.bin`;
  if (!url.startsWith("https://"))
    throw new Error(`${spec}: only https downloads, so the file can't be swapped on the way`);
  const file = as ?? decodeURIComponent(basename(new URL(url).pathname));
  if (!isWhisperFile(file)) {
    throw new Error(
      `${file} isn't named like a Whisper model; give it a name with --as ggml-<name>.bin`,
    );
  }
  if (sha256 !== undefined && !/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new Error(`--sha256 takes the 64 hex digits of the file's SHA-256`);
  }
  // Not followed: Hugging Face's own reply carries the checksum, the CDN's doesn't.
  const head = await get(url, { method: "HEAD", redirect: "manual" });
  if (head.status === 404 || head.status === 401)
    throw new Error(`no model at ${url} (HTTP ${head.status})`);
  // Only Hugging Face's own reply is trusted for a checksum: any server can
  // send these headers, and one that names its own sha256 proves nothing.
  const fromHf = ["huggingface.co", "hf.co"].includes(new URL(url).host);
  const linked = fromHf ? head.headers.get("x-linked-etag")?.replace(/"/g, "") : undefined;
  const known = linked && /^[0-9a-f]{64}$/i.test(linked) ? linked.toLowerCase() : undefined;
  if (sha256 && known && sha256.toLowerCase() !== known) {
    throw new Error(`${url}'s SHA-256 is ${known}, not the ${sha256} given`);
  }
  const expected = sha256?.toLowerCase() ?? known;
  if (!expected) {
    throw new Error(
      `${url} doesn't say its SHA-256; give the one its publisher lists with --sha256`,
    );
  }
  const commit = fromHf ? head.headers.get("x-repo-commit") : null;
  return {
    name: speechName(file),
    file,
    // Pinned to the commit checked, whatever branch or tag the link named.
    url:
      commit && /^[0-9a-f]{7,40}$/.test(commit)
        ? url.replace(/\/resolve\/[^/]+\//, `/resolve/${commit}/`)
        : url,
    sha256: expected,
    bytes: Number(head.headers.get("x-linked-size")) || undefined,
  };
}

/**
 * `mockingbird models` lists the Whisper models; `models use <file>` picks
 * the one transcription uses, and `models use --default` goes back.
 */
export function modelsCommand(args: string[], deps: ModelsDeps = {}): number {
  const env = deps.env ?? process.env;
  const home = deps.home ?? mockingbirdHome(env);
  const out = deps.out ?? ((l: string) => console.log(l));
  const log = deps.log ?? ((m: string) => console.error(m));

  if (args.length === 0) {
    const models = listModels(deps);
    if (models.length === 0) {
      out("No transcription model yet. `mockingbird models pull` downloads one.");
      return 0;
    }
    const width = Math.max(...models.map((m) => m.file.length)) + 2;
    out(`${"model".padEnd(width)}size`);
    for (const m of models) {
      const mark = [m.inUse && "in use", m.isDefault && "default"].filter(Boolean).join(", ");
      out(`${m.file.padEnd(width)}${gb(m.size).padEnd(9)}${mark}`.trimEnd());
    }
    const mapped = languageModels(home);
    if (mapped.length) {
      out("\nBy language:");
      for (const [language, file] of mapped) out(`  ${language.padEnd(4)}${file}`);
    }
    out(
      "\nSwitch with `mockingbird models use <file>` (`--language <code>` for one language);" +
        " `--default` goes back.",
    );
    return 0;
  }

  // Read as MOCKINGBIRD_LANGUAGE is: lower case, region dropped (de-DE is de).
  const language = args.includes("--language")
    ? args[args.indexOf("--language") + 1]?.toLowerCase().split(/[-_]/)[0]
    : undefined;
  const rest = language
    ? args.filter(
        (_, i) => i !== args.indexOf("--language") && i !== args.indexOf("--language") + 1,
      )
    : args;
  const [verb, choice, ...extra] = rest;
  if (verb !== "use" || !choice || extra.length > 0 || (args.includes("--language") && !language)) {
    log(USAGE);
    return 2;
  }
  if (language && !WHISPER_LANGUAGES.has(language)) {
    log(`${language} isn't a language Whisper knows; use a code like bn, de or hi.`);
    return 2;
  }
  let model: string | undefined;
  if (choice !== "--default") {
    const dir = deps.modelsDir ?? join(home, "models");
    if (!isWhisperFile(choice) || !existsSync(join(dir, choice))) {
      log(`${choice} isn't in ${dir}. \`mockingbird models\` lists the ones that are.`);
      return 1;
    }
    model = choice;
  }
  const key = language ? `${ASR_MODEL_SETTING}.${language}` : ASR_MODEL_SETTING;
  withStore((store) => store.setSetting(key, model), home, log);
  log(
    language
      ? `transcription model for ${language}: ${model ?? "the one for every language"}`
      : `transcription model: ${model ?? "the default"}`,
  );
  if (env.MOCKINGBIRD_ASR_MODEL) {
    log(
      `note: MOCKINGBIRD_ASR_MODEL=${env.MOCKINGBIRD_ASR_MODEL} is set in this shell and wins over this choice.`,
    );
  }
  return 0;
}
