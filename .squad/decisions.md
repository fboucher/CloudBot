# Squad Decisions

## Active Decisions

### Session 2025-07-22 — Admin Panel Backend & Frontend Fixes

#### Romero — API Design (Decision 1–6)

1. **Notes: separate table instead of JSON blob**
   - Replaced JSON blob in `stream_sessions.notes` with dedicated `notes` table (`id`, `session_id`, `text`, `created_at`)
   - Enables CRUD by ID; old bulk-update endpoint kept for backward compat
   - Status: ✅ Implemented

2. **Reminders: added `interval` column**
   - Added `interval INTEGER DEFAULT 0` to `reminders` table via migration
   - `addReminder` DB function now accepts interval parameter
   - Status: ✅ Implemented

3. **New endpoints use `/api/` prefix (canonical)**
   - Stream: `/api/stream/status`, `/api/stream/start`, `/api/stream/stop`, `/api/stream/events`
   - CRUD: `/api/notes`, `/api/todos`, `/api/reminders` (GET/POST/PATCH/DELETE as appropriate)
   - Legacy `/startstream`, `/endstream` routes kept intact
   - Status: ✅ Implemented

4. **SSE for overlay (no socket.io)**
   - Lightweight Server-Sent Events via Node.js `res.write()` with `broadcastSSE()` helper
   - `GET /api/stream/events` for overlay subscription; `POST /api/stream/overlay` for push
   - Automatically called on stream start/stop
   - Status: ✅ Implemented

5. **DB functions return created rows**
   - `addTodo()` and `addReminder()` now return newly inserted rows
   - Allows POST endpoints to respond with created objects (including DB-generated `id`)
   - Status: ✅ Implemented

6. **Chat command handler deferred**
   - No Twitch IRC handler found in codebase
   - When implemented, should call `db.startStreamSession()` / `db.endStreamSession()` + `broadcastSSE()`
   - Mirrors REST endpoints behavior
   - Status: ⏳ Pending (when chatbot IRC implemented)

#### Darlene — Frontend Fixes (15 bugs)

