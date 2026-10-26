# Progress

Status values: `todo`, `in review` (pull request open), `done` (merged and checked with real data), `blocked`.
The next slice to build is the first `todo`. Sessions update this file in their pull request.

| Slice | Name | Status | Branch / PR | Notes |
|---|---|---|---|---|
| S1 | Read-only sync, four screens, design pass, palette, detail panels, demo mode | done | main | |
| S2 | Write-back, capture and the priority scale | in review | `slice/s2-write-back` | Priority and effort, write-back to Notion and Linear with a change journal and undo, capture (`c`, `/api/capture`) and Inbox, Linear triage, dark default. 2026-10-27. [brief](slices/S2.md) |
| S3 | Blocks and the replan | todo | | [brief](slices/S3.md) |
| S4 | On the phone: auth, PWA, notifications | todo | | [brief](slices/S4.md) |
| S5 | Le cap and la clôture | todo | | [brief](slices/S5.md) |
| S6 | Vision, goals and threads | todo | | [brief](slices/S6.md) |
| S7 | La revue and the week engine | todo | | [brief](slices/S7.md) |
| S8 | La saison | todo | | [brief](slices/S8.md) |
| S9 | Claude assists through MCP | todo | | [brief](slices/S9.md) |

## Dependencies

S3 needs S2 (priority and effort). S4 needs S2 (capture endpoint) and S3 (block check-ins). S5 needs S2 and S3. S6 can start after S2 but is planned after S5 so the clôture can tick habits. S7 needs S3 and S6. S8 needs S5 and S7. S9 needs S2, S3 and S6.
If the first `todo` slice has an unmet dependency (not `done` or `in review`), stop and tell the owner.

## Owner follow-ups

Things only the owner can do, collected from merged slices. Tick them off here.

- [ ] _(none yet)_
