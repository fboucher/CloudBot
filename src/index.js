const express = require('express');
const path = require('path');
const fs = require('fs');
const dateFormat = require('dateformat');
const pkg = require('./package.json');
const BUILD_DATE = new Date().toISOString().split('T')[0];
const text2png = require('text2png');
const db = require('./db');
const app = express();
const port = 3000;

app.use('/public', express.static(path.join(__dirname, 'public')));
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

app.post('/Attention', (req, res) => {
    if (req.body && req.body.user && req.body.message) {
        const user = req.body.user;
        const userMsg = req.body.message;
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
    console.log('..loading from database..');
    try {
        const activeSession = await db.getActiveSession();
        if (activeSession) {
            const sessionData = await db.loadSessionData(activeSession.id);
            console.log('Session data loaded from database:', activeSession.id);
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
        const sessionId = await db.startStreamSession(req.body.project, req.body.title || "");
        const counter = await db.incrementStreamCounter();
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
    console.log('..getting all sessions..');
    try {
        const sessions = await db.getAllSessions();
        res.json(sessions);
    } catch (err) {
        console.error('Error getting sessions:', err);
        res.status(500).json({ error: 'Failed to get sessions.' });
    }
});

app.get('/api/session/:id', async (req, res) => {
    console.log('..getting session by id..');
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
async function generateAndSaveShowNotes(sessionId) {
    const s = await db.loadSessionData(sessionId);
    if (!s) throw new Error(`Session ${sessionId} not found`);

    const date = s.DateTimeStart ? s.DateTimeStart.split('T')[0] : new Date().toISOString().split('T')[0];
    const title = s.Title && s.Title.trim() ? s.Title : `_____ (stream ${sessionId})`;

    // ── Front matter ──────────────────────────────────────────────────────────
    let md = `---\nlayout: post\ntitle: ${title}\n`;
    md += `featured-image: https://img.youtube.com/vi/_________/hqdefault.jpg\n`;
    md += `date: ${date}  06:30 -0500\n`;
    md += `categories:  ${s.Project}\n---\n\n## Summary\n\n\n\n`;
    md += `📺 - Twitch archive - stream no. ${sessionId}\n\n`;
    md += `\n## Replay\n\n{% include youtube.html id="_________" %}\n\n`;
    md += `<br/><!--more-->\n`;

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
                const bold  = t.status === 'inProgress' ? '**' : '';
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

    if (s.Raiders.length > 0) {
        md += `\n### Raids\n\n`;
        s.Raiders.forEach(r => { md += `- [@${r.user}](https://www.twitch.tv/${r.user}) has raided you with a party of ${r.viewers}\n`; });
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
            if (u.dropCount > maxDrop)  { maxDrop = u.dropCount;  superParticipant = u; }
            if (u.bestHighScore == 0 && u.dropCount > maxDropLoser) { maxDropLoser = u.dropCount; biggestLoser = u; }
        });
        s.UserSession.forEach(u => {
            if (u.highScore === maxScore && u.dropCount < minDropForMaxScore) {
                minDropForMaxScore = u.dropCount; luckiest = u;
            }
        });

        md += `\n#### Statistics\n\n`;
        if (bestScoreUser)   md += `- 🏆Best score: [@${bestScoreUser.user}](https://www.twitch.tv/${bestScoreUser.user}) with ${bestScoreUser.highScore}\n`;
        if (biggestLoser)    md += `- 😭Biggest loser: [@${biggestLoser.user}](https://www.twitch.tv/${biggestLoser.user}) with ${biggestLoser.dropCount} drops and no high score\n`;
        if (luckiest)        md += `- 🍀Luckiest: [@${luckiest.user}](https://www.twitch.tv/${luckiest.user}) with best score ${luckiest.highScore} and only ${luckiest.dropCount} drops\n`;
        if (superParticipant) md += `- 🎖️Super participant: [@${superParticipant.user}](https://www.twitch.tv/${superParticipant.user}) with ${superParticipant.dropCount} drops\n`;
    }

    // ── Notes / References ────────────────────────────────────────────────────
    if (s.Notes.length > 0) {
        md += `\n### Notes/ References / Snippets\n\n`;
        s.Notes.forEach(n => { md += `- ${n}\n`; });
    }

    // ── Reminders (for record-keeping) ────────────────────────────────────────
    if (s.Reminders.length > 0) {
        md += `\n### Reminders\n\n`;
        s.Reminders.forEach(r => { md += `- **${r.Name}**: ${r.Message}\n`; });
    }

    const filename = `${date}-${sessionId}-${s.Project}.md`;
    const ioDir = path.join(__dirname, 'io');
    fs.mkdirSync(ioDir, { recursive: true });
    const filepath = path.join(ioDir, filename);
    fs.writeFileSync(filepath, md, 'utf8');

    return { filename, content: md, filepath };
}

app.get('/api/export', async (req, res) => {
    try {
        let session = null;
        const { sessionId } = req.query;

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

        const { filename, content } = await generateAndSaveShowNotes(session.id);
        
        console.log(`Export saved to src/io/${filename}`);
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/markdown');
        res.send(content);
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
        const sessionId = await db.startStreamSession(projectName, streamTitle || '', projectUrl || '');
        const counter = await db.incrementStreamCounter();
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
        await db.upsertUser(session.id, username, { dropCount, landedCount, highScore, bestHighScore });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    const dir = path.join(__dirname, 'public', 'medias', 'generated');
    try {
        if (!fs.existsSync(dir)) {
            console.log(`createImage: creating directory ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, imageName);
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
    const directory = path.join(__dirname, 'public', 'medias', 'generated');
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
