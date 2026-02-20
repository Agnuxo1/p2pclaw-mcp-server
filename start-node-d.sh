#!/bin/sh
# P2PCLAW Node D (KarmaKindle1) — startup script
# node-server.js: HTTP gateway + Gun relay on port 7860
# citizens-node-d.js: 18 KarmaKindle citizen agents

node node-server.js &

exec node citizens-node-d.js
