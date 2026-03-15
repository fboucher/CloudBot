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

### Session: Readability, Form State, Export, and Command Wiring

**Date:** 2026-03-15
**Files changed:** `src/public/admin.html`, `src/public/cloudbot.js`

**What was fixed:**

1. **Task 1 — Readability fix for notes/todos/reminders list items**
   - Added `color: #e9ecef` to `.todo-item, .reminder-item` CSS rule — the items were inheriting a potentially-dark color in some environments.
   - Added explicit `color: #e9ecef` on `.todo-item span, .reminder-item span` for belt-and-suspenders.
   - Added `.todo-status-badge` CSS with per-status colors: `new` = blue, `inProgress` = orange, `done` = green, `cancel` = muted grey.
   - Added status badge `<span class="todo-status-badge ${t.status}">` to the start of each todo's `<span>` in `renderSessionTodos()` template.

2. **Task 2 — Project name / stream title form behavior**
   - In `loadActiveSession()`: when session is active, added `disabled = true` on both `sessionProjectInput` and `sessionTitleInput`. When inactive, added `disabled = false` and clear (values already cleared before, but now explicitly re-enabled).
   - Fields are now kept populated (showing project/title) and disabled while a session is live.
   - After stop: fields clear and re-enable for next session via the existing `loadActiveSession()` inactive branch.
   - No separate "Edit" mechanism added — keeping disabled after start is sufficient per task spec.

3. **Task 3 — Export button wired to `/api/export`**
   - Replaced the old `exportNotesBtn` handler (which depended on `streamSessionData` being loaded in memory) with a proper `fetch('/api/export')` call.
   - Uses `response.blob()` → `URL.createObjectURL` → dynamic `<a>` click download pattern.
   - File is downloaded as `session-export.md`.
   - Error handling shows `showFeedback()` on failure.
   - Save button (`/savetofile`) left unchanged — Romero is preserving that endpoint.

4. **Task 4 — Wire `StreamNoteStart` / `StreamNoteStop` to API**
   - `addTodo`, `addReminder`, `SavingNote` already had API calls added in a prior session — no changes needed.
   - Added `fetch('/api/stream/start', ...)` inside `StreamNoteStart()` after the in-memory + counter logic. Uses `projectName` and `_streamSession.Title || ''` for `streamTitle`.
   - Added `fetch('/api/stream/stop', ...)` at end of `StreamNoteStop()`.
   - Both additions are fire-and-forget (`.catch` logging only) — existing in-memory logic untouched.

**API field name reminder:**
- `POST /api/stream/start` expects `{ projectName, streamTitle }` (camelCase, no underscores)
- `GET /api/stream/status` returns `{ active, sessionId, projectName, streamTitle, startedAt }`

### 2026-03-16 — UI Readability, Form State, Export, and Command Wiring

**Work:** Text contrast fixes, status badges, form field states, export/command wiring

**Decisions (25–29):**
- Decision 25: Set explicit `color: #e9ecef` on `.todo-item` and `.reminder-item` list items (prevents readability issues in dark-card contexts)
- Decision 26: Added color-coded `.todo-status-badge` pills to render before todo description text (new=blue, inProgress=orange, done=green, cancel=grey)
- Decision 27: Form fields now stay populated and disabled during active session, cleared and enabled when inactive (prevents "field vanishing" confusion)
- Decision 28: Export button calls `GET /api/export` for server-rendered markdown download (native browser download via Content-Disposition header)
- Decision 29: Wired `StreamNoteStart()` and `StreamNoteStop()` in cloudbot.js to call `POST /api/stream/start` and `/api/stream/stop` REST endpoints (fire-and-forget, preserve existing in-memory logic)

**Files modified:**
- `src/public/admin.html` — Fixed color inheritance on list items, added status badges, updated form field disabled state logic
- `src/public/cloudbot.js` — Added `fetch()` calls to `StreamNoteStart()` and `StreamNoteStop()` for API persistence

**Impact:**
- Todo/reminder items now readable in dark-card contexts
- Todo status visually indicated via inline colored badge
- Form fields provide clear visual state during stream (disabled) and between streams (enabled, cleared)
- Overlay !start/!stop commands now persist session state to database instead of memory-only
- Export button generates proper downloadable file with correct markdown syntax

### Session: Dynamic version footer, score persistence, leaderboard panel

**Date:** 2026-06-15
**Files changed:** `src/public/admin.html`, `src/public/cloudbot.js`

