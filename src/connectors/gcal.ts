import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Source } from "@/db/schema";
import { addDays, parisDay } from "@/lib/dates";
import type { Connector, Discovered, PullResult } from "./types";

const TOKENS_KEY = "google_tokens";
// Read-only for slice 1; writing time blocks will add calendar.events.
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export function oauthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants");
  const redirect = `${process.env.APP_URL ?? "http://localhost:3000"}/api/google/callback`;
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect);
}

export async function saveTokens(tokens: object) {
  const prev = (await getTokens()) ?? {};
  // Google only sends the refresh token on first consent: keep the old one.
  const value = { ...prev, ...tokens };
  await db.insert(schema.settings).values({ key: TOKENS_KEY, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function getTokens(): Promise<Record<string, unknown> | null> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, TOKENS_KEY) });
  return (row?.value as Record<string, unknown>) ?? null;
}

async function calendarApi() {
  const tokens = await getTokens();
  if (!tokens) throw new Error("Google Agenda non connecté (Réglages → Connecter Google)");
  const auth = oauthClient();
  auth.setCredentials(tokens);
  auth.on("tokens", (t) => void saveTokens(t));
  return google.calendar({ version: "v3", auth });
}

async function pull(source: Source): Promise<PullResult> {
  const cal = await calendarApi();
  const today = parisDay();
  const items = [];
  let pageToken: string | undefined;
  do {
    const res = await cal.events.list({
      calendarId: source.externalRef,
      timeMin: new Date(`${addDays(today, -7)}T00:00:00Z`).toISOString(),
      timeMax: new Date(`${addDays(today, 42)}T00:00:00Z`).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      pageToken,
    });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return {
    events: items
      .filter((e) => e.status !== "cancelled" && e.id && (e.start?.dateTime || e.start?.date))
      .map((e) => {
        const allDay = !e.start?.dateTime;
        const title = e.summary ?? "(sans titre)";
        return {
          externalId: e.id!,
          url: e.htmlLink,
          title,
          start: e.start?.dateTime ?? e.start!.date!,
          end: e.end?.dateTime ?? e.end?.date ?? e.start!.date!,
          allDay,
          // ADE feed: titles starting with "EV" are evaluations.
          isExam: source.config.calendarRole === "cours" && /^EV\b/i.test(title),
        };
      }),
  };
}

async function discover(): Promise<Discovered[]> {
  const cal = await calendarApi();
  const res = await cal.calendarList.list({ maxResults: 250 });
  return (res.data.items ?? []).map((c) => ({
    externalRef: c.id!,
    name: c.summaryOverride ?? c.summary ?? c.id!,
    detail: c.description ?? undefined,
  }));
}

export const gcalConnector: Connector = {
  kind: "gcal",
  missingSetup: async () => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return "Ajoute GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.local";
    return (await getTokens()) ? null : "Connecte Google Agenda dans Réglages";
  },
  pull,
  discover,
};
