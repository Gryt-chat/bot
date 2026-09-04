import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type JWK,
} from "jose";

/**
 * A bot signs its own certificate; the server derives the identity from the
 * key's thumbprint. Bots have their own issuer and subject namespace, so a bot
 * can never hold an id a person could.
 *
 * **The key file is the bot.** Lose it and the server sees a stranger asking to
 * join, with none of the permissions the one before it had.
 */

/**
 * The `iss` a bot's certificate carries.
 *
 * Cryptographically identical to a person's self-signed certificate — a key
 * signing for itself — and a separate issuer on purpose. The server dispatches
 * on it, and that is what puts a bot in its own subject namespace and its own
 * tier. A bot is admitted by the operator answering it, never by the server's
 * setting for anonymous people.
 */
const BOT_ISSUER = "gryt:bot";

/** Here only so the SDK can show the id before connecting. The server derives
 *  it independently and ignores whatever the certificate claims. */
const BOT_SUB_PREFIX = "BOT_";

export interface BotIdentity {
  /** The id this bot will be known by on every server. Derived from the key. */
  readonly subject: string;
  /** A certificate that vouches for itself, valid for an hour. */
  certificate(): Promise<string>;
  /** Proof, bound to one server's challenge, that this bot holds the key. */
  assertion(audience: string, nonce: string): Promise<string>;
}

interface StoredIdentity {
  /** Version, so a future format change can be recognised rather than guessed. */
  v: 1;
  privateJwk: JWK;
}

async function fromJwk(privateJwk: JWK): Promise<BotIdentity> {
  const privateKey = await importJWK(privateJwk, "ES256");

  // The public half, which is what the certificate carries. Stripping the
  // private fields is not optional: a certificate containing `d` would hand the
  // server signing material for this bot's identity, and a well-behaved server
  // refuses it — but the reason to not send it is that it should never leave
  // this process at all.
  const publicJwk: JWK = {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y,
  };

  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  const subject = `${BOT_SUB_PREFIX}${thumbprint}`;

  return {
    subject,

    certificate: () =>
      new SignJWT({ jwk: publicJwk })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuer(BOT_ISSUER)
        // The server derives the subject from the key and ignores this. It is
        // set to the derived value anyway, so a certificate read by a human
        // says the same thing the server concluded.
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey),

    assertion: (audience: string, nonce: string) =>
      new SignJWT({ nonce })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuer(subject)
        .setSubject(subject)
        // Bound to the server that issued the challenge, so an assertion
        // collected by one server cannot be replayed at another.
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
  };
}

/** Mint a new identity. The bot this belongs to has never been seen anywhere. */
export async function createIdentity(): Promise<{
  identity: BotIdentity;
  privateJwk: JWK;
}> {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  return { identity: await fromJwk(privateJwk), privateJwk };
}

/**
 * The second run must be the same bot: same id, same role, same history. A key
 * generated per start arrives as a new member every time.
 *
 * Written `0o600` — anyone who can read this file can be this bot.
 */
export async function loadIdentity(path: string): Promise<BotIdentity> {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StoredIdentity;
    if (raw?.v !== 1 || !raw.privateJwk) {
      throw new Error(`${path} is not a Gryt bot identity file`);
    }
    return fromJwk(raw.privateJwk);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }

  const { identity, privateJwk } = await createIdentity();
  const stored: StoredIdentity = { v: 1, privateJwk };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stored, null, 2), { mode: 0o600 });
  return identity;
}
