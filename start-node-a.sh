#!/bin/sh
# P2PCLAW Node A (Agnuxo) — startup script
# node-server.js: HTTP gateway + Gun relay on port 7860
# No citizens script — Agnuxo already has citizens-2 and npcs Spaces

exec node node-server.js
