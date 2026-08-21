/**
 * The smallest useful bot.
 *
 * Run it against a local dev server:
 *
 *   GRYT_HOST=localhost:5001 node --experimental-strip-types examples/ping.ts
 *
 * The first run knocks and waits: the bot turns up, says what it wants, and an
 * admin answers it in Server settings → Bots. Nothing to configure on the
 * server, no invite, no restart. Leave it running — the approval arrives
 * without a reconnect.
 *
 * The first run also writes `gryt-bot-identity.json`. That file is the bot:
 * keep it and the bot keeps its permissions, lose it and the server sees a
 * stranger asking to join again.
 */
import { GrytBot } from "../src/index.ts";

const bot = new GrytBot({
  host: process.env.GRYT_HOST ?? "localhost:5001",
  nickname: process.env.GRYT_NICKNAME ?? "Pingbot",
  // What to ask for. Ask for the least that works — an operator looking at a
  // long list is being asked to trust more than they can check.
  wants: ["read_messages", "send_messages"],
  description: "Answers !ping. Not much else.",
  // Set when an admin made a registration in advance; unset for knocking.
  botToken: process.env.GRYT_BOT_TOKEN,
});

bot.command("ping", async (ctx) => ctx.reply("pong"), {
  description: "Check I am alive",
  requires: ["send_messages"],
});

bot.command(
  "whoami",
  async (ctx) => {
    const info = bot.serverInfo;
    await ctx.reply(
      `You are \`${ctx.message.senderServerUserId}\`. ` +
        `I am a \`${info?.role}\` and I hold: ${bot.permissions.join(", ") || "nothing"}.`,
    );
  },
  { description: "What I know about you and about me", requires: ["send_messages"] },
);

// Every refusal the server makes arrives here, including the ones this SDK
// makes on its behalf. Worth logging in anything you actually deploy.
bot.on("error", (err) => console.error("[gryt]", err.message));

bot.on("waiting", (message) => console.log("[gryt]", message));

bot.on("disconnected", (reason) => console.warn("[gryt] disconnected:", reason));

bot.on("ready", (info) =>
  console.log(
    `Joined ${info.name}. ` +
      `I may: ${info.permissions.join(", ") || "nothing — an admin ticked none of what I asked for"}.`,
  ),
);

// Not awaited: on a first run there is nobody to answer yet, and the bot should
// sit at the door rather than exit. The catch is not optional — `start()`
// rejects when the server refuses, and an unhandled rejection takes the process
// down. Every refusal has already been reported through `error` above, so there
// is nothing to do here but let it be handled.
bot.start().catch(() => {});

process.on("SIGINT", () => {
  void bot.stop().then(() => process.exit(0));
});
