import { EventEmitter } from "node:events";

import { decodeJwt } from "jose";
import { io, type Socket } from "socket.io-client";

import {
  buildHelpText,
  parseCommand,
  splitArgs,
  type CommandContext,
  type CommandOptions,
  type RegisteredCommand,
} from "./commands.ts";
import { loadIdentity, type BotIdentity } from "./identity.ts";
import { PERMISSIONS_BEFORE_CATALOGUE } from "./permissions.ts";
import type {
  Attachment,
  Channel,
  JoinRefusal,
  Member,
  Message,
  Permission,
  ServerInfo,
} from "./types.ts";

export interface GrytBotOptions {
  /** `chat.example.com`, or `localhost:5001`. Scheme optional. */
  host: string;
  /** What the member list will call it. */
  nickname?: string;
  /** Where the key lives. The file *is* the bot — see identity.ts. */
  identityPath?: string;
  /** An already-loaded identity, if you keep the key somewhere of your own. */
  identity?: BotIdentity;
  /** Needed unless the server's join policy is `open`. */
  inviteCode?: string;
  /** The command prefix. Set to "" to turn the router off entirely. */
  prefix?: string;
  /** Whether to answer `help` with a listing. On by default. */
  helpCommand?: boolean;
  /** Force http/https rather than guessing from the host. */
  secure?: boolean;
}

export interface GrytBotEvents {
  ready: [ServerInfo];
  message: [Message];
  members: [Member[]];
  channels: [Channel[]];
  /** Something the server refused. Always worth logging; often a permission. */
  error: [Error];
  disconnected: [string];
}

const DEFAULT_PREFIX = "!";
const DEFAULT_IDENTITY_PATH = "./gryt-bot-identity.json";

/** Refresh a little before the 15-minute access token actually expires. */
const TOKEN_REFRESH_MS = 10 * 60 * 1000;

