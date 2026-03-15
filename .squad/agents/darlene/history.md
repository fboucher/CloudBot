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

### Session: Three Frontend Fixes (admin.html)

**Date:** 2026-03-15  
**Files changed:** `src/public/admin.html`

**What was fixed:**

1. **Fix #1 — Save/Export into Stream Control card**
   - Moved `saveSessionBtn` and `exportNotesBtn` from the "Quick Actions" card header into the "Stream Control" card body.
   - Added a new `<div class="row mt-2">` with `col-12 d-flex gap-2` below the Stream #/Started row.
   - Removed the `<div>` that held those buttons in the Quick Actions header; Quick Actions card now has no header buttons.
   - Button IDs, event handlers (`saveCurrentSession`, `exportNotesBtn` click listener) unchanged.

2. **Fix #2 — Show/Hide Todo toggle inversion corrected**
   - Bug: when `todosVisibleOnStream = true` (todos visible), button showed "Show on Stream" — backwards.
   - Fixed `toggleTodosVisibility()`: when `todosVisibleOnStream = true` → "Hide on Stream" (bi-eye-slash); when false → "Show on Stream" (bi-eye).
   - Fixed `loadTodosVisibility()`: was only updating button on `!visible` case (and set wrong label). Now always updates button with correct label.
   - Fixed initial button HTML from "Show on Stream" (bi-eye) to "Hide on Stream" (bi-eye-slash), matching `todosVisibleOnStream = true` default.

3. **Fix #3 — Polling for notes/todos/reminders**
   - `renderSessionNotes()`, `renderSessionTodos()`, `renderSessionReminders()` were only called when navigating to the Session page — not on a recurring timer.
   - Added `setInterval(renderSessionNotes, 5000)`, `setInterval(renderSessionTodos, 5000)`, `setInterval(renderSessionReminders, 5000)` in the DOMContentLoaded handler alongside the existing `loadActiveSession` and `pollForEffects` intervals.
   - Chat-added todos/notes/reminders now appear within 5 seconds without requiring page navigation.

**Index.html overlay (Fix #3 investigation):**
   - `cloudbot.js` already calls `setInterval(loadSessionFromDb, 5000)` which polls `/loadfromfile` every 5s and calls `RefreshTodosArea()`.
   - The overlay IS polling. If todos added via chat don't appear in overlay, the root cause is the `/loadfromfile` endpoint or DB layer (backend concern, not frontend).
   - No changes made to `index.html` or `cloudbot.js`.

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


### Session: Version Footer in Admin Panel

**Date:** 2026-03-15  
**Files changed:** `src/public/admin.html`

**What was added:**

- Added a `.version-footer` div at the bottom of the sidebar `<nav>`, just after the `<ul>` nav list.
- Shows `v1.0.0 · build 2026-03-15` — version from `src/package.json`, date as build stamp.
- Added `.version-footer` CSS: `font-size: 11px`, `color: rgba(255,255,255,0.3)`, `position: absolute; bottom: 16px`, centered. `pointer-events: none` so it never interferes with clicks.
- Added `position: relative` to `.sidebar` so the absolute-positioned footer anchors to the sidebar, not the viewport.

**Decision logged for Romero:** A `/api/version` endpoint would let the frontend always show the live version (auto-updated from `package.json` on each deploy) without hardcoding. Worth adding as a lightweight endpoint.

### Session: Stop Button State Verification & Version Footer

**Date:** 2026-03-15  
**Files changed:** `src/public/admin.html` (add), no JS changes  

**What was verified:**

- **Stop Button State:** Reviewed `sessionStopBtn` behavior in admin panel. Confirmed button is correctly disabled when no session is active, and enabled when stream is running. No bugs found. Implementation already correct.

**What was added:**

- **Version Footer:** Added `.version-footer` div to sidebar `<nav>` element, positioned absolutely at bottom (16px from bottom). Displays `v1.0.0 · build 2026-03-15`. Styled with:
  - `font-size: 11px`
  - `color: rgba(255,255,255,0.3)` (muted)
  - `position: absolute; bottom: 16px; width: 100%; text-align: center`
  - `pointer-events: none` (never interferes with clicks)
- Added `.sidebar { position: relative; }` to anchor footer to sidebar container

**Note:** Version hardcoded from `package.json`. Future enhancement: expose `/api/version` endpoint so footer auto-updates on deploy.

### 2026-03-15 — UI Fixes & Auto-Polling

**Work:** Button consolidation, toggle fixes, auto-polling implementation

**Decisions (16–18):**
- Decision 16: Moved Save/Export buttons into Stream Control card
- Decision 17: Fixed inverted Show/Hide Todo toggle logic in 3 locations
- Decision 18: Added 5-second auto-polling for notes, todos, reminders in admin panel

**Files modified:**
- `src/public/admin.html` — consolidated button placement, fixed toggle logic, added polling intervals

**Details:**
- `setInterval(renderSessionNotes, 5000)` fires every 5s regardless of active page
- `setInterval(renderSessionTodos, 5000)` fires every 5s regardless of active page
- `setInterval(renderSessionReminders, 5000)` fires every 5s regardless of active page
- Render functions check `currentSession` and gracefully no-op if no session active
- Toggle state now properly reflects expected user behavior across all instances

**Verified:**
- Buttons display in correct location
- Toggle logic inverted correctly
- Polling fires without console errors
- Real-time updates visible when chat adds items
