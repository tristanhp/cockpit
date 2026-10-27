import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { finishRegistration } from "@/lib/auth/webauthn";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { response?: RegistrationResponseJSON; setupToken?: string; label?: string } | null;
  if (!body?.response) return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    await finishRegistration(request, body.response, body.setupToken, body.label);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 403 });
  }
}
