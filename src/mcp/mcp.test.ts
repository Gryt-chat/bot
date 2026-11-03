import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Message } from "../types.ts";
import { handle } from "./protocol.ts";
import { makeTools, UNTRUSTED_NOTE, type BotLike, type Connection } from "./tools.ts";

const meta = { name: "gryt", version: "0.0.0", instructions: "test" };

function message(over: Partial<Message> = {}): Message {
  return {
    conversationId: "c1",
    messageId: "m1",
    senderServerUserId: "u1",
    senderNickname: "Ingy",
    text: "voice keeps cutting out",
    attachments: [],
    createdAt: new Date("2026-11-03T10:15:00Z"),
    editedAt: null,
    replyToMessageId: null,
    threadId: null,
    isSystem: false,
    isOwn: false,
    ...over,
  };
}

function setup(state: Connection["state"] = "ready") {
  const sent: unknown[] = [];
  const typed: unknown[] = [];
  const stopped: unknown[] = [];
  const used: string[] = [];
  const bot = {
    channels: [{ id: "c1", name: "general", type: "text" }],
    members: [],
    permissions: ["read_messages"],
    serverInfo: { serverId: "s", name: "S", description: "", permissions: [], role: "bot" },
    history: async () => ({ messages: [message()], threads: [], hasMore: false }),
    typing: (...args: unknown[]) => typed.push(args),
    stopTyping: (...args: unknown[]) => stopped.push(args),
    send: async (...args: unknown[]) => {
      sent.push(args);
      return message({ messageId: "m2", isOwn: true });
    },
  } as unknown as BotLike;
  const connections = new Map<string, Connection>([["pingy", { name: "pingy", host: "localhost:5001", bot, state, onUse: (d: string) => used.push(d) }]]);
  return { tools: makeTools(connections), sent, typed, stopped, used };
}

const call = (tools: ReturnType<typeof makeTools>, name: string, args: object) =>
  handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }), tools, meta) as Promise<{
    result: { content: { text: string }[]; isError?: boolean };
  }>;

describe("the MCP protocol", () => {
  it("answers initialize with tools as its only capability", async () => {
    const out = (await handle('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', [], meta)) as {
      result: { capabilities: object };
    };
    assert.deepEqual(out.result.capabilities, { tools: {} });
  });

  it("does not answer notifications, and rejects unknown methods", async () => {
    assert.equal(await handle('{"jsonrpc":"2.0","method":"notifications/initialized"}', [], meta), null);
    const out = (await handle('{"jsonrpc":"2.0","id":2,"method":"nope"}', [], meta)) as { error: { code: number } };
    assert.equal(out.error.code, -32601);
  });

  it("marks read tools read-only and the rest not", async () => {
    const { tools } = setup();
    const out = (await handle('{"jsonrpc":"2.0","id":3,"method":"tools/list"}', tools, meta)) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    const writes = out.result.tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
    assert.deepEqual(writes.sort(), ["delete_own_message", "send_message", "start_thread"]);
  });
});

describe("the tools", () => {
  it("reads a channel by name and marks member text as untrusted", async () => {
    const { tools } = setup();
    const out = await call(tools, "read_channel", { channel: "#General" });
    const text = out.result.content[0].text;
    assert.ok(text.startsWith(UNTRUSTED_NOTE));
    assert.match(text, /2026-11-03 10:15 Ingy \[m1\]: voice keeps cutting out/);
  });

  it("sends into a thread when given one", async () => {
    const { tools, sent } = setup();
    const out = await call(tools, "send_message", { channel: "general", text: "on it", thread_id: "t1" });
    assert.equal(out.result.content[0].text, "Posted in #general [m2].");
    assert.deepEqual(sent, [["c1", "on it", { replyTo: undefined, threadId: "t1" }]]);
  });

  it("shows typing at once, says what it is doing, and stops typing when it posts there", async () => {
    const { tools, typed, stopped, used } = setup();
    await call(tools, "show_typing", { channel: "general", thread_id: "t1" });
    assert.deepEqual(typed, [["c1", "t1"]]);
    assert.deepEqual(used, ["Reading #general"]);
    await call(tools, "send_message", { channel: "general", text: "done", thread_id: "t1" });
    assert.deepEqual(stopped, [["c1", "t1"]]);
  });

  it("tells the model what to do when the bot is still waiting at the door", async () => {
    const { tools } = setup("waiting");
    const out = await call(tools, "list_channels", {});
    assert.equal(out.result.isError, true);
    assert.match(out.result.content[0].text, /Server settings → Bots/);
  });

  it("names the known servers for an unknown one", async () => {
    const { tools } = setup();
    const out = await call(tools, "list_channels", { server: "elsewhere" });
    assert.match(out.result.content[0].text, /Known: pingy/);
  });
});
