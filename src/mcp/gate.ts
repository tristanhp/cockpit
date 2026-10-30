import { bearerOk } from "@/lib/auth/access";
import { safeEqual } from "@/lib/auth/crypto";

/**
 * What `/api/mcp` answers before doing anything: with no token configured the endpoint does not exist (404),
 * a missing or wrong credential is refused (401), otherwise the request goes through. The token may come as
 * `Authorization: Bearer <token>` (Claude Code) or as `X-API-Key: <token>` (the claude.ai connector form, which
 * reserves `Authorization` for its own OAuth token and offers `x-api-key` among its custom headers).
 */
export function mcpGate(authorization: string | null | undefined, token: string | undefined, apiKey?: string | null): "disabled" | "unauthorized" | "ok" {
  if (!token) return "disabled";
  if (bearerOk(authorization, token)) return "ok";
  return apiKey && safeEqual(apiKey.trim(), token) ? "ok" : "unauthorized";
}
