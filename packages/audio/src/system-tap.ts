import { CString, dlopen, FFIType, ptr } from "bun:ffi";

/**
 * System audio, the other side of a call (#94), from a Core Audio process
 * tap (macOS 14.2+; ARCHITECTURE.md §16). The tap goes into an aggregate
 * device that ffmpeg records like a microphone.
 *
 * The tap is built through the Objective-C runtime with no type checking, and
 * a wrong call crashes the process that makes it. So it runs in a child
 * process of its own: a crash there loses system audio, not dictation. The tap
 * and the device go when that process exits, which it does when its stdin
 * closes, so they live exactly as long as the recording, even if the parent
 * dies.
 */
export type SystemAudio = {
  /** The aggregate device's name, as ffmpeg's avfoundation takes it. */
  device: string;
  /** Tears the tap down and waits for the child to go. */
  close(): Promise<void>;
};

/**
 * Starts the tap's process and waits for its device, or says why there's
 * none. Undefined means record the microphone only.
 */
export async function startSystemAudio(
  log: (message: string) => void,
  { timeoutMs = 5000 } = {},
): Promise<SystemAudio | undefined> {
  const child = Bun.spawn([process.execPath, import.meta.path], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const line = await Promise.race([
    readLine(child.stdout),
    Bun.sleep(timeoutMs).then(() => "timed out"),
  ]);
  if (!line.startsWith("ready ")) {
    child.kill();
    const why = line || (await new Response(child.stderr).text()).trim() || "no reason given";
    log(`recording the microphone only: no system audio (${why})`);
    return undefined;
  }
  return {
    device: line.slice("ready ".length),
    async close() {
      try {
        child.stdin.end();
      } catch {
        // Already gone.
      }
      const gone = await Promise.race([child.exited, Bun.sleep(2000).then(() => undefined)]);
      if (gone === undefined) child.kill("SIGKILL");
    },
  };
}

async function readLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    text += new TextDecoder().decode(chunk);
    const end = text.indexOf("\n");
    if (end >= 0) return text.slice(0, end);
  }
  return text;
}

const { ptr: P, cstring: S, i32, u32, i64, bool } = FFIType;

/** The child: builds the tap and its device, prints `ready <device>`, waits. */
async function main(): Promise<void> {
  const objc = "/usr/lib/libobjc.A.dylib";
  const send = (args: FFIType[], returns: FFIType) =>
    dlopen(objc, { objc_msgSend: { args: [P, P, ...args], returns } }).symbols.objc_msgSend;
  const rt = dlopen(objc, {
    objc_getClass: { args: [S], returns: P },
    sel_registerName: { args: [S], returns: P },
  }).symbols;
  // Loads Foundation, for NSString and friends; NSLog itself goes unused.
  dlopen("/System/Library/Frameworks/Foundation.framework/Foundation", {
    NSLog: { args: [P], returns: FFIType.void },
  });
  const ca = dlopen("/System/Library/Frameworks/CoreAudio.framework/CoreAudio", {
    AudioHardwareCreateProcessTap: { args: [P, P], returns: i32 },
    AudioHardwareDestroyProcessTap: { args: [u32], returns: i32 },
    AudioHardwareCreateAggregateDevice: { args: [P, P], returns: i32 },
    AudioHardwareDestroyAggregateDevice: { args: [u32], returns: i32 },
    AudioObjectGetPropertyData: { args: [u32, P, u32, P, P, P], returns: i32 },
  }).symbols;

  const cstr = (s: string) => Buffer.from(`${s}\0`);
  const cls = (name: string) => rt.objc_getClass(cstr(name));
  const sel = (name: string) => rt.sel_registerName(cstr(name));
  const send0 = send([], P);
  const send1 = send([P], P);
  const send2 = send([P, P], P);
  const nsString = (s: string) =>
    send([S], P)(cls("NSString"), sel("stringWithUTF8String:"), cstr(s));
  const nsNumber = (n: number) => send([i32], P)(cls("NSNumber"), sel("numberWithInt:"), n);
  const nsArray = (item: unknown) => send1(cls("NSArray"), sel("arrayWithObject:"), item as never);
  const dict = (entries: [string, unknown][]) => {
    const d = send0(cls("NSMutableDictionary"), sel("dictionary"));
    for (const [k, v] of entries) send2(d, sel("setObject:forKey:"), v as never, nsString(k));
    return d;
  };
  const fail = (why: string): never => {
    console.log(`error ${why}`);
    process.exit(1);
  };
  const fourcc = (s: string) => [...s].reduce((n, c) => (n << 8) | c.charCodeAt(0), 0) >>> 0;
  const property = (object: number, selector: string, out: Uint8Array) =>
    ca.AudioObjectGetPropertyData(
      object,
      ptr(new Uint32Array([fourcc(selector), fourcc("glob"), 0])),
      0,
      null,
      ptr(new Uint32Array([out.byteLength])),
      ptr(out),
    );

  // The device the tap is clocked by: without one, it records silence.
  const output = new Uint32Array(1);
  const outputUid = new BigUint64Array(1); // a CFStringRef, toll-free an NSString
  if (
    property(1, "dOut", new Uint8Array(output.buffer)) !== 0 ||
    property(output[0] as number, "uid ", new Uint8Array(outputUid.buffer)) !== 0
  ) {
    fail("couldn't find the output device");
  }

  // Every app's output, mixed to stereo, left audible.
  if (!cls("CATapDescription")) fail("this macOS has no process taps (needs 14.2 or later)");
  const description = send1(
    send0(cls("CATapDescription"), sel("alloc")),
    sel("initStereoGlobalTapButExcludeProcesses:"),
    send0(cls("NSArray"), sel("array")),
  );
  send([bool], FFIType.void)(description, sel("setPrivate:"), false);
  send([i64], FFIType.void)(description, sel("setMuteBehavior:"), 0n as never);
  const uuid = new CString(
    send0(send0(send0(description, sel("UUID")), sel("UUIDString")), sel("UTF8String")) as never,
  ).toString();
  const tap = new Uint32Array(1);
  const tapStatus = ca.AudioHardwareCreateProcessTap(description as never, ptr(tap));
  if (tapStatus !== 0) fail(`Core Audio refused the tap (${tapStatus})`);

  const name = `mockingbird system audio ${uuid.slice(0, 8)}`;
  const uid = Number(outputUid[0]);
  const device = new Uint32Array(1);
  const deviceStatus = ca.AudioHardwareCreateAggregateDevice(
    dict([
      ["uid", nsString(`mockingbird-${uuid}`)],
      ["name", nsString(name)],
      ["private", nsNumber(0)], // ffmpeg, another process, has to see it
      ["master", uid],
      ["subdevices", nsArray(dict([["uid", uid]]))],
      [
        "taps",
        nsArray(
          dict([
            ["uid", nsString(uuid)],
            ["drift", nsNumber(1)],
          ]),
        ),
      ],
      ["tapautostart", nsNumber(1)],
    ]) as never,
    ptr(device),
  );
  const teardown = () => {
    if (device[0]) ca.AudioHardwareDestroyAggregateDevice(device[0]);
    ca.AudioHardwareDestroyProcessTap(tap[0] as number);
  };
  if (deviceStatus !== 0) {
    teardown();
    fail(`Core Audio refused the device (${deviceStatus})`);
  }
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      teardown();
      process.exit(0);
    });
  }
  console.log(`ready ${name}`);
  // Until the parent closes stdin, or dies, which closes it too.
  for await (const _ of Bun.stdin.stream()) {
    // Nothing is sent; this only waits.
  }
  teardown();
}

if (import.meta.main) await main();
