import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishLogin } from "@/lib/auth/webauthn";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null;
  if (!body?.response) return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    await finishLogin(request, body.response);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 401 });
  }
}
