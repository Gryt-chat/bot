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

## A bot is a member

There is no bot account type, no bot token and no bot bypass. A bot joins the
way any other client does — a key it holds, a self-signed certificate, and a
challenge-response over P-256 — and from the server's side it is a member like
any other.

That means **what a bot may do is what its role says**. The operator gives it a
role in the server's role editor, the same one they use for people, and every
check that applies to a person applies to it. A bot with no `send_messages` can
read a channel and cannot answer in it. A bot with `manage_messages` can clean
up after somebody.

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

- Keep it, and the bot keeps its role, its name and its history across restarts.
- Lose it, and the server sees a stranger with the same nickname, holding
  whatever role strangers get.
- Commit it, and anybody with the repository is that bot.

It is written `0o600` and listed in `.gitignore`. Point `identityPath` somewhere
sensible for a deployment, or hand in an `identity` you loaded yourself.

## What the server has to allow

Two things, and the SDK names whichever one is wrong rather than failing as
"certificate rejected":

1. **`GRYT_IDENTITY_TIERS` must include `local`.** A self-signed identity is the
   only kind a bot has, and a server accepts them only if told to. It is not the
   default.
2. **An invite, unless the join policy is `open`.** Pass `inviteCode`.

## Options

| | |
|---|---|
| `host` | `chat.example.com`, or `localhost:5001`. Scheme optional — loopback assumes http, everything else https. |
| `nickname` | What the member list calls it. Default `"Bot"`. |
| `identityPath` | Where the key lives. Default `./gryt-bot-identity.json`. |
| `identity` | An already-loaded identity, if you keep the key somewhere of your own. |
| `inviteCode` | Needed unless the server's join policy is `open`. |
| `prefix` | Command prefix. Default `"!"`. Set to `""` to turn the router off. |
| `helpCommand` | Whether to answer `help` with a listing. Default on. |

## Events

```ts
bot.on("ready", (info) => {});      // joined, and the server has said who we are
bot.on("message", (msg) => {});     // someone else's message — never the bot's own
bot.on("members", (list) => {});
bot.on("channels", (list) => {});
bot.on("error", (err) => {});       // every refusal, including this SDK's own
bot.on("disconnected", (why) => {});
```

`ready` fires once. The server re-sends its details whenever anybody's role
changes, so `bot.permissions` stays current — a bot promoted mid-run can do more
without restarting.

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
