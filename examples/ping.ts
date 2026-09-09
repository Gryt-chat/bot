/**
 * The smallest useful bot. The first run knocks and waits for an admin, and writes
 * `gryt-bot-identity.json` — that file is the bot; lose it and the server sees a stranger.
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

// Not awaited: on a first run there is nobody to answer yet, so the bot sits at the door.
// The catch is not optional — `start()` rejects, and an unhandled rejection ends the process.
bot.start().catch(() => {});

process.on("SIGINT", () => {
  void bot.stop().then(() => process.exit(0));
});
