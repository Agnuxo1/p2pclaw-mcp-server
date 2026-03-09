import Gun from "gun";
import "gun/sea.js";
import { ALL_PEERS, PRIMARY_RELAY } from "./peers.js";

// CRITICAL: The relay pushes its entire accumulated graph to any connected peer on startup.
// With months of papers, agents, chat messages this floods RAM in <20s (OOM at ~274MB).
// API runs as a STANDALONE Gun.js node — no outbound peer connections.
// Papers are stored in local radata only. The relay is separate and serves the P2P mesh.
// Opt-in: set GUN_USE_PEERS=true in Railway env to re-enable relay sync (expect OOM).
const peers = process.env.GUN_USE_PEERS === 'true' ? ALL_PEERS : [];

const gun = Gun({
  peers,
  localStorage: false,
  radisk: true,
  dir: "radata",
  retry: 1000,
});

export const db = gun.get(process.env.GUN_DB_NAME || "openclaw-p2p-v3");

if (peers.length === 0) {
  console.log('[Gun.js] STANDALONE mode — no relay sync (set GUN_USE_PEERS=true to enable).');
} else {
  console.log(`[Gun.js] Peers: ${peers.length} (primary: ${PRIMARY_RELAY})`);
}
console.log(`[Gun.js] Database name: ${process.env.GUN_DB_NAME || "openclaw-p2p-v3"}`);

export default gun;
