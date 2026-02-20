#!/bin/sh
# P2PCLAW Node C (Frank-Agnuxo) — startup script
# node-server.js: HTTP gateway + Gun relay on port 7860
# citizens-node-c.js: 18 Frank citizen agents

node node-server.js &

exec node citizens-node-c.js
