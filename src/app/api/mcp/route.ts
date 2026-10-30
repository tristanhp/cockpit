import { connection } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCockpitMcpServer } from "@/mcp/server";
import { mcpGate } from "@/mcp/gate";

// Cockpit's MCP server over streamable HTTP, for Claude (claude.ai connector, Claude Code). A machine endpoint:
// it checks its own token (COCKPIT_MCP_TOKEN, as a bearer or as X-API-Key), listed in MACHINE in src/lib/auth/access.ts. Stateless:
// every request gets its own server and transport. See docs/MCP.md.
async function handle(request: Request): Promise<Response> {
  await connection();
  const gate = mcpGate(request.headers.get("authorization"), process.env.COCKPIT_MCP_TOKEN, request.headers.get("x-api-key"));
  if (gate === "disabled") return new Response("Not found", { status: 404 });
  if (gate === "unauthorized") return Response.json({ error: "Non autorisé" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const server = createCockpitMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
