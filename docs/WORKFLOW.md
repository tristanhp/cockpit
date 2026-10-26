# Working on a slice

How any session (cloud or local) builds the next slice of Cockpit. One slice per session, then stop.

## 0. Orient (keep it short)

1. Read `CLAUDE.md`, `docs/PROGRESS.md`, then `docs/SPEC.md` for the product rules.
2. The target is the **first slice marked `todo`** in `docs/PROGRESS.md`. If the user named a slice, use that one.
3. Check that nobody is already on it: `git ls-remote --heads origin "slice/*"`. If a branch for the target slice exists, **stop** and tell the user (it is probably an open pull request waiting for review).
4. Read the slice's brief in `docs/slices/` completely. Read only the source files you need; do not read the whole repository.

## 1. Plan in five lines

Write a short plan in your first message: the data model change, the server code, the UI, the tests, the demo data. Do not ask questions that the brief or `docs/SPEC.md` already answers. If something is genuinely ambiguous, pick the option closest to the product principles, record the choice under "Decisions" in the pull request, and continue.

## 2. Build

- Branch from `main`: `git switch -c slice/sN-short-name`.
- Work in demo mode: `npm run demo` (or `npm run dev` with `COCKPIT_DEMO=1 DATABASE_URL=file:data/demo.db`). Real accounts are not reachable from the cloud and must never be needed.
- Order of work: schema (`src/db/schema.ts`, then `npm run db:push` and `npm run demo:setup`), pure logic with tests (`src/**/*.test.ts`, run with `npm test`), server actions and connectors, UI, demo data (`src/db/demo.ts`).
- Put scoring, scheduling and routing rules in **pure functions with unit tests**. They are the part that breaks silently.
- Every write path to a real source goes through one function that checks `isDemo()` first. In demo mode it changes the local database only.
- Follow `CLAUDE.md` for conventions (French UI, design tokens, dates, privacy). The repository is public: no personal data, ever.
- Keep each commit focused. Commit messages in English, imperative mood.

## 3. Verify

1. `npm run check` must pass (lint, typecheck, tests, build). Fix failures instead of working around them.
2. Start the demo and walk through every "Done when" item of the brief. Fetch pages with `curl` and read the HTML for server-rendered behaviour; exercise server actions through the code paths they call. Take at most **two** screenshots for the whole slice, only when a layout is the point of the slice.
3. Do not regenerate the README screenshots. The owner does that locally.

## 4. Hand over

1. Update `docs/PROGRESS.md`: set the slice to `in review`, add the branch name, a two-line summary and the date.
2. Add or adjust a section in `docs/ARCHITECTURE.md` only if a new module changes how the system works.
3. Push the branch (`git push -u origin slice/sN-short-name`) and open a pull request with the body from `.github/pull_request_template.md`, owner checklist filled from the brief. In cloud sessions `gh pr` does **not** work (the GitHub proxy rejects GraphQL). Use the built-in GitHub tools if you have them; otherwise write the body to a file and call the REST API: `gh api repos/tristanhp/cockpit/pulls -f title="SN: …" -f head=slice/sN-short-name -f base=main -F body=@pr-body.md`. Delete the temporary body file afterwards. If every route fails, do not loop: the pushed branch is enough, say so in your final message and put the intended title and body there. The session link (`https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}`) goes in the description when that variable is set.
4. End with a message of at most ten lines: what works, what needs the owner (real-data test, keys, deploy), and which slice comes next.

## Guardrails

- **Nobody is watching.** Never wait for an answer or an approval. If something blocks you, apply the budget rule below instead of asking.
- **One slice, then stop.** Never start the next slice in the same session, even if budget remains.
- **Budget.** If you are past roughly 250 tool calls, or you have failed the same check three times, stop: commit what works, mark the slice `blocked` in `docs/PROGRESS.md` with the reason, open a **draft** pull request and say so.
- Never merge, never push to `main`, never force-push, never delete branches.
- Never add dependencies without a reason written in the pull request. Prefer the platform and what is already installed.
- Do not touch `config/`, `private/`, `.env*` or `data/cockpit.db`. They belong to the owner and are not in the repository anyway.
- If a brief contradicts `docs/SPEC.md`, the SPEC wins; note the contradiction in the pull request.
