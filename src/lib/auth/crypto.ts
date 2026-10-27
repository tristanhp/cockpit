import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const hmac = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `value.signature`: the value stays readable, but any change to it is detected. */
export const sign = (value: string, secret: string) => `${value}.${hmac(value, secret)}`;

export function unsign(signed: string, secret: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  return safeEqual(signed.slice(i + 1), hmac(value, secret)) ? value : null;
}

export const newToken = () => randomBytes(32).toString("base64url");

/** Only the hash of a session token is stored, so a copy of the database cannot be replayed. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
