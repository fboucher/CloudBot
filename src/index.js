// index.js - Main server file for CloudBot
// Provides API endpoints for chat bot features, file storage, and image generation
// Uses Express.js and Node.js best practices for stability and reliability

const express = require('express');
const path = require('path');
const fs = require('fs');
const dateFormat = require('dateformat');
const text2png = require('text2png');
const app = express();
const port = 3000;

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/io', express.static(path.join(__dirname, 'io')));
app.use(express.json());

// Root route: serve main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './public/', 'index.html'));
});

// POST /Hello: Generate a hello image for a user
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

// POST /Attention: Generate an attention image for a user message
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

// POST /savetofile: Save stream session data to a file
app.post('/savetofile', (req, res) => {
    console.log('..s.');
    if (req.body && req.body.streamSession) {
        const data = JSON.stringify(req.body.streamSession, null, 2);
        const filename = path.join(__dirname, 'io', `streamSession_${req.body.streamSession.Id}.json`);
        fs.writeFile(filename, data, (err) => {
            if (err) {
                console.error('Error saving JSON:', err);
                return res.status(500).json({ error: 'Failed to save data.' });
            }
            console.log('JSON data is saved.');
            res.json({ msg: 'Data is saved.' });
        });
    } else {
        res.status(400).json({ error: 'No data.' });
    }
});

// GET /loadfromfile: Load stream session data from a file
app.get('/loadfromfile', (req, res) => {
    console.log('..loading from file..');
    const filename = path.join(__dirname, 'io', 'streamSession.json');
    fs.readFile(filename, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error loading JSON:', err);
            return res.status(500).json({ error: 'Failed to load data.' });
        }
        try {
            const streamSession = JSON.parse(data);
            console.log('JSON data is load.');
            res.json(streamSession);
        } catch (parseErr) {
            console.error('Error parsing JSON:', parseErr);
            res.status(500).json({ error: 'Corrupted data file.' });
        }
    });
});

// GET /getstreamcounter: Get the current stream counter
app.get('/getstreamcounter', (req, res) => {
    console.log('..getting stream counter..');
    const filename = path.join(__dirname, 'io', 'streamCounter.json');
    fs.readFile(filename, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error loading counter:', err);
            return res.status(500).json({ error: 'Failed to load counter.' });
        }
        try {
            const counter = JSON.parse(data);
            console.log('Stream counter loaded:', counter);
            res.json(counter);
        } catch (parseErr) {
            console.error('Error parsing counter JSON:', parseErr);
            res.status(500).json({ error: 'Corrupted counter file.' });
        }
    });
});

// POST /incrementstreamcounter: Increment and save the stream counter
app.post('/incrementstreamcounter', (req, res) => {
    console.log('..incrementing stream counter..');
    const filename = path.join(__dirname, 'io', 'streamCounter.json');
    
    // Read current counter
    fs.readFile(filename, 'utf-8', (err, data) => {
        let counter;
        if (err) {
            // If file doesn't exist, create with default values
            console.log('Counter file not found, creating new one');
            counter = { currentStreamNumber: 1, lastStreamDate: new Date().toISOString().split('T')[0] };
        } else {
            try {
                counter = JSON.parse(data);
            } catch (parseErr) {
                console.error('Error parsing counter:', parseErr);
                return res.status(500).json({ error: 'Corrupted counter file.' });
            }
        }
        
        // Increment the counter
        counter.currentStreamNumber++;
        counter.lastStreamDate = new Date().toISOString().split('T')[0];
        
        // Save back to file
        fs.writeFile(filename, JSON.stringify(counter, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error saving counter:', writeErr);
                return res.status(500).json({ error: 'Failed to save counter.' });
            }
            console.log('Stream counter incremented to:', counter.currentStreamNumber);
            res.json(counter);
        });
    });
});

// POST /genstreamnotes: Save stream notes to a markdown file
app.post('/genstreamnotes', (req, res) => {
    console.log('..g.');
    if (!req.body || !req.body.project || !req.body.id || !req.body.notes) {
        return res.status(400).json({ error: 'Missing project, id, or notes.' });
    }
    const filename = path.join(
        __dirname,
        'io',
        `${dateFormat(new Date(), 'yyyy-mm-dd')} - ${req.body.id} - ${req.body.project}.md`
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

// Start the server
app.listen(port, () => {
    console.log(`CloudBot app listening at http://localhost:${port}`);
});

/**
 * createImage - Generates a PNG image with the given message and saves it to disk
 * @param {string} imageName - The filename for the image
 * @param {string} message - The text to render in the image
 */
function createImage(imageName, message) {
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
        throw err;
    }
}

/**
 * CleanUpGeneratedImages - Deletes all files in the generated images directory
 * to keep the folder clean after notes are generated.
 */
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
            // Do not delete .gitkeep or empty.txt or other important files
            if (file === '.gitkeep' || file === 'empty.txt') continue;
            fs.unlink(path.join(directory, file), (err) => {
                if (err) {
                    console.error(`Error deleting file ${file}:`, err);
                }
            });
        }
    });
}