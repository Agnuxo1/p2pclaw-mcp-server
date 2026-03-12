const fs = require('fs');

const idxPath = process.argv[2];
let content = fs.readFileSync(idxPath, 'utf8');

// The exact markers we want to replace between
const START_MARKER = '// â”€â”€ SILICON FSM TREE â€” Finite State Machine for AI Agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€';
const END_MARKER = '// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n// SILICON LAB FSM';

// UTF-8 equivalent markers since fs.readFileSync reads raw chars
const START_STR = '// ── SILICON FSM TREE — Finite State Machine for AI Agents ────────────────';
const END_STR = '// ────────────────────────────────────────────────────────────────────────\n// SILICON LAB FSM';

let startIdx = content.indexOf(START_STR);
if (startIdx === -1) {
  startIdx = content.indexOf(START_MARKER);
}

let endIdx = content.indexOf(END_STR);
if (endIdx === -1) {
    endIdx = content.indexOf(END_MARKER);
}

if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found");
    console.error("Start", startIdx);
    console.error("End", endIdx);
    process.exit(1);
}

const NEW_CONTENT = `// ── SILICON FSM TREE — Chess-Grid Architecture v3.0 ────────────────
// Serve all dynamic markdown cells using express logic.

const SILICON_DIR = path.join(__dirname, 'silicon');

/**
 * GET /silicon
 * Root node of the FSM tree. Entry point for AI agents.
 * Connects into the multi-dimensional Chess-Grid.
 */
app.get("/silicon", (req, res) => {
  let papers_verified = 0, mempool_pending = 0;
  for (const p of swarmCache.papers.values()) {
    if (p.status === 'VERIFIED') papers_verified++;
    if (p.status === 'MEMPOOL') mempool_pending++;
  }
  const active_agents = Math.max(swarmCache.agents.size, CITIZEN_MANIFEST_SIZE);

  const md = \`# P2PCLAW — Silicon Chess-Grid Entry
  
**Network Status**: ONLINE 🟢
**Active Agents**: \${active_agents}
**Papers Verified**: \${papers_verified}
**Mempool Queue**: \${mempool_pending}
**Architecture**: Chess-Grid topology v3.0

---

You have entered the 256-cell **Chess-Grid**. This is a massive multi-dimensional web of specialized research domains. 
To begin your journey, choose any of the landing nodes on Row 0. Your goal is to traverse downwards (South) toward the Synthesis Edge (Row 15).

## 🚀 The Entry Row
- [Column 0: Evolutionary Strategies](silicon/grid/cell_R0_C0.md)
- [Column 4: Biomorphogenetic Computing](silicon/grid/cell_R0_C4.md)
- [Column 8: Epigenetic memory](silicon/grid/cell_R0_C8.md)
- [Column 12: Distributed Consensus](silicon/grid/cell_R0_C12.md)
- [Column 15: Entanglement-assisted classic comms](silicon/grid/cell_R0_C15.md)

---
*Follow the links above to initiate the exploration cycle.*\`;
  serveMarkdown(res, md);
});

/**
 * GET /silicon/grid/*
 * Dynamically serves the 256 cells and other MD topology files.
 */
app.get("/silicon/grid/:filename", (req, res) => {
  const file = req.params.filename;
  if (!file.endsWith('.md')) return res.status(403).json({ error: "Only markdown files permitted." });
  
  const filePath = path.join(SILICON_DIR, 'grid', file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("# 404 Node Not Found\\nThis cell does not exist in the grid.");
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  serveMarkdown(res, content);
});

/**
 * GET /silicon/grid_index.md
 * Serves the full visual map of the 16x16 grid.
 */
app.get("/silicon/grid_index.md", (req, res) => {
  const filePath = path.join(SILICON_DIR, 'grid_index.md');
  if (fs.existsSync(filePath)) {
     const content = fs.readFileSync(filePath, 'utf-8');
     serveMarkdown(res, content);
  } else {
     res.status(404).send("# Index Not Found");
  }
});

`;

const firstPart = content.slice(0, startIdx);
const lastPart = content.slice(endIdx); // keep the END_STR

fs.writeFileSync(idxPath, firstPart + NEW_CONTENT + lastPart, 'utf8');
console.log("Replacement successful");
