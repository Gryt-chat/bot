import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { decodeJwt, decodeProtectedHeader } from "jose";

import { createIdentity, loadIdentity } from "./identity.ts";

let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "gryt-bot-identity-"));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("a bot's identity", () => {
  it("is the same bot on the second run", () => {
    // The whole point. A bot that minted a key on every start would arrive as
    // a new member each time and land on whatever a stranger gets.
    const path = join(dir, "stable.json");
    return (async () => {
      const first = await loadIdentity(path);
      const second = await loadIdentity(path);
      assert.equal(first.subject, second.subject);
      assert.match(first.subject, /^BOT_/, "lands in the bot namespace");
    })();
  });

  it("is a different bot with a different key file", async () => {
    const a = await loadIdentity(join(dir, "a.json"));
    const b = await loadIdentity(join(dir, "b.json"));
    assert.notEqual(a.subject, b.subject);
  });

  it("writes the key so only its owner can read it", () => {
    const path = join(dir, "perms.json");
    return (async () => {
      await loadIdentity(path);
      // Anyone who can read this file can be this bot.
      assert.equal(statSync(path).mode & 0o077, 0);
    })();
  });

  it("never writes the private key into a certificate", async () => {
    const { identity } = await createIdentity();
    const cert = await identity.certificate();
    const claims = decodeJwt(cert) as { jwk?: Record<string, unknown> };

    assert.ok(claims.jwk, "carries a key");
    // A certificate containing `d` would hand the server signing material for this bot's
    // identity. A well-behaved server refuses it; it should never leave the process.
    assert.equal("d" in claims.jwk, false);
    assert.equal(claims.jwk.kty, "EC");
    assert.equal(claims.jwk.crv, "P-256");
  });

  it("signs a certificate that says it vouches for itself", async () => {
    const { identity } = await createIdentity();
    const cert = await identity.certificate();

    assert.equal(decodeProtectedHeader(cert).alg, "ES256");
    const claims = decodeJwt(cert);
    // Its own issuer, which is what puts it in its own tier server-side.
    assert.equal(claims.iss, "gryt:bot");
    assert.equal(claims.sub, identity.subject);
  });

  it("binds an assertion to one server and one challenge", async () => {
    const { identity } = await createIdentity();
    const assertion = await identity.assertion("chat.example.com", "nonce-123");
    const claims = decodeJwt(assertion) as { nonce?: string };

    // Both are what stop an assertion collected by one server being replayed
    // at another, or reused on a second join.
    assert.equal(claims.aud, "chat.example.com");
    assert.equal(claims.nonce, "nonce-123");
    assert.equal(claims.sub, identity.subject);
  });

  it("refuses a file that is not one of ours", async () => {
    const path = join(dir, "junk.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, JSON.stringify({ hello: "world" }));

    await assert.rejects(() => loadIdentity(path), /not a Gryt bot identity file/);
  });

  it("stores a version, so a later format change is recognised", async () => {
    const path = join(dir, "versioned.json");
    await loadIdentity(path);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).v, 1);
  });
});
