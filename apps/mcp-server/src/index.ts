import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createOpzavaMcpServer } from "./server.js";

export { createOpzavaMcpServer } from "./server.js";
export type { OpzavaMcpRuntime, OpzavaMcpServerOptions } from "./server.js";

async function main(): Promise<void> {
  const runtime = await createOpzavaMcpServer();
  await runtime.server.connect(new StdioServerTransport());
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]);

if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Opzava MCP server failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
