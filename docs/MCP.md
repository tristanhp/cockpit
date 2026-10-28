# Claude and Cockpit (MCP)

Cockpit has an MCP server, so Claude can **read** everything in the app (your day, tasks, projects, goals, week, habits, inbox) and **propose** changes. A proposal changes nothing: it waits on the **Propositions** screen until you accept it. Claude never writes to Notion, Linear or Google Calendar directly.

## Turn it on

1. Generate a token and keep it somewhere safe:

   ```bash
   openssl rand -base64 32
   ```

2. Set it as `COCKPIT_MCP_TOKEN`: in Vercel (Settings → Environment Variables, then redeploy), or in `.env.local` for local use. **Without the variable, `/api/mcp` answers 404**: the endpoint does not exist.
3. Set `APP_URL` too (it already is in production): the tools return links to the app built from it.

## Add it to Claude

**Claude Code, over HTTP** (the deployed app):

```bash
claude mcp add --transport http cockpit https://<your-app>/api/mcp --header "Authorization: Bearer <COCKPIT_MCP_TOKEN>"
```

**Claude Code, over stdio** (this machine, reads your local database from `.env.local`):

```bash
claude mcp add cockpit -- npm --prefix /path/to/cockpit run --silent mcp
```

Try it on the fictional data first: `COCKPIT_DEMO=1 DATABASE_URL=file:data/demo.db npm run --silent mcp`.

**claude.ai custom connector**: Settings → Connectors → Add custom connector, URL `https://<your-app>/api/mcp`. The server authenticates with a static bearer token. If the connector form on your plan only offers OAuth and has no way to send an `Authorization` header, it cannot reach this endpoint yet: use Claude Code instead. (This part could not be tested from the cloud session that built the slice; check it and note the outcome here.)

## The tools

Everything returns compact JSON with ids and links (`url` is the item at its source, `cockpit` is the page in the app).

| Tool | What it does |
|---|---|
| `get_today` | The day: current and next block, today's blocks, urgent work, the blocks to replace (« À replacer »), the cap's three priorities, inbox count |
| `list_tasks` | Tasks across Notion and Linear; filters `status`, `priority`, `project`, `dueBefore`, `source`, `limit` |
| `get_task` | One task with its blocks and its last changes (« via Claude » for accepted proposals) |
| `list_projects` | Projects with priority, status, next action, open tasks and the goals they serve |
| `list_goals` | Goals with progress, signals (« sans fil », « à l'arrêt », « sur le fil ») and their thread |
| `get_week` | The blocks of a week and the point budget |
| `search` | Accent-insensitive search over open tasks and projects (same as `Ctrl K`) |
| `get_habits` | Weekly percentage against the 80 % target, the seven days, « jamais deux fois de suite » |
| `get_inbox` | Captures waiting to be filed |
| `list_proposals` | Proposals made so far and what happened to them |
| `propose_capture` | Capture a task, idea or event (parsed like your capture field: « Rendre le TP vendredi 18h #memoire », « idée : … », « rdv : … ») |
| `propose_reschedule` | Move a block to another slot (never over a class or sport) |
| `propose_task_update` | Change `done`, `dueDate`, `priority` or `effort` of a task |
| `propose_goal_breakdown` | Milestones (up to 8) and first tasks (up to 12) to give a goal a thread |

Each `propose_*` tool needs a short `rationale` (one sentence, shown on the card) and returns a proposal id. A proposal expires after seven days.

## Accepting

Open **Propositions** (nav, tab bar « Plus », or `Ctrl K`; a badge shows how many wait). Each card says the exact change ("Déplacer le bloc X de mar. 14:00 à mer. 09:00", "Créer la tâche …"). **Accepter** runs the same code as the screens: write-back to Notion or Linear, the block move with its protected-slot check, the goal link. The change log in Réglages records the entry **via Claude**, and a task change can be undone from there. **Refuser** changes nothing but the proposal.

## Example conversations

**Capture.** « J'ai oublié de dire que je dois appeler le garage vendredi. » → Claude calls `search` ("garage") to avoid a duplicate, then `propose_capture` with the text « Appeler le garage vendredi », destination « Admin » and the rationale « Tu l'as mentionné et rien n'existe encore ». You open Propositions and accept: the task is created in the right Notion base.

**Replan.** « Ma journée est foutue, qu'est-ce que je fais ? » → `get_today` shows two blocks in « À replacer » and urgent work; `get_week` shows free evenings. Claude proposes `propose_reschedule` for each block with a slot and the reason, and tells you what it left alone. Nothing moves until you accept; a slot that overlaps a class is refused when you accept.

**Goal breakdown.** « Le marathon est sans fil, aide-moi. » → `list_goals` shows the goal and its thread, `list_projects` the linked project; Claude calls `propose_goal_breakdown` with three milestones and four short tasks, each dated. You accept once: the milestones and tasks are created and linked. (The « Découper avec Claude » button on the goal panel copies a ready-made prompt for this.)

## Security notes

- **The token is the key.** Anyone with it can read your tasks, goals, habits and week. Keep it out of chats and screenshots, and rotate it by changing the variable and redeploying. It is compared in constant time.
- **Read-only by default.** The only writes are four proposal tools, and they write to Cockpit's own `proposals` table. Applying a proposal needs you, in the app, behind your passkey login.
- **Same guards as the screens.** Accepting goes through the normal write paths: demo mode never calls a real API, protected calendars are never written, every change is logged and undoable.
- **Nothing runs on its own.** The server is stateless (no sessions kept) and holds no credentials for Notion, Linear or Google beyond what the app already has.
- What a model reads is sent to whoever runs that model: connect Claude only to a Cockpit whose data you are comfortable sharing with it.

## Checking it works

`npm run demo:setup && COCKPIT_DEMO=1 DATABASE_URL=file:data/demo.db npm run mcp:check` starts the server, lists the tools, calls each read tool, creates one proposal of each kind, then accepts, refuses and expires proposals and checks what changed and what did not. Add `-- --http https://<url>/api/mcp` with `COCKPIT_MCP_TOKEN` set to test a running server. It refuses to run outside demo mode.
