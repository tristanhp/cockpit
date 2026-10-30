// The same MCP server over stdio, for Claude Code on this machine:
//   claude mcp add cockpit -- npm run --silent mcp
// Reads the local database (.env.local); `COCKPIT_DEMO=1 DATABASE_URL=file:data/demo.db npm run --silent mcp` serves the demo data.
// Nothing may be printed to stdout here: it carries the protocol.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCockpitMcpServer } from "@/mcp/server";

async function main() {
  await createCockpitMcpServer().connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
