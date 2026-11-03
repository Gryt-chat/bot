#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GrytBot } from "../client.ts";
import { loadIdentity } from "../identity.ts";
import { serveStdio } from "./protocol.ts";
import { makeTools, UNTRUSTED_NOTE, type Connection } from "./tools.ts";

/** What the bot asks for when it knocks. The owner unticks what they don't want, per server. */
const WANTS = [
  "read_messages",
  "view_members",
  "send_messages",
  "delete_own_messages",
  "view_diagnostics",
  "set_activity",
  "upload_avatar_image",
];

/** How long "Reading #general" stays under the name after the last tool call. */
const IDLE_MS = 2 * 60_000;

function parseArgs(argv: string[]) {
  const servers = new Map<string, string>();
  let identityPath = join(homedir(), ".config", "gryt-mcp", "identity.json");
  let nickname = "Gryt";
  // RoboGryt unless told otherwise; "none" leaves the owl the server draws.
  let avatar: string | undefined = fileURLToPath(new URL("../../assets/robogryt.png", import.meta.url));
  const fromEnv = (process.env.GRYT_MCP_SERVERS ?? "").split(",").filter(Boolean);
  const pairs: string[] = [...fromEnv];
  for (let i = 0; i < argv.length - 1; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--server") pairs.push(value);
    else if (flag === "--identity") identityPath = value;
    else if (flag === "--nickname") nickname = value;
    else if (flag === "--avatar") avatar = value === "none" ? undefined : value;
  }
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    const [name, host] = eq > 0 ? [pair.slice(0, eq), pair.slice(eq + 1)] : [pair, pair];
    servers.set(name.trim(), host.trim());
  }
  return { servers, identityPath, nickname, avatar };
}

const { servers, identityPath, nickname, avatar } = parseArgs(process.argv.slice(2));
if (servers.size === 0) {
  console.error("gryt-mcp: give at least one --server name=host (or GRYT_MCP_SERVERS=name=host,...).");
  process.exit(2);
}

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
const identity = await loadIdentity(identityPath);
const connections = new Map<string, Connection>();
const avatarBytes = avatar ? readFileSync(avatar) : null;
const avatarHash = avatarBytes ? createHash("sha256").update(avatarBytes).digest("hex") : "";
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

/** Uploads once per picture per server: the hash of the last one sent sits next to the key. */
async function syncAvatar(name: string, bot: GrytBot): Promise<void> {
  if (!avatar || !avatarBytes || !bot.can("upload_avatar_image")) return;
  const marker = join(dirname(identityPath), `avatar-${name}.sha256`);
  let sent = "";
  try {
    sent = readFileSync(marker, "utf8").trim();
  } catch {
    // Never sent one to this server.
  }
  if (sent === avatarHash) return;
  await bot.setAvatar(avatarBytes, `gryt-mcp${extname(avatar)}`, MIME[extname(avatar).toLowerCase()] ?? "image/png");
  writeFileSync(marker, avatarHash, { mode: 0o600 });
}

for (const [name, host] of servers) {
  const bot = new GrytBot({
    host,
    identity,
    nickname,
    wants: WANTS,
    description: "An AI assistant working for this server's owner, through MCP. It only posts when they approve.",
    prefix: "",
    helpCommand: false,
  });
  let shown = "";
  let idle: NodeJS.Timeout | undefined;
  const c: Connection = {
    name,
    host,
    bot,
    state: "connecting",
    onUse: (doing) => {
      if (!bot.can("set_activity")) return;
      if (doing !== shown) bot.setActivity((shown = doing));
      clearTimeout(idle);
      idle = setTimeout(() => {
        shown = "";
        bot.setActivity(null);
      }, IDLE_MS);
      idle.unref?.();
    },
  };
  connections.set(name, c);
  bot.on("waiting", (message) => Object.assign(c, { state: "waiting", detail: message }));
  // `ready` fires once; `channels` comes with every server:details, including after a reconnect.
  bot.on("channels", () => {
    Object.assign(c, { state: "ready", detail: undefined });
    syncAvatar(name, bot).catch((err: Error) => console.error(`[gryt-mcp] ${name}: avatar: ${err.message}`));
  });
  bot.on("disconnected", (reason) => {
    // The server holds the activity on the connection, so a reconnect starts without one.
    shown = "";
    Object.assign(c, { state: "connecting", detail: reason });
  });
  bot.on("error", (err) => {
    if (c.state !== "ready") Object.assign(c, { state: "failed", detail: err.message });
    console.error(`[gryt-mcp] ${name}: ${err.message}`);
  });
  bot.start().catch((err: Error) => Object.assign(c, { state: "failed", detail: err.message }));
}

console.error(`[gryt-mcp] ${identity.subject} on ${[...servers.keys()].join(", ")}`);

serveStdio(makeTools(connections), {
  name: "gryt",
  version,
  instructions: [
    "Read and act on Gryt chat servers as a bot member. Start with list_servers.",
    UNTRUSTED_NOTE,
    "Post only when the person you work for asked you to. Posts show a BOT tag.",
  ].join(" "),
});
