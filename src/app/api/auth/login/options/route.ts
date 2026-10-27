import { loginOptions } from "@/lib/auth/webauthn";

export async function POST(request: Request) {
  try {
    return Response.json(await loginOptions(request));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 400 });
  }
}
