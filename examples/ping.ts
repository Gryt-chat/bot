/**
 * The smallest useful bot.
 *
 * Run it against a local dev server:
 *
 *   GRYT_HOST=localhost:5001 node --experimental-strip-types examples/ping.ts
 *
 * The server has to accept self-signed identities — `GRYT_IDENTITY_TIERS` must
 * include `local`, which is not the default — and unless its join policy is
 * `open` you will need `GRYT_INVITE` too. The bot tells you which of those is
 * wrong rather than making you guess.
 *
 * The first run writes `gryt-bot-identity.json`. That file is the bot: keep it
 * and the bot keeps its role and its history, lose it and the server sees a
 * stranger.
 */
import { GrytBot } from "../src/index.ts";

const bot = new GrytBot({
  host: process.env.GRYT_HOST ?? "localhost:5001",
  nickname: process.env.GRYT_NICKNAME ?? "Pingbot",
  inviteCode: process.env.GRYT_INVITE,
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

bot.on("disconnected", (reason) => console.warn("[gryt] disconnected:", reason));

const info = await bot.start();
console.log(
  `Joined ${info.name} as ${info.role}. ` +
    `Permissions: ${info.permissions.join(", ") || "none — give my role something in the role editor"}.`,
);

process.on("SIGINT", () => {
  void bot.stop().then(() => process.exit(0));
});
