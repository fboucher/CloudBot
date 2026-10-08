const express = require('express');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file if present (useful for local development)
function loadEnv() {
    const envPaths = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '.env')
    ];
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, 'utf-8');
                const lines = content.split(/\r?\n/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    const eqIdx = trimmed.indexOf('=');
                    if (eqIdx > 0) {
                        const key = trimmed.slice(0, eqIdx).trim();
                        let val = trimmed.slice(eqIdx + 1).trim();
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        }
                        if (!process.env[key]) {
                            process.env[key] = val;
                        }
                    }
                }
                console.log(`Loaded environment variables from ${envPath}`);
                break;
            } catch (err) {
                console.error(`Error reading env file at ${envPath}:`, err);
            }
        }
    }
}
loadEnv();

const { exec } = require('child_process');
const dateFormat = require('dateformat');
const pkg = require('./package.json');
const BUILD_DATE = new Date().toISOString().split('T')[0];
let text2png;
try {
    text2png = require('text2png');
} catch (err) {
    console.warn('Warning: text2png could not be loaded (canvas dependency binary issue). Image features will be disabled:', err.message);
}
const db = require('./db');
const app = express();
const sessionMessageCounts = new Map();
const port = 3000;
const DEFAULT_GENERATED_DIR = path.join(__dirname, 'public', 'medias', 'generated');
const FALLBACK_GENERATED_DIR = path.join('/tmp', 'cloudbot-generated');

function resolveGeneratedDir() {
    const preferredDir = process.env.CLOUDBOT_GENERATED_DIR || DEFAULT_GENERATED_DIR;
    const candidates = [preferredDir, FALLBACK_GENERATED_DIR];

    for (const dir of candidates) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.accessSync(dir, fs.constants.W_OK);
            if (dir !== preferredDir) {
                console.warn(`Generated image directory is not writable: ${preferredDir}. Using fallback: ${dir}`);
            }
            return dir;
        } catch (err) {
            console.warn(`Generated image directory unavailable: ${dir} (${err.code || err.message})`);
        }
    }

    throw new Error('No writable directory available for generated images.');
}

const GENERATED_DIR = resolveGeneratedDir();
const CEEBEE_KNOWLEDGE_DIR = path.join(__dirname, 'io', 'knowledge');
if (!fs.existsSync(CEEBEE_KNOWLEDGE_DIR)) {
    fs.mkdirSync(CEEBEE_KNOWLEDGE_DIR, { recursive: true });
}

function sanitizeUsername(name) {
    if (name === null || name === undefined) {
        return '';
    }
    return String(name)
        .trim()
        .replace(/^@+/, '')
        .replace(/[,.:;!?]+$/, '')
        .trim()
        .toLowerCase();
}

let ceebeeChatHistory = [];

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/public/medias/generated', express.static(GENERATED_DIR));
app.use('/io', express.static(path.join(__dirname, 'io')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './public/', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, './public/', 'admin.html'));
});

app.post('/Hello', (req, res) => {
    if (req.body && req.body.user) {
        const user = req.body.user;
        let filename = dateFormat(new Date(), 'yyyy-mm-dd-HHMM') + `_hello-${user}.png`;
        console.log(`new image: ${filename}`);
        const msg = `Hello ${user}!`;

        if (!text2png) {
            console.error('/Hello: text2png is not available');
            return res.status(500).json({ error: 'Image generation is disabled. text2png is not installed.' });
        }

        try {
            const filePath = createImage(filename, msg);
            if (!filePath) {
                console.error('/Hello: createImage returned null');
                return res.status(500).json({ error: 'Failed to create image file.' });
            }

            if (!fs.existsSync(filePath)) {
                console.error(`/Hello: Image file was not created: ${filePath}`);
                return res.status(500).json({ error: 'Image file was not created.' });
            }

            console.log(`/Hello: Image successfully created: ${filePath}`);
            res.json({ msg: filename });
        } catch (err) {
            console.error('Error creating image:', err);
            res.status(500).json({ error: 'Failed to create image: ' + err.message });
        }
    } else {
        res.status(400).json({ error: 'No user.' });
    }
});

function wrapText(text, maxCharsPerLine = 30) {
    if (!text) return '';
    return text.split('\n').map(line => {
        const words = line.split(' ');
        let lines = [];
        let currentLine = '';

        for (const word of words) {
            const lengthCheck = currentLine.length + word.length + (currentLine ? 1 : 0);
            if (lengthCheck > maxCharsPerLine) {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            } else {
                if (currentLine) {
                    currentLine += ' ' + word;
                } else {
                    currentLine = word;
                }
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        return lines.join('\n');
    }).join('\n');
}

app.post('/Attention', (req, res) => {
    if (req.body && req.body.user && req.body.message) {
        const user = req.body.user;
        const userMsg = wrapText(req.body.message, 30);
        let filename = dateFormat(new Date(), 'yyyy-mm-dd-HHMM') + `_Att-${user}.png`;
        console.log(`new image: ${filename}`);
        const msg = `${user} said:\n${userMsg}`;

        if (!text2png) {
            console.error('/Attention: text2png is not available');
            return res.status(500).json({ error: 'Image generation is disabled. text2png is not installed.' });
        }

        try {
            const filePath = createImage(filename, msg);
            if (!filePath) {
                console.error('/Attention: createImage returned null');
                return res.status(500).json({ error: 'Failed to create image file.' });
            }

            if (!fs.existsSync(filePath)) {
                console.error(`/Attention: Image file was not created: ${filePath}`);
                return res.status(500).json({ error: 'Image file was not created.' });
            }

            console.log(`/Attention: Image successfully created: ${filePath}`);
            res.json({ msg: filename });
        } catch (err) {
            console.error('Error creating image:', err);
            res.status(500).json({ error: 'Failed to create image: ' + err.message });
        }
    } else {
        res.status(400).json({ error: 'Missing user or message.' });
    }
});

app.post('/savetofile', async (req, res) => {
    console.log('..saving to database..');
    try {
        // If a legacy streamSession blob was sent, persist it to DB
        if (req.body && req.body.streamSession) {
            const sessionId = req.body.streamSession.Id;
            if (sessionId) {
                await db.saveSessionData(sessionId, req.body.streamSession);
            }
            console.log('Session data saved to database.');
            return res.json({ success: true });
        }

        // Preferred path: persist current project_name / stream_title for active session
        const session = await db.getActiveSession();
        if (!session) return res.status(404).json({ error: 'No active session.' });

        const { project_name, stream_title } = req.body || {};
        if (project_name !== undefined || stream_title !== undefined) {
            const c = await db.getClient();
            if (project_name !== undefined) {
                await c.prepare("UPDATE stream_sessions SET project_name = ? WHERE id = ?").run(project_name, session.id);
            }
            if (stream_title !== undefined) {
                await c.prepare("UPDATE stream_sessions SET stream_title = ? WHERE id = ?").run(stream_title, session.id);
            }
        }
        console.log('Session saved to database.');
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving to database:', err);
        res.status(500).json({ error: 'Failed to save data.' });
    }
});

app.get('/loadfromfile', async (req, res) => {
    // console.log('..loading from database..');
    try {
        const activeSession = await db.getActiveSession();
        if (activeSession) {
            const sessionData = await db.loadSessionData(activeSession.id);
            // console.log('Session data loaded from database:', activeSession.id);
            res.json(sessionData);
        } else {
            res.json({
                Project: "",
                Title: "",
                Id: 0,
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
            });
        }
    } catch (err) {
        console.error('Error loading from database:', err);
        res.status(500).json({ error: 'Failed to load data.' });
    }
});

app.get('/getstreamcounter', async (req, res) => {
    console.log('..getting stream counter from database..');
    try {
        const counter = await db.getStreamCounter();
        res.json({
            currentStreamNumber: counter.current_stream_number,
            lastStreamDate: counter.last_stream_date
        });
    } catch (err) {
        console.error('Error loading counter:', err);
        res.status(500).json({ error: 'Failed to load counter.' });
    }
});

app.post('/incrementstreamcounter', async (req, res) => {
    console.log('..incrementing stream counter in database..');
    try {
        const counter = await db.incrementStreamCounter();
        console.log('Stream counter incremented to:', counter.currentStreamNumber);
        res.json({
            currentStreamNumber: counter.currentStreamNumber,
            lastStreamDate: counter.lastStreamDate
        });
    } catch (err) {
        console.error('Error incrementing counter:', err);
        res.status(500).json({ error: 'Failed to increment counter.' });
    }
});

app.patch('/api/stream/counter', async (req, res) => {
    const { value } = req.body;
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return res.status(400).json({ error: 'Value must be a positive integer.' });
    }
    try {
        const counter = await db.setStreamCounter(parsed);
        res.json({ currentStreamNumber: counter.currentStreamNumber, lastStreamDate: counter.lastStreamDate });
    } catch (err) {
        console.error('Error setting counter:', err);
        res.status(500).json({ error: 'Failed to set counter.' });
    }
});

app.post('/genstreamnotes', (req, res) => {
    console.log('..generating stream notes..');
    if (!req.body || !req.body.project || !req.body.id || !req.body.notes) {
        return res.status(400).json({ error: 'Missing project, id, or notes.' });
    }
    const filename = path.join(
        __dirname,
        'io',
        `${dateFormat(new Date(), 'yyyy-mm-dd')}-${req.body.id}-${req.body.project}.md`
    );
    console.log('..filename: ' + filename);
    const data = req.body.notes;
    fs.writeFile(filename, data, (err) => {
        if (err) {
            console.error('Error saving notes:', err);
            return res.status(500).json({ error: 'Failed to save notes.' });
        }
        console.log('Notes saved.');
        res.json({ msg: 'Notes saved.' });
        CleanUpGeneratedImages();
    });
});

app.post('/startstream', async (req, res) => {
    console.log('..starting new stream session..');
    if (!req.body || !req.body.project) {
        return res.status(400).json({ error: 'Missing project name.' });
    }
    try {
        const counter = await db.incrementStreamCounter();
        const sessionId = await db.startStreamSession(req.body.project, req.body.title || "", "", counter.currentStreamNumber);
        console.log(`Stream session started: ${sessionId}, stream #${counter.currentStreamNumber}`);
        res.json({ sessionId, streamNumber: counter.currentStreamNumber });
    } catch (err) {
        console.error('Error starting stream:', err);
        res.status(500).json({ error: 'Failed to start stream.' });
    }
});

app.post('/endstream', async (req, res) => {
    console.log('..ending stream session..');
    if (!req.body || !req.body.sessionId) {
        return res.status(400).json({ error: 'Missing sessionId.' });
    }
    try {
        await db.endStreamSession(req.body.sessionId);
        console.log(`Stream session ended: ${req.body.sessionId}`);
        res.json({ msg: 'Stream ended.' });
    } catch (err) {
        console.error('Error ending stream:', err);
        res.status(500).json({ error: 'Failed to end stream.' });
    }
});

app.post('/updatestreamtitle', async (req, res) => {
    console.log('..updating stream title..');
    if (!req.body || !req.body.sessionId || req.body.title === undefined) {
        return res.status(400).json({ error: 'Missing sessionId or title.' });
    }
    try {
        const c = await db.getClient();
        await c.prepare("UPDATE stream_sessions SET stream_title = ? WHERE id = ?").run(req.body.title, req.body.sessionId);
        console.log(`Stream title updated: ${req.body.title}`);
        res.json({ msg: 'Title updated.' });
    } catch (err) {
        console.error('Error updating title:', err);
        res.status(500).json({ error: 'Failed to update title.' });
    }
});

app.post('/updateproject', async (req, res) => {
    console.log('..updating project name..');
    if (!req.body || !req.body.sessionId || !req.body.project) {
        return res.status(400).json({ error: 'Missing sessionId or project.' });
    }
    try {
        const c = await db.getClient();
        await c.prepare("UPDATE stream_sessions SET project_name = ? WHERE id = ?").run(req.body.project, req.body.sessionId);
        console.log(`Project updated: ${req.body.project}`);
        res.json({ msg: 'Project updated.' });
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ error: 'Failed to update project.' });
    }
});

