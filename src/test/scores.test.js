const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server;
let tmpDir;
let base;
let db;
let app;
let sessionId;

before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbot-scores-test-'));
    process.env.CLOUDBOT_DB_PATH = path.join(tmpDir, 'cloudbot.db');
    process.env.CLOUDBOT_GENERATED_DIR = path.join(tmpDir, 'generated');
    db = require('../db');
    await db.initDb();
    sessionId = await db.startStreamSession('Score test');
    app = require('../index').app;
    await new Promise(resolve => {
        server = app.listen(0, () => {
            base = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

after(async () => {
    if (server) {
        server.closeAllConnections?.();
        await new Promise(resolve => server.close(resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

const post = (url, body) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

test('score submissions reject invalid values and stored scores are numeric and descending', async () => {
    const invalid = await post('/api/users/score', {
        username: 'bad-score',
        highScore: 'an',
        bestHighScore: 'an'
    });
    assert.equal(invalid.status, 400);

    for (const [username, score] of [['lower', 46.02], ['higher', 94.33]]) {
        const response = await post('/api/users/score', {
            username,
            dropCount: 1,
            landedCount: 1,
            highScore: score,
            bestHighScore: score
        });
        assert.equal(response.status, 200);
    }

    const client = await db.getClient();
    await client.prepare(
        `INSERT INTO users (session_id, username, drop_count, landed_count, high_score, best_high_score)
         VALUES (?, ?, 0, 0, ?, ?)`
    ).run(sessionId, 'legacy', 'an', 'an');
    await db.initDb();

    const usersResponse = await fetch(base + '/api/users');
    const users = await usersResponse.json();
    assert.equal(usersResponse.status, 200, JSON.stringify(users));
    assert.ok(Array.isArray(users), JSON.stringify(users));
    assert.deepEqual(users.map(user => user.username), ['higher', 'lower', 'legacy']);
    assert.deepEqual(users.map(user => user.high_score), [94.33, 46.02, 0]);
    assert.deepEqual(users.map(user => user.best_high_score), [94.33, 46.02, 0]);
});
