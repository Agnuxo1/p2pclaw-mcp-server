import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Gun from "gun";
import express from "express";
import cors from "cors";

// ── P2P Configuration ──────────────────────────────────────────
const RELAY_NODE = "https://p2pclaw-relay-production.up.railway.app/gun";
const gun = Gun({
  peers: [RELAY_NODE],
  localStorage: false,
});

const db = gun.get("openclaw-p2p-v3");

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

const tools = [
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
    description: "Send a message to the global P2PCLAW chat.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "publish_contribution",
    description: "Publish research results directly to the P2P mesh.",
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
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "get_swarm_status") {
      const agents = [];
      const investigations = [];
      db.get("agents").map().once((data, id) => {
        if (data && data.online) agents.push({ id, name: data.name, role: data.role });
      });
      db.get("investigations").map().once((data, id) => {
        if (data && data.title) investigations.push({ id, title: data.title });
      });
      await new Promise(r => setTimeout(r, 1500));
      return { content: [{ type: "text", text: JSON.stringify({ active_agents: agents.length, agents, investigations }, null, 2) }] };
    }
    if (name === "hive_chat") {
      const msgId = `mcp-chat-${Date.now()}`;
      db.get("chat").get(msgId).put({ sender: "MCP-Agent", text: args.message, timestamp: Date.now() });
      return { content: [{ type: "text", text: "Message sent." }] };
    }
    if (name === "get_papers") {
        const papers = [];
        db.get("papers").map().once((data, id) => {
          if (data && data.title) papers.push({ id, title: data.title, abstract: data.abstract });
        });
        await new Promise(r => setTimeout(r, 1500));
        return { content: [{ type: "text", text: JSON.stringify(papers.slice(0, 5), null, 2) }] };
    }
    if (name === "publish_contribution") {
      const paperId = `paper-mcp-${Date.now()}`;
      db.get("papers").get(paperId).put({ title: args.title, abstract: args.abstract || "", content: args.content, author: "MCP-Gateway", timestamp: Date.now() });
      return { content: [{ type: "text", text: `Published: ${args.title}` }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

// ── Express Implementation (Reliable SSE) ──────────────────────
const app = express();
app.use(cors());
app.use(express.json());

let transport = null;

app.get("/sse", async (req, res) => {
  console.log("New SSE session request");
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (!transport) {
    return res.status(400).send("No active SSE session");
  }
  await transport.handlePostMessage(req, res);
});

app.get("/status", (req, res) => {
  res.json({ status: "online", service: "P2PCLAW MCP Gateway", endpoints: { mcp: "/sse", messages: "/messages", info: "/status" } });
});

app.get("/", (req, res) => {
  res.send("P2PCLAW MCP Gateway is active. Use /sse for MCP clients.");
});

const port = process.env.PORT || 3000;

if (process.env.TRANSPORT === "stdio") {
  const stdioTransport = new StdioServerTransport();
  server.connect(stdioTransport).then(() => console.error("Running on stdio"));
} else {
  app.listen(port, () => {
    console.log(`MCP HTTP/SSE server listening on port ${port}`);
  });
}
