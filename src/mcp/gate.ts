import { bearerOk } from "@/lib/auth/access";

/**
 * What `/api/mcp` answers before doing anything: with no token configured the endpoint does not exist (404),
 * a missing or wrong bearer token is refused (401), otherwise the request goes through.
 */
export function mcpGate(authorization: string | null | undefined, token: string | undefined): "disabled" | "unauthorized" | "ok" {
  if (!token) return "disabled";
  return bearerOk(authorization, token) ? "ok" : "unauthorized";
}
