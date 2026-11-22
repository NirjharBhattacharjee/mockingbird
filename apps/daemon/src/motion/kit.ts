import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN } from "../guide.ts";

/** The motion kit, as the URL a page imports it from. */
export const KIT_URL = pathToFileURL(join(PLUGIN, "skills", "motion-graphics", "kit.js")).href;
/** The explainer styles (whiteboard, comic and the rest), as the URL a page imports them from. */
export const STYLES_URL = pathToFileURL(
  join(PLUGIN, "skills", "motion-graphics", "styles.js"),
).href;
/** three.js, pinned and shipped with the plugin, as the URL a page imports it from (#270). */
export const THREE_URL = pathToFileURL(
  join(PLUGIN, "skills", "motion-graphics", "vendor", "three.module.min.js"),
).href;
/** three.js's add-ons for light and post-processing (#275): RoomEnvironment, EffectComposer, bloom, depth of field. */
export const THREE_ADDONS_URL = pathToFileURL(
  join(PLUGIN, "skills", "motion-graphics", "vendor", "three-addons.min.js"),
).href;
/** What a page can import by name, and where each one is. */
const NAMED = {
  KIT: KIT_URL,
  STYLES: STYLES_URL,
  THREE: THREE_URL,
  THREE_ADDONS: THREE_ADDONS_URL,
};

/**
 * A template imports the kit `from "KIT"`, and motion fills it in (#213): an
 * agent replacing it by hand hit the template's comment first, and a Windows
 * path isn't a URL. The filled-in copy goes beside the page, so the page's own
 * files are where it says. `from "STYLES"`, `from "THREE"` and
 * `from "THREE_ADDONS"` are filled in the same way. Returns the page to load: `script` itself when it imports none.
 */
export function withKit(script: string): string {
  const html = readFileSync(script, "utf8");
  const used = Object.entries(NAMED).filter(([name]) => html.includes(`from "${name}"`));
  if (!used.length) return script;
  const copy = join(dirname(script), `.${basename(script)}.${process.pid}-${Date.now()}.html`);
  writeFileSync(
    copy,
    used.reduce(
      (page, [name, url]) => page.replaceAll(`from "${name}"`, `from ${JSON.stringify(url)}`),
      html,
    ),
  );
  return copy;
}
