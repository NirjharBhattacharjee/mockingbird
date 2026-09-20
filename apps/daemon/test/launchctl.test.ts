import { describe, expect, test } from "bun:test";
import {
  agentStatus,
  type Launchctl,
  type LaunchctlResult,
  parseDisabled,
  parsePrint,
  restartArgv,
  runAll,
  settle,
  startArgv,
  stopArgv,
} from "../src/agent/launchctl.ts";
import { AGENT_LABEL } from "../src/agent/plist.ts";

const UID = 501;
const ok = (stdout = ""): LaunchctlResult => ({ code: 0, stdout, stderr: "" });

/** Answers each `launchctl` call from a table keyed by its first argument. */
const fake = (
  replies: Record<string, LaunchctlResult>,
  calls: string[][] = [],
): [Launchctl, string[][]] => [
  async (args) => {
    calls.push(args);
    return replies[args[0] ?? ""] ?? ok();
  },
  calls,
];

describe("argv builders", () => {
  test("start enables before kickstart, because kickstart fails on a disabled job", () => {
    expect(startArgv(UID, "/Users/me/Library/LaunchAgents/x.plist")).toEqual([
      ["enable", `gui/501/${AGENT_LABEL}`],
      ["bootstrap", "gui/501", "/Users/me/Library/LaunchAgents/x.plist"],
      ["kickstart", `gui/501/${AGENT_LABEL}`],
    ]);
  });

  test("stop disables first, which is what survives a reboot", () => {
    expect(stopArgv(UID)).toEqual([
      ["disable", `gui/501/${AGENT_LABEL}`],
      ["bootout", `gui/501/${AGENT_LABEL}`],
    ]);
  });

  test("restart kickstarts in place", () => {
    expect(restartArgv(UID)).toEqual([["kickstart", "-k", `gui/501/${AGENT_LABEL}`]]);
  });
});

describe("parsePrint", () => {
  // Shapes taken from real `launchctl print` output on macOS 26.
  const running = `\tstate = running\n\tpid = 76613\n\tlast exit code = (never exited)\n\tpid-local endpoints = {\n\t\tstate = active\n\t}`;

  test("reads the top-level pid and state, not a nested one", () => {
    expect(parsePrint(running)).toEqual({ pid: 76613, state: "running" });
  });

  test("leaves the exit code unset when launchd says it never exited", () => {
    expect(parsePrint(running).lastExitCode).toBeUndefined();
  });

  test("reads a real exit code, under either of the names macOS uses", () => {
    expect(parsePrint("\tstate = not running\n\tlast exit code = 1").lastExitCode).toBe(1);
    expect(parsePrint("\tlast exit status = 143").lastExitCode).toBe(143);
  });
});

describe("parseDisabled", () => {
  const listing = `\tdisabled services = {\n\t\t"com.adobe.GC.AGM" => disabled\n\t\t"${AGENT_LABEL}" => enabled\n\t}`;

  test("an enabled service is not disabled", () => {
    expect(parseDisabled(listing)).toBe(false);
  });

  test("reads both spellings macOS has used", () => {
    expect(parseDisabled(`\t\t"${AGENT_LABEL}" => disabled`)).toBe(true);
    expect(parseDisabled(`\t\t"${AGENT_LABEL}" => true`)).toBe(true);
  });

  test("a label that isn't listed is not disabled", () => {
    expect(parseDisabled(`\t\t"com.other" => disabled`)).toBe(false);
  });
});

describe("agentStatus", () => {
  const notFound: LaunchctlResult = {
    code: 113,
    stdout: "",
    stderr: `Could not find service "${AGENT_LABEL}" in domain for user gui: 501`,
  };

  test("reports not installed before the first start", async () => {
    const [run] = fake({ print: notFound });
    expect(await agentStatus(UID, run)).toEqual({ state: "not-installed" });
  });

  test("distinguishes a durable stop from never having been installed", async () => {
    const [run] = fake({
      print: notFound,
      "print-disabled": ok(`\t\t"${AGENT_LABEL}" => disabled`),
    });
    expect(await agentStatus(UID, run)).toEqual({ state: "stopped" });
  });

  test("reports the pid while it's running", async () => {
    const [run] = fake({ print: ok("\tstate = running\n\tpid = 4821") });
    expect(await agentStatus(UID, run)).toEqual({ state: "running", pid: 4821 });
  });

  test("calls a non-zero exit a crash", async () => {
    const [run] = fake({ print: ok("\tstate = not running\n\tlast exit code = 1") });
    expect(await agentStatus(UID, run)).toEqual({ state: "crashed", lastExitCode: 1 });
  });

  test("a clean exit that isn't disabled is neither running nor crashed", async () => {
    const [run] = fake({ print: ok("\tstate = not running\n\tlast exit code = 0") });
    expect(await agentStatus(UID, run)).toEqual({ state: "exited", lastExitCode: 0 });
  });
});

describe("runAll", () => {
  test("runs every step in order", async () => {
    const [run, calls] = fake({});
    await runAll(
      [
        ["a", "1"],
        ["b", "2"],
      ],
      run,
    );
    expect(calls).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  test("stops at the first failure and says which step failed", async () => {
    const [run, calls] = fake({ b: { code: 5, stdout: "", stderr: "Input/output error" } });
    await expect(runAll([["a"], ["b"], ["c"]], run)).rejects.toThrow(
      "launchctl b failed (5): Input/output error",
    );
    expect(calls.map(([s]) => s)).toEqual(["a", "b"]);
  });

  test("carries on past a failure the caller tolerates", async () => {
    const [run, calls] = fake({ bootout: { code: 3, stdout: "", stderr: "Could not find" } });
    await runAll(
      [["bootout"], ["next"]],
      run,
      (step, result) => step[0] === "bootout" && result.stderr.includes("Could not find"),
    );
    expect(calls.map(([s]) => s)).toEqual(["bootout", "next"]);
  });
});

describe("settle", () => {
  /** Reports "not loaded" for the first `n` calls, then loaded. */
  const appearsAfter = (n: number): Launchctl => {
    let calls = 0;
    return async () =>
      calls++ < n
        ? { code: 113, stdout: "", stderr: "Could not find service" }
        : ok("\tstate = running\n\tpid = 1");
  };

  test("returns once the service is loaded", async () => {
    expect(await settle(UID, "loaded", appearsAfter(2), 2000)).toBe(true);
  });

  test("returns once the service is gone", async () => {
    // bootout is asynchronous, so a stop has to wait for this.
    const run: Launchctl = async () => ({
      code: 113,
      stdout: "",
      stderr: "Could not find service",
    });
    expect(await settle(UID, "gone", run, 2000)).toBe(true);
  });

  test("gives up rather than blocking forever", async () => {
    const run: Launchctl = async () => ok("\tstate = running\n\tpid = 1");
    expect(await settle(UID, "gone", run, 300)).toBe(false);
  });

  test("checks at least once even with no time left", async () => {
    const run: Launchctl = async () => ok("\tstate = running\n\tpid = 1");
    expect(await settle(UID, "loaded", run, 0)).toBe(true);
  });
});
