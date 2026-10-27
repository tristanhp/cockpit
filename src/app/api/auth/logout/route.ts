import { endSession } from "@/lib/auth/webauthn";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
