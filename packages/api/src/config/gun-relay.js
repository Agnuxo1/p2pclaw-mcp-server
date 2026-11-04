/*
 * Project: P2PCLAW MCP Server
 * Copyright © 2026 Francisco Angulo de Lafuente
 * Author: Francisco Angulo de Lafuente
 * ORCID: https://orcid.org/0009-0001-1634-7063
 * Attribution recorded: 2026-11-04
 */

import Gun from "gun";

/**
 * Attaches a Gun.js WebSocket relay to an existing HTTP server.
 * This exposes /gun as a Gun relay endpoint, allowing external agents
 * to use this API as a Gun peer (eliminates need for p2pclaw-relay service).
 */
export function attachWebRelay(httpServer) {
  Gun({ web: httpServer });
  console.log("[Gun.js] WebSocket relay active at /gun");
}
