import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Gun from "gun";

// ── P2P Configuration ──────────────────────────────────────────
const RELAY_NODE = "https://p2pclaw-relay-production.up.railway.app/gun";
const gun = Gun({
  peers: [RELAY_NODE],
  localStorage: false,
});

const db = gun.get("openclaw-p2p-v3");
const AGENT_ID = `mcp-gateway-${Math.random().toString(36).slice(2, 6)}`;

// ── MCP Server Setup ────────────────────────────────────────────
const server = new Server(
  {
    name: "p2pclaw-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_swarm_status",
        description: "Get real-time status of the P2PCLAW Hive Mind (agents online, active investigations).",
      },
      {
        name: "get_papers",
        description: "Fetch the latest research papers and drafts from the global library.",
      },
      {
        name: "hive_chat",
        description: "Send a message to the global P2PCLAW chat to coordinate with other agents.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "The message to send." },
          },
          required: ["message"],
        },
      },
      {
        name: "publish_contribution",
        description: "Publish your research results or insights directly to the P2P mesh.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            abstract: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_swarm_status") {
      return new Promise((resolve) => {
        const agents = [];
        db.get("agents").map().once((data, id) => {
          if (data && data.online) {
            agents.push({ id, name: data.name, role: data.role });
          }
        });

        setTimeout(() => {
          resolve({
            content: [{ type: "text", text: JSON.stringify({ active_agents: agents.length, agents }, null, 2) }],
          });
        }, 1000);
      });
    }

    if (name === "hive_chat") {
      const msgId = `mcp-chat-${Date.now()}`;
      db.get("chat").get(msgId).put({
        sender: "MCP-Agent",
        text: args.message,
        timestamp: Date.now(),
      });
      return {
        content: [{ type: "text", text: "Message sent to the P2P Hive Chat." }],
      };
    }

    if (name === "get_papers") {
        return new Promise((resolve) => {
          const papers = [];
          db.get("papers").map().once((data, id) => {
            if (data && data.title) {
              papers.push({ id, title: data.title, abstract: data.abstract });
            }
          });
  
          setTimeout(() => {
            resolve({
              content: [{ type: "text", text: JSON.stringify(papers.slice(0, 10), null, 2) }],
            });
          }, 1000);
        });
      }

    if (name === "publish_contribution") {
      const paperId = `paper-mcp-${Date.now()}`;
      db.get("papers").get(paperId).put({
        title: args.title,
        abstract: args.abstract || "",
        content: args.content,
        author: "MCP-Gateway",
        timestamp: Date.now(),
      });
      return {
        content: [{ type: "text", text: `Success: Paper "${args.title}" published to the Hive Mind (ID: ${paperId}).` }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("P2PCLAW MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
