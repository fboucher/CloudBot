# Romero — History

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

### 2025-07-22 — Admin Panel Backend Implementation

**Endpoints that already existed (legacy, kept intact):**
- `POST /startstream` — starts session (needs `{ project, title }`)
- `POST /endstream` — ends session (needs `{ sessionId }`)
- `POST /savetofile` / `GET /loadfromfile` — bulk session save/load
- `POST /api/session/notes` — bulk note replace (JSON array)
- `POST /api/session/todos` + `PUT` + `DELETE` — todos (under `/api/session/` prefix)
- `POST /api/session/reminders` + `PUT` + `DELETE` — reminders (under `/api/session/` prefix)
- `GET /api/session`, `GET /api/sessions`, `GET /api/session/:id`
- `POST /triggereffect`, `GET /currenteffect`, `POST /cleareffect`
- `POST /settodosvisibility`, `GET /gettodosvisibility`

**Endpoints added:**
- `POST /api/stream/start` — accepts `{ projectName, streamTitle }`, starts session + increments counter, broadcasts SSE
- `POST /api/stream/stop` — auto-detects active session, stops it, broadcasts SSE
- `GET /api/stream/status` — returns `{ active, sessionId, projectName, streamTitle, startedAt }`
- `GET /api/stream/events` — SSE endpoint for overlay (text/event-stream)
- `POST /api/stream/overlay` — push arbitrary event payload to all SSE clients
- `GET /api/notes` — get all notes for active session
- `POST /api/notes { text }` — add note, returns created note row
- `DELETE /api/notes/:id` — delete note by ID
- `GET /api/todos` — get all todos for active session
- `POST /api/todos { description }` — add todo, returns created todo row
- `PATCH /api/todos/:id { status }` — update todo status
- `DELETE /api/todos/:id` — delete todo
- `GET /api/reminders` — get all reminders for active session
- `POST /api/reminders { name, interval, message }` — add reminder, returns created row
- `DELETE /api/reminders/:id` — delete reminder

**DB schema additions:**
- New `notes` table: `id, session_id, text, created_at`
- `interval INTEGER DEFAULT 0` column added to `reminders` table (via migration)
- `addNote`, `getNotes`, `deleteNote`, `getTodos`, `getReminders` functions added to db.js
- `addTodo` and `addReminder` now return the created row

**Patterns used:**
- SSE via Node.js `res.write()` with a `Set` of client response objects; `broadcastSSE()` helper notifies all
- All new endpoints auto-resolve current session via `db.getActiveSession()` — no session ID needed from client
- No socket.io — project had no realtime infra; SSE added from scratch
- Chat commands (!start/!stop) not found in codebase; documented in decisions for future implementation

### 2026-03-15 — Admin Panel Fixes Session (Follow-up)

**Lightweight endpoint enhancement:**
- `GET /api/session` now includes `active: true` in response when a session exists
- Critical for frontend `loadActiveSession()` check: `if (data.active)` now works correctly
- Unblocked all dependent features (notes, todos, reminders rendering) on frontend

**Files modified:**
- `src/index.js` — `/api/session` response augmented with `active: true` flag

**Impact:**
- Admin panel now correctly detects active sessions
- All Darlene's frontend fixes (15 bugs) now working with proper backend contract
- Source of truth confirmed: SQLite database via REST endpoints

### 2026-03-15 — Overlay Todos Fix + DB .gitignore

**Root cause identified: `@libsql/client` two-arg execute bug**
- `c.execute(sql, args)` (two-arg JS call) is NOT valid for `@libsql/client` — the library's `execute(stmt)` method only accepts ONE argument (`string` or `{ sql, args }` object). The second JS arg is silently dropped.
- This caused all parameterized queries in `getSessionById` and `loadSessionData` to run with unbound `?` parameters, making `better-sqlite3` throw at runtime.
- As a result, `/loadfromfile` returned HTTP 500 on every call → the stream overlay's `loadSessionFromDb()` polled but got errors → todos (and all session data) never rendered.

**Files modified:**
- `src/db.js` — Converted 10 two-arg `c.execute(sql, [args])` calls to proper `c.execute({ sql, args })` object form in `getSessionById`, `saveSessionData`, and `loadSessionData`.
- `.gitignore` — Added `*.db`, `*.db-shm`, `*.db-wal`, `src/io/cloudbot.db` to prevent SQLite DB from being committed.

**Data flow (verified correct after fix):**
1. Admin creates todo via `POST /api/todos` → `db.addTodo()` (always used object form, always worked)
2. Overlay polls `GET /loadfromfile` → `db.loadSessionData(id)` → now correctly queries `todos` table → returns `Todos: [{ id, description, status }]`
3. `cloudbot.js` `loadSessionFromDb()` maps `data.Todos` into `Todo` objects and calls `RefreshTodosArea()`
4. `checkTodosVisibility()` polls `GET /gettodosvisibility` separately (unchanged, still works)

**`todosVisibility` flag still works:**
- `SetTodoVisibility` is called from `checkTodosVisibility` every 2s (separate from data polling)
- No changes needed there; the visibility toggle is independent of the data load path

### 2026-03-15 — Follow-up: @libsql/client Query Bug Fix + Gitignore

**Files modified:** `src/db.js`, `.gitignore`

**Root cause:** `@libsql/client` does NOT support two-argument execute: `c.execute(sql, args)`. The library's `execute()` method only accepts a single argument: `string` (for no params) or `{ sql, args }` (for parameterized). When called with two args, the second arg is silently ignored.

**Impact:** All parameterized queries in `getSessionById()`, `saveSessionData()`, and `loadSessionData()` were running with unbound `?` placeholders, causing `better-sqlite3` to throw at runtime. This broke `/loadfromfile` endpoint (HTTP 500), which prevented the overlay from ever loading todos, notes, or reminders.

