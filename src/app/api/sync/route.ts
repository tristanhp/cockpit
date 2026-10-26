import { syncAll } from "@/sync";

// Lets a cron, an iOS Shortcut or the future companion trigger a sync.
export async function POST() {
  const report = await syncAll();
  return Response.json({ ok: report.every((r) => r.ok), report });
}
