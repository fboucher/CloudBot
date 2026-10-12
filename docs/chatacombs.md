# Chatacombs dungeon

[Chatacombs](https://github.com/fboucher/chatacombs) is a chat dungeon game that runs as its own service. CloudBot can connect to it so your viewers play the dungeon from Twitch chat while CeeBee tells the story. This page explains how to set it up from the CloudBot admin console, how to check that it works, and what to do when it doesn't.

The integration is off by default. With the switch off, CloudBot sends nothing to Chatacombs.

## What the integration does

Once the Dungeon is on and configured, CloudBot:

- **Forwards chat.** Every chat line CloudBot receives is sent to Chatacombs, which reads the game commands (`!explore`, `!vote 1`, `!go north`, and so on) and ignores the rest.
- **Speaks the dungeon lines.** Chatacombs sends its narration back to CloudBot, and CeeBee posts it in Twitch chat. Answers to viewers who talk to the dungeon bot by name (its `BOT_NAME`) come back the same way.
- **Plays overlay effects.** Big game moments trigger CloudBot effects: a potion when someone is healed, CB Wow for rare loot, CB Tada when a monster is defeated, a thunderstorm when a boss appears and rainbow sunshine when the dungeon is cleared. Dice rolls are left to Chatacombs, which shows its own d20 on its overlay.
- **Links the stream to the adventure.** Starting a stream session in CloudBot tells Chatacombs the stream `started`, which opens a theme vote for a new adventure. Stopping the session tells it the stream `ended`. CloudBot also resends `started` when it reconnects to a Chatacombs that restarted during a live session.

The game itself (rooms, monsters, votes, timers and the Chatacombs overlay) lives in Chatacombs. CloudBot is only its link to chat and to the CloudBot overlay.

## Configure it in the admin console

1. Start your Chatacombs container. Note the port it listens on and the `API_KEY` from its `.env`.
2. Open the CloudBot admin page (for example `http://localhost:3001/admin`).
3. Open the **Ceebee AI** page from the sidebar and find the **Dungeon (Chatacombs)** card.
4. Fill in the fields, then click **Save Dungeon**.

| Field | What to enter |
| --- | --- |
| **Enable Dungeon** | Turns the integration on or off. Off means nothing is forwarded or relayed. |
| **Service URL** | Where CloudBot reaches Chatacombs. When CloudBot runs in a container (the usual setup), use `http://host.docker.internal:8080`, not `localhost`. See [Docker networking](#docker-networking). When both run straight from the code on the same machine, `http://localhost:8080` works. |
| **Channel** | Your Twitch channel name, for example `fboucheros`. A leading `#` is removed and the name is lowercased. It **must match the channel in the Chatacombs overlay URL** you added to OBS, otherwise the game runs on one channel and the overlay shows another. |
| **API Key** | The `API_KEY` from the Chatacombs `.env`. **Not the `OVERLAY_KEY`**: that one only goes in the overlay URL in OBS. It is stored on the CloudBot server and is never sent to the overlay. |

The Chatacombs overlay URL in OBS looks like this, with the channel in the path:

```text
http://localhost:8080/overlay/fboucheros?key=<OVERLAY_KEY>&audio=1&theme=dark
```

Here `fboucheros` is the channel, so the **Channel** field in CloudBot must be `fboucheros` too. OBS runs on your machine, so the overlay URL uses `localhost` even when CloudBot needs `host.docker.internal`.

Chatacombs has two keys, and each goes in one place:

| Chatacombs `.env` | Where it goes |
| --- | --- |
| `API_KEY` | The **API Key** field in the CloudBot admin page. |
| `OVERLAY_KEY` | The `key=` part of the overlay URL in OBS. |

The note under the fields tells you where things stand:

- *Dungeon is off*: the switch is off.
- *Dungeon is on but needs a service URL, API key and channel*: one of the fields is empty.
- *Dungeon is on (save to connect)*: the fields are filled in but not saved yet.
- *Dungeon is on: connecting to Chatacombs...*: CloudBot is trying to connect. The note updates a few seconds after you save.
- *Dungeon is on and connected*: chat is forwarded and narration and effects are relayed.
- *Chatacombs … rejected the API key*: the **API Key** field doesn't match the Chatacombs `API_KEY`. Check that it isn't the `OVERLAY_KEY`.
- *Can't reach Chatacombs at …*: CloudBot can't open a connection to the **Service URL**. Inside a container, the page also warns when the URL uses `localhost`.

### Docker networking

Inside the CloudBot container, `localhost` is the container itself, not your computer. When Chatacombs runs in another container (or directly on your computer) with its port published, point CloudBot at the host instead:

```text
http://host.docker.internal:8080
```

Docker Desktop on Windows and macOS knows `host.docker.internal` already. On Linux, add it when you start CloudBot:

```bash
docker run -p 3001:3000 -d --add-host=host.docker.internal:host-gateway \
  -v ${PWD}/src/io:/usr/src/app/io \
  -e CLIENT_ID=your_twitch_client_id -e SECRET=your_twitch_client_secret \
  --name cloudbot fboucher/cloudbot:latest
```

If both containers are on the same Docker network, you can also use the Chatacombs container name, for example `http://chatacombs:8080`.

## Check that it works

1. **Admin page.** After saving, the note under the Dungeon fields should say *Dungeon is on and connected* within a few seconds, and the **Stop dungeon** and **New adventure** buttons appear in **Quick Actions**.
2. **CloudBot logs.** A working connection logs this line (with your URL and channel):

   ```text
   [Dungeon] Connected to http://host.docker.internal:8080/api/v1/channels/fboucheros/events
   ```

   Warnings that start with `[Dungeon]` (for example `Event stream error` or `Chat forward failed`) mean CloudBot can't reach Chatacombs or the API key is wrong. CloudBot keeps retrying in the background.
3. **Chatacombs state.** Ask Chatacombs directly what it thinks is going on:

   ```bash
   curl -H "Authorization: Bearer <API_KEY>" http://localhost:8080/api/v1/channels/fboucheros/state
   ```

## Test with fake players

You can play without a live stream by sending chat lines to CloudBot yourself, as if they came from Twitch. CloudBot forwards them to Chatacombs exactly like real chat.

Start a stream session first (from the admin page, or click **New adventure**) so a theme vote opens, then send a few lines:

```bash
curl -X POST http://localhost:3001/api/chat-event \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","displayName":"Alice","text":"!vote 1"}'

curl -X POST http://localhost:3001/api/chat-event \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob","displayName":"Bob","text":"!explore"}'
```

With the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension in VS Code, save this as `dungeon.http` and click **Send Request** above each block:

```http
@cloudbot = http://localhost:3001

### Alice votes for the first theme
POST {{cloudbot}}/api/chat-event
Content-Type: application/json

{"username":"alice","displayName":"Alice","text":"!vote 1"}

### Bob explores the room
POST {{cloudbot}}/api/chat-event
Content-Type: application/json

{"username":"bob","displayName":"Bob","text":"!explore"}

### Alice votes to go north
POST {{cloudbot}}/api/chat-event
Content-Type: application/json

{"username":"alice","displayName":"Alice","text":"!go north"}
```

Real viewers and your fake players play in the same game, so you can mix both.

## Troubleshooting

### Nothing happens

Open the **Ceebee AI** page and read the note under the Dungeon fields. It says whether CloudBot is connected, and why not when it isn't. The two usual causes are:

- **The OVERLAY_KEY in the API Key field.** Use the Chatacombs `API_KEY` instead.
- **`localhost` in the Service URL while CloudBot runs in Docker.** Use `http://host.docker.internal:8080`.

Then check that the **Channel** matches the channel in your overlay URL.

### The dungeon comes back stuck in an old adventure

Chatacombs saves an unfinished adventure and restores it when it restarts. A stream `started` does nothing while an adventure is still active, so after a rebuild or a crash the dungeon can reappear in the middle of an old game (room 2 of a previous run, for example).

Use the buttons in **Quick Actions** on the admin page. They only show up when the Dungeon is on and configured.

- **Stop dungeon** ends the current adventure. Your CloudBot stream session keeps running.
- **New adventure** ends the current adventure and starts a new one right away, so a new theme vote opens in chat.

Neither button saves show notes or plays the stream start/stop effects. The result appears under the buttons, including a clear message when Chatacombs can't be reached.

### A port on Windows doesn't answer

If a request to CloudBot works from WSL but fails from Windows (for example `curl: (52) Empty reply from server` in PowerShell), something else on Windows is probably holding that port, or Docker's port forward is stuck. OBS runs on Windows, so this also stops the overlay from forwarding chat.

Check what is using the port in PowerShell:

```powershell
netstat -ano | findstr :3001
```

The quickest fix is another host port: recreate the container with `-p 3005:3000`, then use `http://localhost:3005` in OBS and in your test requests. Restarting Docker Desktop also resets stuck port forwards.

### Choosing the dungeon bot's name

Viewers talk to the dungeon by name, using the `BOT_NAME` set in the Chatacombs `.env`. Chatacombs matches the name as a whole word, ignoring case, with or without `@`. So pick a name people rarely type by accident: `DM` triggers on "DM me" and "check your DMs", and `Ceebee` makes CloudBot's own CeeBee AI answer too, so viewers get two replies. Short themed names such as `Bones`, `Seer` or `Warden` work well. Use letters only, then restart the Chatacombs container after changing it.

The answers are posted by CeeBee's Twitch account, so no Twitch account with the bot's name is needed.

## For developers

The admin buttons call `POST /api/dungeon/stream` on CloudBot with `{ "action": "stop" }` or `{ "action": "restart" }`. CloudBot then calls Chatacombs at `POST {url}/api/v1/channels/{channel}/stream` with `{"state":"ended"}` (and `{"state":"started"}` for a restart), using the saved API key. The code is in `src/dungeon.js`, and the tests in `src/test/dungeon.test.js` run against a stub Chatacombs with `npm test` from inside `src`.
