# Squad Routing

## Rules

| Signal | Agent | Notes |
|--------|-------|-------|
| Backend API, database, Node.js, Express | Romero | Routes, DB schema, server logic |
| Frontend UI, admin panel, HTML, JS, CSS | Darlene | admin.html, cloudbot.js, index.html |
| Architecture decisions, code review, breakdown | Elliot | Lead — review before shipping |
| Testing, verification, QA | Trenton | Validate all fixes end-to-end |
| Session logs, decisions merge | Scribe | Silent — runs after every batch |
| Work queue monitoring, backlog | Ralph | Issue/PR tracking |
| General / ambiguous | Elliot | Lead decides who picks it up |

## Notes

- Start/Stop stream involves BOTH Romero (API) and Darlene (UI) — spawn in parallel
- Notes/todos/reminders fix involves BOTH Romero (endpoints) and Darlene (UI) — spawn in parallel
- Always include Trenton after any significant fix to verify