let currentEffect = { type: null, user: null, message: null, image: null, timestamp: null };

// SSE clients for overlay push
const sseClients = new Set();

function broadcastSSE(payload) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
        res.write(data);
    }
}

app.post('/triggereffect', async (req, res) => {
    console.log('..triggering effect..', req.body);
    if (!req.body || !req.body.effectType) {
        return res.status(400).json({ error: 'Missing effectType.' });
    }

    currentEffect = {
        type: req.body.effectType,
        user: req.body.user || 'Admin',
        message: req.body.message || '',
        image: req.body.image || null,
        timestamp: Date.now()
    };

    console.log(`Effect triggered: ${currentEffect.type} by ${currentEffect.user}`);
    res.json({ msg: 'Effect triggered.', effect: currentEffect });
});

app.get('/currenteffect', (req, res) => {
    res.json(currentEffect);
});

app.post('/cleareffect', (req, res) => {
    currentEffect = { type: null, user: null, message: null, image: null, timestamp: null };
    res.json({ msg: 'Effect cleared' });
});

let todosVisibility = { visible: true };

app.post('/settodosvisibility', (req, res) => {
    if (req.body && req.body.visible !== undefined) {
        todosVisibility.visible = req.body.visible;
        console.log(`Todos visibility set to: ${todosVisibility.visible}`);
        res.json({ visible: todosVisibility.visible });
    } else {
        res.status(400).json({ error: 'Missing visible parameter.' });
    }
});

app.get('/gettodosvisibility', (req, res) => {
    res.json(todosVisibility);
});

app.get('/api/version', (req, res) => {
    res.json({ version: pkg.version, build: BUILD_DATE });
});

app.get('/api/session', async (req, res) => {
    console.log('..getting active session..');
    try {
        const session = await db.getActiveSession();
        if (session) {
            const [notes, todos, reminders, users] = await Promise.all([
                db.getNotes(session.id),
                db.getTodos(session.id),
                db.getReminders(session.id),
                db.getSessionUsers(session.id)
            ]);
            res.json({
                id: session.id,
                project_name: session.project_name,
                stream_title: session.stream_title || '',
                started_at: session.started_at,
                ended_at: session.ended_at,
                active: !session.ended_at,
                notes,
                todos,
                reminders,
                users
            });
        } else {
            res.json({ active: false });
        }
    } catch (err) {
        console.error('Error getting session:', err);
        res.status(500).json({ error: 'Failed to get session.' });
    }
});

app.get('/api/sessions', async (req, res) => {
    // console.log('..getting all sessions..');
    try {
        const sessions = await db.getAllSessions();
        res.json(sessions);
    } catch (err) {
        console.error('Error getting sessions:', err);
        res.status(500).json({ error: 'Failed to get sessions.' });
    }
});

app.get('/api/session/:id', async (req, res) => {
    // console.log('..getting session by id..');
    try {
        const session = await db.getSessionById(parseInt(req.params.id));
        if (session) {
            const sessionData = await db.loadSessionData(session.id);
            res.json({ ...session, data: sessionData });
        } else {
            res.status(404).json({ error: 'Session not found.' });
        }
    } catch (err) {
        console.error('Error getting session:', err);
        res.status(500).json({ error: 'Failed to get session.' });
    }
});

app.patch('/api/session/:id', async (req, res) => {
    console.log('..updating session..');
    const id = parseInt(req.params.id);
    const { project_name, stream_title, project_url, ended_at } = req.body || {};
    if (project_name === undefined && stream_title === undefined && project_url === undefined && ended_at === undefined) {
        return res.status(400).json({ error: 'Provide project_name, stream_title, project_url, and/or ended_at to update.' });
    }
    try {
        const c = await db.getClient();
        if (project_name !== undefined) {
            await c.prepare("UPDATE stream_sessions SET project_name = ? WHERE id = ?").run(project_name, id);
        }
        if (stream_title !== undefined) {
            await c.prepare("UPDATE stream_sessions SET stream_title = ? WHERE id = ?").run(stream_title, id);
        }
        if (project_url !== undefined) {
            await c.prepare("UPDATE stream_sessions SET project_url = ? WHERE id = ?").run(project_url, id);
        }
        if (ended_at !== undefined) {
            await c.prepare("UPDATE stream_sessions SET ended_at = ? WHERE id = ?").run(ended_at, id);
        }
        const session = await db.getSessionById(id);
        console.log(`Session ${id} updated.`);
        res.json({ success: true, session });
    } catch (err) {
        console.error('Error updating session:', err);
        res.status(500).json({ error: 'Failed to update session.' });
    }
});

