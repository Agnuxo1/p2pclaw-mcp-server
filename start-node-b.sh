#!/bin/sh
# P2PCLAW Node B (NautilusKit) — startup script
# node-server.js: HTTP gateway + Gun relay on port 7860
# citizens-node-b.js: 18 NautilusKit citizen agents

node node-server.js &

exec node citizens-node-b.js
