// Chatacombs adapter tests, run against a stub Chatacombs service: `npm test` (from src/)
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const { createDungeon, mapGameMoment, d20ToTwoD6, parseSseFrame } = require('../dungeon');

const API_KEY = 'test-bot-secret';
const quietLogger = { log() {}, warn() {}, error() {} };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function until(check, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const value = check();
        if (value) return value;
        await wait(10);
    }
    throw new Error('Timed out waiting for condition');
}

// A tiny stand-in for Chatacombs: records what it receives and can push SSE events
function startStub() {
    const stub = { messages: [], streams: [], eventClients: new Set(), eventConnections: 0, failMessages: false };
    const app = express();
    app.use(express.json());
    const auth = (req, res, next) => {
        if (req.headers.authorization !== `Bearer ${API_KEY}`) return res.status(401).json({ error: 'Unauthorized' });
        next();
    };
    app.post('/api/v1/channels/:channel/messages', auth, (req, res) => {
        if (stub.failMessages) return res.status(500).json({ error: 'boom' });
        stub.messages.push({ channel: req.params.channel, body: req.body });
        res.status(202).json({ status: 'accepted' });
    });
    app.post('/api/v1/channels/:channel/stream', auth, (req, res) => {
        stub.streams.push({ channel: req.params.channel, body: req.body });
        // Like Chatacombs: the adventure status after the change overrides 'ok'
        res.json({ status: 'ok', state: req.body.state, changed: true, ...(req.body.state === 'ended' ? { status: 'abandoned' } : { status: 'voting' }) });
    });
    app.get('/api/v1/channels/:channel/events', auth, (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.flushHeaders();
        stub.eventConnections++;
        stub.eventClients.add(res);
        req.on('close', () => stub.eventClients.delete(res));
    });
    stub.send = (event) => {
        const name = event.kind === 'say' ? 'say' : event.type;
        for (const res of stub.eventClients) res.write(`event: ${name}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    stub.raw = (text) => { for (const res of stub.eventClients) res.write(text); };
    stub.dropAll = () => { for (const res of stub.eventClients) res.destroy(); stub.eventClients.clear(); };
    return new Promise(resolve => {
        stub.server = app.listen(0, () => {
            stub.url = `http://127.0.0.1:${stub.server.address().port}`;
            resolve(stub);
        });
    });
}

function stopServer(server) {
    server.closeAllConnections?.();
    return new Promise(resolve => server.close(resolve));
}

describe('game moment mapping', () => {
    test('maps the six moments onto existing effects with payload values', () => {
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'player_healed', user: 'bob', target: 'alice', amount: 7 }),
            { effect: 'potion', user: 'alice', amount: 7 });
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'dice_roll', user: 'alice', displayName: 'Alice', roll: 20 }),
            { effect: 'dice', d1: 6, d2: 6, user: 'Alice' });
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'rare_loot', user: 'bob', gold: 5, item: 'Moon Blade' }),
            { effect: 'cloud', expression: 'Wow', note: 'bob found Moon Blade!' });
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'rare_loot', user: 'bob', gold: 12, item: null }),
            { effect: 'cloud', expression: 'Wow', note: 'bob found 12 gold!' });
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'monster_defeated', monster: 'Goblin' }),
            { effect: 'cloud', expression: 'Tada', sound: 'applause', note: 'Goblin was defeated!' });
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'boss_appears', monster: 'Lich King' }),
            { effect: 'thunderstorm', note: 'Lich King appears!' });
        assert.deepEqual(mapGameMoment({ kind: 'game', type: 'dungeon_cleared', theme: 'haunted house' }),
            { effect: 'sunshine', expression: 'Yeah', sound: 'yeah', note: 'Dungeon cleared: haunted house!' });
    });

    test('ignores unknown or malformed moments', () => {
        assert.equal(mapGameMoment({ kind: 'game', type: 'room_entered' }), null);
        assert.equal(mapGameMoment(null), null);
        assert.equal(mapGameMoment('nope'), null);
    });

    test('scales a d20 onto two d6 keeping crits and fails', () => {
        assert.deepEqual(d20ToTwoD6(1), { d1: 1, d2: 1 });
        assert.deepEqual(d20ToTwoD6(20), { d1: 6, d2: 6 });
        for (let r = 1; r <= 20; r++) {
            const { d1, d2 } = d20ToTwoD6(r);
            assert.ok(d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6, `roll ${r}`);
        }
    });

    test('parses SSE frames and skips keep-alives and junk', () => {
        assert.deepEqual(parseSseFrame('event: say\ndata: {"kind":"say","text":"hi"}'), { kind: 'say', text: 'hi' });
        assert.equal(parseSseFrame(': keep-alive'), null);
        assert.equal(parseSseFrame('data: {not json'), null);
    });
});

