"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erreur");
  return data;
};

/** Only same-site paths, so a login link cannot send you elsewhere. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState("");
  const [pending, start] = useTransition();

  const login = () =>
    start(async () => {
      setError(null);
      try {
        const optionsJSON = await post("/api/auth/login/options", {});
        await post("/api/auth/login/verify", { response: await startAuthentication({ optionsJSON }) });
        window.location.assign(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Connexion impossible");
      }
    });

  const enroll = () =>
    start(async () => {
      setError(null);
      try {
        const optionsJSON = await post("/api/auth/register/options", { setupToken: setup });
        const response = await startRegistration({ optionsJSON });
        await post("/api/auth/register/verify", { response, setupToken: setup, label: navigator.platform });
        window.location.assign(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enrôlement impossible");
      }
    });

  return (
    <div className="grid gap-6">
      <button onClick={login} disabled={pending} className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60">
        {pending ? "Un instant…" : "Se connecter avec ma passkey"}
      </button>
      {error && <p role="alert" className="text-sm text-margin">{error}</p>}
      <details className="text-sm text-ink-soft">
        <summary className="cursor-pointer">Première installation</summary>
        <p className="mt-2 text-xs text-ink-faint">Tant qu&apos;aucune passkey n&apos;existe, le jeton d&apos;installation (COCKPIT_SETUP_TOKEN) permet d&apos;enregistrer la première.</p>
        <input
          id="setup-token"
          type="password"
          autoComplete="off"
          value={setup}
          onChange={(e) => setSetup(e.target.value)}
          placeholder="Jeton d'installation"
          className="mt-2 w-full rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button onClick={enroll} disabled={pending || !setup} className="mt-2 rounded-md border border-rule-strong px-3 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
          Enregistrer ma passkey
        </button>
      </details>
    </div>
  );
}
