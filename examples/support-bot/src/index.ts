/**
 * A support bot, meant to be copied and changed. The four things every Gryt bot gets right:
 * ask for the least that works, handle being told no, keep the key, do not answer yourself.
 */
import { readFileSync } from "node:fs";

import { GrytBot } from "@gryt/bot";

const faq: Record<string, string> = JSON.parse(
  readFileSync(new URL("../faq.json", import.meta.url), "utf8"),
);

const bot = new GrytBot({
  host: process.env.GRYT_HOST ?? "localhost:5001",
  nickname: process.env.GRYT_NICKNAME ?? "Support",
  description: "Answers common questions and welcomes new members",

  // Exactly what this bot uses, and nothing kept back for later. Reading is
  // what lets it see a question; sending is the answer; reacting is the wave.
  wants: ["read_messages", "send_messages", "add_reactions"],

  // Set when an admin created the registration in advance. Unset for knocking,
  // which is the normal way in.
  botToken: process.env.GRYT_BOT_TOKEN,

  // In a container, point this at a volume. See the Dockerfile.
  identityPath: process.env.GRYT_IDENTITY_PATH ?? "./gryt-bot-identity.json",
});

// ── Commands ────────────────────────────────────────────────────────

const topics = Object.keys(faq);

bot.command(
  "faq",
  async (ctx) => {
    const topic = ctx.args[0]?.toLowerCase();

    if (!topic) {
      await ctx.reply(
        `I know about: ${topics.map((t) => `\`${t}\``).join(", ")}.\n` +
          `Ask me with \`!faq voice\`.`,
      );
      return;
    }

    const answer = faq[topic];
    if (!answer) {
      // Says what it does know rather than only what it does not. A bot that
      // answers "unknown topic" and stops is a bot people ask once.
      await ctx.reply(
        `I have nothing on \`${topic}\`. I do know about: ${topics.join(", ")}.`,
      );
      return;
    }

    await ctx.reply(answer);
  },
  { description: "Answer a common question", requires: ["send_messages"] },
);

bot.command(
  "topics",
  async (ctx) => ctx.reply(topics.map((t) => `\`!faq ${t}\``).join("\n")),
  { description: "List what I know about", requires: ["send_messages"] },
);

// ── Waving at people ────────────────────────────────────────────────

bot.on("message", async (message) => {
  // The server posts arrivals as a system message. Reacting rather than replying, because a
  // channel where every arrival costs two lines is a channel people mute.
  if (!message.isSystem) return;
  if (!/joined the server/i.test(message.text ?? "")) return;

  // Checked rather than assumed: an admin may have approved this bot without
  // `add_reactions`, and finding that out from a red toast is worse than not waving.
  if (!bot.can("add_reactions")) return;

  await bot.react(message.conversationId, message.messageId, "👋");
});

// ── Lifecycle ───────────────────────────────────────────────────────

bot.on("waiting", (message) => {
  console.log(`[gryt] ${message}`);
  console.log("[gryt] An admin can let me in: Server settings → Bots.");
});

bot.on("ready", (info) => {
  console.log(`[gryt] Joined ${info.name}.`);
  console.log(`[gryt] I may: ${info.permissions.join(", ") || "nothing at all"}.`);
  if (!bot.can("send_messages")) {
    // Worth saying loudly. The bot is in, looks healthy, and cannot do the one
    // thing it exists for.
    console.warn("[gryt] I cannot post here, so !faq will not answer anybody.");
  }
});

// Every refusal, including the ones the SDK makes on the server's behalf.
bot.on("error", (err) => console.error("[gryt]", err.message));
bot.on("disconnected", (why) => console.warn("[gryt] disconnected:", why));

// Not awaited: on a first run there is nobody to answer yet, so the bot sits at the door.
// The catch is not optional — `start()` rejects, and an unhandled rejection ends the process.
bot.start().catch(() => {});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void bot.stop().then(() => process.exit(0));
  });
}