**What was done:**

30. **Dynamic version footer (`admin.html`)**
    - Changed `<div class="version-footer">v1.0.0 · build 2026-03-15</div>` to `id="versionFooter"` with no hardcoded text.
    - Added `loadVersion()` async function: calls `GET /api/version`, populates element with `v${data.version} · build ${data.build}`.
    - Called on `DOMContentLoaded`. Fails silently if API unavailable.
    - Status: ✅ Implemented

31. **Score persistence fire-and-forget (`cloudbot.js`)**
    - Added `persistUserScore(user)` helper: POSTs to `POST /api/users/score` with username, dropCount, landedCount, highScore, bestHighScore.
    - Called at end of `UserLanded()` (after landedCount++ and highScore updates) and `IncrementDropCounter()` (after dropCount++).
    - Fire-and-forget — errors logged but in-memory logic unaffected.
    - Status: ✅ Implemented

32. **Leaderboard card in Current Session tab (`admin.html`)**
    - Added Bootstrap dark card with `id="sessionScoresList"` below the Reminders card.
    - `renderSessionScores()` polls `GET /api/users` and renders a `table-dark table-sm table-hover` with columns: Player, Drops, Landed, Score, Best.
    - Shows "No players yet." when array is empty.
    - `setInterval(renderSessionScores, 5000)` added alongside other intervals; called once on load and on session page navigation.
    - Status: ✅ Implemented

**Key patterns observed:**
- Fire-and-forget fetch pattern: use `.catch()` inline, no await needed for non-critical persistence.
- Admin panel score polling uses the same 5-second interval pattern as notes/todos/reminders.
- `GET /api/users` returns `{ username, drop_count, landed_count, high_score, best_high_score }` (snake_case from DB), sorted by best_high_score desc.

### Session: Cold Boot Database Restoration

**Date:** 2026-03-16
**Files changed:** `src/public/admin.html`, `src/public/cloudbot.js`

**Problem:**
When the admin panel or stream overlay reloaded (e.g., after browser refresh, OBS scene switch, or server restart), they did not immediately fetch and display the active session state from the database. This created a "cold boot" problem where:
- Admin panel showed empty notes/todos/reminders lists despite an active session with data in DB
- Stream overlay waited 5 seconds before showing todos (first polling tick)
- Both appeared disconnected from the source of truth (SQLite)

**What was fixed:**

33. **Admin panel: Immediate cold boot data restoration**
    - Added render function calls in `loadActiveSession()` when `data.active === true`
    - Now calls: `renderSessionNotes()`, `renderSessionTodos()`, `renderSessionReminders()`, `renderSessionScores()` immediately after setting form state
    - These functions already query `/api/notes`, `/api/todos`, `/api/reminders`, `/api/users` — just needed to be invoked on initial load
    - Result: Admin panel instantly reflects DB state when session is active, even after page refresh
    - The existing 5s polling intervals continue to keep data fresh
    - Status: ✅ Implemented

34. **Stream overlay: Immediate cold boot data load**
    - Modified `DOMContentLoaded` handler in `cloudbot.js` to call `loadSessionFromDb()` once immediately, then start 5s interval
    - Before: `setInterval(loadSessionFromDb, 5000)` — first load after 5s delay
    - After: `loadSessionFromDb()` + `setInterval(loadSessionFromDb, 5000)` — immediate load, then continue polling
    - `loadSessionFromDb()` fetches from `/loadfromfile`, populates `_streamSession.Todos`, calls `RefreshTodosArea()`
    - Result: Overlay displays todos instantly on page load (no 5-second blank state)
    - Status: ✅ Implemented

**Key architectural insight:**
The DB is now the authoritative source of truth. Both frontend clients (admin panel and overlay) must bootstrap themselves from the DB on load — they can't rely on in-memory state or wait for the first polling tick. This ensures consistency across page refreshes, OBS scene switches, and server restarts.

**Pattern established:**
- Admin panel: On `data.active === true`, immediately call all render functions that fetch from REST API
- Overlay: Call session load function once before starting interval timers
- Both: Polling continues as normal after initial bootstrap for live updates

### Session: Cold-Boot Frontend Restoration (Decisions 31–32)

**Date:** 2026-03-17  
**Focus:** Immediate database restoration on page load

**Decision 31 — Admin panel: Immediate cold boot data restoration**

