# CloudBot Commands Audit

**Date:** 2025-03-15  
**Scope:** All Twitch chat commands (`!command`) and admin panel buttons  
**Status:** Planning phase — analysis only, no code changes  

---

## Overview

CloudBot provides command handling through **two distinct paths**:
1. **Admin Panel Buttons** (`src/public/admin.html`) — Direct REST API calls via `/api/*` endpoints
2. **Twitch Chat Commands** (`!command`) — Currently **NOT IMPLEMENTED** in codebase (ComfyJS/IRC integration missing)

**Key Finding:** While chat commands are referenced in frontend code (e.g., function names like `addTodo()`, `SetTodoStatus()`), there is **no active Twitch IRC event handler** in `src/index.js`. Commands can only be triggered via admin panel buttons.

---

## Admin Panel Commands (Implemented)

### Session Management

| Command | What It Does | Database | File I/O | Admin Button | Priority |
|---------|------------|----------|----------|--------------|----------|
| **START SESSION** | POST `/api/stream/start` — Creates new stream session, increments counter, broadcasts SSE | ✅ Yes (`startStreamSession()`) | ✅ Still saves JSON (legacy `/savetofile`) | ✅ "Start" button (`sessionStartBtn`) | 🔴 HIGH |
| **STOP SESSION** | POST `/api/stream/stop` — Ends active session, marks `ended_at`, broadcasts SSE | ✅ Yes (`endStreamSession()`) | ✅ Calls `SaveToFile()` via admin (legacy) | ✅ "Stop" button (`sessionStopBtn`) | 🔴 HIGH |
| **UPDATE PROJECT** | POST `/api/session/:id` (legacy `/updateproject`) — Updates `project_name` | ✅ Yes (raw SQL) | ✅ Legacy JSON update | ✅ Inline in session panel | 🟡 MEDIUM |
| **UPDATE TITLE** | POST `/api/session/:id` (legacy `/updatestreamtitle`) — Updates `stream_title` | ✅ Yes (raw SQL) | ✅ Legacy JSON update | ✅ Inline in session panel | 🟡 MEDIUM |

---

### Notes Management

| Command | What It Does | Database | File I/O | Admin Button | Priority |
|---------|------------|----------|----------|--------------|----------|
| **!note** (chat) | Should add note to current session | ✅ Yes (`addNote()` exists) | ❌ No longer uses files | ❌ Missing — only admin panel button | 🔴 HIGH |
| **Add Note** | `POST /api/notes` — Adds text note to session via modal | ✅ Yes (`addNote()` in db.js) | ❌ No | ✅ "Add Note" button (modal) | ✅ GREEN |
| **Delete Note** | `DELETE /api/notes/:id` — Removes note by ID | ✅ Yes (`deleteNote()`) | ❌ No | ✅ Per-note delete button | ✅ GREEN |
| **Show on Stream** | `POST /api/stream/overlay` — Broadcasts note to overlay via SSE | ✅ Not stored | ❌ No | ✅ Per-note "Show" button | ✅ GREEN |

**Status:** Notes are database-backed; chat command handler missing.

---

### Todos Management

| Command | What It Does | Database | File I/O | Admin Button | Priority |
|---------|------------|----------|----------|--------------|----------|
| **!todo** (chat) | Should add todo to current session | ✅ Yes (`addTodo()` exists) | ❌ No longer uses files | ❌ Missing — only admin panel button | 🔴 HIGH |
| **Add Todo** | `POST /api/todos` — Adds todo with status='new' | ✅ Yes (`addTodo()`) | ❌ No | ✅ "Add Todo" button (modal) | ✅ GREEN |
| **Set Status** | `PATCH /api/todos/:id` — Updates status (new/inProgress/done/cancel) | ✅ Yes (`updateTodoStatus()`) | ❌ No | ✅ Status buttons (New/In Progress/Done/Delete) | ✅ GREEN |
| **Delete Todo** | `DELETE /api/todos/:id` — Removes todo | ✅ Yes (`deleteTodo()`) | ❌ No | ✅ Per-todo delete button | ✅ GREEN |
| **Toggle Visibility** | `POST /settodosvisibility` — Show/hide todos on overlay | ✅ No (in-memory state) | ❌ No | ✅ "Toggle" button | 🟡 MEDIUM |

**Status:** Todos are database-backed; chat command handler missing.

---

### Reminders Management

| Command | What It Does | Database | File I/O | Admin Button | Priority |
|---------|------------|----------|----------|--------------|----------|
| **!reminder** (chat) | Should add reminder to current session | ✅ Yes (`addReminder()` exists) | ❌ No longer uses files | ❌ Missing — only admin panel button | 🔴 HIGH |
| **Add Reminder** | `POST /api/reminders` — Adds reminder with status='active' & optional interval | ✅ Yes (`addReminder()`) | ❌ No | ✅ "Add Reminder" button (modal) | ✅ GREEN |
| **Delete Reminder** | `DELETE /api/reminders/:id` — Removes reminder | ✅ Yes (`deleteReminder()`) | ❌ No | ✅ Per-reminder delete button | ✅ GREEN |

**Status:** Reminders are database-backed; chat command handler missing; interval feature added but not yet used by chat commands.

---

## Special Effects (Admin Triggers)