app.post('/api/session/notes', async (req, res) => {
    console.log('..adding note..');
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });

        const { notes } = req.body;
        await db.updateNotes(session.id, notes);
        res.json({ success: true });
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).json({ error: 'Failed to add note.' });
    }
});

app.post('/api/session/todos', async (req, res) => {
    console.log('..adding todo..');
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });

        const { description, status } = req.body;
        await db.addTodo(session.id, description, status || 'new');
        res.json({ success: true });
    } catch (err) {
        console.error('Error adding todo:', err);
        res.status(500).json({ error: 'Failed to add todo.' });
    }
});

app.put('/api/session/todos/:id', async (req, res) => {
    console.log('..updating todo..');
    try {
        await db.updateTodoStatus(parseInt(req.params.id), req.body.status);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating todo:', err);
        res.status(500).json({ error: 'Failed to update todo.' });
    }
});

app.delete('/api/session/todos/:id', async (req, res) => {
    console.log('..deleting todo..');
    try {
        await db.deleteTodo(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting todo:', err);
        res.status(500).json({ error: 'Failed to delete todo.' });
    }
});

app.post('/api/session/reminders', async (req, res) => {
    console.log('..adding reminder..');
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });

        const { name, message, status } = req.body;
        await db.addReminder(session.id, name, message, status || 'active');
        res.json({ success: true });
    } catch (err) {
        console.error('Error adding reminder:', err);
        res.status(500).json({ error: 'Failed to add reminder.' });
    }
});

app.put('/api/session/reminders/:id', async (req, res) => {
    console.log('..updating reminder..');
    try {
        await db.updateReminderStatus(parseInt(req.params.id), req.body.status);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating reminder:', err);
        res.status(500).json({ error: 'Failed to update reminder.' });
    }
});

app.delete('/api/session/reminders/:id', async (req, res) => {
    console.log('..deleting reminder..');
    try {
        await db.deleteReminder(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting reminder:', err);
        res.status(500).json({ error: 'Failed to delete reminder.' });
    }
});

// Helper function to generate and save show notes markdown
async function generateAndSaveShowNotes(sessionId, options = {}) {
    const {
        skipFrontMatter = false,
        skipReminders = true,
        download = true
    } = options;

    const s = await db.loadSessionData(sessionId);
    if (!s) throw new Error(`Session ${sessionId} not found`);

    const date = s.DateTimeStart ? s.DateTimeStart.split('T')[0] : new Date().toISOString().split('T')[0];
    const title = s.Title && s.Title.trim() ? s.Title : `_____ (stream ${sessionId})`;

    let md = '';

    // ── Front matter ──────────────────────────────────────────────────────────
    if (!skipFrontMatter) {
        md = `---\nlayout: post\ntitle: ${title}\n`;
        md += `featured-image: https://img.youtube.com/vi/_________/hqdefault.jpg\n`;
        md += `date: ${date}  06:30 -0500\n`;
        md += `categories:  ${s.Project}\n---\n\n`;
    }

    const streamNum = s.StreamNumber || sessionId;
    md += `## Summary\n\n📺 - Twitch archive - stream no. ${streamNum}\n\n`;

    if (!skipFrontMatter) {
        md += `\n## Replay\n\n{% include youtube.html id="_________" %}\n\n`;
        md += `<br/><!--more-->\n`;
    }

    // ── Project ───────────────────────────────────────────────────────────────
    md += `\n### Project\n\n`;
    const projectUrl = s.ProjectUrl && s.ProjectUrl.trim()
        ? s.ProjectUrl
        : `https://github.com/FBoucher/${s.Project}`;
    md += `All the code for this project is available on GitHub: ${s.Project} - ${projectUrl}\n`;

    // ── To-Dos ────────────────────────────────────────────────────────────────
    if (s.Todos.length > 0) {
        md += `\n### ToDos\n\n`;
        s.Todos.forEach(t => {
            if (t.status === 'cancel') {
                md += `- ~~[ ] ${t.description}~~\n`;
            } else {
                const check = t.status === 'done' ? 'X' : ' ';
                const bold = t.status === 'inProgress' ? '**' : '';
                md += `- [${check}] ${bold}${t.description}${bold}\n`;
            }
        });
    }

    // ── Time logs ─────────────────────────────────────────────────────────────
    if (s.TimeLogs.length > 0) {
        md += `\n### TimeLogs\n\n`;
        md += `    00:00:00 Intro\n    00:00:10 Bonjour, Hi!\n`;
        s.TimeLogs.forEach(l => { md += `    ${l.time} ${l.message}\n`; });
    }

    // ── Cloudies ──────────────────────────────────────────────────────────────
    if (s.NewFollowers.length > 0) {
        md += `\n### New Followers\n\n`;
        s.NewFollowers.forEach(u => { md += `- [@${u}](https://www.twitch.tv/${u})\n`; });
    }

    if (s.Subscribers.length > 0) {
        md += `\n### Subscribers\n\n`;
        s.Subscribers.forEach(sub => { md += `- [@${sub.user}](https://www.twitch.tv/${sub.user}) ${sub.streamMonths} month(s)\n`; });
    }

    if (s.Raiders.length > 0) {
        md += `\n### Raids\n\n`;
        s.Raiders.forEach(r => { md += `- [@${r.user}](https://www.twitch.tv/${r.user}) has raided you with a party of ${r.viewers ?? 0}\n`; });
    }

    if (s.Hosts.length > 0) {
        md += `\n### Hosts\n\n`;
        s.Hosts.forEach(u => { md += `- [@${u}](https://www.twitch.tv/${u})\n`; });
    }

    if (s.Cheerers.length > 0) {
        md += `\n### Cheers\n\n`;
        s.Cheerers.forEach(c => { md += `- [@${c.user}](https://www.twitch.tv/${c.user})  ${c.bits} bits\n`; });
    }

    // ── Game results ──────────────────────────────────────────────────────────
    if (s.UserSession.length > 0) {
        md += `\n### Game Results\n\n`;
        const sorted = [...s.UserSession].sort((a, b) => b.highScore - a.highScore);
        sorted.forEach(u => { md += `- [@${u.user}](https://www.twitch.tv/${u.user}): ${u.highScore}\n`; });

        let bestScoreUser = null, biggestLoser = null, luckiest = null, superParticipant = null;
        let maxScore = -Infinity, maxDrop = -Infinity, minDropForMaxScore = Infinity, maxDropLoser = -Infinity;

        s.UserSession.forEach(u => {
            if (u.highScore > maxScore) { maxScore = u.highScore; bestScoreUser = u; }
            if (u.dropCount > maxDrop) { maxDrop = u.dropCount; superParticipant = u; }
            if (u.bestHighScore == 0 && u.dropCount > maxDropLoser) { maxDropLoser = u.dropCount; biggestLoser = u; }
        });
        s.UserSession.forEach(u => {
            if (u.highScore === maxScore && u.dropCount < minDropForMaxScore) {
                minDropForMaxScore = u.dropCount; luckiest = u;
            }
        });

        md += `\n#### Statistics\n\n`;
        if (bestScoreUser) md += `- 🏆Best score: [@${bestScoreUser.user}](https://www.twitch.tv/${bestScoreUser.user}) with ${bestScoreUser.highScore}\n`;
        if (biggestLoser) md += `- 😭Biggest loser: [@${biggestLoser.user}](https://www.twitch.tv/${biggestLoser.user}) with ${biggestLoser.dropCount} drops and no high score\n`;
        if (luckiest) md += `- 🍀Luckiest: [@${luckiest.user}](https://www.twitch.tv/${luckiest.user}) with best score ${luckiest.highScore} and only ${luckiest.dropCount} drops\n`;
        if (superParticipant) md += `- 🎖️Super participant: [@${superParticipant.user}](https://www.twitch.tv/${superParticipant.user}) with ${superParticipant.dropCount} drops\n`;
    }

    // ── Notes / References ────────────────────────────────────────────────────
    if (s.Notes.length > 0) {
        md += `\n### Notes/ References / Snippets\n\n`;
        s.Notes.forEach(n => { md += `- ${n}\n`; });
    }

    // ── Reminders (for record-keeping) ────────────────────────────────────────
    if (!skipReminders && s.Reminders.length > 0) {
        md += `\n### Reminders\n\n`;
        s.Reminders.forEach(r => { md += `- **${r.Name}**: ${r.Message}\n`; });
    }

    if (download) {
        const filename = `${date}-${streamNum}-${s.Project}.md`;
        const ioDir = path.join(__dirname, 'io');
        fs.mkdirSync(ioDir, { recursive: true });
        const filepath = path.join(ioDir, filename);
        fs.writeFileSync(filepath, md, 'utf8');
        return { filename, content: md, filepath };
    }

    return { content: md };
}

app.get('/api/export', async (req, res) => {
    try {
        let session = null;
        const { sessionId, download } = req.query;
        const shouldDownload = download !== 'false';

        if (sessionId) {
            session = await db.getSessionById(sessionId);
        } else {
            session = await db.getActiveSession();
        }

        if (!session) {
            const lastSession = await db.getAllSessions();
            if (lastSession && lastSession.length > 0) {
                session = lastSession[0];
            }
        }

        if (!session) return res.status(404).json({ error: 'No session found to export' });

        const result = await generateAndSaveShowNotes(session.id, {
            skipFrontMatter: !shouldDownload,
            skipReminders: true,
            download: shouldDownload
        });

        if (shouldDownload) {
            console.log(`Export saved to src/io/${result.filename}`);
            res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
            res.setHeader('Content-Type', 'text/markdown');
        } else {
            res.setHeader('Content-Type', 'text/markdown');
        }
        res.send(result.content);
    } catch (err) {
        console.error('Error exporting session:', err);
        res.status(500).json({ error: 'Failed to export session.' });
    }
});

// ─── Stream Start / Stop / Status ────────────────────────────────────────────

app.post('/api/stream/start', async (req, res) => {
    console.log('..starting stream session (API)..');
    const { projectName, streamTitle, projectUrl } = req.body || {};
    if (!projectName) {
        return res.status(400).json({ error: 'Missing projectName.' });
    }
    try {
        const counter = await db.incrementStreamCounter();
        const sessionId = await db.startStreamSession(projectName, streamTitle || '', projectUrl || '', counter.currentStreamNumber);
        const session = await db.getSessionById(sessionId);
        broadcastSSE({ event: 'stream_started', sessionId, streamNumber: counter.currentStreamNumber });
        console.log(`Stream started: session=${sessionId}, #${counter.currentStreamNumber}`);
        res.json({ sessionId, streamNumber: counter.currentStreamNumber, session });
    } catch (err) {
        console.error('Error starting stream:', err);
        res.status(500).json({ error: 'Failed to start stream.' });
    }
});

app.post('/api/stream/stop', async (req, res) => {
    console.log('..stopping stream session (API)..');
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });
        await db.endStreamSession(session.id);
        sessionMessageCounts.delete(session.id);
        broadcastSSE({ event: 'stream_stopped', sessionId: session.id });
        console.log(`Stream stopped: session=${session.id}`);

        // Auto-generate show notes markdown file
        try {
            const { filename, filepath } = await generateAndSaveShowNotes(session.id);
            console.log(`Show notes auto-saved to src/io/${filename}`);
        } catch (exportErr) {
            console.error('Failed to auto-generate show notes:', exportErr);
            // Don't fail the stop endpoint if show notes generation fails
        }

        res.json({ msg: 'Stream stopped.', sessionId: session.id });
    } catch (err) {
        console.error('Error stopping stream:', err);
        res.status(500).json({ error: 'Failed to stop stream.' });
    }
});

