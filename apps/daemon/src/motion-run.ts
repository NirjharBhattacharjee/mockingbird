/**
 * Runs one motion script and prints how many frames it drew. `mockingbird mcp`
 * starts this in its own process under macOS's sandbox with the network
 * denied, so a client's script can't break mockingbird's one-download rule
 * (ARCHITECTURE.md §9) or take the server down with it. Arguments are one
 * JSON object: renderMotion's options plus `script`.
 */
import { type Draw, renderMotion } from "@mockingbird/motion";

const { script, ...options } = JSON.parse(process.argv[2] ?? "{}");
try {
  const draw: Draw = (await import(script)).default;
  if (typeof draw !== "function") {
    throw new Error(`${script} needs \`export default function draw(ctx, t, m)\`.`);
  }
  console.log(await renderMotion(draw, options));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
