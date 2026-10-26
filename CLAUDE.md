@AGENTS.md

# Cockpit — working notes for Claude

Personal life dashboard (French UI) that syncs Notion, Linear and Google Calendar into one local-first app.
Read before coding: [README.md](README.md) (what exists), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it works), [docs/SPEC.md](docs/SPEC.md) (product decisions and the next slice to build).

## Run and check

- `npm run demo` — fictional dataset, no API keys, `COCKPIT_DEMO=1`. **Use this in cloud sessions**: real accounts are not reachable there.
- `npm run dev` — real data; needs `.env.local` and `config/seed.local.json` (both git-ignored, only on the owner's machine).
- Before every commit: `npm run lint`, `npm run typecheck`, `npm run build`. All must pass.
- Changing the DB schema: edit `src/db/schema.ts`, then `npm run db:push` (and `npm run demo:setup` for the demo DB). Keep `src/db/demo.ts` able to fill every new table.

## Next.js 16 specifics (this is not the Next.js you know)

- Read the bundled docs in `node_modules/next/dist/docs/` before using an API you are unsure of.
- Cache Components is on: pages render a static shell, data components call `await connection()` inside a `<Suspense>` boundary. Follow the pattern in `src/app/page.tsx`.
- GET route handlers are prerendered unless they call `connection()`.
- Mutations are Server Actions in `src/app/actions.ts` that end with `refresh()` from `next/cache`.

## Conventions

- **French UI copy**, tutoiement, short and plain. Code, comments and commit messages in English.
- **Design**: the "grands carreaux" notebook. Use the tokens in `src/app/globals.css` (`paper`, `ink`, `rule`, `accent`, `margin`, `scrim`…) and the components in `src/components/ui.tsx`. Never hard-code colours. Overlays use `bg-scrim backdrop-blur-md`.
- **Dates**: always through `src/lib/dates.ts` (Europe/Paris). Accent-insensitive matching through `fold()` in `src/lib/text.ts`.
- **Everything is data**: new pillars, levels, sources, priorities must never need a code change. Connectors live in `src/connectors/`, one file per tool, behind the `Connector` interface.
- **Sources stay home**: tasks live in Notion/Linear; Cockpit writes changes back to them. Cockpit-only data (overrides, inbox, conflicts, reviews) lives in the local DB.
- **Demo mode must never call a real API.** Any write-back path checks `isDemo()` (from `src/sync`) and only mutates the local DB in demo mode.

## Privacy (the repo is public)

- Never commit personal data: no real names of people, emails, calendar/Notion IDs, health data or screenshots of real accounts.
- `config/seed.local.json`, `private/`, `.env*`, `data/` are git-ignored on purpose. Do not move their content into tracked files.
- README screenshots come only from `npm run demo`.