- **Element ID mismatches fixed:** `startStreamBtn` → `sessionStartBtn`, `streamTitleInput` → `sessionTitleInput`, etc.
- **`/api/session` response integration:** Fixed checks for `data.active` flag (now reliably set by Romero's lightweight fix)
- **Dead render functions removed:** Old `renderTodos()` and `renderReminders()` that targeted non-existent HTML containers
- **API migration:** Notes/todos/reminders now fetch live from SQLite via REST endpoints, not stale `streamSessionData` JSON
- **Todo status default:** Changed `'pending'` → `'new'` to match DB default and CSS classes
- **Dashboard stats:** Replaced server-side `db` call with REST `fetch('/api/session/:id')`
- **Overlay SSE:** Added `EventSource('/api/stream/events')` subscription in `index.html` with note display logic
- **Show on stream:** Added per-note "Show" button calling `POST /api/stream/overlay`
- Status: ✅ Implemented (all 15 bugs)

### Session 2026-03-15 — Database Query Fix, UI Enhancements, Session Completeness

#### Romero — Overlay Todos Fix (Decision 7)

7. **Fixed `@libsql/client` parameterized query bug**
   - Root cause: `c.execute(sql, args)` two-arg form invalid; library only accepts `c.execute({ sql, args })` object form
   - Fixed 10 calls across `getSessionById`, `saveSessionData`, `loadSessionData` in `src/db.js`
   - Impact: `/loadfromfile` endpoint now returns correct session data including todos
   - Data flow: Admin creates todo → DB saved → Overlay polls `/loadfromfile` → todos render in `RefreshTodosArea()`
   - Status: ✅ Implemented

8. **Database files excluded from git**
   - Added `*.db`, `*.db-shm`, `*.db-wal`, `src/io/cloudbot.db` to `.gitignore`
   - Prevents accidental commits of local SQLite state
   - Status: ✅ Implemented

#### Darlene — UI Enhancements (Decision 9)

9. **Version/build footer in admin panel sidebar**
   - Added `.version-footer` div at bottom of sidebar showing `v1.0.0 · build 2026-03-15`
   - Styling: 11px, muted color (rgba(255,255,255,0.3)), absolute positioned, non-interactive
   - Version sourced from `package.json`, build date is ISO date stamp
   - Status: ✅ Implemented
   - Future: Consider exposing `/api/version` endpoint for live version auto-update on deploy

#### Stop Button Verification

- **Stop button state:** Already correct — properly disabled when no session active, enabled during stream
- No changes required
- Status: ✅ Verified

#### Romero — Database Driver Migration (Decision 10)

10. **Migrate database layer to @tursodatabase/database**
    - Replace `@libsql/client` with `@tursodatabase/database` as the SQLite driver for CloudBot
    - Database is local file only — no cloud, no `DATABASE_URL` env var
    - Rationale: New Rust-based in-process SQLite engine with no network overhead; better long-term alignment with Turso
    - API contract: `await db.exec(sql)` (DDL), `await db.prepare(sql).run(...)` (INSERT/UPDATE/DELETE), `await db.prepare(sql).get(arg)` (single SELECT), `await db.prepare(sql).all(arg)` (multi SELECT)
    - All prepare chain calls and `db.exec()` must be awaited (library is promise-based; skipping await causes deferred uncaught errors from Rust engine)
    - `src/db.js` fully rewritten — all functions remain async, same public API surface
    - `src/package.json` updated: `@libsql/client` removed, `@tursodatabase/database` added
    - `getClient()` kept as backward-compat export returning `db`
    - No changes required in `src/index.js` — all DB function signatures unchanged
    - Status: ✅ Implemented (smoke tested: init, session CRUD, todos verified)

### Session 2026-03-17 — Cold Boot Database Restoration & Completeness

#### Romero — Cold-Boot API Completeness (Decision 30)

30. **Notes loaded from `notes` table in `/loadfromfile` endpoint**
    - Fixed `loadSessionData()` to query the `notes` table instead of parsing deprecated JSON blob in `stream_sessions.notes`
    - Migration from JSON blob to relational tables (started in Decision 1) now complete
    - Overlay expects Notes as array of strings; admin panel separately queries `/api/notes` for full objects
    - All three cold-boot endpoints verified: `/api/stream/status`, `/api/session`, `/loadfromfile` return complete DB data with no JSON file fallbacks
    - Status: ✅ Implemented

#### Darlene — Cold-Boot Frontend Restoration (Decisions 31–32)

31. **Admin panel: Immediate cold boot data restoration**
    - Modified `loadActiveSession()` to immediately call `renderSessionNotes()`, `renderSessionTodos()`, `renderSessionReminders()`, `renderSessionScores()` when `data.active === true`
    - These render functions already fetch from REST API; they just needed to be invoked on initial load, not only on navigation
    - Result: Admin panel instantly reflects DB state when session is active, even after page refresh
    - Existing 5s polling intervals continue for live updates
    - Status: ✅ Implemented

32. **Stream overlay: Immediate cold boot data load**
    - Modified `DOMContentLoaded` handler in `cloudbot.js` to call `loadSessionFromDb()` immediately before starting 5s interval
    - Before: first poll after 5s delay → blank todos for 5 seconds
    - After: immediate load + 5s polling → todos visible instantly on page load
    - Status: ✅ Implemented

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

### Session 2026-03-18 — Export File Persistence & Session Config Modal

#### Romero — Export File Persistence (Decision 33)

33. **Export endpoint saves markdown to `src/io/show-notes-{id}.md` AND sends browser download**
    - Enhanced `GET /api/export` to write markdown file to disk using `fs.writeFileSync()`
    - Filename pattern: `show-notes-{session_id}.md` (consistent with other session artifacts)
    - File write happens before response, ensuring persistence even if browser doesn't fetch
    - Browser still receives `Content-Disposition: attachment` for native download experience
    - Markdown includes new **Scores/Leaderboard** section: Username, High Score, Best Score, Drops
    - All data sourced directly from DB: `db.getNotes()`, `db.getTodos()`, `db.getReminders()`, `db.getSessionUsers()`
    - Structure: Header (project, title, date), Notes, To-Dos, Reminders, Scores/Leaderboard
    - Returns 404 if no active session
    - Status: ✅ Implemented
    - Note: `/loadfromfile` already returns Project/Title correctly from DB; no changes needed

#### Darlene — Session Config Modal & Double Todo Fix (Decisions 34–35)

34. **Replace inline project/title inputs with Bootstrap modal**
    - Removed two always-visible text inputs from Stream Control card that were overwritten by polling
    - Replaced with read-only display area (`#sessionInfoDisplay`) showing "**Project** — Title" format
    - Added "Configure Session" button opening Bootstrap modal with project/title input fields
    - Modal Save button validates non-empty fields, updates JS state variables, enables Start button if both set
    - When session ACTIVE: display area shows configured values, Configure button disabled (prevents mid-stream changes)
    - When session inactive: display shows placeholder "No session configured", Configure button enabled
    - Eliminated polling race condition that caused user input to vanish mid-typing
    - Status: ✅ Implemented

35. **Fix double todo insertion from chat commands**
    - **Root cause:** `addTodo()` was pushing to local array AND calling API, creating race with 5s polling
    - **Fix:** Removed local `_streamSession.Todos.push()` and `RefreshTodosArea()` calls from `addTodo()`
    - Now uses API-call-then-DB-refresh pattern: `POST /api/todos` → `loadSessionFromDb()` → single render from DB
    - Result: Single source of truth (database), todos appear once in overlay
    - Cold-boot verified: `loadActiveSession()` sets `sessionProjectName`/`sessionStreamTitle` from API and populates display
    - Status: ✅ Implemented

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

### Session 2026-03-18 — Export File Persistence & Session Config Modal (Continued)

#### Romero — Export File Persistence (Decision 36)

36. **Export endpoint saves markdown to `src/io/show-notes-{id}.md` AND sends browser download**
    - Enhanced `GET /api/export` to write markdown file to disk using `fs.writeFileSync()`
    - Directory creation: `fs.mkdirSync(ioDir, { recursive: true })` — guarantees `src/io/` exists before write
    - Error handling: File write wrapped in try/catch with `console.error` — failures now visible in server logs
    - File write happens BEFORE HTTP response, ensuring persistence even if browser doesn't fetch
    - Browser still receives `Content-Disposition: attachment` for native download experience
    - Markdown includes **Stream Title** and **Project URL** sections when present
    - All data sourced directly from DB: `db.getNotes()`, `db.getTodos()`, `db.getReminders()`, `db.getSessionUsers()`
    - Structure: Header (project, title, date), Notes, To-Dos, Reminders, Scores/Leaderboard
    - Returns 404 if no active session
    - Status: ✅ Implemented
    - Code: `src/index.js` lines 481-556, `src/db.js` lines 106-112

#### Romero — Database Schema & API (Decision 37)

37. **Added `project_url` column to `stream_sessions` table**
    - Migration: `ALTER TABLE stream_sessions ADD COLUMN project_url TEXT`
    - Wrapped in try/catch to handle "column already exists" gracefully
    - Added to `createTables()` function in `src/db.js`
    - Status: ✅ Implemented
    - Code: `src/db.js` line 106-112

38. **API endpoints accept and persist `project_url`**
    - `POST /api/stream/start` — accepts `projectUrl` from request body
    - `PATCH /api/session/:id` — accepts `project_url` for updates
    - `GET /api/stream/status` — returns `project_url` in session object
    - `GET /loadfromfile` — returns `ProjectUrl` (PascalCase) for overlay compatibility
    - Modified function: `startStreamSession(projectName, streamTitle, projectUrl)`
    - Status: ✅ Implemented
    - Code: `src/db.js` line 132; `src/index.js` lines 560-577, 368-390, 594-626

#### Darlene — Session Config Modal (Decision 39)

39. **Project URL input field in Configure Session modal**
    - Added "GitHub URL" label + `<input type="url" id="modalProjectUrlInput">` below Stream Title input
    - Field is optional (does not block Start button)
    - JS state: `let sessionProjectUrl = '';` stores URL between modal edits and API calls
    - Modal pre-fills input when opened (allows editing vs. re-typing)
    - Status: ✅ Implemented
    - Code: `src/public/admin.html`

40. **Project URL API integration and display**
    - `POST /api/stream/start` includes `projectUrl: sessionProjectUrl` in request body
    - `PATCH /api/session/:id` includes `project_url: sessionProjectUrl` in request body
    - `GET /api/stream/status (cold-boot)` reads `data.session.project_url` → sets `sessionProjectUrl`
    - Display: `updateSessionInfoDisplay()` renders URL as clickable link when non-empty
    - Format: `<a href="{url}" target="_blank">{url}</a>` (opens in new tab)
    - Status: ✅ Implemented
    - Code: `src/public/admin.html`

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

## Archived Decisions

No archived decisions yet.

#### Romero — Session Export & API Completeness (Decision 11–15)

11. **Export endpoint at `GET /api/export`**
    - New endpoint returns a markdown file of the active session as a browser download
    - Uses `Content-Disposition: attachment; filename="session-YYYY-MM-DD.md"` and `Content-Type: text/markdown`
    - Returns 404 `{ error: 'No active session' }` when no active session exists
    - Markdown format: session header (project, title, started_at, ended_at), Notes, To-Do (with [ ]/[x] checkboxes), Reminders
    - Queries notes/todos/reminders directly via `db.getNotes/getTodos/getReminders`
    - Status: ✅ Implemented

12. **`/api/session` returns flat notes/todos/reminders**
    - Changed from returning `{ ...session, data: sessionData }` to returning a clean flat object:
      `{ id, project_name, stream_title, started_at, ended_at, active, notes, todos, reminders }`
    - `notes`, `todos`, `reminders` are direct arrays from their respective DB tables
    - `active` is a boolean: `!session.ended_at`
    - Status: ✅ Implemented

13. **`/api/stream/status` returns full session object**
    - When a session is active, now returns `{ active: true, session: { ...full session with notes/todos/reminders } }`
    - When no session, still returns `{ active: false }`
    - Status: ✅ Implemented

14. **Chat commands wired to DB via REST API**
    - `addTodo` in `cloudbot.js`: now calls `POST /api/todos { description }` in addition to in-memory update
    - `addReminder` in `cloudbot.js`: now calls `POST /api/reminders { name, message, interval }` in addition to in-memory update
    - `SavingNote` in `cloudbot.js`: now calls `POST /api/notes { text }` in addition to in-memory update
    - In-memory updates kept for immediate overlay display; DB call persists data for admin panel polling
    - Status: ✅ Implemented

15. **Fixed legacy `c.execute()` calls in `index.js`**
    - `/updatestreamtitle` and `/updateproject` still used old `c.execute({ sql, args })` pattern
    - Migrated to `c.prepare(sql).run(...)` to match current `@tursodatabase/database` API
    - Status: ✅ Implemented

#### Darlene — UI Fixes & Auto-Polling (Decision 16–18)

16. **Stream Control card button consolidation**
    - Moved Save and Export buttons from separate locations into Stream Control card
    - Improved visual organization and usability in admin panel
    - Status: ✅ Implemented

17. **Show/Hide Todo toggle fixes**
    - Fixed inverted toggle logic in 3 locations of admin.html
    - Toggle now correctly reflects and controls todo visibility state
    - Status: ✅ Implemented

18. **5-second auto-polling for session data**
    - Added `setInterval(renderSessionNotes/Todos/Reminders, 5000)` in admin panel
    - Lightweight: 3 GET requests every 5s when session active
    - Render functions gracefully no-op when no session exists
    - Keeps admin panel synchronized with chat-added items without manual refresh
    - Status: ✅ Implemented

### Session 2026-03-15 — Export, Persistence & Session Completeness (Phase 2)

#### Romero — Export, Persistence, Legacy Cleanup (Decision 19–24)

19. **Fixed `/api/stream/status` field consumption in `loadActiveSession()`**
    - **Problem:** `loadActiveSession()` read flat fields (`data.sessionId`, `data.projectName`) that never existed in the API response. Response shape is `{ active: true, session: { id, project_name, stream_title, started_at } }`
    - **Fix:** Updated to destructure `data.session` and map to `currentSession` with correct field names
    - **Impact:** Saved `currentSession.id` is now defined; blur handlers and Save button function correctly
    - Status: ✅ Implemented

20. **`PATCH /api/session/:id` endpoint added**
    - New RESTful endpoint to update `project_name` / `stream_title` on existing session
    - Body accepts `{ project_name?, stream_title? }`, updates only provided fields
    - Returns `{ success: true, session }`
    - Legacy `/updateproject` and `/updatestreamtitle` kept for backward-compat
    - Status: ✅ Implemented

21. **Save button wired to `PATCH /api/session/:id`**
    - **Problem:** Save button called `saveCurrentSession()` which guarded on `!streamSessionData` (always null after API shape change)
    - **Fix:** Now guards on `!currentSession`, reads input values, calls `PATCH /api/session/:id`, shows success feedback
    - Status: ✅ Implemented

22. **Export button wired to `GET /api/export`**
    - **Problem:** Export button had fragile client-side markdown generation and hardcoded filename
    - **Fix:** Simplified to `window.location.href = '/api/export'`. Server sends `Content-Disposition: attachment; filename="session-YYYY-MM-DD.md"` for native browser download
    - Status: ✅ Implemented

23. **Export markdown format corrected**
    - Cancelled todos now render as `- ~~description~~` instead of `- [ ] description`
    - Reminders now render as `- **name**: message` (bold name, no interval suffix)
    - Status: ✅ Implemented

24. **Legacy JSON file I/O removed (Phase 2)**
    - `/savetofile`: Removed `fs.writeFile()` call to `src/io/streamSession_<id>.json`. Now fully DB-only
    - `/loadfromfile`: Removed `fs.existsSync()` / `fs.readFileSync()` JSON fallback. Returns safe empty default if no active DB session
    - Note: `/genstreamnotes` intentionally still writes `.md` files (user-facing report generation)
    - Status: ✅ Implemented

#### Darlene — Readability, Form State, Export, Commands (Decision 25–29)

25. **Explicit light text color on list items**
    - Set `color: #e9ecef` directly on `.todo-item`, `.reminder-item` and their child `span` elements
    - Prevents contrast issues depending on browser/OS defaults
    - Do not rely on inheritance from `body { color }` for nested list items
    - Status: ✅ Implemented

26. **Status badge on todos (visible in admin panel)**
    - Added `.todo-status-badge` pill before todo description text
    - Color-coded by status: new=blue, inProgress=orange, done=green, cancel=grey
    - Badge renders inline in `renderSessionTodos()` template
    - Status: ✅ Implemented

27. **Fields disabled (not cleared) after session start**
    - When session **active**: project/title fields populated and set to `disabled = true`
    - When session **inactive**: fields cleared and set to `disabled = false`
    - Prevents unexpected "field vanishing" behavior
    - Status: ✅ Implemented

28. **Export button uses `/api/export` (server-rendered markdown)**
    - Export calls `GET /api/export` (server generates markdown file)
    - Uses standard `URL.createObjectURL()` + dynamic anchor tag for native browser download
    - Server sends `Content-Disposition: attachment` for filename
    - Error shown via `showFeedback()` if session not active
    - Status: ✅ Implemented

29. **Chat commands (`!start`, `!stop`) call REST API**
    - Modified `StreamNoteStart()` to call `POST /api/stream/start` after in-memory updates
    - Modified `StreamNoteStop()` to call `POST /api/stream/stop` before cleanup
    - Preserves existing in-memory logic; API calls are fire-and-forget additions
    - Persists session state to DB instead of relying only on overlay memory
    - Status: ✅ Implemented
