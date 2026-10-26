# Cockpit — product spec

Decisions validated by the owner on 26 October 2026. Each slice's brief is in [slices/](slices/).
Personal details (which accounts, which habits) stay out of this file on purpose.

## Principles

1. **The plan heals itself.** Missed work always resurfaces with a proposed new slot. Nothing moves without one tap of approval; nothing is silently dropped.
2. **Every goal has a thread.** Vision → year → season goal → project → milestone → task → block. Anything without a thread is visible.
3. **Capture in 3 seconds.** One field on phone or desktop, or a sentence to Claude. Sorting happens in the evening shutdown.
4. **Cockpit leads, Claude assists.** Rituals run in the app on prefilled screens. Claude plugs in later through an MCP server, reads everything, writes only with confirmation.
5. **Sources stay home.** Tasks stay in Notion and Linear for good; blocks in Google Calendar. Cockpit writes changes back.

## The four moments

| Moment | When | Length | What happens |
|---|---|---|---|
| **Le cap** | 07:30 weekdays, 09:30 weekends | 1 min | First action chosen last night, 3 priorities, changes since last night. A missed clôture becomes a 1-minute catch-up here. |
| **Maintenant** | all day | 10 s a touch | Current block and time left; at block end, a check-in **only if the linked task is still open in its source**; missed blocks go to *À replacer*. |
| **La clôture** | 22:45, hard stop 23:00 | 3 min | Bilan → Restes → Inbox (route captures) → Demain (3 priorities, habits, first action) → Rien d'oublié ? → screens off, hand-off to paper. |
| **La revue** | Sunday 19:30 | 10 min | One-page summary, numbers, goal threads, focus, then the week proposal in priority order within the point budget. Stored in Cockpit, mirrored to Notion. |

"Jamais deux fois de suite" alerts in the revue: missed revue or clôture, sport below plan, sleep target missed, under 60 % of blocks kept — each only when it happens two weeks in a row.

## Priority and effort (replaces the old Socle/P1/P2/Maintenance levels)

- **Priority**: `Urgent · Haute · Moyenne · Basse · Aucune`, one to one with Linear's 1–4/0. Set automatically, overridable.
- **Effort**: Fibonacci points 1-2-3-5-8. Minutes per point are learned per task type (asked the first time a type appears, then guessed and refined from real durations).
- **Levels merge into priority.** *Socle* becomes **protected habits** (never traded away, outside the scale). *En attente* becomes a project **status** (paused).
- One scale for everything: tasks, goal work and habits.
- **Weekly budget in points** from measured velocity, like a Linear cycle; warn before Sunday planning when overcommitted.

## Blocks and replanning

- Every event on the "travail" and "perso" calendars is a block.
- Missed block → replan sheet with default **"Laisser Cockpit choisir"** (best slot this week). Other options: tonight, tomorrow morning, split, drop.
- "Replanifier ma journée" aims to finish every mandatory item on time and keep habits as far as possible. It shows a before/after and needs confirmation.
- **Protected**: classes actually attended and the sport/health calendar. Social and association events are avoided; overlapping them needs explicit approval.
- Cockpit always proposes; it never moves a block silently. A block moved by hand in Google Calendar is respected.

## Goals and habits

- Horizons: life vision (identity pillars, 3–5 year vision, rules of the system, year themes) → year → season. Max **3 goals per season**.
- Goals live in Cockpit, exported as Markdown to the Obsidian vault.
- Measures: milestones, a number, a habit (weekly % vs 80 %), or done/not done.
- Signals: *sans fil* (no work planned in 14 days → Claude proposes a breakdown), *à l'arrêt* (no next action for 7 days), *orpheline* (task without project).
- Habits are ticked in the clôture; sleep-tracker numbers are entered weekly.

## Capture, sources and sync

- A capture becomes a **task** (routed to its source), an **idea** (Markdown note in the vault inbox) or an **event** (Google Calendar).
- Routing rules: course work → the course deliverables base; group projects → Linear (never duplicated); project or association work → that project's base; anything else → the personal tasks base.
- Sync every 5 minutes while the app is open, and on open. Conflicts: **latest edit wins, logged and undoable**.
- Several Linear workspaces are supported (`config.apiKeyEnv` per source). Notion bases that mirror Linear tickets can skip those rows (`config.skipIfProp`).

## Interface and growth

- **Dark theme always.** Keyboard essentials only: `c` capture, `x` done, `r` replan, `Ctrl K` palette.
- **Nouveau projet** creates a whole brick in one go: Cockpit project linked to a goal, a Notion task base, an Obsidian note, a Google calendar, all registered as sources. **Archiver** undoes it and keeps the history.
- Seasons are planned in the semester review and switch on their date. A new semester's courses and exam dates are proposed from the school timetable.
- Hosting later: Vercel + Turso, passkey login, PWA with notifications (block-end check-in, 22:45 clôture + 23:00 screens off, morning cap, deadline at risk).

## La saison (the game layer)

- Each **day is a match** against the day's plan, scored silently at the clôture: ≥ 80 % win (3 pts), 60–80 % draw (1), < 60 % loss (0). Goals for = effort points done, blocks kept, rituals done; goals against = mandatory items missed.
- **Revealed weekly** in the Sunday revue: fixtures, form guide, season table against past seasons.
- A loss is fine; **two losses in a row = "crise"**, one coach's question in the revue.
- Cup matches for exams and big deadlines, a FIFA-style player card (rating per pillar), end-of-season awards and recap card.

## Roadmap

| Slice | Content |
|---|---|
| S1 ✅ | Read-only sync, Aujourd'hui / Tâches / Cockpit / Réglages, design pass, palette, detail panels, demo mode |
| **S2** | Write-back, capture and the priority scale |
| S3 | Blocks and the replan (core pain), writing to Google Calendar |
| S4 | On the phone: Vercel + Turso, passkey, PWA, notifications |
| S5 | Le cap and la clôture |
| S6 | Vision, goals and threads |
| S7 | La revue and the week engine |
| S8 | La saison (game) and insight charts |
| S9 | Claude assists through an MCP server |
| S10+ | Nouveau projet / Archiver, semester setup, vault bridge, monthly and semester reviews |

---

Per-slice briefs, with their "Done when" lists, are in [slices/](slices/). Status is tracked in [PROGRESS.md](PROGRESS.md); how a session builds a slice is in [WORKFLOW.md](WORKFLOW.md).
