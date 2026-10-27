import { safeEqual } from "./crypto";

/** `Authorization: Bearer <token>` against the expected secret. A missing secret never matches. */
export function bearerOk(header: string | null | undefined, expected: string | undefined): boolean {
  if (!expected) return false;
  const given = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  return given !== undefined && safeEqual(given, expected);
}

/**
 * A first passkey needs the one-time setup token and no existing credential; later ones need a session.
 * Once a credential exists the setup token is useless, even if it was never revoked.
 */
export function enrollmentAllowed(o: { credentialCount: number; expectedSetupToken: string | undefined; providedSetupToken: string | undefined; hasSession: boolean }): boolean {
  if (o.hasSession) return true;
  if (o.credentialCount > 0 || !o.expectedSetupToken || !o.providedSetupToken) return false;
  return safeEqual(o.providedSetupToken, o.expectedSetupToken);
}

export type RouteClass = "public" | "machine" | "private";

const PUBLIC = [/^\/connexion$/, /^\/api\/auth\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/offline\.html$/, /^\/icons\//, /^\/favicon\.ico$/];
// Machine endpoints check their own bearer token (a cron, a phone shortcut).
const MACHINE = [/^\/api\/cron\//, /^\/api\/capture$/, /^\/api\/sync$/];

export function classifyRoute(path: string): RouteClass {
  if (PUBLIC.some((r) => r.test(path))) return "public";
  if (MACHINE.some((r) => r.test(path))) return "machine";
  return "private";
}
