// Chatacombs dungeon adapter: CloudBot is a client of a Chatacombs service.
// - chat lines in:   POST {url}/api/v1/channels/{channel}/messages
// - stream state:    POST {url}/api/v1/channels/{channel}/stream
// - events out:      GET  {url}/api/v1/channels/{channel}/events (SSE)
// `say` events are relayed to the overlay so it speaks them in Twitch chat, and
// `game` moments are relayed with the matching CloudBot effect (if any).
// Every call is best-effort: a missing or misbehaving dungeon never breaks CloudBot.

const REQUEST_TIMEOUT_MS = 3000;
const RECONNECT_MIN_MS = 3000;
const RECONNECT_MAX_MS = 30000;

// Chatacombs rolls a d20; CloudBot's dice overlay throws two d6.
// Scale the d20 onto a 2..12 total so a natural 20 is double six and a natural 1 is snake eyes.
function d20ToTwoD6(roll) {
    const r = Math.min(20, Math.max(1, Math.round(Number(roll) || 1)));
    const total = 2 + Math.round(((r - 1) * 10) / 19);
    const d1 = Math.ceil(total / 2);
    return { d1, d2: total - d1 };
}

// Map a Chatacombs `game` moment onto an existing CloudBot overlay effect.
// Returns null for moments CloudBot does not react to.
function mapGameMoment(event) {
    if (!event || typeof event !== 'object') return null;
    switch (event.type) {
        case 'player_healed':
            return { effect: 'potion', user: event.target || event.user || '', amount: Number(event.amount) || 0 };
        case 'dice_roll': {
            const { d1, d2 } = d20ToTwoD6(event.roll);
            return { effect: 'dice', d1, d2, user: event.displayName || event.user || '' };
        }
        case 'rare_loot': {
            const found = event.item ? event.item : `${Number(event.gold) || 0} gold`;
            return { effect: 'cloud', expression: 'Wow', note: `${event.user || 'The party'} found ${found}!` };
        }
        case 'monster_defeated':
            return { effect: 'cloud', expression: 'Tada', sound: 'applause', note: `${event.monster || 'The monster'} was defeated!` };
        case 'boss_appears':
            return { effect: 'thunderstorm', note: `${event.monster || 'The boss'} appears!` };
        case 'dungeon_cleared':
            return { effect: 'sunshine', expression: 'Yeah', sound: 'yeah', note: event.theme ? `Dungeon cleared: ${event.theme}!` : 'Dungeon cleared!' };
        default:
            return null;
    }
}

