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
 * A bot's identity is a key it holds, and nothing else.
 *
 * Gryt servers accept two kinds of certificate. One is signed by a certificate
 * authority that has authenticated a person; the other is signed by the very
 * key it describes, and the identity is derived from that key's thumbprint. The
 * second is what a bot uses. There is no person to authenticate, and asking a
 * bot to hold an account's credentials would mean putting a human's identity in
 * a container's environment.
 *
 * Two consequences worth knowing before you deploy one:
 *
 * - **The key file is the bot.** Lose it and the server sees a stranger with
 *   the same nickname, holding whatever role a stranger gets. Keep it, back it
 *   up, and do not commit it.
 * - **The server has to accept the tier.** `GRYT_IDENTITY_TIERS` must include
 *   `local`, which is not the default. A bot cannot talk its way past that, and
 *   this SDK says so plainly rather than letting the join fail as
 *   "certificate rejected".
 */

/** The `iss` a self-signed certificate must carry. The server dispatches on it. */
const SELF_ISSUER = "gryt:self";

/**
 * The prefix the server puts on every identity derived from a key.
 *
 * Written down here only so this SDK can show you the id your bot will have
 * before it has ever connected. The server derives it independently and ignores
 * anything the certificate claims.
 */
const LOCAL_SUB_PREFIX = "key:";

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
  const subject = `${LOCAL_SUB_PREFIX}${thumbprint}`;

  return {
    subject,

    certificate: () =>
      new SignJWT({ jwk: publicJwk })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuer(SELF_ISSUER)
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
 * Load a bot's identity from disk, minting one the first time.
 *
 * The whole point is that the second run is the same bot as the first — same
 * id, same role, same history. A bot that generated a key on every start would
 * arrive as a new member each time, land on whatever the server gives
 * strangers, and leave a trail of abandoned memberships behind it.
 *
 * Written with `0o600`, because anyone who can read this file can be this bot.
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
