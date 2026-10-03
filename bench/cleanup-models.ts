/**
 * Compares cleanup models: the eval's pass count on the dev and held-out
 * sets (evals/cleanup), how long each model call takes, and the model's size
 * on disk and in memory. Each model must already be pulled into Ollama.
 *
 *   bun run bench:cleanup qwen3:4b-instruct-2507-q4_K_M gemma3:1b ...
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pct } from "./corpus.ts";

const OLLAMA = process.env.MOCKINGBIRD_LLM_URL ?? "http://127.0.0.1:11434";
const repo = join(import.meta.dir, "..");
const out = mkdtempSync(join(tmpdir(), "mockingbird-cleanup-bench-"));

type Result = { success: boolean; latencyMs: number };

async function evalSet(model: string, set: string) {
  const file = join(out, `${model.replace(/[:/]/g, "_")}-${set}.json`);
  const proc = Bun.spawn(["bun", "evals/cleanup/run.ts", "-o", file], {
    cwd: repo,
    env: { ...process.env, MOCKINGBIRD_LLM_MODEL: model, MOCKINGBIRD_EVAL_SET: set },
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
  const results: Result[] = (await Bun.file(file).json()).results.results;
  return {
    passed: results.filter((r) => r.success).length,
    total: results.length,
    // Cases the gate skips never call the model, and take ~1ms.
    calls: results.filter((r) => r.latencyMs > 20).map((r) => r.latencyMs),
  };
}

const { models: tags } = (await (await fetch(`${OLLAMA}/api/tags`)).json()) as {
  models: { name: string; size: number }[];
};

console.log("| Cleanup model | Disk | Memory | dev | held-out | Median call | p90 call |");
console.log("|---|---|---|---|---|---|---|");
for (const model of Bun.argv.slice(2)) {
  const dev = await evalSet(model, "dev");
  const holdout = await evalSet(model, "holdout");
  const { models: running } = (await (await fetch(`${OLLAMA}/api/ps`)).json()) as {
    models: { name: string; size: number }[];
  };
  const disk = tags.find((t) => t.name === model)?.size ?? 0;
  const memory = running.find((m) => m.name === model)?.size ?? 0;
  const calls = [...dev.calls, ...holdout.calls];
  const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
  console.log(
    `| ${model} | ${gb(disk)} | ${gb(memory)} | ${dev.passed}/${dev.total} | ${holdout.passed}/${holdout.total} | ${Math.round(pct(calls, 0.5))} ms | ${Math.round(pct(calls, 0.9))} ms |`,
  );
}
