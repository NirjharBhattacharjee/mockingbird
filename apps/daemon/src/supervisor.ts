export type SupervisedChild = {
  exited: Promise<number>;
  stop(): Promise<void>;
};

export type SupervisorEvent =
  | { type: "started"; attempt: number }
  | { type: "exited"; code: number; ranMs: number }
  | { type: "restarting"; delayMs: number; failures: number }
  | { type: "gave-up"; failures: number };

export type SupervisorOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  /** Consecutive quick exits before giving up. */
  maxFailures?: number;
  /** A child that ran at least this long resets the failure count. */
  stableAfterMs?: number;
  onEvent?: (event: SupervisorEvent) => void;
};

/** Keeps a child process running, restarting it with exponential backoff. */
export class Supervisor {
  private child: SupervisedChild | undefined;
  private stopping = false;
  private wake: (() => void) | undefined;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly spawn: () => SupervisedChild,
    private readonly options: SupervisorOptions = {},
  ) {}

  start(): void {
    this.loop ??= this.run();
  }

  /** Resolves once the supervisor has stopped or given up. */
  get done(): Promise<void> {
    return this.loop ?? Promise.resolve();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.wake?.();
    await this.child?.stop();
    await this.loop;
  }

  private async run(): Promise<void> {
    const {
      initialDelayMs = 250,
      maxDelayMs = 5_000,
      maxFailures = 5,
      stableAfterMs = 10_000,
      onEvent = () => {},
    } = this.options;
    let failures = 0;
    let attempt = 0;

    while (!this.stopping) {
      attempt++;
      const startedAt = performance.now();
      const child = this.spawn();
      this.child = child;
      onEvent({ type: "started", attempt });

      const code = await child.exited;
      this.child = undefined;
      if (this.stopping) break;

      const ranMs = Math.round(performance.now() - startedAt);
      onEvent({ type: "exited", code, ranMs });
      failures = ranMs >= stableAfterMs ? 1 : failures + 1;
      if (failures >= maxFailures) {
        onEvent({ type: "gave-up", failures });
        break;
      }

      const delayMs = Math.min(maxDelayMs, initialDelayMs * 2 ** (failures - 1));
      onEvent({ type: "restarting", delayMs, failures });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delayMs);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = undefined;
    }
  }
}
