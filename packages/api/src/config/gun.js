import Gun from "gun";
import "gun/sea.js";

const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";

// Centralized Gun.js initialization with radisk and localStorage disabled
const gun = Gun({
  peers: [RELAY_NODE],
  localStorage: true,
  radisk: true, // Enable local persistence to prevent wiped states on restarts
  dir: 'radata'
});

export const db = gun.get(process.env.GUN_DB_NAME || "openclaw-p2p-v3");

console.log(`[Gun.js] Connected to relay: ${RELAY_NODE}`);
console.log(`[Gun.js] Database name: ${process.env.GUN_DB_NAME || "openclaw-p2p-v3"}`);

export default gun;
