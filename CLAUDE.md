@AGENTS.md

# Cockpit — working notes for Claude

## Start here

To build the next slice, follow [docs/WORKFLOW.md](docs/WORKFLOW.md): it finds the first `todo` slice in [docs/PROGRESS.md](docs/PROGRESS.md), builds it from its brief in `docs/slices/`, verifies it in demo mode and opens a pull request. **One slice per session, then stop.** A slash command does the same: `/next-slice`.

Personal life dashboard (French UI) that syncs Notion, Linear and Google Calendar into one local-first app.
Read before coding: [README.md](README.md) (what exists), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it works), [docs/SPEC.md](docs/SPEC.md) (product decisions), [docs/PROGRESS.md](docs/PROGRESS.md) (which slice is next).

## Run and check

- `npm run demo` — fictional dataset, no API keys, `COCKPIT_DEMO=1`. **Use this in cloud sessions**: real accounts are not reachable there.
- `npm run dev` — real data; needs `.env.local` and `config/seed.local.json` (both git-ignored, only on the owner's machine).
- Before every commit: `npm run check` (lint, typecheck, unit tests, build). All must pass. Run just the tests with `npm test`; tests live next to the code as `*.test.ts` (Node's test runner through `tsx`).
- Changing the DB schema: edit `src/db/schema.ts`, run `npm run db:generate` and **commit the new file in `drizzle/`**. Production (Turso) only receives these versioned migrations, and CI fails when the schema and `drizzle/` disagree. Never edit a migration that is already on `main`; add a new one. `npm run demo:setup` rebuilds the demo DB, `npm run db:push` is for the owner's local DB. Keep `src/db/demo.ts` able to fill every new table.

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
- **Auth**: every Server Action starts with `await requireAuth()` (see `src/app/actions.ts`), and so does every route handler unless it checks its own bearer token. A new token-protected endpoint (cron, capture, MCP…) must be added to `MACHINE` in `src/lib/auth/access.ts` with a test, otherwise the login gate in `src/proxy.ts` answers it first.
- **Keyboard**: shortcuts read letters from `e.key` but digits from `e.code` (`Digit1`, `Numpad1`). The owner's keyboard is AZERTY, where the unshifted digit row types `& é " '`.
- **Production config**: a new environment variable goes in the table of `docs/DEPLOY.md` and in `.env.example`. The app is deployed on Vercel + Turso (passkey login, cron through GitHub Actions); see `docs/DEPLOY.md`.
- **Demo mode must never call a real API.** Any write-back path checks `isDemo()` (from `src/sync`) and only mutates the local DB in demo mode.

## Privacy (the repo is public)

- Never commit personal data: no real names of people, emails, calendar/Notion IDs, health data or screenshots of real accounts.
- `config/seed.local.json`, `private/`, `.env*`, `data/` are git-ignored on purpose. Do not move their content into tracked files.
- README screenshots come only from `npm run demo`.