- Modified `loadActiveSession()` in `src/public/admin.html` to immediately call render functions when `data.active === true`
- Now calls: `renderSessionNotes()`, `renderSessionTodos()`, `renderSessionReminders()`, `renderSessionScores()` right after setting form state
- These render functions already query the REST API (`/api/notes`, `/api/todos`, `/api/reminders`, `/api/users`) — they just needed to be invoked on initial load, not only on page navigation or polling
- Result: Admin panel instantly reflects DB state when session is active, even after page refresh
- Existing 5s polling intervals continue to keep data fresh

**Decision 32 — Stream overlay: Immediate cold boot data load**

- Modified `DOMContentLoaded` handler in `src/public/cloudbot.js` to call `loadSessionFromDb()` immediately before starting the 5-second interval
- Before: `setInterval(loadSessionFromDb, 5000)` — first load happened 5 seconds after page load
- After: `loadSessionFromDb()` + `setInterval(loadSessionFromDb, 5000)` — immediate load, then continue polling every 5s
- `loadSessionFromDb()` fetches from `/loadfromfile`, populates `_streamSession.Todos`, and calls `RefreshTodosArea()`
- Result: Overlay displays todos instantly on page load with no 5-second blank state

**Impact:**
- Database is the single source of truth for cold-boot scenarios
- Both clients bootstrap from DB on load (no in-memory state assumptions)
- Consistent UI state across page refreshes, OBS scene switches, server restarts

**Files Modified:**
- `src/public/admin.html` — Added immediate render function calls in `loadActiveSession()`
- `src/public/cloudbot.js` — Added immediate `loadSessionFromDb()` call before interval

### Session: Session Config Modal + Double Todo Fix

**Date:** 2026-03-18  
**Files changed:** `src/public/admin.html`, `src/public/cloudbot.js`

**Problem:**
1. Users typing into the project name and stream title fields on the Stream Control card experienced their text being reset mid-typing. Root cause: `loadActiveSession()` runs every 5 seconds and calls `setInputIfNotFocused()` to update the input values from DB state, but the "not focused" check didn't account for the race condition where polling would overwrite uncommitted edits.
2. When the `!todo-add` chat command was used, the todo appeared twice in the stream overlay list.
3. Cold-boot did not display project name and stream title when the page loaded with an active session (though this was already fixed in the previous implementation).

**What was fixed:**

35. **Replaced inline inputs with Bootstrap modal for session configuration**
    - Removed the two inline text inputs (`#sessionProjectInput` and `#sessionTitleInput`) from the Stream Control card
    - Replaced with:
      - A read-only display area (`#sessionInfoDisplay`) showing `<strong>Project</strong> — Title` when configured, or placeholder text "No session configured" when empty
      - A "Configure" button (`#configureSessionBtn`) that opens a Bootstrap modal (`#sessionConfigModal`)
    - The modal contains:
      - Two inputs: `#modalProjectInput` (project name) and `#modalTitleInput` (stream title)
      - Footer buttons: "Cancel" (dismisses modal) and "Save" (validates, updates JS variables, closes modal)
    - JavaScript state management:
      - Added two JS variables: `sessionProjectName` and `sessionStreamTitle` (stored in memory, not in DOM inputs)
      - The modal pre-fills with current values when opened
      - On "Save": validates both fields are non-empty, updates the variables, calls `updateSessionInfoDisplay()` to update the read-only display, enables the Start button if both values are set, then closes the modal
    - When a session is ACTIVE:
      - `loadActiveSession()` sets `sessionProjectName` and `sessionStreamTitle` from `data.session.project_name` and `data.session.stream_title`
      - Calls `updateSessionInfoDisplay()` to show the project/title in the read-only area
      - Disables the "Configure" button (cannot reconfigure mid-stream)
    - When a session ends (or is not active):
      - Re-enables the "Configure" button
      - Display area shows placeholder or current configured values (from JS variables)
    - Start button validation: only enabled when both `sessionProjectName` and `sessionStreamTitle` have non-empty values (checked in `updateStartBtnState()`)
    - Removed all `input` event listeners on the old inputs and the `setInputIfNotFocused()` helper function
    - Removed the `change` event listeners for blur-to-save behavior on the old inputs (these were only for mid-session edits, which are now done via the Save button in the control card)
    - Status: ✅ Implemented

