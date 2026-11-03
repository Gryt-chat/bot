# @gryt/bot

## 0.3.1

### Patch Changes

- 901d4ab: `gryt-mcp` uses RoboGryt, the owl robot, as its avatar unless you pass `--avatar <file>`, or `--avatar none` to keep the server's default.

## 0.3.0

### Minor Changes

- 68e75ae: A bot can show it's typing (`typing`), set the line under its name (`setActivity`) and upload its own avatar (`setAvatar`), the same way a person does. `gryt-mcp` uses all three: a `show_typing` tool for while the AI works out a reply, "Reading #general" under its name while it's working, and `--avatar <file>` for its picture. It now also asks for `set_activity` and `upload_avatar_image` when it knocks.

## 0.2.0

### Minor Changes

- ba391fc: Calls that return what the server answered: `history`, `thread`, `search`, `startThread` and `diagnostics`. `send` now resolves with the message it posted, and takes `replyTo` and `threadId`. `bot.members` and `bot.channels` hold the last lists the server sent, and a `Message` carries its `threadId`.
- 76972d9: `gryt-mcp`: an MCP server, so an AI assistant like Claude Code can read and act on your Gryt servers as a bot. It knocks like any bot, and you approve it in Server settings → Bots and untick what it shouldn't do. It reads channels, threads, search and the member list. With `view_diagnostics` it reads voice rooms, latency and SFU numbers too. It can post, start threads and delete its own messages, and MCP clients ask you before each of those.

## 0.1.1

### Patch Changes

- e312a2d: Examples no longer exit when a server refuses the join. `bot.start()` rejects on
  a refusal, and leaving that unhandled took the process down straight after the
  `error` handler had explained the problem — which turns a bot waiting to be
  approved into a restart loop.
