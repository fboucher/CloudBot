<<<<<<< HEAD
const path = require("path");

let db;
const dbPath = path.join(__dirname, "io", "cloudbot.db");

async function initDb() {
  const { connect } = await import("@tursodatabase/database");
  db = await connect(dbPath);
  console.log(`Initializing database: ${dbPath}`);
  return createTables();
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS stream_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT,
      stream_title TEXT DEFAULT '',
      started_at TEXT,
      ended_at TEXT,
      notes TEXT DEFAULT '[]',
      stream_number INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      username TEXT,
      drop_count INTEGER DEFAULT 0,
      landed_count INTEGER DEFAULT 0,
      high_score REAL DEFAULT 0,
      best_high_score REAL DEFAULT 0,
      last_update TEXT,
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      description TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      name TEXT,
      message TEXT,
      interval INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      last_check TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS time_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      username TEXT,
      message TEXT,
      timestamp TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stream_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      event_type TEXT,
      username TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stream_counter (
      id INTEGER PRIMARY KEY,
      current_stream_number INTEGER DEFAULT 1,
      last_stream_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ceebee_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT,
      model TEXT,
      api_key TEXT,
      is_active INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ceebee_soul (
      id INTEGER PRIMARY KEY,
      system_prompt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ceebee_settings (
      id INTEGER PRIMARY KEY,
      auto_participate INTEGER DEFAULT 0,
      min_messages INTEGER DEFAULT 10,
      max_messages INTEGER DEFAULT 15,
      game_enabled INTEGER DEFAULT 1,
      dynamic_weather_enabled INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS participants (
      username TEXT PRIMARY KEY,
      is_regular INTEGER DEFAULT 0,
      inventory TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_session ON users(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_session ON reminders(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_time_logs_session ON time_logs(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stream_events_session ON stream_events(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id)`
  ];

  try {
    for (const sql of tables) {
      await db.exec(sql);
    }
    console.log("Database tables initialized");

    // Migration: Add stream_title column if it doesn't exist
    try {
      await db.exec("ALTER TABLE stream_sessions ADD COLUMN stream_title TEXT DEFAULT ''");
      console.log("Migration: Added stream_title column");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add interval column to reminders if it doesn't exist
    try {
      await db.exec("ALTER TABLE reminders ADD COLUMN interval INTEGER DEFAULT 0");
      console.log("Migration: Added interval column to reminders");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add project_url column to stream_sessions if it doesn't exist
    try {
      await db.exec("ALTER TABLE stream_sessions ADD COLUMN project_url TEXT");
      console.log("Migration: Added project_url column");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add stream_number column to stream_sessions if it doesn't exist
    try {
      await db.exec("ALTER TABLE stream_sessions ADD COLUMN stream_number INTEGER");
      console.log("Migration: Added stream_number column");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add game_enabled column to ceebee_settings if it doesn't exist
    try {
      await db.exec("ALTER TABLE ceebee_settings ADD COLUMN game_enabled INTEGER DEFAULT 1");
      console.log("Migration: Added game_enabled column to ceebee_settings");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add dynamic_weather_enabled column to ceebee_settings if it doesn't exist
    try {
      await db.exec("ALTER TABLE ceebee_settings ADD COLUMN dynamic_weather_enabled INTEGER DEFAULT 1");
      console.log("Migration: Added dynamic_weather_enabled column to ceebee_settings");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add inventory column to participants if it doesn't exist
    try {
      await db.exec("ALTER TABLE participants ADD COLUMN inventory TEXT DEFAULT '[]'");
      console.log("Migration: Added inventory column to participants");
    } catch (e) {
      // Column probably already exists, ignore
    }

    const counterRow = await db.prepare("SELECT * FROM stream_counter WHERE id = 1").get();
    if (!counterRow) {
      await db.prepare("INSERT INTO stream_counter (id, current_stream_number, last_stream_date) VALUES (?, ?, ?)").run(1, 0, "");
      console.log("Initialized stream_counter");
    }

    const soulRow = await db.prepare("SELECT * FROM ceebee_soul WHERE id = 1").get();
    if (!soulRow) {
      await db.prepare("INSERT INTO ceebee_soul (id, system_prompt) VALUES (?, ?)").run(1, "You are Ceebee, an AI assistant.");
      console.log("Initialized ceebee_soul");
    }

    const settingsRow = await db.prepare("SELECT * FROM ceebee_settings WHERE id = 1").get();
    if (!settingsRow) {
      await db.prepare("INSERT INTO ceebee_settings (id, auto_participate, min_messages, max_messages, game_enabled, dynamic_weather_enabled) VALUES (?, ?, ?, ?, 1, 1)").run(1, 0, 10, 15);
      console.log("Initialized ceebee_settings");
    }
  } catch (err) {
    console.error("Error creating tables:", err);
    throw err;
  }
}

async function getClient() {
  if (!db) {
    await initDb();
  }
  return db;
}

async function startStreamSession(projectName, streamTitle = "", projectUrl = "", streamNumber = null) {
  if (!db) await initDb();
  const startedAt = new Date().toISOString();

  const result = await db.prepare(
    "INSERT INTO stream_sessions (project_name, stream_title, project_url, started_at, stream_number, notes) VALUES (?, ?, ?, ?, ?, '[]')"
  ).run(projectName, streamTitle, projectUrl, startedAt, streamNumber);

  return result.lastInsertRowid;
}

async function endStreamSession(sessionId) {
  if (!db) await initDb();
  const endedAt = new Date().toISOString();
  await db.prepare("UPDATE stream_sessions SET ended_at = ? WHERE id = ?").run(endedAt, sessionId);
}

async function getActiveSession() {
  if (!db) await initDb();
  const result = await db.prepare(
    "SELECT * FROM stream_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
  ).get();
  return result || null;
}

async function getSessionById(sessionId) {
  if (!db) await initDb();
  const result = await db.prepare("SELECT * FROM stream_sessions WHERE id = ?").get(sessionId);
  return result || null;
}

async function getAllSessions() {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM stream_sessions ORDER BY id DESC").all();
}

async function saveSessionData(sessionId, data) {
  if (!db) await initDb();

  if (data.UserSession) {
    await db.prepare("DELETE FROM users WHERE session_id = ?").run(sessionId);
    for (const user of data.UserSession) {
      await db.prepare(
        `INSERT INTO users (session_id, username, drop_count, landed_count, high_score, best_high_score, last_update)
              VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(sessionId, user.user, user.dropCount || 0, user.landedCount || 0, user.highScore || 0, user.bestHighScore || 0, user.lastUpdate || null);
    }
  }

  if (data.Todos) {
    await db.prepare("DELETE FROM todos WHERE session_id = ?").run(sessionId);
    for (const todo of data.Todos) {
      await db.prepare("INSERT INTO todos (session_id, description, status) VALUES (?, ?, ?)").run(sessionId, todo.description, todo.status);
    }
  }

  if (data.Reminders) {
    await db.prepare("DELETE FROM reminders WHERE session_id = ?").run(sessionId);
    for (const reminder of data.Reminders) {
      await db.prepare(
        "INSERT INTO reminders (session_id, name, message, status, last_check, interval) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(sessionId, reminder.Name, reminder.Message, reminder.Status, reminder.LastCheck || null, reminder.interval || 0);
    }
  }

  if (data.TimeLogs) {
    await db.prepare("DELETE FROM time_logs WHERE session_id = ?").run(sessionId);
    for (const log of data.TimeLogs) {
      await db.prepare("INSERT INTO time_logs (session_id, username, message, timestamp) VALUES (?, ?, ?, ?)").run(sessionId, log.user, log.message, log.time);
    }
  }

  // Delete existing events to prevent duplication upon successive saves
  await db.prepare("DELETE FROM stream_events WHERE session_id = ?").run(sessionId);

  if (data.NewFollowers) {
    for (const user of data.NewFollowers) {
      await db.prepare("INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'follow', ?)").run(sessionId, user);
    }
  }

  if (data.Raiders) {
    for (const raider of data.Raiders) {
      await db.prepare(
        "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'raid', ?, ?)"
      ).run(sessionId, raider.user, JSON.stringify({ viewers: raider.viewers }));
    }
  }

  if (data.Subscribers) {
    for (const sub of data.Subscribers) {
      await db.prepare(
        "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'sub', ?, ?)"
      ).run(sessionId, sub.user, JSON.stringify({ months: sub.streamMonths }));
    }
  }

  if (data.Cheerers) {
    for (const cheerer of data.Cheerers) {
      await db.prepare(
        "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'cheer', ?, ?)"
      ).run(sessionId, cheerer.user, JSON.stringify({ bits: cheerer.bits }));
    }
  }

  if (data.Hosts) {
    for (const host of data.Hosts) {
      await db.prepare("INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'host', ?)").run(sessionId, host);
    }
  }

  console.log(`Session ${sessionId} data saved to database`);
}

async function loadSessionData(sessionId) {
  if (!db) await initDb();

  const data = {
    Project: "",
    Title: "",
    ProjectUrl: "",
    Id: sessionId,
    StreamNumber: null,
    DateTimeStart: "",
    DateTimeEnd: "",
    Notes: [],
    UserSession: [],
    NewFollowers: [],
    Raiders: [],
    Subscribers: [],
    Hosts: [],
    Cheerers: [],
    TimeLogs: [],
    Todos: [],
    Reminders: []
  };

  const session = await getSessionById(sessionId);
  if (session) {
    data.Project = session.project_name;
    data.Title = session.stream_title || "";
    data.ProjectUrl = session.project_url || "";
    data.StreamNumber = session.stream_number;
    data.DateTimeStart = session.started_at;
    data.DateTimeEnd = session.ended_at;
    
    // Load notes from notes table (not JSON blob)
    const notesRows = await db.prepare("SELECT * FROM notes WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    data.Notes = notesRows.map(n => n.text);
  }

  data.UserSession = (await db.prepare("SELECT * FROM users WHERE session_id = ?").all(sessionId)).map(u => ({
    user: u.username,
    dropCount: u.drop_count,
    landedCount: u.landed_count,
    highScore: u.high_score,
    bestHighScore: u.best_high_score,
    lastUpdate: u.last_update
  }));

  data.Todos = (await db.prepare("SELECT * FROM todos WHERE session_id = ?").all(sessionId)).map(t => ({
    id: t.id,
    description: t.description,
    status: t.status
  }));

  data.Reminders = (await db.prepare("SELECT * FROM reminders WHERE session_id = ?").all(sessionId)).map(r => ({
    id: r.id,
    Name: r.name,
    Message: r.message,
    Status: r.status,
    LastCheck: r.last_check,
    interval: r.interval || 0
  }));

  data.TimeLogs = (await db.prepare("SELECT * FROM time_logs WHERE session_id = ?").all(sessionId)).map(l => ({
    user: l.username,
    message: l.message,
    time: l.timestamp
  }));

  const events = await db.prepare("SELECT * FROM stream_events WHERE session_id = ?").all(sessionId);
  for (const event of events) {
    switch (event.event_type) {
      case 'follow':
        data.NewFollowers.push(event.username);
        break;
      case 'raid':
        const raidMeta = JSON.parse(event.metadata || '{}');
        data.Raiders.push({ user: event.username, viewers: raidMeta.viewers });
        break;
      case 'sub':
        const subMeta = JSON.parse(event.metadata || '{}');
        data.Subscribers.push({ user: event.username, streamMonths: subMeta.months });
        break;
      case 'cheer':
        const cheerMeta = JSON.parse(event.metadata || '{}');
        data.Cheerers.push({ user: event.username, bits: cheerMeta.bits });
        break;
      case 'host':
        data.Hosts.push(event.username);
        break;
    }
  }

  return data;
}

async function getStreamCounter() {
  if (!db) await initDb();
  return (await db.prepare("SELECT * FROM stream_counter WHERE id = 1").get()) || { current_stream_number: 0, last_stream_date: "" };
}

async function incrementStreamCounter() {
  if (!db) await initDb();
  const counter = await getStreamCounter();
  const today = new Date().toISOString().split('T')[0];

  const newNumber = (counter.current_stream_number || 0) + 1;
  await db.prepare("UPDATE stream_counter SET current_stream_number = ?, last_stream_date = ? WHERE id = 1").run(newNumber, today);

  return { currentStreamNumber: newNumber, lastStreamDate: today };
}

async function setStreamCounter(value) {
  if (!db) await initDb();
  const today = new Date().toISOString().split('T')[0];
  await db.prepare("UPDATE stream_counter SET current_stream_number = ?, last_stream_date = ? WHERE id = 1").run(value, today);
  return { currentStreamNumber: value, lastStreamDate: today };
}

async function updateNotes(sessionId, notes) {
  if (!db) await initDb();
  await db.prepare("UPDATE stream_sessions SET notes = ? WHERE id = ?").run(JSON.stringify(notes), sessionId);
}

async function addTodo(sessionId, description, status = 'new') {
  if (!db) await initDb();
  const result = await db.prepare("INSERT INTO todos (session_id, description, status) VALUES (?, ?, ?)").run(sessionId, description, status);
  return db.prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid);
}

async function updateTodoStatus(todoId, status) {
  if (!db) await initDb();
  await db.prepare("UPDATE todos SET status = ? WHERE id = ?").run(status, todoId);
}

async function deleteTodo(todoId) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM todos WHERE id = ?").run(todoId);
}

async function addReminder(sessionId, name, message, status = 'active', interval = 0) {
  if (!db) await initDb();
  const result = await db.prepare(
    "INSERT INTO reminders (session_id, name, message, status, interval) VALUES (?, ?, ?, ?, ?)"
  ).run(sessionId, name, message, status, interval);
  return db.prepare("SELECT * FROM reminders WHERE id = ?").get(result.lastInsertRowid);
}

async function updateReminderStatus(reminderId, status) {
  if (!db) await initDb();
  await db.prepare("UPDATE reminders SET status = ? WHERE id = ?").run(status, reminderId);
}

async function deleteReminder(reminderId) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM reminders WHERE id = ?").run(reminderId);
}

async function addNote(sessionId, text) {
  if (!db) await initDb();
  const result = await db.prepare("INSERT INTO notes (session_id, text) VALUES (?, ?)").run(sessionId, text);
  return db.prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid);
}

async function getNotes(sessionId) {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM notes WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

async function deleteNote(noteId) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
}

async function getTodos(sessionId) {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM todos WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

async function getReminders(sessionId) {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM reminders WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

async function upsertUser(sessionId, username, stats) {
  if (!db) await initDb();
  const existing = await db.prepare(
    'SELECT id FROM users WHERE session_id = ? AND username = ?'
  ).get(sessionId, username);

  if (existing) {
    await db.prepare(
      `UPDATE users SET drop_count = ?, landed_count = ?, high_score = ?,
       best_high_score = ?, last_update = ? WHERE session_id = ? AND username = ?`
    ).run(
      stats.dropCount ?? 0, stats.landedCount ?? 0,
      stats.highScore ?? 0, stats.bestHighScore ?? 0,
      new Date().toISOString(), sessionId, username
    );
  } else {
    await db.prepare(
      `INSERT INTO users (session_id, username, drop_count, landed_count, high_score, best_high_score, last_update)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, username,
      stats.dropCount ?? 0, stats.landedCount ?? 0,
      stats.highScore ?? 0, stats.bestHighScore ?? 0,
      new Date().toISOString()
    );
  }
}

async function getSessionUsers(sessionId) {
  if (!db) await initDb();
  return db.prepare(
    'SELECT * FROM users WHERE session_id = ? ORDER BY best_high_score DESC'
  ).all(sessionId);
}

// Ceebee specific functions
async function getCeebeeConnections() {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM ceebee_connections").all();
}

async function addCeebeeConnection(name, url, model, api_key, is_active) {
  if (!db) await initDb();
  if (is_active) {
    await db.prepare("UPDATE ceebee_connections SET is_active = 0").run();
  }
  const result = await db.prepare(
    "INSERT INTO ceebee_connections (name, url, model, api_key, is_active) VALUES (?, ?, ?, ?, ?)"
  ).run(name, url, model, api_key, is_active ? 1 : 0);
  return db.prepare("SELECT * FROM ceebee_connections WHERE id = ?").get(result.lastInsertRowid);
}

async function updateCeebeeConnection(id, name, url, model, api_key, is_active) {
  if (!db) await initDb();
  if (is_active) {
    await db.prepare("UPDATE ceebee_connections SET is_active = 0").run();
  }
  await db.prepare(
    "UPDATE ceebee_connections SET name = ?, url = ?, model = ?, api_key = ?, is_active = ? WHERE id = ?"
  ).run(name, url, model, api_key, is_active ? 1 : 0, id);
  return db.prepare("SELECT * FROM ceebee_connections WHERE id = ?").get(id);
}

async function deleteCeebeeConnection(id) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM ceebee_connections WHERE id = ?").run(id);
}

async function setActiveCeebeeConnection(id) {
  if (!db) await initDb();
  await db.prepare("UPDATE ceebee_connections SET is_active = 0").run();
  await db.prepare("UPDATE ceebee_connections SET is_active = 1 WHERE id = ?").run(id);
}

async function getActiveCeebeeConnection() {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM ceebee_connections WHERE is_active = 1").get();
}

async function getCeebeeSoul() {
  if (!db) await initDb();
  const row = await db.prepare("SELECT system_prompt FROM ceebee_soul WHERE id = 1").get();
  return row ? row.system_prompt : "";
}

async function setCeebeeSoul(system_prompt) {
  if (!db) await initDb();
  await db.prepare("UPDATE ceebee_soul SET system_prompt = ? WHERE id = 1").run(system_prompt);
}

async function getCeebeeSettings() {
  if (!db) await initDb();
  const row = await db.prepare("SELECT auto_participate, min_messages, max_messages, game_enabled, dynamic_weather_enabled FROM ceebee_settings WHERE id = 1").get();
  return row || { auto_participate: 0, min_messages: 10, max_messages: 15, game_enabled: 1, dynamic_weather_enabled: 1 };
}

async function updateCeebeeSettings(auto_participate, min_messages, max_messages, game_enabled = 1, dynamic_weather_enabled = 1) {
  if (!db) await initDb();
  await db.prepare(
    "UPDATE ceebee_settings SET auto_participate = ?, min_messages = ?, max_messages = ?, game_enabled = ?, dynamic_weather_enabled = ? WHERE id = 1"
  ).run(auto_participate ? 1 : 0, min_messages, max_messages, game_enabled ? 1 : 0, dynamic_weather_enabled ? 1 : 0);
  return getCeebeeSettings();
}

async function registerParticipant(username) {
  if (!db) await initDb();
  await db.prepare(
    "INSERT OR IGNORE INTO participants (username, is_regular) VALUES (?, 0)"
  ).run(username);
}

async function setParticipantRegularStatus(username, isRegular) {
  if (!db) await initDb();
  await registerParticipant(username);
  await db.prepare(
    "UPDATE participants SET is_regular = ? WHERE username = ?"
  ).run(isRegular ? 1 : 0, username);
}

async function isParticipantRegular(username) {
  if (!db) await initDb();
  const row = await db.prepare(
    "SELECT is_regular FROM participants WHERE username = ?"
  ).get(username);
  return row ? !!row.is_regular : false;
}

async function getAllParticipantsWithStats() {
  if (!db) await initDb();
  return db.prepare(`
    SELECT 
      p.username, 
      p.is_regular,
      COALESCE(SUM(u.drop_count), 0) AS total_drops,
      COALESCE(SUM(u.landed_count), 0) AS total_landed,
      COALESCE(MAX(u.high_score), 0) AS max_high_score,
      COALESCE(MAX(u.best_high_score), 0) AS max_best_high_score
    FROM participants p
    LEFT JOIN users u ON p.username = u.username
    GROUP BY p.username
    ORDER BY p.username ASC
  `).all();
}

async function hasBeenGreetedInSession(sessionId, username) {
  if (!db) await initDb();
  const row = await db.prepare(
    "SELECT id FROM stream_events WHERE session_id = ? AND event_type = 'greeting' AND username = ?"
  ).get(sessionId, username);
  return !!row;
}

async function logGreetingEvent(sessionId, username) {
  if (!db) await initDb();
  await db.prepare(
    "INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'greeting', ?)"
  ).run(sessionId, username);
}

async function getInventory(username) {
  if (!db) await initDb();
  const row = await db.prepare("SELECT inventory FROM participants WHERE username = ?").get(username.toLowerCase());
  if (row && row.inventory) {
    try {
      return JSON.parse(row.inventory);
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function saveInventory(username, inventory) {
  if (!db) await initDb();
  await registerParticipant(username);
  await db.prepare("UPDATE participants SET inventory = ? WHERE username = ?").run(JSON.stringify(inventory), username.toLowerCase());
}

async function addInventoryItem(username, item) {
  let inv = await getInventory(username);
  inv.push(item);
  if (inv.length > 5) {
    inv.shift();
  }
  await saveInventory(username, inv);
  return inv;
}

async function removeInventoryItem(username, item) {
  let inv = await getInventory(username);
  const index = inv.indexOf(item);
  if (index > -1) {
    inv.splice(index, 1);
    await saveInventory(username, inv);
    return true;
  }
  return false;
}

module.exports = {
  initDb,
  getClient,
  startStreamSession,
  endStreamSession,
  getActiveSession,
  getSessionById,
  getAllSessions,
  saveSessionData,
  loadSessionData,
  getStreamCounter,
  incrementStreamCounter,
  setStreamCounter,
  updateNotes,
  addNote,
  getNotes,
  deleteNote,
  addTodo,
  getTodos,
  updateTodoStatus,
  deleteTodo,
  addReminder,
  getReminders,
  updateReminderStatus,
  deleteReminder,
  upsertUser,
  getSessionUsers,
  getCeebeeConnections,
  addCeebeeConnection,
  updateCeebeeConnection,
  deleteCeebeeConnection,
  setActiveCeebeeConnection,
  getActiveCeebeeConnection,
  getCeebeeSoul,
  setCeebeeSoul,
  getCeebeeSettings,
  updateCeebeeSettings,
  registerParticipant,
  setParticipantRegularStatus,
  isParticipantRegular,
  getAllParticipantsWithStats,
  hasBeenGreetedInSession,
  logGreetingEvent,
  getInventory,
  addInventoryItem,
  removeInventoryItem
};
=======
const path = require("path");

let db;
const dbPath = path.join(__dirname, "io", "cloudbot.db");

async function initDb() {
  const { connect } = await import("@tursodatabase/database");
  db = await connect(dbPath);
  console.log(`Initializing database: ${dbPath}`);
  return createTables();
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS stream_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT,
      stream_title TEXT DEFAULT '',
      started_at TEXT,
      ended_at TEXT,
      notes TEXT DEFAULT '[]',
      stream_number INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      username TEXT,
      drop_count INTEGER DEFAULT 0,
      landed_count INTEGER DEFAULT 0,
      high_score REAL DEFAULT 0,
      best_high_score REAL DEFAULT 0,
      last_update TEXT,
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      description TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      name TEXT,
      message TEXT,
      interval INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      last_check TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS time_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      username TEXT,
      message TEXT,
      timestamp TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stream_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      event_type TEXT,
      username TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES stream_sessions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS stream_counter (
      id INTEGER PRIMARY KEY,
      current_stream_number INTEGER DEFAULT 1,
      last_stream_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ceebee_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT,
      model TEXT,
      api_key TEXT,
      is_active INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ceebee_soul (
      id INTEGER PRIMARY KEY,
      system_prompt TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS ceebee_settings (
      id INTEGER PRIMARY KEY,
      auto_participate INTEGER DEFAULT 0,
      min_messages INTEGER DEFAULT 10,
      max_messages INTEGER DEFAULT 15,
      game_enabled INTEGER DEFAULT 1,
      dynamic_weather_enabled INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS participants (
      username TEXT PRIMARY KEY,
      is_regular INTEGER DEFAULT 0,
      inventory TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_session ON users(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_session ON reminders(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_time_logs_session ON time_logs(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stream_events_session ON stream_events(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id)`
  ];

  try {
    for (const sql of tables) {
      await db.exec(sql);
    }
    console.log("Database tables initialized");

    // Migration: Add stream_title column if it doesn't exist
    try {
      await db.exec("ALTER TABLE stream_sessions ADD COLUMN stream_title TEXT DEFAULT ''");
      console.log("Migration: Added stream_title column");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add interval column to reminders if it doesn't exist
    try {
      await db.exec("ALTER TABLE reminders ADD COLUMN interval INTEGER DEFAULT 0");
      console.log("Migration: Added interval column to reminders");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add project_url column to stream_sessions if it doesn't exist
    try {
      await db.exec("ALTER TABLE stream_sessions ADD COLUMN project_url TEXT");
      console.log("Migration: Added project_url column");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add stream_number column to stream_sessions if it doesn't exist
    try {
      await db.exec("ALTER TABLE stream_sessions ADD COLUMN stream_number INTEGER");
      console.log("Migration: Added stream_number column");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add game_enabled column to ceebee_settings if it doesn't exist
    try {
      await db.exec("ALTER TABLE ceebee_settings ADD COLUMN game_enabled INTEGER DEFAULT 1");
      console.log("Migration: Added game_enabled column to ceebee_settings");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add dynamic_weather_enabled column to ceebee_settings if it doesn't exist
    try {
      await db.exec("ALTER TABLE ceebee_settings ADD COLUMN dynamic_weather_enabled INTEGER DEFAULT 1");
      console.log("Migration: Added dynamic_weather_enabled column to ceebee_settings");
    } catch (e) {
      // Column probably already exists, ignore
    }

    // Migration: Add inventory column to participants if it doesn't exist
    try {
      await db.exec("ALTER TABLE participants ADD COLUMN inventory TEXT DEFAULT '[]'");
      console.log("Migration: Added inventory column to participants");
    } catch (e) {
      // Column probably already exists, ignore
    }

    const counterRow = await db.prepare("SELECT * FROM stream_counter WHERE id = 1").get();
    if (!counterRow) {
      await db.prepare("INSERT INTO stream_counter (id, current_stream_number, last_stream_date) VALUES (?, ?, ?)").run(1, 0, "");
      console.log("Initialized stream_counter");
    }

    const soulRow = await db.prepare("SELECT * FROM ceebee_soul WHERE id = 1").get();
    if (!soulRow) {
      await db.prepare("INSERT INTO ceebee_soul (id, system_prompt) VALUES (?, ?)").run(1, "You are Ceebee, an AI assistant.");
      console.log("Initialized ceebee_soul");
    }

    const settingsRow = await db.prepare("SELECT * FROM ceebee_settings WHERE id = 1").get();
    if (!settingsRow) {
      await db.prepare("INSERT INTO ceebee_settings (id, auto_participate, min_messages, max_messages, game_enabled, dynamic_weather_enabled) VALUES (?, ?, ?, ?, 1, 1)").run(1, 0, 10, 15);
      console.log("Initialized ceebee_settings");
    }
  } catch (err) {
    console.error("Error creating tables:", err);
    throw err;
  }
}

async function getClient() {
  if (!db) {
    await initDb();
  }
  return db;
}

async function startStreamSession(projectName, streamTitle = "", projectUrl = "", streamNumber = null) {
  if (!db) await initDb();
  const startedAt = new Date().toISOString();

  const result = await db.prepare(
    "INSERT INTO stream_sessions (project_name, stream_title, project_url, started_at, stream_number, notes) VALUES (?, ?, ?, ?, ?, '[]')"
  ).run(projectName, streamTitle, projectUrl, startedAt, streamNumber);

  return result.lastInsertRowid;
}

async function endStreamSession(sessionId) {
  if (!db) await initDb();
  const endedAt = new Date().toISOString();
  await db.prepare("UPDATE stream_sessions SET ended_at = ? WHERE id = ?").run(endedAt, sessionId);
}

async function getActiveSession() {
  if (!db) await initDb();
  const result = await db.prepare(
    "SELECT * FROM stream_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
  ).get();
  return result || null;
}

async function getSessionById(sessionId) {
  if (!db) await initDb();
  const result = await db.prepare("SELECT * FROM stream_sessions WHERE id = ?").get(sessionId);
  return result || null;
}

async function getAllSessions() {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM stream_sessions ORDER BY id DESC").all();
}

async function saveSessionData(sessionId, data) {
  if (!db) await initDb();

  if (data.UserSession) {
    await db.prepare("DELETE FROM users WHERE session_id = ?").run(sessionId);
    for (const user of data.UserSession) {
      await db.prepare(
        `INSERT INTO users (session_id, username, drop_count, landed_count, high_score, best_high_score, last_update)
              VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(sessionId, user.user, user.dropCount || 0, user.landedCount || 0, user.highScore || 0, user.bestHighScore || 0, user.lastUpdate || null);
    }
  }

  if (data.Todos) {
    await db.prepare("DELETE FROM todos WHERE session_id = ?").run(sessionId);
    for (const todo of data.Todos) {
      await db.prepare("INSERT INTO todos (session_id, description, status) VALUES (?, ?, ?)").run(sessionId, todo.description, todo.status);
    }
  }

  if (data.Reminders) {
    await db.prepare("DELETE FROM reminders WHERE session_id = ?").run(sessionId);
    for (const reminder of data.Reminders) {
      await db.prepare(
        "INSERT INTO reminders (session_id, name, message, status, last_check, interval) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(sessionId, reminder.Name, reminder.Message, reminder.Status, reminder.LastCheck || null, reminder.interval || 0);
    }
  }

  if (data.TimeLogs) {
    await db.prepare("DELETE FROM time_logs WHERE session_id = ?").run(sessionId);
    for (const log of data.TimeLogs) {
      await db.prepare("INSERT INTO time_logs (session_id, username, message, timestamp) VALUES (?, ?, ?, ?)").run(sessionId, log.user, log.message, log.time);
    }
  }

  if (data.NewFollowers) {
    for (const user of data.NewFollowers) {
      await db.prepare("INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'follow', ?)").run(sessionId, user);
    }
  }

  if (data.Raiders) {
    for (const raider of data.Raiders) {
      await db.prepare(
        "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'raid', ?, ?)"
      ).run(sessionId, raider.user, JSON.stringify({ viewers: raider.viewers }));
    }
  }

  if (data.Subscribers) {
    for (const sub of data.Subscribers) {
      await db.prepare(
        "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'sub', ?, ?)"
      ).run(sessionId, sub.user, JSON.stringify({ months: sub.streamMonths }));
    }
  }

  if (data.Cheerers) {
    for (const cheerer of data.Cheerers) {
      await db.prepare(
        "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'cheer', ?, ?)"
      ).run(sessionId, cheerer.user, JSON.stringify({ bits: cheerer.bits }));
    }
  }

  if (data.Hosts) {
    for (const host of data.Hosts) {
      await db.prepare("INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'host', ?)").run(sessionId, host);
    }
  }

  console.log(`Session ${sessionId} data saved to database`);
}

async function loadSessionData(sessionId) {
  if (!db) await initDb();

  const data = {
    Project: "",
    Title: "",
    ProjectUrl: "",
    Id: sessionId,
    StreamNumber: null,
    DateTimeStart: "",
    DateTimeEnd: "",
    Notes: [],
    UserSession: [],
    NewFollowers: [],
    Raiders: [],
    Subscribers: [],
    Hosts: [],
    Cheerers: [],
    TimeLogs: [],
    Todos: [],
    Reminders: []
  };

  const session = await getSessionById(sessionId);
  if (session) {
    data.Project = session.project_name;
    data.Title = session.stream_title || "";
    data.ProjectUrl = session.project_url || "";
    data.StreamNumber = session.stream_number;
    data.DateTimeStart = session.started_at;
    data.DateTimeEnd = session.ended_at;
    
    // Load notes from notes table (not JSON blob)
    const notesRows = await db.prepare("SELECT * FROM notes WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    data.Notes = notesRows.map(n => n.text);
  }

  data.UserSession = (await db.prepare("SELECT * FROM users WHERE session_id = ?").all(sessionId)).map(u => ({
    user: u.username,
    dropCount: u.drop_count,
    landedCount: u.landed_count,
    highScore: u.high_score,
    bestHighScore: u.best_high_score,
    lastUpdate: u.last_update
  }));

  data.Todos = (await db.prepare("SELECT * FROM todos WHERE session_id = ?").all(sessionId)).map(t => ({
    id: t.id,
    description: t.description,
    status: t.status
  }));

  data.Reminders = (await db.prepare("SELECT * FROM reminders WHERE session_id = ?").all(sessionId)).map(r => ({
    id: r.id,
    Name: r.name,
    Message: r.message,
    Status: r.status,
    LastCheck: r.last_check,
    interval: r.interval || 0
  }));

  data.TimeLogs = (await db.prepare("SELECT * FROM time_logs WHERE session_id = ?").all(sessionId)).map(l => ({
    user: l.username,
    message: l.message,
    time: l.timestamp
  }));

  const events = await db.prepare("SELECT * FROM stream_events WHERE session_id = ?").all(sessionId);
  for (const event of events) {
    switch (event.event_type) {
      case 'follow':
        data.NewFollowers.push(event.username);
        break;
      case 'raid':
        const raidMeta = JSON.parse(event.metadata || '{}');
        data.Raiders.push({ user: event.username, viewers: raidMeta.viewers });
        break;
      case 'sub':
        const subMeta = JSON.parse(event.metadata || '{}');
        data.Subscribers.push({ user: event.username, streamMonths: subMeta.months });
        break;
      case 'cheer':
        const cheerMeta = JSON.parse(event.metadata || '{}');
        data.Cheerers.push({ user: event.username, bits: cheerMeta.bits });
        break;
      case 'host':
        data.Hosts.push(event.username);
        break;
    }
  }

  return data;
}

async function getStreamCounter() {
  if (!db) await initDb();
  return (await db.prepare("SELECT * FROM stream_counter WHERE id = 1").get()) || { current_stream_number: 0, last_stream_date: "" };
}

async function incrementStreamCounter() {
  if (!db) await initDb();
  const counter = await getStreamCounter();
  const today = new Date().toISOString().split('T')[0];

  const newNumber = (counter.current_stream_number || 0) + 1;
  await db.prepare("UPDATE stream_counter SET current_stream_number = ?, last_stream_date = ? WHERE id = 1").run(newNumber, today);

  return { currentStreamNumber: newNumber, lastStreamDate: today };
}

async function setStreamCounter(value) {
  if (!db) await initDb();
  const today = new Date().toISOString().split('T')[0];
  await db.prepare("UPDATE stream_counter SET current_stream_number = ?, last_stream_date = ? WHERE id = 1").run(value, today);
  return { currentStreamNumber: value, lastStreamDate: today };
}

async function updateNotes(sessionId, notes) {
  if (!db) await initDb();
  await db.prepare("UPDATE stream_sessions SET notes = ? WHERE id = ?").run(JSON.stringify(notes), sessionId);
}

async function addTodo(sessionId, description, status = 'new') {
  if (!db) await initDb();
  const result = await db.prepare("INSERT INTO todos (session_id, description, status) VALUES (?, ?, ?)").run(sessionId, description, status);
  return db.prepare("SELECT * FROM todos WHERE id = ?").get(result.lastInsertRowid);
}

async function updateTodoStatus(todoId, status) {
  if (!db) await initDb();
  await db.prepare("UPDATE todos SET status = ? WHERE id = ?").run(status, todoId);
}

async function deleteTodo(todoId) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM todos WHERE id = ?").run(todoId);
}

async function addReminder(sessionId, name, message, status = 'active', interval = 0) {
  if (!db) await initDb();
  const result = await db.prepare(
    "INSERT INTO reminders (session_id, name, message, status, interval) VALUES (?, ?, ?, ?, ?)"
  ).run(sessionId, name, message, status, interval);
  return db.prepare("SELECT * FROM reminders WHERE id = ?").get(result.lastInsertRowid);
}

async function updateReminderStatus(reminderId, status) {
  if (!db) await initDb();
  await db.prepare("UPDATE reminders SET status = ? WHERE id = ?").run(status, reminderId);
}

async function deleteReminder(reminderId) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM reminders WHERE id = ?").run(reminderId);
}

async function addNote(sessionId, text) {
  if (!db) await initDb();
  const result = await db.prepare("INSERT INTO notes (session_id, text) VALUES (?, ?)").run(sessionId, text);
  return db.prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid);
}

async function getNotes(sessionId) {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM notes WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

async function deleteNote(noteId) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
}

async function getTodos(sessionId) {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM todos WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

async function getReminders(sessionId) {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM reminders WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

async function upsertUser(sessionId, username, stats) {
  if (!db) await initDb();
  const existing = await db.prepare(
    'SELECT id FROM users WHERE session_id = ? AND username = ?'
  ).get(sessionId, username);

  if (existing) {
    await db.prepare(
      `UPDATE users SET drop_count = ?, landed_count = ?, high_score = ?,
       best_high_score = ?, last_update = ? WHERE session_id = ? AND username = ?`
    ).run(
      stats.dropCount ?? 0, stats.landedCount ?? 0,
      stats.highScore ?? 0, stats.bestHighScore ?? 0,
      new Date().toISOString(), sessionId, username
    );
  } else {
    await db.prepare(
      `INSERT INTO users (session_id, username, drop_count, landed_count, high_score, best_high_score, last_update)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId, username,
      stats.dropCount ?? 0, stats.landedCount ?? 0,
      stats.highScore ?? 0, stats.bestHighScore ?? 0,
      new Date().toISOString()
    );
  }
}

async function getSessionUsers(sessionId) {
  if (!db) await initDb();
  return db.prepare(
    'SELECT * FROM users WHERE session_id = ? ORDER BY best_high_score DESC'
  ).all(sessionId);
}

// Ceebee specific functions
async function getCeebeeConnections() {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM ceebee_connections").all();
}

async function addCeebeeConnection(name, url, model, api_key, is_active) {
  if (!db) await initDb();
  if (is_active) {
    await db.prepare("UPDATE ceebee_connections SET is_active = 0").run();
  }
  const result = await db.prepare(
    "INSERT INTO ceebee_connections (name, url, model, api_key, is_active) VALUES (?, ?, ?, ?, ?)"
  ).run(name, url, model, api_key, is_active ? 1 : 0);
  return db.prepare("SELECT * FROM ceebee_connections WHERE id = ?").get(result.lastInsertRowid);
}

async function updateCeebeeConnection(id, name, url, model, api_key, is_active) {
  if (!db) await initDb();
  if (is_active) {
    await db.prepare("UPDATE ceebee_connections SET is_active = 0").run();
  }
  await db.prepare(
    "UPDATE ceebee_connections SET name = ?, url = ?, model = ?, api_key = ?, is_active = ? WHERE id = ?"
  ).run(name, url, model, api_key, is_active ? 1 : 0, id);
  return db.prepare("SELECT * FROM ceebee_connections WHERE id = ?").get(id);
}

async function deleteCeebeeConnection(id) {
  if (!db) await initDb();
  await db.prepare("DELETE FROM ceebee_connections WHERE id = ?").run(id);
}

async function setActiveCeebeeConnection(id) {
  if (!db) await initDb();
  await db.prepare("UPDATE ceebee_connections SET is_active = 0").run();
  await db.prepare("UPDATE ceebee_connections SET is_active = 1 WHERE id = ?").run(id);
}

async function getActiveCeebeeConnection() {
  if (!db) await initDb();
  return db.prepare("SELECT * FROM ceebee_connections WHERE is_active = 1").get();
}

async function getCeebeeSoul() {
  if (!db) await initDb();
  const row = await db.prepare("SELECT system_prompt FROM ceebee_soul WHERE id = 1").get();
  return row ? row.system_prompt : "";
}

async function setCeebeeSoul(system_prompt) {
  if (!db) await initDb();
  await db.prepare("UPDATE ceebee_soul SET system_prompt = ? WHERE id = 1").run(system_prompt);
}

async function getCeebeeSettings() {
  if (!db) await initDb();
  const row = await db.prepare("SELECT auto_participate, min_messages, max_messages, game_enabled, dynamic_weather_enabled FROM ceebee_settings WHERE id = 1").get();
  return row || { auto_participate: 0, min_messages: 10, max_messages: 15, game_enabled: 1, dynamic_weather_enabled: 1 };
}

async function updateCeebeeSettings(auto_participate, min_messages, max_messages, game_enabled = 1, dynamic_weather_enabled = 1) {
  if (!db) await initDb();
  await db.prepare(
    "UPDATE ceebee_settings SET auto_participate = ?, min_messages = ?, max_messages = ?, game_enabled = ?, dynamic_weather_enabled = ? WHERE id = 1"
  ).run(auto_participate ? 1 : 0, min_messages, max_messages, game_enabled ? 1 : 0, dynamic_weather_enabled ? 1 : 0);
  return getCeebeeSettings();
}

async function registerParticipant(username) {
  if (!db) await initDb();
  await db.prepare(
    "INSERT OR IGNORE INTO participants (username, is_regular) VALUES (?, 0)"
  ).run(username);
}

async function setParticipantRegularStatus(username, isRegular) {
  if (!db) await initDb();
  await registerParticipant(username);
  await db.prepare(
    "UPDATE participants SET is_regular = ? WHERE username = ?"
  ).run(isRegular ? 1 : 0, username);
}

async function isParticipantRegular(username) {
  if (!db) await initDb();
  const row = await db.prepare(
    "SELECT is_regular FROM participants WHERE username = ?"
  ).get(username);
  return row ? !!row.is_regular : false;
}

async function getAllParticipantsWithStats() {
  if (!db) await initDb();
  return db.prepare(`
    SELECT 
      p.username, 
      p.is_regular,
      COALESCE(SUM(u.drop_count), 0) AS total_drops,
      COALESCE(SUM(u.landed_count), 0) AS total_landed,
      COALESCE(MAX(u.high_score), 0) AS max_high_score,
      COALESCE(MAX(u.best_high_score), 0) AS max_best_high_score
    FROM participants p
    LEFT JOIN users u ON p.username = u.username
    GROUP BY p.username
    ORDER BY p.username ASC
  `).all();
}

async function hasBeenGreetedInSession(sessionId, username) {
  if (!db) await initDb();
  const row = await db.prepare(
    "SELECT id FROM stream_events WHERE session_id = ? AND event_type = 'greeting' AND username = ?"
  ).get(sessionId, username);
  return !!row;
}

async function logGreetingEvent(sessionId, username) {
  if (!db) await initDb();
  await db.prepare(
    "INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'greeting', ?)"
  ).run(sessionId, username);
}

async function getInventory(username) {
  if (!db) await initDb();
  const row = await db.prepare("SELECT inventory FROM participants WHERE username = ?").get(username.toLowerCase());
  if (row && row.inventory) {
    try {
      return JSON.parse(row.inventory);
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function saveInventory(username, inventory) {
  if (!db) await initDb();
  await registerParticipant(username);
  await db.prepare("UPDATE participants SET inventory = ? WHERE username = ?").run(JSON.stringify(inventory), username.toLowerCase());
}

async function addInventoryItem(username, item) {
  let inv = await getInventory(username);
  inv.push(item);
  if (inv.length > 5) {
    inv.shift();
  }
  await saveInventory(username, inv);
  return inv;
}

async function removeInventoryItem(username, item) {
  let inv = await getInventory(username);
  const index = inv.indexOf(item);
  if (index > -1) {
    inv.splice(index, 1);
    await saveInventory(username, inv);
    return true;
  }
  return false;
}

module.exports = {
  initDb,
  getClient,
  startStreamSession,
  endStreamSession,
  getActiveSession,
  getSessionById,
  getAllSessions,
  saveSessionData,
  loadSessionData,
  getStreamCounter,
  incrementStreamCounter,
  setStreamCounter,
  updateNotes,
  addNote,
  getNotes,
  deleteNote,
  addTodo,
  getTodos,
  updateTodoStatus,
  deleteTodo,
  addReminder,
  getReminders,
  updateReminderStatus,
  deleteReminder,
  upsertUser,
  getSessionUsers,
  getCeebeeConnections,
  addCeebeeConnection,
  updateCeebeeConnection,
  deleteCeebeeConnection,
  setActiveCeebeeConnection,
  getActiveCeebeeConnection,
  getCeebeeSoul,
  setCeebeeSoul,
  getCeebeeSettings,
  updateCeebeeSettings,
  registerParticipant,
  setParticipantRegularStatus,
  isParticipantRegular,
  getAllParticipantsWithStats,
  hasBeenGreetedInSession,
  logGreetingEvent,
  getInventory,
  addInventoryItem,
  removeInventoryItem
};
>>>>>>> origin/main
