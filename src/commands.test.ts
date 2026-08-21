import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildHelpText, parseCommand, splitArgs } from "./commands.ts";

describe("parsing a command out of a message", () => {
  it("takes the first word after the prefix", () => {
    assert.deepEqual(parseCommand("!ping", "!"), { name: "ping", rest: "" });
    assert.deepEqual(parseCommand("!say hello there", "!"), {
      name: "say",
      rest: "hello there",
    });
  });

  it("is case-insensitive on the name", () => {
    // Somebody will type !Help, and being right about it helps nobody.
    assert.equal(parseCommand("!HELP", "!")?.name, "help");
  });

  it("ignores anything that is not a command", () => {
    for (const text of ["hello", "", "  ", "?ping", "! ", "!"]) {
      assert.equal(parseCommand(text, "!"), null, JSON.stringify(text));
    }
  });

  it("treats an empty prefix as the router being off", () => {
    // Otherwise every message is a command, which is a very bad default to
    // arrive at by leaving a config field blank.
    assert.equal(parseCommand("ping", ""), null);
  });

  it("keeps newlines in the rest", () => {
    const parsed = parseCommand("!note first\nsecond", "!");
    assert.equal(parsed?.rest, "first\nsecond");
  });

  it("handles a multi-character prefix", () => {
    assert.deepEqual(parseCommand("gryt: ping now", "gryt:"), {
      name: "ping",
      rest: "now",
    });
  });
});

describe("splitting arguments", () => {
  it("drops the empties", () => {
    assert.deepEqual(splitArgs("  a   b  "), ["a", "b"]);
    assert.deepEqual(splitArgs(""), []);
  });
});

describe("the help listing", () => {
  const commands = [
    { name: "ping", description: "Check I am alive", handler: () => {} },
    { name: "say", description: "Repeat something", requires: ["send_messages"], handler: () => {} },
    { name: "purge", description: "Delete messages", requires: ["manage_messages"], handler: () => {} },
  ];

  it("leaves out what the bot cannot do here", () => {
    // A listing that offers things that will not work is worse than a shorter
    // listing.
    const held = new Set(["send_messages"]);
    const text = buildHelpText(commands, "!", (p) => held.has(p));

    assert.match(text, /!ping/);
    assert.match(text, /!say/);
    assert.doesNotMatch(text, /!purge/);
  });

  it("says so when there is nothing to offer", () => {
    const text = buildHelpText(commands.slice(1), "!", () => false);
    assert.equal(text, "Nothing I can do here.");
  });
});
