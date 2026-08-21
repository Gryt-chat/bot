# Support bot

A Gryt bot you can copy, change, and run. It answers questions out of
`faq.json` and waves at people when they arrive.

That is deliberately not much. What it is showing is the shape: what to ask
for, what to do when an admin says no, and where to put the key.

## Run it

```bash
cp .env.example .env      # set GRYT_HOST
docker compose up -d
docker compose logs -f
```

The first launch says this and stops there:

```
[gryt] This bot is waiting to be approved by a server admin.
[gryt] An admin can let me in: Server settings → Bots.
```

**Leave it running.** An admin opens **Server settings → Bots**, sees it asking
for *read messages*, *send messages* and *add reactions*, unticks anything they
would rather it did not have, and lets it in. The approval reaches the bot
without a restart.

Then say `!faq` in a channel.

### Without Docker

```bash
yarn install
GRYT_HOST=chat.example.com yarn start
```

## Make it yours

| Change | Where |
|---|---|
| The answers | `faq.json` |
| The commands | `bot.command(...)` in `src/index.ts` |
| What it asks for | `wants` in `src/index.ts` |
| What it is called | `GRYT_NICKNAME`, until an admin renames it |

Nothing here depends on the rest of the repository — `@gryt/bot` comes from npm
— so copying the folder somewhere else is all it takes.

## Two things to get right

**Keep the identity file.** `gryt-bot-identity.json` *is* the bot — the id the
server knows it by is derived from the key inside it. The compose file puts it
on a volume. Without one, every restart is a stranger knocking again with none
of the permissions the last one was given.

**Ask for the least that works.** `wants` is the list an admin sees, and every
permission on it is one they have to decide about. A long list is one they
cannot check, and the ones they untick are the ones you will find out about at
runtime — so check `bot.can()` before doing anything that needs a permission,
the way the wave does.

## What it cannot do

It cannot ask for more later. What a bot declares the first time it turns up is
recorded then and never rewritten: a later run asking for more gets the answer
to the question the first one asked, and cannot change its own name either.

That is not about you — it is about the run that is not yours, after an image
has been taken over. If a bot genuinely needs more, an admin makes a new
registration.
