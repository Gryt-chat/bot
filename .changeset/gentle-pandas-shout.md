---
"@gryt/bot": patch
---

Examples no longer exit when a server refuses the join. `bot.start()` rejects on
a refusal, and leaving that unhandled took the process down straight after the
`error` handler had explained the problem — which turns a bot waiting to be
approved into a restart loop.
