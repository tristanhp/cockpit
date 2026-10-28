// Loads the initial system (piliers, niveaux, saisons, sources) from JSON.
// config/seed.local.json holds your own setup and is git-ignored; config/seed.example.json
// is the public template. Idempotent: existing rows are left untouched, so it is safe to re-run.
import { existsSync, readFileSync } from "node:fs";
import { db, schema } from "./index";
import type { SourceConfig } from "./schema";
import { fold } from "@/lib/text";

type SeedFile = {
  pillars: { id: string; name: string; color: string }[];
  levels: { id: string; name: string; description?: string; weeklyRule?: string; maxProjects?: number }[];
  seasons: { id: string; name: string; startDate: string; endDate: string; notes?: string }[];
  sources: {
    id: string;
    kind: "notion" | "linear" | "gcal";
    role: "tasks" | "projects" | "milestones" | "reviews" | "events";
    name: string;
    externalRef: string;
    config?: SourceConfig;
    enabled?: boolean;
  }[];
  habits?: { id?: string; name: string; targetPct?: number; protected?: boolean }[];
  calendars: { name: string; calendarId: string; calendarRole: SourceConfig["calendarRole"]; enabled?: boolean }[];
};

const slug = (s: string) =>
  fold(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  const path =
    process.env.SEED_FILE ?? (existsSync("config/seed.local.json") ? "config/seed.local.json" : "config/seed.example.json");
  const seed = JSON.parse(readFileSync(path, "utf8")) as SeedFile;

  await db
    .insert(schema.pillars)
    .values(seed.pillars.map((p, i) => ({ ...p, sortOrder: i })))
    .onConflictDoNothing();

  await db
    .insert(schema.levels)
    .values(seed.levels.map((l, i) => ({ ...l, sortOrder: i })))
    .onConflictDoNothing();

  await db.insert(schema.seasons).values(seed.seasons).onConflictDoNothing();

  const calendars = seed.calendars.map((c) => ({
    id: `gcal-${slug(c.name)}`,
    kind: "gcal" as const,
    role: "events" as const,
    name: c.name,
    externalRef: c.calendarId,
    config: { calendarRole: c.calendarRole },
    enabled: c.enabled ?? true,
  }));

  await db
    .insert(schema.sources)
    .values([...seed.sources.map((s) => ({ ...s, config: s.config ?? {}, enabled: s.enabled ?? true })), ...calendars])
    .onConflictDoNothing();

  if (seed.habits?.length)
    await db
      .insert(schema.habits)
      .values(seed.habits.map((h, i) => ({ id: h.id ?? slug(h.name), name: h.name, targetPct: h.targetPct ?? 80, protected: h.protected ?? false, sortOrder: i })))
      .onConflictDoNothing();

  console.log(`Seed OK (${path})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
