import { expect, test } from "bun:test";
import { join } from "node:path";
import { guide, INSTRUCTIONS, PLUGIN, playbooks } from "../src/guide.ts";
import { handle } from "../src/mcp.ts";

test("every skill in plugin/ and the reviewer are playbooks", () => {
  expect(playbooks().map((p) => p.topic)).toEqual([
    "captions",
    "hooks",
    "long-form",
    "motion-graphics",
    "retention-editing",
    "style-match",
    "viral-short",
    "reviewer",
  ]);
});

test("a playbook comes with its folder, without its front matter", () => {
  const text = guide("motion-graphics");
  expect(text).toStartWith(`Playbook: motion-graphics. Its folder,`);
  expect(text).toContain(join(PLUGIN, "skills", "motion-graphics"));
  expect(text).toContain("# Motion graphics");
  expect(text).not.toContain("description:");
});

test("an unknown topic names the ones there are", () => {
  expect(() => guide("color")).toThrow('No playbook "color". Topics: captions, hooks,');
});

test("the server tells every client about the playbooks on connect", async () => {
  const reply = (await handle({ jsonrpc: "2.0", id: 1, method: "initialize" }, [])) as {
    result: { instructions: string };
  };
  expect(reply.result.instructions).toBe(INSTRUCTIONS);
  expect(INSTRUCTIONS).toContain('`guide("reviewer")`');
});
