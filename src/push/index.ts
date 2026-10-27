import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PushSubscriptionRow } from "@/db/schema";

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

export type Payload = { title: string; body: string; url: string };

function configure() {
  if (!pushConfigured()) throw new Error("Notifications non configurées : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT manquent");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}

async function sendOne(sub: PushSubscriptionRow, payload: Payload): Promise<"sent" | "gone" | "failed"> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600 });
    return "sent";
  } catch (e) {
    // 404 / 410: the browser dropped the subscription for good.
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}

/** Sends to every registered device; forgets the ones the push service says are gone. */
export async function sendToAll(payload: Payload): Promise<{ devices: number; sent: number; removed: number }> {
  configure();
  const subs = await db.select().from(schema.pushSubscriptions);
  let sent = 0;
  let removed = 0;
  for (const sub of subs) {
    const result = await sendOne(sub, payload);
    if (result === "sent") sent++;
    else if (result === "gone") {
      await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
      removed++;
    }
  }
  return { devices: subs.length, sent, removed };
}
