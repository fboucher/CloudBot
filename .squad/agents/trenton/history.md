# Trenton — History

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

### Audit — 2026-03-15 (Session: Admin Panel Fixes Follow-up)

**Critical pattern: ID mismatch between HTML and JS**  
The admin panel JS has TWO sets of stream control references. The HTML was refactored to `sessionStartBtn`/`sessionStopBtn` but JS still references `startStreamBtn`/`endStreamBtn`. This causes a page-load crash before any buttons work. (All 15 bugs subsequently fixed by Darlene in respawn session.)

**`/api/session` missing `active: true` in response**  
The session endpoint spreads the DB row but never adds `active: true`. The `loadActiveSession()` check `if (data.active)` always fails → admin panel always shows as offline. This is the single most impactful bug. (Fixed by Romero in lightweight respawn session.)

**Server-side `db` module called in browser context**  
`loadDashboardStats()` in admin.html calls `db.loadSessionData()` directly — `db` is a Node.js require'd module, not browser-available. Will throw `ReferenceError` in browser every time dashboard stats load. (Fixed by Darlene.)

**Dual render function sets with mismatched containers**  
`renderTodos()` targets `todosList` (doesn't exist), `renderReminders()` targets `remindersList` (doesn't exist). The session page uses `renderSessionTodos()` / `renderSessionReminders()` which target `sessionTodosList` / `sessionRemindersList` (these DO exist). Dead render functions left from refactor. (Dead functions removed by Darlene.)

**Todo status default mismatch**: DB default is `'new'`, API sends `'pending'`. CSS handles `new`, `inProgress`, `done`, `cancel` — not `pending`. New todos from admin panel get no styling. (Fixed by Darlene + Romero.)

**Notes are structurally correct but unreachable** due to `streamSessionData` always being null (caused by the `active: true` bug). (Unblocked by Romero's lightweight fix.)

**Show on stream**: Todos visibility toggle works end-to-end. No equivalent for Notes or Reminders. Overlay (`cloudbot.js`) polls correctly via HTTP polling — no SSE/socket.io. (Partially implemented by Darlene — notes have "Show" button, but reminders still lack it.)

**Files with most bugs**: `admin.html` (all JS bugs are here, ~15 bugs total)

### Audit Impact

All 15 bugs identified in initial audit were subsequently fixed by the team in a coordinated session:
- Romero: Added 16 backend endpoints + SSE infrastructure
- Darlene (respawn): Fixed all 15 frontend bugs
- Romero (lightweight): Added `active: true` flag to `/api/session` response

Result: Admin panel fully functional, source of truth shifted to SQLite database.

### Post-Fix Verification — 2025-07-14

**All 15 bugs from the audit were addressed. 14 fully fixed, 1 partial.**

**Fix #11 is PARTIAL:** `db.addTodo()` in `db.js` still has `status = 'pending'` as parameter default (line 396). The new `/api/todos` endpoint explicitly passes `'new'`, so the frontend path is correct. The old `/api/session/todos` also still defaults to `'pending'`. Both are latent bugs in inactive code paths.

**Key pattern confirmed:** The dual-endpoint approach (new `/api/*` endpoints alongside old `/startstream` style) works well. Legacy chatbot routes untouched.

**Backend completeness confirmed:** All 11 new API endpoints present and mapped. `/api/session` `active` field now correctly set to `!session.ended_at`.

**SSE confirmed working in index.html:** `EventSource('/api/stream/events')` with proper event handling for `stream_started`/`stream_stopped`.
