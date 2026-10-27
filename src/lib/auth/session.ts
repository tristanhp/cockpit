import { sign, unsign } from "./crypto";

export const SESSION_COOKIE = "cockpit_session";
export const CHALLENGE_COOKIE = "cockpit_challenge";
export const SESSION_DAYS = 30;
const DAY = 86_400_000;

/** Authentication is off in demo mode, and when the owner opts out for local development. */
export const authDisabled = () => process.env.COCKPIT_DEMO === "1" || process.env.COCKPIT_AUTH === "off";

export function sessionSecret(): string {
  const secret = process.env.COCKPIT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("COCKPIT_SESSION_SECRET manquant ou trop court (32 caractères minimum)");
  return secret;
}

export const slideExpiry = (now: number) => now + SESSION_DAYS * DAY;

/** Slide at most once a day, so a page view does not rewrite the session every time. */
export const shouldSlide = (exp: number, now: number) => slideExpiry(now) - exp > DAY;

export type SessionCookie = { token: string; exp: number };

export const encodeSessionCookie = (c: SessionCookie, secret: string) => sign(`${c.token}:${c.exp}`, secret);

/** Null when the signature is wrong, the value is malformed, or the session has expired. */
export function decodeSessionCookie(value: string | undefined, secret: string, now: number): SessionCookie | null {
  if (!value) return null;
  const raw = unsign(value, secret);
  const i = raw?.lastIndexOf(":") ?? -1;
  if (!raw || i < 1) return null;
  const exp = Number(raw.slice(i + 1));
  return Number.isFinite(exp) && exp > now ? { token: raw.slice(0, i), exp } : null;
}

export const encodeChallenge = (purpose: "register" | "login", challenge: string, exp: number, secret: string) => sign(`${purpose}:${exp}:${challenge}`, secret);

/** A WebAuthn challenge travels in a short-lived signed cookie: single use, bound to its purpose. */
export function decodeChallenge(value: string | undefined, purpose: "register" | "login", secret: string, now: number): string | null {
  const raw = value ? unsign(value, secret) : null;
  const m = raw?.match(/^(register|login):(\d+):(.+)$/);
  return m && m[1] === purpose && Number(m[2]) > now ? m[3] : null;
}

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https:"),
  path: "/",
  maxAge: maxAgeSeconds,
});
