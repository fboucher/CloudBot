# Cloud Bot
[![Release Docker Image](https://img.shields.io/github/actions/workflow/status/FBoucher/CloudBot/release-docker-image.yml?event=release&style=flat-square&label=release%20docker)](https://github.com/FBoucher/CloudBot/actions/workflows/release-docker-image.yml) [![Build Beta Docker](https://img.shields.io/github/actions/workflow/status/FBoucher/CloudBot/simple-docker-image.yml?branch=main&style=flat-square&label=build%20beta%20docker)](https://github.com/FBoucher/CloudBot/actions/workflows/simple-docker-image.yml) [![GitHub Release](https://img.shields.io/github/v/release/FBoucher/CloudBot?style=flat-square)](https://github.com/FBoucher/CloudBot/releases) [![Docker Pulls](https://img.shields.io/docker/pulls/fboucher/cloudbot?style=flat-square)](https://hub.docker.com/r/fboucher/cloudbot) [![License](https://img.shields.io/github/license/FBoucher/CloudBot?style=flat-square)](LICENSE)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Simple Twitch chatbot for Twitch Stream, build with [Comfy.JS](https://github.com/instafluff/ComfyJS). 

![cloudbot logo](medias/cloudbot_logo.png)

First it was a pretext to learn (or refresh) my JavaScript knowledge, but it became quickly fun to add more and more feature to it. Have a look customize it. make suggestion... this is pure fun. :)

Currently Available Commands
----------------------------

### Games & RPG
- **!drop**: Drop from the top of the screen onto the moving cloud to score points and climb the leaderboard!
- **!search**, **!loot**: Search the cloud forest for RPG items (10 min cooldown).
- **!bag**, **!inventory**: View your inventory of collected RPG items (holds up to 5 items).
- **!use** `<item>`: Use an RPG item (`potion`, `shield`, `umbrella`, `rain-stone`, `sun-stone`, `bomb`, `shovel`) to trigger visual effects on stream.
- **!roll**, **!dice**, **!2d6**: Roll two 6-sided dice with sound effects and a 3D animated dice overlay.
- **!rpg**, **!rpg-help**, **!loot-help**: Display RPG Loot Game rules and commands in chat.
- **!stats**: Display current user stats (total drops, landings, and high score).
- **!scores**: Display the highest scores leaderboard on the stream overlay.

### CeeBee (Visuals & AI)
- **!ceebee** `<message>`: Chat with Ceebee the AI assistant (or tag `@ceebee` in chat).
- **!cloud**: Show Ceebee spinning like a tornado and striking a "Ta-da!" pose.
- **!yes**: Show Ceebee giving a thumbs-up.
- **!shout** `<text>`: Display a large shouting text overlay across the screen.
- *(Passive)*: Chat messages with `lol` or `lul` trigger Ceebee's laughing animation.

### Weather & Environment
- **!rain**: Summon dark storm clouds, animated rainfall, and rain sound effects.
- **!sun**: Clear weather overrides and bring back the sunny sky.

### Sounds
- **!bonjour**: Play sound "Bonjour Hi" (3 random variations; special "sir bonjour" variations for `@surlydev`).
- **!bad**: Play sound "I have a bad feeling about this".
- **!yeah**: Play sound "Yeeeeeeaaaah!".
- **!knock**: Play sound "Realistic knock on a door".
- **!previously**: Play sound "Previously on Frank's channel" said by Jeff Fritz.

### Tools
- **!time** `<text>`: Add a time log to the show notes (used to generate timestamps on YouTube).
- **!attention** `<text>`: Play a notification sound and display speech bubble text on screen.
- **!note** `<text>`: Add a note, code snippet, or URL useful during the stream.
- **!cmd**, **!command**, **!commands**: Display in the chat the URL back to this command list.
- **!referral**, **!referrals**: Display referral link(s) (e.g. GitKraken).
- **!livecoder**, **!livecoders**: Provide more info about the Live Coders stream team in chat.

### Broadcaster Only
- **!start** `<projectName>`: Start a new stream session and initialize logging.
- **!stop**: End the stream session and display the scrolling StreamNotes end-screen overlay.
- **!hide**: Hide the StreamNotes panel.
- **!so** `<username>`: Shout-out another streamer with Twitch Helix API profile info and animated overlay banner.
- **!hello**: Greet chat and display Ceebee greeting animation.
- **!clean**: Hide and clean all active overlays, text bubbles, and images from the screen.
- **!talk** `<text>`: Make the bot repeat a message in chat.
- **!load**: Load previous session data.
- **!save**: Save current session data locally.
- **!ok-bye**: Disconnect the bot from chat.

#### To-Do List Management
- **!todo-add** `<text>`: Add a new To-Do item.
- **!todo-start** `<number>`: Set the identified To-Do to in-progress.
- **!todo-done** `<number>`: Mark the identified To-Do as completed.
- **!todo-cancel** `<number>`: Cancel the identified To-Do.
- **!todo-show**: Display the To-Do list overlay on screen.
- **!todo-hide**: Hide the To-Do list overlay from the screen.

#### Stream Reminders
- **!reminder-add** `<Reminder Name> | <description>`: Create a new reminder (use `|` to separate name and description).
- **!reminder-pause** `<Reminder Name>`: Pause the reminder (set status to inactive).
- **!reminder-stop** `<Reminder Name>`: Mark the reminder as done.


Upcoming Available Commands
----------------------------

- lift
- etc.

How to use it
-------------

### Environment Variables (Twitch API Setup)
For streamer shoutouts, the bot queries the Twitch Helix API. This requires a Twitch Developer Application client ID and client secret.
Create a `.env` file in the root directory (or inside `src`) with the following variables:
```env
CLIENT_ID=your_twitch_client_id
SECRET=your_twitch_client_secret
```

### Directly from the code

The Cloudbot now required a server. A tiny one but it's not a static HTML web page anymore. It's using Node.js. You can run it locally or host it somewhere (ex: Azure).
If you decide to run it locally execute: `npm start` from inside the folder `src`.

Make a new browser source overlay into your streaming tools (ex: OBS, StreamLabs OBS) and connect it to the root url where the server is running. (ex: `http://localhost:3000`.

Create a file `secret.js` with the following code in it: 

```js
const authToken = "oauth:xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
```

Replace the token by the value found on: https://twitchapps.com/tmi/

Finally replace fboucheros by the name of your Twitch Channel on the last line. 

```js
 ComfyJS.Init( "fboucheros", authToken );
```

### Using Docker Container

This project is now available in a container. You can find it on: [https://hub.docker.com/repository/docker/fboucher/cloudbot](https://hub.docker.com/repository/docker/fboucher/cloudbot)

- The container by default uses the port 3000, you can map it to a different one if you want to keep 3000 available for some other node development (in the command below, the chat bot will be available at http://localhost:3001). 

- The `${PWD}` is the current local folder on the host. This folder MUST CONTAIN: 
  - a file `secret.js`  with a auth key in it.

    ```javascript
    const authToken = "oauth:____________________";
    ```

  - The database (`cloudbot.db`) is created automatically on first run — no manual setup needed.

Pass the Twitch API credentials as environment variables using `-e CLIENT_ID=... -e SECRET=...`.

Here is how to run with **podman** (use `--userns=keep-id` so the container can write to your local `io` folder):

```bash
podman run -p 3001:3000 -d --userns=keep-id -v ${PWD}/src/io:/usr/src/app/io -e CLIENT_ID=your_twitch_client_id -e SECRET=your_twitch_client_secret --name cloudbot cloudbot:local
```

Or with Docker:

```bash
docker run -p 3001:3000 -d -v ${PWD}/src/io:/usr/src/app/io -e CLIENT_ID=your_twitch_client_id -e SECRET=your_twitch_client_secret --name cloudbot fboucher/cloudbot:latest
```

Then open `http://localhost:3001/admin` in your browser to start a stream session, or type `!start [projectName]` in Twitch chat.

### Web Admin Panel

CloudBot includes a built-in web dashboard accessible at `http://localhost:3000/admin` (or `http://localhost:3001/admin` when using Docker/Podman):

- **Dashboard**: Real-time session status, active participant count, and quick controls.
- **Current Session**: Manage the live stream session, add/edit notes, track stream events, and maintain live To-Dos and Reminders.
- **Session History**: Browse past sessions and copy/export generated Markdown show notes (ready for YouTube descriptions and timestamps).
- **Users & Leaderboard**: Track user drop game statistics, view high scores, and manage participant streamer flags.
- **Ceebee AI Settings**: Configure LLM providers (OpenAI / Azure OpenAI endpoints and keys), edit Ceebee's system prompt (`soul.md`), upload knowledge base documents (`io/knowledge/`), and configure chat auto-participation.

~ **Have fun!**

---


## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="http://cloud5mins.com"><img src="https://avatars3.githubusercontent.com/u/2404846?v=4" width="100px;" alt=""/><br /><sub><b>Frank Boucher</b></sub></a><br /><a href="https://github.com/FBoucher/CloudBot/commits?author=FBoucher" title="Documentation">📖</a> <a href="https://github.com/FBoucher/CloudBot/commits?author=FBoucher" title="Code">💻</a> <a href="#ideas-FBoucher" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://github.com/surlydev"><img src="https://avatars1.githubusercontent.com/u/880671?v=4" width="100px;" alt=""/><br /><sub><b>SurlyDev</b></sub></a><br /><a href="#ideas-surlydev" title="Ideas, Planning, & Feedback">🤔</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!


