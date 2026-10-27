"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushDevice, sendTestPush, subscribePush } from "@/app/actions";
import { notify } from "./feedback";

const button = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50";

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function NotificationsPanel({ publicKey, devices }: { publicKey: string | null; devices: { id: string; label: string | null; createdAt: string }[] }) {
  const [pending, start] = useTransition();
  const [support, setSupport] = useState<"unknown" | "yes" | "no">("unknown");
  useEffect(() => {
    // Feature detection has to wait for the browser: the server render knows nothing about it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport("serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no");
  }, []);

  if (!publicKey) return <p className="mt-2 text-xs text-ink-faint">Clés VAPID absentes : renseigne VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT (voir docs/DEPLOY.md).</p>;

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Permission refusée par le navigateur");
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const res = await subscribePush(json, navigator.platform);
        notify(res.ok ? "Notifications activées sur cet appareil." : res.error, res.ok ? "ok" : "error");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Activation impossible", "error");
      }
    });

  return (
    <div className="mt-3">
      {support === "no" && <p className="mb-2 text-xs text-warn">Ce navigateur ne gère pas les notifications. Sur iPhone, installe d&apos;abord l&apos;app sur l&apos;écran d&apos;accueil.</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || support !== "yes"} onClick={enable} className={button}>Activer sur cet appareil</button>
        <button
          disabled={pending || devices.length === 0}
          onClick={() => start(async () => { const r = await sendTestPush(); notify(r.ok ? "Test envoyé." : r.error, r.ok ? "ok" : "error"); })}
          className={button}
        >
          Envoyer un test
        </button>
      </div>
      {devices.length > 0 && (
        <ul className="mt-3">
          {devices.map((d) => (
            <li key={d.id} className="flex items-baseline gap-3 border-b border-rule py-2 text-sm last:border-b-0">
              <span className="min-w-0 flex-1 truncate">{d.label ?? "Appareil"}</span>
              <span className="font-mono text-xs text-ink-faint">{d.createdAt.slice(0, 10)}</span>
              <button disabled={pending} onClick={() => start(async () => { const r = await removePushDevice(d.id); notify(r.ok ? "Appareil retiré." : r.error, r.ok ? "ok" : "error"); })} className="text-xs text-ink-faint hover:text-ink">Retirer</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