// Normalise the dungeon_* settings row into the config the adapter uses.
function readConfig(settings) {
    const s = settings || {};
    const url = String(s.dungeon_url || '').trim().replace(/\/+$/, '');
    const apiKey = String(s.dungeon_api_key || '').trim();
    const channel = String(s.dungeon_channel || '').trim().replace(/^#/, '').toLowerCase();
    const enabled = !!s.dungeon_enabled;
    return { enabled, url, apiKey, channel, ready: enabled && !!url && !!apiKey && !!channel };
}

function channelApi(config) {
    return `${config.url}/api/v1/channels/${encodeURIComponent(config.channel)}`;
}

// Parse one SSE frame ("event: x\ndata: {...}") into its JSON data, or null.
function parseSseFrame(frame) {
    const data = frame
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
    if (!data) return null; // keep-alive comments
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

function createDungeon({ getSettings, broadcast, isStreamLive = async () => false, fetchImpl = (...args) => fetch(...args), logger = console, reconnectMinMs = RECONNECT_MIN_MS, reconnectMaxMs = RECONNECT_MAX_MS } = {}) {
    let relay = null; // { key, controller }
    let lastStreamState = null; // { key, state }

    async function loadConfig() {
        try {
            return readConfig(await getSettings());
        } catch (err) {
            logger.error('[Dungeon] Could not read settings:', err.message);
            return readConfig(null);
        }
    }

    async function post(config, path, body) {
        const res = await fetchImpl(`${channelApi(config)}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    }

    // Forward one chat line. Resolves to true when Chatacombs accepted it; never rejects.
    async function forwardChat({ user, displayName, text, isBroadcaster } = {}) {
        if (!user || typeof text !== 'string' || !text.trim()) return false;
        const config = await loadConfig();
        if (!config.ready) return false;
        try {
            await post(config, 'messages', { user, displayName: displayName || user, text, isBroadcaster: !!isBroadcaster });
            return true;
        } catch (err) {
            logger.warn(`[Dungeon] Chat forward failed: ${err.message}`);
            return false;
        }
    }

    // Tell Chatacombs the stream 'started' or 'ended'. Repeats of the same state are skipped.
    async function setStream(state) {
        if (state !== 'started' && state !== 'ended') return false;
        const config = await loadConfig();
        if (!config.ready) return false;
        const key = `${config.url}|${config.channel}`;
        if (lastStreamState && lastStreamState.key === key && lastStreamState.state === state) return false;
        const previous = lastStreamState;
        lastStreamState = { key, state };
        try {
            await post(config, 'stream', { state });
            return true;
        } catch (err) {
            // Let the next start/stop try again
            if (lastStreamState && lastStreamState.key === key && lastStreamState.state === state) lastStreamState = previous;
            logger.warn(`[Dungeon] Stream ${state} failed: ${err.message}`);
            return false;
        }
    }

    // Admin quick actions: always post, even when the same state was already sent.
    // 'stop' ends the current adventure; 'restart' ends it and starts a new one (a fresh theme vote).
    // Resolves to { ok, sent } or { ok: false, sent, code, error }; never rejects.
    async function forceStream(action) {
        const states = action === 'stop' ? ['ended'] : action === 'restart' ? ['ended', 'started'] : null;
        if (!states) return { ok: false, sent: [], code: 'bad_action', error: 'Unknown action' };
        const config = await loadConfig();
        if (!config.ready) return { ok: false, sent: [], code: 'not_configured', error: 'Dungeon is off or not configured' };
        const key = `${config.url}|${config.channel}`;
        const sent = [];
        let reply = {};
        for (const state of states) {
            try {
                const res = await post(config, 'stream', { state });
                reply = await res.json().catch(() => ({}));
            } catch (err) {
                const reason = err.name === 'TimeoutError' ? 'timed out' : err.message;
                logger.warn(`[Dungeon] Stream ${state} (admin) failed: ${reason}`);
                return { ok: false, sent, channel: config.channel, code: 'unreachable', error: `Could not reach Chatacombs at ${config.url} (${reason})` };
            }
            lastStreamState = { key, state };
            sent.push(state);
        }
        // Chatacombs answers with the adventure status after the change and whether anything changed
        const status = typeof reply.status === 'string' && reply.status !== 'ok' ? reply.status : null;
        const changed = typeof reply.changed === 'boolean' ? reply.changed : null;
        logger.log(`[Dungeon] Admin ${action} on channel ${config.channel}: sent ${sent.join(', ')}, adventure is now ${status || 'unknown'}${changed === false ? ' (unchanged)' : ''}`);
        return { ok: true, sent, channel: config.channel, status, changed };
    }

    // Chatacombs keeps stream state in memory, so after it restarts (or the relay first connects)
    // re-send 'started' when CloudBot already has a live session. Chatacombs ignores a repeat.
    async function resyncStream(config) {
        let live = false;
        try {
            live = await isStreamLive();
        } catch (err) {
            logger.warn(`[Dungeon] Could not check stream state: ${err.message}`);
        }
        if (!live) return false;
        const previous = lastStreamState;
        const current = { key: `${config.url}|${config.channel}`, state: 'started' };
        lastStreamState = current;
        try {
            await post(config, 'stream', { state: 'started' });
            return true;
        } catch (err) {
            if (lastStreamState === current) lastStreamState = previous;
            logger.warn(`[Dungeon] Stream resync failed: ${err.message}`);
            return false;
        }
    }

    function handleEvent(event) {
        if (!event || typeof event !== 'object') return;
        if (event.kind === 'say') {
            if (typeof event.text === 'string' && event.text.trim()) {
                broadcast({ event: 'dungeon_say', text: event.text });
            }
        } else if (event.kind === 'game' && typeof event.type === 'string') {
            broadcast({ event: 'dungeon_game', type: event.type, data: event, effect: mapGameMoment(event) });
        }
    }

    // Turn a relay failure into a sentence the admin page can show as is
    function describeRelayError(config, err) {
        if (err.status === 401 || err.status === 403) return `Chatacombs at ${config.url} rejected the API key (HTTP ${err.status}). Use the API_KEY from the Chatacombs .env, not the OVERLAY_KEY.`;
        if (err.status) return `Chatacombs at ${config.url} answered HTTP ${err.status}.`;
        return `Can't reach Chatacombs at ${config.url} (${err.cause?.code || err.cause?.message || err.message}).`;
    }

    async function readStream(config, signal, link) {
        const res = await fetchImpl(`${channelApi(config)}/events`, {
            headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'text/event-stream' },
            signal
        });
        if (!res.ok || !res.body) throw Object.assign(new Error(`events: HTTP ${res.status}`), { status: res.status });
        link.connected = true;
        link.error = null;
        logger.log(`[Dungeon] Connected to ${channelApi(config)}/events`);
        resyncStream(config);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true }).replace(/\r/g, '');
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
                const frame = buf.slice(0, i);
                buf = buf.slice(i + 2);
                try {
                    handleEvent(parseSseFrame(frame));
                } catch (err) {
                    logger.warn(`[Dungeon] Could not relay event: ${err.message}`);
                }
            }
        }
    }

    async function runRelay(config, controller, link) {
        let delay = reconnectMinMs;
        while (!controller.signal.aborted) {
            const startedAt = Date.now();
            try {
                await readStream(config, controller.signal, link);
                link.connected = false;
            } catch (err) {
                link.connected = false;
                if (controller.signal.aborted) break;
                link.error = describeRelayError(config, err);
                logger.warn(`[Dungeon] Event stream error: ${err.message}`);
            }
            if (controller.signal.aborted) break;
            // A stream that stayed up for a while resets the backoff
            if (Date.now() - startedAt > reconnectMaxMs) delay = reconnectMinMs;
            await new Promise(resolve => {
                const t = setTimeout(resolve, delay);
                controller.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
            });
            delay = Math.min(delay * 2, reconnectMaxMs);
        }
    }

    function stopRelay() {
        if (relay) {
            relay.controller.abort();
            relay = null;
        }
    }

    // Start, restart or stop the SSE relay so it matches the saved settings.
    async function reconcile() {
        const config = await loadConfig();
        const key = config.ready ? `${config.url}|${config.channel}|${config.apiKey}` : null;
        if (relay && relay.key === key) return isRelaying();
        stopRelay();
        if (!key) return false;
        const controller = new AbortController();
        relay = { key, controller, link: { connected: false, error: null } };
        runRelay(config, controller, relay.link).catch(err => logger.error('[Dungeon] Relay stopped:', err.message));
        return true;
    }

    function isRelaying() {
        return !!relay;
    }

    // Whether the event stream is up right now, and why it is not when it failed
    function connectionStatus() {
        return relay ? { connected: relay.link.connected, error: relay.link.error } : { connected: false, error: null };
    }

    return { forwardChat, setStream, forceStream, reconcile, stopRelay, isRelaying, connectionStatus, handleEvent };
}

module.exports = { createDungeon, mapGameMoment, readConfig, parseSseFrame, d20ToTwoD6 };