**Fixes applied:**
- `getSessionById()`: Fixed 2 parameterized queries
- `saveSessionData()`: Fixed 4 parameterized queries (notes, todos, reminders bulk operations)
- `loadSessionData()`: Fixed 4 parameterized queries (data retrieval)

All 10 calls now use correct syntax: `c.execute({ sql, args })`

**Gitignore updates:**
- Added `*.db`, `*.db-shm`, `*.db-wal` (SQLite WAL files)
- Added `src/io/cloudbot.db` (project database)
- Reason: Prevent accidental commits of local database state

**Data flow now working:**
1. Admin creates todo → `db.addTodo()` ✅ (was always correct)
2. Overlay polls `/loadfromfile` → `db.loadSessionData()` ✅ (NOW FIXED)
3. Overlay renders todos via `RefreshTodosArea()` ✅

**Todos visibility toggle independent:** `checkTodosVisibility()` polls `/gettodosvisibility` on separate 2-second interval. No changes needed there.

### 2026-03-15 — Session Export, Session Completeness, Chat Commands DB Wiring

**Endpoints fixed/added in `src/index.js`:**

- **`GET /api/export`** (new): Generates a markdown file of the active session for browser download.
  - Headers: `Content-Disposition: attachment; filename="session-YYYY-MM-DD.md"`, `Content-Type: text/markdown`
  - Returns 404 `{ error: 'No active session' }` if no active session.
  - Markdown format: `# Stream Session — ProjectName`, title/started/ended, `## Notes` (bullet list), `## To-Do` (`[ ]`/`[x]` checkboxes), `## Reminders` (name: message (interval: Xmin))
  - Queries directly via `db.getNotes`, `db.getTodos`, `db.getReminders`

- **`GET /api/session`** (fixed): Now returns flat object with `notes`, `todos`, `reminders` arrays:
  `{ id, project_name, stream_title, started_at, ended_at, active, notes, todos, reminders }`
  Previously returned `{ ...session, data: sessionData }` (nested, wrong shape).

- **`GET /api/stream/status`** (fixed): Now returns `{ active: true, session: { full session + notes/todos/reminders } }` when active.
  Previously only returned `{ active, sessionId, projectName, streamTitle, startedAt }`.

- **`/updatestreamtitle` + `/updateproject`** (fixed): Migrated from old `c.execute({ sql, args })` to `c.prepare(sql).run(...)` — the only two remaining legacy patterns in `index.js`.

**Frontend wiring in `src/public/cloudbot.js`:**

- `addTodo()`: Now calls `POST /api/todos { description }` to persist to DB (in addition to in-memory update for overlay)
- `addReminder()`: Now calls `POST /api/reminders { name, message, interval }` to persist to DB
- `SavingNote()`: Now calls `POST /api/notes { text }` to persist to DB
- ComfyJS handlers live in `index.html` (browser overlay), NOT in `src/index.js` — documented for future reference

**Files modified:** `src/index.js`, `src/public/cloudbot.js`


**What changed:**
- Replaced `@libsql/client` with `@tursodatabase/database` (Rust-based in-process SQLite, local file only)
- Removed `getDbUrl()` and `DATABASE_URL` env var support — pure local file path now
- `initDb()` uses `const { connect } = await import('@tursodatabase/database')` (ESM via dynamic import in CJS)
- All query methods migrated from `c.execute({ sql, args })` to `db.prepare(sql).run/get/all` pattern
- `result.lastInsertId` → `result.lastInsertRowid`
- `result.rows` → direct return from `.all()` / `.get()`

**Critical discovery — API is fully async:**
The task brief described the API as "sync-style" but the actual `@tursodatabase/database` package (`promise.js` variant) requires `await` on ALL calls: `db.exec()`, `db.prepare().run()`, `.get()`, `.all()`. Not awaiting caused deferred uncaught exceptions from the Rust engine's internal state machine. All calls in db.js now use `await`.

**`db.exec()` in migrations:**
The migration try/catch blocks use `await db.exec(...)` — errors are properly caught when a column already exists.

**`getClient()` kept for backward compat:**
`getClient()` still exported from `module.exports` and returns `db` — in case any external caller relies on it.

**Files modified:**
- `src/db.js` — full rewrite
- `src/package.json` — swapped `@libsql/client` for `@tursodatabase/database`

**Verified:**
- Fresh DB creation works (all tables, stream_counter init)
- Migration path works (ALTER TABLE no-ops on existing DB)
- CRUD operations work: `startStreamSession`, `getActiveSession`, `addTodo`, `getTodos`, `endStreamSession`

### 2026-03-15 — Session Export & API Completeness

**Work:** Export endpoint, API enrichment, chat persistence, legacy fixes

**Decisions (11–15):**
- Decision 11: New `GET /api/export` endpoint generates markdown download of active session
- Decision 12: `/api/session` returns flat object with nested notes/todos/reminders arrays
- Decision 13: `/api/stream/status` returns full session object when active
- Decision 14: Chat commands in `cloudbot.js` now persist via REST API (`POST /api/todos`, `/reminders`, `/notes`)
- Decision 15: Fixed 2 legacy `c.execute()` calls in `/updatestreamtitle` and `/updateproject` routes

**Files modified:**
- `src/index.js` — added `GET /api/export` endpoint, updated `/api/session` and `/api/stream/status` response shape, migrated legacy execute calls
- `src/public/cloudbot.js` — wired !todo, !note, !reminder commands to call POST endpoints

**Verified:**
- Export endpoint returns proper Content-Disposition and markdown formatting
- `/api/session` and `/api/stream/status` return complete session state
- Chat commands persist to database
- Legacy routes work with new driver API
