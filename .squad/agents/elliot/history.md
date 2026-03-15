# Elliot — History

## Core Context

**Project:** CloudBot — Twitch chatbot and admin panel  
**User:** fboucher  
**Stack:** Node.js, Express, SQLite (@libsql/client), Bootstrap 5, vanilla JS  
**Repo:** /mnt/d/dev/github/fboucher/CloudBot  

**What this project does:**  
CloudBot is a Twitch chatbot with stream tracking and an admin panel. It's transitioning from flat JSON files to SQLite. The stack is Node.js, Express, SQLite (@libsql/client), Bootstrap 5, and vanilla JS. The user is fboucher. Key issues: stream start/stop via admin panel, notes/todos/reminders sections disconnected from backend, 'show on stream' buttons not working.

**Key file paths:**  
- `src/index.js` — Express server + all API routes  
- `src/db.js` — SQLite database layer  
- `src/public/admin.html` — Admin panel (1443 lines, Bootstrap 5)  
- `src/public/cloudbot.js` — Frontend JS (1610 lines)  
- `src/public/index.html` — Stream overlay (OBS browser source)  
- `src/io/` — Realtime comms and session JSON files  

**Known issues to fix:**  
1. Stream start/stop via admin panel  
2. Notes section in admin panel not connected  
3. To-do section in admin panel not connected  
4. Reminder section in admin panel not connected  
5. "Show on stream" buttons don't work  

## Learnings

### Commands Audit (2025-03-15)

**Key Finding: No active Twitch IRC handler**  
- All chat commands (!start, !stop, !note, !todo, !reminder, etc.) are **referenced in frontend JS** but have **no backend IRC listener**
- Only admin panel buttons work (via REST endpoints like `/api/stream/start`, `/api/notes`, etc.)
- Decision 6 acknowledged this gap — chat handler is deferred pending IRC integration

**Database Status:**
- ✅ Notes, Todos, Reminders: Fully DB-backed with proper REST endpoints and admin panels
- ✅ Session start/stop: Proper transaction handling with DB + SSE broadcast
- ⚠️  User scores: Still in-memory only (no DB persistence, no admin visibility)
- ⚠️  Todos visibility toggle: State stored in-memory, not persisted

**Legacy File I/O:**
- `/savetofile` still writes `.json` files alongside DB — should remove file write, keep DB only
- `/loadfromfile` falls back to JSON if no active session — OK for now, but JSON writes should cease
- `/genstreamnotes` still generates `.md` files — correct, needed for report generation

**Audit deliverable:** `.squad/planning/commands-audit.md` documents all commands with priorities and gaps

### 2026-03-15 — Commands Audit Planning Finalized

**Work:** Planning document completion (no code changes)

**Planning document:** `.squad/planning/commands-audit.md`

**Scope:** Documents commands audit including:
- All chat commands with current status
- Priorities for review and updates
- Commands requiring deprecation or refactoring
- Implementation timeline for future work

**Status:** Ready for team reference and future implementation work
