import { authDisabled } from "@/lib/auth/session";
import { bearerOk } from "@/lib/auth/access";
import { reconcileBlocks } from "@/planning";
import { syncAll } from "@/sync";

// Lets a cron or an iOS Shortcut trigger a sync: `Authorization: Bearer $COCKPIT_CRON_TOKEN`.
export async function POST(request: Request) {
  if (!authDisabled() && !bearerOk(request.headers.get("authorization"), process.env.COCKPIT_CRON_TOKEN)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const report = await syncAll();
  await reconcileBlocks();
  return Response.json({ ok: report.every((r) => r.ok), report });
}
