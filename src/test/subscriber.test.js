const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

describe('subscriber category and greeting', () => {
    let server;
    let base;
    let tmpDir;
    let db;
    let aiServer;
    let aiUrl;
    let lastAiPrompt = '';
    let failAi = false;
    let dungeon;
    const ioDir = path.join(__dirname, '..', 'io');
    let ioFilesBefore;

    function stopServer(s) {
        if (!s) return Promise.resolve();
        s.closeAllConnections?.();
        return new Promise(resolve => s.close(() => resolve()));
    }

    before(async () => {
        ioFilesBefore = new Set(fs.existsSync(ioDir) ? fs.readdirSync(ioDir) : []);
        // Setup mock AI server
        const aiApp = express();
        aiApp.use(express.json());
        aiApp.post('/chat/completions', (req, res) => {
            if (failAi) {
                return res.status(500).json({ error: 'AI service unavailable' });
            }
            const systemMsg = (req.body.messages || []).find(m => m.role === 'system');
            lastAiPrompt = systemMsg ? systemMsg.content : '';
            res.json({
                choices: [{
                    message: {
                        content: `AI greeting for ${req.body.messages?.[1]?.content || 'user'}`
                    }
                }]
            });
        });
        await new Promise(resolve => {
            aiServer = aiApp.listen(0, () => {
                aiUrl = `http://127.0.0.1:${aiServer.address().port}`;
                resolve();
            });
        });

        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbot-sub-test-'));
        process.env.CLOUDBOT_DB_PATH = path.join(tmpDir, 'cloudbot.db');
        process.env.CLOUDBOT_GENERATED_DIR = path.join(tmpDir, 'generated');
        db = require('../db');
        await db.initDb();

        // Configure an active AI connection pointing to mock AI
        await db.addCeebeeConnection('Mock AI', aiUrl, 'gpt-mock', 'key123', 1);

        const loaded = require('../index');
        dungeon = loaded.dungeon;
        await new Promise(resolve => {
            server = loaded.app.listen(0, () => {
                base = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });
    });

    after(async () => {
        await post('/api/stream/stop', {}).catch(() => {});
        dungeon?.stopRelay?.();
        await stopServer(server);
        await stopServer(aiServer);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        for (const file of fs.readdirSync(ioDir)) {
            if (!ioFilesBefore.has(file) && file.endsWith('.md')) fs.rmSync(path.join(ioDir, file));
        }
    });

    const post = (url, body) => fetch(base + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(r => r.json());

    const get = (url) => fetch(base + url).then(r => r.json());

    test('db handles participant subscriber status and stats query', async () => {
        assert.equal(await db.isParticipantSubscriber('charlie'), false);
        await db.setParticipantSubscriberStatus('charlie', true);
        assert.equal(await db.isParticipantSubscriber('charlie'), true);

        const participants = await db.getAllParticipantsWithStats();
        const charlie = participants.find(p => p.username === 'charlie');
        assert.ok(charlie, 'charlie found in participants');
        assert.equal(charlie.is_subscriber, 1);

        await db.setParticipantSubscriberStatus('charlie', false);
        assert.equal(await db.isParticipantSubscriber('charlie'), false);
    });

    test('POST /api/participants/subscriber toggles subscriber status', async () => {
        const res = await post('/api/participants/subscriber', { username: 'diana', isSubscriber: true });
        assert.deepEqual(res, { success: true });
        assert.equal(await db.isParticipantSubscriber('diana'), true);

        const list = await get('/api/participants');
        const diana = list.find(p => p.username === 'diana');
        assert.ok(diana);
        assert.equal(diana.is_subscriber, 1);

        await post('/api/participants/subscriber', { username: 'diana', isSubscriber: false });
        assert.equal(await db.isParticipantSubscriber('diana'), false);
    });

    test('chat-event ignores regular users who are neither regular nor subscriber', async () => {
        // Start an active stream session so greetings are eligible
        await post('/api/stream/start', { projectName: 'TestStream' });

        const reply = await post('/api/chat-event', { username: 'random_viewer', text: 'hi all' });
        assert.equal(reply.shouldGreet, false);
    });

    test('chat-event greets subscriber with special instructions and sets isSubscriber flag', async () => {
        // Mark user as subscriber
        await db.setParticipantSubscriberStatus('sub_viewer', true);

        const reply = await post('/api/chat-event', { username: 'sub_viewer', text: 'hello streamer' });
        assert.equal(reply.shouldGreet, true);
        assert.equal(reply.isSubscriber, true);
        assert.ok(lastAiPrompt.includes('channel subscriber'), 'AI prompt should specify channel subscriber');
        assert.ok(lastAiPrompt.includes('supporting the channel'), 'AI prompt should request thanking/celebrating subscriber');

        // Second message in same session does not greet again
        const secondReply = await post('/api/chat-event', { username: 'sub_viewer', text: 'another message' });
        assert.equal(secondReply.shouldGreet, false);
    });

    test('chat-event auto-detects and persists subscriber from chat event isSubscriber flag', async () => {
        assert.equal(await db.isParticipantSubscriber('twitch_sub'), false);

        const reply = await post('/api/chat-event', { username: 'twitch_sub', text: 'hype!', isSubscriber: true });
        assert.equal(reply.shouldGreet, true);
        assert.equal(reply.isSubscriber, true);
        assert.equal(await db.isParticipantSubscriber('twitch_sub'), true);
    });

    test('chat-event regular viewer gets standard greeting', async () => {
        await db.setParticipantRegularStatus('regular_only', true);

        const reply = await post('/api/chat-event', { username: 'regular_only', text: 'hello' });
        assert.equal(reply.shouldGreet, true);
        assert.equal(reply.isSubscriber, false);
        assert.ok(lastAiPrompt.includes('regular viewer'), 'AI prompt should specify regular viewer');
    });

    test('fallback greeting for subscriber when AI fails has subscriber message', async () => {
        failAi = true;
        await db.setParticipantSubscriberStatus('sub_fallback', true);
        const reply = await post('/api/chat-event', { username: 'sub_fallback', text: 'hey' });
        failAi = false;
        assert.equal(reply.shouldGreet, true);
        assert.equal(reply.isSubscriber, true);
        assert.ok(reply.greetingMessage.includes('subscribing and supporting the channel'));
    });
});
