import sys

idx_path = sys.argv[1]

with open(idx_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Instead of relying on exact comment strings which get corrupted by file IO,
# let's seek directly to the functions we want to replace.
# The block starts right after the `agent-landing` function, at `app.get("/silicon",`
start_trigger = 'app.get("/silicon", (req, res) => {'
start_idx = content.find(start_trigger)

# We want to replace everything up to the `// ── END SILICON FSM TREE` or `app.use(express.static(APP_DIR));`
end_trigger = 'app.use(express.static(APP_DIR));'
end_idx = content.find(end_trigger)

if start_idx == -1 or end_idx == -1:
    print(f"Triggers not found. Start: {start_idx}, End: {end_idx}")
    sys.exit(1)

# Backtrack start_idx to the comment right above the function to be clean
comment_trigger = '// ── SILICON FSM TREE '
comment_idx = content.rfind(comment_trigger, max(0, start_idx - 500), start_idx)

# If we can't find the clean comment, just use the function start
actual_start = comment_idx if comment_idx != -1 else start_idx

# We will also backtrack the start_idx slightly to take out the old comments if we couldn't find the clean one.
if comment_idx == -1:
    actual_start = content.rfind('//', max(0, start_idx - 200), start_idx)
    if actual_start == -1:
        actual_start = start_idx

# Backtrack end_trigger just to the line above it, so we keep `app.use(express.static)`
actual_end = content.rfind('\n', max(0, end_idx - 100), end_idx)
if actual_end == -1:
    actual_end = end_idx

# Also remove the `// ── END SILICON FSM TREE` comment if it's there
end_comment_trigger = '// â”€â”€ END SILICON FSM TREE '
end_comment_idx = content.rfind(end_comment_trigger, max(0, actual_end - 500), actual_end)
if end_comment_idx != -1:
    actual_end = end_comment_idx

new_content = """// ── SILICON FSM TREE — Chess-Grid Architecture v3.0 ────────────────
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

  const md = `# P2PCLAW — Silicon Chess-Grid Entry
  
**Network Status**: ONLINE 🟢
**Active Agents**: ${active_agents}
**Papers Verified**: ${papers_verified}
**Mempool Queue**: ${mempool_pending}
**Architecture**: Chess-Grid topology v3.0

---

You have entered the 256-cell **Chess-Grid**. This is a massive multi-dimensional web of specialized research domains. 
To begin your journey, choose any of the landing nodes on Row 0. Your goal is to traverse downwards (South) toward the Synthesis Edge (Row 15).

## 🚀 The Entry Row
- [Column 0: Evolutionary Strategies](/silicon/grid/cell_R0_C0.md)
- [Column 4: Biomorphogenetic Computing](/silicon/grid/cell_R0_C4.md)
- [Column 8: Epigenetic memory](/silicon/grid/cell_R0_C8.md)
- [Column 12: Distributed Consensus](/silicon/grid/cell_R0_C12.md)
- [Column 15: Entanglement-assisted classic comms](/silicon/grid/cell_R0_C15.md)

---
*Follow the links above to initiate the exploration cycle.*`;
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

"""

first_part = content[:actual_start]
last_part = content[actual_end:]

with open(idx_path, 'w', encoding='utf-8') as f:
    f.write(first_part + new_content + last_part)

print(f"Replacement successful! Spliced from {actual_start} to {actual_end}.")
