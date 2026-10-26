# 🧭 Cockpit

**A personal life dashboard that turns scattered tools into one operating system.**

My planning lived in a dozen places: a Notion "cockpit" for projects and priorities, nine separate Notion task databases, Linear for group projects, a dozen Google calendars, an Obsidian vault and a paper notebook. Weekly reviews meant opening ten tabs before thinking anything through.

Cockpit pulls all of it into one local-first app built around my own method: **pillars** (life areas) → **projects** ranked by **level** (Socle / P1 / P2 / Maintenance / En attente) with a **weather** status → **tasks**, **milestones** and **calendar events**. The interface is in French, the language I plan in.

> Status: **slice 1 of 12**, read-only sync with Notion, Linear and Google Calendar plus four screens. See the [roadmap](#roadmap).

## What it does today

| Screen | Purpose |
|---|---|
| **Aujourd'hui** | Late, today/tomorrow and this-week tasks from every source; today's agenda; P1 projects with their next action; milestones and exams in the next 14 days; Linear tickets waiting to be claimed |
| **Tâches** | Every open task across all sources, grouped by pillar, by source or by due date |
| **Cockpit** | Projects grouped by level with weather and next action, the max-3-P1 rule flagged, 6-week milestones |
| **Réglages** | Source registry: per-source status and errors, on/off switches, auto-discovery of new Notion databases, Linear teams and calendars, add a Notion database by pasting its URL |

## Design principles

- **Everything is data, nothing is an enum.** Pillars, levels, seasons and sources are rows, not code. A new project, semester or tool must never require a code change.
- **Pluggable connectors.** Each tool implements one small interface (`missingSetup / pull / discover`). Adding Todoist or Apple Health means adding one file.
- **Schema inference.** Notion databases name their fields differently (`Status`/`Statut`, `Due`/`Date`/`Échéance`). The Notion connector reads each schema and guesses the title, status and date mapping, resolving status groups to todo/doing/done.
- **Sources stay the source of truth.** Each pull is the complete state of a source and is swapped in atomically. Write-back to the home tool comes in later slices.
- **Local-first.** SQLite on disk today. The same libSQL driver moves to Turso when the app goes online for phone access.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router, Cache Components, Server Actions) · TypeScript · SQLite/libSQL + Drizzle ORM · Tailwind CSS 4 · Notion API (data sources) · Linear GraphQL API · Google Calendar API (OAuth)

## Run it

```bash
npm install
cp .env.example .env.local                           # API keys, see the comments inside
cp config/seed.example.json config/seed.local.json   # your pillars, levels, seasons, sources
npm run setup                                        # creates data/cockpit.db and seeds it
npm run dev                                          # http://localhost:3000
```

Then connect Google in **Réglages** and click **Synchroniser** on **Aujourd'hui**.

- **Notion**: create an internal integration and share the pages that hold your databases with it (••• → Connections). A source's `externalRef` can be a data source id, a database id, or a page that contains a database.
- **Linear**: personal API key. Tickets not assigned to you are shown for triage and never reassigned.
- **Google Calendar**: OAuth client (web application) with redirect URI `http://localhost:3000/api/google/callback`. Each calendar gets a role (`travail`, `perso`, `socle`, `cours`, `engagement`) that later slices use for time-blocking.

The dev server only listens on `127.0.0.1`: there is no authentication yet.

## Roadmap

| # | Slice | Status |
|---|---|---|
| 1 | Read-only sync (Notion, Linear, Google Calendar) · Aujourd'hui / Tâches / Cockpit / Réglages | ✅ |
| 2 | Edit project weather, next action and level from the app, written back to Notion | ⏳ |
| 3 | Guided daily and weekly reviews (3 min and 10 min), saved back to Notion | |
| 4 | Task write-back, routed to the right source · quick capture inbox | |
| 5 | Deterministic time-blocking engine (Socle → P1 → P2 → Maintenance) writing to Google Calendar | |
| 6 | Habits scored against an 80% weekly target, with a "never miss twice" alert | |
| 7 | Vision layer: yearly themes and goals linked to pillars and projects | |
| 8 | Obsidian bridge: project notes ↔ projects, reviews exported as Markdown | |
| 9 | Monthly and semester reviews · workload planner (backward planning before exams) | |
| 10 | iOS Shortcut capture (Apple Reminders) · handwritten-notes inbox | |
| 11 | Hosting (Turso + Vercel + auth), PWA on iPhone, local vault companion | |
| 12 | AI coach in reviews · an MCP server so agents read one source instead of ten | |

## Project structure

```
config/          seed.example.json (template) · seed.local.json (yours, git-ignored)
src/db/          Drizzle schema, libSQL client, idempotent JSON seed
src/connectors/  notion.ts · linear.ts · gcal.ts, one file per tool
src/sync/        sync engine (projects → milestones → tasks → events) and discovery
src/lib/         Europe/Paris date helpers, shared queries
src/app/         screens, server actions, API routes (/api/sync, Google OAuth)
```

`POST /api/sync` triggers a full sync, for a cron job or an iOS Shortcut.
