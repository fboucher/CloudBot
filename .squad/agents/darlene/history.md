# Darlene — History

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

### Session: Trenton's 15-Bug Audit (admin.html + index.html)

**Date:** 2026-03-15  
**Files changed:** `src/public/admin.html`, `src/public/index.html`, `src/index.js`

**What was fixed:**

1. **FIX #1 & #2** — Removed dead `startStreamBtn`/`endStreamBtn` event listeners and references. These elements don't exist in the HTML; the real buttons are `sessionStartBtn`/`sessionStopBtn`. Also removed the orphaned `streamTitleInput` change listener.

2. **FIX #3 & #4** — Removed `projectInput`/`streamTitleInput` references from `loadActiveSession()`. The HTML uses `sessionProjectInput`/`sessionTitleInput`.

3. **FIX #5** — Rewrote `loadActiveSession()` to use `GET /api/stream/status`. Rewrote `sessionStartBtn` click to call `POST /api/stream/start` with `{ projectName, streamTitle }`. Rewrote `sessionStopBtn` click to call `POST /api/stream/stop`. Added `updateStartBtnState()` and `input` event listeners to enforce both fields required before enabling Start.

4. **FIX #6** — Removed old `renderTodos()` that wrote to non-existent `#todosList`.

5. **FIX #7** — Removed old `renderReminders()` that wrote to non-existent `#remindersList`.

6. **FIX #8** — Rewrote `renderSessionNotes()` to call `GET /api/notes`. Rewrote `addNote()` to call `POST /api/notes`. Rewrote `deleteNote()` to call `DELETE /api/notes/:id` (by DB id, not array index).

7. **FIX #9** — Rewrote `renderSessionTodos()` to call `GET /api/todos`. Rewrote `setSessionTodoStatus()` to call `PATCH /api/todos/:id`. Rewrote `deleteSessionTodo()` and `addTodo()` to use new endpoints.

8. **FIX #10** — Rewrote `renderSessionReminders()` to call `GET /api/reminders`. Rewrote `deleteSessionReminder()` and `addReminder()` to use new endpoints.

9. **FIX #11** — Fixed `'pending'` → `'new'` in `src/index.js` `POST /api/todos` handler (`db.addTodo` call).

10. **FIX #12** — Replaced `db.loadSessionData(session.id)` (server-only module call) in `loadDashboardStats()` with `fetch('/api/session/' + session.id)`.

11. **FIX #13** — Delete button already present in `renderSessionReminders()`. New implementation keeps it.

12. **FIX #14** — Added "Show" button per note in `renderSessionNotes()` that calls `POST /api/stream/overlay` with `{ event: 'note', content }`. Added `showNoteOnStream()` helper.

13. **FIX #15** — Added SSE subscription `EventSource('/api/stream/events')` in `index.html`. Added `showOverlayNote()` that displays a note overlay div for 5 seconds. Handles `stream_started`/`stream_stopped` events with console logging.

**Key architectural insight:**  
The old `renderTodos()`/`renderReminders()`/`renderSessionTodos()`/`renderSessionReminders()` functions all pulled from `streamSessionData` (the in-memory JSON blob). The new approach fetches directly from SQLite via REST endpoints — the source of truth is now the database, not a cached JS object. The `streamSessionData` is still fetched for backward-compat features (export, recent events).

**API field name mapping (important for future work):**
- `GET /api/stream/status` returns `{ active, sessionId, projectName, streamTitle, startedAt }` — camelCase, no underscores
- `GET /api/notes` returns `[{ id, text, session_id, created_at }]`
- `GET /api/todos` returns `[{ id, description, status, session_id }]`
- `GET /api/reminders` returns `[{ id, name, message, status, interval, session_id }]`
- Valid todo statuses: `'new'`, `'inProgress'`, `'done'`, `'cancel'` (not `'pending'`)

