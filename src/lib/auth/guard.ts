import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken } from "./crypto";
import { SESSION_COOKIE, authDisabled, decodeSessionCookie, sessionSecret, shouldSlide, slideExpiry } from "./session";

/**
 * True when the request carries a session that is valid in the database (not revoked, not expired).
 * The proxy only checks the cookie's signature; this is the check that counts, and it slides the expiry.
 */
export async function hasSession(): Promise<boolean> {
  if (authDisabled()) return true;
  const jar = await cookies();
  const cookie = decodeSessionCookie(jar.get(SESSION_COOKIE)?.value, sessionSecret(), Date.now());
  if (!cookie) return false;
  const hash = hashToken(cookie.token);
  const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.hash, hash) });
  if (!row || row.expiresAt <= Date.now()) return false;
  if (shouldSlide(row.expiresAt, Date.now())) await db.update(schema.sessions).set({ expiresAt: slideExpiry(Date.now()) }).where(eq(schema.sessions.hash, hash));
  return true;
}

/** Call first in every server action and route handler: Server Actions are reachable by a direct POST. */
export async function requireAuth(): Promise<void> {
  if (!(await hasSession())) throw new Error("Non autorisé : reconnecte-toi.");
}