app.get('/api/stream/status', async (req, res) => {
    try {
        const session = await db.getActiveSession();
        if (session) {
            const [notes, todos, reminders, users] = await Promise.all([
                db.getNotes(session.id),
                db.getTodos(session.id),
                db.getReminders(session.id),
                db.getSessionUsers(session.id)
            ]);
            res.json({
                active: true,
                session: {
                    id: session.id,
                    project_name: session.project_name,
                    stream_title: session.stream_title || '',
                    project_url: session.project_url || '',
                    started_at: session.started_at,
                    ended_at: session.ended_at,
                    active: true,
                    notes,
                    todos,
                    reminders,
                    users
                }
            });
        } else {
            res.json({ active: false });
        }
    } catch (err) {
        console.error('Error getting stream status:', err);
        res.status(500).json({ error: 'Failed to get stream status.' });
    }
});

// ─── SSE Overlay ─────────────────────────────────────────────────────────────

app.get('/api/stream/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ event: 'connected' })}\n\n`);

    req.on('close', () => {
        sseClients.delete(res);
    });
});

app.post('/api/stream/overlay', (req, res) => {
    if (!req.body || !req.body.event) {
        return res.status(400).json({ error: 'Missing event payload.' });
    }
    broadcastSSE(req.body);
    res.json({ msg: 'Pushed to overlay.', clients: sseClients.size });
});

// ─── Notes ───────────────────────────────────────────────────────────────────

app.get('/api/notes', async (req, res) => {
    try {
        const session = await db.getActiveSession();
        if (!session) return res.json([]);
        const notes = await db.getNotes(session.id);
        res.json(notes);
    } catch (err) {
        console.error('Error getting notes:', err);
        res.status(500).json({ error: 'Failed to get notes.' });
    }
});

app.post('/api/notes', async (req, res) => {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text.' });
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });
        const note = await db.addNote(session.id, text);
        res.json(note);
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).json({ error: 'Failed to add note.' });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await db.deleteNote(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting note:', err);
        res.status(500).json({ error: 'Failed to delete note.' });
    }
});

// ─── Todos ────────────────────────────────────────────────────────────────────

app.get('/api/todos', async (req, res) => {
    try {
        const session = await db.getActiveSession();
        if (!session) return res.json([]);
        const todos = await db.getTodos(session.id);
        res.json(todos);
    } catch (err) {
        console.error('Error getting todos:', err);
        res.status(500).json({ error: 'Failed to get todos.' });
    }
});

app.post('/api/todos', async (req, res) => {
    const { description } = req.body || {};
    if (!description) return res.status(400).json({ error: 'Missing description.' });
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });
        const todo = await db.addTodo(session.id, description, 'new');
        res.json(todo);
    } catch (err) {
        console.error('Error adding todo:', err);
        res.status(500).json({ error: 'Failed to add todo.' });
    }
});

app.patch('/api/todos/:id', async (req, res) => {
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Missing status.' });
    try {
        await db.updateTodoStatus(parseInt(req.params.id), status);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating todo:', err);
        res.status(500).json({ error: 'Failed to update todo.' });
    }
});

