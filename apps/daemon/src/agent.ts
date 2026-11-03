/**
 * Dictation's launchd agent ran this file until v0.3.2. A Mac upgraded from
 * then still has the agent, so launchd keeps starting it: it now removes the
 * agent and the rest of dictation's leftovers, and stops.
 */
import { retireDictation } from "./retire.ts";

for (const line of retireDictation()) console.error(line);
