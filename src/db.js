const { createClient } = require("@libsql/client");
const path = require("path");
const fs = require("fs");

let client;
let dbPath;

function getDbUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  dbPath = path.join(__dirname, "io", "cloudbot.db");
  return `file:${dbPath}`;
}

function initDb() {
  const dbUrl = getDbUrl();
  console.log(`Initializing database: ${dbUrl}`);

  client = createClient({
    url: dbUrl,
  });

  return createTables();
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS stream_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT,
      started_at TEXT,
      ended_at TEXT,
      notes TEXT DEFAULT '[]',
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
      status TEXT DEFAULT 'active',
      last_check TEXT,
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
    `CREATE INDEX IF NOT EXISTS idx_users_session ON users(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_session ON reminders(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_time_logs_session ON time_logs(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stream_events_session ON stream_events(session_id)`
  ];

  try {
    for (const sql of tables) {
      await client.execute(sql);
    }
    console.log("Database tables initialized");

    const counterResult = await client.execute("SELECT * FROM stream_counter WHERE id = 1");
    if (counterResult.rows.length === 0) {
      await client.execute("INSERT INTO stream_counter (id, current_stream_number, last_stream_date) VALUES (1, 0, '')");
      console.log("Initialized stream_counter");
    }
  } catch (err) {
    console.error("Error creating tables:", err);
    throw err;
  }
}

async function getClient() {
  if (!client) {
    await initDb();
  }
  return client;
}

async function startStreamSession(projectName) {
  const c = await getClient();
  const startedAt = new Date().toISOString();

  const result = await c.execute({
    sql: "INSERT INTO stream_sessions (project_name, started_at, notes) VALUES (?, ?, '[]')",
    args: [projectName, startedAt]
  });

  return result.lastInsertId;
}

async function endStreamSession(sessionId) {
  const c = await getClient();
  const endedAt = new Date().toISOString();

  await c.execute({
    sql: "UPDATE stream_sessions SET ended_at = ? WHERE id = ?",
    args: [endedAt, sessionId]
  });
}

async function getActiveSession() {
  const c = await getClient();
  const result = await c.execute("SELECT * FROM stream_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1");
  return result.rows[0] || null;
}

async function getSessionById(sessionId) {
  const c = await getClient();
  const result = await c.execute("SELECT * FROM stream_sessions WHERE id = ?", [sessionId]);
  return result.rows[0] || null;
}

async function getAllSessions() {
  const c = await getClient();
  const result = await c.execute("SELECT * FROM stream_sessions ORDER BY id DESC");
  return result.rows;
}

