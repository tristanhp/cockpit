# Progress

Status values: `todo`, `in review` (pull request open), `done` (merged and checked with real data), `blocked`.
The next slice to build is the first `todo`. Sessions update this file in their pull request.

| Slice | Name | Status | Branch / PR | Notes |
|---|---|---|---|---|
| S1 | Read-only sync, four screens, design pass, palette, detail panels, demo mode | done | main | |
| S2 | Write-back, capture and the priority scale | done | main | Priority and effort, write-back to Notion and Linear with a change journal and undo, capture (`c`, `/api/capture`) and Inbox, Linear triage, dark default. 2026-10-27. [brief](slices/S2.md) |
| S3 | Blocks and the replan | done | main | Blocks from calendar events, free slots / placement / day replan engine (56 tests), Maintenant strip, À replacer + replan sheet, Replanifier ma journée, calendar writes on travail/perso only, `/semaine`. Stacked on S2. 2026-10-27. [brief](slices/S3.md) |
| S4 | On the phone: auth, PWA, notifications | done | main | Versioned migrations + CI check, passkey login (proxy + per-action check), PWA (manifest, icons, offline shell), web-push with a tested `dueNotifications`, cron workflow, `docs/DEPLOY.md`. Deployed on Vercel + Turso 2026-10-28. Stacked on S3. 2026-10-27. [brief](slices/S4.md) |
| S5 | Le cap and la clôture | in review | merged, owner check pending | `/cloture` five-step sequence, cap card with overnight diff and catch-up on Aujourd'hui, `/habitudes`, ritual times in Réglages feeding the notifications; migration `0001_rituals`. Tested with `COCKPIT_NOW`. 2026-10-28. [brief](slices/S5.md) |
| S6 | Vision, goals and threads | in review | `slice/s6-objectifs` | Vision, year and season goals with four measures, the three-per-season limit, threads, signals, goal panel (`?g=`), `/objectifs` replacing Cockpit (Projets tab), Aujourd'hui section, Markdown export to `VAULT_GOALS_PATH`; migration `0002_goals`. 2026-10-28. [brief](slices/S6.md) |
| S7 | La revue and the week engine | in review | `slice/s7-revue` | `/revue` five steps saved as drafts, velocity and point budget, `proposeWeek` engine (28 new tests), "jamais deux fois de suite" alerts, `/semaine` planning view with budget bar, Notion mirror (`reviewMap`) and Markdown export, `revue` notification and draft prepared by the tick; migration `0003_reviews`. 2026-10-28. [brief](slices/S7.md) |
| S8 | La saison | in review | `slice/s8-saison` | Match per day (pure, tested scoring with thresholds, crise, form, cup doubling, table, player card, awards), re-derived by the sync and the tick, skippable reveal step in the revue, `/saison` with the table, form, cup ties, player card, recap and six SVG charts, thresholds and daily-result toggle in Réglages; migration `0004_saison`. 2026-10-28. [brief](slices/S8.md) |
| S9 | Claude assists through MCP | in review | `slice/s9-mcp` | MCP server (official SDK) over streamable HTTP at `/api/mcp` (bearer `COCKPIT_MCP_TOKEN`, 404 when unset, in `MACHINE`) and stdio (`npm run mcp`): 9 read tools, `list_proposals`, 4 `propose_*` tools; `proposals` table, `/propositions` with Accepter / Refuser and a badge, expiry after 7 days, change log « via Claude »; `docs/MCP.md`; `npm run mcp:check` demo script; migration `0005_proposals`. 2026-10-28. [brief](slices/S9.md) |

## Dependencies

S3 needs S2 (priority and effort). S4 needs S2 (capture endpoint) and S3 (block check-ins). S5 needs S2 and S3. S6 can start after S2 but is planned after S5 so the clôture can tick habits. S7 needs S3 and S6. S8 needs S5 and S7. S9 needs S2, S3 and S6.
If the first `todo` slice has an unmet dependency (not `done` or `in review` **on `main`**), stop and tell the owner. A slice branch is always cut from `main` and its pull request targets `main`; merge each slice before starting the next, never stack them.

## Owner follow-ups

Things only the owner can do, collected from merged slices. Tick them off here.

- [x] S4: deploy end to end (Turso, Vercel, `APP_URL`), passkey enrolled, setup token removed, cron green, push works on phone and laptop.
- [ ] S4: one real block-end check-in and the 22:45 clôture notification have arrived.
- [x] S4: second passkey added (laptop) so losing the phone does not lock you out.
- [x] S2: write-back checked with real Notion and Linear (done and reopen, priority and due date, capture filed in the right base, undo from the journal).
- [x] S3: calendar writes checked with real Google Calendar (block created and moved, sport and class calendars never written to).
- [ ] S5: run one real clôture (inbox filed in the right bases), check the next morning's cap shows what changed overnight, tick habits for a week, skip one clôture on purpose and check the catch-up. Merge: run `npm run db:migrate` against Turso (migration `0001_rituals`), add your `habits` to `config/seed.local.json` and run `npm run db:seed`.
- [ ] S6: import the year goals and this season's three goals (`vision`, `years`, `goals` in `config/seed.local.json`, then `npm run db:seed`, or type them in /objectifs), link each active project to a goal or mark it "hors objectifs", check the signals, check the Markdown export in the vault. Merge: `npm run db:migrate` against Turso (migration `0002_goals`).
- [ ] S7: run one real revue, check the Notion reviews row (add a `reviews` source with a `reviewMap`) and the Markdown file (`VAULT_REVIEWS_PATH`), check the proposed week against your real calendars (nothing on sport or classes), and check the budget after two weeks of velocity. Merge: `npm run db:migrate` against Turso (migration `0003_reviews`).
- [ ] S8: after two real weeks check the matches match how the days felt (tune the thresholds in Réglages), check the player card ratings look fair per pillar, and decide whether to show the daily result at the clôture. Merge: `npm run db:migrate` against Turso (migration `0004_saison`).
- [ ] S9: generate `COCKPIT_MCP_TOKEN`, add it in Vercel and redeploy (and `COCKPIT_MCP_TOKEN=` in `.env.example`), add the connector in Claude and ask it for today's plan. Ask it to capture a task, reschedule a block and break down a goal, accept each in Cockpit, and check the change log says « via Claude » and the sources changed only after acceptance. Check whether the claude.ai connector form accepts a bearer header (if not, use Claude Code) and note it in `docs/MCP.md`. Merge: `npm run db:migrate` against Turso (migration `0005_proposals`).
- [ ] Overlapping blocks after a replan were seen once in the demo and could not be reproduced headlessly; report the click sequence if it happens on real data.
