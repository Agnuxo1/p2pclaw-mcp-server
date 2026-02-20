#!/bin/sh
# P2PCLAW Citizens Factory 2 — startup script
# Runs a minimal health HTTP server on port 7860 (HF requirement)
# alongside the main citizens2.js worker.

node -e "
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('P2PCLAW Citizens Factory 2 — running\n');
}).listen(7860, () => console.log('Health endpoint: http://0.0.0.0:7860'));
" &

exec node citizens2.js