36. **Fixed double todo insertion from `!todo-add` chat command**
    - Root cause: `addTodo()` in `cloudbot.js` both pushed the todo to the local `_streamSession.Todos` array AND called the API. Then `loadSessionFromDb()` runs every 5s and replaces `_streamSession.Todos` with DB data, causing a visual duplicate during the race window between the API call completing and the next poll.
    - Fix: Removed the local in-memory push (`_streamSession.Todos.push(...)`) and the immediate `RefreshTodosArea()` call. Now only calls the API (`POST /api/todos`), then triggers an immediate `loadSessionFromDb()` to fetch the updated list from the database.
    - Result: Single source of truth (DB) — no local array manipulation. The todo appears once, immediately after the API call completes and `loadSessionFromDb()` fetches it.
    - Status: ✅ Implemented

37. **Verified cold-boot loads project name and stream title**
    - Already working: `loadActiveSession()` reads `data.session.project_name` and `data.session.stream_title` from `/api/stream/status` when `data.active === true`
    - Now sets `sessionProjectName` and `sessionStreamTitle` JS variables from these values
    - Calls `updateSessionInfoDisplay()` to populate the read-only display area
    - No modal interaction needed on cold-boot — the session is already configured, so the display area just shows the values
    - Status: ✅ Verified (already working, enhanced by modal implementation)

**Key architectural changes:**
- Session config (project name, stream title) now stored in JS variables, not in always-visible DOM inputs
- Modal pattern prevents polling from interfering with user input
- Todo list rendering now 100% driven by DB state — no local array manipulation for chat commands
- Admin panel no longer has blur-to-save behavior for project/title during active session — use the Save button in the Stream Control card to update DB

**Files Modified:**
- `src/public/admin.html` — Replaced inputs with display area + Configure button, added session config modal, refactored JS to use modal and variables
- `src/public/cloudbot.js` — Removed in-memory todo push, now relies on API + immediate DB refresh

### Session: Session Config Modal + Double Todo Fix (2026-03-18)

**Date:** 2026-03-18  
**Decision:** Decisions 34–35 — Modal UX + double todo fix

**What was implemented:**

1. **Session config moved from inline inputs to Bootstrap modal**
   - Removed `#sessionProjectInput` and `#sessionTitleInput` from Stream Control card
   - Added "Configure Session" button + read-only display area (`#sessionInfoDisplay`)
   - Created Bootstrap modal with project/title inputs and Save button
   - JS state variables (`sessionProjectName`, `sessionStreamTitle`) instead of DOM-as-state
   - Modal pre-fills with current values on open
   - Save validates both fields non-empty, updates display, enables Start button
   - When session ACTIVE: display shows values, Configure button disabled (prevents mid-stream edits)
   - When session inactive: display shows placeholder, Configure button enabled

2. **Fixed double todo insertion from chat commands**
   - **Root cause:** `addTodo()` was pushing to local `_streamSession.Todos` array AND calling API, creating race with 5s polling
   - **Fix:** Removed local array push and `RefreshTodosArea()` call
   - New pattern: `POST /api/todos` → `loadSessionFromDb()` → single render from DB
   - Result: Todos appear once per command, single source of truth (database)

3. **Cold-boot data restoration verified and enhanced**
   - `loadActiveSession()` now sets JS variables from API response
   - `updateSessionInfoDisplay()` called on page load to populate read-only area
   - Overlay correctly loads project/title from DB on refresh