app.delete('/api/todos/:id', async (req, res) => {
    try {
        await db.deleteTodo(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting todo:', err);
        res.status(500).json({ error: 'Failed to delete todo.' });
    }
});

// ─── Users / Scores ──────────────────────────────────────────────────────────

app.get('/api/users', async (req, res) => {
    try {
        const session = await db.getActiveSession();
        if (!session) return res.json([]);
        const users = await db.getSessionUsers(session.id);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/score', async (req, res) => {
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(404).json({ error: 'No active session' });
        const { username, dropCount, landedCount, highScore, bestHighScore } = req.body;
        if (!username) return res.status(400).json({ error: 'username required' });
        const cleanUsername = sanitizeUsername(username);
        if (!cleanUsername) return res.status(400).json({ error: 'username required' });
        await db.upsertUser(session.id, cleanUsername, { dropCount, landedCount, highScore, bestHighScore });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Participants / Chat Events ──────────────────────────────────────────────

app.get('/api/participants', async (req, res) => {
    try {
        const participants = await db.getAllParticipantsWithStats();
        res.json(participants);
    } catch (err) {
        console.error('Error getting participants:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/participants/regular', async (req, res) => {
    const { username, isRegular } = req.body || {};
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername) return res.status(400).json({ error: 'Missing username.' });
    try {
        await db.setParticipantRegularStatus(cleanUsername, !!isRegular);
        res.json({ success: true });
    } catch (err) {
        console.error('Error setting regular status:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/participants/streamer', async (req, res) => {
    const { username, isStreamer } = req.body || {};
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername) return res.status(400).json({ error: 'Missing username.' });
    try {
        await db.setParticipantStreamerStatus(cleanUsername, !!isStreamer);
        res.json({ success: true });
    } catch (err) {
        console.error('Error setting streamer status:', err);
        res.status(500).json({ error: err.message });
    }
});

let twitchAccessToken = null;
let twitchTokenExpiry = 0;

async function getTwitchAccessToken() {
    const now = Date.now();
    if (twitchAccessToken && now < twitchTokenExpiry - 60000) {
        return twitchAccessToken;
    }

    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.SECRET;

    if (!clientId || !clientSecret) {
        console.warn("[Twitch API] Missing CLIENT_ID or SECRET environment variables. Cannot fetch streamer info.");
        return null;
    }

    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'client_credentials'
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to get Twitch token: ${response.status} ${errText}`);
        }

        const data = await response.json();
        twitchAccessToken = data.access_token;
        twitchTokenExpiry = now + (data.expires_in * 1000);
        return twitchAccessToken;
    } catch (err) {
        console.error("[Twitch API] Error fetching access token:", err);
        return null;
    }
}

async function fetchTwitchStreamerInfo(username) {
    const token = await getTwitchAccessToken();
    const clientId = process.env.CLIENT_ID;

    if (!token || !clientId) {
        console.warn("[Twitch API] Cannot fetch streamer info due to missing token or client ID.");
        return null;
    }

    try {
        // 1. Get User Info
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`, {
            headers: {
                'Client-Id': clientId,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!userRes.ok) {
            throw new Error(`Helix User API error: ${userRes.status} ${await userRes.text()}`);
        }

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) {
            console.warn(`[Twitch API] User ${username} not found.`);
            return null;
        }

        const user = userData.data[0];
        const userId = user.id;

        // 2. Get 5 latest videos
        let videos = [];
        try {
            const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&first=5`, {
                headers: {
                    'Client-Id': clientId,
                    'Authorization': `Bearer ${token}`
                }
            });

            if (videoRes.ok) {
                const videoData = await videoRes.json();
                videos = videoData.data || [];
            } else {
                console.warn(`[Twitch API] Helix Videos API error: ${videoRes.status} ${await videoRes.text()}`);
            }
        } catch (vidErr) {
            console.error(`[Twitch API] Error fetching videos for ${username}:`, vidErr);
        }

        return {
            description: user.description || "",
            profile_image_url: user.profile_image_url || "",
            videos: videos.map(v => ({ title: v.title }))
        };
    } catch (err) {
        console.error(`[Twitch API] Error fetching streamer info for ${username}:`, err);
        return null;
    }
}

async function generateShoutoutMessage(username) {
    let shoutoutMessage = "";
    let profileImageUrl = "";
    let success = false;

    console.log(`[generateShoutoutMessage] Fetching Twitch streamer info for: ${username}`);
    try {
        const twitchUser = await fetchTwitchStreamerInfo(username);
        console.log(`[generateShoutoutMessage] Twitch info result for ${username}:`, twitchUser ? "Found" : "Not Found");
        if (twitchUser && twitchUser.profile_image_url) {
            profileImageUrl = twitchUser.profile_image_url;
        }

        console.log(`[generateShoutoutMessage] Fetching active Ceebee connection...`);
        const activeConnection = await db.getActiveCeebeeConnection();
        console.log(`[generateShoutoutMessage] Active connection:`, activeConnection ? activeConnection.name : "None");

        if (activeConnection) {
            let streamContext = "";
            const STREAM_CONTEXT_FILE = path.join(__dirname, 'io', 'stream_context.md');
            if (fs.existsSync(STREAM_CONTEXT_FILE)) {
                streamContext = fs.readFileSync(STREAM_CONTEXT_FILE, 'utf-8');
            }

            let corePrompt = "You are Ceebee, an AI assistant.";
            const corePromptPath = path.join(__dirname, 'io', 'soul.md');
            if (fs.existsSync(corePromptPath)) {
                corePrompt = fs.readFileSync(corePromptPath, 'utf-8');
            }

            let knowledgeContext = "";
            const CEEBEE_KNOWLEDGE_DIR = path.join(__dirname, 'io', 'knowledge');
            if (fs.existsSync(CEEBEE_KNOWLEDGE_DIR)) {
                const files = fs.readdirSync(CEEBEE_KNOWLEDGE_DIR);
                for (const file of files) {
                    if (file.endsWith('.md')) {
                        const content = fs.readFileSync(path.join(CEEBEE_KNOWLEDGE_DIR, file), 'utf-8');
                        knowledgeContext += `\n\n--- Document: ${file} ---\n${content}`;
                    }
                }
            }

            const bio = (twitchUser && twitchUser.description) || "No bio description set.";
            let streamTitlesSection = "No recent stream titles found.";
            if (twitchUser && twitchUser.videos && twitchUser.videos.length > 0) {
                streamTitlesSection = twitchUser.videos.map((vid, idx) => `${idx + 1}. "${vid.title}"`).join('\n');
            }

            let fullSystemPrompt = corePrompt;
            if (streamContext && streamContext.trim() !== '') {
                fullSystemPrompt += `\n\n--- Today's Stream Context ---\n${streamContext}`;
            }
            if (knowledgeContext) {
                fullSystemPrompt += `\n\n--- Background Information ---\n${knowledgeContext}`;
            }

            fullSystemPrompt += `\n\n[SYSTEM INSTRUCTION: A fellow Twitch streamer named @${username} is in the chat. Generate a warm, kind, and funny shoutout/introduction for them.\nRead the following details about @${username}:\n- About/Bio: "${bio}"\n- Titles of their last 5 streams:\n${streamTitlesSection}\n\nThe shoutout MUST contain:\n1. An invitation to follow them with the URL: https://www.twitch.tv/${username}\n2. A nice, uplifting, and funny description/introduction message based on their bio and/or their recent stream titles.\n\nSpeak as Ceebee. Do not include system metadata or refer to these instructions. Limit to 2-3 sentences.]`;

            const messages = [
                { role: 'system', content: fullSystemPrompt },
                { role: 'user', content: `Please shoutout @${username}!` }
            ];

            const payload = {
                model: activeConnection.model || "default",
                messages: messages
            };

            const headers = { 'Content-Type': 'application/json' };
            if (activeConnection.api_key) {
                headers['Authorization'] = `Bearer ${activeConnection.api_key}`;
            }

            let endpointUrl = activeConnection.url;
            if (!endpointUrl.endsWith('/chat/completions')) {
                endpointUrl = endpointUrl.replace(/\/+$/, '') + '/chat/completions';
            }

            try {
                console.log(`[generateShoutoutMessage] Sending request to AI at ${endpointUrl}...`);
                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                console.log(`[generateShoutoutMessage] AI response status: ${response.status}`);
                if (response.ok) {
                    const data = await response.json();
                    shoutoutMessage = data.choices && data.choices[0] && data.choices[0].message
                        ? data.choices[0].message.content
                        : `Check out @${username} at https://www.twitch.tv/${username} - they are an awesome streamer!`;
                    success = true;
                    console.log(`[generateShoutoutMessage] AI shoutout generated successfully.`);
                } else {
                    const errText = await response.text();
                    console.warn(`[generateShoutoutMessage] AI response failed: ${response.status} - ${errText}`);
                }
            } catch (shoutErr) {
                console.error('[generateShoutoutMessage] Error during AI API call:', shoutErr);
            }
        } else {
            console.warn("[generateShoutoutMessage] No active Ceebee connection found in the database.");
        }
    } catch (err) {
        console.error("[generateShoutoutMessage] Unhandled error during generation:", err);
    }

    if (!success) {
        shoutoutMessage = `Check out @${username} at https://www.twitch.tv/${username} - they are an awesome streamer!`;
        console.log(`[generateShoutoutMessage] Using fallback shoutout message: ${shoutoutMessage}`);
    }

    return { shoutoutMessage, profileImageUrl, success };
}

async function triggerTwitchHelixShoutout(targetUsername) {
    let userToken = null;
    try {
        const secretPath = path.join(__dirname, 'io', 'secret.js');
        if (fs.existsSync(secretPath)) {
            const secretContent = fs.readFileSync(secretPath, 'utf8');
            const match = secretContent.match(/authToken\s*=\s*["'](oauth:)?([^"']+)["']/);
            if (match) {
                userToken = match[2];
            }
        }
    } catch (err) {
        console.error("[Shoutout API] Error reading secret.js:", err);
    }

    if (!userToken) {
        console.warn("[Shoutout API] Could not retrieve authToken from secret.js");
        return;
    }

    try {
        // 1. Validate the token to auto-retrieve Client ID and Broadcaster User ID
        console.log("[Shoutout API] Validating OAuth token...");
        const valRes = await fetch("https://id.twitch.tv/oauth2/validate", {
            headers: {
                'Authorization': `OAuth ${userToken}`
            }
        });

        if (valRes.status !== 200) {
            const errText = await valRes.text();
            console.error(`[Shoutout API] Token validation failed: ${valRes.status} - ${errText}`);
            return;
        }

        const valData = await valRes.json();
        const clientId = valData.client_id;
        const moderatorId = valData.user_id;
        const scopes = valData.scopes || [];

        console.log("[Shoutout API] Token validated successfully.");

        // Check for required scope
        if (!scopes.includes("moderator:manage:shoutouts")) {
            console.warn(`[Shoutout API] WARNING: The oauth token in secret.js is missing the 'moderator:manage:shoutouts' scope.`);
            console.warn(`[Shoutout API] Please regenerate your token at https://twitchtokengenerator.com/ (Select Custom Scope Selection -> select 'moderator:manage:shoutouts') and update your secret.js file!`);
            return;
        }

        // 1.5. Resolve broadcaster ("fboucheros") user ID
        const broadcasterRes = await fetch(`https://api.twitch.tv/helix/users?login=fboucheros`, {
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Client-Id': clientId
            }
        });

        if (broadcasterRes.status !== 200) {
            const errText = await broadcasterRes.text();
            console.error(`[Shoutout API] Broadcaster ID lookup failed: ${broadcasterRes.status} - ${errText}`);
            return;
        }

        const broadcasterData = await broadcasterRes.json();
        if (!broadcasterData.data || broadcasterData.data.length === 0) {
            console.warn("[Shoutout API] Broadcaster fboucheros not found.");
            return;
        }
        const broadcasterId = broadcasterData.data[0].id;

        // 2. Resolve target user ID
        const targetRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(targetUsername)}`, {
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Client-Id': clientId
            }
        });

        if (targetRes.status !== 200) {
            const errText = await targetRes.text();
            console.error(`[Shoutout API] Target user request failed with status ${targetRes.status}: ${errText}`);
            return;
        }

        const targetData = await targetRes.json();
        if (!targetData.data || targetData.data.length === 0) {
            console.warn(`[Shoutout API] Target user ${targetUsername} not found.`);
            return;
        }
        const targetId = targetData.data[0].id;

        // 3. Trigger the Shoutout!
        console.log(`[Shoutout API] Triggering Helix shoutout from channel to @${targetUsername}...`);
        const shoutoutRes = await fetch(`https://api.twitch.tv/helix/chat/shoutouts?from_broadcaster_id=${broadcasterId}&to_broadcaster_id=${targetId}&moderator_id=${moderatorId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Client-Id': clientId
            }
        });

        if (shoutoutRes.status === 204) {
            console.log("[Shoutout API] Helix shoutout triggered successfully (204 No Content).");
        } else {
            const errText = await shoutoutRes.text();
            console.error(`[Shoutout API] Helix shoutout failed with status ${shoutoutRes.status}: ${errText}`);
        }
    } catch (err) {
        console.error("[Shoutout API] Error sending Helix shoutout:", err);
    }
}

app.post('/api/chat-event', async (req, res) => {
    const { username } = req.body || {};
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername) return res.status(400).json({ error: 'Missing username.' });

    try {
        // 1. Register the participant
        await db.registerParticipant(cleanUsername);

        // 2. Check if there's an active session
        const session = await db.getActiveSession();
        if (!session) {
            return res.json({ shouldGreet: false });
        }

        // Track message count for this user in the active session
        if (!sessionMessageCounts.has(session.id)) {
            sessionMessageCounts.set(session.id, new Map());
        }
        const userCounts = sessionMessageCounts.get(session.id);
        const currentCount = (userCounts.get(cleanUsername) || 0) + 1;
        userCounts.set(cleanUsername, currentCount);

        let shouldShoutout = false;
        let shoutoutMessage = "";
        let profileImageUrl = "";

        const isRegular = await db.isParticipantRegular(cleanUsername);
        const isStreamer = await db.isParticipantStreamer(cleanUsername);

        if (currentCount === 2 && isRegular && isStreamer) {
            console.log(`User ${cleanUsername} sent their 2nd message and is flagged as regular & streamer. Generating shoutout...`);
            const shoutoutData = await generateShoutoutMessage(cleanUsername);
            if (shoutoutData.success) {
                shoutoutMessage = shoutoutData.shoutoutMessage;
                profileImageUrl = shoutoutData.profileImageUrl;
                shouldShoutout = true;
                triggerTwitchHelixShoutout(cleanUsername).catch(err => console.error("Helix shoutout error:", err));
            }
        }

        // 3. Check if user is flagged as a regular
        if (!isRegular) {
            return res.json({ shouldGreet: false, shouldShoutout, shoutoutMessage, profileImageUrl });
        }

        // 4. Check if they have been greeted in this session
        const alreadyGreeted = await db.hasBeenGreetedInSession(session.id, cleanUsername);
        if (alreadyGreeted) {
            return res.json({ shouldGreet: false, shouldShoutout, shoutoutMessage, profileImageUrl });
        }

        // 5. User is regular and has not been greeted yet in this session. Log it!
        await db.logGreetingEvent(session.id, cleanUsername);

        // 6. Generate the dynamic AI greeting
        const activeConnection = await db.getActiveCeebeeConnection();
        if (!activeConnection) {
            console.warn('Ceebee greeting failed: No active AI connection configured.');
            return res.json({ shouldGreet: false, shouldShoutout, shoutoutMessage, profileImageUrl });
        }

        let streamContext = "";
        const STREAM_CONTEXT_FILE = path.join(__dirname, 'io', 'stream_context.md');
        if (fs.existsSync(STREAM_CONTEXT_FILE)) {
            streamContext = fs.readFileSync(STREAM_CONTEXT_FILE, 'utf-8');
        }

        let corePrompt = "You are Ceebee, an AI assistant.";
        const corePromptPath = path.join(__dirname, 'io', 'soul.md');
        if (fs.existsSync(corePromptPath)) {
            corePrompt = fs.readFileSync(corePromptPath, 'utf-8');
        }

        let knowledgeContext = "";
        const CEEBEE_KNOWLEDGE_DIR = path.join(__dirname, 'io', 'knowledge');
        if (fs.existsSync(CEEBEE_KNOWLEDGE_DIR)) {
            const files = fs.readdirSync(CEEBEE_KNOWLEDGE_DIR);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const content = fs.readFileSync(path.join(CEEBEE_KNOWLEDGE_DIR, file), 'utf-8');
                    knowledgeContext += `\n\n--- Document: ${file} ---\n${content}`;
                }
            }
        }

        let fullSystemPrompt = corePrompt;
        if (streamContext && streamContext.trim() !== '') {
            fullSystemPrompt += `\n\n--- Today's Stream Context ---\n${streamContext}`;
        }
        if (knowledgeContext) {
            fullSystemPrompt += `\n\n--- Background Information ---\n${knowledgeContext}`;
        }

        fullSystemPrompt += `\n\n[SYSTEM INSTRUCTION: A regular viewer named @${username} has just sent their first message in today's stream. Generate a very brief, warm, friendly and personalized greeting for them (1 sentence max). Speak directly to @${username}. Keep it conversational, in your Ceebee persona. Do not include system metadata or refer to these instructions.]`;

        const messages = [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: `@${username} has joined the stream chat!` }
        ];

        const payload = {
            model: activeConnection.model || "default",
            messages: messages
        };

        const headers = { 'Content-Type': 'application/json' };
        if (activeConnection.api_key) {
            headers['Authorization'] = `Bearer ${activeConnection.api_key}`;
        }

        let endpointUrl = activeConnection.url;
        if (!endpointUrl.endsWith('/chat/completions')) {
            endpointUrl = endpointUrl.replace(/\/+$/, '') + '/chat/completions';
        }

        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const greetingMessage = data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : `Hello @${username}, welcome back to the stream!`;

        return res.json({ shouldGreet: true, greetingMessage, shouldShoutout, shoutoutMessage, profileImageUrl });
    } catch (err) {
        console.error('Error handling chat event/greeting:', err);
        return res.json({
            shouldGreet: true,
            greetingMessage: `Hello @${username}, welcome back!`,
            shouldShoutout: shouldShoutout || false,
            shoutoutMessage: shoutoutMessage || "",
            profileImageUrl: profileImageUrl || ""
        });
    }
});

