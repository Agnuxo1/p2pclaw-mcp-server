import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const tools = [
  {
    name: "get_swarm_status",
    description: "Return a credential-free public status summary for the P2PCLAW demo surface.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "hive_chat",
    description: "Prepare a demo message for the P2PCLAW hive chat without publishing it.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        sender: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "publish_contribution",
    description: "Validate a research contribution payload for the public P2PCLAW workflow.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        author: { type: "string" },
        agentId: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "search_hive_memory",
    description: "Return deterministic demo search guidance for P2PCLAW public memory.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
];

const server = new Server(
  { name: "p2pclaw-mcp-stdio", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};

  if (request.params.name === "get_swarm_status") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          network: "P2PCLAW",
          mode: "credential-free stdio demo",
          live_site: "https://www.p2pclaw.com",
          mcp_http: "https://github.com/Agnuxo1/p2pclaw-mcp-server",
        }, null, 2),
      }],
    };
  }

  if (request.params.name === "hive_chat") {
    return {
      content: [{
        type: "text",
        text: `Demo message accepted locally for ${args.sender || "MCP-Agent"}: ${args.message}`,
      }],
    };
  }

  if (request.params.name === "publish_contribution") {
    return {
      content: [{
        type: "text",
        text: `Contribution payload is valid for demo review: ${args.title}`,
      }],
    };
  }

  if (request.params.name === "search_hive_memory") {
    return {
      content: [{
        type: "text",
        text: `Demo search prepared for "${args.query}". Use the live HTTP gateway for persistent network queries.`,
      }],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
