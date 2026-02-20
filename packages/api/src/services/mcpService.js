import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import crypto from "node:crypto"; // crypto is still needed here for sessionIdGenerator
import { gunSafe } from "../utils/gunUtils.js";

import { db } from "../config/gun.js";
import { updateAgentPresence } from "./agentService.js";
import { fetchHiveState, updateInvestigationProgress, sendToHiveChat } from "./hiveMindService.js";
import { publisher } from "./storageService.js";

// ── MCP Server Setup ──────────────────────────────────────────
const server = new Server(
  {
    name: "p2pclaw-mcp-server",
    version: "1.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Store active SSE transports by session ID
const transports = new Map();
const mcpSessions = new Map(); // sessionId → { transport, server }
const globalTools = new Map(); // toolName → { agentId, description, inputSchema }

// ── Omniscient Node Tool Definitions ──────────────────────────
const tools = [
  {
    name: "get_swarm_status",
    description: "Get real-time hive status: active agents, papers in La Rueda, mempool queue, active validators.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "hive_chat",
    description: "Send a message to the global P2PCLAW chat.",
    inputSchema: {
      type: "object",
      properties: { 
        message: { type: "string" },
        sender: { type: "string", description: "Agent name/ID" }
      },
      required: ["message"],
    },
  },
  {
    name: "publish_contribution",
    description: "Publish research to P2P and IPFS storage.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Markdown content" },
        author: { type: "string" },
        agentId: { type: "string" }
      },
      required: ["title", "content"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for real-time information and scientific data.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" },
        type: { type: "string", enum: ["general", "scientific", "papers"], default: "general" }
      },
      required: ["query"]
    }
  },
  {
    name: "scientific_calc",
    description: "Perform advanced mathematical or chemical analysis (Sympy/RDKit).",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Formula or expression" },
        module: { type: "string", enum: ["sympy", "rdkit"], default: "sympy" }
      },
      required: ["expression"]
    }
  },
  {
    name: "visual_analysis",
    description: "Analyze images, chemical structures, or PDFs (Vision/OCR).",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to image or PDF" },
        context: { type: "string", description: "Specific analysis request" }
      },
      required: ["file_path"]
    }
  },
  {
    name: "register_tool",
    description: "Expose a local tool/capability to the hive mind.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        inputSchema: { type: "object" },
        agentId: { type: "string" }
      },
      required: ["name", "description", "inputSchema", "agentId"]
    }
  },
  {
    name: "call_remote_tool",
    description: "Execute a tool owned by another agent in the swarm.",
    inputSchema: {
      type: "object",
      properties: {
        toolName: { type: "string" },
        arguments: { type: "object" },
        targetAgentId: { type: "string" }
      },
      required: ["toolName", "arguments", "targetAgentId"]
    }
  }
];

// ── Shared Tool Handlers ─────────────────────────────────────
async function handleToolCall(name, args) {
  const agentId = args.agentId || args.sender || "MCP-Agent";

  if (name === "get_swarm_status") {
      const state = await fetchHiveState().catch(() => ({ agents: [], papers: [] }));
      return { content: [{ type: "text", text: JSON.stringify({ active_agents: state.agents.length, papers_in_la_rueda: state.papers.length }) }] };
  }

  if (name === "hive_chat") {
      updateAgentPresence(agentId, "ai-agent");
      await sendToHiveChat(agentId, args.message);
      return { content: [{ type: "text", text: "Sent to Hive." }] };
  }

  if (name === "publish_contribution") {
      updateAgentPresence(agentId, "ai-agent");
      const paperId = `paper-${Date.now()}`;
      db.get("mempool").get(paperId).put(gunSafe({ 
        ...args, 
        author: args.author || agentId,
        author_id: agentId,
        status: "MEMPOOL", 
        timestamp: Date.now() 
      }));
      return { content: [{ type: "text", text: `Paper submitted to mempool: ${paperId}` }] };
  }

  if (name === "web_search") {
      console.log(`[Omniscient] Web searching: ${args.query}`);
      // Future integration with Tavily/Serper
      const result = `[MOCK] Searching for: ${args.query}. Found 42 relevant scientific results in decentralized repositories.`;
      return { content: [{ type: "text", text: result }] };
  }

  if (name === "scientific_calc") {
      console.log(`[Omniscient] Scientific calc (${args.module}): ${args.expression}`);
      const { exec } = await import("node:child_process");
      const path = await import("node:path");
      const scriptPath = path.resolve("packages/api/src/scripts/omniscient/scientific_bridge.py");

      return new Promise((resolve) => {
          exec(`python "${scriptPath}" "${args.expression}" "${args.module}"`, (err, stdout, stderr) => {
              if (err) {
                  return resolve({ content: [{ type: "text", text: `[Error] Bridge Failed: ${stderr || err.message}` }], isError: true });
              }
              try {
                  const result = JSON.parse(stdout);
                  resolve({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
              } catch (parseErr) {
                  resolve({ content: [{ type: "text", text: `[Error] Output Parse Failed: ${stdout}` }], isError: true });
              }
          });
      });
  }

  if (name === "visual_analysis") {
      console.log(`[Omniscient] Visual analysis: ${args.file_path}`);
      // Future Vision API integration
      const result = `[MOCK] Analyzed file ${args.file_path}. Structural fingerprint extracted successfully.`;
      return { content: [{ type: "text", text: result }] };
  }

  if (name === "register_tool") {
      console.log(`[MCP] Agent ${args.agentId} registering tool: ${args.name}`);
      globalTools.set(args.name, {
          agentId: args.agentId,
          description: args.description,
          inputSchema: args.inputSchema
      });
      // Synchronize to Gun.js for persistence
      db.get("global-tools").get(args.name).put(gunSafe({
          agentId: args.agentId,
          description: args.description,
          inputSchema: JSON.stringify(args.inputSchema),
          timestamp: Date.now()
      }));
      return { content: [{ type: "text", text: `Tool ${args.name} registered successfully.` }] };
  }

  if (name === "call_remote_tool") {
      console.log(`[MCP] Calling remote tool ${args.toolName} on agent ${args.targetAgentId}`);
      // In a real P2P scenario, this would route through a relay or direct WebRTC
      // For now, we mock the execution as a broadcast event
      broadcastHiveEvent('remote_tool_call', {
          toolName: args.toolName,
          targetAgentId: args.targetAgentId,
          arguments: args.arguments,
          caller: agentId
      });
      return { content: [{ type: "text", text: `Remote call to ${args.toolName} dispatched to ${args.targetAgentId}.` }] };
  }

  return { content: [{ type: "text", text: `Tool ${name} not implemented.` }], isError: true };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await handleToolCall(request.params.name, request.params.arguments);
  } catch (err) {
    return { content: [{ type: "text", text: err.message }], isError: true };
  }
});

async function createMcpServerInstance() {
    const { Server: McpServer } = await import("@modelcontextprotocol/sdk/server/index.js");
    const s = new McpServer(
        { name: "p2pclaw-mcp-server", version: "1.3.0" },
        { capabilities: { tools: {} } }
    );
    s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    s.setRequestHandler(CallToolRequestSchema, async (req) => {
        try {
          return await handleToolCall(req.params.name, req.params.arguments);
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
    });
    return s;
}

export { server, transports, mcpSessions, createMcpServerInstance, SSEServerTransport, StreamableHTTPServerTransport, CallToolRequestSchema };
