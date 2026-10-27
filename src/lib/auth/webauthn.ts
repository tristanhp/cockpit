import { eq } from "drizzle-orm";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransport, RegistrationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { enrollmentAllowed } from "./access";
import { hashToken, newToken } from "./crypto";
import { CHALLENGE_COOKIE, SESSION_COOKIE, cookieOptions, decodeChallenge, encodeChallenge, encodeSessionCookie, sessionSecret, slideExpiry } from "./session";
import { hasSession } from "./guard";

const RP_NAME = "Cockpit";
// A single-user app: one fixed user handle.
const USER_ID = new TextEncoder().encode("cockpit-owner");
const CHALLENGE_MS = 5 * 60_000;

/** The relying party follows APP_URL when set (production), else the request itself (local). */
function rp(request: Request) {
  const url = new URL(process.env.APP_URL ?? request.url);
  return { id: url.hostname, origin: url.origin };
}

const credentialRows = () => db.select().from(schema.credentials);

async function setChallenge(purpose: "register" | "login", challenge: string) {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, encodeChallenge(purpose, challenge, Date.now() + CHALLENGE_MS, sessionSecret()), cookieOptions(CHALLENGE_MS / 1000));
}

async function takeChallenge(purpose: "register" | "login"): Promise<string | null> {
  const jar = await cookies();
  const challenge = decodeChallenge(jar.get(CHALLENGE_COOKIE)?.value, purpose, sessionSecret(), Date.now());
  jar.delete(CHALLENGE_COOKIE); // single use
  return challenge;
}

async function startSession() {
  const token = newToken();
  const exp = slideExpiry(Date.now());
  await db.insert(schema.sessions).values({ hash: hashToken(token), expiresAt: exp, createdAt: new Date().toISOString() });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSessionCookie({ token, exp }, sessionSecret()), cookieOptions(Math.floor((exp - Date.now()) / 1000)));
}

export async function endSession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const token = raw?.slice(0, raw.indexOf(":"));
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.hash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

async function mayEnroll(setupToken: string | undefined) {
  return enrollmentAllowed({
    credentialCount: (await credentialRows()).length,
    expectedSetupToken: process.env.COCKPIT_SETUP_TOKEN,
    providedSetupToken: setupToken,
    hasSession: await hasSession(),
  });
}

export async function registrationOptions(request: Request, setupToken: string | undefined) {
  if (!(await mayEnroll(setupToken))) throw new Error("Enrôlement refusé");
  const existing = await credentialRows();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp(request).id,
    userName: "cockpit",
    userID: USER_ID,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: (c.transports ?? undefined) as AuthenticatorTransport[] | undefined })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await setChallenge("register", options.challenge);
  return options;
}

export async function finishRegistration(request: Request, response: RegistrationResponseJSON, setupToken: string | undefined, label: string | undefined) {
  if (!(await mayEnroll(setupToken))) throw new Error("Enrôlement refusé");
  const challenge = await takeChallenge("register");
  if (!challenge) throw new Error("Défi expiré : recommence");
  const { id, origin } = rp(request);
  const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: id });
  if (!result.verified || !result.registrationInfo) throw new Error("Passkey non vérifiée");
  const { credential } = result.registrationInfo;
  const first = (await credentialRows()).length === 0;
  await db.insert(schema.credentials).values({
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? response.response.transports ?? null,
    label: label?.slice(0, 60) || null,
    createdAt: new Date().toISOString(),
  });
  // Enrolling the first passkey logs you in; adding one from a session keeps the current session.
  if (first) await startSession();
}

export async function loginOptions(request: Request) {
  const existing = await credentialRows();
  if (!existing.length) throw new Error("Aucune passkey enregistrée : utilise le lien d'enrôlement.");
  const options = await generateAuthenticationOptions({
    rpID: rp(request).id,
    userVerification: "preferred",
    allowCredentials: existing.map((c) => ({ id: c.id, transports: (c.transports ?? undefined) as AuthenticatorTransport[] | undefined })),
  });
  await setChallenge("login", options.challenge);
  return options;
}

export async function finishLogin(request: Request, response: AuthenticationResponseJSON) {
  const challenge = await takeChallenge("login");
  if (!challenge) throw new Error("Défi expiré : recommence");
  const row = await db.query.credentials.findFirst({ where: eq(schema.credentials.id, response.id) });
  if (!row) throw new Error("Passkey inconnue");
  const { id, origin } = rp(request);
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: id,
    credential: { id: row.id, publicKey: new Uint8Array(Buffer.from(row.publicKey, "base64url")), counter: row.counter, transports: (row.transports ?? undefined) as AuthenticatorTransport[] | undefined },
  });
  if (!result.verified) throw new Error("Passkey non vérifiée");
  await db.update(schema.credentials).set({ counter: result.authenticationInfo.newCounter }).where(eq(schema.credentials.id, row.id));
  await startSession();
}