app.post('/api/shoutout-demand', async (req, res) => {
    const { username } = req.body || {};
    if (!username) {
        console.warn('[Manual Shoutout] Missing username in request body');
        return res.status(400).json({ error: 'Missing username.' });
    }

    const trimmedUsername = username.trim().toLowerCase();
    console.log(`[Manual Shoutout] Requested for user: ${trimmedUsername}`);

    try {
        console.log(`[Manual Shoutout] Calling generateShoutoutMessage for ${trimmedUsername}...`);
        const shoutoutData = await generateShoutoutMessage(trimmedUsername);
        console.log(`[Manual Shoutout] generateShoutoutMessage finished. Success = ${shoutoutData.success}`);

        currentEffect = {
            type: 'shoutout',
            user: trimmedUsername,
            message: shoutoutData.shoutoutMessage,
            image: shoutoutData.profileImageUrl || null,
            timestamp: Date.now()
        };

        triggerTwitchHelixShoutout(trimmedUsername).catch(err => console.error("Helix shoutout error:", err));

        console.log(`[Manual Shoutout] Triggered effect:`, currentEffect);
        res.json({ msg: 'Shoutout triggered.', effect: currentEffect });
    } catch (err) {
        console.error('[Manual Shoutout] Error during processing:', err);
        res.status(500).json({ error: 'Failed to generate shoutout: ' + err.message });
    }
});

