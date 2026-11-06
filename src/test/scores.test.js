const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

describe('Score parsing, sanitization, and sorting (issue #89)', () => {
    let server;
    let base;
    let tmpDir;
    let db;
    let cloudbotSandbox;

    function stopServer(s) {
        if (!s) return Promise.resolve();
        s.closeAllConnections?.();
        return new Promise(resolve => s.close(() => resolve()));
    }

    before(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbot-scores-test-'));
        process.env.CLOUDBOT_DB_PATH = path.join(tmpDir, 'cloudbot.db');
        process.env.CLOUDBOT_GENERATED_DIR = path.join(tmpDir, 'generated');

        db = require('../db');
        await db.initDb();

        const loaded = require('../index');
        await new Promise(resolve => {
            server = loaded.app.listen(0, () => {
                base = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });

        // Setup a browser-like sandbox to load cloudbot.js functions
        const cloudbotCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'cloudbot.js'), 'utf8');
        cloudbotSandbox = {
            console: { log: () => {}, warn: () => {}, error: () => {} },
            Date: Date,
            Math: Math,
            Number: Number,
            parseInt: parseInt,
            parseFloat: parseFloat,
            isNaN: isNaN,
            _streamSession: {
                UserSession: [],
                NewFollowers: []
            },
            fetch: async () => ({ json: async () => ({ success: true }) }),
            document: {
                querySelector: () => ({ innerText: '', innerHTML: '' }),
                getElementById: () => null
            },
            setTimeout: () => {},
            clean: () => {},
            cloud: () => {},
            playSound: () => {},
            displayAnnouncement: () => {},
            SaveToFile: () => {}
        };
        vm.createContext(cloudbotSandbox);
        vm.runInContext(cloudbotCode, cloudbotSandbox);
    });

    after(async () => {
        await stopServer(server);
        if (db && db.closeDb) await db.closeDb();
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) {}
    });

    test('compareHightScore and compareBestHightScore sort in decreasing order and handle invalid values', () => {
        const { compareHightScore, compareBestHightScore } = cloudbotSandbox;
        assert.equal(typeof compareHightScore, 'function');
        assert.equal(typeof compareBestHightScore, 'function');

        const users = [
            { user: 'fboucheros', highScore: 46.02, bestHighScore: 46.02 },
            { user: 'jtsom', highScore: 0, bestHighScore: 0 },
            { user: 'surlydev', highScore: 'an', bestHighScore: 'an' },
            { user: 'tetedampoule66', highScore: 94.33, bestHighScore: 94.33 },
            { user: 'mcnets', highScore: '56.93', bestHighScore: '56.93' },
            { user: 'moehdev', highScore: 0.69, bestHighScore: 0.69 }
        ];

        users.sort(compareHightScore);

        const scores = users.map(u => Number(u.highScore) || 0);
        // Should be sorted decreasing: 94.33, 56.93, 46.02, 0.69, 0, 0
        assert.deepEqual(scores, [94.33, 56.93, 46.02, 0.69, 0, 0]);
        assert.equal(users[0].user, 'tetedampoule66');
        assert.equal(users[1].user, 'mcnets');
        assert.equal(users[2].user, 'fboucheros');
        assert.equal(users[3].user, 'moehdev');

        // Best high score sort check
        users.sort(compareBestHightScore);
        const bestScores = users.map(u => Number(u.bestHighScore) || 0);
        assert.deepEqual(bestScores, [94.33, 56.93, 46.02, 0.69, 0, 0]);
    });

    test('ParseMessage strictly matches "landed for <score>" and rejects Ceebee loot announcements', () => {
        const { ParseMessage, _streamSession } = cloudbotSandbox;

        _streamSession.UserSession = [];

        // 1. Valid landed message
        ParseMessage('fboucheros landed for 86.60!');
        assert.equal(_streamSession.UserSession.length, 1);
        assert.equal(_streamSession.UserSession[0].user, 'fboucheros');
        assert.equal(_streamSession.UserSession[0].highScore, 86.60);
        assert.equal(_streamSession.UserSession[0].landedCount, 1);

        // 2. Ceebee item loot announcement that previously caused score = "an"
        ParseMessage('@surlydev landed successfully and discovered a 🧪 Potion!');
        // surlydev should NOT have been added or treated as landed with score "an"
        const surly = _streamSession.UserSession.find(u => u.user === 'surlydev');
        assert.equal(surly, undefined);

        // 3. Invalid non-numeric scores
        ParseMessage('baduser landed for an amazing score!');
        const badUser = _streamSession.UserSession.find(u => u.user === 'baduser');
        assert.equal(badUser, undefined);

        // 4. Valid landed message with @ and no exclamation
        ParseMessage('@stoney_eagle landed for 42.50');
        const stoney = _streamSession.UserSession.find(u => u.user === 'stoney_eagle');
        assert.ok(stoney);
        assert.equal(stoney.highScore, 42.50);
        assert.equal(typeof stoney.highScore, 'number');
    });

    test('UserLanded ignores non-numeric score strings', () => {
        const { UserLanded, _streamSession } = cloudbotSandbox;

        _streamSession.UserSession = [
            { user: 'tester', dropCount: 5, landedCount: 1, highScore: 50.0, bestHighScore: 50.0 }
        ];

        // Attempting to pass "an" or NaN should do nothing
        UserLanded('tester', 'an');
        assert.equal(_streamSession.UserSession[0].highScore, 50.0);
        assert.equal(_streamSession.UserSession[0].landedCount, 1); // landedCount should not increment on invalid score

        UserLanded('tester', NaN);
        assert.equal(_streamSession.UserSession[0].highScore, 50.0);

        // Valid new high score
        UserLanded('tester', '75.25');
        assert.equal(_streamSession.UserSession[0].highScore, 75.25);
        assert.equal(_streamSession.UserSession[0].bestHighScore, 75.25);
        assert.equal(_streamSession.UserSession[0].landedCount, 2);
    });

    test('loadUserSessions cleans non-numeric scores on load', () => {
        const { loadUserSessions } = cloudbotSandbox;

        const rawData = [
            { user: '@surlydev', highScore: 'an', bestHighScore: 'an', dropCount: 3, landedCount: 1 },
            { user: 'surlydev', highScore: 45.0, bestHighScore: 45.0, dropCount: 2, landedCount: 1 }
        ];

        const merged = loadUserSessions(rawData);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].user, 'surlydev');
        assert.equal(merged[0].highScore, 45.0);
        assert.equal(merged[0].bestHighScore, 45.0);
        assert.equal(merged[0].dropCount, 5);
        assert.equal(merged[0].landedCount, 2);
        assert.equal(typeof merged[0].highScore, 'number');
    });

    test('db.mergeUserScores safely handles invalid scores without producing NaN', () => {
        const input = [
            { user: '@fboucheros', highScore: 46.02, bestHighScore: 46.02, dropCount: 2, landedCount: 1 },
            { user: 'surlydev', highScore: 'an', bestHighScore: 'an', dropCount: 1, landedCount: 1 },
            { user: 'surlydev', highScore: '25.5', bestHighScore: '25.5', dropCount: 1, landedCount: 0 }
        ];

        const output = db.mergeUserScores(input);
        assert.equal(output.length, 2);

        const surly = output.find(u => u.user === 'surlydev');
        assert.ok(surly);
        assert.equal(surly.highScore, 25.5);
        assert.equal(surly.bestHighScore, 25.5);
        assert.equal(surly.dropCount, 2);
        assert.equal(surly.landedCount, 1);
        assert.equal(Number.isNaN(surly.highScore), false);
    });

    test('POST /api/users/score sanitizes non-numeric scores and getSessionUsers orders descending', async () => {
        // Start a stream session
        const startRes = await fetch(`${base}/api/stream/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName: 'ScoreTest' })
        });
        const startData = await startRes.json();
        assert.ok(startData.sessionId);

        // Post score with "an"
        const postRes1 = await fetch(`${base}/api/users/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'surlydev',
                dropCount: 3,
                landedCount: 1,
                highScore: 'an',
                bestHighScore: 'an'
            })
        });
        assert.equal(postRes1.status, 200);

        // Post normal scores
        await fetch(`${base}/api/users/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'fboucheros',
                dropCount: 4,
                landedCount: 2,
                highScore: 46.02,
                bestHighScore: 46.02
            })
        });

        await fetch(`${base}/api/users/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'tetedampoule66',
                dropCount: 5,
                landedCount: 3,
                highScore: 94.33,
                bestHighScore: 94.33
            })
        });

        const usersRes = await fetch(`${base}/api/users`);
        const users = await usersRes.json();

        assert.equal(users.length, 3);
        // Check order is descending
        assert.equal(users[0].username, 'tetedampoule66');
        assert.equal(users[0].best_high_score, 94.33);
        assert.equal(users[1].username, 'fboucheros');
        assert.equal(users[1].best_high_score, 46.02);
        assert.equal(users[2].username, 'surlydev');
        assert.equal(users[2].high_score, 0); // sanitized from "an" to 0
        assert.equal(users[2].best_high_score, 0);
    });
});