function httpBase(host: string, secure?: boolean): string {
  if (/^https?:\/\//.test(host)) return host.replace(/\/+$/, "");
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
  const scheme = secure ?? !isLocal ? "https" : "http";
  return `${scheme}://${host.replace(/\/+$/, "")}`;
}

function toDate(value: unknown): Date {
  const d = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(d.getTime()) ? d : new Date(0);
}

/**
 * A bot on one Gryt server.
 *
 * It joins the way any other client does — a self-signed certificate and a
 * challenge-response over P-256 — and from the server's point of view it is a
 * member like any other. That is the whole design: there is no bot account
 * type, no bot token, and no bot bypass. What a bot may do is what its role
 * says, enforced by the same checks that apply to a person, and the operator
 * hands it a role in the same editor.
 *
 * Which means the interesting failure is a *permission* failure, and this class
 * is built around making that legible. `bot.can()` answers from what the server
 * said; sending without the permission throws here with the permission's name
 * rather than emitting into the void and getting a `server:error` back a moment
 * later with no clue which call caused it.
 *
 * ```ts
 * const bot = new GrytBot({ host: "localhost:5001", nickname: "Helper" });
 *
 * bot.command("ping", async (ctx) => ctx.reply("pong"), {
 *   description: "Check I am alive",
 *   requires: ["send_messages"],
 * });
 *
 * await bot.start();
 * ```
 */
export class GrytBot extends EventEmitter<GrytBotEvents> {
  readonly host: string;

  private readonly options: GrytBotOptions;
  private readonly commands = new Map<string, RegisteredCommand>();

  private identity: BotIdentity | null = null;
  private connection: Socket | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  private info: ServerInfo | null = null;
  private permissionSet = new Set<Permission>();
  private serverKnows = new Set<Permission>(PERMISSIONS_BEFORE_CATALOGUE);
  private serverUserId: string | null = null;
  private stopped = false;

  constructor(options: GrytBotOptions) {
    super();
    this.options = options;
    this.host = options.host;

    if (options.helpCommand !== false) {
      this.command(
        "help",
        async (ctx) => {
          ctx.reply(buildHelpText([...this.commands.values()], this.prefix, (p) => this.can(p)));
        },
        { description: "What I can do here", requires: ["send_messages"] },
      );
    }
  }

  get prefix(): string {
    return this.options.prefix ?? DEFAULT_PREFIX;
  }

  /** The raw socket, for anything this SDK does not wrap. Null until started. */
  get socket(): Socket | null {
    return this.connection;
  }

  /** What the server says this bot may do here. Empty until `ready`. */
  get permissions(): Permission[] {
    return [...this.permissionSet];
  }

  /** The server's own view of this bot. Null until `ready`. */
  get serverInfo(): ServerInfo | null {
    return this.info;
  }

  /**
   * Whether the bot holds a permission.
   *
   * False before `ready`, deliberately: a bot that acts on what it assumes it
   * may do, before the server has said, is a bot that discovers it was wrong
   * over the wire.
   *
   * True for a permission the server's own catalogue does not contain. That is
   * a server older than the permission, and a server cannot be withholding
   * something it has never heard of — reading the absence as a refusal would
   * mean an SDK that knows about `read_messages` refusing to read on every
   * server that has not been upgraded yet.
   */
  can(permission: Permission): boolean {
    if (this.info === null) return false;
    return this.permissionSet.has(permission) || !this.serverKnows.has(permission);
  }

  /** Register a command. Later registrations of the same name replace earlier. */
  command(
    name: string,
    handler: (ctx: CommandContext) => void | Promise<void>,
    options: CommandOptions = {},
  ): this {
    this.commands.set(name.toLowerCase(), { name: name.toLowerCase(), handler, ...options });
    return this;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  /** Connect, join, and resolve once the server has said who this bot is. */
  async start(): Promise<ServerInfo> {
    this.identity =
      this.options.identity ??
      (await loadIdentity(this.options.identityPath ?? DEFAULT_IDENTITY_PATH));

    const socket = io(httpBase(this.host, this.options.secure), {
      transports: ["websocket"],
      // Reconnection is the socket's job. Rejoining after one is this class's,
      // and it happens on `connect` rather than being scheduled separately.
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
    });
    this.connection = socket;

    this.wire(socket);

    return new Promise<ServerInfo>((resolve, reject) => {
      const onReady = (info: ServerInfo) => {
        cleanup();
        resolve(info);
      };
      const onFail = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        this.off("ready", onReady);
        this.off("error", onFail);
      };
      this.once("ready", onReady);
      this.once("error", onFail);
    });
  }

  /** Leave, and stop reconnecting. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.connection?.disconnect();
    this.connection = null;
  }

  // ── Actions ───────────────────────────────────────────────────────

  /**
   * Post in a channel.
   *
   * Throws before sending anything if the bot lacks `send_messages`, naming
   * the permission. The server would refuse it anyway; failing here means the
   * stack trace points at the call rather than at a socket handler.
   */
  async send(conversationId: string, text: string): Promise<void> {
    this.require("send_messages");
    this.emitAuthed("chat:send", { conversationId, text });
  }

  async react(conversationId: string, messageId: string, reactionSrc: string): Promise<void> {
    this.require("add_reactions");
    this.emitAuthed("chat:react", { conversationId, messageId, reactionSrc });
  }

  /**
   * Delete a message.
   *
   * Its own is `delete_own_messages`; anybody else's is `manage_messages`. The
   * caller says which it is, because the bot does not necessarily know who sent
   * a message it was handed.
   */
  async delete(
    conversationId: string,
    messageId: string,
    opts: { own?: boolean } = {},
  ): Promise<void> {
    this.require(opts.own ? "delete_own_messages" : "manage_messages");
    this.emitAuthed("chat:delete", { conversationId, messageId });
  }

  /** Ask for the last N messages in a channel. Answered on the `message` event. */
  async fetch(conversationId: string, limit = 50): Promise<void> {
    this.require("read_messages");
    this.connection?.emit("chat:fetch", { conversationId, limit });
  }

  // ── Internals ─────────────────────────────────────────────────────

  private require(permission: Permission): void {
    if (this.permissionSet.has(permission)) return;
    throw new Error(
      `This bot does not have "${permission}" on ${this.host}. ` +
        `Give its role that permission in the server's role editor. ` +
        `It currently holds: ${this.permissions.join(", ") || "nothing"}.`,
    );
  }

  private emitAuthed(event: string, payload: Record<string, unknown>): void {
    if (!this.connection || !this.accessToken) {
      throw new Error(`Not joined to ${this.host} yet — await bot.start() first.`);
    }
    this.connection.emit(event, { ...payload, accessToken: this.accessToken });
  }

  private wire(socket: Socket): void {
    socket.on("connect", () => {
      void this.join(socket);
    });

    socket.on("disconnect", (reason: string) => {
      this.accessToken = null;
      this.emit("disconnected", reason);
    });

    socket.on("server:challenge", (challenge: { nonce: string; serverHost: string; identityTiers?: string[] }) => {
      void this.answerChallenge(socket, challenge);
    });

    socket.on("server:joined", (payload: { accessToken: string; refreshToken: string }) => {
      this.accessToken = payload.accessToken;
      this.refreshToken = payload.refreshToken;
      this.rememberSelf(payload.accessToken);
      this.scheduleRefresh();
    });

    socket.on("token:refreshed", (payload: { accessToken: string }) => {
      this.accessToken = payload.accessToken;
      this.scheduleRefresh();
    });

    socket.on("server:details", (details: unknown) => {
      this.absorbDetails(details);
    });

    socket.on("members:list", (members: unknown) => {
      if (Array.isArray(members)) this.emit("members", members as Member[]);
    });

    socket.on("chat:new", (raw: unknown) => {
      const message = this.toMessage(raw);
      if (!message) return;
      // A bot answering its own messages is the first thing anybody writes by
      // accident, and it loops.
      if (message.isOwn) return;
      this.emit("message", message);
      void this.runCommands(message);
    });

    socket.on("server:error", (payload: JoinRefusal | string) => {
      this.emit("error", this.toError(payload));
    });

    socket.on("chat:error", (payload: JoinRefusal | string) => {
      this.emit("error", this.toError(payload));
    });
  }

  private toError(payload: JoinRefusal | string): Error {
    if (typeof payload === "string") return new Error(payload);
    const err = new Error(payload?.message || payload?.code || "Server refused");
    (err as Error & { code?: string }).code = payload?.code;
    return err;
  }

  private async join(socket: Socket): Promise<void> {
    if (this.stopped) return;
    socket.emit("server:join", {
      nickname: this.options.nickname ?? "Bot",
      inviteCode: this.options.inviteCode,
    });
  }

  private async answerChallenge(
    socket: Socket,
    challenge: { nonce: string; serverHost: string; identityTiers?: string[] },
  ): Promise<void> {
    const identity = this.identity;
    if (!identity) return;

    // The server says which identity tiers it takes, in the challenge itself.
    // Checking here turns the most common deployment mistake from "certificate
    // rejected" into a sentence naming the environment variable to change.
    if (challenge.identityTiers && !challenge.identityTiers.includes("local")) {
      this.emit(
        "error",
        new Error(
          `${this.host} does not accept self-signed identities, which is the only kind a bot has. ` +
            `The operator needs GRYT_IDENTITY_TIERS to include "local" ` +
            `(it currently accepts: ${challenge.identityTiers.join(", ")}).`,
        ),
      );
      return;
    }

    try {
      const [certificate, assertion] = await Promise.all([
        identity.certificate(),
        identity.assertion(challenge.serverHost, challenge.nonce),
      ]);
      socket.emit("server:verify", { certificate, assertion });
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.stopped || !this.refreshToken) return;

    this.refreshTimer = setTimeout(() => {
      this.connection?.emit("token:refresh", { refreshToken: this.refreshToken });
    }, TOKEN_REFRESH_MS);
    // A pending refresh should not be the reason a process cannot exit.
    this.refreshTimer.unref?.();
  }

  private absorbDetails(details: unknown): void {
    const d = details as {
      server_info?: {
        server_id?: string;
        name?: string;
        description?: string;
        permissions?: string[];
        permission_catalogue?: string[];
        role?: string;
      };
      channels?: Channel[];
      error?: string;
    };
    if (!d?.server_info) return;

    const wasReady = this.info !== null;

    this.permissionSet = new Set(d.server_info.permissions ?? []);
    this.serverKnows = new Set(
      d.server_info.permission_catalogue ?? PERMISSIONS_BEFORE_CATALOGUE,
    );
    this.info = {
      serverId: d.server_info.server_id ?? "",
      name: d.server_info.name ?? this.host,
      description: d.server_info.description ?? "",
      permissions: [...this.permissionSet],
      role: d.server_info.role ?? "",
    };

    if (Array.isArray(d.channels)) this.emit("channels", d.channels);

    // `server:details` is re-sent whenever anybody's role changes, so this is
    // also how a bot learns it has been promoted or demoted mid-run. Only the
    // first one is `ready`.
    if (!wasReady) this.emit("ready", this.info);
  }

  private toMessage(raw: unknown): Message | null {
    const m = raw as {
      conversation_id?: string;
      message_id?: string;
      sender_server_id?: string;
      sender_nickname?: string | null;
      text?: string | null;
      created_at?: string;
      edited_at?: string | null;
      reply_to_message_id?: string | null;
      enriched_attachments?: Attachment[];
    };
    if (!m?.conversation_id || !m?.message_id) return null;

    const sender = m.sender_server_id ?? "";
    return {
      conversationId: m.conversation_id,
      messageId: m.message_id,
      senderServerUserId: sender,
      senderNickname: m.sender_nickname ?? null,
      text: m.text ?? null,
      attachments: m.enriched_attachments ?? [],
      createdAt: toDate(m.created_at),
      editedAt: m.edited_at ? toDate(m.edited_at) : null,
      replyToMessageId: m.reply_to_message_id ?? null,
      isSystem: sender === "system",
      isOwn: sender !== "" && sender === this.serverUserId,
    };
  }

  private async runCommands(message: Message): Promise<void> {
    if (!this.prefix || !message.text || message.isSystem) return;

    const parsed = parseCommand(message.text, this.prefix);
    if (!parsed) return;

    const command = this.commands.get(parsed.name);
    if (!command) return;

    // Skipped rather than attempted. A command that needs `send_messages` on a
    // server where the bot may not post would otherwise run, fail at the
    // socket, and leave whoever typed it watching nothing happen.
    const missing = (command.requires ?? []).filter((p) => !this.can(p));
    if (missing.length > 0) {
      this.emit(
        "error",
        new Error(
          `Skipped "${parsed.name}": this bot is missing ${missing.join(", ")} on ${this.host}.`,
        ),
      );
      return;
    }

    const ctx: CommandContext = {
      message,
      rest: parsed.rest,
      args: splitArgs(parsed.rest),
      reply: (text: string) => this.send(message.conversationId, text),
      react: (emoji: string) => this.react(message.conversationId, message.messageId, emoji),
    };

    try {
      await command.handler(ctx);
    } catch (err) {
      // A throwing handler must not take the bot down. It is somebody else's
      // code and it is running on every message that matches.
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Read this bot's own id out of the token it was just handed.
   *
   * Not verified, and it does not need to be: the server issued this token to
   * this socket a moment ago, and the only thing read out of it is used to
   * decide whether a message is the bot's own. Nothing is authorised on it —
   * the server is doing that, against the same token.
   *
   * The id is not in `server:joined` itself, which is why it comes from here.
   */
  private rememberSelf(accessToken: string): void {
    try {
      const claims = decodeJwt(accessToken) as { serverUserId?: string };
      if (claims.serverUserId) this.serverUserId = claims.serverUserId;
    } catch {
      // Leaves `isOwn` false, so the bot may answer itself. Better than
      // refusing to start over a field only used for that.
    }
  }
}