**Architectural patterns established:**
- **Modal for polled configuration:** When a field is both polled and user-editable, use a modal instead of inline inputs to prevent polling from resetting user input
- **API-then-refresh for chat commands:** Never manipulate local arrays directly; always call API first, then refresh from DB
- **Cold-boot restoration:** On page load with active session, immediately populate UI state from API (don't wait for first polling tick)

**Key bug fixes:**
- ✅ "Vanishing text" bug eliminated (modal prevents polling interference)
- ✅ Double todos eliminated (DB-only source of truth)
- ✅ Cold-boot project/title loading verified and enhanced

**Files Modified:**
- `src/public/admin.html` — Modal UX implementation, refactored JS
- `src/public/cloudbot.js` — `addTodo()` fix (API-then-refresh pattern)

### Session: Added Project URL to Configure Session Modal (2026-03-18)

**Date:** 2026-03-18  
**Requested by:** fboucher  
**Context:** Backend (Romero) is adding `project_url` field to session schema. Frontend needs to capture, persist, and display it.

**What was implemented:**

1. **Added third input field to `#sessionConfigModal`**
   - Label: "GitHub URL"
   - Input: `id="modalProjectUrlInput"`, `type="url"`, placeholder="https://github.com/..."
   - Placed below Stream Title input in modal body
   - Field is optional (does not block Start button)

2. **JS variable added**
   - `let sessionProjectUrl = '';` — stores project URL between modal edits and API calls

3. **Modal Save handler updated**
   - Reads `modalProjectUrlInput.value.trim()` → stores in `sessionProjectUrl`
   - URL is optional (validation only checks project name and title)
   - Modal remains dismissible even if URL is empty

4. **Session start endpoint updated**
   - `POST /api/stream/start` now includes `projectUrl: sessionProjectUrl` in JSON body
   - Sent alongside `projectName` and `streamTitle`

5. **Cold-boot restoration enhanced**
   - `loadActiveSession()` reads `data.session.project_url` from API response
   - Sets `sessionProjectUrl = s.project_url || ''`
   - Calls `updateSessionInfoDisplay()` to render URL in session info area

6. **Session info display updated**
   - `updateSessionInfoDisplay()` now conditionally renders URL below project/title line
   - Format: `<div class="text-muted small mt-1"><a href="{url}" target="_blank">{url}</a></div>`
   - Only shown if `sessionProjectUrl` is non-empty
   - Link opens in new tab

7. **Save (PATCH) endpoint updated**
   - `PATCH /api/session/:id` now includes `project_url: sessionProjectUrl` in body
   - Persists URL changes to database

8. **Modal pre-fill enhanced**
   - When user opens modal before starting a session, `modalProjectUrlInput.value` pre-filled with current `sessionProjectUrl`
   - Allows editing rather than re-typing
   - Works for both initial configuration and re-configuration

**Key behaviors:**
- ✅ Project URL is optional — Start button not blocked by empty URL
- ✅ URL persisted on session start, cold-boot, and explicit save
- ✅ URL displayed in session info area when non-empty
- ✅ Modal pre-fills URL for editing
- ✅ No existing functionality broken (project/title logic unchanged)

**Files Modified:**
- `src/public/admin.html` — Added modal input field, JS variable, updated handlers and display logic

## 2026-03-18 — Project URL in Session Config Modal (Spawn Agent 30)

**Date:** 2026-03-18  
**Status:** ✅ Implemented

### Summary

Added GitHub URL capture field to Configure Session modal and wired project URL through session start/patch/cold-boot flows.

### Tasks Completed

1. **Modal UI Enhancement**
   - Added "GitHub URL" label + `<input type="url" id="modalProjectUrlInput">`
   - Positioned below Stream Title input in existing modal
   - Field is optional (does not block Start button)
   - Uses Bootstrap 5 dark theme styling

2. **JavaScript State**
   - Created `let sessionProjectUrl = '';` variable
   - Stores URL between modal edits and API calls
   - Modal pre-fills input when opened (allows editing vs. re-typing)

3. **API Integration**
   - `POST /api/stream/start` includes `projectUrl: sessionProjectUrl` in body
   - `PATCH /api/session/:id` includes `project_url: sessionProjectUrl` in body
   - `GET /api/stream/status (cold-boot)` reads `data.session.project_url` → sets `sessionProjectUrl`

4. **Display & UX**
   - `updateSessionInfoDisplay()` renders URL as clickable link when non-empty
   - Format: `<a href="{url}" target="_blank">{url}</a>` (opens in new tab)
   - Only shown when URL is non-empty
   - Modal pre-fill enables quick editing on reconfiguration

### Files Modified

- `src/public/admin.html` — Modal field, JS variable, event handlers, display logic

### Backward Compatibility

✅ URL is optional — old sessions without URL continue to work  
✅ No breaking changes to existing project/title logic  
✅ Cold-boot correctly restores URL if present

### Key Decisions

- Optional field: URL does not block session start
- Bootstrap modal pattern: prevents polling from overwriting user input
- Pre-fill on modal open: improves UX for re-configuration
- Browser native `type="url"` for basic validation
- Display full URL (not shortened): team can enhance later if needed

## 2026-03-18 — Remove GitHub URL Input & Auto-generate from Project Name (Spawn Agent 31)

**Date:** 2026-03-18  
**Status:** ✅ Implemented

### Summary

Removed the GitHub URL input field from Configure Session modal. URL is now auto-computed from project name using the pattern `https://github.com/FBoucher/${projectName}`. This eliminates manual entry and ensures URL consistency.

### Root Cause

Previous session (Agent 30) incorrectly added a manual GitHub URL input field. Romero discovered that URLs follow a predictable pattern based on project name alone, making manual entry unnecessary.

### Tasks Completed

1. **Removed Modal HTML**
   - Deleted entire "GitHub URL" `<div class="mb-3">` block from `#sessionConfigModal`
   - Removed label, input field (`#modalProjectUrlInput`), and placeholder
   - Modal now shows only two fields: Project Name and Stream Title

2. **Removed JS Variable**
   - Deleted `let sessionProjectUrl = '';` declaration
   - Variable no longer needed — URL derived on-demand from `sessionProjectName`

3. **Cleaned Modal Event Handlers**
   - Removed `modalProjectUrlInput` value read/write in Configure button click handler
   - Removed URL input read in Save button click handler
   - Removed `sessionProjectUrl` assignment

4. **Updated Display Function**
   - `updateSessionInfoDisplay()` now computes URL inline: `https://github.com/FBoucher/${sessionProjectName}`
   - URL displayed as clickable link only when `sessionProjectName` is set
   - No separate storage — derived fresh on each render

5. **Updated Start Button Handler**
   - `POST /api/stream/start` now computes URL before fetch: `const projectUrl = sessionProjectName ? 'https://github.com/FBoucher/${sessionProjectName}' : ''`
   - Passes computed URL in request body

6. **Updated PATCH Handler**
   - `saveCurrentSession()` computes URL before PATCH: `const projectUrl = sessionProjectName ? 'https://github.com/FBoucher/${sessionProjectName}' : ''`
   - Sends computed URL in `project_url` field

7. **Cold-Boot Handling**
   - Removed `sessionProjectUrl = s.project_url || ''` assignment in `loadActiveSession()`
   - API still returns `project_url` field but frontend no longer stores it separately
   - Display derives URL from `sessionProjectName` on demand

### Files Modified

- `src/public/admin.html` — Modal HTML, JS variables, event handlers, display logic

### Result

✅ Modal has exactly two fields: Project Name (required) and Stream Title (required)  
✅ No manual URL entry — user types project name only  
✅ URL auto-generated consistently: `https://github.com/FBoucher/${projectName}`  
✅ Existing functionality preserved — cold-boot, display, API calls all work  
✅ No stored state — URL computed on-demand from project name

### Key Decisions

- **DRY principle:** Single source of truth (project name) → reduces data entry and sync bugs
- **Zero manual input:** URL pattern is known — no need for user to type it
- **Backward compatible:** API still accepts `project_url` field (computed by frontend)
- **On-demand derivation:** No separate variable — URL computed where needed

### Agent 33 — GitHub URL Auto-Generation: Remove Manual Input (2026-03-18)

**Task:** Remove GitHub URL input field from admin panel modal; auto-compute URL from project name in all POST/PATCH handlers.

**Findings (from Romero):**
- GitHub URL format is always predictable: `https://github.com/FBoucher/${projectName}`
- Admin panel was forcing manual input for no reason (URL can be auto-derived)
- Darlene's earlier Agent 30 added the URL field; now reversing it for better UX

**Changes Made (7 edits to admin.html):**
1. **Modal HTML:** Removed `<input type="url">` for GitHub URL (lines 570–573)
2. **Variables:** Deleted `let sessionProjectUrl = '';` (line 614)
3. **Modal handlers:** Removed URL input reads/writes (lines 688–711)
4. **Display function:** Changed from stored variable to inline: `const projectUrl = 'https://github.com/FBoucher/${sessionProjectName}'` (lines 714–725)
5. **Start button:** Added inline URL computation before POST (line 968)
6. **PATCH handler:** Added inline URL computation before update (line 1279)
7. **Cold-boot:** Removed `sessionProjectUrl` assignment from session load (line 744)

**Result:**
- ✅ Modal simplified to 2 fields (Project Name + Stream Title, no URL)
- ✅ URL always auto-generated in 3 places: display, start, PATCH
- ✅ No separate state variable for URL (single source of truth = project name)
- ✅ Zero remaining references to manual URL input

**Coordination:** Worked with Agent 32 (Romero) who updated backend to receive and store projectUrl.

**Status:** ✅ Complete  
**Related Decision:** Decision 30 (merged to decisions.md)
