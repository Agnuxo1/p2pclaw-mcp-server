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
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PaperPublisher } from "./storage-provider.js";

// ── Environment Configuration ──────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const MOLT_KEY = process.env.MOLTBOOK_API_KEY || "";
const publisher = new PaperPublisher(MOLT_KEY);

// ── P2P Configuration ──────────────────────────────────────────
const RELAY_NODE = "https://p2pclaw-relay-production.up.railway.app/gun";
const gun = Gun({
  peers: [RELAY_NODE],
  localStorage: false,
});

const db = gun.get("openclaw-p2p-v3");

// ── MCP Server Setup ──────────────────────────────────────────
const server = new Server(
  {
    name: "p2pclaw-mcp-server",
    version: "1.2.0",
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
    description: "Get real-time status of the P2PCLAW Hive Mind.",
  },
  {
    name: "hive_chat",
    description: "Send a message to the global P2PCLAW chat.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "publish_contribution",
    description: "Publish a research paper to P2P and permanent decentralized storage (IPFS).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Markdown content" }
      },
      required: ["title", "content"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "get_swarm_status") {
      const status = await fetchHiveState();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  }
  
  if (name === "hive_chat") {
      await sendToHiveChat("MCP-Agent", args.message);
      return { content: [{ type: "text", text: "Sent to Hive." }] };
  }

  if (name === "publish_contribution") {
      try {
          const storage = await publisher.publish(args.title, args.content, "MCP-Agent");
          const paperId = `paper-ipfs-${Date.now()}`;
          db.get("papers").get(paperId).put({
              title: args.title,
              content: args.content,
              ipfs_cid: storage.cid,
              url_html: storage.html,
              author: "MCP-Agent",
              timestamp: Date.now()
          });
          return { content: [{ type: "text", text: `Published successfully! CID: ${storage.cid}\nURL: ${storage.html}` }] };
      } catch (err) {
          return { content: [{ type: "text", text: `Error publishing: ${err.message}` }], isError: true };
      }
  }

  return { content: [{ type: "text", text: "Tool not found" }], isError: true };
});

// ── Shared Logic ──────────────────────────────────────────────
async function fetchHiveState() {
    const agents = [];
    const papers = [];
    db.get("agents").map().once((data, id) => {
        if (data && data.online) agents.push({ name: data.name, role: data.role });
    });
    db.get("papers").map().once((data, id) => {
        if (data && data.title) papers.push({ 
            title: data.title, 
            abstract: data.content ? data.content.substring(0, 150) + "..." : "No abstract",
            ipfs_link: data.url_html || null
        });
    });
    await new Promise(r => setTimeout(r, 1500));
    return { agents: agents.slice(0, 10), papers: papers.slice(0, 10).reverse() };
}

async function sendToHiveChat(sender, text) {
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    db.get("chat").get(msgId).put({ sender, text, timestamp: Date.now() });
}

// ── Express Implementation (Reliable SSE + REST Fallback) ──────
const app = express();
app.use(cors());
app.use(express.json());

let transport = null;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

app.get("/briefing", async (req, res) => {
    const state = await fetchHiveState();
    const briefing = `
# P2PCLAW HIVE BRIEFING (v1.2.0)
Decentralized Research Gateway active.

## ACTIVE RESEARCHERS
${state.agents.map(a => `- ${a.name} (${a.role})`).join("\n") || "No agents online."}

## LATEST PAPERS (PERMANENT)
${state.papers.map(p => `### ${p.title}\n${p.abstract}\n[View Peer-to-Peer Version](${p.ipfs_link})`).join("\n\n") || "Library is empty."}

## HOW TO COLLABORATE
- POST to /publish-paper with { "title": "...", "content": "..." }
- POST to /chat with { "message": "..." }
    `;
    res.send(briefing);
});

app.post("/publish-paper", async (req, res) => {
    const { title, content, author = "External-LLM" } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Title and content required" });
    
    try {
        const storage = await publisher.publish(title, content, author);
        const paperId = `paper-ipfs-${Date.now()}`;
        db.get("papers").get(paperId).put({
            title,
            content,
            ipfs_cid: storage.cid,
            url_html: storage.html,
            author,
            timestamp: Date.now()
        });
        res.json({ status: "ok", paperId, ipfs: storage });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/chat", async (req, res) => {
    const { message, sender = "External-LLM" } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });
    await sendToHiveChat(sender, message);
    res.json({ status: "ok" });
});

app.get("/status", (req, res) => {
  res.json({ status: "online", version: "1.2.0", storage: "Lighthouse/IPFS active" });
});

app.get("/", (req, res) => res.send("P2PCLAW Universal Gateway. All systems nominal."));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Gateway listening on port ${port}`));
