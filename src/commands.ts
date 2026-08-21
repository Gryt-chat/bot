import type { Message, Permission } from "./types.ts";

/**
 * The command router.
 *
 * A prefix, a word, and the rest of the line. That is the whole model, and it
 * is deliberately not more: a bot that wants flags and quoting can parse
 * `ctx.rest` however it likes, and a router that tried to guess would be wrong
 * for half of them.
 */

export interface CommandContext {
  /** The message that invoked it. */
  message: Message;
  /** Everything after the command word, trimmed. Empty string, never null. */
  rest: string;
  /** `rest` split on whitespace, with empties dropped. */
  args: string[];
  /** Reply in the channel the command came from. */
  reply(text: string): Promise<void>;
  /** React to the message that invoked it. */
  react(emoji: string): Promise<void>;
}

export interface CommandOptions {
  /** One line, for the help listing. */
  description?: string;
  /**
   * Permissions the *bot* needs before this command is worth offering.
   *
   * Checked before the handler runs, so a command that replies is skipped
   * outright on a server where the bot may not post — rather than running,
   * failing at the socket, and leaving whoever typed it watching nothing
   * happen. This is about the bot, not about the person who typed it: what
   * *they* may do is the server's business and it is already enforcing it.
   */
  requires?: Permission[];
}

export interface RegisteredCommand extends CommandOptions {
  name: string;
  handler: (ctx: CommandContext) => void | Promise<void>;
}

/**
 * Which command a message invokes, if any.
 *
 * Case-insensitive on the command word, because somebody will type `!Help` and
 * being right about it helps nobody.
 */
export function parseCommand(
  text: string,
  prefix: string,
): { name: string; rest: string } | null {
  if (!prefix || !text.startsWith(prefix)) return null;

  const body = text.slice(prefix.length).trim();
  if (!body) return null;

  const match = /^(\S+)\s*([\s\S]*)$/.exec(body);
  if (!match) return null;

  return { name: match[1].toLowerCase(), rest: match[2].trim() };
}

export function splitArgs(rest: string): string[] {
  return rest.split(/\s+/).filter(Boolean);
}

/**
 * The default `help`, listing what the bot can actually do here.
 *
 * Commands the bot lacks the permissions for are left out rather than shown as
 * unavailable. A listing that offers things that will not work is worse than a
 * shorter listing.
 */
export function buildHelpText(
  commands: RegisteredCommand[],
  prefix: string,
  can: (permission: Permission) => boolean,
): string {
  const usable = commands.filter((c) => (c.requires ?? []).every(can));
  if (usable.length === 0) return "Nothing I can do here.";

  return usable
    .map((c) => `\`${prefix}${c.name}\`${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");
}
