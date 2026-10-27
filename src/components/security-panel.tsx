"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "./feedback";

const button = "rounded-md border border-rule-strong px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50";

/** Add a passkey for this device (needs a session) and log out. */
export function SecurityPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Erreur");
    return data;
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input id="passkey-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom de l'appareil" className="w-40 rounded-md border border-rule-strong bg-paper px-2 py-1 text-xs focus:border-accent focus:outline-none" />
      <button
        disabled={pending}
        className={button}
        onClick={() =>
          start(async () => {
            try {
              const optionsJSON = await post("/api/auth/register/options", {});
              await post("/api/auth/register/verify", { response: await startRegistration({ optionsJSON }), label });
              notify("Passkey ajoutée.");
              window.location.reload();
            } catch (e) {
              notify(e instanceof Error ? e.message : "Échec", "error");
            }
          })
        }
      >
        Ajouter cet appareil
      </button>
      <button
        disabled={pending}
        className={button}
        onClick={() =>
          start(async () => {
            await post("/api/auth/logout", {});
            router.push("/connexion");
          })
        }
      >
        Se déconnecter
      </button>
    </div>
  );
}