| Command | What It Does | Database | File I/O | Admin Button | Priority |
|---------|------------|----------|----------|--------------|----------|
| **HELLO** | `POST /Hello` — Generates text-to-image, plays sound | ❌ No | ✅ Yes (generates `.png` in `/public/medias/generated/`) | ✅ "Hello" button + modal | 🟡 MEDIUM |
| **ATTENTION** | `POST /Attention` — Generates text-to-image with message, plays sound | ❌ No | ✅ Yes (generates `.png`) | ✅ "Attention" button + modal | 🟡 MEDIUM |
| **DROP** | `POST /triggereffect` — Shows "Wow" cloud, plays sound | ❌ No | ❌ No | ✅ "Drop" button (no modal) | 🟡 MEDIUM |
| **RAIN** | `POST /triggereffect` — Darkens sky, animates rain | ❌ No | ❌ No | ✅ "Rain" button (no modal) | 🟡 MEDIUM |
| **SUN** | `POST /triggereffect` — Clears rain, lightens sky | ❌ No | ❌ No | ✅ "Sun" button (no modal) | 🟡 MEDIUM |

**Status:** Effects work via SSE push to overlay; chat commands missing.

---

## Data Persistence & Legacy Code

| Endpoint | Purpose | Current Behavior | Cleanup Needed |
|----------|---------|------------------|-----------------|
| `/savetofile` | Legacy bulk session save | Saves to DB + writes JSON file | 🚩 Remove JSON write, keep DB only |
| `/loadfromfile` | Loads active session or fallback | Reads from DB (preferred) or JSON (fallback) | 🚩 Remove JSON fallback once migration complete |
| `/genstreamnotes` | Generates markdown notes file | Writes to `.md` file in `/io/` | ✅ Needed (generates reports) |
| `/incrementstreamcounter` | Increments global stream counter | Reads/writes from DB only | ✅ GOOD |

---

## Chat Command Handler Gap

**Critical Issue:** No Twitch IRC integration found.

```
MISSING CODE PATTERN:
- No ComfyJS event listeners (OnChat, OnConnected, etc.)
- No function to map !command → DB function
- No active chat command parsing

EXPECTED WHEN IMPLEMENTED:
- Listen to ComfyJS.OnChat() events
- Parse message.text for !start, !stop, !note, !todo, !reminder, etc.
- Call corresponding db.* or API functions
- Broadcast effects via broadcastSSE() to overlay
```

**Reference from decisions.md (Decision 6):**  
> "Chat command handler deferred. When implemented, should call `db.startStreamSession()` / `db.endStreamSession()` + `broadcastSSE()`. Mirrors REST endpoints behavior."

---

## Commands Not Yet Audited (Potential Gaps)

| Command | Notes |
|---------|-------|
| **!score** | Renders user scores from memory (`_streamSession.UserSession.highScore`) — no DB, no save |
| **!stats** | Displays user stats via `ComfyJS.Say()` — no DB, no admin panel button |
| **!help** | Not implemented |
| **!promote** / **!ban** | Not found in codebase |
| **!shoutout** | Not found in codebase |

---

## Summary of Gaps & Recommendations

### 🔴 Critical Issues
1. **No Twitch chat handler** — All `!command` references exist in frontend JS but no backend IRC listener
2. **JSON file lingering** — `/savetofile` and `/loadfromfile` still write/read JSON alongside DB
3. **!score command** — In-memory data only; no persistence or admin visibility

### 🟡 Medium Issues
1. **File I/O cleanup** — Remove `.json` write from `/savetofile` endpoint (keep DB only)
2. **Overlay todos visibility** — State stored in-memory, not persisted
3. **Chat command uniformity** — Once implemented, should all use DB functions consistently

### ✅ Well-Implemented
1. **Notes, Todos, Reminders** — All have REST endpoints, DB tables, admin panels
2. **Session lifecycle** — Start/stop properly transacted in DB
3. **SSE broadcast** — Effects reliably push to overlay

---

## Recommended Next Steps

### Phase 1: Implement Twitch IRC Handler
Create `src/twitch-handler.js` with ComfyJS integration:
```javascript
// Pseudo-code
ComfyJS.OnChat = async (user, message, flags, extra, context) => {
  if (message.startsWith('!start')) { /* call db.startStreamSession() */ }
  if (message.startsWith('!stop')) { /* call db.endStreamSession() */ }
  if (message.startsWith('!note')) { /* call db.addNote() */ }
  if (message.startsWith('!todo')) { /* call db.addTodo() */ }
  if (message.startsWith('!reminder')) { /* call db.addReminder() */ }
  // ... etc
};
```

### Phase 2: Clean Up Legacy File I/O
- Remove `.json` write from `/savetofile`
- Remove `.json` fallback from `/loadfromfile`
- Keep only DB persistence

### Phase 3: Add Persistence for User Scores
- Create `user_scores` or `user_stats` table
- Store highScore, bestScore, dropCount per user per session
- Add admin visibility for score tracking

---

## Audit Completion Checklist

- [x] Identified all admin panel buttons and their corresponding endpoints
- [x] Traced database usage for each command
- [x] Flagged legacy JSON file I/O
- [x] Documented missing chat command handler
- [x] Listed gaps in score tracking and stats persistence
- [x] Recommended priorities (high/medium/low)
- [x] Proposed next steps for IRC integration

**Audit conducted by:** Elliot (Technical Lead)  
**Format:** Commands-by-category with database/file-I/O/admin-panel decision matrix
