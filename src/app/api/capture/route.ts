import { timingSafeEqual } from "node:crypto";
import { captureText } from "@/capture";

// For phone shortcuts: POST { "text": "..." } with `Authorization: Bearer $COCKPIT_CAPTURE_TOKEN`.
function authorised(request: Request): boolean {
  const expected = process.env.COCKPIT_CAPTURE_TOKEN;
  if (!expected) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== "string" || !body.text.trim()) return Response.json({ error: "Champ « text » manquant" }, { status: 400 });
  try {
    return Response.json(await captureText(body.text));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
