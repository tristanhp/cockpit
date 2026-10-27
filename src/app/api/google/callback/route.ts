import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { oauthClient, saveTokens } from "@/connectors/gcal";
import { requireAuth } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  await requireAuth();
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return new Response(`Connexion Google refusée : ${req.nextUrl.searchParams.get("error") ?? "pas de code"}`, { status: 400 });
  const { tokens } = await oauthClient().getToken(code);
  await saveTokens(tokens);
  redirect("/reglages");
}
