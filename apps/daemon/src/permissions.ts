export type Permission = "input-monitoring" | "accessibility" | "microphone";

const PANES: Record<Permission, { name: string; url: string; for: string }> = {
  "input-monitoring": {
    name: "Input Monitoring",
    url: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
    for: "for the Fn key",
  },
  accessibility: {
    name: "Accessibility",
    url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    for: "to type into other apps",
  },
  microphone: {
    name: "Microphone",
    url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    for: "to hear you",
  },
};

/** The permission behind a System Settings pane name. */
export function paneFor(name: string): Permission {
  const match = (Object.keys(PANES) as Permission[]).find((p) => PANES[p].name === name);
  return match ?? "accessibility";
}

/**
 * What to tell the user when permissions are missing. `app` is the app that
 * needs them: the terminal listen runs in, since macOS grants them per app.
 */
export function permissionHelp(
  missing: [Permission, ...Permission[]],
  app = "your terminal",
): string {
  const [first, ...rest] = missing;
  const list = missing.map((p) => `${PANES[p].name} (${PANES[p].for})`).join(" and ");
  const also = rest
    .map((p) => `; ${PANES[p].name} is in the same Privacy & Security list`)
    .join("");
  const meanwhile = missing.includes("input-monitoring")
    ? "Enter still works meanwhile"
    : "text is printed here meanwhile";
  return (
    `${app} needs ${list}. System Settings is open at ${PANES[first].name}${also}.\n` +
    `Switch on ${app} (if it isn't listed, click + and add it), then quit it with Cmd+Q ` +
    `and reopen it; ${meanwhile}. Use --no-hotkey / --no-type to stop being asked.`
  );
}

/** Opens System Settings at one permission's pane. */
export function openPermissionPane(
  permission: Permission,
  spawn: (cmd: string[]) => void = (cmd) => {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  },
): void {
  spawn(["open", PANES[permission].url]);
}

/**
 * Shows the macOS prompt where it still can (it adds the app to the list, so
 * the user only has to flip the switch), and opens System Settings at the
 * first missing permission either way: macOS shows its prompt only once per app.
 */
export function askForPermissions(
  missing: [Permission, ...Permission[]],
  /** Partial: Microphone has no ask-for API — it prompts when it's opened. */
  request: Partial<Record<Permission, () => void>>,
  spawn: (cmd: string[]) => void = (cmd) => {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  },
): void {
  for (const permission of missing) request[permission]?.();
  spawn(["open", PANES[missing[0]].url]);
}