async function saveSessionData(sessionId, data) {
  const c = await getClient();

  if (data.UserSession) {
    await c.execute("DELETE FROM users WHERE session_id = ?", [sessionId]);
    for (const user of data.UserSession) {
      await c.execute({
        sql: `INSERT INTO users (session_id, username, drop_count, landed_count, high_score, best_high_score, last_update)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [sessionId, user.user, user.dropCount || 0, user.landedCount || 0, user.highScore || 0, user.bestHighScore || 0, user.lastUpdate || null]
      });
    }
  }

  if (data.Todos) {
    await c.execute("DELETE FROM todos WHERE session_id = ?", [sessionId]);
    for (const todo of data.Todos) {
      await c.execute({
        sql: "INSERT INTO todos (session_id, description, status) VALUES (?, ?, ?)",
        args: [sessionId, todo.description, todo.status]
      });
    }
  }

  if (data.Reminders) {
    await c.execute("DELETE FROM reminders WHERE session_id = ?", [sessionId]);
    for (const reminder of data.Reminders) {
      await c.execute({
        sql: "INSERT INTO reminders (session_id, name, message, status, last_check) VALUES (?, ?, ?, ?, ?)",
        args: [sessionId, reminder.Name, reminder.Message, reminder.Status, reminder.LastCheck || null]
      });
    }
  }

  if (data.TimeLogs) {
    await c.execute("DELETE FROM time_logs WHERE session_id = ?", [sessionId]);
    for (const log of data.TimeLogs) {
      await c.execute({
        sql: "INSERT INTO time_logs (session_id, username, message, timestamp) VALUES (?, ?, ?, ?)",
        args: [sessionId, log.user, log.message, log.time]
      });
    }
  }

  if (data.NewFollowers) {
    for (const user of data.NewFollowers) {
      await c.execute({
        sql: "INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'follow', ?)",
        args: [sessionId, user]
      });
    }
  }

  if (data.Raiders) {
    for (const raider of data.Raiders) {
      await c.execute({
        sql: "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'raid', ?, ?)",
        args: [sessionId, raider.user, JSON.stringify({ viewers: raider.viewers })]
      });
    }
  }

  if (data.Subscribers) {
    for (const sub of data.Subscribers) {
      await c.execute({
        sql: "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'sub', ?, ?)",
        args: [sessionId, sub.user, JSON.stringify({ months: sub.streamMonths })]
      });
    }
  }

  if (data.Cheerers) {
    for (const cheerer of data.Cheerers) {
      await c.execute({
        sql: "INSERT INTO stream_events (session_id, event_type, username, metadata) VALUES (?, 'cheer', ?, ?)",
        args: [sessionId, cheerer.user, JSON.stringify({ bits: cheerer.bits })]
      });
    }
  }

  if (data.Hosts) {
    for (const host of data.Hosts) {
      await c.execute({
        sql: "INSERT INTO stream_events (session_id, event_type, username) VALUES (?, 'host', ?)",
        args: [sessionId, host]
      });
    }
  }

  console.log(`Session ${sessionId} data saved to database`);
}

async function loadSessionData(sessionId) {
  const c = await getClient();

  const data = {
    Project: "",
    Id: sessionId,
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
    data.DateTimeStart = session.started_at;
    data.DateTimeEnd = session.ended_at;
    data.Notes = JSON.parse(session.notes || '[]');
  }

  const usersResult = await c.execute("SELECT * FROM users WHERE session_id = ?", [sessionId]);
  data.UserSession = usersResult.rows.map(u => ({
    user: u.username,
    dropCount: u.drop_count,
    landedCount: u.landed_count,
    highScore: u.high_score,
    bestHighScore: u.best_high_score,
    lastUpdate: u.last_update
  }));

  const todosResult = await c.execute("SELECT * FROM todos WHERE session_id = ?", [sessionId]);
  data.Todos = todosResult.rows.map(t => ({
    id: t.id,
    description: t.description,
    status: t.status
  }));

  const remindersResult = await c.execute("SELECT * FROM reminders WHERE session_id = ?", [sessionId]);
  data.Reminders = remindersResult.rows.map(r => ({
    Name: r.name,
    Message: r.message,
    Status: r.status,
    LastCheck: r.last_check
  }));

  const timeLogsResult = await c.execute("SELECT * FROM time_logs WHERE session_id = ?", [sessionId]);
  data.TimeLogs = timeLogsResult.rows.map(l => ({
    user: l.username,
    message: l.message,
    time: l.timestamp
  }));

  const eventsResult = await c.execute("SELECT * FROM stream_events WHERE session_id = ?", [sessionId]);
  for (const event of eventsResult.rows) {
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
  const c = await getClient();
  const result = await c.execute("SELECT * FROM stream_counter WHERE id = 1");
  return result.rows[0] || { current_stream_number: 0, last_stream_date: "" };
}

async function incrementStreamCounter() {
  const c = await getClient();
  const counter = await getStreamCounter();
  const today = new Date().toISOString().split('T')[0];

  const newNumber = (counter.current_stream_number || 0) + 1;
  await c.execute({
    sql: "UPDATE stream_counter SET current_stream_number = ?, last_stream_date = ? WHERE id = 1",
    args: [newNumber, today]
  });

  return { currentStreamNumber: newNumber, lastStreamDate: today };
}

async function updateNotes(sessionId, notes) {
  const c = await getClient();
  await c.execute({
    sql: "UPDATE stream_sessions SET notes = ? WHERE id = ?",
    args: [JSON.stringify(notes), sessionId]
  });
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
  updateNotes
};
