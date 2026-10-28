import { bearerOk } from "@/lib/auth/access";
import { authDisabled } from "@/lib/auth/session";
import { dueNotifications } from "@/engine/notifications";
import { reconcileBlocks } from "@/planning";
import { prepareDraft, refreshMetrics } from "@/review";
import { pushConfigured, sendToAll } from "@/push";
import { loadNotifySettings, loadNotifyState, recordSent } from "@/push/state";
import { isDemo, syncAll } from "@/sync";

// Called every 5 minutes (GitHub Actions cron): sync, then send what is due, once each.
export async function POST(request: Request) {
  if (!bearerOk(request.headers.get("authorization"), process.env.COCKPIT_CRON_TOKEN)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const report = await syncAll();
  await reconcileBlocks();
  await refreshMetrics();
  await prepareDraft();
  // Demo data never notifies anybody.
  if (isDemo() || (authDisabled() && !pushConfigured())) return Response.json({ ok: true, sync: report.length, sent: [] });

  const now = Date.now();
  const due = dueNotifications(now, await loadNotifyState(now), await loadNotifySettings());
  const sent: string[] = [];
  for (const n of due) {
    const result = await sendToAll({ title: n.title, body: n.body, url: n.url });
    // Record only what reached a device, so a notification is retried on the next tick otherwise.
    if (result.sent > 0) {
      await recordSent(n);
      sent.push(n.key);
    }
  }
  return Response.json({ ok: true, sync: report.length, due: due.length, sent });
}
