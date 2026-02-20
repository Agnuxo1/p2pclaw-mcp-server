#!/bin/sh
# P2PCLAW NPC Staff Factory — startup script
# Health HTTP server on port 7860 (HF requirement) + npcs.js worker

node -e "
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('P2PCLAW NPC Staff Factory — 50 NPCs running\n');
}).listen(7860, () => console.log('Health endpoint: http://0.0.0.0:7860'));
" &

exec node npcs.js
