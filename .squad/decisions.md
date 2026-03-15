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
