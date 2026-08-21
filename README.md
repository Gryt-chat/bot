<div align="center">
  <img src="https://raw.githubusercontent.com/Gryt-chat/client/main/public/logo.svg" width="80" alt="Gryt logo" />
  <h1>@gryt/bot</h1>
  <p>Write bots for <a href="https://github.com/Gryt-chat/gryt">Gryt</a> in TypeScript.<br />Identity, the join handshake, a typed event stream and a command router.</p>
</div>

<br />

```sh
npm install @gryt/bot
```

```ts
import { GrytBot } from "@gryt/bot";

const bot = new GrytBot({
  host: "chat.example.com",
  nickname: "Helper",
  wants: ["read_messages", "send_messages"],
  description: "Answers questions in #support",
});

bot.command("ping", async (ctx) => ctx.reply("pong"), {
  description: "Check I am alive",
  requires: ["send_messages"],
});

void bot.start();
```

There is a bot you can copy and run in
[`examples/support-bot`](examples/support-bot), with a Dockerfile and a compose
file, and the full guide is at
[docs.gryt.chat/docs/bot](https://docs.gryt.chat/docs/bot).

## A bot is a member, and cannot pretend to be a person

A bot joins the way any other client does — a key it holds, a self-signed
certificate, and a challenge-response over P-256. There is no bot account type,
no bot token and no bot bypass. What a bot may do is what an admin agreed to let
it do, enforced by the checks that apply to everybody.

What it is *not* is a person, and the server goes to some trouble about it. Bot
identities live in their own namespace with a `BOT_` prefix, so a bot can never
hold an id a person could hold. Every surface that shows a member shows a **BOT**
tag beside the name — in the member list and on every message — derived from the
identity rather than from anything the bot sends. People cannot take bot-shaped
names either.

## How a bot gets in

It knocks. The bot starts knowing only the server's address, says what it is
called and what it wants to be allowed to do, and waits. An admin opens **Server
settings → Bots**, unticks anything they would rather it did not have, and lets
it in. The approval arrives without a restart.

Nothing to configure on the server, no invite, and no restart. For a compose
file or CI, where nobody is watching the first launch, an admin can write the
registration in advance and hand over a single-use token instead.

## What a bot asks for is fixed

The first declaration is the only one. A later run asking for more gets the
answer to the question the first one asked, and the server will not record the
new list at all — a bot cannot change its own name after approval either.

That is not about the person writing the bot. It is about the run that is *not*
theirs, after a published image has been taken over. A bot that has been
tampered with can ask for the keys to the building as often as it likes and will
keep holding exactly what an admin agreed to. If a bot genuinely needs more, an
admin makes a new registration.

## What it will not do for you

The SDK reports and the bot decides, which is the same split `@gryt/voice`
draws. It raises no toasts, retries no business logic, and has no opinion about
what a message means.

Where it does step in is permissions, because that is the failure that is
otherwise invisible. `bot.can()` answers from what the server said rather than
what you hoped. `bot.send()` throws naming the permission before it emits
anything, so the stack trace points at your call rather than at a socket
handler. Commands declare what they need and are skipped rather than attempted,
so nobody types a command and watches nothing happen.

## The key file is the bot

The identity is derived from a key, so `gryt-bot-identity.json` **is** the bot.
Keep it and the bot keeps its permissions, its name and its history across
restarts. Lose it and the server sees a stranger knocking, holding nothing.

In a container that means a volume. The example's compose file has one, and says
why in the place where leaving it out would be easy.

## Issues

Please report bugs and request features in the
[main Gryt repository](https://github.com/Gryt-chat/gryt/issues).

## Sponsors

What sponsoring pays for, the tiers, and everyone who has sponsored:
[gryt.chat/sponsors](https://gryt.chat/sponsors). To sponsor:
[GitHub Sponsors](https://github.com/sponsors/Gryt-chat).

The list itself lives in the [Gryt README](https://github.com/Gryt-chat/gryt#sponsors),
in one place rather than ten, so it cannot fall out of step across repositories.

## License

[AGPL-3.0](https://github.com/Gryt-chat/gryt/blob/main/LICENSE) — Part of [Gryt](https://github.com/Gryt-chat/gryt)

[`@gryt/ui`](https://github.com/Gryt-chat/ui) is the exception in this org, and
deliberately so: it is generic components with nothing of Gryt in them, and
copyleft there would rule out most of the people who might use it.

This is not that. The identity handshake and the permission model are Gryt's own
rules rather than scaffolding around them, and a bot SDK is the piece somebody
would most plausibly fork into a closed service. Copyleft here means a modified
version run as a service publishes its changes, which is the same reason the
apps and the voice engine are AGPL.

It is still yours to embed, self-host and modify. The licence only bites for
running a modified version as a closed service.