describe('dungeon adapter against a stub Chatacombs', () => {
    let stub;
    let settings;
    let broadcasts;
    let dungeon;

    before(async () => { stub = await startStub(); });
    after(async () => { dungeon?.stopRelay(); await stopServer(stub.server); });

    let live = false;
    const fresh = (overrides = {}) => {
        live = false;
        settings = { dungeon_enabled: 1, dungeon_url: stub.url + '/', dungeon_api_key: API_KEY, dungeon_channel: 'MyChannel', ...overrides };
        broadcasts = [];
        stub.messages.length = 0;
        stub.streams.length = 0;
        dungeon?.stopRelay();
        dungeon = createDungeon({
            getSettings: async () => settings,
            broadcast: (p) => broadcasts.push(p),
            isStreamLive: async () => live,
            logger: quietLogger,
            reconnectMinMs: 50,
            reconnectMaxMs: 200
        });
    };

    test('forwards a chat line with payload and bearer auth when enabled', async () => {
        fresh();
        const ok = await dungeon.forwardChat({ user: 'alice', displayName: 'Alice', text: '!explore', isBroadcaster: false });
        assert.equal(ok, true);
        assert.deepEqual(stub.messages, [{ channel: 'mychannel', body: { user: 'alice', displayName: 'Alice', text: '!explore', isBroadcaster: false } }]);
    });

    test('sends nothing when disabled or not configured', async () => {
        for (const overrides of [{ dungeon_enabled: 0 }, { dungeon_url: '' }, { dungeon_api_key: '' }, { dungeon_channel: '' }]) {
            fresh(overrides);
            assert.equal(await dungeon.forwardChat({ user: 'alice', text: 'hi' }), false);
            assert.equal(await dungeon.setStream('started'), false);
            assert.equal(await dungeon.reconcile(), false);
        }
        assert.equal(stub.messages.length, 0);
        assert.equal(stub.streams.length, 0);
    });

    test('a failing or unreachable service is silent', async () => {
        fresh();
        stub.failMessages = true;
        assert.equal(await dungeon.forwardChat({ user: 'alice', text: 'hi' }), false);
        stub.failMessages = false;
        fresh({ dungeon_url: 'http://127.0.0.1:1' });
        assert.equal(await dungeon.forwardChat({ user: 'alice', text: 'hi' }), false);
        assert.equal(await dungeon.setStream('started'), false);
        fresh({ dungeon_api_key: 'wrong' });
        assert.equal(await dungeon.forwardChat({ user: 'alice', text: 'hi' }), false);
    });

    test('stream start/stop sends started/ended once each', async () => {
        fresh();
        await dungeon.setStream('started');
        await dungeon.setStream('started');
        await dungeon.setStream('ended');
        await dungeon.setStream('ended');
        await dungeon.setStream('started');
        assert.deepEqual(stub.streams.map(s => s.body.state), ['started', 'ended', 'started']);
        assert.equal(stub.streams[0].channel, 'mychannel');
    });

    test('admin stop and restart always post, even after the same state', async () => {
        fresh();
        await dungeon.setStream('ended');
        assert.deepEqual(await dungeon.forceStream('stop'), { ok: true, sent: ['ended'], channel: 'mychannel', status: 'abandoned', changed: true });
        assert.deepEqual(await dungeon.forceStream('restart'), { ok: true, sent: ['ended', 'started'], channel: 'mychannel', status: 'voting', changed: true });
        assert.deepEqual(stub.streams.map(s => s.body.state), ['ended', 'ended', 'ended', 'started']);
        // The restart counts as the current state, so a normal start right after is not repeated
        assert.equal(await dungeon.setStream('started'), false);
        assert.equal(await dungeon.setStream('ended'), true);
    });

    test('admin actions report why nothing was sent', async () => {
        fresh({ dungeon_enabled: 0 });
        assert.equal((await dungeon.forceStream('stop')).code, 'not_configured');
        fresh();
        assert.equal((await dungeon.forceStream('pause')).code, 'bad_action');
        fresh({ dungeon_url: 'http://127.0.0.1:1' });
        const result = await dungeon.forceStream('restart');
        assert.equal(result.ok, false);
        assert.equal(result.code, 'unreachable');
        assert.deepEqual(result.sent, []);
        assert.match(result.error, /Could not reach Chatacombs at http:\/\/127\.0\.0\.1:1/);
        assert.equal(stub.streams.length, 0);
    });

    test('re-sends started on every (re)connect while a stream is live', async () => {
        fresh();
        await dungeon.reconcile();
        await until(() => stub.eventClients.size === 1);
        await wait(50);
        assert.equal(stub.streams.length, 0, 'no live stream, nothing sent');

        live = true;
        stub.dropAll(); // e.g. Chatacombs restarted and lost its in-memory stream state
        await until(() => stub.streams.length === 1);
        assert.deepEqual(stub.streams[0].body, { state: 'started' });

        // The resync counts as the current state, so a normal start right after is not repeated
        assert.equal(await dungeon.setStream('started'), false);
        dungeon.stopRelay();
        await until(() => stub.eventClients.size === 0);
    });

    test('relays say lines and game moments, and reconnects after a drop', async () => {
        fresh();
        const before = stub.eventConnections;
        assert.equal(await dungeon.reconcile(), true);
        await until(() => stub.eventClients.size === 1);

        stub.send({ kind: 'say', text: 'The door creaks open.' });
        stub.raw(': keep-alive\n\n');
        stub.raw('data: {broken json\n\n');
        stub.send({ kind: 'game', type: 'boss_appears', monster: 'Lich King', hp: 50, maxHp: 50 });
        stub.send({ kind: 'game', type: 'room_entered', room: 2 });
        await until(() => broadcasts.length === 3);

        assert.deepEqual(broadcasts[0], { event: 'dungeon_say', text: 'The door creaks open.' });
        assert.equal(broadcasts[1].event, 'dungeon_game');
        assert.equal(broadcasts[1].type, 'boss_appears');
        assert.deepEqual(broadcasts[1].effect, { effect: 'thunderstorm', note: 'Lich King appears!' });
        assert.deepEqual(broadcasts[2], { event: 'dungeon_game', type: 'room_entered', data: { kind: 'game', type: 'room_entered', room: 2 }, effect: null });

        stub.dropAll();
        await until(() => stub.eventClients.size === 1 && stub.eventConnections >= before + 2);
        stub.send({ kind: 'say', text: 'Back again.' });
        await until(() => broadcasts.length === 4);
        assert.deepEqual(broadcasts[3], { event: 'dungeon_say', text: 'Back again.' });

        // Turning the dungeon off closes the subscription
        settings.dungeon_enabled = 0;
        assert.equal(await dungeon.reconcile(), false);
        assert.equal(dungeon.isRelaying(), false);
        await until(() => stub.eventClients.size === 0);
    });
});

