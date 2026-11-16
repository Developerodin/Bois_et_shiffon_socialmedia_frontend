/**
 * Local dev worker: drains the job queue every few seconds.
 * Dev only — in production the runner is kicked by after() + the daily cron,
 * because a polling loop would keep Neon awake (design §8b-1).
 * Run: npm run worker:dev -w web
 */
import { runDueJobs } from "@/server/jobs/runner";

const INTERVAL_MS = 5_000;

async function loop() {
  for (;;) {
    try {
      const { processed } = await runDueJobs({ budgetMs: 30_000 });
      if (processed) console.log(`[worker] processed ${processed} job(s)`);
    } catch (error) {
      console.error("[worker]", error);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

void loop();
