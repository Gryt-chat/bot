---
"@gryt/bot": minor
---

A bot can show it's typing (`typing`), set the line under its name (`setActivity`) and upload its own avatar (`setAvatar`), the same way a person does. `gryt-mcp` uses all three: a `show_typing` tool for while the AI works out a reply, "Reading #general" under its name while it's working, and `--avatar <file>` for its picture. It now also asks for `set_activity` and `upload_avatar_image` when it knocks.