// ─── Reminders ────────────────────────────────────────────────────────────────

app.get('/api/reminders', async (req, res) => {
    try {
        const session = await db.getActiveSession();
        if (!session) return res.json([]);
        const reminders = await db.getReminders(session.id);
        res.json(reminders);
    } catch (err) {
        console.error('Error getting reminders:', err);
        res.status(500).json({ error: 'Failed to get reminders.' });
    }
});

app.post('/api/reminders', async (req, res) => {
    const { name, interval, message } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Missing name.' });
    try {
        const session = await db.getActiveSession();
        if (!session) return res.status(400).json({ error: 'No active session.' });
        const reminder = await db.addReminder(session.id, name, message || '', 'active', interval || 0);
        res.json(reminder);
    } catch (err) {
        console.error('Error adding reminder:', err);
        res.status(500).json({ error: 'Failed to add reminder.' });
    }
});

app.delete('/api/reminders/:id', async (req, res) => {
    try {
        await db.deleteReminder(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting reminder:', err);
        res.status(500).json({ error: 'Failed to delete reminder.' });
    }
});

// ─── Ceebee ───────────────────────────────────────────────────────────────────

app.get('/api/ceebee/connections', async (req, res) => {
    try {
        const connections = await db.getCeebeeConnections();
        res.json(connections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ceebee/connections', async (req, res) => {
    try {
        const { name, url, model, api_key, is_active } = req.body;
        const connection = await db.addCeebeeConnection(name, url, model, api_key, is_active);
        res.json(connection);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ceebee/connections/:id', async (req, res) => {
    try {
        const { name, url, model, api_key, is_active } = req.body;
        const connection = await db.updateCeebeeConnection(parseInt(req.params.id), name, url, model, api_key, is_active);
        res.json(connection);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ceebee/connections/:id', async (req, res) => {
    try {
        await db.deleteCeebeeConnection(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ceebee/connections/:id/active', async (req, res) => {
    try {
        await db.setActiveCeebeeConnection(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const STREAM_CONTEXT_FILE = path.join(__dirname, 'io', 'stream_context.md');

app.get('/api/ceebee/context', async (req, res) => {
    try {
        let context = "";
        if (fs.existsSync(STREAM_CONTEXT_FILE)) {
            context = fs.readFileSync(STREAM_CONTEXT_FILE, 'utf-8');
        }
        res.json({ context });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ceebee/context', async (req, res) => {
    try {
        const { context } = req.body;
        fs.writeFileSync(STREAM_CONTEXT_FILE, context || "", 'utf-8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── RPG Loot Game ────────────────────────────────────────────────────────────
const lootCooldowns = new Map();

app.get('/api/loot/bag', async (req, res) => {
    const { username } = req.query;
    const cleanUsername = sanitizeUsername(username);
    if (!cleanUsername) return res.status(400).json({ error: 'Missing username.' });
    try {
        const inventory = await db.getInventory(cleanUsername);
        res.json({ success: true, inventory });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/loot/search', async (req, res) => {
    const { username } = req.body;
    const lowerUser = sanitizeUsername(username);
    if (!lowerUser) return res.status(400).json({ error: 'Missing username.' });

    try {
        const settings = await db.getCeebeeSettings();
        if (!settings.game_enabled) {
            return res.json({ success: false, disabled: true, message: 'The RPG loot game is currently disabled by the streamer.' });
        }

        const now = Date.now();
        const cooldownTime = 10 * 60 * 1000; // 10 minutes
        if (lootCooldowns.has(lowerUser)) {
            const lastSearch = lootCooldowns.get(lowerUser);
            const elapsed = now - lastSearch;
            if (elapsed < cooldownTime) {
                const remainingMs = cooldownTime - elapsed;
                const remainingMin = Math.ceil(remainingMs / 60000);
                return res.json({ success: false, onCooldown: true, remainingMinutes: remainingMin });
            }
        }

        const items = ['potion', 'shield', 'umbrella', 'rain-stone', 'sun-stone', 'bomb', 'shovel'];
        const rolledItem = items[Math.floor(Math.random() * items.length)];
        const inventory = await db.addInventoryItem(lowerUser, rolledItem);
        lootCooldowns.set(lowerUser, now);

        res.json({ success: true, item: rolledItem, inventory });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/loot/use', async (req, res) => {
    const { username, item } = req.body;
    const lowerUser = sanitizeUsername(username);
    if (!lowerUser || !item) return res.status(400).json({ error: 'Missing username or item.' });

    try {
        const settings = await db.getCeebeeSettings();
        if (!settings.game_enabled) {
            return res.json({ success: false, disabled: true, message: 'The RPG loot game is currently disabled.' });
        }

        const removed = await db.removeInventoryItem(lowerUser, item);
        if (removed) {
            broadcastSSE({ event: 'use_item', user: lowerUser, item });
            res.json({ success: true });
        } else {
            res.json({ success: false, noItem: true, message: `You do not have a ${item} in your inventory.` });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dice/test', (req, res) => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    broadcastSSE({ event: 'dice_roll', d1, d2 });
    res.json({ success: true, d1, d2 });
});

app.post('/api/loot/add-drop-item', async (req, res) => {
    const { username } = req.body;
    const lowerUser = sanitizeUsername(username);
    if (!lowerUser) return res.status(400).json({ error: 'Missing username.' });

    try {
        const settings = await db.getCeebeeSettings();
        if (!settings.game_enabled) {
            return res.json({ success: false, disabled: true });
        }

        if (Math.random() <= 0.25) {
            const items = ['potion', 'shield', 'umbrella', 'rain-stone', 'sun-stone', 'bomb', 'shovel'];
            const rolledItem = items[Math.floor(Math.random() * items.length)];
            const inventory = await db.addInventoryItem(lowerUser, rolledItem);
            return res.json({ success: true, rolled: true, item: rolledItem, inventory });
        }
        res.json({ success: true, rolled: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ceebee/settings', async (req, res) => {
    // console.log('..GET /api/ceebee/settings called');
    try {
        const settings = await db.getCeebeeSettings();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ceebee/settings', async (req, res) => {
    // console.log('..POST /api/ceebee/settings called with:', req.body);
    try {
        const { auto_participate, min_messages, max_messages, game_enabled, dynamic_weather_enabled } = req.body;
        const settings = await db.updateCeebeeSettings(
            auto_participate !== undefined ? !!auto_participate : false,
            parseInt(min_messages, 10) || 10,
            parseInt(max_messages, 10) || 15,
            game_enabled !== undefined ? !!game_enabled : true,
            dynamic_weather_enabled !== undefined ? !!dynamic_weather_enabled : true
        );
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ceebee/chat', async (req, res) => {
    try {
        const { message, user } = req.body;
        if (!message) return res.status(400).json({ error: 'Missing message.' });

        const activeConnection = await db.getActiveCeebeeConnection();
        if (!activeConnection) {
            return res.json({ response: "Error: No active AI connection configured." });
        }

        let streamContext = "";
        if (fs.existsSync(STREAM_CONTEXT_FILE)) {
            streamContext = fs.readFileSync(STREAM_CONTEXT_FILE, 'utf-8');
        }

        let corePrompt = "You are Ceebee, an AI assistant.";
        const corePromptPath = path.join(__dirname, 'io', 'soul.md');
        if (fs.existsSync(corePromptPath)) {
            corePrompt = fs.readFileSync(corePromptPath, 'utf-8');
        }

        // Read knowledge files
        let knowledgeContext = "";
        if (fs.existsSync(CEEBEE_KNOWLEDGE_DIR)) {
            const files = fs.readdirSync(CEEBEE_KNOWLEDGE_DIR);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const content = fs.readFileSync(path.join(CEEBEE_KNOWLEDGE_DIR, file), 'utf-8');
                    knowledgeContext += `\n\n--- Document: ${file} ---\n${content}`;
                }
            }
        }

        let fullSystemPrompt = corePrompt;
        if (streamContext && streamContext.trim() !== '') {
            fullSystemPrompt += `\n\n--- Today's Stream Context ---\n${streamContext}`;
        }
        if (knowledgeContext) {
            fullSystemPrompt += `\n\n--- Background Information ---\n${knowledgeContext}`;
        }

        ceebeeChatHistory.push({ role: 'user', content: `${user ? sanitizeUsername(user) + ' says: ' : ''}${message}` });
        if (ceebeeChatHistory.length > 20) {
            ceebeeChatHistory.shift();
        }

        const messages = [
            { role: 'system', content: fullSystemPrompt },
            ...ceebeeChatHistory
        ];

        const payload = {
            model: activeConnection.model || "default",
            messages: messages
        };

        const headers = { 'Content-Type': 'application/json' };
        if (activeConnection.api_key) {
            headers['Authorization'] = `Bearer ${activeConnection.api_key}`;
        }

        let endpointUrl = activeConnection.url;
        if (!endpointUrl.endsWith('/chat/completions')) {
            endpointUrl = endpointUrl.replace(/\/+$/, '') + '/chat/completions';
        }

        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const aiResponse = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "Error: Invalid response from AI";

        ceebeeChatHistory.push({ role: 'assistant', content: aiResponse });
        if (ceebeeChatHistory.length > 20) {
            ceebeeChatHistory.shift();
        }

        res.json({ response: aiResponse });
    } catch (err) {
        console.error('Error in /api/ceebee/chat:', err);
        res.json({ response: `Error: ${err.message}` });
    }
});

app.post('/api/ceebee/participate', async (req, res) => {
    const { transcript } = req.body;
    console.log('..POST /api/ceebee/participate called with transcript:\n', transcript);
    try {
        if (!transcript) return res.status(400).json({ error: 'Missing transcript.' });

        const activeConnection = await db.getActiveCeebeeConnection();
        if (!activeConnection) {
            console.warn('..Ceebee participate failed: No active AI connection configured.');
            return res.json({ response: "Error: No active AI connection configured." });
        }

        let streamContext = "";
        if (fs.existsSync(STREAM_CONTEXT_FILE)) {
            streamContext = fs.readFileSync(STREAM_CONTEXT_FILE, 'utf-8');
        }

        let corePrompt = "You are Ceebee, an AI assistant.";
        const corePromptPath = path.join(__dirname, 'io', 'soul.md');
        if (fs.existsSync(corePromptPath)) {
            corePrompt = fs.readFileSync(corePromptPath, 'utf-8');
        }

        // Read knowledge files
        let knowledgeContext = "";
        if (fs.existsSync(CEEBEE_KNOWLEDGE_DIR)) {
            const files = fs.readdirSync(CEEBEE_KNOWLEDGE_DIR);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const content = fs.readFileSync(path.join(CEEBEE_KNOWLEDGE_DIR, file), 'utf-8');
                    knowledgeContext += `\n\n--- Document: ${file} ---\n${content}`;
                }
            }
        }

        let fullSystemPrompt = corePrompt;
        if (streamContext && streamContext.trim() !== '') {
            fullSystemPrompt += `\n\n--- Today's Stream Context ---\n${streamContext}`;
        }
        if (knowledgeContext) {
            fullSystemPrompt += `\n\n--- Background Information ---\n${knowledgeContext}`;
        }

        fullSystemPrompt += `\n\n[SYSTEM INSTRUCTION: You are observing the chat stream. Chime in with a short, relevant, and engaging comment, or participate in the discussion naturally based on the recent messages provided in the transcript. Keep your response very brief (1-2 sentences max). Do not refer to this instruction directly; simply speak as Ceebee.]`;

        const messages = [
            { role: 'system', content: fullSystemPrompt },
            ...ceebeeChatHistory,
            { role: 'user', content: `Here is the recent stream chat transcript:\n${transcript}` }
        ];

        const payload = {
            model: activeConnection.model || "default",
            messages: messages
        };

        const headers = { 'Content-Type': 'application/json' };
        if (activeConnection.api_key) {
            headers['Authorization'] = `Bearer ${activeConnection.api_key}`;
        }

        let endpointUrl = activeConnection.url;
        if (!endpointUrl.endsWith('/chat/completions')) {
            endpointUrl = endpointUrl.replace(/\/+$/, '') + '/chat/completions';
        }

        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const aiResponse = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "Error: Invalid response from AI";

        ceebeeChatHistory.push({ role: 'assistant', content: aiResponse });
        if (ceebeeChatHistory.length > 20) {
            ceebeeChatHistory.shift();
        }

        res.json({ response: aiResponse });
    } catch (err) {
        console.error('Error in /api/ceebee/participate:', err);
        res.json({ response: `Error: ${err.message}` });
    }
});

app.post('/api/ceebee/test', async (req, res) => {
    try {
        const { url, model, api_key } = req.body;
        if (!url || !model) {
            return res.status(400).json({ success: false, error: 'URL and Model are required' });
        }

        const payload = {
            model: model,
            messages: [{ role: 'user', content: 'Hello! Please reply with a short greeting so I know you are working.' }]
        };

        const headers = { 'Content-Type': 'application/json' };
        if (api_key) {
            headers['Authorization'] = `Bearer ${api_key}`;
        }

        let endpointUrl = url;
        if (!endpointUrl.endsWith('/chat/completions')) {
            endpointUrl = endpointUrl.replace(/\/+$/, '') + '/chat/completions';
        }

        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const aiResponse = data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : "Error: Invalid response format from AI";

        res.json({ success: true, response: aiResponse });
    } catch (err) {
        console.error('Error testing connection:', err);
        res.json({ success: false, error: err.message });
    }
});

async function startServer() {
    try {
        await db.initDb();
        console.log('Database initialized successfully.');

        app.listen(port, () => {
            console.log(`CloudBot app listening at http://localhost:${port}`);
            console.log(`Admin panel at http://localhost:${port}/admin`);
        });
    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

function createImage(imageName, message) {
    if (!text2png) {
        console.error('createImage: text2png is not available');
        return null;
    }
    try {
        const filePath = path.join(GENERATED_DIR, imageName);
        console.log(`createImage: writing to ${filePath}`);
        const imageData = text2png(message, {
            color: 'white',
            strokeWidth: 1.5,
            strokeColor: 'gray',
            font: '65px sans-serif',
        });
        fs.writeFileSync(filePath, imageData);
        console.log(`createImage: successfully wrote ${imageData.length} bytes to ${filePath}`);
        return filePath;
    } catch (err) {
        console.error('Error in createImage:', err);
        return null;
    }
}

function CleanUpGeneratedImages() {
    const directory = GENERATED_DIR;
    if (!fs.existsSync(directory)) {
        console.log('--> trace: generated folder does not exist.');
        return;
    }
    fs.readdir(directory, (err, files) => {
        if (err) {
            console.error('Error reading generated folder:', err);
            return;
        }
        for (const file of files) {
            if (file === '.gitkeep' || file === 'empty.txt') continue;
            fs.unlink(path.join(directory, file), (err) => {
                if (err) {
                    console.error(`Error deleting file ${file}:`, err);
                }
            });
        }
    });
}

startServer();
