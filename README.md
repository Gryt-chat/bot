# @gryt/bot

Write Gryt bots in TypeScript.

```ts
import { GrytBot } from "@gryt/bot";

const bot = new GrytBot({ host: "chat.example.com", nickname: "Helper" });

bot.command("ping", async (ctx) => ctx.reply("pong"), {
  description: "Check I am alive",
  requires: ["send_messages"],
});

await bot.start();
```

## A bot knocks, and an admin answers

A bot arrives knowing only the server's address. It says what it is called and
what it wants to be allowed to do, and then it waits. An admin sees it in
**Server settings → Bots**, unticks anything they would rather it did not have,
and lets it in.

Nothing to configure on the server, no invite, no restart. Leave the bot
running through the first launch — the approval reaches it without a reconnect.

```ts
const bot = new GrytBot({
  host: "chat.example.com",
  nickname: "Helper",
  wants: ["read_messages", "send_messages"],
  description: "Answers questions in #support",
});
```

**Ask for the least that works.** An admin looking at a long list is being asked
to trust more than they can check, and the ones they untick are the ones you
will find out about.

### What you ask for is fixed

The first declaration is the only one. A later run asking for more gets the
answer to the question the first one asked, and the server will not record the
new list at all.

That is deliberate, and it is not about you. It is about the run that is not
yours — a published image that has been taken over between the day it was
approved and today. Such a bot can ask for the keys to the building as often as
it likes; it holds what an admin agreed to and nothing else, and it cannot even
change its own name.

If a bot genuinely needs more later, an admin makes a new registration.

### Unattended

For compose files and CI there is the other direction: an admin writes the
registration first, decides everything up front, and hands over a single-use
token.

```ts
const bot = new GrytBot({ host, botToken: process.env.GRYT_BOT_TOKEN });
```

## A bot is a member, and looks like one

From the server's side a bot is a member like any other — a key it holds, a
self-signed certificate, and a challenge-response over P-256. There is no bot
account type and no bot bypass.

What it is *not* is a person, and the server goes to some trouble to keep those
apart. A bot's identity lives in its own namespace with a `BOT_` prefix, so it
can never hold an id a person could hold. Every surface that shows a member
shows a **BOT** tag beside the name — in the member list and on every message —
derived from the identity rather than from anything the bot sends. And people
cannot take bot-shaped names: `BOT_helper` and `Bot Helper` are refused, while
Robot and Botany are fine.

It also means the interesting failure is a permission failure, so this SDK is
built to make that legible rather than mysterious:

```ts
bot.can("send_messages");   // what the server said, not what you hoped
bot.permissions;            // the whole list
await bot.send(id, "hi");   // throws naming the permission, before sending anything
```

Commands declare what they need, and are skipped rather than attempted when the
bot does not have it — so nobody types `!purge` and watches nothing happen:

```ts
bot.command("purge", handler, { requires: ["manage_messages"] });
```

## The key file is the bot

The first run writes `gryt-bot-identity.json`. That file **is** the bot's
identity — the id the server knows it by is derived from the key inside it.

- Keep it, and the bot keeps its permissions, its name and its history across
  restarts.
- Lose it, and the server sees a stranger knocking, with none of the permissions
  the bot before it was given.
- Commit it, and anybody with the repository is that bot.

It is written `0o600` and listed in `.gitignore`. Point `identityPath` somewhere
sensible for a deployment, or hand in an `identity` you loaded yourself.

## Options

| | |
|---|---|
| `host` | `chat.example.com`, or `localhost:5001`. Scheme optional — loopback assumes http, everything else https. |
| `nickname` | What the member list calls it. Default `"Bot"`. |
| `identityPath` | Where the key lives. Default `./gryt-bot-identity.json`. |
| `identity` | An already-loaded identity, if you keep the key somewhere of your own. |
| `wants` | Permissions to ask for. Sent once, on the first knock, and fixed from then on. |
| `description` | One line shown beside the ask. Say what the bot is for. |
| `botToken` | A token from a registration an admin set up in advance. Single-use. |
| `prefix` | Command prefix. Default `"!"`. Set to `""` to turn the router off. |
| `helpCommand` | Whether to answer `help` with a listing. Default on. |

## Events

```ts
bot.on("ready", (info) => {});      // joined, and the server has said who we are
bot.on("message", (msg) => {});     // someone else's message — never the bot's own
bot.on("members", (list) => {});
bot.on("channels", (list) => {});
bot.on("waiting", (why) => {});     // turned away pending approval — a state, not a failure
bot.on("error", (err) => {});       // every refusal, including this SDK's own
bot.on("disconnected", (why) => {});
```

`ready` fires once, when an admin has answered. On a first run `waiting` comes
first and `start()` does not resolve until somebody says yes — so listen for
`ready` rather than awaiting `start()` if the bot has to survive its own first
launch.

The server re-sends its details whenever a grant changes, so `bot.permissions`
stays current: an admin who widens or narrows a bot mid-run is obeyed without a
restart.

## Actions

```ts
await bot.send(conversationId, text);                    // send_messages
await bot.react(conversationId, messageId, "👍");         // add_reactions
await bot.delete(conversationId, messageId);             // manage_messages
await bot.delete(conversationId, messageId, { own: true }); // delete_own_messages
await bot.fetch(conversationId, 50);                     // read_messages
```

Anything this SDK does not wrap is on `bot.socket`.

## Running the example

```bash
yarn install
GRYT_HOST=localhost:5001 node --experimental-strip-types examples/ping.ts
```

## Licence

AGPL-3.0-or-later, like the rest of Gryt.
