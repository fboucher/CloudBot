const express = require('express');
const path = require('path');
const fs = require('fs');
const dateFormat = require('dateformat');
let text2png;
try {
    text2png = require('text2png');
} catch (e) {
    console.warn('text2png not available, image generation disabled');
}
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
        try {
            createImage(filename, msg);
            res.json({ msg: filename });
        } catch (err) {
            console.error('Error creating image:', err);
            res.status(500).json({ error: 'Failed to create image.' });
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
        try {
            createImage(filename, msg);
            res.json({ msg: filename });
        } catch (err) {
            console.error('Error creating image:', err);
            res.status(500).json({ error: 'Failed to create image.' });
        }
    } else {
        res.status(400).json({ error: 'Missing user or message.' });
    }
});

app.post('/savetofile', async (req, res) => {
    console.log('..saving to database..');
    if (req.body && req.body.streamSession) {
        try {
            const sessionId = req.body.streamSession.Id;
            if (sessionId) {
                await db.saveSessionData(sessionId, req.body.streamSession);
            }
            const data = JSON.stringify(req.body.streamSession, null, 2);
            const filename = path.join(__dirname, 'io', `streamSession_${sessionId}.json`);
            fs.writeFile(filename, data, (err) => {
                if (err) {
                    console.error('Error saving JSON to file:', err);
                }
            });
            console.log('Session data saved to database.');
            res.json({ msg: 'Data is saved.' });
        } catch (err) {
            console.error('Error saving to database:', err);
            res.status(500).json({ error: 'Failed to save data.' });
        }
    } else {
        res.status(400).json({ error: 'No data.' });
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
            const filename = path.join(__dirname, 'io', 'streamSession.json');
            if (fs.existsSync(filename)) {
                const data = fs.readFileSync(filename, 'utf-8');
                const streamSession = JSON.parse(data);
                console.log('No active session, loaded from file.');
                res.json(streamSession);
            } else {
                res.json({
                    Project: "",
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
        const sessionId = await db.startStreamSession(req.body.project);
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

app.get('/api/session', async (req, res) => {
    console.log('..getting active session..');
    try {
        const session = await db.getActiveSession();
        if (session) {
            const sessionData = await db.loadSessionData(session.id);
            res.json({ ...session, data: sessionData });
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
        console.warn('Image generation disabled');
        return;
    }
    const dir = path.join(__dirname, 'public', 'medias', 'generated');
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, imageName);
        fs.writeFileSync(
            filePath,
            text2png(message, {
                color: 'white',
                strokeWidth: 1.5,
                strokeColor: 'gray',
                font: '65px sans-serif',
            })
        );
    } catch (err) {
        console.error('Error in createImage:', err);
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