describe('CloudBot server wiring', () => {
    let stub;
    let server;
    let base;
    let tmpDir;
    let dungeon;
    const ioDir = path.join(__dirname, '..', 'io');
    let ioFilesBefore;

    before(async () => {
        ioFilesBefore = new Set(fs.existsSync(ioDir) ? fs.readdirSync(ioDir) : []);
        stub = await startStub();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbot-test-'));
        process.env.CLOUDBOT_DB_PATH = path.join(tmpDir, 'cloudbot.db');
        process.env.CLOUDBOT_GENERATED_DIR = path.join(tmpDir, 'generated');
        const db = require('../db');
        await db.initDb();
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
        dungeon.stopRelay();
        await stopServer(server);
        await stopServer(stub.server);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        // Stopping a stream writes show notes into src/io; remove the ones this run created
        for (const file of fs.readdirSync(ioDir)) {
            if (!ioFilesBefore.has(file) && file.endsWith('.md')) fs.rmSync(path.join(ioDir, file));
        }
    });

    const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    const get = (url) => fetch(base + url).then(r => r.json());

    test('dungeon settings default to off and an unconfigured bot sends nothing', async () => {
        const s = await get('/api/ceebee/settings');
        assert.equal(s.dungeon_enabled, 0);
        assert.equal(s.dungeon_url, '');
        assert.equal(s.dungeon_api_key, '');
        assert.equal(s.game_enabled, 1);
        await post('/api/chat-event', { username: 'alice', text: '!explore' });
        await wait(100);
        assert.equal(stub.messages.length, 0);
        assert.deepEqual(await get('/api/dungeon/status'), { enabled: false, configured: false, active: false, relaying: false });
    });

    test('saving each admin section keeps the other section intact', async () => {
        await post('/api/ceebee/settings', { auto_participate: true, min_messages: 5, max_messages: 9, game_enabled: false, dynamic_weather_enabled: true });
        let s = await post('/api/ceebee/settings', { dungeon_enabled: true, dungeon_url: stub.url, dungeon_api_key: API_KEY, dungeon_channel: '#FBoucherOS' });
        assert.equal(s.dungeon_enabled, 1);
        assert.equal(s.dungeon_url, stub.url);
        assert.equal(s.dungeon_api_key, API_KEY);
        assert.equal(s.dungeon_channel, 'fboucheros');
        assert.equal(s.auto_participate, 1);
        assert.equal(s.min_messages, 5);
        assert.equal(s.game_enabled, 0);

        s = await post('/api/ceebee/settings', { auto_participate: false, min_messages: 10, max_messages: 15, game_enabled: true, dynamic_weather_enabled: true });
        assert.equal(s.dungeon_enabled, 1);
        assert.equal(s.dungeon_api_key, API_KEY);
        assert.equal(s.game_enabled, 1);
        assert.equal((await get('/api/dungeon/status')).relaying, true);
    });

    test('chat-event forwards the line to Chatacombs and keeps its own reply', async () => {
        stub.messages.length = 0;
        const reply = await post('/api/chat-event', { username: '@Alice', displayName: 'Alice', text: '!vote 1', isBroadcaster: false });
        assert.equal(reply.shouldGreet, false);
        await until(() => stub.messages.length === 1);
        assert.deepEqual(stub.messages[0], { channel: 'fboucheros', body: { user: 'alice', displayName: 'Alice', text: '!vote 1', isBroadcaster: false } });
    });

    test('chat-event still answers when Chatacombs fails', async () => {
        stub.failMessages = true;
        const res = await fetch(base + '/api/chat-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bob', text: 'hello' }) });
        stub.failMessages = false;
        assert.equal(res.status, 200);
        assert.equal((await res.json()).shouldGreet, false);
    });

    test('stream start/stop tell Chatacombs started/ended', async () => {
        stub.streams.length = 0;
        const started = await post('/api/stream/start', { projectName: 'Chatacombs' });
        assert.ok(started.sessionId);
        await until(() => stub.streams.length === 1);
        await post('/api/stream/stop', {});
        await until(() => stub.streams.length === 2);
        assert.deepEqual(stub.streams.map(s => s.body), [{ state: 'started' }, { state: 'ended' }]);
    });

    test('quick actions stop or restart the adventure without touching the session', async () => {
        const started = await post('/api/stream/start', { projectName: 'Chatacombs' });
        await until(() => stub.streams.at(-1)?.body.state === 'started');
        stub.streams.length = 0;

        assert.deepEqual(await post('/api/dungeon/stream', { action: 'stop' }), { ok: true, sent: ['ended'], channel: 'fboucheros', status: 'abandoned', changed: true });
        assert.deepEqual(await post('/api/dungeon/stream', { action: 'restart' }), { ok: true, sent: ['ended', 'started'], channel: 'fboucheros', status: 'voting', changed: true });
        assert.deepEqual(stub.streams.map(s => s.body), [{ state: 'ended' }, { state: 'ended' }, { state: 'started' }]);
        assert.equal(stub.streams[0].channel, 'fboucheros');

        const status = await get('/api/stream/status');
        assert.equal(status.active, true);
        assert.equal(status.session.id, started.sessionId);

        const bad = await fetch(base + '/api/dungeon/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) });
        assert.equal(bad.status, 400);

        await post('/api/stream/stop', {});
    });

    test('quick actions say when Chatacombs cannot be reached', async () => {
        const s = await get('/api/ceebee/settings');
        await post('/api/ceebee/settings', { dungeon_enabled: true, dungeon_url: 'http://127.0.0.1:1', dungeon_api_key: API_KEY, dungeon_channel: 'fboucheros' });
        const res = await fetch(base + '/api/dungeon/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
        assert.equal(res.status, 502);
        const body = await res.json();
        assert.equal(body.ok, false);
        assert.match(body.error, /Could not reach Chatacombs/);
        await post('/api/ceebee/settings', { dungeon_enabled: true, dungeon_url: s.dungeon_url, dungeon_api_key: API_KEY, dungeon_channel: 'fboucheros' });
    });

    test('Chatacombs events reach the overlay stream', async () => {
        const controller = new AbortController();
        const res = await fetch(base + '/api/stream/events', { signal: controller.signal });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        const readUntil = async (needle) => {
            while (!text.includes(needle)) {
                const { value, done } = await reader.read();
                if (done) throw new Error('overlay stream closed');
                text += decoder.decode(value, { stream: true });
            }
        };
        await readUntil('"connected"');
        await until(() => stub.eventClients.size === 1);
        stub.send({ kind: 'say', text: 'A goblin blocks the way.' });
        stub.send({ kind: 'game', type: 'player_healed', user: 'bob', target: 'alice', amount: 6 });
        await readUntil('player_healed');
        controller.abort();

        const payloads = text.split('\n\n').filter(f => f.startsWith('data:')).map(f => JSON.parse(f.slice(5)));
        assert.deepEqual(payloads.find(p => p.event === 'dungeon_say'), { event: 'dungeon_say', text: 'A goblin blocks the way.' });
        assert.deepEqual(payloads.find(p => p.event === 'dungeon_game').effect, { effect: 'potion', user: 'alice', amount: 6 });
    });

    test('turning the dungeon off stops forwarding and relaying', async () => {
        await post('/api/ceebee/settings', { dungeon_enabled: false });
        const s = await get('/api/ceebee/settings');
        assert.equal(s.dungeon_url, stub.url);
        assert.equal((await get('/api/dungeon/status')).relaying, false);
        const res = await fetch(base + '/api/dungeon/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
        assert.equal(res.status, 409);
        stub.messages.length = 0;
        await post('/api/chat-event', { username: 'alice', text: '!explore' });
        await wait(100);
        assert.equal(stub.messages.length, 0);
    });
});
