import { reconcileBlocks } from "@/planning";
import { syncAll } from "@/sync";

// Lets a cron, an iOS Shortcut or the future companion trigger a sync.
export async function POST() {
  const report = await syncAll();
  await reconcileBlocks();
  return Response.json({ ok: report.every((r) => r.ok), report });
}
