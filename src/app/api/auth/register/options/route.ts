import { registrationOptions } from "@/lib/auth/webauthn";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { setupToken?: string };
  try {
    return Response.json(await registrationOptions(request, body.setupToken));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 403 });
  }
}
