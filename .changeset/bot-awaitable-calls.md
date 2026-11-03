---
"@gryt/bot": minor
---

Calls that return what the server answered: `history`, `thread`, `search`, `startThread` and `diagnostics`. `send` now resolves with the message it posted, and takes `replyTo` and `threadId`. `bot.members` and `bot.channels` hold the last lists the server sent, and a `Message` carries its `threadId`.
