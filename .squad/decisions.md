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

### Session 2026-03-15 — Database Query Fix & UI Enhancements

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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

## Archived Decisions

No archived decisions yet.
