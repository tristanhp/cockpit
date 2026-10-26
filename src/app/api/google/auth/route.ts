import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GOOGLE_SCOPES, oauthClient } from "@/connectors/gcal";

export async function GET() {
  await connection();
  const url = oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES });
  redirect(url);
}
